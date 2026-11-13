# 01-engine: Fast, dense boards at 64×80

Status: ready
Depends on: 00-contracts
Size: M

## Goal
Make the generator and solver fast enough for 64×80 picture boards, and make boards denser with longer arrows. Every built-in board changes on purpose.

## Owns (files and directories this spec may change)
- `src/generate.ts`, `src/generate.test.ts`
- `src/solve.ts`, `src/solve.test.ts`
- `src/perf.test.ts` (new)
- `src/__snapshots__/levels.test.ts.snap` (regenerated)

## Must not touch
- `src/render.ts`, `src/style.css`, `src/picture.ts`, `src/levels.ts`, `src/main.ts`, `src/editor.ts`.

## Interfaces and contracts
```ts
export const MAX_LEN = 12;                               // generate.ts
export function generate(mask: string[], seed: number): Board; // unchanged signature
export function freeArrows(b: Board): number[];         // unchanged signature
export function solve(b: Board): number[] | null;       // unchanged signature
```

## Global constraints
- **Decisions:** 0004 (`generate` and `solve` are pure) and 0006 (boards come only from `generate(mask, seed)` with the seeded RNG).
- **Arrow length:** `MAX_LEN = 12`; body target length `= MAX_LEN - Math.floor(rand() ** 2 * (MAX_LEN - 1))`, which ranges from 2 to 12 and is biased long.
- **Performance:** `generate` plus `solve` on a full 64×80 mask completes in under 1500 ms under Vitest.

## Behavior
1. Ownership is built once per board state. `freeArrows` must not rebuild the owner map per arrow, and `solve` updates it incrementally as arrows are removed.
2. `absorbSingles` finds arrows whose rays cross a cell through a cell→ray-owners index, not by scanning every arrow for every single cell.
3. Every generated board stays solvable and region-respecting, with the merge rules unchanged.

## Acceptance criteria (each must be checkable by a test or command)
- [ ] `large boards are fast`: a 64×80 all-`#` mask with seed 1 runs `generate` then `solve` in under 1500 ms, and `solve` is not null.
- [ ] Seeds 1–20 on a 12×12 all-`#` mask: average arrow length ≥ 3.5, and no arrow is longer than 12.
- [ ] All existing generate, solve and level tests pass, including coverage ≥ 95% and solvable for all 22 levels.
- [ ] The snapshots are regenerated with `npx vitest run -u` and committed; `npm test` then passes with 0 changes.
- [ ] `npm run build` succeeds.

## Review focus
- **Indexed merge correctness:** `absorbSingles` with the index must keep the solvability argument. Pin it by running `checkBoard` on 200 seeds of a 20×20 two-region mask.
- **Performance regressions in `solve`:** a 64×80 two-region mask (left `0`, right `1`) must also finish under 1500 ms.

## Out of scope
- Contour-following arrows; difficulty tuning.
- Rendering or stroke changes (03).

## Hints
- `checkBoard` lives in `src/test-helpers.ts`. Import it; don't change it.
- `blockerOf` in `model.ts` rebuilds its owner map on every call. Don't call it in loops in `freeArrows`; build one map and reuse it.

## Implementation notes

## Result
