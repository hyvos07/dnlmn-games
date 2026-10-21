# Adding a game

The checklist for going from idea to a game live at `games.dnlmn.dev/<slug>/`.

## 0. Pick the slug and engine

- **Slug:** short, lowercase, permanent (`snake`, `tile-flip`). Check it's not reserved (ARCHITECTURE §3) or already used.
- **Engine:**
  - `vanilla` for tiny games (Snake, Pong, 2048). Plain Canvas or DOM.
  - `kaplay` (default) for anything with sprites, scenes, collisions, or animation. The starter is a small dodger that shows scenes, collisions, keyboard + drag input, a score and a game-over screen. It fills the screen and re-lays out on resize. KAPLAY adds about 70 KB gzipped.
  - Anything else needs an ADR first (see [DECISIONS.md](./DECISIONS.md)).

## 1. Scaffold

```bash
pnpm new-game tile-flip --engine kaplay    # or --engine vanilla
```

This creates `games/tile-flip/` with:

```
game.json        # pre-filled, status: "draft"
index.html
src/main.ts      # initGame() + a start screen already wired up
public/favicon.svg # draft placeholder; replace with a game-specific drawn SVG
thumbnail.png    # placeholder, replace it with `pnpm thumbnail tile-flip`
CREDITS.md
README.md        # from docs/templates/GAME_README.md
package.json
vite.config.ts
```

## 2. Develop

```bash
pnpm dev:game tile-flip     # http://localhost:4321/tile-flip/ (stop pnpm dev first)
```

While you build, keep these in mind:
- Load assets via imports (`import heroUrl from './assets/hero.png'`) or `` `${import.meta.env.BASE_URL}sfx/jump.ogg` ``, never a bare `/sfx/jump.ogg`.
- Save with `game.storage.set('highscore', n)`, not `localStorage`.
- Implement `onPause`, `onResume`, and `onMuteChange` in `initGame`. Build any player-facing pause controls inside the game. The SDK pause UI and Escape shortcut are disabled by default; enable `platformPause: true` only when explicitly requested.
- Put rules and scoring in plain functions under `src/logic/` and add a `*.test.ts` next to them.
- For a DOM game, mark the playfield with `data-board`; the shared smoke tests recognize either this element or a canvas.
- Test touch input in the browser devtools' device mode early, not at the end.

## 3. Fill in the metadata

- `game.json`: title, tagline (≤ 60 chars), description, tags (from the vocabulary in RULES §6), input, controls, orientation.
- `public/favicon.svg`: original, game-specific vector artwork; replace the scaffold's draft placeholder. Keep `<link rel="icon" href="./favicon.svg" type="image/svg+xml" />` in `index.html` so Vite applies the game's base path once. Review at 16/32/64 pixels; do not use emoji. See [FAVICONS.md](./FAVICONS.md).
- `thumbnail.png`: at least 640px wide, 16:10 or 1:1, shows actual gameplay, not just the title. The launcher optimizes it. `pnpm thumbnail <slug> [--wait <ms>] [--selector <css>] [--still]` builds the game, runs it in a headless browser on a fake clock, hides the HUD and overlays, and captures the canvas (or a `[data-thumbnail]` element). Give your title screen an attract/demo mode so there's real gameplay to capture.
- `preview.webp` (optional, recommended): the same command also records a seamless 4-second loop that plays on the game's card ([ADR-011](./DECISIONS.md#adr-011-looping-gameplay-clips-on-launcher-cards)). Add `"preview": "preview.webp"` to `game.json` to use it, and keep it ≤ 300 KB. Pass `--still` to write only the thumbnail.
- `CREDITS.md`: every third-party asset with source URL + license. Write "All assets original" if that's true.
- `README.md`: the one-pager (concept, controls, scoring, ideas for later).

## 4. Verify like production

```bash
pnpm check
pnpm test
pnpm build          # fails on manifest errors or budget overruns
pnpm preview        # open http://localhost:4321/tile-flip/  (port may differ)
pnpm test:e2e
```

Manual pass on the preview:
- [ ] No 404s in the network tab, no console errors
- [ ] The tab uses the game's own SVG favicon and its resolved URL loads successfully
- [ ] Start screen shows, and audio only starts after a click/tap
- [ ] HUD works: Menu returns to `/`, Fullscreen, Mute (persists after reload), Pause, "?" panel shows controls
- [ ] Switching tabs pauses the game
- [ ] High score survives a reload
- [ ] Mobile viewport: playable, no page scroll/zoom while playing, orientation prompt if applicable

## 5. Publish

- Set `"status": "hidden"` first if you want to test it on the real domain via direct URL without listing it.
- Set `"status": "published"` and `"addedAt"` to today.
- PR title: `feat(tile-flip): add Tile Flip`. Check the preview deploy and merge.
- Tick the matching item in [PLAN.md](../PLAN.md), if there is one.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Works in `dev:game`, blank in `preview` | A hard-coded absolute path. Search for `"/` and `'/` in `src/`. |
| Assets 404 at `/assets/...` instead of `/<slug>/assets/...` | `vite.config.ts` isn't using `defineGameConfig`. |
| Build fails: "slug mismatch" | `game.json` slug ≠ folder name. |
| Build fails: "budget exceeded" | Compress audio, use atlases, lazy-load after the start screen, or justify `budgetKb` in the PR. |
| Sound doesn't play on iOS | Audio context not resumed inside a user gesture. Start audio from the start-screen tap. |
| Page scrolls/zooms on mobile during play | The SDK should prevent this. Make sure `initGame` runs before the game creates its canvas. |
