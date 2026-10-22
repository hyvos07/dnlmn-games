export type Mode = 'sprint' | 'blitz' | 'zen';
export type PieceKind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export type Action = 'left' | 'right' | 'down' | 'cw' | 'ccw' | 'flip' | 'drop' | 'hold';

export interface ActivePiece {
  kind: PieceKind;
  rotation: number;
  x: number;
  y: number;
}
export interface GameState {
  mode: Mode;
  board: (PieceKind | null)[][];
  active: ActivePiece;
  queue: PieceKind[];
  hold: PieceKind | null;
  canHold: boolean;
  elapsed: number;
  score: number;
  lines: number;
  level: number;
  pieces: number;
  combo: number;
  backToBack: number;
  ended: boolean;
  won: boolean;
  lastClear: string;
  rng: number;
  gravity: number;
  lockTime: number;
  lockResets: number;
  lastRotation: boolean;
  lastKick: number;
  lastAction: Action | null;
}

export const BOARD_WIDTH = 10;
export const BOARD_HEIGHT = 40;
export const VISIBLE_START = 20;
const PIECES: PieceKind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const SHAPES: Record<PieceKind, number[][]> = {
  I: [
    [0, 1],
    [1, 1],
    [2, 1],
    [3, 1],
  ],
  O: [
    [1, 0],
    [2, 0],
    [1, 1],
    [2, 1],
  ],
  T: [
    [1, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  S: [
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
  ],
  Z: [
    [0, 0],
    [1, 0],
    [1, 1],
    [2, 1],
  ],
  J: [
    [0, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
  L: [
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
  ],
};

// SRS offsets are expressed in screen coordinates (positive y is down).
const JLSTZ: Record<string, [number, number][]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
};
const I_KICKS: Record<string, [number, number][]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, 1],
    [1, -2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, -1],
    [-1, 2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, -2],
    [2, 1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, 2],
    [-2, -1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, -1],
    [-1, 2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, 1],
    [1, -2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, 2],
    [-2, -1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, -2],
    [2, 1],
  ],
};
// Fixed 180-degree extension: first test the unshifted turn, then compact side/up/down kicks.
const KICKS_180: Record<string, [number, number][]> = {
  '0>2': [
    [0, 0],
    [-1, 0],
    [1, 0],
    [0, -1],
    [-1, -1],
    [1, -1],
  ],
  '2>0': [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [1, 1],
    [-1, 1],
  ],
  '1>3': [
    [0, 0],
    [0, -1],
    [0, 1],
    [1, 0],
    [1, -1],
    [1, 1],
  ],
  '3>1': [
    [0, 0],
    [0, 1],
    [0, -1],
    [-1, 0],
    [-1, 1],
    [-1, -1],
  ],
};

export function cells(piece: ActivePiece): { x: number; y: number }[] {
  if (piece.kind === 'O')
    return SHAPES.O.map(([x = 0, y = 0]) => ({ x: piece.x + x, y: piece.y + y }));
  const pivot = piece.kind === 'I' ? 3 : 2;
  return SHAPES[piece.kind].map(([x = 0, y = 0]) => {
    let px = x;
    let py = y;
    for (let i = 0; i < (piece.rotation & 3); i++) [px, py] = [pivot - py, px];
    return { x: piece.x + px, y: piece.y + py };
  });
}

function random(state: GameState): number {
  let x = state.rng | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 0x100000000;
}

function ensureQueue(state: GameState): void {
  while (state.queue.length < 7) {
    const bag = [...PIECES];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random(state) * (i + 1));
      const current = bag[i];
      const replacement = bag[j];
      if (current !== undefined && replacement !== undefined) {
        bag[i] = replacement;
        bag[j] = current;
      }
    }
    state.queue.push(...bag);
  }
}

function valid(state: GameState, piece: ActivePiece): boolean {
  return cells(piece).every(
    ({ x, y }) =>
      x >= 0 && x < BOARD_WIDTH && y < BOARD_HEIGHT && (y < 0 || state.board[y]?.[x] === null),
  );
}

function spawn(state: GameState, kind?: PieceKind): void {
  ensureQueue(state);
  const next = kind ?? state.queue.shift() ?? 'I';
  state.active = { kind: next, rotation: 0, x: 3, y: 20 };
  state.gravity = 0;
  state.lockTime = 0;
  state.lockResets = 0;
  state.lastRotation = false;
  state.lastKick = 0;
  state.lastAction = null;
  if (!valid(state, state.active)) {
    if (state.mode === 'zen') {
      for (const row of state.board) row.fill(null);
      state.lastClear = 'TOP OUT · BOARD RECOVERED';
    } else state.ended = true;
  }
}

export function createGame(mode: Mode, seed = Date.now()): GameState {
  const state: GameState = {
    mode,
    board: Array.from({ length: BOARD_HEIGHT }, () =>
      Array<PieceKind | null>(BOARD_WIDTH).fill(null),
    ),
    active: { kind: 'T', rotation: 0, x: 3, y: 20 },
    queue: [],
    hold: null,
    canHold: true,
    elapsed: 0,
    score: 0,
    lines: 0,
    level: 1,
    pieces: 0,
    combo: -1,
    backToBack: 0,
    ended: false,
    won: false,
    lastClear: '',
    rng: seed >>> 0 || 0x6d2b79f5,
    gravity: 0,
    lockTime: 0,
    lockResets: 0,
    lastRotation: false,
    lastKick: 0,
    lastAction: null,
  };
  ensureQueue(state);
  spawn(state);
  return state;
}

export function ghost(state: GameState): ActivePiece {
  const piece = { ...state.active };
  while (valid(state, { ...piece, y: piece.y + 1 })) piece.y++;
  return piece;
}

function move(
  state: GameState,
  dx: number,
  dy: number,
  source: 'input' | 'gravity' | 'soft' = 'input',
): boolean {
  const next = { ...state.active, x: state.active.x + dx, y: state.active.y + dy };
  if (!valid(state, next)) return false;
  state.active = next;
  if (source !== 'gravity') {
    state.lastRotation = false;
    state.lastAction = source === 'soft' ? 'down' : dy > 0 ? 'down' : dx < 0 ? 'left' : 'right';
    if (dy > 0) state.score++;
  }
  if (dy === 0 && state.lockTime > 0 && state.lockResets < 15) {
    state.lockTime = 0;
    state.lockResets++;
  }
  return true;
}

function rotate(state: GameState, direction: number): void {
  const from = state.active.rotation & 3;
  const to = (from + direction + 4) & 3;
  if (state.active.kind === 'O') {
    state.active.rotation = to;
    state.lastRotation = true;
    state.lastKick = 0;
    state.lastAction = direction === 2 ? 'flip' : direction > 0 ? 'cw' : 'ccw';
    if (state.lockTime > 0 && state.lockResets < 15) {
      state.lockTime = 0;
      state.lockResets++;
    }
    return;
  }
  const key = `${from}>${to}`;
  const tests =
    direction === 2
      ? (KICKS_180[key] ?? [])
      : ((state.active.kind === 'I' ? I_KICKS : JLSTZ)[key] ?? []);
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (!test) continue;
    const [dx, dy] = test;
    const next = { ...state.active, rotation: to, x: state.active.x + dx, y: state.active.y + dy };
    if (valid(state, next)) {
      state.active = next;
      state.lastRotation = true;
      state.lastKick = i;
      state.lastAction = direction === 2 ? 'flip' : direction > 0 ? 'cw' : 'ccw';
      if (state.lockTime > 0 && state.lockResets < 15) {
        state.lockTime = 0;
        state.lockResets++;
      }
      return;
    }
  }
}

function grounded(state: GameState): boolean {
  return !valid(state, { ...state.active, y: state.active.y + 1 });
}

function clearLines(state: GameState, spin: boolean, mini: boolean): void {
  const full = state.board.filter((row) => row.every((cell) => cell !== null)).length;
  if (spin && full === 0) state.score += mini ? 100 * state.level : 400 * state.level;
  if (full) {
    state.board = state.board.filter((row) => !row.every((cell) => cell !== null));
    while (state.board.length < BOARD_HEIGHT)
      state.board.unshift(Array<PieceKind | null>(BOARD_WIDTH).fill(null));
  }
  const perfect = full > 0 && state.board.every((row) => row.every((cell) => cell === null));
  const difficult = full === 4 || (spin && full > 0);
  const names = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS'];
  let label = spin ? `${mini && full < 2 ? 'MINI ' : ''}T-SPIN` : (names[full] ?? `${full} LINES`);
  if (perfect) label = `PERFECT CLEAR · ${label}`;
  if (full) {
    const base = spin
      ? ((mini ? [0, 200, 400] : [0, 800, 1200, 1600])[Math.min(full, mini ? 2 : 3)] ?? 0)
      : ([0, 100, 300, 500, 800][Math.min(full, 4)] ?? 0);
    if (difficult && state.backToBack > 0) state.score += Math.floor(base * 0.5 * state.level);
    state.score += base * state.level;
    if (perfect) state.score += 3500 * state.level;
    state.backToBack = difficult ? state.backToBack + 1 : 0;
    state.combo++;
    if (state.combo > 0) state.score += 50 * state.combo * state.level;
    state.lines += full;
    state.level =
      state.mode === 'blitz'
        ? 1 +
          [3, 8, 15, 24, 35, 48, 63, 80, 99, 120, 144, 170, 198, 228, 260].filter(
            (threshold) => state.lines >= threshold,
          ).length
        : 1;
    state.lastClear = `${label}${state.combo > 0 ? ` · ${state.combo} COMBO` : ''}${difficult && state.backToBack > 1 ? ' · B2B' : ''}`;
  } else {
    state.combo = -1;
    if (spin) state.lastClear = label;
    else if (state.lastClear) state.lastClear = '';
  }
}

function lock(state: GameState): void {
  const locked = cells(state.active);
  let spin = false;
  let mini = false;
  if (state.active.kind === 'T' && state.lastRotation) {
    const cx = state.active.x + 1;
    const cy = state.active.y + 1;
    const activeCells = new Set(locked.map(({ x, y }) => `${x},${y}`));
    const occupied = (x: number, y: number) =>
      x < 0 ||
      x >= BOARD_WIDTH ||
      y >= BOARD_HEIGHT ||
      (y >= 0 && (state.board[y]?.[x] != null || activeCells.has(`${x},${y}`)));
    const corners = [
      [cx - 1, cy - 1],
      [cx + 1, cy - 1],
      [cx - 1, cy + 1],
      [cx + 1, cy + 1],
    ].filter(([x = 0, y = 0]) => occupied(x, y));
    if (corners.length >= 3) {
      spin = true;
      const frontCorners =
        [
          [
            [cx - 1, cy - 1],
            [cx + 1, cy - 1],
          ],
          [
            [cx + 1, cy - 1],
            [cx + 1, cy + 1],
          ],
          [
            [cx - 1, cy + 1],
            [cx + 1, cy + 1],
          ],
          [
            [cx - 1, cy - 1],
            [cx - 1, cy + 1],
          ],
        ][state.active.rotation & 3] ?? [];
      mini =
        corners.length === 3 &&
        !(frontCorners.every(([x = 0, y = 0]) => occupied(x, y)) || state.lastKick === 4);
    }
  }
  const visibleCells = locked.filter(({ y }) => y >= VISIBLE_START);
  if (visibleCells.length === 0) {
    state.pieces++;
    state.canHold = true;
    if (state.mode === 'zen') {
      for (const row of state.board) row.fill(null);
      state.lastClear = 'TOP OUT · BOARD RECOVERED';
      spawn(state);
    } else state.ended = true;
    return;
  }
  for (const { x, y } of locked) {
    const row = state.board[y];
    if (row && y >= 0 && y < BOARD_HEIGHT) row[x] = state.active.kind;
  }
  clearLines(state, spin, mini);
  state.pieces++;
  state.canHold = true;
  if (state.mode === 'sprint' && state.lines >= 40) {
    state.won = true;
    state.ended = true;
    return;
  }
  spawn(state);
}

export function act(state: GameState, action: Action): void {
  if (state.ended) return;
  state.lastAction = action;
  if (action === 'left') move(state, -1, 0);
  else if (action === 'right') move(state, 1, 0);
  else if (action === 'down') move(state, 0, 1);
  else if (action === 'cw' || action === 'ccw') rotate(state, action === 'cw' ? 1 : -1);
  else if (action === 'flip') rotate(state, 2);
  else if (action === 'drop') {
    const landed = ghost(state);
    const distance = landed.y - state.active.y;
    state.active = landed;
    state.score += distance * 2;
    lock(state);
  } else if (action === 'hold' && state.canHold) {
    const current = state.active.kind;
    const held = state.hold;
    state.hold = current;
    state.canHold = false;
    spawn(state, held ?? undefined);
  }
}

export function tick(state: GameState, dtMs: number, softDrop = false, softDropFactor = 20): void {
  if (state.ended || !Number.isFinite(dtMs) || dtMs <= 0) return;
  const elapsed = Math.min(
    dtMs,
    state.mode === 'blitz' ? Math.max(0, 120_000 - state.elapsed) : dtMs,
  );
  state.elapsed += elapsed;
  if (state.mode === 'blitz' && state.elapsed >= 120_000) {
    state.elapsed = 120_000;
    state.ended = true;
    return;
  }
  const naturalGravity =
    state.mode === 'blitz'
      ? Math.max(35, 1000 * (0.8 - (state.level - 1) * 0.007) ** (state.level - 1))
      : 1000;
  // A 100x cap approximates sonic drop while keeping a positive, frame-safe interval.
  const gravity = softDrop
    ? Math.max(1, naturalGravity / Math.min(100, Math.max(1, softDropFactor)))
    : naturalGravity;
  state.gravity += elapsed;
  while (state.gravity >= gravity && !state.ended) {
    state.gravity -= gravity;
    if (!move(state, 0, 1, softDrop ? 'soft' : 'gravity')) {
      state.gravity = Math.min(state.gravity, gravity);
      break;
    }
  }
  if (grounded(state)) {
    state.lockTime += elapsed;
    if (state.lockTime >= 500) lock(state);
  } else state.lockTime = 0;
}

export function snapshot(state: GameState): GameState {
  return {
    ...state,
    board: state.board.map((row) => [...row]),
    active: { ...state.active },
    queue: [...state.queue],
  };
}

export function isGameState(value: unknown): value is GameState {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GameState>;
  const isPiece = (piece: unknown): piece is PieceKind =>
    typeof piece === 'string' && PIECES.some((kind) => kind === piece);
  const actions: Action[] = ['left', 'right', 'down', 'cw', 'ccw', 'flip', 'drop', 'hold'];
  const numericKeys = [
    'elapsed',
    'score',
    'lines',
    'level',
    'pieces',
    'combo',
    'backToBack',
    'rng',
    'gravity',
    'lockTime',
    'lockResets',
    'lastKick',
  ];
  const numeric = (key: string) => (v as unknown as Record<string, number>)[key] ?? Number.NaN;
  const activeIsSafe =
    !!v.active &&
    v.active.x >= -4 &&
    v.active.x <= 10 &&
    v.active.y >= -4 &&
    v.active.y <= BOARD_HEIGHT &&
    v.active.rotation >= 0 &&
    v.active.rotation <= 3;
  const valuesAreSafe =
    numericKeys.every((key) => Number.isFinite(numeric(key))) &&
    numeric('elapsed') >= 0 &&
    numeric('elapsed') <= 1_000_000_000_000 &&
    numeric('score') >= 0 &&
    numeric('score') <= 1_000_000_000_000 &&
    Number.isInteger(numeric('score')) &&
    numeric('lines') >= 0 &&
    numeric('lines') <= 1_000_000 &&
    Number.isInteger(numeric('lines')) &&
    numeric('level') >= 1 &&
    numeric('level') <= 16 &&
    (v.mode === 'blitz' || numeric('level') === 1) &&
    Number.isInteger(numeric('level')) &&
    numeric('pieces') >= 0 &&
    numeric('pieces') <= 1_000_000 &&
    Number.isInteger(numeric('pieces')) &&
    numeric('combo') >= -1 &&
    numeric('combo') <= numeric('pieces') &&
    Number.isInteger(numeric('combo')) &&
    numeric('backToBack') >= 0 &&
    numeric('backToBack') <= numeric('pieces') &&
    Number.isInteger(numeric('backToBack')) &&
    numeric('rng') >= 1 &&
    Number.isInteger(numeric('rng')) &&
    numeric('rng') <= 0xffffffff &&
    numeric('gravity') >= 0 &&
    numeric('lockTime') >= 0 &&
    numeric('lockTime') <= 500 &&
    numeric('lockResets') >= 0 &&
    numeric('lockResets') <= 15 &&
    Number.isInteger(numeric('lockResets')) &&
    numeric('lastKick') >= 0 &&
    numeric('lastKick') <= 8 &&
    Number.isInteger(numeric('lastKick'));
  return (
    ['sprint', 'blitz', 'zen'].includes(String(v.mode)) &&
    Array.isArray(v.board) &&
    v.board.length === BOARD_HEIGHT &&
    v.board.every(
      (row) =>
        Array.isArray(row) &&
        row.length === BOARD_WIDTH &&
        row.every((cell) => cell === null || isPiece(cell)),
    ) &&
    !!v.active &&
    isPiece(v.active.kind) &&
    Number.isInteger(v.active.rotation) &&
    activeIsSafe &&
    Number.isInteger(v.active.x) &&
    Number.isInteger(v.active.y) &&
    Array.isArray(v.queue) &&
    v.queue.length >= 5 &&
    v.queue.length <= 14 &&
    v.queue.every(isPiece) &&
    (v.hold === null || isPiece(v.hold)) &&
    typeof v.canHold === 'boolean' &&
    valuesAreSafe &&
    typeof v.ended === 'boolean' &&
    typeof v.won === 'boolean' &&
    typeof v.lastClear === 'string' &&
    v.lastClear.length <= 128 &&
    typeof v.lastRotation === 'boolean' &&
    (v.lastAction === null ||
      (typeof v.lastAction === 'string' && actions.some((action) => action === v.lastAction))) &&
    (v.ended === true || (!!v.active && valid(v as GameState, v.active)))
  );
}
