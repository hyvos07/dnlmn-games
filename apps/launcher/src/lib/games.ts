import { getCollection } from 'astro:content';
import { type GameManifest, thumbnailAlt } from '@games/config/manifest';

export interface Game extends GameManifest {
  /** 1-based position by release order, shown as "No. 01". */
  number: number;
  href: string;
  alt: string;
  categories: string[];
  /** URL of the looping card clip (ADR-011), if the game ships one. */
  previewSrc?: string;
}

/** Published games in release order, oldest first. Hidden and draft games are never listed. */
export async function getGames(): Promise<Game[]> {
  const entries = await getCollection('games');
  const published = entries
    .map((entry) => entry.data)
    .filter((game) => game.status === 'published')
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.slug.localeCompare(b.slug));
  return published.map((game, i) => ({
    ...game,
    number: i + 1,
    href: `/${game.slug}/`,
    alt: thumbnailAlt(game),
    categories: gameCategories(game),
    previewSrc: game.preview ? `/thumbs/${game.slug}-preview.webp` : undefined,
  }));
}

/** Launcher categories stay in this order, including categories with no games yet. */
export const CATEGORIES = ['mobile', 'desktop', 'classic', 'special'] as const;

export function gameCategories(game: Pick<GameManifest, 'input' | 'tags'>): string[] {
  return [
    ...(game.input.includes('touch') ? ['mobile'] : []),
    ...(game.input.some((input) => input === 'keyboard' || input === 'mouse' || input === 'gamepad')
      ? ['desktop']
      : []),
    game.tags.includes('classic') ? 'classic' : 'special',
  ];
}

export function tagCounts(games: readonly Game[]): Array<{ tag: string; count: number }> {
  return CATEGORIES.map((tag) => ({
    tag,
    count: games.filter((game) => game.categories.includes(tag)).length,
  }));
}

export const pad = (n: number) => String(n).padStart(2, '0');

export const label = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1).replace('-', ' ');
