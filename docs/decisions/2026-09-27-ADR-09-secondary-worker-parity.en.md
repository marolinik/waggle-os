# ADR-09 — Secondary worker (`packages/worker`, BullMQ/Redis/Postgres): explicit boundary, not a parity target (C20)

> **English translation** of [2026-09-27-ADR-09-secondary-worker-parity.md](2026-09-27-ADR-09-secondary-worker-parity.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision:** 1.2 DRAFT · 27.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`
**Date:** 2026-09-27
**Status:** DRAFT — boundary proposal; the final fate of the component (extract / legacy compat / remove with a test / KVARK adapter) depends on ratification of ADR-08 O5 and ADR-09 O3 (Delivery plan §6.1 RAT-08; not a DQ); nothing here decides that the worker is deleted
**Author:** planner (Fable 5.1)
**Ratified by:** founder — pending (ratification of the ADR as a whole, review in WB-PR1; item class per the map in Delivery plan §6 / ADR-INDEX §3: isolation from the default build chain vs retention = part of this ratification (O3); whether the compose/self-host profile remains a supported surface = part of this ratification (O6, together with ADR-10 P-SELFHOST); no item is a separate DQ)
**Supersedes / refines:** FRD v1.1 §11 "Web/self-host and CLI share backend contracts with desktop; **no separate execution semantics**" (incorrect against the code — S1 C20); the implicit assumption in PRD v1.1 §11 that CLI and web/self-host are "secondary surfaces" of the same executor; the S1 §7 option "bring the worker into scope for 1.0" (rejected as parity work); the implicit status of the worker in `docker-compose.production.yml` as a production executor
**Binds:** WB-PR1 (boundary in FRD v1.2 §11.3), WB-PR4/6 (isolation/fate together with the Teams server), W1 (agent-loop changes must leave the worker compilable or extract it before that), W8-PR6 (release checklist: the worker is not in the Windows package)
**Cross-references:** ADR-02 (durable semantics are **not** ported into the worker), ADR-03 (the worker has no SSE/detach contract — progress goes via Redis publish), ADR-05 (the worker has no recall/ContextPackage), ADR-07 (worker cron ≠ Routines), ADR-08 (Teams server fate, O5), ADR-10 (P-SELFHOST profile); brief §12.2, §17 C20 ("EXPLICIT BOUNDARY"); AT-06, AT-16, AT-30

---

## §1 — Context

**ADR-09-K1 (CONFIRMED AT REVISION) — the worker has its own execution semantics.** `packages/worker/src/index.ts:1-14,24-46` `createWorker`: a BullMQ `Worker` over the `waggle-jobs` queue, `ioredis`, drizzle Postgres through **relative imports into server src** (`'../../server/src/db/connection.js'`, `'../../server/src/db/schema.js'`, `'../../server/src/services/job-service.js'`; 12 such imports in `packages/worker/src` — grep); it registers the handlers `chat`, `task`, `waggle`, `group`, `cron` (`:32-45`). It writes job status to Postgres `agent_jobs` (`:49-70`; schema `packages/server/src/db/schema.ts:162`) and publishes progress via `redisPub.publish('job:<id>:progress', …)` (`:57-63`). Tenant isolation: `execution-policy.ts:47-63` `createWorkerExecutionContext(teamId)` → `WAGGLE_DATA_DIR/teams/<teamId>` with realpath/junction defense; **read-only** tools + `READ_ONLY_WORKER_SYSTEM_PROMPT` (`:11-17`: "cannot run shell commands, execute code, or write, edit, or delete files"). [tiers-kvark.md F-TK-10]

**ADR-09-K2 (CONFIRMED AT REVISION) — chat through the worker ≠ chat through the sidecar.** `handlers/chat-handler.ts:11-24` calls `runAgentLoop({ litellmUrl: LITELLM_URL, litellmApiKey, model: DEFAULT_MODEL ?? 'claude-sonnet', systemPrompt, tools, messages })` directly; `LITELLM_URL` defaults to `http://localhost:4000/v1` (`:7`). In `packages/worker/src` there are **zero** references to `recallMemory|buildSystemPrompt|Orchestrator|PERSONAS|MultiMind|FrameStore|persona|approval|governance` (grep). Local path: `packages/server/src/local/routes/chat.ts:7,1717` uses the same `runAgentLoop`, but with 32 `routes/chat-*.ts` modules (34 in `packages/server/src`; recall, persona, governance, approval hook, model routing, budget…). The same user request yields two different outcomes (memory, persona, gates, budget). `task-handler.ts`, `group-handler.ts` (parallel/sequential/coordinator strategies over `agentGroups` Postgres tables), `waggle-handler.ts` (WaggleDance dispatcher + its own `CapabilityRouter` with empty skills/plugins/mcp/connectors, `:26-33`), `cron-handler.ts` (delegates only `chat|task|waggle|group`, `:5,27-31`) — all independent of the local `CronStore`/`LocalScheduler`.

**ADR-09-K3 (CONFIRMED AT REVISION) — two job stores, two idempotency schemes.** Team: `packages/server/src/routes/jobs.ts:11-89` (`/api/jobs`, Postgres, Clerk auth) + `services/job-service.ts:25-50` (`onConflictDoNothing` by `jobId`, "Job idempotency key collision" — an id collision, not a provider key; ADR-02 K6). Local: `packages/server/src/local/routes/jobs.ts:1-20` `/api/jobs/:id`, `/api/jobs/:id/cancel` over `server.localJobStore` (in-memory; `adapter.ts:2927-2934` comment: "in-memory store; lost on sidecar restart"). Web `adapter.getJobStatus/cancelJob` (`adapter.ts:2925-2941`) targets the **local** store for agent-group runs; the worker `agent_jobs` table has no client in `apps/web` (grep `/api/teams/` = 0).

**ADR-09-K4 (CONFIRMED AT REVISION) — where the worker lives in delivery.** In the build chain: `package.json:25 build:packages … && cd ../worker && npm run build` (tsc + esbuild bundle); `packages/worker/tsconfig.json` `references: ["../shared", "../server"]`. In the production compose: `docker-compose.production.yml:76-91` service `worker` (`image: waggle/server:latest`, `command: node packages/worker/dist/index.js`, `DATABASE_URL`, `REDIS_URL`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, **`WAGGLE_SKIP_LITELLM=1`**, without `LITELLM_URL`). **Not** in `render.yaml` (only `type: web`, `startCommand: npx tsx packages/server/src/local/start.ts --skip-litellm`, `:13-22`). **Not** in the Windows package: grep `worker` in `scripts/stage-sidecar-deps.mjs`, `check-sidecar-resources.mjs`, `build-sidecar.mjs`, `app/src-tauri/tauri.conf.json` = **0**. Tests: `packages/worker/tests/job-processor.test.ts` in `vitest.infra-suites.ts:34` (Postgres/Redis); the other 7 worker test files (`entrypoint`, `execution-policy`, `execution/strategies`, `handlers/*`) are in the default gate (`vitest.config.ts:29` `packages/*/tests/**`).

**ADR-09-K5 (AUDIT FINDING — TO VERIFY) — the worker's compose model path is probably non-functional.** `chat-handler.ts:7` default `LITELLM_URL=http://localhost:4000/v1`; the compose for `worker` sets `WAGGLE_SKIP_LITELLM=1` and the provider keys, but **not** `LITELLM_URL` → the worker in its own container targets `localhost:4000`, where LiteLLM is not running; the worker does not read `WAGGLE_SKIP_LITELLM` (grep in `packages/worker/src` = 0). Not executed (requires Docker/Postgres/Redis) → TO VERIFY. If confirmed, a worker `chat` job in the compose profile cannot complete.

**ADR-09-K6 (CONFIRMED AT REVISION) — render.yaml self-host already uses sidecar semantics.** The web/self-host profile on Render runs `packages/server/src/local/start.ts` — the **same** local core as desktop, with the `WAGGLE_HOST=0.0.0.0` opt-in (`net-config.ts:4-6`). Therefore "web/self-host shares execution semantics with desktop" is **true for the render profile**, and **false** when the Teams server + worker (compose) are enabled. The CLI (`packages/cli`) and `packages/hive-mind-cli` were not checked in phase A for execution semantics (UNKNOWN; out of the scope of C20, which names the worker).

**ADR-09-K7 (DECISION — D-02, D-04 · PROPOSAL — BRIEF DIRECTION — C20 "EXPLICIT BOUNDARY", brief §12.2).** DECISION: there is no separate Waggle Team product (D-02); Windows/Tauri is primary, CLI and web/self-host are supported separate installation paths of the **same** product (D-04). PROPOSAL — BRIEF DIRECTION (planner direction, not user approval): "inventory the secondary worker; the local core has unified contracts; preserve/isolate the legacy team worker or tie it to KVARK, with no new Solo duplication" (C20); the multi-user BullMQ/Postgres/Clerk path does not become a new Waggle Team product (brief §12.2, consistent with D-02).

## §2 — Decision (boundary proposal)

**ADR-09-O1 (PROPOSAL) — one executor for individual Waggle.** Waggle's execution semantics (ADR-01 modes, ADR-02 `DurableRun`, ADR-03 detach/cancel, ADR-04 envelope, ADR-05 `ContextPackage`, ADR-06 evolution, ADR-07 routines) live **exclusively** in the local core (`packages/server/src/local/**` + `@waggle/agent`). Desktop, CLI and web/self-host (render profile) are three installation paths of the **same** sidecar. FRD v1.2 §11.3 states: "shared backend contracts" apply to the sidecar; for `packages/worker` they do **not** apply, and this is not promised.

**ADR-09-O2 (PROPOSAL) — `packages/worker` is a legacy team-mode component, not a parity target.** Classification: **isolate + freeze**. No new features, no port of durable/routine/context/evolution semantics, no attempt to bring worker `chat` up to sidecar `chat`. It is not mentioned in the PRD/FRD as a supported user surface; it does not enter the Windows Solo receipts (and it is not in the package today either — K4). The decision is **not** deletion: deletion requires a separate step after ADR-08 O5 (Teams server fate) and a possible KVARK decision.

**ADR-09-O3 (PROPOSAL) — three permitted outcomes per component (brief §12.2 pattern), with a recommendation.**

| Outcome | What it means | Condition | Recommendation |
|---|---|---|---|
| (a) KVARK adapter | worker handlers become the execution layer of the KVARK job queue | KVARK adopts BullMQ/Postgres `agent_jobs` semantics — **UNKNOWN** (ADR-08 K9) | do not plan without a KVARK owner |
| (b) isolate / legacy compat | stays in the repo, `private: true`, outside the default `build:packages` chain or behind `BUILD_WORKER=1`; tests stay (infra + unit); compose profile labeled "legacy team (unsupported for individual release)" | none | **recommended** for G1–G3 |
| (c) remove with a test | deletion of the package, the compose service, the `worker` row in `vitest.infra-suites.ts`, the `tsconfig` references; a test that `build:packages` and `npm test` pass | depends on ADR-08 O5 (if the Teams server goes to "remove") | only after ratification of ADR-08 O5 on the Teams server (not a separate DQ; ADR-INDEX §3) |

**ADR-09-O4 (PROPOSAL) — code boundaries preserved regardless of the outcome.** (1) The worker does **not** import `packages/server/src/local/**` and the local core does **not** import `packages/worker/**` (CONFIRMED today: 0 in both directions except the `server/src/db|services` relative imports from the worker); (2) the `@waggle/agent` public API (`runAgentLoop`, `createSystemTools`, `PermissionManager`, `CapabilityRouter`) stays compatible while the worker is in the build chain — ADR-02 changes to `agent-loop.ts` (AbortSignal/ledger callbacks) are **additive**, or the worker first moves to outcome (b) with its own build step; (3) the worker remains a **read-only** executor (`execution-policy.ts`) — no expansion of tools whatsoever; (4) worker cron (`cron-handler.ts`) is **not** Routines (ADR-07) and does not get an occurrence/misfire contract.

**ADR-09-O5 (PROPOSAL) — SSE/detach and progress.** The ADR-03 contract (`sinceSeq`, `RunEvent`, detach ≠ cancel) applies only to sidecar runs. Worker progress remains a Redis publish `job:<id>:progress` + Postgres status (`index.ts:49-70`) — it is not mapped to `RunEvent`. Web `adapter.getJobStatus/cancelJob` stays bound to the local `localJobStore`; **no** UI path gets a "job from the worker" view.

**ADR-09-O6 (PROPOSAL) — compose/self-host profile (ADR-10 P-SELFHOST).** Supported self-host = the render profile (sidecar, `WAGGLE_HOST=0.0.0.0`, optional LiteLLM). `docker-compose.production.yml` with Postgres/Redis/MinIO/worker = **legacy team deployment**, documented as unsupported for the individual release; K5 (`LITELLM_URL`) is verified with a single compose smoke **only** if outcome (b) is kept as "runnable legacy" — otherwise no time is spent on it.

**ADR-09-O7 (PROPOSAL) — claims.** FRD v1.2 §11.3 replaces the FRD v1.1 §11 sentence with: "Desktop, CLI and web/self-host (sidecar) share execution semantics; `packages/worker` (BullMQ/Redis/Postgres) is a legacy team component with its own read-only semantics, outside the individual release and outside the parity obligation." PRD v1.2 does not list the worker as a surface. There is no claim about multi-user scaling.

## §3 — What it supersedes and why

| Previous | Where | Why |
|---|---|---|
| FRD v1.1 §11 "no separate execution semantics" | docs/plans/v1.2-evidence/inputs/Waggle_FRD_v1.1_2026-09-27.md:171 | Incorrect: worker `chat` without memory/persona/gates (K2 CONFIRMED); C20 requires an explicit boundary, not false parity |
| S1 §7 option "bring the worker into scope for 1.0" | docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md C20 | Parity work would duplicate Solo contracts in a second runtime (brief §12.2 "with no new Solo duplication"); under D-02 there is no Team product that would justify it |
| Worker as a production service in compose without a caveat | `docker-compose.production.yml:76-91` | Legacy team deployment; model path TO VERIFY (K5); not in the render profile or the Windows package |
| Implicit: worker in the default `build:packages` chain as an equal package | `package.json:25` | Outcome (b): isolation reduces the cost of every `agent-loop`/server change (W1) |

**ADR-09-Z1 (DECISION — not reopened).** D-02 (Waggle = me; KVARK = us) and D-04 (desktop-first, CLI/web as separate paths) are enforced. There is no Waggle Team server as a product.

## §4 — Consequences

**ADR-09-P1 (PROPOSAL).** If outcome (b): `packages/worker/package.json` `private: true` (today it has no `license` field — F-TK-13 lists 9 manifests), `build:packages` without `&& cd ../worker && npm run build` or behind an env flag; the `vitest.config.ts` include stays (unit tests green without infra); CI time is reduced by the esbuild bundle step. Risk: the `tsc --build` reference `../server` is no longer checked through the worker — covered by `packages/server`'s own build.

**ADR-09-P2 (PROPOSAL).** W1 (`agent-loop.ts` changes) gets a checklist item "worker compiles or is extracted"; if it is extracted before W1, the item is dropped.

**ADR-09-P3 (PROPOSAL).** Doc-only: FRD v1.2 §11.3 (already formulated in the draft as "ADR (9)"), PRD §11 without the worker, `docker-compose.production.yml` header comment "legacy team deployment — not part of the individual Windows/self-host release", `docs/ARCHITECTURE.md` if it mentions the worker as an equal (not checked — TO VERIFY).

**ADR-09-P4 (PROPOSAL).** Receipt: no impact on the Windows candidate (the worker is not in the package — K4); no impact on persona/router receipts.

**ADR-09-P5 (PROPOSAL).** License: `packages/worker/package.json` without a `license` field → goes into the O-2 inventory (ADR-10), not decided here.

## §5 — Risk

| ID | Risk | L/I | Mitigation |
|---|---|---|---|
| ADR-09-R1 | Silent divergence: someone "fixes" worker chat by adding recall → a second Solo path | low / medium | O4 (1) import boundary as lint/test; O2 freeze in CONTRIBUTING |
| ADR-09-R2 | Isolation from the build chain hides compilation errors until the worker is run | medium / low | unit tests stay in the default gate (tsc via vitest transpile does not catch types → add `tsc --noEmit -p packages/worker` as an optional CI job behind a flag) |
| ADR-09-R3 | The compose profile remains public in the repo and appears supported | medium / low | O6 comment + README note; K5 TO VERIFY before any claim |
| ADR-09-R4 | KVARK later requests job queue semantics, and the worker has been deleted | low / low | outcome (c) only after a KVARK decision; git history preserves the code |
| ADR-09-R5 | Relative imports `../../server/src/db/*` break if `packages/server` is restructured (TD-CHAT extractions) | medium / low | outcome (b) + P1; or a move to a `@waggle/server` export (out of scope) |

## §6 — Migration test (RED before the fix, GREEN after)

| ID | Test | Location (proposal) | Expectation | AT |
|---|---|---|---|---|
| ADR-09-T1 | Import boundary: no file in `packages/worker/src` imports `packages/server/src/local/**`; no file in `packages/server/src/local/**` or `apps/web/src` imports `packages/worker/**` | `tests/boundaries/worker-boundary.test.ts` (new, grep-based) | green today (CONFIRMED by grep) — pins the boundary | — |
| ADR-09-T2 | `npm run build:packages` passes after the ADR-02 `agent-loop.ts` changes **or** the worker is extracted from the chain (the test reads the `package.json` script) | CI (existing) | green today | — |
| ADR-09-T3 | `execution-policy.test.ts` and `handlers/*.test.ts` stay green without infra; `job-processor.test.ts` stays in the INFRA list | existing | green today (not executed in phase A — boundary) | — |
| ADR-09-T4 | Copy/doc lint: FRD/PRD v1.2 do not contain "no separate execution semantics" without the worker caveat; the compose header carries the legacy note | doc lint (new) | RED today (FRD v1.1 text) | — |
| ADR-09-T5 | The Windows candidate contains neither `packages/worker/dist` nor `bullmq`/`ioredis` in the `resources/node_modules` closure | `certify-windows-installer.ps1` assert (new) or `check-sidecar-resources.mjs` | probably green today (K4 grep 0) — confirm on a packaged build | AT-30 |
| ADR-09-T6 | (only if outcome (b) "runnable legacy") compose smoke: a worker `chat` job with an explicit `LITELLM_URL` completes; without it → documented fail | infra lane (optional) | UNKNOWN (K5) | — |
| ADR-09-T7 | Two concurrent Workspace runs through the sidecar have different `runId` values and do not share state with worker `agent_jobs` (no cross-store reads) | `packages/server/tests/local/` (new, alongside ADR-02 T) | n/a | AT-06 |

**Verification boundary (CONFIRMED AT REVISION):** grep and reading; the worker was not run (Redis/Postgres); compose was not brought up; K5 is derived from env declarations, not from execution.

## §7 — Sources

- **D:** D-02, D-04 (brief §3) · **DIR:** brief §12.2 (tier/Stripe/team code — "secondary server/worker"), §15.3 (hotspot owners) · **C/A/R:** C20 (EXPLICIT BOUNDARY), C2; A2; R15 · **AT:** AT-06, AT-16, AT-30
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/tiers-kvark.md` F-TK-08, F-TK-10, F-TK-13 (manifests without `license`), §2 table ("Teams cloud server + BullMQ worker"); `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05 (`job-service.ts:38` is an id collision, not a provider key); `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-04 (bundle scripts)
- **Planning package:** `docs/plans/WAGGLE-DELIVERY-PLAN-v1.2.md` WB-PR1/PR6, TM-15; `docs/Waggle_FRD_v1.2_DRAFT.md` FRD-11.3; `docs/plans/WAGGLE-MIGRATIONS-v1.2.md` MIG-07.5
- **S1:** C20; §7 "secondary decisions"
- **Code (at `2af0904d`, `git status` clean):** `packages/worker/src/index.ts:1-14,24-70`; `packages/worker/src/handlers/{chat-handler.ts:1-33,task-handler.ts:1-40,group-handler.ts:1-40,waggle-handler.ts:1-40,cron-handler.ts:1-50}`; `packages/worker/src/execution-policy.ts:11-63`; `packages/worker/src/job-processor.ts:1-30`; `packages/worker/{package.json,tsconfig.json}`; `packages/server/src/services/job-service.ts:25-50`; `packages/server/src/routes/jobs.ts:11-89`; `packages/server/src/local/routes/jobs.ts:1-20`; `packages/server/src/db/schema.ts:162`; `packages/server/src/index.ts:41-60`; `packages/server/src/local/index.ts:3585-3614`; `packages/server/src/local/net-config.ts:4-6,24-27`; `apps/web/src/lib/adapter.ts:2925-2941`; `package.json:25`; `docker-compose.production.yml:76-91`; `render.yaml:13-22`; `vitest.infra-suites.ts:16-36`; `vitest.config.ts:29-42`; `scripts/{stage-sidecar-deps.mjs,check-sidecar-resources.mjs,build-sidecar.mjs}` (grep `worker` = 0); `app/src-tauri/tauri.conf.json` (grep `worker` = 0)
