# Pixel Rush

An EatOwi-inspired four-lane reflex game with original SVG pixel creatures and electronic notes. Published as the collection's third game at `/tile-rush/`, with a recorded gameplay thumbnail and looping preview on the launcher.

## Development

Run `pnpm dev:game tile-rush` and open `http://localhost:4321/tile-rush/`. Pixel Rush is the sole art direction; its sprite loader and palette live in `src/visuals.ts`.

## Controls

The game uses the same centered, 400-pixel maximum column on every device, shrinking only to fit narrower screens. Desktop adds background space beside the game; it never widens the lanes. Each tile is a perfect square: its height and width both equal one quarter of the board width. The board fills the viewport height without scrolling, with dim side borders to subtly distinguish the arena from the background. A centered menu contains **Start**, a mode dropdown with centered option rows, and **How to play**. The dropdown supports touch, arrow keys, Home/End, Enter/Space, Escape and outside-click dismissal; it opens upward when there is insufficient room below. During play, there is only the board and compact timer; there is no sidebar or visible lane-button row. The canvas and target tiles have no focus outlines; menu buttons retain keyboard focus indicators.

Tap the lowest live target, resting in the second-lowest row, or press **D / F / J / K** for lanes 1–4. The bottom row holds the last tapped character, dimmed with its original face. Like EatOwi, pointer input accepts the correct lane throughout the bottom three rows while the board moves. Each successful touch-down immediately scores, dims the target and advances the next target; the entire grid then scrolls one row over 150 ms. Rapid taps retarget the current movement without an animation lock. Reduced motion makes row movement instant. Holding a key does not repeat hits. Screen-reader lane controls and a label identifying the next target remain available.

Mute and fullscreen are available through the SDK HUD; F belongs to the game. There is no platform pause button, overlay or Escape shortcut. Switching tabs freezes active time and returning resumes automatically.

The timer starts on the first correct hit. A wrong lane before that first hit is ignored.

## Modes and scoring

- **Normal:** score as many targets as possible in 20 active seconds. A wrong lane ends the run.
- **Endless:** no time limit; a wrong lane ends the run.
- **Practice:** no time limit; mistakes are counted and you can continue.

Each correct hit is one point. **Finish** ends an Endless or Practice session; Normal ends on timeout or a wrong lane. The compact results overlay shows **CPS**, **Score**, and **Best CPS**, with **Again** and **Home** actions. Best CPS uses the accent color and a divider to distinguish the saved record from this run. Home returns to the game's menu.

A wrong tile turns red and blinks three times over 600 ms, following EatOwi's error feedback. Normal and Endless freeze gameplay immediately and show results after 1.5 seconds; pause also freezes this feedback sequence. Practice shows the red feedback and lets you continue. Reduced motion uses a steady red tile.

CPS is zero until one active second has elapsed, then equals score divided by the full active elapsed time. Best CPS is the sole saved record, stored through the SDK separately per mode from completed runs. A new CPS record displays “New best CPS!”; a higher score alone does not. The wrong-tile blink delay never counts toward CPS. Tab switching and help dialogs freeze active time. No external services or cookies are required.

## Artwork and captures

Pixel Rush uses original SVG sprites with joined silhouettes. Successful touch, mouse and keyboard input gives the tapped tile a brief 140 ms brightness pulse before it settles to 42% opacity, keeping its original face and size until subsequent hits move it offscreen. There are no particles. Reduced motion dims the tile immediately. Sprite images are decoded before the game starts. Wrong-tile feedback is a plain red blink, without an X. The character itself never dissolves.

A neutral-gray band with upper and lower edges marks the next live target's row, above the dimmed completed tile. Its fill and edges are dimmed by 20% from the brighter version, without diamond markers. The band travels with the row during the existing board scroll and moves instantly with reduced motion.

Artwork, the favicon and generated audio are original. The title screen plays the real rules automatically and silently as an attract mode. `pnpm thumbnail tile-rush` records gameplay to `thumbnail.png` and `preview.webp`; regenerate those files after visual changes before publishing. Pixel Rush review stills and clips are retained in `review/`.

Pause and help use the shared SDK interface, with the same self-hosted Bricolage Grotesque display font as the other games. SDK accent tokens follow Pixel Rush's palette. The font package provides static assets, with no additional runtime JavaScript.

## Release

Version 1.0.0 is listed on the launcher with a release date of 2026-10-19. The permanent slug is `tile-rush`. Regenerate gameplay captures after visual changes before a release.

## Verification

Pure rules have unit tests. Browser coverage checks first-hit timing, scoring, keyboard repeats, touch, tab visibility, timeout, endless/practice behavior, restart, and saved best CPS. Run the repository's full checks, build and production-path browser suite before publishing.

## Later ideas

Optional hit streak feedback, configurable round duration, and a daily seeded challenge.
