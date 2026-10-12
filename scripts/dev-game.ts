/** `pnpm dev:game <slug>`: start one game at http://localhost:4321/<slug>/. */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SLUG_PATTERN } from '@games/config/manifest';

const slug = process.argv[2];
if (!slug || !SLUG_PATTERN.test(slug)) {
  console.error('usage: pnpm dev:game <slug>');
  process.exit(1);
}
if (!existsSync(join(import.meta.dirname, '..', 'games', slug, 'game.json'))) {
  console.error(`no game at games/${slug}/`);
  process.exit(1);
}

const child = spawn('pnpm', ['--filter', `@games/game-${slug}`, 'dev'], {
  stdio: 'inherit',
  // pnpm is a .cmd shim on Windows. The slug is validated above, so the shell is safe.
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
