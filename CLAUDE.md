# CLAUDE.md

@AGENTS.md

## Claude-specific notes

The import above pulls in AGENTS.md, which is the single source of truth for project instructions. Put shared guidance there, not here. Keep this file only for Claude Code specifics.

- **Plan first for multi-file work.** For anything touching more than one package (`games/*`, `packages/*`, `apps/*`), outline the change and the files involved before editing.
- **Use the task list** for multi-step work, and finish with the "Verifying your work" steps from AGENTS.md as the last item.
- **Check PLAN.md at the start of a session** (if present, since it's gitignored) to see the current phase, and tick items when done.
- **Personal, uncommitted instructions** go in `CLAUDE.local.md`, which is gitignored.
- **Browser checks:** when a browser tool is available, verify games via `pnpm preview` (not the dev server) and check the console and network for 404s under `/<slug>/`.
- **Don't run `pnpm build` in watch loops.** It's a full monorepo build. For iteration use `pnpm dev:game <slug>`, then do one full build at the end.
- **When unsure whether something needs an ADR, it probably does.** Add a short entry to `docs/DECISIONS.md` using the template there.