import { join } from 'node:path';
import { type Connect, createServer, type Plugin, type ViteDevServer } from 'vite';
import { loadGames } from './manifests.ts';

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
      let servers: ViteDevServer[] = [];
      const routes: { route: string; handle: Connect.NextHandleFunction }[] = [];
      const close = async () => {
        const closing = servers;
        servers = [];
        await Promise.all(closing.map((server) => server.close()));
      };
      // Restarts can create the replacement server before closing the old one.
      for (const environment of Object.values(launcher.environments)) {
        cleanups.set(environment, close);
      }

      try {
        for (const game of games) {
          const server = await createServer({
            configFile: join(game.dir, 'vite.config.ts'),
            server: {
              middlewareMode: true,
              ws: { server: launcher.httpServer },
            },
          });
          servers.push(server);
          // Keep the full URL: Vite handles the game's base prefix itself.
          const handle: Connect.NextHandleFunction = (req, res, next) => {
            const pathname = req.url?.split('?')[0];
            if (pathname === `/${game.slug}`) {
              res.writeHead(302, { location: req.url?.replace(pathname, `${pathname}/`) ?? '/' });
              res.end();
            } else if (pathname?.startsWith(`/${game.slug}/`)) {
              server.middlewares(req, res, next);
            } else {
              next();
            }
          };
          routes.push({ route: '', handle });
        }
      } catch (error) {
        await close();
        throw error;
      }
      // Astro prepends its trailing-slash guard in a configureServer post hook.
      // Run after that hook and put games first: /snake/@vite/client has no file
      // extension or trailing slash, but is a Vite module, not an Astro page.
      return () => {
        launcher.middlewares.stack.unshift(...routes);
      };
    },
    async closeBundle() {
      await cleanups.get(this.environment)?.();
    },
  };
}
