# 0003: Render arrows as SVG elements

Status: accepted
Date: 2026-11-13
Supersedes: none
Rule: Each arrow is drawn as SVG DOM elements tagged with `data-id` (a visible path, a head, and a transparent hit path), and the game does not use canvas drawing.

## Context
Players click individual arrows, which are thin polylines, and arrows animate sliding off the board. Boards are at most about 30×30 cells, a few hundred arrows.

## Decision
Use SVG, so the browser handles click detection, CSS handles theming, and the slide uses `stroke-dasharray`/`stroke-dashoffset` along the body-plus-exit path. Rejected: canvas, which needs hand-written hit testing and a redraw loop, and is only worth it for thousands of elements.

## Consequences
Renderer tests can query elements in jsdom. Very large boards could get slow; if that happens, a superseding decision can move to canvas.
