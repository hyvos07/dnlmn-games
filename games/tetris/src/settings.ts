import { ACTIONS, defaultHandling, type Handling } from './input.ts';
import type { Action } from './logic/engine.ts';
import { RESERVED_CODES, readHandling } from './storage.ts';

const LABELS: Record<Action, string> = {
  left: 'Move left',
  right: 'Move right',
  down: 'Soft drop',
  cw: 'Clockwise',
  ccw: 'Counterclockwise',
  flip: '180° turn',
  drop: 'Hard drop',
  hold: 'Hold',
};
const shortKey = (code: string) =>
  code.replace('Key', '').replace('Arrow', '').replace('Left', 'L').replace('Right', 'R');

export function createSettings(
  root: HTMLElement,
  initial: Handling,
  save: (settings: Handling) => void,
) {
  let settings = initial;
  let capturing: Action | null = null;
  const modal = root.querySelector<HTMLElement>('[data-settings]');
  const status = document.createElement('p');
  status.className = 'settings-status';
  status.setAttribute('role', 'status');
  root.querySelector('.settings-foot')?.before(status);

  function refresh(): void {
    for (const key of ['das', 'arr', 'sdf'] as const) {
      const field = root.querySelector<HTMLInputElement>(`#${key}`);
      if (field) field.value = String(settings[key]);
    }
    const effects = root.querySelector<HTMLInputElement>('#effects');
    if (effects) effects.checked = settings.effects;
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-bind]')) {
      const action = button.dataset.bind as Action;
      button.textContent = `${LABELS[action]}: ${capturing === action ? 'Press a key…' : settings.bindings[action].map(shortKey).join(' / ')}`;
      button.setAttribute('aria-label', `Rebind ${LABELS[action]}`);
    }
  }
  function cancel(): void {
    capturing = null;
    refresh();
  }
  root.addEventListener('click', (event) => {
    const bind = (event.target as HTMLElement).closest<HTMLElement>('[data-bind]')?.dataset.bind as
      | Action
      | undefined;
    if (bind && ACTIONS.includes(bind)) {
      capturing = bind;
      status.textContent = `Press a key for ${LABELS[bind]}. Escape cancels.`;
      refresh();
    }
    if ((event.target as HTMLElement).closest('[data-command="reset-handling"]')) {
      settings = defaultHandling();
      save(settings);
      cancel();
      status.textContent = 'Default controls restored.';
    }
  });
  root.addEventListener('change', (event) => {
    const field = event.target;
    if (!(field instanceof HTMLInputElement)) return;
    const candidate = { ...settings };
    if (field.id === 'effects') candidate.effects = field.checked;
    else if (field.id === 'das' || field.id === 'arr' || field.id === 'sdf')
      candidate[field.id] = Number(field.value);
    else return;
    settings = readHandling(candidate);
    save(settings);
    refresh();
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!modal || modal.hidden) return;
      if (event.key === 'Tab') {
        const elements = [...modal.querySelectorAll<HTMLElement>('button,input')].filter(
          (el) => !el.hasAttribute('disabled'),
        );
        const first = elements[0],
          last = elements.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
      if (!capturing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.code === 'Escape') {
        cancel();
        status.textContent = '';
        return;
      }
      if (
        RESERVED_CODES.has(event.code) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        !/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Shift(Left|Right)|Numpad[0-9])$/.test(
          event.code,
        )
      ) {
        status.textContent =
          'Choose a letter, arrow, number, Shift or Space. R, F, M and menu keys are reserved.';
        return;
      }
      const used = ACTIONS.find(
        (a) => a !== capturing && settings.bindings[a].includes(event.code),
      );
      if (used) {
        status.textContent = `Already used for ${LABELS[used]}. Choose another key.`;
        return;
      }
      settings.bindings[capturing] = [event.code];
      save(settings);
      cancel();
      status.textContent = 'Key saved.';
    },
    true,
  );
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'text-button';
  reset.dataset.command = 'reset-handling';
  reset.textContent = 'Restore controls';
  root.querySelector('.settings-foot')?.append(reset);
  refresh();
  return {
    get value() {
      return settings;
    },
    cancel,
  };
}
