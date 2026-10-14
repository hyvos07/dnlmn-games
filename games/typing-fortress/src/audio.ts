/** Original, generated spell sounds. No audio is created before unlock's user gesture. */
export class Sound {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: GainNode | null = null;
  private readonly voices = new Set<AudioScheduledSourceNode>();
  private readonly drones: OscillatorNode[] = [];
  private noise: AudioBuffer | null = null;
  private muted = false;
  private paused = false;

  unlock(): void {
    if (!this.context) {
      try {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = 0.48;
        this.master.connect(this.context.destination);
        this.ambience = this.context.createGain();
        this.ambience.gain.value = 0.022;
        this.ambience.connect(this.master);
        for (const frequency of [110, 164.81, 220.3]) {
          const oscillator = this.context.createOscillator();
          oscillator.type = 'sine';
          oscillator.frequency.value = frequency;
          oscillator.connect(this.ambience);
          oscillator.start();
          this.drones.push(oscillator);
        }
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate * 0.35,
          this.context.sampleRate,
        );
        const data = this.noise.getChannelData(0);
        for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
      } catch {
        // Audio is optional; the siege remains playable when audio is unavailable.
        this.destroy();
        return;
      }
    }
    this.sync();
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sync();
  }

  pause(): void {
    this.paused = true;
    this.stopVoices();
    this.sync();
  }

  resume(): void {
    this.paused = false;
    this.sync();
  }

  letter(): void {
    this.tone(660, 930, 0.09, 0.024, 'sine');
  }

  hit(elite = false): void {
    this.tone(elite ? 155 : 220, 75, 0.24, 0.18, 'triangle');
    this.tone(880, 1320, 0.23, 0.06, 'sine', 0.025);
    this.tone(1320, 1760, 0.34, 0.025, 'sine', 0.06);
    this.burst(elite ? 0.15 : 0.1, 1700, 0.2);
  }

  mistake(): void {
    this.tone(185, 115, 0.13, 0.055, 'triangle');
  }

  damage(): void {
    this.tone(130, 42, 0.48, 0.23, 'triangle');
    this.burst(0.2, 440, 0.3);
  }

  wave(): void {
    [329.63, 440, 659.25].forEach((frequency, index) => {
      this.tone(frequency, frequency, 0.8, 0.06, 'sine', index * 0.12);
    });
  }

  destroy(): void {
    this.stopVoices();
    for (const drone of this.drones) {
      drone.stop();
      drone.disconnect();
    }
    this.drones.length = 0;
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.master = null;
    this.ambience = null;
    this.noise = null;
  }

  private sync(): void {
    if (!this.context || this.context.state === 'closed') return;
    if (this.muted || this.paused) {
      this.stopVoices();
      void this.context.suspend().catch(() => {});
    } else {
      void this.context.resume().catch(() => {});
    }
  }

  private canPlay(): boolean {
    return (
      !this.muted && !this.paused && this.context?.state === 'running' && this.voices.size < 28
    );
  }

  private tone(
    from: number,
    to: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    delay = 0,
  ): void {
    if (!this.canPlay() || !this.context || !this.master) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.master);
    this.track(oscillator, gain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.03);
  }

  private burst(volume: number, cutoff: number, duration: number): void {
    if (!this.canPlay() || !this.context || !this.master || !this.noise) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime;
    source.buffer = this.noise;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, start);
    filter.frequency.exponentialRampToValueAtTime(100, start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    this.track(source, gain, filter);
    source.start(start);
    source.stop(start + duration);
  }

  private track(source: AudioScheduledSourceNode, ...nodes: AudioNode[]): void {
    this.voices.add(source);
    source.onended = () => {
      this.voices.delete(source);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  private stopVoices(): void {
    for (const source of this.voices) {
      try {
        source.stop();
      } catch {
        // A source can have reached its scheduled stop just before pausing.
      }
    }
    this.voices.clear();
  }
}
