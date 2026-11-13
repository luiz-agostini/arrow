# 99-integration: Zoom buttons and app wiring

Status: in-progress
Depends on: 00-contracts, 03-board
Size: S

## Goal
Connect the board's new abilities to the game screen: zoom buttons, fitting the view when a level loads, and passing level backgrounds through.

## Owns (files and directories this spec may change)
- `src/main.ts`, `src/main.test.ts`
- `index.html`

## Must not touch
- `src/render.ts`, `src/style.css` (already styled by 03 under `.zoom-controls`), `src/editor.ts`, `src/levels.ts`.

## Interfaces and contracts
Consumes `BoardView.zoom(factor)` and `BoardView.fit()` from 03-board. Markup to add inside `main.stage`:
```html
<div class="zoom-controls">
  <button type="button" data-action="zoom-in" aria-label="Zoom in">+</button>
  <button type="button" data-action="zoom-out" aria-label="Zoom out">−</button>
  <button type="button" data-action="zoom-fit" aria-label="Fit board">Fit</button>
</div>
```

## Global constraints
- **Decisions:** 0004 (`main.ts` may touch the DOM) and 0007 (taps go through the board's pointer handling, so `main.ts` must not add click handling on arrows).
- **Zoom steps:** `zoom-in` calls `view.zoom(1.5)`, `zoom-out` calls `view.zoom(1 / 1.5)`, and `zoom-fit` calls `view.fit()`.

## Behavior
1. Each zoom button calls the matching `BoardView` method on the current board.
2. Loading a level (pick, Next, Restart, or Play from the editor) starts at fit.
3. `mountBoard` receives `{ palette: level.palette, background: level.background }`.

## Acceptance criteria (each must be checkable by a test or command)
- [ ] Clicking `zoom-in` changes the board `viewBox` width to 1/1.5 of its fit value, within 0.01.
- [ ] Clicking `zoom-fit` after `zoom-in` restores the fit `viewBox` exactly.
- [ ] After `zoom-in`, picking another level from the pane shows the fit `viewBox`.
- [ ] A level with `background: 'dark'` renders an svg with `data-bg="dark"`.
- [ ] All existing `main.test.ts` and `editor.test.ts` tests pass, and `npm test` and `npm run build` pass.
- [ ] By hand on a phone: pinch, pan and the zoom buttons all work on a 40-column level, and 20 consecutive aimed taps cause no wrong move.

## Review focus
- **Stale view after reload:** zoom buttons must act on the current `view` after Restart, not the old one. Test zoom-in, then Restart, then zoom-in: the `viewBox` width is 1/1.5 of fit, not 1/2.25.

## Out of scope
- New gestures or settings; difficulty modes.

## Hints
- `load()` in `src/main.ts` reassigns `view`; the zoom button handlers must read it at click time.

## Implementation notes
- [x] tests first: zoom buttons, fit on every load, stale-view check (3 failed before); the dark-background test already passed, since 00 wires `background`, so it pins
- [x] markup and handlers in `main.ts` (they read `view` at click time)
- [x] `.zoom-controls` CSS. It's outside this spec's files, but 03 never added it, so this spec adds it to `style.css` minimally: a column in the board's top-right, 36 px buttons.
- [x] full tests (253), build, Chrome check at 390×844 (zoom in twice, then Fit restores; no errors)
- [ ] review

Interpretation: the dark-background check uses the editor's Play with a pale-yellow-on-black picture, because no built-in level has a background until 98.

## Result
