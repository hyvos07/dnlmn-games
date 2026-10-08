/**
 * `pnpm dev`: the whole site with hot reload on one origin.
 *
 * Starts every game's Vite dev server on its own port (5201, 5202, …) and the Astro
 * launcher on :4322, then serves both on http://localhost:4321 through a tiny proxy
 * (scripts/lib/dev-proxy.ts) that routes /<slug>/ and its HMR websocket to the game.
 * Edits to the launcher, any game, or packages/* reload live. Drafts are included,
 * since you're probably working on them.
 */
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { createDevProxy } from './lib/dev-proxy.ts';
import { loadGames } from './lib/manifests.ts';

const SITE_PORT = 4321;
const LAUNCHER_PORT = 4322;
const FIRST_GAME_PORT = 5201;
const root = join(import.meta.dirname, '..');
const { games, errors } = loadGames(join(root, 'games'));
for (const error of errors) console.warn(`! ${error}`);

const ports: Record<string, number> = {};
games.forEach((game, i) => {
  ports[game.slug] = FIRST_GAME_PORT + i;
});

const children: ChildProcess[] = [];
// pnpm is a .cmd shim on Windows. Slugs are validated by loadGames, so the shell is safe.
const run = (args: string[]) => {
  const child = spawn('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`\n✖ "pnpm ${args.join(' ')}" exited (${code}); stopping dev.`);
      stop(code ?? 1);
    }
  });
};

for (const [slug, port] of Object.entries(ports)) {
  run(['--filter', `@games/game-${slug}`, 'exec', 'vite', '--port', String(port), '--strictPort']);
}
run(['--filter', '@games/launcher', 'dev', '--port', String(LAUNCHER_PORT)]);

const proxy = createDevProxy(ports, LAUNCHER_PORT);
proxy.on('error', (error) => {
  console.error(`\n✖ can't listen on :${SITE_PORT} (${error.message}). Is pnpm preview running?`);
  stop(1);
});
// Same address as `pnpm preview` (wrangler), so running both is a clear error, not a silent clash.
proxy.listen(SITE_PORT, '127.0.0.1');

console.log(`\n  Site with hot reload: http://127.0.0.1:${SITE_PORT}/`);
for (const slug of Object.keys(ports))
  console.log(`    /${slug}/ → game dev server :${ports[slug]}`);
console.log('');

let stopping = false;
function stop(code = 0): void {
  if (stopping) return;
  stopping = true;
  proxy.close();
  for (const child of children) {
    if (child.pid === undefined || child.exitCode !== null) continue;
    // On Windows, killing the shell leaves Vite/Astro running; kill the whole tree.
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  process.exit(code);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
