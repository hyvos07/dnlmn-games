import type { GameManifest } from './manifest.ts';

export const SITE_ORIGIN = 'https://games.dnlmn.dev';
export const SITE_NAME = 'Games by dnlmn';
export const SITE_DESCRIPTION =
  'Play Snake, 2048, Tetris, Pixel Rush and Typing Fortress in your browser. Free games, no downloads, no accounts, no ads or tracking.';
export const COVER_ALT =
  'Games by dnlmn with a lime Snake, floating Tetris blocks, a 2048 tile and a pixel creature on a dark background';

/** Safe for an inline JSON-LD script, including manifest text containing HTML. */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export function gameStructuredData(manifest: GameManifest) {
  const url = `${SITE_ORIGIN}/${manifest.slug}/`;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    '@id': `${url}#game`,
    name: manifest.title,
    description: manifest.description ?? manifest.tagline,
    url,
    image: `${SITE_ORIGIN}/og/${manifest.slug}.png`,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web browser',
    gamePlatform: 'Web browser',
    genre: manifest.tags,
    inLanguage: 'en',
    isAccessibleForFree: true,
  };
}
