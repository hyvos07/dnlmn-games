import { describe, expect, it } from 'vitest';
import { interpolatePath, pathLength, pointAlong } from './interpolate.ts';

const prev = [
  { x: 1, y: 0 },
  { x: 0, y: 0 },
];
const cur = [
  { x: 2, y: 0 },
  { x: 1, y: 0 },
];

describe('interpolatePath', () => {
  it('head is at the previous head centre at t=0', () => {
    expect(interpolatePath(prev, cur, 0)[0]).toEqual({ x: 1.5, y: 0.5 });
  });

  it('head is at the current head centre at t=1', () => {
    expect(interpolatePath(prev, cur, 1)[0]).toEqual({ x: 2.5, y: 0.5 });
  });

  it('without growth has cur.length + 1 points and the tail lerps', () => {
    const path = interpolatePath(prev, cur, 0.5);
    expect(path).toHaveLength(cur.length + 1);
    expect(path.at(-1)).toEqual({ x: 1, y: 0.5 });
    expect(interpolatePath(prev, cur, 0).at(-1)).toEqual({ x: 0.5, y: 0.5 });
    expect(interpolatePath(prev, cur, 1).at(-1)).toEqual({ x: 1.5, y: 0.5 });
  });

  it('with growth has cur.length points', () => {
    const grown = [
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0 },
    ];
    expect(interpolatePath(prev, grown, 0.5)).toHaveLength(grown.length);
  });

  it('clamps t to [0, 1]', () => {
    expect(interpolatePath(prev, cur, -3)).toEqual(interpolatePath(prev, cur, 0));
    expect(interpolatePath(prev, cur, 7)).toEqual(interpolatePath(prev, cur, 1));
  });

  it('returns an empty path for an empty body', () => {
    expect(interpolatePath(prev, [], 0.5)).toEqual([]);
  });
});

describe('pathLength / pointAlong', () => {
  const L = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
  ];

  it('measures an L of unit segments as 2', () => {
    expect(pathLength(L)).toBe(2);
  });

  it('returns the start at 0', () => {
    expect(pointAlong(L, 0)).toEqual({ x: 0, y: 0 });
  });

  it('finds midpoints on each segment', () => {
    expect(pointAlong(L, 0.5)).toEqual({ x: 0.5, y: 0 });
    expect(pointAlong(L, 1.5)).toEqual({ x: 1, y: 0.5 });
  });

  it('returns null past the end', () => {
    expect(pointAlong(L, 2.5)).toBeNull();
  });
});
