import type { Game } from './index.ts';

const HOLD_MS = 1000;
const FADE_MS = 300;
const READ_MS = 500;

/** Opt-in end-of-run presentation. Save scores before calling begin(). */
export class ResultTransition {
  private readonly abort = new AbortController();
  private frame = 0;
  private active = false;
  private locked = false;
  private pointerReady = false;
  private readonly heldKeys = new Set<string>();
  private readonly staleKeys = new Set<string>();
  private last = 0;

  constructor(
    private readonly game: Pick<Game, 'paused'>,
    private readonly overlay: HTMLElement,
    additionalControls: readonly HTMLElement[] = [],
  ) {
    const controls = [overlay, ...additionalControls];
    const options = { capture: true, signal: this.abort.signal };
    window.addEventListener(
      'pointerdown',
      (event) => {
        this.pointerReady =
          this.active &&
          !this.blocked &&
          controls.some((control) => control.contains(event.target as Node));
      },
      options,
    );
    window.addEventListener(
      'pointercancel',
      () => {
        this.pointerReady = false;
      },
      options,
    );
    window.addEventListener(
      'keydown',
      (event) => {
        this.heldKeys.add(event.code);
        if (this.active && (this.blocked || event.repeat)) this.staleKeys.add(event.code);
        if (
          this.active &&
          controls.some((control) => control.contains(event.target as Node)) &&
          (event.key === 'Enter' || event.key === ' ') &&
          (this.blocked || event.repeat || this.staleKeys.has(event.code))
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      options,
    );
    window.addEventListener(
      'keyup',
      (event) => {
        this.heldKeys.delete(event.code);
        if (this.active && this.staleKeys.delete(event.code)) event.preventDefault();
      },
      options,
    );
    for (const control of controls)
      control.addEventListener(
        'click',
        (event) => {
          if (!this.active) return;
          if (
            this.blocked ||
            (event.detail > 0 && !this.pointerReady) ||
            (event.detail === 0 && this.staleKeys.size > 0)
          ) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
          this.pointerReady = false;
        },
        options,
      );
    window.addEventListener(
      'blur',
      (event) => {
        if (event.target !== window) return;
        this.heldKeys.clear();
        this.staleKeys.clear();
        this.pointerReady = false;
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        this.last = performance.now();
        this.pointerReady = false;
      },
      { signal: this.abort.signal },
    );
  }

  get blocked(): boolean {
    return this.active && (this.locked || this.game.paused || document.hidden);
  }

  /** Hold the final board, fade in results, then allow a fresh activation. */
  begin(reveal: () => void, focus: () => void, holdMs = HOLD_MS): void {
    this.cancel();
    this.active = true;
    this.locked = true;
    for (const key of this.heldKeys) this.staleKeys.add(key);
    this.overlay.inert = true;
    this.overlay.style.opacity = '0';
    this.overlay.dataset.resultPhase = 'hold';
    this.last = performance.now();
    let elapsed = 0;
    let revealed = false;
    const tick = (now: number) => {
      const delta = Math.max(0, now - this.last);
      this.last = now;
      if (!this.game.paused && !document.hidden) elapsed += delta;
      if (elapsed >= holdMs && !revealed) {
        revealed = true;
        reveal();
        // A game's reveal function may also update inert; the guard owns it until ready.
        this.overlay.inert = true;
      }
      if (revealed) {
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.overlay.style.opacity = String(
          reduced ? 1 : Math.min(1, (elapsed - holdMs) / FADE_MS),
        );
        this.overlay.dataset.resultPhase = elapsed < holdMs + FADE_MS ? 'fade' : 'read';
      }
      if (elapsed >= holdMs + FADE_MS + READ_MS) {
        this.locked = false;
        this.overlay.inert = false;
        this.overlay.style.removeProperty('opacity');
        this.overlay.dataset.resultPhase = 'ready';
        focus();
      } else this.frame = requestAnimationFrame(tick);
    };
    tick(this.last);
  }

  cancel(): void {
    cancelAnimationFrame(this.frame);
    this.active = false;
    this.locked = false;
    this.pointerReady = false;
    this.staleKeys.clear();
    this.overlay.inert = false;
    this.overlay.style.removeProperty('opacity');
    delete this.overlay.dataset.resultPhase;
  }

  destroy(): void {
    this.cancel();
    this.abort.abort();
  }
}
