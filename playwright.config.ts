import { defineConfig, devices } from '@playwright/test';

const PORT = 4321;
// Optional: run against an installed browser locally, e.g. PW_CHANNEL=chrome pnpm test:e2e.
const channel = process.env.PW_CHANNEL || undefined;

/** Smoke tests run against the assembled dist/ served by `pnpm preview` (wrangler dev). */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: 'pnpm preview',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
