import type { Game } from '@games/sdk';

/**
 * Tiny generated blips, so the template needs no audio files. Browsers only allow audio
 * after a user gesture; the SDK tells us when (`onUnlock`), and `game.muted` is respected.
 * For real sounds, load files with KAPLAY's `loadSound()` and play them with `k.play()`
 * (the mute button already scales `k.volume()`, see main.ts).
 */
export function createBlip(game: Game): (freq: number, seconds?: number) => void {
  let audio: AudioContext | null = null;
  game.onUnlock(() => {
    audio = new AudioContext();
  });
  return (freq, seconds = 0.12) => {
    if (!audio || game.muted) return;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.1, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + seconds);
    osc.connect(gain).connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + seconds);
  };
}
