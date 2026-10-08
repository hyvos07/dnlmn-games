import { describe, expect, it } from 'vitest';
import { stepMs } from './speed.ts';

describe('stepMs', () => {
  it('starts at 140ms', () => {
    expect(stepMs(0)).toBe(140);
  });

  it('is monotonic non-increasing and never below 60', () => {
    let prev = stepMs(0);
    for (let n = 1; n <= 200; n++) {
      const cur = stepMs(n);
      expect(cur).toBeLessThanOrEqual(prev);
      expect(cur).toBeGreaterThanOrEqual(60);
      prev = cur;
    }
  });

  it('reaches the 60ms floor', () => {
    expect(stepMs(200)).toBe(60);
  });
});
