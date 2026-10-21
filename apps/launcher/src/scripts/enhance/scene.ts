/**
 * The hero scene (ADR-009): one OGL renderer, one WebGL context, one fixed canvas for
 * the whole page. Floating low-poly game pieces drift, spin, scatter from the cursor and
 * parallax with scroll. All motion runs in the vertex shader; the CPU only eases a few
 * uniforms per frame. The mood shifts per section:
 *   hero: lively but dimmed · grid: dimmer, slow, receded · footer: pieces form a snake
 * The pieces stay in the background: they're darkened toward the page colour, and they
 * fade almost out wherever they pass behind text (the text's boxes go in as uniforms).
 */
import { Camera, Geometry, Mesh, Program, Renderer, Transform } from 'ogl';
import { pieceKinds } from './pieces.ts';

const vertex = /* glsl */ `#version 300 es
precision highp float;
in vec3 position;
in vec3 aBase;   // x is normalised to the half width so any aspect is covered
in vec4 aParams; // scale, speed, phase, colour index
in vec3 aAxis;
uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform float uTime;
uniform vec3 uPointer;  // world xy at z=0, z = strength
uniform float uScroll;  // world units
uniform vec4 uMood;     // x: grid, y: footer, z: half width, w: half height
uniform float uSpan;    // vertical wrap span
uniform float uSize;    // shrinks pieces on narrow (portrait) screens
out vec3 vWorld;
out float vColor;
out float vFog;

mat3 rotate(vec3 a, float angle) {
  float s = sin(angle), c = cos(angle), o = 1.0 - c;
  return mat3(
    o * a.x * a.x + c,       o * a.x * a.y + a.z * s, o * a.z * a.x - a.y * s,
    o * a.x * a.y - a.z * s, o * a.y * a.y + c,       o * a.y * a.z + a.x * s,
    o * a.z * a.x + a.y * s, o * a.y * a.z - a.x * s, o * a.z * a.z + c);
}

void main() {
  float t = uTime * aParams.y;
  float phase = aParams.z;
  vec3 base = vec3(aBase.x * uMood.z, aBase.y, aBase.z);
  float near = clamp((base.z + 10.0) / 14.0, 0.0, 1.0);

  base.x += sin(t * 0.37 + phase) * 0.7;
  base.y += cos(t * 0.29 + phase * 1.3) * 0.55;
  base.y += uScroll * mix(0.2, 0.85, near);
  base.y = mod(base.y + uSpan * 0.5, uSpan) - uSpan * 0.5;

  // Footer: pieces slither into a wavy line, a nod to Snake.
  float u = fract(phase * 0.1591 + uTime * 0.018);
  vec3 line = vec3(mix(-uMood.z * 1.1, uMood.z * 1.1, u),
                   -uMood.w * 0.02 + sin(u * 14.0 - uTime * 1.4) * 0.9,
                   0.0);
  base = mix(base, line, uMood.y * 0.9);
  // Grid: pieces recede so the cards stay readable.
  base.z -= uMood.x * 5.0;

  vec2 d = base.xy - uPointer.xy;
  float dist = length(d);
  float push = uPointer.z * exp(-dist * dist / 7.0);
  base.xy += d / max(dist, 0.001) * push * 2.4;

  mat3 r = rotate(aAxis, t + phase);
  vec3 tiltAxis = normalize(vec3(-d.y, d.x, 0.0001));
  r = rotate(tiltAxis, push * 1.4) * r;

  float size = aParams.x * uSize * mix(1.0, 0.75, uMood.y);
  vec3 p = r * (position * size) + base;
  vWorld = p;
  vColor = aParams.w;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  vFog = smoothstep(18.0, 42.0, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const fragment = /* glsl */ `#version 300 es
precision highp float;
in vec3 vWorld;
in float vColor;
in float vFog;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
uniform vec3 uC3;
uniform vec3 uBg;
uniform float uOpacity;
uniform vec4 uMood;
uniform vec4 uRects[MAX_RECTS]; // text boxes in framebuffer pixels: min xy, max xy
uniform float uFeather;
out vec4 fragColor;

// 0 inside any text box, easing to 1 at uFeather pixels outside it.
float clearOfText() {
  float clear = 1.0;
  for (int i = 0; i < MAX_RECTS; i++) {
    vec4 r = uRects[i];
    vec2 o = max(r.xy - gl_FragCoord.xy, gl_FragCoord.xy - r.zw);
    clear = min(clear, smoothstep(0.0, uFeather, length(max(o, 0.0))));
  }
  return clear;
}

void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  if (n.z < 0.0) n = -n;
  float diffuse = max(dot(n, normalize(vec3(0.45, 0.75, 0.55))), 0.0);
  float rim = pow(1.0 - n.z, 3.0);
  vec3 base = vColor < 0.5 ? uC0 : vColor < 1.5 ? uC1 : vColor < 2.5 ? uC2 : uC3;
  // In the footer the pieces line up as one accent-coloured snake.
  base = mix(base, uC0, uMood.y * 0.85);
  vec3 color = base * (0.32 + 0.78 * diffuse) + rim * 0.12;
  // Background, not foreground: knock everything back toward the page colour.
  color = mix(color, uBg, DIM + vFog * (0.9 - DIM));
  float text = mix(0.1, 1.0, clearOfText());
  fragColor = vec4(color, uOpacity * (1.0 - vFog * 0.5) * text);
}`;

const CAMERA_Z = 22;
const FOV = 35;
/**
 * How far piece colours are pulled toward the page colour: 0 = full colour, 1 = invisible.
 * Lower it to brighten the background pieces.
 */
const DIM = 0.45;
/** Text boxes the pieces fade behind; only the ones on screen are sent, up to MAX_RECTS. */
const MAX_RECTS = 16;
const TEXT_SELECTOR = [
  '.mark',
  '.nav',
  '.hero-meta > span',
  '.title .line',
  '.lede',
  '.ctas',
  '.section-head > *',
  '.chips',
  '.footer-big',
  '.footer-grid > div',
  '.fineprint > span',
].join(',');

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = Number.parseInt(full.slice(0, 6), 16);
  return Number.isNaN(n)
    ? [1, 1, 1]
    : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/** Seeded PRNG so the layout is stable between visits. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export function start(container: HTMLElement): void {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowEnd =
    coarse ||
    (navigator.hardwareConcurrency ?? 8) <= 4 ||
    ((navigator as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  let dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2);

  let renderer: Renderer;
  try {
    renderer = new Renderer({ dpr, alpha: true, antialias: dpr < 2, powerPreference: 'low-power' });
  } catch {
    return;
  }
  const { gl } = renderer;
  if (!renderer.isWebgl2) {
    // The shaders need WebGL2; leave the static poster.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return;
  }
  gl.clearColor(0, 0, 0, 0);
  container.append(gl.canvas);

  const camera = new Camera(gl, { fov: FOV, near: 1, far: 60 });
  camera.position.z = CAMERA_Z;
  const scene = new Transform();

  const halfH = Math.tan(((FOV / 2) * Math.PI) / 180) * CAMERA_Z;
  let halfW = halfH;
  const span = halfH * 2 * 1.7;

  const style = getComputedStyle(document.documentElement);
  const color = (name: string) => hexToRgb(style.getPropertyValue(name) || '#ffffff');
  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: [0, 0, 0] },
    uScroll: { value: 0 },
    uMood: { value: [0, 0, halfW, halfH] },
    uSpan: { value: span },
    uSize: { value: 1 },
    uC0: { value: color('--accent') },
    uC1: { value: color('--secondary') },
    uC2: { value: color('--fg') },
    uC3: { value: color('--muted') },
    uBg: { value: color('--bg') },
    uOpacity: { value: 1 },
    // A plain array: OGL only resolves uniform arrays (uRects[0]) from Array values.
    uRects: { value: new Array<number>(MAX_RECTS * 4).fill(-1e5) },
    uFeather: { value: 56 },
  };
  const program = new Program(gl, {
    vertex,
    fragment: fragment.replace(
      '#version 300 es',
      `#version 300 es
#define MAX_RECTS ${MAX_RECTS}
#define DIM ${DIM.toFixed(2)}`,
    ),
    uniforms,
    transparent: true,
    cullFace: false,
  });

  // Distribute instances across piece kinds.
  const total = lowEnd ? 22 : 46;
  const random = rng(20261008);
  const kinds = pieceKinds();
  const weightSum = kinds.reduce((s, k) => s + k.weight, 0);
  const meshes: Mesh[] = [];
  for (const kind of kinds) {
    const count = Math.max(2, Math.round((kind.weight / weightSum) * total));
    const base = new Float32Array(count * 3);
    const params = new Float32Array(count * 4);
    const axis = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      base.set([(random() * 2 - 1) * 1.15, (random() - 0.5) * span, -10 + random() * 14], i * 3);
      const pick = random();
      const colorIndex = pick < 0.46 ? 0 : pick < 0.66 ? 1 : pick < 0.84 ? 2 : 3;
      const [lo, hi] = kind.scale;
      params.set(
        [lo + random() * (hi - lo), 0.35 + random() * 0.6, random() * Math.PI * 2, colorIndex],
        i * 4,
      );
      const ax = random() * 2 - 1;
      const ay = random() * 2 - 1;
      const az = random() * 2 - 1;
      const len = Math.hypot(ax, ay, az) || 1;
      axis.set([ax / len, ay / len, az / len], i * 3);
    }
    const geometry = new Geometry(gl, {
      position: { size: 3, data: kind.positions },
      aBase: { size: 3, data: base, instanced: 1 },
      aParams: { size: 4, data: params, instanced: 1 },
      aAxis: { size: 3, data: axis, instanced: 1 },
    });
    const mesh = new Mesh(gl, { geometry, program, frustumCulled: false });
    mesh.setParent(scene);
    meshes.push(mesh);
  }

  const resize = () => {
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    renderer.dpr = dpr;
    renderer.setSize(width, height);
    camera.perspective({ aspect: width / height });
    halfW = halfH * (width / height);
    uniforms.uMood.value[2] = halfW;
    uniforms.uSize.value = Math.min(1, Math.max(0.6, (width / height) * 1.1));
  };
  new ResizeObserver(resize).observe(container);
  resize();

  // Pointer, in world units on the z=0 plane, eased toward the target.
  const pointer = { x: 0, y: 0, strength: 0, tx: 0, ty: 0, ts: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 * halfW - halfW;
      pointer.ty = -((event.clientY / window.innerHeight) * 2 * halfH - halfH);
      pointer.ts = 1;
    },
    { passive: true },
  );
  document.documentElement.addEventListener('pointerleave', () => {
    pointer.ts = 0;
  });
  window.addEventListener('blur', () => {
    pointer.ts = 0;
  });

  // Text boxes in page coordinates, re-measured when layout or fonts change. Ranges give
  // the tight box of the text itself rather than the full width of its block.
  let textBoxes: { top: number; bottom: number; left: number; right: number }[] = [];
  const measureText = () => {
    const range = document.createRange();
    textBoxes = [...document.querySelectorAll(TEXT_SELECTOR)].flatMap((el) => {
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return [];
      const y = window.scrollY;
      return [{ top: r.top + y, bottom: r.bottom + y, left: r.left, right: r.right }];
    });
  };
  new ResizeObserver(measureText).observe(document.body);
  void document.fonts?.ready.then(measureText);
  measureText();
  const PAD = 6;
  const uploadText = (height: number) => {
    const out = uniforms.uRects.value;
    out.fill(-1e5);
    const k = renderer.dpr;
    let n = 0;
    for (const box of textBoxes) {
      const top = box.top - window.scrollY;
      const bottom = box.bottom - window.scrollY;
      if (bottom < -40 || top > height + 40) continue;
      // Framebuffer pixels, origin bottom-left.
      out[n * 4] = (box.left - PAD) * k;
      out[n * 4 + 1] = (height - bottom - PAD) * k;
      out[n * 4 + 2] = (box.right + PAD) * k;
      out[n * 4 + 3] = (height - top + PAD) * k;
      if (++n === MAX_RECTS) break;
    }
    uniforms.uFeather.value = 56 * k;
  };

  // Section moods, from scroll position.
  const hero = document.querySelector<HTMLElement>('[data-section="hero"]');
  const footer = document.querySelector<HTMLElement>('[data-section="footer"]');
  const mood = { grid: 0, footer: 0, speed: 1, opacity: 1 };
  const targets = () => {
    const vh = window.innerHeight;
    const heroH = hero?.offsetHeight ?? vh;
    const toGrid = Math.min(1, Math.max(0, window.scrollY / (heroH * 0.75)));
    const footerTop = footer ? footer.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
    const toFooter = Math.min(
      1,
      Math.max(0, (vh - footerTop) / Math.min(vh * 0.8, footer?.offsetHeight ?? vh)),
    );
    return {
      grid: toGrid * (1 - toFooter),
      footer: toFooter,
      speed: 1 - toGrid * 0.65 + toFooter * 0.45,
      opacity: 1 - toGrid * 0.62 + toFooter * 0.3,
    };
  };

  let frame = 0;
  let last = performance.now();
  let slowFrames = 0;
  let firstFrame = true;
  const render = (now: number) => {
    frame = 0;
    if (document.hidden) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Adaptive quality: if frames keep running long, drop resolution once.
    slowFrames = dt > 0.028 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
    if (slowFrames > 90 && dpr > 1) {
      dpr = 1;
      slowFrames = 0;
      resize();
    }

    const target = targets();
    mood.grid = damp(mood.grid, target.grid, 4, dt);
    mood.footer = damp(mood.footer, target.footer, 3, dt);
    mood.speed = damp(mood.speed, target.speed, 3, dt);
    mood.opacity = damp(mood.opacity, target.opacity, 4, dt);
    pointer.x = damp(pointer.x, pointer.tx, 6, dt);
    pointer.y = damp(pointer.y, pointer.ty, 6, dt);
    pointer.strength = damp(pointer.strength, pointer.ts, 3, dt);

    uniforms.uTime.value += dt * mood.speed;
    uniforms.uPointer.value = [pointer.x, pointer.y, pointer.strength];
    uniforms.uScroll.value = (window.scrollY / window.innerHeight) * 2 * halfH;
    uniforms.uMood.value = [mood.grid, mood.footer, halfW, halfH];
    uniforms.uOpacity.value = mood.opacity;
    uploadText(container.clientHeight || window.innerHeight);

    renderer.render({ scene, camera });
    if (firstFrame) {
      firstFrame = false;
      container.classList.add('is-live');
    }
    // Nothing to draw when fully faded; wake again on scroll.
    if (mood.opacity < 0.02) return;
    frame = requestAnimationFrame(render);
  };
  const wake = () => {
    if (frame || document.hidden) return;
    last = performance.now();
    frame = requestAnimationFrame(render);
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('scroll', wake, { passive: true });

  // Reduced motion switched on mid-visit: stop for good and fall back to the poster.
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('scroll', wake);
    cancelAnimationFrame(frame);
    frame = 0;
    container.classList.remove('is-live');
  });

  gl.canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    frame = 0;
    container.classList.remove('is-live');
  });

  wake();
}
