# Remove Technical Debt Plan

Journey tracker for the `/remove-technical-debt` skill. Resumable: read this file first, then the
artifacts in the Phase Status table, and enter the first non-`done` phase.

## Context

- **Started:** 2026-09-14
- **System:** Waggle OS — workspace-native AI agent platform with persistent memory. Tauri 2 desktop
  shell + Vite/React 19 web UI + bundled Fastify sidecar (Node 22) + SQLite (better-sqlite3 + sqlite-vec).
- **Size / age:** ~2885 commits since 2025-01-01; 28 workspace packages; largest hot files
  `packages/server/src/local/routes/chat.ts` (5882 LOC), `apps/web/src/lib/adapter.ts` (4216 LOC),
  `packages/server/src/local/index.ts` (3583 LOC).
- **Production status:** Windows Solo controlled-internal-pilot. Not public GA. Public GO gated on
  Authenticode + sealed Deep Security report (see `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`).
- **Worst break:** corruption of the user's persistent memory substrate (the lock-in moat) or secret
  leakage from Vault. Second: chat turn regressions (persona/routing/tool-context) invalidating
  release receipts.
- **Starting module (three-axis heuristic):** `packages/server/src/local/routes/chat.ts` — highest
  6-month churn (179 commits), core domain (every chat turn), no direct test file. Runners-up:
  `adapter.ts` (157 commits, 12 partial test files), `local/index.ts` (150 commits).
- **Test suite:** Vitest unit + Playwright E2E; `.github/workflows/ci.yml`. Last known 8676/8680
  green (2026-07-15). Baseline re-run at Phase 1 entry — see Key Decisions.
- **Stack tangle:** business rules (tool narrowing, memory-recall gating, persona filtering,
  disclaimer rules) live inline in Fastify route handlers, not in framework-free use cases.
- **Outbound dependencies:** Anthropic / OpenAI-compatible providers, Ollama (managed + optional
  user-installed), LiteLLM (optional), Stripe, Clerk, OAuth providers, channel chat clients,
  marketplace sync. Timeouts present in some paths (`chat.ts`, `providers/openai-compat.ts`), not
  audited across all calls.
- **Rewrite proposal:** none. Pay down in place.
- **Scope chosen:** full journey, Phases 1–8.

## Phase Status

| Phase | Skill | Status | Artifact | Date |
|---|---|---|---|---|
| 1 | working-with-legacy-code | done | TESTING.md + TECH-DEBT.md | 2026-09-15 |
| 2 | refactoring-patterns | done (pass 1: safe extractions) | TECH-DEBT.md | 2026-09-15 |
| 3 | clean-code | in-progress | TECH-DEBT.md | 2026-09-15 |
| 4 | software-design-philosophy | pending | TECH-DEBT.md | |
| 5 | clean-architecture | pending | ARCHITECTURE.md | |
| 6 | pragmatic-programmer | pending | TECH-DEBT.md | |
| 7 | release-it | pending | RELIABILITY.md | |
| 8 | domain-driven-design | pending | ARCHITECTURE.md | |

Statuses: pending · in-progress · awaiting-evidence · done · deferred: <reason> · skipped: <reason>
Optional phases (system-design, ddia-systems, team-topologies) are added as rows here when their
Add-when condition becomes true.

## Key Decisions

| Date | Phase | Decision | Rationale |
|---|---|---|---|
| 2026-09-14 | intake | Start module = `routes/chat.ts` | Three-axis: highest churn, core domain, zero direct tests. |
| 2026-09-14 | intake | Full journey 1–8 | Founder choice. Phases 5–8 gate on boundary/decomposition becoming bottleneck. |
| 2026-09-14 | intake | Re-run server test suite before building safety net | Last verified green 2026-07-15; two months of commits since. |
| 2026-09-14 | intake | No big-bang rewrite | Pay down in place; system keeps shipping. |
| 2026-09-14 | 1 | Bugs found while characterizing are pinned + ledgered, never fixed in the same change | Callers may depend on the quirk; behavior changes get their own commit. |
| 2026-09-14 | 1 | Test runtime is Node 22.23.2; never `npm rebuild` native modules for Node 24 | Packaged sidecar is pinned to 22.23.2; a 24-ABI rebuild would silently diverge from the release contract. |
| 2026-09-14 | 1 | Pinch point for `chat.ts` = `POST /api/chat` through `buildLocalServer` with the `server.agentRunner` object seam; fetch-spy link seam for the real runner path | Cheapest reachable test points; the 3652-line handler has no unit seam. |
| 2026-09-15 | 1 | Pin Node via `.node-version` (TD-ENV-1 closed) | Stops the false-red `ERR_DLOPEN_FAILED` trap for every future shell. |
| 2026-09-15 | 1 | Phase 1 exit accepted with `chat.ts` at 86.5% lines; 24-item Characterization Backlog carried, P1 items (approval/trust hooks, retry/fallback chain, `buildSystemPrompt`) must be pinned before Phase 2 touches those ranges | Coverage follows the paths Phase 2 will change; not a dedicated testing project. |
| 2026-09-15 | 2 | Phase 2 scope = safe Extract Method on pinned regions (validation, workspace resolution, canned-reply streaming); no method object yet | Intended zero new pins. Post-review correction: `acd7ec0c` also moved the 409 `WORKSPACE_NOT_READY` / `WORKSPACE_ROOT_UNAVAILABLE` exits that TESTING.md still listed as gaps (a Rule 8 breach); behavior preservation was proven by line-by-line diff review and the exits were pinned afterwards in `a55a1712`. |
| 2026-09-15 | 2 | A red test mid-extraction (scope error on a plugin-local constant) was reverted, not debugged; re-applied with the literal hoisted to module scope | Skill rule: red means revert. The retry was a different, smaller transformation. |
| 2026-09-15 | 2 | Extracted helpers stay in `chat.ts` — four module-level functions plus one handler-local closure (`streamCannedReply`) — rather than a new file | Surgical change; moving files is a separate structure-only step for Phase 4/5 once the module boundary is chosen. |

## Next Actions

- [x] Phase 1: baseline test run green under Node 22.23.2 (agent, 2026-09-14)
- [x] Phase 1: effect sketch + pinch points for `chat.ts` (agent, 2026-09-14)
- [x] Phase 1: characterization tests — validation + slash-command turns, 28 pins (agent, `d1bcd529`, `f7400a3a`)
- [x] Phase 1: `docs/TESTING.md` + `docs/TECH-DEBT.md` created (agent, 2026-09-15)
- [x] TD-ENV-1: `.node-version` (agent, `e5ff5b39`)
- [x] Phase 2 pass 1: five structure-only extractions on `chat.ts` (agent, `302e1d29`..`9bb544a7`)
- [x] Branch review (43-agent workflow, 3 refuters per finding): 5/5 refactor commits behavior-preserved; 9 doc/test findings fixed in `a55a1712` + this docs commit (agent, 2026-09-15)
- [x] Merge `chore/tech-debt-phase1-chat-safety-net` into `main` after review (founder, PR #84 `b248ce38`)
- [ ] Phase 2 pass 2 (later): pin the P1 Characterization Backlog ranges via the fetch-spy harness, then Replace Method with Method Object on the handler (agent)
- [ ] Phase 3 entry: clean-code scoring of `chat.ts` helpers + the slash-command branch; error-handling audit of the 44 `try` blocks (founder + agent)
