import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'tetris',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
