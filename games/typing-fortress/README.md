# Typing Fortress

> Light the runes. Hold the gate. Type to survive.

| | |
| --- | --- |
| **Slug** | `typing-fortress` → games.dnlmn.dev/typing-fortress/ |
| **Engine** | Vanilla TypeScript + OGL rendering (ADR-013), anime.js effects |
| **Status** | Published manifest; deployed through the normal site release |
| **Added** | 2026-10-12 |

## Concept

Defend Rune Bastion, a low-poly stone fortress powered by the Heartstone. Crawlers, crystal wisps, and armored golems approach from every direction across open terrain. Type their binding words to unleash magic and chase an endless best score. Background lore informs the art; the compact menu leads directly into play without a lore panel or campaign.

## Core loop

1. Choose Baby, Normal, or Fast Hand. Open **Options** to choose **Classic typing** (default) or **Editable field**. The choice is saved immediately through the SDK's localStorage wrapper and applies to subsequent runs.
2. Matching prefixes highlight together in both modes. Classic typing ignores wrong letters and Backspace clears the prefix. Editable field allows native Backspace/Delete, cursor movement, and selection; mistyped text remains available to correct. Matching is case-insensitive and requires the entire word.
3. An exact match fires automatically, consumes the field, awards points, and removes the defeated enemy from the simulation immediately; its visible body remains until the spell lands (280 ms), then shatters. This prevents a defeated attacker from damaging the gate while its shot travels. Reduced motion uses an immediate impact. Mistakes break the combo and show nearest-candidate feedback; enemy words and health remain unchanged until a complete match.
4. Survive increasing enemy density and a slow increase in word lengths. Fast Hand armored elites require multiple words. Spawn counts, word length, and effect pools have fixed caps.
5. When gate integrity runs out, compare your score, WPM, and accuracy, then restart immediately.

## Controls

| Input | Action |
| --- | --- |
| Physical keyboard letters | Type the displayed word (F/M are letters, not HUD shortcuts) |
| Backspace | Classic: clear the prefix. Editable: delete the preceding character or selection |
| Delete, arrows, Home / End, selection | Native field editing in Editable mode |
| Escape | Pause/resume |
| SDK HUD buttons | Menu, pause, mute, fullscreen, help |
| Pointer | Choose difficulty/typing style, Play, restart, refocus playfield |

Physical keyboard required. Touch-only typing is not advertised. Small viewports display keyboard guidance. Reduced motion suppresses decorative drift, shakes, and large transitions; gameplay and hit feedback remain readable. WebGL unavailable/context loss shows a clear recovery message.

Editable mode checks the current field each frame and when enemies spawn, so pretyped text can match a new arrival without another keystroke. Losing a target to the gate preserves editable text. Classic mode ignores typing while the arena is empty and clears orphaned prefixes when their last matching target disappears. A consumed word prevents duplicate hits in either mode. Pause blocks typing; editable text composition is evaluated only when committed. Paste and text drops remain blocked. Best scores stay shared by difficulty across both typing styles.

## Win / lose / scoring

There is no final wave or run timer. Six fortress hits end a run. Each completed word earns 10 points per letter, with a defeat bonus by role (crawler 25, wisp 40, golem 75), multiplied by a combo bonus that rises 5% per completion to a maximum 2×. Completing an elite's intermediate word earns word points without a defeat bonus. Mistakes and fortress damage break the combo but retain earned points.

Baby, Normal, and Fast Hand change enemy density (caps 8/12/16); movement speeds, enemy introduction times, and the active-time word-length schedule are shared. Words begin at 3–4 letters; the upper length rises once per 55 active seconds, capped at 11. A wave is 35 active seconds. Spawn pressure doubles over three minutes, then caps; the run continues indefinitely.

WPM is accepted letters / 5 per active minute. Accuracy is accepted letters / (accepted letters + incorrect characters), rounded to a percentage; with no attempts it displays 100%. Letters extending valid prefixes count as accepted; editable mode also counts letters pretyped into an empty arena. Deletions, native undo/redo, cursor movement, and repeated matching checks do not create new typing attempts. Paused time is excluded. Previously accepted letters remain counted when edited or cleared, so WPM describes typing throughput rather than completed-word throughput.

Opening spawn intervals are 2.6 seconds (Baby), 1.9 seconds (Normal), and 1.25 seconds (Fast Hand), with the first threat after 0.4 seconds on every run. Pressure rises immediately, halving those intervals at 180 active seconds while retaining the enemy caps.

Wisps enter the mix at 25 active seconds with a 55% spawn share. From 45 seconds, the mix becomes 45% crawlers, 31% wisps, and 24% golems. Only Fast Hand golems need multiple words: two initially, three from 165 active seconds.

Word boxes size to their actual text and elite health pips; projection, edge clamping, and overlap avoidance use their measured dimensions. Results lead with score, celebrate “A new best run,” and offer restart or “Return to menu.”

## Saved data (`game.storage` keys)

| Key | Type | Meaning |
| --- | --- | --- |
| `best-baby` | number | Best Baby score |
| `best-normal` | number | Best Normal score |
| `best-fast-hand` | number | Best Fast Hand score |
| `difficulty` | string | Last selected difficulty |
| `typing-mode` | `classic` or `editable` | Saved typing style, defaulting to classic |

Mute is managed globally by the SDK. Storage failures use the SDK's in-memory fallback.

## Assets and dependencies

All meshes, shaders, sigils, word lists, and synthesized sound are original. See [CREDITS.md](./CREDITS.md) for fonts and libraries. OGL supplies a small procedural 3D renderer; anime.js supplies spell/effect timelines. Neither controls rules or scoring. Fonts are bundled locally.

## Development and verification

`pnpm dev:game typing-fortress` starts the game. `pnpm thumbnail typing-fortress` records its silent attract siege, including DOM word labels. `pnpm check`, `pnpm test`, `pnpm build`, and `pnpm test:e2e` cover the normal repo release checks. Pure rules/tests live in `src/logic/`; renderer/effects in `src/render/`; `siege.ts` owns lifecycle and input integration.

## Known limits

WebGL and a physical keyboard are required. Best scores belong to this browser/device; no online leaderboard. Performance targets require measurement on real hardware; simulated mobile viewports do not certify phone GPU speed.

## Ideas for later

Practice mode, additional original enemy silhouettes, themed word packs, and seeded daily sieges. Keep endless score chasing as the main game.
