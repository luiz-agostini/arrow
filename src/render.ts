import { DARK_BG, fitContrast, LIGHT_BG } from './colors';
import { pickArrow } from './hit';
import { exitRay, head, STEP, type Arrow, type Board, type Cell } from './model';
import { CELL, fit, pan, viewBox, zoomAt, type View } from './viewport';

export { CELL } from './viewport';
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

/** Pick radius in CSS pixels, by pointer kind. */
const TOUCH_RADIUS = 22;
const MOUSE_RADIUS = 6;
/** A tap shorter and stiller than this is "quick". */
const QUICK_MS = 300;
const QUICK_MOVE = 8;
/** A confirming tap must land this close (cells) to the first tap or the aimed arrow. */
const CONFIRM = 0.5;
const MAGNIFIER_SIZE = 120;
const MAGNIFIER_ZOOM = 2.5;
const MAGNIFIER_LIFT = 80;
/** The loupe only appears once a finger has stayed down this long, so quick taps never flash it. */
const MAGNIFIER_DELAY = 350;
/** Wheel zoom factor per unit of deltaY. */
const WHEEL_BASE = 1.0015;

const magnifiers = new WeakMap<SVGSVGElement, SVGSVGElement>();

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
  const w = CELL * 0.32;
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

let boards = 0;

export function mountBoard(svg: SVGSVGElement, b: Board, onTap: (id: number) => void, opts: BoardOptions = {}): BoardView {
  const { palette, background } = opts;
  svg.replaceChildren();
  let view = fit();
  const camera = {
    get: () => view,
    set: (v: View) => {
      view = v;
      svg.setAttribute('viewBox', viewBox(view, b));
    },
  };
  camera.set(view);
  // A level's own background is drawn as a backdrop; arrows are then fitted to it alone.
  if (background) svg.dataset.bg = background;
  else delete svg.dataset.bg;
  const content = el('g', { class: 'board-content', id: `board-${++boards}` });
  if (background) {
    content.append(el('rect', { class: 'backdrop', x: -CELL, y: -CELL, width: (b.width + 2) * CELL, height: (b.height + 2) * CELL }));
  }
  svg.append(content);
  const drawn = new Map<number, Drawn>();
  const arrows = new Map(b.arrows.map((a) => [a.id, a]));
  for (const a of b.arrows) {
    const d = drawArrow(b, a);
    const colour = palette?.[a.region ?? 0];
    if (colour && background) {
      d.group.style.setProperty('--arrow-c', fitContrast(colour, background === 'light' ? LIGHT_BG : DARK_BG));
    } else if (colour) {
      d.group.style.setProperty('--arrow-light', fitContrast(colour, LIGHT_BG));
      d.group.style.setProperty('--arrow-dark', fitContrast(colour, DARK_BG));
    }
    drawn.set(a.id, d);
    content.append(d.group);
  }
  attachInput(svg, b, content.id, drawn, onTap, camera, opts.toCell);

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
    zoom(factor) {
      const span = { w: (b.width + 2) / view.scale, h: (b.height + 2) / view.scale };
      camera.set(zoomAt(view, factor, { x: view.x + span.w / 2, y: view.y + span.h / 2 }, b));
    },
    fit() {
      camera.set(fit());
    },
  };
}

type Point = { x: number; y: number };

/**
 * Pointer input (decision 0007): a press aims at the nearest arrow, moving re-aims,
 * releasing commits, and leaving the board cancels. An ambiguous quick tap only aims
 * and waits for a confirming tap. Two pointers never tap. Touch presses show a magnifier.
 */
function attachInput(
  svg: SVGSVGElement,
  b: Board,
  contentId: string,
  drawn: Map<number, Drawn>,
  onTap: (id: number) => void,
  camera: { get: () => View; set: (v: View) => void },
  toCellOpt?: (clientX: number, clientY: number) => Point,
): void {
  svg.onclick = null;
  const toCell =
    toCellOpt ??
    ((cx: number, cy: number): Point => {
      const m = svg.getScreenCTM?.();
      return m ? { x: (cx - m.e) / m.a / CELL, y: (cy - m.f) / m.d / CELL } : { x: NaN, y: NaN };
    });
  const cellsPerPx = (cx: number, cy: number) => Math.abs(toCell(cx + 1, cy).x - toCell(cx, cy).x);
  const onBoard = (p: Point) => p.x >= 0 && p.y >= 0 && p.x < b.width && p.y < b.height;
  const live = (): Board => ({ ...b, arrows: b.arrows.filter((a) => drawn.has(a.id) && !drawn.get(a.id)!.group.classList.contains('leaving')) });
  const pick = (e: PointerEvent) => {
    const p = toCell(e.clientX, e.clientY);
    if (!onBoard(p)) return null;
    const radius = (e.pointerType === 'touch' ? TOUCH_RADIUS : MOUSE_RADIUS) * cellsPerPx(e.clientX, e.clientY);
    return pickArrow(live(), p, radius);
  };
  const aim = (id: number | null) => {
    for (const d of drawn.values()) d.group.classList.toggle('aim', d.group.dataset.id === String(id));
  };

  // The loupe lives in <body> (it is position: fixed) and is only created on the first
  // touch press, so boards nobody touches, like the editor preview, never get one.
  magnifiers.get(svg)?.remove();
  magnifiers.delete(svg);
  const lens = () => {
    let m = magnifiers.get(svg);
    if (!m) {
      m = el('svg', { class: 'magnifier', hidden: '' });
      // Same backdrop as the board, so the svg[data-bg] colours apply inside the loupe too.
      if (svg.dataset.bg) m.dataset.bg = svg.dataset.bg;
      m.append(el('use', { href: `#${contentId}` }));
      document.body.append(m);
      magnifiers.set(svg, m);
    }
    return m;
  };
  const showMagnifier = (e: PointerEvent) => {
    const magnifier = lens();
    const c = toCell(e.clientX, e.clientY);
    const size = (MAGNIFIER_SIZE * cellsPerPx(e.clientX, e.clientY)) / MAGNIFIER_ZOOM;
    magnifier.setAttribute('viewBox', [(c.x - size / 2) * CELL, (c.y - size / 2) * CELL, size * CELL, size * CELL].join(' '));
    magnifier.style.left = `${e.clientX - MAGNIFIER_SIZE / 2}px`;
    magnifier.style.top = `${e.clientY - MAGNIFIER_LIFT - MAGNIFIER_SIZE / 2}px`;
    magnifier.removeAttribute('hidden');
  };
  // A touch press only shows the loupe after MAGNIFIER_DELAY; until then it just aims.
  let loupeTimer: ReturnType<typeof setTimeout> | null = null;
  let lastTouch: PointerEvent | null = null;
  let loupeShown = false;
  const hideMagnifier = () => {
    if (loupeTimer !== null) clearTimeout(loupeTimer);
    loupeTimer = null;
    loupeShown = false;
    magnifiers.get(svg)?.setAttribute('hidden', '');
  };

  svg.onwheel = (e) => {
    e.preventDefault();
    camera.set(zoomAt(camera.get(), WHEEL_BASE ** -e.deltaY, toCell(e.clientX, e.clientY), b));
  };

  const pointers = new Map<number, Point>();
  // Two fingers: their spread zooms around their midpoint, and moving them pans.
  let pinch: { dist: number; mid: Point } | null = null;
  const twoFingers = () => {
    const [p, q] = [...pointers.values()];
    return { dist: Math.hypot(p.x - q.x, p.y - q.y), mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 } };
  };
  let press: { id: number | null; start: number; x: number; y: number; touch: boolean } | null = null;
  let pending: { id: number; at: Point } | null = null;

  svg.onpointerdown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size > 1) {
      // A second finger means a gesture, never a tap.
      press = null;
      aim(null);
      hideMagnifier();
      if (pointers.size === 2) pinch = twoFingers();
      return;
    }
    svg.setPointerCapture?.(e.pointerId);
    const picked = pick(e);
    press = { id: picked?.id ?? null, start: performance.now(), x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
    aim(press.id ?? pending?.id ?? null);
    if (press.touch) {
      lastTouch = e;
      loupeTimer = setTimeout(() => {
        loupeTimer = null;
        if (!press?.touch || !lastTouch) return;
        loupeShown = true;
        showMagnifier(lastTouch);
      }, MAGNIFIER_DELAY);
    }
  };

  svg.onpointermove = (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const now = twoFingers();
      const perPx = cellsPerPx(now.mid.x, now.mid.y);
      let v = camera.get();
      if (pinch.dist > 0) v = zoomAt(v, now.dist / pinch.dist, toCell(pinch.mid.x, pinch.mid.y), b);
      v = pan(v, -(now.mid.x - pinch.mid.x) * perPx, -(now.mid.y - pinch.mid.y) * perPx, b);
      camera.set(v);
      pinch = now;
      return;
    }
    if (!press) return;
    press.id = pick(e)?.id ?? null;
    aim(press.id);
    if (press.touch) {
      lastTouch = e;
      if (loupeShown) showMagnifier(e);
    }
  };

  const release = (e: PointerEvent, commit: boolean) => {
    pointers.delete(e.pointerId);
    // Whatever two fingers remain start a fresh pinch; fewer end it.
    pinch = pointers.size === 2 ? twoFingers() : null;
    hideMagnifier();
    const done = press;
    press = null;
    if (!done || !commit) return aim(pending?.id ?? null);
    const at = toCell(e.clientX, e.clientY);
    const quick = performance.now() - done.start < QUICK_MS && Math.hypot(e.clientX - done.x, e.clientY - done.y) < QUICK_MOVE;
    if (quick && pending && onBoard(at)) {
      const target = live().arrows.find((a) => a.id === pending!.id);
      const nearPoint = Math.hypot(at.x - pending.at.x, at.y - pending.at.y) <= CONFIRM;
      const nearArrow = target !== undefined && pickArrow({ ...b, arrows: [target] }, at, CONFIRM) !== null;
      if (nearPoint || nearArrow) {
        const id = pending.id;
        pending = null;
        aim(null);
        return onTap(id);
      }
    }
    pending = null;
    if (done.id === null) return aim(null);
    const picked = pick(e);
    if (quick && picked?.ambiguous) {
      pending = { id: picked.id, at };
      return aim(picked.id);
    }
    aim(null);
    onTap(done.id);
  };
  svg.onpointerup = (e) => release(e, true);
  svg.onpointercancel = (e) => release(e, false);
  // Capture can be lost without a pointerup reaching the board; forget that pointer.
  svg.onlostpointercapture = (e) => {
    if (pointers.has(e.pointerId)) release(e, false);
  };
}
