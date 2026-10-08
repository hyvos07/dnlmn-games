import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '__SLUG__',
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
