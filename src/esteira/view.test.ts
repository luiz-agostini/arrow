import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { EsteiraLevel, Shooter } from './level';
import { lapLength } from './sim';
import { startEsteira, TICK_MS } from './view';

const shooter = (id: number, color: number, ammo: number): Shooter => ({ id, color, ammo });
// A 3×3 frame of colour 0 around a hidden colour-1 centre.
const frame = (columns: Shooter[][]): EsteiraLevel => ({
  name: 'Moldura',
  width: 3,
  height: 3,
  cells: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  palette: ['#ff4040', '#4060ff'],
  columns: [...columns, ...Array.from({ length: 5 - columns.length }, () => [])],
});
const winnable = () => frame([[shooter(1, 0, 8), shooter(2, 1, 1)]]);

let root: HTMLElement;
let stop: () => void = () => {};
const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const click = (sel: string) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const text = (role: string) => $(`[data-role="${role}"]`).textContent;
const blocks = () => root.querySelectorAll('rect.block').length;
const laps = (n = 1) => vi.advanceTimersByTime(n * lapLength(3, 3) * TICK_MS + 1);

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  root.remove();
});

test('shows the picture, the 5 columns, the 5 slots and an empty belt', () => {
  stop = startEsteira(root, { level: winnable() });
  expect(blocks()).toBe(9);
  expect(root.querySelectorAll('[data-column]')).toHaveLength(5);
  expect(root.querySelectorAll('[data-slot]')).toHaveLength(5);
  expect(text('belt')).toBe('0/5');
  expect(text('level')).toBe('Moldura');
});

test('tapping a column sends its front shooter onto the belt', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  expect(text('belt')).toBe('1/5');
  expect(root.querySelectorAll('g.shooter')).toHaveLength(1);
  expect($('[data-column="0"]').textContent).toContain('1');
});

test('a lap removes the blocks of the shooter colour', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  laps();
  expect(blocks()).toBe(1);
  expect(text('belt')).toBe('0/5');
});

test('clearing the picture shows Concluído! and saves the level', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  laps();
  click('[data-column="0"]');
  laps();
  expect(text('status')).toBe('Concluído!');
  expect(JSON.parse(localStorage.getItem('esteira.cleared')!)).toEqual(['Moldura']);
});

test('a returning shooter with no free slot shows Sem espaço', () => {
  stop = startEsteira(root, { level: frame([[1, 2, 3, 4, 5, 6].map((i) => shooter(i, 1, 1))]) });
  for (let i = 0; i < 5; i++) {
    click('[data-column="0"]');
    vi.advanceTimersByTime(TICK_MS + 1);
  }
  laps();
  expect(root.querySelectorAll('[data-slot] .token')).toHaveLength(5);
  click('[data-column="0"]');
  laps();
  expect(text('status')).toBe('Sem espaço');
});

test('a parked shooter can be sent again from its slot', () => {
  stop = startEsteira(root, { level: frame([[shooter(1, 1, 1)]]) });
  click('[data-column="0"]');
  laps();
  expect(root.querySelectorAll('[data-slot] .token')).toHaveLength(1);
  click('[data-slot="0"]');
  expect(text('belt')).toBe('1/5');
});

test('Recomeçar restores the level', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  laps();
  click('[data-action="restart"]');
  expect(blocks()).toBe(9);
  expect(text('belt')).toBe('0/5');
  expect(text('status')).toBe('');
});

test('Início calls onHome', () => {
  const onHome = vi.fn();
  stop = startEsteira(root, { level: winnable(), onHome });
  click('[data-action="home"]');
  expect(onHome).toHaveBeenCalledTimes(1);
});

test('stopping halts the belt', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  stop();
  expect(() => laps(3)).not.toThrow();
  expect(blocks()).toBe(9);
});

test('without a level it offers every photo level, starting at the first not cleared', () => {
  localStorage.setItem('esteira.cleared', JSON.stringify(['Cachorrinho Deitado']));
  stop = startEsteira(root);
  const options = [...root.querySelectorAll<HTMLOptionElement>('[data-role="picker"] option')];
  expect(options).toHaveLength(16);
  expect(text('level')).toBe(options[1].textContent);
});

test('column and slot buttons stay the same elements while the belt runs, so taps are not lost', () => {
  stop = startEsteira(root, { level: winnable() });
  click('[data-column="0"]');
  const column = $('[data-column="1"]');
  const slot = $('[data-slot="0"]');
  vi.advanceTimersByTime(5 * TICK_MS + 1);
  expect($('[data-column="1"]')).toBe(column);
  expect($('[data-slot="0"]')).toBe(slot);
});
