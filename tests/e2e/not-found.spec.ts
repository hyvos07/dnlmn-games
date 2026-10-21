import { expect, test } from '@playwright/test';
import { advanceUntilVisible } from './helpers.ts';

test('404 stays plain while home retains its floating background after navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const scene = page.locator('#scene');
  await expect(scene).toHaveClass(/is-live/);
  await expect(scene.locator('canvas')).toHaveCount(1);
  expect(await scene.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain(
    'radial-gradient',
  );
  await page.goto('/background-isolation/');
  await expect(page.locator('#scene')).toHaveCount(0);
  const background = await page
    .locator('html')
    .evaluate((element) => getComputedStyle(element).backgroundImage);
  expect(background).toBe('none');
  await page.getByRole('link', { name: 'Back to the games' }).click();
  await expect(scene).toHaveClass(/is-live/);
  await expect(scene.locator('canvas')).toHaveCount(1);
  expect(await scene.evaluate((element) => getComputedStyle(element, '::before').display)).toBe(
    'block',
  );
});

for (const path of [
  '/a-lost-route',
  '/lost/deep/route/?hello=world',
  '/snake/not-a-level/',
  '/typing-fortress/not-a-level/',
]) {
  test(`404 keeps the requested address: ${path}`, async ({ page }) => {
    const assetErrors: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.request().resourceType() !== 'document')
        assetErrors.push(response.url());
    });
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(path);
    await expect(page.getByRole('heading', { name: 'Nothing here.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to the games' })).toHaveAttribute(
      'href',
      '/',
    );
    await page.waitForLoadState('networkidle');
    expect(assetErrors).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('404 remains usable without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const response = await page.goto(`${baseURL}/lost-without-js/`);
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Nothing here.' })).toBeVisible();
  await expect(page.locator('[data-shooter-hud]')).toBeHidden();
  await page.getByRole('link', { name: 'Back to the games' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Games by');
  await context.close();
});

test('space shooter auto-starts, ends, and restarts with reduced motion', async ({ page }) => {
  test.setTimeout(90_000);
  const startTime = new Date('2026-01-01T12:00:00Z');
  // Own requestAnimationFrame/performance before the auto-starting game schedules a frame.
  await page.clock.install({ time: startTime });
  // Freeze before navigation so slow loading cannot overrun the pause timestamp.
  await page.clock.pauseAt(new Date(startTime.getTime() + 10_000));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lost-in-space/');
  // The toy starts after a paint and a timer; drive those while waiting for its public ready state.
  const shooter = page.locator('[data-shooter]');
  for (let elapsed = 0; elapsed < 10_000; elapsed += 50) {
    if (await shooter.evaluate((element) => element.classList.contains('is-ready'))) break;
    await page.clock.runFor(50);
  }
  await expect(page.locator('header, footer, nav')).toHaveCount(0);
  await expect(page.locator('#scene')).toHaveCount(0);
  await expect(page.getByText('Error 404 / Out of bounds')).toHaveCount(0);
  await expect(page.getByText('One wrong turn. A little detour.')).toHaveCount(0);
  await expect(page.locator('.pixel-404')).toHaveCount(0);
  await expect(page.getByText('Keyboard works too:', { exact: false })).toHaveCount(0);
  await expect(page.locator('[data-shooter]')).toHaveClass(/is-ready/);
  await expect(page.locator('[data-shooter-over]')).toBeHidden();
  await expect(page.locator('[data-shooter-score]')).toHaveText('0');
  const arena = await page.locator('[data-shooter-board]').boundingBox();
  const title = await page.getByRole('heading', { level: 1, name: '404' }).boundingBox();
  expect(arena && title && title.y > arena.y + arena.height).toBeTruthy();
  await page.locator('[data-shooter-canvas]').focus();
  await advanceUntilVisible(page, page.locator('[data-shooter-over]'));
  await expect(page.locator('[data-shooter-status]')).toContainText('Nice try.');
  await expect(page.getByText('Signal lost', { exact: false })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nice try.' })).toBeVisible();
  const retryBox = await page.getByRole('button', { name: 'Fly again' }).boundingBox();
  expect(retryBox?.height).toBe(44);
  await page.getByRole('button', { name: 'Fly again' }).click();
  await expect(page.locator('[data-shooter-over]')).toBeHidden();
  await expect(page.locator('[data-shooter-score]')).toHaveText('0');
  await expect(page.locator('[data-shooter-shields]')).toHaveAttribute('aria-label', '3 shields');
});

test('steering earns points and refresh or another visit clears the score', async ({
  page,
  isMobile,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/fresh-space/');
  const canvas = page.locator('[data-shooter-canvas]');
  await expect(page.locator('[data-shooter]')).toHaveClass(/is-ready/);
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  // Inspect the rendered ship, rather than counting points from idle auto-fire.
  const shipCenter = () =>
    canvas.evaluate((element) => {
      const gameCanvas = element as HTMLCanvasElement;
      const sample = document.createElement('canvas').getContext('2d');
      const context = gameCanvas.getContext('2d');
      if (!sample || !context) return 0;
      sample.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim();
      sample.fillRect(0, 0, 1, 1);
      const color = sample.getImageData(0, 0, 1, 1).data;
      const row = context.getImageData(
        0,
        Math.round((gameCanvas.height * 354) / 400),
        gameCanvas.width,
        1,
      ).data;
      const positions: number[] = [];
      for (let x = 0; x < gameCanvas.width; x++) {
        if (row[x * 4] === color[0] && row[x * 4 + 1] === color[1] && row[x * 4 + 2] === color[2])
          positions.push(x);
      }
      return positions.length
        ? positions.reduce((sum, x) => sum + x, 0) / positions.length / gameCanvas.width
        : 0;
    });
  await expect.poll(shipCenter).toBeGreaterThan(0.4);
  if (isMobile) await page.touchscreen.tap(box.x + box.width * 0.89, box.y + box.height * 0.885);
  else {
    await canvas.focus();
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(650);
    await page.keyboard.up('ArrowRight');
  }
  await expect.poll(shipCenter).toBeGreaterThan(0.75);
  await expect(page.locator('[data-shooter-score]')).not.toHaveText('0', { timeout: 8000 });
  await page.reload();
  await expect(page.locator('[data-shooter]')).toHaveClass(/is-ready/);
  await expect(page.locator('[data-shooter-score]')).toHaveText('0');
  await page.goto('/');
  await page.goto('/fresh-space/');
  await expect(page.locator('[data-shooter]')).toHaveClass(/is-ready/);
  await expect(page.locator('[data-shooter-score]')).toHaveText('0');
  expect(box.width).toBeLessThanOrEqual(360);
  expect(box.width / box.height).toBeCloseTo(9 / 10, 1);
});

test('ship is the pointer in both axes on mouse and touch', async ({ page, isMobile }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/cursor-pilot/');
  await expect(page.locator('[data-shooter]')).toHaveClass(/is-ready/);
  const canvas = page.locator('[data-shooter-canvas]');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Missing shooter arena');
  const shipPosition = () =>
    canvas.evaluate((element) => {
      const gameCanvas = element as HTMLCanvasElement;
      const ctx = gameCanvas.getContext('2d');
      const sample = document.createElement('canvas').getContext('2d');
      if (!ctx || !sample) return { x: 0, y: 0 };
      sample.fillStyle = getComputedStyle(document.documentElement)
        .getPropertyValue('--accent')
        .trim();
      sample.fillRect(0, 0, 1, 1);
      const color = sample.getImageData(0, 0, 1, 1).data;
      const data = ctx.getImageData(0, 0, gameCanvas.width, gameCanvas.height).data;
      let widest = 0;
      let position = { x: 0, y: 0 };
      for (let y = Math.round(gameCanvas.height * 0.18); y < gameCanvas.height; y++) {
        let count = 0;
        let sum = 0;
        for (let x = 0; x < gameCanvas.width; x++) {
          const pixel = (y * gameCanvas.width + x) * 4;
          if (
            data[pixel] === color[0] &&
            data[pixel + 1] === color[1] &&
            data[pixel + 2] === color[2]
          ) {
            count++;
            sum += x;
          }
        }
        // The ship's wings are wider than any laser; inspect the rendered ship.
        if (count > widest) {
          widest = count;
          position = { x: sum / count / gameCanvas.width, y: y / gameCanvas.height };
        }
      }
      return position;
    });
  const point = { x: box.x + box.width * 0.72, y: box.y + box.height * 0.6 };
  if (isMobile) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.move(point.x, point.y);
  await expect.poll(async () => (await shipPosition()).x).toBeCloseTo(0.72, 1);
  await expect.poll(async () => (await shipPosition()).y).toBeCloseTo(0.6, 1);
  await expect(canvas).toHaveCSS('cursor', 'none');
  await canvas.focus();
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(180);
  await page.keyboard.up('ArrowUp');
  await expect.poll(async () => (await shipPosition()).y).toBeLessThan(0.55);
});
