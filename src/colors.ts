export const LIGHT_BG = '#f3ecdf';
export const DARK_BG = '#171a26';

type Rgb = [number, number, number];

const parse = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (rgb: Rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;
const WHITE_D65: Rgb = [0.95047, 1, 1.08883];

/** sRGB (0–255) to CIE Lab with the D65 white point. */
export function toLab(rgb: Rgb): Rgb {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const xyz = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ].map((v, i) => v / WHITE_D65[i]);
  const [fx, fy, fz] = xyz.map((t) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116));
  const l = xyz[1] > EPSILON ? 116 * fy - 16 : KAPPA * xyz[1];
  return [l, 500 * (fx - fy), 200 * (fy - fz)];
}

/** CIE76 colour difference between two `#rrggbb` colours. */
export function deltaE(a: string, b: string): number {
  const [la, lb] = [toLab(parse(a)), toLab(parse(b))];
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function toHsl([r, g, b]: Rgb): Rgb {
  [r, g, b] = [r / 255, g / 255, b / 255];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function toRgb([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255];
}

/**
 * Moves the colour's lightness away from the background, in 2% steps, until the
 * contrast reaches `min`. Hue and saturation are kept.
 */
export function fitContrast(color: string, bg: string, min = 3): string {
  if (contrastRatio(color, bg) >= min) return color;
  const [h, s, l] = toHsl(parse(color));
  const first = luminance(color) <= luminance(bg) ? -1 : 1;
  for (const dir of [first, -first]) {
    for (let next = l + dir * 0.02; next >= 0 && next <= 1; next += dir * 0.02) {
      const out = toHex(toRgb([h, s, next]));
      if (contrastRatio(out, bg) >= min) return out;
    }
  }
  return luminance(bg) > 0.5 ? '#000000' : '#ffffff';
}

/** How much `vivid` multiplies saturation, and the power it raises lightness to (below 1 lifts darks). */
const VIVID_SATURATION = 1.6;
const VIVID_LIGHTNESS_POWER = 0.8;
/** Colours this close to grey keep their saturation, so whites, greys and blacks stay neutral. */
const VIVID_GREY = 0.08;

/**
 * Brightens a colour averaged from a photo: more saturated, with dark tones lifted, and
 * the hue kept. Averaging a region's pixels mixes in its shading, which mutes colours.
 */
export function vivid(color: string): string {
  const [h, s, l] = toHsl(parse(color));
  return toHex(toRgb([h, s > VIVID_GREY ? Math.min(1, s * VIVID_SATURATION) : s, l ** VIVID_LIGHTNESS_POWER]));
}
