import { z } from 'zod';

/** Slug format from ARCHITECTURE §3. The slug is the folder name and the URL path. */
export const SLUG_PATTERN = /^[a-z][a-z0-9-]{1,30}$/;

/** Paths owned by the launcher or reserved for later. A game can never use these. */
export const RESERVED_SLUGS = [
  'about',
  'api',
  'og',
  'thumbs',
  'assets',
  'static',
  '_astro',
  'tag',
  'tags',
  'play',
  'admin',
  '404',
] as const;

/** Tag vocabulary from RULES §6. Add new tags here in the PR that first uses them. */
export const TAGS = [
  'arcade',
  'puzzle',
  'action',
  'platformer',
  'casual',
  'strategy',
  'classic',
  'idle',
  'rhythm',
  'word',
  'physics',
  'two-player',
  'experimental',
] as const;

export const ENGINES = ['vanilla', 'kaplay', 'phaser', 'pixi', 'three', 'godot'] as const;
export const INPUTS = ['keyboard', 'mouse', 'touch', 'gamepad'] as const;
export const ORIENTATIONS = ['any', 'landscape', 'portrait'] as const;
export const STATUSES = ['draft', 'hidden', 'published'] as const;

/** Default gzipped initial-download budget for a standard game (RULES §4). */
export const DEFAULT_BUDGET_KB = 1536;

export type Tag = (typeof TAGS)[number];
export type Engine = (typeof ENGINES)[number];
export type InputKind = (typeof INPUTS)[number];
export type Orientation = (typeof ORIENTATIONS)[number];
export type Status = (typeof STATUSES)[number];

const reserved: readonly string[] = RESERVED_SLUGS;

export const manifestSchema = z.strictObject({
  slug: z
    .string()
    .regex(SLUG_PATTERN, 'slug must match ^[a-z][a-z0-9-]{1,30}$')
    .refine((slug) => !reserved.includes(slug), { message: 'slug is reserved (ARCHITECTURE §3)' }),
  title: z.string().min(1).max(40),
  tagline: z.string().min(1).max(60),
  description: z.string().max(400).optional(),
  engine: z.enum(ENGINES),
  tags: z.array(z.enum(TAGS)).min(1),
  input: z.array(z.enum(INPUTS)).min(1),
  controls: z.partialRecord(z.enum(INPUTS), z.string().min(1)).optional(),
  orientation: z.enum(ORIENTATIONS).default('any'),
  /** A file name inside the game folder (no subfolders or `..`), so games can't reach each other. */
  thumbnail: z
    .string()
    .regex(/^[\w-]+\.(png|jpe?g|webp)$/i, 'thumbnail must be a plain image file name')
    .default('thumbnail.png'),
  /** Alt text for the thumbnail. Falls back to a generated description. */
  thumbnailAlt: z.string().min(1).max(200).optional(),
  /**
   * Optional looping gameplay clip (animated WebP, written by `pnpm thumbnail`) that the
   * launcher card plays as an enhancement (ADR-011). Same file-name rule as `thumbnail`.
   */
  preview: z
    .string()
    .regex(/^[\w-]+\.webp$/i, 'preview must be a plain .webp file name')
    .optional(),
  status: z.enum(STATUSES),
  addedAt: z.iso.date(),
  version: z.string().optional(),
  budgetKb: z.number().int().positive().optional(),
});

/** A validated manifest, with defaults applied. */
export type GameManifest = z.output<typeof manifestSchema>;
/** The shape of `game.json` as written on disk. */
export type GameManifestInput = z.input<typeof manifestSchema>;

export function parseManifest(data: unknown): GameManifest {
  return manifestSchema.parse(data);
}

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
    return `${path}: ${issue.message}`;
  });
}

export function thumbnailAlt(manifest: Pick<GameManifest, 'title' | 'thumbnailAlt'>): string {
  return manifest.thumbnailAlt ?? `Gameplay screenshot of ${manifest.title}`;
}
