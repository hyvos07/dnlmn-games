import { mountHud } from './hud.ts';
import { createLifecycle, type LifecycleCallbacks } from './lifecycle.ts';
import { applyMobileDefaults } from './mobile.ts';
import { wantedOrientation, watchOrientation } from './orientation.ts';
import { createStorage, detectLocalStorage, type GameStorage } from './storage.ts';
import type { SdkManifest } from './types.ts';

export type { PauseReason } from './lifecycle.ts';
export type { GameStorage, StorageBackend } from './storage.ts';
export { createStorage } from './storage.ts';
export type { SdkManifest } from './types.ts';

export interface InitOptions extends LifecycleCallbacks {
  /** Opt into the shared pause button, overlay and Escape shortcut. Defaults to false. */
  platformPause?: boolean;
  /** `KeyboardEvent.key` values the game binds itself, so the HUD ignores them (e.g. `['f']`). */
  reservedKeys?: string[];
  /** The element the game renders into. Gets touch/zoom/context-menu defaults. Defaults to `<body>`. */
  root?: HTMLElement;
}

export interface Game {
  readonly slug: string;
  /** Storage namespaced to this game (`dnlmn:<slug>:`). */
  readonly storage: GameStorage;
  /** Settings shared by every game (`dnlmn:global:`), e.g. mute. */
  readonly globalStorage: GameStorage;
  readonly muted: boolean;
  readonly paused: boolean;
  /** True after the first user gesture, when audio may start. */
  readonly unlocked: boolean;
  setMuted(muted: boolean): void;
  pause(): void;
  resume(): void;
  /**
   * Tell the SDK whether a round is in progress. Pause (tab switch, rotate, or opt-in Esc) only
   * applies while playing, so title and game-over screens never show a pause overlay.
   * Defaults to `true`.
   */
  setPlaying(playing: boolean): void;
  /** Run once after the first user gesture (immediately if it already happened). Start audio here. */
  onUnlock(callback: () => void): void;
  openHelp(): void;
  exitToMenu(): void;
  destroy(): void;
}

let active: Game | null = null;

/**
 * Wire a game into the site: HUD, storage, pause on tab switch, global mute,
 * orientation prompt and mobile defaults. Call exactly once at startup (RULES §3).
 */
export function initGame(manifest: SdkManifest, options: InitOptions = {}): Game {
  if (active) {
    console.warn('[games/sdk] initGame() called twice; returning the existing instance');
    return active;
  }
  const backend = detectLocalStorage();
  const storage = createStorage(manifest.slug, backend);
  const globalStorage = createStorage('global', backend);
  const platformPause = options.platformPause === true;
  const lifecycle = createLifecycle(options, globalStorage, document, !platformPause);
  const exitToMenu = () => {
    window.location.href = '/';
  };
  const hud = mountHud({
    manifest,
    platformPause,
    lifecycle,
    exitToMenu,
    reservedKeys: options.reservedKeys ?? [],
  });
  const cleanMobile = applyMobileDefaults(options.root ?? document.body);
  const wanted = wantedOrientation(manifest.orientation);
  const stopOrientation = watchOrientation(wanted, (mismatched) => {
    if (mismatched) lifecycle.pause('orientation');
    else if (!platformPause && lifecycle.pauseReason === 'orientation') lifecycle.resume();
    if (wanted) hud.setRotatePrompt(mismatched, wanted);
  });

  const game: Game = {
    slug: manifest.slug,
    storage,
    globalStorage,
    get muted() {
      return lifecycle.muted;
    },
    get paused() {
      return lifecycle.paused;
    },
    get unlocked() {
      return lifecycle.unlocked;
    },
    setMuted: (muted) => lifecycle.setMuted(muted),
    pause: () => lifecycle.pause('user'),
    resume: () => lifecycle.resume(),
    setPlaying: (playing) => lifecycle.setPlaying(playing),
    onUnlock: (callback) => lifecycle.onUnlock(callback),
    openHelp: () => hud.openHelp(),
    exitToMenu,
    destroy() {
      stopOrientation();
      cleanMobile();
      hud.destroy();
      lifecycle.destroy();
      active = null;
    },
  };
  active = game;
  return game;
}
