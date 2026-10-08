import type { GameStorage } from './storage.ts';

export interface LifecycleCallbacks {
  onPause?: () => void;
  onResume?: () => void;
  onMuteChange?: (muted: boolean) => void;
}

export type PauseReason = 'user' | 'hidden' | 'orientation' | 'help';

export interface Lifecycle {
  readonly paused: boolean;
  readonly pauseReason: PauseReason | null;
  readonly muted: boolean;
  /** Whether a round is in progress. Pausing only applies while playing. */
  readonly playing: boolean;
  readonly unlocked: boolean;
  pause(reason?: PauseReason): void;
  resume(): void;
  setPlaying(playing: boolean): void;
  setMuted(muted: boolean): void;
  /** Run `callback` once after the first user gesture (immediately if it already happened). */
  onUnlock(callback: () => void): void;
  /** Observe state changes (used by the HUD). Returns an unsubscribe function. */
  subscribe(listener: (state: LifecycleState) => void): () => void;
  destroy(): void;
}

export interface LifecycleState {
  paused: boolean;
  pauseReason: PauseReason | null;
  muted: boolean;
  playing: boolean;
}

/** Events that count as a user gesture for unlocking audio (iOS needs `touchend`). */
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'] as const;
export const MUTED_KEY = 'muted';

/**
 * Pause/resume, mute and audio-unlock state, wired to `visibilitychange`.
 *
 * Returning to the tab deliberately does not auto-resume: the game stays paused
 * until the player resumes, so they aren't ambushed mid-action.
 */
export function createLifecycle(
  callbacks: LifecycleCallbacks,
  globalStorage: GameStorage,
  doc: Document = document,
): Lifecycle {
  let paused = false;
  let pauseReason: PauseReason | null = null;
  let playing = true;
  let muted = globalStorage.get<boolean>(MUTED_KEY, false) === true;
  let unlocked = false;
  const unlockCallbacks: Array<() => void> = [];
  const listeners = new Set<(state: LifecycleState) => void>();
  const win = doc.defaultView ?? window;

  const emit = () => {
    const state: LifecycleState = { paused, pauseReason, muted, playing };
    for (const listener of listeners) listener(state);
  };

  const unlock = () => {
    if (unlocked) return;
    unlocked = true;
    for (const event of UNLOCK_EVENTS) win.removeEventListener(event, unlock, true);
    for (const callback of unlockCallbacks.splice(0)) callback();
  };
  for (const event of UNLOCK_EVENTS) win.addEventListener(event, unlock, true);

  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') api.pause('hidden');
  };
  doc.addEventListener('visibilitychange', onVisibility);

  const api: Lifecycle = {
    get paused() {
      return paused;
    },
    get pauseReason() {
      return pauseReason;
    },
    get muted() {
      return muted;
    },
    get playing() {
      return playing;
    },
    get unlocked() {
      return unlocked;
    },
    pause(reason = 'user') {
      if (paused || !playing) return;
      paused = true;
      pauseReason = reason;
      callbacks.onPause?.();
      emit();
    },
    resume() {
      if (!paused) return;
      paused = false;
      pauseReason = null;
      callbacks.onResume?.();
      emit();
    },
    setPlaying(next) {
      if (playing === next) return;
      // Leaving play (title or game-over screen) clears any pause without a resume callback.
      if (!next && paused) {
        paused = false;
        pauseReason = null;
      }
      playing = next;
      emit();
    },
    setMuted(next) {
      if (muted === next) return;
      muted = next;
      globalStorage.set(MUTED_KEY, muted);
      callbacks.onMuteChange?.(muted);
      emit();
    },
    onUnlock(callback) {
      if (unlocked) callback();
      else unlockCallbacks.push(callback);
    },
    subscribe(listener) {
      listeners.add(listener);
      listener({ paused, pauseReason, muted, playing });
      return () => listeners.delete(listener);
    },
    destroy() {
      doc.removeEventListener('visibilitychange', onVisibility);
      for (const event of UNLOCK_EVENTS) win.removeEventListener(event, unlock, true);
      listeners.clear();
      unlockCallbacks.length = 0;
    },
  };
  return api;
}
