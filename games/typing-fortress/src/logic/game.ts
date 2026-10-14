import { progression, WAVE_SECONDS } from './progression';
import { chooseWord } from './words';

export type Difficulty = 'baby' | 'normal' | 'fast-hand';
export type TypingMode = 'classic' | 'editable';
export type EnemyKind = 'crawler' | 'wisp' | 'golem';

export interface Enemy {
  id: number;
  word: string;
  kind: EnemyKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  speed: number;
}

export interface GameState {
  difficulty: Difficulty;
  typingMode: TypingMode;
  enemies: Enemy[];
  elapsed: number;
  wave: number;
  health: number;
  maxHealth: number;
  score: number;
  combo: number;
  bestCombo: number;
  completedWords: number;
  correctLetters: number;
  errors: number;
  /** A validated classic prefix, or the editable field's latest committed text. */
  buffer: string;
  ended: boolean;
  /** Internal simulation fields, copied on restart rather than shared globally. */
  randomSeed: number;
  nextId: number;
  spawnIn: number;
}

export type GameEvent =
  | { type: 'spawn'; enemy: Enemy }
  | {
      type: 'hit';
      id: number;
      x: number;
      z: number;
      kind: EnemyKind;
      killed: boolean;
      points: number;
    }
  | { type: 'mistake'; id: number | null }
  | { type: 'damage'; x: number; z: number }
  | { type: 'wave'; wave: number }
  | { type: 'end' };

export const FORTRESS_RADIUS = 2.7;
export const ENEMY_CAP: Record<Difficulty, number> = { baby: 8, normal: 12, 'fast-hand': 16 };
export const ENEMY_SPEED: Record<EnemyKind, number> = { crawler: 0.34, wisp: 0.5, golem: 0.28 };

export function createGame(
  difficulty: Difficulty,
  seed = Date.now(),
  typingMode: TypingMode = 'classic',
): GameState {
  return {
    difficulty,
    typingMode,
    enemies: [],
    elapsed: 0,
    wave: 1,
    health: 6,
    maxHealth: 6,
    score: 0,
    combo: 0,
    bestCombo: 0,
    completedWords: 0,
    correctLetters: 0,
    errors: 0,
    buffer: '',
    ended: false,
    randomSeed: seed >>> 0,
    nextId: 1,
    spawnIn: 0.4,
  };
}

function random(state: GameState): number {
  state.randomSeed = (Math.imul(state.randomSeed, 1664525) + 1013904223) >>> 0;
  return state.randomSeed / 4294967296;
}

function spawn(state: GameState): GameEvent | null {
  if (state.enemies.length >= ENEMY_CAP[state.difficulty]) return null;
  const word = chooseWord(
    state.elapsed,
    state.enemies.map((enemy) => enemy.word),
    () => random(state),
  );
  if (!word) return null;
  const roll = random(state);
  const level = progression(state.difficulty, state.elapsed);
  const kind: EnemyKind =
    roll < level.golemChance
      ? 'golem'
      : roll < level.golemChance + level.wispChance
        ? 'wisp'
        : 'crawler';
  const hp = kind === 'golem' ? level.eliteWords : 1;
  // Golden-angle spacing gives all-direction attacks without clustering successive spawns.
  const angle = state.nextId * 2.399963229728653 + (random(state) - 0.5) * 0.4;
  const radius = 12.4 + random(state) * 1.1;
  const enemy: Enemy = {
    id: state.nextId++,
    word,
    kind,
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    hp,
    maxHp: hp,
    speed: ENEMY_SPEED[kind],
  };
  state.enemies.push(enemy);
  return { type: 'spawn', enemy: { ...enemy } };
}

export function candidates(state: GameState): Enemy[] {
  const text = state.buffer.toLowerCase();
  return state.enemies.filter((enemy) => enemy.word.startsWith(text));
}

function nearest(enemies: readonly Enemy[]): Enemy | undefined {
  return enemies.reduce<Enemy | undefined>((chosen, enemy) => {
    if (!chosen) return enemy;
    const distance = enemy.x ** 2 + enemy.z ** 2;
    const chosenDistance = chosen.x ** 2 + chosen.z ** 2;
    return distance < chosenDistance || (distance === chosenDistance && enemy.id < chosen.id)
      ? enemy
      : chosen;
  }, undefined);
}

/** Explicitly clearing a field (for example, select-all/delete) is not a mistake. */
export function abandonPrefix(state: GameState): void {
  state.buffer = '';
}

export function typeLetter(state: GameState, letter: string): GameEvent[] {
  if (state.ended || !/^[a-z]$/.test(letter)) return [];
  if (state.typingMode === 'editable') return editText(state, state.buffer + letter, letter);
  if (!state.enemies.length) return [];
  const text = state.buffer + letter;
  if (!state.enemies.some((enemy) => enemy.word.startsWith(text))) {
    state.errors++;
    state.combo = 0;
    return [{ type: 'mistake', id: nearest(candidates(state))?.id ?? null }];
  }
  state.correctLetters++;
  state.buffer = text;
  return checkText(state);
}

/** Find only the inserted/replaced segment; unchanged text and deletions are not new attempts. */
function insertedText(before: string, after: string): string {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - end - 1] === after[after.length - end - 1]
  )
    end++;
  return after.slice(start, after.length - end);
}

/** The editable field is authoritative, even while its text has no matching enemy. */
export function editText(
  state: GameState,
  text: string,
  inserted = insertedText(state.buffer, text),
): GameEvent[] {
  if (state.ended) return [];
  const previous = candidates(state);
  state.buffer = text;
  const matches = candidates(state);
  const events: GameEvent[] = [];
  if (inserted && /^[a-z]+$/i.test(inserted) && (matches.length || !state.enemies.length)) {
    state.correctLetters += inserted.length;
  } else if (inserted && state.enemies.length) {
    state.errors += [...inserted].length;
    state.combo = 0;
    events.push({
      type: 'mistake',
      id: nearest(previous.length ? previous : state.enemies)?.id ?? null,
    });
  }
  return [...events, ...checkText(state)];
}

/** Rechecking unchanged text never adds attempts; only an exact live word fires a shot. */
export function checkText(state: GameState): GameEvent[] {
  if (state.ended || !state.buffer) return [];
  const text = state.buffer.toLowerCase();
  const target = nearest(state.enemies.filter((enemy) => enemy.word === text));
  if (!target) return [];

  state.completedWords++;
  state.combo++;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const killed = target.hp === 1;
  const roleBonus = target.kind === 'golem' ? 75 : target.kind === 'wisp' ? 40 : 25;
  const multiplier = 1 + Math.min(20, state.combo - 1) * 0.05;
  const points = Math.round((target.word.length * 10 + (killed ? roleBonus : 0)) * multiplier);
  state.score += points;
  state.buffer = '';
  target.hp--;
  if (killed) {
    // Logical removal is immediate; decorative projectile timing cannot cause unfair damage.
    state.enemies = state.enemies.filter((enemy) => enemy.id !== target.id);
  } else {
    const replacement = chooseWord(
      state.elapsed,
      state.enemies.map((enemy) => enemy.word),
      () => random(state),
    );
    // With the curated pool and the 16-enemy cap a replacement always exists.
    // If a future custom pool exhausts it, keep the old binding valid instead of a blank target.
    if (replacement) target.word = replacement;
  }
  return [
    { type: 'hit', id: target.id, x: target.x, z: target.z, kind: target.kind, killed, points },
  ];
}

/**
 * Advance active play only. The caller freezes this function while paused.
 * Admit at most one second per frame to prevent a throttled tab from skipping an entire siege.
 * Substeps keep movement/spawns stable across ordinary renderer frame rates.
 * Input completes synchronously; a hit submitted before advance wins over arrival that frame.
 */
export function advance(state: GameState, dt: number, evaluateText = true): GameEvent[] {
  if (state.ended || !Number.isFinite(dt) || dt <= 0) return [];
  const matchField = evaluateText && state.typingMode === 'editable';
  const events: GameEvent[] = matchField ? checkText(state) : [];
  let remaining = Math.min(1, dt);
  while (remaining > 1e-9 && !state.ended) {
    const step = Math.min(0.05, remaining);
    remaining -= step;
    state.elapsed += step;
    const wave = 1 + Math.floor((state.elapsed + 1e-8) / WAVE_SECONDS);
    if (wave !== state.wave) {
      state.wave = wave;
      events.push({ type: 'wave', wave });
    }
    for (const enemy of [...state.enemies]) {
      const radius = Math.hypot(enemy.x, enemy.z);
      const nextRadius = Math.max(0, radius - enemy.speed * step);
      if (nextRadius <= FORTRESS_RADIUS) {
        state.enemies = state.enemies.filter((active) => active.id !== enemy.id);
        state.health = Math.max(0, state.health - 1);
        state.combo = 0;
        events.push({ type: 'damage', x: enemy.x, z: enemy.z });
        if (state.typingMode === 'classic' && state.buffer && !candidates(state).length)
          state.buffer = '';
        if (state.health === 0) {
          state.ended = true;
          state.buffer = '';
          events.push({ type: 'end' });
          break;
        }
      } else if (radius > 0) {
        enemy.x *= nextRadius / radius;
        enemy.z *= nextRadius / radius;
      }
    }
    if (state.ended) break;
    state.spawnIn -= step;
    if (state.spawnIn <= 1e-8) {
      const event = spawn(state);
      if (event) events.push(event, ...(matchField ? checkText(state) : []));
      state.spawnIn += progression(state.difficulty, state.elapsed).interval;
    }
  }
  return events;
}

/** WPM uses accepted insertions / 5 per active minute; incorrect insertions count once in accuracy. */
export function stats(state: GameState): { wpm: number; accuracy: number } {
  const attempts = state.correctLetters + state.errors;
  return {
    wpm: state.elapsed > 0 ? Math.round((state.correctLetters / 5 / state.elapsed) * 60) : 0,
    accuracy: attempts ? Math.round((state.correctLetters / attempts) * 100) : 100,
  };
}
