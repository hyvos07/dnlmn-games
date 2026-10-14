import { expect, type Locator, type Page } from '@playwright/test';

/** Step a paused browser clock until a public UI transition, with a bounded simulation budget. */
export async function advanceUntilVisible(
  page: Page,
  target: Locator,
  maximumMs = 90_000,
): Promise<void> {
  for (let elapsed = 0; elapsed < maximumMs && !(await target.isVisible()); elapsed += 2000) {
    await page.clock.runFor(Math.min(2000, maximumMs - elapsed));
  }
  await expect(target).toBeVisible();
}

/** Collect console errors, uncaught exceptions and 4xx/5xx responses for a page. */
export function trackProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`);
  });
  return problems;
}
