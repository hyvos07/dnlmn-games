import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { type HtmlTagDescriptor, mergeConfig, type Plugin, type UserConfig } from 'vite';
import { formatIssues, type GameManifest, manifestSchema } from './manifest.ts';
import { gameStructuredData, SITE_NAME, SITE_ORIGIN, serializeJsonLd } from './seo.ts';
import { SURFACES } from './theme.ts';

export { SITE_ORIGIN } from './seo.ts';

/** Read and validate `<dir>/game.json`. Throws with readable messages on failure. */
export function readGameManifest(dir: string): GameManifest {
  const file = join(dir, 'game.json');
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const result = manifestSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${file}:\n  ${formatIssues(result.error).join('\n  ')}`);
  }
  const folder = basename(resolve(dir));
  if (result.data.slug !== folder) {
    throw new Error(`slug mismatch in ${file}: "${result.data.slug}" != folder "${folder}"`);
  }
  return result.data;
}

/**
 * The only supported way to configure a game's Vite build (RULES §2).
 *
 * ```ts
 * import { defineGameConfig } from '@games/config/vite';
 * export default defineGameConfig(import.meta.dirname);
 * ```
 */
export function defineGameConfig(dir: string, overrides: UserConfig = {}): UserConfig {
  if (overrides.base !== undefined) {
    throw new Error('defineGameConfig: `base` comes from the slug and cannot be overridden');
  }
  const manifest = readGameManifest(dir);
  const base: UserConfig = {
    root: dir,
    base: `/${manifest.slug}/`,
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'es2022',
      assetsInlineLimit: 4096,
      sourcemap: false,
    },
    server: { port: 4321, strictPort: true },
    plugins: [gameHtml(manifest)],
  };
  return mergeConfig(base, overrides);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Injects title, description, canonical and Open Graph tags from the manifest. */
function gameHtml(manifest: GameManifest): Plugin {
  const url = `${SITE_ORIGIN}/${manifest.slug}/`;
  const title = `${manifest.title} · Play Online · ${SITE_NAME}`;
  const description = manifest.description ?? manifest.tagline;
  const image = `${SITE_ORIGIN}/og/${manifest.slug}.png`;
  const imageAlt = `${manifest.title}: ${manifest.tagline}`;
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs,
    injectTo: 'head',
  });

  return {
    name: 'games:html-meta',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        const withTitle = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '');
        const tags: HtmlTagDescriptor[] = [
          { tag: 'title', children: escapeHtml(title), injectTo: 'head' },
          meta({ name: 'description', content: description }),
          meta({
            name: 'robots',
            content:
              manifest.status === 'published'
                ? 'index, follow, max-image-preview:large'
                : 'noindex, follow',
          }),
          meta({ name: 'theme-color', content: SURFACES.dark.bg }),
          { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
          meta({ property: 'og:type', content: 'website' }),
          meta({ property: 'og:site_name', content: SITE_NAME }),
          meta({ property: 'og:title', content: manifest.title }),
          meta({ property: 'og:description', content: description }),
          meta({ property: 'og:url', content: url }),
          meta({ property: 'og:image', content: image }),
          meta({ property: 'og:image:type', content: 'image/png' }),
          meta({ property: 'og:image:alt', content: imageAlt }),
          meta({ property: 'og:image:width', content: '1200' }),
          meta({ property: 'og:image:height', content: '630' }),
          meta({ name: 'twitter:card', content: 'summary_large_image' }),
          meta({ name: 'twitter:title', content: title }),
          meta({ name: 'twitter:description', content: description }),
          meta({ name: 'twitter:image', content: image }),
          meta({ name: 'twitter:image:alt', content: imageAlt }),
          {
            tag: 'script',
            attrs: { type: 'application/ld+json' },
            children: serializeJsonLd(gameStructuredData(manifest)),
            injectTo: 'head',
          },
        ];
        // Game templates may include a description/theme tag already. The
        // manifest owns these fields, so replace them instead of duplicating
        // contradictory metadata in the initial HTML.
        const managedMeta = new Set(
          tags
            .filter((tag) => tag.tag === 'meta')
            .map((tag) => tag.attrs?.name ?? tag.attrs?.property),
        );
        const cleaned = withTitle
          .replace(/<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) => {
            const attr = /\b(?:name|property)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag);
            const name = (attr?.[1] ?? attr?.[2] ?? attr?.[3] ?? '').toLowerCase();
            return managedMeta.has(name) ? '' : tag;
          })
          .replace(/<link\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (tag) =>
            /\brel\s*=\s*(?:"canonical"|'canonical'|canonical(?=[\s>]))/i.test(tag) ? '' : tag,
          );
        return { html: cleaned, tags };
      },
    },
  };
}
