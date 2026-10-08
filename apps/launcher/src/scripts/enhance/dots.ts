/**
 * Quiet background for text pages (about): the poster's dot grid, redrawn on a 2D
 * canvas so it can react to the pointer. Dots near the cursor drift away from it and
 * warm toward the accent. It is meant to be barely there. It only draws while something
 * is moving; otherwise it sits idle. Loaded after first paint, never under reduced motion.
 */

const SPACING = 28;
const RADIUS = 150;
const PUSH = 9;
const BASE_ALPHA = 0.07;
const LIT_ALPHA = 0.3;

const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt));

export function start(container: HTMLElement): void {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  container.append(canvas);

  const style = getComputedStyle(document.documentElement);
  const fg = style.getPropertyValue('--fg').trim() || '#f4f1ea';
  const accent = style.getPropertyValue('--accent').trim() || '#c6ff3d';

  let width = 0;
  let height = 0;
  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    wake();
  };

  // Pointer in CSS pixels, eased; `strength` fades in on move and out on leave.
  const pointer = { x: -1e4, y: -1e4, tx: -1e4, ty: -1e4, strength: 0, ts: 0 };
  window.addEventListener(
    'pointermove',
    (event) => {
      pointer.tx = event.clientX;
      pointer.ty = event.clientY;
      if (pointer.strength === 0) {
        pointer.x = pointer.tx;
        pointer.y = pointer.ty;
      }
      pointer.ts = 1;
      wake();
    },
    { passive: true },
  );
  const leave = () => {
    pointer.ts = 0;
    wake();
  };
  document.documentElement.addEventListener('pointerleave', leave);
  window.addEventListener('blur', leave);

  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    const r2 = RADIUS * RADIUS;
    const { x: px, y: py, strength } = pointer;
    // Unlit dots in one batch, lit ones (near the pointer) individually.
    ctx.beginPath();
    const lit: [number, number, number][] = [];
    for (let y = SPACING / 2; y < height; y += SPACING) {
      for (let x = SPACING / 2; x < width; x += SPACING) {
        const dx = x - px;
        const dy = y - py;
        const d2 = dx * dx + dy * dy;
        if (strength > 0.01 && d2 < r2) {
          lit.push([x, y, (1 - Math.sqrt(d2) / RADIUS) * strength]);
          continue;
        }
        ctx.moveTo(x + 1.2, y);
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
      }
    }
    ctx.globalAlpha = BASE_ALPHA;
    ctx.fillStyle = fg;
    ctx.fill();
    for (const [x, y, k] of lit) {
      const ease = k * k * (3 - 2 * k);
      const dx = x - px;
      const dy = y - py;
      const len = Math.hypot(dx, dy) || 1;
      ctx.globalAlpha = BASE_ALPHA + (LIT_ALPHA - BASE_ALPHA) * ease;
      ctx.fillStyle = ease > 0.35 ? accent : fg;
      ctx.beginPath();
      ctx.arc(
        x + (dx / len) * PUSH * ease,
        y + (dy / len) * PUSH * ease,
        1.2 + ease * 0.9,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  let frame = 0;
  let last = 0;
  const tick = (now: number) => {
    frame = 0;
    if (document.hidden || reduced.matches) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pointer.x = damp(pointer.x, pointer.tx, 10, dt);
    pointer.y = damp(pointer.y, pointer.ty, 10, dt);
    pointer.strength = damp(pointer.strength, pointer.ts, 5, dt);
    if (pointer.ts === 0 && pointer.strength < 0.01) pointer.strength = 0;
    draw();
    if (!container.classList.contains('is-dots')) container.classList.add('is-dots');
    // Settled: stop until the next pointer move or resize.
    const settled =
      Math.abs(pointer.x - pointer.tx) < 0.3 &&
      Math.abs(pointer.y - pointer.ty) < 0.3 &&
      Math.abs(pointer.strength - pointer.ts) < 0.01;
    if (!settled) frame = requestAnimationFrame(tick);
  };
  function wake() {
    if (frame || document.hidden || reduced.matches) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced.addEventListener('change', () => {
    if (!reduced.matches) return;
    cancelAnimationFrame(frame);
    frame = 0;
    canvas.remove();
    container.classList.remove('is-dots');
  });
  document.addEventListener('visibilitychange', wake);
  new ResizeObserver(resize).observe(container);
  resize();
}
