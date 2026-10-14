import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Enemy } from '../logic/game';

const doubles = vi.hoisted(() => ({
  meshes: [] as Array<{ visible: boolean }>,
  animations: [] as Array<{
    duration: number;
    complete: () => void;
    pause: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  }>,
}));

vi.mock('animejs', () => ({
  animate: (_target: object, options: { duration: number; onComplete: () => void }) => {
    const animation = {
      duration: options.duration,
      complete: options.onComplete,
      pause: vi.fn(),
      resume: vi.fn(),
      cancel: vi.fn(),
    };
    doubles.animations.push(animation);
    return animation;
  },
}));

vi.mock('ogl', () => {
  class Vector {
    x = 0;
    y = 0;
    z = 0;
    set(x: number, y = x, z = x) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }
  class Transform {
    position = new Vector();
    rotation = new Vector();
    scale = new Vector();
    setParent() {}
  }
  class Mesh extends Transform {
    visible = true;
    geometry: object;
    constructor(_gl: object, options: { geometry: object }) {
      super();
      this.geometry = options.geometry;
      doubles.meshes.push(this);
    }
    onBeforeRender() {}
  }
  class Camera extends Transform {
    lookAt() {}
    orthographic() {}
    updateMatrixWorld() {}
  }
  return {
    Vec3: Vector,
    Transform,
    Mesh,
    Camera,
    Geometry: class {
      remove() {}
    },
    Program: class {
      uniforms: object;
      constructor(_gl: object, options: { uniforms: object }) {
        this.uniforms = options.uniforms;
      }
      remove() {}
    },
    Renderer: class {
      gl = { clearColor() {} };
      setSize() {}
      render() {}
    },
  };
});

import { Battlefield } from './battlefield';

const enemy: Enemy = {
  id: 1,
  word: 'cat',
  kind: 'crawler',
  x: 8,
  z: 0,
  hp: 1,
  maxHp: 1,
  speed: 0.34,
};
const hit = {
  type: 'hit' as const,
  id: 1,
  x: 8,
  z: 0,
  kind: 'crawler' as const,
  killed: true,
  points: 55,
};

function create(reducedMotion = false) {
  const battlefield = new Battlefield(
    { clientWidth: 1280, clientHeight: 800 } as HTMLCanvasElement,
    reducedMotion,
  );
  battlefield.render([], 0, '', 1);
  const scenery = new Set(doubles.meshes.filter((mesh) => mesh.visible));
  battlefield.render([enemy], 1, '', 1);
  const bodyAndShadow = doubles.meshes.filter((mesh) => mesh.visible && !scenery.has(mesh));
  expect(bodyAndShadow).toHaveLength(2);
  return { battlefield, bodyAndShadow };
}

beforeEach(() => {
  doubles.meshes.length = 0;
  doubles.animations.length = 0;
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});

describe('projectile impact lifecycle', () => {
  it('shows a newly spawned monster that was defeated by pretyped text before its first draw', () => {
    const battlefield = new Battlefield(
      { clientWidth: 1280, clientHeight: 800 } as HTMLCanvasElement,
      false,
    );
    battlefield.render([], 0, '', 1);
    const scenery = new Set(doubles.meshes.filter((mesh) => mesh.visible));
    battlefield.event(hit);
    battlefield.render([], 0.1, '', 1);
    const held = doubles.meshes.filter((mesh) => mesh.visible && !scenery.has(mesh));
    // Body, shadow, and the shot remain visible until impact.
    expect(held).toHaveLength(3);
    doubles.animations.find((animation) => animation.duration === 280)?.complete();
    expect(held.every((mesh) => !mesh.visible)).toBe(true);
  });

  it('keeps a defeated monster visible until its projectile impacts', () => {
    const { battlefield, bodyAndShadow } = create();
    battlefield.event(hit);
    battlefield.render([], 1.1, '', 1);
    expect(bodyAndShadow.every((mesh) => mesh.visible)).toBe(true);
    const shot = doubles.animations.find((animation) => animation.duration === 280);
    expect(shot).toBeDefined();
    shot?.complete();
    battlefield.render([], 1.3, '', 1);
    expect(bodyAndShadow.every((mesh) => !mesh.visible)).toBe(true);
  });

  it('pauses and resumes the pending shot with its monster still visible', () => {
    const { battlefield, bodyAndShadow } = create();
    battlefield.event(hit);
    const shot = doubles.animations.find((animation) => animation.duration === 280);
    battlefield.pause();
    expect(shot?.pause).toHaveBeenCalledOnce();
    expect(bodyAndShadow.every((mesh) => mesh.visible)).toBe(true);
    battlefield.resume();
    expect(shot?.resume).toHaveBeenCalledOnce();
    shot?.complete();
    expect(bodyAndShadow.every((mesh) => !mesh.visible)).toBe(true);
  });

  it('cancels in-flight shots and releases their monsters when restarting', () => {
    const { battlefield, bodyAndShadow } = create();
    battlefield.event(hit);
    const shot = doubles.animations.find((animation) => animation.duration === 280);
    battlefield.reset();
    expect(shot?.cancel).toHaveBeenCalledOnce();
    expect(bodyAndShadow.every((mesh) => !mesh.visible)).toBe(true);
    battlefield.render([enemy], 0, '', 1);
    expect(bodyAndShadow.every((mesh) => mesh.visible)).toBe(true);
  });

  it('reserves projectile slots even when spawn feedback fills its effect pool', () => {
    const { battlefield, bodyAndShadow } = create();
    for (let index = 0; index < 40; index++) battlefield.event({ type: 'spawn', enemy });
    battlefield.event(hit);
    battlefield.render([], 1.1, '', 1);
    expect(bodyAndShadow.every((mesh) => mesh.visible)).toBe(true);
    expect(doubles.animations.filter((animation) => animation.duration === 280)).toHaveLength(1);
    doubles.animations.find((animation) => animation.duration === 280)?.complete();
    expect(bodyAndShadow.every((mesh) => !mesh.visible)).toBe(true);
  });

  it('uses an immediate impact without projectile travel under reduced motion', () => {
    const { battlefield, bodyAndShadow } = create(true);
    battlefield.event(hit);
    battlefield.render([], 1.1, '', 1);
    expect(bodyAndShadow.every((mesh) => !mesh.visible)).toBe(true);
    expect(doubles.animations.some((animation) => animation.duration === 280)).toBe(false);
  });
});
