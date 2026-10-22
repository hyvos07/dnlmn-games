import { expect, type Page, test } from '@playwright/test';
import {
  type Action,
  act,
  cells,
  createGame,
  type GameState,
  snapshot,
  tick,
} from '../../games/tetris/src/logic/engine.ts';
import { trackProblems } from './helpers.ts';

const route = '/tetris/';
const startTime = new Date('2026-10-22T12:00:00.000Z');
const ZEN_KEY = 'dnlmn:tetris:zen-v1';
const HANDLING_KEY = 'dnlmn:tetris:handling-v1';

async function openGame(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install({ time: startTime });
  await page.clock.pauseAt(startTime);
  const response = await page.goto(route);
  expect(response?.status()).toBe(200);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'menu');
  await page.clock.runFor(48);
}

async function waitForBoardRender(page: Page): Promise<{ width: number; height: number }> {
  await page.evaluate(() => document.fonts.ready);
  const board = page.locator('#board');
  await expect(board).toBeVisible();
  await expect
    .poll(() =>
      board.evaluate((canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const scale = Math.min(2, window.devicePixelRatio || 1);
        return (
          canvas.width === Math.round(rect.width * scale) &&
          canvas.height === Math.round(rect.height * scale)
        );
      }),
    )
    .toBe(true);
  // Force the controller's synchronous resize refresh after geometry settles.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  return board.evaluate((canvas: HTMLCanvasElement) => ({
    width: canvas.width,
    height: canvas.height,
  }));
}

async function expectSavedPiecesRendered(page: Page, state: GameState): Promise<void> {
  const palette = {
    I: '#4ad8e9',
    O: '#f2c84c',
    T: '#c18aff',
    S: '#8fe35c',
    Z: '#ff6d79',
    J: '#6496ff',
    L: '#ff9a50',
  };
  const points = state.board.flatMap((row, y) =>
    row.flatMap((kind, x) => (kind && y >= 20 ? [{ x, y, color: palette[kind] }] : [])),
  );
  for (const cell of cells(state.active))
    if (cell.y >= 20) points.push({ ...cell, color: palette[state.active.kind] });
  // Sample solid cell centers: edge antialiasing may differ after a resize/reload.
  const actual = await page.locator('#board').evaluate((element, samples) => {
    const canvas = element as HTMLCanvasElement;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas context unavailable');
    return samples.map(({ x, y }) => {
      const pixel = context.getImageData(
        Math.floor(((x + 0.5) * canvas.width) / 10),
        Math.floor(((y - 20 + 0.5) * canvas.height) / 20),
        1,
        1,
      ).data;
      return `#${[...pixel]
        .slice(0, 3)
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`;
    });
  }, points);
  expect(points.length).toBeGreaterThanOrEqual(8);
  expect(actual).toEqual(points.map(({ color }) => color));
}

async function startMode(page: Page, mode: 'sprint' | 'blitz' | 'zen'): Promise<void> {
  await page.locator(`[data-mode="${mode}"]`).click();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'play');
  await expect(page.locator('[data-run-mode]')).toHaveText(
    mode === 'sprint' ? '40 LINES' : mode.toUpperCase(),
  );
}

async function readSaved<T>(page: Page, key: string): Promise<T | null> {
  const state = await page.context().storageState();
  const origin = state.origins.find((entry) => entry.origin === new URL(page.url()).origin);
  const value = origin?.localStorage.find((entry) => entry.name === key)?.value;
  return value ? (JSON.parse(value) as T) : null;
}

async function returnToModes(page: Page): Promise<void> {
  const modes = page.locator('.play-actions [data-command="menu"]');
  if (await modes.isVisible()) {
    await modes.click();
    return;
  }
  await page.locator('[data-command="pause"]').click();
  await page.locator('[data-banner-actions] [data-command="menu"]').click();
}

test('the menu starts each of its three modes', async ({ page }) => {
  const problems = trackProblems(page);
  await openGame(page);
  await expect(page.locator('[data-mode]')).toHaveCount(3);
  for (const mode of ['sprint', 'blitz', 'zen'] as const) {
    await startMode(page, mode);
    await expect(page.locator('#board')).toBeVisible();
    await returnToModes(page);
    await expect(page.locator('#app')).toHaveAttribute('data-screen', 'menu');
  }
  expect(problems).toEqual([]);
});

test('hold and hard drop restore every saved Zen piece after reload', async ({
  page,
  isMobile,
}) => {
  const problems = trackProblems(page);
  await openGame(page);
  await startMode(page, 'zen');
  if (isMobile) {
    await page.locator('.touch-controls [data-action="hold"]').click();
    await page.locator('.touch-controls [data-action="drop"]').click();
  } else {
    await page.keyboard.press('c');
    await page.keyboard.press('Space');
  }

  const firstCanvas = await waitForBoardRender(page);
  const saved = await readSaved<{ version: number; state: GameState }>(page, ZEN_KEY);
  expect(saved?.version).toBe(1);
  expect(saved?.state.mode).toBe('zen');
  expect(saved?.state.pieces).toBe(1);
  expect(saved?.state.hold).not.toBeNull();
  expect(saved?.state.canHold).toBe(true);
  if (!saved) throw new Error('Zen save missing');
  await expectSavedPiecesRendered(page, saved.state);

  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'menu');
  await startMode(page, 'zen');
  const resumedCanvas = await waitForBoardRender(page);
  const resumed = await readSaved<{ version: number; state: GameState }>(page, ZEN_KEY);
  expect(resumed?.state).toEqual(saved?.state);
  expect(resumedCanvas).toEqual(firstCanvas);
  if (!resumed) throw new Error('Resumed Zen save missing');
  await expectSavedPiecesRendered(page, resumed.state);
  expect(problems).toEqual([]);
});

test('Zen undo and redo update the persisted board and survive a reload', async ({
  page,
  isMobile,
}) => {
  await openGame(page);
  await startMode(page, 'zen');
  if (isMobile) await page.locator('.touch-controls [data-action="drop"]').click();
  else await page.keyboard.press('Space');
  const dropped = await readSaved<{ state: GameState }>(page, ZEN_KEY);
  expect(dropped?.state.pieces).toBe(1);

  if (isMobile) await page.locator('.touch-controls [data-command="undo"]').click();
  else await page.keyboard.press('Control+z');
  const undone = await readSaved<{ state: GameState }>(page, ZEN_KEY);
  expect(undone?.state.pieces).toBe(0);
  expect(undone?.state.board.flat().every((cell) => cell === null)).toBe(true);

  if (isMobile) await page.locator('.touch-controls [data-command="redo"]').click();
  else await page.keyboard.press('Control+y');
  const redone = await readSaved<{ state: GameState }>(page, ZEN_KEY);
  expect(redone?.state).toEqual(dropped?.state);
  await page.reload();
  await startMode(page, 'zen');
  expect((await readSaved<{ state: GameState }>(page, ZEN_KEY))?.state).toEqual(dropped?.state);
});

test('handling values and a remapped movement key persist and control play', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Keyboard remapping is covered with a physical desktop keyboard.');
  await openGame(page);
  await page.locator('.menu-foot [data-command="settings"]').click();
  await page.locator('#das').fill('180');
  await page.locator('#arr').fill('0');
  await page.locator('#sdf').fill('55');
  await page.locator('#keybinds [data-bind="left"]').click();
  await page.keyboard.press('j');
  await expect(page.locator('#keybinds [data-bind="left"]')).toContainText('J');
  await page.getByRole('button', { name: 'Done' }).click();

  const handling = await readSaved<{
    das: number;
    arr: number;
    sdf: number;
    bindings: { left: string[] };
  }>(page, HANDLING_KEY);
  expect(handling).toMatchObject({ das: 180, arr: 0, sdf: 55, bindings: { left: ['KeyJ'] } });
  await page.reload();
  await page.locator('.menu-foot [data-command="settings"]').click();
  await expect(page.locator('#das')).toHaveValue('180');
  await expect(page.locator('#arr')).toHaveValue('0');
  await expect(page.locator('#sdf')).toHaveValue('55');
  await expect(page.locator('#keybinds [data-bind="left"]')).toContainText('J');
  await page.getByRole('button', { name: 'Done' }).click();

  await startMode(page, 'sprint');
  const board = page.locator('#board');
  const before = await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.keyboard.press('ArrowLeft');
  expect(await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).toBe(before);
  await page.keyboard.press('j');
  expect(await board.evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL())).not.toBe(before);
});

test('pause freezes the Sprint timer and resume continues it', async ({ page }) => {
  await openGame(page);
  await startMode(page, 'sprint');
  await page.clock.runFor(1_216);
  const timeBeforePause = await page.locator('[data-stat="time"]').innerText();
  expect(timeBeforePause).not.toBe('0:00.000');

  await page.locator('[data-command="pause"]').click();
  await expect(page.locator('[data-banner-title]')).toHaveText('PAUSED');
  await page.clock.runFor(3_000);
  await expect(page.locator('[data-stat="time"]')).toHaveText(timeBeforePause);
  await page.locator('[data-banner-actions] [data-command="resume"]').click();
  await page.clock.runFor(512);
  expect(await page.locator('[data-stat="time"]').innerText()).not.toBe(timeBeforePause);
});

test('Blitz counts down to time up while the player keeps the board clear', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'The long timer simulation runs in the desktop project.');
  test.setTimeout(180_000);
  const problems = trackProblems(page);
  await page.addInitScript(() => {
    Math.random = () => 0.05;
  });
  await openGame(page);
  const seed = await page.evaluate(() => Date.now());
  await startMode(page, 'blitz');
  await expect(page.locator('[data-time-label]')).toHaveText('LEFT');
  await expect(page.locator('[data-stat="time"]')).toHaveText('2:00.000');

  const model = createGame('blitz', seed);
  let nextDropAt = 0;
  const codes: Record<Action, string> = {
    left: 'ArrowLeft',
    right: 'ArrowRight',
    down: 'ArrowDown',
    cw: 'ArrowUp',
    ccw: 'KeyZ',
    flip: 'KeyA',
    drop: 'Space',
    hold: 'KeyC',
  };
  const inputActions = async (actions: Action[]) => {
    await page.evaluate(
      (actionCodes) => {
        for (const code of actionCodes) {
          window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
          window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
        }
      },
      actions.map((action) => codes[action]),
    );
  };

  for (let elapsed = 0; elapsed < 120_000 && !model.ended; elapsed += 100) {
    await page.clock.fastForward(100);
    deterministicRandom(() => tick(model, 100));
    if (elapsed >= nextDropAt && !model.ended) {
      const choice = deterministicRandom(() => bestPlacement(model));
      if (!choice) break;
      await inputActions(choice.actions);
      deterministicRandom(() => {
        for (const action of choice.actions) act(model, action);
      });
      nextDropAt = elapsed + 300;
    }
    if (
      elapsed % 10_000 === 9_900 &&
      (await page.locator('#app').getAttribute('data-screen')) !== 'play'
    )
      break;
  }
  expect(model.elapsed).toBe(120_000);
  expect(model.lines).toBeGreaterThan(0);
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'results');
  await expect(page.locator('[data-banner-title]')).toHaveText('TIME UP.');
  await expect(page.locator('[data-stat="time"]')).toHaveText('0:00.000');
  const records = await readSaved<{ sprint: number | null; blitz: number }>(
    page,
    'dnlmn:tetris:records-v1',
  );
  expect(records?.blitz).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-screen', 'menu');
  await expect(page.locator('[data-mode="blitz"] [data-record="blitz"]')).toHaveText(
    records?.blitz.toLocaleString() ?? '',
  );
  expect(problems).toEqual([]);
});

test('touch buttons rotate and hard drop a piece on mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Touch actions require the configured touchscreen project.');
  await openGame(page);
  await startMode(page, 'zen');
  await page.getByRole('button', { name: 'Rotate clockwise' }).tap();
  await page.getByRole('button', { name: 'Hard drop' }).tap();
  const saved = await readSaved<{ state: GameState }>(page, ZEN_KEY);
  expect(saved?.state.pieces).toBe(1);
});

function bestPlacement(state: GameState): { actions: Action[]; state: GameState } | null {
  let best: { actions: Action[]; state: GameState; value: number } | null = null;
  for (let rotations = 0; rotations < 4; rotations++) {
    for (let shift = -6; shift <= 6; shift++) {
      const trial = snapshot(state);
      const actions: Action[] = [];
      for (let index = 0; index < rotations; index++) {
        act(trial, 'cw');
        actions.push('cw');
      }
      const direction: Action = shift < 0 ? 'left' : 'right';
      for (let index = 0; index < Math.abs(shift); index++) {
        const before = trial.active.x;
        act(trial, direction);
        if (trial.active.x === before) break;
        actions.push(direction);
      }
      act(trial, 'drop');
      actions.push('drop');
      if (trial.ended) continue;
      const lines = trial.lines - state.lines;
      const surface = boardCost(trial);
      const value = lines * 14 - surface;
      if (!best || value > best.value) best = { actions, state: trial, value };
    }
  }
  return best;
}

function boardCost(state: GameState): number {
  const heights: number[] = [];
  let holes = 0;
  let aggregate = 0;
  for (let x = 0; x < 10; x++) {
    let first = 40;
    let filledBelow = false;
    let height = 0;
    for (let y = 0; y < 40; y++) {
      if (state.board[y]?.[x]) {
        first = Math.min(first, y);
        filledBelow = true;
        height = 40 - first;
      } else if (filledBelow) holes++;
    }
    heights.push(height);
    aggregate += height;
  }
  const bumpiness = heights
    .slice(1)
    .reduce((sum, height, index) => sum + Math.abs(height - (heights[index] ?? 0)), 0);
  return aggregate * 0.35 + holes * 5 + bumpiness * 0.22 + Math.max(...heights) * 0.7;
}

function deterministicRandom<T>(action: () => T): T {
  const original = Math.random;
  Math.random = () => 0.05;
  try {
    return action();
  } finally {
    Math.random = original;
  }
}
