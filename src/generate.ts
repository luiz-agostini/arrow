import { exitRay, regionAt, STEP, type Arrow, type Board, type Cell, type Dir } from './model';
import { mulberry32, shuffle } from './rng';

export const MAX_LEN = 12;
const DIRS: Dir[] = ['U', 'D', 'L', 'R'];

const key = (c: Cell) => `${c.x},${c.y}`;

/** Empty cells connected to the board border; enclosed holes are excluded. */
function exterior(mask: string[], width: number, height: number): Set<string> {
  const out = new Set<string>();
  const queue: Cell[] = [];
  const visit = (c: Cell) => {
    if (c.x < 0 || c.y < 0 || c.x >= width || c.y >= height) return;
    if (regionAt(mask, c) !== null || out.has(key(c))) return;
    out.add(key(c));
    queue.push(c);
  };
  for (let x = 0; x < width; x++) [0, height - 1].forEach((y) => visit({ x, y }));
  for (let y = 0; y < height; y++) [0, width - 1].forEach((x) => visit({ x, y }));
  for (let i = 0; i < queue.length; i++) for (const d of DIRS) visit({ x: queue[i].x + STEP[d].x, y: queue[i].y + STEP[d].y });
  return out;
}

/** BFS distance from each mask cell to the nearest exterior or out-of-bounds cell. */
function depths(mask: string[], width: number, height: number): Map<string, number> {
  const outside = exterior(mask, width, height);
  const depth = new Map<string, number>();
  const queue: Cell[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (regionAt(mask, { x, y }) === null) continue;
      const edge = DIRS.some((d) => {
        const n = { x: x + STEP[d].x, y: y + STEP[d].y };
        return n.x < 0 || n.y < 0 || n.x >= width || n.y >= height || outside.has(key(n));
      });
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
      if (regionAt(mask, n) !== null && !depth.has(key(n))) {
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
  const free = (c: Cell) => regionAt(mask, c) !== null && !placed.has(key(c));
  const placed = new Set<string>();
  const arrows: Arrow[] = [];

  const cells = shuffle([...depth.keys()], rand)
    .map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    })
    .sort((a, b) => depth.get(key(b))! - depth.get(key(a))!);

  // The deepest uncovered cell becomes the neck; the head sits one step past it.
  // A length-1 arrow at the cell itself is the fallback. Bodies stay in c's region.
  for (const c of cells) {
    if (placed.has(key(c))) continue;
    const region = regionAt(mask, c)!;
    const freeHere = (x: Cell) => free(x) && regionAt(mask, x) === region;
    let best: Arrow | null = null;
    const candidates = [
      ...shuffle(DIRS, rand).map((dir) => ({ h: { x: c.x + STEP[dir].x, y: c.y + STEP[dir].y }, dir })),
      ...shuffle(DIRS, rand).map((dir) => ({ h: c, dir })),
    ];
    for (const { h, dir } of candidates) {
      if (!freeHere(h)) continue;
      const ray = exitRay({ ...size, arrows: [] }, { id: 0, cells: [h], dir });
      if (ray.some((r) => placed.has(key(r)))) continue;
      const body = growBody(h, dir, new Set(ray.map(key)), freeHere, rand);
      if (!best || body.length > best.cells.length) best = { id: arrows.length + 1, cells: body, dir, region };
      if (body.length >= 2) break;
    }
    if (!best) continue;
    for (const c of best.cells) placed.add(key(c));
    arrows.push(best);
  }
  fillGaps(mask, size, arrows, placed);
  return { width, height, arrows: absorbSingles(size, arrows) };
}

/**
 * Attaches uncovered cells to the tail of a neighbouring arrow in the same region,
 * or failing that inserts them as single-cell arrows (merged later by absorbSingles).
 * That is as if the cell had been part of the arrow when it was placed, which stays
 * solvable when neither the arrow nor any arrow placed after it has the cell in its ray.
 * Repeats until nothing changes, so chains of gaps fill from their ends.
 */
function fillGaps(mask: string[], size: { width: number; height: number }, arrows: Arrow[], placed: Set<string>): void {
  const rays = arrows.map((a) => new Set(exitRay({ ...size, arrows: [] }, a).map(key)));
  for (let changed = true; changed; ) {
    changed = false;
    for (let y = 0; y < size.height; y++) {
      for (let x = 0; x < size.width; x++) {
        const c = { x, y };
        const region = regionAt(mask, c);
        if (region === null || placed.has(key(c))) continue;
        const host = arrows.findIndex(
          (a, j) =>
            a.region === region &&
            a.cells.length < MAX_LEN &&
            Math.abs(a.cells[0].x - x) + Math.abs(a.cells[0].y - y) === 1 &&
            (a.cells.length > 1 || (a.cells[0].x - STEP[a.dir].x === x && a.cells[0].y - STEP[a.dir].y === y)) &&
            rays.slice(j).every((r) => !r.has(key(c))),
        );
        if (host >= 0) {
          arrows[host].cells.unshift(c);
        } else {
          // Otherwise insert it as a single at a point in the placement order that is
          // after every arrow whose ray crosses it and before any arrow in its own ray.
          const after = rays.reduce((last, r, j) => (r.has(key(c)) ? j + 1 : last), 0);
          const fit = DIRS.map((dir) => {
            const ray = new Set(exitRay({ ...size, arrows: [] }, { id: 0, cells: [c], dir }).map(key));
            const firstHit = arrows.findIndex((a) => a.cells.some((p) => ray.has(key(p))));
            return { dir, ray, ok: firstHit < 0 || after <= firstHit };
          }).find((f) => f.ok);
          if (!fit) continue;
          arrows.splice(after, 0, { id: 0, cells: [c], dir: fit.dir, region });
          rays.splice(after, 0, fit.ray);
        }
        placed.add(key(c));
        changed = true;
      }
    }
  }
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
        a.region === single.region &&
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

/**
 * Walk backwards from the head; returns cells tail-to-head. Each step prefers the
 * neighbour with the fewest free neighbours of its own (ties broken at random), so
 * bodies hug edges and dead ends instead of stranding single cells.
 */
function growBody(h: Cell, dir: Dir, ray: Set<string>, free: (c: Cell) => boolean, rand: () => number): Cell[] {
  // Biased towards long bodies: rand² is usually small.
  const target = MAX_LEN - Math.floor(rand() ** 2 * (MAX_LEN - 1));
  const body = [h];
  const used = new Set([key(h)]);
  const ok = (c: Cell) => free(c) && !ray.has(key(c)) && !used.has(key(c));
  let next: Cell | undefined = { x: h.x - STEP[dir].x, y: h.y - STEP[dir].y };
  while (next && ok(next) && body.length < target) {
    body.unshift(next);
    used.add(key(next));
    const tail: Cell = next;
    const exits = (c: Cell) => DIRS.filter((d) => ok({ x: c.x + STEP[d].x, y: c.y + STEP[d].y })).length;
    next = shuffle(DIRS, rand)
      .map((d) => ({ x: tail.x + STEP[d].x, y: tail.y + STEP[d].y }))
      .filter(ok)
      .sort((p, q) => exits(p) - exits(q))[0];
  }
  return body;
}
