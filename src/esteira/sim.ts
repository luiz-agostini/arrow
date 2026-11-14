import type { EsteiraLevel, Shooter } from './level';

export const BELT_CAPACITY = 5;
export const SLOTS = 5;

export type State = {
  level: EsteiraLevel;
  cells: (number | null)[];
  columns: Shooter[][];
  slots: (Shooter | null)[];
  belt: { shooter: Shooter; step: number }[];
  status: 'playing' | 'won' | 'lost';
};

/** Steps in one lap of the belt around a `w`×`h` picture. */
export const lapLength = (w: number, h: number) => 2 * (w + h);

/**
 * The first cell a shooter at belt position `step` faces, and the direction into the
 * picture. The belt runs clockwise from the top-left: top, right side, bottom, left side.
 */
export function lineAt(w: number, h: number, step: number): { x: number; y: number; dx: number; dy: number } {
  if (step < w) return { x: step, y: 0, dx: 0, dy: 1 };
  if (step < w + h) return { x: w - 1, y: step - w, dx: -1, dy: 0 };
  if (step < 2 * w + h) return { x: w - 1 - (step - w - h), y: h - 1, dx: 0, dy: -1 };
  return { x: 0, y: h - 1 - (step - 2 * w - h), dx: 1, dy: 0 };
}

export function newGame(level: EsteiraLevel): State {
  return {
    level,
    cells: [...level.cells],
    columns: level.columns.map((c) => [...c]),
    slots: Array(SLOTS).fill(null),
    belt: [],
    status: 'playing',
  };
}

/** Puts the front shooter of a column, or a parked shooter, on the belt if there's room. */
export function launch(s: State, from: { column: number } | { slot: number }): State {
  if (s.status !== 'playing' || s.belt.length >= BELT_CAPACITY) return s;
  if ('column' in from) {
    const [front, ...rest] = s.columns[from.column] ?? [];
    if (!front) return s;
    return { ...s, columns: s.columns.map((c, i) => (i === from.column ? rest : c)), belt: [...s.belt, { shooter: front, step: 0 }] };
  }
  const parked = s.slots[from.slot];
  if (!parked) return s;
  return { ...s, slots: s.slots.map((p, i) => (i === from.slot ? null : p)), belt: [...s.belt, { shooter: parked, step: 0 }] };
}

/** First block along a line, as a cell index, or -1 if the line is empty. */
function firstBlock(s: State, line: ReturnType<typeof lineAt>): number {
  const { width, height } = s.level;
  for (let x = line.x, y = line.y; x >= 0 && y >= 0 && x < width && y < height; x += line.dx, y += line.dy) {
    if (s.cells[y * width + x] !== null) return y * width + x;
  }
  return -1;
}

/**
 * Advances every belt shooter one step. At its position a shooter removes the first
 * block it faces if that block has its colour. After a full lap, a shooter with ammo
 * parks in the first free slot (no free slot loses the game) and an empty one leaves.
 * Clearing the last block wins at once.
 */
export function tick(s: State): State {
  if (s.status !== 'playing') return s;
  const { width, height } = s.level;
  const lap = lapLength(width, height);
  const next: State = { ...s, cells: [...s.cells], slots: [...s.slots], belt: [] };
  for (const { shooter, step } of s.belt) {
    let ammo = shooter.ammo;
    const hit = ammo > 0 ? firstBlock(next, lineAt(width, height, step)) : -1;
    if (hit >= 0 && next.cells[hit] === shooter.color) {
      next.cells[hit] = null;
      ammo--;
    }
    const moved = { shooter: ammo === shooter.ammo ? shooter : { ...shooter, ammo }, step: step + 1 };
    if (next.cells.every((c) => c === null)) return { ...next, belt: [], status: 'won' };
    if (moved.step < lap) {
      next.belt.push(moved);
    } else if (ammo > 0) {
      const free = next.slots.indexOf(null);
      if (free < 0) return { ...next, status: 'lost' };
      next.slots[free] = moved.shooter;
    }
  }
  return next;
}
