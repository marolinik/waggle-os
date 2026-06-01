# Waggle OS — Production-Readiness Assessment

**Date:** 2026-06-01
**Commit:** `839d4ce` (main, tree clean except this report + the vision-E2E design doc)
**Method:** 5 parallel auditors (build/tsc, CI/deploy, open-work residuals, test-infra/local-run, vision-E2E design) + independent re-verification of every load-bearing claim against the live repo and the GitHub Actions API.

---

## 1. Bottom Line

**Waggle OS is NOT production-ready for the desktop-binary / containerized-deploy path.** A single dependency-ordering gap — `build:packages` never builds `@waggle/hive-mind-core` before the packages that hard-depend on it — red-lines the CI e2e job, BOTH Tauri verify jobs (Windows + macOS), and every deploy artifact, while the green CI checkmark on main hides it (the unit-test gate passes only because vitest aliases `@waggle/*` to `src/`). The unit-test suite, tsc gates, lint, and the local web build are genuinely green, and the open-work residuals (§10 #1/#2/#3, OQ-4, OQ-5) are code-complete and test-green — but **the release/deploy plumbing has 6 hard blockers** that must be fixed before any binary or server ship. The gates that remain are: fix the package-build order, make the Dockerfile/render.yaml buildable + add a DB-migration step, then runtime-verify on a real binary.

---

## 2. Production Blockers (must-fix-before-launch)

> Each blocker re-verified independently. The first is the root cause of four downstream failures.

### B1 — `build:packages` omits `@waggle/hive-mind-core` → breaks CI e2e + both Tauri verifies + release + deploy *(ROOT CAUSE)*
- **Owner type:** code
- **Evidence:** `package.json` `build:packages = shared→core→agent→server`. `packages/core/package.json` declares `"@waggle/hive-mind-core": "*"`. `packages/hive-mind-core/package.json` exports ONLY `dist/index.js` + `dist/index.d.ts` (no `src` export), its `dist/` is **gitignored** (`.gitignore:11:dist`) and **NOT tracked** (`git ls-files packages/hive-mind-core/dist/` → empty), and it is **never built** by `build:packages`. On a fresh checkout its `dist/` is absent → `tsc --build` of `core` emits `TS2307: Cannot find module '@waggle/hive-mind-core'` (16 errors). **Confirmed live:** Tauri `verify-macos` run `26762292125` on the current HEAD `839d4ce` failed at the `Build packages (shared → core → agent → server)` step with exactly these TS2307 errors (`src/config.ts(4,69)`, `src/compliance/*`, `src/index.ts(81,8)`, etc.). The CI `e2e` job fails identically at its `Build packages` step. *(This is why the BUILD/TSC auditor saw "GREEN locally" — its machine had a stale pre-built `dist/`; on fresh checkout it is RED, which the CI logs prove.)*
- **Why CI looks green anyway:** the unit `test` job passes only because `vitest.aliases.ts` remaps `@waggle/*` → `src/`, sidestepping the missing dist. The `e2e` job is `continue-on-error: true` (`ci.yml:46`), so the workflow reports `success` even though e2e never runs.
- **Fix (verified):** prepend `cd packages/hive-mind-core && npx tsc --build &&` to the `build:packages` script. Re-verified the full corrected chain (`hive-mind-core → shared → core → agent → server`) exits 0 from a clean `dist`. This one change un-blocks e2e, both Tauri verifies, `release.yml`, and any deploy that runs `build:all`.

### B2 — Tauri `verify-windows` + `verify-macos` both RED (desktop release path broken)
- **Owner type:** code (resolved by B1)
- **Evidence:** `gh run list` (Tauri Build Verification / main / `839d4ce`): `verify-windows=failure`, `verify-macos=failure`. Both die at the `Build packages` step with the TS2307 above — **NOT** at Rust compile / signing / native-deps (the workflow header comment's diagnosis is wrong; it never reaches Rust). `release.yml` (tag-triggered) shares the same `sidecar→core→hive-mind-core` dependency and will fail the same way on a real `v*` tag.
- **Fix:** B1's fix. After it lands, re-run the Tauri verify workflow to confirm it now reaches (and passes) the Rust/Vite/sidecar stages.

### B3 — Dockerfile is not buildable (three independent breakages)
- **Owner type:** code
- **Evidence:** (1) `Dockerfile:20,57,84` `COPY packages/ui/package.json packages/ui/` — but `packages/ui/package.json` **does not exist** (CLAUDE.md §2: `ui` is not a workspace; confirmed `ls` → no such file) → COPY of a literal missing file fails the build. (2) Root `npm run build` = `cd apps/web && tsc && vite build`, but the Dockerfile only copies `app/` (`:22,:29`), **never `apps/`** → `RUN npm run build` fails (`cd apps/web` not found). (3) No `hive-mind-*` package source/manifest is copied, yet `CMD npx tsx packages/server/src/index.ts` resolves `@waggle/core → @waggle/hive-mind-core` at runtime.
- **Fix:** remove the `packages/ui` COPY lines; copy `apps/` (not just `app/`); copy the `hive-mind-*` packages needed for runtime resolution; build packages (with B1's fix) before `npm run build`.

### B4 — `render.yaml` builds the wrong directory and serves an empty/stale shell
- **Owner type:** code
- **Evidence:** `render.yaml:16` `buildCommand: npm install && cd app && npm run build` runs `vite build` in `app/`, but **`app/` has no `src/`** (confirmed `ls app/src` → no such file) and `app/index.html` references `/src/main.tsx`. The real UI is `apps/web`. `app/dist` is gitignored and the committed copy is a stale Apr-3 brand shell. `WAGGLE_FRONTEND_DIR=./app/dist` (`render.yaml:28`) → server serves nothing usable. The build also never runs `build:packages`, so the runtime entrypoint hits the same hive-mind-core gap.
- **Fix:** point the build at the repo root `npm run build:all` (which builds packages + `apps/web` → root `/dist`) and set `WAGGLE_FRONTEND_DIR=./dist`.

### B5 — No DB-migration step in any deploy artifact
- **Owner type:** code
- **Evidence:** `packages/server/src/db/migrate.ts` runs drizzle migrations from `./drizzle` (migrations present: `0000_wild_glorian.sql`, `0001_redundant_sauron.sql`). Grep of `Dockerfile`, `render.yaml`, `docker-compose.production.yml` for `migrat|seed` → only a code-comment match; no `startCommand`/`CMD`/entrypoint runs `migrate`. A fresh Postgres (render-provisioned or compose) starts with no schema → team-server queries fail at runtime.
- **Fix:** add a migrate step to the container entrypoint / render `startCommand` (e.g. `tsx packages/server/src/db/migrate.ts && <server start>`).

### B6 — `render.yaml` provisions Postgres+Redis but runs the local SQLite sidecar entrypoint (infra mismatch + CORS fail-closed gap)
- **Owner type:** decision (which deployment target?) then code
- **Evidence:** `render.yaml:17` `startCommand: npx tsx packages/server/src/local/start.ts --skip-litellm` → the **desktop/SQLite single-user sidecar**, not the team Postgres server (`packages/server/src/index.ts`, what the Dockerfile `CMD` runs). render injects/provisions managed Postgres+Redis (`render.yaml:32-40`) that the chosen entrypoint largely bypasses; team features (Clerk-gated, Postgres-backed) are not actually served. Separately, `config.ts:17-35` throws `'CORS_ORIGIN ... required in production'` when `NODE_ENV=production` (set in `render.yaml:21`) and unset — and **render.yaml defines no `CORS_ORIGIN`** (docker-compose.production.yml correctly enforces it at `:47`), so the team-server path would crash on boot.
- **Fix:** decide the render target. If it is the team server, switch `startCommand` to the Postgres entrypoint, add `CORS_ORIGIN`, and wire migrate (B5). If render is meant to host the local sidecar demo, drop the managed Postgres/Redis to stop paying for bypassed infra.

---

## 3. E2E Prerequisite Status

**The E2E vision harness depends on `npm run build` (apps/web → `/dist` on :3333) succeeding so the Playwright `webServer` can boot.**

- **Local status: GREEN.** `npm run build` (`cd apps/web && tsc --noEmit -p tsconfig.app.json && vite build --outDir ../../dist --emptyOutDir`) exits 0; `dist/index.html` is freshly written (Jun 1 17:00). `apps/web` imports only `@waggle/shared` (grep: 4 hits, zero `@waggle/hive-mind-core` — the only hive-mind references are comments in `LauncherApp.tsx`), and `@waggle/shared/dist` exists, so the apps/web build itself is not blocked by B1.
- **CI status: the e2e job's `npm run build` is currently UNREACHABLE** because the step before it — `npm run build:packages` (`ci.yml:66`) — fails at B1 (TS2307). So in CI today, the frontend never builds and Playwright never runs (the job is `continue-on-error`, so this is silently masked).
- **Net:** the E2E prerequisite is **green on a machine with a pre-built `hive-mind-core/dist`, but red on a clean checkout / in CI** until B1 is fixed. The handoff's "e2e frontend build blocked" note is real for CI; it just localizes to `build:packages` (B1), not to `apps/web` tsc.
- **Exact fix:** apply **B1** (build `hive-mind-core` first in `build:packages`). After that, the e2e job reaches `npm run build` (already green) and Playwright can boot the :3333 server. No change to `apps/web` tsconfig is needed.

---

## 4. Non-Blocking Residuals

**Open-work items (all code-complete + test-green; remaining work is platform/binary-blocked or doc-only):**
- **OQ-4 hermes compact-on-stop — DONE.** `compact-on-stop.ts` (opt-in `WAGGLE_HERMES_COMPACT_ON_STOP`, time-gated, save-first + fail-open); 26/26 tests, package tsc exit 0.
- **§10 #3 Wave 2/3 hooks — DONE, but CLAUDE.md prose is STALE.** codex/cursor/hermes/openclaw (+codex-desktop re-export) are real implementations with full adapter/install/uninstall/verify trees; 203/203 tests. Only `claude-desktop` remains `export {}` — a deliberate MCP-only deferral (pinned by `tests/placeholder-audit.test.ts` EXPECTED_MARKER_COUNT=1). **Doc fix (non-code):** CLAUDE.md §10 #3 (line 516) still lists all 6 packages as stubs — update to reflect only claude-desktop remains.
- **§10 #1 Spawn-Agent P36 + P35 model fallback — DONE in code** (`Dock.tsx`/`Desktop.tsx` wiring; `SpawnAgentDialog.tsx` 3-tier LiteLLM→runtime→provider-catalog fallback, commit `14942be`). Residual: runtime verify on a clean Tauri install (**platform-blocked**).
- **§10 #2 light-mode finish — DONE structurally** (semantic-token migration complete; the 5 `hive-950` hits are legit token defs/usages, no literal-color rot). Residual: BootScreen + header visual polish needs a binary to eyeball (**validation-blocked**).
- **OQ-5 OpenClaw live-install — genuinely platform-blocked.** Code path implemented + tested in tmp dirs (15 tests incl. fail-open); needs a real OpenClaw gateway to verify installed-handler dep resolution. Does not block a claude-code-first Waggle launch.

**CI / test-infra follow-ups (do not block launch, but should be tracked):**
- **CI e2e job is `continue-on-error: true`** — it cannot fail the pipeline. After B1, consider flipping it to blocking so a broken frontend build surfaces.
- **No Docker-infra CI lane.** Zero workflows declare `services: postgres` or run `test:infra`; Postgres/Redis/MinIO/S3 code paths are unverified by CI. `docker-compose.yml` provides the infra locally but CI never spins it up.
- **Dead/misleading test config:** `apps/web/playwright.config.ts` imports the uninstalled `lovable-agent-playwright-config` (would throw on load; apps/web has no specs) — delete it. `playwright-e2e.config.ts` (the `test:e2e` lane) has **no `webServer`** — it silently times out unless a server is pre-started on :3333; document or add a webServer block.
- **Committed test cruft:** `tests/visual/r2-uat-mega.spec.ts:3` has a dead hardcoded 64-hex token (rotate if it was ever real); `tests/login-flow.spec.ts` targets the wrong port (:8083) with a stale Clerk flow — fix or delete.
- **Build polish (cosmetic):** vite warns on `@import` order + a 1.74 MB JS chunk (>500 kB advisory). Non-fatal.

**Benchmark arcs (out of launch scope):** C-3 full GAIA-2 Phase 4 (needs Docker + ARE + new adapter strategy; budget recalibrate pending). LoCoMo v5 trio-strict re-judge (~$30, ~2h) is the only remaining step on C-1.

---

## 5. The Vision-E2E Harness Plan

**Design doc:** `docs/audits/2026-06-01-vision-e2e-harness-design.md`

**Recommended architecture — Option C (Hybrid).** Playwright deterministically drives and captures every surface (×dark/light) plus the 7 flows, emitting a PNG + sidecar JSON per capture **enriched with objective signals** (console errors via `page.on('console')`, failed network requests, and a Lighthouse contrast/a11y audit on heavy views). A multi-agent Workflow fans out one vision-judge subagent per capture to grade *meaning* against a 5-dimension rubric (`renders_correctly`, `no_error_state`, `flow_completes`, `theme_legible`, plus the objective `no_console_errors`). A reducer cross-checks vision vs objective signals — **a vision-PASS carrying a real console error or a Lighthouse fail is downgraded to FAIL** — and writes one report. This buys A's deterministic, replayable navigation plus a deterministic objective floor so a plausible-looking-but-broken screenshot can't fool the gate (defense in depth). Build on the existing `tests/visual` + `tests/e2e` helpers and the root `playwright.config.ts` `webServer` block (:3333, `reuseExistingServer`, `WAGGLE_TRUST_LOCALHOST=1`) — not greenfield. (Rejected: Option A lacks the objective floor; Option B's live agentic drive is non-deterministic → a flaky CI gate.)

**Scope.** ~19 surfaces (7 core views: chat/memory/events/capabilities/cockpit/mission-control/settings; plus room/agents/files/approvals/vault/connectors/marketplace/timeline/backup/telemetry/governance/dashboard; plus overlays: onboarding, Ctrl+K search, spawn-agent, persona switcher, shortcuts help, upgrade modal) × **dark + light** themes, plus **7 end-state-graded flows** (onboarding, chat round-trip, memory browse, spawn agent, persona switch, marketplace, settings tabs). Total ≈ **52 vision judgments/run**. Deterministic entry via `/?skipOnboarding=true&tier=power`; light theme via `data-theme='light'` on `<html>` (the old views.spec.ts dark/light-class toggle is stale and must not be the model). FAIL on any vision dimension at confidence ≥0.7 or any hard signal; WARN at 0.4–0.7 (routes to human, never auto-blocks CI).

**Coverage gap this fills:** today exactly ONE spec (`tests/visual/views.spec.ts`) does true pixel-diff (drift-only, brittle), three specs capture screenshots but assert nothing about their content, and **zero** tests semantically judge "does it actually look and work right." A visually-broken-but-DOM-present screen passes the current suite. The vision harness is net-new.

**The one key decision (needs the user's call):** **Does the Chat round-trip flow grade against a REAL LLM reply or a gracefully-handled degraded state?** Verified ground truth (`service.ts:217-258`): under the harness's own `--skip-litellm` server with no Anthropic key, `/api/chat` resolves the provider to `health:'degraded'` and returns NO assistant message.
- **Path 1 (degraded, CI default):** "completes" = user message renders + send works + missing-LLM state handled gracefully (clear "configure API key" prompt, not a blank window/stack trace). Deterministic, free, CI-safe — but does not verify a real answer.
- **Path 2 (real LLM, opt-in `--live-llm`):** inject a real key so chat returns an actual reply and vision grades a coherent assistant message. Highest fidelity, but non-deterministic, costs money, and the CI gate must hold a secret.
- **Recommended:** Path 1 as the CI gate, Path 2 as an opt-in pre-release lane. (Secondary, can default: run target = local Chromium against built `apps/web` on :3333.)

---

## 6. Recommended Sequence

1. **Fix B1 (the root cause).** Prepend `cd packages/hive-mind-core && npx tsc --build &&` to `build:packages`. Verified: the full corrected chain exits 0 from a clean dist. This un-blocks CI e2e, both Tauri verifies, `release.yml`, and `build:all`. *(code — ~5 min)*
2. **Re-run CI + Tauri verify on the B1 commit.** Confirm e2e's `build:packages`→`npm run build` now reaches Playwright, and that both Tauri verifies now progress past `Build packages` into the Rust/Vite/sidecar stages (and pass, or surface the *real* next failure). *(verification)*
3. **Flip the CI e2e job to blocking** (drop `continue-on-error`) once it's green, so a broken frontend build can never again hide behind a green checkmark. *(decision + code)*
4. **Fix the deploy artifacts (B3–B6) for whichever target ships first:**
   - Dockerfile: drop `packages/ui` COPYs, copy `apps/` + `hive-mind-*`, build packages before `npm run build`.
   - render.yaml: build via root `build:all`, set `WAGGLE_FRONTEND_DIR=./dist`, add `CORS_ORIGIN`, decide local-sidecar vs team-Postgres entrypoint.
   - Add the drizzle `migrate.ts` step to the chosen entrypoint.
   *(code + one decision)*
5. **Decide the vision-harness chat-flow path** (Path 1 CI gate + Path 2 opt-in lane — §5). *(decision — blocks the harness build)*
6. **Build the Option-C vision harness** on the existing :3333 webServer + tests/e2e helpers; extract the copy-pasted nav helpers (`gotoDesktop`/`skipOnboarding`/`dismissOverlay`/`openAppViaDock`) into `tests/e2e/_helpers.ts`; delete the dead `apps/web/playwright.config.ts` and fix/remove `login-flow.spec.ts` + the dead token in `r2-uat-mega.spec.ts`. *(code — ~3 sessions)*
7. **Run the vision harness against the local web build**, triage WARN/FAIL, then close the binary-blocked residuals (§10 #1 spawn-agent clean-install, §10 #2 light-mode polish) on a real Tauri build. *(verification — platform-blocked steps last)*
8. **Doc cleanup:** update CLAUDE.md §10 #3 to reflect only `claude-desktop` remains a (deliberate) stub. *(doc)*

---

*Synthesized 2026-06-01 from 5 parallel auditors; every red claim independently re-verified against the live repo (`839d4ce`) and the GitHub Actions API.*
