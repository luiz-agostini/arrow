# 00-contracts: Shared types and signatures for high-fidelity picture levels

Status: ready
Depends on: none
Size: S

## Goal
Change every shared type and signature that the parallel specs build against, with minimal working stand-ins, so specs 01–04 can be built at the same time without touching each other's files. Nothing visible changes for players.

## Owns (files and directories this spec may change)
- `src/model.ts`, `src/model.test.ts` (`regionAt` accepts `0`–`9`)
- `src/levels.ts` (the `Level` type only, not level data), `src/levels.test.ts`
- `src/colors.ts`, `src/colors.test.ts` (adds `toLab`, `deltaE`)
- `src/picture.ts` (signature and return-type change only), `src/picture.test.ts` (tests for the new signature)
- `src/render.ts` (signature change only), `src/render.test.ts` (call sites)
- `src/editor.ts` and `src/main.ts` (call sites of `mountBoard` and `pictureToLevel` only)

## Must not touch
- `src/generate.ts`, `src/solve.ts`, `src/style.css`, level data in `src/levels.ts`, snapshots.

## Interfaces and contracts
```ts
// model.ts
export function regionAt(mask: string[], c: Cell): number | null; // '#' → 0, '0'–'9' → digit, else null

// levels.ts
export type Level = { name: string; mask: string[]; seed: number; palette?: string[]; background?: 'light' | 'dark' };

// colors.ts (fully implemented here)
export function toLab(rgb: [number, number, number]): [number, number, number]; // sRGB → CIE Lab, D65
export function deltaE(a: string, b: string): number;                             // CIE76 between two #rrggbb

// picture.ts (signature here; real behaviour in 02-colour)
export const MAX_ROWS = 80;
export function pictureToLevel(
  p: Pixels,
  opts: { cols: number; colors: number | 'auto'; invert: boolean },
): { mask: string[]; palette: string[]; cells: number; background: 'light' | 'dark' };
// Stand-in: 'auto' behaves as 4; background is 'light' unless the palette's mean
// contrast against LIGHT_BG is lower than against DARK_BG, then 'dark'.

// render.ts (signature here; real behaviour in 03-board)
export type BoardOptions = {
  palette?: string[];
  background?: 'light' | 'dark';
  toCell?: (clientX: number, clientY: number) => { x: number; y: number }; // tests only
};
export function mountBoard(svg: SVGSVGElement, b: Board, onTap: (id: number) => void, opts?: BoardOptions): BoardView;
export type BoardView = {
  slideOut(id: number): Promise<void>;
  flashBlocked(id: number, blocker: number): void;
  highlight(id: number): void;
  zoom(factor: number): void; // stand-in: no-op
  fit(): void;                // stand-in: no-op
};

// Markup and class names used across specs
// svg[data-bg="light"|"dark"]   board background chosen by a level
// g.arrow.aim                   arrow previewed under the pointer
// svg.magnifier                 loupe shown during a touch press
// .zoom-controls > button[data-action="zoom-in"|"zoom-out"|"zoom-fit"]
```
Call sites: `main.ts` passes `{ palette: level.palette, background: level.background }`; `editor.ts` passes `{ palette, background }` from `pictureToLevel`.

## Global constraints
- **Decisions in force:**
  - 0003: arrows are SVG elements tagged with `data-id` (a visible path, a head and a transparent hit path), with no canvas drawing.
  - 0004: only `render.ts`, `editor.ts` and `main.ts` touch the DOM; all other modules are pure.
  - 0006: a level is `{ name, mask, seed, palette?, background? }`, with mask characters `.`, `0`–`9` or `#` (alias of `0`), and boards come only from `generate(mask, seed)`.
  - 0007: board taps resolve with `pickArrow` and commit on release.
- Palette entries are lowercase `#rrggbb`.
- Lab uses the D65 white point; ΔE is CIE76.

## Behavior
1. `regionAt(['9'], {x:0,y:0})` is 9 and `regionAt(['a'], {x:0,y:0})` is null; every existing case still holds.
2. `pictureToLevel(p, { cols, colors: 'auto', invert })` returns the same mask and palette as `colors: 4`, plus a `background`.
3. `mountBoard(svg, b, onTap, { palette })` behaves exactly like today's `mountBoard(svg, b, onTap, palette)`.
4. All six shape levels and sixteen photo levels produce identical boards (the snapshots don't change).

## Acceptance criteria (each must be checkable by a test or command)
- [ ] `toLab([255,255,255])` is within 0.5 of `[100, 0, 0]` and `toLab([0,0,0])` equals `[0, 0, 0]`.
- [ ] `deltaE('#ff0000', '#ff0000')` is 0 and `deltaE('#000000', '#ffffff')` is within 0.5 of 100.
- [ ] `regionAt` cases above pass; the `levels.test.ts` character check accepts `/^[#.0-9]+$/`; any `background` present is `'light'` or `'dark'`.
- [ ] `pictureToLevel(square, { cols: 10, colors: 'auto', invert: false })` deep-equals the `colors: 4` result except for `background`, which is `'light'` for the black square.
- [ ] `npm test` passes with 0 snapshots changed, and `npm run build` succeeds.

## Review focus
- **Call-site parity:** a call site still passing a bare palette array instead of an options object. The type check catches this, so `npm run build` must pass.
- **Rounding:** `toLab` rounding drift. Test against the white and black reference values with an exact tolerance of 0.5.

## Out of scope
- Real Auto colour selection, Lab grouping or background choice beyond the stand-in (02).
- Zoom, pointer handling or the magnifier (03).
- Generator changes (01).

## Hints
- Current call sites: `src/editor.ts:80` and `src/main.ts:135`.
- The `fitContrast` and `contrastRatio` helpers in `src/colors.ts` support the stand-in background choice.

## Implementation notes
- [x] colors: `toLab`, `deltaE` (tests first)
- [x] model: `regionAt` accepts `0`–`9` (existing `'6'` → null case flips to 6, required by Behavior 1)
- [x] levels: `Level.background`, character check `/^[#.0-9]+$/`, background check
- [x] picture: `colors: number | 'auto'`, `background` stand-in, `MAX_ROWS = 80` (updates the `gridSize` test, which assumed 40)
- [x] render: `BoardOptions` object, `zoom`/`fit` no-ops; update call sites in render.test, editor, main
- [x] `npm test`, typecheck; [ ] `vite build` (permission prompt blocked it in this session); review

Decisions:
- `MAX_ROWS` moved from 40 to 80 because the Interfaces section lists it; built-in levels store masks, so no board changes.
- Empty palette (no shape) reports `background: 'light'`.
- The editor passes `background` to `mountBoard` but doesn't yet store it on the playable `Level`; that is left to 02/03 to keep this change to call sites.
- `background` and `toCell` are accepted by `mountBoard` but unused until 03.

## Result
