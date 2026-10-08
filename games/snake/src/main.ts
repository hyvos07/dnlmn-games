import '@fontsource/bricolage-grotesque/latin-800.css';
import './style.css';
import { getAccent, SURFACES } from '@games/config/theme';
import { initGame } from '@games/sdk';
import manifest from '../game.json';
import { Sound } from './audio.ts';
import { SnakeGame } from './game.ts';
import { bindInput } from './input.ts';
import { randomSeed } from './logic/rng.ts';
import { Effects } from './render/effects.ts';
import { type Palette, Renderer } from './render/renderer.ts';
import { Ui } from './ui.ts';

const BOARD = { cols: 20, rows: 20 };

const accent = getAccent();
const root = document.documentElement;
root.style.setProperty('--games-accent', accent.accent);
root.style.setProperty('--games-on-accent', accent.onAccent);
root.style.setProperty('--secondary', accent.secondary);

const palette: Palette = {
  board: SURFACES.dark.raised,
  dots: 'rgba(244, 241, 234, 0.07)',
  snake: accent.accent,
  snakeEdge: 'rgba(0, 0, 0, 0.35)',
  food: accent.secondary,
  eye: '#F4F1EA',
  pupil: SURFACES.dark.bg,
  danger: '#FF3B3B',
};

const ui = new Ui();
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const seedParam = new URLSearchParams(window.location.search).get('seed');
const seed = seedParam && /^\d+$/.test(seedParam) ? Number(seedParam) : null;

// The SDK must be initialised before the game starts drawing (RULES §3).
let snake: SnakeGame | null = null;
const sound = new Sound(false);
const sdk = initGame(manifest, {
  root: ui.stage,
  onPause: () => snake?.pause(),
  onResume: () => snake?.resume(),
  onMuteChange: (muted) => sound.setMuted(muted),
});
sound.setMuted(sdk.muted);
sdk.onUnlock(() => sound.unlock());

const renderer = new Renderer(ui.canvas, BOARD, palette);
const effects = new Effects(reducedMotion);
snake = new SnakeGame({
  board: BOARD,
  sdk,
  renderer,
  effects,
  sound,
  ui,
  palette,
  seed,
  randomSeed,
});

const resize = () => renderer.resize();
new ResizeObserver(resize).observe(ui.canvas);
resize();

const game = snake;
bindInput(ui.stage, {
  turn: (dir) => game.turn(dir),
  primary: () => game.primary(),
});
ui.playButton.addEventListener('click', () => game.primary());
ui.againButton.addEventListener('click', () => game.primary(true));
game.begin();
