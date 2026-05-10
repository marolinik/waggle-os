# Brief za Claude Code — hive-mind CI pipeline + npm publish

**Datum**: 2026-04-19
**Izvor**: H-34 closure posle 2026-04-18 late-night sesije (282/282 green, 4 packages, ~8500 LOC vendored)
**Scope**: JEDNA sesija, jedan fokus. No new features, no scope creep.
**Output**: Green CI badge + 4 packages live na npm registry + first-run smoke skripta

---

## Session goal (one sentence)

Take the hive-mind repo from "locally 282/282 green" to "cloneable by a stranger, CI-validated, installable via `npm install @hive-mind/*` on any machine, with a smoke test script that proves end-to-end working MCP server in under 5 minutes."

## Why now

H-34 extraction is tehnički CLOSED (Waves 4–6 shipped 2026-04-18). But the repo is not "shipped" until:
1. A fresh clone on a clean runner passes all 282 tests without manual intervention.
2. The 4 packages are discoverable via `npm search` and installable via `npm install`.
3. A press/analyst persona (non-developer) can run a smoke script and see the MCP server work.

This session closes that gap. It is the last operational task before SOTA benchmark proof (LoCoMo 91.6% target) becomes the critical-path blocker for Waggle launch.

## Current state (as of H-34 closure)

- Repo: `D:\Projects\hive-mind`, Apache 2.0, 4 packages migrated.
- Packages: `@hive-mind/core`, `@hive-mind/wiki-compiler`, `@hive-mind/mcp-server`, `@hive-mind/cli`.
- Tests: 282/282 green across 38 test files (locally).
- Commits: Waves 4-6 landed in 2026-04-18 session (`9f774f7`, `74f2b76`, `a30d04a`, `6c32987`).
- Missing: GitHub Actions config, npm publish config, CHANGELOG, first-run smoke, release notes.

## Non-goals (strict)

- NO new features.
- NO refactoring beyond what CI forces.
- NO touching waggle-os monolith (companion fix `803c6f6` already landed separately).
- NO starting v2 GEPA, LoCoMo benchmark, or H13 landing work.
- NO npm scope changes, package renames, or version bumps beyond v0.1.0.
- NO platform-specific CI (Windows/macOS matrix) in this pass — Linux runner only. Cross-platform is a follow-up.

If any non-goal item appears tempting, STOP and write a follow-up issue instead.

## Acceptance criteria

### A. GitHub Actions CI pipeline

Path: `.github/workflows/ci.yml` in hive-mind repo.

- Triggers: push to `main`, PR to `main`.
- Runner: `ubuntu-latest`, Node 22 LTS, pnpm (use repo's pnpm version from `package.json` `packageManager` field or `.nvmrc` / `.tool-versions`).
- Steps (in order):
  1. Checkout
  2. Setup Node + pnpm + cache
  3. `pnpm install --frozen-lockfile`
  4. `pnpm -r run lint` (if lint scripts exist; skip gracefully if not)
  5. `pnpm -r run typecheck` (if typecheck scripts exist)
  6. `pnpm -r run test` — MUST pass with 282/282 on clean runner
  7. `pnpm -r run build`
  8. Artifact upload: dist folders of all 4 packages (for inspection)
- Required status check to be enabled on `main` branch protection.
- Green badge in README.md.

### B. npm publish readiness (dry-run first, then publish)

For each of the 4 packages:

- `package.json` has: `name`, `version: "0.1.0"`, `description`, `license: "Apache-2.0"`, `repository` (pointing to GitHub repo), `homepage`, `bugs`, `keywords`, `author`, `main`, `types` (if TS), `files` (explicit allowlist, not `.npmignore`), `publishConfig.access: "public"` (for scoped packages).
- `README.md` at package root (can be short, links to monorepo root README).
- LICENSE file at package root (Apache 2.0 text).
- `pnpm -r publish --dry-run` MUST succeed without warnings beyond informational.
- After dry-run clean: actual `npm publish` for all 4 packages.
- Verify via `npm view @hive-mind/core` etc. that all 4 are live.

Note on npm org scope: if `@hive-mind` org does not exist on npm yet, Claude Code stops and asks Marko to create it with his npm login (requires 2FA + organization creation flow). Alternative: unscoped names `hive-mind-core` etc. — but preferred is scoped.

### C. Root README normalization

Path: `README.md` at hive-mind repo root.

- CI badge (green)
- npm version badges for all 4 packages
- Quickstart: 5 lines max to go from `npm install` to first MCP tool call
- License: Apache 2.0
- Link to EXTRACTION.md (methodology doc)
- Link to first-run smoke (see D)
- Cross-repo link to `waggle-os` as consuming application

### D. First-run smoke script

Path: `scripts/first-run-smoke.sh` (+ Windows counterpart `scripts/first-run-smoke.ps1` if trivial; skip if not).

- Goal: A non-developer (press/analyst persona) runs one command and sees the MCP server respond.
- Steps automated:
  1. Check Node 22+ available
  2. `npm install -g @hive-mind/cli` (or temp-dir install)
  3. `hive-mind init --tmp` (creates sample workspace in a temp dir)
  4. `hive-mind mcp start &` (starts MCP server)
  5. `hive-mind mcp call list_tools` (prints 21 tools)
  6. `hive-mind harvest demo` (runs one small harvest from a public URL)
  7. `hive-mind mcp call search "demo"` (returns results)
  8. Print green checkmark + "smoke passed in Nms"

If any command does not exist in the current CLI surface, STOP — do not add it. Note the gap and return to Marko for decision (this is persona-facing; we do not invent commands).

### E. CHANGELOG.md

Path: `CHANGELOG.md` at root. Keep-a-Changelog format.

```
## [0.1.0] - 2026-04-19

### Added
- Initial public release extracted from waggle-os monolith
- @hive-mind/core: bitemporal KG, MPEG-4 I/P/B frame model, workspace, mind-cache
- @hive-mind/wiki-compiler: markdown compile pipeline with versioned output
- @hive-mind/mcp-server: 21 MCP tools + 4 resources
- @hive-mind/cli: 6 commands (init, harvest, mcp, wiki, search, status — verify exact names)
- 282 tests across 38 files
- Apache 2.0 license
```

### F. Release notes + GitHub Release

- Tag `v0.1.0` on the commit that passes CI green.
- GitHub Release from the tag, body = CHANGELOG entry + "installed via `npm install @hive-mind/core`".
- Marked as "latest release" and NOT pre-release (first stable public).

## Order of operations (recommended)

1. CI pipeline first (A). Do not touch anything else until CI runs green on a commit in `main` (or a feature branch). CI will expose any hidden local-only assumptions fast.
2. Package metadata hardening (B, up to dry-run). Dry-run surfaces missing fields without committing to npm.
3. Root README + CHANGELOG (C, E). Easy wins that unblock D.
4. First-run smoke (D). This is the riskiest item — it exercises the full surface from outside. Expect to find 1-2 small gaps in CLI surface area. Flag them to Marko via follow-up issue, do NOT patch inline.
5. npm org creation + real publish (B final step). Requires Marko.
6. Tag + GitHub Release (F).

## Definition of done

- CI green on `main` for the commit that ships v0.1.0.
- `npm view @hive-mind/core` returns `0.1.0`.
- `scripts/first-run-smoke.sh` on a clean Ubuntu runner exits 0 in under 5 minutes.
- CHANGELOG.md has v0.1.0 entry.
- GitHub Release `v0.1.0` exists with installation instructions.
- Root README has green CI badge + npm badges + 5-line quickstart.

## Escalation triggers (when to stop and ask Marko)

- npm `@hive-mind` org does not exist → needs Marko's npm login.
- CI fails on a test that passed locally → likely environment assumption; worth 30 min to diagnose, then stop.
- `pnpm publish --dry-run` warns about something non-trivial → confirm with Marko before proceeding.
- CLI surface gap in first-run smoke → do not invent commands; report and ask.

## Reporting at session end

Brief commit log (files touched, tests added if any), npm package URLs (once live), first-run smoke timing, and one-paragraph "what was surprising" note. Surface any technical debt discovered during CI surfacing — these go to follow-up issues, not patched in this session.
