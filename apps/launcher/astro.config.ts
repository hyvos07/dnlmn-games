import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://games.dnlmn.dev',
  trailingSlash: 'always',
  build: { format: 'directory' },
  devToolbar: { enabled: false },
});
