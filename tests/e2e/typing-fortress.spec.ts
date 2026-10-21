import { expect, type Page, test } from '@playwright/test';
import { trackProblems } from './helpers.ts';

const ENEMIES = '.enemy-word[data-word][data-enemy-id]';

/** Freeze the browser clock, not game internals; every action uses the public interface. */
async function openWatch(page: Page): Promise<string[]> {
  const problems = trackProblems(page);
  const startTime = new Date('2026-01-01T12:00:00Z');
  await page.clock.install({ time: startTime });
  // Freeze before navigation so slow loading cannot overrun the pause timestamp.
  await page.clock.pauseAt(new Date(startTime.getTime() + 10_000));
  const response = await page.goto('/typing-fortress/');
  expect(response?.status()).toBe(200);
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  await expect(page.locator('#play')).toBeVisible();
  await page.locator('.typing-options summary').click();
  await page.locator('#typing-mode').selectOption('editable');
  await page.locator('.typing-options summary').click();
  await page.clock.runFor(700);
  return problems;
}

async function startWatch(page: Page): Promise<void> {
  await page.locator('#play').click();
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
  await page.clock.runFor(700);
  await expect(page.locator(ENEMIES).first()).toBeVisible();
  await expect(page.locator('#typing-input')).toBeFocused();
}

async function binding(page: Page): Promise<{ word: string; id: string }> {
  const label = page.locator(ENEMIES).first();
  const word = await label.getAttribute('data-word');
  const id = await label.getAttribute('data-enemy-id');
  if (!word || !id) throw new Error('A visible creature must expose its binding word and label id');
  return { word, id };
}

/** Drive an unattended siege at 20 fps without replaying every intermediate WebGL frame. */
async function advanceSiegeUntilOver(page: Page): Promise<void> {
  const stage = page.locator('#stage');
  for (let elapsed = 0; elapsed < 90_000; elapsed += 1000) {
    if ((await stage.getAttribute('data-screen')) === 'over') break;
    // The game admits at most 50 ms per frame. Short jumps preserve that simulation time;
    // a single large fastForward would advance gameplay by only one clamped frame.
    for (let frame = 0; frame < 20; frame++) await page.clock.fastForward(50);
  }
  await expect(stage).toHaveAttribute('data-screen', 'over');
}

test.describe('Typing Fortress physical keyboard play', () => {
  test.skip(({ isMobile }) => isMobile, 'Physical keyboard gameplay is advertised for desktop.');

  test('a mistake stays editable without changing enemy words, and Backspace repairs it before completion', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    await startWatch(page);
    const { word, id } = await binding(page);
    const label = page.locator(`${ENEMIES}[data-enemy-id="${id}"]`);
    const bounds = await label.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const container = element.parentElement?.getBoundingClientRect();
      const textWidth = [...element.querySelectorAll('.word-prefix, .word-rest')].reduce(
        (total, span) => total + span.getBoundingClientRect().width,
        0,
      );
      return {
        center: box.left + box.width / 2,
        anchor: (container?.left ?? 0) + Number.parseFloat(element.style.left),
        width: box.width,
        textWidth,
      };
    });
    expect(Math.abs(bounds.center - bounds.anchor)).toBeLessThan(1);
    // Single-word creatures have only their text, 20 px padding, and a 2 px border.
    expect(Math.abs(bounds.width - bounds.textWidth - 22)).toBeLessThan(1);
    const words = await page
      .locator(ENEMIES)
      .evaluateAll((labels) => labels.map((item) => item.getAttribute('data-word')));
    const prefix = word.slice(0, 1);
    await page.keyboard.type(prefix);
    await expect(page.locator('#typing-input')).toHaveValue(prefix);
    await expect(label.locator('.word-prefix')).toHaveText(prefix);
    await expect(label.locator('.word-rest')).toHaveText(word.slice(1));

    const wrong = [...'abcdefghijklmnopqrstuvwxyz'].find(
      (letter) => !words.some((active) => active?.startsWith(prefix + letter)),
    );
    if (!wrong) throw new Error('Expected a rejected continuation for this visible prefix');
    await page.keyboard.type(wrong);
    await page.clock.runFor(32);
    await expect(page.locator('#typing-input')).toHaveValue(prefix + wrong);
    await expect(label.locator('.word-prefix')).toHaveText('');
    await expect(page.locator(`${ENEMIES}.is-error`)).toHaveCount(1);
    expect(
      await page
        .locator(ENEMIES)
        .evaluateAll((labels) => labels.map((item) => item.getAttribute('data-word'))),
    ).toEqual(words);
    await expect(page.locator('#accuracy')).toHaveText('50');
    await expect(page.locator('#score')).toHaveText('0');

    // Combat feedback belongs in the reserved gap, so it cannot hide words or input.
    const toast = await page.locator('#battle-toast').boundingBox();
    const strip = await page.locator('.rune-strip').boundingBox();
    const labelBottoms = await page
      .locator(ENEMIES)
      .evaluateAll((labels) => labels.map((item) => item.getBoundingClientRect().bottom));
    if (!toast || !strip) throw new Error('Combat feedback and the typing strip must be visible');
    expect(toast.y).toBeGreaterThan(Math.max(...labelBottoms));
    expect(toast.y + toast.height).toBeLessThan(strip.y);

    await page.keyboard.press('Backspace');
    await expect(page.locator('#typing-input')).toHaveValue(prefix);
    await expect(label.locator('.word-prefix')).toHaveText(prefix);
    await expect(page.locator('#accuracy')).toHaveText('50');
    await page.keyboard.type(word.slice(1));
    await expect(label).toHaveCount(0);
    await expect(page.locator('#typing-input')).toHaveValue('');
    expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(
      0,
    );
    await expect(page.locator('#accuracy')).toHaveText(
      String(Math.round((word.length / (word.length + 1)) * 100)),
    );
    expect(problems).toEqual([]);
  });

  test('f and m type normally, Escape freezes the siege, and restarting clears the defeated run', async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Exercise the full siege at a desktop size that is practical for software WebGL in CI.
    await page.setViewportSize({ width: 800, height: 600 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const problems = await openWatch(page);
    await page.locator('[data-difficulty="fast-hand"]').click();
    await startWatch(page);
    const mute = page.locator('[data-games-hud] button[aria-label="Mute"]');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.type('fm');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    expect(await page.evaluate(() => document.fullscreenElement === null)).toBe(true);
    await page.keyboard.press('Backspace');
    await expect(page.locator('#typing-input')).toHaveValue('f');
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await expect(page.locator('#typing-input')).toHaveValue('');

    const { word, id } = await binding(page);
    const label = page.locator(`${ENEMIES}[data-enemy-id="${id}"]`);
    await page.keyboard.type(word.slice(0, 1));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeVisible();
    await expect(page.locator('#typing-input')).toHaveJSProperty('readOnly', true);
    const position = await label.getAttribute('style');
    const score = await page.locator('#score').innerText();
    await page.keyboard.type('z');
    await page.clock.runFor(5000);
    expect(await label.getAttribute('style')).toBe(position);
    await expect(page.locator('#score')).toHaveText(score);
    await expect(page.locator('#typing-input')).toHaveValue(word.slice(0, 1));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused', exact: true })).toBeHidden();
    await expect(page.locator('#typing-input')).toBeFocused();
    await expect(page.locator('#typing-input')).toHaveJSProperty('readOnly', false);
    await page.clock.runFor(250);
    expect(await label.getAttribute('style')).not.toBe(position);
    await page.keyboard.type(word.slice(1));
    expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(
      0,
    );

    // Let the public simulation reach defeat naturally; no state injection or test-only hooks.
    await advanceSiegeUntilOver(page);
    await expect(page.locator('#final-score')).not.toHaveText('0');
    await page.clock.runFor(700);
    await page.locator('#again').click();
    await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'playing');
    await expect(page.locator('#score')).toHaveText('0');
    await expect(page.locator('#accuracy')).toHaveText('100');
    await expect(page.locator('#typing-input')).toHaveValue('');
    await page.clock.runFor(700);
    await expect(page.locator(ENEMIES)).toHaveCount(1);
    await expect(page.locator('#health-text')).toHaveText('100%');
    const next = await binding(page);
    await page.keyboard.type(next.word);
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${next.id}"]`)).toHaveCount(0);
    expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(
      0,
    );
    expect(problems).toEqual([]);
  });

  test('cursor movement, middle Backspace, selection, and replacement survive HUD refreshes', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    await startWatch(page);
    const { word, id } = await binding(page);
    const input = page.locator('#typing-input');
    const prefix = word.slice(0, 2);
    await page.keyboard.type(prefix);
    await page.keyboard.press('ArrowLeft');
    await page.clock.runFor(500);
    expect(
      await input.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([1, 1]);
    await page.keyboard.press('Backspace');
    await expect(input).toHaveValue(prefix.slice(1));
    expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(0);
    await page.keyboard.type(prefix[0] ?? '');
    await expect(input).toHaveValue(prefix);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+End');
    await page.clock.runFor(300);
    expect(
      await input.evaluate((element: HTMLInputElement) => [
        element.selectionStart,
        element.selectionEnd,
      ]),
    ).toEqual([1, 2]);
    const wrong = [...'abcdefghijklmnopqrstuvwxyz'].find((letter) => letter !== prefix[1]);
    if (!wrong) throw new Error('Expected a replacement character');
    await page.keyboard.type(wrong);
    await expect(input).toHaveValue(prefix[0] + wrong);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+End');
    await page.keyboard.type(prefix.slice(1));
    await expect(input).toHaveValue(prefix);
    await page.keyboard.press('End');
    await page.keyboard.type(word.slice(2));
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${id}"]`)).toHaveCount(0);
    await expect(input).toHaveValue('');
    expect(problems).toEqual([]);
  });

  test('Delete in the middle fires immediately when the complete field matches a monster', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    await startWatch(page);
    const { word, id } = await binding(page);
    const input = page.locator('#typing-input');
    await page.keyboard.type(`${word[0]}z${word.slice(1)}`);
    await expect(input).toHaveValue(`${word[0]}z${word.slice(1)}`);
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${id}"]`)).toBeVisible();
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.clock.runFor(300);
    await page.keyboard.press('Delete');
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${id}"]`)).toHaveCount(0);
    await expect(input).toHaveValue('');
    expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(
      0,
    );
    expect(problems).toEqual([]);
  });

  test('pretyped text is checked against a newly spawned monster without another keystroke', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    const seedTime = new Date('2026-10-14T00:00:00Z');
    await page.clock.setSystemTime(seedTime);
    await startWatch(page);
    const { word } = await binding(page);
    await page.reload();
    await expect(page.locator('#play')).toBeVisible();
    await page.clock.setSystemTime(seedTime);
    await page.locator('#play').click();
    await expect(page.locator(ENEMIES)).toHaveCount(0);
    await page.keyboard.type(word);
    await expect(page.locator('#typing-input')).toHaveValue(word);
    await expect(page.locator('#score')).toHaveText('0');
    await page.clock.runFor(700);
    await expect(page.locator(ENEMIES)).toHaveCount(0);
    await expect(page.locator('#typing-input')).toHaveValue('');
    expect(Number((await page.locator('#score').innerText()).replaceAll(',', ''))).toBeGreaterThan(
      0,
    );
    const score = await page.locator('#score').innerText();
    await page.clock.runFor(700);
    await expect(page.locator('#score')).toHaveText(score);
    await page.reload();
    await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
    await expect(page.locator('#menu-best')).toHaveText(score);
    expect(problems).toEqual([]);
  });

  test('composition stays editable until committed and uppercase text matches without duplicate scoring', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    await startWatch(page);
    const { word, id } = await binding(page);
    const input = page.locator('#typing-input');
    await input.evaluate((element: HTMLInputElement, text) => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      element.value = text;
      element.setSelectionRange(1, 1);
      element.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertCompositionText',
          data: text,
          isComposing: true,
        }),
      );
    }, word.toUpperCase());
    await page.clock.runFor(300);
    await expect(input).toHaveValue(word.toUpperCase());
    expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(1);
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${id}"]`)).toBeVisible();
    await expect(page.locator('#score')).toHaveText('0');
    await input.evaluate((element) =>
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })),
    );
    await expect(page.locator(`${ENEMIES}[data-enemy-id="${id}"]`)).toHaveCount(0);
    await expect(input).toHaveValue('');
    const score = await page.locator('#score').innerText();
    await input.evaluate((element) =>
      element.dispatchEvent(
        new InputEvent('input', { bubbles: true, inputType: 'insertText', data: 'cat' }),
      ),
    );
    await page.clock.runFor(500);
    await expect(page.locator('#score')).toHaveText(score);
    await expect(page.locator('#accuracy')).toHaveText('100');
    expect(problems).toEqual([]);
  });

  test('best scores persist through reload and stay separate for each difficulty', async ({
    page,
  }) => {
    const problems = await openWatch(page);
    await page.locator('[data-difficulty="baby"]').click();
    await startWatch(page);
    await page.keyboard.type((await binding(page)).word);
    const score = await page.locator('#score').innerText();
    expect(Number(score.replaceAll(',', ''))).toBeGreaterThan(0);
    await page.clock.resume();
    await page.reload();
    await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
    await expect(page.locator('[data-difficulty="baby"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#menu-best')).toHaveText(score);
    await page.locator('[data-difficulty="normal"]').click();
    await expect(page.locator('#menu-best')).toHaveText('0');
    await page.locator('[data-difficulty="fast-hand"]').click();
    await expect(page.locator('#menu-best')).toHaveText('0');
    await page.locator('[data-difficulty="baby"]').click();
    await expect(page.locator('#menu-best')).toHaveText(score);
    expect(problems).toEqual([]);
  });
});

test('Typing Fortress has a compact menu with its tagline beside the crest', async ({ page }) => {
  const problems = trackProblems(page);
  await page.goto('/typing-fortress/');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('.brand-line')).toContainText('An endless wordfire siege');
  await expect(page.locator('.lore-dialog, #lore-open, .menu-intro, .brand-dot')).toHaveCount(0);
  await expect(page.locator('.brand-line')).not.toContainText('Rune Bastion');
  const crest = await page.locator('.brand-line .crest').boundingBox();
  const tagline = await page.locator('.brand-line .eyebrow').boundingBox();
  expect(crest).not.toBeNull();
  expect(tagline).not.toBeNull();
  if (!crest || !tagline) throw new Error('Menu header is missing');
  expect(tagline.x).toBeGreaterThan(crest.x + crest.width);
  expect(Math.abs(tagline.y + tagline.height / 2 - crest.y - crest.height / 2)).toBeLessThan(2);
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});

test('Typing Fortress explains its physical keyboard requirement on phones', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'This guidance applies to the mobile viewport.');
  const problems = trackProblems(page);
  await page.goto('/typing-fortress/');
  await expect(page.locator('#stage')).toHaveAttribute('data-screen', 'menu');
  await expect(page.locator('.mobile-notice')).toBeVisible();
  await expect(page.locator('.mobile-notice')).toContainText('physical keyboard');
  await expect(page.locator('[data-games-hud]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.waitForLoadState('networkidle');
  expect(problems).toEqual([]);
});
