export interface Vec {
  x: number;
  y: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

export interface Board {
  cols: number;
  rows: number;
}

export const DIRS: Readonly<Record<Dir, Vec>> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Readonly<Record<Dir, Dir>> = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const same = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
export const inBounds = (board: Board, p: Vec): boolean =>
  p.x >= 0 && p.y >= 0 && p.x < board.cols && p.y < board.rows;
export const cellKey = (board: Board, p: Vec): number => p.y * board.cols + p.x;
