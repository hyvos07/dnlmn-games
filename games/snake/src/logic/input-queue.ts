import { type Dir, OPPOSITE } from './grid.ts';

/** How many turns can be buffered ahead of the snake. Two lets quick U-turns land. */
export const MAX_QUEUED = 2;

/**
 * Queue a turn. It's compared with the last queued turn (or the current direction):
 * repeats and reversals are dropped, and the queue never exceeds `max`.
 */
export function enqueueTurn(
  queue: readonly Dir[],
  current: Dir,
  turn: Dir,
  max = MAX_QUEUED,
): Dir[] {
  const last = queue.at(-1) ?? current;
  if (queue.length >= max || turn === last || turn === OPPOSITE[last]) return [...queue];
  return [...queue, turn];
}

/** Take the next turn for this step, or keep going straight. */
export function nextTurn(queue: readonly Dir[], current: Dir): { dir: Dir; queue: Dir[] } {
  const [first, ...rest] = queue;
  return { dir: first ?? current, queue: rest };
}
