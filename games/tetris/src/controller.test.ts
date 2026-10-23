// @vitest-environment happy-dom
import { type InitOptions, initGame } from '@games/sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { boot } from './controller.ts';

vi.mock('@games/sdk', async (original) => ({
  ...(await original<typeof import('@games/sdk')>()),
  initGame: vi.fn(),
}));
vi.mock('./audio.ts', async (original) => ({
  ...(await original<typeof import('./audio.ts')>()),
  createAudio: () => ({ unlock: vi.fn(), play: vi.fn(), sync: vi.fn(), setVolume: vi.fn() }),
}));

let cleanup = () => {};
afterEach(() => cleanup());

function setup() {
  const root = document.createElement('div');
  document.body.append(root);
  const windowEvents = vi.spyOn(window, 'addEventListener');
  const documentEvents = vi.spyOn(document, 'addEventListener');
  const canvasContext = new Proxy({}, { get: () => () => {} }) as CanvasRenderingContext2D;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 200, 400),
  );
  Object.defineProperty(document, 'fonts', {
    configurable: true,
    value: { ready: Promise.resolve() },
  });
  let nextFrame: FrameRequestCallback = () => {};
  let now = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    nextFrame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  const saved = new Map<string, unknown>();
  const storage = {
    get: <T>(key: string, fallback: T): T => (saved.has(key) ? (saved.get(key) as T) : fallback),
    set: (key: string, value: unknown) => {
      saved.set(key, value);
    },
    remove: (key: string) => {
      saved.delete(key);
    },
    keys: () => [...saved.keys()],
    clear: () => saved.clear(),
  };
  let callbacks: InitOptions = {};
  const platform = {
    slug: 'tetris',
    storage,
    globalStorage: storage,
    paused: false,
    muted: false,
    unlocked: false,
    pause: vi.fn(() => {
      platform.paused = true;
      callbacks.onPause?.();
    }),
    resume: vi.fn(() => {
      platform.paused = false;
      callbacks.onResume?.();
    }),
    setPlaying: vi.fn((playing: boolean) => {
      if (!playing) platform.paused = false;
    }),
    setMuted: vi.fn((muted: boolean) => {
      platform.muted = muted;
      callbacks.onMuteChange?.(muted);
    }),
    onUnlock: vi.fn(),
    openHelp: vi.fn(),
    exitToMenu: vi.fn(),
    destroy: vi.fn(),
  };
  vi.mocked(initGame).mockImplementation((_manifest, options) => {
    callbacks = options ?? {};
    return platform;
  });
  boot(root);
  const element = <T extends HTMLElement = HTMLElement>(selector: string): T => {
    const found = root.querySelector<T>(selector);
    if (!found) throw new Error(`Missing ${selector}`);
    return found;
  };
  const click = (selector: string) => element(selector).click();
  const key = (code: string) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { code, key: code, bubbles: true }));
  const advance = (ms: number) => {
    now += ms;
    nextFrame(now);
  };
  const tap = (selector: string) => {
    element(selector).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    click(selector);
  };
  cleanup = () => {
    for (const [type, listener, options] of windowEvents.mock.calls)
      window.removeEventListener(type, listener, options);
    for (const [type, listener, options] of documentEvents.mock.calls)
      document.removeEventListener(type, listener, options);
    root.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  };
  click('[data-mode="sprint"]');
  advance(1200);
  click('[data-command="pause"]');
  return { root, platform, element, click, key, advance, tap };
}

describe('explicit pause', () => {
  it('keeps settings changes and closing settings paused until Resume', () => {
    const h = setup();
    const time = h.element('[data-stat="time"]').textContent;
    h.click('[data-banner-actions] [data-command="settings"]');
    const delay = h.element<HTMLInputElement>('#das');
    delay.value = '190';
    delay.dispatchEvent(new Event('change', { bubbles: true }));
    h.click('#sound');
    h.click('#effects');
    const volume = h.element<HTMLInputElement>('#music-volume');
    volume.value = '24';
    volume.dispatchEvent(new Event('input', { bubbles: true }));
    h.advance(3000);
    expect(h.root.dataset.screen).toBe('settings');
    expect(h.platform.paused).toBe(true);
    expect(h.element('[data-stat="time"]').textContent).toBe(time);
    h.click('[data-command="back"]');
    h.key('Escape');
    h.advance(2000);
    expect(h.root.dataset.screen).toBe('paused');
    expect(h.platform.paused).toBe(true);
    expect(h.element('[data-stat="time"]').textContent).toBe(time);
    h.click('[data-banner-actions] [data-command="resume"]');
    h.advance(500);
    expect(h.root.dataset.screen).toBe('play');
    expect(h.platform.paused).toBe(false);
    expect(h.element('[data-stat="time"]').textContent).not.toBe(time);
  });

  it('uses real backdrop taps, never panel clicks or a drag ending outside', () => {
    const h = setup();
    expect(h.element('.play-screen').inert).toBe(true);
    h.tap('[data-banner-title]');
    expect(h.root.dataset.screen).toBe('paused');
    h.click('[data-banner-actions] [data-command="settings"]');
    expect(h.element('[data-run-overlay]').inert).toBe(true);
    h.element('#music-volume').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    h.click('[data-settings]');
    expect(h.root.dataset.screen).toBe('settings');
    h.tap('[data-settings]');
    expect(h.root.dataset.screen).toBe('paused');
    expect(h.platform.paused).toBe(true);
    h.element('[data-banner-title]').dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    h.click('[data-run-overlay]');
    expect(h.root.dataset.screen).toBe('paused');
    h.tap('[data-run-overlay]');
    expect(h.root.dataset.screen).toBe('play');
    expect(h.element('.play-screen').inert).toBe(false);
  });

  it('preserves the manual pause across platform resume callbacks and blocks background commands', () => {
    const h = setup();
    h.click('.play-actions [data-command="menu"]');
    expect(h.root.dataset.screen).toBe('paused');
    h.click('[data-banner-actions] [data-command="settings"]');
    h.platform.resume();
    expect(h.platform.paused).toBe(true);
    h.key('Escape');
    expect(h.root.dataset.screen).toBe('paused');
    h.platform.resume();
    expect(h.platform.paused).toBe(true);
    h.click('[data-banner-actions] [data-command="resume"]');
    expect(h.platform.paused).toBe(false);
  });

  it('accepts clicks on SVG pause artwork while ignoring ordinary gameplay content', () => {
    const h = setup();
    h.click('[data-banner-actions] [data-command="resume"]');
    const time = h.element('[data-stat="time"]').textContent;
    h.click('[data-stat="time"]');
    expect(h.element('[data-stat="time"]').textContent).toBe(time);
    h.root
      .querySelector('[data-command="pause"] svg rect')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(h.root.dataset.screen).toBe('paused');
  });
});
