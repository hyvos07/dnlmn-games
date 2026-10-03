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
