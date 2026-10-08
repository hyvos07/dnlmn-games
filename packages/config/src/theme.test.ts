import { describe, expect, it } from 'vitest';
import { ACCENT, ACCENTS, contrastRatio, getAccent, luminance, SURFACES } from './theme.ts';

const AA = 4.5;
const HEX = /^#[0-9A-F]{6}$/i;

describe('luminance / contrastRatio', () => {
  it('computes luminance extremes', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 10);
  });

  it('black vs white is 21:1 and symmetric', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#FFFFFF', '#000000')).toBe(contrastRatio('#000000', '#FFFFFF'));
  });

  it('identical colours give 1:1', () => {
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 10);
  });
});

describe('accent presets', () => {
  const presets = Object.entries(ACCENTS);

  it('has at least one preset', () => {
    expect(presets.length).toBeGreaterThan(0);
  });

  describe.each(presets)('%s', (_name, preset) => {
    it('accentTextDark passes AA on the dark background', () => {
      expect(contrastRatio(preset.accentTextDark, SURFACES.dark.bg)).toBeGreaterThanOrEqual(AA);
    });

    it('accentTextLight passes AA on the light background', () => {
      expect(contrastRatio(preset.accentTextLight, SURFACES.light.bg)).toBeGreaterThanOrEqual(AA);
    });

    it('onAccent passes AA on accent', () => {
      expect(contrastRatio(preset.onAccent, preset.accent)).toBeGreaterThanOrEqual(AA);
    });

    it('uses #RRGGBB colours', () => {
      for (const color of Object.values(preset)) expect(color).toMatch(HEX);
    });
  });

  it('ACCENT is a preset and getAccent returns it', () => {
    expect(Object.keys(ACCENTS)).toContain(ACCENT);
    expect(getAccent()).toBe(ACCENTS[ACCENT]);
  });
});

describe('surfaces', () => {
  it.each(['dark', 'light'] as const)('%s fg and muted pass AA on bg', (theme) => {
    const s = SURFACES[theme];
    expect(contrastRatio(s.fg, s.bg)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(s.muted, s.bg)).toBeGreaterThanOrEqual(AA);
  });

  it('uses #RRGGBB colours', () => {
    for (const surface of Object.values(SURFACES)) {
      for (const color of Object.values(surface)) expect(color).toMatch(HEX);
    }
  });
});
