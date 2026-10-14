# Architecture

How the repo, build, URLs, and runtime fit together. The PRD covers *what* and *why*. This document covers *how*.

---

## 1. Big picture

```
                        ┌──────────────────────────────┐
  games.dnlmn.dev  ───► │  Cloudflare static assets    │
                        │  (one deployment = dist/)    │
                        └──────────────┬───────────────┘
                                       │
          ┌────────────────────────────┼─────────────────────────────┐
          │                            │                             │
     /  (launcher)               /snake/ (game)                /dodge/ (game)
     Astro, static HTML          Vite bundle, vanilla          Vite bundle, KAPLAY
     reads all game.json         + @games/sdk HUD              + @games/sdk HUD
```

Everything is static files. There is no server code in the MVP. Each URL path is either a launcher page or a folder belonging to exactly one game.

## 2. Repository layout

```
games-dnlmn/
├── apps/
│   └── launcher/                 # Astro site → builds to apps/launcher/dist
│       ├── src/pages/            # index, about, 404
│       ├── src/components/       # GameCard, TagFilter, ...
│       └── src/content.config.ts # loads games/*/game.json
├── games/
│   ├── snake/
│   │   ├── game.json             # manifest (source of truth)
│   │   ├── index.html
│   │   ├── src/main.ts
│   │   ├── public/               # static assets copied as-is
│   │   ├── thumbnail.png         # source thumbnail (launcher optimizes it)
│   │   ├── preview.webp          # optional looping card clip (ADR-011)
│   │   ├── CREDITS.md
│   │   ├── README.md             # game one-pager (from docs/templates)
│   │   ├── package.json          # name: @games/game-snake
│   │   └── vite.config.ts        # one line: defineGameConfig(...)
│   └── dodge/ ...
├── packages/
│   ├── sdk/                      # @games/sdk — HUD, storage, lifecycle
│   ├── config/                   # @games/config — shared Vite/TS config, manifest schema
│   └── templates/                # scaffolds used by `pnpm new-game`
│       ├── vanilla/
│       └── kaplay/
├── scripts/
│   ├── new-game.ts               # scaffolder
│   ├── assemble.ts               # merges builds into dist/, validates
│   └── check-manifests.ts
├── tests/e2e/                    # Playwright smoke tests against dist/
├── public-root/                  # _headers, robots.txt, favicon → copied to dist/
├── dist/                         # build output (git-ignored)
├── AGENTS.md  CLAUDE.md  PRD.md  PLAN.md  RULES.md  README.md
├── docs/
├── turbo.json  pnpm-workspace.yaml  biome.json  tsconfig.base.json
└── wrangler.jsonc                # Cloudflare deploy config
```

## 3. URL map

| Path | Owner | Notes |
|---|---|---|
| `/` | launcher | Game grid |
| `/favicon.svg` | launcher | Conventional root fallback for the launcher SVG identity |
| `/about/` | launcher | |
| `/404.html` | launcher | Served with HTTP 404 at the original unknown URL; see [404.md](./404.md) |
| `/_astro/*` | launcher | Hashed launcher assets |
| `/og/*` | launcher | Generated OG images |
| `/thumbs/*` | launcher | Optimized thumbnails and preview clips |
| `/tag/<tag>/` | launcher | Pre-filtered grid: the no-JS fallback for the tag filter |
| `/sitemap.xml` | launcher | |
| `/<slug>/` | game | Game entry `index.html` |
| `/<slug>/assets/*` | game | Hashed game assets from Vite |
| `/<slug>/favicon.svg` | game | Game-specific SVG copied from its own `public/` directory |
| `/api/*` | *(reserved)* | Future Worker endpoints (leaderboards) |

**Reserved slugs** (the build rejects them as game slugs): `about`, `api`, `og`, `thumbs`, `assets`, `static`, `_astro`, `tag`, `tags`, `play`, `admin`, `404`.

Slug format: `^[a-z][a-z0-9-]{1,30}$`. Slugs are permanent once published, because changing one breaks shared links and saved data.

## 4. Game manifest

`games/<slug>/game.json`, validated by a Zod schema in `packages/config/manifest.ts`.

```jsonc
{
  "slug": "snake",                       // must equal folder name
  "title": "Snake",
  "tagline": "Eat. Grow. Don't bite yourself.",   // ≤ 60 chars, shown on card
  "description": "Longer text for meta description and the HUD '?' panel.",
  "engine": "vanilla",                   // "vanilla" | "kaplay" | "phaser" | "pixi" | "three" | "godot"
  "tags": ["arcade", "classic"],         // lowercase, from the tag vocabulary in RULES.md §6
  "input": ["keyboard", "touch"],        // "keyboard" | "mouse" | "touch" | "gamepad"
  "controls": {                          // human-readable, shown in HUD '?' panel
    "keyboard": "Arrow keys or WASD",
    "touch": "Swipe to turn"
  },
  "orientation": "any",                  // "any" | "landscape" | "portrait"
  "thumbnail": "thumbnail.png",          // relative to game folder, 16:10 or 1:1, ≥ 640px wide
  "preview": "preview.webp",             // optional looping card clip from `pnpm thumbnail` (ADR-011)
  "status": "published",                 // "draft" | "hidden" | "published"
  "addedAt": "2026-10-02",
  "version": "1.0.0",
  "budgetKb": 1536                       // optional override; gzipped initial download cap
}
```

| status | Built for prod? | Listed in launcher? | Reachable by URL? |
|---|---|---|---|
| `draft` | no | no | no |
| `hidden` | yes | no | yes |
| `published` | yes | yes | yes |

## 5. Build pipeline

```
pnpm build
  │
  ├─ turbo run build                     (parallel, cached per package)
  │    ├─ games/<slug>          → games/<slug>/dist      (vite build, base=/<slug>/)
  │    └─ apps/launcher         → apps/launcher/dist     (astro build, reads game.json files)
  │
  └─ tsx scripts/assemble.ts
       1. load + validate every game.json (schema, slug == folder, reserved, unique)
       2. skip drafts
       3. copy apps/launcher/dist/*     → dist/
       4. copy games/<slug>/dist/*      → dist/<slug>/
       5. copy public-root/*            → dist/
       6. enforce size budgets (gzip size of files referenced by each index.html)
       7. fail on any path collision
```

`packages/sdk` and `packages/config` have no build step. They're internal packages whose `exports` point at TypeScript source, and each game's Vite build bundles what it imports. Turbo's build inputs include `packages/*/src/**`, so changing the SDK invalidates every game's cache.

### Base path handling
Each game's `vite.config.ts` is a single line:

```ts
import { defineGameConfig } from '@games/config/vite';
export default defineGameConfig(import.meta.dirname);
```

`defineGameConfig` reads `game.json`, sets `base: '/<slug>/'`, sets `build.outDir`, and adds shared defaults (target, asset inlining limit, etc.). In game code, refer to assets through imports (`import url from './sprite.png'`) or `import.meta.env.BASE_URL`, never with hard-coded `/` paths.

### Local dev

Each game's HTML links its own `public/favicon.svg` using the relative `./favicon.svg`; Vite applies the base once in standalone development, the combined Astro server, and production. The launcher imports `public-root/favicon.svg` as a URL in `Base.astro`, so it is also served in Astro development; assembly retains the conventional root fallback. Artwork and future-game conventions are in [FAVICONS.md](./FAVICONS.md).

- `pnpm dev` uses the normal pnpm workspace script to run Astro on port 4321. The dev-only Vite plugin in `scripts/lib/dev-games.ts` mounts each game's independent Vite middleware at `/<slug>/`, including drafts. All HTTP requests and HMR websockets share Astro's server: no proxy, upstream ports, or separate game processes. Game configs and production bundles remain independent.
- `pnpm dev:launcher` is an alias for the same Astro server, including game routes.
- Game middleware runs before Astro's page guards, so extensionless Vite modules such as `/<slug>/@vite/client` are served without Astro requiring a trailing slash. Bare game paths redirect to `/<slug>/`.
- `pnpm dev:game <slug>` runs only that game's Vite server at `http://localhost:4321/<slug>/`.
- `pnpm build && pnpm preview` serves the assembled `dist/` on port 4321 exactly like production. Use it before calling anything done. Dev and preview are alternatives: stop one before starting the other. Dev fails if its port is occupied rather than silently choosing another port. The deployed Cloudflare site uses standard HTTPS, with all games on the same origin.

### Game-local WebGL rendering

Typing Fortress uses vanilla TypeScript rules and lifecycle with a game-local OGL renderer, DOM word labels, and anime.js effects ([ADR-013](./DECISIONS.md#adr-013-ogl-battlefield-for-typing-fortress)). Its manifest remains `engine: "vanilla"`; OGL is a rendering dependency. The launcher reads its manifest and captures exactly as for other games. Renderer code stays inside the game and is never imported from the launcher.

### Browser tests

Playwright starts Wrangler against the assembled `dist/`, using bundled Chromium in CI. CI runs one worker to avoid contention between software WebGL renderers and simulated animation frames. For clock-controlled gameplay, install the clock with a fixed date before navigation so all timers and animation frames share it and seeded word selection is repeatable. Advance the clock in bounded steps until the public end-of-run UI appears; keep score, pause, and restart assertions intact.

The long Typing Fortress defeat scenario advances with repeated 50 ms `clock.fastForward` steps, simulating 20 fps and retaining the game's 50 ms frame-delta limit. A large jump would advance the simulation by only one clamped frame, while `runFor` replays every intervening frame and is expensive with software WebGL. Other timing-sensitive scenarios retain `runFor` to exercise all intermediate frames and timers.

## 6. `@games/sdk`

Tiny (target ≤ 5 KB gzipped), zero dependencies, framework-agnostic. Every game uses it.

```ts
import { initGame } from '@games/sdk';
import manifest from '../game.json';

const game = initGame(manifest, {
  onPause: () => k.debug.paused = true,
  onResume: () => k.debug.paused = false,
  onMuteChange: (muted) => setVolume(muted ? 0 : 1),
});

game.storage.get<number>('highscore', 0);
game.storage.set('highscore', 120);
game.muted;          // global mute, shared across all games
game.exitToMenu();   // navigates to '/'
```

`initGame` does the following:
- Mounts the **HUD**: a small corner overlay with Menu, Fullscreen, Mute, Pause, and "?" (description and controls from the manifest). Keyboard: `Esc` pauses, `F` toggles fullscreen, `M` toggles mute. Games can suppress keys they need.
- Wires `visibilitychange` to `onPause` and `onResume`.
- Shows a rotate prompt if `orientation` doesn't match on touch devices.
- Sets mobile-friendly defaults: prevents pull-to-refresh, double-tap zoom, and context menu on the game canvas.
- **Storage**: `localStorage` wrapped in try/catch, JSON-encoded, with keys prefixed `dnlmn:<slug>:`. Global settings use `dnlmn:global:`. If storage is unavailable (private mode), it falls back to in-memory.

The SDK is the only place allowed to touch `localStorage`, fullscreen APIs, or global keyboard shortcuts.

## 7. Launcher

- Astro content collection loads `../../games/*/game.json` with the glob loader and the same Zod schema from `@games/config`. Only `published` games are listed.
- Published cards run from the first release to the latest: ascending `addedAt`, then alphabetical slug for ties. Card numbers match that order. The hero's "Latest" link selects the last game in this release-ordered list.
- `apps/launcher/scripts/gen-images.ts` (sharp) runs before `astro build`/`astro dev`. It writes thumbnails as AVIF/WebP at 400 and 800 px to `/thumbs/<slug>-<size>.<ext>`, copies a game's preview clip to `/thumbs/<slug>-preview.webp`, and a basic OG card per game to `/og/<slug>.png` (plus `/og/home.png`). Outputs are gitignored and skipped when they're newer than their sources. Each game's `index.html` points at its OG image through meta tags injected by `defineGameConfig` (Vite HTML transform).
- Theme: dark only. Accent tokens come from `@games/config/theme` (`ACCENT`) and are inlined as CSS variables.
- Fonts (Bricolage Grotesque 800, Instrument Sans variable, latin subset) are self-hosted, preloaded and use `font-display: optional`, so a late font never shifts layout.
- The tag filter is a small vanilla script or Astro island. There's no framework runtime on the launcher unless an ADR adds one.
- Filter state lives on `<html data-tag="…" data-touch>`, and page-generated CSS hides non-matching cards. A tiny inline head script applies `?tag=`/`?touch=1` before first paint (no layout shift). `scripts/boot.ts` flips the attributes on chip clicks and syncs the URL with `pushState`. Without JS, chips are links to the static `/tag/<tag>/` pages.

### Critical path vs enhancement ([ADR-009](./DECISIONS.md#adr-009-motion-rich-launcher))

| Layer | Contents | Budget (gzipped) | Loaded |
|---|---|---|---|
| Critical | HTML, CSS, `boot` script (filter, URL sync, navigation) and its static imports | ≤ 75 KB | Immediately |
| Enhancement | WebGL scene (OGL), anime.js, motion code | ≤ 200 KB | Dynamic `import()` after first paint/idle, never under `prefers-reduced-motion` |

The page is complete with the critical layer alone. Without JS, the filter falls back to static `/tag/<tag>/` pages.

Enhancement modules (`apps/launcher/src/scripts/enhance/`):
- `scene.ts`: one OGL renderer and canvas, seven instanced low-poly meshes (`pieces.ts`), with all motion in the vertex shader. The mood eases per section (hero lively, grid receded, footer pieces form a snake). Pieces are dimmed toward the page colour and fade out behind text, whose boxes are passed in as uniforms. It pauses when the tab is hidden, caps DPR at 2 (1.5 on touch), uses fewer pieces on low-end devices, and drops resolution if frames run long.
- `motion.ts` (anime.js): the title "power-on" wave and letter bounces, card reveal on scroll, looping gameplay clips faded in over card stills once they near the screen (ADR-011), 3D tilt + glare (CSS custom properties), the exit wipe into a game, and FLIP filtering.
- `trail.ts`: the footer snake, an SVG on a grid. Each `[data-wall]` text group is one solid box, and it never goes below `[data-trail-floor]` (the fine print). It hunts apples on its own (BFS), follows the cursor while hovered, and only runs while the footer is visible.
- `dots.ts`: the about page's background, a 2D-canvas dot grid that faintly reacts to the pointer. It only draws while something is moving.

`assemble.ts` measures both layers: the critical set is every file referenced by the launcher HTML plus its static JS import graph, and every other launcher JS chunk counts as enhancement.

## 8. Hosting and headers

Cloudflare Workers with static assets only ([ADR-010](./DECISIONS.md#adr-010-workers-static-assets-previewed-with-wrangler-dev)), configured in `wrangler.jsonc`, with the custom domain `games.dnlmn.dev`. `pnpm preview` runs `wrangler dev`, so local preview uses the same asset routing, `_headers` and 404 handling as production.

`public-root/_headers`:

```
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()

/_astro/*
  Cache-Control: public, max-age=31536000, immutable

/:slug/assets/*
  Cache-Control: public, max-age=31536000, immutable

/thumbs/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800

/og/*
  Cache-Control: public, max-age=86400, stale-while-revalidate=604800
```

Thumbnails and OG images keep stable, unhashed URLs (link previews depend on them), so they get a day of caching plus a week of stale-while-revalidate instead of `immutable`.

HTML keeps the default revalidation so deploys show up immediately.

**Limits to remember:** 25 MiB per file, plus a maximum file count per deployment. Neither matters for KAPLAY or vanilla games, but both matter for Godot (see [GODOT.md](./GODOT.md)).

## 9. Escape hatch: deploying a game separately

If a game ever needs its own repo, its own stack, or files too large for the main deployment:

1. Deploy it as its own project, built with `base: '/<slug>/'`.
2. Keep a `game.json` in `games/<slug>/` with `"hosting": { "type": "external", "origin": "https://<project>.pages.dev" }`, so the launcher still lists it.
3. Put a small Worker in front of `games.dnlmn.dev` that proxies `/<slug>/*` to that origin and passes everything else to static assets.

URLs don't change for players. This step is deliberately **not** built until a game needs it (see ADR-005).

## 10. Future backend (post-MVP)

Leaderboards and similar features go under `/api/*`, served by a Cloudflare Worker with D1 (SQLite) or KV. Because games and API share the origin, there's no CORS to manage. Anti-cheat stays basic (rate limiting, server-side sanity bounds on scores). This is a hobby site, not a tournament platform.
