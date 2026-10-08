# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, etc.) working in this repo. Humans are welcome to read it too.

## What this is

**games.dnlmn.dev** is a static web game collection. An Astro launcher at `/` lists games, and each game is a standalone Vite + TypeScript bundle served at `/<slug>/`. One monorepo, one build, one Cloudflare deployment.

Read before non-trivial work:
1. [RULES.md](./RULES.md): hard constraints, must follow
2. [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md): layout, build pipeline, manifest, SDK
3. `PLAN.md`: what phase we're in and what's next *(local only, gitignored)*
4. `PRD.md`: product scope and non-goals *(local only, gitignored)*

`PLAN.md`, `PRD.md`, and `docs/GODOT.md` are private planning docs that aren't in the repository. If they exist in your working copy, read them. If they don't (fresh clone, CI, cloud session), RULES.md and docs/ are enough to work safely. Never `git add -f` them.

## Commands

```bash
pnpm install                          # install everything
pnpm dev                              # whole site with hot reload → http://localhost:4321
pnpm dev:launcher                     # Astro dev server for the menu only
pnpm dev:game <slug>                  # Vite dev server → http://localhost:5173/<slug>/
pnpm new-game <slug> --engine vanilla # scaffold a game (vanilla now; kaplay template lands in Phase 3)
pnpm thumbnail <slug>                 # screenshot real gameplay into games/<slug>/thumbnail.png
pnpm check                            # Biome lint+format check, tsc, manifest validation
pnpm check:fix                        # auto-fix formatting/lint
pnpm test                             # Vitest unit tests
pnpm build                            # build all + assemble into dist/ (enforces budgets)
pnpm preview                          # serve dist/ like production (wrangler dev → http://localhost:4321)
pnpm test:e2e                         # Playwright smoke tests against dist/ (run build first)
PW_CHANNEL=chrome pnpm test:e2e       # same, using your installed Chrome instead of Playwright's
E2E_PORT=4330 pnpm test:e2e           # same, on another port (e.g. while `pnpm dev` holds 4321)
pnpm build --filter @games/game-<slug>   # build a single game (Turbo filter)
```

## Repo map (short)

```
apps/launcher/        Astro site (the menu)
games/<slug>/         one game each: game.json, src/, public/, CREDITS.md, README.md
packages/sdk/         @games/sdk: HUD, storage, pause/mute, orientation (every game uses it)
packages/config/      shared Vite config (defineGameConfig), TS config, manifest schema
packages/templates/   scaffolds for new-game
scripts/              new-game.ts, assemble.ts, check-manifests.ts
tests/e2e/            Playwright smoke tests
public-root/          files copied to dist/ root (_headers, robots.txt, favicon)
```

## How to do common tasks

### Add a new game
Follow [docs/ADDING_A_GAME.md](./docs/ADDING_A_GAME.md). In short: `pnpm new-game <slug> --engine kaplay`, fill in `game.json`, write the game in `src/`, add thumbnail + `CREDITS.md` + `README.md`, then `pnpm build && pnpm preview` and test at `/<slug>/`.

### Change a game
Only touch files inside `games/<slug>/`. If you think another game or the SDK needs changing too, stop and say so rather than doing it in the same change.

### Change the SDK
Every game depends on it, so treat it as a public API. Keep changes backward compatible, add tests in `packages/sdk`, and run the full `pnpm build && pnpm test:e2e` to make sure all games still boot.

### Change the launcher
The launcher reads manifests and never imports game code. It's motion-rich by design ([ADR-009](./docs/DECISIONS.md#adr-009-motion-rich-launcher)), but strictly as progressive enhancement: the critical path (HTML+CSS+JS for first paint) stays ≤ 75 KB gzipped and must work on its own. The WebGL scene and anime.js load via dynamic `import()` after first paint/idle (≤ 200 KB gzipped). Under `prefers-reduced-motion` there's no WebGL or staggered motion, and state changes are instant. Adding a UI framework (React/Svelte islands) still needs an ADR. To change the accent colour site-wide (launcher, games, OG images), edit `ACCENT` in `packages/config/src/theme.ts`.

## Hard rules (summary; full list in RULES.md)

- Never import from one game into another.
- Never hard-code absolute asset paths. Use imports or `import.meta.env.BASE_URL`.
- Never call `localStorage` directly. Use `game.storage` from the SDK.
- Never add a runtime dependency or new engine without saying why. New engines need an ADR in `docs/DECISIONS.md`.
- Never rename a published slug.
- Every third-party asset needs an entry in that game's `CREDITS.md` with source + license.
- Don't edit `dist/` or any `*/dist/` by hand. They're build output.

## Verifying your work

Dev servers can hide base-path bugs. A change is only verified when:
1. `pnpm check && pnpm test` pass
2. `pnpm build` passes (it validates manifests and size budgets)
3. `pnpm preview`, then open the affected path(s) and confirm there are no 404s in the network tab and no console errors
4. `pnpm test:e2e` passes

If you can't run a step (no browser, etc.), say which step you skipped. Don't claim it passed.

## Style

- TypeScript strict, Biome-formatted, `kebab-case.ts` files.
- Keep pure logic (rules, scoring, grid math) separate from rendering, and unit-test it.
- Small, focused PRs. Conventional Commits with the area as scope: `feat(snake): …`, `fix(sdk): …`.

## Keep docs in sync

If your change alters commands, structure, or conventions, update this file and the relevant doc in the same change. When you finish a PLAN.md item, tick it (if PLAN.md is present).

Private notes go in `docs/internal/` or any `*.local.md` file. Both are gitignored.

## Context worth knowing

- Toolchain: Node 24 LTS (`.nvmrc`), pnpm 12 (`packageManager`), TypeScript 6 (pinned below 7 until `@astrojs/check` supports it). pnpm 12 blocks dependency build scripts unless they're listed under `allowBuilds` in `pnpm-workspace.yaml`, and it delays very fresh releases (`minimumReleaseAge`).

- Godot is a planned **later** track (Phase 6 of the roadmap). Don't introduce Godot or other heavy engines in normal game work. Do keep `engine: "godot"` working in the manifest schema.
- There is no backend yet. `/api/*` is reserved for future Cloudflare Workers.
- The owner is a solo developer. Prefer simple, boring solutions over clever infrastructure.
