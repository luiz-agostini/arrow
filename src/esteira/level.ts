import { LEVELS, type Level } from '../levels';
import { regionAt } from '../model';
import { mulberry32, shuffle } from '../rng';
import { BELT_CAPACITY, exposedColors, lapLength, launch, newGame, tick } from './sim';

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
 * Splits each colour's block count into shooters of 10 or 20 ammo (seeded), plus one
 * smaller shooter for a remainder under 10, shuffles them and deals them round-robin
 * into 5 columns.
 */
export function dealShooters(cells: (number | null)[], seed: number): Shooter[][] {
  const rand = mulberry32(seed);
  const counts = new Map<number, number>();
  for (const c of cells) if (c !== null) counts.set(c, (counts.get(c) ?? 0) + 1);
  const shooters: Shooter[] = [];
  for (const [color, total] of [...counts].sort((a, b) => a[0] - b[0])) {
    let left = total;
    while (left >= 10) {
      const ammo = left >= MAX_AMMO && rand() < 0.5 ? MAX_AMMO : 10;
      shooters.push({ id: shooters.length + 1, color, ammo });
      left -= ammo;
    }
    if (left > 0) shooters.push({ id: shooters.length + 1, color, ammo: left });
  }
  const columns: Shooter[][] = Array.from({ length: COLUMNS }, () => []);
  shuffle(shooters, rand).forEach((s, i) => columns[i % COLUMNS].push(s));
  return columns;
}

/** Seeds tried per photo level before giving up on a winnable deal. */
const MAX_DEALS = 100;

/**
 * A simple player: whenever the belt has room, launch a parked or front shooter whose
 * colour has an exposed block and isn't already riding. It gives up when nothing can be
 * launched and the belt is empty. True if that wins.
 */
export function greedyWins(level: EsteiraLevel): boolean {
  let s = newGame(level);
  const limit = lapLength(level.width, level.height) * (level.columns.flat().length + 1) * 4;
  for (let i = 0; i < limit && s.status === 'playing'; i++) {
    if (s.belt.length < BELT_CAPACITY) {
      const exposed = exposedColors(s);
      const riding = new Set(s.belt.map((b) => b.shooter.color));
      const useful = (sh: Shooter | null | undefined) => !!sh && exposed.has(sh.color) && !riding.has(sh.color);
      const slot = s.slots.findIndex(useful);
      const column = s.columns.findIndex((c) => useful(c[0]));
      if (slot >= 0) s = launch(s, { slot });
      else if (column >= 0) s = launch(s, { column });
      else if (s.belt.length === 0) return false;
    }
    s = tick(s);
  }
  return s.status === 'won';
}

/**
 * One Esteira level per photo level: the photo's mask shrunk to blocks, with shooters
 * dealt from the level's seed upwards until the greedy player can win.
 */
export function esteiraLevels(): EsteiraLevel[] {
  return LEVELS.filter((l) => l.palette).map(buildEsteiraLevel);
}

/** The Esteira level for one photo level, from its seed upwards until greedy can win. */
export function buildEsteiraLevel(photo: Level): EsteiraLevel {
  const { width, height, cells } = downsample(photo.mask);
  for (let seed = photo.seed; seed < photo.seed + MAX_DEALS; seed++) {
    const level = { name: photo.name, width, height, cells, palette: photo.palette!, columns: dealShooters(cells, seed) };
    if (greedyWins(level)) return level;
  }
  throw new Error(`No winnable deal for ${photo.name}`);
}
