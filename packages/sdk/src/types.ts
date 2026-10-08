/**
 * The manifest fields the SDK reads. Deliberately loose (plain strings) so a game can pass
 * `import manifest from '../game.json'` directly; the build validates the real schema.
 */
export interface SdkManifest {
  slug: string;
  title: string;
  tagline?: string;
  description?: string;
  controls?: Partial<Record<string, string>>;
  orientation?: string;
}
