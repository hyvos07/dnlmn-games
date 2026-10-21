import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'merge-2048',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
