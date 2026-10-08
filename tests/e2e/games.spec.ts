import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadGames } from '../../scripts/lib/manifests.ts';
import { trackProblems } from './helpers.ts';

const { games } = loadGames(join(import.meta.dirname, '../../games'));
const playable = games.filter((game) => game.manifest.status !== 'draft');

test('at least one playable game is covered', () => {
  expect(playable.length).toBeGreaterThan(0);
});

for (const { slug } of playable) {
  test.describe(`game: ${slug}`, () => {
    test('boots with a stage, the SDK HUD and no problems', async ({ page }) => {
      const problems = trackProblems(page);
      const response = await page.goto(`/${slug}/`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('canvas')).toBeAttached();
      await expect(page.locator('[data-games-hud]')).toHaveCount(1);
      await page.waitForLoadState('networkidle');
      expect(problems).toEqual([]);
    });

    test('redirects /<slug> to /<slug>/', async ({ page }) => {
      await page.goto(`/${slug}`);
      expect(new URL(page.url()).pathname).toBe(`/${slug}/`);
      await expect(page.locator('[data-games-hud]')).toHaveCount(1);
    });
  });
}
