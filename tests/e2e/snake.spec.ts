import { expect, type Page, test } from '@playwright/test';
import type { Dir, Vec } from '../../games/snake/src/logic/grid.ts';
import { createRng } from '../../games/snake/src/logic/rng.ts';
import { createState } from '../../games/snake/src/logic/snake.ts';

const BOARD = { cols: 20, rows: 20 };
const SEED = 12345;
const FRAME_MS = 16;
const STEP_MS = 140;

const KEYS: Record<Dir, string> = {
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
};

/** The snake starts at the head cell (6, 10) heading right; one entry per grid step. */
function routeTo(food: Vec): Dir[] {
  const head = createState(BOARD, createRng(SEED)).body[0] as Vec;
  const moves: Dir[] = [];
  const repeat = (dir: Dir, count: number) => {
    for (let i = 0; i < count; i++) moves.push(dir);
  };
  const vertical = (fromY: number) => {
    const dy = food.y - fromY;
    repeat(dy > 0 ? 'down' : 'up', Math.abs(dy));
  };

  if (food.x > head.x) {
    repeat('right', food.x - head.x);
    vertical(head.y);
  } else if (food.x === head.x) {
    vertical(head.y);
  } else {
    // Can't reverse into the neck: sidestep vertically first, then run left, then finish.
    const sidestep: Dir = food.y >= head.y ? 'down' : 'up';
    moves.push(sidestep);
    repeat('left', head.x - food.x);
    vertical(head.y + (sidestep === 'down' ? 1 : -1));
  }
  return moves;
}

/**
 * Drive the snake along `moves` on a paused fake clock so every grid step is deterministic.
 * The game runs a fixed 140 ms step off requestAnimationFrame (16 ms frames under the fake
 * clock). Keys are pressed mid-way between steps so a one-frame model error can't matter.
 */
async function steer(page: Page, moves: Dir[]): Promise<void> {
  let acc = STEP_MS / 2 - FRAME_MS; // the exact phase after Space is unknown, so assume the middle
  const modelFrame = (): boolean => {
    acc += FRAME_MS;
    if (acc < STEP_MS) return false;
    acc -= STEP_MS;
    return true;
  };

  let heading: Dir = 'right';
  for (const move of moves) {
    if (move !== heading) {
      await page.keyboard.press(KEYS[move]);
      heading = move;
    }
    let frames = 0;
    let ticked = false;
    while (!ticked) {
      ticked = modelFrame();
      frames++;
    }
    for (let i = 0; i < 4; i++) {
      modelFrame();
      frames++;
    }
    await page.clock.runFor(frames * FRAME_MS);
  }
}

async function openWithFakeClock(page: Page): Promise<void> {
  await page.clock.install();
  await page.goto(`/snake/?seed=${SEED}`);
  await expect(page.locator('#start')).toBeVisible();
  await page.clock.pauseAt(new Date(Date.now() + 10_000));
  await page.clock.runFor(FRAME_MS * 3); // flush the stale first frame
}

async function startRound(page: Page): Promise<void> {
  await page.keyboard.press('Space');
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'playing');
}

async function eatFirstFood(page: Page): Promise<void> {
  await openWithFakeClock(page);
  const food = createState(BOARD, createRng(SEED)).food;
  expect(food).not.toBeNull();
  await startRound(page);
  await steer(page, routeTo(food as Vec));
  await page.clock.runFor(FRAME_MS * 12);
}

test('seeded round: steering to the food scores', async ({ page }) => {
  await eatFirstFood(page);
  await expect(page.locator('#score')).toHaveText('10');
  await page.clock.resume();
  await page.screenshot({ path: 'test-results/snake-mid-game.png' });
});

test('the high score persists across a reload', async ({ page }) => {
  await eatFirstFood(page);
  // Keep going straight until the snake hits a wall and the game-over card appears.
  const over = page.locator('#over');
  for (let i = 0; i < 60 && !(await over.isVisible()); i++) await page.clock.runFor(STEP_MS);
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#best')).toHaveText('10');

  await page.clock.resume();
  await page.reload();
  await expect(page.locator('#best')).toHaveText('10');
  await expect(page.locator('#score')).toHaveText('0');
});

test('Esc pauses behind a Resume overlay and Esc again resumes', async ({ page }) => {
  await page.goto('/snake/');
  await page.keyboard.press('Space');
  await expect(page.locator('#stage')).toHaveAttribute('data-mode', 'playing');

  await page.keyboard.press('Escape');
  const resume = page.getByRole('button', { name: 'Resume', exact: true });
  await expect(resume.first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('mute persists across a reload', async ({ page }) => {
  await page.goto('/snake/');
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('dnlmn:global:muted'))).toBe('true');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Unmute', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem('dnlmn:global:muted'))).toBe('true');
});
