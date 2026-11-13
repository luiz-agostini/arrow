import { exitRay, STEP, type Arrow, type Board, type Cell, type Dir } from './model';
import { mulberry32, shuffle } from './rng';

export const MAX_LEN = 8;
const DIRS: Dir[] = ['U', 'D', 'L', 'R'];

const key = (c: Cell) => `${c.x},${c.y}`;

/** BFS distance from each mask cell to the nearest empty or out-of-bounds cell. */
function depths(mask: string[], width: number, height: number): Map<string, number> {
  const depth = new Map<string, number>();
  const queue: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y][x] !== '#') continue;
      const edge = DIRS.some((d) => mask[y + STEP[d].y]?.[x + STEP[d].x] !== '#');
      if (edge) {
        depth.set(key({ x, y }), 0);
        queue.push({ x, y });
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    for (const d of DIRS) {
      const n = { x: c.x + STEP[d].x, y: c.y + STEP[d].y };
      if (mask[n.y]?.[n.x] === '#' && !depth.has(key(n))) {
        depth.set(key(n), depth.get(key(c))! + 1);
        queue.push(n);
      }
    }
  }
  return depth;
}

/**
 * Builds arrows in reverse removal order: each new arrow is removed before all
 * placed ones, so its exit ray only has to avoid cells already placed. Heads are
 * taken from the deepest cells outward, which keeps outward rays clear.
 */
export function generate(mask: string[], seed: number): Board {
  const rand = mulberry32(seed);
  const height = mask.length;
  const width = mask[0]?.length ?? 0;
  const size = { width, height };
  const depth = depths(mask, width, height);
  const free = (c: Cell) => mask[c.y]?.[c.x] === '#' && !placed.has(key(c));
  const placed = new Set<string>();
  const arrows: Arrow[] = [];

  const cells = shuffle([...depth.keys()], rand)
    .map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    })
    .sort((a, b) => depth.get(key(b))! - depth.get(key(a))!);

  // The deepest uncovered cell becomes the neck; the head sits one step past it.
  // A length-1 arrow at the cell itself is the fallback.
  for (const c of cells) {
    if (placed.has(key(c))) continue;
    let best: Arrow | null = null;
    const candidates = [
      ...shuffle(DIRS, rand).map((dir) => ({ h: { x: c.x + STEP[dir].x, y: c.y + STEP[dir].y }, dir })),
      ...shuffle(DIRS, rand).map((dir) => ({ h: c, dir })),
    ];
    for (const { h, dir } of candidates) {
      if (!free(h)) continue;
      const ray = exitRay({ ...size, arrows: [] }, { id: 0, cells: [h], dir });
      if (ray.some((r) => placed.has(key(r)))) continue;
      const body = growBody(h, dir, new Set(ray.map(key)), free, rand);
      if (!best || body.length > best.cells.length) best = { id: arrows.length + 1, cells: body, dir };
      if (body.length >= 2) break;
    }
    if (!best) continue;
    for (const c of best.cells) placed.add(key(c));
    arrows.push(best);
  }
  return { width, height, arrows: absorbSingles(size, arrows) };
}

/**
 * Turns a length-1 arrow into the new tail of a neighbouring arrow. The merged
 * board stays solvable when no arrow placed between the two (in either order),
 * nor the host itself, has the cell in its exit ray.
 */
function absorbSingles(size: { width: number; height: number }, arrows: Arrow[]): Arrow[] {
  const out = arrows.map((a) => ({ ...a, cells: [...a.cells] }));
  const gone = new Set<number>();
  const rays = out.map((a) => new Set(exitRay({ ...size, arrows: [] }, a).map(key)));
  out.forEach((single, i) => {
    if (single.cells.length !== 1) return;
    const s = single.cells[0];
    const j = out.findIndex(
      (a, j) =>
        j !== i &&
        !gone.has(j) &&
        a.cells.length < MAX_LEN &&
        Math.abs(a.cells[0].x - s.x) + Math.abs(a.cells[0].y - s.y) === 1 &&
        (a.cells.length > 1 || (a.cells[0].x - STEP[a.dir].x === s.x && a.cells[0].y - STEP[a.dir].y === s.y)) &&
        !rays[j].has(key(s)) &&
        out.every((_, k) => gone.has(k) || k <= Math.min(i, j) || k >= Math.max(i, j) || !rays[k].has(key(s))),
    );
    if (j < 0) return;
    out[j].cells.unshift(s);
    gone.add(i);
  });
  return out.filter((_, i) => !gone.has(i)).map((a, i) => ({ ...a, id: i + 1 }));
}

/** Random walk backwards from the head; returns cells tail-to-head. */
function growBody(h: Cell, dir: Dir, ray: Set<string>, free: (c: Cell) => boolean, rand: () => number): Cell[] {
  const target = 2 + Math.floor(rand() * (MAX_LEN - 1));
  const body = [h];
  const used = new Set([key(h)]);
  const ok = (c: Cell) => free(c) && !ray.has(key(c)) && !used.has(key(c));
  let next: Cell | undefined = { x: h.x - STEP[dir].x, y: h.y - STEP[dir].y };
  while (next && ok(next) && body.length < target) {
    body.unshift(next);
    used.add(key(next));
    const tail: Cell = next;
    next = shuffle(DIRS, rand)
      .map((d) => ({ x: tail.x + STEP[d].x, y: tail.y + STEP[d].y }))
      .find(ok);
  }
  return body;
}
