import { contrastRatio, DARK_BG, LIGHT_BG, toLab, vivid } from './colors';

export type Pixels = { width: number; height: number; data: Uint8ClampedArray };

export const MAX_ROWS = 80;
/** Most colours a picture gets; `colors: 'auto'` grows up to this. */
const MAX_COLORS = 10;
/** A new colour group is only seeded this far (ΔE, Lab) from every existing one. */
const AUTO_MIN_DE = 12;
/** A small group survives when it is at least this far (ΔE) from its nearest group. */
const DETAIL_DE = 25;
/** Clustering passes; a pass after the first only runs when outlier seeds were merged away. */
const MAX_PASSES = 4;
const OPAQUE = 128;
const TRANSPARENT_SHARE = 0.01;
const MIN_CONTRAST = 16;
const MIN_GROUP = 3;
const KMEANS_ROUNDS = 10;
/** A pixel this far (RGB distance) from the background colour belongs to the shape. */
const BG_DISTANCE = 32;
/** Colour groups smaller than this share of the shape (or 2 cells) merge unless they're a detail. */
const MIN_GROUP_SHARE = 0.02;
/** An edge cell this close (RGB) to the background→neighbour line is an anti-aliasing blend. */
const BLEND_OFF = 16;
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
 * k-means in Lab over shape-cell colours, seeded by farthest-point picks so it needs
 * no RNG. Seeding stops at `k` groups or when the farthest colour is within
 * AUTO_MIN_DE of every group. Groups that don't survive merge into their nearest; when
 * that frees a slot, another pass reseeds without those outlier colours.
 * Returns a group index per colour and each group's mean RGB, largest group first.
 */
function quantize(colours: Rgb[], k: number): { labels: number[]; centres: Rgb[] } {
  const labs = colours.map(toLab);
  const meanOf = (vs: Rgb[]) => [0, 1, 2].map((ch) => vs.reduce((s, v) => s + v[ch], 0) / vs.length) as Rgb;
  const minSize = Math.max(2, MIN_GROUP_SHARE * colours.length);
  // Seeds whose group was merged away; a later pass doesn't try them again.
  const skipped = new Set<number>();
  let labels: number[] = [];
  let centres: Rgb[] = [];
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const seeds = [labs.findIndex((_, j) => !skipped.has(j))];
    while (seeds.length < k) {
      let far = -1;
      let farD = -1;
      labs.forEach((c, j) => {
        if (skipped.has(j)) return;
        const d = Math.min(...seeds.map((m) => dist2(c, labs[m])));
        if (d > farD) [far, farD] = [j, d];
      });
      if (far < 0 || farD < AUTO_MIN_DE ** 2) break;
      seeds.push(far);
    }
    centres = seeds.map((j) => labs[j]);
    const nearest = (c: Rgb) => centres.reduce((bi, m, i) => (dist2(c, m) < dist2(c, centres[bi]) ? i : bi), 0);
    for (let round = 0; round < KMEANS_ROUNDS; round++) {
      labels = labs.map(nearest);
      centres = centres.map((m, i) => {
        const members = labs.filter((_, j) => labels[j] === i);
        return members.length ? meanOf(members) : m;
      });
    }
    // A group survives when it is big enough, or small but clearly distinct (a detail
    // like eyes or glasses). Others merge into their nearest group, smallest first.
    const doomedSeeds: number[] = [];
    for (;;) {
      const sizes = centres.map((_, i) => labels.filter((l) => l === i).length);
      const live = sizes.flatMap((n, i) => (n > 0 ? [i] : []));
      const nearestOther = (i: number) =>
        live.filter((o) => o !== i).reduce((bi, o) => (dist2(centres[i], centres[o]) < dist2(centres[i], centres[bi]) ? o : bi));
      const survives = (i: number) => sizes[i] >= minSize || (sizes[i] >= 2 && dist2(centres[i], centres[nearestOther(i)]) >= DETAIL_DE ** 2);
      const doomed = live.filter((i) => !survives(i)).sort((a, b) => sizes[a] - sizes[b] || a - b)[0];
      if (live.length < 2 || doomed === undefined) break;
      doomedSeeds.push(seeds[doomed]);
      const into = nearestOther(doomed);
      labels = labels.map((l) => (l === doomed ? into : l));
      centres[into] = meanOf(labs.filter((_, j) => labels[j] === into));
    }
    // Slots freed by merged-away outliers go to the next candidates on another pass.
    const freed = doomedSeeds.filter((j) => !skipped.has(j));
    if (!freed.length || seeds.length < k) break;
    for (const j of freed) skipped.add(j);
  }
  const order = centres
    .map((_, i) => ({ i, n: labels.filter((l) => l === i).length }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n || a.i - b.i);
  const rank = new Map(order.map((c, r) => [c.i, r]));
  return {
    labels: labels.map((l) => rank.get(l)!),
    centres: order.map((c) => meanOf(colours.filter((_, j) => labels[j] === c.i))),
  };
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
  opts: { cols: number; colors: number | 'auto'; invert: boolean },
): { mask: string[]; palette: string[]; cells: number; background: 'light' | 'dark' } {
  const { cols, rows } = gridSize(p.width, p.height, opts.cols);
  const cells = averageCells(p, cols, rows);
  let transparent = 0;
  for (let i = 3; i < p.data.length; i += 4) if (p.data[i] < OPAQUE) transparent++;

  // `shapeSide` decides cells from their averages and, below, which pixels give a cell its colour.
  let shapeSide: (alpha: number, rgb: Rgb) => boolean;
  // Transparency decides the shape when present; only otherwise is a plain background colour used.
  const usesAlpha = transparent / (p.width * p.height) >= TRANSPARENT_SHARE;
  const bg = usesAlpha ? null : plainBackground(p);
  if (usesAlpha) {
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
  if (!shape.length) {
    return { mask: Array.from({ length: rows }, () => '.'.repeat(cols)), palette: [], cells: 0, background: 'light' };
  }
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
  const neighbours = (i: number) =>
    [i % cols > 0 ? i - 1 : -1, i % cols < cols - 1 ? i + 1 : -1, i - cols, i + cols].filter((n) => n >= 0 && n < on.length);
  // A cell on the shape's edge that straddles the background (some of its own pixels
  // are background-coloured) and whose colour is a blend of the background and a
  // neighbouring shape colour is anti-aliasing; it takes that neighbour's colour.
  // Full cells of a tint or shadow hold no background pixels, so they keep theirs.
  const touchesBackground = (i: number) => {
    let found = false;
    eachPixel(p, cols, rows, i, (px) => {
      if (bg && dist2(rgbAt(px), bg) <= BG_DISTANCE ** 2) found = true;
    });
    return found;
  };
  const blendOf = (i: number, c: Rgb): Rgb | null => {
    if (!bg || opts.invert || (neighbours(i).every((n) => on[n]) && neighbours(i).length === 4)) return null;
    if (!touchesBackground(i)) return null;
    for (const n of neighbours(i)) {
      const cn = own.get(n);
      if (!on[n] || !cn) continue;
      const along = [0, 1, 2].map((ch) => cn[ch] - bg[ch]);
      const len2 = along.reduce((s, v) => s + v * v, 0);
      if (len2 === 0) continue;
      const t = [0, 1, 2].reduce((s, ch) => s + (c[ch] - bg[ch]) * along[ch], 0) / len2;
      if (t <= 0 || t >= 1) continue;
      const off = dist2(c, [0, 1, 2].map((ch) => bg[ch] + t * along[ch]) as Rgb);
      if (off <= BLEND_OFF ** 2) return cn;
    }
    return null;
  };
  // A filled pinhole has no shape pixels; it borrows a neighbour's colour.
  const colourOf = (i: number): Rgb => {
    const c = own.get(i);
    if (c) return blendOf(i, c) ?? c;
    return neighbours(i).map((n) => own.get(n)).find((v) => v) ?? cells[i].rgb;
  };
  const { labels, centres } = quantize(
    shape.map(colourOf),
    opts.colors === 'auto' ? MAX_COLORS : Math.min(opts.colors, MAX_COLORS),
  );
  const chars = new Array(cols * rows).fill('.');
  shape.forEach((i, j) => (chars[i] = String(labels[j])));
  const mask = Array.from({ length: rows }, (_, y) => chars.slice(y * cols, (y + 1) * cols).join(''));
  // Group means are muted by the photo's shading, so the palette is brightened afterwards.
  const palette = centres.map((c) => vivid(hex(c)));
  return { mask, palette, cells: shape.length, background: backgroundFor(palette) };
}

/** The board on which the palette's least visible colour stands out most; ties go to 'light'. */
function backgroundFor(palette: string[]): 'light' | 'dark' {
  const worst = (bg: string) => Math.min(...palette.map((c) => contrastRatio(c, bg)));
  return worst(LIGHT_BG) >= worst(DARK_BG) ? 'light' : 'dark';
}
