import { blockerOf, removeArrow, type Board } from './model';

export function freeArrows(b: Board): number[] {
  return b.arrows.filter((a) => blockerOf(b, a.id) === null).map((a) => a.id);
}

/** Greedy is complete: removing a free arrow never blocks another one. */
export function solve(b: Board): number[] | null {
  const order: number[] = [];
  let board = b;
  while (board.arrows.length > 0) {
    const free = freeArrows(board);
    if (free.length === 0) return null;
    for (const id of free) board = removeArrow(board, id);
    order.push(...free);
  }
  return order;
}
