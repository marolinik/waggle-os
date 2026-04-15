# Contributing to Waggle OS

## Commit Convention

Format: `type(scope): short description`

Types: `feat`, `fix`, `refactor`, `chore`, `test`, `docs`, `style`, `perf`, `ci`

Scopes (package-level): `agent`, `core`, `shared`, `server`, `sdk`, `ui`, `cli`, `launcher`,
`marketplace`, `memory-mcp`, `optimizer`, `admin-web`, `waggle-dance`, `weaver`, `wiki-compiler`,
`worker`. App scopes: `app` (Tauri shell), `web` (main web app), `www` (landing), `sidecar`.

Examples:
```
feat(agent): add verifier persona with read-only enforcement
fix(core): prevent FrameStore from returning stale embeddings
chore(agent): dead code removal — orchestrator.ts
refactor(shared): split tiers into separate module
test(agent): add injection-scanner edge cases for nested payloads
```

One commit per logical change. Dead code removal gets its own commit before the real work.

## Branch Naming

```
feat/short-description
fix/issue-number-short-description
chore/cleanup-description
```

## Pull Request Checklist

Before requesting review:

- [ ] `npx tsc --noEmit --project packages/agent/tsconfig.json` — zero errors
- [ ] `npx tsc --noEmit --project app/tsconfig.json` — zero errors
- [ ] `npm run test -- --run` — all pass
- [ ] `npm run lint` — clean
- [ ] No `.env` values, API keys, or secrets in diff
- [ ] No `eval()`, `new Function()`, or dynamic `require()`
- [ ] All SQL uses parameterized queries (no string interpolation)
- [ ] If touching agent tools: `scanForInjection()` called on external input
- [ ] Every changed line traces to the task description

## Package Build Order

This is a 16-package monorepo (apps/* + packages/*). Build order matters for the core chain:

```
shared -> core -> agent -> server
```

Always run `npm run build:packages` after changing any package's types or exports.
Other packages (cli, sdk, ui, marketplace, etc.) compile independently but may depend on core/shared.

## File Size Rules

- New files should stay under 300 LOC. If it's growing past that, split it.
- Editing a file >300 LOC? Remove dead code first (separate commit).
- Files >500 LOC require chunked reads — never assume you've seen the whole file.

## Test Requirements

- Bug fix? Write a test that reproduces the bug first, then fix it.
- New feature? Write at least one happy-path and one edge-case test.
- Refactor? All existing tests must pass before AND after.
- Use Vitest for unit tests, Playwright for E2E.

## What Not to Do

- Don't "improve" code adjacent to your change. Mention it, don't touch it.
- Don't add abstractions for single-use code.
- Don't add error handling for impossible scenarios.
- Don't change formatting, comments, or style in files you're not working on.
- Don't recreate utilities that already exist (see CLAUDE.md Section 8).
