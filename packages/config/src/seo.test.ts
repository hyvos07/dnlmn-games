import { describe, expect, it } from 'vitest';
import { parseManifest } from './manifest.ts';
import { gameStructuredData, SITE_ORIGIN, serializeJsonLd } from './seo.ts';

describe('structured metadata', () => {
  it('keeps manifest text from closing the inline JSON-LD script', () => {
    const value = { name: '</script><script>alert("test")</script> & "quotes"' };
    const serialized = serializeJsonLd(value);
    expect(serialized).not.toContain('<');
    expect(JSON.parse(serialized)).toEqual(value);
  });

  it('describes the actual playable game and static image without invented ratings', () => {
    const manifest = parseManifest({
      slug: 'sample-game',
      title: 'Sample game',
      tagline: 'Play a sample.',
      engine: 'vanilla',
      tags: ['puzzle'],
      input: ['keyboard'],
      status: 'published',
      addedAt: '2026-10-23',
    });
    const data = gameStructuredData(manifest);
    expect(data.url).toBe(`${SITE_ORIGIN}/sample-game/`);
    expect(data.image).toBe(`${SITE_ORIGIN}/og/sample-game.png`);
    expect(data.description).toBe(manifest.tagline);
    expect(data.isAccessibleForFree).toBe(true);
    expect(data).not.toHaveProperty('aggregateRating');
  });
});
