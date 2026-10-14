import { createShooterRenderer } from './error-shooter-renderer.ts';
import {
  createShooter,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  followPointer,
  steer,
  stepShooter,
} from './error-shooter-rules.ts';

/** Launcher-local arcade interaction. No storage, audio, or game/SDK imports. */
export function mountShooter(root: HTMLElement): void {
  const canvas = root.querySelector<HTMLCanvasElement>('[data-shooter-canvas]');
  const board = root.querySelector<HTMLElement>('[data-shooter-board]');
  const hud = root.querySelector<HTMLElement>('[data-shooter-hud]');
  const score = root.querySelector<HTMLOutputElement>('[data-shooter-score]');
  const shields = root.querySelector<HTMLOutputElement>('[data-shooter-shields]');
  const overlay = root.querySelector<HTMLElement>('[data-shooter-over]');
  const result = root.querySelector<HTMLElement>('[data-shooter-result]');
  const retry = root.querySelector<HTMLButtonElement>('[data-shooter-retry]');
  const status = root.querySelector<HTMLElement>('[data-shooter-status]');
  if (!canvas || !board || !hud || !score || !shields || !overlay || !result || !retry || !status)
    return;
  const renderer = createShooterRenderer(canvas);
  if (!renderer) return;
  let state = createShooter();
  let last = 0;
  let accumulator = 0;
  let frameId = 0;
  let visible = true;
  let oldScore = -1;
  let oldShields = -1;
  const keys = new Set<string>();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let scorePulse: ((element: HTMLElement) => void) | undefined;
  if (!reduced.matches) {
    void import('./enhance/error-shooter-motion.ts')
      .then((motion) => {
        scorePulse = motion.pulseScore;
      })
      .catch(() => {});
  }
  hud.hidden = false;
  root.classList.add('is-ready');

  const sync = () => {
    if (state.score !== oldScore) {
      score.textContent = state.score.toLocaleString('en-US');
      if (state.score > oldScore && oldScore >= 0 && !reduced.matches) scorePulse?.(score);
      oldScore = state.score;
    }
    if (state.shields !== oldShields) {
      shields.textContent = '◆ '.repeat(Math.max(0, state.shields)).trim() || '—';
      shields.setAttribute('aria-label', `${state.shields} shields`);
      oldShields = state.shields;
    }
  };

  const finish = () => {
    overlay.hidden = false;
    result.textContent = `${state.score.toLocaleString('en-US')} points · Wave ${state.wave}`;
    status.textContent = `Nice try. ${result.textContent}. Fly again to restart.`;
    if (document.activeElement === canvas) retry.focus({ preventScroll: true });
    keys.clear();
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const direction =
      Number(keys.has('arrowright') || keys.has('d')) -
      Number(keys.has('arrowleft') || keys.has('a'));
    const vertical =
      Number(keys.has('arrowdown') || keys.has('s')) - Number(keys.has('arrowup') || keys.has('w'));
    if (direction || vertical) {
      const speed = (dt * 300) / Math.hypot(direction, vertical);
      steer(state, state.targetX + direction * speed, state.targetY + vertical * speed);
    }
    accumulator += dt;
    while (accumulator >= 1 / 60 && !state.over) {
      for (const hit of stepShooter(state, 1 / 60)) renderer.burst(hit);
      accumulator -= 1 / 60;
    }
    renderer.draw(state, dt);
    sync();
    if (state.over) finish();
    else frameId = requestAnimationFrame(frame);
  };

  const resume = () => {
    cancelAnimationFrame(frameId);
    last = 0;
    accumulator = 0;
    keys.clear();
    if (!document.hidden && visible && !state.over) frameId = requestAnimationFrame(frame);
  };

  const restart = () => {
    state = createShooter();
    oldScore = -1;
    oldShields = -1;
    renderer.reset();
    overlay.hidden = true;
    status.textContent = 'Void Patrol ready. Steer your ship; it fires automatically.';
    sync();
    renderer.draw(state, 0);
    resume();
  };

  const aim = (event: PointerEvent) => {
    if (state.over) return;
    const bounds = canvas.getBoundingClientRect();
    followPointer(
      state,
      ((event.clientX - bounds.left) / bounds.width) * FIELD_WIDTH,
      ((event.clientY - bounds.top) / bounds.height) * FIELD_HEIGHT,
    );
  };
  canvas.addEventListener('pointerdown', (event) => {
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture(event.pointerId);
    aim(event);
  });
  canvas.addEventListener('pointermove', aim);
  canvas.addEventListener('pointerenter', (event) => {
    if (event.pointerType === 'mouse') aim(event);
  });
  canvas.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (!['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's'].includes(key))
      return;
    event.preventDefault();
    keys.add(key);
  });
  canvas.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
  canvas.addEventListener('blur', () => keys.clear());
  retry.addEventListener('click', () => {
    restart();
    canvas.focus({ preventScroll: true });
  });
  document.addEventListener('visibilitychange', resume);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    resume();
  });
  observer.observe(board);
  window.addEventListener('pagehide', (event) => {
    cancelAnimationFrame(frameId);
    keys.clear();
    if (!event.persisted) {
      observer.disconnect();
      renderer.dispose();
    }
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) restart();
    else resume();
  });
  restart();
}
