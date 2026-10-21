import { defineConfig, devices } from '@playwright/test';

// Override with E2E_PORT to run tests while `pnpm dev` holds 4321.
const PORT = Number(process.env.E2E_PORT) || 4321;
// Optional: run against an installed browser locally, e.g. PW_CHANNEL=chrome pnpm test:e2e.
const channel = process.env.PW_CHANNEL || undefined;

/** Smoke tests run against the assembled dist/ served by `pnpm preview` (wrangler dev). */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  // Keep software WebGL renderers and simulated frame loops from competing locally or in CI.
  // Explicit --workers remains available for targeted runs.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // wrangler dev binds 127.0.0.1; `localhost` could reach a `pnpm dev` server on ::1 instead.
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel } },
    { name: 'mobile', use: { ...devices['Pixel 7'], channel } },
  ],
  webServer: {
    command: `pnpm exec wrangler dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/`,
    // Never test a stray server: fail loudly if the port is already taken.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
