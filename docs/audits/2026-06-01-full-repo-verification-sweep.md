# Full-Repo Verification Sweep — 2026-06-01

**HEAD:** `f72cda5` (main, pushed) · **Baseline:** `ebf1bc0` (S4 handoff, last known-green)
**Method:** 3 race-safe parallel dimensions (full vitest · repo lint · serialized tsc/build) → per-dimension failure triage. Workflow `full-repo-verification-sweep`, 5 agents, ~8.5 min.

## Verdict: ✅ GREEN for all session work — **0 session-induced failures**

The 4 merges since baseline — litellm credential-pool (`..8cdc929`), Wave 2/3 hook ports (`..1219e14`), OQ-6 dedup (`..b1c633b`), OQ-4 hermes compact-on-stop (`..f72cda5`) — introduced **no regressions**. Every failure observed is either missing local infra or a pre-existing install-tree quirk; none touch code changed this cycle. This closes the verification-scope gap that let the `placeholder-audit` regression slip last session (the full repo suite + all tsconfigs + repo lint were checked, not just affected packages).

| Dimension | Raw result | Triage verdict | Session-induced |
|---|---|---|---|
| **lint** | `npm run lint` exit 0, **0 errors / 0 warnings** repo-wide | CLEAN | 0 |
| **unit-tests** | **7034/7035 non-skipped pass** (506/526 files); 19 files + 1 test fail | INFRA | 0 |
| **typecheck-build** | `build:packages` OK · `build` OK · **29/30 tsconfigs clean** | PRE_EXISTING | 0 |

## Dimension detail

### lint — CLEAN
`eslint .` exits 0 with 0 errors and 0 warnings. Confirms the S4 lint-debt burndown (`no-explicit-any` → 0 repo-wide, all rules ratcheted to ERROR) is holding.

### unit-tests — INFRA (no code fix)
The pure-unit surface (7034 tests, 506 files) is fully green and exercises the session code. The 19 failed files + 1 failed test + 2 unhandled rejections are **all** deterministic missing-infra failures — this verifier has no PostgreSQL (host `5434`) and no Redis (host `6381`), the docker-compose services that every server/worker/integration suite hard-requires. Re-confirmed via `Get-NetTCPConnection` (nothing on 5434/6379/6381) and isolated re-run (identical `ECONNREFUSED:6381` — **not flaky**).

Root cause for the server suites: `buildServer()` registers `redisPlugin` (eager `new Redis()` ×2) before `wsGateway`; with Redis absent the register-chain stalls on ioredis retries and Fastify's plugin-load timeout fires, mis-reporting `wsGateway` as "did not start" in `server.test.ts`. All other server/worker failures are `beforeAll(buildServer)` timeouts or direct Postgres/Redis `ECONNREFUSED`.

Affected (all infra, all `touched=0` or type-only edits in range): `packages/server/tests/{server,auth,audit,cron,proactive,db/schema}`, `…/daemons/{hive-mind,scout,subconscious}`, `…/routes/{agents,analytics,resources,tasks,teams,knowledge,messages}`, `…/ws/gateway` (integration block), `packages/worker/tests/job-processor` (worker package untouched all session).

**To make this dimension pass:** `docker-compose up -d postgres redis` (+ drizzle migrate) before the sweep, OR scope the no-Docker green-gate to the pure-unit surface and exclude the documented infra-dependent suites. This matches how the landing commits were verified (server suite 1745 pass / 1 skip *with* infra running).

### typecheck-build — PRE_EXISTING (no code fix)
`npm run build:packages` (tsc --build shared→core→agent→server) and `npm run build` (apps/web) both pass; `dist/` emits clean. 29 of 30 tsconfigs typecheck clean.

The lone failure: `tsc --noEmit -p apps/web/tsconfig.node.json` → `vite.config.ts(7,29) TS2769` (defineConfig overload mismatch). Root cause is a **dual-vite install** — root `vite@8.0.14` (hoisted from tailwindcss/vite + plugin-react + vitest) vs `apps/web` `vite@5.4.21` — producing two incompatible vite type trees. Provenance proves pre-existing: the failing line dates to the 2025-01-01 Lovable scaffold (`1bc8809`); `vite.config.ts`, `tsconfig.node.json`, and `apps/web/package.json` are **byte-identical baseline→HEAD**; no vite version changed in range; deterministic (not flaky). **The real build is unaffected** — `npm run build` uses `tsconfig.app.json` and runs `vite.config.ts` via esbuild, never tsc. `tsconfig.node.json` is an extra exhaustive check the sweep ran; it is not in CLAUDE.md's verification commands nor any CI/build path.

## Informational (surfaced during triage — not failures)

1. **Clerk auth fix is sound** (`83edcf5`, this cycle): `(clerk as any).verifyToken(token)` → standalone `verifyToken(token, { secretKey })` in `ws/gateway.ts` + `plugins/auth.ts`. This is the production bug fix noted in the S4 handoff — `verifyToken` is a standalone `@clerk/fastify` export, not a `ClerkClient` method (the old cast would `TypeError` at runtime). On the request-time auth path (not plugin-startup), strict-tsc-clean, no test impact (tests swap `_authHandler` / `setWsTokenVerifier`). Confirmed beneficial.

## Optional future housekeeping (NOT blocking, NOT session work)
- **Dedupe vite to one major** across root + `apps/web` so the extra `tsconfig.node.json` check passes (dependency-tree maintenance).
- **No-Docker CI gate:** formalize a vitest project/exclude split so the pure-unit surface gates green without Postgres/Redis, and the infra suites run only in a Docker-provisioned lane.

## Conclusion
Main at `f72cda5` is green for everything shipped this cycle. The only red is environmental (no local Docker infra) or pre-existing (dual-vite), with documented evidence and zero attribution to session commits. No code changes required.

---

## Addendum — CI health (GitHub Actions `ci.yml`), discovered 2026-06-01

Investigating the no-Docker test gate surfaced that **CI's `test` job has been RED on every push** (and is a multi-layer breakage, all pre-existing):

- **L1 — `npm install` → `EBADPLATFORM`** *(FIXED — PR #5, branch `fix/ci-cross-platform-install-and-unit-gate`)*. Root `package.json` pinned 4 Windows-only native binaries (`@rolldown/binding-win32-x64-msvc`, `@swc/core-win32-x64-msvc`, `lightningcss-win32-x64-msvc`, `sqlite-vec-windows-x64`) as **hard** deps, so `npm install` failed on Linux/macOS. Fix: moved them to `optionalDependencies` (npm skips os-mismatched optional deps). Verified on CI: install + tsc + lint + app-tsc now PASS on Linux.
- **L2 — bare `npx tsc --noEmit`**: FINE (root `tsconfig.json` is a near-noop; exit 0).
- **L3 — `npm run lint`**: FINE (0/0).
- **L4 — `npm test` (full vitest, no Docker)** *(unit-gate split landed in PR #5)*: default `npm test` now excludes the 19 Postgres/Redis suites so the gate runs without Docker.

**Remaining CI-debt (pre-existing, NOT caused by PR #5 — revealed because L1 let tests run for the first time in a while). Full CI-green needs all three:**

1. **Workspace packages not built before tests** (~23 failures): `ci.yml` runs `npm test` with no prior build, so `@waggle/{shared,hive-mind-core,hive-mind-shim-core,hive-mind-hooks-core,hive-mind-hooks-codex}` fail to resolve their entry (no `dist/`). Locally these resolve only because `dist/` exists from prior builds. Fix options: add a build step in CI, OR add vitest `resolve.alias` → `src` for these packages (mirrors the existing `@waggle/marketplace` alias). Note `build:packages` alone is insufficient — it only builds shared/core/agent/server, not the `hive-mind-*` packages.
2. **Uncommitted seed DB** (~80 failures): the marketplace sync suites `copyfile` `packages/marketplace/marketplace.db`, a gitignored/uncommitted file absent on a fresh CI checkout. Fix: generate the seed in test setup, commit a fixture, or gate these tests.
3. **Tests asserting on local working-tree state** (~4): assertions that `.planning/` exists at repo root and a hive-950 hex allow-list — both depend on gitignored/local-only state absent on CI. Fix: make these robust to a clean checkout, or scope them out of CI.

### Resolution (PR #5, `fix/ci-cross-platform-install-and-unit-gate`)

The `test` job is now **GREEN on CI Linux** (workflow conclusion `success`). The 228 pre-existing failures were resolved in layers, all verified on CI:

1. **Install** — 4 Windows-only natives → `optionalDependencies`.
2. **Workspace resolution** (~23 + cascades) — `vitest.aliases.ts` maps every `@waggle/*` (with a `src/index.ts`) to its `src/` dir in both vitest configs (subpath-safe).
3. **Seed/env fixtures** — excluded `sync-verification` (gitignored 13MB `marketplace.db`); skip the `marketplace.db exists` assertions when absent; fixed the hive-950 backslash allow-list; `.planning` guard tolerates clean checkout.
4. **The final 9** (parallel root-cause) — **2 product bugs** (`backup.ts` excludes the `models/` ONNX cache from backups; `trust-wiring` reads audit via the writer connection, not a fresh WAL reader) + determinism (`EMBEDDING_PROVIDER=mock` test pin; dead-port Ollama; benchmark `emitPreregistrationEvent:false`; codex `skipIf(!BIN_BUILT)`).

**Residual (non-blocking, pre-existing, follow-up):**
- **`e2e` job "Build frontend"** — `apps/web`'s real tsc build can't resolve dist-exporting `@waggle/*` deps (`@waggle/hive-mind-core`, …) because the e2e job builds only `build:packages` (shared/core/agent/server), not the `hive-mind-*` packages. `e2e` is `continue-on-error` so it does NOT block CI. Fix options: build all imported `@waggle` packages, or add `@waggle/*`→`src` `paths` to `apps/web/tsconfig.app.json` (mirror the vitest aliases) — but validate against the deploy's `build:all` first.
- **Docker infra test lane** (the 19 Postgres/Redis suites) — still local-only via `npm run test:infra`; a Docker-services CI job needs a verified migrate step.
- **dual-vite `tsconfig.node.json`** — pre-existing, not in any build path.
