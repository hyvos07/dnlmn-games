import { animate, type JSAnimation } from 'animejs';
import { Camera, type Geometry, Mesh, Program, Renderer, Transform, Vec3 } from 'ogl';
import type { Enemy, GameEvent } from '../logic/game';
import { palette, ShapeBuilder } from './geometry';
import { buildContactShadows, buildEnemy, buildFortress, buildLandscape } from './scenery';

const vertex = /* glsl */ `
attribute vec3 position;
attribute vec3 normal;
attribute vec3 color;
attribute float glow;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vDepth;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  vColor = color;
  vNormal = normalize(normalMatrix * normal);
  vGlow = glow;
  vDepth = -p.z;
  gl_Position = projectionMatrix * p;
}`;

const fragment = /* glsl */ `
precision mediump float;
uniform float uPulse;
uniform float uHealth;
uniform float uAlpha;
varying vec3 vColor;
varying vec3 vNormal;
varying float vGlow;
varying float vDepth;
void main() {
  vec3 light = normalize(vec3(-0.4, 0.85, 0.6));
  float diffuse = max(0.0, dot(vNormal, light));
  float rim = pow(1.0 - abs(vNormal.z), 3.0) * 0.08;
  vec3 lit = vColor * (0.46 + diffuse * 0.70 + rim);
  lit += vColor * vGlow * (0.6 + uPulse * 0.45) * (0.42 + uHealth * 0.58);
  float fog = smoothstep(35.0, 62.0, vDepth) * 0.78;
  gl_FragColor = vec4(mix(lit, vec3(0.035, 0.085, 0.077), fog), uAlpha);
}`;

interface EnemyRig {
  id: number;
  retiring: boolean;
  kind: Enemy['kind'];
  body: Mesh;
  shadow: Mesh;
  target: Mesh;
}

interface Effect {
  mesh: Mesh;
  mode: 'bolt' | 'burst' | 'damage' | 'mistake' | 'spawn';
  active: boolean;
  phase: number;
  x: number;
  z: number;
  targetHeight: number;
  seed: number;
}

/** A texture-free miniature world; gameplay lives entirely outside this renderer. */
export class Battlefield {
  private readonly renderer: Renderer;
  private readonly camera: Camera;
  private readonly scene = new Transform();
  private readonly geometries = new Set<Geometry>();
  private readonly programs = new Set<Program>();
  private readonly animations = new Set<JSAnimation>();
  private readonly rigs: EnemyRig[] = [];
  private readonly effects: Effect[] = [];
  private readonly enemyGeometry: Record<Enemy['kind'], Geometry>;
  private readonly material: Program;
  private readonly effectMaterial: Program;
  private readonly shadowMaterial: Program;
  private readonly shadowGeometry: Geometry;
  private readonly targetGeometry: Geometry;
  private readonly boltGeometry: Geometry;
  private readonly burstGeometry: Geometry;
  private readonly damageGeometry: Geometry;
  private readonly mistakeGeometry: Geometry;
  private readonly heart: Mesh;
  private readonly torches: Mesh[] = [];
  private readonly flags: Mesh[] = [];
  private readonly projection = new Vec3();
  private readonly pulse = { value: 0, recoil: 0 };
  private chargeAnimation: JSAnimation | null = null;
  private recoilAnimation: JSAnimation | null = null;
  private width = 1;
  private height = 1;
  private reducedMotion: boolean;
  private paused = false;
  private dead = false;
  private previousBuffer = '';
  private ended = false;

  constructor(canvas: HTMLCanvasElement, reducedMotion: boolean) {
    this.reducedMotion = reducedMotion;
    this.renderer = new Renderer({
      canvas,
      dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    if (!this.renderer.gl) throw new Error('WebGL is unavailable on this device.');
    const gl = this.renderer.gl;
    gl.clearColor(0.035, 0.075, 0.063, 1);
    this.camera = new Camera(gl, { near: 0.1, far: 100 });
    this.camera.position.set(0, 30, 20);
    this.camera.lookAt([0, 0, 0]);
    this.material = this.program(false);
    this.effectMaterial = this.program(true);
    this.shadowMaterial = this.program(true);
    this.shadowMaterial.uniforms.uAlpha.value = 0.32;

    this.mesh(this.bake(buildLandscape()), this.material);
    this.mesh(this.bake(buildContactShadows()), this.shadowMaterial);
    this.mesh(this.bake(buildFortress()), this.material);
    const heart = new ShapeBuilder();
    heart.crystal(0, 0, 0, 0.44, 1.45, palette.teal, 1);
    heart.crystal(-0.43, -0.35, 0.1, 0.1, 0.38, palette.gold, 0.8);
    heart.crystal(0.43, -0.2, -0.1, 0.1, 0.38, palette.gold, 0.8);
    this.heart = this.mesh(this.bake(heart), this.material);
    this.heart.position.set(0, 1.87, 0);
    this.addDecorations();

    this.enemyGeometry = {
      crawler: this.bake(buildEnemy('crawler')),
      wisp: this.bake(buildEnemy('wisp')),
      golem: this.bake(buildEnemy('golem')),
    };
    const shadow = new ShapeBuilder();
    shadow.prism(0, 0, 0, 0.56, 0.005, [0.025, 0.043, 0.025], 16);
    this.shadowGeometry = this.bake(shadow);
    const target = new ShapeBuilder();
    target.ring(0.65, 0.05, 0.025, palette.gold, 1, 28);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      target.crystal(Math.cos(a) * 0.76, 0.035, Math.sin(a) * 0.76, 0.06, 0.12, palette.gold, 1);
    }
    this.targetGeometry = this.bake(target);
    const bolt = new ShapeBuilder();
    bolt.crystal(0, 0, 0, 0.14, 0.9, palette.gold, 1);
    bolt.crystal(0, -0.18, 0, 0.21, 0.4, palette.teal, 0.9);
    this.boltGeometry = this.bake(bolt);
    const burst = new ShapeBuilder();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const distance = 0.33 + (i % 3) * 0.16;
      burst.crystal(
        Math.cos(a) * distance,
        0.05 + (i % 4) * 0.15,
        Math.sin(a) * distance,
        0.07 + (i % 2) * 0.05,
        0.27,
        i % 3 ? palette.gold : palette.teal,
        0.8,
      );
    }
    burst.ring(0.65, 0.045, 0.03, palette.gold, 1, 28);
    this.burstGeometry = this.bake(burst);
    const damage = new ShapeBuilder();
    damage.ring(2.8, 0.055, 0.1, palette.gold, 1);
    damage.ring(2.85, 0.045, 0.45, palette.teal, 1);
    damage.ring(2.8, 0.028, 0.8, palette.gold, 1);
    this.damageGeometry = this.bake(damage);
    const mistake = new ShapeBuilder();
    mistake.ring(0.7, 0.075, 0.06, [1, 0.36, 0.25], 1, 24);
    this.mistakeGeometry = this.bake(mistake);
    // Leave room for a full volley of defeated monsters awaiting projectile impact.
    for (let i = 0; i < 32; i++) {
      const body = this.mesh(this.enemyGeometry.crawler, this.material);
      const shadowMesh = this.mesh(this.shadowGeometry, this.shadowMaterial);
      const targetMesh = this.mesh(this.targetGeometry, this.material);
      body.visible = false;
      shadowMesh.visible = false;
      targetMesh.visible = false;
      this.rigs.push({
        id: -1,
        retiring: false,
        kind: 'crawler',
        body,
        shadow: shadowMesh,
        target: targetMesh,
      });
    }
    // The first 16 slots are reserved for shots so spawn effects cannot crowd them out.
    for (let i = 0; i < 40; i++) {
      const mesh = this.mesh(this.boltGeometry, this.effectMaterial);
      mesh.visible = false;
      const effect: Effect = {
        mesh,
        mode: 'bolt',
        active: false,
        phase: 0,
        x: 0,
        z: 0,
        targetHeight: 0.3,
        seed: i,
      };
      mesh.onBeforeRender(() => {
        this.effectMaterial.uniforms.uAlpha.value =
          effect.mode === 'bolt' ? 1 : Math.max(0, 1 - effect.phase);
      });
      this.effects.push(effect);
    }
    this.resize(canvas.clientWidth || 1000, canvas.clientHeight || 700);
  }

  private bake(shapes: ShapeBuilder): Geometry {
    const geometry = shapes.geometry(this.renderer.gl);
    this.geometries.add(geometry);
    return geometry;
  }

  private program(transparent: boolean): Program {
    const program = new Program(this.renderer.gl, {
      vertex,
      fragment,
      transparent,
      cullFace: null,
      depthWrite: !transparent,
      uniforms: {
        uPulse: { value: 0 },
        uHealth: { value: 1 },
        uAlpha: { value: 1 },
      },
    });
    this.programs.add(program);
    return program;
  }

  private mesh(geometry: Geometry, program: Program): Mesh {
    const mesh = new Mesh(this.renderer.gl, { geometry, program, frustumCulled: false });
    mesh.setParent(this.scene);
    return mesh;
  }

  private addDecorations(): void {
    const fixture = new ShapeBuilder();
    for (const x of [-0.87, 0.87]) {
      fixture.prism(x, 0.35, 2.18, 0.06, 0.69, palette.stoneDark, 5);
      fixture.prism(x, 1.01, 2.18, 0.15, 0.1, palette.gold, 6);
    }
    this.mesh(this.bake(fixture), this.material);
    const flame = new ShapeBuilder();
    flame.crystal(0, 0, 0, 0.13, 0.35, palette.gold, 1);
    flame.crystal(0, 0.12, 0, 0.06, 0.24, [1, 0.9, 0.55], 1);
    const flameGeometry = this.bake(flame);
    for (const x of [-0.87, 0.87]) {
      const mesh = this.mesh(flameGeometry, this.material);
      mesh.position.set(x, 1.2, 2.18);
      this.torches.push(mesh);
    }
    const flag = new ShapeBuilder();
    flag.box(0, 0.55, 0, 0.04, 1.1, 0.04, palette.gold);
    flag.triangle([0, 1.04, 0], [0.46, 1, 0], [0.45, 0.48, 0], [0.41, 0.13, 0.12]);
    flag.triangle([0, 1.04, 0], [0.45, 0.48, 0], [0, 0.58, 0], [0.48, 0.19, 0.14]);
    flag.crystal(0.23, 0.78, 0.015, 0.035, 0.14, palette.gold, 0.3);
    const flagGeometry = this.bake(flag);
    for (const x of [-1.77, 1.77]) {
      const mesh = this.mesh(flagGeometry, this.material);
      mesh.position.set(x, 2.0, -1.77);
      this.flags.push(mesh);
    }
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.renderer.setSize(this.width, this.height);
    const aspect = this.width / this.height;
    const halfHeight = Math.max(13.9, 15 / aspect);
    this.camera.orthographic({
      left: -halfHeight * aspect,
      right: halfHeight * aspect,
      bottom: -halfHeight,
      top: halfHeight,
    });
    this.camera.updateMatrixWorld();
  }

  render(enemies: readonly Enemy[], elapsed: number, buffer: string, healthRatio: number): void {
    if (this.dead) return;
    const time = this.reducedMotion ? 0 : elapsed;
    const health = this.ended ? 0 : Math.max(0, Math.min(1, healthRatio));
    this.material.uniforms.uPulse.value = 0.25 + Math.sin(time * 1.8) * 0.13 + this.pulse.value;
    this.material.uniforms.uHealth.value = health;
    this.effectMaterial.uniforms.uPulse.value = 0.45;
    this.heart.rotation.y = time * 0.24;
    this.heart.position.y = 1.87 + Math.sin(time * 2) * 0.065;
    const heartScale = 1 + this.pulse.value * 0.08;
    this.heart.scale.set(heartScale);
    this.torches.forEach((torch, i) => {
      torch.scale.set(1, 0.9 + Math.sin(time * 8 + i * 2) * 0.13, 1);
    });
    this.flags.forEach((flag, i) => {
      flag.rotation.y = Math.sin(time * 1.4 + i) * 0.1;
    });
    if (buffer !== this.previousBuffer && buffer.length > this.previousBuffer.length) {
      this.charge();
    }
    this.previousBuffer = buffer;
    for (const rig of this.rigs) {
      if (!rig.retiring && !enemies.some((enemy) => enemy.id === rig.id)) {
        rig.id = -1;
        rig.body.visible = false;
        rig.shadow.visible = false;
        rig.target.visible = false;
      }
    }
    for (const enemy of enemies) {
      const rig =
        this.rigs.find((item) => item.id === enemy.id) ?? this.rigs.find((item) => item.id === -1);
      if (!rig) continue;
      rig.id = enemy.id;
      rig.kind = enemy.kind;
      rig.body.geometry = this.enemyGeometry[enemy.kind];
      rig.body.visible = true;
      rig.shadow.visible = true;
      const gait = Math.sin(time * (enemy.kind === 'wisp' ? 5 : 7) + enemy.id * 1.7);
      const hover = enemy.kind === 'wisp' ? 0.32 : 0;
      rig.body.position.set(
        enemy.x,
        hover + gait * (enemy.kind === 'wisp' ? 0.12 : 0.025),
        enemy.z,
      );
      rig.body.rotation.y = Math.atan2(enemy.x, enemy.z);
      rig.body.rotation.z = enemy.kind === 'wisp' ? gait * 0.06 : gait * 0.04;
      rig.shadow.position.set(enemy.x, 0.025, enemy.z);
      rig.shadow.scale.set(1, 1, 0.7);
      rig.target.position.set(enemy.x, 0, enemy.z);
      rig.target.visible = buffer.length > 0 && enemy.word.startsWith(buffer);
    }
    for (const effect of this.effects) this.renderEffect(effect);
    const shake = this.reducedMotion ? 0 : this.pulse.recoil;
    this.scene.position.x = Math.sin(time * 41) * shake * 0.1;
    this.scene.position.z = Math.sin(time * 34) * shake * 0.08;
    this.renderer.render({ scene: this.scene, camera: this.camera });
  }

  project(x: number, z: number, height = 1.5): { x: number; y: number; visible: boolean } {
    this.projection.set(x + this.scene.position.x, height, z + this.scene.position.z);
    this.camera.project(this.projection);
    return {
      x: ((this.projection.x + 1) / 2) * this.width,
      y: ((1 - this.projection.y) / 2) * this.height,
      visible:
        Math.abs(this.projection.x) < 1 &&
        Math.abs(this.projection.y) < 1 &&
        Math.abs(this.projection.z) <= 1,
    };
  }

  private charge(): void {
    if (this.chargeAnimation) {
      this.chargeAnimation.cancel();
      this.animations.delete(this.chargeAnimation);
    }
    this.pulse.value = 0.7;
    this.chargeAnimation = this.tween(this.pulse, { value: 0 }, 220);
  }

  private tween(
    target: object,
    values: Record<string, number>,
    duration: number,
    completed?: () => void,
  ): JSAnimation {
    const animation = animate(target, {
      ...values,
      duration,
      ease: 'outCubic',
      onComplete: () => {
        this.animations.delete(animation);
        completed?.();
      },
    });
    this.animations.add(animation);
    if (this.paused) animation.pause();
    return animation;
  }

  private effect(
    mode: Effect['mode'],
    x: number,
    z: number,
    impact?: () => void,
    targetHeight = 0.3,
  ): void {
    const effect = this.effects.find(
      (item) => !item.active && (mode === 'bolt' ? item.seed < 16 : item.seed >= 16),
    );
    if (!effect) {
      // Even a saturated visual pool must release its retired rig.
      if (impact) this.tween({ phase: 0 }, { phase: 1 }, 280, impact);
      return;
    }
    effect.active = true;
    effect.phase = 0;
    effect.mode = mode;
    effect.x = x;
    effect.z = z;
    effect.targetHeight = targetHeight;
    effect.mesh.visible = true;
    effect.mesh.geometry =
      mode === 'bolt'
        ? this.boltGeometry
        : mode === 'burst'
          ? this.burstGeometry
          : mode === 'damage'
            ? this.damageGeometry
            : mode === 'mistake'
              ? this.mistakeGeometry
              : this.targetGeometry;
    this.tween(effect, { phase: 1 }, this.reducedMotion ? 170 : mode === 'bolt' ? 280 : 650, () => {
      effect.active = false;
      effect.mesh.visible = false;
      impact?.();
      if (mode === 'bolt') this.effect('burst', x, z);
    });
  }

  private renderEffect(effect: Effect): void {
    if (!effect.active) return;
    const phase = effect.phase;
    effect.mesh.rotation.set(0, 0, 0);
    if (effect.mode === 'bolt') {
      effect.mesh.position.set(
        effect.x * phase,
        2.5 * (1 - phase) +
          effect.targetHeight * phase +
          Math.sin(phase * Math.PI) * (this.reducedMotion ? 0 : 1.4),
        effect.z * phase,
      );
      effect.mesh.rotation.x = Math.PI * 0.5;
      effect.mesh.rotation.z = -Math.atan2(effect.x, effect.z);
      effect.mesh.scale.set(this.reducedMotion ? 0.7 : 1);
    } else if (effect.mode === 'burst') {
      effect.mesh.position.set(effect.x, 0.12 + Math.sin(phase * Math.PI) * 0.38, effect.z);
      effect.mesh.rotation.y = effect.seed + (this.reducedMotion ? 0 : phase * 0.6);
      const expansion = this.reducedMotion ? 0.75 : 0.5 + phase * 1.7;
      effect.mesh.scale.set(
        expansion * (1 - phase * 0.6),
        1 - phase,
        expansion * (1 - phase * 0.6),
      );
    } else {
      effect.mesh.position.set(effect.x, 0, effect.z);
      const scale = 1 + phase * (this.reducedMotion ? 0.06 : effect.mode === 'damage' ? 0.34 : 0.5);
      effect.mesh.scale.set(scale, 1 - phase, scale);
    }
  }

  event(event: GameEvent): void {
    if (this.dead) return;
    switch (event.type) {
      case 'spawn':
        this.effect('spawn', event.enemy.x, event.enemy.z);
        break;
      case 'hit': {
        this.charge();
        const rig = event.killed
          ? (this.rigs.find((item) => item.id === event.id) ??
            this.rigs.find((item) => item.id === -1))
          : undefined;
        if (rig) {
          if (rig.id !== event.id) {
            // A pretyped word can defeat a newly spawned monster before its first draw.
            rig.id = event.id;
            rig.kind = event.kind;
            rig.body.geometry = this.enemyGeometry[event.kind];
            rig.body.position.y = event.kind === 'wisp' ? 0.32 : 0;
            rig.body.rotation.set(0, Math.atan2(event.x, event.z), 0);
            rig.body.visible = true;
            rig.shadow.visible = true;
          }
          rig.retiring = true;
          rig.target.visible = false;
          rig.body.position.x = event.x;
          rig.body.position.z = event.z;
          rig.shadow.position.set(event.x, 0.025, event.z);
        }
        const remove = () => {
          if (!rig) return;
          rig.retiring = false;
          rig.id = -1;
          rig.body.visible = false;
          rig.shadow.visible = false;
        };
        // Logical defeat is immediate; the visible body stays until the shot lands.
        if (this.reducedMotion) {
          this.effect('burst', event.x, event.z);
          remove();
        } else
          this.effect('bolt', event.x, event.z, remove, event.kind === 'crawler' ? 0.35 : 0.85);
        break;
      }
      case 'mistake': {
        const rig = this.rigs.find((item) => item.id === event.id);
        if (rig) this.effect('mistake', rig.body.position.x, rig.body.position.z);
        break;
      }
      case 'damage':
        this.effect('damage', 0, 0);
        this.effect('burst', event.x, event.z);
        if (this.recoilAnimation) {
          this.recoilAnimation.cancel();
          this.animations.delete(this.recoilAnimation);
        }
        this.pulse.recoil = 1;
        this.recoilAnimation = this.tween(this.pulse, { recoil: 0 }, 350);
        break;
      case 'wave':
        this.charge();
        break;
      case 'end':
        this.ended = true;
        break;
    }
  }

  pause(): void {
    this.paused = true;
    for (const animation of this.animations) animation.pause();
  }

  resume(): void {
    this.paused = false;
    for (const animation of this.animations) animation.resume();
  }

  reset(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    this.chargeAnimation = null;
    this.recoilAnimation = null;
    for (const effect of this.effects) {
      effect.active = false;
      effect.mesh.visible = false;
    }
    for (const rig of this.rigs) {
      rig.id = -1;
      rig.retiring = false;
      rig.body.visible = false;
      rig.target.visible = false;
      rig.shadow.visible = false;
    }
    this.pulse.value = 0;
    this.pulse.recoil = 0;
    this.previousBuffer = '';
    this.ended = false;
    this.scene.position.set(0, 0, 0);
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value) this.scene.position.set(0, 0, 0);
  }

  destroy(): void {
    this.reset();
    this.dead = true;
    for (const geometry of this.geometries) geometry.remove();
    for (const program of this.programs) program.remove();
    this.renderer.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
