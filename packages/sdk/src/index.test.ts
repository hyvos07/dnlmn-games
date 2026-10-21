import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Game, initGame } from './index.ts';

const manifest = { slug: 'demo-game', title: 'Demo' };
let game: Game | null = null;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  game?.destroy();
  game = null;
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
  window.localStorage.clear();
});

const pressKey = (key: string) =>
  document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

describe('initGame', () => {
  it('mounts one HUD with the expected buttons', () => {
    game = initGame(manifest);
    const huds = document.querySelectorAll('[data-games-hud]');
    expect(huds).toHaveLength(1);
    const root = huds[0]?.shadowRoot;
    expect(root).toBeTruthy();
    expect(root?.querySelector('[aria-label="Pause"]')).toBeNull();
    expect(root?.querySelector('[aria-label="Paused"]')).toBeNull();
    const labels = [...(root?.querySelectorAll('button') ?? [])].map((b) =>
      b.getAttribute('aria-label'),
    );
    for (const label of ['Back to menu', 'Mute', 'How to play']) {
      expect(labels).toContain(label);
    }
  });

  it('uses the dnlmn:<slug>: prefix in localStorage', () => {
    game = initGame(manifest);
    game.storage.set('best', 12);
    expect(window.localStorage.getItem('dnlmn:demo-game:best')).toBe('12');
  });

  it('returns the same instance when called twice', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    game = initGame(manifest);
    expect(initGame(manifest)).toBe(game);
    expect(warn).toHaveBeenCalled();
    expect(document.querySelectorAll('[data-games-hud]')).toHaveLength(1);
  });

  it('toggles mute with the m key', () => {
    game = initGame(manifest);
    pressKey('m');
    expect(game.muted).toBe(true);
    pressKey('m');
    expect(game.muted).toBe(false);
  });

  it('ignores the m key when reserved', () => {
    game = initGame(manifest, { reservedKeys: ['m'] });
    pressKey('m');
    expect(game.muted).toBe(false);
  });

  it('Escape pauses while playing and calls onPause', () => {
    const onPause = vi.fn();
    game = initGame(manifest, { onPause, platformPause: true });
    pressKey('Escape');
    expect(game.paused).toBe(true);
    expect(onPause).toHaveBeenCalledTimes(1);
    const root = document.querySelector('[data-games-hud]')?.shadowRoot;
    expect(root?.querySelector('[aria-label="Paused"]')?.classList.contains('on')).toBe(true);
    pressKey('Escape');
    expect(game.paused).toBe(false);
    expect(root?.querySelector('[aria-label="Paused"]')?.classList.contains('on')).toBe(false);
  });

  it('leaves Escape and explicit pause UI to the game by default', () => {
    game = initGame(manifest);
    expect(pressKey('Escape')).toBe(true);
    expect(game.paused).toBe(false);
    game.pause();
    expect(game.paused).toBe(true);
    expect(
      document
        .querySelector('[data-games-hud]')
        ?.shadowRoot?.querySelector('[aria-label="Paused"]'),
    ).toBeNull();
    game.resume();
    expect(game.paused).toBe(false);
  });

  it('resumes hidden-tab pauses without overriding a game-owned pause', () => {
    game = initGame(manifest);
    const visibility = (state: string) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    visibility('hidden');
    expect(game.paused).toBe(true);
    visibility('visible');
    expect(game.paused).toBe(false);
    game.pause();
    visibility('hidden');
    visibility('visible');
    expect(game.paused).toBe(true);
  });

  it.each([false, true])(
    'recovers orientation interruptions with platformPause=%s',
    (platformPause) => {
      const orientation = window.matchMedia('(orientation: portrait)');
      const coarse = window.matchMedia('(pointer: coarse)');
      let portrait = false;
      vi.spyOn(orientation, 'matches', 'get').mockImplementation(() => portrait);
      vi.spyOn(coarse, 'matches', 'get').mockReturnValue(true);
      vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
        query === '(pointer: coarse)' ? coarse : orientation,
      );
      game = initGame({ ...manifest, orientation: 'portrait' }, { platformPause });
      expect(game.paused).toBe(true);
      portrait = true;
      orientation.dispatchEvent(new Event('change'));
      expect(game.paused).toBe(platformPause);
    },
  );

  it('destroy removes the HUD and allows a fresh init', () => {
    game = initGame(manifest);
    const first = game;
    first.destroy();
    expect(document.querySelectorAll('[data-games-hud]')).toHaveLength(0);
    game = initGame(manifest);
    expect(game).not.toBe(first);
    expect(document.querySelectorAll('[data-games-hud]')).toHaveLength(1);
  });
});
