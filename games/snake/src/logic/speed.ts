export const START_STEP_MS = 140;
export const MIN_STEP_MS = 60;
const DECAY = 0.965;

/** Milliseconds per grid step after eating `eaten` foods. Ramps from 140 ms down to a 60 ms floor. */
export function stepMs(eaten: number): number {
  return Math.max(MIN_STEP_MS, Math.round(START_STEP_MS * DECAY ** Math.max(0, eaten)));
}
