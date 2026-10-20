import { describe, expect, it, vi } from 'vitest';
import { createRound } from './logic/rules.ts';
import { boardTargetBounds, renderBoard } from './renderer.ts';
import type { Visuals } from './visuals.ts';

function draw(
  slideRows: number,
  reducedMotion = false,
  feedback: {
    missLane?: number;
    missAge?: number;
    missRow?: number;
    tapAge?: number;
    showLane?: boolean;
    showTapEffect?: boolean;
  } = {},
) {
  const alphas: { dead: boolean; alpha: number }[] = [];
  const glows: number[] = [];
  const fills: {
    color: string | CanvasGradient | CanvasPattern;
    alpha: number;
    x: number;
    y: number;
  }[] = [];
  const drawTarget = vi.fn((ctx: CanvasRenderingContext2D, ...args: unknown[]) => {
    alphas.push({ dead: Boolean(args[4]), alpha: ctx.globalAlpha });
    if (args[4]) glows.push(ctx.shadowBlur);
  });
  const savedAlpha: number[] = [];
  const ctx = {
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect(this: CanvasRenderingContext2D, x: number, y: number) {
      fills.push({ color: this.fillStyle, alpha: this.globalAlpha, x, y });
    },
    save(this: CanvasRenderingContext2D) {
      savedAlpha.push(this.globalAlpha);
    },
    restore(this: CanvasRenderingContext2D) {
      this.globalAlpha = savedAlpha.pop() ?? 1;
    },
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const visuals = {
    background: '#090f1d',
    accent: '#8fbfff',
    ink: '#eaf1ff',
    drawTarget,
  } as unknown as Visuals;
  renderBoard(
    ctx,
    400,
    800,
    createRound('practice', () => 0.5),
    visuals,
    {
      passedTiles: [
        { lane: 0, variant: 3, distance: 2 },
        { lane: 1, variant: 1, distance: 1, age: feedback.tapAge ?? 1 },
      ],
      slideRows,
      showLane: feedback.showLane,
      showTapEffect: feedback.showTapEffect,
      reducedMotion,
      missLane: feedback.missLane ?? -1,
      missAge: feedback.missAge,
      missRow: feedback.missRow,
    },
  );
  return { drawTarget, ctx, alphas, fills, glows };
}

describe('tap-and-scroll rendering', () => {
  it('keeps the last hit dead in the bottom row below the next live target', () => {
    const { drawTarget, ctx, alphas } = draw(0);
    expect(boardTargetBounds(400, 800)).toEqual({ top: 600, bottom: 700 });
    expect(drawTarget).toHaveBeenCalledWith(ctx, 250, 650, 96, 2, false);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 150, 750, 96, 1, true);
    expect(drawTarget.mock.calls.filter((call) => call[5])).toHaveLength(1);
    expect(ctx.globalAlpha).toBe(1);
    expect(alphas.filter((sprite) => sprite.dead)).toEqual([{ dead: true, alpha: 0.42 }]);
    expect(alphas.filter((sprite) => !sprite.dead).every((sprite) => sprite.alpha === 1)).toBe(
      true,
    );
  });

  it('moves live and dead tiles together through successive rapid taps', () => {
    const { drawTarget, ctx } = draw(1.5);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 250, 500, 96, 2, false);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 150, 600, 96, 1, true);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 50, 700, 96, 3, true);
    expect(ctx.globalAlpha).toBe(1);
  });

  it('keeps the dead state visible when reduced motion skips the scroll', () => {
    const { drawTarget, ctx } = draw(1.5, true);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 250, 650, 96, 2, false);
    expect(drawTarget).toHaveBeenCalledWith(ctx, 150, 750, 96, 1, true);
  });

  it('blinks the clicked tile red and keeps reduced-motion feedback steady', () => {
    const start = draw(0, false, { missLane: 3, missRow: 1, missAge: 0 });
    const trough = draw(0, false, { missLane: 3, missRow: 1, missAge: 0.1 });
    const steady = draw(0, true, { missLane: 3, missRow: 1, missAge: 0.1 });
    expect(start.fills.find((fill) => fill.color === '#d35b5b')).toEqual({
      color: '#d35b5b',
      alpha: 1,
      x: 300,
      y: 700,
    });
    expect(trough.fills.find((fill) => fill.color === '#d35b5b')?.alpha).toBe(0);
    expect(steady.fills.find((fill) => fill.color === '#d35b5b')?.alpha).toBe(1);
    expect(start.ctx.stroke).toHaveBeenCalledTimes(1);
  });

  it('glows on contact, then settles to the dimmed completed state', () => {
    const alpha = (age: number, reduced = false) =>
      draw(0, reduced, { tapAge: age }).alphas.find((sprite) => sprite.dead)?.alpha ?? 0;
    expect(alpha(0)).toBe(1);
    expect(alpha(0.04)).toBe(1);
    expect(alpha(0.07)).toBeGreaterThan(0.42);
    expect(alpha(0.07)).toBeLessThan(alpha(0));
    expect(alpha(0.3)).toBe(0.42);
    expect(alpha(0, true)).toBe(0.42);
    expect(draw(0, false, { tapAge: 0 }).glows[0]).toBeGreaterThan(0);
    expect(draw(0, false, { tapAge: 0.3 }).glows[0]).toBe(0);
    expect(draw(0, true, { tapAge: 0 }).glows[0]).toBe(0);
  });

  it('keeps the tapping band fixed while tiles scroll through it', () => {
    const band = (slide: number) => draw(slide).fills.find((fill) => fill.color === '#b8bec525');
    expect(band(0)?.y).toBe(600);
    expect(band(1.5)).toEqual(band(0));
  });

  it('switches the tap lane and glow independently while keeping completed tiles dimmed', () => {
    const laneOff = draw(0, false, { tapAge: 0, showLane: false });
    expect(
      laneOff.fills.some((fill) => fill.color === '#b8bec525' || fill.color === '#b8bec55a'),
    ).toBe(false);
    expect(laneOff.glows[0]).toBeGreaterThan(0);
    const glowOff = draw(0, false, { tapAge: 0, showTapEffect: false });
    expect(glowOff.fills.some((fill) => fill.color === '#b8bec525')).toBe(true);
    expect(glowOff.glows[0]).toBe(0);
    expect(glowOff.alphas.find((sprite) => sprite.dead)?.alpha).toBe(0.42);
  });
});
