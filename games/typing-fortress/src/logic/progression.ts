import type { Difficulty } from './game';

export const WAVE_SECONDS = 35;

const intervals: Record<Difficulty, number> = { baby: 2.6, normal: 1.9, 'fast-hand': 1.25 };

/** Original balance: a shared three-minute pressure ramp and timed enemy introductions. */
export function progression(difficulty: Difficulty, elapsed: number) {
  const golemChance = elapsed >= 45 ? 0.24 : 0;
  return {
    interval: intervals[difficulty] / (1 + Math.min(Math.max(0, elapsed), 180) / 180),
    wispChance: elapsed >= 25 ? 0.55 - golemChance : 0,
    golemChance,
    eliteWords: difficulty === 'fast-hand' ? (elapsed >= 165 ? 3 : 2) : 1,
  };
}
