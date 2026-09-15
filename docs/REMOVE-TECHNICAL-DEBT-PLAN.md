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
| 3 | clean-code | done (pass 1: 7 fixes applied, 22 ledgered) | TECH-DEBT.md | 2026-09-15 |
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
| 2026-09-15 | 3 | Phase 3 scope = six-discipline clean-code score of the Phase 2 helpers, `streamCannedReply`, the slash-command / echo branches and the handler prelude, plus an error-handling audit of all 58 `try` blocks; apply only structure-only fixes inside Safety Net Map pinned regions (7 fixes in 7 single-purpose commits, `b5f18e6b` through `d242ec05`), ledger everything else (TD-CHAT-14..28, TD-REL-3..5, TD-TEST-4..7) | Scores 5–6.5/10 (mean 5.5). Done-when met by clause 2 (every gap below 8 is a Smell Inventory row with a fix). Behavior changes — including every catch-block recommendation — wait for pins per Rule 8. |
| 2026-09-15 | 3 | Adopted Conventions (bare-catch why-comment + structured warn, discriminated `{ rejection }` results from one constructor, error codes in one `as const` block, predicate-phrased booleans, one name per value with the `Raw` suffix, explaining variable at the third occurrence, intent-not-history comments, module-scope policy constants, `finally` / `beforeEach` in tests) recorded as agent-proposed | Rule 5: no silent decisions. Each convention is traceable to an evidence line in `chat.ts`; the founder ratifies or amends at PR review. |
| 2026-09-15 | 3 | `buildChatCommandContext` extraction went red on the first attempt (tsc: `PERSONAL_CHAT_COMMAND_CONTEXT` is plugin-local at column 0); reverted, hoisted the constant in its own commit (`522613d6`), re-applied (`d242ec05`) | Same trap as Phase 2; red means revert, and the retry is a smaller preparatory transformation. |
| 2026-09-15 | 3 | Error-handling audit recorded as evidence in `docs/tech-debt/CHAT-ERROR-HANDLING-AUDIT-2026-09-15.md`; no catch block changed | 27 non-ok blocks are all behavior changes; two fail open on security boundaries (TD-CHAT-23, P1) and get pins first. |
| 2026-09-15 | 3 | `VIEWER_READ_ONLY` deliberately not added to the Safety Net Map; the `endTurnWithError` extraction and the temp-server fixture helper were refuted in review | The 403 pin at `chat-api.test.ts:4085` (at `b248ce38`) is emitted by `security-middleware.ts`, not `chat.ts`; the send-error-and-end helper would fold an unexecuted branch (repeat of the `acd7ec0c` breach). |
| 2026-09-15 | 3 | Branch review (47-agent workflow, one reviewer per commit + docs + test adequacy, 3 refuters per finding): 6/6 code commits behavior-preserved, 0 code findings; 8 confirmed doc findings fixed in a follow-up docs commit. `d242ec05` moved 13 lines of `buildChatCommandContext` that no route test executes — recorded as a Rule 8 disclosure with four pins in the Characterization Backlog, not fixed | Same handling as the Phase 2 `acd7ec0c` breach: the verbatim move is proven by normalized diff, the pins land next, and nothing is fixed in the same change. |
| 2026-09-15 | 3 | The nine Phase 3 Adopted Conventions ratified as amended by founder delegation (session 0915 S3) after a 51-agent review (repo-fit / evidence / precision lens per convention, synthesizer, three refuters per finding, critic): every bullet tightened to rule + `Evidence:`, scope stated per bullet (chat.ts touched regions unless stated), forward-only; the rejection-shape rule drops "never throw" because the `assertSafeSegment` throw is the sidecar-wide guard; TD-CHAT-19 decided: strip; `docs/CONTRIBUTING.md` catch guidance aligned. Four ledger inaccuracies corrected (Monster Method try count 42→41 at `d242ec05`, TD-CHAT-15 range, TD-CHAT-17 count, TD-CHAT-21 first clause refuted by its own citation). Candidate conventions deferred to Phase 6: typed failure `code` classification (TD-CHAT-15), shared SSE test parser (TD-TEST-5) | Rule 5/6: no silent decisions; the fresh full-diff review found 0 findings, behavior preserved. |
| 2026-09-15 | 1/3 | `buildChatCommandContext` pinned directly — a one-token export (`80006984`) plus 14 unit pins with a stub orchestrator and stub server (`9a9f96b7`) — rather than through the route; a recall-outage quirk found while pinning was pinned and ledgered (TD-CHAT-29), not fixed. PR #86 review (38 agents, three refuters per finding): 11 raw findings, 4 sustained and corrected (`dataDir`-blind Workspace Now pin, provenance-led test header, TD-CHAT-29 "runner" wording), 7 refuted as immaterial | Rule 8: found bugs get pinned, not fixed; direct pins were the cheapest test point once the helper was module-level, and the route cannot reach the throwing-`recallMemory` branch at all. |

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
- [x] Phase 3 pass 1: clean-code scoring, 58-block error-handling audit, 7 structure-only fixes on `chore/tech-debt-phase3-chat-clean-code` (agent, 7 commits `b5f18e6b` through `d242ec05`, 2026-09-15)
- [x] Review + merge `chore/tech-debt-phase3-chat-clean-code` into `main`; the nine Phase 3 Adopted Conventions ratified as amended by founder delegation (agent, session 0915 S3, 51-agent review; merged via PR #85)
- [ ] TD-CHAT-23 (two security-boundary catches fail open silently, P1): pin via Characterization Backlog 3499-3532, then fail closed with a structured warn, own behavior commit (agent)
- [x] Pin the four `buildChatCommandContext` behaviors listed in the TESTING.md Characterization Backlog (agent, `80006984` export + `9a9f96b7` 14 pins, 2026-09-15; QUIRK TD-CHAT-29 ledgered)
- [ ] TD-TEST-4: hoist `resetRateLimiter` to `beforeEach` in `chat-api.test.ts` after a full-file green run (agent, `test(server):` commit)
- [ ] Phase 4 entry: software-design-philosophy on the helper set (`validateChatRequestFields`, `resolveChatWorkspaceTarget`, `resolveChatWorkspacePaths`, `buildChatCommandContext`, `streamCannedReply`) — depth vs interface, the `TurnScope` parameter object, and whether the `hasCustomRunner` seam narrows (TD-CHAT-16) (founder + agent)
