import type { Board } from './model';

/** A pick is ambiguous when a rival arrow is within this many cells of the nearest one. */
export const AMBIGUITY = 0.25;

type Point = { x: number; y: number };

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * The arrow whose body (the polyline through its cell centres) passes nearest to `p`,
 * if that is within `radius`. Points and radius are in cells. The pick is ambiguous
 * when any other arrow is within AMBIGUITY of the nearest distance, even just outside
 * the radius.
 */
export function pickArrow(b: Board, p: Point, radius: number): { id: number; ambiguous: boolean } | null {
  const ranked = b.arrows
    .map((a) => {
      const pts = a.cells.map((c) => ({ x: c.x + 0.5, y: c.y + 0.5 }));
      const d = pts.length === 1 ? segmentDistance(p, pts[0], pts[0]) : Math.min(...pts.slice(1).map((q, i) => segmentDistance(p, pts[i], q)));
      return { id: a.id, d };
    })
    .sort((x, y) => x.d - y.d);
  const [best, rival] = ranked;
  if (!best || best.d > radius) return null;
  return { id: best.id, ambiguous: rival !== undefined && rival.d - best.d <= AMBIGUITY };
}
