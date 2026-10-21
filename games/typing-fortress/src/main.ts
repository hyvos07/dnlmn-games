import '@fontsource/bricolage-grotesque/latin-800.css';
import '@fontsource-variable/instrument-sans';
import './style.css';
import { getAccent } from '@games/config/theme';
import { initGame } from '@games/sdk';
import manifest from '../game.json';
import { Sound } from './audio.ts';
import { Siege } from './siege.ts';
import { Ui } from './ui.ts';

const accent = getAccent();
document.documentElement.style.setProperty('--games-accent', accent.accent);
document.documentElement.style.setProperty('--games-on-accent', accent.onAccent);

const ui = new Ui();
const sound = new Sound();
let siege: Siege | null = null;
const sdk = initGame(manifest, {
  platformPause: true,
  root: ui.stage,
  reservedKeys: ['f', 'm'],
  onPause: () => siege?.pause(),
  onResume: () => siege?.resume(),
  onMuteChange: (muted) => sound.setMuted(muted),
});
sdk.setPlaying(false);
sound.setMuted(sdk.muted);
sdk.onUnlock(() => sound.unlock());

siege = new Siege(ui, sdk, sound);
siege.begin();
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    sdk.pause();
    siege?.pause();
  } else siege?.destroy();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !sdk.paused) siege?.resume();
});
