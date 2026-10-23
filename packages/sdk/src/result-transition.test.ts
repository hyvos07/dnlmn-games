import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResultTransition } from './result-transition.ts';

let transition: ResultTransition;
afterEach(() => {
  transition?.destroy();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(reduced = false) {
  let now = 0;
  let frame: FrameRequestCallback | undefined;
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frame = callback;
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {
    frame = undefined;
  });
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: reduced } as MediaQueryList);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  const game = { paused: false };
  const overlay = document.createElement('section');
  const button = document.createElement('button');
  overlay.append(button);
  overlay.hidden = true;
  document.body.append(overlay);
  const shortcut = document.createElement('button');
  document.body.append(shortcut);
  transition = new ResultTransition(game, overlay, [shortcut]);
  const reveal = vi.fn(() => {
    overlay.hidden = false;
  });
  const focus = vi.fn(() => button.focus());
  const clicked = vi.fn();
  button.addEventListener('click', clicked);
  shortcut.addEventListener('click', clicked);
  const advance = (ms: number) => {
    now += ms;
    const callback = frame;
    frame = undefined;
    callback?.(now);
  };
  const pointerDown = (target: HTMLElement) =>
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  const click = () =>
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
  return { game, overlay, button, shortcut, reveal, focus, clicked, advance, pointerDown, click };
}

describe('result presentation', () => {
  it('guards restart shortcuts outside the overlay, including presses that start before readiness', () => {
    const h = setup();
    transition.begin(h.reveal, h.focus);
    h.shortcut.click();
    expect(h.clicked).not.toHaveBeenCalled();
    h.pointerDown(h.shortcut);
    h.advance(1800);
    h.shortcut.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(h.clicked).not.toHaveBeenCalled();
    h.pointerDown(h.shortcut);
    h.shortcut.focus();
    h.shortcut.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(h.clicked).toHaveBeenCalledOnce();
  });

  it('keeps the final board visible, fades results, and blocks actions until the reading interval ends', () => {
    const h = setup();
    transition.begin(h.reveal, h.focus);
    h.advance(999);
    expect(h.overlay.hidden).toBe(true);
    h.advance(151);
    expect(h.reveal).toHaveBeenCalledOnce();
    expect(Number(h.overlay.style.opacity)).toBeCloseTo(0.5);
    expect(h.overlay.inert).toBe(true);
    h.pointerDown(h.button);
    h.click();
    expect(h.clicked).not.toHaveBeenCalled();
    h.advance(649);
    expect(transition.blocked).toBe(true);
    expect(h.focus).not.toHaveBeenCalled();
    h.advance(1);
    expect(transition.blocked).toBe(false);
    expect(h.overlay.inert).toBe(false);
    expect(h.focus).toHaveBeenCalledOnce();
    h.pointerDown(h.button);
    h.click();
    expect(h.clicked).toHaveBeenCalledOnce();
  });

  it('requires a new pointer press after readiness, including a gesture held across the transition', () => {
    const h = setup();
    transition.begin(h.reveal, h.focus);
    h.advance(1200);
    h.pointerDown(h.button);
    h.advance(600);
    h.click();
    expect(h.clicked).not.toHaveBeenCalled();
    h.pointerDown(document.body);
    h.click();
    expect(h.clicked).not.toHaveBeenCalled();
    h.pointerDown(h.button);
    h.click();
    expect(h.clicked).toHaveBeenCalledOnce();
  });

  it('does not transfer a held Space or repeated Enter to the newly focused Restart button', () => {
    const h = setup();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' }));
    transition.begin(h.reveal, h.focus);
    h.advance(1800);
    h.button.click();
    expect(h.clicked).not.toHaveBeenCalled();
    const release = new KeyboardEvent('keyup', {
      code: 'Space',
      key: ' ',
      cancelable: true,
      bubbles: true,
    });
    h.button.dispatchEvent(release);
    expect(release.defaultPrevented).toBe(true);
    const repeat = new KeyboardEvent('keydown', {
      code: 'Enter',
      key: 'Enter',
      repeat: true,
      cancelable: true,
      bubbles: true,
    });
    h.button.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    h.button.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'Enter', key: 'Enter', bubbles: true }),
    );
    h.button.click();
    expect(h.clicked).toHaveBeenCalledOnce();
  });

  it('freezes both hold and fade during a game pause and a hidden-tab gap', () => {
    const h = setup();
    transition.begin(h.reveal, h.focus);
    h.advance(500);
    h.game.paused = true;
    h.advance(5000);
    expect(h.reveal).not.toHaveBeenCalled();
    h.game.paused = false;
    h.advance(650);
    expect(Number(h.overlay.style.opacity)).toBeCloseTo(0.5);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    h.advance(10000);
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    h.advance(150);
    expect(h.overlay.style.opacity).toBe('1');
    expect(h.focus).not.toHaveBeenCalled();
    h.advance(500);
    expect(h.focus).toHaveBeenCalledOnce();
  });

  it('keeps the reading protection with reduced motion and can cancel without revealing stale results', () => {
    const h = setup(true);
    transition.begin(h.reveal, h.focus);
    h.advance(1000);
    expect(h.overlay.style.opacity).toBe('1');
    expect(transition.blocked).toBe(true);
    transition.cancel();
    h.advance(3000);
    expect(h.focus).not.toHaveBeenCalled();
    expect(h.overlay.inert).toBe(false);
    expect(h.overlay.style.opacity).toBe('');
    transition.begin(h.reveal, h.focus, 1500);
    h.advance(1499);
    expect(h.reveal).toHaveBeenCalledTimes(1);
    h.advance(801);
    expect(h.reveal).toHaveBeenCalledTimes(2);
    expect(h.focus).toHaveBeenCalledOnce();
  });
});
