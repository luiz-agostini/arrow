# 0009: Esteira levels are derived at runtime from photo levels

Status: accepted
Date: 2026-11-14
Supersedes: none
Rule: Esteira de Cores levels are built at runtime from the photo levels in `LEVELS` by `esteiraLevels()` (never stored as separate data), and every built level must be winnable by `greedyWins`, reseeding until it is.

## Context
The new game needs pixel pictures and a set of shooters whose ammo matches each colour's blocks. The photo levels already hold region masks and palettes, and a badly dealt set of shooters can make a level impossible to clear.

## Decision
Downsample each photo level's mask to at most 24×32 blocks, deal shooters from the block counts, and check the deal with a simple greedy player, trying the next seed until it wins. Rejected: storing separate level files, which would drift from the photos; trusting any deal, which can produce unwinnable levels.

## Consequences
Both games share their pictures, and changing a photo level changes both. Building a level costs a greedy simulation, budgeted at under 200 ms.
