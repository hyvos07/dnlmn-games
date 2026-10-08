/**
 * Pure helpers for the card preview clip (ADR-011): turn a run of captured frames into a
 * seamless loop. No I/O here, so it's unit-tested; scripts/thumbnail.ts does the capture
 * and encoding.
 */

export const PREVIEW_FPS = 25;
export const PREVIEW_SECONDS = 4;
/** Frames spent crossfading the end of the clip back into its start. */
export const PREVIEW_FADE = 10;
/** Square size (px) of the encoded clip. Cards are ≤ 440 CSS px, so this stays crisp at 1.5×. */
export const PREVIEW_SIZE = 640;

/** Frames to capture for a loop of `length` frames with a `fade`-frame crossfade. */
export const framesNeeded = (length: number, fade: number) => length + fade;

/** Linear blend of two same-sized pixel buffers; `k` = 0 gives `a`, 1 gives `b`. */
export function blend(a: Uint8Array, b: Uint8Array, k: number): Uint8Array {
  if (a.length !== b.length) throw new Error('blend: frames differ in size');
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) {
    out[i] = Math.round((a[i] as number) * (1 - k) + (b[i] as number) * k);
  }
  return out;
}

/**
 * Builds a loop of `length` frames from `length + fade` captured frames.
 *
 * The extra `fade` frames after the loop point are crossfaded into the first `fade`
 * frames, so the last frame flows back into the first. The result is rotated to start on
 * `frames[fade]`, the first frame untouched by the crossfade: a clean frame that can
 * double as the still thumbnail, so swapping the still for the clip is invisible.
 */
export function loopFrames<T extends Uint8Array>(
  frames: readonly T[],
  length: number,
  fade: number,
): Uint8Array[] {
  if (fade < 0 || fade >= length) throw new Error('loopFrames: fade must be in [0, length)');
  if (frames.length < length + fade) {
    throw new Error(`loopFrames: need ${length + fade} frames, got ${frames.length}`);
  }
  const loop: Uint8Array[] = [];
  for (let i = 0; i < length; i++) {
    const frame = frames[i] as T;
    if (i >= fade) {
      loop.push(frame);
      continue;
    }
    // Early in the fade the tail (after the loop point) dominates; it ends on the head.
    loop.push(blend(frames[length + i] as T, frame, (i + 1) / (fade + 1)));
  }
  return [...loop.slice(fade), ...loop.slice(0, fade)];
}
