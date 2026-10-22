export interface ScoreNote {
  midi: number;
  beat: number;
  duration: number;
  velocity?: number;
}

export interface MusicScore {
  name: string;
  bpm: number;
  beats: number;
  lead: ScoreNote[];
  bass: ScoreNote[];
  harmony: ScoreNote[];
  drums: { beat: number; kind: 'kick' | 'snare' | 'hat'; velocity: number }[];
}

type Step = readonly [midi: number, duration?: number];
type Chord = readonly [root: number, fifth: number, octave: number];

function phrase(notes: readonly Step[], start: number, velocity = 0.8): ScoreNote[] {
  let beat = start;
  const result: ScoreNote[] = [];
  for (const [midi, duration = 0.5] of notes) {
    if (midi > 0) result.push({ midi, beat, duration, velocity });
    beat += duration;
  }
  return result;
}

function bassPattern(chords: readonly Chord[], bars: number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const [root, fifth, octave] = chords[bar % chords.length] ?? ([40, 47, 52] as const);
    const at = bar * 4;
    notes.push(
      { midi: root, beat: at, duration: 0.72, velocity: 0.78 },
      { midi: fifth, beat: at + 1, duration: 0.52, velocity: 0.58 },
      { midi: octave, beat: at + 2, duration: 0.68, velocity: 0.7 },
      { midi: fifth, beat: at + 3, duration: 0.52, velocity: 0.58 },
    );
  }
  return notes;
}

function arpeggio(chords: readonly Chord[], bars: number): ScoreNote[] {
  const notes: ScoreNote[] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = chords[bar % chords.length] ?? ([40, 47, 52] as const);
    for (let step = 0; step < 8; step += 1) {
      const pitch = step % 3 === 0 ? chord[0] : step % 3 === 1 ? chord[1] : chord[2];
      notes.push({
        midi: pitch + 12,
        beat: bar * 4 + step * 0.5,
        duration: 0.34,
        velocity: step % 2 === 0 ? 0.36 : 0.27,
      });
    }
  }
  return notes;
}

function beatDrums(bars: number, lively = false): MusicScore['drums'] {
  const drums: MusicScore['drums'] = [];
  for (let bar = 0; bar < bars; bar += 1) {
    const at = bar * 4;
    drums.push(
      { beat: at, kind: 'kick', velocity: 0.46 },
      { beat: at + 2, kind: 'snare', velocity: 0.38 },
    );
    for (let eighth = 0; eighth < 8; eighth += 1) {
      if (lively || eighth % 2 === 1) {
        drums.push({
          beat: at + eighth * 0.5,
          kind: 'hat',
          velocity: eighth % 2 === 0 ? 0.16 : 0.24,
        });
      }
    }
  }
  return drums;
}

// Original 16-bar title cue: a rising Em/D/C/B welcome motif, then a brighter
// G-led answer. The low pulse and short chord arpeggios are composed for this cue.
const titleChords = [
  [40, 47, 52],
  [38, 45, 50],
  [36, 43, 48],
  [35, 42, 47],
  [43, 50, 55],
  [40, 47, 52],
  [38, 45, 50],
  [35, 42, 47],
] as const;

const titleMotif: readonly Step[] = [
  [64, 0.5],
  [67, 0.5],
  [71, 0.5],
  [76, 0.5],
  [74, 1],
  [71, 1],
  [67, 0.5],
  [71, 0.5],
  [74, 0.5],
  [78, 0.5],
  [76, 1],
  [74, 1],
  [72, 0.5],
  [74, 0.5],
  [76, 1],
  [79, 1],
  [76, 0.5],
  [74, 0.5],
  [71, 1],
  [66, 0.5],
  [69, 0.5],
  [75, 1],
  [71, 1],
  [67, 0.5],
  [71, 0.5],
  [74, 1],
  [76, 1],
  [79, 0.5],
  [76, 0.5],
  [76, 1],
  [71, 0.5],
  [67, 0.5],
  [66, 1],
  [64, 1],
  [74, 0.5],
  [78, 0.5],
  [81, 1],
  [78, 1],
  [76, 0.5],
  [74, 0.5],
  [71, 1],
  [75, 0.5],
  [78, 0.5],
  [83, 1],
  [78, 1],
];

const titleLead = [...phrase(titleMotif, 0, 0.72), ...phrase(titleMotif, 32, 0.65)];

export const TITLE_SCORE: MusicScore = {
  name: 'Pixel Welcome',
  bpm: 132,
  beats: 64,
  lead: titleLead,
  bass: bassPattern(titleChords, 16),
  harmony: arpeggio(titleChords, 16),
  drums: beatDrums(16),
};

// Traditional Korobeiniki melody, transposed to A minor. Rests are explicit
// zero-MIDI steps so each bar keeps its stated meter. Backing and sound design
// are original and do not reproduce a game soundtrack arrangement.
const folkA: readonly Step[] = [
  [76, 1],
  [71, 0.5],
  [72, 0.5],
  [74, 1],
  [72, 0.5],
  [71, 0.5],
  [69, 1],
  [69, 0.5],
  [72, 0.5],
  [76, 1],
  [74, 0.5],
  [72, 0.5],
  [71, 1.5],
  [72, 0.5],
  [74, 1],
  [76, 1],
  [72, 1],
  [69, 1],
  [69, 2],
  [0, 0.5],
  [74, 1],
  [77, 0.5],
  [81, 1],
  [79, 0.5],
  [77, 0.5],
  [76, 1.5],
  [72, 0.5],
  [76, 1],
  [74, 0.5],
  [72, 0.5],
  [71, 1],
  [71, 0.5],
  [72, 0.5],
  [74, 1],
  [76, 1],
  [72, 1],
  [69, 1],
  [69, 2],
];

const folkB: readonly Step[] = [
  [76, 2],
  [72, 2],
  [74, 2],
  [71, 2],
  [72, 2],
  [69, 2],
  [68, 2],
  [71, 2],
  [76, 2],
  [72, 2],
  [74, 2],
  [71, 2],
  [72, 1],
  [76, 1],
  [81, 2],
  [80, 4],
];

// Am / Am / Em / Am / Dm / Am / E7 / Am, then Am / Em / Am / E7 / Am / Em / Am / E7.
const folkChords = [
  [45, 52, 57],
  [45, 52, 57],
  [40, 47, 52],
  [45, 52, 57],
  [38, 45, 50],
  [45, 52, 57],
  [40, 47, 56],
  [45, 52, 57],
  [45, 52, 57],
  [40, 47, 52],
  [45, 52, 57],
  [40, 47, 56],
  [45, 52, 57],
  [40, 47, 52],
  [45, 52, 57],
  [40, 47, 56],
] as const;

const folkLead = [
  ...phrase(folkA, 0, 0.82),
  ...phrase(folkB, 32, 0.75),
  ...phrase(folkA, 64, 0.82),
  ...phrase(folkB, 96, 0.75),
];

export const KOROBEINIKI_SCORE: MusicScore = {
  name: 'Korobeiniki (traditional)',
  bpm: 148,
  beats: 128,
  lead: folkLead,
  bass: bassPattern(folkChords, 32),
  harmony: arpeggio(folkChords, 32),
  drums: beatDrums(32, true),
};
