// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { createGame } from './logic/game';
import { Ui } from './ui';

beforeEach(() => {
  document.body.replaceChildren();
});

describe('editable typing field presentation', () => {
  it('preserves the caret and selection while refreshing run statistics', () => {
    const ui = new Ui();
    const state = createGame('normal');
    state.buffer = 'caz';
    ui.update(state);
    ui.typingInput.focus();
    ui.typingInput.setSelectionRange(1, 2);
    state.wave = 2;
    state.score = 100;
    ui.update(state);
    expect(ui.typingInput.value).toBe('caz');
    expect(ui.typingInput.selectionStart).toBe(1);
    expect(ui.typingInput.selectionEnd).toBe(2);
  });

  it('leaves composing text alone until it is committed', () => {
    const ui = new Ui();
    const state = createGame('normal');
    state.buffer = 'c';
    ui.typingInput.value = 'ca';
    ui.typingInput.setSelectionRange(1, 1);
    ui.update(state, false);
    expect(ui.typingInput.value).toBe('ca');
    expect(ui.typingInput.selectionStart).toBe(1);
  });

  it('clears the consumed field after a successful match', () => {
    const ui = new Ui();
    ui.typingInput.value = 'cat';
    ui.update(createGame('normal'));
    expect(ui.typingInput.value).toBe('');
  });
});
