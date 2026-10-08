import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    projects: [
      'packages/config',
      'games/*',
      { test: { name: 'scripts', include: ['scripts/**/*.test.ts'], environment: 'node' } },
    ],
  },
});
