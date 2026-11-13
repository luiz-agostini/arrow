import { expect, test } from 'vitest';
import { LIVES, newGame, tap } from './game';
import type { Board } from './model';

const board: Board = {
  width: 5,
  height: 5,
  arrows: [
    { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' },
    { id: 2, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], dir: 'D' },
  ],
};

test('a new game starts playing with full lives', () => {
  expect(newGame(board)).toEqual({ board, lives: LIVES, status: 'playing', moves: 0 });
  expect(LIVES).toBe(3);
});

test('a blocked tap costs a life and names the blocker', () => {
  const { game, result, blocker } = tap(newGame(board), 1);
  expect(result).toBe('blocked');
  expect(blocker).toBe(2);
  expect(game.lives).toBe(2);
  expect(game.moves).toBe(1);
  expect(game.board.arrows).toHaveLength(2);
});

test('clearing every arrow wins', () => {
  const first = tap(newGame(board), 2);
  expect(first.result).toBe('removed');
  expect(first.game.status).toBe('playing');
  const second = tap(first.game, 1);
  expect(second.result).toBe('removed');
  expect(second.game.status).toBe('won');
  expect(second.game.moves).toBe(2);
});

test('running out of lives loses', () => {
  let g = newGame(board);
  for (let i = 0; i < 3; i++) g = tap(g, 1).game;
  expect(g.lives).toBe(0);
  expect(g.status).toBe('lost');
});

test('taps after the game ends or on unknown ids are ignored', () => {
  let lost = newGame(board);
  for (let i = 0; i < 3; i++) lost = tap(lost, 1).game;
  expect(tap(lost, 2)).toEqual({ game: lost, result: 'ignored' });

  const fresh = newGame(board);
  expect(tap(fresh, 99)).toEqual({ game: fresh, result: 'ignored' });
});
