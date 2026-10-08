import { getCollection } from 'astro:content';
import { type GameManifest, thumbnailAlt } from '@games/config/manifest';

export interface Game extends GameManifest {
  /** 1-based position by release order, shown as "No. 01". */
  number: number;
  href: string;
  alt: string;
  touch: boolean;
}

/** Published games, newest first. Hidden and draft games are never listed. */
export async function getGames(): Promise<Game[]> {
  const entries = await getCollection('games');
  const published = entries
    .map((entry) => entry.data)
    .filter((game) => game.status === 'published')
    .sort((a, b) => a.addedAt.localeCompare(b.addedAt) || a.slug.localeCompare(b.slug));
  return published
    .map((game, i) => ({
      ...game,
      number: i + 1,
      href: `/${game.slug}/`,
      alt: thumbnailAlt(game),
      touch: game.input.includes('touch'),
    }))
    .reverse();
}

/** Tags used by at least one published game, with counts, most used first. */
export function tagCounts(games: readonly Game[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const game of games)
    for (const tag of game.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export const pad = (n: number) => String(n).padStart(2, '0');

export const label = (tag: string) => tag.charAt(0).toUpperCase() + tag.slice(1).replace('-', ' ');
