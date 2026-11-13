# 0002: Levels are ASCII masks plus a seed

Status: superseded by 0005
Date: 2026-11-13
Supersedes: none
Rule: A level is `{ name, mask: string[], seed }` with `#` for playable cells and `.` for empty ones, and boards are always produced by `generate(mask, seed)` using only the seeded RNG, never stored or hand-placed.

## Context
Levels are pictures densely filled with interlocking arrows. Placing hundreds of arrows by hand is impractical, and every level must be solvable.

## Decision
Store only the silhouette and a seed. The generator builds the board in reverse removal order, so every board is solvable by construction. Rejected: hand-authored arrow lists, which take too long to make and are hard to check; stored generated JSON, which goes stale when the generator changes.

## Consequences
Adding a level means drawing a mask. Changing the generator changes every level, so tests pin solvability and coverage rather than exact layouts. `Math.random` is not allowed in generation.
