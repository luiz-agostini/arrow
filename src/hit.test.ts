import { expect, test } from 'vitest';
import { pickArrow } from './hit';
import type { Board } from './model';

const board: Board = {
  width: 5,
  height: 5,
  arrows: [
    { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' },
    { id: 2, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], dir: 'D' },
  ],
};

test('picks the arrow whose body passes nearest', () => {
  expect(pickArrow(board, { x: 1.5, y: 2.5 }, 0.5)).toEqual({ id: 1, ambiguous: false });
  expect(pickArrow(board, { x: 3.2, y: 1.0 }, 0.5)).toEqual({ id: 2, ambiguous: false });
});

test('distance is measured to the body between cell centres, not only to centres', () => {
  // Midway along A's segment from (0.5, 2.5) to (1.5, 2.5).
  expect(pickArrow(board, { x: 1.0, y: 2.8 }, 0.35)).toEqual({ id: 1, ambiguous: false });
});

test('two arrows within 0.25 cell of each other make the pick ambiguous', () => {
  const pick = pickArrow(board, { x: 2.6, y: 2.5 }, 1);
  expect(pick?.ambiguous).toBe(true);
  expect(pick?.id).toBe(2);
});

test('the pick must be within the radius, but a close rival just outside it still makes it ambiguous', () => {
  expect(pickArrow(board, { x: 0.5, y: 0.5 }, 0.4)).toBeNull();
  // B is 0.9 away (inside the radius); A is 1.1 away, outside it but within 0.25 of B.
  expect(pickArrow(board, { x: 2.6, y: 2.5 }, 1.0)).toEqual({ id: 2, ambiguous: true });
  // Far from A, B alone is a clear pick.
  expect(pickArrow(board, { x: 3.9, y: 1.0 }, 0.5)).toEqual({ id: 2, ambiguous: false });
});

test('a one-cell arrow is picked by its cell centre', () => {
  const single: Board = { width: 3, height: 3, arrows: [{ id: 7, cells: [{ x: 1, y: 1 }], dir: 'U' }] };
  expect(pickArrow(single, { x: 1.6, y: 1.5 }, 0.2)).toEqual({ id: 7, ambiguous: false });
});
