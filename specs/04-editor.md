# 04-editor: Editor for high-resolution, Auto-colour pictures

Status: ready
Depends on: 00-contracts
Size: S

## Goal
Players can make 12–64 column picture levels with Auto colours on any device, and copy a finished level as source text, which is how built-in photo levels are made.

## Owns (files and directories this spec may change)
- `src/editor.ts`, `src/editor.test.ts`

## Must not touch
- `src/main.ts`, `src/render.ts`, `src/picture.ts`, `src/style.css`, `src/levels.ts`.

## Interfaces and contracts
```ts
export const MIN_COLS = 12;
export const DEFAULT_COLS = 40;
export const MAX_COLS = 64;            // PHONE_MAX_COLS and PHONE_WIDTH are removed
export function serializeLevel(level: Level): string;
// Output matches levels.ts entries:
// {\n    name: '…',\n    seed: N,\n    palette: ['#…', …],\n    background: 'light',\n    mask: [\n      '…',\n    ],\n  },
// palette and background lines are omitted when absent; quotes in names are escaped.
```
Markup: `select[data-role="colors"]` options `auto,1,…,10` (default `auto`); `button[data-action="copy-level"]`.

## Global constraints
- **Decisions:** 0004 (`editor.ts` may touch the DOM) and 0006 (the level shape, including `background`).
- **Grid:** columns 12–64, default 40, the same on every device.
- **Colours:** `'auto'` or 1–10, default `'auto'`.

## Behavior
1. Changing the colour control passes `'auto'` or the number to `pictureToLevel`.
2. Play hands `onPlay` a level that includes the `background` returned by `pictureToLevel`.
3. Copy writes `serializeLevel(level)` to `navigator.clipboard.writeText`. If the clipboard rejects, the status shows `Couldn't copy the level`.

## Acceptance criteria (each must be checkable by a test or command)
- [ ] The slider's `max` is `'64'` and its value `'40'`, with `innerWidth` 400 and with 1024. The old phone-cap test is replaced.
- [ ] The colour options are `['auto','1','2','3','4','5','6','7','8','9','10']`.
- [ ] Copy calls a stubbed `clipboard.writeText` once, with text containing `name: 'Your picture'`, `background: '` and `mask: [`.
- [ ] `serializeLevel({ name: "Bob's", mask: ['0.'], seed: 3 })` equals `"{\n    name: 'Bob\\'s',\n    seed: 3,\n    mask: [\n      '0.',\n    ],\n  },"`.
- [ ] A rejected clipboard shows `Couldn't copy the level`.
- [ ] Play passes a level whose `background` equals the one from `pictureToLevel`.
- [ ] `npm test` and `npm run build` pass.

## Review focus
- **Slow preview:** the preview must not re-render on every slider pixel while dragging on a phone. Re-render on `input` throttled to one per animation frame, and test that 5 rapid input events cause one generate per frame (fake timers).

## Out of scope
- Saving or sharing picture levels; zoom in the preview (the preview stays fit-to-view).

## Hints
- The existing tests use a fake `decodeImage` passed through `startApp(root, deps)`; keep that pattern.

## Implementation notes

## Result
