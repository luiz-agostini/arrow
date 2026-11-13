import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { serializeLevel } from './editor';
import { generate } from './generate';
import { LEVELS } from './levels';
import { startApp } from './main';
import { pictureToLevel, type Pixels } from './picture';

// Count board generations to check that preview updates are throttled to one per frame.
vi.mock('./generate', async (original) => {
  const real = await original<typeof import('./generate')>();
  return { ...real, generate: vi.fn(real.generate) };
});
import { BLUE, paint, RED, WHITE } from './test-helpers';

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const twoTone = paint(100, 100, (x, y) => (inBox(x, y, 10, 20, 49, 79) ? RED : inBox(x, y, 50, 20, 89, 79) ? BLUE : WHITE));
const grey = paint(60, 60, () => [128, 128, 128, 255]);

let root: HTMLElement;
const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
const editor = () => $('[data-role="editor"]');
const click = (sel: string) => $(sel).dispatchEvent(new MouseEvent('click', { bubbles: true }));
const flush = () => new Promise((r) => setTimeout(r, 0));
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)));
const previewArrows = () =>
  [...editor().querySelectorAll('g.arrow path.body')].map((p) => p.getAttribute('d')).join('|');

async function pickPicture(pixels: Pixels) {
  startApp(root, { decodeImage: async () => pixels });
  const input = $<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File([''], 'pic.png')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}

async function setInput(sel: string, value: string | boolean) {
  const el = $<HTMLInputElement>(sel);
  if (typeof value === 'boolean') el.checked = value;
  else el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await nextFrame();
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
  expect($('[data-role="coverage"]').textContent).toMatch(/^Cobertura \d+%$/);
  expect($<HTMLButtonElement>('[data-action="play"]').disabled).toBe(false);
});

test('grid size, invert and shuffle regenerate the preview', async () => {
  await pickPicture(twoTone);
  expect($<HTMLInputElement>('[data-role="grid-size"]').value).toBe('40');
  await setInput('[data-role="grid-size"]', '12');
  expect(editor().querySelector('svg')!.getAttribute('viewBox')).toBe('-24 -24 336 336');
  const before = previewArrows();
  click('[data-action="shuffle"]');
  expect(previewArrows()).not.toBe(before);
  const shuffled = previewArrows();
  await setInput('[data-role="invert"]', true);
  expect(previewArrows()).not.toBe(shuffled);
});

test('changing the number of colours changes the palette', async () => {
  await pickPicture(twoTone);
  const colours = () => new Set([...editor().querySelectorAll<SVGGElement>('g.arrow')].map((g) => g.style.getPropertyValue('--arrow-c')));
  expect(colours().size).toBe(2);
  const select = $<HTMLSelectElement>('[data-role="colors"]');
  expect([...select.options].map((o) => o.value)).toEqual(['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  expect(select.value).toBe('auto');
  await setInput('[data-role="colors"]', '1');
  expect(colours().size).toBe(1);
});

test('play starts the picture level without touching progress', async () => {
  await pickPicture(twoTone);
  click('[data-action="play"]');
  expect(editor().hidden).toBe(true);
  expect($('[data-role="level"]').textContent).toBe('Sua foto');
  expect($('main svg g.arrow').getAttribute('style')).toContain('--arrow-c');
  const expected = pictureToLevel(twoTone, { cols: 40, colors: 'auto', invert: false }).background;
  expect($<SVGSVGElement>('main svg.board').dataset.bg).toBe(expected);
  expect($<HTMLButtonElement>('[data-action="next"]').disabled).toBe(true);
  expect(localStorage.getItem('arrow.progress')).toBeNull();
  expect(localStorage.getItem('arrow.cleared')).toBeNull();
  expect(root.querySelector('[data-level][aria-current]')).toBeNull();
  click('[data-action="restart"]');
  expect($('[data-role="level"]').textContent).toBe('Sua foto');
});

test('cancel closes the editor and keeps the current level', async () => {
  await pickPicture(twoTone);
  click('[data-action="cancel"]');
  expect(editor().hidden).toBe(true);
  expect($('[data-role="level"]').textContent).toBe(LEVELS[0].name);
});

test('a picture without a shape cannot be played', async () => {
  await pickPicture(grey);
  expect($<HTMLButtonElement>('[data-action="play"]').disabled).toBe(true);
  expect($('[data-role="editor-status"]').textContent).toBe('Nenhuma forma encontrada — tente Inverter');
});

test.each([400, 1024])('grid size runs from 12 to 64, default 40, at %i px wide', async (width) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  await pickPicture(twoTone);
  const slider = $<HTMLInputElement>('[data-role="grid-size"]');
  expect([slider.min, slider.max, slider.value]).toEqual(['12', '64', '40']);
});

test('rapid input regenerates the preview once per frame', async () => {
  await pickPicture(twoTone);
  vi.mocked(generate).mockClear();
  const slider = $<HTMLInputElement>('[data-role="grid-size"]');
  for (const v of ['30', '31', '32', '33', '34']) {
    slider.value = v;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
  }
  expect(generate).not.toHaveBeenCalled();
  await nextFrame();
  expect(generate).toHaveBeenCalledTimes(1);
  expect(editor().querySelector('svg')!.getAttribute('viewBox')).toBe('-24 -24 864 864');
});

test('copy as level writes the level source to the clipboard', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  await pickPicture(twoTone);
  click('[data-action="copy-level"]');
  await flush();
  expect(writeText).toHaveBeenCalledTimes(1);
  const text = writeText.mock.calls[0][0] as string;
  expect(text).toContain("name: 'Sua foto'");
  expect(text).toContain("background: '");
  expect(text).toContain('mask: [');
});

test('a rejected clipboard shows a message', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
  await pickPicture(twoTone);
  click('[data-action="copy-level"]');
  await flush();
  expect($('[data-role="editor-status"]').textContent).toBe('Não foi possível copiar o nível');
});

test('serializeLevel writes a levels.ts entry, escaping quotes and omitting absent fields', () => {
  expect(serializeLevel({ name: "Bob's", mask: ['0.'], seed: 3 })).toBe("{\n    name: 'Bob\\'s',\n    seed: 3,\n    mask: [\n      '0.',\n    ],\n  },");
  expect(serializeLevel({ name: 'P', mask: ['01'], seed: 9, palette: ['#ff0000', '#0000ff'], background: 'dark' })).toBe(
    "{\n    name: 'P',\n    seed: 9,\n    palette: ['#ff0000', '#0000ff'],\n    background: 'dark',\n    mask: [\n      '01',\n    ],\n  },",
  );
});

test('a picture that cannot be decoded shows a message', async () => {
  startApp(root, { decodeImage: async () => Promise.reject(new Error('bad image')) });
  const input = $<HTMLInputElement>('input[type="file"]');
  Object.defineProperty(input, 'files', { value: [new File([''], 'pic.heic')] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
  expect($('[data-role="status"]').textContent).toBe('Não foi possível ler essa imagem');
  expect(editor().hidden).toBe(true);
});

test('picking a level from the pane leaves a picture level', async () => {
  await pickPicture(twoTone);
  click('[data-action="play"]');
  click('[data-level="1"]');
  expect($('[data-role="level"]').textContent).toBe(LEVELS[1].name);
});

test('copy reports a missing clipboard instead of throwing', async () => {
  Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
  await pickPicture(twoTone);
  click('[data-action="copy-level"]');
  await flush();
  expect($('[data-role="editor-status"]').textContent).toBe('Não foi possível copiar o nível');
});

test('a copy that succeeds after a failed one clears the message', async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error('not focused')).mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  await pickPicture(twoTone);
  click('[data-action="copy-level"]');
  await flush();
  expect($('[data-role="editor-status"]').textContent).toBe('Não foi possível copiar o nível');
  click('[data-action="copy-level"]');
  await flush();
  expect($('[data-role="editor-status"]').textContent).toBe('');
});

test('copy is disabled like play when no shape is found', async () => {
  await pickPicture(grey);
  expect($<HTMLButtonElement>('[data-action="copy-level"]').disabled).toBe(true);
});

test('play right after changing a control uses the new settings, not the last frame', async () => {
  await pickPicture(twoTone);
  const slider = $<HTMLInputElement>('[data-role="grid-size"]');
  slider.value = '12';
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  click('[data-action="play"]');
  expect($('main svg.board').getAttribute('viewBox')).toBe('-24 -24 336 336');
});
