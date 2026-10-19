import { expect, type Page, test } from '@playwright/test';
import { trackProblems } from './helpers.ts';

const KEYS = ['d', 'f', 'j', 'k'] as const;
const START_TIME = new Date('2026-01-01T12:00:00Z');

async function openRush(page: Page): Promise<string[]> {
  const problems = trackProblems(page);
  await page.clock.install({ time: START_TIME });
  const response = await page.goto('/tile-rush/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Pixel Rush');
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  await page.clock.pauseAt(new Date(START_TIME.getTime() + 10_000));
  return problems;
}

async function startRound(page: Page, mode = 'timed'): Promise<void> {
  await page.locator('#mode-toggle').click();
  await page.locator(`#mode-options [data-value="${mode}"]`).click();
  await page.locator('#play').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
}

async function nextLane(page: Page): Promise<number> {
  const lane = await page.locator('#board').getAttribute('data-next-lane');
  if (lane === null || !/^[0-3]$/.test(lane)) {
    throw new Error('The active board must identify its next visible target lane');
  }
  return Number(lane);
}

async function tapLane(page: Page, lane: number, touch = false): Promise<void> {
  const bounds = await page.locator('#board').boundingBox();
  if (!bounds) throw new Error('The playable board must be visible');
  const cell = bounds.width / 4;
  const x = bounds.x + (lane + 0.5) * cell;
  const y = bounds.y + bounds.height - cell * 1.5;
  if (touch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

async function hitNext(page: Page, touch = false): Promise<void> {
  await tapLane(page, await nextLane(page), touch);
}

/** Keep frame-driven time honest without a single oversized animation-frame jump. */
async function advanceTime(page: Page, milliseconds: number): Promise<void> {
  for (let elapsed = 0; elapsed < milliseconds; elapsed += 1000) {
    await page.clock.runFor(Math.min(1000, milliseconds - elapsed));
  }
}

async function expectMissThenResults(page: Page): Promise<void> {
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'miss');
  await expect(page.locator('#results')).toBeHidden();
  const score = await page.locator('#score').innerText();
  const time = await page.locator('#time').innerText();
  await hitNext(page);
  await advanceTime(page, 620);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'miss');
  await expect(page.locator('#score')).toHaveText(score);
  await expect(page.locator('#time')).toHaveText(time);
  await advanceTime(page, 900);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'over');
  await expect(page.locator('#final-score')).toHaveText(score);
}

test('the open mode menu centers its options and supports touch and keyboard selection', async ({
  page,
}) => {
  const problems = await openRush(page);
  const toggle = page.locator('#mode-toggle');
  const list = page.getByRole('listbox', { name: 'Game mode' });
  for (const size of [
    { width: 320, height: 568 },
    { width: 393, height: 851 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(size);
    await page.clock.runFor(32);
    await toggle.click();
    await expect(list).toBeVisible();
    await expect(list).toBeInViewport({ ratio: 1 });
    const offsets = await list.evaluate((node) => {
      const listBounds = node.getBoundingClientRect();
      return [...node.querySelectorAll('[role="option"]')].map((option) => {
        const text = document.createRange();
        text.selectNodeContents(option);
        const textBounds = text.getBoundingClientRect();
        return textBounds.x + textBounds.width / 2 - (listBounds.x + listBounds.width / 2);
      });
    });
    for (const offset of offsets) expect(Math.abs(offset)).toBeLessThan(1);
    await page.getByRole('option', { name: 'Normal · 20s', exact: true }).click();
    await expect(list).toBeHidden();
    await expect(toggle).toBeFocused();
  }
  await toggle.press('ArrowDown');
  await expect(list).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#mode')).toHaveValue('endless');
  await expect(toggle).toHaveText('Endless');
  await expect(page.locator('#mode-description')).toHaveText(/No time limit/);
  await toggle.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  await expect(list).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(page.locator('#mode')).toHaveValue('endless');
  await toggle.click();
  await page.mouse.click(8, 8);
  await expect(list).toBeHidden();
  expect(problems).toEqual([]);
});

test('the first correct tap starts the clock, and subsequent targets score', async ({
  page,
  isMobile,
}) => {
  const problems = await openRush(page);
  await startRound(page);
  const readyTime = await page.locator('#time').innerText();
  await tapLane(page, ((await nextLane(page)) + 1) % 4, isMobile);
  await advanceTime(page, 3000);
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#time')).toHaveText(readyTime);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');

  await hitNext(page, isMobile);
  await expect(page.locator('#score')).toHaveText('1');
  await advanceTime(page, 1000);
  await expect(page.locator('#time')).not.toHaveText(readyTime);
  await hitNext(page, isMobile);
  await expect(page.locator('#score')).toHaveText('2');
  expect(problems).toEqual([]);
});

test('DFJK play reserves F for its lane and ignores a held key repeat', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Physical keyboard gameplay is advertised for desktop.');
  await openRush(page);
  await startRound(page, 'practice');

  await page.keyboard.press('f');
  expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
  const held = new Set<string>();
  let checkedRepeat = false;
  // Within five targets, one of the four lane keys must already be held. Repeat that
  // currently correct key so the assertion cannot pass merely because it is a wrong lane.
  for (let hits = 0; hits < 5; hits++) {
    const key = KEYS[await nextLane(page)] as string;
    const before = Number(await page.locator('#score').innerText());
    await page.keyboard.down(key);
    if (held.has(key)) {
      await expect(page.locator('#score')).toHaveText(String(before));
      await page.keyboard.up(key);
      await page.keyboard.press(key);
      await expect(page.locator('#score')).toHaveText(String(before + 1));
      checkedRepeat = true;
      break;
    }
    held.add(key);
    await expect(page.locator('#score')).toHaveText(String(before + 1));
  }
  expect(checkedRepeat).toBe(true);
  for (const key of held) await page.keyboard.up(key);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
});

test('pointer and keyboard hits pulse the tile itself without particles', async ({
  page,
  isMobile,
}) => {
  const problems = await openRush(page);
  await page.evaluate(() => {
    const prototype = CanvasRenderingContext2D.prototype;
    const clear = prototype.clearRect;
    const fill = prototype.fillRect;
    const draw = prototype.drawImage;
    prototype.clearRect = function (...args) {
      this.canvas.dataset.sparks = '0';
      return clear.apply(this, args);
    };
    prototype.fillRect = function (x, y, width, height) {
      if (width === height && this.globalAlpha < 1) {
        this.canvas.dataset.tapAlpha = this.globalAlpha.toFixed(2);
      }
      const styles = getComputedStyle(document.documentElement);
      const colors = ['--accent', '--ink'].map((property) =>
        styles.getPropertyValue(property).trim(),
      );
      if (width > 0 && width < 6 && height < 6 && colors.includes(String(this.fillStyle))) {
        this.canvas.dataset.sparks = String(Number(this.canvas.dataset.sparks ?? 0) + 1);
      }
      return fill.call(this, x, y, width, height);
    };
    prototype.drawImage = function (image: CanvasImageSource, ...coordinates: number[]) {
      if (this.globalAlpha < 1 && image instanceof HTMLImageElement) {
        this.canvas.dataset.completedSprite = image.src;
      }
      return Reflect.apply(draw, this, [image, ...coordinates]);
    };
  });
  await startRound(page, 'practice');
  const board = page.locator('#board');
  await hitNext(page, isMobile);
  await expect(board).toHaveAttribute('data-sparks', '0');
  await expect(board).toHaveAttribute('data-tap-alpha', '0.92');
  await expect(board).toHaveAttribute('data-completed-sprite', /alive/);
  await page.clock.runFor(160);
  await expect(board).toHaveAttribute('data-tap-alpha', '0.42');
  await expect(board).toHaveAttribute('data-sparks', '0');

  if (isMobile) await hitNext(page, true);
  else await page.keyboard.press(KEYS[await nextLane(page)] as string);
  await expect(page.locator('#score')).toHaveText('2');
  await expect(board).toHaveAttribute('data-sparks', '0');
  await expect(board).toHaveAttribute('data-tap-alpha', '0.92');
  expect(problems).toEqual([]);
});

test('canvas taps ignore lookahead rows and accept the lowest live target', async ({
  page,
  isMobile,
}) => {
  await openRush(page);
  await startRound(page);
  const board = page.locator('#board');
  await board.scrollIntoViewIfNeeded();
  const bounds = await board.boundingBox();
  if (!bounds) throw new Error('The playable board must be visible');
  const x = bounds.x + ((await nextLane(page)) + 0.5) * (bounds.width / 4);
  const tapAt = async (y: number): Promise<void> => {
    if (isMobile) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
  };
  await tapAt(bounds.y + bounds.height / 4);
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await tapAt(bounds.y + bounds.height - (bounds.width / 4) * 1.5);
  await expect(page.locator('#score')).toHaveText('1');
});

test('a timed round ends after twenty seconds and can restart or return to its menu', async ({
  page,
  isMobile,
}) => {
  await openRush(page);
  await startRound(page);
  await hitNext(page, isMobile);
  await advanceTime(page, 21_000);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'over');
  await expect(page.locator('#time')).toHaveText('0.0');
  await expect(page.locator('#score')).toHaveText('1');
  await page.locator('#again').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#score')).toHaveText('0');
  await hitNext(page, isMobile);
  const wrong = ((await nextLane(page)) + 1) % 4;
  await tapLane(page, wrong, isMobile);
  await expectMissThenResults(page);
  await page.locator('#menu').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  await startRound(page, 'endless');
  await hitNext(page, isMobile);
  await advanceTime(page, 21_000);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await tapLane(page, ((await nextLane(page)) + 1) % 4, isMobile);
  await expectMissThenResults(page);
});

test('pause freezes the clock and ignores lane keys until resumed', async ({ page, isMobile }) => {
  test.skip(isMobile, 'This scenario checks physical lane keys while the pause dialog is open.');
  await openRush(page);
  await startRound(page);
  await hitNext(page);
  await advanceTime(page, 1000);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
  const time = await page.locator('#time').innerText();
  const lane = await nextLane(page);
  await page.keyboard.press(KEYS[lane] as string);
  await advanceTime(page, 25_000);
  await expect(page.locator('#score')).toHaveText('1');
  await expect(page.locator('#time')).toHaveText(time);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeHidden();
  await page.keyboard.press(KEYS[lane] as string);
  await expect(page.locator('#score')).toHaveText('2');
  await advanceTime(page, 1000);
  await expect(page.locator('#time')).not.toHaveText(time);
});

test('best CPS persists without being replaced by an early failure', async ({ page, isMobile }) => {
  await openRush(page);
  await startRound(page);
  for (let hits = 0; hits < 3; hits++) await hitNext(page, isMobile);
  await advanceTime(page, 1250);
  const wrong = ((await nextLane(page)) + 1) % 4;
  await tapLane(page, wrong, isMobile);
  await expectMissThenResults(page);
  await expect(page.locator('#best')).toHaveCount(0);
  await expect(page.locator('#new-best')).toBeVisible();
  const cps = await page.locator('#final-cps').innerText();
  expect(Number(cps)).toBeCloseTo(2.4, 1);
  await expect(page.locator('#best-cps')).toHaveText(cps);
  await page.reload();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  await expect(page.locator('#score')).toHaveText('0');
  await expect(page.locator('#best-cps')).toHaveText(cps);
  await startRound(page);
  await hitNext(page, isMobile);
  await advanceTime(page, 999);
  await tapLane(page, ((await nextLane(page)) + 1) % 4, isMobile);
  await expectMissThenResults(page);
  await expect(page.locator('#final-cps')).toHaveText('0.00');
  await expect(page.locator('#new-best')).toBeHidden();
  await expect(page.locator('#best-cps')).toHaveText(cps);
  await page.locator('#menu').click();
  await startRound(page, 'endless');
  await expect(page.locator('#best-cps')).toHaveText('0.00');
  await hitNext(page, isMobile);
  await expect(page.locator('#time')).toHaveText('0.00');
  await advanceTime(page, 1250);
  // The live display uses the last animation frame; Finish samples the exact clock.
  expect(Number(await page.locator('#time').innerText())).toBeCloseTo(0.8, 1);
  await page.locator('#finish-run').click();
  await expect(page.locator('#best-cps')).toHaveText('0.80');
  await page.reload();
  await startRound(page, 'endless');
  await expect(page.locator('#best-cps')).toHaveText('0.80');
});

test('practice mistakes preserve the target and allow the next correct tap', async ({
  page,
  isMobile,
}) => {
  await openRush(page);
  await startRound(page, 'practice');
  await hitNext(page, isMobile);
  const lane = await nextLane(page);
  await tapLane(page, (lane + 1) % 4, isMobile);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await expect(page.locator('#score')).toHaveText('1');
  expect(await nextLane(page)).toBe(lane);
  await hitNext(page, isMobile);
  await expect(page.locator('#score')).toHaveText('2');
  await advanceTime(page, 21_000);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await page.locator('#finish-run').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'over');
  await expect(page.locator('#final-score')).toHaveText('2');
  await page.locator('#menu').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
});

test('the board and overlays fit small portrait and landscape screens during quick taps', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'Exercise the compact layouts with actual touch input.');
  await openRush(page);
  const sizes = [
    { width: 320, height: 568 },
    { width: 393, height: 851 },
    { width: 844, height: 390 },
  ];
  const expectNoOverflow = async (): Promise<void> => {
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      scrollX,
      scrollY,
    }));
    expect(dimensions.width).toBeLessThanOrEqual(dimensions.viewportWidth);
    expect(dimensions.height).toBeLessThanOrEqual(dimensions.viewportHeight);
    expect(dimensions.scrollX).toBe(0);
    expect(dimensions.scrollY).toBe(0);
  };

  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.clock.runFor(32);
    await expectNoOverflow();
    await expect(page.locator('#play')).toBeInViewport({ ratio: 1 });
    await startRound(page);
    await page.clock.runFor(32);
    await expectNoOverflow();
    for (let hits = 1; hits <= 3; hits++) {
      await hitNext(page, true);
      await page.clock.runFor(16);
      await expect(page.locator('#score')).toHaveText(String(hits));
    }
    await tapLane(page, ((await nextLane(page)) + 1) % 4, true);
    await expectMissThenResults(page);
    await expectNoOverflow();
    await expect(page.locator('#again')).toBeInViewport({ ratio: 1 });
    if (size.height < 500) {
      const again = await page.locator('#again').boundingBox();
      const board = await page.locator('#board').boundingBox();
      if (!again || !board) throw new Error('Replay and the board must have visible bounds');
      const x = again.x + again.width / 2;
      const y = again.y + again.height / 2;
      expect(y).toBeGreaterThanOrEqual(board.y + board.height - board.width / 4);
      expect(y).toBeLessThan(board.y + board.height);
      const lane = Math.floor((x - board.x) / (board.width / 4));
      await page.locator('#again').click();
      await hitNext(page, true);
      // Make the tap under Again a mistake, independent of the random target lane.
      for (let hits = 0; hits < 32 && (await nextLane(page)) === lane; hits++) {
        await hitNext(page, true);
      }
      expect(await nextLane(page)).not.toBe(lane);
      const score = await page.locator('#score').innerText();
      await page.touchscreen.tap(x, y);
      await expectMissThenResults(page);
      await expect(page.locator('#final-score')).toHaveText(score);
    }
    await page.locator('#menu').click();
    await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  }
});

test('desktop keeps a centered phone-width arena while the background grows', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Exercise resizing on a desktop with a fine pointer.');
  await page.setViewportSize({ width: 400, height: 800 });
  await openRush(page);
  await startRound(page, 'practice');
  const board = page.locator('#board');
  let hits = 0;
  for (const width of [400, 1280, 1920]) {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.runFor(32);
    const bounds = await board.boundingBox();
    if (!bounds) throw new Error('The playable board must be visible');
    expect(bounds.width).toBe(400);
    expect(bounds.height).toBe(800);
    expect(Math.abs(bounds.x + bounds.width / 2 - width / 2)).toBeLessThanOrEqual(1);
    expect(bounds.y).toBe(0);
    await board.focus();
    await expect(board).toBeFocused();
    await expect(board).toHaveCSS('outline-style', 'none');
    await hitNext(page);
    await expect(page.locator('#score')).toHaveText(String(++hits));
  }
});
