import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  gzipSize,
  htmlAssetUrls,
  initialFiles,
  kb,
  resolveUrl,
  staticImports,
  totalGzip,
} from './sizes.ts';

const dirs: string[] = [];

function makeRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'sizes-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function write(root: string, rel: string, content: string): string {
  const file = join(root, ...rel.split('/'));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

describe('htmlAssetUrls', () => {
  it('picks up scripts, stylesheets and modulepreloads', () => {
    const html = `
      <script type="module" crossorigin src="/_astro/entry.js"></script>
      <link rel="stylesheet" href="/_astro/app.css">
      <link rel="modulepreload" href="./chunk.js">`;
    expect(htmlAssetUrls(html)).toEqual(['/_astro/entry.js', '/_astro/app.css', './chunk.js']);
  });

  it('handles single quotes and attribute order', () => {
    const html = `<link href='/a.css' rel='stylesheet'><script src='/b.js'></script>`;
    expect(htmlAssetUrls(html).sort()).toEqual(['/a.css', '/b.js']);
  });

  it('ignores icons, preloaded fonts, absolute and data URLs', () => {
    const html = `
      <link rel="icon" href="/favicon.svg">
      <link rel="preload" as="font" href="/font.woff2">
      <script src="https://example.com/x.js"></script>
      <script src="//cdn.example.com/y.js"></script>
      <link rel="stylesheet" href="https://example.com/z.css">
      <link rel="stylesheet" href="data:text/css,body{}">
      <script src="data:text/javascript,1"></script>`;
    expect(htmlAssetUrls(html)).toEqual([]);
  });

  it('ignores inline scripts without src', () => {
    expect(htmlAssetUrls('<script>var a=1</script>')).toEqual([]);
  });
});

describe('staticImports', () => {
  it('finds minified static import/export forms', () => {
    const code =
      'import{a as b}from"./x.js";import"./y.js";export{c}from"./z.js";import*as n from"./n.js";';
    expect(staticImports(code)).toEqual(['./x.js', './y.js', './z.js', './n.js']);
  });

  it('finds spaced forms and parent/root-relative specifiers', () => {
    const code = `import foo from '../up.js';\nimport { a, b } from "/abs.js";\nexport * from './all.js';`;
    expect(staticImports(code)).toEqual(['../up.js', '/abs.js', './all.js']);
  });

  it('excludes dynamic imports and bare specifiers', () => {
    const code =
      'import("./lazy.js");import x from"react";import"lodash";const m=import("./l2.js");';
    expect(staticImports(code)).toEqual([]);
  });
});

describe('resolveUrl', () => {
  it('resolves root-absolute and relative URLs, stripping query and hash', () => {
    const root = makeRoot();
    const entry = write(root, '_astro/entry.js', '');
    const a = write(root, '_astro/a.js', '');
    expect(resolveUrl(root, join(root, 'index.html'), '/_astro/entry.js?v=1#x')).toBe(entry);
    expect(resolveUrl(root, entry, './a.js')).toBe(a);
  });

  it('returns undefined for missing files', () => {
    const root = makeRoot();
    expect(resolveUrl(root, join(root, 'index.html'), '/nope.js')).toBeUndefined();
  });

  it('returns undefined for paths escaping the root', () => {
    const root = makeRoot();
    const html = join(root, 'index.html');
    expect(resolveUrl(root, html, '../../etc/passwd')).toBeUndefined();
    expect(resolveUrl(root, html, '../outside.js')).toBeUndefined();
  });
});

describe('initialFiles', () => {
  it('follows static imports but not dynamic ones', () => {
    const root = makeRoot();
    const html = write(
      root,
      'index.html',
      `<link rel="stylesheet" href="/_astro/app.css">
       <script type="module" src="/_astro/entry.js"></script>
       <link rel="modulepreload" href="./_astro/a.js">`,
    );
    const css = write(root, '_astro/app.css', 'body{}');
    const entry = write(
      root,
      '_astro/entry.js',
      'import{x}from"./a.js";const l=()=>import("./lazy.js");export{x,l};',
    );
    const a = write(root, '_astro/a.js', 'import"./b.js";export const x=1;');
    const b = write(root, '_astro/b.js', 'export const y=2;');
    const lazy = write(root, '_astro/lazy.js', 'export const z=3;');

    const files = initialFiles(root, html);
    expect(files).toEqual(new Set([html, css, entry, a, b]));
    expect(files.has(lazy)).toBe(false);
  });

  it('handles import cycles and missing targets', () => {
    const root = makeRoot();
    const html = write(root, 'index.html', '<script src="/m.js"></script>');
    const m = write(root, 'm.js', 'import"./n.js";import"./missing.js";');
    const n = write(root, 'n.js', 'import"./m.js";');
    expect(initialFiles(root, html)).toEqual(new Set([html, m, n]));
  });
});

describe('gzipSize / totalGzip / kb', () => {
  it('returns positive sizes', () => {
    const root = makeRoot();
    const f1 = write(root, 'a.txt', 'hello world '.repeat(100));
    const f2 = write(root, 'b.txt', 'another file');
    expect(gzipSize(f1)).toBeGreaterThan(0);
    expect(gzipSize(f1)).toBeLessThan(1200);
    expect(totalGzip([f1, f2])).toBe(gzipSize(f1) + gzipSize(f2));
    expect(totalGzip([])).toBe(0);
  });

  it('formats kilobytes', () => {
    expect(kb(2048)).toBe('2.0 KB');
    expect(kb(0)).toBe('0.0 KB');
    expect(kb(1536)).toBe('1.5 KB');
  });
});

describe('htmlAssetUrls with inline module scripts', () => {
  it('follows static imports inside inline scripts but not dynamic ones', () => {
    const html =
      '<script type="module">import"/_astro/boot.js";import("/_astro/lazy.js")</script>' +
      '<script type="application/ld+json">{"a":1}</script>';
    expect(htmlAssetUrls(html)).toEqual(['/_astro/boot.js']);
  });
});
