import { cells, type GameState, ghost, type PieceKind } from './logic/engine.ts';
import './style.css';

const COLORS: Record<PieceKind, { face: string; light: string; shade: string }> = {
  I: { face: '#4ad8e9', light: '#b5f6fc', shade: '#168ca5' },
  O: { face: '#f2c84c', light: '#fff0a3', shade: '#b27a18' },
  T: { face: '#c18aff', light: '#e9caff', shade: '#7543ba' },
  S: { face: '#8fe35c', light: '#d6ffb4', shade: '#438d37' },
  Z: { face: '#ff6d79', light: '#ffc0c0', shade: '#b3314b' },
  J: { face: '#6496ff', light: '#c2d4ff', shade: '#3455b4' },
  L: { face: '#ff9a50', light: '#ffd2a9', shade: '#b55526' },
};

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function formatPreciseTime(ms: number): string {
  const safe = Math.max(0, ms);
  return `${Math.floor(safe / 60_000)}:${String(Math.floor(safe / 1_000) % 60).padStart(2, '0')}.${String(Math.floor(safe % 1_000)).padStart(3, '0')}`;
}

function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  kind: PieceKind,
  alpha = 1,
): void {
  const color = COLORS[kind];
  const inset = Math.max(1, size * 0.075);
  const radius = Math.max(1, size * 0.13);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.roundRect(x + inset, y + inset, size - inset * 2, size - inset * 2, radius);
  ctx.fillStyle = color.face;
  ctx.fill();
  ctx.fillStyle = color.light;
  ctx.globalAlpha = alpha * 0.58;
  ctx.beginPath();
  ctx.moveTo(x + inset * 1.8, y + inset * 2.1);
  ctx.lineTo(x + size - inset * 2.2, y + inset * 2.1);
  ctx.lineTo(x + size - inset * 2.2, y + size * 0.25);
  ctx.lineTo(x + inset * 1.8, y + size * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = alpha * 0.62;
  ctx.fillStyle = color.shade;
  ctx.beginPath();
  ctx.moveTo(x + inset * 1.8, y + size - inset * 1.8);
  ctx.lineTo(x + size - inset * 1.8, y + size - inset * 1.8);
  ctx.lineTo(x + size - inset * 1.8, y + size * 0.76);
  ctx.lineTo(x + inset * 1.8, y + size * 0.76);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#ffffff3d';
  ctx.lineWidth = Math.max(1, size * 0.025);
  ctx.beginPath();
  ctx.roundRect(
    x + inset + 0.5,
    y + inset + 0.5,
    size - inset * 2 - 1,
    size - inset * 2 - 1,
    radius,
  );
  ctx.stroke();
  ctx.restore();
}

function fitCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.round(rect.width * dpr),
    height = Math.round(rect.height * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return ctx;
}

function drawPreview(canvas: HTMLCanvasElement, kind: PieceKind | null): void {
  const ctx = fitCanvas(canvas);
  if (!ctx || !kind) return;
  const rect = canvas.getBoundingClientRect();
  const shape = cells({ kind, rotation: 0, x: 0, y: 0 });
  const minX = Math.min(...shape.map((cell) => cell.x));
  const minY = Math.min(...shape.map((cell) => cell.y));
  const maxX = Math.max(...shape.map((cell) => cell.x)) + 1 - minX,
    maxY = Math.max(...shape.map((cell) => cell.y)) + 1 - minY;
  const size = Math.min(rect.width / (maxX + 0.45), rect.height / (maxY + 0.45));
  const ox = (rect.width - maxX * size) / 2,
    oy = (rect.height - maxY * size) / 2;
  for (const cell of shape)
    drawBlock(ctx, ox + (cell.x - minX) * size, oy + (cell.y - minY) * size, size, kind);
}

export function createView(root: HTMLElement) {
  root.innerHTML = `
		<div class="frame">
			<section class="menu-screen" aria-label="Choose a game mode">
				<h1 class="menu-title">TETRIS</h1>
				<p class="menu-intro">Blocks go boom boom 💥</p>
				<div class="mode-grid">
					<button class="mode-card sprint" type="button" data-mode="sprint"><svg class="mode-icon" viewBox="0 0 80 80" aria-hidden="true"><path d="M10 10h18v18H10zM31 10h18v18H31zM52 10h18v18H52zM10 31h18v18H10zM31 31h18v18H31zM52 31h18v18H52zM10 52h18v18H10zM31 52h18v18H31zM52 52h18v18H52z" fill="currentColor" opacity=".18"/><path d="M10 10h18v18H10zM31 10h18v18H31zM52 10h18v18H52zM31 31h18v18H31zM31 52h18v18H31z" fill="currentColor"/></svg><span class="card-index">01</span><span class="mode-content"><strong>40 LINES</strong><span class="mode-copy">Clear forty lines. Chase the clock.</span></span><span class="mode-best">BEST <b data-record="sprint">—</b></span></button>
					<button class="mode-card blitz" type="button" data-mode="blitz"><svg class="mode-icon" viewBox="0 0 80 80" aria-hidden="true"><path d="M10 31h18V13H10zM31 31h18V13H31zM31 52h18V34H31zM52 52h18V34H52zM52 73h18V55H52z" fill="currentColor" opacity=".23"/><path d="M10 31h18V13H10zM31 31h18V13H31zM31 52h18V34H31zM52 52h18V34H52zM52 73h18V55H52z" fill="currentColor"/></svg><span class="card-index">02</span><span class="mode-content"><strong>BLITZ</strong><span class="mode-copy">Two minutes. Make every drop count.</span></span><span class="mode-best">BEST <b data-record="blitz">0</b></span></button>
					<button class="mode-card zen" type="button" data-mode="zen"><svg class="mode-icon" viewBox="0 0 80 80" aria-hidden="true"><path d="M10 10h18v18H10zM10 31h18v18H10zM10 52h18v18H10zM31 52h18v18H31zM52 52h18v18H52z" fill="currentColor" opacity=".23"/><path d="M10 10h18v18H10zM10 31h18v18H10zM10 52h18v18H10zM31 52h18v18H31zM52 52h18v18H52z" fill="currentColor"/></svg><span class="card-index">03</span><span class="mode-content"><strong>ZEN</strong><span class="mode-copy">Endless practice. Your progress stays.</span></span><span class="mode-best">PROGRESS SAVED</span></button>
				</div>
				<div class="menu-foot"><button class="text-button" type="button" data-command="listen">Play music</button><button class="text-button" type="button" data-command="settings">Settings</button></div>
			</section>
			<section class="play-screen" hidden aria-label="Game">
				<aside class="side-column left">
					<div class="run-head"><span class="run-mode" data-run-mode>40 LINES</span><button class="icon-button" type="button" data-command="pause" aria-label="Pause"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg></button></div>
					<div class="side-card stats-card"><p class="side-label">STATS</p><div class="stats">
						<div class="stat feature"><span data-time-label>TIME</span><output data-stat="time">0:00</output></div><div class="stat" data-lines-row><span>LINES</span><output data-stat="lines">0</output></div>
						<div class="stat" data-score-row><span>SCORE</span><output data-stat="score">0</output></div><div class="stat" data-level-row><span>LEVEL</span><output data-stat="level">1</output></div>
						<div class="stat wide" data-clear-row hidden><span>LAST CLEAR</span><output data-stat="clear"></output></div>
					</div></div>
					<div class="side-card controls-copy"><p class="side-label">CONTROLS</p><div><b>← →</b> Move</div><div><b>↓</b> Soft drop</div><div><b>↑ / X</b> Rotate</div><div><b>Z</b> Reverse</div><div><b>Space</b> Drop</div><div><b>C / Shift</b> Hold</div></div>
					<div class="play-actions"><button class="quiet-button" data-command="menu" type="button">Menu</button></div>
				</aside>
				<div class="board-shell" data-thumbnail><div class="board-wrap"><canvas id="board" class="board" data-board role="img" aria-label="Tetris playfield"></canvas>
				</div></div>
				<aside class="side-column right"><div class="side-card"><p class="side-label">NEXT</p><div class="piece-window"><canvas data-next="0" role="img" aria-label="Next piece"></canvas></div></div>
					<div class="side-card"><p class="side-label">HOLD</p><div class="piece-window"><canvas data-preview="hold" role="img" aria-label="Held piece"></canvas></div></div>
				</aside>
				<div class="touch-controls" aria-label="Touch controls">
<button type="button" data-action="left" aria-label="Move left">←<span>left</span></button><button type="button" data-action="right" aria-label="Move right">→<span>right</span></button><button type="button" data-action="down" aria-label="Soft drop">↓<span>down</span></button>
<button type="button" data-action="ccw" aria-label="Rotate counterclockwise">↶<span>ccw</span></button><button type="button" data-action="cw" aria-label="Rotate clockwise">↷<span>cw</span></button><button type="button" data-action="flip" aria-label="Rotate 180 degrees">180°<span>turn</span></button><button type="button" data-action="hold" aria-label="Hold piece">H<span>hold</span></button><button type="button" data-action="drop" class="drop-touch" aria-label="Hard drop">DROP<span>space</span></button><button type="button" data-command="undo" aria-label="Undo Zen move">↶<span>undo</span></button><button type="button" data-command="redo" aria-label="Redo Zen move">↷<span>redo</span></button>
</div>
			</section>
			<div class="run-overlay" data-run-overlay hidden><section class="run-banner" data-banner hidden role="dialog" aria-modal="true" aria-labelledby="run-title"><h2 id="run-title" data-banner-title>PAUSED</h2><p class="new-best" data-banner-best hidden>NEW BEST</p><p data-banner-copy>Your stack is waiting.</p><div class="banner-actions" data-banner-actions></div></section></div>
			<div class="settings-modal" data-settings hidden><section class="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title"><h2 id="settings-title">Tune your stack.</h2><p>Fine control for a cleaner run.</p>
				<div class="setting-row"><label for="das">Move delay<small>Wait before movement repeats</small></label><input id="das" type="number" min="0" max="500" step="1" value="133"></div>
				<div class="setting-row"><label for="arr">Repeat rate<small>Time between repeats; 0 means instant</small></label><input id="arr" type="number" min="0" max="200" step="1" value="16"></div>
				<div class="setting-row"><label for="sdf">Soft drop speed<small>Gravity multiplier, from 1× to 100×</small></label><input id="sdf" type="number" min="1" max="100" step="1" value="8"></div>
				<div class="setting-row"><label for="sound">Sound<small>You can also press M to mute</small></label><input id="sound" type="checkbox" checked></div>
				<div class="setting-row"><label for="music-volume">Music volume<small>Title theme / Korobeiniki</small></label><input id="music-volume" aria-label="Music volume" type="range" min="0" max="100" step="1" value="45"></div>
				<div class="setting-row"><label for="effects-volume">Sound effects volume<small>Movement, drops and clears</small></label><input id="effects-volume" aria-label="Sound effects volume" type="range" min="0" max="100" step="1" value="75"></div>
				<div class="setting-row"><label for="effects">Visual effects<small>Lock and clear feedback</small></label><input id="effects" type="checkbox" checked></div>
				<div class="setting-row"><div><span class="setting-label">Key bindings</span><small>Click a key to assign a new binding</small></div><div id="keybinds"><button class="secondary small-button" data-bind="left" type="button">←</button> <button class="secondary small-button" data-bind="right" type="button">→</button> <button class="secondary small-button" data-bind="down" type="button">↓</button> <button class="secondary small-button" data-bind="cw" type="button">↑ / X</button> <button class="secondary small-button" data-bind="ccw" type="button">Z</button> <button class="secondary small-button" data-bind="flip" type="button">A</button> <button class="secondary small-button" data-bind="drop" type="button">SPACE</button> <button class="secondary small-button" data-bind="hold" type="button">C</button></div></div>
				<div class="settings-foot"><button class="secondary" type="button" data-command="back">Done</button><button class="text-button" type="button" data-command="reset-zen">Reset Zen board</button></div>
			</section></div>
			<p class="sr-only" role="status" aria-live="polite" data-live></p>
		</div>`;

  const $ = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing interface element: ${selector}`);
    return element;
  };
  const boardCanvas = $('#board') as HTMLCanvasElement;
  const boardShell = $('.board-shell');
  const banner = $('[data-banner]');
  const effectsControl = $('#effects') as HTMLInputElement;
  let dropAnimation: Animation | null = null;
  boardShell.addEventListener('animationend', () => boardShell.classList.remove('flash'));
  let currentState: GameState | null = null;
  let records = { sprint: null as number | null, blitz: 0 };
  let activeScreen: 'menu' | 'play' | 'paused' | 'results' | 'settings' = 'menu';
  let returnScreen: 'menu' | 'play' | 'paused' | 'results' = 'menu';
  let previousClear = '';

  function draw(state: GameState): void {
    const ctx = fitCanvas(boardCanvas);
    if (!ctx) return;
    const rect = boardCanvas.getBoundingClientRect(),
      w = rect.width / 10,
      h = rect.height / 20;
    ctx.fillStyle = '#101015';
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = '#ffffff0b';
    ctx.lineWidth = 1;
    for (let x = 0; x <= 10; x++) {
      ctx.beginPath();
      ctx.moveTo(x * w + 0.5, 0);
      ctx.lineTo(x * w + 0.5, rect.height);
      ctx.stroke();
    }
    for (let y = 0; y <= 20; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * h + 0.5);
      ctx.lineTo(rect.width, y * h + 0.5);
      ctx.stroke();
    }
    for (let y = 20; y < state.board.length; y++)
      for (let x = 0; x < 10; x++) {
        const kind = state.board[y]?.[x];
        if (kind) drawBlock(ctx, x * w, (y - 20) * h, Math.min(w, h), kind);
      }
    const landing = ghost(state);
    for (const cell of cells(landing))
      if (cell.y >= 20) {
        const bx = cell.x * w + w * 0.15,
          by = (cell.y - 20) * h + h * 0.15;
        ctx.save();
        ctx.strokeStyle = `${COLORS[state.active.kind].light}aa`;
        ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.055);
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        ctx.roundRect(bx, by, w * 0.7, h * 0.7, Math.min(w, h) * 0.12);
        ctx.stroke();
        ctx.restore();
      }
    for (const cell of cells(state.active))
      if (cell.y >= 20)
        drawBlock(ctx, cell.x * w, (cell.y - 20) * h, Math.min(w, h), state.active.kind);
    for (const canvas of root.querySelectorAll<HTMLCanvasElement>('[data-preview]'))
      drawPreview(canvas, state.hold);
    for (const canvas of root.querySelectorAll<HTMLCanvasElement>('[data-next]'))
      drawPreview(canvas, state.queue[Number(canvas.dataset.next)] ?? null);
    const clock =
      state.mode === 'sprint'
        ? formatPreciseTime(state.elapsed)
        : state.mode === 'blitz'
          ? formatPreciseTime(Math.max(0, 120_000 - state.elapsed))
          : formatTime(state.elapsed);
    $('[data-stat="time"]').textContent = clock;
    $('[data-time-label]').textContent = state.mode === 'blitz' ? 'LEFT' : 'TIME';
    $('[data-stat="lines"]').textContent =
      state.mode === 'sprint' ? `${state.lines}/40` : String(state.lines);
    $('[data-stat="score"]').textContent = state.score.toLocaleString();
    $('[data-stat="level"]').textContent = String(state.level);
    $('[data-lines-row]').hidden = state.mode !== 'sprint';
    $('[data-level-row]').hidden = state.mode !== 'blitz';
    root.dataset.mode = state.mode;
    $('[data-stat="clear"]').textContent = state.lastClear;
    $('[data-clear-row]').toggleAttribute('hidden', !state.lastClear);
    $('[data-run-mode]').textContent =
      state.mode === 'sprint' ? '40 LINES' : state.mode.toUpperCase();
    if (state.lastClear && state.lastClear !== previousClear && effectsControl.checked) {
      boardShell.classList.remove('flash');
      void boardShell.getBoundingClientRect();
      boardShell.classList.add('flash');
    }
    previousClear = state.lastClear;
  }

  function buttons(items: { label: string; command: string; primary?: boolean }[]): string {
    return items
      .map(
        (item) =>
          `<button type="button" class="${item.primary ? 'primary' : 'secondary'} small-button" data-command="${item.command}">${item.label}</button>`,
      )
      .join('');
  }
  function showBanner(
    title: string,
    copy: string,
    actions: { label: string; command: string; primary?: boolean }[],
  ): void {
    $('[data-banner-title]').textContent = title;
    $('[data-banner-best]').hidden = true;
    $('[data-banner-copy]').textContent = copy;
    $('[data-banner-actions]').innerHTML = buttons(actions);
    banner.hidden = false;
  }
  function showScreen(screen: typeof activeScreen): void {
    if (screen !== 'play') dropAnimation?.cancel();
    if (screen === 'settings') {
      if (activeScreen !== 'settings') returnScreen = activeScreen;
    } else returnScreen = screen;
    activeScreen = screen;
    const baseScreen = screen === 'settings' ? returnScreen : screen;
    $('.menu-screen').toggleAttribute('hidden', baseScreen !== 'menu');
    $('.play-screen').toggleAttribute('hidden', baseScreen === 'menu');
    $('.menu-screen').inert = screen === 'settings';
    $('.play-screen').inert = screen !== 'play';
    $('[data-run-overlay]').hidden = baseScreen !== 'paused' && baseScreen !== 'results';
    $('[data-run-overlay]').inert = screen === 'settings';
    $('[data-settings]').toggleAttribute('hidden', screen !== 'settings');
    if (screen === 'play') banner.hidden = true;
    if (screen === 'paused')
      showBanner('PAUSED', 'Take a breath. Your stack is waiting.', [
        { label: 'Resume', command: 'resume', primary: true },
        { label: 'Restart', command: 'restart' },
        { label: 'Settings', command: 'settings' },
        { label: 'Menu', command: 'menu' },
      ]);
    if (screen === 'results' && currentState) {
      const s = currentState;
      showBanner(
        s.mode === 'sprint'
          ? s.won
            ? '40 LINES CLEAR.'
            : 'TOP OUT'
          : s.mode === 'blitz'
            ? s.elapsed >= 120_000
              ? 'TIME UP.'
              : 'TOP OUT'
            : 'TOP OUT',
        s.mode === 'sprint'
          ? `${formatPreciseTime(s.elapsed)}\n${s.score.toLocaleString()} points`
          : s.mode === 'blitz'
            ? `${s.score.toLocaleString()} points`
            : `${s.score.toLocaleString()} points`,
        [
          { label: 'Restart', command: 'restart', primary: true },
          { label: 'Menu', command: 'menu' },
        ],
      );
    }
  }

  return {
    render(state: GameState) {
      currentState = state;
      draw(state);
    },
    showScreen,
    setRecords(next: { sprint: number | null; blitz: number }) {
      records = next;
      $('[data-record="sprint"]').textContent =
        records.sprint === null ? '—' : formatPreciseTime(records.sprint);
      $('[data-record="blitz"]').textContent = records.blitz.toLocaleString();
    },
    showResult(state: GameState, record: boolean) {
      currentState = state;
      draw(state);
      showScreen('results');
      if (record) $('[data-live]').textContent = 'New personal best.';
      $('[data-banner-best]').hidden = !record;
    },
    effect(kind: 'drop' | 'clear' | 'rotate') {
      if (!effectsControl.checked) return;
      if (kind === 'drop' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        dropAnimation?.cancel();
        dropAnimation = boardShell.animate(
          [
            { transform: 'translate(0, 0)' },
            { transform: 'translate(0, 8px)', offset: 0.16 },
            { transform: 'translate(-3px, -3px)', offset: 0.36 },
            { transform: 'translate(3px, 2px)', offset: 0.55 },
            { transform: 'translate(-1px, -1px)', offset: 0.76 },
            { transform: 'translate(0, 0)' },
          ],
          { duration: 240, easing: 'ease-out' },
        );
      } else if (kind === 'clear') {
        boardShell.classList.remove('flash');
        void boardShell.getBoundingClientRect();
        boardShell.classList.add('flash');
      }
    },
  };
}
