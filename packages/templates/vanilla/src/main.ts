import './style.css';
import { initGame } from '@games/sdk';
import manifest from '../game.json';
import { type Ball, stepBall } from './logic/physics.ts';

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.getElementById('board') as HTMLCanvasElement;
const startScreen = document.getElementById('start') as HTMLElement;
const bestOut = document.getElementById('best') as HTMLOutputElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let frame = 0;
let last = 0;
let audio: AudioContext | null = null;
let muted = false;
let width = 0;
let height = 0;
let ball: Ball = { x: 100, y: 100, vx: 120, vy: 90, r: 18 };
let bounces = 0;
const keys = new Set<string>();
let pointer: { x: number; y: number } | null = null;

// Initialise the SDK exactly once, before anything else touches the page (RULES §3).
const game = initGame(manifest, {
  root: stage,
  onPause: () => {
    cancelAnimationFrame(frame);
    keys.clear();
  },
  onResume: () => startLoop(),
  onMuteChange: (m) => (muted = m),
});
muted = game.muted;
let best = game.storage.get<number>('highscore', 0);
bestOut.textContent = String(best);

// Audio may only start after the first gesture; the SDK tells us when.
game.onUnlock(() => (audio = new AudioContext()));
function blip(freq: number): void {
  if (!audio || muted) return;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.1, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.12);
  osc.connect(gain).connect(audio.destination);
  osc.start();
  osc.stop(audio.currentTime + 0.12);
}

// Keep the backing store sharp on hi-dpi screens, capped at 2x to protect mobile GPUs.
new ResizeObserver(() => {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = stage.clientWidth;
  height = stage.clientHeight;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}).observe(stage);

window.addEventListener('keydown', (e) => keys.add(e.key.toLowerCase()));
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
canvas.addEventListener('pointerdown', (e) => {
  pointer = { x: e.offsetX, y: e.offsetY };
});
canvas.addEventListener('pointermove', (e) => {
  if (pointer) pointer = { x: e.offsetX, y: e.offsetY };
});
window.addEventListener('pointerup', () => (pointer = null));

function steer(dt: number): void {
  const accel = 400 * dt;
  if (keys.has('arrowleft') || keys.has('a')) ball.vx -= accel;
  if (keys.has('arrowright') || keys.has('d')) ball.vx += accel;
  if (keys.has('arrowup') || keys.has('w')) ball.vy -= accel;
  if (keys.has('arrowdown') || keys.has('s')) ball.vy += accel;
  if (pointer) {
    ball.vx += (pointer.x - ball.x) * dt * 4;
    ball.vy += (pointer.y - ball.y) * dt * 4;
  }
}

function tick(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  steer(dt);
  // TODO: your game here. Update state, score points, end the run.
  const step = stepBall(ball, { width, height }, dt);
  ball = step.ball;
  if (step.bounced) {
    bounces += 1;
    blip(220 + (bounces % 8) * 40);
    if (bounces > best) {
      best = bounces;
      game.storage.set('highscore', best);
    }
  }
  ctx.fillStyle = '#0c0c10';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#c6ff3d';
  ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);
  ctx.fillStyle = '#f4f1ea';
  ctx.font = '600 20px system-ui, sans-serif';
  ctx.fillText(`Bounces ${bounces}`, 16, 32);
  frame = requestAnimationFrame(tick);
}

function startLoop(): void {
  cancelAnimationFrame(frame);
  last = performance.now();
  frame = requestAnimationFrame(tick);
}

document.getElementById('play')?.addEventListener('click', () => {
  startScreen.hidden = true;
  bounces = 0;
  game.setPlaying(true);
  startLoop();
});
game.setPlaying(false);
