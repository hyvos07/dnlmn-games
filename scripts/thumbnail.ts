/**
 * `pnpm thumbnail <slug> [--wait <ms>] [--selector <css>]`
 *
 * Builds the game, serves it at /<slug>/ with `vite preview`, lets it run (attract mode
 * or idle animation) and screenshots the game canvas into games/<slug>/thumbnail.png.
 * HUD and DOM overlays are hidden so the image shows real gameplay only.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SLUG_PATTERN } from '@games/config/manifest';
import { chromium } from '@playwright/test';
import { build, preview } from 'vite';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    wait: { type: 'string', default: '7000' },
    selector: { type: 'string', default: '[data-thumbnail], canvas' },
  },
});

const slug = positionals[0];
if (!slug || !SLUG_PATTERN.test(slug)) {
  console.error('usage: pnpm thumbnail <slug> [--wait <ms>] [--selector <css>]');
  process.exit(1);
}
const dir = join(import.meta.dirname, '..', 'games', slug);
const configFile = join(dir, 'vite.config.ts');
if (!existsSync(configFile)) {
  console.error(`no game at games/${slug}/`);
  process.exit(1);
}

await build({ configFile, logLevel: 'warn' });
const server = await preview({
  configFile,
  preview: { port: 4399, strictPort: false, open: false },
});
const url = server.resolvedUrls?.local[0] ?? `http://localhost:4399/${slug}/`;

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
try {
  const page = await browser.newPage({
    viewport: { width: 900, height: 1000 },
    deviceScaleFactor: 1,
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(message.text());
  });
  await page.goto(url);
  await page.addStyleTag({
    content: '[data-games-hud], .overlay, [data-overlay] { visibility: hidden !important; }',
  });
  await page.waitForTimeout(Number(values.wait));
  if (problems.length > 0) {
    throw new Error(`the game logged errors, not writing a thumbnail:\n  ${problems.join('\n  ')}`);
  }
  const target = page.locator(values.selector).first();
  const out = join(dir, 'thumbnail.png');
  await target.screenshot({ path: out });
  const box = await target.boundingBox();
  console.log(
    `✔ wrote games/${slug}/thumbnail.png (${Math.round(box?.width ?? 0)}×${Math.round(box?.height ?? 0)})`,
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}
