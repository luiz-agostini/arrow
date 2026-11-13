# 0007: Board input picks arrows by distance and commits on release

Status: accepted
Date: 2026-11-13
Supersedes: none
Rule: Board taps resolve to an arrow with the pure `pickArrow(board, point, radius)` and commit only on pointer release (never on press or on the DOM click target), and the transparent hit paths are used only for cursor styling.

## Context
Picture levels at 40–64 columns make cells about 6 px wide on a phone, while a fingertip covers about 40 px. Picking the arrow from the DOM element under the click becomes unreliable, and a wrong pick costs a life.

## Decision
Convert the pointer position to cell units and choose the arrow whose body passes nearest, within a finger-sized radius. Pressing previews the pick, sliding adjusts it, lifting commits and dragging off cancels. An ambiguous quick tap highlights the pick instead of moving it. Rejected: DOM hit targets with larger strokes, which overlap badly when cells are small; preferring arrows that can move, which would remove most of the puzzle.

## Consequences
The picking logic is pure and tested without a browser. The renderer needs a screen-to-cell conversion and pointer handling. Decision 0003's hit paths stay in the DOM, for the cursor only.
