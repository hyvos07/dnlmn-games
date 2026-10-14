import { describe, expect, it } from 'vitest';
import {
  createShooter,
  FIELD_HEIGHT,
  FIELD_WIDTH,
  followPointer,
  SHIP_Y,
  steer,
  stepShooter,
} from './error-shooter-rules.ts';

describe('404 space shooter', () => {
  it('starts fresh with a playable formation, auto-fire, and three shields', () => {
    const state = createShooter();
    expect(state.enemies).toHaveLength(8);
    expect(state.shields).toBe(3);
    expect(state.score).toBe(0);
    stepShooter(state, 1 / 60);
    expect(state.shots.some((shot) => !shot.hostile)).toBe(true);
    state.score = 900;
    expect(createShooter().score).toBe(0);
  });

  it('keeps steering inside the arena and moves at a bounded speed', () => {
    const state = createShooter();
    steer(state, -200);
    expect(state.targetX).toBe(22);
    stepShooter(state, 1 / 60);
    expect(state.shipX).toBeLessThan(FIELD_WIDTH / 2);
    expect(state.shipX).toBeGreaterThan(22);
    steer(state, 900);
    expect(state.targetX).toBe(FIELD_WIDTH - 22);
    steer(state, 180, -200);
    expect(state.targetY).toBe(72);
    stepShooter(state, 1 / 60);
    expect(state.shipY).toBeLessThan(SHIP_Y);
    steer(state, 180, 900);
    expect(state.targetY).toBe(FIELD_HEIGHT - 28);
  });

  it('follows the pointer in both axes and fires from the current ship position', () => {
    const state = createShooter();
    followPointer(state, 210, 240);
    expect([state.shipX, state.shipY]).toEqual([210, 240]);
    stepShooter(state, 1 / 60);
    const laser = state.shots.find((shot) => !shot.hostile);
    expect(laser?.x).toBe(210);
    expect(laser?.y).toBeLessThan(220);
    expect(laser?.y).toBeGreaterThan(200);
    followPointer(state, -100, 900);
    expect([state.shipX, state.shipY]).toEqual([22, FIELD_HEIGHT - 28]);
  });

  it('checks hostile shots at the moved ship height instead of its starting row', () => {
    const state = createShooter();
    followPointer(state, 180, 250);
    state.shots = [{ id: 101, x: 180, y: SHIP_Y - 15, hostile: true }];
    stepShooter(state, 1 / 60);
    expect(state.shields).toBe(3);
    state.shots.push({ id: 102, x: 180, y: 235, hostile: true });
    const hits = stepShooter(state, 1 / 60);
    expect(state.shields).toBe(2);
    expect(hits).toContainEqual({ x: 180, y: 250, kind: 'ship' });
  });

  it('ramming an enemy costs a shield without awarding laser points', () => {
    const state = createShooter();
    followPointer(state, 180, 200);
    state.enemies = [{ id: 101, x: 180, homeX: 180, y: 200, phase: 0 }];
    stepShooter(state, 1 / 60);
    expect(state.shields).toBe(2);
    expect(state.score).toBe(0);
    expect(state.enemies).toHaveLength(0);
  });

  it('scores only a laser that actually crosses an enemy', () => {
    const state = createShooter();
    state.enemies = [{ id: 1, x: 180, homeX: 180, y: 100, phase: 0 }];
    state.shots = [
      { id: 2, x: 180, y: 117, hostile: false },
      { id: 3, x: 90, y: 117, hostile: false },
    ];
    const hits = stepShooter(state, 1 / 60);
    expect(state.score).toBe(100);
    expect(state.enemies).toHaveLength(0);
    expect(hits).toHaveLength(1);
    expect(state.shots.find((shot) => shot.id === 2)).toBeUndefined();
    expect(state.shots.find((shot) => shot.id === 3)).toBeDefined();
    stepShooter(state, 1 / 60);
    expect(state.score).toBe(100);
  });

  it('absorbs simultaneous hits once and ends when shields run out', () => {
    const state = createShooter();
    state.shots = [1, 2].map((id) => ({ id, x: 180, y: SHIP_Y - 15, hostile: true }));
    stepShooter(state, 1 / 60);
    expect(state.shields).toBe(2);
    state.invulnerable = 0;
    state.shields = 1;
    state.shots = [{ id: 4, x: 180, y: SHIP_Y - 15, hostile: true }];
    stepShooter(state, 1 / 60);
    expect(state.over).toBe(true);
    const frozen = structuredClone(state);
    expect(stepShooter(state, 1)).toEqual([]);
    expect(state).toEqual(frozen);
  });

  it('starts another wave after clearing the arena and removes stray shots', () => {
    const state = createShooter();
    state.enemies = [];
    state.fireIn = 10;
    state.shots = [{ id: 999, x: 20, y: -60, hostile: false }];
    for (let i = 0; i < 50; i++) stepShooter(state, 1 / 60);
    expect(state.wave).toBe(2);
    expect(state.enemies).toHaveLength(12);
    expect(state.shots.find((shot) => shot.id === 999)).toBeUndefined();
  });
});
