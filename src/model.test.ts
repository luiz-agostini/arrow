import { describe, expect, test } from 'vitest';
import { blockerOf, exitRay, removeArrow, type Arrow, type Board } from './model';

const A: Arrow = { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' };
const B: Arrow = { id: 2, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], dir: 'D' };
const board: Board = { width: 5, height: 5, arrows: [A, B] };

describe('exitRay', () => {
  test('lists cells from the head to the edge', () => {
    expect(exitRay(board, A)).toEqual([{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 }]);
  });
});

describe('blockerOf', () => {
  test('returns the first arrow in the exit ray', () => {
    expect(blockerOf(board, A.id)).toBe(B.id);
  });

  test('returns null when the ray is clear', () => {
    expect(blockerOf(board, B.id)).toBeNull();
  });

  test('an arrow whose ray hits its own body is blocked by itself', () => {
    const hook: Arrow = {
      id: 9,
      cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
      dir: 'D',
    };
    const loop: Arrow = {
      id: 8,
      cells: [{ x: 1, y: 3 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 }, { x: 2, y: 4 }, { x: 2, y: 3 }],
      dir: 'U',
    };
    expect(blockerOf({ width: 5, height: 5, arrows: [hook] }, hook.id)).toBeNull();
    expect(blockerOf({ width: 5, height: 5, arrows: [loop] }, loop.id)).toBe(loop.id);
  });
});

describe('removeArrow', () => {
  test('frees the arrows it was blocking without mutating the input', () => {
    const after = removeArrow(board, B.id);
    expect(blockerOf(after, A.id)).toBeNull();
    expect(board.arrows).toHaveLength(2);
    expect(after.arrows.map((a) => a.id)).toEqual([A.id]);
  });
});
