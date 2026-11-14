import { describe, expect, test } from 'vitest';
import { LEVELS } from '../levels';
import { buildEsteiraLevel, dealShooters, downsample, esteiraLevels, greedyWins, type EsteiraLevel, type Shooter } from './level';

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

  test('exactly half empty keeps the colour, and non-integer scaling tiles the picture', () => {
    expect(downsample(['0.', '.0'], 1, 1).cells).toEqual([0]);
    // 5×3 into 2×1: the first block covers columns 0–1, the second columns 2–4.
    expect(downsample(['01111', '0.111', '00111'], 2, 1)).toEqual({ width: 2, height: 1, cells: [0, 1] });
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

  test('shooters carry 10 or 20 ammo, plus at most one smaller remainder per colour', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const shooters = dealShooters(cells, seed).flat();
      expect(shooters.every((s) => s.ammo === 10 || s.ammo === 20 || s.ammo < 10)).toBe(true);
      for (const color of [0, 1, 2]) expect(shooters.filter((s) => s.color === color && s.ammo < 10).length).toBeLessThanOrEqual(1);
    }
    // 15 blocks: a 10 and a 5, never a single 15.
    expect(dealShooters(Array(15).fill(0), 1).flat().map((s) => s.ammo).sort((a, b) => a - b)).toEqual([5, 10]);
  });

  test('is deterministic per seed', () => {
    expect(dealShooters(cells, 3)).toEqual(dealShooters(cells, 3));
    expect(dealShooters(cells, 3)).not.toEqual(dealShooters(cells, 4));
  });
});

describe('greedyWins', () => {
  // A 3×3 frame of colour 0 around a hidden colour-1 centre.
  const frame = [0, 0, 0, 0, 1, 0, 0, 0, 0];
  const make = (column: Shooter[]): EsteiraLevel => ({
    name: 'frame',
    width: 3,
    height: 3,
    cells: frame,
    palette: ['#ff0000', '#0000ff'],
    columns: [column, [], [], [], []],
  });

  test('wins when each front shooter has an exposed block of its colour', () => {
    expect(greedyWins(make([{ id: 1, color: 0, ammo: 8 }, { id: 2, color: 1, ammo: 1 }]))).toBe(true);
  });

  test('gives up when no shooter it can launch has an exposed block', () => {
    expect(greedyWins(make([{ id: 2, color: 1, ammo: 1 }, { id: 1, color: 0, ammo: 8 }]))).toBe(false);
  });
});

describe('esteiraLevels', () => {
  const photos = LEVELS.filter((l) => l.palette);
  const levels = esteiraLevels();

  test('one level per photo level, with the same names, at most 24×32', () => {
    expect(levels.map((l) => l.name)).toEqual(photos.map((l) => l.name));
    expect(levels.every((l) => l.width <= 24 && l.height <= 32)).toBe(true);
    expect(levels.every((l, i) => l.palette === photos[i].palette)).toBe(true);
  });

  test.each(levels.map((l) => [l.name, l] as const))('%s can be won', (_, level) => {
    expect(greedyWins(level)).toBe(true);
  });

  test('builds every level in under 200 ms', () => {
    const times = photos.map((photo) => {
      const start = performance.now();
      buildEsteiraLevel(photo);
      return performance.now() - start;
    });
    expect(Math.max(...times)).toBeLessThan(200);
  });
});
