import { getAccent } from '@games/config/theme';
import { type Game, initGame } from '@games/sdk';
import manifest from '../game.json';
import { Sound } from './audio.ts';
import {
  advanceRound,
  clicksPerSecond,
  createRound,
  hitLane,
  type Mode,
  remainingSeconds,
} from './logic/rules.ts';
import { setupModeSelect } from './mode-select.ts';
import { boardRowHeight, type PassedTile, renderBoard } from './renderer.ts';
import { visuals } from './visuals.ts';

const KEYS = ['d', 'f', 'j', 'k'];
const MISS_RESULTS_DELAY = 1.5;
type Screen = 'menu' | 'playing' | 'miss' | 'over';
const MODES: Record<Mode, { name: string; description: string }> = {
  timed: {
    name: 'Normal',
    description: '20 seconds. One wrong tap ends the run.',
  },

  endless: {
    name: 'Endless',
    description: 'No time limit. One wrong tap ends the run.',
  },

  practice: {
    name: 'Practice',
    description: 'No time limit. Mistakes are okay.',
  },
};

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Missing game element: ${id}`);
  return found as T;
}

export class TileRush {
  private readonly stage = element('stage');
  private readonly canvas = element<HTMLCanvasElement>('board');
  private readonly ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
  private readonly mode = element<HTMLInputElement>('mode');
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly showLane = element<HTMLInputElement>('show-lane');
  private readonly showTapEffect = element<HTMLInputElement>('show-tap-effect');
  private readonly game: Game;
  private readonly sound: Sound;
  private round = createRound('timed', Math.random, 20, 24);
  private demo = createRound('practice', Math.random, 20, 24);
  private screen: Screen = 'menu';
  private bestScore = 0;
  private runBestScore = 0;
  private lastTime = performance.now();
  private demoElapsed = 0;
  private passedTiles: PassedTile[] = [];
  private missLane = -1;
  private missAt = -10;
  private missAge = 0;
  private missRow = 0;
  private frame = 0;
  private width = 480;
  private height = 800;
  private slideRows = 0;
  private slideFrom = 0;
  private slideElapsed = 0;

  constructor() {
    this.game = initGame(manifest, {
      root: this.canvas,
      reservedKeys: ['f'],
      onPause: () => this.sound?.suspend(),
      onResume: () => {
        this.lastTime = performance.now();
        this.sound?.resume();
      },
      onMuteChange: (muted) => this.sound?.setMuted(muted),
    });
    this.sound = new Sound(this.game.muted);
    this.game.onUnlock(() => this.sound.unlock());
    this.game.setPlaying(false);
    this.applyAppearance();
    for (const [input, key] of [
      [this.showLane, 'show-lane'],
      [this.showTapEffect, 'show-tap-effect'],
    ] as const) {
      input.checked = this.game.storage.get<boolean>(key, true) !== false;
      input.setAttribute('aria-checked', String(input.checked));
      input.addEventListener('change', () => {
        input.setAttribute('aria-checked', String(input.checked));
        this.game.storage.set(key, input.checked);
        this.drawBoard();
      });
    }
    setupModeSelect(element('mode-picker'));
    this.bindInput();
    this.updateMode();
    this.setScreen('menu');
    const resize = () => {
      const ratio = Math.min(devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      this.width = rect.width;
      this.height = rect.height;
      this.canvas.width = Math.round(this.width * ratio);
      this.canvas.height = Math.round(this.height * ratio);
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    new ResizeObserver(resize).observe(this.canvas);
    this.frame = requestAnimationFrame(this.tick);
    window.addEventListener('pagehide', () => {
      cancelAnimationFrame(this.frame);
      this.sound.suspend();
    });
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      this.lastTime = performance.now();
      cancelAnimationFrame(this.frame);
      this.frame = requestAnimationFrame(this.tick);
    });
  }

  private applyAppearance(): void {
    const accent = getAccent();
    document.documentElement.style.setProperty('--games-accent', accent.accent);
    document.documentElement.style.setProperty('--games-on-accent', accent.onAccent);
    for (const key of ['accent', 'background', 'panel', 'ink', 'muted'] as const) {
      document.documentElement.style.setProperty(`--${key}`, visuals[key]);
    }
    document.title = manifest.title;
    element('title').textContent = manifest.title;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', visuals.background);
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', manifest.description);
  }

  private bindInput(): void {
    const results = element('results');
    let pointerStartedInResults = false;
    window.addEventListener(
      'pointerdown',
      (event) => {
        pointerStartedInResults = results.contains(event.target as Node);
      },
      true,
    );
    // A miss reveals results during pointerdown. Its trailing click belongs to the
    // board gesture, even if the new Again button appears beneath that finger.
    results.addEventListener(
      'click',
      (event) => {
        if (event.detail > 0 && !pointerStartedInResults) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      true,
    );
    element('play').addEventListener('click', () => this.start());
    element('again').addEventListener('click', () => this.start());
    element('menu').addEventListener('click', () => {
      this.passedTiles = [];
      this.slideRows = 0;
      this.slideFrom = 0;
      this.setScreen('menu');
      this.updateMode();
      element('play').focus();
    });
    element('help').addEventListener('click', () => this.game.openHelp());
    element('finish-run').addEventListener('click', () => {
      if (this.game.paused || this.screen !== 'playing') return;
      this.updateClock(performance.now());
      if (this.screen !== 'playing') return;
      this.round.phase = 'over';
      this.finish();
    });
    this.mode.addEventListener('change', () => this.updateMode());
    document.querySelectorAll<HTMLButtonElement>('[data-lane]').forEach((button) => {
      button.addEventListener('click', () => this.hit(Number(button.dataset.lane)));
    });
    window.addEventListener('keydown', (event) => {
      if (
        this.screen !== 'playing' ||
        this.game.paused ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      if ((event.target as HTMLElement)?.closest('input, select, textarea, [contenteditable]'))
        return;
      const lane = KEYS.indexOf(event.key.toLowerCase());
      if (lane < 0) return;
      event.preventDefault();
      if (!event.repeat) this.hit(lane);
    });
    this.canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.pointerType !== 'touch' && !event.isPrimary)) return;
      const rect = this.canvas.getBoundingClientRect();
      const y = event.clientY - rect.top;
      // EatOwi accepts lane taps in the bottom three rows, including during scrolling.
      // There is no animation lock or wait before the next target can be hit.
      if (y < Math.max(0, rect.height - boardRowHeight(rect.width) * 3) || y > rect.height) return;
      event.preventDefault();
      const rowHeight = boardRowHeight(rect.width);
      const offset = this.motion.matches ? 0 : -this.slideRows * rowHeight;
      const row = Math.floor((y - (rect.height - rowHeight * 2) - offset) / rowHeight);
      this.hit(Math.floor(((event.clientX - rect.left) / rect.width) * 4), row);
    });
  }

  private selectedMode(): Mode {
    return this.mode.value === 'practice' || this.mode.value === 'endless'
      ? this.mode.value
      : 'timed';
  }

  private updateMode(): void {
    const mode = this.selectedMode();
    element('mode-description').textContent = MODES[mode].description;
    this.bestScore = this.game.storage.get<number>(`best:${mode}`, 0);
    if (!Number.isSafeInteger(this.bestScore) || this.bestScore < 0) this.bestScore = 0;
    this.round = createRound(mode, Math.random, 20, 24);
    this.updateStats();
  }

  private setScreen(screen: Screen): void {
    this.screen = screen;
    this.stage.dataset.screen = screen;
    element('start').hidden = screen !== 'menu';
    element('run-info').hidden = screen !== 'playing' && screen !== 'miss';
    element('results').hidden = screen !== 'over';
    this.game.setPlaying(screen === 'playing' || screen === 'miss');
    document.querySelectorAll<HTMLButtonElement>('[data-lane]').forEach((button) => {
      button.disabled = screen !== 'playing';
    });
    this.canvas.tabIndex = screen === 'playing' ? 0 : -1;
    element('finish-run').hidden = this.selectedMode() === 'timed';
    element<HTMLButtonElement>('finish-run').disabled = screen !== 'playing';
  }

  private start(): void {
    this.sound.unlock();
    this.runBestScore = this.bestScore;
    this.round = createRound(this.selectedMode(), Math.random, 20, 24);
    this.lastTime = performance.now();
    this.passedTiles = [];
    this.slideRows = 0;
    this.slideFrom = 0;
    this.slideElapsed = 0;
    this.missLane = -1;
    this.missAge = 0;
    this.missRow = 0;
    this.setScreen('playing');
    element('live-hint').textContent = 'Find the first target to begin.';
    this.updateStats();
    this.updateTarget();
    this.canvas.focus({ preventScroll: true });
    this.drawBoard();
  }

  private updateClock(now: number): void {
    const delta = Math.max(0, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (!this.game.paused) {
      this.passedTiles = this.passedTiles.map((tile) => ({
        ...tile,
        age: (tile.age ?? 0) + delta,
      }));
    }
    if (!this.game.paused && this.screen !== 'miss') {
      this.slideElapsed = Math.min(0.15, this.slideElapsed + delta);
      const remaining = 1 - this.slideElapsed / 0.15;
      this.slideRows = this.motion.matches ? 0 : this.slideFrom * remaining ** 3;
      this.passedTiles = this.passedTiles.filter((tile) => tile.distance < this.slideRows + 2);
    }
    if (this.screen === 'miss' && !this.game.paused) {
      this.missAge += delta;
      if (this.missAge >= MISS_RESULTS_DELAY) this.finish();
    }
    if (this.screen === 'playing' && !this.game.paused) {
      advanceRound(this.round, delta);
      if (this.round.phase === 'over') this.finish();
    }
  }

  private passTile(lane: number, variant: number): void {
    this.passedTiles = this.passedTiles.map((tile) => ({ ...tile, distance: tile.distance + 1 }));
    this.passedTiles.push({ lane, variant, distance: 1, age: 0 });
    // Retarget from the current visual position so rapid taps keep the board continuous.
    this.slideRows = this.motion.matches ? 0 : this.slideRows + 1;
    this.slideFrom = this.slideRows;
    this.slideElapsed = 0;
  }

  private hit(lane: number, row = 0): void {
    if (this.screen !== 'playing' || this.game.paused) return;
    const now = performance.now();
    this.updateClock(now);
    if (this.screen !== 'playing') return;
    const variant = this.round.rows[0]?.variant ?? 0;
    const result = hitLane(this.round, lane);
    if (result === 'ignored') return;
    this.sound.play(lane, result === 'miss');
    if (result === 'hit') {
      if (this.round.score > this.bestScore) {
        this.bestScore = this.round.score;
        this.game.storage.set(`best:${this.round.mode}`, this.bestScore);
      }
      this.passTile(lane, variant);
      this.missLane = -1;
      element('live-hint').textContent =
        this.round.mode === 'practice'
          ? `Keep finding your rhythm. Mistakes: ${this.round.mistakes}.`
          : 'Keep tapping the lowest live tile.';
    } else {
      this.missLane = lane;
      this.missAt = now / 1000;
      this.missAge = 0;
      this.missRow = row;
      element('live-hint').textContent =
        `Try the glowing target. Mistakes: ${this.round.mistakes}.`;
    }
    if (this.round.phase === 'over') {
      this.setScreen('miss');
      element('announcement').textContent = 'Wrong tile. Run over.';
    }
    this.updateStats();
    this.updateTarget();
    this.drawBoard();
  }

  private finish(): void {
    const cps = clicksPerSecond(this.round);
    const newBest = this.round.score > this.runBestScore;
    this.setScreen('over');
    this.updateStats();
    element('final-score').textContent = String(this.round.score);
    element('result-reason').textContent =
      this.round.endReason === 'time'
        ? "Time's up"
        : this.round.endReason === 'miss'
          ? 'Wrong lane'
          : 'Run complete';
    element('final-cps').textContent = cps.toFixed(2);
    element('new-best').hidden = !newBest;
    element('announcement').textContent = `Run complete. ${this.round.score} targets hit.`;
    element('again').focus({ preventScroll: true });
  }

  private updateStats(): void {
    element('score').textContent = String(this.round.score);
    element('best-score').textContent = String(this.bestScore);
    element('time-label').textContent = this.round.mode === 'timed' ? 'Time' : 'CPS';
    element('time').textContent =
      this.round.mode === 'timed'
        ? remainingSeconds(this.round).toFixed(1)
        : clicksPerSecond(this.round).toFixed(2);
  }

  private updateTarget(): void {
    const lane = this.round.rows[0]?.lane ?? 0;
    this.canvas.dataset.nextLane = String(lane);
    this.canvas.setAttribute(
      'aria-label',
      `Next target: lane ${lane + 1}. Tap the lowest live target, above the dead tile, or press ${KEYS[lane]?.toUpperCase()}.`,
    );
  }

  private readonly tick = (now: number): void => {
    const delta = Math.max(0, (now - this.lastTime) / 1000);
    this.updateClock(now);
    if (this.screen === 'menu' && !this.motion.matches && !document.hidden) {
      this.demoElapsed += delta;
      if (this.demoElapsed >= 0.6) {
        this.demoElapsed %= 0.6;
        const lane = this.demo.rows[0]?.lane ?? 0;
        const variant = this.demo.rows[0]?.variant ?? 0;
        hitLane(this.demo, lane);
        this.passTile(lane, variant);
      }
    }
    if (this.screen === 'playing') this.updateStats();
    if (!this.game.paused) this.drawBoard();
    this.frame = requestAnimationFrame(this.tick);
  };

  private drawBoard(): void {
    renderBoard(
      this.ctx,
      this.width,
      this.height,
      this.screen === 'menu' ? this.demo : this.round,
      visuals,
      {
        passedTiles: this.passedTiles,
        showLane: this.showLane.checked,
        showTapEffect: this.showTapEffect.checked,
        missLane:
          this.round.phase === 'over' || performance.now() / 1000 - this.missAt < 0.6
            ? this.missLane
            : -1,
        missRow: this.missRow,
        missAge: this.screen === 'miss' ? this.missAge : performance.now() / 1000 - this.missAt,
        reducedMotion: this.motion.matches,
        slideRows: this.slideRows,
      },
    );
  }
}
