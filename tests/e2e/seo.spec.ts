import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { SITE_ORIGIN } from '../../packages/config/src/seo.ts';
import { loadGames } from '../../scripts/lib/manifests.ts';

const shipped = loadGames(join(import.meta.dirname, '../../games')).games.filter(
  (game) => game.manifest.status !== 'draft',
);

test('crawler sees canonical metadata, static share images and structured data without JavaScript', async ({
  browser,
  baseURL,
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml');
  expect(sitemap.status()).toBe(200);
  const paths = [...(await sitemap.text()).matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => {
    const url = new URL(match[1] ?? '');
    expect(url.origin).toBe(SITE_ORIGIN);
    return url.pathname;
  });
  expect(new Set(paths).size).toBe(paths.length);
  expect(paths).toEqual(expect.arrayContaining(['/', '/about/']));
  for (const game of shipped) {
    expect(paths.includes(`/${game.slug}/`)).toBe(game.manifest.status === 'published');
  }
  const robots = await request.get('/robots.txt');
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  expect(await robots.text()).not.toContain('Disallow: /');

  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  const page = await context.newPage();
  const images = new Set<string>();
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  try {
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_ORIGIN}${path}`,
      );
      await expect(page.locator('meta[name="robots"]')).not.toHaveAttribute('content', /noindex/);
      const title = await page.title();
      const description = await page.locator('meta[name="description"]').getAttribute('content');
      expect(title.length).toBeGreaterThan(5);
      expect(description?.length).toBeGreaterThan(20);
      expect(titles.has(title), path).toBe(false);
      expect(descriptions.has(description ?? ''), path).toBe(false);
      titles.add(title);
      descriptions.add(description ?? '');
      const image = await page.locator('meta[property="og:image"]').getAttribute('content');
      expect(image).toMatch(/^https:\/\/games\.dnlmn\.dev\/og\/[\w-]+\.png$/);
      images.add(new URL(image ?? '').pathname);
      await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute(
        'content',
        image ?? '',
      );
      await expect(page.locator('meta[property="og:image:alt"]')).not.toHaveAttribute(
        'content',
        '',
      );
      const data = await page.locator('script[type="application/ld+json"]').allTextContents();
      const schemas = data.map((text) => JSON.parse(text));
      if (path === '/') {
        expect(schemas.some((schema) => schema['@type'] === 'WebSite')).toBe(true);
        const list = schemas.find((schema) => schema['@type'] === 'CollectionPage').mainEntity;
        expect(list.numberOfItems).toBe(
          shipped.filter((game) => game.manifest.status === 'published').length,
        );
      }
      const game = shipped.find((entry) => path === `/${entry.slug}/`);
      if (game)
        expect(schemas).toContainEqual(
          expect.objectContaining({ '@type': 'VideoGame', name: game.manifest.title }),
        );
    }
    for (const image of images) {
      const response = await request.get(image);
      expect(response.status(), image).toBe(200);
      expect(response.headers()['content-type']).toContain('image/png');
      const metadata = await sharp(await response.body(), { animated: true }).metadata();
      expect(metadata.width).toBe(1200);
      expect(metadata.height).toBe(630);
      expect(metadata.pages ?? 1).toBe(1);
    }
    await page.goto('/this-page-does-not-exist/');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
