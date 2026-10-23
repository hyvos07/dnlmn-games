# 2048

A faithful TypeScript adaptation of Gabriele Cirulli's MIT-licensed 2048, with a dark UI, softly colored tiles and anime.js slide/merge effects. Served at `/merge-2048/` because repository slugs must start with a letter.

## Play

Use arrow keys / WASD, swipe, or mouse-drag on the board. Each move slides all tiles; equal neighbors merge once per move. Merges add their resulting tile value to the score. Valid moves spawn one tile: 90% 2, 10% 4. Invalid moves do nothing. Two random tiles start each game. Reach 2048 to win, then optionally keep playing. A full board with no adjacent matches ends the game.

## Features

- Current board and personal best saved through the SDK. Completed losses clear only the board save. Reloading shows Resume game before restoring play. Restart confirmation protects the current board.
- Shared menu, mute and fullscreen HUD, without platform pause controls. Tab switching freezes input and tile effects until return; cancelled touch gestures never count.
- Viewport-height layout with a board that fits the remaining space, including short landscape screens. The How to play button beside the title opens a keyboard-accessible instructions dialog with controls, a merge example and a simple strategy tip. The board and its effects stay paused until it closes.
- Screen-reader cell labels, visible keyboard focus and reduced-motion support. Sound starts only after a gesture and follows global mute/pause.
- Title-screen attract board uses real game rules without changing the player's save or best.

## Development and verification

`pnpm dev:game merge-2048`; `pnpm check`; `pnpm test`; `pnpm build`; `pnpm test:e2e`.

Rules and serialization live in `src/logic/rules.ts`, adapted from the original grid, tile and game-manager code. Pinned original snapshots and revision are in `src/logic/fixtures/`. Differential tests compare 2,500 board/direction cases plus 6,000 seeded sequential moves against the actual upstream JavaScript. Browser tests cover input, persistence, platform pause removal, terminal states, restarts and small-screen layout.

Capture real title-screen attract play with `pnpm thumbnail merge-2048 --wait 16000`; use `--still` for just the thumbnail. Capture the final source PNG through Playwright at deviceScaleFactor 2 (912px wide), since the standard 1x capture is smaller than the required 640px minimum. See CREDITS.md and the shipped upstream license.

## Later ideas

Keep classic rules intact. Optional themes could change presentation without affecting scores. No undo, alternate board sizes or power-ups in this version.
