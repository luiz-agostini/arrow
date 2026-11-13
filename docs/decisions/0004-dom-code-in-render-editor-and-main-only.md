# 0004: DOM code in render, editor and main only

Status: accepted
Date: 2026-11-13
Supersedes: 0001
Rule: The app uses Vite + TypeScript + Vitest with no UI framework, and only `src/render.ts`, `src/editor.ts` and `src/main.ts` may touch the DOM; `model`, `generate`, `solve`, `game`, `picture` and `colors` are pure functions.

## Context
0001 limited DOM access to `render.ts` and `main.ts`. The picture-to-level feature adds a sizeable editor screen: file input, image decoding on a hidden canvas, preview, and controls. Putting all of that in `main.ts` would mix the game screen with the editor. The image processing and contrast maths should stay testable without a browser.

## Decision
Add `src/editor.ts` as a third DOM module. Keep image processing (`picture.ts`) and colour maths (`colors.ts`) pure, taking plain pixel data instead of DOM objects. Rejected: putting the editor in `main.ts`, which makes one large file; allowing any module to touch the DOM, which loses the pure, fast logic tests.

## Consequences
Each new screen needs a decision to add its module. Pure modules get their input decoded by the DOM layer, so tests can pass synthetic pixel data.
