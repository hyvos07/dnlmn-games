import type { Direction } from './logic/rules.ts';

const KEYS: Record<string, Direction> = {
  ArrowUp: 0,
  ArrowRight: 1,
  ArrowDown: 2,
  ArrowLeft: 3,
  w: 0,
  d: 1,
  s: 2,
  a: 3,
};

export function bindInput(
  board: HTMLElement,
  move: (direction: Direction) => void,
  allowed: () => boolean,
): () => void {
  let pointer: { id: number; x: number; y: number } | null = null;
  const reset = () => {
    pointer = null;
  };
  const keydown = (event: KeyboardEvent) => {
    if (
      !allowed() ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.isComposing
    )
      return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target.closest('button, a, input, textarea, select, [contenteditable="true"], dialog')
    )
      return;
    const direction = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
    if (direction === undefined) return;
    event.preventDefault();
    move(direction);
  };
  window.addEventListener('keydown', keydown);
  board.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary) {
      reset();
      return;
    }
    if (!allowed() || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
    board.focus({ preventScroll: true });
  });
  board.addEventListener('pointerup', (event) => {
    const start = pointer;
    reset();
    if (!start || start.id !== event.pointerId || !allowed()) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // Match upstream: one move per gesture, dominant axis, more than 10px.
    if (Math.max(Math.abs(dx), Math.abs(dy)) <= 10) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
  });
  board.addEventListener('pointercancel', reset);
  board.addEventListener('lostpointercapture', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('resize', reset);
  return reset;
}
