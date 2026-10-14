import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { devGames } from '../../scripts/lib/dev-games.ts';

export default defineConfig({
  site: 'https://games.dnlmn.dev',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
  server: { port: 4321 },
  vite: {
    server: { strictPort: true },
    plugins: [devGames(fileURLToPath(new URL('../../games', import.meta.url)))],
  },
});
