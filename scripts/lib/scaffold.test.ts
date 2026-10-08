import { describe, expect, it } from 'vitest';
import { fillPlaceholders, titleCase, validateNewSlug, validateTitle } from './scaffold.ts';

describe('titleCase', () => {
  it('capitalises each hyphen-separated word', () => {
    expect(titleCase('snake')).toBe('Snake');
    expect(titleCase('neon-snake-2')).toBe('Neon Snake 2');
  });
});

describe('fillPlaceholders', () => {
  it('replaces all occurrences and leaves unknown keys alone', () => {
    const out = fillPlaceholders('__SLUG__ / __SLUG__ / __TITLE__ / __OTHER__', {
      SLUG: 'a',
      TITLE: 'A',
    });
    expect(out).toBe('a / a / A / __OTHER__');
  });
});

describe('validateNewSlug', () => {
  it('accepts a fresh slug', () => {
    expect(validateNewSlug('ok-slug', ['snake'])).toBeNull();
  });

  it('rejects malformed slugs', () => {
    expect(validateNewSlug('Bad', [])).toMatch(/not a valid slug/);
    expect(validateNewSlug('a', [])).toMatch(/not a valid slug/);
  });

  it('rejects reserved slugs', () => {
    expect(validateNewSlug('about', [])).toMatch(/reserved/);
  });

  it('rejects existing games', () => {
    expect(validateNewSlug('snake', ['snake'])).toMatch(/already exists/);
  });
});

describe('validateTitle', () => {
  it('accepts plain titles', () => {
    expect(validateTitle('Tile Flip 2')).toBeNull();
  });
  it.each(['', '   ', 'x'.repeat(41), 'Say "hi"', 'A<b>', 'Tom & Jerry', 'back\\slash'])(
    'rejects %j',
    (title) => {
      expect(validateTitle(title)).not.toBeNull();
    },
  );
});
