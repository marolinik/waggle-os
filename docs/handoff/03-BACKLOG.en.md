# Waggle v1.2 — Backlog (tickets from Delivery plan §2)

> **English translation** of [03-BACKLOG.md](03-BACKLOG.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 29.09.2026 · reviewed code revision `2af0904df01ca3d374cc78ba95b60dc579dd6a7a`**

> **Implementation is NOT approved.** This backlog is a planning artifact. Coding starts only when the founder approves the delivery plan in writing ([WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md)). From the first commit onward, everything follows the **mandatory** safe strategy: DP-0.01..DP-0.16 (Delivery §0) and [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md). Every checklist item is yes/no, and a single "no" stops work. The status of all tickets is `TODO — čeka odobrenje plana`. Founder decisions D-01..D-18 (brief §3) are closed and this backlog does not reopen them. — PROPOSAL — BRIEF DIRECTION (DIR-01, authority boundary).

Readers: tech lead, developers, QA. Read [00-START-HERE.md](00-START-HERE.en.md) before this file. The environment is in [01-ONBOARDING-DEV-ENV.md](01-ONBOARDING-DEV-ENV.en.md), the way of working (branches, PRs, review, gates) in [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md), the code map in [04-CODEBASE-MAP.md](04-CODEBASE-MAP.en.md). Risks, the decision queue and escalation are in [05-RISKS-DECISIONS-ESCALATION.md](05-RISKS-DECISIONS-ESCALATION.en.md). The machine-readable version of all tickets is [backlog.csv](backlog.csv) (RFC 4180, UTF-8).

---

## 0. Rules of this backlog

| # | Rule | Status |
|---|---|---|
| B-01 | **One ticket = one PR ID from Delivery §2** ("PR slicing" per wave). `ticket_id` is literally the PR ID from the plan. Tickets are not invented, merged or dropped. | PROPOSAL |
| B-02 | The plan itself splits two PR IDs from §2 into named sub-PRs, so the sub-PRs are counted: **W3e-PR9 → W3e-PR9a..PR9e** (§2 W3e, §4.1.1, §4.2 review count "+5") and **B2-PR0 → B2-PR0a/PR0b/PR0c** (§2 B1–B3 "split in §4.1.1 into PR0a/b/c", §3 graph, §4.2 "B2-PR0a/b/c are counted as 3 PRs"). The umbrella ID (W3e-PR9, B2-PR0) is not a separate ticket. | PROPOSAL (interpretation of §2/§4.1.1) |
| B-03 | Total **123 tickets**: G1 = 25, G2 = 65, G3 = 33 (of which W3e-PR9a..e = 5, only with ODB-02). This matches the review count in Delivery §4.2: G1 ~26 PRs = 25 tickets + 1 integration doc-only PR; G2 66–68 = 65 + 1–3 integration PRs; G3 29–31 (+5) = 28 (+5) + 1–3. | CONFIRMED AT REVISION of the package (count of §2 and §4.2, 29.09.2026) |
| B-04 | **Integration PRs from the Delivery §4.1 row "Integration/spec sync"** (G1: ID reconcile FRD §16.1 ↔ PRD v1.2 ↔ §7, one doc-only PR; G2: hotspot integration tests; G3: reconcile after DQ decisions) **have no PR ID in §2**, so they are not tickets. They are tracked in §6 and §7 of this file. ID: UNKNOWN. | UNKNOWN |
| B-05 | **Estimates** are copied from Delivery §4.1.1 (classic / AI eng-days, expert range, not P50). Where the plan gives only a PR group total, the per-ticket field stays empty, and the group and its total are in the note. No number has been re-estimated. | PROPOSAL (plan's numbers) |
| B-06 | **AT/PRD/FRD IDs** come from FRD §15 (column "Wave"), Delivery §2 (exit tests and PR table rows) and Delivery §7 (TM rows). A TM row is a group row: it names a wave or a PR group, so the CSV columns `prd_ids`/`frd_ids` carry the union of the TM rows in which the ticket appears. The `notes` column names those TM rows. The distribution of PRD/FRD IDs per individual PR within a TM row is not given in the plan (UNKNOWN). | PROPOSAL |
| B-07 | **Files.** For G1 tickets, paths were verified with `git ls-tree` against `2af0904d` (29.09.2026). Line numbers are taken from the plan; for `ci.yml:3-6`, `feature-flags.ts:26`, `workflow-harness.ts:474-482`, `cost-tracker.ts:24-32`, `dock-tiers.ts:82`, `cost.ts:210,272`, `settings.ts:1192`, `local/index.ts:612` and `package.json:48` the content was re-read. For G2/G3 the paths are from the plan and were not re-verified. | CONFIRMED AT REVISION (G1 paths); PROPOSAL (G2/G3) |
| B-08 | **Status** of every ticket: `TODO — čeka odobrenje plana`. Pre-merge gates (RAT-nn, DQ-nn, ODB-nn) are in the ticket's column/note. A gate is not a dependency on another ticket. | PROPOSAL |
| B-09 | Fact status labels: **DECISION** (only D-01..D-18), **CONFIRMED AT REVISION**, **AUDIT FINDING — TO VERIFY**, **PARTIAL/UNWIRED**, **PROPOSAL**, **DEFERRED**, **UNKNOWN**. "Module exists" is not evidence of an E2E function. | as in the package |

**Definition of Ready (every ticket; PROPOSAL, derived from the checklist):** plan approved; owner role assigned to a person (DP-0.14); dependent tickets merged into `integration/waggle-next`; the ticket's gate (RAT/DQ/ODB) closed if it is a pre-merge gate; env template from the checklist sections "Env isolation" and "External writes disabled" ready; RED test and its file known.

**Definition of Done (every ticket; PROPOSAL, derived from the checklist and DP-0.06/DP-0.15):** RED test fails on the baseline, then passes after the minimal GREEN; pinning tests named by the plan rewritten in the same PR with a rationale; gates green: `npm run build:packages` · `npm run typecheck:server-tests` · `npm run lint` · `npm run test -- --run --maxWorkers=6`; a ticket that touches `apps/web/**` also has `npm run typecheck:web` · `npm run test -w apps/web` green, because root `vitest.config.ts:43` excludes `apps/**` and the four gates do not run web RED/GREEN tests (CONFIRMED AT REVISION); other supplementary checks per touched surface are in [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md) §6.3; the PR description contains all mandatory fields (finding ID, AT or "none — reason", RED→GREEN evidence, rewritten tests, affected receipts I/R/P/A/C, migration/rollback, status labels); review by the hotspot owner; merge only into `integration/waggle-next`, never into `main`; checklist without a single "no".

---

## 1. Overview by wave

Columns: G = milestone; estimate = classic / AI eng-days from Delivery §4.1.1 ("—" = the plan gives only a group total, see the note in the CSV); owner = role (DP-0.14), not a name.

<!-- GEN:OVERVIEW:BEGIN -->

### W0 (20 tickets; G1)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W0-PR0 | G1 | CI filters for `integration/**` (ci.yml, tauri-build-pr.yml) | — | — (prerequisite; TM-19 carries AT-30) | — (group) | UNKNOWN (proposal: Release owner) |
| W0-PR1 | G1 | Verify default fail-closed + harness:phase:skipped | W0-PR0 | AT-01 | — (group) | Harness owner |
| W0-PR2 | G1 | VERDICT value in the gate; CONDITIONAL ≠ PASS | W0-PR0, W0-PR1, W0-PR8 | AT-01 | — (group) | Harness owner |
| W0-PR3 | G1 | Exit code is not lost; bash gate = real test/typecheck | W0-PR0, W0-PR1, W0-PR8 | AT-02 | — (group) | Harness owner |
| W0-PR4 | G1 | run_harness is removed from VERIFICATION_TOOL_EXACT; gate receives {name, succeeded} | W0-PR0 | AT-02 | — (group) | Harness owner |
| W0-PR5 | G1 | Budget stop: D3 disclose-only + budgetStop meta | W0-PR0 | AT-03 part (G1) | — (group) | Harness owner |
| W0-PR6 | G1 | Bridge truthfulness without schema (outcome 'pending' + tag gate_passed) + MIG-04(A) | W0-PR0, W0-PR7, W0-PR19 | AT-27 part (MIG-04(A), Class A); TM-01 (AT-01/AT-02) | — (group) | Harness owner |
| W0-PR7 | G1 | Additive runId in HarnessRunState and harness events | W0-PR0 | AT-06 part (G1) | — (group) | Harness owner |
| W0-PR8 | G1 | Self-reported evidence labeled; strict opt-in; observedToolCalls provider | W0-PR0 | AT-01, AT-02 (G1 exit (a); FRD §15 Wave does not list W0-PR8) | — (group) | Harness owner (hotspot review: Chat owner) |
| W0-PR9 | G1 | Persona shadowing (F-EVO-01), then activation check (F-EVO-10) | W0-PR0 | AT-04 minimum (G1) | 1.5–2 / 0.5–0.5 | Harness owner (W0 Owner/role; FRD §15 AT-04: Evolution owner) |
| W0-PR10 | G1 | Hook read path trio: temporary excluded, ingress scan, secret redaction | W0-PR0 | AT-14 part; AT-19 part | — (group) | Memory owner |
| W0-PR11 | G1 | Workspace→personal leak in 4 places + fleet policy gate + sentinel AT-13 | W0-PR0 | AT-13 (G1, new writes) | — (group) | Memory owner (hotspot review: Chat owner) |
| W0-PR12 | G1 | Boundary quick de-gates: Approvals nav ×3, /api/cost, audit-export → FREE | W0-PR0 | AT-12 part; AT-18 part; AT-27 part (config tripwire) | — (group) | Boundary owner |
| W0-PR13 | G1 | Pricing table (DEFAULT_MODEL_PRICING, models.json) with provenance comment | W0-PR0 | — (G1 exit (e); TM-17) | — (group) | Release owner |
| W0-PR14 | G1 | Cron getDue RED repro (ISO vs datetime(now)) + possible fix | W0-PR0 | AT-23 part (G1) | 0.5–0.5 / 0.5–0.5 | Durable owner |
| W0-PR15 | G1 | Candidate/receipts doc drift + outdated comments (without DQ-02 sentences) | W0-PR0 | — (G1 exit (g); TM-19) | — (group) | Release owner |
| W0-PR16 | G1 | Stop/disconnect copy in ChatApp | W0-PR0 | FRD-05.8 Stop-copy test (no AT ID; ADR-03-T6) | — (group) | Chat owner (Disposition A9) |
| W0-PR17 | G1 | Telemetry truthfulness: one switch for the local store and PostHog + disclosure | W0-PR0 | AT-30 part (telemetry) | 0.5–1 / 0.5–0.5 | Release owner |
| W0-PR18 | G1 | MIG-05(i): reclassification of legacy leak frames (metadata.recallExcluded) | W0-PR0, W0-PR11, W0-PR19 | AT-13 (G1, legacy); AT-27 part (MIG-05(i), Class A) | 1–1.5 / 0.5–1 | Memory owner (MDQ-07) |
| W0-PR19 | G1 | Golden legacy-datadir fixture generator (at revision 2af0904d) | W0-PR0 | prerequisite for AT-27 (FRD §15) | 1–1.5 / 0.5–1 | UNKNOWN |

### W1 (15 tickets; G2)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W1-PR1 | G2 | A8 spike (Reflow ADAPT vs minimal BUILD) + review ADR-02/ADR-03 | W0-PR7, W0-PR8 | AT-07, AT-08, AT-09 (spike criterion: BvB T1–T3 + T9 on the prototype) | 5–6 / 3–4 | Durable owner |
| W1-PR2 | G2 | Run store + schemaVersion + retention/GC + migration of agent-runs.json v1 (MIG-01) | W1-PR1, W1-PR13, W1-PR15 | AT-27 part (run store) | 8–10 / 4–5 | Durable owner |
| W1-PR3 | G2 | Canonical/legacy status map in shared | W1-PR2 | FRD-05.8 status-map test (no AT ID) | 2–3 / 1–2 | Durable owner |
| W1-PR4 | G2 | Server-driven phase executor (DurableRun before side-effect, Checkpoint.spent) | W1-PR3 | AT-03 (G2 authoritative); AT-07 | 9–12 / 4–6 | Durable owner (hotspot agent-loop.ts: Harness owner) |
| W1-PR5 | G2 | Lease/fencing for the run + explicit resume API | W1-PR4 | AT-07; AT-09 | — (group) | Durable owner |
| W1-PR6 | G2 | ToolAction/ToolAttempt: stable actionId, unknown_outcome; pending_actions transitional status | W1-PR4 | AT-08; AT-12 part (BLOCKED_APPROVAL durable); AT-27 part (MIG-02) | — (group) | Durable owner (Boundary owner: held actions) |
| W1-PR7 | G2 | ProofReceipt + execution_traces CHECK rebuild (gate_passed) + MIG-08 traces section | W1-PR4, W1-PR13, W1-PR14, W1-PR15 | AT-01 part (G2 exit (c)); AT-27 part (MIG-04(B)) | 4.5–7 / 2.5–2.5 | Harness owner (schema.ts: Memory owner, drift baseline) |
| W1-PR8 | G2 | Per-run event bus + GET /api/runs/:id/stream?sinceSeq= | W1-PR7 | AT-06 part (per-run bus); AT-10 | — (group) | Durable owner (Chat owner: chat.ts) |
| W1-PR9 | G2 | Detach ≠ cancel in chat (ADR-03) | W1-PR8 | AT-10 | — (group) | Chat owner |
| W1-PR10 | G2 | Loop execution state from Awareness into the run store | W1-PR9 | AT-23 part; AT-27 part (MIG-02) | — (group) | Durable owner |
| W1-PR11 | G2 | Routines: occurrence identity, misfire policy, timezone, DST + MIG-08 section | W1-PR9, W0-PR14, W1-PR14 | AT-23 (G2 authoritative); AT-27 part (MIG-02; MIG-08) | — (group) | Durable owner |
| W1-PR12 | G2 | Crash-injection e2e (dev Node) | W1-PR5, W1-PR6, W1-PR9 | AT-07; AT-08; AT-09 | 1–1 / 0.5–0.5 | Durable owner |
| W1-PR13 | G2 | MIG-09 versioned migration ledger + runner | W0-PR7, W0-PR8 | AT-27 part (MIG-09) | 3–4 / 1.5–2 | Durable owner |
| W1-PR14 | G2 | MIG-08 export/erasure for the run store (ExecutionErasure) | W1-PR2 | AT-27 part (MIG-08) | 2–3 / 1–1.5 | Durable owner |
| W1-PR15 | G2 | Revocation ledger revocations.json + Class B restore test | W0-PR7, W0-PR8, W0-PR19 | AT-27 part (Class B restore) | 1.5–2.5 / 1–1.5 | Durable owner (FRD §15 AT-27) |

### W2 (10 tickets; G2)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W2-PR1 | G2 | ContextPackage type + ContextBuilder facade over recallMemory + ablation flag | W0-PR10, W0-PR11 | AT-06 part; AT-13 part | 3–4 / 1.5–2 | Memory owner |
| W2-PR2 | G2 | Pinning the package for a run + invalidation (erasure/revoke/scope) | W2-PR1, W1-PR4 | AT-15 (G2 authoritative); AT-13 part; AT-27 part (MIG-05 context_refs) | 3–3.5 / 1.5–2 | Memory owner |
| W2-PR3 | G2 | Trust/taint labels in the recall block render line | W2-PR2 | AT-28 part (LoCoMo same-judge without regression) | 1.5–2 / 0.5–1 | Memory owner |
| W2-PR4 | G2 | Token budget per model tier at package level | W2-PR3 | — (TM-08; per-PR UNKNOWN) | 2–3 / 0.5–1 | Memory owner |
| W2-PR5 | G2 | Fleet/harness/subagent on the same ContextPackage contract | W2-PR3 | — (TM-08; per-PR UNKNOWN) | 3–4 / 1.5–2 | Memory owner; Harness owner (injection into phases) |
| W2-PR6 | G2 | External handoff for all paths (WAGGLE_CONTEXT_INJECTED, SessionStart, cli-bridge) | W2-PR3 | AT-16 | 3–4 / 1.5–2 | External-executor owner |
| W2-PR7 | G2 | Idempotent run-end extraction (runId, outputHash) | W2-PR3 | AT-14 (G2 authoritative) | 1–1.5 / 0.5–0.5 | Memory owner |
| W2-PR8 | G2 | External toolsUsed labeled tool-reported | W2-PR3 | AT-16 | 0.5–0.5 / 0.5–0.5 | External-executor owner |
| W2-PR9 | G2 | RAWDETAIL FRD record + decision on bundling the reranker | W2-PR3 | AT-14 (G2 authoritative) | 0.5–1 / 0.5–0.5 | Memory owner |
| W2-PR10 | G2 | memory_compact test in the desktop sidecar | W2-PR3 | — (TM-08; per-PR UNKNOWN) | 0.5–0.5 / 0.5–0.5 | Memory owner |

### W3 (8 tickets; G2)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W3-PR1 | G2 | Review ADR-01 + ExecutionMode table in FRD | — | — | 1–2 / 0.5–0.5 | Harness owner |
| W3-PR2 | G2 | Router conversation/work server-side | W3-PR1, W1-PR4, W2-PR1 | — (TM-01/TM-20; per-PR UNKNOWN) | 4–5 / 2–3 | Harness owner (hotspot: Chat owner) |
| W3-PR3 | G2 | Recipe registry + versions + HarnessRecipeVersion minimum | W3-PR2 | — (TM-20; per-PR UNKNOWN) | 4–5 / 2–3 | Harness owner |
| W3-PR4 | G2 | Research-brief recipe + deterministic validators | W3-PR3 | AT-21; AT-22 | 6–8 / 3–4 | Harness owner |
| W3-PR5 | G2 | Document-production recipe (DOCX/MD) + validators | W3-PR3 | AT-21; AT-22 | 6–8 / 3–4 | Harness owner |
| W3-PR6 | G2 | Three verification levels in ProofReceipt; CONDITIONAL policy per recipe | W3-PR4, W3-PR5, W1-PR7 | AT-01 part (G2) | 4–5 / 1.5–2 | Harness owner |
| W3-PR7 | G2 | Production benchmark adapter (benchmark mode) + manifest + run reset | W3-PR6 | AT-28 (G2 authoritative, with B2-PR1/PR2) | 4–5 / 1.5–2 | Benchmark owner |
| W3-PR8 | G2 | Cherry-pick of additive files from feature/harness-sota-bench (without fe7804bf) | — | — (TM-17) | 1–2 / 0.5–0.5 | Benchmark owner (with Harness owner review) |

### W3e (13 tickets; G2/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W3e-PR1 | G2 | Active-version pointer + rollback route + rolled_back (CHECK rebuild) + MIG-08 | W0-PR9, W1-PR13, W1-PR14, W1-PR15 | AT-04 (G2 authoritative); AT-27 part (MIG-03) | 6–7.5 / 3–4 | Evolution owner |
| W3e-PR2 | G2 | EvolutionLLM adapter over the provider router + composePersonaPrompt | W0-PR9 | AT-26 part (KVARK without cloud judge) | 2–3 / 1–1.5 | Evolution owner |
| W3e-PR3 | G2 | Paired scoring (anchor) + drift watch of the active version | W0-PR9 | AT-29 | 2.5–4 / 1.5–2 | Evolution owner |
| W3e-PR4 | G2 | builder.build() with secret scan/split/holdout instead of sourceFromTraces | W0-PR9 | AT-29; AT-13/AT-19 (eval set) | 2–3 / 1.5–2 | Evolution owner (Memory owner: eval dataset scope) |
| W3e-PR5 | G2 | Local evaluator default + consent/cap/abort for cloud judge | W0-PR9 | — (TM-04; per-PR UNKNOWN) | 2–3 / 1–1.5 | Evolution owner |
| W3e-PR6 | G2 | EvolveSchema wire-or-drop | W0-PR9 | AT-05 | 1–1 / 0.5–0.5 | Evolution owner |
| W3e-PR7 | G2 | Learning channel: markCorrected, persona signal, wire-vs-remove AgentLearning | W0-PR9 | — (TM-03; per-PR UNKNOWN) | 1.5–2 / 1–1.5 | Evolution owner |
| W3e-PR8 | G2 | Route test: complete() called with the candidate before the judge | W0-PR9 | AT-05 | 0.5–1 / 0.5–0.5 | Evolution owner |
| W3e-PR9a | G3 | Registry of approved variants + immutable invariants | W3-PR3, W3e-PR1, W3e-PR3, W3e-PR4 | prerequisite for AT-29 (recipe part) | 2–3 / 1–1.5 | Evolution owner; Harness owner (recipe registry) |
| W3e-PR9b | G3 | Candidate generator (mutations within the registry) | W3e-PR9a | prerequisite for AT-29 (recipe part) | 2–4 / 1–2 | Evolution owner |
| W3e-PR9c | G3 | Paired scoring (reuse W3e-PR3/PR4) | W3e-PR9b | prerequisite for AT-29 (recipe part) | 1–2 / 0.5–1 | Evolution owner |
| W3e-PR9d | G3 | Explicit promotion + rollback (reuse W3e-PR1) | W3e-PR9c | prerequisite for AT-29 (recipe part) | 1–2 / 0.5–1 | Evolution owner |
| W3e-PR9e | G3 | Tests (AT-29 for recipe target, invariants) | W3e-PR9d | AT-29 (G3 recipe part, only with ODB-02 = yes) | 2–3 / 1–1.5 | Evolution owner |

### W4 (8 tickets; G2/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W4-PR1 | G2 | PermissionEnvelope type + computation from existing sources | — | — (TM-10; per-PR UNKNOWN) | 3.5–4 / 1–1.5 | Capability owner |
| W4-PR2 | G2 | Resolver facade + filterCandidates(envelope) + read-only persona test | W4-PR1 | AT-17 | 3–4 / 1.5–1.5 | Capability owner |
| W4-PR3 | G2 | Typed CapabilityRequest + api_key card + durable proposal store (MIG-06/08) | W4-PR2, W1-PR13, W1-PR14, W1-PR15 | AT-11; AT-27 part | 4.5–5 / 1.5–2 | Capability owner |
| W4-PR4 | G2 | BLOCKED_CAPABILITY resume on SetupCompleted | W4-PR3, W1-PR4 | AT-11 | 4–6 / 2–3 | Capability owner (hotspot: Chat owner) |
| W4-PR5 | G2 | OAuth state bound to the request + persistence + PKCE + callback (MIG-06/08) | W4-PR4, W1-PR13, W1-PR14, W1-PR15 | AT-11 part; AT-27 part | 3.5–4.5 / 1.5–2 | Security owner (wave: Capability owner) |
| W4-PR6 | G2 | Negative grant / decline expiry (MIG-06/08) + revoke RED→GREEN (AT-12) | W4-PR4, W1-PR13, W1-PR14, W1-PR15 | AT-12 (G2 authoritative); AT-19 (G2 authoritative, with W4-PR7); AT-27 part | 1.5–2 / 0.5–1 | Security owner (wave: Capability owner) |
| W4-PR7 | G2 | THREAT_MODEL.md addendum + test "no vault value in the prompt/trace" | W4-PR4 | AT-19 (G2 authoritative, with W4-PR6) | 1–1.5 / 0.5–1 | Security owner |
| W4-PR8 | G3 | ActionDescriptor as the source of truth for side-effect endpoints | — | AT-18 (G3 authoritative) | 4–6 / 2–2.5 | Capability owner |

### W5 (7 tickets; G2/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W5-PR1 | G2 | step payload + StepContentBlock + bridge per-run bus → step | W1-PR8 | AT-10 (UI part) | 3.5–5 / 2–2.5 | UX owner; Chat owner (SSE step) |
| W5-PR2 | G2 | View-work drawer + run-status-labels.ts | W5-PR1 | FRD-05.8 View-work test (no AT ID) | 3.5–5 / 2–2.5 | UX owner |
| W5-PR3 | G3 | Routines Home block + blocked status | W1-PR11 | AT-23 part (G3) | — (group) | UX owner; Durable owner |
| W5-PR4 | G3 | Nav/⌘K gating + one advanced switch (A23) + copy lint test | — | AT-17 indirectly (W5 exit) | — (group) | UX owner |
| W5-PR5 | G3 | First-task artifact + persona copy "role/modes" | — | — | — (group) | UX owner |
| W5-PR6 | G3 | Playwright/visual baseline update | W5-PR4 | — | — (group) | UX owner |
| W5-PR7 | G3 | axe for ?forceWizard=true routes + centralized strings | — | a11y test (W5 exit; no AT ID) | — (group) | UX owner |

### W6 (8 tickets; G2/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W6-PR1 | G2 | Readiness truthfulness (useHasWorkingModel + ModelGate) | — | AT-20 | 3–4 / 1.5–2 | Model/Runtime owner |
| W6-PR2 | G2 | reason in ModelProbeResult + UI messages | — | AT-20 | 1.5–2 / 0.5–1 | Model/Runtime owner |
| W6-PR3 | G2 | Tool/structured-output round-trip probe for the work profile | — | AT-20 | 2–3 / 1–1.5 | Model/Runtime owner |
| W6-PR4 | G2 | Pull stream:true + NDJSON relay + resume | — | AT-20 | 3–4 / 1.5–2 | Model/Runtime owner |
| W6-PR6 | G2 | Ollama repin + catalog + /api/show arch check + certify fields | — | AT-30 part (managed model receipt) | 3–4.5 / 1.5–2 | Model/Runtime owner |
| W6-PR7 | G2 | Hardware ladder measurements (≥3 profiles) | — | AT-20 (real Windows hardware, FRD §15) | 3.5–4.5 / 2–2.5 | Model/Runtime owner |
| W6-PR5 | G3 | WMI detection + test with fake output | W6-PR1, W6-PR2, W6-PR3 | — (TM-13; per FRD §15, AT-20 is closed by W6-PR1..PR4) | — (group) | Model/Runtime owner |
| W6-PR8 | G3 | Wizard reorder + OpenAI-compatible presets | W6-PR1, W6-PR2, W6-PR3 | — (TM-14) | — (group) | UX owner; Model/Runtime owner |

### W7 (7 tickets; G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W7-PR1 | G3 | Channel profile table + evidence card per channel (doc) | — | — (TM-12) | 1–1 / 0.5–0.5 | Attention owner |
| W7-PR2 | G3 | WorkItem store + erasure/export (MIG-06/08) | — | AT-15 part; AT-27 (WorkItem part, G3 authoritative); AT-13 (regression) | 5–6 / 2–2.5 | Attention owner; Memory owner (erasure) |
| W7-PR3 | G3 | Sync engine for the chosen ecosystem + cursor/delta + BYO OAuth client | W7-PR2 | AT-19 part; AT-11 (regression) | 6–8 / 2.5–3.5 | Attention owner |
| W7-PR4 | G3 | Classifier + labeled set tooling + eval script | W7-PR3 | AT-24 | 5–7 / 2–3 | Attention owner |
| W7-PR5 | G3 | Home What-Needs-Me list + actions | — | — (TM-12) | 3–4 / 1–1.5 | Attention owner (home.ts: UX owner) |
| W7-PR6 | G3 | Convert-to-work → DurableRun with taint | W7-PR4, W2-PR3 | AT-19 part (G3) | 2–3 / 1–1.5 | Attention owner; Security owner |
| W7-PR7 | G3 | Second source (calendar of the same ecosystem) | W7-PR3 | — (TM-12) | 2–3 / 1–1.5 | Attention owner |

### W8 (6 tickets; G1/G2/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| W8-PR1 | G1 | Receipt entry points (router npm, canary pwsh) + receipt manifest | W0-PR0 | prerequisite for AT-16/AT-30 (FRD §15) | 2–2 / 1–1 | Release owner |
| W8-PR2 | G2 | Crash-injection receipt script over the packaged build | W1-PR4, W1-PR5 | AT-07 part (packaged, receipt C at F2); AT-30 | 2–3 / 1–1 | Release owner |
| W8-PR3 | G3 | IM approve token flow + pairing persistence (Telegram only) + MIG-06/08 | W1-PR14 | AT-25; AT-27 part (MIG-08 pairing) | 3–4 / 2–2.5 | Channels owner |
| W8-PR4 | G3 | Status push / routine result / forward→WorkItem (Telegram only) | W8-PR3 | AT-25 | 1.5–2.5 / 1–1.5 | Channels owner |
| W8-PR5 | G3 | Certify: notices/SBOM asserts + packaged migration step over the golden fixture | OSS-PR3 | AT-30 | 1.5–2 / 1–1.5 | Release owner |
| W8-PR6 | G3 | Release checklist doc + review ADR-10 | — | AT-30 (egress part, TM-24) | 1–1.5 / 1–1 | Release owner |

### WB (6 tickets; G1/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| WB-PR1 | G1 | Tier/KVARK inventory table in FRD + review ADR-08/ADR-09 | W0-PR0 | — | — (group) | Boundary owner |
| WB-PR2 | G1 | KVARK RED test as it.fails (ADR-08-T3), without registration and gate | WB-PR1 | prerequisite for AT-26 (FRD §15) | — (group) | Boundary owner |
| WB-PR3 | G3 | KVARK registration + gate (vault config and health.ok) + connect/validate/disconnect/revoke | WB-PR2 | AT-26 (G3 authoritative) | 4–5 / 2–2.5 | Boundary owner (local/index.ts: Server owner) |
| WB-PR4 | G3 | Dead tier code + reader dedup + session cap/embeddingProviders + GET /api/admin/overview | — | AT-27 part (MIG-07.2) | 3–4 / 1.5–2 | Boundary owner |
| WB-PR5 | G3 | LEGACY_TIER_MAP v2 + config.json v2 + checkout.ts 400 + www/in-app copy + PRO leftovers | — | AT-27 (tier part, G3 authoritative) | 2–3 / 1–1.5 | Boundary owner |
| WB-PR6 | G3 | Team-sync fate (isolate+freeze / legacy compat) | — | AT-26 (TM-15: the personal mind is not copied) | 2–3 / 1–1.5 | Boundary owner |

### OSS (5 tickets; G1/G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| OSS-PR1 | G1 | Provenance inventory (FR-OSS-04) + Build-vs-Borrow record of W1/W3 candidates | W0-PR0 | — (TM-18) | — (group) | OSS/License owner |
| OSS-PR2 | G1 | License consistency lint in report mode (without changing LICENSE/NOTICE) | W0-PR0 | — (TM-18) | — (group) | OSS/License owner |
| OSS-PR3 | G3 | Notices generator + native LICENSE + EXTRACTION.md correction in 3 NOTICE files | — | AT-30 part (notices) | 3–4 / 1.5–1.5 | OSS/License owner |
| OSS-PR4 | G3 | License CI (blocking) + npm audit decision | — | — (TM-18) | 2–2.5 / 1–1 | OSS/License owner |
| OSS-PR5 | G3 | Drift baseline review (maintainer) | — | — (TM-18) | 1–1.5 / 0.5–0.5 | OSS/License owner; Memory owner (maintainer) |

### B1 (1 ticket; G2)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| B1-PR1 | G2 | Evidence card + draft protocol (documentation) | — | — (TM-17) | 2–3 / 1–2 | Benchmark owner |

### B2 (7 tickets; G2)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| B2-PR0a | G2 | Harbor 0.20.0 + three images on the bench machine | B1-PR1 | — (TM-17) | 0.5–1 / 0.5–0.5 | Benchmark owner |
| B2-PR0b | G2 | Ruler: reference agent + deviation analysis (B2-EXIT-0) | B2-PR0a | — (TM-17) | 0.5–1.5 / 0.5–1 | Benchmark owner |
| B2-PR0c | G2 | Split generation + hashes | B2-PR0b | — (TM-17) | 0.5–0.5 / 0.5–0.5 | Benchmark owner |
| B2-PR1 | G2 | Harbor agent shim → production sidecar | W3-PR7 | AT-28 | 2.5–4 / 1–1.5 | Benchmark owner |
| B2-PR2a | G2 | Rework fixes after the B2 dev run (errors, timeout calibration) | B2-PR1, B2-PR3 | AT-28 | 1–3 / 0.5–1.5 | Benchmark owner |
| B2-PR2 | G2 | Development run report (after the dev run, the re-run and the validation selection) | B2-PR2a | AT-28 | 2–3 / 1–2 | Benchmark owner |
| B2-PR3 | G2 | Target model configuration/tuning before A/B | B2-PR0c, W6-PR6 | — (TM-17) | 5–8 / 3–5 | Benchmark owner |

### B3 (2 tickets; G3)

| Ticket | G | Title | Depends on | AT | Estimate cl. / AI | Owner |
|---|---|---|---|---|---|---|
| B3-PR1 | G3 | Pre-registration document (hash) before looking at test answers | B2-PR2 | AT-28; AT-29 | 3–5 / 1.5–2.5 | Benchmark owner |
| B3-PR2 | G3 | Results + recount + message (DIR-23) | B3-PR1 | AT-28; AT-29 | 9–15 / 4.5–7.5 | Benchmark owner |

Total: **123 tickets** — G1 25, G2 65, G3 33 (of which W3e-PR9a..e = 5, only with ODB-02).

<!-- GEN:OVERVIEW:END -->

---

## 2. Dependency order

The source is Delivery §3 (graph and critical path). This is a summary for sprint planning. Per-ticket edges are in the "Depends on" column and in the CSV column `depends_on`.

### 2.1 G1 (PROPOSAL — planner direction; ratification RAT-01)

```
W0-PR0 (CI za integration/**)
  ├─► Harness lane:  W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9          (redosled u lane-u, NIJE ivica: kritična putanja „serijski 3–4 rd”, Delivery §3)
  │                   W0-PR1 + W0-PR8 ─► W0-PR2, W0-PR3          (vidljivost F-HARN-02/03, W0 „Rizik”)
  │                   W0-PR4, W0-PR5                              (nezavisni u lane-u)
  │                   W0-PR7 + W0-PR19 ─► W0-PR6                  (resolver + golden fixture)
  ├─► Memory lane:   W0-PR10 ; W0-PR11 ─► W0-PR18                 (W0-PR11 pre PR18, Delivery §3)
  │                   W0-PR19 (golden fixture, generisan na 2af0904d) ─► W0-PR6, W0-PR18   (Delivery §3)
  │                   [„W0-PR19 pre W0-PR11” samo ako osnivač tako reši otvoren LOW nalaz]
  ├─► Boundary+Release lane: W0-PR12, W0-PR13, W0-PR15, W0-PR16, W0-PR17
  │                   WB-PR1 ─► WB-PR2 (samo it.fails) ; OSS-PR1, OSS-PR2 ; W8-PR1
  ├─► Durable-probe lane: W0-PR14
  └─► ID reconcile doc-only PR (bez PR ID-a) ─► F1 freeze (I + P + R; ODB-01) ─► [RAT-01] zatvaranje G1
```

Note: Delivery §3 says "W0-PR19 before PR6/PR18", not before W0-PR11. An open LOW finding requires either an exception for the `w0/*` worktree on `2af0904d` or W0-PR19 before W0-PR11 ([WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md)). The diagram therefore draws only the edges from Delivery §3 (`─►`; they are the same in CSV `depends_on`); W0-PR10 does not use the fixture. The exception is the "Harness lane" row with the arrow `→`: W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9 is the work order in one worktree with one owner (Delivery §3 critical path "W0 (PR1/PR7/PR8/PR9 serially 3–4 wd)"), not an edge. The Delivery §3 graph releases W0-PR1..PR19 in parallel after W0-PR0 ("in parallel in 4 worktrees") and gives no edges PR1→PR7→PR8→PR9, so `depends_on` does not contain them; the order is in CSV `notes` for W0-PR1, W0-PR7, W0-PR8 and W0-PR9 and in §6 (the tracker keeps it as a work order, not as a blocker). The order "W0-PR19 before W0-PR11" depends on the founder's answer to the LOW finding ([00-START-HERE.md](00-START-HERE.en.md) §6 question (b); here §6 "Before day 1", pt.3) and is not an edge in the CSV.

### 2.2 G2 (PROPOSAL; ratifications RAT-02..RAT-07 in Delivery §6.1)

- **Critical path (Delivery §3):** W1-PR1 → [RAT-02] W1-PR2 → W1-PR3 → W1-PR4 → W3-PR2 (after W3-PR1 + [RAT-03], and W2-PR1 + [RAT-04]) → W3-PR3 → W3-PR4 ‖ W3-PR5 → W3-PR6 (+ W1-PR7) → W3-PR7 → B2-PR1 → B2 dev run (wall-clock, not a ticket) → B2-PR2a → re-run (not a ticket) → validation run (not a ticket) → B2-PR2 → **F2** (R + P + A + C + internal I; ODB-01). Chain total: **36.5–57 wd**.
- **Before the W1-PR2 apply:** W1-PR13 (MIG-09 runner) and W1-PR15 (revocation ledger) run in separate worktrees in parallel with W1-PR1.
- **W1-PR14** (MIG-08 `ExecutionErasure`) is a merge prerequisite for W1-PR7, W1-PR11, W3e-PR1, W4-PR3, W4-PR5, W4-PR6 (and, in G3, W8-PR3).
- **Must be merged before the B2 dev run:** W2-PR3/PR4/PR6 and all W3e PRs that change persona resolution or the prompt path. At the latest before F2, otherwise the P receipt is repeated.
- **Latest decision dates:** DQ-04 ≈ 16 wd from the start of G2 (LoCoMo gate W2-PR3, B2-PR0), DQ-05 ≈ 20 wd (W6-PR6 → B2-PR3). After that, every day shifts G2 1:1.
- **In parallel, off the critical path:** W2-PR1..PR10, W1-PR5..PR15, W3e-PR1..PR8, W4-PR1..PR7, W5-PR1/PR2, W6-PR1..PR4/PR6/PR7, W8-PR2, B1-PR1, B2-PR0a/b/c, B2-PR3, W3-PR8.
- **Serial G1 → G2 (PROPOSAL, conservative):** the W1 chain starts after the end of G1, including F1. A permitted overlap of the W1-PR1 spike and W1-PR13/PR15 with the tail of G1 would shorten the bounds by ≤ 1 week, but the plan does not apply it (Delivery §4.3).

### 2.3 G3 (PROPOSAL; depends on DQ-02/03/06/07/08 before the start of G3, RAT-08, RAT-09, ODB-02)

- W7-PR1..PR7 (DQ-06; serial part W7-PR2 → PR3 → PR4 → PR6), W8-PR3 → W8-PR4 (DQ-07), W4-PR8, W5-PR3..PR7 (W5-PR3 after W1-PR11), W6-PR5/PR8 (after W6-PR1..PR3).
- OSS-PR3/PR4/PR5 (DQ-02) → W8-PR5; [RAT-08] WB-PR3, WB-PR4; WB-PR5/PR6 (DQ-03; WB-PR6 also after RAT-08); [RAT-09] W8-PR6; W3e-PR9a..e only with ODB-02 = yes.
- B3-PR1 (after F2) → B3 execution (10–20 wd wall-clock, PROPOSAL placeholder, UNKNOWN) → B3-PR2 → F2→F3 benchmark carry-forward review → **F3** → founder-gated merge `integration/waggle-next` → `main` → GO decision (DQ-01). The tag is not pushed from this plan (DP-0.11, DP-0.12).

---

## 3. G1 tickets — full cards

Each card applies only after the founder's approval of the plan. Common conditions for **all** G1 tickets (not repeated in the cards):
- Branch `w0/<tema>` (or `wb/`, `oss/`, `w8/`) from `integration/waggle-next`, in its own worktree (DP-0.05). Never `main`.
- Env isolation per the checklist: `WAGGLE_DATA_DIR=<scratch>/data-<agent>`, `WAGGLE_PORT≠3333`, `PORT≠3100`, `WAGGLE_DESKTOP_PORT_FALLBACK` unset, `HIVE_MIND_DATA_DIR` the same isolated dir, `WAGGLE_SIGNAL_EMIT=0`, no Stripe/channel/Clerk/PostHog keys (DP-0.08, DP-0.10).
- Node `22.23.2`. Gates from DP-0.06 green locally before review and on the integration branch after merge.
- Tickets that touch `apps/web/**` (per the cards: W0-PR9 `EvolutionTab.tsx`, W0-PR12, W0-PR16, W0-PR17) run, in addition to the four gates, both `npm run typecheck:web` and `npm run test -w apps/web`. Root `vitest.config.ts:43` excludes `apps/**`, so `npm run test` does not run web tests such as `posthog.test.ts`, `OnboardingWizard.test.tsx`, `p1a-routes.test.ts`, `command-catalog.test.ts` and `EvolutionTab.test.tsx` (all exist on `2af0904d`; CONFIRMED AT REVISION). Without these two commands, "gates green" does not prove RED→GREEN for the web part. Other supplementary checks per touched surface: [02-WORKING-AGREEMENT.md](02-WORKING-AGREEMENT.en.md) §6.3.
- G1 exit (m): all DP-0.06 gates green on the integration branch. G1 exit (l) and F1 come after all G1 tickets (§6).
- Estimate: the card gives the number from Delivery §4.1.1. Where the plan gives only a group total, the group is given.

### W0-PR0 — CI filters for `integration/**`

- **Goal:** the integration branch gets CI before any other PR (DP-0.07, G1 exit (h)).
- **Scope — in:** add `integration/**` to `on.push.branches` and `on.pull_request.branches` in `ci.yml` (today `[main]`, `ci.yml:3-6`) and the same in `tauri-build-pr.yml`.
- **Scope — out:** `release.yml` is not touched. No changes to GitHub settings (rulesets, environments, variables) and no manual workflow runs (DP-0.11). No `v*` tags (DP-0.12).
- **Files (exist on `2af0904d`):** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`.github/workflows/tauri-build-pr.yml`](../../.github/workflows/tauri-build-pr.yml).
- **RED first:** the plan states "—" (no unit test). Check (PROPOSAL): before the change, a PR to `integration/waggle-next` does not trigger CI; after the change, it triggers `ci.yml` and `tauri-build-pr.yml`.
- **Acceptance:** G1 exit (h). `git diff` contains only branch filters in two files. `release.yml` is byte-identical to the baseline.
- **Evidence:** F-REL-10 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md). CONFIRMED AT REVISION (`ci.yml:3-6` re-read 29.09.2026).
- **Risks:** more CI runs consume the Actions budget (context DP-0.12). The Windows lane `tauri-build-pr.yml` takes longer.
- **Rollback:** revert the PR. No data.
- **Estimate:** group W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1 (classic / AI). Open LOW finding: the group is underestimated by ≈0.5–1 classic and ≤0.5 AI day, with no change in weeks.
- **Owner:** UNKNOWN. W0 "Owner/role" does not name F-REL-10. Proposal: Release owner. **Receipts:** none (CI configuration).

### W0-PR1 — Verify default fail-closed

- **Goal:** the verify phase is never skipped silently (F-HARN-01; FRD-05.1; DIR-03/07).
- **Scope — in:** `shouldSkipVerify` (`workflow-harness.ts:474-482`) skips verify only when `WAGGLE_AUTO_VERIFY==='0'` or an explicit run option exists. `catch → false`. New event `harness:phase:skipped`. `getRunSummary` (`:424`) shows "Completed (verify skipped)". Unification with the dead `FEATURE_FLAGS.VERIFIER_AUTO_RUN` (`feature-flags.ts:26`, 0 consumers).
- **Scope — out:** durable executor (W1-PR4), `ProofReceipt` (W1-PR7), strict mode as the default (ADR-01, W3).
- **Files:** [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:313`, `:424`, `:474-482`), [`packages/agent/src/feature-flags.ts`](../../packages/agent/src/feature-flags.ts) (`:26`). Hotspot: `workflow-harness.ts` → Harness owner (DP-0.14).
- **RED first:** a run without `WAGGLE_AUTO_VERIFY` reaches the verify phase. File: [`packages/agent/tests/workflow-tools-harness.test.ts`](../../packages/agent/tests/workflow-tools-harness.test.ts). **Rewrite** `:135-179`, which relies on auto-skip, in the same PR.
- **Acceptance:** AT-01 (G1 part, together with W0-PR2). G1 exit (a): `getRunSummary` never shows "Completed" with a skipped verify. Env `WAGGLE_AUTO_VERIFY` is not set in the test.
- **Evidence:** F-HARN-01 (HOLDS) — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md). CONFIRMED AT REVISION (`shouldSkipVerify` returns `true` without the env; re-read 29.09.2026).
- **Risks:** verify now runs in every harness run, so latency and token cost increase. F-HARN-02/03 become visible only after PR1 and PR8, so the order is PR1 → PR8 → PR2/PR3 (W0 "Risk").
- **Rollback:** revert the PR. No data.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (integration branch SHA).

### W0-PR2 — `VERDICT` value in the gate

- **Goal:** `VERDICT: FAIL` fails the phase, and CONDITIONAL is not PASS (F-HARN-02; FRD-05.5).
- **Scope — in:** `passed = verdict === 'PASS'`. `GateResult.verdict`. CONDITIONAL defaults to `passed:false` + `reason` + an optional per-phase `conditionalPolicy`. The verdict is written to the checkpoint and to `HarnessPhaseCompleteEvent`.
- **Scope — out:** CONDITIONAL policy per recipe (W3-PR6), thresholds (DQ-09).
- **Files:** [`packages/agent/src/builtin-harnesses.ts`](../../packages/agent/src/builtin-harnesses.ts) (`:43-51`, `:125-128`).
- **RED first:** FAIL → the phase fails; CONDITIONAL → not PASS; missing VERDICT → not PASS. Fixture from FRD §15 AT-01: `research-verify` with FAIL/CONDITIONAL/no-VERDICT; repro `repro-harness.mjs` 02a–d. File: the plan does not name it, and a `builtin-harnesses` test does not exist on `2af0904d`. PROPOSAL: a new `packages/agent/tests/builtin-harnesses-verdict.test.ts` or an extension of `workflow-tools-harness.test.ts`.
- **Acceptance:** AT-01 (G1 part). The three RED cases pass after GREEN. The existing PASS path stays green.
- **Evidence:** F-HARN-02 — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md); repro [repro-harness.mjs](../plans/v1.2-evidence/phaseA/repro-harness.mjs).
- **Risks:** harnesses that "pass" today with CONDITIONAL start failing. That is the desired behavior, but it changes the outcome of the chat turn.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Depends on:** W0-PR0, W0-PR1, W0-PR8 (visibility order). **Receipts:** I (SHA).

### W0-PR3 — Exit code is not lost

- **Goal:** a non-zero exit is not success, and `bash echo` is not a passed test (F-HARN-03; FRD-05.2).
- **Scope — in:** `system-tools.ts:684-691` always returns `Exit code: N` (or a structured `{ok:false, exitCode}`). `tool-executor.ts` sets `succeeded=false` on a non-zero exit. `PhaseOutput.toolCalls[].ok/exitCode`. The bash gate accepts exact names + a test/typecheck pattern + `ok!==false`.
- **Scope — out:** observed journal as the sole source (W1), strict mode (W3).
- **Files:** [`packages/agent/src/system-tools.ts`](../../packages/agent/src/system-tools.ts) (`:681-691`), [`packages/agent/src/tool-executor.ts`](../../packages/agent/src/tool-executor.ts) (`:285-298`), [`packages/agent/src/builtin-harnesses.ts`](../../packages/agent/src/builtin-harnesses.ts) (`:13-24`, `:181`), [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:76`).
- **RED first:** `echo hi` is not a test; `Exit code: 1` → fail. Repro `repro-harness.mjs` 03a–c, 08a. File: [`packages/agent/tests/system-tools.test.ts`](../../packages/agent/tests/system-tools.test.ts) (`:365-370` stays green because it uses `toContain('err')`). PROPOSAL for the gate part: a new test alongside the existing `tool-executor-*.test.ts`.
- **Acceptance:** AT-02 (G1; the only wave, together with W0-PR4). A non-zero exit yields `succeeded=false` and a gate failure.
- **Evidence:** F-HARN-03 — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md) (path correction: `packages/agent/src/`, not `server/src/local/`).
- **Risks:** tools that today return empty output with a non-zero exit change the turn outcome.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Depends on:** W0-PR0, W0-PR1, W0-PR8. **Receipts:** I (SHA).

### W0-PR4 — `run_harness` leaves `VERIFICATION_TOOL_EXACT`

- **Goal:** a `run_harness` call is not, by itself, verification evidence (F-HARN-04).
- **Scope — in:** remove `'run_harness'` from `VERIFICATION_TOOL_EXACT`. The gate receives `{name, succeeded}`; agent-loop already has `r.succeeded`.
- **Scope — out:** D3 disclose on budget stop (W0-PR5).
- **Files:** [`packages/agent/src/verification-gate.ts`](../../packages/agent/src/verification-gate.ts) (`:25-39`, `:220-239`), [`packages/agent/src/agent-loop.ts`](../../packages/agent/src/agent-loop.ts) (`:1826`). Hotspot `agent-loop.ts` → Harness owner.
- **RED first:** regression test in [`packages/agent/tests/verification-gate.test.ts`](../../packages/agent/tests/verification-gate.test.ts): a turn with only `run_harness` (or a failed tool) does not pass the verification gate. No existing test uses `run_harness` in `toolsUsed`.
- **Acceptance:** AT-02 (G1). After GREEN, D3 fires on a `run_harness`-only turn, which is desired per DIR-07.
- **Evidence:** F-HARN-04 (origin `9fce1d2f`, no decision) — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md).
- **Risks:** more D3 disclosure messages in chat.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).

### W0-PR5 — Budget stop: disclose-only + `budgetStop` meta

- **Goal:** a budget stop does not produce success (F-HARN-05; FRD-05.6; DIR-08).
- **Scope — in:** D3 in "disclose-only" mode before `budgetStopResponse` (`agent-loop.ts:895`). `budgetStop:true` in the `AgentResponse` meta.
- **Scope — out:** `Checkpoint.spent` that survives a restart. That is W1-PR4, authoritative for AT-03 (G2).
- **Files:** [`packages/agent/src/agent-loop.ts`](../../packages/agent/src/agent-loop.ts) (`:1507-1550`, `:895-920`), [`packages/agent/src/loop-gates.ts`](../../packages/agent/src/loop-gates.ts) (`:697`, `:902-935`). Hotspot `agent-loop.ts`/`loop-gates.ts` → Harness owner.
- **RED first:** [`packages/agent/tests/verification-gate-loop.test.ts`](../../packages/agent/tests/verification-gate-loop.test.ts): small `maxTokenBudget` + content "All tests pass" → the response carries the disclose suffix and `budgetStop:true`, with no verification claim. The `agent-loop-budget.test.ts` exact asserts do not match `SUCCESS_ASSERTION` and do not break.
- **Acceptance:** AT-03 part (G1: disclose-only + `budgetStop` meta).
- **Evidence:** F-HARN-05 — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md).
- **Risks:** hot path `agent-loop.ts`. Two PRs on the same hotspot are not merged on the same day without an integration test (DP-0.14).
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** R (budget path), I (SHA).

### W0-PR6 — Bridge truthfulness without schema + MIG-04(A)

- **Goal:** the harness trace no longer claims `verified` without evidence and does not enter the eval set positives (F-HARN-06; MIG-04(A)).
- **Scope — in:** after `harness:phase:complete` the trace gets `outcome:'pending'` + the `gate_passed` tag in `tags[]` (as in MIG-04(A) and ADR-01-P2). Never `'success'`, because `success` is in the default `positiveOutcomes`. `ok: tc.ok ?? null`, without a fabricated `durationMs:0`, passing through `output.durationMs`. The `eval-dataset` filter excludes the `gate_passed` tag from positives. `local/index.ts:612` passes the resolver once events get a `runId` (W0-PR7). Migration step MIG-04(A): historical rows `task_shape LIKE 'harness:%' AND outcome='verified'` get the "unqualified" tag, without deletion.
- **Scope — out:** the `gate_passed` enum in `execution_traces`. Because of the CHECK constraint that is a SQLite table rebuild, so it goes into W1-PR7.
- **Files:** [`packages/agent/src/harness-trace-bridge.ts`](../../packages/agent/src/harness-trace-bridge.ts) (`:91`, `:125-148`), [`packages/agent/src/eval-dataset.ts`](../../packages/agent/src/eval-dataset.ts) (`:208`), [`packages/agent/src/trace-recorder.ts`](../../packages/agent/src/trace-recorder.ts) (`:281`, `:288`, hardcoded `ok:true`), [`packages/server/src/local/index.ts`](../../packages/server/src/local/index.ts) (`:612`, `new HarnessTraceBridge` — re-read). Hotspot `local/index.ts` → Server owner.
- **RED first:** the trace after `harness:phase:complete` has `outcome:'pending'` + the `gate_passed` tag and is not among the positives of `EvalDatasetBuilder.build()`. Files: [`packages/agent/tests/harness-trace-bridge.test.ts`](../../packages/agent/tests/harness-trace-bridge.test.ts) (**rewrite** `:82-92`, `:327`, which pin `'verified'`), [`packages/agent/tests/eval-dataset.test.ts`](../../packages/agent/tests/eval-dataset.test.ts). Migration: Class A test over the W0-PR19 golden fixture. The second run is a no-op.
- **Acceptance:** AT-27 part (MIG-04(A), Class A). Migration per DP-0.09: a copy of the isolated dataDir, snapshot + `manifest.json` (MIG-00.3) with an export of the existing `erased_subjects` ledger, a dry-run report, undo by removing the tag per sentinel. `schemaVersion`/downgrade = "n/a — no schema".
- **Evidence:** F-HARN-06 (WEAKENED at the minimalChange level) — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [harness.refute.md](../plans/v1.2-evidence/phaseA/harness.refute.en.md); [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md) MIG-04.
- **Risks:** the evolution eval set loses the "positives" from harness traces. This is intentional and changes the W3e input. Restoring `personal.mind` from a snapshot in G1 is not a tested path; it is performed only with explicit founder approval.
- **Rollback:** revert the code. The tags are additive and old code ignores them (Class A).
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner (MDQ-06 = engineering decision of the Harness/Evolution owner). **Depends on:** W0-PR0, W0-PR7, W0-PR19. **Receipts:** I (SHA).

### W0-PR7 — Additive `runId` in harness events

- **Goal:** two runs are distinguishable in events and traces (F-HARN-07, F-DUR-08).
- **Scope — in:** `runId` added additively to `HarnessRunState`. `createHarnessRun(harness, {runId, workspaceId?, sessionId?})`. `runId` in all three payloads. `run_harness` passes `run_id`. `WorkflowToolsConfig` gets session and workspace.
- **Scope — out:** per-run bus and context isolation (W1-PR8, W2-PR1). These close AT-06 in G2.
- **Files:** [`packages/agent/src/workflow-harness.ts`](../../packages/agent/src/workflow-harness.ts) (`:132-135`, `:169-207`, `:213`), [`packages/agent/src/workflow-tools.ts`](../../packages/agent/src/workflow-tools.ts) (`:39-51`, `:364-375`). Hotspot → Harness owner.
- **RED first:** two runs of the same harness (`document-draft`) → a different `runId` in all three payloads (repro 07a–b). File: `workflow-tools-harness.test.ts` (PROPOSAL). `harness-trace-bridge.test.ts:146-156` uses `toContain` and does not break.
- **Acceptance:** AT-06 part (G1).
- **Evidence:** F-HARN-07, F-DUR-08 (HOLDS; PARTIAL/UNWIRED) — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md).
- **Risks:** low (additive field).
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner. **Receipts:** I (SHA).

### W0-PR8 — Self-reported evidence labeled

- **Goal:** the gate distinguishes evidence the server observed from evidence the model reported (F-HARN-08; FRD-05.3).
- **Scope — in:** `PhaseOutput.toolCalls` gets `selfReported:true`. Strict mode (for now an opt-in flag) rejects self-reported evidence. `WorkflowToolsConfig.observedToolCalls(sinceMarker)` is a provider that the server populates from `onToolResult` (`chat-agent-run.ts:214-225`).
- **Scope — out:** strict as the default mode (ADR-01, W3); observed journal in the run store (W1).
- **Files:** [`packages/agent/src/workflow-tools.ts`](../../packages/agent/src/workflow-tools.ts) (`:330-358`, `:412-422`), [`packages/server/src/local/routes/chat-agent-run.ts`](../../packages/server/src/local/routes/chat-agent-run.ts). Hotspot `chat-agent-run.ts` → Chat owner.
- **RED first (strict):** fabricated `tool_calls` → the gate fails. File: `workflow-tools-harness.test.ts`; the transitional approach does not break `:82-106`.
- **Acceptance:** AT-01 and AT-02 through G1 exit (a), which requires F-HARN-08 RED→GREEN. The FRD §15 "Wave" column does not list W0-PR8.
- **Evidence:** F-HARN-08 — [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md).
- **Risks:** touches the hot path `chat-agent-run.ts`.
- **Rollback:** revert the PR. The flag is opt-in.
- **Estimate:** group W0-PR1..PR8 = 4.5–6 / 2–3.
- **Owner:** Harness owner (hotspot review: Chat owner). **Receipts:** I (SHA).

### W0-PR9 — Persona shadowing, then activation check

- **Goal:** a deployed override actually enters the next prompt, and the UI does not claim an activation that does not exist (F-EVO-01, F-EVO-10; AT-04 minimum).
- **Scope — in:** `listPersonas()` as a Map by `id`, custom last (the override replaces the built-in). The same resolver in `fleet-run-executor.ts:127,590`, `agent-groups.ts:87`, `fleet.ts:354`. **Then** F-EVO-10 in the same PR: activation check before `markDeployed`; if the resolver does not return the override, the status is `written_not_active`. Remove the "score-verified" copy.
- **Scope — out:** active-version pointer, rollback route and pinned version. That is W3e-PR1, authoritative for AT-04 (G2).
- **Files:** [`packages/agent/src/personas.ts`](../../packages/agent/src/personas.ts) (`:67-70`), [`packages/server/src/local/routes/chat.ts`](../../packages/server/src/local/routes/chat.ts) (`:439-440`), [`packages/server/src/local/routes/evolution.ts`](../../packages/server/src/local/routes/evolution.ts) (`:51-82`), [`apps/web/src/components/os/apps/memory/EvolutionTab.tsx`](../../apps/web/src/components/os/apps/memory/EvolutionTab.tsx) (`:191-249`, `:759-771`, `:883`), [`packages/server/src/local/fleet-run-executor.ts`](../../packages/server/src/local/fleet-run-executor.ts), [`packages/server/src/local/routes/agent-groups.ts`](../../packages/server/src/local/routes/agent-groups.ts), [`packages/server/src/local/routes/fleet.ts`](../../packages/server/src/local/routes/fleet.ts). Hotspot `chat.ts` → Chat owner.
- **RED first:** through `resolvePersona`/`buildSystemPrompt`, **not** through `listPersonas().find(id && includes)`. Fixture from FRD §15: deploy a `coder` override + `POST /api/chat`. Repro [repro-shadow.mjs](../plans/v1.2-evidence/phaseA/repro-shadow.mjs). Files: [`packages/server/tests/evolution-routes.test.ts`](../../packages/server/tests/evolution-routes.test.ts) (**rewrite** `:169-188`, which pins `deployed`), [`packages/agent/tests/personas.test.ts`](../../packages/agent/tests/personas.test.ts). `personas.test.ts:43-47` and `personas-routes.test.ts:121-140` do not break.
- **Acceptance:** AT-04 minimum (G1): the next real prompt contains the override; without the override the status is `written_not_active`. G1 exit (b).
- **Evidence:** F-EVO-01, F-EVO-10 (HOLDS) — [evolution.md](../plans/v1.2-evidence/phaseA/evolution.en.md), [evolution.refute.md](../plans/v1.2-evidence/phaseA/evolution.refute.en.md).
- **Risks:** changes persona resolution in 4 places, so the P receipt is mandatory at F1. The order F-EVO-01 → F-EVO-10 is mandatory within the same PR.
- **Rollback:** revert the PR. Override files are not changed.
- **Estimate:** 1.5–2 / 0.5–0.5 (classic / AI).
- **Owner:** Harness owner per W0 "Owner/role". FRD §15 lists the Evolution owner for AT-04; the tech lead confirms. **Receipts:** P, I (SHA).

### W0-PR10 — Hook read path trio in `hive-mind-core`

- **Goal:** hook recall does not inject `temporary` frames, scans ingress per hit and redacts secrets (F-HM-03, F-HM-04, F-HM-13).
- **Scope — in:** `recallHookFrames` with `WHERE importance NOT IN ('deprecated','temporary')`. `evaluateExternalMemoryIngress` per hit (fail-open = no injection). Per-hit secret redaction: move `redactSecrets` from `@waggle/agent eval-dataset.ts:133` into `hive-mind-core` or apply it in `hook-runtime.ts`.
- **Scope — out:** RAWDETAIL and dedup (W2-PR7/PR9), external handoff (W2-PR6).
- **Files:** [`packages/hive-mind-core/src/hook-runtime.ts`](../../packages/hive-mind-core/src/hook-runtime.ts) (`:227-258`), [`packages/hive-mind-core/src/memory-ingress-guard.ts`](../../packages/hive-mind-core/src/memory-ingress-guard.ts), [`packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts`](../../packages/hive-mind-hooks-claude-code/src/hooks/session-start.ts) (`:46-60`), [`packages/hive-mind-hooks-core/src/handlers-core.ts`](../../packages/hive-mind-hooks-core/src/handlers-core.ts) (`:77-90`), [`packages/agent/src/eval-dataset.ts`](../../packages/agent/src/eval-dataset.ts) (`:133`). Hotspot `hive-mind-core/src/**` → Memory owner + an entry for the `scripts/oss-drift-baseline.json` review (hook-runtime is `only-canonical; product-curation`, no mirror port).
- **RED first:** a `temporary` hook frame is not in hook recall; a hit containing a secret is redacted; a hit that the ingress guard rejects is not injected. Files: [`packages/hive-mind-core/tests/hook-runtime.test.ts`](../../packages/hive-mind-core/tests/hook-runtime.test.ts) (`:126-137` does not pin inclusion, safe), [`packages/hive-mind-core/tests/memory-ingress-guard.test.ts`](../../packages/hive-mind-core/tests/memory-ingress-guard.test.ts). `session-start.test.ts` and `handlers-core.test.ts` may pin the exact string — TO VERIFY during implementation.
- **Acceptance:** AT-14 part (G1: `temporary` excluded from hook recall), AT-19 part (G1: hook read scan and redaction). G1 exit (c).
- **Evidence:** F-HM-03 (PARTIAL), F-HM-04, F-HM-13 (CONFIRMED) — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.en.md).
- **Risks:** ADR-05 O4 is not yet ratified (RAT-04). The PR goes ahead of ratification as a PROPOSAL; if ratification changes O4, the PR is reverted on the integration branch (Delivery §6.1 RAT-04). A change in `hive-mind-core` carries the OSS drift obligation (CLAUDE.md §7.5).
- **Rollback:** revert the PR. No data.
- **Estimate:** group W0-PR10+PR11 = 2–3 / 1–1.5.
- **Owner:** Memory owner. **Receipts:** I (SHA). The A receipt is not run in G1; the hook path enters the A canaries at F2.

### W0-PR11 — Workspace → personal leak in 4 places + fleet policy gate

- **Goal:** content from Workspace A does not end up in the personal mind or in the Workspace B recall (F-HM-05; AT-13; D-12).
- **Scope — in:** 4 writers write a content-free pointer (`Run/Workspace/Status`, `importance:'temporary'`) instead of `Summary`. Fleet: **redefine the policy gate** `fleet-run-executor.ts:101-106` (today `personal` is mandatory, and workspace-only is UNSUPPORTED) and the default `memoryScopes`. Sentinel test AT-13.
- **Scope — out:** legacy frames that the writers have already written (W0-PR18); extending the sentinel to parallel runs (W2-PR1/PR2).
- **Files:** [`packages/server/src/local/routes/external-tool-runs.ts`](../../packages/server/src/local/routes/external-tool-runs.ts) (`:964-977`), [`packages/server/src/local/chat-collaboration.ts`](../../packages/server/src/local/chat-collaboration.ts) (`:802-814`; the path is `local/`, not `local/routes/`), [`packages/server/src/local/fleet-run-executor.ts`](../../packages/server/src/local/fleet-run-executor.ts) (`:101-106`, `:729`, `:924-936`), [`packages/server/src/local/routes/agent-groups.ts`](../../packages/server/src/local/routes/agent-groups.ts) (`:719-729`). Hotspot `chat-collaboration.ts` → Chat owner.
- **RED first:** a sentinel string in the Workspace A run summary is not in the personal recall or in the Workspace B recall. File: the plan does not name it. PROPOSAL: a new `packages/server/tests/local/workspace-sentinel-isolation.test.ts`. **Must be rewritten:** [`agent-groups.test.ts`](../../packages/server/tests/local/agent-groups.test.ts) `:362`, [`external-tool-runs.test.ts`](../../packages/server/tests/local/external-tool-runs.test.ts) `:259`, [`fleet-isolation.test.ts`](../../packages/server/tests/local/fleet-isolation.test.ts) `:203`, `:496-525` (`:519-522` survives if the label stays).
- **Acceptance:** AT-13 (G1 authoritative for new writes, together with W0-PR18). G1 exit (c).
- **Evidence:** F-HM-05 (WEAKENED at the minimalChange level: policy gate + ≥5 tests) — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md), [hivemind.refute.md](../plans/v1.2-evidence/phaseA/hivemind.refute.en.md).
- **Risks:** the only W0 PR with a design decision: a workspace-only saved-agent becomes supported. ADR-05 O3 is not yet ratified (RAT-04), so the same revert rule applies as for W0-PR10. P receipt at F1.
- **Rollback:** revert the PR. The new pointer frames remain (`temporary`), with no loss of user data.
- **Estimate:** group W0-PR10+PR11 = 2–3 / 1–1.5.
- **Owner:** Memory owner (hotspot review: Chat owner). **Receipts:** P, I (SHA).

### W0-PR12 — Boundary quick de-gates

- **Goal:** a Solo user has Approvals, cost and audit-export without a tier gate (F-TK-02/03/04, F-CAP-07; D-01 individual control).
- **Scope — in:** Approvals in 3 nav places (`dock-tiers.ts:82`, `AppShell.tsx:727-728`, `command-catalog.ts:89`). `cost.ts:210,272` → FREE. `settings.ts:1192` audit-export → FREE. Rows in `tier-enforcement-matrix.test.ts` → `minTier:'FREE'` (tripwire pattern `:43-49`).
- **Scope — out:** the `config.json` schema (does not change), `parseTier`/`LEGACY_TIER_MAP` (remain read-compatible), Stripe, www pricing, other tier gates (WB-PR4/PR5, G3). The server `/api/approval/*` is not tier-gated today (F-TK-02).
- **Files:** [`apps/web/src/lib/dock-tiers.ts`](../../apps/web/src/lib/dock-tiers.ts) (`:82`, re-read: `minBillingTier: 'TEAMS'`), [`apps/web/src/components/os/AppShell.tsx`](../../apps/web/src/components/os/AppShell.tsx) (`:727-728`), [`apps/web/src/lib/command-catalog.ts`](../../apps/web/src/lib/command-catalog.ts) (`:89`), [`packages/server/src/local/routes/cost.ts`](../../packages/server/src/local/routes/cost.ts) (`:210`, `:272`, re-read: `requireTier('TEAMS')`), [`packages/server/src/local/routes/settings.ts`](../../packages/server/src/local/routes/settings.ts) (`:1192`, re-read), [`packages/server/tests/tier-enforcement-matrix.test.ts`](../../packages/server/tests/tier-enforcement-matrix.test.ts).
- **RED first:** the tripwire rows in `tier-enforcement-matrix.test.ts` expect `minTier:'FREE'` and fail on the baseline. `GET /api/cost/by-workspace`, `GET /api/costs` and audit-export respond to a FREE user. Web: Approvals is visible in the dock and ⌘K. **Must be rewritten in the same PR (DP-0.15):** [`apps/web/src/test/p1a-routes.test.ts`](../../apps/web/src/test/p1a-routes.test.ts) `:232-239` (`:235` requires that FREE does not see Approvals and fails as soon as `dock-tiers.ts:82` is de-gated; the `governance` assertions `:236`, `:238` remain); [`packages/server/tests/tier-enforcement-matrix.test.ts`](../../packages/server/tests/tier-enforcement-matrix.test.ts) rows `:53` (`/api/cost/by-workspace`) and `:56` (`/api/admin/audit-export`) → `minTier:'FREE'`, and the tests `:131-180` (TRIAL expiry `:131-144` and `:155-165`, 403 response shape `:169-179`: `TIER_INSUFFICIENT`, `upgradeUrl`, "requires the TEAMS tier") use `/api/cost/by-workspace` as the TEAMS canary and are redirected to an endpoint that stays TEAMS after W0-PR12 (e.g. `POST /api/cloud-sync/toggle` with `{enabled:true}` or `POST /api/team/connect`; `GET /api/admin/overview` is a removal candidate in WB-PR4 — PRD-13-04, Delivery §2 WB — so it is a weaker choice). [`apps/web/src/test/p7-a6-approval-gating.test.tsx`](../../apps/web/src/test/p7-a6-approval-gating.test.tsx) does not pin the tier gate (it only checks `ApprovalModal` with `riskLevel:'critical'` and `canAlwaysAllow(approvalClass)`) and does not change. [`apps/web/src/lib/command-catalog.test.ts`](../../apps/web/src/lib/command-catalog.test.ts) does not mention Approvals or `minBillingRank`. The E2E `tests/e2e/waggle-complete.spec.ts:192-214,614-643,690-701` accepts both 403 and 200, so it does not break. — CONFIRMED AT REVISION (read-only, `git show 2af0904d:<fajl>`, 29.09.2026).
- **Acceptance:** AT-12 part and AT-18 part (G1: Approvals available to the Solo user), AT-27 config part (G1 exit (j): no change to the `config.json` schema, tripwire updated in the same PR; MIG-07.1). G1 exit (d).
- **Evidence:** F-TK-02, F-TK-03, F-TK-04 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md); F-CAP-07 — [capability.md](../plans/v1.2-evidence/phaseA/capability.en.md).
- **Risks:** low. Open LOW finding: the W0 exit test list does not list the AT-27 part, although G1 exit (j) requires it.
- **Rollback:** revert the PR. No writes to config.
- **Estimate:** group W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Boundary owner. **Receipts:** I (SHA; routes and UI).

### W0-PR13 — Pricing table with a provenance comment

- **Goal:** `ModelSpendBudget` does not reserve 3× because of stale prices (F-REL-06; G1 exit (e)).
- **Scope — in:** 4 rows of `DEFAULT_MODEL_PRICING` (`:28-30` Opus 4.6/4.7/4.8 → 5/25; `:32` Sonnet 5 → 2/10), fallback `:66` Opus → 5/25, Haiku 3.5 `:39-40` → 0.80/4 + a retired label, comment `:24-27` with URL and date. The Opus rows in `benchmarks/harness/config/models.json`.
- **Scope — out:** **do not** cherry-pick `fe7804bf` (conflict with W3-PR8). No change to the budget logic.
- **Files:** [`packages/agent/src/cost-tracker.ts`](../../packages/agent/src/cost-tracker.ts) (`:24-68`; re-read: Opus 4.6–4.8 = 0.015/0.075 per 1K), [`benchmarks/harness/config/models.json`](../../benchmarks/harness/config/models.json) (`:88-89`).
- **RED first:** [`packages/agent/tests/cost-tracker.test.ts`](../../packages/agent/tests/cost-tracker.test.ts): **rewrite** `:54-57` to the new prices; a test for the fallback Opus and Haiku 3.5.
- **Acceptance:** the prices in code, test and `models.json` are aligned, with the source URL and date in the comment. The target prices (5/25, 2/10, Haiku 3.5 → 0.80/4, retired) are an AUDIT FINDING — TO VERIFY (live 27.09.2026). **Re-verify them on the official page at merge** (PRD-14-09, FRD-13.4).
- **Evidence:** F-REL-06 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md); [external.md](../plans/v1.2-evidence/phaseA/external.en.md) §6, §8.
- **Risks:** the prices may change before merge.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Release owner. **Receipts:** R (budget), I (SHA).

### W0-PR14 — Cron `getDue` RED repro

- **Goal:** confirm or refute the hypothesis that `getDue()` never returns a cron job, and fix it if needed (F-DUR-10; AT-23 part).
- **Scope — in:** RED repro `store.create({cronExpr:'* * * * *'})` → after >60 s `getDue()`. Hypothesis: the result is 0, because `computeNextRun` writes ISO with `T`, while `getDue` compares against `datetime('now')` (space, BINARY collation). **Only if confirmed:** normalize the write or comparison format; `sweepInterruptedRuns` advances `next_run_at` or requires `rerunAfterInterrupt`; `acquireRunLease` becomes a conditional INSERT (fencing).
- **Scope — out:** occurrence identity, misfire/DST policy, timezone field (W1-PR11); Home Routines block (W5-PR3).
- **Files:** [`packages/core/src/cron-store.ts`](../../packages/core/src/cron-store.ts) (`:203-206`, `:367-382`, `:442-447`), [`packages/server/src/local/cron.ts`](../../packages/server/src/local/cron.ts) (`:245-314`, `:366-389`). Hotspot → Durable owner.
- **RED first:** fixture from FRD §15 AT-23: fake clock + a real `CronStore`. File: the plan does not name it. PROPOSAL: [`packages/core/tests/cron-store.test.ts`](../../packages/core/tests/cron-store.test.ts). `cron-scheduler-hardening.test.ts:227-250` does not assert `next_run_at` and does not break. No existing test exercises a real `create() → getDue()`.
- **Acceptance:** AT-23 part (G1, format finding). Report in the PR description: hypothesis confirmed (with a fix) or refuted (test only). G1 exit (f).
- **Evidence:** F-DUR-10 — AUDIT FINDING — TO VERIFY (SQL probe executed, `CronStore` not) — [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.en.md).
- **Risks:** if the hypothesis is confirmed, routines are broken in production today, so the fix changes when routines fire.
- **Rollback:** revert the PR. `next_run_at` values written in the new format: UNKNOWN until the fix is designed.
- **Estimate:** 0.5–0.5 / 0.5–0.5.
- **Owner:** Durable owner. **Receipts:** I (SHA).

### W0-PR15 — Candidate and receipts doc drift

- **Goal:** documents do not claim a candidate and receipts state that the revision does not support (F-REL-01; G1 exit (g)).
- **Scope — in:** `docs/production-readiness/09-LAUNCH_RECOMMENDATION.md` (§Frozen candidate: runtime `e4bf403e`, tree `5a42a0b9`; `b07a6173` = PR test-merge of the same tree; PR #83 **merged** `44baa77d`), `CLAUDE.md:89`, `README.md:19-21`, the TD-CHAT-46 line-anchor in `docs/TECH-DEBT.md:65` (the status cell is already CLOSED; anchor only), the stale reranker comment `orchestrator.ts:106-109`.
- **Scope — out (DQ-02):** the visibility and license sentences `CLAUDE.md:84`, `AGENTS.md:68` and `README.md:110,118` are not changed. Only a neutral note "visibility: TO VERIFY, DQ-02" is allowed. The item "`CLAUDE.md` §10 PA default OFF" is not PR work.
- **Files:** [`docs/production-readiness/09-LAUNCH_RECOMMENDATION.md`](../production-readiness/09-LAUNCH_RECOMMENDATION.md), [`CLAUDE.md`](../../CLAUDE.md), [`README.md`](../../README.md), [`docs/TECH-DEBT.md`](../TECH-DEBT.md), [`packages/agent/src/orchestrator.ts`](../../packages/agent/src/orchestrator.ts) (comment only). Hotspot `orchestrator.ts` → Memory owner.
- **RED first:** the plan lists "—". Check (PROPOSAL): `git diff` does not touch `CLAUDE.md:84`, `AGENTS.md:68`, `README.md:110,118`; the cited SHAs exist (`git cat-file -e`).
- **Acceptance:** G1 exit (g). No sentence claims that a receipt from `e4bf403e`/`b07a6173`/`c4e6a515` covers `2af0904d` (F-REL-02).
- **Evidence:** F-REL-01 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md); F-DUR-14 (WEAKENED) — [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md); F-HM-01 — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md).
- **Risks:** accidental change to the sentences reserved for DQ-02.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Release owner. **Receipts:** I (SHA, code comment only).

### W0-PR16 — Stop/disconnect copy in chat

- **Goal:** the user knows that closing the tab or losing the network interrupts the work and its sub-tasks (F-DUR-06; ADR-03-T6).
- **Scope — in:** extend the "Stop generating" copy (`ChatApp.tsx:2428-2432`, and `:2030`).
- **Scope — out:** changing the R3-008 behavior (close → abort) before W1; detach ≠ cancel is W1-PR9.
- **Files:** [`apps/web/src/components/os/apps/ChatApp.tsx`](../../apps/web/src/components/os/apps/ChatApp.tsx) (`:2030`, `:2428-2432`).
- **RED first:** the plan lists "—". The named test is the FRD-05.8 Stop-copy test (no AT ID, Disposition OD-10). File: a `ChatApp` test does not exist at `2af0904d`. PROPOSAL: a new test in `apps/web/src/test/` that looks for the new sentence in the Stop control.
- **Acceptance:** FRD-05.8 Stop-copy test (ADR-03-T6). The copy does not promise background continuation, because that does not exist until W1-PR9.
- **Evidence:** F-DUR-06 (WEAKENED: the copy exists, but does not say what is lost) — [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md), [durable.refute.md](../plans/v1.2-evidence/phaseA/durable.refute.en.md); Disposition A9.
- **Risks:** visual/Playwright snapshots that contain the old text.
- **Rollback:** revert the PR.
- **Estimate:** group W0-PR0+PR12+PR13+PR15+PR16 = 1–1.5 / 0.5–1.
- **Owner:** Chat owner (Disposition A9: Chat owner, Durable owner). W0 "Owner/role" does not name F-DUR-06. **Receipts:** I (SHA, UI).

### W0-PR17 — Telemetry truthfulness

- **Goal:** a single Settings toggle covers both the local telemetry store and PostHog, and the disclosure comes before the first capture (ADR-10 K3/O4; PRD-02-12; FRD-12.11; TM-25).
- **Scope — in:** variant (a) `optOutPostHog`/`optInPostHog` from the same handler as `adapter.toggleTelemetry`, or (b) PostHog with `opt_out_capturing_by_default: true` until the user turns it on. Onboarding disclosure (what is sent and to whom) before the first `onboarding_complete` capture. Release checklist item "`VITE_POSTHOG_KEY` baked into the candidate?".
- **Scope — out:** the decision whether `VITE_POSTHOG_KEY` is baked into the public build (ADR-10 O4 (c), RAT-09 before F3).
- **Files:** [`apps/web/src/lib/posthog.ts`](../../apps/web/src/lib/posthog.ts) (`:39`, `:42`, `:49-60`, `:72`, `:84`, `:114-127`, `:133-166`), [`apps/web/src/components/os/apps/SettingsApp.tsx`](../../apps/web/src/components/os/apps/SettingsApp.tsx) (`:722-731`), [`apps/web/src/app-entry.tsx`](../../apps/web/src/app-entry.tsx) (`:19-22`), [`apps/web/src/components/os/overlays/OnboardingWizard.tsx`](../../apps/web/src/components/os/overlays/OnboardingWizard.tsx) (`:463`).
- **RED first:** [`apps/web/src/lib/posthog.test.ts`](../../apps/web/src/lib/posthog.test.ts): toggle OFF → `localStorage['waggle:telemetry-opt-out']==='true'` and `posthog.capture` is not called on `onboarding_complete`; ON → both systems. [`OnboardingWizard.test.tsx`](../../apps/web/src/components/os/overlays/OnboardingWizard.test.tsx): the `captureOnboardingComplete` mock (`:13`, `:31`) stays; add an assertion for the disclosure.
- **Acceptance:** AT-30 part (telemetry; ADR-10-T2). G1 exit (i).
- **Evidence:** ADR-10-K3 — AUDIT FINDING — TO VERIFY (the writer's own read-only check outside phase-A) — [ADR-10](../decisions/2026-09-27-ADR-10-release-privacy-profiles.en.md). Whether the key is baked into the candidate depends on `apps/web/.env.local` on the build host: UNKNOWN.
- **Risks:** dev/test environments and internal pilot builds must have `VITE_POSTHOG_KEY` unset (DP-0.10). Before the F1 certify, a grep of the build `dist` confirms that the key is not baked in, and the result goes into the receipt manifest.
- **Rollback:** revert the PR.
- **Estimate:** 0.5–1 / 0.5–0.5.
- **Owner:** Release owner (ADR-10-K3 PostHog toggle). **Receipts:** I (SHA, UI).

### W0-PR18 — MIG-05(i): reclassification of legacy leak frames

- **Goal:** exclude from recall, without deletion, the frames that the 4 writers from W0-PR11 have already written into the personal mind (MIG-05(i); AT-13 over legacy data).
- **Scope — in:** the `metadata.recallExcluded` marker with `importance='normal'` (MDQ-07 (i)). Honoring the marker in the recall paths: `orchestrator.ts:728-737`, `context-loader.ts:77-89`, and the MCP/hook path together with W0-PR10. Dry-run on a copy, snapshot + `manifest.json` (MIG-00.3), an idempotent meta-sentinel following the `erased_subjects_backfilled` pattern (MIG-00.5). Merge after W0-PR11.
- **Scope — out:** **do not** use `importance='temporary'`. `FrameStore.compact()` (`frames.ts:427-433`), which the nightly cron `memory_compact` (`30 3 * * *`) runs, deletes `temporary` frames older than 30 days. That would be deletion of user data. No change to the `hive-mind-core` schema; the MIG-09 runner arrives only in W1-PR13.
- **Files:** the exact files are UNKNOWN until design (plan: a one-time migration step in `packages/server/src/local/` over `personal.mind`). Candidates that exist at `2af0904d`: [`packages/agent/src/orchestrator.ts`](../../packages/agent/src/orchestrator.ts) (`:728-737`), [`packages/agent/src/context-loader.ts`](../../packages/agent/src/context-loader.ts) (`:77-89`), [`packages/hive-mind-core/src/hook-runtime.ts`](../../packages/hive-mind-core/src/hook-runtime.ts), [`packages/hive-mind-core/src/mind/frames.ts`](../../packages/hive-mind-core/src/mind/frames.ts) (read-only, for the `compact()` behavior). Hotspot `orchestrator.ts` and `hive-mind-core` → Memory owner (+ drift review).
- **RED first:** (1) a legacy fixture built with today's code (MIG-00.7): the sentinel from Workspace A is in the personal recall before the migration, and is not after it; (2) a fixture with `created_at` older than 30 d → migration → `compact()` → the frames still exist; (3) the second pass is a no-op; (4) Class A rollback test over the W0-PR19 golden fixture. File: UNKNOWN until design (the PR names it).
- **Acceptance:** AT-13 (G1, legacy part), AT-27 part (MIG-05(i), Class A). G1 exit (c). DP-0.09: `manifest.json` exports the existing `erased_subjects` ledger; undo = removing the marker per sentinel, without removing the marker from a frame whose subject has been erased in the meantime.
- **Evidence:** [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md) MIG-05 (Critic note on `compact()`), MDQ-07; F-HM-05 — [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md).
- **Risks:** extending the recall filter may push the estimate toward the upper bound (UNKNOWN until design). Restoring `personal.mind` from a snapshot in G1 is not a tested path (`personal.mind` also carries `pending_actions`, so a restore could revert `executed` to `approved`); it is performed only with explicit founder approval. RAT-04 (ADR-05) has not yet been given; the PR goes in as a PROPOSAL and is undone by removing the marker if ratification changes O3.
- **Rollback:** Class A. Reverting the code leaves a marker that old code ignores, so the leak becomes visible in recall again. That is an isolation regression, not data loss, and it is stated in the receipt.
- **Estimate:** 1–1.5 / 0.5–1.
- **Owner:** Memory owner (MDQ-07 = engineering decision of the Memory owner). **Depends on:** W0-PR0, W0-PR11, W0-PR19. **Receipts:** P (recall content), I (SHA).

### W0-PR19 — Golden legacy-datadir fixture generator

- **Goal:** a frozen legacy state against which all migrations are tested (MIG §6 pt.2, MIG-00.7). A test prerequisite, with no finding.
- **Scope — in:** the generator builds the legacy state **with the code of revision `2af0904d`** (`AgentRunRegistry`, `CronStore`, `deployPersonaOverride`, `HarnessTraceBridge` + `TraceRecorder`, `VaultStore`, `ApprovalGrantStore`, `PairingStore`) in an isolated `WAGGLE_DATA_DIR` and freezes it as a golden tar + SHA-256. Merge **before** W0-PR6 and W0-PR18.
- **Scope — out:** a production change (there is none). The migrations themselves (W0-PR6, W0-PR18, G2 MIGs).
- **Files:** `tests/fixtures/legacy-datadir/` + a generator script. The exact path is UNKNOWN until design. The `tests/fixtures/` directory does not exist at `2af0904d`.
- **RED first:** determinism test: two generations yield the same SHA-256 (or a documented time normalization).
- **Acceptance:** the fixture and SHA-256 are in the repo; they are used by the W0-PR6 (MIG-04(A)) and W0-PR18 (MIG-05(i)) tests and by all G2 migrations (MIG §6 pt.6). FRD §15 tracks it as an AT-27 prerequisite.
- **Evidence:** [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md) §6 pt.2.
- **Risks — blocks the start:** the checklist allows only worktrees from `integration/waggle-next`, while the plan requires generation in a separate worktree at `2af0904d`. An open LOW finding requests explicit permission for one `w0/*` worktree at `2af0904d` (or W0-PR19 before W0-PR11). **Before starting, request a founder decision** ([WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md); [00-START-HERE.md](00-START-HERE.en.md) §6 question (b)).
- **Rollback:** delete the fixture and the generator. No data.
- **Estimate:** 1–1.5 / 0.5–1.
- **Owner:** UNKNOWN (the plan does not assign one). **Receipts:** none (no production change).

### WB-PR1 — Tier/KVARK boundary inventory + review of ADR-08 and ADR-09

- **Goal:** a fate table for every tier/KVARK component in the FRD, and a review of the existing ADR-08/ADR-09 drafts (no new ADRs).
- **Scope — in:** inventory from F-TK-18/19: 24 non-test src files with TRIAL/TEAMS/ENTERPRISE literals (+ unquoted), 21 test files, the actual FREE gates, decorative flags (0 consumers), KVARK state (`createKvarkTools` 0 production callers, `new KvarkClient` 0). Fates: KVARK adapter / extract / legacy compat / remove with a test (PROPOSAL). Review of ADR-08 (O1–O7) and ADR-09 (O1–O7), with preparation for RAT-08.
- **Scope — out:** code. Stripe (no change until DQ-03). KVARK tool registration (WB-PR3, G3).
- **Files:** FRD table ([`Waggle_FRD_v1.2_DRAFT.md`](../Waggle_FRD_v1.2_DRAFT.en.md)), [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.en.md), [ADR-09](../decisions/2026-09-27-ADR-09-secondary-worker-parity.en.md). Prerequisite: the package is untracked in the worktree `D:/Projects/waggle-v12-handoff` (branch `docs/waggle-v1.2-planning` = `2af0904d`, no commit, not on origin) — CONFIRMED AT REVISION (read-only, 29.09.2026). How the package enters `integration/waggle-next`: UNKNOWN (founder/tech lead).
- **RED first:** none (documentation).
- **Acceptance:** every component from F-TK-18/19 has a row and a fate; the ADR-08/09 review comments are recorded; no ADR is marked as approved.
- **Evidence:** F-TK-11, F-TK-18, F-TK-19 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md).
- **Risks:** low; the business part waits for DQ-03.
- **Rollback:** revert the document.
- **Estimate:** group WB-PR1/PR2 (G1) = 3–5 / 1.5–2.5.
- **Owner:** Boundary owner. **Receipts:** none.

### WB-PR2 — KVARK RED test as `it.fails`

- **Goal:** lock in the target behavior of the KVARK boundary as a RED test, without registration and without the gate (ADR-08-T3). WB-PR3 (G3) makes it GREEN.
- **Scope — in:** server + vault `kvark:connection` + fake KVARK server with health OK → the tool registry has 4 tools; without the entry or with a health failure → 0. The test is `it.fails`, so CI stays green.
- **Scope — out:** registration of `createKvarkTools`, the gate `getKvarkConfig(vault)!==null && health.ok`, connect/disconnect/revoke (all WB-PR3, G3, after RAT-08).
- **Files:** [`packages/server/tests/kvark/kvark-wiring.test.ts`](../../packages/server/tests/kvark/kvark-wiring.test.ts) (`:46-52` today only simulates the `if(kvarkConfig)` guard) or a new test file in `packages/server/tests/kvark/` (PROPOSAL). Read, not modified: [`packages/agent/src/kvark-tools.ts`](../../packages/agent/src/kvark-tools.ts), [`packages/server/src/local/index.ts`](../../packages/server/src/local/index.ts).
- **RED first:** this **is** the RED test (`it.fails`).
- **Acceptance:** the test exists, is marked `it.fails` and passes CI. It does not close any part of AT-26; FRD §15 tracks it as a G1 prerequisite. G1 does not claim "KVARK connection works" (Delivery §1).
- **Evidence:** F-TK-11 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md); [ADR-08](../decisions/2026-09-27-ADR-08-individual-tiers-kvark-boundary.en.md) T3.
- **Risks:** the fake KVARK server must listen only locally and must not touch the network (DP-0.10).
- **Rollback:** delete the test.
- **Estimate:** group WB-PR1/PR2 (G1) = 3–5 / 1.5–2.5.
- **Owner:** Boundary owner. **Depends on:** WB-PR1. **Receipts:** none.

### OSS-PR1 — Provenance inventory + Build-vs-Borrow record W1/W3

- **Goal:** an inventory of the provenance and licenses of every shipped component (FR-OSS-04) and a record of the candidates for the W1 durable engine and the W3 benchmark runner.
- **Scope — in:** FR-OSS-04 fields (repo, version, commit, hash, license, modifications, notices, owner, security review, update strategy) for Node, npm, `onnxruntime-node`, `sqlite-vec`, `better-sqlite3`, the Ollama zip + model weights, reranker/embedding models. A record of the W1/W3 candidates from `external.md` §2–3 (agent-native as a pattern reference; Omnigent Apache-2.0 Python alpha as a reference).
- **Scope — out:** changes to LICENSE/NOTICE text (prohibited before DQ-02); the notices generator (OSS-PR3).
- **Files:** new document; location UNKNOWN (PROPOSAL: `docs/plans/`). Inputs: [`scripts/bundle-native-deps.mjs`](../../scripts/bundle-native-deps.mjs) (`:113-130` copies only binaries), [WAGGLE-BUILD-VS-BORROW-v1.2.md](../plans/WAGGLE-BUILD-VS-BORROW-v1.2.en.md) §4.
- **RED first:** none (documentation).
- **Acceptance:** every component on the list has all FR-OSS-04 fields or an explicit UNKNOWN. `onnxruntime-node@1.21.0` and `sqlite-vec-windows-x64@0.1.9` are flagged as packages without a LICENSE file (text taken from upstream).
- **Evidence:** F-REL-04, F-REL-05, F-REL-07 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md); F-TK-13, F-TK-14 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md); [external.md](../plans/v1.2-evidence/phaseA/external.en.md) §2, §3.
- **Risks:** low.
- **Rollback:** revert the document.
- **Estimate:** group OSS-PR1/PR2 (G1) = 4–5 / 2–3.
- **Owner:** OSS/License owner. **Receipts:** none.

### OSS-PR2 — License consistency lint in report mode

- **Goal:** mechanically report package `license` ↔ LICENSE ↔ NOTICE conflicts, without changing any texts.
- **Scope — in:** lint in report mode (does not block CI). Known conflicts it must report: [`packages/optimizer/LICENSE`](../../packages/optimizer/LICENSE) and [`packages/weaver/LICENSE`](../../packages/weaver/LICENSE) "proprietary and confidential" alongside `"license":"MIT"`; 3 hive-mind NOTICE files ([`hive-mind-cli/NOTICE`](../../packages/hive-mind-cli/NOTICE), [`hive-mind-mcp-server/NOTICE`](../../packages/hive-mind-mcp-server/NOTICE), [`hive-mind-wiki-compiler/NOTICE`](../../packages/hive-mind-wiki-compiler/NOTICE)) with a non-existent `EXTRACTION.md`; 9 manifests without a `license` field; `hive-mind-core` Apache-2.0 + `private:true`.
- **Scope — out:** changes to any LICENSE/NOTICE text (SAFE checklist prohibition before DQ-02); fixing the `EXTRACTION.md` reference (OSS-PR3); blocking mode (after DQ-02).
- **Files:** new lint script; location UNKNOWN (PROPOSAL: `scripts/`).
- **RED first:** the lint run against the baseline reports exactly the listed known conflicts (test with an expected report; file PROPOSAL, next to the script).
- **Acceptance:** the report contains all known conflicts. The exit code in report mode does not fail CI. `git diff` contains no LICENSE/NOTICE file.
- **Evidence:** F-REL-04/05/07 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md); F-TK-13/14 — [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md).
- **Risks:** false-positive findings.
- **Rollback:** revert the PR.
- **Estimate:** group OSS-PR1/PR2 (G1) = 4–5 / 2–3.
- **Owner:** OSS/License owner. **Receipts:** none.

### W8-PR1 — Receipt entry points for R and A + receipt manifest

- **Goal:** the router and auth-canary receipts get a reproducible entry point and a manifest that pins the SHA, before F1 (G1 exit (k); F-REL-03).
- **Scope — in:** an npm script for `scripts/qualify-smart-router.ts` and a pwsh wrapper for `scripts/test-windows-official-auth-canaries.ps1` (names PROPOSAL), without changing logic. A receipt manifest that pins the integration branch SHA and records the run ID, account (no secrets), cap and actual cost.
- **Scope — out:** the crash-injection tool (W8-PR2, G2). Running the canaries on real accounts (first time at F2, with ODB-01, on a dedicated VM or disposable account). Changes to `release.yml`.
- **Files:** [`package.json`](../../package.json) (today has only `persona:seal`, `:48` — re-read), [`scripts/qualify-smart-router.ts`](../../scripts/qualify-smart-router.ts), [`scripts/test-windows-official-auth-canaries.ps1`](../../scripts/test-windows-official-auth-canaries.ps1). [`scripts/qualify-smart-router.test.ts`](../../scripts/qualify-smart-router.test.ts) exists.
- **RED first:** the plan does not specify a test. PROPOSAL: a test that verifies that the npm/pwsh entry point invokes the existing script without changing arguments and that the manifest contains the SHA; without making provider calls.
- **Acceptance:** the R receipt at F1 is run through the npm entry point. If W8-PR1 is not merged before F1, an ad hoc `tsx scripts/qualify-smart-router.ts` is used and this is recorded in the manifest (Delivery §5 F1). FRD §15: prerequisite for AT-16 and AT-30, not part of the evidence.
- **Evidence:** F-REL-03 — [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md).
- **Risks:** accidentally running the canaries with the founder's auth state. This is prohibited (DP-0.10, checklist): `HOME`/`USERPROFILE`/`HERMES_HOME` are set to a scratch profile or disposable account.
- **Rollback:** revert the PR.
- **Estimate:** 2–2 / 1–1.
- **Owner:** Release owner. **Receipts:** tooling for R and A (no logic change).

---

## 4. G2 tickets — compact cards

Full cards (goal, scope, RED test, risks, rollback) are written during sprint planning before the start of G2, from the PR table row in Delivery §2 and the AT row in FRD §15. This section holds the minimum needed to assess ordering and capacity. PRD/FRD IDs are in [backlog.csv](backlog.csv).

<!-- GEN:G2:BEGIN -->

### W1

#### W1-PR1 — A8 spike (Reflow ADAPT vs minimal BUILD) + review ADR-02/ADR-03

- **Owner:** Durable owner · **Depends on:** W0-PR7, W0-PR8 · **Gate:** RAT-02 ratifies the outcome (ADR-02 O8)
- **Scope (Delivery §2):** Time-boxed spike on a throwaway prototype of both branches in a dev Node environment; the outcome is recorded in ADR-02 O8. T4–T8/T10 are the exit of the chosen branch in W1/F2. If the time-box expires without an outcome, it goes to RAT-02 with partial results.
- **Files (from the plan, not re-verified):** long-task/checkpoint.ts; recovery.ts; agent-run-registry.ts:539-574; held-action-executor.ts (BORROW assets)
- **AT:** AT-07, AT-08, AT-09 (spike criterion: BvB T1–T3 + T9 on the prototype) · **ADR:** ADR-02 (O8); ADR-03 · **Trace:** TM-05, TM-18
- **Estimate (classic / AI):** 5–6 / 3–4 · **Receipts:** — (no runtime change)
- **Note:** F-DUR-04, F-DUR-05; W1 input contract W0-PR7/PR8; open LOW: T7 → W1-PR14 + W1-PR15

#### W1-PR2 — Run store + schemaVersion + retention/GC + migration of agent-runs.json v1 (MIG-01)

- **Owner:** Durable owner · **Depends on:** W1-PR1, W1-PR13, W1-PR15 · **Gate:** RAT-02 before merge
- **Scope (Delivery §2):** SQLite candidate store; migration with dry-run, snapshot, statuses 1:1, interrupted keeps its reason + cursor; overflow and corrupt-load tests (F-DUR-02).
- **Files (from the plan, not re-verified):** agent-run-registry.ts:29,510-537
- **AT:** AT-27 part (run store) · **ADR:** ADR-02 · **MIG:** MIG-01 · **Trace:** TM-05, TM-16
- **Estimate (classic / AI):** 8–10 / 4–5 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-01, F-DUR-02 WEAKENED; critical path; merging before RAT-02 risks a revert of 4–5 AI days

#### W1-PR3 — Canonical/legacy status map in shared

- **Owner:** Durable owner · **Depends on:** W1-PR2
- **Scope (Delivery §2):** queued→QUEUED, starting or running→RUNNING, waiting_for_approval→BLOCKED_APPROVAL, cancelling transitional, completed→COMPLETED, cancelled→CANCELLED, failed→FAILED_FINAL, interrupted legacy with a resume check, paused DEFERRED; COLLABORATION_RUN_STATUSES is not truncated.
- **Files (from the plan, not re-verified):** packages/shared/src/types.ts:398-405
- **AT:** FRD-05.8 status-map test (no AT ID) · **ADR:** ADR-02 · **Trace:** TM-05
- **Estimate (classic / AI):** 2–3 / 1–2 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-03; C12; critical path

#### W1-PR4 — Server-driven phase executor (DurableRun before the side effect, Checkpoint.spent)

- **Owner:** Durable owner (hotspot agent-loop.ts: Harness owner) · **Depends on:** W1-PR3
- **Scope (Delivery §2):** Phase = unit of recovery; HarnessRunState serialized; run_harness becomes a thin client of the same executor; behind a feature flag (work mode opt-in) until AT-07/10 pass.
- **Files (from the plan, not re-verified):** workflow-harness.ts:118-128,213-374; workflow-tools.ts:362-434
- **AT:** AT-03 (G2 authoritative); AT-07 · **ADR:** ADR-02 · **Trace:** TM-05, TM-02
- **Estimate (classic / AI):** 9–12 / 4–6 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-13, F-DUR-07; critical path; open LOW: HarnessRunState is at workflow-harness.ts:110-128

#### W1-PR5 — Lease/fencing for the run + explicit resume API

- **Owner:** Durable owner · **Depends on:** W1-PR4
- **Scope (Delivery §2):** One active executor per phase; interrupted → queued only through the resume API with checkpoint validation (not a change to ALLOWED_TRANSITIONS); BORROW the harvest M-08 resume pattern.
- **Files (from the plan, not re-verified):** agent-run-registry.ts:41,137,282,510-520
- **AT:** AT-07; AT-09 · **ADR:** ADR-02 · **Trace:** TM-05
- **Estimate (classic / AI):** — (group W1-PR5+PR6 (§4.1.1): 6–8 / 2–2.5) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-01

#### W1-PR6 — ToolAction/ToolAttempt: stable actionId, unknown_outcome; pending_actions transitional status

- **Owner:** Durable owner (Boundary owner: held actions) · **Depends on:** W1-PR4
- **Scope (Delivery §2):** Statuses planned/approved/dispatching/succeeded/failed/unknown_outcome; providerIdempotencyKey where the service supports it; BORROW the held-action pattern.
- **Files (from the plan, not re-verified):** held-action-executor.ts:154-166,233-235; cron-store.ts:88,551-556
- **AT:** AT-08; AT-12 part (BLOCKED_APPROVAL durable); AT-27 part (MIG-02) · **ADR:** ADR-02 · **MIG:** MIG-02 · **Trace:** TM-05, TM-16
- **Estimate (classic / AI):** — (group W1-PR5+PR6 (§4.1.1): 6–8 / 2–2.5) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-05; A7 → DIR-06

#### W1-PR7 — ProofReceipt + execution_traces CHECK rebuild (gate_passed) + MIG-08 traces section

- **Owner:** Harness owner (schema.ts: Memory owner, drift baseline) · **Depends on:** W1-PR4, W1-PR13, W1-PR14, W1-PR15
- **Scope (Delivery §2):** ProofReceipt + three verification levels = the only path to COMPLETED in strict; TraceOutcome gate_passed via table-rebuild; eval-dataset positives = success, verified (ProofReceipt-backed); downgrade script without deleting rows.
- **Files (from the plan, not re-verified):** hive-mind-core/src/mind/execution-traces.ts:20; schema.ts:235-253
- **AT:** AT-01 part (G2 exit (c)); AT-27 part (MIG-04(B)) · **ADR:** ADR-02 · **MIG:** MIG-04(B); MIG-08 · **Trace:** TM-05, TM-16
- **Estimate (classic / AI):** 4.5–7 / 2.5–2.5 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-HARN-06 WEAKENED; DP-0.09; CLAUDE.md §7.5 OSS drift

#### W1-PR8 — Per-run event bus + GET /api/runs/:id/stream?sinceSeq=

- **Owner:** Durable owner (Chat owner: chat.ts) · **Depends on:** W1-PR7
- **Scope (Delivery §2):** RunEvent{runId, seq, phase/attempt, type, label, status, evidenceRefs}; replay does not duplicate cards; bridge harnessEvents → per-run; HarnessTraceBridge gets a context resolver.
- **Files (from the plan, not re-verified):** routes/agent-runs.ts:20-22,73-84
- **AT:** AT-06 part (per-run bus); AT-10 · **ADR:** ADR-03 · **Trace:** TM-06
- **Estimate (classic / AI):** — (group W1-PR8+PR9 (§4.1.1): 5–7 / 2–3) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-06, F-DUR-08, A9/A11

#### W1-PR9 — Detach ≠ cancel in chat (ADR-03)

- **Owner:** Chat owner · **Depends on:** W1-PR8 · **Gate:** RAT-02 (ADR-03) before merge
- **Scope (Delivery §2):** work run: closing the socket = detach (RunEvent(detached)); cancel only via POST /api/runs/:id/control {action:cancel}; R3-008 close→abort remains for conversation; subagents request-bound vs detached durable.
- **Files (from the plan, not re-verified):** routes/chat.ts:1604-1612; agent-loop.ts:1090-1108; chat-collaboration.ts:110-128,302-308; fleet-run-executor.ts:480-515
- **AT:** AT-10 · **ADR:** ADR-03 (O1/O4) · **Trace:** TM-06
- **Estimate (classic / AI):** — (group W1-PR8+PR9 (§4.1.1): 5–7 / 2–3) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-06, F-DUR-12 WEAKENED

#### W1-PR10 — Loop execution state from Awareness into the run store

- **Owner:** Durable owner · **Depends on:** W1-PR9
- **Scope (Delivery §2):** `loop:<id>` state outside Awareness (the report frame stays); AwarenessLayer.toContext() today renders the Loop into the recall context.
- **Files (from the plan, not re-verified):** loop-executor.ts:212-230,311-322; local/index.ts:2596-2597
- **AT:** AT-23 part; AT-27 part (MIG-02) · **ADR:** ADR-07 (O7) · **MIG:** MIG-02 · **Trace:** TM-07, TM-16
- **Estimate (classic / AI):** — (group W1-PR10+PR11 (§4.1.1): 2.5–4 / 1–1.5) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-09; graph §3: after W1-PR9

#### W1-PR11 — Routines: occurrence identity, misfire policy, timezone, DST + MIG-08 section

- **Owner:** Durable owner · **Depends on:** W1-PR9, W0-PR14, W1-PR14 · **Gate:** RAT-06 before merge
- **Scope (Delivery §2):** Occurrence id in the JobExecutor signature; misfire skip/one catch-up/bounded; timezone field (engineering decision of the Durable owner, MIG-02); DST test; two processes.
- **Files (from the plan, not re-verified):** cron-store.ts; cron.ts:19,245-314
- **AT:** AT-23 (G2 authoritative); AT-27 part (MIG-02; MIG-08) · **ADR:** ADR-07 (O2–O4) · **MIG:** MIG-02; MIG-08 · **Trace:** TM-07, TM-16
- **Estimate (classic / AI):** — (group W1-PR10+PR11 (§4.1.1): 2.5–4 / 1–1.5) · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** F-DUR-10; DST UNKNOWN

#### W1-PR12 — Crash-injection e2e (dev Node)

- **Owner:** Durable owner · **Depends on:** W1-PR5, W1-PR6, W1-PR9
- **Scope (Delivery §2):** Kill after a confirmed phase → restart continues with the next phase; kill after provider success before ack → unknown_outcome visible; two processes → one lease.
- **Files (from the plan, not re-verified):** new test
- **AT:** AT-07; AT-08; AT-09 · **ADR:** ADR-02 · **Trace:** TM-05
- **Estimate (classic / AI):** 1–1 / 0.5–0.5 · **Receipts:** C (dev part; packaged = W8-PR2)
- **Note:** F-REL-03 (the tool does not exist); graph §3: after W1-PR9

#### W1-PR13 — MIG-09 versioned migration ledger + runner

- **Owner:** Durable owner · **Depends on:** W0-PR7, W0-PR8
- **Scope (Delivery §2):** Ledger per MIG-ID (version before/after, receipt hash), boot step before the stores are opened, dry-run/apply/rollback commands; merge before the W1-PR2 apply; in parallel with W1-PR1.
- **Files (from the plan, not re-verified):** local/index.ts:538-622 (store construction); webhook.ts:25-46; agent-run-registry.ts:548-573
- **AT:** AT-27 part (MIG-09) · **MIG:** MIG-09 · **Trace:** TM-16
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** I (runner in the packaged bundle)
- **Note:** PROPOSAL new code, BORROW patterns; off the critical path; W1 input contract W0-PR7/PR8

#### W1-PR14 — MIG-08 export/erasure for the run store (ExecutionErasure)

- **Owner:** Durable owner · **Depends on:** W1-PR2
- **Scope (Delivery §2):** Export sections for runs/checkpoints/journal and erasure via erased_subjects/stableHarvestId; a store without an export/erase mapping does not pass.
- **Files (from the plan, not re-verified):** routes/export.ts:4-10; data-erase.ts:1-19
- **AT:** AT-27 part (MIG-08) · **MIG:** MIG-08 · **Trace:** TM-16
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** merge prerequisite for the MIG-08 sections: W1-PR7, W1-PR11, W3e-PR1, W4-PR3/PR5/PR6, W8-PR3

#### W1-PR15 — Revocation ledger revocations.json + Class B restore test

- **Owner:** Durable owner (FRD §15 AT-27) · **Depends on:** W0-PR7, W0-PR8, W0-PR19
- **Scope (Delivery §2):** Append-only {kind, key, revokedAt, reason} under dataDir, outside the files that get restored; hooks in VaultStore.delete, ApprovalGrantStore.revoke and registry credential revoke; Class B restore against the W0-PR19 golden fixture; merge before the first G2 apply.
- **Files (from the plan, not re-verified):** vault.ts:286; approval-grants.ts:286-292; suppression.ts:54-100; agent-run-registry.ts:548-573
- **AT:** AT-27 part (Class B restore) · **MIG:** MIG-00.6; GDPR-H-05 · **Trace:** TM-16
- **Estimate (classic / AI):** 1.5–2.5 / 1–1.5 · **Receipts:** wave W1: I, R, P, C (per-PR UNKNOWN)
- **Note:** PROPOSAL new code; in parallel with W1-PR1/PR13

### W2

#### W2-PR1 — ContextPackage type + ContextBuilder facade over recallMemory + ablation flag

- **Owner:** Memory owner · **Depends on:** W0-PR10, W0-PR11 · **Gate:** RAT-04 (ADR-05) before merge
- **Scope (Delivery §2):** recallMemory remains the engine (DIR-09, D-12); the facade returns a reference-first package; runs alongside W1-PR1..PR3.
- **Files (from the plan, not re-verified):** orchestrator.ts:582-978; chat-turn-preparation.ts:237; chat.ts:390; command.ts:266; commands.ts:74
- **AT:** AT-06 part; AT-13 part · **ADR:** ADR-05 · **Trace:** TM-08
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-08, F-HM-09; indirectly on the critical path (W3-PR2); open LOW: the ADR-05 review has no unit of work

#### W2-PR2 — Pinning the package to the run + invalidation (erasure/revoke/scope)

- **Owner:** Memory owner · **Depends on:** W2-PR1, W1-PR4
- **Scope (Delivery §2):** Reference + hash in Checkpoint; resume requires a fresh resolution if the source was erased/revoked/its scope changed (no snapshot > erasure).
- **Files (from the plan, not re-verified):** erased_subjects; erasure.test.ts
- **AT:** AT-15 (G2 authoritative); AT-13 part; AT-27 part (MIG-05 context_refs) · **ADR:** ADR-05 · **MIG:** MIG-05 (context_refs) · **Trace:** TM-08, TM-16, TM-20
- **Estimate (classic / AI):** 3–3.5 / 1.5–2 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-18

#### W2-PR3 — Trust/taint labels in the recall block render line

- **Owner:** Memory owner · **Depends on:** W2-PR2 · **Gate:** DQ-04 (LoCoMo same-judge rerun = merge gate)
- **Scope (Delivery §2):** source token in the package and the render line; changes the recall block bytes → LoCoMo same-judge check + recount.mjs before merge.
- **Files (from the plan, not re-verified):** orchestrator.ts:839-856; executor-brief.ts:186
- **AT:** AT-28 part (LoCoMo same-judge without regression) · **ADR:** ADR-05 · **Trace:** TM-08
- **Estimate (classic / AI):** 1.5–2 / 0.5–1 · **Receipts:** P (recall block bytes)
- **Note:** F-HM-06 WEAKENED; + 1–2 days of compute outside eng-days; must come before the B2 dev run

#### W2-PR4 — Token budget per model tier at the package level

- **Owner:** Memory owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** FRAME_LIMITS today is not applied to the W4.5 pre-rendered block; lane caps fixed at 60/40/K=6.
- **Files (from the plan, not re-verified):** prompt-assembler.ts:118,165-169,369-489; orchestrator.ts:765-771
- **AT:** — (TM-08; per-PR UNKNOWN) · **Trace:** TM-08
- **Estimate (classic / AI):** 2–3 / 0.5–1 · **Receipts:** P
- **Note:** F-HM-07; must come before the B2 dev run

#### W2-PR5 — Fleet/harness/subagent on the same ContextPackage contract

- **Owner:** Memory owner; Harness owner (injection into phases) · **Depends on:** W2-PR3
- **Scope (Delivery §2):** Fleet today uses buildAssembledPrompt without recalledText; harness/subagent without recall. No new fusion surface (D-16).
- **Files (from the plan, not re-verified):** fleet-run-executor.ts:647-648; routes/fleet.ts:350-356; subagent-orchestrator.ts; workflow-harness.ts
- **AT:** — (TM-08; per-PR UNKNOWN) · **Trace:** TM-08
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-10; hotspot workflow-harness.ts → Durable owner

#### W2-PR6 — External handoff for all paths (WAGGLE_CONTEXT_INJECTED, SessionStart, cli-bridge)

- **Owner:** External-executor owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** buildExecutorBrief for both /api/tools/run and the interactive launch; only WAGGLE_CONTEXT_INJECTED is added to the allowlist (WAGGLE_RUN_ID already exists); SessionStart shortens recall when the marker + run id are present; cli-bridge reads WAGGLE_RUN_ID.
- **Files (from the plan, not re-verified):** executor-brief.ts:46-154; route-proposals.ts:205-211; external-tool-runs.ts:103; cli-bridge.ts:240,404-408; external-process-env.ts:29-35
- **AT:** AT-16 · **ADR:** ADR-05 · **Trace:** TM-09, TM-23
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** A; P
- **Note:** F-HM-08, F-HM-11, F-HM-12; UNKNOWN: whether --safe-mode suppresses SessionStart; must come before the B2 dev run

#### W2-PR7 — Idempotent run-end extraction (runId, outputHash)

- **Owner:** Memory owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** Dedup key (runId, outputHash) in metadata; verification of the createPFrame dedup.
- **Files (from the plan, not re-verified):** frames.ts:109-111,289-294; weaver/consolidation.ts:181-236; cognify.ts:64-70
- **AT:** AT-14 (G2 authoritative) · **Trace:** TM-08
- **Estimate (classic / AI):** 1–1.5 / 0.5–0.5 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-16

#### W2-PR8 — External toolsUsed marked tool-reported

- **Owner:** External-executor owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** The registry + UI copy distinguish tool-reported from server-observed.
- **Files (from the plan, not re-verified):** external-tool-runner.ts:519,531; external-tool-runs.ts:922-932
- **AT:** AT-16 · **Trace:** TM-09, TM-23
- **Estimate (classic / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-14

#### W2-PR9 — RAWDETAIL FRD record + decision on bundling the reranker

- **Owner:** Memory owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** The lane indexes only harvested conversations (3 writers) and depends on a reranker that is not bundled → offline desktop without the lane; decision: bundle or document.
- **Files (from the plan, not re-verified):** raw-detail-lane.ts:116-187; inprocess-reranker.ts:56,71,74; local/index.ts:792-800
- **AT:** AT-14 (G2 authoritative) · **ADR:** ADR-05 · **Trace:** TM-08
- **Estimate (classic / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** I (if the reranker is bundled)
- **Note:** F-HM-01; offline part AUDIT FINDING — TO VERIFY

#### W2-PR10 — memory_compact test in the desktop sidecar

- **Owner:** Memory owner · **Depends on:** W2-PR3
- **Scope (Delivery §2):** Test that the existing cron runs in the desktop sidecar; not a new mechanism.
- **Files (from the plan, not re-verified):** local/index.ts:2033-2058; setup-crons.ts:35; dream-journal.ts:75-77
- **AT:** — (TM-08; per-PR UNKNOWN) · **Trace:** TM-08
- **Estimate (classic / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** wave W2: P, A, I, R (per-PR UNKNOWN)
- **Note:** F-HM-02 WEAKENED

### W3

#### W3-PR1 — Review ADR-01 + ExecutionMode table in the FRD

- **Owner:** Harness owner · **Depends on:** — · **Gate:** RAT-03 after the review (before the W3-PR2 merge)
- **Scope (Delivery §2):** Review of the existing draft; conversation/work × normal/strict/benchmark (DIR-03).
- **Files (from the plan, not re-verified):** docs/decisions/2026-09-27-ADR-01-conversation-work-modes.md; FRD
- **AT:** — · **ADR:** ADR-01 · **Trace:** TM-01
- **Estimate (classic / AI):** 1–2 / 0.5–0.5 · **Receipts:** — (documentation)
- **Note:** W3 input contract: W1-PR4 + W2-PR1

#### W3-PR2 — Router conversation/work server-side

- **Owner:** Harness owner (hotspot: Chat owner) · **Depends on:** W3-PR1, W1-PR4, W2-PR1 · **Gate:** RAT-03 before merge; DQ-09 (default mode)
- **Scope (Delivery §2):** Server-side classification + mode; visible and correctable classification; conversation remains the existing lightweight path; behind a flag.
- **Files (from the plan, not re-verified):** chat-turn-preparation.ts (after detectTaskShape :381); task-shape.ts:145
- **AT:** — (TM-01/TM-20; per-PR UNKNOWN) · **ADR:** ADR-01 · **Trace:** TM-01, TM-20
- **Estimate (classic / AI):** 4–5 / 2–3 · **Receipts:** R; P
- **Note:** F-HARN-09; critical path; does not depend on W1-PR7

#### W3-PR3 — Recipe registry + versions + HarnessRecipeVersion minimum

- **Owner:** Harness owner · **Depends on:** W3-PR2
- **Scope (Delivery §2):** parent, mutations, promotion state, rollback target; the three built-in harnesses become recipe v1 without deletion.
- **Files (from the plan, not re-verified):** builtin-harnesses.ts:94-259 (become recipe v1)
- **AT:** — (TM-20; per-PR UNKNOWN) · **ADR:** ADR-01 · **Trace:** TM-20
- **Estimate (classic / AI):** 4–5 / 2–3 · **Receipts:** R; P
- **Note:** critical path

#### W3-PR4 — Research-brief recipe + deterministic validators

- **Owner:** Harness owner · **Depends on:** W3-PR3
- **Scope (Delivery §2):** Validators: file parsing, sections, resolvable references, numbers/dates/citations, units, contradictions (not a source quota).
- **Files (from the plan, not re-verified):** UNKNOWN (new recipe/validator modules)
- **AT:** AT-21; AT-22 · **ADR:** ADR-01 · **Trace:** TM-20, TM-23
- **Estimate (classic / AI):** 6–8 / 3–4 · **Receipts:** R; P
- **Note:** critical path (in parallel with W3-PR5)

#### W3-PR5 — Document-production recipe (DOCX/MD) + validators

- **Owner:** Harness owner · **Depends on:** W3-PR3
- **Scope (Delivery §2):** DOCX/MD parsing, sections; no new native deps (I).
- **Files (from the plan, not re-verified):** UNKNOWN (new recipe/validator modules)
- **AT:** AT-21; AT-22 · **ADR:** ADR-01 · **Trace:** TM-20, TM-23
- **Estimate (classic / AI):** 6–8 / 3–4 · **Receipts:** R; P
- **Note:** critical path (in parallel with W3-PR4)

#### W3-PR6 — Three verification levels in ProofReceipt; CONDITIONAL policy per recipe

- **Owner:** Harness owner · **Depends on:** W3-PR4, W3-PR5, W1-PR7
- **Scope (Delivery §2):** Structural / defined elements / content review with a rubric.
- **Files (from the plan, not re-verified):** ProofReceipt (W1-PR7)
- **AT:** AT-01 part (G2) · **ADR:** ADR-01 · **Trace:** TM-01, TM-20
- **Estimate (classic / AI):** 4–5 / 1.5–2 · **Receipts:** R; P
- **Note:** critical path; DQ-09 thresholds

#### W3-PR7 — Production benchmark adapter (benchmark mode) + manifest + run reset

- **Owner:** Benchmark owner · **Depends on:** W3-PR6
- **Scope (Delivery §2):** /api/chat path, isolated run, manifest (SHA, model/quant/runtime, hardware, dataset/scorer hash, limits, seeds, cost), reset of .mind/caches/artifacts/actions incl. pre-seed of `<dataDir>/models` with a per-file hash.
- **Files (from the plan, not re-verified):** `benchmarks/**`; `chat*.ts` (benchmark flag only)
- **AT:** AT-28 (G2 authoritative, with B2-PR1/PR2) · **ADR:** ADR-01 · **Trace:** TM-17
- **Estimate (classic / AI):** 4–5 / 1.5–2 · **Receipts:** no release receipt
- **Note:** critical path; a shared read-only model cache (alternative) is not counted

#### W3-PR8 — Cherry-pick of additive files from feature/harness-sota-bench (without fe7804bf)

- **Owner:** Benchmark owner (with Harness owner review) · **Depends on:** —
- **Scope (Delivery §2):** Leakage firewall, gate/preflight/prereg, stats TOST, τ² adapter (Python dev tool, not in the installer), continual; do not carry over as results: 9eb454bd, 16b4dc3d, df159ac2, 18e5b36a (N=114 n.s.).
- **Files (from the plan, not re-verified):** `benchmarks/**` (113 A + 8 M)
- **AT:** — (TM-17) · **Trace:** TM-17
- **Estimate (classic / AI):** 1–2 / 0.5–0.5 · **Receipts:** no release receipt
- **Note:** F-REL-12; no rebase; independent

### W3e

#### W3e-PR1 — Active-version pointer + rollback route + rolled_back (CHECK rebuild) + MIG-08

- **Owner:** Evolution owner · **Depends on:** W0-PR9, W1-PR13, W1-PR14, W1-PR15 · **Gate:** RAT-05 before merge
- **Scope (Delivery §2):** POST /api/evolution/runs/:uuid/rollback; active_from/active_until; multi-level backup; persona:reloaded consumer + WS relay; MIG-08 section for evolution runs and override versions.
- **Files (from the plan, not re-verified):** evolution-runs.ts:23-28,95-96; routes/evolution.ts:259; evolution-service.ts:277; index.ts:3189
- **AT:** AT-04 (G2 authoritative); AT-27 part (MIG-03) · **ADR:** ADR-06 · **MIG:** MIG-03; MIG-08 · **Trace:** TM-03, TM-16
- **Estimate (classic / AI):** 6–7.5 / 3–4 · **Receipts:** P (persona resolution)
- **Note:** F-EVO-02; must come before the B2 dev run

#### W3e-PR2 — EvolutionLLM adapter over the provider router + composePersonaPrompt

- **Owner:** Evolution owner · **Depends on:** W0-PR9
- **Scope (Delivery §2):** The complete(prompt) contract is retained; artifacts = executorModel, judgeModel, perExampleOutputs (redacted); KVARK mode without cloud egress.
- **Files (from the plan, not re-verified):** evolution-llm-wiring.ts (options.model :227)
- **AT:** AT-26 part (KVARK without a cloud judge) · **ADR:** ADR-06 (O7/O8) · **Trace:** TM-04
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** P; R (if the evaluator goes through the router)
- **Note:** F-EVO-04; order within W3e UNKNOWN

#### W3e-PR3 — Paired scoring (anchor) + drift watch of the active version

- **Owner:** Evolution owner · **Depends on:** W0-PR9 · **Gate:** DQ-09 (drift watch threshold)
- **Scope (Delivery §2):** Baseline always scored in the anchor phase; aggregateScores returns n_failed/n_aborted; combinedDelta kept as a field; drift watch only proposes rollback (no automatic rollback).
- **Files (from the plan, not re-verified):** iterative-optimizer.ts; compose-evolution.test.ts:342-371
- **AT:** AT-29 · **ADR:** ADR-06 · **Trace:** TM-04
- **Estimate (classic / AI):** 2.5–4 / 1.5–2 · **Receipts:** P; R (if the evaluator goes through the router)
- **Note:** F-EVO-06; drift watch proposes rollback via the W3e-PR1 route (the edge is not in graph §3)

#### W3e-PR4 — builder.build() with secret scan/split/holdout instead of sourceFromTraces

- **Owner:** Evolution owner (Memory owner: eval dataset scope) · **Depends on:** W0-PR9
- **Scope (Delivery §2):** traceFilter personaId/workspaceId, includeCorrections:false, 60/20/20; GEPA on train+val, final paired score on holdout; dataset hash + number of looks at the holdout.
- **Files (from the plan, not re-verified):** eval-dataset.ts:232-245
- **AT:** AT-29; AT-13/AT-19 (eval set) · **ADR:** ADR-06 · **Trace:** TM-04
- **Estimate (classic / AI):** 2–3 / 1.5–2 · **Receipts:** P; R (if the evaluator goes through the router)
- **Note:** F-EVO-07; the definition of "verified" depends on W1-PR7

#### W3e-PR5 — Local evaluator default + consent/cap/abort for the cloud judge

- **Owner:** Evolution owner · **Depends on:** W0-PR9
- **Scope (Delivery §2):** consent flag + display of where the data goes (D-05); AbortController on SSE close; maxJudgeCalls cap; cost estimate before the run.
- **Files (from the plan, not re-verified):** EvolutionTab.tsx:1296; IterativeGEPAOptions.signal
- **AT:** — (TM-04; per-PR UNKNOWN) · **ADR:** ADR-06 (O7/O8) · **Trace:** TM-03, TM-04
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** P; R (if the evaluator goes through the router)
- **Note:** F-EVO-08; A16

#### W3e-PR6 — EvolveSchema wire-or-drop

- **Owner:** Evolution owner · **Depends on:** W0-PR9
- **Scope (Delivery §2):** frozenSchema into the Stage 2 executor and the deploy artifact, or drop it from the default compose (engineering decision of the Evolution owner).
- **Files (from the plan, not re-verified):** compose-evolution.test.ts:223,370
- **AT:** AT-05 · **ADR:** ADR-06 · **Trace:** TM-03
- **Estimate (classic / AI):** 1–1 / 0.5–0.5 · **Receipts:** P
- **Note:** F-EVO-05

#### W3e-PR7 — Learning channel: markCorrected, persona signal, wire-vs-remove AgentLearning

- **Owner:** Evolution owner · **Depends on:** W0-PR9
- **Scope (Delivery §2):** The existing improvement_signals path remains the only channel; no duplication.
- **Files (from the plan, not re-verified):** chat-turn-completion.ts:253-261; improvement-detector.ts:81-98; chat.ts:1485-1496
- **AT:** — (TM-03; per-PR UNKNOWN) · **Trace:** TM-03
- **Estimate (classic / AI):** 1.5–2 / 1–1.5 · **Receipts:** P
- **Note:** F-EVO-09 WEAKENED; UNKNOWN: who calls markSurfaced

#### W3e-PR8 — Route test: complete() called with the candidate before the judge

- **Owner:** Evolution owner · **Depends on:** W0-PR9
- **Scope (Delivery §2):** Number of calls per example = 2; stub callCount() exists.
- **Files (from the plan, not re-verified):** evolution-run-route.test.ts:37-58
- **AT:** AT-05 · **Trace:** TM-03
- **Estimate (classic / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** —
- **Note:** F-EVO-03 (GEPA stage already closed)

### W4

#### W4-PR1 — PermissionEnvelope type + computation from existing sources

- **Owner:** Capability owner · **Depends on:** —
- **Scope (Delivery §2):** Intersection of system/egress, KVARK when connected, user grants, workspace/role/read-only, tool capabilities; no tier step.
- **Files (from the plan, not re-verified):** persona-tool-filter.ts:98-153; chat-governance.ts:87-89; approval-grants.ts; confirmation.ts:337-358
- **AT:** — (TM-10; per-PR UNKNOWN) · **ADR:** ADR-04 · **Trace:** TM-10
- **Estimate (classic / AI):** 3.5–4 / 1–1.5 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)
- **Note:** independent of W1

#### W4-PR2 — Resolver facade + filterCandidates(envelope) + read-only persona test

- **Owner:** Capability owner · **Depends on:** W4-PR1
- **Scope (Delivery §2):** Filter before ranking; lane order = tie-breaker; no physical merge of the 4 engines (DIR-11).
- **Files (from the plan, not re-verified):** capability-acquisition.ts:299-311; agent-search.ts:158
- **AT:** AT-17 · **ADR:** ADR-04 · **Trace:** TM-10
- **Estimate (classic / AI):** 3–4 / 1.5–1.5 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)
- **Note:** F-CAP-11

#### W4-PR3 — Typed CapabilityRequest + api_key card + durable proposal store (MIG-06/08)

- **Owner:** Capability owner · **Depends on:** W4-PR2, W1-PR13, W1-PR14, W1-PR15 · **Gate:** RAT-07 before merge
- **Scope (Delivery §2):** Proposal kind:connector; the card calls the existing POST /api/connectors/:id/connect; the old HTML comment marker is supported transitionally.
- **Files (from the plan, not re-verified):** CapabilityRequestCard.tsx:94-99; CapabilityProposalStore.issue; agent-search.ts:79
- **AT:** AT-11; AT-27 part · **ADR:** ADR-04 · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Estimate (classic / AI):** 4.5–5 / 1.5–2 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)
- **Note:** W1-PR14 merge prerequisite

#### W4-PR4 — BLOCKED_CAPABILITY resume on SetupCompleted

- **Owner:** Capability owner (hotspot: Chat owner) · **Depends on:** W4-PR3, W1-PR4
- **Scope (Delivery §2):** Run created before blocking (DIR-04); a valid setup returns the same run.
- **Files (from the plan, not re-verified):** chat-turn-preparation.ts; W1 run store
- **AT:** AT-11 · **ADR:** ADR-04 · **Trace:** TM-10
- **Estimate (classic / AI):** 4–6 / 2–3 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)

#### W4-PR5 — OAuth state bound to the request + persistence + PKCE + callback (MIG-06/08)

- **Owner:** Security owner (wave: Capability owner) · **Depends on:** W4-PR4, W1-PR13, W1-PR14, W1-PR15
- **Scope (Delivery §2):** pendingStates with requestId/workspaceId/sessionId; callback → internal event → the same run only with a valid grant; Waggle-owned OAuth client out of scope (R12).
- **Files (from the plan, not re-verified):** oauth.ts:64-65,138-139,200-209,290-311
- **AT:** AT-11 part; AT-27 part · **ADR:** ADR-04 (O4) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Estimate (classic / AI):** 3.5–4.5 / 1.5–2 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)

#### W4-PR6 — Negative grant / decline expiry (MIG-06/08) + revoke RED→GREEN (AT-12)

- **Owner:** Security owner (wave: Capability owner) · **Depends on:** W4-PR4, W1-PR13, W1-PR14, W1-PR15
- **Scope (Delivery §2):** Revocation survives a restart; the model/hook/IM do not undo it; the revoke test does not exist at 2af0904d.
- **Files (from the plan, not re-verified):** chat-approval-hook.ts:81,123,496-506; approval-grants.ts:286; routes/approval.ts:120
- **AT:** AT-12 (G2 authoritative); AT-19 (G2 authoritative, with W4-PR7); AT-27 part · **ADR:** ADR-04 · **MIG:** MIG-06; MIG-08 · **Trace:** TM-10, TM-16
- **Estimate (classic / AI):** 1.5–2 / 0.5–1 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)
- **Note:** if the test reveals that revocation does not survive a restart, the cost above the range is UNKNOWN

#### W4-PR7 — THREAT_MODEL.md addendum + test "no vault values in the prompt/trace"

- **Owner:** Security owner · **Depends on:** W4-PR4
- **Scope (Delivery §2):** Inline install boundary (starter-pack/proposal, forceInsecure, SecurityGate), MCP binary install, egress profiles, PostHog; no new threat-model ADR.
- **Files (from the plan, not re-verified):** THREAT_MODEL.md; installer-security.test.ts:825
- **AT:** AT-19 (G2 authoritative, with W4-PR6) · **ADR:** ADR-10 (P6) · **Trace:** TM-10
- **Estimate (classic / AI):** 1–1.5 / 0.5–1 · **Receipts:** wave W4: P, R, I (per-PR UNKNOWN)
- **Note:** gap = AUDIT FINDING — TO VERIFY

### W5

#### W5-PR1 — step payload + StepContentBlock + per-run bus → step bridge

- **Owner:** UX owner; Chat owner (SSE step) · **Depends on:** W1-PR8
- **Scope (Delivery §2):** runId, phaseId, status running/done/failed/blocked, evidenceRefs; additive extension of the existing step channel.
- **Files (from the plan, not re-verified):** chat-agent-run.ts; StepContentBlock; ActivityStream
- **AT:** AT-10 (UI part) · **ADR:** ADR-03 · **Trace:** TM-06
- **Estimate (classic / AI):** 3.5–5 / 2–2.5 · **Receipts:** I (UI)
- **Note:** deadline F2

#### W5-PR2 — View-work drawer + run-status-labels.ts

- **Owner:** UX owner · **Depends on:** W5-PR1
- **Scope (Delivery §2):** Drawer for partial/blocked/cancelled/failed without percentages; shared map for Home/Agents/Room.
- **Files (from the plan, not re-verified):** run-status-labels.ts (new); activity-labels.ts (pattern)
- **AT:** FRD-05.8 View-work test (no AT ID) · **Trace:** TM-06, TM-14
- **Estimate (classic / AI):** 3.5–5 / 2–2.5 · **Receipts:** I (UI)
- **Note:** deadline F2

### W6

#### W6-PR1 — Readiness truthfulness (useHasWorkingModel + ModelGate)

- **Owner:** Model/Runtime owner · **Depends on:** —
- **Scope (Delivery §2):** ready only after an actual generation; breaks and rewrites useHasWorkingModel.test.ts:271-281,301-307,486-495.
- **Files (from the plan, not re-verified):** useHasWorkingModel.ts:129-136,174,244; ModelGate.tsx:257-261
- **AT:** AT-20 · **Trace:** TM-13
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** I; R
- **Note:** F-UXM-02..06

#### W6-PR2 — reason in ModelProbeResult + UI messages

- **Owner:** Model/Runtime owner · **Depends on:** —
- **Scope (Delivery §2):** timeout/unreachable/cold_start/http_error/empty_content.
- **Files (from the plan, not re-verified):** ModelGate.tsx:843-858
- **AT:** AT-20 · **Trace:** TM-13
- **Estimate (classic / AI):** 1.5–2 / 0.5–1 · **Receipts:** I; R

#### W6-PR3 — Tool/structured-output round-trip probe for the work profile

- **Owner:** Model/Runtime owner · **Depends on:** —
- **Scope (Delivery §2):** Optional second probe; does not change chat.
- **Files (from the plan, not re-verified):** UNKNOWN (new probe)
- **AT:** AT-20 · **Trace:** TM-13
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** I; R

#### W6-PR4 — Pull stream:true + NDJSON relay + resume

- **Owner:** Model/Runtime owner · **Depends on:** —
- **Scope (Delivery §2):** Post-pull digest + generation probe are retained.
- **Files (from the plan, not re-verified):** local-inference.ts:313-332,338-377
- **AT:** AT-20 · **Trace:** TM-13
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** I; R

#### W6-PR6 — Ollama repin + catalog + /api/show arch check + certify fields

- **Owner:** Model/Runtime owner · **Depends on:** — · **Gate:** DQ-05 (online confirmation)
- **Scope (Delivery §2):** Pin 0.32.3 is older than the first Qwen 3.8 release; repin ≥0.32.15 after a pull/generate/tools test; certificateModel vs recommendedModel.
- **Files (from the plan, not re-verified):** managed-ollama-runtime.ts:28-29,158-237; cookbook/catalog.ts:44-51; model-fit.ts:207-214
- **AT:** AT-30 part (managed model receipt) · **Trace:** TM-13
- **Estimate (classic / AI):** 3–4.5 / 1.5–2 · **Receipts:** I; R
- **Note:** AUDIT FINDING — TO VERIFY (external §1.3); feeds B2-PR3; DQ-05 no later than ≈ 20 wd from the start of G2

#### W6-PR7 — Hardware ladder measurements (≥3 profiles)

- **Owner:** Model/Runtime owner · **Depends on:** — · **Gate:** hardware; DQ-05
- **Scope (Delivery §2):** 24 GB NVIDIA, 16 GB, CPU-only; numbers are measured, not copied.
- **Files (from the plan, not re-verified):** document + fixture tasks
- **AT:** AT-20 (real Windows hardware, FRD §15) · **Trace:** TM-13
- **Estimate (classic / AI):** 3.5–4.5 / 2–2.5 · **Receipts:** —
- **Note:** measurement and pull wall-clock are CI/compute G2

### W8

#### W8-PR2 — Crash-injection receipt script against the packaged build

- **Owner:** Release owner · **Depends on:** W1-PR4, W1-PR5
- **Scope (Delivery §2):** Runs only on a dedicated VM or a disposable Windows account (DP-0.11).
- **Files (from the plan, not re-verified):** `scripts/certify-*` (step) or a separate script
- **AT:** AT-07 part (packaged, receipt C at F2); AT-30 · **Trace:** TM-19
- **Estimate (classic / AI):** 2–3 / 1–1 · **Receipts:** C
- **Note:** F-REL-03; merge before F2

### B1

#### B1-PR1 — Evidence card + protocol draft (documentation)

- **Owner:** Benchmark owner · **Depends on:** —
- **Scope (Delivery §2):** Evidence card, split/firewall/manifest definitions; no Harbor, no ruler run and no paid calls. Choice of APEX-Agents 1.1 = PROPOSAL.
- **Files (from the plan, not re-verified):** docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md
- **AT:** — (TM-17) · **Trace:** TM-17
- **Estimate (classic / AI):** 2–3 / 1–2 · **Receipts:** no release receipt
- **Note:** early in G2

### B2

#### B2-PR0a — Harbor 0.20.0 + three images on the bench machine

- **Owner:** Benchmark owner · **Depends on:** B1-PR1 · **Gate:** DQ-04; bench machine
- **Scope (Delivery §2):** Docker/WSL2 only on the bench machine, not in the product.
- **Files (from the plan, not re-verified):** bench machine (outside the repo)
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 0.5–1 / 0.5–0.5 · **Receipts:** no release receipt
- **Note:** off the critical path

#### B2-PR0b — Ruler: reference agent + deviation analysis (B2-EXIT-0)

- **Owner:** Benchmark owner · **Depends on:** B2-PR0a · **Gate:** DQ-04 (judge API)
- **Scope (Delivery §2):** First paid benchmark step; ruler wall-clock 0.5–1 wd (placeholder, UNKNOWN) and judge cost are CI/compute.
- **Files (from the plan, not re-verified):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 0.5–1.5 / 0.5–1 · **Receipts:** no release receipt

#### B2-PR0c — Split generation + hashes

- **Owner:** Benchmark owner · **Depends on:** B2-PR0b
- **Scope (Delivery §2):** Dev/validation/sealed split + hash.
- **Files (from the plan, not re-verified):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 0.5–0.5 / 0.5–0.5 · **Receipts:** no release receipt

#### B2-PR1 — Harbor agent shim → production sidecar

- **Owner:** Benchmark owner · **Depends on:** W3-PR7
- **Scope (Delivery §2):** Shim only; manifest and run reset are in W3-PR7.
- **Files (from the plan, not re-verified):** `benchmarks/**`
- **AT:** AT-28 · **ADR:** ADR-01 · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 2.5–4 / 1–1.5 · **Receipts:** no release receipt
- **Note:** critical path

#### B2-PR2a — Rework fixes after the B2 dev run (bugs, timeout calibration)

- **Owner:** Benchmark owner · **Depends on:** B2-PR1, B2-PR3
- **Scope (Delivery §2):** After the dev run (wall-clock 1–3 wd, placeholder). The dev run also depends on W6-PR6, W2-PR1 and B2-PR3.
- **Files (from the plan, not re-verified):** `benchmarks/**`
- **AT:** AT-28 · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 1–3 / 0.5–1.5 · **Receipts:** no release receipt
- **Note:** critical path; re-run 0–2 wd and validation run 1–3 wd are compute, not tickets

#### B2-PR2 — Development run report (after dev, re-run and validation selection)

- **Owner:** Benchmark owner · **Depends on:** B2-PR2a
- **Scope (Delivery §2):** No marketing claims; never "beats" from B2.
- **Files (from the plan, not re-verified):** `benchmarks/results/<test>-<datum>/`
- **AT:** AT-28 · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 2–3 / 1–2 · **Receipts:** no release receipt
- **Note:** critical path; F2 follows it

#### B2-PR3 — Target model configuration/tuning before A/B

- **Owner:** Benchmark owner · **Depends on:** B2-PR0c, W6-PR6 · **Gate:** DQ-04; DQ-05
- **Scope (Delivery §2):** Sampling, thinking mode, tool parser, ctx/KV; tuning only on the dev split (protocol §7).
- **Files (from the plan, not re-verified):** `benchmarks/**`
- **AT:** — (TM-17) · **Trace:** TM-17, TM-20
- **Estimate (classic / AI):** 5–8 / 3–5 · **Receipts:** no release receipt
- **Note:** R16; must come before the B2 dev run

<!-- GEN:G2:END -->

---

## 5. G3 tickets — compact cards

G3 starts after F2. Range assumption: DQ-02, DQ-03, DQ-06, DQ-07 and DQ-08 are decided before G3 starts (Delivery §4.3). W3e-PR9a..e exist only if ODB-02 = yes.

<!-- GEN:G3:BEGIN -->

### W3e

#### W3e-PR9a — Registry of approved variants + immutable invariants

- **Owner:** Evolution owner; Harness owner (recipe registry) · **Depends on:** W3-PR3, W3e-PR1, W3e-PR3, W3e-PR4 · **Gate:** ODB-02 = yes (otherwise DEFERRED)
- **Scope (Delivery §2):** Test that a candidate cannot change scope, egress, approvals, budget cap, mandatory gates or the contamination boundary.
- **Files (from the plan, not re-verified):** iterative-optimizer.ts:88-93 (EvolutionTarget has no value → net-new)
- **AT:** prerequisite for AT-29 (recipe part) · **ADR:** ADR-06 · **Trace:** TM-21
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** P
- **Note:** DIR-14; T_evo compute 1–8 wd (placeholder, UNKNOWN) separately

#### W3e-PR9b — Candidate generator (mutations within the registry)

- **Owner:** Evolution owner · **Depends on:** W3e-PR9a · **Gate:** ODB-02 = yes (otherwise DEFERRED)
- **Scope (Delivery §2):** n_kand 2–4 per generation, g 1–2 (PROPOSAL inputs).
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** prerequisite for AT-29 (recipe part) · **ADR:** ADR-06 · **Trace:** TM-21
- **Estimate (classic / AI):** 2–4 / 1–2 · **Receipts:** P

#### W3e-PR9c — Paired evaluation (reuse W3e-PR3/PR4)

- **Owner:** Evolution owner · **Depends on:** W3e-PR9b · **Gate:** ODB-02 = yes (otherwise DEFERRED)
- **Scope (Delivery §2):** Anchor + holdout from W3e-PR3/PR4.
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** prerequisite for AT-29 (recipe part) · **ADR:** ADR-06 · **Trace:** TM-21
- **Estimate (classic / AI):** 1–2 / 0.5–1 · **Receipts:** P

#### W3e-PR9d — Explicit promotion + rollback (reuse W3e-PR1)

- **Owner:** Evolution owner · **Depends on:** W3e-PR9c · **Gate:** ODB-02 = yes (otherwise DEFERRED)
- **Scope (Delivery §2):** Pointer from W3e-PR1.
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** prerequisite for AT-29 (recipe part) · **ADR:** ADR-06 · **Trace:** TM-21
- **Estimate (classic / AI):** 1–2 / 0.5–1 · **Receipts:** P

#### W3e-PR9e — Tests (AT-29 for the recipe target, invariants)

- **Owner:** Evolution owner · **Depends on:** W3e-PR9d · **Gate:** ODB-02 = yes (otherwise DEFERRED)
- **Scope (Delivery §2):** Recipe part of AT-29; if ODB-02 = no, it does not apply.
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** AT-29 (G3 recipe part, only with ODB-02 = yes) · **ADR:** ADR-06 · **Trace:** TM-21
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** P
- **Note:** the PRD-10-13 claim depends on this

### W4

#### W4-PR8 — ActionDescriptor as the source of truth for side-effect endpoints

- **Owner:** Capability owner · **Depends on:** —
- **Scope (Delivery §2):** UI, agent and routine invoke the same action through the same permission/validation contract.
- **Files (from the plan, not re-verified):** command-registry.ts:108-192
- **AT:** AT-18 (G3 authoritative) · **ADR:** ADR-04 (note: agent tool and held action share ToolDefinition) · **Trace:** TM-11
- **Estimate (classic / AI):** 4–6 / 2–2.5 · **Receipts:** P; R; I
- **Note:** F-CAP-13; the edge to W4-PR1..PR7 is not in the §3 graph; surface measured by B3 → F2→F3 carry-forward review

### W5

#### W5-PR3 — Routines Home block + blocked status

- **Owner:** UX owner; Durable owner · **Depends on:** W1-PR11
- **Scope (Delivery §2):** Reads /api/automations; next scheduled time, blocking, pause/disable; removal of the dead running/failed branch.
- **Files (from the plan, not re-verified):** HomeCockpit.tsx; automations.ts:128-148; types.ts:777
- **AT:** AT-23 part (G3) · **ADR:** ADR-07 (O9) · **Trace:** TM-07, TM-14
- **Estimate (classic / AI):** — (group W5-PR3..PR7 (G3 remainder, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)
- **Note:** F-UXM-13, F-DUR-11

#### W5-PR4 — Nav/⌘K gating + one advanced toggle (A23) + copy lint test

- **Owner:** UX owner · **Depends on:** — · **Gate:** DQ-08 (copy lint allowlist)
- **Scope (Delivery §2):** Power tools only for isPro; New Agent under power; A23 = PROPOSAL — BRIEF DIRECTION.
- **Files (from the plan, not re-verified):** command-catalog.ts; Sidebar.tsx:180-191; dock-tiers.ts:121-131
- **AT:** AT-17 indirectly (W5 exit) · **Trace:** TM-14
- **Estimate (classic / AI):** — (group W5-PR3..PR7 (G3 remainder, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)
- **Note:** F-UXM-15; command-catalog.ts:80 Upgrade to Team → WB-PR5

#### W5-PR5 — First-task artifact + persona copy "role/modes"

- **Owner:** UX owner · **Depends on:** —
- **Scope (Delivery §2):** Template-specific first task that produces an artifact; wire up or remove the dead ALL_ONBOARDING_PERSONAS/getPersonasForTemplate.
- **Files (from the plan, not re-verified):** OnboardingWizard.tsx:107; ModelGateStep.tsx
- **AT:** — · **Trace:** TM-14
- **Estimate (classic / AI):** — (group W5-PR3..PR7 (G3 remainder, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** I (UI)

#### W5-PR6 — Playwright/visual baseline update

- **Owner:** UX owner · **Depends on:** W5-PR4
- **Scope (Delivery §2):** E2E env isolation per the checklist (WAGGLE_E2E_BASE_URL/PORT, REUSE_EXISTING_SERVER=0).
- **Files (from the plan, not re-verified):** `tests/visual/**`
- **AT:** — · **Trace:** TM-14
- **Estimate (classic / AI):** — (group W5-PR3..PR7 (G3 remainder, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** —
- **Note:** edge W5-PR4 → W5-PR6 from §4.3 (DQ-08)

#### W5-PR7 — axe for ?forceWizard=true routes + centralized strings

- **Owner:** UX owner · **Depends on:** —
- **Scope (Delivery §2):** Wizard/ModelGate covered by axe; no i18n framework until DQ-08.
- **Files (from the plan, not re-verified):** tests/e2e/runtime-a11y.spec.ts:10-60; activity-labels.ts
- **AT:** a11y test (W5 exit; no AT ID) · **Trace:** TM-14
- **Estimate (classic / AI):** — (group W5-PR3..PR7 (G3 remainder, §4.1.1): 7–10.5 / 3.5–6) · **Receipts:** —

### W6

#### W6-PR5 — WMI detection + test with fake output

- **Owner:** Model/Runtime owner · **Depends on:** W6-PR1, W6-PR2, W6-PR3
- **Scope (Delivery §2):** Win32_VideoController + registry qwMemorySize because of the 4 GB AdapterRAM cap.
- **Files (from the plan, not re-verified):** hardware-detect.ts:330
- **AT:** — (TM-13; FRD §15 AT-20 is closed by W6-PR1..PR4) · **Trace:** TM-13
- **Estimate (classic / AI):** — (group W6-PR5/PR8 (G3 remainder, §4.1.1): 4–6 / 2–3) · **Receipts:** I
- **Note:** surface measured by B3 → carry-forward review

#### W6-PR8 — Wizard reorder + OpenAI-compatible presets

- **Owner:** UX owner; Model/Runtime owner · **Depends on:** W6-PR1, W6-PR2, W6-PR3
- **Scope (Delivery §2):** Flow: what you want → model → first Workspace + sources → optional mail/calendar → first task; llama.cpp/LM Studio presets.
- **Files (from the plan, not re-verified):** OnboardingWizard.tsx; ModelGate.tsx
- **AT:** — (TM-14) · **Trace:** TM-14
- **Estimate (classic / AI):** — (group W6-PR5/PR8 (G3 remainder, §4.1.1): 4–6 / 2–3) · **Receipts:** I
- **Note:** surface measured by B3 → carry-forward review

### W7

#### W7-PR1 — Channel profile table + evidence card per channel (doc)

- **Owner:** Attention owner · **Depends on:** — · **Gate:** DQ-06
- **Scope (Delivery §2):** live/bot/export/roadmap per channel.
- **Files (from the plan, not re-verified):** FRD
- **AT:** — (TM-12) · **Trace:** TM-12
- **Estimate (classic / AI):** 1–1 / 0.5–0.5 · **Receipts:** —
- **Note:** W7 wave depends on DQ-06, W1, W4, W2 taint

#### W7-PR2 — WorkItem store + erasure/export (MIG-06/08)

- **Owner:** Attention owner; Memory owner (erasure) · **Depends on:** — · **Gate:** DQ-06
- **Scope (Delivery §2):** Action/Commitment/Decision/Signal with provenance, confidence, user correction; merging is reversible.
- **Files (from the plan, not re-verified):** UNKNOWN (new state layer, not .mind)
- **AT:** AT-15 part; AT-27 (WorkItem part, G3 authoritative); AT-13 (regression) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-12, TM-16
- **Estimate (classic / AI):** 5–6 / 2–2.5 · **Receipts:** I
- **Note:** serial part W7-PR2→PR3→PR4→PR6; W7 wave depends on W1

#### W7-PR3 — Sync engine for the chosen ecosystem + cursor/delta + BYO OAuth client

- **Owner:** Attention owner · **Depends on:** W7-PR2 · **Gate:** DQ-06; CASA if Gmail
- **Scope (Delivery §2):** historyId/syncToken/delta, lost cursor, revoked credentials, retention.
- **Files (from the plan, not re-verified):** gmail-connector.ts / outlook-connector.ts (per DQ-06)
- **AT:** AT-19 part; AT-11 (regression) · **Trace:** TM-12
- **Estimate (classic / AI):** 6–8 / 2.5–3.5 · **Receipts:** I

#### W7-PR4 — Classifier + labeled set tooling + eval script

- **Owner:** Attention owner · **Depends on:** W7-PR3 · **Gate:** DQ-09 (threshold before scoring)
- **Scope (Delivery §2):** Labeled holdout; precision floor locked before scoring; labeling = human hours (8–16 h, size UNKNOWN).
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** AT-24 · **Trace:** TM-12
- **Estimate (classic / AI):** 5–7 / 2–3 · **Receipts:** R (if the classifier uses a model)

#### W7-PR5 — Home What-Needs-Me list + actions

- **Owner:** Attention owner (home.ts: UX owner) · **Depends on:** — · **Gate:** DQ-06 (W7 input contract)
- **Scope (Delivery §2):** dismiss/snooze/convert/link/correct.
- **Files (from the plan, not re-verified):** home.ts; HomeCockpit.tsx
- **AT:** — (TM-12) · **Trace:** TM-12
- **Estimate (classic / AI):** 3–4 / 1–1.5 · **Receipts:** I (UI)
- **Note:** the edge to W7-PR2 is not in the §3 graph (UNKNOWN)

#### W7-PR6 — Convert-to-work → DurableRun with taint

- **Owner:** Attention owner; Security owner · **Depends on:** W7-PR4, W2-PR3
- **Scope (Delivery §2):** Never executes an unapproved external effect.
- **Files (from the plan, not re-verified):** UNKNOWN
- **AT:** AT-19 part (G3) · **Trace:** TM-12
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** I
- **Note:** W7 wave depends on W1; surface measured by B3 → carry-forward review

#### W7-PR7 — Second source (calendar of the same ecosystem)

- **Owner:** Attention owner · **Depends on:** W7-PR3
- **Scope (Delivery §2):** Shares the PR3 cursor pattern.
- **Files (from the plan, not re-verified):** gcal-connector.ts / outlook-connector.ts (per DQ-06)
- **AT:** — (TM-12) · **Trace:** TM-12
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** I
- **Note:** Slack/others = roadmap after G3

### W8

#### W8-PR3 — IM approve token flow + pairing persistence (Telegram only) + MIG-06/08

- **Owner:** Channels owner · **Depends on:** W1-PR14 · **Gate:** DQ-07
- **Scope (Delivery §2):** Short-lived one-time token bound to pending_action.id, payload fingerprint, expiry; replay/forward does not yield a grant; fake Telegram in the test.
- **Files (from the plan, not re-verified):** pairing.ts:95-123; `channels/*`; channels.json
- **AT:** AT-25; AT-27 part (MIG-08 pairing) · **MIG:** MIG-06; MIG-08 · **Trace:** TM-22
- **Estimate (classic / AI):** 3–4 / 2–2.5 · **Receipts:** wave W8: I, R, P, A, C (full set at RC)
- **Note:** PROPOSAL conditional on DQ-07; W1-PR14 is a merge prerequisite for MIG-08

#### W8-PR4 — Status push / routine result / forward→WorkItem (Telegram only)

- **Owner:** Channels owner · **Depends on:** W8-PR3 · **Gate:** DQ-07
- **Scope (Delivery §2):** Status push and forward into WorkItem.
- **Files (from the plan, not re-verified):** `channels/*`
- **AT:** AT-25 · **Trace:** TM-22
- **Estimate (classic / AI):** 1.5–2.5 / 1–1.5 · **Receipts:** wave W8: I, R, P, A, C (full set at RC)
- **Note:** PROPOSAL conditional on DQ-07

#### W8-PR5 — Certify: notices/SBOM asserts + packaged migration step against the golden fixture

- **Owner:** Release owner · **Depends on:** OSS-PR3 · **Gate:** DQ-02 (via OSS-PR3)
- **Scope (Delivery §2):** The only PR with certify asserts for notices/SBOM; execution only on a dedicated VM or a disposable account.
- **Files (from the plan, not re-verified):** scripts/certify-windows-installer.ps1
- **AT:** AT-30 · **ADR:** ADR-10 · **Trace:** TM-18
- **Estimate (classic / AI):** 1.5–2 / 1–1.5 · **Receipts:** I
- **Note:** `release.yml`/`certify-*` must not be touched without founder review

#### W8-PR6 — Release checklist doc + review ADR-10

- **Owner:** Release owner · **Depends on:** — · **Gate:** RAT-09 before merge
- **Scope (Delivery §2):** Exact commands from package.json/release.yml, without running them.
- **Files (from the plan, not re-verified):** docs (release checklist)
- **AT:** AT-30 (egress part, TM-24) · **ADR:** ADR-10 (O1–O3, O7) · **Trace:** TM-19, TM-24
- **Estimate (classic / AI):** 1–1.5 / 1–1 · **Receipts:** —
- **Note:** GitHub settings = owner actions, not a PR

### WB

#### WB-PR3 — KVARK registration + gate (vault config and health.ok) + connect/validate/disconnect/revoke

- **Owner:** Boundary owner (local/index.ts: Server owner) · **Depends on:** WB-PR2 · **Gate:** RAT-08 before merge
- **Scope (Delivery §2):** Gate getKvarkConfig(vault)!==null && health.ok; no-sharing default; no cloud fallback; isEnterprise from the connection state; revocation ledger hook (W1-PR15).
- **Files (from the plan, not re-verified):** kvark-tools.ts; local/index.ts (tool registration); SettingsApp.tsx:1332-1343
- **AT:** AT-26 (G3 authoritative) · **ADR:** ADR-08 (O3) · **MIG:** MIG-07.3 · **Trace:** TM-15
- **Estimate (classic / AI):** 4–5 / 2–2.5 · **Receipts:** I; P; R
- **Note:** F-TK-11; surface measured by B3 → carry-forward review

#### WB-PR4 — Dead tier code + reader dedup + session cap/embeddingProviders + GET /api/admin/overview

- **Owner:** Boundary owner · **Depends on:** — · **Gate:** RAT-08 before merge
- **Scope (Delivery §2):** readTierFromDataDir dedup; session cap and embeddingProviders as a runtime/deployment value with measurement.
- **Files (from the plan, not re-verified):** connectors.ts:183; workspaces.ts:341; fleet.ts:8; tier-session-cap.ts:4; tiers.ts:85
- **AT:** AT-27 part (MIG-07.2) · **ADR:** ADR-08 (08.2c/e/f/h/i) · **MIG:** MIG-07.2 · **Trace:** TM-15, TM-16
- **Estimate (classic / AI):** 3–4 / 1.5–2 · **Receipts:** I
- **Note:** does not depend on DQ-03

#### WB-PR5 — LEGACY_TIER_MAP v2 + config.json v2 + checkout.ts 400 + www/in-app copy + PRO leftovers

- **Owner:** Boundary owner · **Depends on:** — · **Gate:** DQ-03 (and DQ-01 for www copy)
- **Scope (Delivery §2):** Read-compatible mapping; Class A rollback; Stripe unchanged until DQ-03.
- **Files (from the plan, not re-verified):** checkout.ts; en.json:196-250; Pricing.tsx:10-58; command-catalog.ts:80; WorkspaceDesktopApp.tsx:381,939-949; PlanCards.tsx:59; SettingsApp.tsx:1029,1041
- **AT:** AT-27 (tier part, G3 authoritative) · **ADR:** ADR-08 (08.2d) · **MIG:** MIG-07.4 · **Trace:** TM-16
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** I

#### WB-PR6 — Team-sync fate (isolate+freeze / legacy compat)

- **Owner:** Boundary owner · **Depends on:** — · **Gate:** RAT-08; DQ-03
- **Scope (Delivery §2):** The KVARK adapter variant is conditional on ADR-08-K9 (UNKNOWN) and outside the G3 range.
- **Files (from the plan, not re-verified):** team-sync.ts
- **AT:** AT-26 (TM-15: personal mind is not copied) · **ADR:** ADR-08 (O5); ADR-09 · **MIG:** MIG-07.5 · **Trace:** TM-15
- **Estimate (classic / AI):** 2–3 / 1–1.5 · **Receipts:** I

### OSS

#### OSS-PR3 — Notices generator + native LICENSE + fix of EXTRACTION.md in 3 NOTICE

- **Owner:** OSS/License owner · **Depends on:** — · **Gate:** DQ-02
- **Scope (Delivery §2):** Generator over the resources/node_modules closure + manual entries; certify asserts are in W8-PR5.
- **Files (from the plan, not re-verified):** scripts/bundle-native-deps.mjs:113-130; 3 hive-mind NOTICE
- **AT:** AT-30 part (notices) · **ADR:** ADR-10 · **Trace:** TM-18
- **Estimate (classic / AI):** 3–4 / 1.5–1.5 · **Receipts:** I (changes the installer SHA → new certification)
- **Note:** a late DQ-02 (after F3 starts) adds OSS-PR3 → W8-PR5 and a repeated F3

#### OSS-PR4 — License CI (blocking) + npm audit decision

- **Owner:** OSS/License owner · **Depends on:** — · **Gate:** DQ-02
- **Scope (Delivery §2):** Borrowed tool per the Build-vs-Borrow record (e.g. license-checker/cargo-about).
- **Files (from the plan, not re-verified):** .github/workflows/ci.yml
- **AT:** — (TM-18) · **ADR:** ADR-10 · **Trace:** TM-18
- **Estimate (classic / AI):** 2–2.5 / 1–1 · **Receipts:** —

#### OSS-PR5 — Drift baseline review (maintainer)

- **Owner:** OSS/License owner; Memory owner (maintainer) · **Depends on:** — · **Gate:** DQ-02
- **Scope (Delivery §2):** Classify the 3 unreviewed; reconcile or re-baseline the 22 blockers with maintainer review.
- **Files (from the plan, not re-verified):** scripts/oss-drift-baseline.json; scripts/oss-drift-check.mjs
- **AT:** — (TM-18) · **ADR:** ADR-10 · **Trace:** TM-18
- **Estimate (classic / AI):** 1–1.5 / 0.5–0.5 · **Receipts:** —

### B3

#### B3-PR1 — Pre-registration document (hash) before looking at test answers

- **Owner:** Benchmark owner · **Depends on:** B2-PR2 · **Gate:** F2 freeze; DQ-04; DQ-09
- **Scope (Delivery §2):** Hypothesis, metric, N from B2 variance, budgets, stop criteria, analysis.
- **Files (from the plan, not re-verified):** `benchmarks/results/<test>-<datum>/`
- **AT:** AT-28; AT-29 · **Trace:** TM-17
- **Estimate (classic / AI):** 3–5 / 1.5–2.5 · **Receipts:** benchmark manifest pins the F2 SHA
- **Note:** hash is irreversible (DIR-23)

#### B3-PR2 — Results + recount + message (DIR-23)

- **Owner:** Benchmark owner · **Depends on:** B3-PR1
- **Scope (Delivery §2):** After B3 execution (10–20 wd wall-clock, PROPOSAL placeholder, UNKNOWN); message per result.
- **Files (from the plan, not re-verified):** `benchmarks/results/<test>-<datum>/`; recount.mjs
- **AT:** AT-28; AT-29 · **Trace:** TM-17
- **Estimate (classic / AI):** 9–15 / 4.5–7.5 · **Receipts:** benchmark manifest pins the F2 SHA
- **Note:** followed by the F2→F3 carry-forward review and F3

<!-- GEN:G3:END -->

---

## 6. Sprint 1 proposal — PROPOSAL

This is a **PROPOSAL** from this handoff, not a decision and not a new estimate. The order is the G1 order from Delivery §3, and the numbers are from Delivery §4.2/§4.3. The plan does not define a sprint length. A sprint of 10 working days is proposed here.

**Sprint start = the day after written founder approval of the delivery plan.** The dates in the plan (G1 18.10.2026–01.11.2026) are calculated from a start on 27.09.2026. The actual start is UNKNOWN, so all dates shift by the time until approval.

**Before day 1 (gates, no code):**
1. Written founder approval of the delivery plan.
2. Roles from DP-0.14 assigned to people (Harness, Chat, Durable, Memory, Server, Boundary, Release, OSS/License for G1). Assignment: UNKNOWN.
3. Founder decision on the worktree at `2af0904d` for W0-PR19 (open LOW finding). Without it, the Memory lane starts with W0-PR10 and W0-PR11, while W0-PR6 and W0-PR18 wait.
4. Decision on how the package (PRD/FRD/ADR) enters the integration branch, because WB-PR1 supplements it. The package is untracked in the worktree `D:/Projects/waggle-v12-handoff` (branch `docs/waggle-v1.2-planning` = `2af0904d`, no commit, not on origin) — CONFIRMED AT REVISION (read-only, 29.09.2026). How it enters `integration/waggle-next`: UNKNOWN.
5. Env template from the checklist reviewed. Node `22.23.2`.

**Sprint content (25 tickets + 1 doc-only PR):**

| Lane (worktree) | Order | Tickets | Estimate (classic / AI) |
|---|---|---|---|
| Integration | day 1 | W0-PR0 → then create 4 agent worktrees from `integration/waggle-next` | in the group PR0+PR12+PR13+PR15+PR16 |
| Harness | critical sequence 3–4 wd (Delivery §3; order within the lane, not an edge in `depends_on` — §2.1) | W0-PR1 → W0-PR7 → W0-PR8 → W0-PR9; then W0-PR2, W0-PR3 (after PR1 and PR8), W0-PR4, W0-PR5; W0-PR6 after W0-PR7 and W0-PR19 | PR1..PR8: 4.5–6 / 2–3; PR9: 1.5–2 / 0.5–0.5 |
| Memory | W0-PR19 first (if approved) | W0-PR19 → W0-PR10 → W0-PR11 → W0-PR18 | PR19: 1–1.5 / 0.5–1; PR10+PR11: 2–3 / 1–1.5; PR18: 1–1.5 / 0.5–1 |
| Boundary+Release | independent | W0-PR12, W0-PR13, W0-PR15, W0-PR16, W0-PR17; WB-PR1 → WB-PR2; OSS-PR1, OSS-PR2; W8-PR1 | group PR0+PR12+PR13+PR15+PR16: 1–1.5 / 0.5–1; PR17: 0.5–1 / 0.5–0.5; WB-PR1/PR2: 3–5 / 1.5–2.5; OSS-PR1/PR2: 4–5 / 2–3; W8-PR1: 2–2 / 1–1 |
| Durable-probe | independent | W0-PR14 | 0.5–0.5 / 0.5–0.5 |
| Integration | end of sprint | ID reconcile doc-only PR (FRD §16.1 ↔ PRD v1.2 ↔ Delivery §7; no PR ID) | 1–1 / 0.5–0.5 (row "Integration/spec sync", G1) |

**Capacity (from the plan, not measured):** G1 = 11–16 AI / 22–30 classic eng-days. The effort bound is 3.7–6.4 wd at a parallelism of 2.5–3.0. Serial founder review ~26 PRs ÷ ~3 PRs/day ≈ 8.7 wd (UNKNOWN; at 2 PRs/day ≈ 13 wd). Review is therefore the bottleneck of the first sprint, not engineering work.

**Sprint 1 goal (PROPOSAL):** all 25 G1 tickets and the ID reconcile PR merged into `integration/waggle-next`, with green DP-0.06 gates on the integration branch (G1 exit (m)). Every PR has RED→GREEN evidence and a checklist with no "no".

**After sprint 1 (sprint 2, PROPOSAL):** CI wall-clock and rework 2–4 wd; **F1** (3–5 wd): internal `certify-windows-installer.ps1` clean-profile on a dedicated VM or a disposable Windows account, P seal and R qualification for the exact SHA of the integration branch, with ODB-01 for paid runs; RAT-01 before G1 closes; the F1 retrospective measures actual AI eng-days per PR against Delivery §4.1.1 (first measurement of AI throughput). G1 total: **3–5 weeks** (13.7–22.0 wd). W1 does not start before the end of G1 (the plan's serial assumption).

**What sprint 1 must not claim (Delivery §1 G1):** "Durable runs work", "Evolution is verified", "The displayed model readiness is truthful", "KVARK connection works", public GO.

---

## 7. UNKNOWN in this backlog

The IDs `N-01..N-08` are valid only in this document. Outside it they are written as "03 N-nn", because [05 §2](05-RISKS-DECISIONS-ESCALATION.en.md) and [04 §14](04-CODEBASE-MAP.en.md) have their own `N` registers with a different meaning (05 §0, "IDs are local per document").

| # | What | Where it affects | Who resolves |
|---|---|---|---|
| N-01 | Per-ticket estimate for PRs that the plan estimates only as a group: W0-PR1..PR8; W0-PR10/PR11; W0-PR0/PR12/PR13/PR15/PR16; W1-PR5/PR6; W1-PR8/PR9; W1-PR10/PR11; W5-PR3..PR7; W6-PR5/PR8; WB-PR1/PR2; OSS-PR1/PR2. | estimate columns in the CSV (empty) | tech lead in sprint planning; the plan is not changed |
| N-02 | Owner role for W0-PR0 and W0-PR19 (the plan does not assign one). For W0-PR9 the plan and FRD §15 list different roles (Harness vs Evolution owner). | owner_role | tech lead |
| N-03 | Exact files of W0-PR18 and W0-PR19, names of the new test files (FRD §15: "the exact name of the new test file is set by the PR"), location of the OSS-PR1 document and the OSS-PR2 script. | G1 cards | implementer in the PR |
| N-04 | Per-ticket AT for tickets that a TM row covers only as a group (e.g. W2-PR4/PR5/PR10, W3-PR2/PR3, W3e-PR5/PR7, W4-PR1, W6-PR5/PR8, W7-PR1/PR5/PR7, OSS-PR1/PR2/PR4/PR5, B2-PR0a..c/PR3). Per-PR receipts for waves where the plan gives only the wave (W1, W3, W4, W5, W7). Per-PR PRD/FRD within a TM row. | CSV columns `at_ids`, `receipts_affected`, `prd_ids`, `frd_ids` | tech lead + wave owner |
| N-05 | Dependency edges that the §3 graph does not provide: ordering within W3e-PR2..PR8, W4-PR8, W5-PR5/PR7, W7-PR1/PR2/PR5, W8-PR6, OSS-PR3..PR5 relative to each other. | `depends_on` (empty or wave only) | tech lead |
| N-06 | ID and owner of the integration PRs (G1 ID reconcile, G2 hotspot integration tests, G3 reconcile). | §0 B-04 | tech lead |
| N-07 | Path of the document package into the integration branch. The package is untracked in the worktree `D:/Projects/waggle-v12-handoff` (branch `docs/waggle-v1.2-planning` = `2af0904d`, no commit, not on origin) — CONFIRMED AT REVISION (read-only, 29.09.2026). How it enters `integration/waggle-next`: UNKNOWN. | WB-PR1, W3-PR1 and all review ADR tickets | founder / tech lead |
| N-08 | Start date (approval day), founder review capacity, AI throughput, duration of F1. | §6 calendar | founder; F1 retrospective |

---

## Sources

- [WAGGLE-DELIVERY-PLAN-v1.2.md](../plans/WAGGLE-DELIVERY-PLAN-v1.2.en.md): §0 (DP-0.01..DP-0.16), §1 (G1/G2/G3 exit), §2 (PR slicing, owner, hotspot, receipts, rollback), §3 (graph and critical path), §4.1.1 (estimates per PR and per group), §4.2 (review count), §4.3 (calendar), §5 (F1–F4), §6 (DQ-01..DQ-09), §6.1 (RAT-01..RAT-09, ODB-01/02), §7 (TM-01..TM-25).
- [Waggle_FRD_v1.2_DRAFT.md](../Waggle_FRD_v1.2_DRAFT.en.md) §15 (AT-01..AT-30, authoritative wave, fixture, owner), §16.1 (PRD → FRD → AT). [Waggle_PRD_v1.2_DRAFT.md](../Waggle_PRD_v1.2_DRAFT.en.md).
- [SAFE-IMPLEMENTATION-CHECKLIST.md](../plans/SAFE-IMPLEMENTATION-CHECKLIST.en.md), [WAGGLE-MIGRATIONS-v1.2.md](../plans/WAGGLE-MIGRATIONS-v1.2.en.md), [WAGGLE-AUDIT-DISPOSITION-v1.2.md](../plans/WAGGLE-AUDIT-DISPOSITION-v1.2.en.md) (A9, C12), [WAGGLE-V1.2-OPEN-LOW-FINDINGS.md](../plans/WAGGLE-V1.2-OPEN-LOW-FINDINGS.en.md), [ADR-INDEX.md](../decisions/ADR-INDEX.en.md).
- Phase-A findings: [harness.md](../plans/v1.2-evidence/phaseA/harness.en.md), [evolution.md](../plans/v1.2-evidence/phaseA/evolution.en.md), [durable.md](../plans/v1.2-evidence/phaseA/durable.en.md), [hivemind.md](../plans/v1.2-evidence/phaseA/hivemind.en.md), [capability.md](../plans/v1.2-evidence/phaseA/capability.en.md), [ux-model.md](../plans/v1.2-evidence/phaseA/ux-model.en.md), [tiers-kvark.md](../plans/v1.2-evidence/phaseA/tiers-kvark.en.md), [release-oss.md](../plans/v1.2-evidence/phaseA/release-oss.en.md), [external.md](../plans/v1.2-evidence/phaseA/external.en.md) and `*.refute.md`.
- Repo (read-only, `2af0904d`, 29.09.2026): `git ls-tree -r` for all G1 paths; contents of `.github/workflows/ci.yml:1-8`, `packages/agent/src/feature-flags.ts:24-27`, `packages/agent/src/workflow-harness.ts:474-482`, `packages/agent/src/cost-tracker.ts:24-32`, `apps/web/src/lib/dock-tiers.ts:82`, `packages/server/src/local/routes/cost.ts:210,272`, `packages/server/src/local/routes/settings.ts:1192`, `packages/server/src/local/index.ts:605-616`, `package.json:40-48`, `vitest.config.ts:42-43` (`exclude: ['apps/**', …]`), `package.json:22` (`typecheck:web`), `apps/web/package.json:13` (`test`); W0-PR12 pinning tests: `apps/web/src/test/p7-a6-approval-gating.test.tsx` (whole file), `apps/web/src/test/p1a-routes.test.ts:228-241`, `packages/server/tests/tier-enforcement-matrix.test.ts` (whole file), `apps/web/src/lib/command-catalog.test.ts` (grep), `tests/e2e/waggle-complete.spec.ts:192-214,614-643,690-701`.
