/** TypeScript adaptation of Gabriele Cirulli's 2048 (MIT).
 * Upstream revision and original sources: ./fixtures/. License: public/UPSTREAM-LICENSE.txt.
 * Column-major cells, traversal order, merge guards and random-call order match upstream.
 */
export interface Position {
  x: number;
  y: number;
}

export interface SavedTile {
  position: Position;
  value: number;
}

export interface SavedGame {
  grid: { size: number; cells: (SavedTile | null)[][] };
  score: number;
  over: boolean;
  won: boolean;
  keepPlaying: boolean;
}

export type Direction = 0 | 1 | 2 | 3;
let nextId = 0;

export class Tile implements Position {
  readonly id = nextId++;
  x: number;
  y: number;
  value: number;
  previousPosition: Position | null = null;
  mergedFrom: [Tile, Tile] | null = null;

  constructor(position: Position, value = 2) {
    this.x = position.x;
    this.y = position.y;
    this.value = value;
  }

  savePosition(): void {
    this.previousPosition = { x: this.x, y: this.y };
  }

  updatePosition(position: Position): void {
    this.x = position.x;
    this.y = position.y;
  }

  serialize(): SavedTile {
    return { position: { x: this.x, y: this.y }, value: this.value };
  }
}

export class Grid {
  readonly size = 4;
  cells: (Tile | null)[][];

  constructor(state?: SavedGame['grid']['cells']) {
    this.cells = Array.from({ length: 4 }, (_, x) =>
      Array.from({ length: 4 }, (_, y) => {
        const tile = state?.[x]?.[y];
        return tile ? new Tile(tile.position, tile.value) : null;
      }),
    );
  }

  eachCell(callback: (x: number, y: number, tile: Tile | null) => void): void {
    for (let x = 0; x < 4; x++)
      for (let y = 0; y < 4; y++) callback(x, y, this.cells[x]?.[y] ?? null);
  }

  availableCells(): Position[] {
    const cells: Position[] = [];
    this.eachCell((x, y, tile) => {
      if (!tile) cells.push({ x, y });
    });
    return cells;
  }

  withinBounds(cell: Position): boolean {
    return cell.x >= 0 && cell.x < 4 && cell.y >= 0 && cell.y < 4;
  }

  cellContent(cell: Position): Tile | null {
    return this.cells[cell.x]?.[cell.y] ?? null;
  }

  insertTile(tile: Tile): void {
    const column = this.cells[tile.x];
    if (column) column[tile.y] = tile;
  }

  removeTile(tile: Position): void {
    const column = this.cells[tile.x];
    if (column) column[tile.y] = null;
  }

  serialize(): SavedGame['grid'] {
    return {
      size: 4,
      cells: this.cells.map((column) => column.map((tile) => tile?.serialize() ?? null)),
    };
  }
}

const VECTORS: Record<Direction, Position> = {
  0: { x: 0, y: -1 },
  1: { x: 1, y: 0 },
  2: { x: 0, y: 1 },
  3: { x: -1, y: 0 },
};

export class GameManager {
  grid: Grid;
  score: number;
  over: boolean;
  won: boolean;
  keepPlaying: boolean;

  constructor(
    private readonly random: () => number = Math.random,
    previous?: SavedGame,
  ) {
    this.grid = new Grid(previous?.grid.cells);
    this.score = previous?.score ?? 0;
    this.over = previous?.over ?? false;
    this.won = previous?.won ?? false;
    this.keepPlaying = previous?.keepPlaying ?? false;
    if (!previous) {
      this.addRandomTile();
      this.addRandomTile();
    }
  }

  isGameTerminated(): boolean {
    return this.over || (this.won && !this.keepPlaying);
  }

  continue(): void {
    if (this.won && !this.over) this.keepPlaying = true;
  }

  addRandomTile(): void {
    const cells = this.grid.availableCells();
    if (!cells.length) return;
    const value = this.random() < 0.9 ? 2 : 4;
    const position = cells[Math.floor(this.random() * cells.length)];
    if (position) this.grid.insertTile(new Tile(position, value));
  }

  move(direction: Direction): boolean {
    if (this.isGameTerminated()) return false;
    const vector = VECTORS[direction];
    const xs = [0, 1, 2, 3];
    const ys = [0, 1, 2, 3];
    if (vector.x === 1) xs.reverse();
    if (vector.y === 1) ys.reverse();
    let moved = false;

    this.grid.eachCell((_x, _y, tile) => {
      if (tile) {
        tile.mergedFrom = null;
        tile.savePosition();
      }
    });

    for (const x of xs) {
      for (const y of ys) {
        const cell = { x, y };
        const tile = this.grid.cellContent(cell);
        if (!tile) continue;
        let previous: Position;
        let nextCell = cell;
        do {
          previous = nextCell;
          nextCell = { x: previous.x + vector.x, y: previous.y + vector.y };
        } while (this.grid.withinBounds(nextCell) && !this.grid.cellContent(nextCell));
        const next = this.grid.cellContent(nextCell);
        if (next && next.value === tile.value && !next.mergedFrom) {
          const merged = new Tile(nextCell, tile.value * 2);
          merged.mergedFrom = [tile, next];
          this.grid.insertTile(merged);
          this.grid.removeTile(tile);
          tile.updatePosition(nextCell);
          this.score += merged.value;
          if (merged.value === 2048) this.won = true;
        } else {
          this.grid.removeTile(tile);
          tile.updatePosition(previous);
          this.grid.insertTile(tile);
        }
        if (cell.x !== tile.x || cell.y !== tile.y) moved = true;
      }
    }
    if (moved) {
      this.addRandomTile();
      if (!this.movesAvailable()) this.over = true;
    }
    return moved;
  }

  movesAvailable(): boolean {
    if (this.grid.availableCells().length) return true;
    let match = false;
    this.grid.eachCell((x, y, tile) => {
      if (!tile) return;
      for (const vector of Object.values(VECTORS)) {
        const other = this.grid.cellContent({ x: x + vector.x, y: y + vector.y });
        if (other?.value === tile.value) match = true;
      }
    });
    return match;
  }

  serialize(): SavedGame {
    return {
      grid: this.grid.serialize(),
      score: this.score,
      over: this.over,
      won: this.won,
      keepPlaying: this.keepPlaying,
    };
  }
}

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** A damaged or obsolete save must never prevent the game from opening. */
export function readSave(value: unknown): SavedGame | undefined {
  if (!object(value) || !object(value.grid) || value.grid.size !== 4) return;
  if (!Number.isSafeInteger(value.score) || (value.score as number) < 0) return;
  if (
    typeof value.won !== 'boolean' ||
    typeof value.over !== 'boolean' ||
    typeof value.keepPlaying !== 'boolean'
  )
    return;
  const cells = value.grid.cells;
  if (!Array.isArray(cells) || cells.length !== 4) return;
  let count = 0;
  for (let x = 0; x < 4; x++) {
    const column = cells[x];
    if (!Array.isArray(column) || column.length !== 4) return;
    for (let y = 0; y < 4; y++) {
      const tile: unknown = column[y];
      if (tile === null) continue;
      if (
        !object(tile) ||
        !object(tile.position) ||
        tile.position.x !== x ||
        tile.position.y !== y ||
        typeof tile.value !== 'number' ||
        !Number.isSafeInteger(tile.value) ||
        tile.value < 2 ||
        2 ** Math.round(Math.log2(tile.value)) !== tile.value
      )
        return;
      count++;
    }
  }
  if (count < 2 || (value.keepPlaying && !value.won)) return;
  return structuredClone(value) as unknown as SavedGame;
}
