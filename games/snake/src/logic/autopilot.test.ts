import { describe, expect, it } from 'vitest';
import { autopilot } from './autopilot.ts';
import { type Board, OPPOSITE, type Vec } from './grid.ts';
import { createRng } from './rng.ts';
import { createState, type SnakeState, step } from './snake.ts';

const board: Board = { cols: 12, rows: 12 };
const manhattan = (a: Vec, b: Vec) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

describe('autopilot', () => {
  it('never returns the reverse direction', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = createRng(seed);
      let s = createState(board, rng);
      for (let i = 0; i < 60 && s.alive; i++) {
        const dir = autopilot(s);
        expect(dir).not.toBe(OPPOSITE[s.dir]);
        s = step(s, dir, rng).state;
      }
    }
  });

  it('moves toward the food on an open board', () => {
    const base = createState(board, createRng(1));
    const s: SnakeState = { ...base, food: { x: 9, y: 2 } };
    const before = manhattan(s.body[0] as Vec, s.food as Vec);
    const next = step(s, autopilot(s), createRng(2)).state;
    expect(manhattan(next.body[0] as Vec, s.food as Vec)).toBe(before - 1);
  });

  it('avoids an immediate wall when a safe move exists', () => {
    const s: SnakeState = {
      ...createState(board, createRng(1)),
      body: [
        { x: 11, y: 0 },
        { x: 10, y: 0 },
        { x: 9, y: 0 },
        { x: 8, y: 0 },
      ],
      dir: 'right',
      food: null,
    };
    expect(autopilot(s)).toBe('down');
    expect(step(s, autopilot(s), createRng(2)).state.alive).toBe(true);
  });

  it('avoids immediate self collision when a safe move exists', () => {
    // Head at (2,2) heading left; (2,3) and (1,2) are body, (2,1) is free.
    const s: SnakeState = {
      ...createState(board, createRng(1)),
      body: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
        { x: 1, y: 2 },
        { x: 0, y: 2 },
      ],
      dir: 'left',
      food: { x: 2, y: 4 },
    };
    expect(autopilot(s)).toBe('up');
  });

  it('survives 300 steps with restarts and eats at least once', () => {
    const rng = createRng(2024);
    let s = createState(board, rng);
    let eats = 0;
    expect(() => {
      for (let i = 0; i < 300; i++) {
        const result = step(s, autopilot(s), rng);
        eats += result.events.filter((e) => e.type === 'eat').length;
        s = result.state.alive && !result.state.won ? result.state : createState(board, rng);
      }
    }).not.toThrow();
    expect(eats).toBeGreaterThan(0);
  });
});
