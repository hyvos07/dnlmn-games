import { describe, expect, it } from 'vitest';
import {
  advanceRound,
  clicksPerSecond,
  createRound,
  hitLane,
  type Mode,
  remainingSeconds,
} from './rules.ts';

describe('round setup and tile queue', () => {
  it('creates six independent targets without starting the clock', () => {
    let draws = 0;
    const round = createRound('timed', () => (draws++ % 4) / 4);
    expect(round.rows).toEqual([
      { lane: 0, variant: 1 },
      { lane: 2, variant: 3 },
      { lane: 0, variant: 1 },
      { lane: 2, variant: 3 },
      { lane: 0, variant: 1 },
      { lane: 2, variant: 3 },
    ]);
    expect(round).toMatchObject({ phase: 'ready', score: 0, mistakes: 0, elapsed: 0 });
    expect(round.endReason).toBeNull();
  });

  it('consumes only the bottom target, appends a new row, and starts on the first hit', () => {
    let draws = 0;
    const round = createRound('endless', () => (draws++ % 4) / 4);
    const nextRows = round.rows.slice(1);
    expect(hitLane(round, 0, () => 0.99)).toBe('hit');
    expect(round.phase).toBe('playing');
    expect(round.score).toBe(1);
    expect(round.rows).toEqual([...nextRows, { lane: 3, variant: 3 }]);
    expect(round.rows).toHaveLength(6);
    expect(hitLane(round, 0)).toBe('miss');
  });

  it('allows consecutive targets in the same lane', () => {
    const round = createRound('timed', () => 0.5);
    for (let i = 0; i < 12; i++) expect(hitLane(round, 2, () => 0.5)).toBe('hit');
    expect(round.score).toBe(12);
    expect(round.rows).toHaveLength(6);
  });

  it('generates a longer queue and preserves its count after consuming targets', () => {
    let draws = 0;
    const random = () => (draws++ % 4) / 4;
    const round = createRound('practice', random, 20, 24);
    expect(round.rows).toHaveLength(24);
    expect(draws).toBe(48);
    expect(round.rows[23]).toEqual({ lane: 2, variant: 3 });
    const upcoming = round.rows.slice(1);
    expect(hitLane(round, 0, () => 0.99)).toBe('hit');
    expect(round.rows).toEqual([...upcoming, { lane: 3, variant: 3 }]);
    for (let i = 0; i < 50; i++) {
      expect(hitLane(round, round.rows[0]?.lane ?? -1, random)).toBe('hit');
      expect(round.rows).toHaveLength(24);
    }
  });

  it.each([
    [-1, 6],
    [0, 6],
    [5, 6],
    [6.9, 6],
    [24.9, 24],
    [64, 64],
    [1000, 64],
    [Number.NaN, 6],
    [Number.POSITIVE_INFINITY, 6],
    [Number.NEGATIVE_INFINITY, 6],
  ])('normalizes requested row count %s to %s', (requested, expected) => {
    const round = createRound('timed', () => 0, 20, requested);
    expect(round.rows).toHaveLength(expected);
  });

  it.each([0, 0.2499, 0.25, 0.5, 0.75, 0.9999])(
    'maps random sample %s to a valid lane',
    (value) => {
      const round = createRound('practice', () => value);
      expect(round.rows[0]?.lane).toBe(Math.floor(value * 4));
      expect(round.rows[0]?.variant).toBe(Math.floor(value * 4));
    },
  );
});

describe('misses and input guards', () => {
  it.each<Mode>(['timed', 'endless', 'practice'])(
    'ignores wrong lanes before %s starts',
    (mode) => {
      const round = createRound(mode, () => 0);
      const before = structuredClone(round);
      expect(hitLane(round, 1)).toBe('ignored');
      expect(round).toEqual(before);
    },
  );

  it.each<Mode>(['timed', 'endless'])('ends an active %s round on a miss', (mode) => {
    const round = createRound(mode, () => 0);
    hitLane(round, 0, () => 0);
    advanceRound(round, 1);
    const rows = structuredClone(round.rows);
    expect(hitLane(round, 1)).toBe('miss');
    expect(round).toMatchObject({ phase: 'over', endReason: 'miss', score: 1, mistakes: 1 });
    expect(round.rows).toEqual(rows);
    expect(hitLane(round, 0)).toBe('ignored');
    advanceRound(round, 10);
    expect(round.elapsed).toBe(1);
    expect(round.score).toBe(1);
  });

  it('counts practice mistakes while preserving the target and allowing recovery', () => {
    const round = createRound('practice', () => 0);
    hitLane(round, 0, () => 0);
    const rows = structuredClone(round.rows);
    expect(hitLane(round, 2)).toBe('miss');
    expect(hitLane(round, 1)).toBe('miss');
    expect(round.rows).toEqual(rows);
    expect(round).toMatchObject({ phase: 'playing', mistakes: 2, endReason: null });
    expect(hitLane(round, 0, () => 0)).toBe('hit');
    expect(round.score).toBe(2);
  });

  it.each([-1, 4, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'ignores invalid lane %s even during play',
    (lane) => {
      const round = createRound('timed', () => 0);
      hitLane(round, 0, () => 0);
      const before = structuredClone(round);
      expect(hitLane(round, lane)).toBe('ignored');
      expect(round).toEqual(before);
    },
  );
});

describe('clock and speed', () => {
  it('keeps the full duration while ready and starts elapsed time after a hit', () => {
    const round = createRound('timed', () => 0, 30);
    advanceRound(round, 100);
    expect(round.elapsed).toBe(0);
    expect(remainingSeconds(round)).toBe(30);
    expect(clicksPerSecond(round)).toBe(0);
    hitLane(round, 0, () => 0);
    expect(clicksPerSecond(round)).toBe(0);
    advanceRound(round, 0.5);
    expect(round.elapsed).toBe(0.5);
    expect(remainingSeconds(round)).toBe(29.5);
    expect(clicksPerSecond(round)).toBe(0);
  });

  it('reports zero for a failure before one second, even after many hits', () => {
    const round = createRound('timed', () => 0);
    for (let i = 0; i < 10; i++) hitLane(round, 0, () => 0);
    advanceRound(round, 0.999);
    hitLane(round, 1);
    advanceRound(round, 1.5);
    expect(clicksPerSecond(round)).toBe(0);
  });

  it('uses the full elapsed time once a second has passed', () => {
    const round = createRound('endless', () => 0);
    for (let i = 0; i < 5; i++) hitLane(round, 0, () => 0);
    advanceRound(round, 1);
    expect(clicksPerSecond(round)).toBe(5);
    advanceRound(round, 0.25);
    expect(clicksPerSecond(round)).toBe(4);
    hitLane(round, 1);
    advanceRound(round, 1.5);
    expect(clicksPerSecond(round)).toBe(4);
  });

  it.each([2, 200])('expires exactly at the duration when the final delta is %s', (delta) => {
    const round = createRound('timed', () => 0, 3);
    hitLane(round, 0, () => 0);
    advanceRound(round, 1);
    advanceRound(round, delta);
    expect(round).toMatchObject({ phase: 'over', endReason: 'time', elapsed: 3, mistakes: 0 });
    expect(remainingSeconds(round)).toBe(0);
    expect(hitLane(round, 0)).toBe('ignored');
    advanceRound(round, 100);
    expect(round.elapsed).toBe(3);
  });

  it.each<Mode>(['endless', 'practice'])('leaves %s active beyond the timed duration', (mode) => {
    const round = createRound(mode, () => 0, 1);
    hitLane(round, 0, () => 0);
    advanceRound(round, 50);
    expect(round).toMatchObject({ phase: 'playing', elapsed: 50, endReason: null });
    expect(remainingSeconds(round)).toBe(0);
    expect(clicksPerSecond(round)).toBe(0.02);
  });

  it.each([-1, 0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'ignores invalid elapsed delta %s',
    (delta) => {
      const round = createRound('timed', () => 0);
      hitLane(round, 0, () => 0);
      advanceRound(round, delta);
      expect(round.elapsed).toBe(0);
      expect(round.phase).toBe('playing');
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'uses the default duration for invalid duration %s',
    (duration) => {
      expect(createRound('timed', () => 0, duration).duration).toBe(20);
    },
  );
});
