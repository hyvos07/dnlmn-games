import type { Vec } from './grid.ts';

const lerp = (a: Vec, b: Vec, t: number): Vec => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/**
 * The snake's centre line between two grid steps, head first, in cell units.
 *
 * The head glides from its previous cell toward the new one, every inner point sits
 * on a real cell centre (so corners stay square), and the tail retracts toward the
 * next cell unless the snake grew this step. At t=1 it matches t=0 of the next step.
 */
export function interpolatePath(prev: readonly Vec[], cur: readonly Vec[], t: number): Vec[] {
  const head = cur[0];
  if (!head) return [];
  const center = (p: Vec): Vec => ({ x: p.x + 0.5, y: p.y + 0.5 });
  const k = Math.min(1, Math.max(0, t));
  const prevHead = prev[0] ?? head;
  const points = [center(lerp(prevHead, head, k)), ...cur.slice(1).map(center)];
  const grew = cur.length > prev.length;
  const prevTail = prev.at(-1);
  const curTail = cur.at(-1);
  if (!grew && prevTail && curTail && prev.length > 0) {
    points.push(center(lerp(prevTail, curTail, k)));
  }
  return points;
}

/** Total length of a polyline. */
export function pathLength(points: readonly Vec[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec;
    const b = points[i] as Vec;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/** The point `distance` along a polyline from its start, or `null` past the end. */
export function pointAlong(points: readonly Vec[], distance: number): Vec | null {
  let left = distance;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] as Vec;
    const b = points[i] as Vec;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= length) return length === 0 ? a : lerp(a, b, left / length);
    left -= length;
  }
  return null;
}
