import { DARK_BG, fitContrast, LIGHT_BG } from './colors';
import { exitRay, head, STEP, type Arrow, type Board, type Cell } from './model';

export const CELL = 24;
export const SPEED = 30; // cells per second
export const FLASH_MS = 400;

const NS = 'http://www.w3.org/2000/svg';

export type BoardView = {
  slideOut(id: number): Promise<void>;
  flashBlocked(id: number, blocker: number): void;
  highlight(id: number): void;
  zoom(factor: number): void;
  fit(): void;
};

export type BoardOptions = {
  palette?: string[];
  background?: 'light' | 'dark';
  /** Maps client coordinates to board cells; for tests only. */
  toCell?: (clientX: number, clientY: number) => { x: number; y: number };
};

type Drawn = { group: SVGGElement; body: SVGPathElement; head: SVGPolygonElement; travel: number };

const center = (c: Cell): Cell => ({ x: (c.x + 0.5) * CELL, y: (c.y + 0.5) * CELL });

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

const toD = (pts: Cell[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');

function drawArrow(b: Board, a: Arrow): Drawn {
  const step = STEP[a.dir];
  const h = center(head(a));
  // A single cell gets a short stub behind its head so it reads as an arrow.
  const pts = a.cells.length > 1 ? a.cells.map(center) : [{ x: h.x - step.x * CELL * 0.35, y: h.y - step.y * CELL * 0.35 }, h];
  const visible = a.cells.length > 1 ? (a.cells.length - 1) * CELL : CELL * 0.35;
  // Far enough for the tail to clear the one-cell margin around the board.
  const travel = exitRay(b, a).length + a.cells.length + 1;
  const exit = { x: h.x + step.x * travel * CELL, y: h.y + step.y * travel * CELL };
  const total = visible + travel * CELL;

  const group = el('g', { class: 'arrow', 'data-id': a.id });
  const body = el('path', {
    class: 'body',
    'data-id': a.id,
    d: toD([...pts, exit]),
    'stroke-dasharray': `${visible} ${total}`,
    'stroke-dashoffset': 0,
  });
  const perp = { x: -step.y, y: step.x };
  const tip = { x: h.x + step.x * CELL * 0.45, y: h.y + step.y * CELL * 0.45 };
  const base = { x: h.x - step.x * CELL * 0.05, y: h.y - step.y * CELL * 0.05 };
  const w = CELL * 0.28;
  const headEl = el('polygon', {
    class: 'head',
    'data-id': a.id,
    points: [tip, { x: base.x + perp.x * w, y: base.y + perp.y * w }, { x: base.x - perp.x * w, y: base.y - perp.y * w }]
      .map((p) => `${p.x},${p.y}`)
      .join(' '),
  });
  const hit = el('path', { class: 'hit', 'data-id': a.id, d: toD([...pts, tip]), 'stroke-width': CELL * 0.8 });
  group.append(body, headEl, hit);
  return { group, body, head: headEl, travel };
}

export function mountBoard(svg: SVGSVGElement, b: Board, onTap: (id: number) => void, opts: BoardOptions = {}): BoardView {
  const { palette } = opts;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `${-CELL} ${-CELL} ${(b.width + 2) * CELL} ${(b.height + 2) * CELL}`);
  const drawn = new Map<number, Drawn>();
  const arrows = new Map(b.arrows.map((a) => [a.id, a]));
  for (const a of b.arrows) {
    const d = drawArrow(b, a);
    const colour = palette?.[a.region ?? 0];
    if (colour) {
      d.group.style.setProperty('--arrow-light', fitContrast(colour, LIGHT_BG));
      d.group.style.setProperty('--arrow-dark', fitContrast(colour, DARK_BG));
    }
    drawn.set(a.id, d);
    svg.append(d.group);
  }
  svg.onclick = (e) => {
    const id = (e.target as Element).closest('[data-id]')?.getAttribute('data-id');
    if (id) onTap(Number(id));
  };

  return {
    slideOut(id) {
      const d = drawn.get(id);
      const a = arrows.get(id);
      if (!d || !a) return Promise.resolve();
      d.group.classList.add('leaving');
      d.group.classList.remove('hint');
      const step = STEP[a.dir];
      const duration = (d.travel / SPEED) * 1000;
      const start = performance.now();
      return new Promise((resolve) => {
        const frame = () => {
          const t = Math.min(1, (performance.now() - start) / duration);
          const dist = t * d.travel * CELL;
          d.body.setAttribute('stroke-dashoffset', String(-dist));
          d.head.setAttribute('transform', `translate(${step.x * dist} ${step.y * dist})`);
          if (t < 1) {
            requestAnimationFrame(frame);
          } else {
            d.group.remove();
            drawn.delete(id);
            resolve();
          }
        };
        requestAnimationFrame(frame);
      });
    },
    flashBlocked(id, blocker) {
      const a = drawn.get(id)?.group;
      const b = drawn.get(blocker)?.group;
      a?.classList.add('blocked');
      if (blocker !== id) b?.classList.add('blocker');
      setTimeout(() => {
        a?.classList.remove('blocked');
        b?.classList.remove('blocker');
      }, FLASH_MS);
    },
    highlight(id) {
      for (const d of drawn.values()) d.group.classList.remove('hint');
      drawn.get(id)?.group.classList.add('hint');
    },
    zoom() {},
    fit() {},
  };
}
