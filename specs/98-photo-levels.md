# 98-photo-levels: Regenerate the 16 photo levels

Status: ready
Depends on: 00-contracts, 01-engine, 02-colour, 04-editor
Size: S

## Goal
Rebuild the 16 photo levels with the new pipeline, so they look like their photos: 40 columns, Auto colours and a chosen background.

## Owns (files and directories this spec may change)
- `src/levels.ts` (the 16 photo-level entries only, after the comment `// Made from photos`)
- `src/__snapshots__/levels.test.ts.snap`

## Must not touch
- The six shape levels' entries, `src/levels.test.ts`, and everything else.

## Interfaces and contracts
Each entry is produced by `serializeLevel(level)` from `src/editor.ts`, from `pictureToLevel(pixels, { cols: 40, colors: 'auto', invert: false })` plus a seed.

## Global constraints
- **Decision 0006:** levels are `{ name, mask, seed, palette?, background? }` generated with `generate`.
- **Names and order:** keep the existing 16 names and their order by cell count. They describe the picture, not the people in it.
- **Seeds:** the seed is the best of 1–200 by coverage, and coverage must be ≥ 0.95.

## Behavior
1. The source photos are in `/Users/luiz/work/arrow/pics/IMG_1741.jpeg` … `IMG_1756.jpeg`. The folder is git-ignored, so use this absolute path from a worktree.
2. Decode with the app's own `decodeImage`, in a real browser. Drive the Vite dev server with Playwright and Chrome at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Keep the script outside the repo.
3. The mapping from photo to name is in the current `src/levels.ts`, which has the same names; match by visual content (see Hints).

## Acceptance criteria (each must be checkable by a test or command)
- [ ] `src/levels.ts` still has 22 levels with the same names, and the 16 photo entries have a `background` and up to 10 palette colours.
- [ ] Every photo level's mask is at most 64 columns and 80 rows.
- [ ] The snapshots are regenerated with `npx vitest run -u`; then `npm test` passes, including coverage ≥ 95% and solvable for every level.
- [ ] `npm run build` succeeds.

## Review focus
- **Name drift:** a photo assigned to the wrong name. Before committing, compare a screenshot of each regenerated level against its photo.

## Out of scope
- New photos, new names, or changing the six shape levels.

## Hints
- Name mapping:

  | Photo | Name | Photo | Name |
  |---|---|---|---|
  | 1741 | Lounging Pup | 1749 | Denim |
  | 1742 | Side by Side | 1750 | Tongue Out |
  | 1743 | Thumbs Up | 1751 | Curious Pup |
  | 1744 | Jersey and Pup | 1752 | Red Dress |
  | 1745 | Thinker | 1753 | Portrait |
  | 1746 | Sunglasses | 1754 | Glasses |
  | 1747 | Selfie | 1755 | Specs |
  | 1748 | Smiles | 1756 | Video Call |

- In the dev server, `page.evaluate(() => import('/src/editor.ts'))` gives access to `decodeImage` and `serializeLevel`; `/pics/<file>` is served from the main checkout only, so run the dev server from `/Users/luiz/work/arrow` or copy the photos into the worktree's ignored `pics/`.

## Implementation notes

## Result
