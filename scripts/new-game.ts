/** `pnpm new-game <slug> [--engine vanilla|kaplay] [--title "Nice Title"]`: scaffold a game from a template. */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fillPlaceholders, titleCase, validateNewSlug, validateTitle } from './lib/scaffold.ts';

const ROOT = join(import.meta.dirname, '..');
const GAMES = join(ROOT, 'games');
const TEXT_EXTENSIONS = new Set(['.json', '.ts', '.html', '.css', '.md', '.svg']);
const ENGINES = ['vanilla', 'kaplay'];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function option(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

/** CRC-32 as PNG chunks require it. */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

/** A solid-colour RGB PNG, built by hand so the scaffolder needs no image dependency. */
function solidPng(size: number, [r, g, b]: [number, number, number]): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  // Each scanline is a filter byte (0 = none) followed by the pixels.
  const row = Buffer.alloc(1 + size * 3);
  for (let x = 0; x < size; x++) row.set([r, g, b], 1 + x * 3);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Today as YYYY-MM-DD in local time (toISOString would use UTC and can be a day off). */
function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fill placeholders in every text file under `dir`. */
function fillTree(dir: string, vars: Record<string, string>): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) fillTree(path, vars);
    else if (TEXT_EXTENSIONS.has(extname(entry.name))) {
      writeFileSync(path, fillPlaceholders(readFileSync(path, 'utf8'), vars));
    }
  }
}

const slug = process.argv[2];
if (!slug || slug.startsWith('--')) {
  fail('usage: pnpm new-game <slug> [--engine vanilla|kaplay] [--title "Nice Title"]');
}

const existing = existsSync(GAMES) ? readdirSync(GAMES) : [];
const slugError = validateNewSlug(slug, existing);
if (slugError) fail(slugError);

const title = option('title') ?? titleCase(slug);
const titleError = validateTitle(title);
if (titleError) fail(titleError);

const engine = option('engine') ?? 'kaplay';
if (engine === 'kaplay')
  fail('The kaplay template arrives in PLAN Phase 3. Use --engine vanilla for now.');
if (!ENGINES.includes(engine)) fail(`Unknown engine "${engine}". Allowed: ${ENGINES.join(', ')}.`);

const template = join(ROOT, 'packages', 'templates', engine);
if (!existsSync(template)) fail(`Missing template: packages/templates/${engine}/`);

const dest = join(GAMES, slug);
mkdirSync(GAMES, { recursive: true });
cpSync(template, dest, { recursive: true });
fillTree(dest, {
  SLUG: slug,
  TITLE: title,
  DATE: today(),
});
// Placeholder so the folder is complete; `pnpm thumbnail <slug>` replaces it later.
writeFileSync(join(dest, 'thumbnail.png'), solidPng(640, [0x16, 0x16, 0x1c]));
console.log(`Created games/${slug} from the ${engine} template.`);

// pnpm is a .cmd shim on Windows. The slug is validated above, so the shell is safe.
const install = spawnSync('pnpm', ['install'], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
if (install.status !== 0) fail('pnpm install failed. Run it manually once the problem is fixed.');

console.log(`
Next steps:
  1. pnpm dev:game ${slug}          (http://localhost:5173/${slug}/)
  2. Edit games/${slug}/game.json (tagline, description, tags, controls)
  3. pnpm thumbnail ${slug}         to replace the placeholder thumbnail
  4. Set "status": "published" in game.json when it is ready`);
