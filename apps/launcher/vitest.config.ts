import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'launcher',
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
  },
});
