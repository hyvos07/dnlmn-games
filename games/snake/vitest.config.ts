import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'snake',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
