import { expect, test } from 'vitest';
import type { Board } from './model';
import { freeArrows, solve } from './solve';

const board: Board = {
  width: 5,
  height: 5,
  arrows: [
    { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' },
    { id: 2, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], dir: 'D' },
  ],
};

test('freeArrows lists arrows with a clear exit', () => {
  expect(freeArrows(board)).toEqual([2]);
});

test('solve returns a removal order', () => {
  expect(solve(board)).toEqual([2, 1]);
});

test('solve returns null for a deadlock', () => {
  const deadlock: Board = {
    width: 5,
    height: 5,
    arrows: [
      { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' },
      { id: 2, cells: [{ x: 4, y: 2 }, { x: 3, y: 2 }], dir: 'L' },
    ],
  };
  expect(solve(deadlock)).toBeNull();
});

test('solve of an empty board is empty', () => {
  expect(solve({ width: 3, height: 3, arrows: [] })).toEqual([]);
});
