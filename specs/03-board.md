# 03-board: Dense rendering, precise taps and zoom

Status: in-progress
Depends on: 00-contracts
Size: L

## Goal
Make 40–64 column boards comfortable on a phone:
- thicker strokes, and arrow colours kept true on a per-level background
- taps that pick the arrow by distance, preview on press and commit on release, with a magnifier
- pinch and wheel zoom with pan

## Owns (files and directories this spec may change)
- `src/render.ts`, `src/render.test.ts`
- `src/hit.ts`, `src/hit.test.ts` (new, pure)
- `src/viewport.ts`, `src/viewport.test.ts` (new, pure)
- `src/style.css`

## Must not touch
- `src/main.ts` (the zoom buttons' markup goes in 99), `src/editor.ts`, `src/picture.ts`, `src/generate.ts`, `src/levels.ts`.

## Interfaces and contracts
```ts
// hit.ts
export function pickArrow(b: Board, p: { x: number; y: number }, radius: number): { id: number; ambiguous: boolean } | null;
// p and radius are in cell units; distance is to the arrow's polyline through cell centres (x+0.5, y+0.5).

// viewport.ts
export type View = { scale: number; x: number; y: number }; // top-left in board cells; scale 1 = fit
export function fit(): View;
export function zoomAt(v: View, factor: number, at: { x: number; y: number }, board: { width: number; height: number }): View;
export function pan(v: View, dx: number, dy: number, board: { width: number; height: number }): View;
export function viewBox(v: View, board: { width: number; height: number }): string;

// render.ts: mountBoard and BoardView as defined in 00-contracts; zoom() and fit() become real.
```

## Global constraints
- **Decisions:**
  - 0003: SVG arrows with `data-id`, a visible path, a head and a transparent hit path; no canvas.
  - 0004: only `render.ts` touches the DOM here; `hit` and `viewport` are pure.
  - 0007: taps resolve with `pickArrow` and commit on pointer release, and hit paths are for cursor styling only.
- **Size and strokes:** `CELL = 24`; arrow stroke width `5.5`; head half-width `0.32 * CELL`; hit path stroke `0.8 * CELL`.
- **Tapping:**
  - Pick radius: 22 CSS px for touch, 6 CSS px for mouse, converted to cells through the current zoom.
  - Ambiguous when the second-nearest arrow is within 0.25 cell of the nearest.
  - A quick tap is shorter than 300 ms and moves less than 8 CSS px.
- **Magnifier:** 120 px circle, 2.5× zoom, centred 80 px above the pointer, shown only for touch.
- **Zoom:**
  - Scale 1–8; wheel factor `1.0015 ** -deltaY`; `zoom(1.5)` and `zoom(1/1.5)` back the zoom buttons.
  - Panning is clamped so at least half the board stays in view.
- **Board background:** with `opts.background`, set `svg.dataset.bg` and draw a backdrop rect in `LIGHT_BG` or `DARK_BG`. Each arrow gets `--arrow-c: fitContrast(colour, that bg)`. Without it, keep the current `--arrow-light` and `--arrow-dark`.

## Behavior
1. **Press:** on pointerdown, `pickArrow` at the pointer marks that arrow `aim`. Nothing moves.
2. **Move:** on pointermove, the `aim` follows the pick, and leaving the board removes the `aim`.
3. **Release:** on pointerup, if an arrow is aimed, call `onTap(id)`.
   - **Exception:** if the press was a quick tap and the pick was ambiguous, don't call `onTap`. Keep the `aim`, and commit when the next quick tap lands within 0.5 cell of that arrow.
4. **Two pointers:** while two pointers are down, pinch zooms and moving pans; `onTap` is never called.
5. **Fallback:** without `opts.toCell`, convert screen to cell through `svg.getScreenCTM()`.

## Acceptance criteria (each must be checkable by a test or command)
- [ ] **`hit.test.ts`**, on the 5×5 board with A `[{0,2},{1,2}]` R and B `[{3,0},{3,1},{3,2}]` D:
  - `pickArrow(b, {x:1.5, y:2.5}, 0.5)` gives `{ id: 1, ambiguous: false }`.
  - `{x:2.6, y:2.5}` with radius 1 gives `ambiguous: true`.
  - `{x:0.5, y:0.5}` with radius 0.4 gives `null`.
- [ ] **`viewport.test.ts`:**
  - `viewBox(fit(), {width:10, height:10})` is `'-24 -24 288 288'`.
  - `zoomAt(fit(), 2, {x:5, y:5}, 10×10)` keeps `(5, 5)` at the same relative position.
  - The scale clamps at 1 and 8.
  - `pan` past the edge is clamped.
- [ ] **`render.test.ts`**, with a stubbed `toCell`:
  - **Release commits:** down and up at `(1.5, 2.5)` calls `onTap(1)` once.
  - **Preview follows:** down at A, move to `(3.5, 0.5)`, then up calls `onTap(2)`.
  - **Drag-off cancels:** down, move off the board, then up calls nothing and leaves no `.aim`.
  - **Ambiguous quick tap:** a 100 ms tap at `(2.6, 2.5)` calls nothing and leaves one `.aim`. A second quick tap there calls `onTap` with that id.
  - **Two pointers:** never call `onTap`.
  - **Zoom:** `zoom(2)` halves the `viewBox` width, and `fit()` restores it.
  - **Background:** `{ palette: ['#571d24'], background: 'light' }` sets `--arrow-c` to `#571d24` and `data-bg` to `light`.
- [ ] `style.css` sets `.arrow .body` stroke width to 5.5.
- [ ] `npm test` and `npm run build` pass.

## Review focus
- **Pointer capture lost on iOS** when the finger leaves the svg. Use `setPointerCapture`, and test that pointerup outside the board after a move off cancels.
- **Pinch registering as a tap:** a second pointer arriving 50 ms after the first must cancel the pending `aim`.
- **Magnifier cost:** it must reference the board group with `<use>` and not clone the arrows. Test that `svg.magnifier` contains exactly one `use` element.
- **Hit paths under 0007:** they must no longer trigger `onTap` on click. Test that dispatching `click` on `path.hit` calls nothing.

## Out of scope
- Zoom buttons' markup in `main.ts` (99); editor changes (04).
- An easy mode that prefers free arrows.

## Hints
- The current click handling is `svg.onclick` in `mountBoard`; replace it.
- jsdom has no `getScreenCTM`, so tests use `opts.toCell`.
- Vitest fake timers fake `performance` and `requestAnimationFrame` (see the existing `render.test.ts`).

## Implementation notes
- [x] `hit.ts` `pickArrow` (pure), tests first. A rival just outside the radius still makes a pick ambiguous, which is what the spec example at radius 1 requires
- [x] `viewport.ts` (pure), tests first; `CELL` moved here (render re-exports it) so pure modules never import render
- [x] render: stroke 5.5, head half-width 0.32·CELL, board background (`data-bg`, backdrop, `--arrow-c`). Arrows now sit in one `g.board-content` (for the magnifier). Blocker stroke and hint pulse raised to 8 so they still stand out against 5.5.
  - Outside the spec's files: `editor.test.ts` (owned by 04) now expects `--arrow-c` on preview arrows, because the editor already passes `background`; the post-Play check stays `--arrow-light` until 04 puts `background` on the level.
- [x] render: pointer press / preview / release, ambiguous quick tap, drag-off cancel, hit-path clicks inert. Arrows that are sliding out can't be picked; a deliberate (non-quick) press on an ambiguous spot commits the nearest arrow.
- [x] render: two pointers never tap; magnifier with one `<use>` of `g.board-content`, positioned fixed above the finger, touch only. `.board` uses `touch-action: none` so the browser doesn't scroll or zoom the page during gestures.
- [x] render: zoom/fit via viewport, wheel zoom, two-finger pinch (zoom by spread around the midpoint, pan by midpoint movement)
- [x] magnifier moved to `<body>` and created lazily on the first touch press, so `main svg` stays the board and untouched boards (the editor preview) never get one. The test for this was written right after the change rather than before it.
- [x] checked in Chrome: a real mouse click on a free arrow commits through `getScreenCTM`; the wheel zooms around the cursor; a touch press (390×844, touch emulation) aims and shows the magnifier; no page errors
- [x] full tests (234), build
- [ ] review

Interpretations of the spec:
- **Screen to cell:** without `opts.toCell`, render uses `svg.getScreenCTM()` (scale and offset terms `a`, `d`, `e`, `f`; no rotation). The pick radius in cells is the pixel radius times the cells-per-pixel ratio measured from the same mapping, so a stubbed `toCell` gets a consistent radius.
- **Confirming an ambiguous tap:** the next quick tap confirms when it lands within 0.5 cell of the first tap's point or of the aimed arrow's body.
- **Pan clamp:** when zoomed in, the view stays inside the board plus its one-cell margin, and at scale 1 the view is fixed at fit. That is stricter than "half the board stays in view", which is impossible at 8×.
- **Outside the spec's files:** `main.test.ts` (owned by 99) changes minimally. Its tap helper now dispatches pointer events at the arrow's head cell, and it stubs `getScreenCTM`, because decision 0007 makes `click` on hit paths inert.

## Result
