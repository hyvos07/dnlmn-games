import { describe, expect, it } from 'vitest';
import { type Ball, stepBall } from './physics.ts';

const bounds = { width: 100, height: 100 };
const ball = (over: Partial<Ball>): Ball => ({ x: 50, y: 50, vx: 0, vy: 0, r: 5, ...over });

describe('stepBall', () => {
  it('moves by velocity * dt', () => {
    const { ball: next, bounced } = stepBall(ball({ vx: 10, vy: -20 }), bounds, 0.5);
    expect(next.x).toBe(55);
    expect(next.y).toBe(40);
    expect(bounced).toBe(false);
  });

  it('bounces off the right wall and stays inside', () => {
    const { ball: next, bounced } = stepBall(ball({ x: 94, vx: 20 }), bounds, 1);
    expect(next.x).toBe(95);
    expect(next.vx).toBe(-20);
    expect(bounced).toBe(true);
  });

  it('bounces off the top wall', () => {
    const { ball: next } = stepBall(ball({ y: 6, vy: -10 }), bounds, 1);
    expect(next.y).toBe(5);
    expect(next.vy).toBe(10);
  });
});
