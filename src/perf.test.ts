import { expect, test } from 'vitest';
import { generate } from './generate';
import { solve } from './solve';

const full = Array.from({ length: 80 }, () => '#'.repeat(64));
const halves = Array.from({ length: 80 }, () => '0'.repeat(32) + '1'.repeat(32));

test.each([
  ['full', full],
  ['two-region', halves],
])('large %s boards generate and solve in under 1500 ms', (_, mask) => {
  const start = performance.now();
  const board = generate(mask, 1);
  expect(solve(board)).not.toBeNull();
  expect(performance.now() - start).toBeLessThan(1500);
});
