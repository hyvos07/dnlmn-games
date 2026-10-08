import { describe, expect, it } from 'vitest';
import { approach, clampX, fallSpeed, pickX, RAMP_SECONDS, spawnDelay } from './dodge.ts';

describe('difficulty', () => {
  it('starts gentle and ends fast', () => {
    expect(spawnDelay(0)).toBeCloseTo(0.9);
    expect(spawnDelay(RAMP_SECONDS)).toBeCloseTo(0.3);
    expect(fallSpeed(0)).toBe(180);
    expect(fallSpeed(RAMP_SECONDS)).toBe(420);
  });

  it('only ever gets harder, then levels off', () => {
    expect(spawnDelay(20)).toBeLessThan(spawnDelay(10));
    expect(fallSpeed(20)).toBeGreaterThan(fallSpeed(10));
    expect(spawnDelay(RAMP_SECONDS * 5)).toBe(spawnDelay(RAMP_SECONDS));
    expect(fallSpeed(-5)).toBe(fallSpeed(0));
  });
});

describe('pickX', () => {
  it('keeps the whole square on screen at both extremes', () => {
    expect(pickX(() => 0, 640, 40)).toBe(20);
    expect(pickX(() => 1, 640, 40)).toBe(620);
  });
});

describe('clampX', () => {
  it('stops an object at the screen edges', () => {
    expect(clampX(-50, 640, 40)).toBe(20);
    expect(clampX(700, 640, 40)).toBe(620);
    expect(clampX(300, 640, 40)).toBe(300);
  });
});

describe('approach', () => {
  it('moves toward the target by at most the step', () => {
    expect(approach(0, 100, 30)).toBe(30);
    expect(approach(100, 0, 30)).toBe(70);
  });

  it('lands exactly on the target instead of overshooting', () => {
    expect(approach(90, 100, 30)).toBe(100);
    expect(approach(5, 5, 30)).toBe(5);
  });
});
