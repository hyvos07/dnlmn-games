import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';

const take = (seed: number, n: number) => {
  const r = createRng(seed);
  return Array.from({ length: n }, () => r());
};

describe('createRng', () => {
  it('is deterministic for the same seed', () => {
    expect(take(123, 20)).toEqual(take(123, 20));
  });

  it('differs for different seeds', () => {
    expect(take(1, 20)).not.toEqual(take(2, 20));
  });

  it('stays within [0, 1)', () => {
    for (const seed of [0, 1, 42, 2 ** 32 - 1]) {
      for (const v of take(seed, 1000)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });
});
