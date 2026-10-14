import { FIELD_HEIGHT, FIELD_WIDTH, type Hit, type ShooterState } from './error-shooter-rules.ts';

interface Spark {
  x: number;
  y: number;
  dx: number;
  dy: number;
  life: number;
  color: string;
}

export function createShooterRenderer(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const secondary = css.getPropertyValue('--secondary').trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stars = Array.from({ length: 46 }, (_, i) => ({
    x: (i * 137.5) % FIELD_WIDTH,
    y: (i * 79.7) % FIELD_HEIGHT,
    size: i % 4 === 0 ? 1.6 : 0.7,
  }));
  let sparks: Spark[] = [];
  const nebula = ctx.createRadialGradient(250, 120, 10, 190, 190, 300);
  nebula.addColorStop(0, '#202b36');
  nebula.addColorStop(0.45, '#101923');
  nebula.addColorStop(1, '#080c15');

  const resize = () => {
    const scale = (Math.min(devicePixelRatio || 1, 2) * canvas.clientWidth) / FIELD_WIDTH;
    canvas.width = Math.round(FIELD_WIDTH * scale);
    canvas.height = Math.round(FIELD_HEIGHT * scale);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();

  const burst = (hit: Hit) => {
    if (reduced.matches) return;
    for (let i = 0; i < 10 && sparks.length < 100; i++) {
      const angle = i * Math.PI * 0.2;
      sparks.push({
        x: hit.x,
        y: hit.y,
        dx: Math.cos(angle) * (40 + i * 6),
        dy: Math.sin(angle) * (40 + i * 6),
        life: 0.5,
        color: hit.kind === 'ship' ? accent : secondary,
      });
    }
  };

  const draw = (state: ShooterState, dt: number) => {
    ctx.setTransform(canvas.width / FIELD_WIDTH, 0, 0, canvas.height / FIELD_HEIGHT, 0, 0);
    ctx.fillStyle = nebula;
    ctx.fillRect(0, 0, FIELD_WIDTH, FIELD_HEIGHT);
    // Original star field and distant orbital horizon, entirely code-drawn.
    ctx.strokeStyle = '#34414b';
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.ellipse(275, 170, 95, 140, -0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const star of stars) {
      ctx.fillStyle = star.size > 1 ? '#849eac' : '#425866';
      const y = reduced.matches
        ? star.y
        : (star.y + state.elapsed * (10 + star.size * 7)) % FIELD_HEIGHT;
      ctx.fillRect(star.x, y, star.size, star.size);
    }
    for (const shot of state.shots) {
      ctx.fillStyle = shot.hostile ? secondary : accent;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = reduced.matches ? 0 : 10;
      ctx.fillRect(shot.x - 1.5, shot.y - (shot.hostile ? 3 : 10), 3, shot.hostile ? 8 : 15);
    }
    ctx.shadowBlur = 0;
    for (const enemy of state.enemies) {
      ctx.save();
      ctx.translate(enemy.x, enemy.y);
      ctx.strokeStyle = secondary;
      ctx.fillStyle = '#382137';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 13);
      ctx.lineTo(-17, -4);
      ctx.lineTo(-13, -11);
      ctx.lineTo(-5, -4);
      ctx.lineTo(0, -9);
      ctx.lineTo(5, -4);
      ctx.lineTo(13, -11);
      ctx.lineTo(17, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = secondary;
      ctx.fillRect(-4, -1, 8, 3);
      ctx.restore();
    }
    if (!state.over) {
      ctx.save();
      ctx.translate(state.shipX, state.shipY);
      ctx.fillStyle = state.invulnerable ? '#f4f1ea' : accent;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(8, -3);
      ctx.lineTo(20, 10);
      ctx.lineTo(6, 6);
      ctx.lineTo(0, 13);
      ctx.lineTo(-6, 6);
      ctx.lineTo(-20, 10);
      ctx.lineTo(-8, -3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#080c15';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(3, 0);
      ctx.lineTo(-3, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#87e5ff';
      ctx.beginPath();
      ctx.moveTo(-3, 14);
      ctx.lineTo(0, reduced.matches ? 22 : 22 + Math.sin(state.elapsed * 25) * 4);
      ctx.lineTo(3, 14);
      ctx.fill();
      if (state.invulnerable > 0) {
        ctx.beginPath();
        ctx.arc(0, 0, 28, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (reduced.matches) sparks = [];
    for (const spark of sparks) {
      spark.life -= dt;
      spark.x += spark.dx * dt;
      spark.y += spark.dy * dt;
      ctx.globalAlpha = Math.max(0, spark.life * 2);
      ctx.fillStyle = spark.color;
      ctx.fillRect(spark.x, spark.y, 2, 2);
    }
    sparks = sparks.filter((spark) => spark.life > 0);
    ctx.globalAlpha = 1;
  };
  return {
    draw,
    burst,
    reset: () => {
      sparks = [];
    },
    dispose: () => observer.disconnect(),
  };
}
