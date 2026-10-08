import './style.css';
import { initGame } from '@games/sdk';
import kaplay from 'kaplay';
import manifest from '../game.json';
import { createBlip } from './audio.ts';
import { registerScenes } from './scenes.ts';

const stage = document.getElementById('stage') as HTMLElement;
const canvas = document.getElementById('board') as HTMLCanvasElement;
const startScreen = document.getElementById('start') as HTMLElement;
const bestOut = document.getElementById('best') as HTMLOutputElement;

// Initialise the SDK exactly once, before anything else touches the page (RULES §3).
// The callbacks run later, so they can safely refer to `k`, which is created just below.
const game = initGame(manifest, {
  root: stage,
  onPause: () => {
    k.debug.paused = true;
  },
  onResume: () => {
    k.debug.paused = false;
    canvas.focus();
  },
  onMuteChange: (muted) => k.volume(muted ? 0 : 1),
});

// `global: false` keeps KAPLAY's functions on `k` instead of the window object. With no
// width/height the play area fills the screen, so scenes must use k.width() / k.height()
// and re-layout in k.onResize(). For a fixed-size playfield instead, pass `width`,
// `height`, `stretch: true` and `letterbox: true`.
const k = kaplay({
  canvas,
  global: false,
  debug: false, // no F1 inspector in production
  touchToMouse: true,
  pixelDensity: Math.min(window.devicePixelRatio || 1, 2),
  background: '#0c0c10',
});
k.volume(game.muted ? 0 : 1);

registerScenes({ k, game, blip: createBlip(game) });
bestOut.textContent = String(game.storage.get<number>('highscore', 0));

document.getElementById('play')?.addEventListener('click', () => {
  startScreen.hidden = true;
  // KAPLAY reads the keyboard from the canvas, and the button just took the focus.
  canvas.focus();
  k.go('play');
});
game.setPlaying(false);
