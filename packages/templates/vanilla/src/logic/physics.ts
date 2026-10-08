/** Pure physics for the starter game: no DOM, so it is easy to unit-test. */

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Half the side length of the square. */
  r: number;
}

export interface Bounds {
  width: number;
  height: number;
}

/** Advance the ball by `dt` seconds and bounce it off the bounds. Reports whether it bounced. */
export function stepBall(ball: Ball, bounds: Bounds, dt: number): { ball: Ball; bounced: boolean } {
  let { x, y, vx, vy } = ball;
  const { r } = ball;
  let bounced = false;
  x += vx * dt;
  y += vy * dt;
  if (x < r || x > bounds.width - r) {
    x = Math.min(Math.max(x, r), bounds.width - r);
    vx = -vx;
    bounced = true;
  }
  if (y < r || y > bounds.height - r) {
    y = Math.min(Math.max(y, r), bounds.height - r);
    vy = -vy;
    bounced = true;
  }
  return { ball: { x, y, vx, vy, r }, bounced };
}
