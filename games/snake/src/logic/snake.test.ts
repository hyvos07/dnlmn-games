import { describe, expect, it } from 'vitest';
import type { Board, Vec } from './grid.ts';
import { createRng } from './rng.ts';
import { createState, foodPoints, placeFood, type SnakeState, step } from './snake.ts';

const board: Board = { cols: 10, rows: 10 };
const has = (cells: readonly Vec[], p: Vec) => cells.some((c) => c.x === p.x && c.y === p.y);

describe('createState', () => {
  it('places a 4-long snake heading right with food off the body', () => {
    const s = createState(board, createRng(1));
    expect(s.body).toHaveLength(4);
    expect(s.dir).toBe('right');
    expect(s.alive).toBe(true);
    expect(s.won).toBe(false);
    expect(s.body[0]?.x).toBeGreaterThan(s.body[1]?.x ?? 99);
    expect(s.food).not.toBeNull();
    expect(has(s.body, s.food as Vec)).toBe(false);
  });
});

describe('foodPoints', () => {
  it('rises by 10 every 5 foods', () => {
    for (const n of [1, 2, 3, 4, 5]) expect(foodPoints(n)).toBe(10);
    for (const n of [6, 7, 8, 9, 10]) expect(foodPoints(n)).toBe(20);
    expect(foodPoints(11)).toBe(30);
  });
});

describe('placeFood', () => {
  it('returns null when the board is full', () => {
    const b: Board = { cols: 2, rows: 2 };
    const full = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    expect(placeFood(b, full, createRng(1))).toBeNull();
  });

  it('never returns an occupied cell', () => {
    const b: Board = { cols: 3, rows: 3 };
    for (let seed = 0; seed < 200; seed++) {
      const rng = createRng(seed);
      const body: Vec[] = [];
      for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) if (rng() < 0.6) body.push({ x, y });
      }
      const food = placeFood(b, body, rng);
      if (body.length === 9) expect(food).toBeNull();
      else {
        expect(food).not.toBeNull();
        expect(has(body, food as Vec)).toBe(false);
      }
    }
  });
});

describe('step', () => {
  it('moves the head and keeps the length constant', () => {
    const s = createState(board, createRng(1));
    const { state, events } = step(s, 'right', createRng(2));
    expect(state.body).toHaveLength(s.body.length);
    expect(state.body[0]).toEqual({ x: (s.body[0]?.x ?? 0) + 1, y: s.body[0]?.y });
    expect(events).toEqual([]);
  });

  it('grows by one, scores, emits eat, and re-places food when eating', () => {
    const base = createState(board, createRng(1));
    const head = base.body[0] as Vec;
    const s: SnakeState = { ...base, food: { x: head.x + 1, y: head.y } };
    const { state, events } = step(s, 'right', createRng(3));
    expect(state.body).toHaveLength(s.body.length + 1);
    expect(state.eaten).toBe(1);
    expect(state.score).toBe(foodPoints(1));
    expect(events).toEqual([
      { type: 'eat', at: { x: head.x + 1, y: head.y }, points: foodPoints(1) },
    ]);
    expect(state.food).not.toBeNull();
    expect(has(state.body, state.food as Vec)).toBe(false);
  });

  it('dies on a wall with the body unchanged', () => {
    const b: Board = { cols: 4, rows: 3 };
    const s = createState(b, createRng(1)); // head at x=3, the right edge
    const { state, events } = step(s, 'right', createRng(2));
    expect(state.alive).toBe(false);
    expect(state.body).toEqual(s.body);
    expect(events).toEqual([{ type: 'die', cause: 'wall' }]);
  });

  it('dies on self collision', () => {
    const s: SnakeState = {
      ...createState(board, createRng(1)),
      body: [
        { x: 2, y: 2 },
        { x: 3, y: 2 },
        { x: 3, y: 3 },
        { x: 2, y: 3 },
        { x: 1, y: 3 },
      ],
      dir: 'left',
      food: { x: 9, y: 9 },
    };
    const { state, events } = step(s, 'down', createRng(2));
    expect(state.alive).toBe(false);
    expect(events).toEqual([{ type: 'die', cause: 'self' }]);
  });

  const loop = (grow: number): SnakeState => ({
    ...createState({ cols: 2, rows: 2 }, createRng(1)),
    board: { cols: 2, rows: 2 },
    body: [
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ],
    dir: 'up',
    food: null,
    grow,
  });

  it('allows moving into the cell the tail is vacating', () => {
    const { state, events } = step(loop(0), 'left', createRng(2));
    expect(state.alive).toBe(true);
    expect(events).toEqual([]);
    expect(state.body[0]).toEqual({ x: 0, y: 0 });
    expect(state.body).toHaveLength(4);
  });

  it('does not allow it while growing', () => {
    const { state, events } = step(loop(1), 'left', createRng(2));
    expect(state.alive).toBe(false);
    expect(events).toEqual([{ type: 'die', cause: 'self' }]);
  });

  it('ignores a reversal into the neck', () => {
    const s = createState(board, createRng(1));
    const { state } = step(s, 'left', createRng(2));
    expect(state.alive).toBe(true);
    expect(state.dir).toBe('right');
    expect(state.body[0]?.x).toBe((s.body[0]?.x ?? 0) + 1);
  });

  it('returns a dead state unchanged with no events', () => {
    const dead: SnakeState = { ...createState(board, createRng(1)), alive: false };
    const result = step(dead, 'up', createRng(2));
    expect(result.state).toBe(dead);
    expect(result.events).toEqual([]);
  });

  it('wins when the board fills', () => {
    const b: Board = { cols: 3, rows: 1 };
    const s: SnakeState = {
      ...createState(board, createRng(1)),
      board: b,
      body: [
        { x: 1, y: 0 },
        { x: 0, y: 0 },
      ],
      dir: 'right',
      food: { x: 2, y: 0 },
    };
    const { state, events } = step(s, 'right', createRng(2));
    expect(state.won).toBe(true);
    expect(state.food).toBeNull();
    expect(state.body).toHaveLength(3);
    expect(events.map((e) => e.type)).toEqual(['eat', 'win']);
    expect(step(state, 'right', createRng(2)).events).toEqual([]);
  });
});
