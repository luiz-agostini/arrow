import { afterEach, beforeEach, expect, test, vi } from 'vitest';
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  document.body.append(svg);
});

afterEach(() => {
  vi.useRealTimers();
  svg.remove();
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

test('clicking an arrow reports its id', () => {
  const onTap = vi.fn();
  mountBoard(svg, board, onTap);
  svg.querySelector<SVGPathElement>('path.hit[data-id="1"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(onTap).toHaveBeenCalledWith(1);
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
  mountBoard(svg, coloured, () => {}, ['#ff0000', '#0000ff']);
  const style = (id: number) => svg.querySelector<SVGGElement>(`g.arrow[data-id="${id}"]`)!.style;
  expect(style(1).getPropertyValue('--arrow-light')).toBe(fitContrast('#ff0000', LIGHT_BG));
  expect(style(1).getPropertyValue('--arrow-dark')).toBe(fitContrast('#ff0000', DARK_BG));
  expect(style(2).getPropertyValue('--arrow-light')).toBe(fitContrast('#0000ff', LIGHT_BG));
  expect(style(2).getPropertyValue('--arrow-dark')).toBe(fitContrast('#0000ff', DARK_BG));
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
