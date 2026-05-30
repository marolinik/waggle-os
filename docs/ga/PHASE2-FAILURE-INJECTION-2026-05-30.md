# Phase 2 — Failure-Injection Coverage & CI Wiring

**Date:** 2026-05-30
**Repo:** `D:/Projects/waggle-os` — `main` @ `c00232c`
**Scope:** Failure-injection / fault-tolerance coverage for the GA gate, plus the CI wiring fix to ensure the new specs run.

---

## 1. Headline

**What now exists:** One net-new browser-driven failure-injection spec was authored and compiles (validated via `playwright test --list`, 3 tests discovered under the `chromium` project, server not booted):

- `tests/e2e/failure-injection/network-drop.spec.ts` — 3 UI-driven tests covering the **network-drop** path on `POST /api/chat` (mid-stream SSE interruption, partial-token render, and re-send recovery). Injection uses `page.route()` exactly like the existing `spawn-agent-flow.spec.ts`; assertions are verified against `ChatApp.tsx` / `BlockRenderer.tsx` / `useChat.ts` in this repo state.

**What is deliberately deferred (with reasons):**

- **capability-missing** — already covered at unit level (`packages/agent/tests/capability-router.test.ts`, `agent-loop.test.ts`). It is an agent-internal decision over deterministic LLM text, not a browser-triggerable DOM/UI state. An e2e here would only re-exercise client SSE plumbing, not the capability logic. **No e2e added.**
- **traversal-rejected** — already covered by 14 Vitest tests across `phase2-traversal-{tasks,documents,ingest}.test.ts` (R1-004 included) plus generic e2e traversal checks in `competitive-benchmarks.spec.ts`/`waggle-complete.spec.ts`. The task/document/ingest endpoints specifically are covered at the unit layer where out-of-root write absence can be asserted directly. **No e2e added** (a thin e2e is feasible but redundant; flagged below as an optional nicety, not a gate blocker).
- **unpaid-tier-gate** — already covered by `tier-enforcement-matrix.test.ts` (13 gated routes) + e2e `competitive-benchmarks.spec.ts` B5.4 + `polish-verification.spec.ts`. An additional e2e is *feasible* (mutate `config.json` mid-test, assert `403 TIER_INSUFFICIENT`) but not required for the gate since the matrix test already proves enforcement file-backed (no header spoof). **Optional, not added in this pass.**
- **sidecar-restart** — **INFEASIBLE at e2e level.** Playwright `webServer` with `reuseExistingServer:true` boots the single `:3333` process once and never restarts it; `page.route()` stubs HTTP traffic, it cannot cleanly kill/respawn the Node host without race conditions against the 120s health probe. The frontend adapter's `connectWebSocket()` is fire-once with no reconnect/state-recovery loop, so there is nothing to assert post-restart anyway. **Recommend Vitest unit coverage** of the offline-detection + (absent) reconnect path instead.
- **R3-002 (circular-dependency / subagent dup-worker)** — already green via `packages/agent/tests/phase4-subagent-dup-worker.test.ts` (2 tests). **Not re-added** per instruction.

**Net Phase-2 result:** the one genuinely browser-observable, not-yet-covered failure path (network-drop) is now an e2e. Everything else is either already covered (unit and/or e2e) or infeasible at the browser layer and correctly pushed to unit.

---

## 1b. EXECUTION OUTCOME (2026-05-30, post-authoring) — pushed to main @ 25cb5c0

Authoring the network-drop spec and **actually running it** surfaced a real production regression. Three commits landed + pushed:

- **`c3c569b`** `fix(test)` — repaired broken Playwright npm scripts (`test:e2e`/`test:fast` referenced `--project=api`, `test:visual` `--project=visual`; only `chromium` exists → "Project not found", zero tests for any human invoker). Routed through `playwright-e2e.config.ts` + `--project=chromium`.
- **🐛 `99347da`** `fix(server)` — **D1 REGRESSION FIX (the session's most important find).** D1 (`d28abed`) gated EVERY route behind a bearer token, including the SPA shell (`GET /`) and static assets. A browser/webview gets `401 MISSING_TOKEN` on initial load and can never run the app code that bootstraps the token → blank 401 page. **Bricks the hosted web deployment** (render.yaml serves the frontend from the server); desktop Tauri less affected (bundles its own UI, only calls `/api/*`). Fix: exempt non-API GETs (inert static reads) from bearer auth; every `/api/*` route + any non-GET stays gated; session-token endpoint stays same-origin gated → auth boundary unchanged. TDD: +4 tests incl. negative controls (POST `/` still 401, `/api/*` GET still 401). 8/8 D1 + 60/60 security-suite green. **This is effectively the D1 desktop-smoke-test the handoff flagged as never run.**
- **`25cb5c0`** `test(e2e)` — the network-drop spec, **3/3 green** against a live `:3333` boot. Recovery assertion made LLM-mode-independent (composer settles + new assistant bubble + no new offline error) after discovering a live LiteLLM proxy preempts `WAGGLE_ECHO_MODE`.

**Triage chain (3 rounds, each a real cause, not a flake):** missing chromium binary (infra) → stale boot/nav helpers copied from `live-chat-flow.spec.ts` (fixed to mirror `waggle-complete.spec.ts`) → **D1 static-asset auth wall** (the production bug) → echo-mode assumption vs live LLM (assertion de-coupled).

**KNOWN RESIDUAL — existing e2e UI suite is effectively dormant.** `waggle-complete.spec.ts` §14 self-skips UI tests when port **8080** returns non-HTML (`:889-898`) — but the webServer is `:3333`, so those UI journeys have been skipping, not running. Separate from this pass; flagged for a follow-up (repoint the skip-guard at `:3333`).

---

## 2. Per-Path Table

| Path | Already covered? | Feasible at e2e? | Action taken | File |
|------|------------------|------------------|--------------|------|
| **network-drop** | No | Yes | **Authored 3 e2e tests** (abort/partial-token/recovery) | `tests/e2e/failure-injection/network-drop.spec.ts` |
| **capability-missing** | Yes (unit) | No | None — keep unit coverage | `packages/agent/tests/capability-router.test.ts`, `agent-loop.test.ts` |
| **traversal-rejected** | Yes (14 unit + generic e2e) | Yes (redundant) | None — covered at unit layer | `packages/server/tests/local/phase2-traversal-{tasks,documents,ingest}.test.ts` |
| **unpaid-tier-gate** | Yes (matrix unit + B5.4 e2e) | Yes (optional) | None this pass — flagged optional | `packages/server/tests/tier-enforcement-matrix.test.ts`, `tests/e2e/competitive-benchmarks.spec.ts` |
| **sidecar-restart** | No | **No (infeasible)** | Deferred to unit; documented residual | _N/A — recommend Vitest_ |
| **R3-002 circular-dep** | Yes (2 unit, green) | n/a | None (do-not-readd) | `packages/agent/tests/phase4-subagent-dup-worker.test.ts` |

---

## 3. CI Wiring Fix

### 3a. Does the new spec already run in CI?

**Yes — recursively.** ci.yml line 71 runs `npx playwright test tests/e2e/`, which is a **path-prefix filter**, not a flat glob. The default `playwright.config.ts` has `testDir: './tests'` + `testMatch: '**/*.spec.ts'`, so any `*.spec.ts` under `tests/e2e/**` — including the new `tests/e2e/failure-injection/network-drop.spec.ts` — is automatically discovered. **No change to line 71 is strictly required for the new spec to run.**

However, two real defects warrant a minimal, intent-revealing fix:

1. **Implicit-discovery fragility.** Relying on the bare path prefix means a future reader cannot tell the failure-injection suite is in scope. Make it explicit so the gate is self-documenting and a deleted/renamed dir fails loudly.
2. **Dead-script project mismatch (the flagged issue).** Root `package.json` scripts reference Playwright projects that **do not exist** in either config:
   - `test:e2e` → `--project=api`  → **broken** (only `chromium` exists → `Error: Project(s) "api" not found`)
   - `test:fast` → `--project=api` → **broken** (same)
   - `test:visual` → `--project=visual` → **broken** (only `chromium` exists)

   Both `playwright.config.ts` **and** `playwright-e2e.config.ts` define **only** `name: 'chromium'`. CI never calls these scripts (it invokes `npx playwright test` directly), so CI is green — but any human running `npm run test:e2e` gets a zero-test error. This is a latent footgun, not a CI failure.

### 3b. EXACT diff — ci.yml (make scope explicit; behavior-equivalent, lists the new suite)

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -70,7 +70,7 @@
       - name: Run Playwright E2E tests
-        run: npx playwright test tests/e2e/
+        run: npx playwright test tests/e2e/ tests/e2e/failure-injection/
         env:
           WAGGLE_ECHO_MODE: "1"
           NODE_ENV: test
```

> Note: `tests/e2e/failure-injection/` is already a subpath of `tests/e2e/`, so this is **functionally identical** — its only purpose is to make the failure-injection suite an explicit, reviewable line item in the gate. If you prefer zero redundancy, leave line 71 unchanged; the spec runs either way. The **load-bearing** fix is the package.json scripts below.

### 3c. EXACT diff — package.json (resolve the project mismatch)

The scripts must reference the real project name (`chromium`) or drop `--project` entirely. `test:e2e`/`test:fast` should additionally point at the e2e config (`-c playwright-e2e.config.ts`) so they exercise the e2e suite, not the visual baselines.

```diff
--- a/package.json
+++ b/package.json
@@ -29,9 +29,9 @@
-    "test:e2e": "node node_modules/playwright/cli.js test --project=api --reporter=list",
-    "test:visual": "node node_modules/playwright/cli.js test --project=visual --reporter=list",
+    "test:e2e": "node node_modules/playwright/cli.js test tests/e2e --project=chromium --reporter=list",
+    "test:visual": "node node_modules/playwright/cli.js test tests/visual --project=chromium --reporter=list",
     "test:all": "node node_modules/playwright/cli.js test --reporter=list",
     "test:retry": "node node_modules/playwright/cli.js test --last-failed --reporter=list",
-    "test:fast": "node node_modules/playwright/cli.js test --project=api --grep-invert=\"4\\.9|B8\\.5\" --reporter=list"
+    "test:fast": "node node_modules/playwright/cli.js test tests/e2e --project=chromium --grep-invert=\"4\\.9|B8\\.5\" --reporter=list"
```

Rationale:
- `--project=api` / `--project=visual` matched no project in `playwright.config.ts` or `playwright-e2e.config.ts` (both only define `chromium`) → swapped to `--project=chromium`.
- Added explicit `tests/e2e` / `tests/visual` path filters so the previously project-encoded intent (e2e vs visual split) is preserved via testDir path instead of a nonexistent project name.
- `test:all` (no `--project`) was already correct and is unchanged — it runs the full default config.

---

## 4. Serial Verification Runbook (one-boot constraint)

Playwright auto-boots a **single** `:3333` server (`reuseExistingServer:true`, `fullyParallel:false`). Run everything against that one boot. Do **not** start a second server.

**Step 0 — clean port (optional, only if a stale server is bound):**
```powershell
Get-NetTCPConnection -LocalPort 3333 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

**Step 1 — compile-only sanity (no server boot):**
```powershell
cd D:/Projects/waggle-os
node node_modules/playwright/cli.js test tests/e2e/failure-injection/network-drop.spec.ts --list
```
Green = exactly **3** tests discovered under project `chromium`. (This is the state already validated by the spec author.)

**Step 2 — run the new spec against a real :3333 (single boot, echo mode):**
```powershell
$env:WAGGLE_ECHO_MODE = "1"; $env:NODE_ENV = "test"
node node_modules/playwright/cli.js test tests/e2e/failure-injection/network-drop.spec.ts --project=chromium --reporter=list
```
Playwright runs `npm run build && npx tsx packages/server/src/local/start.ts --skip-litellm`, waits for `:3333`, then drives the UI. This single boot is reused for all 3 tests.

**Step 3 — full e2e gate (same one boot, mirrors CI line 71):**
```powershell
$env:WAGGLE_ECHO_MODE = "1"; $env:NODE_ENV = "test"
node node_modules/playwright/cli.js test tests/e2e/ --project=chromium --reporter=list
```

**What green looks like:**
- Step 1: `Total: 3 tests in 1 file`, exit 0.
- Step 2: `3 passed`, exit 0. Specifically — Test 1 renders the `.text-destructive` "Backend is offline" block and the composer re-enables (no hang); Test 2 renders the partial `MIDSTREAM_TOKEN_PROBE` token then settles with no crash; Test 3 shows the offline error on the aborted send, then after `page.unroute` the re-send streams the echo-mode "local mode" success token.
- Step 3: all 16 existing specs + the 3 new tests pass; `playwright-report/` written.

**How to triage a failure:**
1. **Boot/timeout (120s webServer):** check `npm run build` succeeds standalone and `:3333` is free. A failed Vite build or stale port is the #1 cause — re-run Step 0.
2. **Test 3 asserts "local mode" but fails:** confirm `WAGGLE_ECHO_MODE=1` is set **and** no live Anthropic proxy key is present in the env/config. With a real key the agent loop runs instead of the echo branch (`chat.ts:697-713`) and the deterministic "local mode" token won't appear — this is an honest failure, not a flake; clear the key.
3. **Selector drift (`.text-destructive`, `textarea[placeholder*="Message"]`, `button[aria-label="Chat"]`):** re-verify against current `ChatApp.tsx` / `BlockRenderer.tsx` — UI refactors invalidate selectors.
4. **Flake on retry:** `retries:1` is set; a pass-on-retry indicates a timing race in route registration. Inspect the trace (`trace: 'on-first-retry'`) in `playwright-report/`.
5. **Auth:** none needed — the app self-bootstraps its D1 bearer token via `/api/auth/session-token` on connect (`adapter.ts:126-136`), same path the existing `live-chat-flow.spec.ts` relies on.

---

## 5. Honest Residuals

- **sidecar-restart — INFEASIBLE at e2e, left to unit.** The single-boot `reuseExistingServer` model cannot kill/respawn the host process without racing the 120s health probe, and the frontend has no reconnect-with-state-recovery to observe (`connectWebSocket()` is fire-once; `useOfflineStatus` only toggles a pill). Recommended follow-up: a Vitest test in `packages/server/tests/local/` asserting `/health` failure detection and documenting the *absence* of client WS reconnect as a known limitation (or implementing reconnect + a unit test for it). **This is the one true coverage gap and it is architectural, not a test-authoring gap.**
- **capability-missing — unit-only by nature.** Browser cannot trigger a tool-not-found state; the fallback is deterministic LLM text. Existing Vitest coverage is the correct layer. No residual risk.
- **traversal (tasks/documents/ingest) e2e — optional nicety.** Unit layer already proves 400 + no out-of-root write. An e2e would be belt-and-suspenders only; deferred without risk.
- **unpaid-tier-gate e2e — optional.** Matrix unit test + B5.4 e2e already prove file-backed enforcement (no header spoof). A dedicated `unpaid-tier-gate.spec.ts` is feasible if the gate wants browser-level evidence, but adds no enforcement guarantee beyond the matrix test.
- **CI script mismatch — fixed by the package.json diff above, not yet committed.** Until applied, `npm run test:e2e`, `test:fast`, and `test:visual` error with "Project not found" for any human invoker. CI itself is unaffected (it bypasses these scripts).
