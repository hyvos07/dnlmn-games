/**
 * Shared colour tokens for the launcher and games.
 *
 * To try a different accent, change `ACCENT` below. `pnpm dev` picks it up on reload.
 * Every preset is unit-tested to pass WCAG AA in both the dark and light themes.
 */
export const ACCENT: AccentName = 'lime';

export interface AccentPreset {
  /** The loud colour: fills, WebGL pieces, focus rings, the snake. */
  accent: string;
  /** Text/icons drawn on top of an `accent` fill. */
  onAccent: string;
  /** Accent used as text on the dark surface. */
  accentTextDark: string;
  /** Accent used as text on the light surface (usually a darker shade). */
  accentTextLight: string;
  /** A contrasting secondary colour (food in Snake, sparks, highlights). */
  secondary: string;
}

export const ACCENTS = {
  lime: {
    accent: '#C6FF3D',
    onAccent: '#0C0C10',
    accentTextDark: '#C6FF3D',
    accentTextLight: '#3D6600',
    secondary: '#FF5C8A',
  },
  coral: {
    accent: '#FF4A2B',
    onAccent: '#0C0C10',
    accentTextDark: '#FF6B52',
    accentTextLight: '#B3290F',
    secondary: '#FFD21A',
  },
  magenta: {
    accent: '#FF2E8A',
    onAccent: '#0C0C10',
    accentTextDark: '#FF5AA3',
    accentTextLight: '#B0005A',
    secondary: '#2EF2FF',
  },
  yellow: {
    accent: '#FFD21A',
    onAccent: '#0C0C10',
    accentTextDark: '#FFD21A',
    accentTextLight: '#7A5A00',
    secondary: '#FF4A2B',
  },
  tangerine: {
    accent: '#FF8A00',
    onAccent: '#0C0C10',
    accentTextDark: '#FF9A26',
    accentTextLight: '#9A4700',
    secondary: '#3DDCFF',
  },
  cyan: {
    accent: '#22E6FF',
    onAccent: '#0C0C10',
    accentTextDark: '#22E6FF',
    accentTextLight: '#00687A',
    secondary: '#FF4FD8',
  },
  ultraviolet: {
    accent: '#8B5CFF',
    onAccent: '#0C0C10',
    accentTextDark: '#A889FF',
    accentTextLight: '#5B2FD9',
    secondary: '#C6FF3D',
  },
} as const satisfies Record<string, AccentPreset>;

export type AccentName = keyof typeof ACCENTS;

export const ACCENT_NAMES = Object.keys(ACCENTS) as AccentName[];

/** Neutral surfaces. Dark is the default theme. */
export const SURFACES = {
  dark: { bg: '#0C0C10', raised: '#16161C', fg: '#F4F1EA', muted: '#A29E95', line: '#2A2A33' },
  light: { bg: '#F4F1EA', raised: '#FFFFFF', fg: '#0C0C10', muted: '#5E5A52', line: '#D9D4C8' },
} as const;

export function getAccent(name: AccentName = ACCENT): AccentPreset {
  return ACCENTS[name];
}

/** WCAG 2.x relative luminance of a `#RRGGBB` colour. */
export function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#RRGGBB` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
