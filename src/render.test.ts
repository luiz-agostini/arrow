import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Board } from './model';
import { DARK_BG, fitContrast, LIGHT_BG } from './colors';
import { mountBoard } from './render';
import css from './style.css?raw';

const board: Board = {
  width: 5,
  height: 5,
  arrows: [
    { id: 1, cells: [{ x: 0, y: 2 }, { x: 1, y: 2 }], dir: 'R' },
    { id: 2, cells: [{ x: 3, y: 0 }, { x: 3, y: 1 }, { x: 3, y: 2 }], dir: 'D' },
  ],
};

let svg: SVGSVGElement;
// One client pixel per cell keeps the arithmetic readable.
const toCell = (x: number, y: number) => ({ x, y });
function pointer(type: string, x: number, y: number, init: PointerEventInit = {}) {
  svg.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', ...init }));
}
const aimed = () => [...svg.querySelectorAll('g.arrow.aim')].map((g) => Number(g.getAttribute('data-id')));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(svg);
});

afterEach(() => {
  vi.useRealTimers();
  svg.remove();
  document.querySelectorAll('svg.magnifier').forEach((m) => m.remove());
});

test('draws a body, head and hit area per arrow', () => {
  mountBoard(svg, board, () => {});
  expect(svg.querySelectorAll('path.body[data-id]')).toHaveLength(2);
  expect(svg.querySelectorAll('polygon.head[data-id]')).toHaveLength(2);
  expect(svg.querySelectorAll('path.hit[data-id]')).toHaveLength(2);
});

test('remounting replaces the previous board', () => {
  mountBoard(svg, board, () => {});
  mountBoard(svg, board, () => {});
  expect(svg.querySelectorAll('path.body')).toHaveLength(2);
});

test('clicking a hit path does nothing: taps go through pointer picking (decision 0007)', () => {
  const onTap = vi.fn();
  mountBoard(svg, board, onTap, { toCell });
  svg.querySelector<SVGPathElement>('path.hit[data-id="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onTap).not.toHaveBeenCalled();
});

test('flashBlocked marks both arrows for 400 ms', () => {
  const view = mountBoard(svg, board, () => {});
  view.flashBlocked(1, 2);
  const arrow = svg.querySelector('g.arrow[data-id="1"]')!;
  const blocker = svg.querySelector('g.arrow[data-id="2"]')!;
  expect(arrow.classList.contains('blocked')).toBe(true);
  expect(blocker.classList.contains('blocker')).toBe(true);
  vi.advanceTimersByTime(400);
  expect(arrow.classList.contains('blocked')).toBe(false);
  expect(blocker.classList.contains('blocker')).toBe(false);
});

test('slideOut animates the arrow off the board and removes it', async () => {
  const view = mountBoard(svg, board, () => {});
  let done = false;
  view.slideOut(2).then(() => (done = true));
  vi.advanceTimersByTime(50);
  await Promise.resolve();
  expect(done).toBe(false);
  const body = svg.querySelector('path.body[data-id="2"]')!;
  expect(Number(body.getAttribute('stroke-dashoffset'))).toBeLessThan(0);
  // body 3 cells + ray 2 cells + 1 to clear: 6 cells at 30 cells/s = 200 ms
  vi.advanceTimersByTime(200);
  await vi.runAllTimersAsync();
  expect(done).toBe(true);
  expect(svg.querySelector('g.arrow[data-id="2"]')).toBeNull();
});

test('highlight marks an arrow as the hint', () => {
  const view = mountBoard(svg, board, () => {});
  view.highlight(2);
  expect(svg.querySelector('g.arrow[data-id="2"]')!.classList.contains('hint')).toBe(true);
});

test('a palette colours arrows by region, fitted to both themes', () => {
  const coloured: Board = {
    ...board,
    arrows: [
      { ...board.arrows[0], region: 0 },
      { ...board.arrows[1], region: 1 },
    ],
  };
  mountBoard(svg, coloured, () => {}, { palette: ['#ff0000', '#0000ff'] });
  const style = (id: number) => svg.querySelector<SVGGElement>(`g.arrow[data-id="${id}"]`)!.style;
  expect(style(1).getPropertyValue('--arrow-light')).toBe(fitContrast('#ff0000', LIGHT_BG));
  expect(style(1).getPropertyValue('--arrow-dark')).toBe(fitContrast('#ff0000', DARK_BG));
  expect(style(2).getPropertyValue('--arrow-light')).toBe(fitContrast('#0000ff', LIGHT_BG));
  expect(style(2).getPropertyValue('--arrow-dark')).toBe(fitContrast('#0000ff', DARK_BG));
});

test('zoom and fit can be called', () => {
  const view = mountBoard(svg, board, () => {}, { background: 'dark' });
  expect(() => {
    view.zoom(2);
    view.fit();
  }).not.toThrow();
});

test('without a palette arrows keep the theme colour', () => {
  mountBoard(svg, board, () => {});
  expect(svg.querySelector<SVGGElement>('g.arrow')!.style.getPropertyValue('--arrow-light')).toBe('');
});

test('blocker and hint feedback do not rely on colour alone', () => {
  const rule = (selector: string) => css.match(new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  expect(rule('.arrow.blocker .body')).toMatch(/stroke-width/);
  expect(rule('.arrow.hint .body')).toMatch(/animation/);
});

test('a level background sets the board backdrop and fits colours to that one background', () => {
  const coloured: Board = { ...board, arrows: board.arrows.map((a) => ({ ...a, region: 0 })) };
  mountBoard(svg, coloured, () => {}, { palette: ['#571d24'], background: 'light' });
  expect(svg.dataset.bg).toBe('light');
  expect(svg.querySelector('rect.backdrop')).not.toBeNull();
  const group = svg.querySelector<SVGGElement>('g.arrow[data-id="1"]')!;
  expect(group.style.getPropertyValue('--arrow-c')).toBe('#571d24');
  mountBoard(svg, coloured, () => {}, { palette: ['#1a1d2a'], background: 'dark' });
  expect(svg.dataset.bg).toBe('dark');
  expect(svg.querySelector<SVGGElement>('g.arrow')!.style.getPropertyValue('--arrow-c')).toBe(fitContrast('#1a1d2a', DARK_BG));
});

test('without a level background there is no backdrop', () => {
  mountBoard(svg, board, () => {}, { background: 'dark' });
  mountBoard(svg, board, () => {});
  expect(svg.dataset.bg).toBeUndefined();
  expect(svg.querySelector('rect.backdrop')).toBeNull();
});

test('arrows are drawn thick, with heads 0.32 cell wide on each side', () => {
  expect(css).toMatch(/\.arrow \.body\s*\{[^}]*stroke-width:\s*5\.5;/);
  mountBoard(svg, { width: 3, height: 3, arrows: [{ id: 1, cells: [{ x: 0, y: 1 }, { x: 1, y: 1 }], dir: 'R' }] }, () => {});
  const ys = svg.querySelector('polygon.head')!.getAttribute('points')!.split(' ').map((p) => Number(p.split(',')[1]));
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2 * 0.32 * 24, 6);
});

describe('pointer taps', () => {
  test('pressing previews the arrow and releasing commits it', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 1.5, 2.5);
    expect(aimed()).toEqual([1]);
    expect(onTap).not.toHaveBeenCalled();
    pointer('pointerup', 1.5, 2.5);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(1);
    expect(aimed()).toEqual([]);
  });

  test('the preview follows the pointer and the arrow under it on release is the one moved', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 1.5, 2.5);
    pointer('pointermove', 3.5, 0.5);
    expect(aimed()).toEqual([2]);
    pointer('pointerup', 3.5, 0.5);
    expect(onTap).toHaveBeenCalledWith(2);
  });

  test('dragging off the board cancels, even if released there', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 1.5, 2.5);
    pointer('pointermove', -3, -3);
    expect(aimed()).toEqual([]);
    pointer('pointerup', -3, -3);
    expect(onTap).not.toHaveBeenCalled();
  });

  test('an ambiguous quick tap only aims; a second quick tap there confirms', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 2.6, 2.5);
    vi.advanceTimersByTime(100);
    pointer('pointerup', 2.6, 2.5);
    expect(onTap).not.toHaveBeenCalled();
    expect(aimed()).toEqual([2]);
    pointer('pointerdown', 2.6, 2.5);
    vi.advanceTimersByTime(100);
    pointer('pointerup', 2.6, 2.5);
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap).toHaveBeenCalledWith(2);
  });

  test('a deliberate press on an ambiguous spot commits the nearest arrow', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 2.6, 2.5);
    vi.advanceTimersByTime(500);
    pointer('pointerup', 2.6, 2.5);
    expect(onTap).toHaveBeenCalledWith(2);
  });

  test('a second finger cancels the aim and two-finger gestures never tap', () => {
    const onTap = vi.fn();
    mountBoard(svg, board, onTap, { toCell });
    pointer('pointerdown', 1.5, 2.5, { pointerType: 'touch' });
    vi.advanceTimersByTime(50);
    pointer('pointerdown', 3.5, 0.5, { pointerId: 2, pointerType: 'touch' });
    expect(aimed()).toEqual([]);
    pointer('pointermove', 3.0, 0.5, { pointerId: 2, pointerType: 'touch' });
    pointer('pointerup', 1.5, 2.5, { pointerType: 'touch' });
    pointer('pointerup', 3.0, 0.5, { pointerId: 2, pointerType: 'touch' });
    expect(onTap).not.toHaveBeenCalled();
  });

  test('a touch press shows a magnifier that reuses the board through one <use>', () => {
    mountBoard(svg, board, () => {}, { toCell });
    pointer('pointerdown', 1.5, 2.5, { pointerType: 'touch' });
    const magnifier = document.querySelector<SVGSVGElement>('svg.magnifier')!;
    expect(magnifier.hasAttribute('hidden')).toBe(false);
    expect(magnifier.querySelectorAll('use')).toHaveLength(1);
    expect(magnifier.querySelectorAll('g.arrow')).toHaveLength(0);
    pointer('pointerup', 1.5, 2.5, { pointerType: 'touch' });
    expect(magnifier.hasAttribute('hidden')).toBe(true);
  });

  test('a mouse press shows no magnifier', () => {
    mountBoard(svg, board, () => {}, { toCell });
    pointer('pointerdown', 1.5, 2.5);
    expect(document.querySelector('svg.magnifier:not([hidden])')).toBeNull();
  });

  test('an arrow that is sliding out cannot be picked', () => {
    const onTap = vi.fn();
    const view = mountBoard(svg, board, onTap, { toCell });
    void view.slideOut(1);
    pointer('pointerdown', 1.5, 2.5);
    pointer('pointerup', 1.5, 2.5);
    expect(onTap).not.toHaveBeenCalledWith(1);
  });
});
