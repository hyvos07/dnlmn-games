# Snake

> Eat. Grow. Don't bite yourself.

| | |
|---|---|
| **Slug** | `snake` → games.dnlmn.dev/snake/ |
| **Engine** | vanilla (Canvas 2D) |
| **Status** | published |
| **Added** | 2026-10-08 |

## Concept
The classic, tuned for feel. The snake glides smoothly between grid cells instead of ticking, every pellet pops, and the speed keeps ramping, so a good run gets tense fast.

## Core loop
1. Steer toward the pellet.
2. Eat it: grow by one, score, and speed up a little.
3. Survive as long as you can without hitting a wall or your own body.

## Controls
| Input | Action |
|---|---|
| Keyboard | Arrow keys or WASD to turn. Space or Enter to start/restart. Arrows/WASD also start from the title screen. |
| Touch | Swipe to turn. Keep your finger down and draw an L to chain two turns. Tap to start/restart. |

Up to two turns are buffered, so quick double-taps (e.g. a U-turn) land as intended. Reversing straight into your neck is ignored.

## Win / lose / scoring
- A run ends when the head hits a wall or the body. Filling the whole 20×20 board wins.
- Each pellet is worth 10 points, rising by 10 every 5 pellets (pellets 1–5 = 10, 6–10 = 20, …).
- Step time starts at 140 ms and ramps toward 60 ms (×0.965 per pellet).
- The best score is stored per device.

## Saved data (`game.storage` keys)
| Key | Type | Meaning |
|---|---|---|
| `highscore` | number | Best score |

## Feel details
- Fixed-timestep logic with render interpolation; the body is one rounded path through real cell centres, so corners stay crisp.
- Particle burst, shock ring, score pop and a bulge that travels down the body on each eat. Small screen shake (off under `prefers-reduced-motion`).
- Attract mode: an autopilot snake plays behind the title screen, arcade-style.
- `?seed=<number>` makes food placement reproducible (used by e2e tests).

## Assets
See [CREDITS.md](./CREDITS.md).

## Known issues
- None yet.

## Ideas for later
- Wrap-around walls mode.
- Daily seeded challenge (seed = date).
