import type { MusicScore } from './music-score.ts';

export type SoundCue =
  | 'start'
  | 'move'
  | 'soft'
  | 'rotate'
  | 'hold'
  | 'drop'
  | 'clear'
  | 'quad'
  | 'level'
  | 'end'
  | 'win';
type SynthContext = AudioContext | OfflineAudioContext;
const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function tone(
  context: SynthContext,
  output: AudioNode,
  midi: number,
  at: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'square',
  slide?: number,
): void {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency(midi), at);
  if (slide !== undefined)
    oscillator.frequency.exponentialRampToValueAtTime(frequency(slide), at + duration);
  envelope.gain.setValueAtTime(0, at);
  envelope.gain.linearRampToValueAtTime(volume, at + 0.003);
  envelope.gain.setValueAtTime(volume * 0.68, at + duration * 0.65);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  oscillator.connect(envelope).connect(output);
  oscillator.start(at);
  oscillator.stop(at + duration);
  oscillator.onended = () => {
    oscillator.disconnect();
    envelope.disconnect();
  };
}

function noise(
  context: SynthContext,
  output: AudioNode,
  at: number,
  duration: number,
  volume: number,
  high: boolean,
): void {
  const buffer = context.createBuffer(
    1,
    Math.ceil(context.sampleRate * duration),
    context.sampleRate,
  );
  const samples = buffer.getChannelData(0);
  // A repeatable noise colour, independent of the gameplay RNG.
  let seed = 173;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    samples[i] = (seed / 2147483648 - 1) * (1 - i / samples.length) ** 2;
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  filter.type = high ? 'highpass' : 'lowpass';
  filter.frequency.value = high ? 6500 : 1400;
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(output);
  source.start(at);
  source.onended = () => {
    source.disconnect();
    filter.disconnect();
    gain.disconnect();
  };
}

/** Render loops on the audio thread once, then loop buffers without JS timers. */
export async function renderMusic(score: MusicScore): Promise<AudioBuffer> {
  const beat = 60 / score.bpm;
  const context = new OfflineAudioContext(1, Math.ceil(score.beats * beat * 22050), 22050);
  const output = context.createGain();
  output.gain.value = 0.8;
  output.connect(context.destination);
  const voices = [
    { notes: score.lead, type: 'square', volume: 0.13 },
    { notes: score.bass, type: 'triangle', volume: 0.23 },
    { notes: score.harmony, type: 'triangle', volume: 0.085 },
  ] as const;
  for (const { notes, type, volume } of voices)
    for (const note of notes)
      tone(
        context,
        output,
        note.midi,
        note.beat * beat,
        note.duration * beat * 0.9,
        volume * (note.velocity ?? 0.8),
        type,
      );
  for (const drum of score.drums) {
    const at = drum.beat * beat;
    if (drum.kind === 'kick')
      tone(context, output, 43, at, 0.105, drum.velocity * 0.28, 'sine', 24);
    else
      noise(
        context,
        output,
        at,
        drum.kind === 'hat' ? 0.035 : 0.12,
        drum.velocity * (drum.kind === 'hat' ? 0.22 : 0.3),
        drum.kind === 'hat',
      );
  }
  return context.startRendering();
}

export function playCue(context: AudioContext, output: AudioNode, cue: SoundCue): void {
  const at = context.currentTime;
  const note = (
    midi: number,
    offset = 0,
    duration = 0.08,
    volume = 0.13,
    type: OscillatorType = 'square',
    slide?: number,
  ) => tone(context, output, midi, at + offset, duration, volume, type, slide);
  if (cue === 'move') note(52, 0, 0.025, 0.045, 'triangle', 47);
  else if (cue === 'soft') note(42, 0, 0.027, 0.04, 'triangle', 38);
  else if (cue === 'rotate') {
    note(72, 0, 0.035, 0.07);
    note(79, 0.035, 0.045, 0.07);
  } else if (cue === 'hold') {
    note(76, 0, 0.065, 0.09);
    note(67, 0.065, 0.085, 0.09);
  } else if (cue === 'drop') {
    note(48, 0, 0.18, 0.3, 'triangle', 25);
    note(36, 0.015, 0.13, 0.14, 'sine', 23);
    noise(context, output, at, 0.085, 0.24, false);
  } else if (cue === 'end') {
    [64, 60, 59, 52, 45].forEach((midi, i) => {
      note(midi, i * 0.13, 0.23, 0.12, 'triangle');
    });
  } else {
    const notes =
      cue === 'quad'
        ? [76, 79, 83, 88, 95]
        : cue === 'win'
          ? [72, 76, 79, 84, 79, 88]
          : cue === 'level'
            ? [71, 76, 83]
            : cue === 'start'
              ? [64, 71, 76]
              : [72, 76, 79, 84];
    notes.forEach((midi, i) => {
      note(midi, i * 0.065, 0.13, 0.1);
    });
  }
}
