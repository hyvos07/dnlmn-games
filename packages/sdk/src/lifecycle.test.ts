import { afterEach, describe, expect, it, vi } from 'vitest';
import { createLifecycle, type Lifecycle, type LifecycleCallbacks } from './lifecycle.ts';
import { createStorage } from './storage.ts';

const lifecycles: Lifecycle[] = [];

function make(callbacks: LifecycleCallbacks = {}, storage = createStorage('global', null)) {
  const lc = createLifecycle(callbacks, storage, document);
  lifecycles.push(lc);
  return lc;
}

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  for (const lc of lifecycles.splice(0)) lc.destroy();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('pause / resume', () => {
  it('fires callbacks once per transition', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const lc = make({ onPause, onResume });
    lc.pause();
    lc.pause();
    expect(onPause).toHaveBeenCalledTimes(1);
    expect(lc.paused).toBe(true);
    lc.resume();
    lc.resume();
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(lc.paused).toBe(false);
  });

  it('sets and clears pauseReason', () => {
    const lc = make();
    expect(lc.pauseReason).toBeNull();
    lc.pause('help');
    expect(lc.pauseReason).toBe('help');
    lc.resume();
    expect(lc.pauseReason).toBeNull();
  });

  it('pause is a no-op when not playing', () => {
    const onPause = vi.fn();
    const lc = make({ onPause });
    lc.setPlaying(false);
    lc.pause();
    expect(lc.paused).toBe(false);
    expect(onPause).not.toHaveBeenCalled();
  });

  it('setPlaying(false) while paused clears pause without onResume', () => {
    const onResume = vi.fn();
    const lc = make({ onResume });
    lc.pause();
    lc.setPlaying(false);
    expect(lc.paused).toBe(false);
    expect(lc.pauseReason).toBeNull();
    expect(onResume).not.toHaveBeenCalled();
  });
});

describe('visibility', () => {
  it('hidden pauses with reason hidden; visible does not resume', () => {
    const onPause = vi.fn();
    const onResume = vi.fn();
    const lc = make({ onPause, onResume });
    setVisibility('hidden');
    expect(lc.paused).toBe(true);
    expect(lc.pauseReason).toBe('hidden');
    setVisibility('visible');
    expect(lc.paused).toBe(true);
    expect(onResume).not.toHaveBeenCalled();
    expect(onPause).toHaveBeenCalledTimes(1);
  });

  it('destroy removes the listener', () => {
    const onPause = vi.fn();
    const lc = make({ onPause });
    lc.destroy();
    setVisibility('hidden');
    expect(onPause).not.toHaveBeenCalled();
  });
});

describe('mute', () => {
  it('persists, notifies, and is read by a new lifecycle', () => {
    const storage = createStorage('global', null);
    const onMuteChange = vi.fn();
    const lc = make({ onMuteChange }, storage);
    expect(lc.muted).toBe(false);
    lc.setMuted(true);
    expect(lc.muted).toBe(true);
    expect(storage.get('muted', false)).toBe(true);
    expect(onMuteChange).toHaveBeenCalledWith(true);
    lc.setMuted(true);
    expect(onMuteChange).toHaveBeenCalledTimes(1);
    expect(make({}, storage).muted).toBe(true);
  });
});

describe('unlock', () => {
  it('fires once after the first pointerdown', () => {
    const lc = make();
    const cb = vi.fn();
    lc.onUnlock(cb);
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('pointerdown'));
    window.dispatchEvent(new Event('keydown'));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(lc.unlocked).toBe(true);
  });

  it('fires on keydown, and immediately when already unlocked', () => {
    const lc = make();
    const first = vi.fn();
    lc.onUnlock(first);
    window.dispatchEvent(new Event('keydown'));
    expect(first).toHaveBeenCalledTimes(1);
    const late = vi.fn();
    lc.onUnlock(late);
    expect(late).toHaveBeenCalledTimes(1);
  });
});

describe('subscribe', () => {
  it('receives current state immediately and on changes, and can unsubscribe', () => {
    const lc = make();
    const listener = vi.fn();
    const off = lc.subscribe(listener);
    expect(listener).toHaveBeenLastCalledWith({
      paused: false,
      pauseReason: null,
      muted: false,
      playing: true,
    });
    lc.pause('user');
    expect(listener).toHaveBeenLastCalledWith({
      paused: true,
      pauseReason: 'user',
      muted: false,
      playing: true,
    });
    const calls = listener.mock.calls.length;
    off();
    lc.resume();
    expect(listener).toHaveBeenCalledTimes(calls);
  });
});
