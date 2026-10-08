/** Validate every games/<slug>/game.json without building anything. Used by `pnpm check`. */
import { join } from 'node:path';
import { loadGames } from './lib/manifests.ts';

const { games, errors } = loadGames(join(import.meta.dirname, '..', 'games'));

if (errors.length > 0) {
  console.error(`✖ ${errors.length} manifest problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(
  `✔ ${games.length} manifest(s) valid${games.length ? `: ${games.map((g) => g.slug).join(', ')}` : ''}`,
);
