import { describe, expect, test } from 'vitest';
import { gridSize, MAX_ROWS, pictureToLevel } from './picture';
import { BLACK, BLUE, paint, RED, WHITE, type Rgba } from './test-helpers';

const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const square = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) ? BLACK : WHITE));
const filled = (mask: string[]) => mask.flatMap((row, y) => [...row].flatMap((ch, x) => (ch === '.' ? [] : [`${x},${y}`])));

describe('gridSize', () => {
  test('keeps the aspect ratio and caps rows at 80', () => {
    expect(MAX_ROWS).toBe(80);
    expect(gridSize(100, 300, 20)).toEqual({ cols: 20, rows: 60 });
    expect(gridSize(100, 500, 20)).toEqual({ cols: 16, rows: 80 });
    expect(gridSize(200, 100, 20)).toEqual({ cols: 20, rows: 10 });
  });
});

describe('pictureToLevel', () => {
  test("'auto' colours match 4 colours and add a background", () => {
    const { background, ...auto } = pictureToLevel(square, { cols: 10, colors: 'auto', invert: false });
    const { background: _, ...four } = pictureToLevel(square, { cols: 10, colors: 4, invert: false });
    expect(auto).toEqual(four);
    expect(background).toBe('light');
  });

  test('a light palette gets the dark background', () => {
    const light = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) ? WHITE : BLACK));
    expect(pictureToLevel(light, { cols: 10, colors: 4, invert: false }).background).toBe('dark');
  });

  test('a black square on white becomes a block of cells', () => {
    const { mask, palette, cells } = pictureToLevel(square, { cols: 10, colors: 4, invert: false });
    expect(mask).toHaveLength(10);
    expect(mask.every((r) => r.length === 10)).toBe(true);
    expect(cells).toBe(36);
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) expect(mask[y][x] !== '.', `${x},${y}`).toBe(x >= 2 && x <= 7 && y >= 2 && y <= 7);
    }
    expect(palette).toEqual(['#000000']);
    expect(mask.join('')).toMatch(/^[.0]+$/);
  });

  test('invert swaps shape and background', () => {
    const { cells, mask } = pictureToLevel(square, { cols: 10, colors: 4, invert: true });
    expect(cells).toBe(64);
    expect(mask[0][0]).not.toBe('.');
    expect(mask[5][5]).toBe('.');
  });

  test('transparency, not brightness, decides the shape of a PNG with alpha', () => {
    const circle = paint(100, 100, (x, y) => ((x - 50) ** 2 + (y - 50) ** 2 <= 30 ** 2 ? WHITE : [0, 0, 0, 0]));
    const { mask, cells } = pictureToLevel(circle, { cols: 10, colors: 4, invert: false });
    expect(mask[5][5]).not.toBe('.');
    expect(mask[0][0]).toBe('.');
    expect(cells).toBeGreaterThan(20);
  });

  test('two colours become two regions with a palette of two', () => {
    const twoTone = paint(100, 100, (x, y) => (inBox(x, y, 10, 20, 49, 79) ? RED : inBox(x, y, 50, 20, 89, 79) ? BLUE : WHITE));
    const { mask, palette } = pictureToLevel(twoTone, { cols: 10, colors: 4, invert: false });
    expect(palette).toHaveLength(2);
    expect(palette.every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    const left = new Set([1, 2, 3, 4].flatMap((x) => [2, 3, 4, 5, 6, 7].map((y) => mask[y][x])));
    const right = new Set([5, 6, 7, 8].flatMap((x) => [2, 3, 4, 5, 6, 7].map((y) => mask[y][x])));
    expect(left.size).toBe(1);
    expect(right.size).toBe(1);
    expect([...left][0]).not.toBe([...right][0]);
    expect(palette[Number([...left][0])]).toBe('#dc1e1e');
  });

  test('specks smaller than 3 cells are removed and pinholes filled', () => {
    const speckled = paint(100, 100, (x, y) =>
      inBox(x, y, 0, 90, 9, 99) || (inBox(x, y, 20, 20, 79, 79) && !inBox(x, y, 50, 50, 59, 59)) ? BLACK : WHITE,
    );
    const { mask, cells } = pictureToLevel(speckled, { cols: 10, colors: 4, invert: false });
    expect(mask[9][0]).toBe('.');
    expect(mask[5][5]).not.toBe('.');
    expect(cells).toBe(36);
  });

  test.each([
    ['blue', [0, 0, 255, 255]],
    ['green', [0, 128, 0, 255]],
] as const)('a flat %s square on white keeps its shape', (_, colour) => {
    const flat = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) ? [...colour] : WHITE));
    expect(pictureToLevel(flat, { cols: 10, colors: 4, invert: false }).cells).toBe(36);
    expect(pictureToLevel(flat, { cols: 10, colors: 4, invert: true }).cells).toBe(64);
  });

  test('anti-aliased edges do not add colours', () => {
    const circle = paint(200, 200, (x, y) => {
      const edge = Math.hypot(x + 0.5 - 100, y + 0.5 - 100) - 70;
      const ink = Math.min(1, Math.max(0, 0.5 - edge / 3));
      const v = Math.round(255 * (1 - ink));
      return [v, v, v, 255];
    });
    const { palette } = pictureToLevel(circle, { cols: 20, colors: 4, invert: false });
    expect(palette).toHaveLength(1);
    expect([1, 3, 5].map((i) => parseInt(palette[0].slice(i, i + 2), 16)).every((v) => v <= 8)).toBe(true);
  });

  test('thin coloured lines on black are found without invert and keep their colour', () => {
    const GREEN: Rgba = [48, 192, 48, 255];
    const lines = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) && x % 10 < 2 ? GREEN : [0, 0, 0, 255]));
    const { palette, cells } = pictureToLevel(lines, { cols: 10, colors: 4, invert: false });
    expect(cells).toBe(36);
    expect(palette).toEqual(['#30c030']);
  });

  test('light parts of a subject on a white background are kept', () => {
    const HAIR: Rgba = [40, 30, 20, 255];
    const SKIN: Rgba = [232, 205, 185, 255];
    const portrait = paint(100, 100, (x, y) => (inBox(x, y, 20, 10, 79, 39) ? HAIR : inBox(x, y, 20, 40, 79, 89) ? SKIN : WHITE));
    const { mask, cells } = pictureToLevel(portrait, { cols: 10, colors: 4, invert: false });
    expect(cells).toBe(48);
    expect(mask[6][5]).not.toBe('.');
    expect(mask[2][5]).not.toBe(mask[6][5]);
  });

  test('a subject cropped at the bottom and sides still counts as on a plain background', () => {
    const HAIR: Rgba = [40, 30, 20, 255];
    const SKIN: Rgba = [232, 205, 185, 255];
    // About 56% of the border stays white: the skin runs off the bottom and both sides.
    const cropped = paint(100, 100, (x, y) => (y >= 60 ? SKIN : inBox(x, y, 20, 30, 79, 59) ? HAIR : WHITE));
    const { mask, cells } = pictureToLevel(cropped, { cols: 10, colors: 4, invert: false });
    expect(cells).toBe(58);
    expect(mask[9]).not.toContain('.');
  });

  test('a busy border falls back to the brightness split', () => {
    const halves = paint(100, 100, (x) => (x < 50 ? BLACK : WHITE));
    const { mask, cells } = pictureToLevel(halves, { cols: 10, colors: 4, invert: false });
    expect(cells).toBe(50);
    expect(mask.every((row) => row.slice(0, 5) === '00000' && row.slice(5) === '.....')).toBe(true);
  });

  test('a plain picture has no shape', () => {
    const grey = paint(60, 60, () => [128, 128, 128, 255]);
    expect(pictureToLevel(grey, { cols: 12, colors: 4, invert: false }).cells).toBe(0);
    expect(filled(pictureToLevel(grey, { cols: 12, colors: 4, invert: true }).mask)).toEqual([]);
  });

  test('is deterministic', () => {
    const noisy = paint(80, 80, (x, y) => [(x * 37 + y * 11) % 256, (x * 7) % 256, (y * 13) % 256, 255]);
    const opts = { cols: 16, colors: 5, invert: false };
    expect(pictureToLevel(noisy, opts)).toEqual(pictureToLevel(noisy, opts));
  });
});

describe('auto colours', () => {
  const auto = { colors: 'auto' as const, invert: false };

  test('gridSize allows 80 rows', () => {
    expect(gridSize(100, 300, 40)).toEqual({ cols: 27, rows: 80 });
  });

  test('a flat logo gets one colour and two tones get two', () => {
    expect(pictureToLevel(square, { cols: 10, ...auto }).palette).toHaveLength(1);
    const twoTone = paint(100, 100, (x, y) => (inBox(x, y, 10, 20, 49, 79) ? RED : inBox(x, y, 50, 20, 89, 79) ? BLUE : WHITE));
    expect(pictureToLevel(twoTone, { cols: 10, ...auto }).palette).toHaveLength(2);
  });

  test('small strongly contrasting details keep their own colour', () => {
    const SKIN: Rgba = [232, 205, 185, 255];
    const EYE: Rgba = [40, 30, 20, 255];
    const face = paint(60, 60, (x, y) =>
      inBox(x, y, 21, 24, 24, 27) || inBox(x, y, 35, 24, 38, 27) ? EYE : inBox(x, y, 15, 15, 44, 44) ? SKIN : WHITE,
    );
    const { mask, palette } = pictureToLevel(face, { cols: 40, ...auto });
    expect(palette.length).toBeGreaterThanOrEqual(2);
    expect(mask[17][15]).not.toBe('.');
    expect(mask[17][15]).not.toBe(mask[26][20]);
  });

  test('many distinct colours are capped at 10, or at the number asked for', () => {
    const colours: Rgba[] = [
      [220, 30, 30, 255], [30, 160, 40, 255], [30, 40, 220, 255], [200, 200, 0, 255],
      [200, 0, 200, 255], [0, 160, 160, 255], [240, 130, 0, 255], [110, 40, 150, 255],
      [0, 0, 0, 255], [110, 110, 110, 255], [120, 70, 30, 255], [0, 30, 90, 255],
    ];
    const blocks = paint(100, 80, (x, y) =>
      x < 10 || x >= 90 || y < 10 || y >= 70 ? WHITE : colours[Math.floor((y - 10) / 20) * 4 + Math.floor((x - 10) / 20)],
    );
    expect(pictureToLevel(blocks, { cols: 50, ...auto }).palette).toHaveLength(10);
    expect(pictureToLevel(blocks, { cols: 50, colors: 3, invert: false }).palette).toHaveLength(3);
  });

  test('dark colours get a light board and pale colours a dark one', () => {
    const dress = paint(100, 100, (x, y) => (inBox(x, y, 30, 10, 69, 49) ? [0x57, 0x1d, 0x24, 255] : inBox(x, y, 30, 50, 69, 89) ? [0x8c, 0x35, 0x3d, 255] : WHITE));
    expect(pictureToLevel(dress, { cols: 20, ...auto }).background).toBe('light');
    const pale = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 79, 79) ? [250, 240, 150, 255] : BLACK));
    expect(pictureToLevel(pale, { cols: 20, ...auto }).background).toBe('dark');
  });

  test('the board background follows the least visible colour, not the average', () => {
    // Black reads well on the light board but near-white almost vanishes there; on the
    // dark board both stay visible, so the minimum contrast picks dark.
    const GREY: Rgba = [128, 128, 128, 255];
    const mixed = paint(100, 100, (x, y) => (inBox(x, y, 20, 20, 49, 79) ? BLACK : inBox(x, y, 50, 20, 79, 79) ? [240, 240, 240, 255] : GREY));
    const { palette, background } = pictureToLevel(mixed, { cols: 20, ...auto });
    expect(palette).toHaveLength(2);
    expect(background).toBe('dark');
  });

  test('an outlined sprite on transparent pixels keeps its outline colour', () => {
    // Transparent pixels hold rgba(0,0,0,0), as getImageData usually returns them.
    const ORANGE: Rgba = [240, 120, 0, 255];
    const OUTLINE: Rgba = [80, 40, 0, 255];
    const sprite = paint(100, 100, (x, y) =>
      inBox(x, y, 25, 25, 74, 74) ? ORANGE : inBox(x, y, 20, 20, 79, 79) ? OUTLINE : [0, 0, 0, 0],
    );
    const { mask, palette } = pictureToLevel(sprite, { cols: 20, ...auto });
    expect(palette).toHaveLength(2);
    expect(mask[10][4]).not.toBe(mask[10][10]);
  });

  test('anti-aliased edges still give one colour with auto', () => {
    const circle = paint(200, 200, (x, y) => {
      const edge = Math.hypot(x + 0.5 - 100, y + 0.5 - 100) - 70;
      const v = Math.round(255 * (1 - Math.min(1, Math.max(0, 0.5 - edge / 3))));
      return [v, v, v, 255];
    });
    expect(pictureToLevel(circle, { cols: 20, ...auto }).palette).toHaveLength(1);
  });

  test('auto is deterministic', () => {
    const noisy = paint(80, 80, (x, y) => [(x * 37 + y * 11) % 256, (x * 7) % 256, (y * 13) % 256, 255]);
    expect(pictureToLevel(noisy, { cols: 16, ...auto })).toEqual(pictureToLevel(noisy, { cols: 16, ...auto }));
  });

  test('a tiny shape still gets a palette', () => {
    // Three 5 px cells in a row at cols 6: the smallest shape the speck rule keeps.
    const tiny = paint(30, 30, (x, y) => (inBox(x, y, 10, 10, 24, 14) ? RED : WHITE));
    const { palette, cells } = pictureToLevel(tiny, { cols: 6, ...auto });
    expect(cells).toBe(3);
    expect(palette.length).toBeGreaterThanOrEqual(1);
  });
});
