import { exitRay, type Arrow, type Board } from './model';

/** Cell index → id of the arrow occupying it, built once per board state. */
function owners(b: Board): Map<number, number> {
  const owner = new Map<number, number>();
  for (const a of b.arrows) for (const c of a.cells) owner.set(c.y * b.width + c.x, a.id);
  return owner;
}

/** First arrow (possibly itself) in this arrow's exit ray, or null if it can leave. */
function firstBlocker(b: Board, owner: Map<number, number>, a: Arrow): number | null {
  for (const c of exitRay(b, a)) {
    const hit = owner.get(c.y * b.width + c.x);
    if (hit !== undefined) return hit;
  }
  return null;
}

export function freeArrows(b: Board): number[] {
  const owner = owners(b);
  return b.arrows.filter((a) => firstBlocker(b, owner, a) === null).map((a) => a.id);
}

/**
 * Greedy is complete: removing a free arrow never blocks another one. Each blocked
 * arrow waits on its first blocker and is only rechecked once that blocker leaves.
 */
export function solve(b: Board): number[] | null {
  const owner = owners(b);
  const byId = new Map(b.arrows.map((a) => [a.id, a]));
  const waiting = new Map<number, number[]>();
  const queue: number[] = [];
  const place = (a: Arrow) => {
    const blocker = firstBlocker(b, owner, a);
    if (blocker === null) queue.push(a.id);
    else waiting.set(blocker, [...(waiting.get(blocker) ?? []), a.id]);
  };
  b.arrows.forEach(place);
  const order: number[] = [];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    order.push(id);
    for (const c of byId.get(id)!.cells) owner.delete(c.y * b.width + c.x);
    for (const w of waiting.get(id) ?? []) place(byId.get(w)!);
    waiting.delete(id);
  }
  return order.length === b.arrows.length ? order : null;
}
