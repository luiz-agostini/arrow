# 0008: DOM code in main, home, render, editor and the esteira view only

Status: accepted
Date: 2026-11-14
Supersedes: 0004
Rule: The app uses Vite + TypeScript + Vitest with no UI framework, and only `src/main.ts`, `src/home.ts`, `src/render.ts`, `src/editor.ts` and `src/esteira/view.ts` may touch the DOM; every other module, including `src/esteira/level.ts` and `src/esteira/sim.ts`, is pure.

## Context
The site gains a home screen and a second game, Esteira de Cores. 0004 allowed DOM code only in `render.ts`, `editor.ts` and `main.ts`, and putting a home screen and a whole second game screen into `main.ts` would make it the place for everything.

## Decision
Add `src/home.ts` for the game selection screen and `src/esteira/view.ts` for the new game's screen. Keep the new game's levels and simulation pure so they're tested without a browser. Rejected: one big `main.ts`; a folder-wide rule ("anything under `src/ui/`"), which is looser than this project has needed so far.

## Consequences
`main.ts` becomes a router plus the arrow game. Each further screen needs a decision naming its module.
