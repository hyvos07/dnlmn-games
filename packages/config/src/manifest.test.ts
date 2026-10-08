import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BUDGET_KB,
  ENGINES,
  formatIssues,
  type GameManifestInput,
  manifestSchema,
  parseManifest,
  RESERVED_SLUGS,
  SLUG_PATTERN,
  TAGS,
  thumbnailAlt,
} from './manifest.ts';

const valid: GameManifestInput = {
  slug: 'snake',
  title: 'Snake',
  tagline: 'Eat, grow, do not bite yourself.',
  description: 'A classic.',
  engine: 'vanilla',
  tags: ['arcade', 'classic'],
  input: ['keyboard', 'touch'],
  controls: { keyboard: 'Arrow keys' },
  orientation: 'landscape',
  thumbnail: 'thumb.png',
  thumbnailAlt: 'A snake',
  status: 'published',
  addedAt: '2026-10-08',
  version: '1.0.0',
  budgetKb: 2048,
};

const minimal = {
  slug: 'snake',
  title: 'Snake',
  tagline: 'Tagline',
  engine: 'vanilla',
  tags: ['arcade'],
  input: ['keyboard'],
  status: 'draft',
  addedAt: '2026-10-08',
};

function rejects(patch: Record<string, unknown>): boolean {
  return !manifestSchema.safeParse({ ...valid, ...patch }).success;
}

describe('manifestSchema', () => {
  it('parses a full manifest unchanged', () => {
    expect(parseManifest(valid)).toEqual(valid);
  });

  it('applies defaults', () => {
    const parsed = parseManifest(minimal);
    expect(parsed.orientation).toBe('any');
    expect(parsed.thumbnail).toBe('thumbnail.png');
  });

  it('exposes a positive default budget', () => {
    expect(DEFAULT_BUDGET_KB).toBeGreaterThan(0);
  });

  it.each(['Snake', '1snake', 'a', `a${'b'.repeat(31)}`, 'has_underscore', 'has space', ''])(
    'rejects bad slug %j',
    (slug) => {
      expect(rejects({ slug })).toBe(true);
    },
  );

  it('accepts slug length boundaries (2 and 31 chars)', () => {
    expect(rejects({ slug: 'ab' })).toBe(false);
    expect(rejects({ slug: `a${'b'.repeat(30)}` })).toBe(false);
    expect(SLUG_PATTERN.test('ab')).toBe(true);
  });

  it.each([...RESERVED_SLUGS])('rejects reserved slug %s', (slug) => {
    expect(rejects({ slug })).toBe(true);
  });

  it('rejects tagline over 60 chars but accepts exactly 60', () => {
    expect(rejects({ tagline: 'x'.repeat(61) })).toBe(true);
    expect(rejects({ tagline: 'x'.repeat(60) })).toBe(false);
  });

  it('rejects an unknown tag, engine, input and status', () => {
    expect(rejects({ tags: ['nonsense'] })).toBe(true);
    expect(rejects({ engine: 'unity' })).toBe(true);
    expect(rejects({ input: ['voice'] })).toBe(true);
    expect(rejects({ status: 'archived' })).toBe(true);
  });

  it('accepts every known tag and engine', () => {
    expect(rejects({ tags: [...TAGS] })).toBe(false);
    for (const engine of ENGINES) expect(rejects({ engine })).toBe(false);
  });

  it('rejects empty tags and input', () => {
    expect(rejects({ tags: [] })).toBe(true);
    expect(rejects({ input: [] })).toBe(true);
  });

  it.each(['2026-13-01', '10/08/2026', '2026-02-30', 'yesterday', ''])(
    'rejects bad addedAt %j',
    (addedAt) => {
      expect(rejects({ addedAt })).toBe(true);
    },
  );

  it('rejects unknown extra keys (strict)', () => {
    expect(rejects({ extra: 1 })).toBe(true);
  });

  it.each([0, -1, 1.5, '100'])('rejects bad budgetKb %j', (budgetKb) => {
    expect(rejects({ budgetKb })).toBe(true);
  });

  it('accepts engine godot at the schema level', () => {
    expect(rejects({ engine: 'godot' })).toBe(false);
  });
});

describe('formatIssues', () => {
  it('yields "path: message" strings', () => {
    const result = manifestSchema.safeParse({ ...valid, tagline: '', tags: [] });
    if (result.success) throw new Error('expected failure');
    const issues = formatIssues(result.error);
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.startsWith('tagline: '))).toBe(true);
    expect(issues.some((i) => i.startsWith('tags: '))).toBe(true);
  });

  it('joins nested paths with dots', () => {
    const result = manifestSchema.safeParse({ ...valid, controls: { keyboard: '' } });
    if (result.success) throw new Error('expected failure');
    expect(formatIssues(result.error).some((i) => i.startsWith('controls.keyboard: '))).toBe(true);
  });

  it('uses (root) when there is no path', () => {
    const result = manifestSchema.safeParse('nope');
    if (result.success) throw new Error('expected failure');
    expect(formatIssues(result.error)[0]).toMatch(/^\(root\): /);
  });
});

describe('thumbnailAlt', () => {
  it('falls back to a generated description', () => {
    expect(thumbnailAlt({ title: 'Snake' })).toBe('Gameplay screenshot of Snake');
  });

  it('prefers the explicit alt text', () => {
    expect(thumbnailAlt({ title: 'Snake', thumbnailAlt: 'Custom' })).toBe('Custom');
  });
});

describe('thumbnail path isolation', () => {
  const base = {
    slug: 'demo-game',
    title: 'Demo',
    tagline: 'A demo',
    engine: 'vanilla',
    tags: ['arcade'],
    input: ['keyboard'],
    status: 'draft',
    addedAt: '2026-10-08',
  };
  it.each(['../other/thumbnail.png', 'art/thumb.png', 'thumbnail.gif', '/abs.png'])(
    'rejects %s',
    (thumbnail) => {
      expect(manifestSchema.safeParse({ ...base, thumbnail }).success).toBe(false);
    },
  );
  it.each(['thumbnail.png', 'cover-art.webp', 'shot_1.jpg'])('accepts %s', (thumbnail) => {
    expect(manifestSchema.safeParse({ ...base, thumbnail }).success).toBe(true);
  });
});
