# 0001: Vite, TypeScript and Vitest with pure logic modules

Status: superseded by 0004
Date: 2026-11-13
Supersedes: none
Rule: The app uses Vite + TypeScript + Vitest with no UI framework, and only `src/render.ts` and `src/main.ts` may touch the DOM; `model`, `generate`, `solve` and `game` are pure functions.

## Context
The arrow-escape puzzle is a small amount of game state plus a drawing layer. The generator and solver need thorough unit tests, which is easiest when they don't depend on the DOM.

## Decision
Use Vite for the dev server and build, TypeScript for types, and Vitest (jsdom for renderer tests). Rejected: React, which adds little for one SVG board and a header; plain JS with `node --test`, which has no dev server for ES modules and no types.

## Consequences
Logic is tested in plain Node, fast and without a browser. Any new DOM code goes in the render layer. Adding a framework later would need a superseding decision.
