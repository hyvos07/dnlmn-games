import { describe, expect, it } from 'vitest';
import type { Difficulty } from './game';
import { progression } from './progression';

describe('original difficulty progression', () => {
  it.each<Difficulty>(['baby', 'normal', 'fast-hand'])(
    'doubles %s spawn pressure over three minutes and caps it for endless play',
    (difficulty) => {
      const opening = progression(difficulty, 0).interval;
      expect(progression(difficulty, 90).interval).toBeCloseTo(opening / 1.5);
      expect(progression(difficulty, 180).interval).toBeCloseTo(opening / 2);
      expect(progression(difficulty, 100000).interval).toBe(progression(difficulty, 180).interval);
    },
  );

  it('introduces wisps at 25 seconds and splits the existing enemy mix with golems at 45 seconds', () => {
    for (const difficulty of ['baby', 'normal', 'fast-hand'] as const) {
      expect(progression(difficulty, 24.99).wispChance).toBe(0);
      expect(progression(difficulty, 25).wispChance).toBeCloseTo(0.55);
      expect(progression(difficulty, 44.99).golemChance).toBe(0);
      const mixed = progression(difficulty, 45);
      expect(mixed.golemChance).toBeCloseTo(0.24);
      expect(mixed.wispChance).toBeCloseTo(0.31);
      expect(mixed.wispChance + mixed.golemChance).toBeCloseTo(0.55);
    }
  });

  it('restores three-word Fast Hand elites at 165 seconds and single-word enemies on lower modes', () => {
    expect(progression('fast-hand', 164.99).eliteWords).toBe(2);
    expect(progression('fast-hand', 165).eliteWords).toBe(3);
    expect(progression('baby', 100000).eliteWords).toBe(1);
    expect(progression('normal', 100000).eliteWords).toBe(1);
  });
});
