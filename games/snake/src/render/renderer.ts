import { type Board, DIRS, type Dir, type Vec } from '../logic/grid.ts';
import { interpolatePath, pathLength, pointAlong } from '../logic/interpolate.ts';
import type { Effects } from './effects.ts';

export interface Palette {
  board: string;
  dots: string;
  snake: string;
  snakeEdge: string;
  food: string;
  eye: string;
  pupil: string;
  danger: string;
}

export interface Frame {
  prev: readonly Vec[];
  cur: readonly Vec[];
  /** Progress between the previous and current step, 0..1. */
  t: number;
  dir: Dir;
  food: Vec | null;
  /** When the current food appeared (ms, same clock as `now`). */
  foodBornAt: number;
  alive: boolean;
  now: number;
  /** Cells per millisecond, used to move the food bulge along the body. */
  speed: number;
}

export const FONT = '"Bricolage Grotesque", system-ui, sans-serif';

/** Canvas 2D renderer. Pixel-crisp at any devicePixelRatio (capped at 2). */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private grid: HTMLCanvasElement | null = null;
  private cell = 1;
  private width = 1;
  private height = 1;
  private blinkAt = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly board: Board,
    private readonly palette: Palette,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  /** Match the backing store to the element's CSS size. */
  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.round(rect.width * dpr));
    this.height = Math.max(1, Math.round(rect.height * dpr));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.cell = this.width / this.board.cols;
    this.grid = this.renderGrid();
  }

  private renderGrid(): HTMLCanvasElement {
    const grid = document.createElement('canvas');
    grid.width = this.width;
    grid.height = this.height;
    const g = grid.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = this.palette.board;
    g.fillRect(0, 0, this.width, this.height);
    g.fillStyle = this.palette.dots;
    const r = Math.max(1, this.cell * 0.06);
    for (let y = 0; y < this.board.rows; y++) {
      for (let x = 0; x < this.board.cols; x++) {
        g.beginPath();
        g.arc((x + 0.5) * this.cell, (y + 0.5) * this.cell, r, 0, Math.PI * 2);
        g.fill();
      }
    }
    return grid;
  }

  draw(frame: Frame, fx: Effects): void {
    const { ctx, cell } = this;
    const shake = fx.shakeOffset(cell * 0.45);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.grid) ctx.drawImage(this.grid, 0, 0);
    ctx.setTransform(1, 0, 0, 1, shake.x, shake.y);

    if (frame.food) this.drawFood(frame.food, frame.now - frame.foodBornAt, frame.now);
    const points = interpolatePath(frame.prev, frame.cur, frame.t);
    this.drawBody(points, frame, fx);
    fx.draw(ctx, cell, FONT);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    fx.drawFlash(ctx, this.width, this.height, this.palette.danger);
  }

  private drawFood(food: Vec, age: number, now: number): void {
    const { ctx, cell } = this;
    const born = Math.min(1, Math.max(0, age / 220));
    const pop = born < 1 ? 1 - (1 - born) ** 3 * Math.cos(born * 9) : 1;
    const pulse = 1 + Math.sin(now / 160) * 0.08;
    const x = (food.x + 0.5) * cell;
    const y = (food.y + 0.5) * cell;
    const r = cell * 0.3 * pop * pulse;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = this.palette.food;
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBody(points: Vec[], frame: Frame, fx: Effects): void {
    const { ctx, cell } = this;
    if (points.length === 0) return;
    const trace = () => {
      ctx.beginPath();
      points.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x * cell, p.y * cell);
        else ctx.lineTo(p.x * cell, p.y * cell);
      });
    };
    // Bulges: swallowed pellets travelling toward the tail. Drop the ones past the end.
    const length = pathLength(points);
    fx.bulges = fx.bulges.filter((age) => age * frame.speed < length);
    const bulges = fx.bulges
      .map((age) => pointAlong(points, age * frame.speed))
      .filter((p): p is Vec => p !== null);
    // Two passes (edge, then fill) so bulges merge into the body instead of outlining it.
    const pass = (color: string, width: number, bulgeRadius: number) => {
      trace();
      ctx.strokeStyle = color;
      ctx.lineWidth = cell * width;
      ctx.stroke();
      ctx.fillStyle = color;
      for (const at of bulges) {
        ctx.beginPath();
        ctx.arc(at.x * cell, at.y * cell, cell * bulgeRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    pass(this.palette.snakeEdge, 0.78, 0.5);
    pass(this.palette.snake, 0.64, 0.43);

    this.drawHead(points[0] as Vec, frame);
  }

  private drawHead(head: Vec, frame: Frame): void {
    const { ctx, cell } = this;
    const d = DIRS[frame.dir];
    const hx = head.x * cell;
    const hy = head.y * cell;
    ctx.fillStyle = this.palette.snake;
    ctx.beginPath();
    ctx.arc(hx, hy, cell * 0.42, 0, Math.PI * 2);
    ctx.fill();

    if (frame.now > this.blinkAt + 3600) this.blinkAt = frame.now + Math.random() * 2400;
    const blinking = frame.alive && frame.now > this.blinkAt && frame.now < this.blinkAt + 110;
    // Pupils glance toward the food.
    let lookX = d.x;
    let lookY = d.y;
    if (frame.food) {
      const fx = frame.food.x + 0.5 - head.x;
      const fy = frame.food.y + 0.5 - head.y;
      const len = Math.hypot(fx, fy) || 1;
      lookX = fx / len;
      lookY = fy / len;
    }
    for (const side of [-1, 1]) {
      const ex = hx + (d.x * 0.12 - d.y * 0.2 * side) * cell;
      const ey = hy + (d.y * 0.12 + d.x * 0.2 * side) * cell;
      ctx.fillStyle = this.palette.eye;
      ctx.beginPath();
      if (!frame.alive) {
        // X eyes.
        const s = cell * 0.09;
        ctx.strokeStyle = this.palette.pupil;
        ctx.lineWidth = cell * 0.06;
        ctx.moveTo(ex - s, ey - s);
        ctx.lineTo(ex + s, ey + s);
        ctx.moveTo(ex + s, ey - s);
        ctx.lineTo(ex - s, ey + s);
        ctx.stroke();
        continue;
      }
      ctx.ellipse(ex, ey, cell * 0.13, cell * (blinking ? 0.02 : 0.13), 0, 0, Math.PI * 2);
      ctx.fill();
      if (blinking) continue;
      ctx.fillStyle = this.palette.pupil;
      ctx.beginPath();
      ctx.arc(ex + lookX * cell * 0.05, ey + lookY * cell * 0.05, cell * 0.065, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
