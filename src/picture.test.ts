import { describe, expect, test } from 'vitest';
import { gridSize, pictureToLevel } from './picture';
import { BLACK, BLUE, paint, RED, WHITE } from './test-helpers';

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const square = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) ? BLACK : WHITE));
const filled = (mask: string[]) => mask.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '.' ? [] : [`${x},${y}`])));

describe('gridSize', () => {
  test('keeps the aspect ratio and caps rows at 40', () => {
    expect(gridSize(100, 300, 20)).toEqual({ cols: 13, rows: 40 });
    expect(gridSize(200, 100, 20)).toEqual({ cols: 20, rows: 10 });
  });
});

describe('pictureToLevel', () => {
  test('a black square on white becomes a block of cells', () => {
    const { mask, palette, cells } = pictureToLevel(square, { cols: 10, colors: 4, invert: false });
    expect(mask).toHaveLength(10);
    expect(mask.every((r) => r.length === 10)).toBe(true);
    expect(cells).toBe(36);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) expect(mask[y][x] !== '.', `${x},${y}`).toBe(x >= 2 && x <= 7 && y >= 2 && y <= 7);
    }
    expect(palette).toEqual(['#000000']);
    expect(mask.join('')).toMatch(/^[.0]+$/);
  });

  test('invert swaps shape and background', () => {
    const { cells, mask } = pictureToLevel(square, { cols: 10, colors: 4, invert: true });
    expect(cells).toBe(64);
    expect(mask[0][0]).not.toBe('.');
    expect(mask[5][5]).toBe('.');
  });

  test('transparency, not brightness, decides the shape of a PNG with alpha', () => {
    const circle = paint(100, 100, (x, y) => ((x - 50) ** 2 + (y - 50) ** 2 <= 30 ** 2 ? WHITE : [0, 0, 0, 0]));
    const { mask, cells } = pictureToLevel(circle, { cols: 10, colors: 4, invert: false });
    expect(mask[5][5]).not.toBe('.');
    expect(mask[0][0]).toBe('.');
    expect(cells).toBeGreaterThan(20);
  });

  test('two colours become two regions with a palette of two', () => {
    const twoTone = paint(100, 100, (x, y) => (inBox(x, y, 10, 20, 49, 79) ? RED : inBox(x, y, 50, 20, 89, 79) ? BLUE : WHITE));
    const { mask, palette } = pictureToLevel(twoTone, { cols: 10, colors: 4, invert: false });
    expect(palette).toHaveLength(2);
    expect(palette.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    const left = new Set([1, 2, 3, 4].flatMap((x) => [2, 3, 4, 5, 6, 7].map((y) => mask[y][x])));
    const right = new Set([5, 6, 7, 8].flatMap((x) => [2, 3, 4, 5, 6, 7].map((y) => mask[y][x])));
    expect(left.size).toBe(1);
    expect(right.size).toBe(1);
    expect([...left][0]).not.toBe([...right][0]);
    expect(palette[Number([...left][0])]).toBe('#dc1e1e');
  });

  test('specks smaller than 3 cells are removed and pinholes filled', () => {
    const speckled = paint(100, 100, (x, y) =>
      inBox(x, y, 0, 90, 9, 99) || (inBox(x, y, 20, 20, 79, 79) && !inBox(x, y, 50, 50, 59, 59)) ? BLACK : WHITE,
    );
    const { mask, cells } = pictureToLevel(speckled, { cols: 10, colors: 4, invert: false });
    expect(mask[9][0]).toBe('.');
    expect(mask[5][5]).not.toBe('.');
    expect(cells).toBe(36);
  });

  test('a plain picture has no shape', () => {
    const grey = paint(60, 60, () => [128, 128, 128, 255]);
    expect(pictureToLevel(grey, { cols: 12, colors: 4, invert: false }).cells).toBe(0);
    expect(filled(pictureToLevel(grey, { cols: 12, colors: 4, invert: true }).mask)).toEqual([]);
  });

  test('is deterministic', () => {
    const noisy = paint(80, 80, (x, y) => [(x * 37 + y * 11) % 256, (x * 7) % 256, (y * 13) % 256, 255]);
    const opts = { cols: 16, colors: 5, invert: false };
    expect(pictureToLevel(noisy, opts)).toEqual(pictureToLevel(noisy, opts));
  });
});
