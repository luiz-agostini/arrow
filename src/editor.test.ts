import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { startApp } from './main';
import type { Pixels } from './picture';
import { BLUE, paint, RED, WHITE } from './test-helpers';

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const twoTone = paint(100, 100, (x, y) => (inBox(x, y, 10, 20, 49, 79) ? RED : inBox(x, y, 50, 20, 89, 79) ? BLUE : WHITE));
const grey = paint(60, 60, () => [128, 128, 128, 255]);

let root: HTMLElement;
const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const editor = () => $('[data-role="editor"]');
const click = (sel: string) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const previewArrows = () =>
  [...editor().querySelectorAll('g.arrow path.body')].map((p) => p.getAttribute('d')).join('|');

async function pickPicture(pixels: Pixels) {
  startApp(root, { decodeImage: async () => pixels });
  const input = $<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File([''], 'pic.png')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

function setInput(sel: string, value: string | boolean) {
  const el = $<HTMLInputElement>(sel);
  if (typeof value === 'boolean') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  root = document.createElement('div');
  document.body.append(root);
});

afterEach(() => root.remove());

test('the file input accepts images, which opens camera or library on phones', () => {
  startApp(root);
  expect($('input[type="file"]').getAttribute('accept')).toBe('image/*');
});

test('picking a picture shows a coloured preview with coverage', async () => {
  await pickPicture(twoTone);
  expect(editor().hidden).toBe(false);
  expect(editor().querySelectorAll('g.arrow').length).toBeGreaterThan(0);
  expect(editor().querySelector('g.arrow')!.getAttribute('style')).toContain('--arrow-c');
  expect($('[data-role="coverage"]').textContent).toMatch(/^Coverage \d+%$/);
  expect($<HTMLButtonElement>('[data-action="play"]').disabled).toBe(false);
});

test('grid size, invert and shuffle regenerate the preview', async () => {
  await pickPicture(twoTone);
  expect($<HTMLInputElement>('[data-role="grid-size"]').value).toBe('20');
  setInput('[data-role="grid-size"]', '12');
  expect(editor().querySelector('svg')!.getAttribute('viewBox')).toBe('-24 -24 336 336');
  const before = previewArrows();
  click('[data-action="shuffle"]');
  expect(previewArrows()).not.toBe(before);
  const shuffled = previewArrows();
  setInput('[data-role="invert"]', true);
  expect(previewArrows()).not.toBe(shuffled);
});

test('changing the number of colours changes the palette', async () => {
  await pickPicture(twoTone);
  const colours = () => new Set([...editor().querySelectorAll<SVGGElement>('g.arrow')].map((g) => g.style.getPropertyValue('--arrow-c')));
  expect(colours().size).toBe(2);
  const select = $<HTMLSelectElement>('[data-role="colors"]');
  expect([...select.options].map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6']);
  select.value = '1';
  select.dispatchEvent(new Event('input', { bubbles: true }));
  expect(colours().size).toBe(1);
});

test('play starts the picture level without touching progress', async () => {
  await pickPicture(twoTone);
  click('[data-action="play"]');
  expect(editor().hidden).toBe(true);
  expect($('[data-role="level"]').textContent).toBe('Your picture');
  expect($('main svg g.arrow').getAttribute('style')).toContain('--arrow-light');
  expect($<HTMLButtonElement>('[data-action="next"]').disabled).toBe(true);
  expect(localStorage.getItem('arrow.progress')).toBeNull();
  expect(localStorage.getItem('arrow.cleared')).toBeNull();
  expect(root.querySelector('[data-level][aria-current]')).toBeNull();
  click('[data-action="restart"]');
  expect($('[data-role="level"]').textContent).toBe('Your picture');
});

test('cancel closes the editor and keeps the current level', async () => {
  await pickPicture(twoTone);
  click('[data-action="cancel"]');
  expect(editor().hidden).toBe(true);
  expect($('[data-role="level"]').textContent).toBe('Heart');
});

test('a picture without a shape cannot be played', async () => {
  await pickPicture(grey);
  expect($<HTMLButtonElement>('[data-action="play"]').disabled).toBe(true);
  expect($('[data-role="editor-status"]').textContent).toBe('No shape found — try Invert');
});

test('grid size is capped at 24 on phones', async () => {
  Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true });
  await pickPicture(twoTone);
  const slider = $<HTMLInputElement>('[data-role="grid-size"]');
  expect(slider.max).toBe('24');
  expect(slider.min).toBe('12');
});

test('a picture that cannot be decoded shows a message', async () => {
  startApp(root, { decodeImage: async () => Promise.reject(new Error('bad image')) });
  const input = $<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File([''], 'pic.heic')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  expect($('[data-role="status"]').textContent).toBe("Couldn't read that picture");
  expect(editor().hidden).toBe(true);
});

test('picking a level from the pane leaves a picture level', async () => {
  await pickPicture(twoTone);
  click('[data-action="play"]');
  click('[data-level="1"]');
  expect($('[data-role="level"]').textContent).toBe('Fish');
});
