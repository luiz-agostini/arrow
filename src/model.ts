export type Dir = 'U' | 'D' | 'L' | 'R';
export type Cell = { x: number; y: number };
export type Arrow = { id: number; cells: Cell[]; dir: Dir; region?: number };
export type Board = { width: number; height: number; arrows: Arrow[] };

export const STEP: Record<Dir, Cell> = {
  U: { x: 0, y: -1 },
  D: { x: 0, y: 1 },
  L: { x: -1, y: 0 },
  R: { x: 1, y: 0 },
};

export function head(a: Arrow): Cell {
  return a.cells[a.cells.length - 1];
}

export function inBounds(b: { width: number; height: number }, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < b.width && c.y < b.height;
}

/** Cells from just past the head to the board edge, in travel order. */
export function exitRay(b: Board, a: Arrow): Cell[] {
  const { x: dx, y: dy } = STEP[a.dir];
  const ray: Cell[] = [];
  for (let c = { x: head(a).x + dx, y: head(a).y + dy }; inBounds(b, c); c = { x: c.x + dx, y: c.y + dy }) {
    ray.push(c);
  }
  return ray;
}

/** Id of the first arrow (possibly itself) in this arrow's exit ray, or null if it can leave. */
export function blockerOf(b: Board, id: number): number | null {
  const arrow = b.arrows.find((a) => a.id === id);
  if (!arrow) return null;
  const owner = new Map<string, number>();
  for (const a of b.arrows) for (const c of a.cells) owner.set(`${c.x},${c.y}`, a.id);
  for (const c of exitRay(b, arrow)) {
    const hit = owner.get(`${c.x},${c.y}`);
    if (hit !== undefined) return hit;
  }
  return null;
}

export function removeArrow(b: Board, id: number): Board {
  return { ...b, arrows: b.arrows.filter((a) => a.id !== id) };
}

/** Region index of a mask cell: `#` is region 0, `0`–`9` are themselves, anything else is empty. */
export function regionAt(mask: string[], c: Cell): number | null {
  const ch = mask[c.y]?.[c.x];
  if (ch === '#') return 0;
  return ch !== undefined && ch >= '0' && ch <= '9' ? Number(ch) : null;
}
