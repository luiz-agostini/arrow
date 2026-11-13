import { blockerOf, removeArrow, type Board } from './model';

export const LIVES = 3;

export type Game = { board: Board; lives: number; status: 'playing' | 'won' | 'lost'; moves: number };
export type TapResult = { game: Game; result: 'removed' | 'blocked' | 'ignored'; blocker?: number };

export function newGame(b: Board): Game {
  return { board: b, lives: LIVES, status: 'playing', moves: 0 };
}

export function tap(g: Game, id: number): TapResult {
  if (g.status !== 'playing' || !g.board.arrows.some((a) => a.id === id)) return { game: g, result: 'ignored' };
  const moves = g.moves + 1;
  const blocker = blockerOf(g.board, id);
  if (blocker !== null) {
    const lives = g.lives - 1;
    return { game: { ...g, lives, moves, status: lives === 0 ? 'lost' : 'playing' }, result: 'blocked', blocker };
  }
  const board = removeArrow(g.board, id);
  return { game: { ...g, board, moves, status: board.arrows.length === 0 ? 'won' : 'playing' }, result: 'removed' };
}
