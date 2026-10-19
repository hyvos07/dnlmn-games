import type { Round } from './logic/rules';
import type { Visuals } from './visuals';

export function boardRowHeight(width: number): number {
  return width / 4;
}

/** The next live target rests above a bottom row reserved for the last hit. */
export function boardTargetBounds(width: number, height: number): { top: number; bottom: number } {
  const rowHeight = boardRowHeight(width);
  return { top: height - rowHeight * 2, bottom: height - rowHeight };
}

export interface PassedTile {
  lane: number;
  variant: number;
  /** Rows below the next live target; the most recent hit is one row below. */
  distance: number;
  age?: number;
}

interface Effects {
  passedTiles: readonly PassedTile[];
  missLane: number;
  missRow?: number;
  missAge?: number;
  reducedMotion: boolean;
  slideRows: number;
}

/** Live targets, dead tiles and grid all travel together after each tap. */
export function renderBoard(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  round: Round,
  visuals: Visuals,
  effects: Effects,
): void {
  if (width <= 0 || height <= 0) return;
  const laneWidth = width / 4;
  const rowHeight = boardRowHeight(width);
  const spriteSize = Math.min(laneWidth, rowHeight);
  const { top: bottomRow } = boardTargetBounds(width, height);
  const offset = effects.reducedMotion ? 0 : -effects.slideRows * rowHeight;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = visuals.background;
  ctx.fillRect(0, 0, width, height);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  // Empty cells remain quiet so the filled target is instantly identifiable.
  for (let lane = 0; lane < 4; lane++) {
    ctx.fillStyle = lane % 2 === 0 ? '#ffffff03' : '#ffffff01';
    ctx.fillRect(lane * laneWidth, 0, laneWidth, height);
  }

  // Neutral gray distinguishes the tapping row from the green target cells.
  const targetY = bottomRow;
  ctx.fillStyle = '#b8bec525';
  ctx.fillRect(0, targetY, width, rowHeight);

  for (let index = round.rows.length - 1; index >= 0; index--) {
    const row = round.rows[index];
    if (!row) continue;
    const y = bottomRow - index * rowHeight + offset;
    if (y + rowHeight < 0 || y > height) continue;
    const x = row.lane * laneWidth;
    ctx.fillStyle = '#293e25';
    ctx.fillRect(x, y, laneWidth, rowHeight);
    visuals.drawTarget(
      ctx,
      x + laneWidth / 2,
      y + rowHeight / 2,
      spriteSize * 0.96,
      row.variant,
      false,
    );
  }

  // Dim completed cells so the next live target stands out.
  for (const tile of effects.passedTiles) {
    const y = bottomRow + tile.distance * rowHeight + offset;
    if (y >= height || y + rowHeight <= 0) continue;
    const x = tile.lane * laneWidth;
    ctx.save();
    const tapStrength = effects.reducedMotion ? 0 : (1 - Math.min(1, (tile.age ?? 1) / 0.14)) ** 2;
    // The cell briefly brightens on press, then settles into its completed state.
    ctx.globalAlpha *= 0.42 + tapStrength * 0.5;
    ctx.fillStyle = '#293e25';
    ctx.fillRect(x, y, laneWidth, rowHeight);
    visuals.drawTarget(
      ctx,
      x + laneWidth / 2,
      y + rowHeight / 2,
      spriteSize * 0.96,
      tile.variant,
      true,
    );
    ctx.restore();
  }

  // A single shared grid, without individual cards, frames or keyboard furniture.
  ctx.strokeStyle = '#c7dfbb18';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let lane = 1; lane < 4; lane++) {
    const x = lane * laneWidth;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  const gridStart = bottomRow + offset;
  for (let y = gridStart % rowHeight; y < height; y += rowHeight) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Keep both edges legible over empty and occupied cells.
  ctx.fillStyle = '#b8bec55a';
  ctx.fillRect(0, targetY, width, 1);
  ctx.fillRect(0, targetY + rowHeight - 1, width, 1);

  if (effects.missLane >= 0) {
    const x = effects.missLane * laneWidth;
    const y = bottomRow + (effects.missRow ?? 0) * rowHeight + offset;
    const age = effects.missAge ?? 0;
    // EatOwi's .bad class: 200 ms opacity blink, repeated three times.
    const pulse = effects.reducedMotion || age >= 0.6 ? 1 : Math.abs(1 - (age % 0.2) / 0.1);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#d35b5b';
    ctx.fillRect(x, y, laneWidth, rowHeight);
    ctx.restore();
  }
  ctx.restore();
}
