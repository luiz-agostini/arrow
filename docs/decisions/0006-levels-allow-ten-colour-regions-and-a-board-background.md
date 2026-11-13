# 0006: Levels allow ten colour regions and a board background

Status: accepted
Date: 2026-11-13
Supersedes: 0005
Rule: A level is `{ name, mask: string[], seed, palette?, background? }`, where mask characters are `.`, `0`–`9` (region index into `palette`) or `#` (alias of `0`), `background` is `'light'` or `'dark'`, and boards are always produced by `generate(mask, seed)` using only the seeded RNG, never stored or hand-placed.

## Context
0005 allowed six regions (`0`–`5`). Picture levels at higher resolution need more colours, chosen per picture by an "Auto" mode capped at 10. Fitting every colour against both the light and the dark theme also shifted photo colours a long way from the original.

## Decision
Mask digits `0`–`9` give up to ten regions, which is still one character per cell. An optional `background` lets a picture level pick the board background that suits its palette, so arrows only need fitting against that one colour. Rejected: letters for more regions, which are harder to read in source and not needed under a cap of 10; a free-form background colour, which would need its own contrast rules for the rest of the UI.

## Consequences
Existing masks stay valid. The renderer draws a board backdrop for levels with a `background`. More than ten colours would need a new decision.
