import { generate } from './generate';
import type { Level } from './levels';
import { pictureToLevel, type Pixels } from './picture';
import { mountBoard } from './render';

export const MIN_COLS = 12;
export const DEFAULT_COLS = 40;
export const MAX_COLS = 64;
export const MIN_CELLS = 20;
const COLOR_CHOICES = ['auto', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
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
  host.innerHTML = `
    <div class="editor-panel">
      <h2>Your picture</h2>
      <svg class="board preview" role="img" aria-label="level preview"></svg>
      <p class="editor-status" data-role="editor-status" aria-live="polite"></p>
      <div class="editor-controls">
        <label>Size <input type="range" data-role="grid-size" min="${MIN_COLS}" max="${MAX_COLS}" value="${DEFAULT_COLS}" /></label>
        <label>Colours <select data-role="colors">${COLOR_CHOICES.map(
          (c) => `<option value="${c}">${c === 'auto' ? 'Auto' : c}</option>`,
        ).join('')}</select></label>
        <label><input type="checkbox" data-role="invert" /> Invert</label>
        <button type="button" data-action="shuffle">Shuffle</button>
      </div>
      <div class="editor-actions">
        <span data-role="coverage"></span>
        <button type="button" data-action="copy-level">Copy as level</button>
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
  const copy = get<HTMLButtonElement>('[data-action="copy-level"]');
  let seed = 1;
  let level: Level | null = null;

  const render = () => {
    const { mask, palette, cells, background } = pictureToLevel(pixels, {
      cols: Number(size.value),
      colors: colors.value === 'auto' ? 'auto' : Number(colors.value),
      invert: invert.checked,
    });
    if (cells < MIN_CELLS) {
      level = null;
      svg.replaceChildren();
      status.textContent = 'No shape found — try Invert';
      coverage.textContent = '';
      play.disabled = copy.disabled = true;
      return;
    }
    level = { name: 'Your picture', mask, seed, palette, background };
    const board = generate(mask, seed);
    mountBoard(svg, board, () => {}, { palette, background });
    const covered = board.arrows.reduce((n, a) => n + a.cells.length, 0);
    status.textContent = '';
    coverage.textContent = `Coverage ${Math.round((covered / cells) * 100)}%`;
    play.disabled = copy.disabled = false;
  };

  // Dragging the slider fires many inputs; regenerate at most once per frame.
  let scheduled: number | null = null;
  host.oninput = () => {
    if (scheduled !== null) return;
    scheduled = requestAnimationFrame(() => {
      scheduled = null;
      render();
    });
  };
  // Play and Copy act on the controls as they are now, even if a frame hasn't run yet.
  const settle = () => {
    if (scheduled === null) return;
    cancelAnimationFrame(scheduled);
    scheduled = null;
    render();
  };
  host.onclick = (e) => {
    const action = (e.target as Element).closest('[data-action]')?.getAttribute('data-action');
    if (action === 'play' || action === 'copy-level') settle();
    if (action === 'shuffle') {
      seed++;
      render();
    }
    if (action === 'cancel') host.hidden = true;
    if (action === 'copy-level' && level) {
      // The clipboard API is missing on insecure origins and older browsers.
      const written = navigator.clipboard?.writeText(serializeLevel(level)) ?? Promise.reject(new Error('no clipboard'));
      written.then(
        () => {
          status.textContent = '';
        },
        () => {
          status.textContent = "Couldn't copy the level";
        },
      );
    }
    if (action === 'play' && level) {
      host.hidden = true;
      onPlay(level);
    }
  };
  render();
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** A level as a `levels.ts` entry; `palette` and `background` lines appear only when set. */
export function serializeLevel(level: Level): string {
  return [
    '{',
    `    name: ${quote(level.name)},`,
    `    seed: ${level.seed},`,
    ...(level.palette ? [`    palette: [${level.palette.map(quote).join(', ')}],`] : []),
    ...(level.background ? [`    background: ${quote(level.background)},`] : []),
    '    mask: [',
    ...level.mask.map((row) => `      ${quote(row)},`),
    '    ],',
    '  },',
  ].join('\n');
}
