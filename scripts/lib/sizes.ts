import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

export function gzipSize(file: string): number {
  return gzipSync(readFileSync(file), { level: 9 }).length;
}

export function kb(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

const SCRIPT_SRC = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
const INLINE_SCRIPT = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
const LINK_TAG = /<link\b[^>]*>/gi;
const ATTR = (name: string) => new RegExp(`\\b${name}=["']([^"']+)["']`, 'i');

/** Same-origin URLs of scripts, stylesheets and modulepreloads referenced by an HTML document. */
export function htmlAssetUrls(html: string): string[] {
  const urls: string[] = [];
  for (const match of html.matchAll(SCRIPT_SRC)) if (match[1]) urls.push(match[1]);
  // Inline module scripts (Astro inlines small ones) can statically import chunks.
  for (const match of html.matchAll(INLINE_SCRIPT)) urls.push(...staticImports(match[1] ?? ''));
  for (const match of html.matchAll(LINK_TAG)) {
    const tag = match[0];
    const rel = ATTR('rel').exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = ATTR('href').exec(tag)?.[1];
    if (!href) continue;
    if (rel === 'stylesheet' || rel === 'modulepreload') urls.push(href);
  }
  return urls.filter((url) => !/^(https?:)?\/\//i.test(url) && !url.startsWith('data:'));
}

// Static `import … from "x"`, `import "x"` and `export … from "x"`. Dynamic `import("x")` is excluded
// because a quote must directly follow `import`/`from`, never a parenthesis.
const STATIC_IMPORT =
  /(?:\bimport\s*(?:[\w$*{}\s,]+?\s*from\s*)?|\bexport\s*[\w$*{}\s,]*?\s*from\s*)["']([^"']+)["']/g;

/** Relative specifiers statically imported by an ES module. */
export function staticImports(code: string): string[] {
  const out: string[] = [];
  for (const match of code.matchAll(STATIC_IMPORT)) {
    const spec = match[1];
    if (spec && (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('/'))) {
      out.push(spec);
    }
  }
  return out;
}

/**
 * Resolve a URL from an HTML page or module to a file inside `root` (the site root).
 * `fromFile` is the referencing file, used for relative URLs.
 */
export function resolveUrl(root: string, fromFile: string, url: string): string | undefined {
  const clean = url.split(/[?#]/)[0] ?? '';
  const file = clean.startsWith('/')
    ? join(root, ...clean.split('/').filter(Boolean))
    : normalize(join(dirname(fromFile), clean));
  const rel = relative(root, file);
  if (rel.startsWith('..') || rel.split(sep).includes('..')) return undefined;
  return existsSync(file) ? file : undefined;
}

/**
 * The initial download of an HTML page: the page itself, everything it links
 * (scripts, stylesheets, modulepreloads), plus the static import graph of its JS.
 * Dynamic imports are not followed, so lazily loaded chunks are excluded.
 */
export function initialFiles(root: string, htmlFile: string): Set<string> {
  const files = new Set<string>([htmlFile]);
  const queue: string[] = [];
  const html = readFileSync(htmlFile, 'utf8');
  for (const url of htmlAssetUrls(html)) {
    const file = resolveUrl(root, htmlFile, url);
    if (file && !files.has(file)) {
      files.add(file);
      queue.push(file);
    }
  }
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (!file.endsWith('.js') && !file.endsWith('.mjs')) continue;
    for (const spec of staticImports(readFileSync(file, 'utf8'))) {
      const dep = resolveUrl(root, file, spec);
      if (dep && !files.has(dep)) {
        files.add(dep);
        queue.push(dep);
      }
    }
  }
  return files;
}

export function totalGzip(files: Iterable<string>): number {
  let total = 0;
  for (const file of files) total += gzipSize(file);
  return total;
}
