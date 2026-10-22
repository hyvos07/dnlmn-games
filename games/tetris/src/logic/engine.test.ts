import { describe, expect, it } from 'vitest';
import {
  act,
  cells,
  createGame,
  type GameState,
  ghost,
  isGameState,
  snapshot,
  tick,
} from './engine.ts';

function fillExcept(state: GameState, row: number, holes: number[]): void {
  const target = state.board[row];
  if (!target) throw new Error(`Missing board row ${row}`);
  for (let x = 0; x < 10; x++) target[x] = holes.includes(x) ? null : 'J';
}

function setCell(state: GameState, row: number, column: number, kind: 'J' | 'T'): void {
  const target = state.board[row];
  if (!target) throw new Error(`Missing board row ${row}`);
  target[column] = kind;
}

describe('falling block engine', () => {
  it('creates reproducible seven-bag games with a full preview queue', () => {
    const a = createGame('sprint', 123);
    const b = createGame('sprint', 123);
    expect(a.active).toEqual(b.active);
    expect(a.queue).toEqual(b.queue);
    expect(a.queue).toHaveLength(6);
    expect(new Set([a.active.kind, ...a.queue]).size).toBe(7);
  });

  it('keeps the ghost on the board and hard drops with distance scoring', () => {
    const state = createGame('zen', 4);
    const landing = ghost(state);
    expect(cells(landing).every((cell) => cell.y < 40)).toBe(true);
    act(state, 'drop');
    expect(state.pieces).toBe(1);
    expect(state.score).toBeGreaterThan(0);
  });

  it.each(['T', 'S', 'Z', 'J', 'L'] as const)('%s rotates around the 3x3 pivot', (kind) => {
    const state = createGame('zen', 10);
    state.active = { kind, rotation: 0, x: 3, y: 10 };
    const before = cells(state.active);
    act(state, 'cw');
    expect(cells(state.active)).toEqual(
      before.map(({ x, y }) => ({ x: 3 + 2 - (y - 10), y: 10 + (x - 3) })),
    );
  });

  it('rotates I around the 4x4 pivot and leaves O cells fixed', () => {
    const state = createGame('zen', 11);
    state.active = { kind: 'I', rotation: 0, x: 3, y: 10 };
    expect(cells({ ...state.active, rotation: 1 })).toEqual([
      { x: 5, y: 10 },
      { x: 5, y: 11 },
      { x: 5, y: 12 },
      { x: 5, y: 13 },
    ]);
    const square = { kind: 'O' as const, rotation: 0, x: 3, y: 10 };
    expect(cells({ ...square, rotation: 1 })).toEqual(cells(square));
  });

  it.each(['cw', 'ccw'] as const)('uses a screen-space upward floor kick for %s', (action) => {
    const state = createGame('zen', 12);
    state.active = { kind: 'T', rotation: action === 'cw' ? 0 : 2, x: 3, y: 38 };
    act(state, action);
    expect(state.active.rotation).toBe(1);
    expect(state.active.y).toBe(37);
    expect(state.lastKick).toBeGreaterThan(0);
  });

  it('uses the I wall kick on the correct side of the screen', () => {
    const state = createGame('zen', 13);
    state.active = { kind: 'I', rotation: 1, x: -1, y: 20 };
    act(state, 'ccw');
    expect(state.active.rotation).toBe(0);
    expect(state.active.x).toBe(1);
    expect(state.lastKick).toBe(1);
  });

  it.each(['cw', 'ccw'] as const)('kicks the T away from the wall on %s', (action) => {
    const state = createGame('zen', 131);
    state.active =
      action === 'cw'
        ? { kind: 'T', rotation: 3, x: 8, y: 20 }
        : { kind: 'T', rotation: 1, x: -1, y: 20 };
    act(state, action);
    expect(state.active.rotation).toBe(0);
    expect(state.active.x).toBe(action === 'cw' ? 7 : 0);
    expect(state.lastKick).toBe(1);
  });

  it.each(['cw', 'ccw'] as const)('floor-kicks the I in the %s direction', (action) => {
    const state = createGame('zen', 132);
    state.active =
      action === 'cw'
        ? { kind: 'I', rotation: 0, x: 3, y: 37 }
        : { kind: 'I', rotation: 2, x: 3, y: 37 };
    act(state, action);
    expect(state.active.rotation).toBe(1);
    expect(state.active.y).toBe(action === 'cw' ? 35 : 36);
    expect(state.lastKick).toBe(4);
  });

  it.each(['cw', 'ccw'] as const)('wall-kicks the I in the %s direction', (action) => {
    const state = createGame('zen', 133);
    state.active =
      action === 'cw'
        ? { kind: 'I', rotation: 0, x: 6, y: 20 }
        : { kind: 'I', rotation: 1, x: -1, y: 20 };
    if (action === 'cw') {
      for (const y of [20, 22, 23]) setCell(state, y, 8, 'J');
    }
    act(state, action);
    expect(state.active.rotation).toBe(action === 'cw' ? 1 : 0);
    expect(state.active.x).toBe(action === 'cw' ? 4 : 1);
    expect(state.lastKick).toBe(1);
  });

  it('clears rows, updates combo/level, and recognizes the 40 line sprint win', () => {
    const state = createGame('sprint', 7);
    fillExcept(state, 39, [4]);
    state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
    act(state, 'drop');
    expect(state.lines).toBe(1);
    expect(state.lastClear).toContain('SINGLE');
    state.lines = 39;
    fillExcept(state, 39, [4]);
    state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
    act(state, 'drop');
    expect(state.won).toBe(true);
    expect(state.ended).toBe(true);
  });

  it('holds once per lock and restores the held piece', () => {
    const state = createGame('zen', 9);
    const original = state.active.kind;
    act(state, 'hold');
    expect(state.hold).toBe(original);
    expect(state.canHold).toBe(false);
    const swapped = state.active.kind;
    act(state, 'hold');
    expect(state.active.kind).toBe(swapped);
    act(state, 'drop');
    act(state, 'hold');
    expect(state.active.kind).toBe(original);
  });

  it('locks after 500 ms and caps Blitz at two minutes', () => {
    const state = createGame('blitz', 3);
    state.active.y = 38;
    tick(state, 600);
    expect(state.pieces).toBe(1);
    tick(state, 120_000);
    expect(state.elapsed).toBe(120_000);
    expect(state.ended).toBe(true);
  });

  it('natural gravity awards no points and preserves T-spin rotation eligibility', () => {
    const state = createGame('zen', 14);
    act(state, 'cw');
    const score = state.score;
    tick(state, 1000);
    expect(state.score).toBe(score);
    expect(state.lastRotation).toBe(true);
  });

  it('held soft drop scores each descended cell using a multiplier of natural gravity', () => {
    const state = createGame('zen', 141);
    tick(state, 50, true, 20);
    expect(state.active.y).toBe(21);
    expect(state.score).toBe(1);
    expect(state.lastRotation).toBe(false);
  });

  it.each(['sprint', 'zen'] as const)(
    '%s remains at level-one gravity after line clears',
    (mode) => {
      const state = createGame(mode, 142);
      state.level = 1;
      state.lines = 9;
      fillExcept(state, 39, [4]);
      state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
      act(state, 'drop');
      expect(state.level).toBe(1);
      const falling = createGame(mode, 142);
      falling.level = 15;
      tick(falling, 500);
      expect(falling.active.y).toBe(20);
      tick(falling, 500);
      expect(falling.active.y).toBe(21);
    },
  );

  it('caps accumulated gravity when blocked instead of retaining a large backlog', () => {
    const state = createGame('zen', 143);
    state.active.y = 38;
    state.gravity = 100_000;
    tick(state, 1);
    expect(state.gravity).toBeLessThanOrEqual(1000);
  });

  it('lets O rotation reset lock time within the shared reset cap', () => {
    const state = createGame('zen', 144);
    state.active = { kind: 'O', rotation: 0, x: 3, y: 38 };
    state.lockTime = 300;
    state.lockResets = 14;
    act(state, 'cw');
    expect(state.lockTime).toBe(0);
    expect(state.lockResets).toBe(15);
    state.lockTime = 300;
    act(state, 'cw');
    expect(state.lockTime).toBe(300);
    expect(state.lockResets).toBe(15);
  });

  it('soft drop gives one point per row and hard drop gives two', () => {
    const soft = createGame('zen', 15);
    const startY = soft.active.y;
    act(soft, 'down');
    expect(soft.score).toBe(1);
    expect(soft.active.y).toBe(startY + 1);
    const hard = createGame('zen', 15);
    const distance = ghost(hard).y - hard.active.y;
    act(hard, 'drop');
    expect(hard.score).toBe(distance * 2);
  });

  it('spawns visibly and resets the gravity accumulator after lock', () => {
    const state = createGame('zen', 16);
    expect(cells(state.active).some(({ y }) => y >= 20)).toBe(true);
    state.gravity = 900;
    act(state, 'drop');
    expect(state.gravity).toBe(0);
  });

  it('Blitz adds no garbage and uses cumulative line thresholds', () => {
    const state = createGame('blitz', 17);
    state.lines = 2;
    fillExcept(state, 39, [4]);
    state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
    const before = state.board.map((row) => [...row]);
    act(state, 'drop');
    expect(state.level).toBe(2);
    expect(state.board[0]).toEqual(before[0]);
    expect(state.board[1]).toEqual(before[1]);
  });

  it.each([3, 8, 15, 24, 35, 48, 63, 80, 99, 120, 144, 170, 198, 228, 260])(
    'Blitz reaches the next level at %i lines',
    (threshold) => {
      const state = createGame('blitz', threshold);
      state.lines = threshold - 1;
      fillExcept(state, 39, [4]);
      state.active = { kind: 'I', rotation: 1, x: 2, y: 36 };
      act(state, 'drop');
      const expectedLevel =
        [3, 8, 15, 24, 35, 48, 63, 80, 99, 120, 144, 170, 198, 228, 260].indexOf(threshold) + 2;
      expect(state.level).toBe(expectedLevel);
    },
  );

  it('awards the mini T-spin score when a rotation locks without a line clear', () => {
    const state = createGame('zen', 18);
    setCell(state, 37, 3, 'J');
    setCell(state, 39, 3, 'J');
    setCell(state, 39, 5, 'J');
    state.active = { kind: 'T', rotation: 0, x: 3, y: 37 };
    state.lastRotation = true;
    act(state, 'drop');
    expect(state.lastClear).toContain('MINI T-SPIN');
    expect(state.score).toBe(100);
  });

  it('awards full T-spin points when both front corners are occupied', () => {
    const state = createGame('zen', 19);
    setCell(state, 37, 3, 'J');
    setCell(state, 37, 5, 'J');
    setCell(state, 39, 3, 'J');
    setCell(state, 39, 5, 'J');
    state.active = { kind: 'T', rotation: 0, x: 3, y: 37 };
    state.lastRotation = true;
    act(state, 'drop');
    expect(state.lastClear).toBe('T-SPIN');
    expect(state.score).toBe(400);
  });

  it('recovers Zen and ends timed modes on hidden-row lockout', () => {
    for (const mode of ['sprint', 'zen'] as const) {
      const state = createGame(mode, 20);
      state.board[20]?.fill('J');
      state.active = { kind: 'O', rotation: 0, x: 3, y: 18 };
      act(state, 'drop');
      expect(state.ended).toBe(mode !== 'zen');
      expect(state.board.flat().every((cell) => cell === null)).toBe(mode === 'zen');
    }
  });

  it('deep-copies snapshots and rejects malformed saves', () => {
    const state = createGame('zen', 33);
    const saved = snapshot(state);
    saved.board[0]?.splice(0, 1, 'T');
    saved.queue.pop();
    expect(state.board[0]?.[0]).toBeNull();
    expect(state.queue).toHaveLength(6);
    expect(isGameState(state)).toBe(true);
    expect(isGameState({ ...state, board: [] })).toBe(false);
    expect(isGameState({ ...state, queue: [...state.queue, ...state.queue, ...state.queue] })).toBe(
      false,
    );
    expect(isGameState({ ...state, active: { ...state.active, rotation: 4 } })).toBe(false);
    expect(isGameState({ ...state, score: -1 })).toBe(false);
    expect(isGameState({ ...state, level: 17 })).toBe(false);
    expect(isGameState({ ...state, score: '2' } as unknown)).toBe(false);
  });
});
