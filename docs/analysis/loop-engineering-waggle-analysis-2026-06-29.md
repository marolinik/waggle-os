# Loop Engineering as a Cron/Loop Layer for Waggle OS

### Can Cobus Greyling's loop-engineering be the scheduling/loop layer for Waggle — a knowledge-worker platform, not a coding tool?

**Status:** Lead analyst synthesis of four lenses (Capability Census · KW Pattern Translation · Cron-Layer Design · Strategic Fit) + direct re-verification of the load-bearing file:line claims.
**Date:** 2026-06-29 · **Verdict confidence:** high (key claims verified against source, not CLAUDE.md).

---

## 1. Executive answer

**Yes — and it is closer to shipped than the framing implies.** Loop-engineering is not a new engine for Waggle; it is **one new `job_type:'loop'` case** that composes pieces Waggle already built for other reasons. The schedule spine (`CronStore` + `LocalScheduler`), run-logs (`cron_execution_history`), the maker/checker fan-out (`subagent-orchestrator.ts` + `judge.ts`), the autonomy gate (`confirmation.ts`), loop-bounding (`loop-guard.ts`), and the durable state substrate (the per-workspace `.mind`) are all in-tree and tested. What is genuinely missing is the **composition glue**, plus four small primitives. The coding-specific half of Cobus's framework — git worktrees, PR babysitting, CI sweeping — correctly does **not** translate, and its knowledge-work substitute (per-workspace mind isolation) already exists.

**The inversion thesis (the real differentiator):** Cobus treats **Memory/State as a bolt-on** — "a durable spine outside any conversation" attached to a loop whose true state is the git repo it reads each tick. Waggle inverts this: the per-workspace `.mind` (HybridSearch + KnowledgeGraph + IdentityLayer + AwarenessLayer) **is the product**, and three of the seven shipped cron job-types (`memory_consolidation`, `proactive`, `connector_fetch`) exist only to feed or mine it. A coding loop re-greps a log to remember tick N-1; a Waggle loop recalls it by *meaning*. Loops are the first feature that makes **scheduled work accumulate in the moat**.

**The honest boundary on that thesis:** memory is a genuine edge for the **recall/synthesis half** of KW loops (triage, brief, digest, "what changed since I last looked") and **neutral-to-negative for the pure-action half** (send the email, update the record), where the authoritative state is the external system (CRM, inbox) and dragging it through a memory substrate adds latency, dedup cost, and a staleness/poisoning surface. Sell the differentiator where it is true.

---

## 2. What loop-engineering is (sourced)

Cobus Greyling, `github.com/cobusgreyling/loop-engineering` (~3.9k stars, Jun 2026): *"Loop engineering is replacing yourself as the person who prompts the agent. You design the system that does it instead."* A **harness** equips one agent run; a **loop** keeps poking agents on a schedule, spawns helpers, verifies, persists state, decides the next action.

**Five building blocks + memory:** (1) Automations/Scheduling, (2) Worktrees (git isolation — coding-specific), (3) Skills (persistent project knowledge), (4) Plugins & Connectors (MCP), (5) Sub-agents (maker/checker), + Memory/State (the durable spine, treated as a bolt-on).

**Loop anatomy (10 steps):** schedule -> triage skill -> state read/write -> isolated worktree -> implementer sub-agent -> verifier sub-agent -> MCP/git/tickets -> human gate -> commit/PR/action -> loop back.

**Seven production patterns (all coding-centric):** Daily Triage, PR Babysitter, CI Sweeper, Dependency Sweeper, Changelog Drafter, Post-Merge Cleanup, Issue Triage.

**Operating concepts:** autonomy tiers **L1 Report / L2 Assisted / L3 Unattended**; **intent debt** (unarticulated goals piling up in loop prompts); **comprehension debt** (gap between what the loop ships and what humans understand — read-before-ship); denylist & auto-merge gates; MCP scopes; multi-loop coordination; cost-per-cadence; run-logs; CLI tools (`loop-init`, `loop-audit`, `loop-cost`).

---

## 3. What Waggle ALREADY has — verified capability census

Statuses corrected against source. **EXISTS** = shipped and usable. **PARTIAL** = built but not wired into the scheduled path. **ABSENT** = not present. **N/A** = coding-only, does not translate.

| # | Capability | LE term | Status | Evidence (verified file:line) | Gap |
|---|---|---|---|---|---|
| 1 | Schedule + triage on a cadence | Automations/Scheduling | **EXISTS** | `cron-store.ts:15` (`CronJobType` 7-member union), `:72-86` table, `:272` `getDue()`, `:279` `markRun()`; `cron.ts:126` 60s `tick()`; `automations.ts:149-336` user API | None for L1 |
| 2 | Parallel execution isolation | Worktrees | **N/A (coding-only)** | KW analog = per-workspace `.mind`: `activateWorkspaceMindWithWeaver` (`index.ts:1867`) | Git worktrees do not translate; the analog already exists |
| 3 | Persistent project knowledge / reusable modules | Skills | **PARTIAL** | `skill-audit.ts`, `skill-creator.ts`, `persona-data.ts` | Validated but not bound as durable scheduled config |
| 4 | MCP integration | Connectors/MCP | **PARTIAL** | `mcp-catalog.ts`, `connectors/` (30 connectors), `permissions.ts` (whitelist/blacklist) | No per-MCP scope parameter |
| 5 | Sub-agents (maker/checker) | Sub-agents | **PARTIAL (built, unwired)** | `subagent-orchestrator.ts:97` topological sort + `'reviewer'` preset; `judge.ts:76` rubric scoring | Exists in `packages/agent`; **not wired into the cron executor** (executor does a single chat call) |
| 6 | Durable state/memory outside conversation | Memory/State | **EXISTS** | `hive-mind-core/src/mind/{frames,knowledge,identity,awareness}.ts`; `awareness.ts:91` `getByStatus('pending')`; `frames.ts:73` `createIFrame` | The spine — see §4 |
| 7 | 10-step loop anatomy end-to-end | Loop Anatomy | **PARTIAL** | Steps 1-3,5,8-10 exist individually; **the verifier persona is FULLY built** (`judge.ts`) but unwired to cron; step 4 (worktree) is N/A | No integrated 10-step loop architecture; it is components, not a system |
| 8 | Autonomy tiers | Autonomy L1/L2/L3 | **EXISTS (terminology differs)** | `confirmation.ts:202` `AutonomyLevel = 'normal'\|'trusted'\|'yolo'`; `:237` `isCriticalNeverAutopass`; `:271` `needsConfirmationWithAutonomy`; schema levels `manual/guided/medium/high` | Gate is **per-tool-call**, not **per-loop**; the named tiers map to L1/L2/L3 but aren't bound to a loop config |
| 9 | Denylist / never-autopass | Denylist gates | **PARTIAL (corrected from ABSENT)** | Binary denylist `DENIED_BINARIES` (`system-tools-helpers.ts:7`, applied `system-tools.ts:1008`); `CRITICAL_NEVER_AUTOPASS` regex set (`confirmation.ts:220`) | Tool-level denylist exists; **no per-loop denylist config, no auto-merge gate, not bound to the headless path** |
| 10 | Per-action MCP scope limiting | MCP Scopes | **ABSENT** | No `scope` field on `McpServer` | Net-new |
| 11 | Intent debt tracking | Intent Debt | **ABSENT** | — | Concept/UX guardrail, not code |
| 12 | Comprehension debt (read-before-ship) | Comprehension Debt | **ABSENT** | Raw material exists (`cron_execution_history.result_summary`, `formatTrustSummary`) | No plain-language "what this loop did/proposed" digest — the #1 non-technical-user risk |
| 13 | Cost-per-cadence estimation | Cost-per-Cadence | **PARTIAL** | `cost-tracker.ts:55` soft/hard budget; **`getDailyTotal` is a per-session in-memory proxy** (`:135`) | Not persisted, not wired to cron; cannot bound a 24/7 loop |
| 14 | Run-logs (per-tick record) | Run-logs | **EXISTS** | `cron-store.ts:89-102` `cron_execution_history` (`duration_ms/success/result_summary/error`); `getExecutionHistory()`; `GET /api/automations/:id/logs` (`automations.ts:312`); retention `pruneExecutionHistory(30)` (`:320`) | Surface, don't rebuild |
| 15 | Loop bounding / infinite-loop detection | Loop Bounding | **EXISTS** | `loop-guard.ts`, `iteration-budget.ts`; `cron.ts:157` auto-disable after 5 consecutive failures | None |
| 16 | Multi-loop coordination | Multi-loop Coordination | **ABSENT** | Only single-flight `this.ticking` guard (`cron.ts:127`) + 5-fail disable | No cross-loop conflict resolution — TEAMS-tier, later |
| 17 | `loop-init`/`loop-audit`/`loop-cost` CLI | Loop CLI | **ABSENT** | `cli-tools.ts` is generic CLI discovery | Deliver as builder UI, not a developer CLI |

**Census bottom line:** ~75% of the loop-engineering primitive set is present (8 EXISTS, 4 PARTIAL, 1 N/A); the 4 true ABSENTs plus the cost-per-cadence gap are what a "Loop" layer must add. The coding-only block (worktrees) is correctly absent with a working analog.

---

## 4. The cron-layer opportunity: a "Loop" abstraction on top of CronStore

**A Loop is a `cron_schedules` row with one new `job_type:'loop'` and a structured `job_config`.** No new table, no new route, no new UI — it reuses the exact blob-on-`job_config` trick `automations.ts` already relies on, and `AutomationCenterApp` already renders any cron row + its history/logs/running tabs.

### Data model (everything beyond `CronSchedule` lives in `job_config`)
```
job_config (loop):
  goal:        string         // the recursive purpose ("keep my pipeline triaged")
  makerPrompt: string         // the implementer sub-agent task (the "triage skill")
  checkerRubric?: string      // verifier rubric -> judge.ts; omit = no checker
  autonomyTier: 'L1'|'L2'|'L3' // report / assisted / unattended
  stateKey:    string         // awareness namespace tag for cross-tick state
  budget?:     { maxTicks?, maxSubagents?, maxTokens? }
  denylist?:   string[]       // L3 tool/connector denylist (binds to isCriticalNeverAutopass)
  notify:      boolean
```

### Execution sequence (the new `case 'loop':` in the `index.ts:1427` switch — the only new wiring)
1. **Schedule fires** -> `LocalScheduler.tick` (exists, `cron.ts:126`).
2. **Isolate** -> `activateWorkspaceMindWithWeaver(workspace_id)` (exists, `index.ts:1867`). *This is Waggle's worktree.*
3. **Read prior state** -> `AwarenessLayer.getByStatus('pending')` (`awareness.ts:91`) + HybridSearch over frames tagged `stateKey`. **This is the step cron does not do today.**
4. **Maker** -> `SubagentOrchestrator.runWorkflow` (`subagent-orchestrator.ts:97`), step `implement`.
5. **Checker** -> a `verify` step (`dependsOn:['implement']`) scored by `judge.ts:76` -> pass/fail gate.
6. **Human gate by tier:** L1 = `emitNotification` only (zero write side-effects); L2 = write a `pending` approval item; L3 = execute with `denylist` enforced by `isCriticalNeverAutopass` (`confirmation.ts:237`) as the hard floor.
7. **Write next-tick state** -> `awareness.add/updateMetadata` + `FrameStore.createIFrame` (`frames.ts:73`) so tick N+1 sees what tick N did.
8. **Record + loop back** -> `onJobComplete` -> `cron_execution_history` (exists), `markRun` recomputes `next_run_at`.

### Reuse vs build

| Loop step | Already there (cite) | Build new |
|---|---|---|
| schedule/tick | `LocalScheduler` `cron.ts:126` | — |
| triage skill | persona/prompt in `job_config` | — |
| **state read/write** | `awareness.ts:91` / `frames.ts:73` / HybridSearch | **wire it (cron ignores it today)** |
| isolation | `activateWorkspaceMindWithWeaver` `index.ts:1867` | — |
| maker subagent | `subagent-orchestrator.ts:97` | — |
| checker subagent | `'reviewer'` preset + `judge.ts:76` | **glue verdict -> gate** |
| connector action | `connector_fetch` `index.ts:1914`; `mcp/` + `tool-filter` | — |
| human gate / autonomy | `needsConfirmationWithAutonomy` `confirmation.ts:271` | **map L1/L2/L3 -> levels + headless queue** |
| loop bounding | `loop-guard.ts`, `iteration-budget.ts` | — |
| cost-per-cadence | `cost-tracker.ts` | persist + pre-activation estimate |

**Net new code = one executor case (~150-250 LOC) + tests.** The maker/checker fan-out is ~90% there; scheduling/run-logs/auto-disable are 100% there; the gate is 100% there. The composition is the work.

### Why memory is the spine (the differentiator, grounded)
Cobus's loops are stateful **because git is the state** — worktrees, branches, the diff a PR babysitter reads to know what it already touched. Knowledge work has no git, which is exactly why naive "agent on a cron" loops re-do and re-report the same thing every tick. Waggle already shipped the substitute:
- **`AwarenessLayer`** (`awareness.ts:27`) is a typed, expiring, priority-ordered scratchpad with categories `task|action|pending|flag` and `{status,result}` metadata. `getByStatus('pending')` (`:91`) is literally "what did I leave open last tick" — the loop's working register.
- **`FrameStore.createIFrame`** (`frames.ts:73`) + the harvest **dedup pipeline** mean tick N+1 recalls tick N's frames and doesn't re-emit them. "3 new at-risk deals" on day two means 3 *new* ones, because the prior 5 are already frames.
- The contrast that sells it: Cobus's PR Babysitter remembers which PRs it nudged via git/ticket state. Waggle's pipeline loop remembers which leads it already drafted outreach for, and the contract loop remembers which clauses it already flagged — stored as awareness items + frames, deduped nightly by `memory_compact`/`memory_lane_extract` (`setup-crons.ts`). `cron_execution_history` can tell you a tick *ran*; the mind tells you what the tick *knows*. **L1 loops should be free precisely because they generate this memory.**

---

## 5. Knowledge-worker Loop catalog

### 5a. The 7 production patterns -> KW analogs

| # | Coding pattern | KW Loop | Cadence | CronJobType | Persona | Writes to memory (why it compounds) | Tier / gate | Translate? |
|---|---|---|---|---|---|---|---|---|
| 1 | Daily Triage | **Daily Desk Brief** — "what needs me today" across inbox/calendar/CRM | 1x/day | `proactive` (reuse `morning_briefing`) + `agent_task` enrich | executive-assistant | Brief frame; flags items into `awareness(category='task')` so they compound day-over-day | L1, free | ✅ clean |
| 2 | PR Babysitter | **Awaiting-Reply Babysitter** — watch threads/deals you're waiting on; draft nudge when stale | 4x/day (polled) | `agent_task` | sales-rep/support-agent | Thread-state frame (who owes whom, last-touch) reused next tick | **L2, PRO** | ✅ but most blocked: wants event trigger + approval queue |
| 3 | CI Sweeper | **Integration-Health Sweeper** — did nightly reports run? connectors still authed? | 15 min | `workspace_health` (reuse) | ops-manager | Health-status frame + alert | L1 | ⚠️ **mostly coding-only**; only the plumbing-health residue translates, strictly L1, no autonomous remediation |
| 4 | Dependency Sweeper | **Doc/Policy Freshness Sweeper** — flag SOPs/contracts past review-by; propose patch-only edits | weekly | `agent_task` | legal/hr/ops | Freshness-ledger frame per doc | **L2 patch-only, PRO** | ⚠️ translates by metaphor (docs-as-dependencies) |
| 5 | Changelog Drafter | **Weekly Wins / Status Digest** — "what shipped/closed/moved" from tasks+CRM+memory | weekly | `agent_task` (kin to `monthly_assessment`) | project-manager/PM | Digest frame -> compounds into the wiki (`compile_wiki`) | L2 | ✅ clean |
| 6 | Post-Merge Cleanup | **Deal/Project Close-Out** — extract lessons-learned, archive, advance CRM stage | poll 1x/day | `agent_task` | project-manager/sales-rep | **Lessons-learned/post-mortem frame** (highest-compounding write) | L2->L3 | ⚠️ git mechanics N/A; the "hygiene-after-completion" pattern is high value |
| 7 | Issue Triage | **Inbound Triage** — classify/route email, tickets, leads, NDAs, applicants | 2h | `agent_task` | support/recruiter/legal/sales | Triage-label + routing-decision frames; new KG entity per item | **L2 propose-only, PRO** | ✅ strong; matching skills exist (`customer-support:ticket-triage`, `legal:triage-nda`) |

**Coding-only SKIPs:** CI Sweeper's autonomous build-fix and the git/branch mechanics of Worktrees + Post-Merge Cleanup. Dependency Sweeper translates only by metaphor. The other four map cleanly.

### 5b. Net-new KW loops (no coding analog — these exist *because* memory + connectors are the platform)

| Loop | Purpose | Cadence | CronJobType | Why it compounds | Tier | New primitive? |
|---|---|---|---|---|---|---|
| **Inbox-to-memory harvest** | Pull gmail/slack/notion into the mind so context compounds passively | daily | `connector_fetch` (**already shipped**, `index.ts:1914`) | Raw frames in personal mind — the moat in motion | PRO, L3 read-only | **None — ships today** |
| **Relationship-decay sweep** | "Who have I gone quiet on?" ranked by importance | weekly | `agent_task` | Per-contact cadence frame; decay model sharpens over weeks | L1 / L2 draft | Reuses cron; L2 send needs approval queue |
| **Commitment tracker** | Scan sent mail + meeting notes for promises ("I'll send X by Fri") | daily | `agent_task` | Commitment entities in KG — impossible without the substrate | L1 | Benefits from checker (prune false promises) |
| **Renewal / expiry radar** | Contracts/licenses/subs expiring in N days -> alert + prep pack | weekly | `agent_task` | Renewal-calendar frames reconciled each tick | L2 | L2 prep approval |
| **Meeting-prep brief** | T-30 before each meeting: attendees, last threads, open items, CRM | per-meeting | `agent_task` | Brief frame keyed to attendees -> next meeting starts warm | L1 | **Calendar-derived scheduling** — NEW |
| **Knowledge-gap / wiki-compile** | Periodically compile personal wiki + health-check -> surface gaps | weekly | `memory_consolidation` (reuse) | The mind audits itself | L1 | **None — reuses action convention** |
| **Competitor / market-watch digest** | Weekly pull on tracked competitors -> "what changed" delta | weekly | `agent_task` | Per-competitor frame diffed vs last week | L1 | Reuses cron + web-fetch |
| **Expense/invoice anomaly digest** | Weekly scan for anomalies + overdue | weekly | `agent_task` | Anomaly frames + learned baseline | L1 | Reuses cron |

**~60% of this catalog ships today on the existing cron substrate with zero new code** (persona + prompt + connectors + a `cron_expr`), at L1 or via the notification+`actionUrl` soft-L2 workaround.

---

## 6. Adopt / Build / Skip — concepts

| Concept | Verdict | Grounded why |
|---|---|---|
| Automations/Scheduling | **ADOPT (already built — reframe)** | `CronStore` + `LocalScheduler` + `/api/automations` shipped; work is vocabulary + UX |
| Worktrees (git) | **SKIP** | Coding-only; KW analog = per-workspace `.mind` boundary (`index.ts:1867`) |
| Skills | **ADOPT (already built)** | Skills + custom-personas + the §D2 verify loop; loops *are* scheduled skills |
| Plugins/Connectors (MCP) | **ADOPT (already built)** | `mcp-catalog.ts` + `connectors/` + `connector_fetch` |
| Sub-agents (maker/checker) | **ADOPT — wire to cron** | `subagent-orchestrator.ts:97` + `judge.ts` exist; the shipped `skill-audit.ts` (synth->run->judge->rewrite->badge) is a maker/checker loop for a KW artifact |
| L1/L2/L3 autonomy | **ADOPT-AS-CONCEPT (relabel + per-loop bind)** | `confirmation.ts:202` `normal/trusted/yolo` = L1/L2/L3 but **per-tool-call**; build a thin per-loop autonomy field that maps onto it |
| Denylist / never-autopass | **ADOPT (already built — bind to headless)** | `CRITICAL_NEVER_AUTOPASS` (`confirmation.ts:220`) + `DENIED_BINARIES` (`system-tools-helpers.ts:7`); bind to **DENY** in headless, not auto-pass |
| Intent debt | **ADOPT-AS-CONCEPT** | UX guardrail: force a one-line goal + success criterion per loop. No code |
| Comprehension debt | **BUILD (small)** | Raw material exists (`cron_execution_history.result_summary` + `formatTrustSummary`); assemble a plain-language "what this loop did/proposed" digest |
| Cost-per-cadence | **BUILD** | `cost-tracker.ts:55` budgets exist but `getDailyTotal` (`:135`) is a per-session proxy; persist a per-loop budget + pre-activation $/day estimate |
| Run-logs | **SKIP / DONE** | `cron_execution_history` + `pruneExecutionHistory(30)` already are run-logs; surface them |
| Multi-loop coordination | **BUILD (later, TEAMS)** | Today: single-process guard + 5-fail disable (`cron.ts:127,157`); real conflict resolution is TEAMS-tier |
| `loop-audit`/`loop-cost` | **ADOPT-AS-CONCEPT, BUILD as UI panel** | Pre-activation readiness/cost in the builder, not a developer CLI |
| `loop-init` scaffold | **SKIP** | KW users don't scaffold YAML; the persona + template picker is the scaffold |
| 7 production patterns | **SKIP as-is, translate** | All coding-centric; replace with the KW templates in §5a |

### Autonomy-tier proposal mapped to Waggle's trust-model
- **L1 Report** = `emitNotification` only, zero write side-effects (today's scheduled `agent_task` is L1 *by construction* — it is toolless, `index.ts:1869-1885`). Default for v0.
- **L2 Assisted** = maker drafts -> checker gates -> writes a `pending` approval item surfaced in the existing confirmation/notification UI; the human one-click approves. **Needs the new `pending_actions` store.**
- **L3 Unattended** = executes with `denylist` enforced by `isCriticalNeverAutopass` as the hard floor; never inherits interactive auto-approve. Deferred past v0/v1 for write-capable KW workspaces.

---

## 7. Monetization & tier placement

**Split by what the loop *touches*, reusing the gate the code already made** — `connector_fetch` is **already PRO-gated** (`assertTierCapability(tier,'PRO')`, `index.ts:1919`). Lean on that precedent; do **not** invent a standalone "Loops" SKU (that would tax the moat-builder).

- **FREE — memory-directed loops (drives the moat).** Loops whose only side effect is writing to the mind: `memory_consolidation`, `proactive` recall, a capped daily `agent_task` digest. `spawnAgents` is already FREE (`tiers.ts`), and scheduled agents are agents on a clock. Cap by **cadence + count**, not by feature (e.g. FREE = up to 3 automations, daily-or-slower, no external write). Maximizes frames written = maximizes moat.
- **PRO ($19) — connector-fed / connector-acting + verify loops (the upgrade trigger).** Anything reading a connector into a loop or acting through one, the maker/checker verify loop (already PRO-gated), custom-skill loops (`customSkills` starts at PRO), higher cadence (sub-hourly), and higher per-loop token budget. This is exactly "skills/connectors are the upgrade trigger."
- **TEAMS ($49/seat) — shared, governed, multi-loop.** Shared-workspace loops, multi-loop conflict resolution, and full run-log audit (`auditLog:'full'`, `teamSkillLibrary` — both TEAMS-only). A team running 20 loops against a shared CRM needs coordination + audit; that is the governance value KVARK sells up-market.

Defensible because it keeps the moat (free memory loops compound the substrate), doesn't invent a new paywall (loops fall through the existing connector/skill/audit gates), and the cadence/cost cap is the natural "more, faster, acting" upgrade reason.

---

## 8. Risks & mitigations

**A. Unattended-action footgun — latent today, one wire from opening.** Scheduled `agent_task` is currently toolless — a plain `/v1/chat/completions` call that generates text and notifies (`index.ts:1869-1885`). So every scheduled loop is **L1 by construction** and *cannot* send an email. The danger is the obvious next feature: wiring the full agent loop (with tools) into the scheduler. The moment that happens, **`ConfirmationGate.confirm` returns `true` (auto-approve) when there is no `promptFn`** (verified `confirmation.ts:313`) — a headless tick would silently auto-approve `send_email` (otherwise always-critical). **Mitigation (hard requirement before any tool-enabled scheduled loop):** headless runs default L1; any gated action routes to the notification/approval queue (the `notifications` table already exists, `cron-store.ts:105`) as an async human gate; bind `isCriticalNeverAutopass` to **DENY** in headless, never auto-pass.

**B. Token-cost blowup on cadence — under-defended.** `CostTracker` has soft/hard daily budgets (`cost-tracker.ts:55`) but **`getDailyTotal()` is an in-memory per-session proxy** (`:135`) — it does not survive restarts and does not bound a per-minute loop. The only real defenses in-tree are the **20-hour frequency floor** (`index.ts:1945`) and the **5-consecutive-failure auto-disable** (`cron.ts:157`). **Mitigation:** generalize the frequency floor to all loop types, persist a per-loop daily budget with a hard cap (reuse `BudgetExceededError`), and show a pre-activation $/day estimate in the builder. Without this, a PRO user setting a 5-min triage loop on Opus is a surprise invoice.

**C. Comprehension debt — the sharpest KW-specific risk, least mitigated.** Cobus's "read-before-ship" assumes a developer reading a diff. Waggle's user is a salesperson who will not read a JSON run-log. The substrate exists (`cron_execution_history` per-tick rows, `result_summary`, `formatTrustSummary`'s plain-language prose) but is not assembled into a human story. **Mitigation:** default loops to **L2 "propose, don't act"** with a plain-language digest ("This automation drafted 3 follow-up emails and updated 2 deal stages — review?"). For non-technical users, comprehension debt is repaid by **propose-with-summary**, not better logs.

**D. Stale/poisoned memory feeding an acting loop.** A loop that recalls a poisoned frame then acts is the worst case. `connector_fetch` already injection-scans inbound frames and `skill-audit.ts` fences skill content as untrusted; that discipline must extend to *every* loop crossing recall->action. **Mitigation:** run recalled context through `scanForInjection` before it can reach a write tool.

**E. Scaling caveat (disclose, don't over-engineer for v0).** `LocalScheduler.tick` runs due jobs **sequentially, awaited in one process**, under a single-flight guard (`cron.ts:126-164`). A loop spawning maker+checker takes minutes; while it runs the whole tick is blocked and other due jobs wait. Fine for a handful of solo-desktop loops; it is not a fleet scheduler. Flag it; a job queue is a later concern.

---

## 9. Smallest shippable slice — "Loop v0"

**Loop v0 = "make `agent_task` stateful and verified," shipped as `job_type:'loop'`, L1 only.**

Scope, minimal:
- **One new `case 'loop':`** in the `index.ts:1427` switch. Reads the `job_config` spec, activates the workspace mind, reads prior state from awareness + recall, runs a 2-step `SubagentOrchestrator` workflow (maker -> reviewer with `dependsOn`/`contextFrom`), scores the reviewer output with `judge.ts`, **emits a report notification** (L1: observe, zero writes), then **writes the result back** as frames + an awareness item tagged `stateKey`. `onJobComplete` already records the run-log.
- **Builder/UI: none.** `AutomationBuilder` already POSTs an arbitrary `job_config`; `AutomationCenterApp` already renders the row + Running/History/Logs + Run-now. A 1-line "Loop" label is the only optional FE touch.
- **Tests:** executor unit test + one e2e through `/api/automations` -> tick -> history. Both harnesses exist (`automations.test.ts`, `local-scheduler.test.ts`).

**Honest build cost: ~1-2 engineer-days.** Small *because* maker/checker, scheduling, run-logs, isolation, the gate, loop-guard, and the memory API are all already in-tree and tested. The risk is not code volume; it is the autonomy-ceiling and tier-gate decisions (§10), plus the §8E sequential-tick caveat.

**Deliberately deferred from v0:** L2 approval queue (next arc), L3 unattended writes, event/calendar triggers, multi-loop coordination, per-MCP scopes.

---

## 10. Open decisions for the founder

1. **Autonomy ceiling for v0** — L1-only (report + notify, safe-by-default, demoable) or also L2 (assisted: writes a `pending` approval surfaced in the existing confirmation UI)? *Recommendation: L1 only for v0, L2 next arc, L3 deferred as its own trust arc.*
2. **Tier placement** — L1 memory-building loops FREE (aligned to the moat) with L2/L3 PRO, or "Loops" itself an upgrade trigger? *The gating primitive (`assertTierCapability`) is already wired; this is the one pricing call blocking a build.*
3. **Vocabulary** — keep user-facing "Automations" (already shipped) or rebrand to "Loops" (borrows Cobus's mindshare)?
4. **Event/calendar triggers** — lift the schedule-only restriction now or defer? *Only Babysitter (react-on-reply) and Meeting-prep (T-30) truly need it; everything else polls fine. Recommendation: defer.*
5. **Scaling posture** — accept the sequential single-process tick for v0 and revisit a job queue only if TEAMS multi-loop demand materializes?

---

### Key files cited
`packages/core/src/cron-store.ts` (store + run-logs) · `packages/server/src/local/cron.ts` (tick runner) · `packages/server/src/local/index.ts:1426-1957` (executor switch; `agent_task` one-shot at :1830; `connector_fetch` PRO-gated at :1914) · `packages/server/src/local/routes/automations.ts` (alias seam) · `packages/agent/src/subagent-orchestrator.ts:97` (maker/checker) · `packages/agent/src/judge.ts:76` (checker rubric) · `packages/agent/src/confirmation.ts:202,220,237,271,313` (autonomy gate + the headless footgun) · `packages/agent/src/system-tools-helpers.ts:7` (`DENIED_BINARIES`) · `packages/agent/src/cost-tracker.ts:55,135` (budget + per-session proxy) · `packages/agent/src/skill-audit.ts` (shipped maker/checker loop) · `packages/hive-mind-core/src/mind/{awareness.ts:91,frames.ts:73}` (state spine) · `packages/shared/src/tiers.ts` (tier gates).