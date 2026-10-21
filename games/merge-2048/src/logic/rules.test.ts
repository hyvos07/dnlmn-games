import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { type Direction, GameManager, readSave, type SavedGame } from './rules.ts';

function state(rows: number[][], score = 0): SavedGame {
  return {
    grid: {
      size: 4,
      cells: Array.from({ length: 4 }, (_, x) =>
        Array.from({ length: 4 }, (_, y) =>
          rows[y]?.[x] ? { position: { x, y }, value: rows[y]?.[x] as number } : null,
        ),
      ),
    },
    score,
    over: false,
    won: false,
    keepPlaying: false,
  };
}

const rows = (game: GameManager) =>
  Array.from({ length: 4 }, (_, y) =>
    Array.from({ length: 4 }, (_, x) => game.grid.cellContent({ x, y })?.value ?? 0),
  );
const random = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('original 2048 mechanics', () => {
  it('starts with two distinct tiles and uses the original 90/10 boundary', () => {
    const draws = [0.899999, 0, 0.9, 0];
    const game = new GameManager(() => draws.shift() ?? 0);
    expect(game.grid.cellContent({ x: 0, y: 0 })?.value).toBe(2);
    expect(game.grid.cellContent({ x: 0, y: 1 })?.value).toBe(4);
    expect(game.grid.availableCells()).toHaveLength(14);
  });

  it.each([
    [[2, 2, 2, 2], [4, 4, 0, 0], 8],
    [[2, 2, 4, 0], [4, 4, 0, 0], 4],
    [[4, 4, 8, 8], [8, 16, 0, 0], 24],
    [[2, 0, 2, 2], [4, 2, 0, 0], 4],
    [[4, 2, 2, 4], [4, 4, 4, 0], 4],
  ])('merges %j once per tile into %j', (row, expected, score) => {
    const game = new GameManager(() => 0.999, state([row as number[]]));
    game.move(3);
    expect(rows(game)[0]).toEqual(expected);
    expect(game.score).toBe(score);
    // The spawn uses the last available cell, away from the row under test.
    expect(rows(game)[3]?.[3]).toBe(4);
  });

  it('does not spawn, score, or consume randomness on an invalid move', () => {
    let calls = 0;
    const game = new GameManager(
      () => {
        calls++;
        return 0;
      },
      state([[2, 4, 8, 16]]),
    );
    const before = game.serialize();
    expect(game.move(3)).toBe(false);
    expect(game.serialize()).toEqual(before);
    expect(calls).toBe(0);
  });

  it('stops at 2048, preserves the winning save and permits continuing past 2048', () => {
    const game = new GameManager(() => 0, state([[1024, 1024, 2048, 0]]));
    game.move(3);
    expect(game.won).toBe(true);
    expect(game.score).toBe(2048);
    expect(game.isGameTerminated()).toBe(true);
    expect(game.move(3)).toBe(false);
    const saved = readSave(game.serialize());
    expect(saved).toBeDefined();
    const resumed = new GameManager(() => 0, saved);
    resumed.continue();
    expect(resumed.move(3)).toBe(true);
    expect(resumed.grid.cellContent({ x: 0, y: 0 })?.value).toBe(4096);
    expect(resumed.score).toBe(6144);
    expect(resumed.isGameTerminated()).toBe(false);
  });

  it('detects a full dead board, but allows horizontal and vertical matches', () => {
    const dead = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    expect(new GameManager(Math.random, state(dead)).movesAvailable()).toBe(false);
    dead[0] = [2, 2, 4, 2];
    expect(new GameManager(Math.random, state(dead)).movesAvailable()).toBe(true);
    dead[0] = [4, 8, 2, 4];
    expect(new GameManager(Math.random, state(dead)).movesAvailable()).toBe(true);
  });

  it('marks game over after the last legal move and spawn', () => {
    const game = new GameManager(
      () => 0,
      state([
        [2, 4, 8, 16],
        [4, 8, 16, 32],
        [8, 16, 32, 64],
        [0, 2, 4, 8],
      ]),
    );
    expect(game.move(3)).toBe(true);
    expect(game.over).toBe(true);
    expect(game.move(1)).toBe(false);
  });
});

describe('save validation', () => {
  it('round trips an active game without sharing mutable cells', () => {
    const game = new GameManager(random(12));
    game.move(2);
    const saved = readSave(game.serialize());
    expect(saved).toEqual(game.serialize());
    expect(new GameManager(random(3), saved).serialize()).toEqual(game.serialize());
    expect(saved?.grid.cells).not.toBe(game.grid.cells);
  });
  it.each([
    null,
    {},
    { grid: { size: 5, cells: [] } },
    { ...state([[2, 2]]), score: -1 },
    state([[3, 2]]),
    state([[2]]),
    { ...state([[2, 2]]), keepPlaying: true },
    { ...state([[2, 2]]), won: 'yes' },
  ])('rejects damaged save %j', (value) => {
    expect(readSave(value)).toBeUndefined();
  });
});

interface UpstreamGame {
  move(direction: Direction): void;
  serialize(): SavedGame;
  keepPlaying: boolean;
  won: boolean;
}

// These are the actual upstream files, pinned by fixtures/REVISION.txt, not a second
// reimplementation. Stubs replace only browser input, rendering and persistence.
const source = ['tile', 'grid', 'game_manager']
  .map((name) => readFileSync(new URL(`./fixtures/${name}.js.txt`, import.meta.url), 'utf8'))
  .join('\n');
const math: Math = Object.create(Math);
const Reference = runInNewContext(`${source}\nGameManager;`, { Math: math }) as new (
  size: number,
  input: typeof Input,
  actuator: typeof Actuator,
  storage: new () => Storage,
) => UpstreamGame;
class Input {
  on(): void {}
}
class Actuator {
  actuate(): void {}
  continueGame(): void {}
}
class Storage {
  constructor(private readonly saved?: SavedGame) {}
  getGameState(): SavedGame | undefined {
    return this.saved;
  }
  getBestScore(): number {
    return 0;
  }
  setBestScore(): void {}
  setGameState(): void {}
  clearGameState(): void {}
}

describe('parity with gabrielecirulli/2048', () => {
  it('matches every four-cell row over five tile values, in all four directions', () => {
    const values = [0, 2, 4, 8, 16];
    for (let pattern = 0; pattern < 625; pattern++) {
      const row = Array.from(
        { length: 4 },
        (_, i) => values[Math.floor(pattern / 5 ** i) % 5] ?? 0,
      );
      for (const direction of [0, 1, 2, 3] as const) {
        const previous = state([row, [4, 8, 16, 32], [2, 4, 8, 16], [0, 0, 0, 0]]);
        math.random = random(pattern + 1);
        class SavedStorage extends Storage {
          constructor() {
            super(structuredClone(previous));
          }
        }
        const original = new Reference(4, Input, Actuator, SavedStorage);
        const port = new GameManager(random(pattern + 1), previous);
        original.move(direction);
        port.move(direction);
        expect(port.serialize(), `pattern ${row}, direction ${direction}`).toEqual(
          original.serialize(),
        );
      }
    }
  });

  it('matches 6,000 seeded sequential moves, including game over and continued play', () => {
    for (let seed = 1; seed <= 30; seed++) {
      math.random = random(seed);
      const original = new Reference(4, Input, Actuator, Storage);
      const port = new GameManager(random(seed));
      const directionRandom = random(seed * 71);
      for (let turn = 0; turn < 200; turn++) {
        const direction = Math.floor(directionRandom() * 4) as Direction;
        original.move(direction);
        port.move(direction);
        expect(port.serialize(), `seed ${seed}, turn ${turn}`).toEqual(original.serialize());
        if (original.won) {
          original.keepPlaying = true;
          port.continue();
        }
      }
    }
  });
});
