/** Original, quiet merge tones. No audio files or background music. */
export class MergeSound {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;

  unlock(): void {
    if (!this.context) {
      this.context = new AudioContext();
      this.output = this.context.createGain();
      this.output.connect(this.context.destination);
    }
    void this.context.resume().catch(() => {});
  }

  mute(muted: boolean): void {
    if (this.context && this.output) {
      this.output.gain.setValueAtTime(muted ? 0 : 0.12, this.context.currentTime);
    }
  }

  play(value: number): void {
    const context = this.context;
    if (!context || !this.output || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const time = context.currentTime;
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(180 * 2 ** (Math.min(Math.log2(value), 11) / 12), time);
    envelope.gain.setValueAtTime(0.6, time);
    envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.14);
    oscillator.connect(envelope).connect(this.output);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
    };
    oscillator.start(time);
    oscillator.stop(time + 0.15);
  }
}
