import type { Game } from '@games/sdk';
import type { Sound } from './audio.ts';
import { autopilot } from './logic/autopilot.ts';
import type { Board, Dir, Vec } from './logic/grid.ts';
import { enqueueTurn, nextTurn } from './logic/input-queue.ts';
import { createRng, type Rng } from './logic/rng.ts';
import { createState, type SnakeState, step } from './logic/snake.ts';
import { stepMs } from './logic/speed.ts';
import type { Effects } from './render/effects.ts';
import type { Palette, Renderer } from './render/renderer.ts';
import type { Ui } from './ui.ts';

type Mode = 'attract' | 'playing' | 'over';

export interface SnakeDeps {
  board: Board;
  sdk: Game;
  renderer: Renderer;
  effects: Effects;
  sound: Sound;
  ui: Ui;
  palette: Palette;
  /** Fixed seed (from `?seed=`) for reproducible rounds, e.g. in e2e tests. */
  seed: number | null;
  randomSeed: () => number;
}

const ATTRACT_STEP_MS = 95;
/** Delay before the game-over card, so the death animation reads first. */
const OVER_CARD_MS = 520;
/** Ignore restart input until the card is up, so a held key doesn't skip it. */
const RESTART_GRACE_MS = OVER_CARD_MS + 80;
const HIGHSCORE_KEY = 'highscore';

/** The game loop: fixed-timestep logic with render interpolation between steps. */
export class SnakeGame {
  private mode: Mode = 'attract';
  private state: SnakeState;
  private prev: readonly Vec[];
  private queue: Dir[] = [];
  private rng: Rng;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;
  private diedAt = 0;
  private overTimer = 0;
  private foodBornAt = 0;
  private best: number;

  constructor(private readonly deps: SnakeDeps) {
    this.rng = createRng(deps.randomSeed());
    this.state = createState(deps.board, this.rng);
    this.prev = this.state.body;
    this.best = deps.sdk.storage.get<number>(HIGHSCORE_KEY, 0);
    deps.ui.setBest(this.best);
    deps.ui.setScore(0);
  }

  get score(): number {
    return this.state.score;
  }

  begin(): void {
    this.enterAttract();
    this.resume();
  }

  /** Arrow/WASD/swipe. On the title screen a direction also starts the round. */
  turn(dir: Dir): void {
    if (this.mode === 'attract') {
      this.startRound();
      if (dir !== 'left') this.queue = enqueueTurn(this.queue, this.state.dir, dir);
      return;
    }
    if (this.mode !== 'playing' || this.deps.sdk.paused) return;
    const before = this.queue.length;
    this.queue = enqueueTurn(this.queue, this.state.dir, dir);
    if (this.queue.length > before) this.deps.sound.turn();
  }

  /** Start or restart. `fromButton` skips the grace period: the button only exists once the card is up. */
  primary(fromButton = false): void {
    if (this.mode === 'attract') this.startRound();
    else if (
      this.mode === 'over' &&
      (fromButton || performance.now() - this.diedAt > RESTART_GRACE_MS)
    ) {
      this.startRound();
    }
  }

  pause(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.deps.sound.suspend();
  }

  resume(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.deps.sound.resume();
    this.raf = requestAnimationFrame(this.frame);
  }

  private enterAttract(): void {
    this.mode = 'attract';
    this.deps.sdk.setPlaying(false);
    this.reset(createRng(this.deps.randomSeed()));
    this.deps.ui.showStart();
  }

  private startRound(): void {
    window.clearTimeout(this.overTimer);
    const seed = this.deps.seed ?? this.deps.randomSeed();
    this.reset(createRng(seed));
    this.mode = 'playing';
    this.deps.sdk.setPlaying(true);
    this.deps.ui.setScore(0);
    this.deps.ui.showPlaying();
    this.deps.sound.start();
  }

  private reset(rng: Rng): void {
    this.rng = rng;
    this.state = createState(this.deps.board, rng);
    this.prev = this.state.body;
    this.queue = [];
    this.acc = 0;
    this.foodBornAt = performance.now();
    this.deps.effects.clear();
  }

  private stepDuration(): number {
    return this.mode === 'attract' ? ATTRACT_STEP_MS : stepMs(this.state.eaten);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    // Clamp long gaps (tab switches, breakpoints) so the snake never teleports.
    const dt = Math.min(100, now - this.last);
    this.last = now;
    this.deps.effects.update(dt);

    if (this.state.alive && !this.state.won && this.mode !== 'over') {
      this.acc += dt;
      let duration = this.stepDuration();
      while (this.acc >= duration && this.state.alive) {
        this.acc -= duration;
        this.tick(now);
        duration = this.stepDuration();
      }
    }

    const duration = this.stepDuration();
    const moving = this.state.alive && this.mode !== 'over';
    this.deps.renderer.draw(
      {
        prev: this.prev,
        cur: this.state.body,
        t: moving ? this.acc / duration : 1,
        dir: this.state.dir,
        food: this.state.food,
        foodBornAt: this.foodBornAt,
        alive: this.state.alive,
        now,
        speed: 1 / duration,
      },
      this.deps.effects,
    );
    this.raf = requestAnimationFrame(this.frame);
  };

  private tick(now: number): void {
    let dir: Dir;
    if (this.mode === 'attract') {
      dir = autopilot(this.state);
    } else {
      const next = nextTurn(this.queue, this.state.dir);
      dir = next.dir;
      this.queue = next.queue;
    }
    const before = this.state;
    const { state, events } = step(before, dir, this.rng);
    if (state.alive) this.prev = before.body;
    this.state = state;

    const { effects, sound, ui, palette } = this.deps;
    const playing = this.mode === 'playing';
    for (const event of events) {
      if (event.type === 'eat') {
        const x = event.at.x + 0.5;
        const y = event.at.y + 0.5;
        effects.burst(x, y, [palette.food, palette.snake, '#F4F1EA'], playing ? 18 : 10);
        effects.ring(x, y, palette.food);
        effects.bulge();
        this.foodBornAt = now;
        if (playing) {
          effects.popup(x, y, `+${event.points}`);
          effects.shake(0.32);
          sound.eat(state.eaten);
          ui.setScore(state.score, true);
        }
      } else if (event.type === 'die') {
        if (playing) this.gameOver(now, false);
        else window.setTimeout(() => this.mode === 'attract' && this.enterAttract(), 900);
      } else if (event.type === 'win' && playing) {
        this.gameOver(now, true);
      }
    }
  }

  private gameOver(now: number, won: boolean): void {
    const { effects, sound, ui, sdk, palette } = this.deps;
    this.mode = 'over';
    this.diedAt = now;
    sdk.setPlaying(false);
    const score = this.state.score;
    const newBest = score > this.best;
    if (newBest) {
      this.best = score;
      sdk.storage.set(HIGHSCORE_KEY, score);
      ui.setBest(score);
    }
    if (won) {
      sound.best();
    } else {
      effects.shake(0.85);
      effects.flash();
      sound.die();
      const head = this.state.body[0];
      if (head) effects.burst(head.x + 0.5, head.y + 0.5, [palette.danger, palette.snake], 22);
    }
    if (newBest && !won) sound.best();
    this.overTimer = window.setTimeout(
      () => this.mode === 'over' && ui.showOver(score, this.best, newBest, won),
      won ? 200 : OVER_CARD_MS,
    );
  }
}
