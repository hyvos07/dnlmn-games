import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudio, readAudioSettings } from './audio.ts';
import { KOROBEINIKI_SCORE, TITLE_SCORE } from './music-score.ts';
import { playCue, renderMusic } from './synth.ts';

vi.mock('./synth.ts', () => ({ renderMusic: vi.fn(), playCue: vi.fn() }));

const flush = async () => {
  for (let i = 0; i < 12; i++) await Promise.resolve();
};

function fakeDevice() {
  const sources: {
    stop: ReturnType<typeof vi.fn>;
    loop: boolean;
    start: ReturnType<typeof vi.fn>;
  }[] = [];
  const gains: { gain: { value: number; setTargetAtTime: ReturnType<typeof vi.fn> } }[] = [];
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const context = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
    createGain: () => {
      const gain = { ...node(), gain: { value: 0, setTargetAtTime: vi.fn() } };
      gains.push(gain);
      return gain;
    },
    createDynamicsCompressor: () => ({ ...node(), threshold: {}, knee: {}, ratio: {} }),
    createBufferSource: () => {
      const source = { ...node(), buffer: null, loop: false, start: vi.fn(), stop: vi.fn() };
      sources.push(source);
      return source;
    },
  };
  vi.stubGlobal(
    'AudioContext',
    class {
      constructor() {
        // biome-ignore lint/correctness/noConstructorReturn: Web Audio constructor fake shares the observable device state.
        return context;
      }
    },
  );
  return { context, sources, gains };
}

beforeEach(() => {
  vi.mocked(renderMusic)
    .mockReset()
    .mockResolvedValue({ duration: 30 } as AudioBuffer);
  vi.mocked(playCue).mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('audio lifecycle', () => {
  it('waits for a gesture, then starts one title loop even with repeated sync requests', async () => {
    const { sources } = fakeDevice();
    const audio = createAudio(() => false);
    audio.sync('title', false);
    expect(renderMusic).not.toHaveBeenCalled();
    audio.unlock();
    audio.sync('title', false);
    await flush();
    expect(renderMusic).toHaveBeenCalledExactlyOnceWith(TITLE_SCORE);
    expect(sources).toHaveLength(1);
    expect(sources[0]?.loop).toBe(true);
  });

  it('discards a slow title render if the player starts a game while it loads', async () => {
    const { sources } = fakeDevice();
    let finishTitle: (buffer: AudioBuffer) => void = () => {};
    vi.mocked(renderMusic).mockImplementation((score) =>
      score === TITLE_SCORE
        ? new Promise((resolve) => {
            finishTitle = resolve;
          })
        : Promise.resolve({ duration: 52 } as AudioBuffer),
    );
    const audio = createAudio(() => false);
    audio.unlock();
    await flush();
    audio.sync('game', false);
    await flush();
    finishTitle({ duration: 30 } as AudioBuffer);
    await flush();
    expect(sources).toHaveLength(1);
    expect(renderMusic).toHaveBeenLastCalledWith(KOROBEINIKI_SCORE);
  });

  it('suspends pause/hidden/mute without replacing or layering the running loop', async () => {
    const { context, sources } = fakeDevice();
    let muted = false;
    const audio = createAudio(() => muted);
    audio.sync('game', false);
    audio.unlock();
    await flush();
    audio.sync('game', true);
    await flush();
    expect(context.state).toBe('suspended');
    audio.play('drop');
    expect(playCue).not.toHaveBeenCalled();
    audio.sync('game', false);
    await flush();
    muted = true;
    audio.sync('game', false);
    await flush();
    expect(context.state).toBe('suspended');
    muted = false;
    audio.sync('game', false);
    await flush();
    expect(context.state).toBe('running');
    expect(sources).toHaveLength(1);
    expect(sources[0]?.stop).not.toHaveBeenCalled();
    audio.sync('silent', false);
    await flush();
    expect(sources[0]?.stop).toHaveBeenCalledOnce();
    audio.play('end');
    expect(playCue).toHaveBeenCalledOnce();
  });

  it('handles first-click cues, repeat throttling and independent volume zero', async () => {
    const { context, gains } = fakeDevice();
    const audio = createAudio(() => false);
    audio.unlock();
    audio.play('start');
    await flush();
    expect(playCue).toHaveBeenCalledOnce();
    audio.play('move');
    audio.play('move');
    expect(playCue).toHaveBeenCalledTimes(2);
    context.currentTime += 0.1;
    audio.play('move');
    expect(playCue).toHaveBeenCalledTimes(3);
    audio.setVolume({ music: 0.2, effects: 0 });
    audio.play('drop');
    expect(playCue).toHaveBeenCalledTimes(3);
    expect(gains[0]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.2, 0.1, 0.02);
    expect(gains[1]?.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0.1, 0.02);
  });
});

describe('audio data', () => {
  it('keeps valid silent volumes and rejects malformed saved settings', () => {
    expect(readAudioSettings({ music: 0, effects: 1 })).toEqual({ music: 0, effects: 1 });
    expect(readAudioSettings({ music: -1, effects: Number.NaN })).toEqual(readAudioSettings(null));
    expect(readAudioSettings({ music: '0.5', effects: 2 })).toEqual(readAudioSettings(null));
  });
  it.each([TITLE_SCORE, KOROBEINIKI_SCORE])(
    'keeps $name notes and drums inside a metered loop',
    (score) => {
      expect(score.beats % 4).toBe(0);
      expect(Math.max(...score.lead.map((note) => note.beat + note.duration))).toBe(score.beats);
      for (const voice of [score.lead, score.bass, score.harmony]) {
        expect(voice.length).toBeGreaterThan(20);
        for (const note of voice) {
          expect(note.beat).toBeGreaterThanOrEqual(0);
          expect(note.duration).toBeGreaterThan(0);
          expect(note.beat + note.duration).toBeLessThanOrEqual(score.beats);
          expect(note.midi).toBeGreaterThanOrEqual(24);
          expect(note.midi).toBeLessThanOrEqual(96);
          expect((note.beat * 2) % 1).toBe(0);
        }
      }
      expect(score.drums.every((hit) => hit.beat >= 0 && hit.beat < score.beats)).toBe(true);
    },
  );
});
