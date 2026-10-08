/**
 * Prebuild step for the launcher: optimise every game's thumbnail into
 * public/thumbs/<slug>-<size>.{avif,webp} and render a basic Open Graph card into
 * public/og/<slug>.png (plus og/home.png). Both folders are generated and gitignored.
 * Outputs newer than their sources are skipped, so `astro dev` restarts stay fast.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { getAccent, SURFACES } from '@games/config/theme';
import sharp, { type OverlayOptions } from 'sharp';
import { loadGames } from '../../../scripts/lib/manifests.ts';

export const THUMB_SIZES = [400, 800] as const;

const root = join(import.meta.dirname, '..');
const thumbsDir = join(root, 'public', 'thumbs');
const ogDir = join(root, 'public', 'og');
mkdirSync(thumbsDir, { recursive: true });
mkdirSync(ogDir, { recursive: true });

const accent = getAccent();
// OG cards use the accent, so they're rebuilt when the theme changes.
const themeSource = join(root, '..', '..', 'packages', 'config', 'src', 'theme.ts');
const ink = SURFACES.dark.bg;
const paper = SURFACES.dark.fg;
const muted = SURFACES.dark.muted;

const fresh = (out: string, sources: string[]) =>
  existsSync(out) && sources.every((src) => statSync(out).mtimeMs >= statSync(src).mtimeMs);

const xml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const DISPLAY = "'Bricolage Grotesque', 'Arial Black', 'Helvetica Neue', Arial, sans-serif";

function ogText(title: string, tagline: string): Buffer {
  const size = title.length > 12 ? 96 : 132;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <rect width="1200" height="630" fill="${ink}"/>
  <rect x="64" y="64" width="64" height="12" rx="6" fill="${accent.accent}"/>
  <text x="64" y="${330 - size / 2}" font-family="${DISPLAY}" font-weight="800" font-size="${size}" letter-spacing="-4" fill="${paper}">${xml(title)}</text>
  <text x="64" y="${380}" font-family="Arial, sans-serif" font-size="34" fill="${muted}">${xml(tagline)}</text>
  <text x="64" y="566" font-family="${DISPLAY}" font-weight="800" font-size="34" fill="${accent.accent}">games.dnlmn.dev</text>
</svg>`);
}

async function ogCard(out: string, title: string, tagline: string, thumbnail?: string) {
  const layers: OverlayOptions[] = [];
  if (thumbnail) {
    const mask = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="470" height="470"><rect width="470" height="470" rx="28"/></svg>',
    );
    const image = await sharp(thumbnail)
      .resize(470, 470, { fit: 'cover' })
      .composite([{ input: mask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    layers.push({ input: image, left: 666, top: 80 });
  }
  await sharp(ogText(title, tagline)).composite(layers).png({ compressionLevel: 9 }).toFile(out);
}

const { games, errors } = loadGames(join(root, '..', '..', 'games'));
if (errors.length > 0) {
  console.error(`gen-images: manifest errors (run pnpm check):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}

let written = 0;
for (const { slug, dir, manifest } of games) {
  if (manifest.status === 'draft') continue;
  const source = join(dir, manifest.thumbnail);
  const gameJson = join(dir, 'game.json');
  for (const size of THUMB_SIZES) {
    const base = sharp(source).resize(size, size, { fit: 'cover' });
    const avif = join(thumbsDir, `${slug}-${size}.avif`);
    const webp = join(thumbsDir, `${slug}-${size}.webp`);
    if (!fresh(avif, [source])) {
      await base.clone().avif({ quality: 55, effort: 6 }).toFile(avif);
      written++;
    }
    if (!fresh(webp, [source])) {
      await base.clone().webp({ quality: 78 }).toFile(webp);
      written++;
    }
  }
  const og = join(ogDir, `${slug}.png`);
  if (!fresh(og, [source, gameJson, themeSource])) {
    await ogCard(og, manifest.title, manifest.tagline, source);
    written++;
  }
}

const home = join(ogDir, 'home.png');
if (!fresh(home, [themeSource])) {
  await ogCard(home, 'Games by dnlmn', 'Small browser games. Free, instant, no install.');
  written++;
}
console.log(`gen-images: ${written} file(s) written`);
