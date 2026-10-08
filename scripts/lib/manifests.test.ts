import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadGames } from './manifests.ts';

const dirs: string[] = [];

function makeGamesDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'games-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'snake',
    title: 'Snake',
    tagline: 'Classic snake',
    engine: 'vanilla',
    tags: ['arcade'],
    input: ['keyboard'],
    status: 'published',
    addedAt: '2026-10-08',
    ...overrides,
  };
}

interface GameOpts {
  json?: string;
  files?: string[];
}

function addGame(root: string, folder: string, data: unknown, opts: GameOpts = {}): void {
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'game.json'), opts.json ?? JSON.stringify(data));
  for (const file of opts.files ?? []) writeFileSync(join(dir, file), 'x');
}

const ALL_FILES = ['README.md', 'CREDITS.md', 'thumbnail.png'];

describe('loadGames', () => {
  it('loads a valid published game with no errors', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest(), { files: ALL_FILES });
    const { games, errors } = loadGames(root);
    expect(errors).toEqual([]);
    expect(games).toHaveLength(1);
    expect(games[0]?.slug).toBe('snake');
    expect(games[0]?.dir).toBe(join(root, 'snake'));
    expect(games[0]?.manifest.orientation).toBe('any');
  });

  it('reports a missing game.json', () => {
    const root = makeGamesDir();
    mkdirSync(join(root, 'empty'));
    const { games, errors } = loadGames(root);
    expect(games).toEqual([]);
    expect(errors).toEqual(['games/empty/game.json: missing']);
  });

  it('reports invalid JSON', () => {
    const root = makeGamesDir();
    addGame(root, 'broken', null, { json: '{ nope' });
    const { games, errors } = loadGames(root);
    expect(games).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^games\/broken\/game\.json: invalid JSON \(/);
  });

  it('prefixes schema errors with the file path', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest({ tags: [], tagline: '' }), { files: ALL_FILES });
    const { games, errors } = loadGames(root);
    expect(games).toEqual([]);
    expect(errors.length).toBeGreaterThanOrEqual(2);
    for (const e of errors) expect(e.startsWith('games/snake/game.json: ')).toBe(true);
    expect(errors.some((e) => e.includes('tags:'))).toBe(true);
  });

  it('rejects slug not matching the folder name', () => {
    const root = makeGamesDir();
    addGame(root, 'other', manifest(), { files: ALL_FILES });
    const { games, errors } = loadGames(root);
    expect(games).toEqual([]);
    expect(errors).toEqual(['games/other/game.json: slug mismatch ("snake" != folder "other")']);
  });

  it('rejects godot by default and allows it with allowGodot', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest({ engine: 'godot' }), { files: ALL_FILES });
    const denied = loadGames(root);
    expect(denied.games).toEqual([]);
    expect(denied.errors).toHaveLength(1);
    expect(denied.errors[0]).toContain('godot');

    const allowed = loadGames(root, { allowGodot: true });
    expect(allowed.errors).toEqual([]);
    expect(allowed.games).toHaveLength(1);
  });

  it('reports missing files for a published game', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest());
    const { games, errors } = loadGames(root);
    expect(games).toHaveLength(1);
    expect(errors).toHaveLength(3);
    const joined = errors.join('\n');
    expect(joined).toContain('missing README.md');
    expect(joined).toContain('missing CREDITS.md');
    expect(joined).toContain('missing thumbnail.png');
  });

  it('checks the custom thumbnail path for hidden games', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest({ status: 'hidden', thumbnail: 'cover.webp' }), {
      files: ALL_FILES,
    });
    const { errors } = loadGames(root);
    expect(errors).toEqual(['games/snake: missing cover.webp (required for non-draft games)']);
  });

  it('does not report missing files for a draft game', () => {
    const root = makeGamesDir();
    addGame(root, 'snake', manifest({ status: 'draft' }));
    const { games, errors } = loadGames(root);
    expect(errors).toEqual([]);
    expect(games).toHaveLength(1);
  });

  it('ignores dot-folders and plain files', () => {
    const root = makeGamesDir();
    mkdirSync(join(root, '.hidden'));
    writeFileSync(join(root, 'notes.txt'), 'hi');
    writeFileSync(join(root, 'game.json'), '{}');
    expect(loadGames(root)).toEqual({ games: [], errors: [] });
  });

  it('returns empty results for a non-existent directory', () => {
    const root = makeGamesDir();
    expect(loadGames(join(root, 'nope'))).toEqual({ games: [], errors: [] });
  });

  it('returns games sorted by folder name', () => {
    const root = makeGamesDir();
    for (const slug of ['zeta', 'alpha', 'mid']) {
      addGame(root, slug, manifest({ slug, status: 'draft' }));
    }
    expect(loadGames(root).games.map((g) => g.slug)).toEqual(['alpha', 'mid', 'zeta']);
  });
});
