import { expect } from 'vitest';
import { regionAt, type Board } from './model';
import { solve } from './solve';

/** Asserts structural validity and solvability; returns the share of mask cells covered. */
export function checkBoard(mask: string[], b: Board): { coverage: number } {
  const seen = new Set<string>();
  for (const a of b.arrows) {
    a.cells.forEach((c, i) => {
      const key = `${c.x},${c.y}`;
      expect(seen.has(key), `cell ${key} used twice`).toBe(false);
      seen.add(key);
      expect(regionAt(mask, c), `cell ${key} outside the mask`).not.toBeNull();
      expect(regionAt(mask, c), `cell ${key} outside region ${a.region}`).toBe(a.region);
      if (i > 0) {
        const p = a.cells[i - 1];
        expect(Math.abs(p.x - c.x) + Math.abs(p.y - c.y)).toBe(1);
      }
    });
    if (a.cells.length >= 2) {
      const [p, h] = a.cells.slice(-2);
      const dir = h.x > p.x ? 'R' : h.x < p.x ? 'L' : h.y > p.y ? 'D' : 'U';
      expect(a.dir).toBe(dir);
    }
  }
  expect(solve(b)).not.toBeNull();
  const total = mask.flatMap((row, y) => [...row].filter((_, x) => regionAt(mask, { x, y }) !== null)).length;
  return { coverage: seen.size / total };
}
