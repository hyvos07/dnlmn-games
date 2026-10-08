import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatIssues, type GameManifest, manifestSchema } from '@games/config/manifest';

export interface GameEntry {
  slug: string;
  dir: string;
  manifest: GameManifest;
}

export interface LoadResult {
  games: GameEntry[];
  errors: string[];
}

export interface LoadOptions {
  /** Godot games are rejected until the Phase 6 track is enabled (ADR-006). */
  allowGodot?: boolean;
}

/** Files every non-draft game must ship (RULES §6). The thumbnail is checked separately. */
export const REQUIRED_FILES = ['README.md', 'CREDITS.md'] as const;

/**
 * Load and validate every `games/<folder>/game.json`.
 * Never throws for bad manifests; every problem is collected into `errors`.
 */
export function loadGames(gamesDir: string, options: LoadOptions = {}): LoadResult {
  const games: GameEntry[] = [];
  const errors: string[] = [];
  if (!existsSync(gamesDir)) return { games, errors };

  const folders = readdirSync(gamesDir)
    .filter((name) => !name.startsWith('.') && statSync(join(gamesDir, name)).isDirectory())
    .sort();
  const seen = new Map<string, string>();

  for (const folder of folders) {
    const dir = join(gamesDir, folder);
    const file = join(dir, 'game.json');
    const where = `games/${folder}/game.json`;

    if (!existsSync(file)) {
      errors.push(`${where}: missing`);
      continue;
    }

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      errors.push(`${where}: invalid JSON (${(error as Error).message})`);
      continue;
    }

    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
      for (const issue of formatIssues(parsed.error)) errors.push(`${where}: ${issue}`);
      continue;
    }
    const manifest = parsed.data;

    if (manifest.slug !== folder) {
      errors.push(`${where}: slug mismatch ("${manifest.slug}" != folder "${folder}")`);
      continue;
    }
    const previous = seen.get(manifest.slug);
    if (previous) {
      errors.push(`${where}: duplicate slug "${manifest.slug}" (also in ${previous})`);
      continue;
    }
    seen.set(manifest.slug, where);

    if (manifest.engine === 'godot' && !options.allowGodot) {
      errors.push(`${where}: engine "godot" is not enabled until Phase 6 (ADR-006)`);
      continue;
    }

    if (manifest.status !== 'draft') {
      for (const required of [...REQUIRED_FILES, manifest.thumbnail]) {
        if (!existsSync(join(dir, required))) {
          errors.push(`games/${folder}: missing ${required} (required for non-draft games)`);
        }
      }
    }

    games.push({ slug: manifest.slug, dir, manifest });
  }

  return { games, errors };
}
