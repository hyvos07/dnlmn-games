/**
 * Merge the launcher, every non-draft game and public-root into one `dist/`,
 * then validate it (ARCHITECTURE §5). Exits non-zero on any violation.
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { DEFAULT_BUDGET_KB } from '@games/config/manifest';
import { loadGames } from './lib/manifests.ts';
import { gzipSize, initialFiles, kb, totalGzip } from './lib/sizes.ts';

export const LAUNCHER_CRITICAL_KB = 75;
export const LAUNCHER_ENHANCEMENT_KB = 200;
export const THUMBNAIL_KB = 40;
/** Looping card clips (ADR-011), loaded only by the enhancement layer. */
export const PREVIEW_KB = 300;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

const root = join(import.meta.dirname, '..');
const out = join(root, 'dist');
const errors: string[] = [];
const owners = new Map<string, string>();

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files;
}

const toPosix = (path: string) => path.split(sep).join('/');

/** Copy every file in `from` to `dist/<prefix>`, failing on any path that another source already owns. */
function copyTree(from: string, prefix: string, owner: string): void {
  for (const file of walk(from)) {
    const rel = toPosix(join(prefix, relative(from, file)));
    const existing = owners.get(rel);
    if (existing) {
      errors.push(`path collision: /${rel} is produced by both ${existing} and ${owner}`);
      continue;
    }
    owners.set(rel, owner);
    const target = join(out, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(file, target);
  }
}

function fail(): never {
  console.error(`\n✖ assemble failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

// 1–2. Validate manifests, skip drafts.
const { games, errors: manifestErrors } = loadGames(join(root, 'games'));
errors.push(...manifestErrors);
if (errors.length > 0) fail();
const shipped = games.filter((game) => game.manifest.status !== 'draft');
const skipped = games.filter((game) => game.manifest.status === 'draft');

// 3–5. Copy launcher, games, public-root.
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const launcherDist = join(root, 'apps', 'launcher', 'dist');
if (!existsSync(launcherDist))
  errors.push('apps/launcher/dist is missing (did the launcher build run?)');
else copyTree(launcherDist, '', 'launcher');

for (const game of shipped) {
  const gameDist = join(game.dir, 'dist');
  if (!existsSync(join(gameDist, 'index.html'))) {
    errors.push(`games/${game.slug}/dist/index.html is missing (did the game build run?)`);
    continue;
  }
  copyTree(gameDist, game.slug, `games/${game.slug}`);
}

const publicRoot = join(root, 'public-root');
if (existsSync(publicRoot)) copyTree(publicRoot, '', 'public-root');
if (errors.length > 0) fail();

// 6. Budgets.
interface Row {
  what: string;
  size: number;
  budget: number;
}
const rows: Row[] = [];
const check = (what: string, size: number, budgetBytes: number) => {
  rows.push({ what, size, budget: budgetBytes });
  if (size > budgetBytes) errors.push(`${what}: ${kb(size)} exceeds budget ${kb(budgetBytes)}`);
};

for (const game of shipped) {
  const html = join(out, game.slug, 'index.html');
  // Catch base-path bugs: absolute URLs in a game's HTML must stay under /<slug>/.
  const source = readFileSync(html, 'utf8');
  for (const match of source.matchAll(/\b(?:src|href)=["'](\/[^/"'][^"']*)["']/g)) {
    const url = match[1] ?? '';
    if (!url.startsWith(`/${game.slug}/`)) {
      errors.push(`games/${game.slug}: index.html references "${url}" outside /${game.slug}/`);
    }
  }
  const budgetKb = game.manifest.budgetKb ?? DEFAULT_BUDGET_KB;
  check(
    `game /${game.slug}/ initial download`,
    totalGzip(initialFiles(out, html)),
    budgetKb * 1024,
  );
}

const launcherFiles = [...owners].filter(([, owner]) => owner === 'launcher').map(([rel]) => rel);
const launcherPages = launcherFiles.filter((rel) => rel.endsWith('.html'));
const critical = new Set<string>();
let worstPage = { page: '', size: 0 };
for (const page of launcherPages) {
  const files = initialFiles(out, join(out, page));
  for (const file of files) critical.add(file);
  const size = totalGzip(files);
  if (size > worstPage.size) worstPage = { page, size };
}
const indexCritical = totalGzip(initialFiles(out, join(out, 'index.html')));
check('launcher critical path (/index.html)', indexCritical, LAUNCHER_CRITICAL_KB * 1024);
if (worstPage.page && worstPage.page !== 'index.html') {
  check(
    `launcher critical path (/${worstPage.page}, largest page)`,
    worstPage.size,
    LAUNCHER_CRITICAL_KB * 1024,
  );
}
const enhancement = launcherFiles
  .filter((rel) => rel.endsWith('.js') && !critical.has(join(out, rel)))
  .map((rel) => join(out, rel));
check(
  `launcher enhancement JS (${enhancement.length} chunk(s))`,
  totalGzip(enhancement),
  LAUNCHER_ENHANCEMENT_KB * 1024,
);

const thumbsDir = join(out, 'thumbs');
if (existsSync(thumbsDir)) {
  for (const file of walk(thumbsDir)) {
    const size = statSync(file).size;
    const path = `/${toPosix(relative(out, file))}`;
    if (file.endsWith('-preview.webp')) {
      check(`preview clip ${path}`, size, PREVIEW_KB * 1024);
    } else if (size > THUMBNAIL_KB * 1024) {
      errors.push(`${path}: ${kb(size)} exceeds thumbnail budget ${THUMBNAIL_KB} KB`);
    }
  }
}

for (const rel of owners.keys()) {
  const size = statSync(join(out, rel)).size;
  if (size >= MAX_FILE_BYTES)
    errors.push(`/${rel}: ${(size / 1048576).toFixed(1)} MiB exceeds the 25 MiB file limit`);
}

// Report.
console.log('\nassemble: dist/ ready');
console.log(
  `  games: ${shipped.map((g) => `${g.slug} (${g.manifest.status})`).join(', ') || '(none)'}`,
);
if (skipped.length > 0) console.log(`  skipped drafts: ${skipped.map((g) => g.slug).join(', ')}`);
console.log(`  files: ${owners.size}\n`);
const width = Math.max(...rows.map((row) => row.what.length));
for (const row of rows) {
  const ok = row.size <= row.budget ? '✔' : '✖';
  const pct = ((row.size / row.budget) * 100).toFixed(0).padStart(3);
  console.log(
    `  ${ok} ${row.what.padEnd(width)}  ${kb(row.size).padStart(9)} / ${kb(row.budget).padStart(9)}  ${pct}%`,
  );
}
if (enhancement.length > 0) {
  console.log('\n  enhancement chunks (gzip):');
  for (const file of enhancement)
    console.log(`    ${toPosix(relative(out, file)).padEnd(48)} ${kb(gzipSize(file))}`);
}

if (errors.length > 0) fail();
console.log('\n✔ all budgets and checks passed');
