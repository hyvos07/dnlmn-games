import { describe, expect, it } from 'vitest';
import { blend, framesNeeded, loopFrames } from './preview.ts';

/** A one-pixel "frame" holding `value`, so frames are easy to tell apart. */
const px = (value: number) => Uint8Array.of(value);
const values = (frames: Uint8Array[]) => frames.map((f) => f[0]);

describe('blend', () => {
  it('returns a at k=0, b at k=1 and the rounded mix between', () => {
    expect([...blend(Uint8Array.of(0, 200), Uint8Array.of(100, 0), 0)]).toEqual([0, 200]);
    expect([...blend(Uint8Array.of(0, 200), Uint8Array.of(100, 0), 1)]).toEqual([100, 0]);
    expect([...blend(Uint8Array.of(0, 200), Uint8Array.of(100, 0), 0.25)]).toEqual([25, 150]);
  });

  it('rejects frames of different sizes', () => {
    expect(() => blend(Uint8Array.of(1), Uint8Array.of(1, 2), 0.5)).toThrow(/differ/);
  });
});

describe('loopFrames', () => {
  it('needs length + fade captured frames', () => {
    expect(framesNeeded(100, 10)).toBe(110);
    expect(() => loopFrames([px(0), px(1)], 2, 1)).toThrow(/need 3 frames/);
    expect(() => loopFrames([px(0)], 1, 1)).toThrow(/fade/);
  });

  it('without a fade, is the first `length` frames unchanged', () => {
    const frames = [10, 20, 30, 40].map(px);
    expect(values(loopFrames(frames, 3, 0))).toEqual([10, 20, 30]);
  });

  it('starts on the first clean frame and ends with the crossfade back into it', () => {
    // length 4, fade 2: frames 0..3 loop, frames 4..5 fade into frames 0..1.
    const frames = [0, 10, 20, 30, 100, 200].map(px);
    const loop = loopFrames(frames, 4, 2);
    expect(loop).toHaveLength(4);
    // Rotated: clean frames 2 and 3 first, untouched.
    expect(loop[0]).toBe(frames[2]);
    expect(loop[1]).toBe(frames[3]);
    // Then the crossfade: tail frame 4 → head frame 0 at 1/3, tail 5 → head 1 at 2/3.
    expect(loop[2]?.[0]).toBe(Math.round(100 * (2 / 3) + 0 * (1 / 3)));
    expect(loop[3]?.[0]).toBe(Math.round(200 * (1 / 3) + 10 * (2 / 3)));
  });

  it('flows back smoothly: the last frame sits between the tail and the first frame', () => {
    // A steady ramp: a perfect loop would continue 0..9 then jump; the fade softens it.
    const frames = Array.from({ length: 12 }, (_, i) => px(i * 10));
    const loop = values(loopFrames(frames, 10, 2));
    expect(loop[0]).toBe(20);
    expect(loop.at(-1)).toBeGreaterThan(10);
    expect(loop.at(-1)).toBeLessThan(110);
  });
});
