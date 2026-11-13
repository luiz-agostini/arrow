export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

export const MAX_ROWS = 40;
const OPAQUE = 128;
const TRANSPARENT_SHARE = 0.01;
const MIN_CONTRAST = 16;
const MIN_GROUP = 3;
const KMEANS_ROUNDS = 10;
/** Colours closer than this (RGB distance) are not seeded as separate groups. */
const MIN_COLOUR_DIST = 48;
/** A pixel this far (RGB distance) from the background colour belongs to the shape. */
const BG_DISTANCE = 32;
/** Colour groups smaller than this share of the shape (or 3 cells) merge into their nearest group. */
const MIN_GROUP_SHARE = 0.05;
/** Share of border pixels that must match the background colour for it to count as plain. */
const PLAIN_BORDER_SHARE = 0.55;

type Rgb = [number, number, number];
type CellColour = { rgb: Rgb; alpha: number; lum: number };

/** Grid dimensions for a picture: `cols` wide unless that would need more than MAX_ROWS rows. */
export function gridSize(width: number, height: number, cols: number): { cols: number; rows: number } {
  let cell = width / cols;
  if (height / cell > MAX_ROWS) cell = height / MAX_ROWS;
  return { cols: Math.max(1, Math.round(width / cell)), rows: Math.max(1, Math.round(height / cell)) };
}

const lumOf = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Calls `visit` with the data offset of every pixel inside grid cell `cell`. */
function eachPixel(p: Pixels, cols: number, rows: number, cell: number, visit: (i: number) => void): void {
  const [gx, gy] = [cell % cols, Math.floor(cell / cols)];
  const [x0, x1] = [Math.floor((gx * p.width) / cols), Math.floor(((gx + 1) * p.width) / cols)];
  const [y0, y1] = [Math.floor((gy * p.height) / rows), Math.floor(((gy + 1) * p.height) / rows)];
  for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
    for (let x = x0; x < Math.max(x1, x0 + 1); x++) visit((y * p.width + x) * 4);
  }
}

/** Mean colour of the pixels in a cell that pass `keep`, or null when none do. */
function meanColour(p: Pixels, cols: number, rows: number, cell: number, keep: (i: number) => boolean): Rgb | null {
  const sum = [0, 0, 0];
  let n = 0;
  eachPixel(p, cols, rows, cell, (i) => {
    if (!keep(i)) return;
    sum[0] += p.data[i];
    sum[1] += p.data[i + 1];
    sum[2] += p.data[i + 2];
    n++;
  });
  return n ? (sum.map((v) => v / n) as Rgb) : null;
}

/** Box-averages the picture into cells; colour is averaged over opaque pixels only. */
function averageCells(p: Pixels, cols: number, rows: number): CellColour[] {
  return Array.from({ length: cols * rows }, (_, cell) => {
    let alpha = 0;
    let n = 0;
    eachPixel(p, cols, rows, cell, (i) => {
      alpha += p.data[i + 3];
      n++;
    });
    const rgb = meanColour(p, cols, rows, cell, (i) => p.data[i + 3] >= OPAQUE) ?? [255, 255, 255];
    return { rgb, alpha: alpha / n, lum: lumOf(...rgb) };
  });
}

/** Otsu's threshold over 0–255 values: the split with the largest between-class variance. */
function otsu(values: number[]): number {
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.round(v)]++;
  const total = values.length;
  const sumAll = hist.reduce((s, h, i) => s + h * i, 0);
  let [best, threshold, wB, sumB] = [-1, 0, 0, 0];
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0 || wB === total) continue;
    sumB += hist[t] * t;
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / (total - wB);
    const between = wB * (total - wB) * (mB - mF) ** 2;
    if (between > best) [best, threshold] = [between, t];
  }
  return threshold;
}

/** 4-connected groups of cells whose `on` value equals `value`. */
function groups(on: boolean[], cols: number, rows: number, value: boolean): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (let start = 0; start < on.length; start++) {
    if (on[start] !== value || seen.has(start)) continue;
    const group = [start];
    seen.add(start);
    for (let i = 0; i < group.length; i++) {
      const [x, y] = [group[i] % cols, Math.floor(group[i] / cols)];
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        const n = ny * cols + nx;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen.has(n) || on[n] !== value) continue;
        seen.add(n);
        group.push(n);
      }
    }
    out.push(group);
  }
  return out;
}

const dist2 = (a: Rgb, b: Rgb) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
const hex = (rgb: Rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/**
 * k-means over shape-cell colours, seeded by farthest-point picks so it needs no RNG.
 * Returns a cluster index per colour and the centres, largest cluster first.
 */
function quantize(colours: Rgb[], k: number): { labels: number[]; centres: Rgb[] } {
  const distinct = new Set(colours.map(hex)).size;
  let centres: Rgb[] = [colours[0]];
  while (centres.length < Math.min(k, distinct)) {
    let far = colours[0];
    let farD = -1;
    for (const c of colours) {
      const d = Math.min(...centres.map((m) => dist2(c, m)));
      if (d > farD) [far, farD] = [c, d];
    }
    if (farD < MIN_COLOUR_DIST ** 2) break;
    centres.push(far);
  }
  let labels: number[] = [];
  for (let round = 0; round < KMEANS_ROUNDS; round++) {
    labels = colours.map((c) => centres.reduce((bi, m, i) => (dist2(c, m) < dist2(c, centres[bi]) ? i : bi), 0));
    centres = centres.map((m, i) => {
      const members = colours.filter((_, j) => labels[j] === i);
      if (!members.length) return m;
      return [0, 1, 2].map((ch) => members.reduce((s, c) => s + c[ch], 0) / members.length) as Rgb;
    });
  }
  // Merge tiny groups, smallest first, so stray edge cells don't get a colour of their own.
  const minSize = Math.max(MIN_GROUP, MIN_GROUP_SHARE * colours.length);
  for (;;) {
    const sizes = centres.map((_, i) => labels.filter((l) => l === i).length);
    const live = sizes.flatMap((n, i) => (n > 0 ? [i] : []));
    const small = live.filter((i) => sizes[i] < minSize).sort((a, b) => sizes[a] - sizes[b] || a - b)[0];
    if (live.length < 2 || small === undefined) break;
    const into = live.filter((i) => i !== small).reduce((bi, i) => (dist2(centres[small], centres[i]) < dist2(centres[small], centres[bi]) ? i : bi));
    labels = labels.map((l) => (l === small ? into : l));
    const members = colours.filter((_, j) => labels[j] === into);
    centres[into] = [0, 1, 2].map((ch) => members.reduce((s, c) => s + c[ch], 0) / members.length) as Rgb;
  }
  const order = centres
    .map((_, i) => ({ i, n: labels.filter((l) => l === i).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const rank = new Map(order.map((c, r) => [c.i, r]));
  return { labels: labels.map((l) => rank.get(l)!), centres: order.map((c) => centres[c.i]) };
}

/**
 * The picture's background colour when its border is nearly one colour (the per-channel
 * median of the border pixels), or null when the border is busy.
 */
function plainBackground(p: Pixels): Rgb | null {
  const border: Rgb[] = [];
  const add = (x: number, y: number) => {
    const i = (y * p.width + x) * 4;
    border.push([p.data[i], p.data[i + 1], p.data[i + 2]]);
  };
  for (let x = 0; x < p.width; x++) [0, p.height - 1].forEach((y) => add(x, y));
  for (let y = 1; y < p.height - 1; y++) [0, p.width - 1].forEach((x) => add(x, y));
  const median = [0, 1, 2].map((ch) => border.map((c) => c[ch]).sort((a, b) => a - b)[border.length >> 1]) as Rgb;
  const matching = border.filter((c) => dist2(c, median) <= BG_DISTANCE ** 2).length;
  return matching / border.length >= PLAIN_BORDER_SHARE ? median : null;
}

/**
 * Turns a picture into a region mask and palette. Shape cells are the opaque ones
 * when the picture has transparency; otherwise, when the border is one plain colour,
 * the cells that differ from it; otherwise the darker side of an Otsu split. `invert`
 * swaps shape and background. Small specks are dropped and pinholes filled.
 */
export function pictureToLevel(
  p: Pixels,
  opts: { cols: number; colors: number; invert: boolean },
): { mask: string[]; palette: string[]; cells: number } {
  const { cols, rows } = gridSize(p.width, p.height, opts.cols);
  const cells = averageCells(p, cols, rows);
  let transparent = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < OPAQUE) transparent++;

  // `shapeSide` decides cells from their averages and, below, which pixels give a cell its colour.
  let shapeSide: (alpha: number, rgb: Rgb) => boolean;
  const bg = plainBackground(p);
  if (transparent / (p.width * p.height) >= TRANSPARENT_SHARE) {
    shapeSide = (alpha) => alpha >= OPAQUE !== opts.invert;
  } else if (bg) {
    const far = (rgb: Rgb) => dist2(rgb, bg) > BG_DISTANCE ** 2;
    const any = cells.some((c) => far(c.rgb));
    shapeSide = (_, rgb) => any && far(rgb) !== opts.invert;
  } else {
    const lums = cells.map((c) => c.lum);
    const flat = Math.max(...lums) - Math.min(...lums) < MIN_CONTRAST;
    const t = otsu(lums);
    shapeSide = (_, rgb) => !flat && (Math.round(lumOf(...rgb)) <= t) !== opts.invert;
  }
  const on = cells.map((c) => shapeSide(c.alpha, c.rgb));

  for (const g of groups(on, cols, rows, true)) if (g.length < MIN_GROUP) for (const i of g) on[i] = false;
  for (const g of groups(on, cols, rows, false)) {
    const enclosed = g.every((i) => i % cols > 0 && i % cols < cols - 1 && i >= cols && i < cols * (rows - 1));
    if (enclosed && g.length < MIN_GROUP) for (const i of g) on[i] = true;
  }

  const shape = on.flatMap((v, i) => (v ? [i] : []));
  if (!shape.length) return { mask: Array.from({ length: rows }, () => '.'.repeat(cols)), palette: [], cells: 0 };
  // Colour comes from the shape's own pixels, so edges and thin lines don't mix in the background.
  // On a plain background, only each cell's strongest pixels count (at least half as far from
  // the background as the farthest one), so anti-aliased edges don't add washed-out colours.
  const rgbAt = (px: number): Rgb => [p.data[px], p.data[px + 1], p.data[px + 2]];
  const ownColour = (i: number) => {
    const isShape = (px: number) => shapeSide(p.data[px + 3], rgbAt(px));
    if (!bg || opts.invert) return meanColour(p, cols, rows, i, isShape);
    let farthest = 0;
    eachPixel(p, cols, rows, i, (px) => {
      if (isShape(px)) farthest = Math.max(farthest, dist2(rgbAt(px), bg));
    });
    return meanColour(p, cols, rows, i, (px) => isShape(px) && dist2(rgbAt(px), bg) >= farthest / 4);
  };
  const own = new Map<number, Rgb | null>(shape.map((i) => [i, ownColour(i)]));
  // A filled pinhole has no shape pixels; it borrows a neighbour's colour.
  const colourOf = (i: number): Rgb =>
    own.get(i) ?? [i - 1, i + 1, i - cols, i + cols].map((n) => own.get(n)).find((c) => c) ?? cells[i].rgb;
  const { labels, centres } = quantize(
    shape.map(colourOf),
    opts.colors,
  );
  const chars = new Array(cols * rows).fill('.');
  shape.forEach((i, j) => (chars[i] = String(labels[j])));
  const mask = Array.from({ length: rows }, (_, y) => chars.slice(y * cols, (y + 1) * cols).join(''));
  return { mask, palette: centres.map(hex), cells: shape.length };
}
