# Architecture Decision Records

A short log of decisions that would be expensive to reverse, so nobody (human or agent) re-argues them without new information. Add new entries at the bottom. Never edit an accepted decision. Supersede it with a new one.

**Template**

```md
## ADR-XXX: Title
- **Status:** Proposed | Accepted | Superseded by ADR-YYY
- **Date:** YYYY-MM-DD
- **Context:** what problem / forces
- **Decision:** what we chose
- **Consequences:** trade-offs we accept
- **Revisit when:** the signal that should reopen this
```

---

## ADR-001: Single monorepo, single deployment
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** Games must appear under one domain at `/<slug>/`. The options were (a) one repo, one build, one deploy, (b) separate deploys stitched together with rewrites, and (c) subdomains per game.
- **Decision:** (a). All games live in `games/`, build into `dist/<slug>/`, and deploy as one static site.
- **Consequences:** It's the simplest mental model and production matches `pnpm preview` exactly. Games share one origin, so storage must be namespaced (handled by the SDK). Every deploy ships everything, which Turbo caching mitigates.
- **Revisit when:** A game needs its own repo or stack, or exceeds hosting file limits. Use the escape hatch in ARCHITECTURE §9 for that one game rather than restructuring.

## ADR-002: Astro for the launcher
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** The launcher is mostly a static list generated from metadata, with light interactivity (filtering).
- **Decision:** Astro, using content collections loaded from `games/*/game.json`.
- **Consequences:** Near-zero JS by default, built-in image optimization, and easy OG generation. Any rich UI needs an island, which needs an ADR to keep JS small.
- **Revisit when:** The launcher needs app-like features (accounts, live data) beyond what islands handle comfortably.

## ADR-003: KAPLAY as the default game framework, vanilla allowed
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** The owner wants the simplest framework to start, and to avoid Godot's web load times for now.
- **Decision:** Default to **KAPLAY** (simple, beginner-friendly 2D API). Use **vanilla TS + Canvas/DOM** for tiny games. Phaser, PixiJS, and Three.js are allowed per game with a short ADR.
- **Consequences:** Fast prototyping and small bundles. KAPLAY is less battle-tested than Phaser for big projects, so a complex game may need Phaser later.
- **Revisit when:** Two or more games hit KAPLAY limitations (performance, missing features).

## ADR-004: Cloudflare for hosting
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** Static site with potentially heavy game assets. Needs custom headers, preview deploys, and later a path to serverless APIs.
- **Decision:** Cloudflare static assets (Workers static assets or Pages) with custom domain `games.dnlmn.dev`.
- **Consequences:** Generous bandwidth on the free tier, `_headers` support, and Workers + D1/KV for future leaderboards on the same origin. There's a 25 MiB per-file limit, which matters for Godot.
- **Revisit when:** Hitting plan limits, or Godot assets need different hosting.

## ADR-005: Games served directly at `/<slug>/` (no iframe shell in MVP)
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** Portals often wrap games in an iframe "shell" page with site chrome. That's more consistent but adds a page hop, iframe quirks (fullscreen, focus, mobile keyboard), and more build machinery.
- **Decision:** The game's own `index.html` is the page at `/<slug>/`. Site chrome comes from the SDK HUD overlay inside the game.
- **Consequences:** Fewer moving parts, faster load, and URLs exactly as desired. The HUD must stay small and must not conflict with game input.
- **Revisit when:** Adding embed-in-other-sites support, sandboxing untrusted games, or Godot needs a pre-play shell. A shell could then live at the same URL with the game moved under `/<slug>/play/`.

## ADR-006: Godot deferred to a dedicated later phase
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** The owner is interested in Godot, but Godot 4 web exports are large (multi-MB to tens of MB) and slow to load compared to JS frameworks.
- **Decision:** No Godot in the MVP. The manifest schema accepts `engine: "godot"` now, but the build rejects it until Phase 6. Planning notes live in `docs/GODOT.md`.
- **Consequences:** The MVP stays fast and simple, and the door stays open.
- **Revisit when:** Phase 3 is done, or a game idea clearly benefits from Godot's editor/physics/scene tools.

## ADR-007: pnpm + Turborepo
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** Many small packages with the same build steps, and builds should only redo what changed.
- **Decision:** pnpm workspaces for dependency management, and Turborepo for task orchestration and caching.
- **Consequences:** Fast incremental builds, plus one more config file (`turbo.json`).
- **Revisit when:** Turbo becomes more trouble than it saves (e.g. under ~5 games it's optional, so fine to add it when builds get slow).

## ADR-008: Biome instead of ESLint + Prettier
- **Status:** Accepted
- **Date:** 2026-10-02
- **Context:** A solo project wants one fast tool with minimal config.
- **Decision:** Biome for linting and formatting.
- **Consequences:** Fewer plugins are available than in the ESLint ecosystem. The Astro file support may be partial, so we accept that or format `.astro` separately.
- **Revisit when:** A needed rule only exists in ESLint.

## ADR-009: Motion-rich launcher
- **Status:** Accepted
- **Date:** 2026-10-08
- **Context:** ADR-002 picked Astro for a near-zero-JS launcher, and RULES §4 capped it at 75 KB gzipped in total. The owner wants the launcher to feel like an arcade: a WebGL scene of floating game pieces behind the page, staggered reveals, a FLIP-animated filter, and a cursor-following snake in the footer. That can't fit in 75 KB, and "near-zero JS" no longer describes the goal.
- **Decision:** Allow **WebGL** and **anime.js** in the launcher, strictly as **progressive enhancement**. Use **OGL** for WebGL because it does instanced low-poly meshes with custom shaders at a fraction of three.js's size. three.js is allowed only if OGL can't produce a needed effect. The rules:
  - **Critical path** (HTML + CSS + JS needed for first paint) stays ≤ 75 KB gzipped. The page must be complete and usable with only this: grid, links, and filter (with a no-JS fallback).
  - **Enhancement JS** (WebGL scene + anime.js + motion code) ≤ 200 KB gzipped, loaded with dynamic `import()` only after first paint/idle (`requestIdleCallback`).
  - One WebGL context and one canvas for the whole page. Pause rendering when the tab is hidden or the scene is invisible. Cap `devicePixelRatio` at 2 (1.5 on mobile) and scale object counts down on mobile/low-core devices.
  - `prefers-reduced-motion`: no WebGL and no staggers. Show a static poster and make state changes instant.
  - Native scroll only: no scroll-jacking or smooth-scroll libraries.
  - If WebGL fails or JS is disabled, the page still fully works. The h1 is real HTML and the LCP element, never the canvas.
  - Still no UI framework runtime (React/Svelte/etc.) without a further ADR.
- **Consequences:** This partially supersedes the "near-zero JS" consequence of ADR-002. Astro remains the launcher. The launcher's Lighthouse mobile Performance target drops from the PRD's original ≥ 95 to ≥ 90, now recorded in RULES §4. `scripts/assemble.ts` enforces the two budgets separately. Motion code needs more care (fallbacks, reduced motion, CLS 0) and more e2e coverage.
- **Revisit when:** Enhancement JS approaches 200 KB, Lighthouse mobile Performance drops below 90, or the motion starts hurting usability on low-end phones.

## ADR-010: Workers static assets, previewed with `wrangler dev`
- **Status:** Accepted
- **Date:** 2026-10-08
- **Context:** ADR-004 picked Cloudflare but left "Workers static assets or Pages" open. `pnpm preview` must behave exactly like production, including `_headers`, trailing-slash handling and the 404 page, or base-path and routing bugs slip through.
- **Decision:** Deploy as a **Worker with static assets only** (`wrangler.jsonc`, `assets.directory: ./dist`, `not_found_handling: "404-page"`, `html_handling: "auto-trailing-slash"`). `pnpm preview` runs `wrangler dev` on port 4321, which serves `dist/` through the same asset engine locally, with no login needed. CI deploys with `wrangler deploy` and creates PR previews with `wrangler versions upload`.
- **Consequences:** Local preview and Playwright tests exercise real Cloudflare routing. `/api/*` can later become Worker code in the same deployment (ARCHITECTURE §10). `wrangler` (with `workerd`) is a dev dependency, which adds install weight.
- **Revisit when:** Cloudflare deprecates assets-only Workers, or preview/production behaviour diverges.

## ADR-011: Looping gameplay clips on launcher cards
- **Status:** Accepted
- **Date:** 2026-10-08
- **Context:** Game cards show a still thumbnail. The owner wants them to move, showing real gameplay. The launcher must never import game code (RULES §1), so it can't run the game itself, and a clip must not hurt first paint or LCP.
- **Decision:** Each game may ship a short **animated WebP** clip of its attract/demo mode, declared as `"preview"` in `game.json`. Animated WebP plays in a plain `<img>`, needs no player JS, and is encoded by `sharp` (already a dependency), so no video encoder like ffmpeg is needed.
  - `pnpm thumbnail <slug>` records it: it runs the game on Playwright's fake clock and captures exactly one frame per tick (25 fps, 4 s, 640 px square). It crossfades the last 10 frames back into the start so the loop is seamless, and writes `preview.webp`. The still `thumbnail.png` is the clip's first frame, so swapping one for the other is invisible.
  - The card's critical HTML is unchanged: it still shows the optimised still. The motion layer (ADR-009) fetches the clip only when the card nears the viewport, and fades it in once it has loaded. It's never loaded under `prefers-reduced-motion`, and it's hidden if reduced motion is switched on mid-visit.
  - Budget: ≤ 300 KB per clip, enforced by `assemble.ts`. That's separate from the 40 KB still budget.
- **Consequences:** Cards come alive with real footage, and new games get it from the same command. Each clip is a committed binary (~150 KB) that has to be regenerated when the game's look changes. Clips cost bandwidth only for visitors with motion enabled, and only for cards they scroll near. `sharp` is now also a root dev dependency, for the thumbnail script.
- **Revisit when:** Clips approach the budget, many games make the grid heavy to scroll, or browsers gain a better lightweight looping format (e.g. AVIF sequences with wide support).

## ADR-012: One listening port for development
- **Status:** Accepted
- **Date:** 2026-10-11
- **Context:** The custom dev runner started Astro on 4322 and each game on 5201 onward, then proxied them through 4321. This required extra processes and ports, and HMR could connect directly to an upstream port.
- **Decision:** Run the launcher with its normal pnpm workspace script on 4321. A dev-only Vite plugin mounts independent game servers in middleware mode and attaches their base-prefixed HMR websockets to Astro's HTTP server. Standalone game dev also defaults to 4321 with strict port selection. Production builds and Cloudflare hosting stay as in ADR-010.
- **Consequences:** One HTTP listener for the whole dev site, no reverse proxy or child-process orchestration, and unchanged game isolation. Stop dev before previewing on 4321. Restart dev after scaffolding a new game so its middleware is mounted.
- **Revisit when:** The number of game pipelines makes starting all of them expensive.

## ADR-013: OGL battlefield for Typing Fortress
- **Status:** Accepted
- **Date:** 2026-10-12
- **Context:** Typing Fortress requires a real low-poly 3D fortress, enemies approaching from all directions, and animated spell effects within the standard game budget. A full editor-based engine would add unnecessary download and build complexity.
- **Decision:** Use a game-local **OGL** renderer with procedural geometry, vanilla TypeScript simulation, DOM word labels, and **anime.js** presentation effects. The manifest uses `engine: "vanilla"` because the game loop, input, and rules remain vanilla TypeScript; OGL supplies rendering rather than a game framework. This ADR explicitly extends the vanilla Canvas/DOM option in ADR-003 to this WebGL game. Declare OGL and anime.js in the game's own dependencies; never import launcher scene code.
- **Consequences:** No manifest schema or SDK API changes. Reuse geometry and bound enemies/effects, cap pixel ratio, honor reduced motion, pause all animation alongside simulation, and handle unavailable WebGL with a readable message. Keep text outside the 3D scene for contrast and predictable readability. All geometry, word lists, and synthesized audio are original, avoiding model and audio downloads. Measure the assembled budget and browser behavior before calling the implementation complete.
- **Revisit when:** The renderer becomes hard to maintain, fails the game budget, or cannot keep word labels readable at the supported enemy limit.
