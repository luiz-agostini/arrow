/** Size of one board cell in SVG units. */
export const CELL = 24;

/** Zoom state: `scale` 1 shows the whole board; `x`, `y` are the window's top-left in cells. */
export type View = { scale: number; x: number; y: number };
type Size = { width: number; height: number };

export const MIN_SCALE = 1;
export const MAX_SCALE = 8;
/** The board is drawn with a one-cell margin on every side. */
const MARGIN = 1;

const span = (v: View, board: Size) => ({ w: (board.width + 2 * MARGIN) / v.scale, h: (board.height + 2 * MARGIN) / v.scale });

export function fit(): View {
  return { scale: 1, x: -MARGIN, y: -MARGIN };
}

/** Keeps the window on the board and its margin; at scale 1 it is always fit. */
function clamp(v: View, board: Size): View {
  if (v.scale <= MIN_SCALE) return fit();
  const { w, h } = span(v, board);
  const within = (n: number, size: number, extent: number) => Math.min(Math.max(n, -MARGIN), -MARGIN + extent - size);
  return { scale: v.scale, x: within(v.x, w, board.width + 2 * MARGIN), y: within(v.y, h, board.height + 2 * MARGIN) };
}

/** Zooms by `factor` around `at` (in cells), keeping that point fixed on screen. */
export function zoomAt(v: View, factor: number, at: { x: number; y: number }, board: Size): View {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, v.scale * factor));
  const ratio = v.scale / scale;
  return clamp({ scale, x: at.x - (at.x - v.x) * ratio, y: at.y - (at.y - v.y) * ratio }, board);
}

/** Moves the window by (`dx`, `dy`) cells. */
export function pan(v: View, dx: number, dy: number, board: Size): View {
  return clamp({ ...v, x: v.x + dx, y: v.y + dy }, board);
}

export function viewBox(v: View, board: Size): string {
  const { w, h } = span(v, board);
  return [v.x * CELL, v.y * CELL, w * CELL, h * CELL].join(' ');
}
