import { expect, test } from '@playwright/test';
import { GameManager, type SavedGame } from '../../games/merge-2048/src/logic/rules.ts';
import { trackProblems } from './helpers.ts';

const origin = `http://127.0.0.1:${Number(process.env.E2E_PORT) || 4321}`;
const route = '/merge-2048/';
const saved = (rows: number[][], score = 0): SavedGame => ({
  grid: {
    size: 4,
    cells: Array.from({ length: 4 }, (_, x) =>
      Array.from({ length: 4 }, (_, y) =>
        rows[y]?.[x] ? { position: { x, y }, value: rows[y]?.[x] as number } : null,
      ),
    ),
  },
  score,
  won: false,
  over: false,
  keepPlaying: false,
});
const storage = (board: unknown, best = 0) => ({
  cookies: [],
  origins: [
    {
      origin,
      localStorage: [
        { name: 'dnlmn:merge-2048:board-v1', value: JSON.stringify(board) },
        { name: 'dnlmn:merge-2048:highscore', value: JSON.stringify(best) },
      ],
    },
  ],
});
const getBoard = async (page: import('@playwright/test').Page) => {
  const snapshot = await page.context().storageState();
  const value = snapshot.origins
    .find((entry) => entry.origin === origin)
    ?.localStorage.find((entry) => entry.name === 'dnlmn:merge-2048:board-v1')?.value;
  return value ? (JSON.parse(value) as SavedGame) : null;
};

test('2048 opens with a start screen, original attribution and a working favicon', async ({
  page,
}) => {
  const problems = trackProblems(page);
  await page.goto(route);
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#how-to-play')).toBeVisible();
  await expect(page.locator('#instructions')).toHaveCount(1);
  await expect(page.locator('.brand-mark, .edition, #overlay-kicker, #milestone')).toHaveCount(0);
  await expect(page.locator('#board [role="gridcell"]')).toHaveCount(16);
  await expect(page.locator('.credit')).toContainText("Gabriele Cirulli's 2048");
  const favicon = await page.locator('link[rel="icon"]').getAttribute('href');
  const faviconUrl = new URL(favicon ?? '', page.url());
  expect(faviconUrl.pathname).toBe('/merge-2048/favicon.svg');
  expect((await page.request.get(faviconUrl.href)).status()).toBe(200);
  await page.locator('#play').click();
  await expect(page.locator('#overlay')).toBeHidden();
  expect((await getBoard(page))?.grid.cells.flat().filter(Boolean)).toHaveLength(2);
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});

test.describe('saved board, merge and lifecycle', () => {
  test.use({ storageState: storage(saved([[2, 2, 2, 2]])), reducedMotion: 'reduce' });

  test('How to play explains controls, traps focus, and preserves the board through tab interruptions', async ({
    page,
  }) => {
    const problems = trackProblems(page);
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.goto(route);
    await page.locator('#play').click();
    await page.keyboard.press('ArrowLeft');
    const before = await getBoard(page);
    const help = page.locator('#how-to-play');
    await help.click();
    const dialog = page.getByRole('dialog', { name: 'How to play', exact: true });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('All tiles move together');
    await expect(dialog).toContainText('no moves remain');
    await expect(dialog.locator('.merge-example')).toBeVisible();
    const close = dialog.getByRole('button', { name: 'Got it' });
    await expect(close).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    expect(await getBoard(page)).toEqual(before);
    for (const state of ['hidden', 'visible'])
      await page.evaluate((value) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await expect(dialog).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    expect(await getBoard(page)).toEqual(before);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    await help.click();
    await close.click();
    await expect(dialog).toBeHidden();
    await page.locator('#board').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#score')).toHaveText('16');
    expect(problems).toEqual([]);
  });

  test('one merge per tile, exact scoring, invalid move, persistence, Escape and restart confirmation', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.goto(route);
    await expect(page.locator('#play')).toHaveText('Resume game');
    await page.locator('#play').click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#score')).toHaveText('8');
    expect((await getBoard(page))?.grid.cells.map((column) => column[0]?.value ?? 0)).toEqual([
      4, 4, 0, 0,
    ]);
    await expect(page.locator('#best')).toHaveText('8');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toHaveCount(0);
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#score')).toHaveText('16');
    const persisted = await getBoard(page);
    await page.reload();
    await page.locator('#play').click();
    expect(await getBoard(page)).toEqual(persisted);
    await page.locator('#new-game').click();
    await expect(page.locator('#restart-dialog')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    expect(await getBoard(page)).toEqual(persisted);
    await page.getByRole('button', { name: 'Keep playing' }).click();
    expect(await getBoard(page)).toEqual(persisted);
    await page.locator('#new-game').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#restart-dialog')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeHidden();
    expect(await getBoard(page)).toEqual(persisted);
    await page.locator('#new-game').click();
    await page.getByRole('button', { name: 'Start fresh' }).click();
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#best')).toHaveText('16');
    expect((await getBoard(page))?.grid.cells.flat().filter(Boolean)).toHaveLength(2);
  });

  test('one dominant-axis swipe moves once; short and cancelled gestures do nothing', async ({
    page,
    isMobile,
  }) => {
    await page.goto(route);
    await page.locator('#play').click();
    const before = await getBoard(page);
    const box = await page.locator('#board').boundingBox();
    if (!box) throw new Error('Board missing');
    const x = box.x + box.width * 0.8;
    const y = box.y + box.height * 0.5;
    const problems = trackProblems(page);
    if (isMobile) {
      const touch = await page.context().newCDPSession(page);
      const point = (clientX: number, clientY: number) => [{ x: clientX, y: clientY, id: 1 }];
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(x, y),
      });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      expect(await getBoard(page)).toEqual(before);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(x, y),
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(x - 4, y),
      });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      expect(await getBoard(page)).toEqual(before);
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: point(x, y),
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: point(x - 100, y + 10),
      });
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await touch.detach();
    } else {
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.locator('#board').dispatchEvent('pointercancel', { pointerId: 1 });
      await page.mouse.move(x - 100, y);
      await page.mouse.up();
      expect(await getBoard(page)).toEqual(before);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 4, y);
      await page.mouse.up();
      expect(await getBoard(page)).toEqual(before);
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 100, y + 10, { steps: 6 });
      await page.mouse.up();
    }
    expect(problems).toEqual([]);
    await expect(page.locator('#score')).toHaveText('8');
  });
});

test.describe('winning', () => {
  test.use({ storageState: storage(saved([[1024, 1024, 2048, 0]])), reducedMotion: 'reduce' });
  test('reaches 2048, survives reload, blocks moves until Keep going and merges beyond 2048', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.goto(route);
    await page.locator('#play').click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#overlay-title')).toHaveText('2048. Nicely done.');
    await expect(page.locator('#score')).toHaveText('2048');
    await expect(page.locator('#overlay')).toBeVisible();
    const originalViewport = page.viewportSize();
    for (const viewport of [
      { width: 320, height: 568 },
      { width: 568, height: 320 },
    ]) {
      await page.setViewportSize(viewport);
      const boardBox = await page.locator('.board-wrap').boundingBox();
      const retryBox = await page.locator('#retry').boundingBox();
      expect(
        boardBox && retryBox && retryBox.y + retryBox.height <= boardBox.y + boardBox.height,
      ).toBeTruthy();
      await expect(page.locator('#continue')).toBeInViewport();
    }
    if (originalViewport) await page.setViewportSize(originalViewport);
    const won = await getBoard(page);
    await page.keyboard.press('ArrowRight');
    expect(await getBoard(page)).toEqual(won);
    await page.reload();
    await page.locator('#play').click();
    await expect(page.locator('#continue')).toBeVisible();
    await page.locator('#continue').click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#score')).toHaveText('6144');
    await expect(page.locator('#overlay')).toBeHidden();
    expect((await getBoard(page))?.grid.cells[0]?.[0]?.value).toBe(4096);
  });
});

test.describe('game over', () => {
  test.use({
    storageState: storage(
      saved(
        [
          [2, 4, 8, 16],
          [4, 8, 16, 32],
          [8, 16, 32, 64],
          [0, 2, 4, 8],
        ],
        128,
      ),
      128,
    ),
    reducedMotion: 'reduce',
  });
  test('last move ends the run, clears the active save, retains best and restarts', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0;
    });
    await page.goto(route);
    await page.locator('#play').click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#overlay-title')).toHaveText('No more moves.');
    expect(await getBoard(page)).toBeNull();
    await page.locator('#retry').click();
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#best')).toHaveText('128');
    await expect(page.locator('#overlay')).toBeHidden();
  });
});

test.describe('result transition', () => {
  test.use({ storageState: storage(saved([[1024, 1024, 2048, 0]])) });

  test('holds the winning move, fades the menu, and requires fresh input after the score can be read', async ({
    page,
  }) => {
    const problems = trackProblems(page);
    const time = new Date('2026-01-01T12:00:00Z');
    await page.clock.install({ time });
    await page.clock.pauseAt(time);
    await page.goto(route);
    await page.locator('#play').click();
    await page.keyboard.down('Space');
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#score')).toHaveText('2048');
    expect((await getBoard(page))?.won).toBe(true);
    await expect(page.locator('#overlay')).toBeHidden();
    // The header shortcut must not bypass the result delay either.
    await page.locator('#new-game').click();
    await expect(page.locator('#restart-dialog')).toBeHidden();
    await page.clock.runFor(900);
    await expect(page.locator('#overlay')).toBeHidden();
    await page.screenshot({
      path: `test-results/2048-result-hold-${test.info().project.name}.png`,
    });
    await page.clock.runFor(250);
    await expect(page.locator('#overlay')).toHaveAttribute('data-result-phase', 'fade');
    const opacity = await page
      .locator('#overlay')
      .evaluate((node) => Number(getComputedStyle(node).opacity));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1);
    await expect(page.locator('#overlay')).toHaveJSProperty('inert', true);
    const retry = await page.locator('#retry').boundingBox();
    if (!retry) throw new Error('Results must expose retry bounds');
    await page.mouse.move(retry.x + retry.width / 2, retry.y + retry.height / 2);
    await page.mouse.down();
    await page.clock.runFor(700);
    await expect(page.locator('#overlay')).toHaveAttribute('data-result-phase', 'ready');
    await page.mouse.up();
    await page.keyboard.up('Space');
    await expect(page.locator('#score')).toHaveText('2048');
    await expect(page.locator('#overlay')).toBeVisible();
    await page.screenshot({
      path: `test-results/2048-result-ready-${test.info().project.name}.png`,
    });
    await page.locator('#continue').click();
    await expect(page.locator('#overlay')).toBeHidden();
    await expect(page.locator('#score')).toHaveText('2048');
    expect(problems).toEqual([]);
  });
});

test.describe('fast input with animations', () => {
  const initial = saved([
    [2, 2, 4, 4],
    [8, 8, 0, 0],
    [2, 0, 2, 0],
  ]);
  test.use({ storageState: storage(initial), reducedMotion: 'no-preference' });
  test('rapid moves all reach the rules engine and final tiles settle without duplicates', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Math.random = () => 0.99;
    });
    await page.goto(route);
    await page.locator('#play').click();
    const expected = new GameManager(() => 0.99, initial);
    for (const direction of [3, 2, 3, 0, 1, 2, 3, 0] as const) {
      expected.move(direction);
      await page.keyboard.press(
        ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][direction] as string,
      );
    }
    expect(await getBoard(page)).toEqual(expected.serialize());
    await expect(page.locator('.tile')).toHaveCount(
      expected.grid.cells.flat().filter(Boolean).length,
    );
    const cells = await page.locator('.tile').evaluateAll((nodes) =>
      nodes.map((node) => {
        const rect = node.getBoundingClientRect();
        return [Math.round(rect.x), Math.round(rect.y)];
      }),
    );
    expect(new Set(cells.map(String)).size).toBe(cells.length);
  });
});

test.describe('damaged save', () => {
  test.use({ storageState: storage({ grid: { size: 4, cells: [] }, score: 'oops' }) });
  test('falls back to a fresh playable board', async ({ page }) => {
    await page.goto(route);
    await expect(page.locator('#play')).toContainText("Let's play");
    await page.locator('#play').click();
    expect((await getBoard(page))?.grid.cells.flat().filter(Boolean)).toHaveLength(2);
  });
});

test('board stays square and visible on small portrait and landscape viewports', async ({
  page,
}) => {
  await page.goto(route);
  await page.evaluate(() => document.fonts.ready);
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 393, height: 852 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 540, height: 500 },
    { width: 320, height: 480 },
    { width: 480, height: 320 },
    { width: 1440, height: 796 },
  ]) {
    await page.setViewportSize(viewport);
    const board = await page.locator('.board-wrap').boundingBox();
    expect(board).not.toBeNull();
    if (!board) continue;
    expect(Math.abs(board.width - board.height)).toBeLessThan(1);
    expect(board.x).toBeGreaterThanOrEqual(0);
    expect(board.y + board.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(
      true,
    );
    await expect(page.locator('#play')).toBeInViewport();
  }
});
