# Waggle OS — Production Readiness Audit (2026-07-03)

**Method:** 10 parallel principal-engineer audit lanes (opus, high effort), each required to cite `file:line` evidence it actually read. Baseline at audit time: HEAD `78660ab5` on `main`, vitest 8063/8063 green, lint 0, tsc 0 (agent/server/app), `build:all` clean, git history secret-scan CLEAN (all key-shaped strings are `detectSecrets()` fixtures).

**Subsystem grades:** Build **D** · CI/CD **C** · Docs/DX **C** · Deps/Config **C** · Agent-runtime **C** · Security **B** · Testing **B** · Server-API **B** · Frontend **B** · Memory-substrate **B**.

---

## P0 — Release blockers

### P0-1 · Sub-agents bypass the confirmation gate AND the critical-destructive-command net
`packages/server/src/local/index.ts:773-858` builds `createSubAgentTools`/`createWorkflowTools` at startup with the FULL `baseTools` set and **no `hooks`, no `governancePolicies`**. `subagent-tools.ts:230-246` passes only `hooks: deps.hooks` (undefined) and omits governance. The per-request `pre:tool` approval hook (`chat.ts:1055-1079`) — which enforces `isCriticalNeverAutopass` (`confirmation.ts:228-269`: `rm -rf ~`, `sudo`, `mkfs`, `dd of=/dev`, `git push --force main`, connector/skill deletes) — is registered ONLY on the main loop. `executeToolCall` (`tool-executor.ts:124-134`) skips all hook logic when `hooks` is undefined. `ROLE_TOOL_PRESETS.coder` includes `bash`+`git_commit`, so a NORMAL-autonomy user can have the agent spawn a coder sub-agent that runs any destructive shell command with zero confirmation. The code comment at `subagent-tools.ts:239` ("sub-agents respect approval gates") is false as wired.
**Fix:** thread the per-request `hookRegistry` + `governancePolicies` into every sub-agent/worker `runLoop`; AND enforce `isCriticalNeverAutopass` unconditionally inside `executeToolCall` as a defense-in-depth net that no spawn path can bypass. TDD.

### P0-2 · Packaged desktop sidecar cannot resolve its externalized runtime dependencies
`scripts/build-sidecar.mjs:28-52` marks ~18 runtime packages `external` (better-sqlite3, @fastify/static, mammoth, pdf-parse, exceljs, archiver, bullmq, drizzle-orm, @huggingface/transformers…). No build step stages their JS into the app: `bundle-native-deps.mjs:70-88` copies only `*.node` + onnxruntime; `tauri.conf.json:16` bundles only `resources/*`; `service.rs:109` sets `NODE_PATH=resources/native` (which holds only `.node` binaries). Packaged `require('@fastify/static')` → `MODULE_NOT_FOUND` on sidecar boot. `docs/production-readiness/06-BUILD_REPORT.md:145-147` corroborates: "Script exists but NOT tested."
**Fix:** stage a pruned prod `node_modules` for the externalized packages into `resources/` and point `NODE_PATH` at it, OR un-externalize the pure-JS packages (keep only truly-native external with `.node` staged). Add a packaged-binary smoke step (launch → hit `/api/memory/search`) before publish. Full validation requires a Tauri build.

---

## P1 — Must fix before public release

| # | Lane | Finding | Effort |
|---|---|---|---|
| P1-1 | Agent | Team `blockedTools` + persona tool restrictions bypassable via `spawn_agent` (same root as P0-1) | M |
| P1-2 | Security | **SSRF**: `web_fetch` (`system-tools.ts:686-706`) + MCP url-ingest (`harvest/url-adapter.ts:84`) fetch model-influenceable URLs, follow redirects, no private-IP/`169.254.169.254` guard, not confirmation-gated. Cloud/TEAMS binds `0.0.0.0` → instance-metadata theft | M |
| P1-3 | CI/CD | CI "TypeScript type check" is **vacuous** — root `tsconfig` compiles one `.d.ts`; apps/web has no blocking typecheck; a TS regression merges green | S |
| P1-4 | Testing | Entire **apps/web suite (131 files) never runs in CI** (`vitest.config.ts:32-33` excludes `apps/**`; nothing invokes apps/web vitest) | S |
| P1-5 | Testing | 19 route/integration suites excluded with no Postgres/Redis CI lane — primary CRUD API contract unverified per-commit | M |
| P1-6 | Docs | **No root LICENSE** despite `README`/`package.json` "MIT" claim — OSS legal blocker | S |
| P1-7 | Docs | README Quick Start uses `npm run dev:server`/`dev:web` — **neither script exists**; first-run fails | S |
| P1-8 | Build/CI | Tauri auto-updater configured with a real pubkey but `release.yml` publishes **empty signatures** → every client update rejected | M |
| P1-9 | Deps | `npm audit`: 28 vulns (1 crit, 3 high) incl. prod-facing react-router open-redirect, tar smuggling, next-intl proto-pollution | M |

---

## P2 — Should fix

- **Agent:** cost-tracker pricing table stale (no opus-4-8/haiku-4-5; silent Sonnet fallback ~5× under-reports) + daily hard-budget is in-memory/session-scoped; `openaiChat` adapter has no timeout/abort/retry; `isReadOnly` is an incomplete denylist (leaks `add_task`/`create_plan`/`compose_workflow`); `allowedSources` accepted but never enforced.
- **Server:** Stripe webhook unreachable in hosted `0.0.0.0` mode (bearer auth blocks Stripe's tokenless POST → cancelled subs never downgrade); no global `setErrorHandler` (hosted deploy has zero error observability); boundary validation is manual casting, not zod, on 33/80 routes.
- **Memory:** `raw_archive` verbatim store grows **unbounded** (append-only, no retention/size-cap/VACUUM; erasure only NULLs in place) — contradicts "harvest free forever"; no explicit `busy_timeout`/write-retry despite sidecar + MCP both opening `~/.waggle/personal.mind`.
- **Frontend:** committed **NUL byte** in `MemoryCenterTab.tsx:450` (git treats file as binary/undiffable); `@tanstack/react-query` provider-wired but zero usages (70 hand-rolled fetch flows).
- **Deps/Config:** three conflicting `better-sqlite3` majors (11.10 / 12.8 / 12.9); apps/web compiles `strict:false`; stale `bun.lock` + nested `app/package-lock.json`; 14.6MB binary `marketplace.db` tracked (dirties tree on every run); AI SDKs multiple majors behind (@anthropic-ai/sdk 0.24→0.110).
- **CI/CD:** E2E job `continue-on-error:true` (advisory only); no dependabot/renovate for the monorepo; unsigned/unnotarized desktop binaries; `npm install` not `npm ci`.
- **Docs:** license inconsistent across 27 packages (13 Apache-2.0, 8 MIT, 7 none); README+ARCHITECTURE describe pre-migration layout (`packages/core/mind` empty); CONTRIBUTING has wrong clone URL + non-existent `master`; Windows esbuild ENV TRAP undocumented; internal artifacts (competitive-intel `.docx`, EVAL-RESULTS, PLAN.md) tracked in public root.
- **Testing:** no coverage threshold measured; MCP-server packages under-tested (2 test files each).
- **Security:** session-token bootstrap readable by any same-loopback web origin (local-app-to-local-app residual).

## P3 — Polish
Code-splitting (single 1.9MB chunk); modal focus-trap inconsistency on custom overlays; `SCHEMA_VERSION` vestigial; suppression read-error skips silently labeled "erased"; node engines `>=18` on launcher; ~500MB `.git` pack + 144MB loose garbage; version identity split (0.1.0 vs 0.2.0 vs "v1.0"); `EMBEDDING_PROVIDER` README contradicts code; duplicated `ROLE_TOOL_PRESETS`.

---

## Execution plan (Fable-orchestrated)

**Wave 1 (parallel, disjoint file sets, opus agents):** SEC-GATE (P0-1, P1-1, isReadOnly), SEC-EGRESS (P1-2 SSRF + agent P2 quality), CI (P1-3/4 gates + dependabot + npm ci), DOCS (P1-6/7 + community files + layout fixes), MEMCORE (raw_archive retention + busy_timeout + suppression accounting), FE (NUL byte + react-query + a11y + strict).
**Wave 2 (sequential on main):** BUILD P0-2 (sidecar packaging), Deps/lockfile (audit fix + better-sqlite3 overrides + bun.lock removal), Server-API P2 (Stripe webhook exempt + error handler), updater decision.
**Wave 3:** re-audit, coverage, E2E stabilization, final sign-off.
