import { describe, expect, test } from 'vitest';
import { generate } from './generate';
import { LEVELS } from './levels';
import { checkBoard } from './test-helpers';

test('there are 22 levels with unique names', () => {
  expect(LEVELS).toHaveLength(22);
  expect(new Set(LEVELS.map((l) => l.name)).size).toBe(22);
});

describe.each(LEVELS)('$name', ({ mask, seed }) => {
  test('mask is rectangular with at least 40 cells', () => {
    expect(new Set(mask.map((r) => r.length)).size).toBe(1);
    expect(mask.join('').replace(/\./g, '').length).toBeGreaterThanOrEqual(40);
    expect(mask.join('')).toMatch(/^[#.0-5]+$/);
  });

  test('generates a solvable board covering at least 95% of the shape', () => {
    expect(checkBoard(mask, generate(mask, seed)).coverage).toBeGreaterThanOrEqual(0.95);
  });
});

test('the ring keeps its hole empty', () => {
  const ring = LEVELS.find((l) => l.name === 'Ring')!;
  const b = generate(ring.mask, ring.seed);
  const used = new Set(b.arrows.flatMap((a) => a.cells.map((c) => `${c.x},${c.y}`)));
  ring.mask.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') expect(used.has(`${x},${y}`)).toBe(false);
    }),
  );
});

test('built-in boards are stable', () => {
  for (const { name, mask, seed } of LEVELS) {
    const lines = generate(mask, seed).arrows.map((a) => `${a.id} ${a.dir} ${a.cells.map((c) => `${c.x},${c.y}`).join(' ')}`);
    expect(lines.join('\n')).toMatchSnapshot(name);
  }
});
