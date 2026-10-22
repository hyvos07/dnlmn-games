# Tetris

> Find your flow. Beat your best.

| | |
| --- | --- |
| Slug | `tetris` → games.dnlmn.dev/tetris/ |
| Engine | Vanilla TypeScript + Canvas2D |
| Status | Published manifest; deployment follows the site release workflow |
| Added | 2026-10-22 |

## Concept and core loop

A responsive solo stacker inspired by TETR.IO's single-player modes, adapted to the site's charcoal, cream and lime theme with colorful blocks. Choose a mode, arrange falling pieces into complete horizontal rows, and improve your local records. Preview one upcoming piece above the held piece on the right. Stats and controls sit on the left; line progress appears in Sprint and level in Blitz. Hard drops give the board a brief impact shake, disabled with reduced motion or effects off.

## Modes

- **40 Lines:** clear at least 40 lines as quickly as possible. Only completed runs save a time; lower is better. Topping out ends the attempt.
- **Blitz:** score as much as possible in 120 active seconds. Line goals raise the level and gravity. Cumulative level thresholds are 3, 8, 15, 24, 35, 48, 63, 80, 99, 120, 144, 170, 198, 228 and 260 lines. Topping out also ends the run; either ending can improve the local score record. No garbage rows rise.
- **Zen:** endless practice with constant gravity, saved board/queue/hold/RNG and 30 placements of undo/redo. A top-out clears the stack and continues. Settings can reset the board. Leaving and returning resumes local progress.

## Controls

| Input | Action |
| --- | --- |
| Left / Right | Move, with adjustable delay and repeat |
| Down | Soft drop |
| Up / X | Rotate clockwise |
| Z | Rotate counterclockwise |
| A | Rotate 180° |
| Space | Hard drop and lock |
| C / Shift | Hold, once per active piece |
| Escape | Pause; close Settings back to the paused menu |
| Resume / tap outside the pause panel | Resume play |
| R | Fresh run in the current mode |
| Ctrl/Cmd+Z, Ctrl/Cmd+Y, Ctrl/Cmd+Shift+Z | Zen undo / redo |
| Touch / mouse | On-screen actions; hold arrows and soft drop to repeat |

Settings remap gameplay keys and adjust DAS (0–500 ms), ARR (0–200 ms, zero snaps to a wall), soft drop (1–100× gravity), sound and effects. Default DAS is 133 ms, ARR 16 ms and soft drop 8×. The old default of 40× migrates once to 8× while other handling choices stay saved. Menu/navigation, R and SDK F/M keys are reserved. Restore controls resets handling and bindings. The top navigation is hidden in this game; All games returns to the launcher, Settings owns the sound toggle, and F/M shortcuts still work.

## Rules, scoring and compatibility

Seeded seven-piece bags, a 10×20 visible board with 20 hidden buffer rows, fixed 500 ms lock delay and a 15-reset cap. Quarter-turn rotations use SRS kicks. The 180° table is an explicitly defined compact, directional variant; exact TETR.IO SRS+ compatibility is not claimed. Sprint/Zen remain at level one. Blitz alone ramps gravity. At its maximum setting soft drop is a fast gravity multiplier rather than a separate instant sonic-drop action.

Single/double/triple/quad clears score 100/300/500/800 × level. Full T-spin zero/single/double/triple scores are 400/800/1200/1600 × level; minis score 100/200/400 for zero/single/double. Consecutive difficult clears receive a 1.5× base multiplier, combos add 50 × combo × level, and a perfect clear adds 3,500 × level. Hard drops score two per cell, soft drops one, natural gravity zero. These rules are tested directly; this is an independent game, not a verified byte-for-byte reproduction of TETR.IO's engine.

Pause, help and hidden-tab interruptions freeze simulation and the mode clock. Reduced motion disables movement/glow effects.

The pause menu blocks the board and background controls. Settings changes keep the run paused; Done, Escape or tapping outside Settings returns to the pause menu. Resume or tapping the pause backdrop continues play. Escape while paused keeps the pause menu open. Restart and Menu remain explicit actions to start fresh or leave the run.

## Music and sound

The title screen plays **Pixel Welcome**, an original retro chiptune. Gameplay uses an original chiptune arrangement of the traditional Russian **Korobeiniki** melody, with square-wave lead, triangle bass/arpeggios and synthesized percussion. Movement, soft drop, rotation, hold, hard drop, line clears, quads, level changes, start and results have distinct synthesized cues. No audio downloads or runtime dependencies are needed; loops render once on the audio thread and play without JavaScript timing loops.

Browsers require a gesture before audio can begin. **Play music** on the title screen enables the title theme; choosing a mode also unlocks sound. Settings provides independent music and sound-effects volume sliders, saved locally. The sound checkbox and **M** control the SDK's persistent global mute. Pause and hidden tabs suspend the audio context and preserve the current music position. Returning to the menu switches to the title theme, while results stop music and play a win/loss cue.

## Saved data

All persistence uses `game.storage`, namespaced by the SDK under `dnlmn:tetris:`. No accounts, cookies or gameplay network requests.

| Key | Contents |
| --- | --- |
| `records-v1` | Best completed Sprint time in ms and best ended Blitz score |
| `handling-v1` | Validated handling, effects and gameplay bindings |
| `audio-v1` | Validated independent music and sound-effects volumes (0–1) |
| `soft-drop-default-v2` | One-time slower-default migration marker |
| `zen-v1` | Versioned current Zen state and bounded undo/redo history |

Invalid saves fall back safely. SDK storage falls back to session memory when persistence is unavailable. Timed modes start fresh on reload.

## Development and verification

`pnpm dev:game tetris` starts the game. `pnpm check`, `pnpm test`, `pnpm build`, production preview and `pnpm test:e2e` are the release checks. Pure engine tests exercise collision, rotation/kicks, scoring, timing, bag order and save validation. Browser tests exercise the production path, mode loops, persistence, controls, pause and mobile input.

The real-play launcher artwork is captured through normal browser inputs; source captures and implementation notes live in gitignored `docs/internal/`. Asset/font sources are in [CREDITS.md](./CREDITS.md).
