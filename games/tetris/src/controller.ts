import { getAccent } from '@games/config/theme';
import { initGame, ResultTransition } from '@games/sdk';
import manifest from '../game.json';
import { createAudio, readAudioSettings } from './audio.ts';
import { createInput } from './input.ts';
import {
  type Action,
  act,
  createGame,
  type GameState,
  type Mode,
  snapshot,
  tick,
} from './logic/engine.ts';
import { createSettings } from './settings.ts';
import { readHandling, readRecords, readZen, saveZen } from './storage.ts';
import { createView } from './view.ts';

export function boot(root: HTMLElement): void {
  const accent = getAccent();
  document.documentElement.style.setProperty('--games-accent', accent.accent);
  document.documentElement.style.setProperty('--games-on-accent', accent.onAccent);
  const view = createView(root);
  let state = createGame('sprint');
  let screen: 'menu' | 'play' | 'ending' | 'paused' | 'results' | 'settings' = 'menu';
  let settingsReturn: 'menu' | 'paused' | 'results' = 'menu';
  let frame = 0;
  let last = performance.now();
  let lastSave = 0;
  let stepping = false;
  let undo: GameState[] = [],
    redo: GameState[] = [];
  let input: ReturnType<typeof createInput> | null = null;
  let sound: ReturnType<typeof createAudio> | null = null;
  const game = initGame(manifest, {
    root,
    onPause: () => {
      input?.clear();
      syncSound();
      persist();
    },
    onResume: () => {
      // Temporary platform interruptions cannot release an explicit menu pause.
      if (screen === 'paused' || (screen === 'settings' && settingsReturn === 'paused')) {
        game.pause();
        return;
      }
      last = performance.now();
      syncSound();
    },
    onMuteChange: (muted) => {
      const soundControl = root.querySelector<HTMLInputElement>('#sound');
      if (soundControl) soundControl.checked = !muted;
      syncSound();
    },
  });
  game.setPlaying(false);
  const resultOverlay = root.querySelector<HTMLElement>('[data-run-overlay]');
  if (!resultOverlay) throw new Error('Missing Tetris results overlay');
  const result = new ResultTransition(game, resultOverlay);
  let audioSettings = readAudioSettings(game.storage.get('audio-v1', null));
  sound = createAudio(() => game.muted, audioSettings);
  game.onUnlock(() => sound?.unlock());
  for (const key of ['music', 'effects'] as const) {
    const field = root.querySelector<HTMLInputElement>(`#${key}-volume`);
    if (field) field.value = String(Math.round(audioSettings[key] * 100));
  }
  const records = readRecords(game.storage.get('records-v1', null));
  view.setRecords(records);
  const settings = createSettings(root, loadHandling(), (value) =>
    game.storage.set('handling-v1', value),
  );

  function loadHandling() {
    const saved = readHandling(game.storage.get('handling-v1', null));
    if (!game.storage.get('soft-drop-default-v2', false)) {
      if (saved.sdf === 40) saved.sdf = 8;
      game.storage.set('handling-v1', saved);
      game.storage.set('soft-drop-default-v2', true);
    }
    return saved;
  }

  function persist(): void {
    if (state.mode === 'zen' && screen !== 'menu') saveZen(game.storage, { state, undo, redo });
  }
  function syncSound(): void {
    const title = screen === 'menu' || (screen === 'settings' && settingsReturn === 'menu');
    const inRun =
      screen === 'play' ||
      screen === 'paused' ||
      (screen === 'settings' && settingsReturn === 'paused');
    sound?.sync(title ? 'title' : inRun ? 'game' : 'silent', game.paused || document.hidden);
  }
  function refresh(): void {
    view.render(state);
    const soundControl = root.querySelector<HTMLInputElement>('#sound');
    if (soundControl) soundControl.checked = !game.muted;
    for (const button of root.querySelectorAll<HTMLButtonElement>(
      '[data-command="undo"], [data-command="redo"]',
    )) {
      button.disabled =
        state.mode !== 'zen' ||
        (button.dataset.command === 'undo' ? undo.length === 0 : redo.length === 0);
    }
  }
  function show(next: Exclude<typeof screen, 'ending'>): void {
    input?.clear();
    screen = next;
    view.showScreen(next);
    root.dataset.screen = next;
    syncSound();
    refresh();
    if (next === 'paused')
      root.querySelector<HTMLButtonElement>('[data-banner-actions] button')?.focus();
    if (next === 'menu') root.querySelector<HTMLButtonElement>('[data-mode]')?.focus();
    if (next === 'settings') root.querySelector<HTMLInputElement>('#das')?.focus();
    if (next === 'play' && document.activeElement instanceof HTMLElement)
      document.activeElement.blur();
  }
  function finish(): void {
    if (!state.ended || screen !== 'play') return;
    let record = false;
    if (
      state.mode === 'sprint' &&
      state.won &&
      (records.sprint === null || state.elapsed < records.sprint)
    ) {
      records.sprint = Math.max(1, state.elapsed);
      record = true;
    }
    if (state.mode === 'blitz' && state.score > records.blitz) {
      records.blitz = state.score;
      record = true;
    }
    game.storage.set('records-v1', records);
    input?.clear();
    screen = 'ending';
    root.dataset.screen = 'ending';
    syncSound();
    refresh();
    view.setRecords(records);
    result.begin(
      () => {
        show('results');
        view.showResult(state, record);
      },
      () => {
        game.setPlaying(false);
        root.querySelector<HTMLButtonElement>('[data-banner-actions] button')?.focus();
      },
    );
    sound?.play(state.won ? 'win' : 'end');
  }
  function changed(before: GameState): void {
    if (state.mode === 'zen' && state.pieces !== before.pieces) {
      undo.push(before);
      if (undo.length > 30) undo.shift();
      redo = [];
      persist();
    }
    clearFeedback(before.lines, before.level);
    finish();
  }
  function clearFeedback(lines: number, level: number): void {
    if (state.lines > lines) {
      sound?.play(state.lines - lines >= 4 ? 'quad' : 'clear');
      view.effect('clear');
    }
    if (state.level > level) sound?.play('level');
  }
  function apply(action: Action): void {
    if (screen !== 'play' || game.paused || state.ended) return;
    const before = snapshot(state);
    act(state, action);
    if (action === 'drop') {
      sound?.play('drop');
      view.effect('drop');
    } else if (action === 'hold' && before.canHold) sound?.play('hold');
    else if (
      (action === 'cw' || action === 'ccw' || action === 'flip') &&
      state.active.rotation !== before.active.rotation
    )
      sound?.play('rotate');
    else if ((action === 'left' || action === 'right') && state.active.x !== before.active.x)
      sound?.play('move');
    changed(before);
    if (!stepping) refresh();
  }
  input = createInput(
    root,
    () => screen === 'play' && !game.paused && !state.ended,
    () => settings.value,
    apply,
  );
  function start(mode: Mode, fresh = false): void {
    if (result.blocked) return;
    result.cancel();
    persist();
    sound?.sync('silent', true);
    game.setPlaying(false);
    const saved = mode === 'zen' && !fresh ? readZen(game.storage.get('zen-v1', null)) : null;
    state = saved?.state ?? createGame(mode);
    undo = saved?.undo ?? [];
    redo = saved?.redo ?? [];
    game.setPlaying(true);
    last = performance.now();
    sound?.unlock();
    show('play');
    sound?.play('start');
    if (mode === 'zen') persist();
  }
  function pause(): void {
    if (screen !== 'play') return;
    game.pause();
    show('paused');
  }
  function resume(): void {
    if (screen !== 'paused') return;
    show('play');
    game.resume();
    last = performance.now();
    sound?.unlock();
  }
  function history(direction: 'undo' | 'redo'): void {
    if (state.mode !== 'zen' || screen !== 'play' || game.paused) return;
    const source = direction === 'undo' ? undo : redo;
    const destination = direction === 'undo' ? redo : undo;
    const previous = source.pop();
    if (!previous) return;
    destination.push(snapshot(state));
    state = snapshot(previous);
    state.lockTime = 0;
    input?.clear();
    persist();
    refresh();
  }
  function command(value: string): void {
    if (result.blocked) return;
    if (screen === 'results') result.cancel();
    if (value === 'listen') {
      game.setMuted(false);
      sound?.unlock();
    } else if (value === 'arcade') {
      persist();
      game.exitToMenu();
    } else if (value === 'pause') pause();
    else if (value === 'resume') resume();
    else if (value === 'restart') start(state.mode, true);
    else if (value === 'menu') {
      persist();
      game.setPlaying(false);
      show('menu');
    } else if (value === 'undo' || value === 'redo') history(value);
    else if (value === 'settings') {
      if (screen === 'settings') return;
      if (screen === 'play') pause();
      settingsReturn = screen === 'paused' ? 'paused' : screen === 'results' ? 'results' : 'menu';
      show('settings');
    } else if (value === 'back') {
      settings.cancel();
      show(settingsReturn);
    } else if (value === 'reset-zen') {
      game.storage.remove('zen-v1');
      undo = [];
      redo = [];
      if (state.mode === 'zen') {
        state = createGame('zen');
        persist();
        refresh();
      }
      const status = root.querySelector<HTMLElement>('.settings-status');
      if (status) status.textContent = 'Zen board reset.';
    }
  }
  let backdropPress: EventTarget | null = null;
  root.addEventListener('pointerdown', (event) => {
    const target = event.target;
    backdropPress =
      target instanceof HTMLElement && target.matches('[data-run-overlay], [data-settings]')
        ? target
        : null;
  });
  root.addEventListener('pointercancel', () => {
    backdropPress = null;
  });
  root.addEventListener('click', (event) => {
    const target = event.target;
    const outside = target === backdropPress;
    backdropPress = null;
    if (!(target instanceof Element)) return;
    if (outside && target.matches('[data-run-overlay]') && screen === 'paused') {
      resume();
      return;
    }
    if (outside && target.matches('[data-settings]') && screen === 'settings') {
      command('back');
      return;
    }
    const button = target.closest<HTMLButtonElement>('button[data-mode], button[data-command]');
    if (!button || button.closest('[hidden], [inert]')) return;
    if (button.dataset.mode) start(button.dataset.mode as Mode);
    else if (button.dataset.command) command(button.dataset.command);
  });
  root.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement && event.target.id === 'sound')
      game.setMuted(!event.target.checked);
  });
  root.addEventListener('input', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    const key =
      field.id === 'music-volume' ? 'music' : field.id === 'effects-volume' ? 'effects' : null;
    if (!key) return;
    audioSettings = readAudioSettings({ ...audioSettings, [key]: Number(field.value) / 100 });
    sound?.setVolume(audioSettings);
    game.storage.set('audio-v1', audioSettings);
  });
  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    if (event.code === 'Escape') {
      event.preventDefault();
      if (screen === 'settings') command('back');
      else if (screen === 'play') pause();
      return;
    }
    if (event.key === 'Tab' && (screen === 'paused' || screen === 'results')) {
      const buttons = [...root.querySelectorAll<HTMLButtonElement>('[data-banner-actions] button')];
      const first = buttons[0];
      const lastButton = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        lastButton?.focus();
      } else if (!event.shiftKey && document.activeElement === lastButton) {
        event.preventDefault();
        first?.focus();
      }
    }
    if (screen !== 'play' || game.paused) return;
    if ((event.ctrlKey || event.metaKey) && (event.code === 'KeyZ' || event.code === 'KeyY')) {
      if (state.mode !== 'zen') return;
      event.preventDefault();
      history(event.code === 'KeyY' || event.shiftKey ? 'redo' : 'undo');
    } else if (event.code === 'KeyR' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      start(state.mode, true);
    }
  });
  function loop(now: number): void {
    // Count all active wall time; bounded substeps keep lock and gravity stable on slow frames.
    let elapsed = Math.max(0, now - last);
    last = now;
    if (screen === 'play' && !game.paused) {
      stepping = true;
      while (elapsed > 0 && !state.ended) {
        const dt = Math.min(16, elapsed);
        elapsed -= dt;
        const before = state.mode === 'zen' ? snapshot(state) : null;
        input?.update(dt);
        const lines = state.lines;
        const level = state.level;
        const row = state.active.y;
        tick(state, dt, input?.softDrop, settings.value.sdf);
        if (input?.softDrop && state.active.y > row) sound?.play('soft');
        if (before) changed(before);
        else clearFeedback(lines, level);
      }
      stepping = false;
      finish();
      refresh();
      if (now - lastSave > 2000) {
        persist();
        lastSave = now;
      }
    }
    frame = requestAnimationFrame(loop);
  }
  window.addEventListener('pagehide', () => {
    persist();
    sound?.sync('silent', true);
    cancelAnimationFrame(frame);
  });
  window.addEventListener('pageshow', () => {
    cancelAnimationFrame(frame);
    last = performance.now();
    syncSound();
    frame = requestAnimationFrame(loop);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) persist();
    syncSound();
    last = performance.now();
  });
  window.addEventListener('resize', refresh);
  void document.fonts.ready.then(refresh);
  show('menu');
  frame = requestAnimationFrame(loop);
}
