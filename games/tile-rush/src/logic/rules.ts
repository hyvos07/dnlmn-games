export type Mode = 'timed' | 'endless' | 'practice';
export type Phase = 'ready' | 'playing' | 'over';

export interface Row {
  lane: number;
  variant: number;
}

export interface Round {
  mode: Mode;
  phase: Phase;
  /** The next live target is first; rendering leaves one row below it for the last hit. */
  rows: Row[];
  score: number;
  mistakes: number;
  elapsed: number;
  duration: number;
  endReason: 'time' | 'miss' | null;
}

const DEFAULT_DURATION = 20;
const VISIBLE_ROWS = 6;
const LANES = 4;

function randomIndex(random: () => number): number {
  return Math.min(LANES - 1, Math.max(0, Math.floor(random() * LANES)));
}

function createRow(random: () => number): Row {
  return { lane: randomIndex(random), variant: randomIndex(random) };
}

export function createRound(
  mode: Mode,
  random: () => number = Math.random,
  duration = DEFAULT_DURATION,
  rowCount = VISIBLE_ROWS,
): Round {
  const count = Number.isFinite(rowCount)
    ? Math.min(64, Math.max(VISIBLE_ROWS, Math.floor(rowCount)))
    : VISIBLE_ROWS;
  return {
    mode,
    phase: 'ready',
    rows: Array.from({ length: count }, () => createRow(random)),
    score: 0,
    mistakes: 0,
    elapsed: 0,
    duration: Number.isFinite(duration) && duration > 0 ? duration : DEFAULT_DURATION,
    endReason: null,
  };
}

export function hitLane(
  round: Round,
  lane: number,
  random: () => number = Math.random,
): 'hit' | 'miss' | 'ignored' {
  if (round.phase === 'over' || !Number.isInteger(lane) || lane < 0 || lane >= LANES) {
    return 'ignored';
  }

  if (lane !== round.rows[0]?.lane) {
    if (round.phase === 'ready') return 'ignored';
    round.mistakes += 1;
    if (round.mode !== 'practice') {
      round.phase = 'over';
      round.endReason = 'miss';
    }
    return 'miss';
  }

  round.phase = 'playing';
  round.score += 1;
  round.rows.shift();
  round.rows.push(createRow(random));
  return 'hit';
}

export function advanceRound(round: Round, deltaSeconds: number): void {
  if (round.phase !== 'playing' || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
    return;
  }

  round.elapsed += deltaSeconds;
  if (round.mode === 'timed' && round.elapsed >= round.duration) {
    round.elapsed = round.duration;
    round.phase = 'over';
    round.endReason = 'time';
  }
}

export function remainingSeconds(round: Round): number {
  return Math.max(0, round.duration - round.elapsed);
}

export function clicksPerSecond(round: Round): number {
  return round.elapsed >= 1 ? round.score / round.elapsed : 0;
}
