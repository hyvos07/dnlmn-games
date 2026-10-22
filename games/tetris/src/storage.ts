import type { GameStorage } from '@games/sdk';
import { ACTIONS, defaultHandling, type Handling } from './input.ts';
import { type GameState, isGameState, snapshot } from './logic/engine.ts';

export interface Records {
  sprint: number | null;
  blitz: number;
}
export interface ZenSave {
  state: GameState;
  undo: GameState[];
  redo: GameState[];
}
const finite = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
export const RESERVED_CODES = new Set([
  'Escape',
  'KeyR',
  'KeyF',
  'KeyM',
  'Tab',
  'Enter',
  'Backspace',
]);
export function readHandling(value: unknown): Handling {
  const settings = defaultHandling();
  if (!value || typeof value !== 'object') return settings;
  const v = value as Partial<Handling>;
  if (finite(v.das, 0, 500)) settings.das = v.das;
  if (finite(v.arr, 0, 200)) settings.arr = v.arr;
  if (finite(v.sdf, 1, 100)) settings.sdf = v.sdf;
  if (typeof v.effects === 'boolean') settings.effects = v.effects;
  const bindings = v.bindings;
  if (bindings && typeof bindings === 'object') {
    const all: string[] = [];
    const valid = ACTIONS.every((action) => {
      const keys = bindings[action];
      if (!Array.isArray(keys) || keys.length < 1 || keys.length > 3) return false;
      return keys.every((key) => {
        if (
          typeof key !== 'string' ||
          !/^(Key[A-Z]|Digit[0-9]|Arrow(Left|Right|Up|Down)|Space|Shift(Left|Right)|Numpad[0-9])$/.test(
            key,
          ) ||
          RESERVED_CODES.has(key) ||
          all.includes(key)
        )
          return false;
        all.push(key);
        return true;
      });
    });
    if (valid) settings.bindings = structuredClone(bindings);
  }
  return settings;
}
export function readRecords(value: unknown): Records {
  const records: Records = { sprint: null, blitz: 0 };
  if (!value || typeof value !== 'object') return records;
  const v = value as Partial<Records>;
  if (finite(v.sprint, 1, 86400000)) records.sprint = v.sprint;
  if (finite(v.blitz, 0, Number.MAX_SAFE_INTEGER)) records.blitz = v.blitz;
  return records;
}
export function readZen(value: unknown): ZenSave | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<ZenSave> & { version?: number };
  if (v.version !== 1 || !isGameState(v.state) || v.state.mode !== 'zen' || v.state.ended)
    return null;
  const history = (values: unknown): GameState[] =>
    Array.isArray(values)
      ? values
          .slice(-30)
          .filter((s): s is GameState => isGameState(s) && s.mode === 'zen' && !s.ended)
          .map(snapshot)
      : [];
  return { state: snapshot(v.state), undo: history(v.undo), redo: history(v.redo) };
}
export function saveZen(storage: GameStorage, save: ZenSave): void {
  storage.set('zen-v1', {
    version: 1,
    state: snapshot(save.state),
    undo: save.undo.slice(-30),
    redo: save.redo.slice(-30),
  });
}
