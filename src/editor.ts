import { generate } from './generate';
import type { Level } from './levels';
import { pictureToLevel, type Pixels } from './picture';
import { mountBoard } from './render';

export const MIN_COLS = 12;
export const DEFAULT_COLS = 20;
export const MAX_COLS = 40;
export const PHONE_MAX_COLS = 24;
export const PHONE_WIDTH = 600;
export const DEFAULT_COLORS = 4;
export const MIN_CELLS = 20;
const MAX_DECODE = 512;

/** Decodes a picked file to pixels, longest side at most 512 px; orientation comes from the file. */
export async function decodeImage(file: File): Promise<Pixels> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DECODE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return { width, height, data: ctx.getImageData(0, 0, width, height).data };
}

/** Shows the picture editor in `host`; Play hands the finished level to `onPlay`. */
export function openEditor(host: HTMLElement, pixels: Pixels, onPlay: (level: Level) => void): void {
  const maxCols = window.innerWidth < PHONE_WIDTH ? PHONE_MAX_COLS : MAX_COLS;
  host.innerHTML = `
    <div class="editor-panel">
      <h2>Your picture</h2>
      <svg class="board preview" role="img" aria-label="level preview"></svg>
      <p class="editor-status" data-role="editor-status" aria-live="polite"></p>
      <div class="editor-controls">
        <label>Size <input type="range" data-role="grid-size" min="${MIN_COLS}" max="${maxCols}" value="${DEFAULT_COLS}" /></label>
        <label>Colours <select data-role="colors">${[1, 2, 3, 4, 5, 6]
          .map((n) => `<option value="${n}"${n === DEFAULT_COLORS ? ' selected' : ''}>${n}</option>`)
          .join('')}</select></label>
        <label><input type="checkbox" data-role="invert" /> Invert</label>
        <button type="button" data-action="shuffle">Shuffle</button>
      </div>
      <div class="editor-actions">
        <span data-role="coverage"></span>
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="play">Play</button>
      </div>
    </div>`;
  host.hidden = false;
  const get = <T extends Element>(sel: string) => host.querySelector<T>(sel)!;
  const svg = get<SVGSVGElement>('svg');
  const size = get<HTMLInputElement>('[data-role="grid-size"]');
  const colors = get<HTMLSelectElement>('[data-role="colors"]');
  const invert = get<HTMLInputElement>('[data-role="invert"]');
  const status = get<HTMLElement>('[data-role="editor-status"]');
  const coverage = get<HTMLElement>('[data-role="coverage"]');
  const play = get<HTMLButtonElement>('[data-action="play"]');
  let seed = 1;
  let level: Level | null = null;

  const render = () => {
    const { mask, palette, cells, background } = pictureToLevel(pixels, {
      cols: Number(size.value),
      colors: Number(colors.value),
      invert: invert.checked,
    });
    if (cells < MIN_CELLS) {
      level = null;
      svg.replaceChildren();
      status.textContent = 'No shape found — try Invert';
      coverage.textContent = '';
      play.disabled = true;
      return;
    }
    level = { name: 'Your picture', mask, seed, palette };
    const board = generate(mask, seed);
    mountBoard(svg, board, () => {}, { palette, background });
    const covered = board.arrows.reduce((n, a) => n + a.cells.length, 0);
    status.textContent = '';
    coverage.textContent = `Coverage ${Math.round((covered / cells) * 100)}%`;
    play.disabled = false;
  };

  host.oninput = render;
  host.onclick = (e) => {
    const action = (e.target as Element).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'shuffle') {
      seed++;
      render();
    }
    if (action === 'cancel') host.hidden = true;
    if (action === 'play' && level) {
      host.hidden = true;
      onPlay(level);
    }
  };
  render();
}
