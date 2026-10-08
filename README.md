# games.dnlmn.dev

A collection of small browser games behind one game-selector page. Every game is free, instant, and needs no install or account.

- **Launcher:** Astro, at `/`
- **Games:** Vite + TypeScript (KAPLAY or vanilla Canvas), each at `/<slug>/`
- **Hosting:** one static deployment on Cloudflare

## Quick start

```bash
pnpm install
pnpm dev                               # whole site with hot reload → http://localhost:4321
pnpm dev:launcher                      # menu only
pnpm dev:game snake                    # one game
pnpm new-game my-game --engine vanilla # new game (kaplay template: Phase 3)
pnpm build && pnpm preview             # production-identical local build → http://localhost:4321
```

## Docs

| File | What's in it |
|---|---|
| [RULES.md](./RULES.md) | Non-negotiable conventions and budgets |
| [AGENTS.md](./AGENTS.md) | Instructions for AI coding agents (and a good onboarding read) |
| [CLAUDE.md](./CLAUDE.md) | Claude Code entry point (imports AGENTS.md) |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Repo layout, URL map, build pipeline, manifest, SDK |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Architecture decision records |
| [docs/ADDING_A_GAME.md](./docs/ADDING_A_GAME.md) | Step-by-step checklist for new games |
| [docs/templates/GAME_README.md](./docs/templates/GAME_README.md) | One-pager template for each game |