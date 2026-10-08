import { createServer, request, type Server } from 'node:http';
import { connect } from 'node:net';

/** Upstream port for a request path: the game's dev server for /<slug>/…, else the launcher. */
export function routePort(
  url: string,
  gamePorts: Readonly<Record<string, number>>,
  launcherPort: number,
): number {
  const slug = /^\/([^/?#]+)/.exec(url)?.[1];
  return (slug && gamePorts[slug]) || launcherPort;
}

/**
 * A minimal reverse proxy (HTTP + websocket upgrades) so the launcher and every game's
 * Vite dev server share one origin, the way they do in production. No dependencies.
 */
export function createDevProxy(
  gamePorts: Readonly<Record<string, number>>,
  launcherPort: number,
): Server {
  const server = createServer((req, res) => {
    const port = routePort(req.url ?? '/', gamePorts, launcherPort);
    const upstream = request(
      { host: 'localhost', port, path: req.url, method: req.method, headers: req.headers },
      (response) => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.pipe(res);
      },
    );
    upstream.on('error', () => {
      if (!res.headersSent) res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`Dev server on :${port} isn't ready yet. Refresh in a moment.`);
    });
    req.pipe(upstream);
  });

  // HMR websockets: replay the upgrade request upstream, then splice the sockets.
  server.on('upgrade', (req, socket, head) => {
    const port = routePort(req.url ?? '/', gamePorts, launcherPort);
    const upstream = connect(port, 'localhost', () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (head.length > 0) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    const close = () => {
      socket.destroy();
      upstream.destroy();
    };
    upstream.on('error', close);
    socket.on('error', close);
  });

  return server;
}
