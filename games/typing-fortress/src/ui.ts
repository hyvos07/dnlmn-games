import { type Difficulty, type GameState, stats, type TypingMode } from './logic/game.ts';

const crest = `<svg class="crest" viewBox="0 0 64 76" fill="none" aria-hidden="true"><path d="M32 3 57 14v25c0 16-25 31-25 31S7 55 7 39V14L32 3Z" stroke="currentColor"/><path d="M32 11 50 19v20c0 11-18 22-18 22S14 50 14 39V19l18-8Z" stroke="currentColor" opacity=".4"/><path d="m32 20 9 15-9 16-9-16 9-15Z" stroke="currentColor"/><path d="M32 20v31M23 35h18M4 10l4-5m48 0 4 5M27 72h10" stroke="currentColor"/></svg>`;

const descriptions: Record<Difficulty, string> = {
  baby: 'A gentler siege. Fewer creatures, more room to find your rhythm.',
  normal: 'The keeper’s watch. A steady siege that grows with every wave.',
  'fast-hand': 'A relentless siege. More creatures and armored, multi-word golems.',
};

function required<T extends Element>(root: HTMLElement, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Typing Fortress UI element: ${selector}`);
  return element;
}

/** DOM presentation only; words, scores, and simulation remain owned by the game. */
export class Ui {
  readonly root: HTMLElement;
  readonly stage: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly labels: HTMLElement;
  readonly playButton: HTMLButtonElement;
  readonly againButton: HTMLButtonElement;
  readonly menuButton: HTMLButtonElement;
  readonly difficultyButtons: HTMLButtonElement[];
  readonly typingInput: HTMLInputElement;
  readonly typingModeSelect: HTMLSelectElement;
  private readonly menu: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly runeStrip: HTMLElement;
  readonly results: HTMLElement;
  private readonly toast: HTMLElement;
  private selectedDifficulty: Difficulty = 'normal';
  private bests: Record<Difficulty, number> = { baby: 0, normal: 0, 'fast-hand': 0 };
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.root = document.createElement('main');
    this.root.id = 'stage';
    this.root.className = 'stage';
    this.root.dataset.thumbnail = '';
    this.root.dataset.screen = 'menu';
    this.root.innerHTML = `
      <canvas id="board" aria-label="Rune Bastion, a three-dimensional fortress under an endless siege"></canvas>
      <div class="battle-vignette" aria-hidden="true"></div>
      <div class="word-labels" aria-hidden="true"></div>
      <section class="menu-screen" data-overlay aria-labelledby="start-title">
        <div class="menu-content">
          <div class="brand-line">${crest}<p class="eyebrow">An endless wordfire siege</p></div>
          <h1 id="start-title" class="game-title"><span>Typing</span><span>Fortress<span class="title-period">.</span></span></h1>
          <fieldset class="difficulty-picker">
            <legend>Choose your difficulty</legend>
            <div class="difficulty-options">
              <button type="button" data-difficulty="baby" aria-pressed="false"><span class="difficulty-mark">I</span>Baby</button>
              <button type="button" data-difficulty="normal" aria-pressed="true"><span class="difficulty-mark">II</span>Normal</button>
              <button type="button" data-difficulty="fast-hand" aria-pressed="false"><span class="difficulty-mark">III</span>Fast Hand</button>
            </div>
            <p class="difficulty-description"></p>
          </fieldset>
          <details class="typing-options"><summary>Options <span id="typing-mode-name" class="typing-mode-name">Classic typing</span></summary><div class="typing-options-body"><label for="typing-mode">Typing behavior</label><select id="typing-mode" aria-describedby="typing-mode-description"><option value="classic">Classic typing</option><option value="editable">Editable field</option></select><p id="typing-mode-description"></p></div></details>
          <div class="menu-action-row"><button id="play" type="button" class="cta">Defend the gate!<span aria-hidden="true">↗</span></button><div class="menu-best"><span>Your best session</span><output id="menu-best">0</output><span class="best-unit">points</span></div></div>
          <div class="menu-footer"><span class="keyboard-hint"><svg viewBox="0 0 24 16" aria-hidden="true" fill="none" stroke="currentColor"><rect x="1" y="1" width="22" height="14" rx="2"/><path d="M4 5h2m2 0h2m2 0h2m2 0h2M4 8h2m2 0h2m2 0h2m2 0h2M7 11h10"/></svg> Physical keyboard required</span></div>
          <p class="mobile-notice">This siege needs a physical keyboard. Connect one or return on a desktop or laptop.</p>
        </div>
      </section>
      <section class="game-hud" aria-label="Run statistics" hidden>
        <div class="score-stat"><span class="stat-label">Score</span><output id="score">0</output></div>
        <div class="wave-stat"><span class="stat-label">Wave</span><output id="wave">01</output><span id="difficulty-name" class="mode-name">Normal</span></div>
        <div class="health-stat"><span class="stat-label">Gate integrity <output id="health-text">100%</output></span><div class="health-track" role="meter" aria-label="Gate integrity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="100"><span id="health-fill"></span></div></div>
        <div class="precision-stats"><span><output id="wpm">0</output> <span>WPM</span></span><span><output id="accuracy">100</output><span>% accuracy</span></span><span class="combo-stat"><output id="combo">0</output> <span>combo</span></span></div>
      </section>
      <div class="rune-strip" hidden><span class="rune-symbol" aria-hidden="true">◇</span><label for="typing-input" class="stat-label">Type to cast</label><input id="typing-input" type="text" aria-label="Type an enemy’s binding word" autocomplete="off" autocapitalize="off" spellcheck="false" inputmode="none" maxlength="64" placeholder="Type an enemy’s word…" /><span class="input-shortcuts"><kbd>⌫</kbd> delete <span>·</span> <kbd>Esc</kbd> pause</span></div>
      <p id="battle-toast" class="battle-toast" role="status" hidden></p>
      <section class="results-screen" data-overlay aria-labelledby="results-title" hidden>
        <div class="results-card">${crest}<h2 id="results-title">The gate has fallen.</h2><p class="result-subtitle">But the valley will remember your watch.</p><span id="new-best" class="new-best" hidden>✦ A new best run ✦</span><div class="final-score"><span class="stat-label">Final score</span><output id="final-score">0</output></div><p class="result-best">Best on <span id="result-mode">Normal</span> <output id="result-best">0</output></p><div class="result-stats"><div><output id="result-wpm">0</output><span>WPM</span></div><div><output id="result-accuracy">100%</output><span>Accuracy</span></div><div><output id="result-wave">1</output><span>Wave reached</span></div></div><p class="result-details"><span id="result-words">0 words</span><span id="result-combo">0 best combo</span><span id="result-time">0:00 survived</span></p><div class="result-actions"><button id="again" type="button" class="cta">Light the runes again <span aria-hidden="true">↗</span></button><button id="menu" type="button" class="text-button">Return to menu</button></div></div>
      </section>
      <section class="unavailable-screen" data-overlay role="alert" hidden><div>${crest}<h2>The runes could not awaken.</h2><p id="unavailable-message"></p><p>Try a browser with WebGL enabled, or enable hardware acceleration and reload.</p></div></section>
    `;
    document.querySelector('#stage')?.remove();
    document.body.prepend(this.root);
    this.stage = this.root;
    this.canvas = required(this.root, '#board');
    this.labels = required(this.root, '.word-labels');
    this.playButton = required(this.root, '#play');
    this.againButton = required(this.root, '#again');
    this.menuButton = required(this.root, '#menu');
    this.typingInput = required(this.root, '#typing-input');
    this.typingModeSelect = required(this.root, '#typing-mode');
    this.menu = required(this.root, '.menu-screen');
    this.hud = required(this.root, '.game-hud');
    this.runeStrip = required(this.root, '.rune-strip');
    this.results = required(this.root, '.results-screen');
    this.toast = required(this.root, '#battle-toast');
    this.difficultyButtons = [
      ...this.root.querySelectorAll<HTMLButtonElement>('[data-difficulty]'),
    ];
    for (const button of this.difficultyButtons) {
      button.addEventListener('click', () => {
        this.difficulty = button.dataset.difficulty as Difficulty;
        this.root.dispatchEvent(new CustomEvent('difficultychange', { detail: this.difficulty }));
      });
    }
    this.difficulty = 'normal';
    this.typingMode = 'classic';
    this.typingModeSelect.addEventListener('change', () => {
      const mode = this.typingMode;
      this.typingMode = mode;
      this.root.dispatchEvent(new CustomEvent('typingmodechange', { detail: mode }));
    });
  }

  get typingMode(): TypingMode {
    return this.typingModeSelect.value === 'editable' ? 'editable' : 'classic';
  }

  set typingMode(value: TypingMode) {
    this.typingModeSelect.value = value;
    this.text('#typing-mode-name', value === 'classic' ? 'Classic typing' : 'Editable field');
    this.text(
      '#typing-mode-description',
      value === 'classic'
        ? 'Wrong letters are ignored. Backspace clears your word.'
        : 'Move the cursor and edit freely. Backspace deletes a character.',
    );
    const shortcuts = required<HTMLElement>(this.runeStrip, '.input-shortcuts');
    shortcuts.innerHTML = `<kbd>⌫</kbd> ${value === 'classic' ? 'clear' : 'delete'} <span>·</span> <kbd>Esc</kbd> pause`;
  }

  get difficulty(): Difficulty {
    return this.selectedDifficulty;
  }

  set difficulty(value: Difficulty) {
    this.selectedDifficulty = value;
    for (const button of this.difficultyButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.difficulty === value));
    }
    this.text('.difficulty-description', descriptions[value]);
    this.text('#menu-best', this.bests[value].toLocaleString());
    this.text('#difficulty-name', this.difficultyName(value));
  }

  showScreen(screen: 'menu' | 'playing' | 'over'): void {
    this.root.dataset.screen = screen;
    this.root.style.touchAction = screen === 'playing' ? 'none' : 'pan-y';
    delete this.root.dataset.paused;
    this.menu.hidden = screen !== 'menu';
    this.hud.hidden = screen !== 'playing';
    this.runeStrip.hidden = screen !== 'playing';
    this.results.hidden = screen !== 'over';
    this.labels.hidden = screen === 'over';
    this.toast.hidden = true;
    clearTimeout(this.toastTimer);
    this.typingInput.value = '';
    if (screen === 'menu') this.difficulty = this.selectedDifficulty;
  }

  update(state: GameState, syncInput = true): void {
    this.text('#score', state.score.toLocaleString());
    this.text('#wave', String(state.wave).padStart(2, '0'));
    const integrity = Math.max(0, Math.round((state.health / state.maxHealth) * 100));
    this.text('#health-text', `${integrity}%`);
    const fill = required<HTMLElement>(this.root, '#health-fill');
    fill.style.width = `${integrity}%`;
    const meter = required<HTMLElement>(this.root, '.health-track');
    meter.setAttribute('aria-valuenow', String(integrity));
    meter.classList.toggle('is-low', integrity <= 30);
    const runStats = stats(state);
    this.text('#wpm', String(runStats.wpm));
    this.text('#accuracy', String(runStats.accuracy));
    this.text('#combo', String(state.combo));
    // Assigning value on every HUD refresh resets native selections and the caret.
    if (syncInput && this.typingInput.value !== state.buffer) this.typingInput.value = state.buffer;
    this.runeStrip.classList.toggle('is-charged', state.buffer.length > 0);
  }

  setBests(bests: Record<Difficulty, number>): void {
    this.bests = { ...bests };
    this.difficulty = this.selectedDifficulty;
  }

  showResults(state: GameState, best: number, isNewBest: boolean): void {
    const runStats = stats(state);
    this.text('#final-score', state.score.toLocaleString());
    this.text('#result-best', best.toLocaleString());
    this.text('#result-mode', this.difficultyName(state.difficulty));
    this.text('#result-wpm', String(runStats.wpm));
    this.text('#result-accuracy', `${runStats.accuracy}%`);
    this.text('#result-wave', String(state.wave));
    this.text('#result-words', `${state.completedWords} words cast`);
    this.text('#result-combo', `${state.bestCombo} best combo`);
    const seconds = Math.floor(state.elapsed);
    this.text(
      '#result-time',
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} survived`,
    );
    required<HTMLElement>(this.root, '#new-best').hidden = !isNewBest;
    this.showScreen('over');
  }

  feedback(kind: 'hit' | 'mistake' | 'damage' | 'wave', message?: string): void {
    if (kind === 'wave' || message) {
      this.toast.textContent = message ?? 'The Host returns';
      this.toast.dataset.kind = kind;
      this.toast.hidden = false;
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => {
        this.toast.hidden = true;
      }, 2200);
    }
    this.runeStrip.classList.remove('feedback-hit', 'feedback-mistake', 'feedback-damage');
    if (kind !== 'wave') {
      // Restart the local feedback animation without changing game state.
      void this.runeStrip.offsetWidth;
      this.runeStrip.classList.add(`feedback-${kind}`);
    }
  }

  showUnavailable(message: string): void {
    this.showScreen('menu');
    this.menu.hidden = true;
    this.text('#unavailable-message', message);
    required<HTMLElement>(this.root, '.unavailable-screen').hidden = false;
  }

  private text(selector: string, value: string): void {
    const element = required<HTMLElement>(this.root, selector);
    if (element.textContent !== value) element.textContent = value;
  }

  private difficultyName(difficulty: Difficulty): string {
    return difficulty === 'fast-hand' ? 'Fast Hand' : difficulty === 'baby' ? 'Baby' : 'Normal';
  }
}
