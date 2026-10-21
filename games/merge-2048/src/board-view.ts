import { animate, type JSAnimation } from 'animejs';
import type { Grid, Position, Tile } from './logic/rules.ts';

/** Finish the previous visual move before rendering the next one, so fast input is never dropped. */
export class BoardView {
  private animations: JSAnimation[] = [];
  private cells: HTMLElement[] = [];
  private finalGrid: Grid | null = null;
  private readonly reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly board: HTMLElement,
    private readonly layer: HTMLElement,
  ) {
    const body = document.createElement('tbody');
    body.className = 'board-rows';
    board.append(body);
    for (let y = 0; y < 4; y++) {
      const row = document.createElement('tr');
      row.className = 'board-row';
      row.setAttribute('role', 'row');
      for (let x = 0; x < 4; x++) {
        const cell = document.createElement('td');
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        row.append(cell);
        this.cells.push(cell);
      }
      body.append(row);
    }
    new ResizeObserver(() => this.settle()).observe(board);
    this.reduced.addEventListener('change', () => this.settle());
  }

  private tileNode(tile: Tile): HTMLElement {
    const node = document.createElement('div');
    const digits = String(tile.value).length;
    node.className = `tile ${digits === 3 ? 'is-three' : digits === 4 ? 'is-four' : digits >= 5 ? 'is-long' : ''} ${tile.value > 2048 ? 'is-super' : ''}`;
    node.dataset.value = String(tile.value);
    node.dataset.tileId = String(tile.id);
    node.style.setProperty('--x', String(tile.x));
    node.style.setProperty('--y', String(tile.y));
    const face = document.createElement('div');
    face.className = 'tile-face';
    face.textContent = String(tile.value);
    node.append(face);
    this.layer.append(node);
    return node;
  }

  settle(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
    this.layer.replaceChildren();
    this.finalGrid?.eachCell((_x, _y, tile) => {
      if (tile) this.tileNode(tile);
    });
  }

  render(grid: Grid, motion = true): void {
    this.settle();
    this.finalGrid = grid;
    this.layer.replaceChildren();
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 4; x++) {
        const value = grid.cellContent({ x, y })?.value;
        this.cells[y * 4 + x]?.setAttribute(
          'aria-label',
          `Row ${y + 1}, column ${x + 1}: ${value ?? 'empty'}`,
        );
      }
    }
    const moving = motion && !this.reduced.matches;
    const gap = Number.parseFloat(getComputedStyle(this.board).gap) || 10;
    const step = (this.layer.clientWidth + gap) / 4;
    const slide = (tile: Tile, node: HTMLElement, remove = false, destination: Position = tile) => {
      const from = tile.previousPosition ?? tile;
      this.animations.push(
        animate(node, {
          translateX: [(from.x - destination.x) * step, 0],
          translateY: [(from.y - destination.y) * step, 0],
          duration: 125,
          ease: 'outCubic',
          onComplete: () => {
            if (remove) node.remove();
          },
        }),
      );
    };
    grid.eachCell((_x, _y, tile) => {
      if (!tile) return;
      const node = this.tileNode(tile);
      if (!moving) return;
      if (tile.mergedFrom) {
        for (const source of tile.mergedFrom) {
          const ghost = this.tileNode(source);
          ghost.style.setProperty('--x', String(tile.x));
          ghost.style.setProperty('--y', String(tile.y));
          // Both source tiles converge on the new tile's cell.
          slide(source, ghost, true, tile);
        }
        this.animations.push(
          animate(node, {
            opacity: [0, 1],
            scale: [0.82, 1.08, 1],
            delay: 120,
            duration: 180,
            ease: 'outBack',
          }),
        );
      } else if (tile.previousPosition) {
        slide(tile, node);
      } else {
        this.animations.push(
          animate(node, {
            scale: [0.55, 1],
            opacity: [0, 1],
            delay: 120,
            duration: 160,
            ease: 'outBack',
          }),
        );
      }
    });
  }

  pause(): void {
    for (const animation of this.animations) animation.pause();
  }

  resume(): void {
    for (const animation of this.animations) animation.resume();
  }
}
