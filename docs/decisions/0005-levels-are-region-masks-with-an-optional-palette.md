# 0005: Levels are region masks with an optional palette

Status: superseded by 0006
Date: 2026-11-13
Supersedes: 0002
Rule: A level is `{ name, mask: string[], seed, palette? }`, where mask characters are `.` (empty), `0`–`5` (region index into `palette`) or `#` (alias of `0`), and boards are always produced by `generate(mask, seed)` using only the seeded RNG, never stored or hand-placed.

## Context
0002 allowed only `#` and `.`, so a level had one colour. Levels made from pictures need colour regions, and each arrow must stay inside one region so region edges look crisp. The six existing levels must keep working, and keep producing identical boards.

## Decision
Mask characters `0`–`5` name up to six regions, and `palette` gives each one a `#rrggbb` colour. `#` stays valid as region `0`, and a level without a palette uses the theme colour. Rejected: storing a colour per arrow, which breaks "boards are always generated"; a separate colour grid beside the mask, which needs two arrays kept in sync.

## Consequences
The generator keeps arrow bodies inside one region. Existing masks don't change. More than six colours, or gradients, would need a new decision.
