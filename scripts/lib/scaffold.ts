/** Pure helpers for `pnpm new-game`. No file system access, so they are easy to test. */
import { RESERVED_SLUGS, SLUG_PATTERN } from '@games/config/manifest';

/** `snake-eyes` → `Snake Eyes`. */
export function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Replace every `__KEY__` placeholder that has a value in `vars`. Unknown placeholders are left alone. */
export function fillPlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/__([A-Z]+)__/g, (match, key: string) => vars[key] ?? match);
}

/** Returns a human-readable problem with a proposed slug, or null if it is usable. */
export function validateNewSlug(slug: string, existing: string[]): string | null {
  if (!SLUG_PATTERN.test(slug)) {
    return `"${slug}" is not a valid slug. Use ${SLUG_PATTERN} (lowercase letters, digits and hyphens, starting with a letter, 2-31 characters).`;
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return `"${slug}" is a reserved slug (ARCHITECTURE §3). Pick another.`;
  }
  if (existing.includes(slug)) {
    return `games/${slug} already exists. Slugs are permanent, so pick another.`;
  }
  return null;
}

/** Titles are pasted into JSON, HTML and Markdown, so keep them to plain text the schema accepts. */
export function validateTitle(title: string): string | null {
  if (title.trim().length === 0 || title.length > 40) return 'Title must be 1-40 characters.';
  if (/["\\<>&`]/.test(title)) return 'Title cannot contain " \\ < > & or `.';
  return null;
}
