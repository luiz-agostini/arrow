import { describe, expect, test } from 'vitest';
import { contrastRatio, DARK_BG, deltaE, fitContrast, LIGHT_BG, toLab, vivid } from './colors';
import css from './style.css?raw';

describe('toLab', () => {
  test('maps white and black to the D65 reference values', () => {
    const white = toLab([255, 255, 255]);
    [100, 0, 0].forEach((v, i) => expect(Math.abs(white[i] - v)).toBeLessThanOrEqual(0.5));
    expect(toLab([0, 0, 0]).map((v) => v + 0)).toEqual([0, 0, 0]);
  });
});

describe('deltaE', () => {
  test('is 0 for equal colours and about 100 from black to white', () => {
    expect(deltaE('#ff0000', '#ff0000')).toBe(0);
    expect(Math.abs(deltaE('#000000', '#ffffff') - 100)).toBeLessThanOrEqual(0.5);
  });
});

const luminanceOf = (hex: string) => contrastRatio(hex, '#000000');

describe('contrastRatio', () => {
  test('matches the WCAG extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
    expect(contrastRatio('#777777', '#777777')).toBe(1);
  });
});

describe('fitContrast', () => {
  test('keeps a colour that already contrasts', () => {
    expect(fitContrast('#000000', LIGHT_BG)).toBe('#000000');
  });

  test('darkens a pale colour on the light background', () => {
    const out = fitContrast('#f0e8d8', LIGHT_BG);
    expect(out).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastRatio(out, LIGHT_BG)).toBeGreaterThanOrEqual(3);
    expect(luminanceOf(out)).toBeLessThan(luminanceOf('#f0e8d8'));
  });

  test('lightens a dark colour on the dark background', () => {
    const out = fitContrast('#1a1d2a', DARK_BG);
    expect(contrastRatio(out, DARK_BG)).toBeGreaterThanOrEqual(3);
    expect(luminanceOf(out)).toBeGreaterThan(luminanceOf('#1a1d2a'));
  });

  test('keeps the hue of a saturated colour', () => {
    const out = fitContrast('#ffff00', LIGHT_BG);
    expect(contrastRatio(out, LIGHT_BG)).toBeGreaterThanOrEqual(3);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    expect(b).toBeLessThan(r);
    expect(Math.abs(r - g)).toBeLessThanOrEqual(2);
  });
});

describe('vivid', () => {
  const hsl = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const [max, min] = [Math.max(r, g, b), Math.min(r, g, b)];
    const l = (max + min) / 2;
    const s = max === min ? 0 : (max - min) / (l > 0.5 ? 2 - max - min : max + min);
    return { s, l };
  };

  test('makes a muted photo red clearly red: more saturated and lighter', () => {
    const out = vivid('#6b1d29');
    expect(hsl(out).s).toBeGreaterThan(hsl('#6b1d29').s);
    expect(hsl(out).l).toBeGreaterThan(hsl('#6b1d29').l);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(out.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(2 * Math.max(g, b));
  });

  test('keeps white, black and greys neutral', () => {
    expect(vivid('#000000')).toBe('#000000');
    expect(vivid('#ffffff')).toBe('#ffffff');
    expect(hsl(vivid('#808080')).s).toBe(0);
    expect(hsl(vivid('#857f7c')).s).toBeCloseTo(hsl('#857f7c').s, 1);
  });

  test('never darkens a colour', () => {
    for (const c of ['#2a3b4c', '#c49a7e', '#ebaf81', '#123456']) expect(hsl(vivid(c)).l).toBeGreaterThanOrEqual(hsl(c).l);
  });
});

test('backgrounds match the stylesheet', () => {
  expect(css).toContain(LIGHT_BG);
  expect(css).toContain(DARK_BG);
});
