/**
 * `pnpm thumbnail <slug> [--wait <ms>] [--selector <css>] [--quality <1-100>] [--still]`
 *
 * Builds the game, serves it at /<slug>/ with `vite preview` and lets it run (attract
 * mode or idle animation) on Playwright's fake clock, so every captured frame is exactly
 * one tick apart no matter how slow the screenshots are. Writes:
 *   games/<slug>/thumbnail.png  a still of the game canvas
 *   games/<slug>/preview.webp   a seamless looping clip for the launcher card (ADR-011),
 *                               unless --still. The still is the clip's first frame.
 * HUD and DOM overlays are hidden so both show real gameplay only.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { SLUG_PATTERN } from '@games/config/manifest';
import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { build, preview } from 'vite';
import {
  framesNeeded,
  loopFrames,
  PREVIEW_FADE,
  PREVIEW_FPS,
  PREVIEW_SECONDS,
  PREVIEW_SIZE,
} from './lib/preview.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    wait: { type: 'string', default: '4000' },
    selector: { type: 'string', default: '[data-thumbnail], canvas' },
    quality: { type: 'string', default: '70' },
    still: { type: 'boolean', default: false },
  },
});

const slug = positionals[0];
if (!slug || !SLUG_PATTERN.test(slug)) {
  console.error(
    'usage: pnpm thumbnail <slug> [--wait <ms>] [--selector <css>] [--quality <1-100>] [--still]',
  );
  process.exit(1);
}
const dir = join(import.meta.dirname, '..', 'games', slug);
const quality = Math.min(100, Math.max(1, Number(values.quality) || 70));
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

const length = PREVIEW_FPS * PREVIEW_SECONDS;
const total = values.still ? 1 : framesNeeded(length, PREVIEW_FADE);

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
let frames: Buffer[] = [];
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
  // The fake clock drives timers, Date, performance.now and requestAnimationFrame.
  await page.clock.install();
  await page.goto(url);
  await page.addStyleTag({
    content: '[data-games-hud], .overlay, [data-overlay] { visibility: hidden !important; }',
  });
  await page.clock.runFor(Number(values.wait));
  const target = page.locator(values.selector).first();
  for (let i = 0; i < total; i++) {
    await page.clock.runFor(1000 / PREVIEW_FPS);
    frames.push(await target.screenshot());
  }
  if (problems.length > 0) {
    throw new Error(`the game logged errors, not writing a thumbnail:\n  ${problems.join('\n  ')}`);
  }
} finally {
  await browser.close();
  await new Promise<void>((resolve) => server.httpServer.close(() => resolve()));
}

// The still is the first frame the clip shows, so the card can swap one for the other.
const still = (values.still ? frames[0] : frames[PREVIEW_FADE]) as Buffer;
writeFileSync(join(dir, 'thumbnail.png'), still);
const { width = 0, height = 0 } = await sharp(still).metadata();
console.log(`✔ wrote games/${slug}/thumbnail.png (${width}×${height})`);

if (!values.still) {
  const raw = await Promise.all(
    frames.map((frame) =>
      sharp(frame)
        .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'cover' })
        .removeAlpha()
        .raw()
        .toBuffer(),
    ),
  );
  frames = [];
  const loop = loopFrames(raw, length, PREVIEW_FADE);
  const pngs = await Promise.all(
    loop.map((pixels) =>
      sharp(pixels, { raw: { width: PREVIEW_SIZE, height: PREVIEW_SIZE, channels: 3 } })
        .png()
        .toBuffer(),
    ),
  );
  const out = join(dir, 'preview.webp');
  const info = await sharp(pngs, { join: { animated: true } })
    .webp({ quality, effort: 6, loop: 0, delay: 1000 / PREVIEW_FPS, smartSubsample: true })
    .toFile(out);
  console.log(
    `✔ wrote games/${slug}/preview.webp (${PREVIEW_SIZE}px, ${loop.length} frames, ${Math.round(info.size / 1024)} KB)`,
  );
  const manifest = JSON.parse(readFileSync(join(dir, 'game.json'), 'utf8')) as { preview?: string };
  if (manifest.preview !== 'preview.webp') {
    console.log(
      `  add "preview": "preview.webp" to games/${slug}/game.json to show it on the card`,
    );
  }
}
