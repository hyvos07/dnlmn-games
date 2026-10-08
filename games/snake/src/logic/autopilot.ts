import { add, type Board, cellKey, DIRS, type Dir, inBounds, OPPOSITE, type Vec } from './grid.ts';
import type { SnakeState } from './snake.ts';

const ORDER: readonly Dir[] = ['up', 'right', 'down', 'left'];

interface Move {
  dir: Dir;
  at: Vec;
}

function blockedCells(state: SnakeState): Set<number> {
  // The tail moves away next step (unless growing), so it doesn't block.
  const body = state.grow > 0 ? state.body : state.body.slice(0, -1);
  return new Set(body.map((p) => cellKey(state.board, p)));
}

function openNeighbours(board: Board, blocked: Set<number>, from: Vec): Move[] {
  const out: Move[] = [];
  for (const dir of ORDER) {
    const at = add(from, DIRS[dir]);
    if (inBounds(board, at) && !blocked.has(cellKey(board, at))) out.push({ dir, at });
  }
  return out;
}

/** Number of cells reachable from `start` (flood fill), used to avoid dead ends. */
export function reachable(board: Board, blocked: Set<number>, start: Vec): number {
  const seen = new Set<number>([cellKey(board, start)]);
  const stack = [start];
  while (stack.length > 0) {
    const cell = stack.pop() as Vec;
    for (const { at } of openNeighbours(board, blocked, cell)) {
      const key = cellKey(board, at);
      if (!seen.has(key)) {
        seen.add(key);
        stack.push(at);
      }
    }
  }
  return seen.size;
}

/** BFS distances (in steps) from `from` to every open cell. */
function distancesFrom(board: Board, blocked: Set<number>, from: Vec): Map<number, number> {
  const dist = new Map<number, number>([[cellKey(board, from), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i] as Vec;
    const d = dist.get(cellKey(board, cell)) as number;
    for (const { at } of openNeighbours(board, blocked, cell)) {
      const key = cellKey(board, at);
      if (!dist.has(key)) {
        dist.set(key, d + 1);
        queue.push(at);
      }
    }
  }
  return dist;
}

/**
 * Pick a direction for the attract-mode demo: a shortest path to the food when its first
 * step leaves enough room, otherwise the move with the most open space. Among equally
 * short paths it prefers turning, so the demo snake winds instead of drawing an L.
 */
export function autopilot(state: SnakeState): Dir {
  const { board } = state;
  const head = state.body[0] as Vec;
  const headKey = cellKey(board, head);
  const blocked = blockedCells(state);
  const moves = openNeighbours(board, blocked, head).filter(
    ({ dir }) => dir !== OPPOSITE[state.dir],
  );
  if (moves.length === 0) return state.dir;

  const roomAfter = (at: Vec) => reachable(board, new Set(blocked).add(headKey), at);

  if (state.food) {
    const dist = distancesFrom(board, new Set(blocked).add(headKey), state.food);
    const scored = moves
      .map((move) => ({ move, d: dist.get(cellKey(board, move.at)) ?? Number.POSITIVE_INFINITY }))
      .filter(({ d }) => Number.isFinite(d));
    const shortest = Math.min(...scored.map(({ d }) => d));
    const candidates = scored
      .filter(({ d }) => d === shortest)
      .map(({ move }) => move)
      .filter((move) => roomAfter(move.at) > state.body.length);
    const turn = candidates.find((move) => move.dir !== state.dir);
    const pick = turn ?? candidates[0];
    if (pick) return pick.dir;
  }

  let best = moves[0] as Move;
  let bestRoom = -1;
  for (const move of moves) {
    const room = roomAfter(move.at);
    if (room > bestRoom) {
      best = move;
      bestRoom = room;
    }
  }
  return best.dir;
}
