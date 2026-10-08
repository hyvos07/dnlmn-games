import {
  add,
  type Board,
  cellKey,
  DIRS,
  type Dir,
  inBounds,
  OPPOSITE,
  same,
  type Vec,
} from './grid.ts';
import type { Rng } from './rng.ts';

export interface SnakeState {
  readonly board: Board;
  /** Head first. */
  readonly body: readonly Vec[];
  /** Direction of the last move. */
  readonly dir: Dir;
  /** `null` only once the board is full. */
  readonly food: Vec | null;
  /** Segments still to grow. */
  readonly grow: number;
  readonly alive: boolean;
  readonly won: boolean;
  readonly eaten: number;
  readonly score: number;
}

export type StepEvent =
  | { type: 'eat'; at: Vec; points: number }
  | { type: 'die'; cause: 'wall' | 'self' }
  | { type: 'win' };

export interface StepResult {
  state: SnakeState;
  events: StepEvent[];
}

export const START_LENGTH = 4;
export const GROW_PER_FOOD = 1;

/** Points for the n-th food eaten (1-based): 10, rising by 10 every 5 foods. */
export function foodPoints(eatenCount: number): number {
  return 10 * (1 + Math.floor((Math.max(1, eatenCount) - 1) / 5));
}

/** A random free cell, or `null` if the snake fills the board. */
export function placeFood(board: Board, body: readonly Vec[], rng: Rng): Vec | null {
  const taken = new Set(body.map((p) => cellKey(board, p)));
  const free: Vec[] = [];
  for (let y = 0; y < board.rows; y++) {
    for (let x = 0; x < board.cols; x++) {
      if (!taken.has(y * board.cols + x)) free.push({ x, y });
    }
  }
  if (free.length === 0) return null;
  return free[Math.min(free.length - 1, Math.floor(rng() * free.length))] ?? null;
}

/** A fresh round: the snake sits left of centre, heading right. */
export function createState(board: Board, rng: Rng, length = START_LENGTH): SnakeState {
  const y = Math.floor(board.rows / 2);
  const headX = Math.max(length - 1, Math.floor(board.cols / 3));
  const body = Array.from({ length }, (_, i) => ({ x: headX - i, y }));
  return {
    board,
    body,
    dir: 'right',
    food: placeFood(board, body, rng),
    grow: 0,
    alive: true,
    won: false,
    eaten: 0,
    score: 0,
  };
}

/**
 * Advance one grid step. Pure: returns a new state plus what happened.
 * Reversing straight into the neck is ignored (the snake keeps its direction).
 * Moving into the cell the tail is leaving is allowed.
 */
export function step(state: SnakeState, wanted: Dir, rng: Rng): StepResult {
  if (!state.alive || state.won) return { state, events: [] };
  const dir = state.body.length > 1 && wanted === OPPOSITE[state.dir] ? state.dir : wanted;
  const head = state.body[0] as Vec;
  const next = add(head, DIRS[dir]);

  if (!inBounds(state.board, next)) {
    return { state: { ...state, dir, alive: false }, events: [{ type: 'die', cause: 'wall' }] };
  }

  const ate = state.food !== null && same(next, state.food);
  let pending = state.grow + (ate ? GROW_PER_FOOD : 0);
  const keepTail = pending > 0;
  if (keepTail) pending--;

  const remaining = keepTail ? state.body : state.body.slice(0, -1);
  if (remaining.some((p) => same(p, next))) {
    return { state: { ...state, dir, alive: false }, events: [{ type: 'die', cause: 'self' }] };
  }

  const body = [next, ...remaining];
  const events: StepEvent[] = [];
  let { food, eaten, score } = state;
  let won = false;
  if (ate) {
    eaten += 1;
    const points = foodPoints(eaten);
    score += points;
    events.push({ type: 'eat', at: next, points });
    food = placeFood(state.board, body, rng);
    if (food === null) {
      won = true;
      events.push({ type: 'win' });
    }
  }

  return { state: { ...state, body, dir, food, grow: pending, eaten, score, won }, events };
}
