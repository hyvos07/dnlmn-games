import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type Connect, createServer, type Plugin, type ViteDevServer } from 'vite';
import { type GameEntry, loadGames } from './manifests.ts';

/** Mount independent game pipelines on Astro's HTTP server, including their HMR sockets. */
export function devGames(gamesDir: string): Plugin {
  const cleanups = new WeakMap<object, () => Promise<void>>();

  return {
    name: 'games:dev',
    enforce: 'post',
    apply: 'serve',
    async configureServer(launcher) {
      if (!launcher.httpServer) throw new Error('Game dev requires an HTTP server');
      const { games, errors } = loadGames(gamesDir);
      if (errors.length) throw new Error(errors.join('\n'));
      const servers = new Map<string, Promise<ViteDevServer>>();
      let closed = false;
      const mount = (game: GameEntry): Promise<ViteDevServer> => {
        const existing = servers.get(game.slug);
        if (existing) return existing;
        const pending = createServer({
          configFile: join(game.dir, 'vite.config.ts'),
          server: {
            middlewareMode: true,
            ws: { server: launcher.httpServer ?? undefined },
          },
        }).catch((error: unknown) => {
          servers.delete(game.slug);
          throw error;
        });
        // Concurrent document/module requests must share one game server and HMR socket.
        servers.set(game.slug, pending);
        return pending;
      };
      let closing: Promise<void> | undefined;
      const close = (): Promise<void> => {
        closed = true;
        closing ??= Promise.allSettled(servers.values()).then(async (settled) => {
          servers.clear();
          await Promise.all(
            settled.map((result) =>
              result.status === 'fulfilled' ? result.value.close() : undefined,
            ),
          );
        });
        return closing;
      };
      // Restarts can create the replacement server before closing the old one.
      for (const environment of Object.values(launcher.environments)) {
        cleanups.set(environment, close);
      }

      try {
        for (const game of games) await mount(game);
      } catch (error) {
        await close();
        throw error;
      }

      const handle: Connect.NextHandleFunction = (req, res, next) => {
        const pathname = req.url?.split('?')[0] ?? '/';
        const slug = /^\/([a-z][a-z0-9-]{1,30})(?:\/|$)/.exec(pathname)?.[1];
        if (closed || !slug) return next();
        let pending = servers.get(slug);
        if (!pending) {
          // Manifests can appear after `pnpm dev` starts. Astro may already list the
          // card, so discover its pipeline before letting Astro treat it as a page.
          const dir = join(gamesDir, slug);
          if (!existsSync(join(dir, 'game.json')) || !existsSync(join(dir, 'vite.config.ts'))) {
            return next();
          }
          const discovered = loadGames(gamesDir);
          if (discovered.errors.length) return next(new Error(discovered.errors.join('\n')));
          const game = discovered.games.find((entry) => entry.slug === slug);
          if (!game) return next();
          pending = mount(game);
        }
        void pending
          .then((server) => {
            // Keep the full URL: Vite handles the game's base prefix itself.
            if (pathname === `/${slug}`) {
              res.writeHead(302, { location: req.url?.replace(pathname, `${pathname}/`) ?? '/' });
              res.end();
            } else {
              server.middlewares(req, res, next);
            }
          })
          .catch(next);
      };
      // Astro prepends its trailing-slash guard in a configureServer post hook.
      // Put games first: /snake/@vite/client is a Vite module, not an Astro page.
      return () => {
        launcher.middlewares.stack.unshift({ route: '', handle });
      };
    },
    async closeBundle() {
      await cleanups.get(this.environment)?.();
    },
  };
}
