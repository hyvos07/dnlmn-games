import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { manifestSchema } from '@games/config/manifest';
import { describe, expect, it } from 'vitest';
import { fillPlaceholders } from './scaffold.ts';

const TEMPLATES = join(import.meta.dirname, '..', '..', 'packages', 'templates');
const VARS = { SLUG: 'sample-game', TITLE: 'Sample Game', DATE: '2026-10-08' };
const names = readdirSync(TEMPLATES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const read = (name: string, file: string) => readFileSync(join(TEMPLATES, name, file), 'utf8');

describe('templates', () => {
  it('finds the vanilla and kaplay templates', () => {
    expect(names).toEqual(expect.arrayContaining(['vanilla', 'kaplay']));
  });

  describe.each(names)('%s', (name) => {
    it('has the files every game ships', () => {
      for (const file of [
        'game.json',
        'index.html',
        'package.json',
        'vite.config.ts',
        'tsconfig.json',
        'vitest.config.ts',
        'README.md',
        'CREDITS.md',
        'src/main.ts',
      ]) {
        expect(existsSync(join(TEMPLATES, name, file)), `${name}/${file}`).toBe(true);
      }
    });

    it('fills in to a manifest the schema accepts, for its own engine', () => {
      const filled = JSON.parse(fillPlaceholders(read(name, 'game.json'), VARS));
      const result = manifestSchema.safeParse(filled);
      expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
      expect(filled.engine).toBe(name);
      expect(filled.status).toBe('draft');
    });

    it('leaves no placeholder unfilled', () => {
      for (const file of ['game.json', 'index.html', 'package.json', 'README.md', 'CREDITS.md']) {
        expect(fillPlaceholders(read(name, file), VARS), `${name}/${file}`).not.toMatch(
          /__[A-Z]+__/,
        );
      }
    });

    it('names its package after the slug, so the workspace picks it up', () => {
      const pkg = JSON.parse(fillPlaceholders(read(name, 'package.json'), VARS));
      expect(pkg.name).toBe('@games/game-sample-game');
      expect(pkg.dependencies['@games/sdk']).toBe('workspace:*');
    });
  });

  it('kaplay pins its engine to an exact version', () => {
    const pkg = JSON.parse(read('kaplay', 'package.json'));
    expect(pkg.dependencies.kaplay).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
