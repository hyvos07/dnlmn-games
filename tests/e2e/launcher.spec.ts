import { expect, test } from '@playwright/test';
import { trackProblems } from './helpers.ts';

test('launcher loads without errors', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Games by');
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});

test('unknown paths serve the 404 page', async ({ page }) => {
  const response = await page.goto('/definitely-not-a-game/');
  expect(response?.status()).toBe(404);
});
