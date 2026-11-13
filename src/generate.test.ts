import { describe, expect, test } from 'vitest';
import { generate } from './generate';
import { mulberry32 } from './rng';
import { checkBoard } from './test-helpers';

const square = Array.from({ length: 12 }, () => '#'.repeat(12));

describe('mulberry32', () => {
  test('is deterministic and in [0, 1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generate', () => {
  test.each(Array.from({ length: 20 }, (_, i) => i + 1))('seed %i gives a valid, solvable, dense board', (seed) => {
    const b = generate(square, seed);
    expect(b.width).toBe(12);
    expect(b.height).toBe(12);
    const { coverage } = checkBoard(square, b);
    expect(coverage).toBeGreaterThanOrEqual(0.95);
    const long = b.arrows.filter((a) => a.cells.length >= 2).length;
    expect(long / b.arrows.length).toBeGreaterThanOrEqual(0.7);
  });

  test('is deterministic for a mask and seed', () => {
    expect(generate(square, 7)).toEqual(generate(square, 7));
  });

  test('different seeds give different boards', () => {
    expect(generate(square, 1)).not.toEqual(generate(square, 2));
  });

  test('a single cell gives one arrow of length 1', () => {
    const b = generate(['...', '.#.', '...'], 1);
    expect(b.arrows).toHaveLength(1);
    expect(b.arrows[0].cells).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('colour regions', () => {
  const halves = Array.from({ length: 12 }, () => '000000111111');
  const stripes = Array.from({ length: 12 }, (_, y) => String(y % 2).repeat(12));

  test.each(Array.from({ length: 10 }, (_, i) => i + 1))('seed %i keeps arrows inside one of two halves', (seed) => {
    expect(checkBoard(halves, generate(halves, seed)).coverage).toBeGreaterThanOrEqual(0.9);
  });

  test.each(Array.from({ length: 10 }, (_, i) => i + 1))('seed %i keeps one-cell-wide stripes apart', (seed) => {
    const b = generate(stripes, seed);
    checkBoard(stripes, b);
    for (const a of b.arrows) expect(new Set(a.cells.map((c) => c.y)).size).toBe(1);
  });
});
