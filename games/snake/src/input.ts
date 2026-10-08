import type { Dir } from './logic/grid.ts';

export interface InputHandlers {
  turn(dir: Dir): void;
  /** Start / restart (Space, Enter or a tap). Arrows/WASD also start from the title screen. */
  primary(source: 'key' | 'tap'): void;
}

const KEY_DIRS: Record<string, Dir> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
};

/** Minimum swipe distance (CSS px) before a turn registers. */
const SWIPE_PX = 22;

/**
 * Keyboard (arrows/WASD) and touch swipes. Swipes chain: keep your finger down and
 * draw an L to turn twice. A short tap counts as `primary`.
 */
export function bindInput(surface: HTMLElement, handlers: InputHandlers): () => void {
  const onKey = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    // Keys pressed on the SDK HUD (its buttons, the help dialog) belong to the HUD.
    if (
      event
        .composedPath()
        .some((node) => node instanceof Element && node.hasAttribute('data-games-hud'))
    ) {
      return;
    }
    const key = event.key.toLowerCase();
    const dir = KEY_DIRS[key];
    if (dir) {
      event.preventDefault();
      handlers.turn(dir);
      return;
    }
    if (key === ' ' || key === 'enter') {
      event.preventDefault();
      if (!event.repeat) handlers.primary('key');
    }
  };

  let origin: { x: number; y: number; id: number; moved: boolean } | null = null;
  const onDown = (event: PointerEvent) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // Buttons handle their own clicks; don't double-fire `primary`.
    if ((event.target as Element | null)?.closest('button, a')) return;
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false };
  };
  const onMove = (event: PointerEvent) => {
    if (!origin || event.pointerId !== origin.id) return;
    const dx = event.clientX - origin.x;
    const dy = event.clientY - origin.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_PX) return;
    const dir: Dir =
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
    handlers.turn(dir);
    origin = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: true };
  };
  const onUp = (event: PointerEvent) => {
    if (!origin || event.pointerId !== origin.id) return;
    if (!origin.moved) handlers.primary('tap');
    origin = null;
  };
  const onCancel = () => {
    origin = null;
  };

  window.addEventListener('keydown', onKey);
  surface.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  return () => {
    window.removeEventListener('keydown', onKey);
    surface.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
  };
}
