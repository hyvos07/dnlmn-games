import { describe, expect, it } from 'vitest';
import {
  abandonPrefix,
  advance,
  candidates,
  checkText,
  createGame,
  type Difficulty,
  ENEMY_CAP,
  ENEMY_SPEED,
  type Enemy,
  editText,
  FORTRESS_RADIUS,
  type GameState,
  stats,
  typeLetter,
} from './game';
import { chooseWord, WORDS, wordLengthRange, wordsConflict } from './words';

function enemy(id: number, word: string, distance = 10): Enemy {
  return { id, word, x: distance, z: 0, kind: 'crawler', hp: 1, maxHp: 1, speed: 0.34 };
}

function fixture(...enemies: Enemy[]): GameState {
  return { ...createGame('normal', 123, 'editable'), enemies, spawnIn: 999 };
}

function typeWord(state: GameState, word: string) {
  return [...word].flatMap((letter) => typeLetter(state, letter));
}

describe('shared-prefix typing', () => {
  it('defaults to classic typing and rejects wrong letters without changing the prefix', () => {
    const state = createGame('normal', 123);
    state.enemies = [enemy(1, 'cat'), enemy(2, 'car', 4)];
    expect(state.typingMode).toBe('classic');
    typeWord(state, 'ca');
    expect(typeLetter(state, 'z')).toEqual([{ type: 'mistake', id: 2 }]);
    expect(state.buffer).toBe('ca');
    expect(state.errors).toBe(1);
    expect(candidates(state)).toHaveLength(2);
    abandonPrefix(state);
    expect(state.buffer).toBe('');
    expect(typeWord(state, 'cat')).toEqual([expect.objectContaining({ type: 'hit', id: 1 })]);
  });

  it('narrows freely and never mistakes a mismatch against another candidate', () => {
    const state = fixture(enemy(1, 'cat'), enemy(2, 'car'));
    expect(typeWord(state, 'ca')).toEqual([]);
    expect(candidates(state).map((candidate) => candidate.id)).toEqual([1, 2]);
    expect(typeLetter(state, 'r')).toEqual([
      expect.objectContaining({ type: 'hit', id: 2, killed: true }),
    ]);
    expect(state.enemies.map((active) => active.word)).toEqual(['cat']);
    expect(state.errors).toBe(0);
    expect(state.correctLetters).toBe(3);
    expect(state.buffer).toBe('');
  });

  it('retains ca → z for editing, preserving both enemy words and counting one mistake', () => {
    const state = fixture(enemy(1, 'cat', 9), enemy(2, 'car', 4));
    state.combo = 7;
    typeWord(state, 'ca');
    const before = structuredClone(state.enemies);
    expect(typeLetter(state, 'z')).toEqual([{ type: 'mistake', id: 2 }]);
    expect(state.buffer).toBe('caz');
    expect(state.enemies).toEqual(before);
    expect(candidates(state)).toHaveLength(0);
    expect(state.errors).toBe(1);
    expect(state.correctLetters).toBe(2);
    expect(state.combo).toBe(0);
    expect(editText(state, 'ca')).toEqual([]);
    expect(candidates(state)).toHaveLength(2);
    expect(typeLetter(state, 't')).toEqual([expect.objectContaining({ type: 'hit', id: 1 })]);
  });

  it('chooses deterministic lower-id feedback at equal distance, regardless of array order', () => {
    const state = fixture(enemy(8, 'cat', 4), enemy(3, 'car', -4), enemy(1, 'ash', 2));
    typeWord(state, 'ca');
    expect(typeLetter(state, 'z')).toEqual([{ type: 'mistake', id: 3 }]);
  });

  it('shows feedback on the nearest visible enemy when no prefix is active', () => {
    const state = fixture(enemy(4, 'cat', 8), enemy(5, 'dog', 5));
    expect(typeLetter(state, 'z')).toEqual([{ type: 'mistake', id: 5 }]);
    expect(state.buffer).toBe('z');
  });

  it('abandons a prefix deliberately without a mistake or combo penalty', () => {
    const state = fixture(enemy(1, 'cat'), enemy(2, 'dog'));
    typeWord(state, 'ca');
    state.combo = 3;
    abandonPrefix(state);
    expect(state.buffer).toBe('');
    expect(state.errors).toBe(0);
    expect(state.combo).toBe(3);
    expect(typeWord(state, 'dog')).toEqual([expect.objectContaining({ id: 2, type: 'hit' })]);
  });

  it('ignores control keys and ended runs while allowing pretyping in an empty arena', () => {
    const state = fixture(enemy(1, 'cat'));
    for (const letter of ['C', 'cat', 'é', ' ', 'Backspace', '']) {
      expect(typeLetter(state, letter)).toEqual([]);
    }
    expect(state.errors).toBe(0);
    const empty = createGame('normal', 123, 'editable');
    typeLetter(empty, 'z');
    expect(empty.errors).toBe(0);
    expect(empty.buffer).toBe('z');
    state.ended = true;
    expect(typeLetter(state, 'c')).toEqual([]);
    expect(state.correctLetters).toBe(0);
  });

  it('allows f and m as ordinary letters', () => {
    const state = fixture(enemy(1, 'farm'));
    expect(typeWord(state, 'farm')).toEqual([expect.objectContaining({ type: 'hit' })]);
    expect(state.correctLetters).toBe(4);
  });
});

describe('editable field recognition', () => {
  it('deletes one character without losing the remaining prefix or charging a mistake', () => {
    const state = fixture(enemy(1, 'cat'), enemy(2, 'car'));
    typeWord(state, 'ca');
    state.combo = 4;
    expect(editText(state, 'c')).toEqual([]);
    expect(state.buffer).toBe('c');
    expect(candidates(state)).toHaveLength(2);
    expect(state.correctLetters).toBe(2);
    expect(state.errors).toBe(0);
    expect(state.combo).toBe(4);
  });

  it('recognizes a replacement in the middle of the field and counts only the new character', () => {
    const state = fixture(enemy(1, 'cat'));
    editText(state, 'cxt');
    const attempts = state.correctLetters + state.errors;
    expect(editText(state, 'cat')).toEqual([expect.objectContaining({ type: 'hit', id: 1 })]);
    expect(state.correctLetters + state.errors).toBe(attempts + 1);
    expect(state.completedWords).toBe(1);
    expect(state.buffer).toBe('');
  });

  it('fires when deleting an extra character creates an exact word, without a new attempt', () => {
    const state = fixture(enemy(1, 'cat'));
    editText(state, 'cart');
    const attempts = state.correctLetters + state.errors;
    expect(editText(state, 'cat')).toEqual([expect.objectContaining({ type: 'hit', id: 1 })]);
    expect(state.correctLetters + state.errors).toBe(attempts);
    expect(state.score).toBeGreaterThan(0);
  });

  it('matches case-insensitively but requires the entire field, including extra spaces', () => {
    const state = fixture(enemy(1, 'cat'));
    expect(editText(state, 'Ca')).toEqual([]);
    expect(state.buffer).toBe('Ca');
    expect(candidates(state)).toHaveLength(1);
    editText(state, 'CAT ');
    expect(checkText(state)).toEqual([]);
    expect(state.enemies).toHaveLength(1);
    expect(editText(state, 'CAT')).toEqual([expect.objectContaining({ type: 'hit' })]);
  });

  it('never counts an unchanged invalid field as another mistake during continuous checks', () => {
    const state = fixture(enemy(1, 'cat'));
    editText(state, 'z');
    for (let check = 0; check < 200; check++) expect(checkText(state)).toEqual([]);
    advance(state, 1);
    expect(state.errors).toBe(1);
    expect(state.correctLetters).toBe(0);
    expect(state.buffer).toBe('z');
    expect(state.score).toBe(0);
  });

  it('recognizes a pretyped field immediately when a matching monster spawns', () => {
    const probe = createGame('normal', 123);
    advance(probe, 0.4);
    const word = probe.enemies[0]?.word;
    if (!word) throw new Error('Expected the seeded first spawn');
    const state = createGame('normal', 123, 'editable');
    editText(state, word);
    expect(state.buffer).toBe(word);
    expect(state.correctLetters).toBe(word.length);
    const events = advance(state, 0.4);
    expect(events.map((event) => event.type)).toEqual(['spawn', 'hit']);
    expect(state.enemies).toHaveLength(0);
    expect(state.buffer).toBe('');
    expect(checkText(state)).toEqual([]);
    expect(state.completedWords).toBe(1);
  });

  it('defers recognition while composing but still advances the siege', () => {
    const state = fixture(enemy(1, 'cat'));
    state.buffer = 'cat';
    expect(advance(state, 0.1, false)).toEqual([]);
    expect(state.enemies[0]?.x).toBeLessThan(10);
    expect(state.score).toBe(0);
    expect(advance(state, 0.01)).toEqual([expect.objectContaining({ type: 'hit' })]);
  });

  it('checks existing field text before a matching monster can reach the gate', () => {
    const state = fixture(enemy(1, 'cat', FORTRESS_RADIUS + 0.001));
    state.buffer = 'cat';
    expect(advance(state, 0.1)).toEqual([expect.objectContaining({ type: 'hit' })]);
    expect(state.health).toBe(6);
  });

  it('does not reapply an elite hit after consuming the field', () => {
    const state = fixture({ ...enemy(1, 'cat'), kind: 'golem', hp: 2, maxHp: 2 });
    state.difficulty = 'fast-hand';
    expect(editText(state, 'cat')).toEqual([
      expect.objectContaining({ type: 'hit', killed: false }),
    ]);
    const score = state.score;
    for (let check = 0; check < 20; check++) expect(checkText(state)).toEqual([]);
    expect(state.enemies[0]?.hp).toBe(1);
    expect(state.score).toBe(score);
  });
});

describe('word selection and progression', () => {
  it('rejects duplicates and either direction of whole-word prefix conflicts', () => {
    expect(wordsConflict('ash', 'ashes')).toBe(true);
    expect(wordsConflict('ashes', 'ash')).toBe(true);
    expect(wordsConflict('ash', 'ash')).toBe(true);
    expect(wordsConflict('cat', 'car')).toBe(false);
    for (const elapsed of [0, 55, 165, 1000]) {
      const occupied = ['ash', 'ashes', 'cat', 'car', 'stone', 'storm'];
      for (let index = 0; index < 20; index++) {
        const word = chooseWord(elapsed, occupied, () => index / 20);
        expect(word).not.toBeNull();
        expect(occupied.every((active) => !wordsConflict(word ?? '', active))).toBe(true);
      }
    }
  });

  it('defers selection when a hypothetical custom active pool exhausts every word', () => {
    expect(chooseWord(0, WORDS, () => 0.5)).toBeNull();
  });

  it('uses only lowercase alphabetic English words and caps their length slowly', () => {
    expect(WORDS.every((word) => /^[a-z]+$/.test(word))).toBe(true);
    expect(wordLengthRange(0)).toEqual({ min: 3, max: 4 });
    expect(wordLengthRange(54.99)).toEqual({ min: 3, max: 4 });
    expect(wordLengthRange(55)).toEqual({ min: 3, max: 5 });
    expect(wordLengthRange(165)).toEqual({ min: 4, max: 7 });
    expect(wordLengthRange(100000)).toEqual({ min: 7, max: 11 });
  });

  it('has the same word-length schedule and movement speed in every mode', () => {
    for (const elapsed of [0, 60, 120, 200, 600]) {
      const words: string[] = [];
      for (const difficulty of ['baby', 'normal', 'fast-hand'] as const) {
        const state = createGame(difficulty, 987);
        state.elapsed = elapsed;
        state.spawnIn = 0;
        advance(state, 0.01);
        const spawned = state.enemies[0];
        expect(spawned).toBeDefined();
        if (!spawned) throw new Error('Expected a deterministic spawn');
        expect(spawned.speed).toBe(ENEMY_SPEED[spawned.kind]);
        expect(spawned.word.length).toBeGreaterThanOrEqual(wordLengthRange(elapsed).min);
        expect(spawned.word.length).toBeLessThanOrEqual(wordLengthRange(elapsed).max);
        words.push(spawned.word);
      }
      expect(new Set(words).size).toBe(1);
    }
  });
});

describe('endless siege simulation', () => {
  it('opens every new run with sustained pressure ordered by difficulty', () => {
    const counts: number[] = [];
    for (const difficulty of ['baby', 'normal', 'fast-hand'] as const) {
      const opening = (state: GameState) => {
        let spawned = 0;
        for (let second = 0; second < 10; second++) {
          spawned += advance(state, 1).filter((event) => event.type === 'spawn').length;
        }
        expect(state.health).toBe(state.maxHealth);
        return spawned;
      };
      const count = opening(createGame(difficulty, 321));
      expect(opening(createGame(difficulty, 321))).toBe(count);
      counts.push(count);
    }
    expect(counts).toEqual([4, 6, 8]);
  });

  it('spawns reproducibly around every side of the perimeter', () => {
    const state = createGame('normal', 321);
    const twin = createGame('normal', 321);
    const quadrants = new Set<string>();
    for (let tick = 0; tick < 30; tick++) {
      const events = advance(state, 1);
      expect(advance(twin, 1)).toEqual(events);
      for (const event of events) {
        if (event.type !== 'spawn') continue;
        expect(Math.hypot(event.enemy.x, event.enemy.z)).toBeGreaterThanOrEqual(12.4);
        expect(Math.hypot(event.enemy.x, event.enemy.z)).toBeLessThanOrEqual(13.5);
        quadrants.add(`${Math.sign(event.enemy.x)},${Math.sign(event.enemy.z)}`);
      }
    }
    expect(quadrants.size).toBe(4);
    expect(state).toEqual(twin);
  });

  it.each<Difficulty>(['baby', 'normal', 'fast-hand'])(
    'caps simultaneous enemies in %s',
    (difficulty) => {
      const state = createGame(difficulty, 44);
      for (let tick = 0; tick < 160; tick++) {
        advance(state, 1);
        for (const active of state.enemies) active.speed = 0;
        expect(state.enemies.length).toBeLessThanOrEqual(ENEMY_CAP[difficulty]);
      }
      expect(state.enemies).toHaveLength(ENEMY_CAP[difficulty]);
      for (const active of state.enemies) {
        expect(
          state.enemies.every(
            (other) => other === active || !wordsConflict(active.word, other.word),
          ),
        ).toBe(true);
      }
    },
  );

  it('density increases by mode while all modes retain the same starting speed', () => {
    const counts = (['baby', 'normal', 'fast-hand'] as const).map((difficulty) => {
      const state = createGame(difficulty, 12);
      for (let tick = 0; tick < 20; tick++) advance(state, 1);
      return state.enemies.length;
    });
    expect(counts[0]).toBeLessThan(counts[1] ?? 0);
    expect(counts[1]).toBeLessThan(counts[2] ?? 0);
  });

  it('damages once on arrival, retaining a shared prefix for surviving candidates', () => {
    const state = fixture(enemy(1, 'cat', FORTRESS_RADIUS + 0.001), enemy(2, 'car', 8));
    typeWord(state, 'ca');
    expect(advance(state, 0.1)).toEqual([expect.objectContaining({ type: 'damage' })]);
    expect(state.health).toBe(5);
    expect(state.buffer).toBe('ca');
    expect(state.enemies.map((active) => active.id)).toEqual([2]);
    advance(state, 0.1);
    expect(state.health).toBe(5);
    typeLetter(state, 'r');
    expect(state.completedWords).toBe(1);
  });

  it('keeps editable text when the sole matching target arrives', () => {
    const state = fixture(enemy(1, 'cat', FORTRESS_RADIUS), enemy(2, 'dog', 8));
    typeWord(state, 'ca');
    advance(state, 0.1);
    expect(state.buffer).toBe('ca');
    expect(state.errors).toBe(0);
  });

  it('completion before the simulation tick removes the threat before gate collision', () => {
    const state = fixture(enemy(1, 'cat', FORTRESS_RADIUS + 0.001));
    typeWord(state, 'cat');
    expect(advance(state, 0.1)).toEqual([]);
    expect(state.health).toBe(6);
  });

  it('ends once at zero health and freezes all later movement, scoring, and time', () => {
    const state = fixture(enemy(1, 'cat', FORTRESS_RADIUS), enemy(2, 'car', FORTRESS_RADIUS));
    state.health = 1;
    const events = advance(state, 0.1);
    expect(events.map((event) => event.type)).toEqual(['damage', 'end']);
    expect(state.health).toBe(0);
    expect(state.ended).toBe(true);
    const ended = structuredClone(state);
    expect(advance(state, 1)).toEqual([]);
    expect(typeWord(state, 'car')).toEqual([]);
    expect(state).toEqual(ended);
  });

  it('continues time-based waves forever and awards no points for waiting', () => {
    const state = fixture();
    state.elapsed = 34.95;
    expect(advance(state, 0.1)).toEqual([{ type: 'wave', wave: 2 }]);
    state.elapsed = 34999.95;
    expect(advance(state, 0.1)).toEqual([{ type: 'wave', wave: 1001 }]);
    expect(state.score).toBe(0);
    expect(state.ended).toBe(false);
  });

  it('ignores invalid deltas and prevents large background-frame catchup', () => {
    const state = fixture(enemy(1, 'cat'));
    for (const dt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
      expect(advance(state, dt)).toEqual([]);
    expect(state.elapsed).toBe(0);
    advance(state, 1000);
    expect(state.elapsed).toBeCloseTo(1);
    expect(state.enemies[0]?.x).toBeCloseTo(10 - ENEMY_SPEED.crawler);
  });
});

describe('elites, points, and statistics', () => {
  it('only Fast Hand spawns multi-word golems', () => {
    for (const difficulty of ['baby', 'normal', 'fast-hand'] as const) {
      const state = createGame(difficulty, 14);
      state.elapsed = 900;
      let found = false;
      for (let attempt = 0; attempt < 30; attempt++) {
        state.enemies = [];
        state.spawnIn = 0;
        advance(state, 0.01);
        const spawned = state.enemies[0];
        if (spawned?.kind !== 'golem') continue;
        found = true;
        expect(spawned.hp).toBe(difficulty === 'fast-hand' ? 3 : 1);
      }
      expect(found).toBe(true);
    }
  });

  it('reveals a fresh unambiguous word after an elite hit, then awards its defeat bonus only at death', () => {
    const golem = { ...enemy(1, 'cat'), kind: 'golem' as const, hp: 2, maxHp: 2 };
    const state = fixture(golem, enemy(2, 'car'), enemy(3, 'ash'));
    state.difficulty = 'fast-hand';
    const first = typeWord(state, 'cat');
    expect(first).toEqual([
      expect.objectContaining({ type: 'hit', id: 1, killed: false, points: 30 }),
    ]);
    expect(golem.hp).toBe(1);
    expect(golem.word).not.toBe('cat');
    expect(wordsConflict(golem.word, 'car')).toBe(false);
    expect(wordsConflict(golem.word, 'ash')).toBe(false);
    expect(state.buffer).toBe('');
    const nextLength = golem.word.length;
    expect(typeWord(state, golem.word)).toEqual([
      expect.objectContaining({
        type: 'hit',
        id: 1,
        killed: true,
        points: Math.round((nextLength * 10 + 75) * 1.05),
      }),
    ]);
    expect(state.completedWords).toBe(2);
    expect(state.enemies.some((active) => active.id === 1)).toBe(false);
  });

  it('caps combo multipliers, preserves earned score on mistakes, and tracks the best combo', () => {
    const state = fixture();
    let priorGain = 0;
    for (let count = 0; count < 30; count++) {
      state.enemies = [enemy(count + 1, 'cat')];
      const priorScore = state.score;
      typeWord(state, 'cat');
      const gain = state.score - priorScore;
      if (count >= 21) expect(gain).toBe(priorGain);
      priorGain = gain;
    }
    expect(state.bestCombo).toBe(30);
    expect(priorGain).toBe(110);
    const score = state.score;
    state.enemies = [enemy(99, 'cat')];
    typeLetter(state, 'z');
    expect(state.score).toBe(score);
    expect(state.combo).toBe(0);
    expect(state.bestCombo).toBe(30);
  });

  it('defines WPM using accepted keystrokes and accuracy with each rejection counted once', () => {
    const state = fixture(enemy(1, 'cat'), enemy(2, 'car'));
    state.elapsed = 30;
    typeWord(state, 'ca');
    typeLetter(state, 'z');
    editText(state, 'ca');
    typeLetter(state, 't');
    expect(stats(state)).toEqual({ wpm: 1, accuracy: 75 });
    state.correctLetters = 125;
    state.errors = 25;
    state.elapsed = 60;
    expect(stats(state)).toEqual({ wpm: 25, accuracy: 83 });
    // No advance calls while paused: wall-clock time has no role in either statistic.
    const before = stats(state);
    expect(stats(state)).toEqual(before);
    expect(stats(createGame('baby'))).toEqual({ wpm: 0, accuracy: 100 });
  });
});
