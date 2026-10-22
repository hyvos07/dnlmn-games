import type { Action } from './logic/engine.ts';

export const ACTIONS: Action[] = ['left', 'right', 'down', 'cw', 'ccw', 'flip', 'drop', 'hold'];
export type Bindings = Record<Action, string[]>;
export interface Handling {
  das: number;
  arr: number;
  sdf: number;
  effects: boolean;
  bindings: Bindings;
}
export function defaultHandling(): Handling {
  return {
    das: 133,
    arr: 16,
    sdf: 8,
    effects: true,
    bindings: {
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      down: ['ArrowDown'],
      cw: ['ArrowUp', 'KeyX'],
      ccw: ['KeyZ'],
      flip: ['KeyA'],
      drop: ['Space'],
      hold: ['KeyC', 'ShiftLeft', 'ShiftRight'],
    },
  };
}

/** Time-based repeat, including instantaneous wall movement for ARR=0. */
export class MovementRepeat {
  private elapsed = 0;
  private repeats = 0;
  private direction: 'left' | 'right' | null = null;

  press(direction: 'left' | 'right'): void {
    this.direction = direction;
    this.elapsed = 0;
    this.repeats = 0;
  }
  clear(): void {
    this.direction = null;
  }
  update(dt: number, das: number, arr: number, apply: (action: Action) => void): void {
    if (!this.direction) return;
    this.elapsed += dt;
    if (this.elapsed < das) return;
    if (arr === 0) {
      for (let i = 0; i < 10; i++) apply(this.direction);
      return;
    }
    const wanted = 1 + Math.floor((this.elapsed - das) / arr);
    const count = Math.min(20, wanted - this.repeats);
    this.repeats = wanted;
    for (let i = 0; i < count; i++) apply(this.direction);
  }
}

export function createInput(
  root: HTMLElement,
  enabled: () => boolean,
  settings: () => Handling,
  apply: (action: Action) => void,
) {
  const pressed = new Map<string, Action>();
  const repeat = new MovementRepeat();
  function press(source: string, action: Action): void {
    if (!enabled() || pressed.has(source)) return;
    pressed.set(source, action);
    if (action === 'left' || action === 'right') repeat.press(action);
    apply(action);
  }
  function release(source: string): void {
    const old = pressed.get(source);
    pressed.delete(source);
    if (old !== 'left' && old !== 'right') return;
    repeat.clear();
    const remaining = [...pressed.values()].filter((a) => a === 'left' || a === 'right');
    const last = remaining.at(-1);
    if (last === 'left' || last === 'right') repeat.press(last);
  }
  function clear(): void {
    pressed.clear();
    repeat.clear();
  }
  window.addEventListener('keydown', (event) => {
    if (!enabled() || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof HTMLElement && event.target.closest('input,select,textarea'))
      return;
    const action = ACTIONS.find((a) => settings().bindings[a].includes(event.code));
    if (!action) return;
    event.preventDefault();
    if (!event.repeat) press(event.code, action);
  });
  window.addEventListener('keyup', (event) => release(event.code));
  window.addEventListener('blur', clear);
  root.addEventListener('pointerdown', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    const action = button?.dataset.action;
    if (!button || !ACTIONS.includes(action as Action) || !enabled()) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    press(`pointer:${event.pointerId}`, action as Action);
  });
  const releasePointer = (event: PointerEvent) => release(`pointer:${event.pointerId}`);
  root.addEventListener('pointerup', releasePointer);
  root.addEventListener('pointercancel', releasePointer);
  root.addEventListener('lostpointercapture', releasePointer);
  root.addEventListener('click', (event) => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset
      .action;
    if (event.detail === 0 && enabled() && ACTIONS.includes(action as Action))
      apply(action as Action);
  });
  return {
    clear,
    get softDrop() {
      return [...pressed.values()].includes('down');
    },
    update(dt: number) {
      repeat.update(dt, settings().das, settings().arr, apply);
    },
  };
}
