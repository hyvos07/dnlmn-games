/** Short original synth notes, created only after a user gesture. */
export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;

  constructor(private muted: boolean) {}

  unlock(): void {
    if (!this.context && window.AudioContext) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.15;
      this.master.connect(this.context.destination);
    }
    this.resume();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(value ? 0 : 0.15, this.context.currentTime, 0.015);
    }
  }

  suspend(): void {
    if (this.context?.state === 'running') void this.context.suspend();
  }

  resume(): void {
    if (this.context?.state === 'suspended') void this.context.resume();
  }

  play(lane: number, miss = false): void {
    const ctx = this.context;
    if (!ctx || !this.master || this.muted || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const duration = miss ? 0.22 : 0.09;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(miss ? 160 : ([392, 440, 523.25, 659.25][lane] ?? 440), now);
    osc.frequency.exponentialRampToValueAtTime(miss ? 65 : 880, now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.01);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
}
