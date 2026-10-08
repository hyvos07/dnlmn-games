/**
 * Pure rules for the starter dodger: no KAPLAY and no DOM, so they are easy to unit-test.
 * Keep rules like this (difficulty curves, scoring, spawn positions) out of the scenes.
 */

/** Seconds a run lasts before difficulty stops rising. */
export const RAMP_SECONDS = 60;

const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
const progress = (elapsed: number) => Math.min(Math.max(elapsed / RAMP_SECONDS, 0), 1);

/** Seconds between hazards, shrinking from 0.9 s to 0.3 s over the ramp. */
export function spawnDelay(elapsed: number): number {
  return lerp(0.9, 0.3, progress(elapsed));
}

/** Fall speed in pixels per second, rising from 180 to 420 over the ramp. */
export function fallSpeed(elapsed: number): number {
  return lerp(180, 420, progress(elapsed));
}

/** A random hazard x position (its centre) that keeps the whole square on screen. */
export function pickX(rng: () => number, width: number, size: number): number {
  return size / 2 + rng() * (width - size);
}

/** Keep `x` inside the screen for an object `size` wide, centred on `x`. */
export function clampX(x: number, width: number, size: number): number {
  return Math.min(Math.max(x, size / 2), width - size / 2);
}

/** Move `x` toward `target` by at most `maxStep`, without overshooting. */
export function approach(x: number, target: number, maxStep: number): number {
  const delta = target - x;
  return Math.abs(delta) <= maxStep ? target : x + Math.sign(delta) * maxStep;
}
