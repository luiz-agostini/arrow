import { describe, expect, test } from 'vitest';
import type { EsteiraLevel, Shooter } from './level';
import { launch, lineAt, newGame, tick, type State } from './sim';

const shooter = (id: number, color: number, ammo: number): Shooter => ({ id, color, ammo });
const level = (cells: (number | null)[], columns: Shooter[][], width = 2, height = 2): EsteiraLevel => ({
  name: 'test',
  width,
  height,
  cells,
  palette: ['#ff0000', '#0000ff'],
  columns: [...columns, ...Array.from({ length: 5 - columns.length }, () => [])],
});
const lap = (s: State, laps = 1) => {
  for (let i = 0; i < laps * 2 * (s.level.width + s.level.height); i++) s = tick(s);
  return s;
};

describe('lineAt', () => {
  test('runs clockwise from the top-left, facing into the picture', () => {
    expect(lineAt(2, 2, 0)).toEqual({ x: 0, y: 0, dx: 0, dy: 1 });
    expect(lineAt(2, 2, 1)).toEqual({ x: 1, y: 0, dx: 0, dy: 1 });
    expect(lineAt(2, 2, 2)).toEqual({ x: 1, y: 0, dx: -1, dy: 0 });
    expect(lineAt(2, 2, 3)).toEqual({ x: 1, y: 1, dx: -1, dy: 0 });
    expect(lineAt(2, 2, 4)).toEqual({ x: 1, y: 1, dx: 0, dy: -1 });
    expect(lineAt(2, 2, 5)).toEqual({ x: 0, y: 1, dx: 0, dy: -1 });
    expect(lineAt(2, 2, 6)).toEqual({ x: 0, y: 1, dx: 1, dy: 0 });
    expect(lineAt(2, 2, 7)).toEqual({ x: 0, y: 0, dx: 1, dy: 0 });
  });
});

describe('launch', () => {
  test('moves the front shooter of a column onto the belt', () => {
    const s = launch(newGame(level([0, 1, 0, 0], [[shooter(1, 0, 3), shooter(2, 1, 1)]])), { column: 0 });
    expect(s.belt).toEqual([{ shooter: shooter(1, 0, 3), step: 0 }]);
    expect(s.columns[0]).toEqual([shooter(2, 1, 1)]);
  });

  test('the belt holds at most 5 shooters; a sixth launch changes nothing', () => {
    let s = newGame(level([0, 0, 0, 0], [[1, 2, 3].map((i) => shooter(i, 0, 1)), [4, 5, 6].map((i) => shooter(i, 0, 1))]));
    for (const column of [0, 0, 0, 1, 1]) s = launch(s, { column });
    expect(s.belt).toHaveLength(5);
    expect(launch(s, { column: 1 })).toBe(s);
  });

  test('an empty column or slot changes nothing', () => {
    const s = newGame(level([0, 0, 0, 0], [[shooter(1, 0, 1)]]));
    expect(launch(s, { column: 3 })).toBe(s);
    expect(launch(s, { slot: 0 })).toBe(s);
  });
});

describe('tick', () => {
  test('a shooter removes the exposed blocks of its colour and cannot shoot through others', () => {
    let s = launch(newGame(level([0, 1, 0, 0], [[shooter(1, 0, 3)]])), { column: 0 });
    s = lap(s);
    expect(s.cells).toEqual([null, 1, null, null]);
    expect(s.belt).toEqual([]);
    expect(s.slots).toEqual([null, null, null, null, null]);
  });

  test('a shooter never shoots through a block of another colour', () => {
    // A 3×3 frame of colour 0 hides a colour-1 centre on every line.
    let s = launch(newGame(level([0, 0, 0, 0, 1, 0, 0, 0, 0], [[shooter(1, 1, 1)]], 3, 3)), { column: 0 });
    s = lap(s);
    expect(s.cells[4]).toBe(1);
    expect(s.slots[0]).toEqual(shooter(1, 1, 1));
  });

  test('a shooter with ammo left after a lap parks in the first free slot', () => {
    let s = launch(newGame(level([0, 1, 0, 0], [[shooter(1, 0, 5)]])), { column: 0 });
    s = lap(s);
    expect(s.slots[0]).toEqual(shooter(1, 0, 2));
    expect(s.status).toBe('playing');
    const again = launch(s, { slot: 0 });
    expect(again.slots[0]).toBeNull();
    expect(again.belt[0].shooter.id).toBe(1);
  });

  test('clearing every block wins at once', () => {
    let s = newGame(level([0, 1, 0, 0], [[shooter(1, 0, 3)], [shooter(2, 1, 1)]]));
    s = launch(launch(s, { column: 0 }), { column: 1 });
    for (let i = 0; i < 20 && s.status === 'playing'; i++) s = tick(s);
    expect(s.status).toBe('won');
    expect(s.cells.every((c) => c === null)).toBe(true);
  });

  test('a shooter returning with ammo when all 5 slots are full loses', () => {
    let s = newGame(level([0, 1, 0, 0], [[shooter(9, 1, 5)]]));
    s = { ...s, slots: [1, 2, 3, 4, 5].map((i) => shooter(i, 0, 1)) };
    s = lap(launch(s, { column: 0 }));
    expect(s.status).toBe('lost');
  });

  test('a finished game ignores launches and ticks', () => {
    const won: State = { ...newGame(level([null, null, null, null], [[shooter(1, 0, 1)]])), status: 'won' };
    expect(launch(won, { column: 0 })).toBe(won);
    expect(tick(won)).toBe(won);
  });
});
