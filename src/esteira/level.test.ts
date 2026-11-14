import { describe, expect, test } from 'vitest';
import { dealShooters, downsample } from './level';

describe('downsample', () => {
  test('fits the picture inside 24×32 blocks', () => {
    const mask = Array.from({ length: 64 }, () => '0'.repeat(48));
    const { width, height, cells } = downsample(mask);
    expect([width, height]).toEqual([24, 32]);
    expect(cells.every((c) => c === 0)).toBe(true);
  });

  test('a block takes the most common colour, and is empty when more than half its cells are', () => {
    const quarterEmpty = ['0.0.', '0000', '0.0.', '0000'];
    expect(downsample(quarterEmpty, 2, 2)).toEqual({ width: 2, height: 2, cells: [0, 0, 0, 0] });
    const mostlyEmpty = ['0...', '....', '...0', '....'];
    expect(downsample(mostlyEmpty, 2, 2).cells).toEqual([null, null, null, null]);
    const mixed = ['0112', '1122'];
    expect(downsample(mixed, 2, 1).cells).toEqual([1, 2]);
  });

  test('keeps a small picture as it is', () => {
    expect(downsample(['01', '2.'])).toEqual({ width: 2, height: 2, cells: [0, 1, 2, null] });
  });
});

describe('dealShooters', () => {
  const cells = [...Array(37).fill(0), ...Array(12).fill(1), ...Array(5).fill(2), null, null];

  test('ammo per colour matches its blocks, 1–20 per shooter, dealt into 5 even columns', () => {
    const columns = dealShooters(cells, 7);
    expect(columns).toHaveLength(5);
    const shooters = columns.flat();
    for (const color of [0, 1, 2]) {
      expect(shooters.filter((s) => s.color === color).reduce((n, s) => n + s.ammo, 0)).toBe(cells.filter((c) => c === color).length);
    }
    expect(shooters.every((s) => s.ammo >= 1 && s.ammo <= 20)).toBe(true);
    const lengths = columns.map((c) => c.length);
    expect(Math.max(...lengths) - Math.min(...lengths)).toBeLessThanOrEqual(1);
    expect(new Set(shooters.map((s) => s.id)).size).toBe(shooters.length);
  });

  test('is deterministic per seed', () => {
    expect(dealShooters(cells, 3)).toEqual(dealShooters(cells, 3));
    expect(dealShooters(cells, 3)).not.toEqual(dealShooters(cells, 4));
  });
});
