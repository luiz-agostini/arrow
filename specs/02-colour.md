# 02-colour: Picture colours that match the photo

Status: in-progress
Depends on: 00-contracts
Size: M

## Goal
Picture levels get the colours the photo actually has. The count is chosen per picture by "Auto", grouping happens in Lab, small high-contrast details like eyes and glasses survive, and a board background is chosen to suit the palette.

## Owns (files and directories this spec may change)
- `src/picture.ts`, `src/picture.test.ts`
- `src/test-helpers.ts` (may add synthetic-picture helpers; must not change `checkBoard`)

## Must not touch
- `src/colors.ts` (owned by 00; use `toLab` and `deltaE`), `src/render.ts`, `src/editor.ts`, `src/levels.ts`, `src/generate.ts`.

## Interfaces and contracts
```ts
export const MAX_ROWS = 80;
export function gridSize(width: number, height: number, cols: number): { cols: number; rows: number };
export function pictureToLevel(
  p: Pixels,
  opts: { cols: number; colors: number | 'auto'; invert: boolean },
): { mask: string[]; palette: string[]; cells: number; background: 'light' | 'dark' };
```

## Global constraints
- **Decisions:** 0004 (`picture` is pure) and 0006 (mask characters `.`, `0`–`9`; at most 10 palette entries; `background` is `'light'` or `'dark'`).
- **Colours:**
  - `colors` is `'auto'` or 1–10.
  - `AUTO_MIN_DE = 12`, `DETAIL_DE = 25`.
  - A group survives when it has at least `max(2, 0.02 × shape cells)` cells, or at least 2 cells with ΔE ≥ `DETAIL_DE` from its nearest group.
  - Lab uses D65; ΔE is CIE76.
- **Grid:** `MAX_ROWS = 80`; columns 12–64.

## Behavior
1. Clustering runs in Lab space with the existing deterministic farthest-point seeding; no RNG.
2. **`'auto'`:** grow k from 1 while the next farthest colour is at least `AUTO_MIN_DE` from every centre and its group would survive the rule above; stop at 10.
3. **A number:** use exactly that cap, still applying the survival rule.
4. The `MIN_COLOUR_DIST` and `MIN_GROUP_SHARE` merges are replaced by the survival rule above.
5. **Background:** choose `'light'` when the palette's minimum contrast ratio against `LIGHT_BG` is at least that against `DARK_BG`; otherwise `'dark'`.

## Acceptance criteria (each must be checkable by a test or command)
- [ ] `gridSize(100, 300, 40)` returns `{ cols: 27, rows: 80 }`.
- [ ] **Flat logo:** a black square on white with `'auto'` gives a palette of length 1.
- [ ] **Two tones:** red and blue halves with `'auto'` give length 2.
- [ ] **Kept detail:** a skin-coloured (232,205,185) 30×30 px face with two 4×4 px eyes (40,30,20) on white, at cols 40 and `'auto'`: the eye cells have a different region from the face cells.
- [ ] **Count cap:** twelve 20×20 px blocks of clearly distinct colours give a palette of length 10 with `'auto'`, and length 3 with `colors: 3`.
- [ ] **Background choice:**
  - The palette `['#571d24', '#8c353d']` gives `'light'`.
  - A picture whose shape is pale yellow (250,240,150) on black gives `'dark'`.
- [ ] All existing picture tests pass with numeric `colors`, and `npm test` and `npm run build` pass.

## Review focus
- **Fringe colours back in Lab:** an anti-aliased black circle must still give 1 colour with `'auto'` (the existing test).
- **Determinism:** the same input twice gives deep-equal output with `'auto'`.
- **Tiny shapes:** a 3-cell shape with `'auto'` must not crash or give an empty palette.

## Out of scope
- Rendering or contrast fitting (03); editor controls (04).
- Contour or outline regions.

## Hints
- The existing `quantize` in `src/picture.ts` is the place to change; keep `shapeSide` and the background detection as they are.

## Implementation notes
- [x] failing tests for every acceptance criterion and review-focus item (the detail and 10-cap tests failed before; the background, determinism and tiny-shape tests already passed, so they pin)
- [x] Lab clustering, seeding stops below ΔE 12, cap 10 for 'auto' (so 'auto' and 10 seed identically; a number caps lower)
- [x] survival rule replaces MIN_COLOUR_DIST and MIN_GROUP_SHARE
  - The rule alone let a ring of anti-aliased edge cells survive as a second grey (ΔE 21.5 from black, over 2% of cells). Added `blendOf`: an edge cell whose colour lies within 16 RGB of the line from the background colour to a neighbour's colour takes that neighbour's colour. It only applies on plain backgrounds without invert, and leaves real light colours such as skin alone.
- [x] palette entries are mean RGB of each group's cells
- [x] background by minimum contrast (the test where minimum and mean disagree failed under the stand-in)
- [x] full tests (202) and build pass
- [ ] review. Round 1 found three issues, each fixed test-first:
  - high: `blendOf` ran on transparent pictures (bg came from invisible pixels' RGB); bg is now only used without transparency
  - medium: `blendOf` swallowed real tints and drop shadows; a blend now requires the cell to contain background-coloured pixels
  - medium: outlier seeds used up slots; when a seed's group is merged away, clustering reruns without it (up to 4 passes)
  - low: the stale "'auto' matches 4" test now compares 'auto' with `colors: 10`
- Real photos at 40 columns: 9–10 colours each, under 25 ms each; the white dog gets a dark board.

## Result
