import type { Game } from '@games/sdk';
import type { Sound } from './audio.ts';
import {
  abandonPrefix,
  advance,
  candidates,
  createGame,
  type Difficulty,
  editText,
  type GameEvent,
  type GameState,
  typeLetter,
} from './logic/game.ts';
import { Battlefield } from './render/battlefield.ts';
import type { Ui } from './ui.ts';
import { WordLabels } from './word-labels.ts';

export class Siege {
  private battlefield: Battlefield | null = null;
  private readonly labels: WordLabels;
  private state: GameState | null = null;
  private demo = createGame('normal', 831);
  private readonly bests: Record<Difficulty, number>;
  private readonly abort = new AbortController();
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly resize: ResizeObserver;
  private frame = 0;
  private last = 0;
  private demoLetter = 0;
  private nextUiUpdate = 0;
  private destroyed = false;
  private newBest = false;
  private composing = false;

  constructor(
    private readonly ui: Ui,
    private readonly sdk: Game,
    private readonly sound: Sound,
  ) {
    this.labels = new WordLabels(ui.labels);
    const best = (difficulty: Difficulty) => {
      const value = sdk.storage.get<unknown>(`best-${difficulty}`, 0);
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
    };
    this.bests = { baby: best('baby'), normal: best('normal'), 'fast-hand': best('fast-hand') };
    const saved = sdk.storage.get<string>('difficulty', 'normal');
    if (saved === 'baby' || saved === 'normal' || saved === 'fast-hand') ui.difficulty = saved;
    const typingMode = sdk.storage.get<unknown>('typing-mode', 'classic');
    if (typingMode === 'classic' || typingMode === 'editable') ui.typingMode = typingMode;
    ui.setBests(this.bests);
    this.resize = new ResizeObserver(() =>
      this.battlefield?.resize(ui.stage.clientWidth, ui.stage.clientHeight),
    );
    this.resize.observe(ui.stage);
    const options = { signal: this.abort.signal };
    ui.playButton.addEventListener('click', () => this.start(), options);
    ui.againButton.addEventListener('click', () => this.start(), options);
    ui.menuButton.addEventListener('click', () => this.menu(), options);
    ui.root.addEventListener(
      'difficultychange',
      () => sdk.storage.set('difficulty', ui.difficulty),
      options,
    );
    ui.root.addEventListener(
      'typingmodechange',
      () => sdk.storage.set('typing-mode', ui.typingMode),
      options,
    );
    ui.canvas.addEventListener(
      'pointerdown',
      () => {
        if (this.state && !this.state.ended && !sdk.paused)
          ui.typingInput.focus({ preventScroll: true });
      },
      options,
    );
    window.addEventListener('keydown', (event) => this.input(event), options);
    ui.typingInput.addEventListener('paste', (event) => event.preventDefault(), options);
    ui.typingInput.addEventListener('drop', (event) => event.preventDefault(), options);
    ui.typingInput.addEventListener(
      'beforeinput',
      (event) => {
        if (
          !this.state ||
          this.state.ended ||
          this.state.typingMode === 'classic' ||
          sdk.paused ||
          event.inputType === 'insertFromPaste' ||
          event.inputType === 'insertFromDrop'
        )
          event.preventDefault();
      },
      options,
    );
    ui.typingInput.addEventListener(
      'compositionstart',
      () => {
        this.composing = this.state?.typingMode === 'editable';
      },
      options,
    );
    ui.typingInput.addEventListener(
      'compositionend',
      () => {
        this.composing = false;
        this.fieldInput();
      },
      options,
    );
    ui.typingInput.addEventListener(
      'input',
      (event) => {
        if (this.composing || event.isComposing) return;
        this.fieldInput(event);
      },
      options,
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) {
          cancelAnimationFrame(this.frame);
          this.battlefield?.pause();
          sound.pause();
        } else if (!sdk.paused) {
          this.battlefield?.resume();
          this.loop();
        }
      },
      options,
    );
    this.motion.addEventListener(
      'change',
      () => {
        this.battlefield?.setReducedMotion(this.motion.matches);
        this.loop();
      },
      options,
    );
    ui.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        sdk.setPlaying(false);
        cancelAnimationFrame(this.frame);
        sound.pause();
        this.battlefield?.pause();
        this.saveBest();
        this.state = null;
        this.labels.clear();
        this.battlefield = null;
        ui.showUnavailable(
          'The rune engine lost its graphics connection. Reload this page to try again.',
        );
      },
      options,
    );
  }

  begin(): void {
    try {
      this.battlefield = new Battlefield(this.ui.canvas, this.motion.matches);
      this.battlefield.resize(this.ui.stage.clientWidth, this.ui.stage.clientHeight);
      this.menu();
    } catch {
      this.ui.showUnavailable(
        'The rune engine needs WebGL. Try a browser with hardware acceleration enabled.',
      );
    }
  }

  private start(): void {
    if (!this.battlefield) return;
    this.state = createGame(this.ui.difficulty, Date.now(), this.ui.typingMode);
    this.composing = false;
    this.ui.typingInput.readOnly = this.state.typingMode === 'classic';
    this.newBest = false;
    this.labels.clear();
    this.battlefield.reset();
    this.battlefield.resume();
    this.sound.resume();
    this.sdk.storage.set('difficulty', this.ui.difficulty);
    this.sdk.storage.set('typing-mode', this.ui.typingMode);
    this.sdk.setPlaying(true);
    this.ui.showScreen('playing');
    this.ui.update(this.state);
    this.ui.typingInput.focus({ preventScroll: true });
    this.nextUiUpdate = 0;
    this.loop();
  }

  private menu(): void {
    this.saveBest();
    this.state = null;
    this.sdk.setPlaying(false);
    this.sound.pause();
    this.labels.clear();
    this.battlefield?.reset();
    this.battlefield?.resume();
    this.demo = createGame('normal', 831);
    this.demoLetter = 0;
    this.ui.setBests(this.bests);
    this.ui.showScreen('menu');
    this.loop();
  }

  pause(): void {
    this.ui.typingInput.readOnly = true;
    this.ui.root.dataset.paused = 'true';
    cancelAnimationFrame(this.frame);
    this.battlefield?.pause();
    this.sound.pause();
  }

  resume(): void {
    this.ui.typingInput.readOnly = this.state?.typingMode !== 'editable';
    delete this.ui.root.dataset.paused;
    this.battlefield?.resume();
    if (this.state && !this.state.ended) {
      this.sound.resume();
      this.composing = false;
      this.fieldInput();
      this.ui.typingInput.focus({ preventScroll: true });
    }
    this.loop();
  }

  private input(event: KeyboardEvent): void {
    if (!this.battlefield || event.isComposing) return;
    if (
      event.key === 'Escape' &&
      event.target === this.ui.typingInput &&
      this.state &&
      !this.state.ended
    ) {
      event.preventDefault();
      if (this.sdk.paused) this.sdk.resume();
      else this.sdk.pause();
      return;
    }
    if (
      !this.state ||
      this.state.ended ||
      this.sdk.paused ||
      this.state.typingMode !== 'classic' ||
      event.target !== this.ui.typingInput ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    if (event.key === 'Backspace') {
      event.preventDefault();
      abandonPrefix(this.state);
    } else if (/^[a-z]$/i.test(event.key)) {
      event.preventDefault();
      if (event.repeat) return;
      const correct = this.state.correctLetters;
      this.events(typeLetter(this.state, event.key.toLowerCase()));
      if (this.state.correctLetters > correct) this.sound.letter();
    } else return;
    this.ui.update(this.state);
    if (this.battlefield) this.labels.update(this.state, this.battlefield);
  }

  private fieldInput(event?: InputEvent): void {
    if (
      !this.state ||
      this.state.ended ||
      this.sdk.paused ||
      this.composing ||
      this.state.typingMode !== 'editable'
    )
      return;
    const value = this.ui.typingInput.value;
    if (value === this.state.buffer) return;
    const correct = this.state.correctLetters;
    const inputType = event?.inputType ?? '';
    const inserted =
      inputType.startsWith('delete') || inputType.startsWith('history')
        ? ''
        : (event?.data ?? undefined);
    this.events(editText(this.state, value, inserted));
    if (this.state.correctLetters > correct) this.sound.letter();
    this.ui.update(this.state);
    if (this.battlefield) this.labels.update(this.state, this.battlefield);
  }

  private events(events: GameEvent[], demo = false): void {
    for (const event of events) {
      this.battlefield?.event(event);
      if (event.type === 'mistake')
        this.labels.mistake(event.id, (demo ? this.demo : this.state)?.elapsed ?? 0);
      if (demo) continue;
      if (event.type === 'hit') {
        this.saveBest();
        this.sound.hit(!event.killed);
        this.ui.feedback('hit', `+${event.points}`);
      } else if (event.type === 'mistake') {
        this.sound.mistake();
        this.ui.feedback(
          'mistake',
          this.state?.typingMode === 'classic'
            ? 'Keep your prefix. Try the next letter.'
            : 'No matching word. Edit your text.',
        );
      } else if (event.type === 'damage') {
        this.sound.damage();
        this.ui.feedback('damage', 'The shield takes a hit');
      } else if (event.type === 'wave') {
        this.sound.wave();
        this.ui.feedback('wave', `Wave ${event.wave} · The Host returns`);
      } else if (event.type === 'end') this.finish();
    }
  }

  private saveBest(): void {
    const state = this.state;
    if (!state || state.score <= this.bests[state.difficulty]) return;
    this.newBest = true;
    this.bests[state.difficulty] = state.score;
    this.sdk.storage.set(`best-${state.difficulty}`, state.score);
  }

  private finish(): void {
    if (!this.state) return;
    this.saveBest();
    this.sdk.setPlaying(false);
    this.sound.pause();
    this.ui.setBests(this.bests);
    this.ui.showResults(this.state, this.bests[this.state.difficulty], this.newBest);
  }

  private loop(): void {
    cancelAnimationFrame(this.frame);
    if (this.destroyed || document.hidden || this.sdk.paused || !this.battlefield) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame((now) => this.tick(now));
  }

  private tick(now: number): void {
    if (this.destroyed || !this.battlefield || this.sdk.paused || document.hidden) return;
    const dt = Math.min(Math.max((now - this.last) / 1000, 0), 0.05);
    this.last = now;
    const active = this.state ?? this.demo;
    if (this.state) {
      this.events(advance(active, dt, !this.composing));
      if (now >= this.nextUiUpdate) {
        this.ui.update(active, !this.composing);
        this.nextUiUpdate = now + 100;
      }
    } else if (!this.motion.matches) {
      this.events(advance(active, dt), true);
      this.demoLetter += dt;
      if (active.buffer && !candidates(active).length) abandonPrefix(active);
      const nearest = [...candidates(active)].sort(
        (a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z),
      )[0];
      if (
        nearest &&
        this.demoLetter >= 0.19 &&
        (active.buffer || Math.hypot(nearest.x, nearest.z) < 8)
      ) {
        this.demoLetter = 0;
        this.events(typeLetter(active, nearest.word[active.buffer.length] ?? ''), true);
      }
      if (active.ended) this.demo = createGame('normal', 831);
    }
    this.battlefield.render(
      active.enemies,
      active.elapsed,
      active.buffer.toLowerCase(),
      active.health / active.maxHealth,
    );
    this.labels.update(active, this.battlefield);
    if (!(this.motion.matches && !this.state))
      this.frame = requestAnimationFrame((time) => this.tick(time));
  }

  destroy(): void {
    this.saveBest();
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.resize.disconnect();
    this.battlefield?.destroy();
    this.labels.clear();
    this.sound.destroy();
    this.sdk.destroy();
  }
}
