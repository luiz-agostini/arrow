import { expect, test } from 'vitest';
import { fit, pan, viewBox, zoomAt } from './viewport';

const board = { width: 10, height: 10 };
// Where a board point sits within the visible window, from 0 (left/top) to 1.
const relative = (v: ReturnType<typeof fit>, p: { x: number; y: number }) => {
  const [x, y, w, h] = viewBox(v, board).split(' ').map(Number);
  return { x: (p.x * 24 - x) / w, y: (p.y * 24 - y) / h };
};

test('fit shows the whole board with its one-cell margin', () => {
  expect(fit()).toEqual({ scale: 1, x: -1, y: -1 });
  expect(viewBox(fit(), board)).toBe('-24 -24 288 288');
});

test('zooming keeps the point under the cursor in place', () => {
  const v = zoomAt(fit(), 2, { x: 5, y: 5 }, board);
  expect(v.scale).toBe(2);
  expect(relative(v, { x: 5, y: 5 })).toEqual(relative(fit(), { x: 5, y: 5 }));
  expect(viewBox(v, board)).toBe('48 48 144 144');
  const off = zoomAt(fit(), 2, { x: 3, y: 4 }, board);
  expect(relative(off, { x: 3, y: 4 }).x).toBeCloseTo(relative(fit(), { x: 3, y: 4 }).x, 9);
  expect(relative(off, { x: 3, y: 4 }).y).toBeCloseTo(relative(fit(), { x: 3, y: 4 }).y, 9);
});

test('scale is clamped between 1 and 8, and scale 1 is always fit', () => {
  expect(zoomAt(fit(), 100, { x: 5, y: 5 }, board).scale).toBe(8);
  const back = zoomAt(zoomAt(fit(), 4, { x: 2, y: 2 }, board), 0.01, { x: 2, y: 2 }, board);
  expect(back).toEqual(fit());
});

test('panning is clamped so the view stays on the board and its margin', () => {
  const v = zoomAt(fit(), 2, { x: 5, y: 5 }, board); // window is 6 cells wide, from 2 to 8
  expect(pan(v, 1, -1, board)).toEqual({ scale: 2, x: 3, y: 1 });
  expect(pan(v, 100, 100, board)).toEqual({ scale: 2, x: 5, y: 5 });
  expect(pan(v, -100, -100, board)).toEqual({ scale: 2, x: -1, y: -1 });
  expect(pan(fit(), 3, 3, board)).toEqual(fit());
});
