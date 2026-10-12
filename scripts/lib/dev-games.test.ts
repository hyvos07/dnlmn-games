import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { type Connect, createServer } from 'vite';
import { expect, it } from 'vitest';
import { devGames } from './dev-games.ts';

it('serves two isolated games and their HMR sockets on the launcher listener', async () => {
  const gamesDir = await mkdtemp(join(tmpdir(), 'dev-games-'));
  const configModule = pathToFileURL(resolve('packages/config/src/vite.ts')).href;
  const sockets: WebSocket[] = [];
  const launcher = await createServer({
    configFile: false,
    root: gamesDir,
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    plugins: [
      devGames(gamesDir),
      {
        name: 'test:launcher',
        configureServer(server) {
          return () => {
            // Astro installs this page guard ahead of ordinary Vite middleware.
            const trailingSlashGuard: Connect.NextHandleFunction = (req, res, next) => {
              const pathname = req.url?.split('?')[0] ?? '/';
              if (!pathname.endsWith('/') && !pathname.split('/').at(-1)?.includes('.')) {
                res.statusCode = 404;
                res.end('page requires a trailing slash');
              } else {
                next();
              }
            };
            server.middlewares.stack.unshift({ route: '', handle: trailingSlashGuard });
            server.middlewares.use((req, res) => {
              res.statusCode = req.url === '/' ? 200 : 404;
              res.end('launcher');
            });
          };
        },
      },
    ],
  });
  try {
    // Draft fixtures exercise automatic discovery without depending on published games.
    for (const slug of ['first-game', 'second-game']) {
      const dir = join(gamesDir, slug);
      await mkdir(dir);
      await writeFile(join(dir, 'package.json'), '{"type":"module"}');
      await writeFile(
        join(dir, 'game.json'),
        JSON.stringify({
          slug,
          title: slug,
          tagline: 'Test game',
          engine: 'vanilla',
          tags: ['arcade'],
          input: ['keyboard'],
          status: 'draft',
          addedAt: '2026-10-11',
        }),
      );
      await writeFile(
        join(dir, 'vite.config.ts'),
        `import { defineGameConfig } from ${JSON.stringify(configModule)};
export default defineGameConfig(import.meta.dirname, { logLevel: 'silent' });`,
      );
      await writeFile(
        join(dir, 'index.html'),
        `<title>${slug}</title><script type="module" src="/main.js"></script>`,
      );
      await writeFile(
        join(dir, 'main.js'),
        `export const game = '${slug}';
if (import.meta.hot) import.meta.hot.accept();`,
      );
    }
    // configureServer runs during createServer, so discover fixtures on restart.
    await launcher.restart();
    const address = launcher.httpServer?.address();
    if (!address || typeof address === 'string') throw new Error('Missing listener');
    const origin = `http://127.0.0.1:${address.port}`;
    expect(await (await fetch(`${origin}/`)).text()).toBe('launcher');
    expect((await fetch(`${origin}/first-games/`)).status).toBe(404);

    for (const slug of ['first-game', 'second-game']) {
      const redirect = await fetch(`${origin}/${slug}`, { redirect: 'manual' });
      expect(redirect.status).toBe(302);
      expect(redirect.headers.get('location')).toBe(`/${slug}/`);
      const entry = await fetch(`${origin}/${slug}/`);
      expect(entry.status).toBe(200);
      expect(await entry.text()).toContain(`/${slug}/@vite/client`);
      const client = await fetch(`${origin}/${slug}/@vite/client`, {
        headers: { 'sec-fetch-dest': 'script' },
      });
      expect(client.status).toBe(200);
      const token = /const wsToken = "([^"]+)"/.exec(await client.text())?.[1];
      expect(token).toBeTruthy();
      const socket = new WebSocket(
        `${origin.replace('http:', 'ws:')}/${slug}/?token=${token}`,
        'vite-hmr',
      );
      sockets.push(socket);
      const connected = new Promise<string>((resolve, reject) => {
        socket.addEventListener('message', (event) => resolve(String(event.data)), { once: true });
        socket.addEventListener('error', reject, { once: true });
      });
      expect(JSON.parse(await connected).type).toBe('connected');
      const module = await fetch(`${origin}/${slug}/main.js`);
      expect(await module.text()).toContain(slug);
      const updated = new Promise<string>((resolve) => {
        socket.addEventListener('message', (event) => resolve(String(event.data)), { once: true });
      });
      await writeFile(
        join(gamesDir, slug, 'main.js'),
        `export const game = '${slug}-edited';
if (import.meta.hot) import.meta.hot.accept();`,
      );
      expect(JSON.parse(await updated).type).toBe('update');
    }
  } finally {
    for (const socket of sockets) socket.close();
    await launcher.close();
    await rm(gamesDir, { recursive: true, force: true });
  }
}, 20_000);
