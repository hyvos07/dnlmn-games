import { describe, expect, it } from 'vitest';
import type { Dir } from './grid.ts';
import { enqueueTurn, MAX_QUEUED, nextTurn } from './input-queue.ts';

describe('enqueueTurn', () => {
  it('queues a valid turn', () => {
    expect(enqueueTurn([], 'right', 'up')).toEqual(['up']);
  });

  it('drops repeats of the current direction and of the last queued turn', () => {
    expect(enqueueTurn([], 'right', 'right')).toEqual([]);
    expect(enqueueTurn(['up'], 'right', 'up')).toEqual(['up']);
  });

  it('drops reversals relative to the current direction and the last queued turn', () => {
    expect(enqueueTurn([], 'right', 'left')).toEqual([]);
    expect(enqueueTurn(['up'], 'right', 'down')).toEqual(['up']);
  });

  it('queues two quick turns (up then left while moving right)', () => {
    const q1 = enqueueTurn([], 'right', 'up');
    const q2 = enqueueTurn(q1, 'right', 'left');
    expect(q2).toEqual(['up', 'left']);
  });

  it('caps at MAX_QUEUED', () => {
    expect(MAX_QUEUED).toBe(2);
    expect(enqueueTurn(['up', 'left'], 'right', 'down')).toEqual(['up', 'left']);
  });

  it('does not mutate the input', () => {
    const q: Dir[] = ['up'];
    enqueueTurn(q, 'right', 'left');
    expect(q).toEqual(['up']);
  });
});

describe('nextTurn', () => {
  it('pops the first queued turn', () => {
    expect(nextTurn(['up', 'left'], 'right')).toEqual({ dir: 'up', queue: ['left'] });
  });

  it('returns the current direction when empty', () => {
    expect(nextTurn([], 'right')).toEqual({ dir: 'right', queue: [] });
  });
});
