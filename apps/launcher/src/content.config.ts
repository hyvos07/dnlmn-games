import { defineCollection } from 'astro:content';
import { manifestSchema } from '@games/config/manifest';
import { glob } from 'astro/loaders';

/** Every games/<slug>/game.json, validated with the same schema the build uses. */
const games = defineCollection({
  loader: glob({
    pattern: '*/game.json',
    base: '../../games',
    generateId: ({ entry }) => entry.split('/')[0] ?? entry,
  }),
  schema: manifestSchema,
});

export const collections = { games };
