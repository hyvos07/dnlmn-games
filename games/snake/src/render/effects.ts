/**
 * Juice: particles, shock rings, score pops, screen shake and the bulge that travels
 * down the body after eating. Positions are in cell units so they survive resizes.
 */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  spin: number;
  angle: number;
  color: string;
}

interface Ring {
  x: number;
  y: number;
  age: number;
  life: number;
  color: string;
}

interface Popup {
  x: number;
  y: number;
  age: number;
  life: number;
  text: string;
}

export class Effects {
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  /** Ages (ms) of food bulges travelling from head to tail. */
  bulges: number[] = [];
  private trauma = 0;
  private flashAge = Number.POSITIVE_INFINITY;
  private time = 0;

  constructor(private readonly reducedMotion: boolean) {}

  burst(x: number, y: number, colors: readonly string[], count = 16): void {
    const n = this.reducedMotion ? Math.ceil(count / 2) : count;
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const speed = 3 + Math.random() * 6; // cells per second
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: 380 + Math.random() * 320,
        size: 0.12 + Math.random() * 0.16,
        spin: (Math.random() - 0.5) * 12,
        angle: Math.random() * Math.PI,
        color: colors[i % colors.length] ?? '#fff',
      });
    }
  }

  ring(x: number, y: number, color: string): void {
    this.rings.push({ x, y, age: 0, life: 420, color });
  }

  popup(x: number, y: number, text: string): void {
    this.popups.push({ x, y, age: 0, life: 700, text });
  }

  bulge(): void {
    this.bulges.push(0);
  }

  /** Add screen shake (0..1). Ignored under reduced motion. */
  shake(amount: number): void {
    if (this.reducedMotion) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  /** A single soft flash (never strobing, see RULES §7). */
  flash(): void {
    this.flashAge = 0;
  }

  clear(): void {
    this.particles = [];
    this.rings = [];
    this.popups = [];
    this.bulges = [];
    this.trauma = 0;
    this.flashAge = Number.POSITIVE_INFINITY;
  }

  update(dtMs: number): void {
    this.time += dtMs;
    const dt = dtMs / 1000;
    const drag = 0.9 ** (dtMs / 16.7);
    for (const p of this.particles) {
      p.age += dtMs;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= drag;
      p.vy *= drag;
      p.angle += p.spin * dt;
    }
    this.particles = this.particles.filter((p) => p.age < p.life);
    for (const r of this.rings) r.age += dtMs;
    this.rings = this.rings.filter((r) => r.age < r.life);
    for (const p of this.popups) p.age += dtMs;
    this.popups = this.popups.filter((p) => p.age < p.life);
    this.bulges = this.bulges.map((age) => age + dtMs);
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    this.flashAge += dtMs;
  }

  /** Current shake offset in pixels. */
  shakeOffset(maxPx: number): { x: number; y: number } {
    if (this.trauma <= 0) return { x: 0, y: 0 };
    const amount = this.trauma * this.trauma * maxPx;
    const t = this.time / 1000;
    return {
      x: amount * Math.sin(t * 71.3) * Math.cos(t * 23.1),
      y: amount * Math.cos(t * 63.7) * Math.sin(t * 31.9),
    };
  }

  draw(ctx: CanvasRenderingContext2D, cell: number, font: string): void {
    for (const r of this.rings) {
      const k = r.age / r.life;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = cell * 0.12 * (1 - k);
      ctx.beginPath();
      ctx.arc(r.x * cell, r.y * cell, cell * (0.4 + k * 1.6), 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const p of this.particles) {
      const k = p.age / p.life;
      const size = p.size * cell * (1 - k * 0.7);
      ctx.globalAlpha = 1 - k * k;
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x * cell, p.y * cell);
      ctx.rotate(p.angle);
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 ${Math.round(cell * 0.7)}px ${font}`;
    for (const p of this.popups) {
      const k = p.age / p.life;
      const rise = 1 - (1 - k) ** 3;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.fillStyle = '#F4F1EA';
      ctx.fillText(p.text, p.x * cell, (p.y - 0.4 - rise * 1.1) * cell);
    }
    ctx.globalAlpha = 1;
  }

  drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number, color: string): void {
    const life = 380;
    if (this.flashAge >= life) return;
    ctx.globalAlpha = 0.28 * (1 - this.flashAge / life);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1;
  }
}
