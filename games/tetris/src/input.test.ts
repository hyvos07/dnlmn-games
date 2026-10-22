import { describe, expect, it } from 'vitest';
import { MovementRepeat } from './input.ts';
import type { Action } from './logic/engine.ts';
import { readHandling, readRecords, readZen } from './storage.ts';

describe('handling', () => {
  it('waits for DAS then repeats independently of OS keyboard repeat', () => {
    const repeat = new MovementRepeat();
    const moves: Action[] = [];
    repeat.press('left');
    repeat.update(132, 133, 16, (a) => moves.push(a));
    expect(moves).toEqual([]);
    repeat.update(1, 133, 16, (a) => moves.push(a));
    repeat.update(32, 133, 16, (a) => moves.push(a));
    expect(moves).toEqual(['left', 'left', 'left']);
  });
  it('supports instant ARR and cancels repeat on interruption', () => {
    const repeat = new MovementRepeat();
    const moves: Action[] = [];
    repeat.press('right');
    repeat.update(133, 133, 0, (a) => moves.push(a));
    expect(moves).toHaveLength(10);
    repeat.clear();
    repeat.update(200, 133, 0, (a) => moves.push(a));
    expect(moves).toHaveLength(10);
  });
  it('starts a fresh delay on a direction change', () => {
    const repeat = new MovementRepeat();
    const moves: Action[] = [];
    repeat.press('left');
    repeat.update(130, 133, 16, (a) => moves.push(a));
    repeat.press('right');
    repeat.update(20, 133, 16, (a) => moves.push(a));
    expect(moves).toEqual([]);
  });
});
describe('untrusted local saves', () => {
  it('rejects nonfinite and out of bounds values but keeps valid instant handling', () => {
    expect(readHandling({ das: -1, arr: 0, sdf: Infinity })).toMatchObject({
      das: 133,
      arr: 0,
      sdf: 8,
    });
    expect(readRecords({ sprint: -1, blitz: NaN })).toEqual({ sprint: null, blitz: 0 });
    expect(readZen({ version: 1, state: {} })).toBeNull();
  });
});
