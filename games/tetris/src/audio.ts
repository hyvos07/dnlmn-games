import { KOROBEINIKI_SCORE, TITLE_SCORE } from './music-score.ts';
import { playCue, renderMusic, type SoundCue } from './synth.ts';

export interface AudioSettings {
  music: number;
  effects: number;
}
export type AudioScene = 'title' | 'game' | 'silent';

export function readAudioSettings(value: unknown): AudioSettings {
  const saved = value && typeof value === 'object' ? (value as Partial<AudioSettings>) : {};
  const volume = (v: unknown, fallback: number) =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  return { music: volume(saved.music, 0.45), effects: volume(saved.effects, 0.75) };
}

/** One context and two buses. Nothing is created until a real user gesture. */
export function createAudio(isMuted: () => boolean, initial?: AudioSettings) {
  let context: AudioContext | null = null;
  let musicBus: GainNode | null = null;
  let effectsBus: GainNode | null = null;
  let music: AudioBufferSourceNode | null = null;
  let scene: AudioScene = 'title';
  let blocked = false;
  let settings = readAudioSettings(initial);
  let request = 0;
  let lastMove = -1;
  let lastSoft = -1;
  const buffers = new Map<AudioScene, Promise<AudioBuffer>>();

  function stopMusic(): void {
    request++;
    music?.stop();
    music?.disconnect();
    music = null;
  }
  async function startMusic(): Promise<void> {
    if (!context || !musicBus || music || scene === 'silent' || blocked || isMuted()) return;
    const currentScene = scene;
    const ticket = ++request;
    try {
      let buffer = buffers.get(currentScene);
      if (!buffer) {
        buffer = renderMusic(currentScene === 'title' ? TITLE_SCORE : KOROBEINIKI_SCORE);
        buffers.set(currentScene, buffer);
      }
      const rendered = await buffer;
      if (ticket !== request || blocked || isMuted() || scene !== currentScene || music) return;
      music = context.createBufferSource();
      music.buffer = rendered;
      music.loop = true;
      music.connect(musicBus);
      music.start();
    } catch {
      // Audio is progressive enhancement; a denied/unavailable device must not stop play.
      buffers.delete(currentScene);
    }
  }
  async function sync(): Promise<void> {
    if (!context) return;
    try {
      if (blocked || isMuted()) {
        await context.suspend();
      } else {
        await context.resume();
        if (!blocked && !isMuted()) await startMusic();
      }
    } catch {
      // The next user gesture can retry if the browser temporarily denies audio.
    }
  }
  function unlock(): void {
    if (!context) {
      try {
        context = new AudioContext();
        musicBus = context.createGain();
        effectsBus = context.createGain();
        musicBus.gain.value = settings.music;
        effectsBus.gain.value = settings.effects;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -8;
        limiter.knee.value = 6;
        limiter.ratio.value = 8;
        musicBus.connect(limiter);
        effectsBus.connect(limiter);
        limiter.connect(context.destination);
      } catch {
        return;
      }
    }
    void sync();
  }
  function play(cue: SoundCue): void {
    if (!context || !effectsBus || blocked || isMuted() || !settings.effects) return;
    const now = context.currentTime;
    if (cue === 'move' && now - lastMove < 0.045) return;
    if (cue === 'soft' && now - lastSoft < 0.11) return;
    if (cue === 'move') lastMove = now;
    if (cue === 'soft') lastSoft = now;
    const device = context;
    const bus = effectsBus;
    if (device.state === 'running') playCue(device, bus, cue);
    else {
      // A first-click start cue must wait for resume, rather than disappear.
      void device
        .resume()
        .then(() => {
          if (!blocked && !isMuted()) playCue(device, bus, cue);
        })
        .catch(() => {});
    }
  }
  return {
    unlock,
    play,
    sync(next: AudioScene, suspended: boolean): void {
      if (next !== scene) {
        stopMusic();
        scene = next;
      }
      blocked = suspended;
      void sync();
    },
    setVolume(next: AudioSettings): void {
      settings = readAudioSettings(next);
      if (context && musicBus && effectsBus) {
        musicBus.gain.setTargetAtTime(settings.music, context.currentTime, 0.02);
        effectsBus.gain.setTargetAtTime(settings.effects, context.currentTime, 0.02);
      }
    },
  };
}
