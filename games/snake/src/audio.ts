/**
 * Generated sound effects (no audio files). Nothing plays before `unlock()`, which
 * the SDK calls inside the first user gesture, and everything routes through one
 * master gain that follows the global mute.
 */

// A pentatonic ladder so a long eating streak climbs musically instead of shrieking.
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(private muted: boolean) {}

  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.02);
    }
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number,
    duration: number,
    options: { type?: OscillatorType; volume?: number; slideTo?: number; delay?: number } = {},
  ): void {
    const { ctx, master } = this;
    if (!ctx || !master || this.muted) return;
    const start = ctx.currentTime + (options.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = options.type ?? 'square';
    osc.frequency.setValueAtTime(freq, start);
    if (options.slideTo)
      osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + duration);
    const volume = options.volume ?? 0.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private noise(duration: number, volume: number): void {
    const { ctx, master } = this;
    if (!ctx || !master || this.muted) return;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  /** Eating: a two-note blip that climbs with the streak. */
  eat(streak: number): void {
    const step = LADDER[Math.min(LADDER.length - 1, Math.max(0, streak - 1) % LADDER.length)] ?? 0;
    const base = 440 * 2 ** (step / 12);
    this.tone(base, 0.07, { type: 'square', volume: 0.13 });
    this.tone(base * 1.5, 0.09, { type: 'triangle', volume: 0.18, delay: 0.05 });
  }

  turn(): void {
    this.tone(1250, 0.025, { type: 'sine', volume: 0.025 });
  }

  start(): void {
    [0, 4, 7, 12].forEach((semi, i) => {
      this.tone(330 * 2 ** (semi / 12), 0.09, { type: 'triangle', volume: 0.16, delay: i * 0.06 });
    });
  }

  die(): void {
    this.tone(320, 0.5, { type: 'sawtooth', volume: 0.14, slideTo: 50 });
    this.noise(0.35, 0.25);
  }

  best(): void {
    [0, 7, 12, 16, 19, 24].forEach((semi, i) => {
      this.tone(523 * 2 ** (semi / 12), 0.12, {
        type: 'square',
        volume: 0.09,
        delay: 0.25 + i * 0.07,
      });
    });
  }
}
