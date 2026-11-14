import { regionAt } from '../model';
import { mulberry32, shuffle } from '../rng';

export type Shooter = { id: number; color: number; ammo: number };
export type EsteiraLevel = {
  name: string;
  width: number;
  height: number;
  cells: (number | null)[];
  palette: string[];
  columns: Shooter[][];
};

export const COLUMNS = 5;
export const MAX_AMMO = 20;

/**
 * Shrinks a region mask to at most `maxW`×`maxH` blocks. Each block takes the most
 * common colour of its source cells (lowest index on ties), or is empty when more than
 * half of them are empty. Cells are row-major colour indices.
 */
export function downsample(mask: string[], maxW = 24, maxH = 32): { width: number; height: number; cells: (number | null)[] } {
  const srcH = mask.length;
  const srcW = mask[0]?.length ?? 0;
  const scale = Math.max(srcW / maxW, srcH / maxH, 1);
  const width = Math.max(1, Math.round(srcW / scale));
  const height = Math.max(1, Math.round(srcH / scale));
  const cells: (number | null)[] = [];
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const counts = new Map<number, number>();
      let empty = 0;
      let total = 0;
      for (let y = Math.floor((ty * srcH) / height); y < Math.floor(((ty + 1) * srcH) / height); y++) {
        for (let x = Math.floor((tx * srcW) / width); x < Math.floor(((tx + 1) * srcW) / width); x++) {
          total++;
          const r = regionAt(mask, { x, y });
          if (r === null) empty++;
          else counts.set(r, (counts.get(r) ?? 0) + 1);
        }
      }
      if (empty * 2 > total || counts.size === 0) {
        cells.push(null);
        continue;
      }
      const [best] = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      cells.push(best);
    }
  }
  return { width, height, cells };
}

/**
 * Splits each colour's block count into shooters of 10 or 20 ammo (the last one takes
 * whatever is left, up to 20), shuffles them and deals them round-robin into 5 columns.
 */
export function dealShooters(cells: (number | null)[], seed: number): Shooter[][] {
  const rand = mulberry32(seed);
  const counts = new Map<number, number>();
  for (const c of cells) if (c !== null) counts.set(c, (counts.get(c) ?? 0) + 1);
  const shooters: Shooter[] = [];
  for (const [color, total] of [...counts].sort((a, b) => a[0] - b[0])) {
    for (let left = total; left > 0; ) {
      const ammo = left <= MAX_AMMO ? left : rand() < 0.5 ? 10 : 20;
      shooters.push({ id: shooters.length + 1, color, ammo });
      left -= ammo;
    }
  }
  const columns: Shooter[][] = Array.from({ length: COLUMNS }, () => []);
  shuffle(shooters, rand).forEach((s, i) => columns[i % COLUMNS].push(s));
  return columns;
}
