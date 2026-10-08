import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { loadGames } from '../../scripts/lib/manifests.ts';
import { trackProblems } from './helpers.ts';

const published = loadGames(join(import.meta.dirname, '../../games')).games.filter(
  (game) => game.manifest.status === 'published',
);

const TAG = published[0]?.manifest.tags[0] ?? '';
const TAG_B = published[0]?.manifest.tags[1] ?? TAG;
const urlTag = (tag: string) => new RegExp(`[?]tag=${tag}$`);

/** Slugs of cards (excluding ghost placeholders) that are currently visible. */
const visibleSlugs = (page: import('@playwright/test').Page) =>
  page
    .locator('.card-item:not(.ghost) a.card')
    .evaluateAll((links) =>
      links
        .filter((link) => (link as HTMLElement).offsetParent !== null)
        .map((link) => link.getAttribute('href')),
    );

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

test('h1 shows the title visibly and exposes the accessible name', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Games by dnlmn' })).toBeVisible();
  await expect(page.locator('h1 .line').first()).toBeVisible();
  await expect(page.locator('h1 .line').first()).toContainText('Games');
});

test('every published game has a card linking to it, with an image alt', async ({ page }) => {
  await page.goto('/');
  expect(published.length).toBeGreaterThan(0);
  for (const { slug } of published) {
    const card = page.locator(`a.card[href="/${slug}/"]`);
    await expect(card).toHaveCount(1);
    const alt = await card.locator('img').getAttribute('alt');
    expect((alt ?? '').trim()).not.toBe('');
  }
});

test.describe('tag filter', () => {
  test('clicking a chip filters, syncs the URL and aria-current; All clears; back restores', async ({
    page,
  }) => {
    await page.goto('/');
    const arcade = page.locator(`a.chip[data-tag="${TAG}"]`);
    const all = page.locator('a.chip[data-tag=""]');
    await expect(all).toHaveAttribute('aria-current', 'true');

    await arcade.click();
    await expect(page).toHaveURL(urlTag(TAG));
    await expect(page.locator('html')).toHaveAttribute('data-tag', TAG);
    await expect(arcade).toHaveAttribute('aria-current', 'true');
    await expect(all).not.toHaveAttribute('aria-current');

    const items = await page.locator('.card-item:not(.ghost)').all();
    expect(items.length).toBeGreaterThan(0);
    let shown = 0;
    let hidden = 0;
    for (const item of items) {
      const tags = ((await item.getAttribute('data-tags')) ?? '').split(' ');
      if (tags.includes(TAG)) {
        await expect(item).toBeVisible();
        shown++;
      } else {
        await expect(item).toBeHidden();
        hidden++;
      }
    }
    expect(shown).toBeGreaterThan(0);
    expect(hidden).toBe(items.length - shown);
    // The coming-soon teaser never shows while a filter is active.
    const ghosts = await page.locator('.card-item.ghost').all();
    expect(ghosts.length).toBeGreaterThan(0);
    for (const ghost of ghosts) await expect(ghost).toBeHidden();
    const expected = published.filter((g) => (g.manifest.tags as string[]).includes(TAG)).length;
    await expect(page.locator('[data-count]')).toHaveText(String(expected));

    await all.click();
    await expect(page).not.toHaveURL(/tag=/);
    await expect(page.locator('html')).not.toHaveAttribute('data-tag', /.*/);
    await expect(all).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-count]')).toHaveText(String(published.length));

    await page.goBack();
    await expect(page).toHaveURL(urlTag(TAG));
    await expect(page.locator('html')).toHaveAttribute('data-tag', TAG);
    await expect(arcade).toHaveAttribute('aria-current', 'true');
  });

  test('a ?tag= on direct load is applied before DOMContentLoaded finishes', async ({ page }) => {
    await page.goto(`/?tag=${TAG_B}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction((tag) => document.documentElement.dataset.tag === tag, TAG_B);
    await expect(page.locator(`a.chip[data-tag="${TAG_B}"]`)).toHaveAttribute(
      'aria-current',
      'true',
    );
    const slugs = await visibleSlugs(page);
    expect(slugs.length).toBeGreaterThan(0);
    for (const href of slugs) {
      const slug = (href ?? '').replaceAll('/', '');
      const game = published.find((g) => g.slug === slug);
      expect(game?.manifest.tags).toContain(TAG_B);
    }
  });

  test('an unknown ?tag= is ignored', async ({ page }) => {
    await page.goto('/?tag=nope');
    await expect(page.locator('html')).not.toHaveAttribute('data-tag', /.*/);
    await expect(page.locator('a.chip[data-tag=""]')).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('[data-count]')).toHaveText(String(published.length));
  });

  test('/tag/<tag>/ filters without JavaScript', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    try {
      await page.goto(`/tag/${TAG}/`);
      await expect(page.locator(`a.chip[data-tag="${TAG}"]`)).toHaveAttribute(
        'aria-current',
        'true',
      );
      await expect(page.locator('a.chip[data-tag=""]')).not.toHaveAttribute('aria-current');
      for (const item of await page.locator('.card-item').all()) {
        const tags = ((await item.getAttribute('data-tags')) ?? '').split(' ');
        const isGhost = (await item.getAttribute('class'))?.includes('ghost');
        if (!isGhost && tags.includes(TAG)) await expect(item).toBeVisible();
        else await expect(item).toBeHidden();
      }
    } finally {
      await context.close();
    }
  });

  test('the touch toggle flips aria-pressed and ?touch=1', async ({ page }) => {
    await page.goto('/');
    const toggle = page.locator('button[data-touch-toggle]');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page).toHaveURL(/[?&]touch=1/);
    await expect(page.locator('html')).toHaveAttribute('data-touch', '');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page).not.toHaveURL(/touch=/);
    await expect(page.locator('html')).not.toHaveAttribute('data-touch', /.*/);
  });
});

test.describe('motion layer', () => {
  test('reduced motion never mounts a WebGL canvas', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL });
    const page = await context.newPage();
    try {
      await page.goto('/');
      await page.waitForLoadState('load');
      // The motion layer is scheduled after load + idle (<= 2.5 s); give it time to prove absence.
      await page.waitForTimeout(4000);
      await expect(page.locator('#scene canvas')).toHaveCount(0);
      await expect(page.locator('#scene')).not.toHaveClass(/is-live/);
    } finally {
      await context.close();
    }
  });

  test('default motion mounts exactly one canvas', async ({ page }) => {
    await page.goto('/');
    const hasWebGL2 = await page.evaluate(() => 'WebGL2RenderingContext' in window);
    test.skip(!hasWebGL2, 'no WebGL2 in this browser');
    await expect(page.locator('#scene')).toHaveClass(/is-live/, { timeout: 8000 });
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});

test('keyboard: Tab reaches the first game card with a visible focus outline', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard focus order is a desktop concern');
  await page.goto('/');
  await page.locator('a.chip').first().focus();
  const firstCard = page.locator('a.card').first();
  let reached = false;
  for (let i = 0; i < 20 && !reached; i++) {
    await page.keyboard.press('Tab');
    reached = await firstCard.evaluate((node) => node === document.activeElement);
  }
  expect(reached).toBe(true);
  await expect(firstCard).toBeFocused();
  const outline = await firstCard.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outline).not.toBe('none');
});

test('/about/ and /sitemap.xml return 200', async ({ request }) => {
  expect((await request.get('/about/')).status()).toBe(200);
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain('<urlset');
});

test('/no-such-page/ returns 404 with the themed page', async ({ page }) => {
  const response = await page.goto('/no-such-page/');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('Game over')).toBeVisible();
});

test('/about/ loads without errors', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/about/');
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});
