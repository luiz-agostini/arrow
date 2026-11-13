export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

export const MAX_ROWS = 40;
const OPAQUE = 128;
const TRANSPARENT_SHARE = 0.01;
const MIN_CONTRAST = 16;
const MIN_GROUP = 3;
const KMEANS_ROUNDS = 10;

type Rgb = [number, number, number];
type CellColour = { rgb: Rgb; alpha: number; lum: number };

/** Grid dimensions for a picture: `cols` wide unless that would need more than MAX_ROWS rows. */
export function gridSize(width: number, height: number, cols: number): { cols: number; rows: number } {
  let cell = width / cols;
  if (height / cell > MAX_ROWS) cell = height / MAX_ROWS;
  return { cols: Math.max(1, Math.round(width / cell)), rows: Math.max(1, Math.round(height / cell)) };
}

/** Box-averages the picture into cells; colour is averaged over opaque pixels only. */
function averageCells(p: Pixels, cols: number, rows: number): CellColour[] {
  const out: CellColour[] = [];
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const [x0, x1] = [Math.floor((gx * p.width) / cols), Math.floor(((gx + 1) * p.width) / cols)];
      const [y0, y1] = [Math.floor((gy * p.height) / rows), Math.floor(((gy + 1) * p.height) / rows)];
      const sum = [0, 0, 0];
      let alpha = 0;
      let opaque = 0;
      let n = 0;
      for (let y = y0; y < Math.max(y1, y0 + 1); y++) {
        for (let x = x0; x < Math.max(x1, x0 + 1); x++) {
          const i = (y * p.width + x) * 4;
          alpha += p.data[i + 3];
          n++;
          if (p.data[i + 3] >= OPAQUE) {
            sum[0] += p.data[i];
            sum[1] += p.data[i + 1];
            sum[2] += p.data[i + 2];
            opaque++;
          }
        }
      }
      const rgb = sum.map((v) => (opaque ? v / opaque : 255)) as Rgb;
      out.push({ rgb, alpha: alpha / n, lum: 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2] });
    }
  }
  return out;
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
  const order = centres
    .map((_, i) => ({ i, n: labels.filter((l) => l === i).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const rank = new Map(order.map((c, r) => [c.i, r]));
  return { labels: labels.map((l) => rank.get(l)!), centres: order.map((c) => centres[c.i]) };
}

/**
 * Turns a picture into a region mask and palette. Shape cells are the opaque ones
 * when the picture has transparency, otherwise the darker side of an Otsu split
 * (swapped by `invert`). Small specks are dropped and pinholes filled.
 */
export function pictureToLevel(
  p: Pixels,
  opts: { cols: number; colors: number; invert: boolean },
): { mask: string[]; palette: string[]; cells: number } {
  const { cols, rows } = gridSize(p.width, p.height, opts.cols);
  const cells = averageCells(p, cols, rows);
  let transparent = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < OPAQUE) transparent++;

  let on: boolean[];
  if (transparent / (p.width * p.height) >= TRANSPARENT_SHARE) {
    on = cells.map((c) => (c.alpha >= OPAQUE) !== opts.invert);
  } else {
    const lums = cells.map((c) => c.lum);
    const flat = Math.max(...lums) - Math.min(...lums) < MIN_CONTRAST;
    const t = otsu(lums);
    on = cells.map((c) => !flat && (Math.round(c.lum) <= t) !== opts.invert);
  }

  for (const g of groups(on, cols, rows, true)) if (g.length < MIN_GROUP) for (const i of g) on[i] = false;
  for (const g of groups(on, cols, rows, false)) {
    const enclosed = g.every((i) => i % cols > 0 && i % cols < cols - 1 && i >= cols && i < cols * (rows - 1));
    if (enclosed && g.length < MIN_GROUP) for (const i of g) on[i] = true;
  }

  const shape = on.flatMap((v, i) => (v ? [i] : []));
  if (!shape.length) return { mask: Array.from({ length: rows }, () => '.'.repeat(cols)), palette: [], cells: 0 };
  const { labels, centres } = quantize(
    shape.map((i) => cells[i].rgb),
    opts.colors,
  );
  const chars = new Array(cols * rows).fill('.');
  shape.forEach((i, j) => (chars[i] = String(labels[j])));
  const mask = Array.from({ length: rows }, (_, y) => chars.slice(y * cols, (y + 1) * cols).join(''));
  return { mask, palette: centres.map(hex), cells: shape.length };
}
