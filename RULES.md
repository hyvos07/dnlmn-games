# RULES

Non-negotiable rules for this repo. They apply to humans and AI agents equally. If a rule blocks you, change the rule through a PR that also adds an entry to [docs/DECISIONS.md](./docs/DECISIONS.md). Don't work around it quietly.

**MUST** = CI or review will reject violations. **SHOULD** = strong default, deviate only with a stated reason.

---

## 1. Isolation

- **MUST**: A game only imports from its own folder and from `packages/*`. No imports from another game, ever.
- **MUST**: The launcher never imports game code. It only reads `game.json`, thumbnails and preview clips.
- **MUST**: Code shared by 2+ games moves into `packages/`, and only after the second game actually needs it. Don't abstract ahead of time.
- **MUST**: Never use global state that leaks between games: no `localStorage` outside the SDK, no cookies, no service worker scoped to `/` from a game.

## 2. Paths and URLs

- **MUST**: Never hard-code absolute asset paths (`/sprites/hero.png`). Use imports or `import.meta.env.BASE_URL`.
- **MUST**: `vite.config.ts` for every game uses `defineGameConfig`. Don't hand-set `base`.
- **MUST**: Slug equals the folder name and matches `^[a-z][a-z0-9-]{1,30}$`, and is not on the reserved list in [ARCHITECTURE.md §3](./docs/ARCHITECTURE.md#3-url-map).
- **MUST**: Once a slug is `published`, it never changes or gets reused.

## 3. SDK usage

- **MUST**: Every game calls `initGame(manifest, …)` exactly once at startup.
- **MUST**: Persist data only via `game.storage`, never `localStorage` directly.
- **MUST**: Respect `game.muted` and implement `onPause` and `onResume`.
- **MUST**: No audio before the first user gesture. Show a start screen.
- **SHOULD**: Pause controls belong to each game. The shared pause button, overlay and `Esc` shortcut are disabled by default; use `platformPause: true` only when explicitly wanted.
- **SHOULD**: Don't bind `F` or `M` (or `Esc` when platform pause is enabled) unless the game passes `reservedKeys` to override the HUD.

## 4. Performance budgets

| Thing | Budget |
|---|---|
| Launcher critical path: HTML+CSS+JS needed for first paint (gzipped) | ≤ 75 KB |
| Launcher enhancement JS: WebGL scene + anime.js, loaded after first paint/idle (gzipped) | ≤ 200 KB |
| Launcher Lighthouse mobile Performance | ≥ 90 |
| Thumbnail (each, optimized) | ≤ 40 KB |
| Card preview clip (each, animated WebP, loaded only by the enhancement layer, [ADR-011](./docs/DECISIONS.md#adr-011-looping-gameplay-clips-on-launcher-cards)) | ≤ 300 KB |
| Standard game initial download (gzipped) | ≤ 1.5 MB without a loader. Up to 5 MB with a progress loader |
| Any single file | < 25 MiB (hosting limit) |
| Frame rate | 60 fps target on a mid-range phone |

- **MUST**: Budgets are enforced by `scripts/assemble.ts`. Raise `budgetKb` in a manifest only with a reason in the PR.
- **MUST**: Launcher enhancement JS is loaded with dynamic `import()` after first paint, and the page works fully without it (see [ADR-009](./docs/DECISIONS.md#adr-009-motion-rich-launcher)).
- **SHOULD**: Prefer compressed audio (`.ogg`/`.m4a`) and sprite atlases over many small PNGs.
- **SHOULD**: Lazy-load large assets after the start screen, not before.

## 5. Code style

- TypeScript `strict: true` everywhere. Avoid `any`; if you must use it, add a `// biome-ignore` with a reason.
- Formatting and linting with **Biome** (`pnpm check`). Don't add ESLint or Prettier.
- File names: `kebab-case.ts`. Classes and types: `PascalCase`. Everything else: `camelCase`.
- Keep game entry (`src/main.ts`) short. Split scenes, entities, and input into files once it passes about 200 lines.
- Separate pure game logic (grid math, collision, scoring) from rendering so it can be unit-tested with Vitest.
- No new runtime dependency without saying why in the PR. Engines beyond `vanilla`/`kaplay` need an ADR.

## 6. Content and metadata

- **MUST**: Every game has `game.json`, `README.md` (from [docs/templates/GAME_README.md](./docs/templates/GAME_README.md)), `CREDITS.md`, and a thumbnail.
- **MUST**: Every published game has a game-specific drawn SVG at `public/favicon.svg`, linked through the relative `./favicon.svg` in `index.html` so Vite applies the base once. Replace the scaffold placeholder; no emoji artwork or copied launcher identity. See [FAVICONS.md](./docs/FAVICONS.md).
- **MUST**: Every third-party asset (sprite, sound, music, font) is listed in `CREDITS.md` with source URL and license. Only use CC0, CC-BY (with credit), or MIT/OFL fonts. No "found it on Google" assets.
- **SHOULD**: Tags come from this vocabulary. Add new ones in the same PR that first uses them.

  `arcade` · `puzzle` · `action` · `platformer` · `casual` · `strategy` · `classic` · `idle` · `rhythm` · `word` · `physics` · `two-player` · `experimental`

## 7. Accessibility

- **MUST**: Launcher is fully keyboard-navigable with visible focus. Every thumbnail has meaningful `alt` text.
- **MUST**: Text in the launcher meets WCAG AA contrast.
- **SHOULD**: Games avoid relying on color alone to signal state, and avoid rapid full-screen flashing (more than 3 per second).
- **MUST**: Launcher animations respect `prefers-reduced-motion`: no WebGL scene, no staggers, instant state changes.

## 8. Privacy and security

- **MUST**: No cookies, no third-party trackers or ad scripts.
- **MUST**: No secrets in the repo. Future API keys live in Cloudflare environment secrets.
- **MUST**: No `eval` or `new Function` in game code.
- **SHOULD**: Analytics, when added, are cookieless and aggregate only.

## 9. Git workflow

- `main` is always deployable. Every merge to `main` deploys.
- Branches: `game/<slug>-<topic>`, `launcher/<topic>`, `sdk/<topic>`, `chore/<topic>`.
- Commits follow Conventional Commits with the area as scope: `feat(snake): add wall wrap mode`, `fix(sdk): storage fallback in private mode`, `docs: update PLAN`.
- One game per PR where possible. SDK changes go in their own PR because they affect every game.
- **MUST**: CI is green (`check`, `test`, `build`, `test:e2e`) before merge.

## 10. Definition of done (for any change)

- [ ] `pnpm check` passes
- [ ] `pnpm test` passes
- [ ] `pnpm build` passes (includes manifest validation and budgets)
- [ ] `pnpm preview` checked manually at the affected path(s), on desktop and on a mobile viewport
- [ ] `pnpm test:e2e` passes
- [ ] Docs updated if behavior, commands, or conventions changed (AGENTS.md, ARCHITECTURE.md, and PLAN.md checkboxes if you have it locally)
