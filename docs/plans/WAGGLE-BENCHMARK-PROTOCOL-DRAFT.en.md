# WAGGLE — Benchmark protocol (draft)

> **English translation** of [WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md](WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md) (Serbian original, same folder). The Serbian original is authoritative; report any discrepancy. Dates are written DD.MM.YYYY; "wd" means working days.

**Document revision: 1.2 DRAFT · 27.09.2026 · reviewed code revision 2af0904df01ca3d374cc78ba95b60dc579dd6a7a**

**Document revision: 1.2.1 DRAFT · 30.09.2026 · final closure (H-01..H-12)**

Changes in 1.2.1: H-07 — BP-CMP-01 "Rules": W−recipe is a separate `conversation` arm without gates and without a `ProofReceipt`, not an ablation flag over verify (FRD-05.9 R1/R11); BP-PROD-08: W-full before the W3 modes runs under the G1 strict flag (W0-PR8), without opt-out and without CONDITIONAL completion; a result without strict semantics is only a B2 development signal, not B3 evidence (FRD-05.9 R11, S/B rows) · H-10 — BP-CMP-01 row W+evolved (ODB-02 AWAITS A FOUNDER DECISION; in B3 only option B), new paragraph on W−recipe and W+evolved, §11 new attribution rule BP-MSG-01 · H-11 — Q-08: H200 FP8 server measurements (LM TEK program) are neither a substitute nor a B2 profile · H-03 (re-check 30.09.2026) — BP-INV-01 `BP-SEC-04` → `BP-SEL-04` (LOW `finish/traceability/f1/07`); §7 stale B2 sum without B2-PR3 replaced with 7–13 / 4–7 per Delivery §4.1.1 (LOW `finish/estimates/f1/06`) · H-05 (alignment with the checklist) — §9.3 new row "Writes outside `WAGGLE_DATA_DIR`" (W0-PR20, BTP). None of this has been run, paid for or approved.

Proposed location in the repo: `docs/plans/WAGGLE-BENCHMARK-PROTOCOL-DRAFT.md` (BRIEF §20.1). This file is a planning artifact; nothing in it has been run, paid for or approved (DIR-01).

Status labels (BRIEF §2.2): **DECISION** · **CONFIRMED AT REVISION** · **AUDIT FINDING — TO VERIFY** · **PARTIAL/UNWIRED** · **PROPOSAL** (subtype **PROPOSAL — BRIEF DIRECTION (DIR-nn / brief §k)**: a directive or section by the brief's author adopted as a working basis — brief §1: planner direction, not user approval) · **DEFERRED** · **UNKNOWN**. **DECISION** is used here only for the user's decisions D-01..D-18 (brief §3); founder decisions recorded in project memory carry **HISTORICAL FOUNDER DECISION (memory, date) — aligned with D-xx / brief direction** (PRD v1.2 "How to read"; not D authority); the current project contract from `CLAUDE.md` §1 (BP-SEL-03c) carries CONFIRMED AT REVISION, not DECISION. "Module exists" is not evidence of E2E function. All `path:line` references were read on `main` = `2af0904df01ca3d374cc78ba95b60dc579dd6a7a` (`git status --porcelain` clean except two untracked `.docx` in `docs/`, therefore working tree == HEAD). References to the branch `origin/feature/harness-sota-bench` (`18e5b36a`, 2026-07-01) are explicitly marked and were read via `git show`.

Date arithmetic: today is 27.09.2026; "12–17 weeks from today" = 20.12.2026–24.01.2027 (BRIEF §15.2).

---

## 0. What this document is and what it is not

| ID | Claim | Status |
|---|---|---|
| BP-00-01 | The benchmark is key evidence, not decoration; the "frontier-class" thesis is a hypothesis until the result supports it; the test is not designed so that Waggle must win. | DECISION (D-18) |
| BP-00-02 | Knowledge work is the primary job; the primary test must measure a professional knowledge-work deliverable, not generic agent capability or coding. | DECISION (D-06) |
| BP-00-03 | The reference target is the Qwen 3.8 27B class; Qwen3.6-35B-A3B is the control baseline, not a silent substitute for the target. | DECISION (D-15); re-baseline per C19 |
| BP-00-04 | The Waggle under test executes the task through the same production sidecar/runtime path as the user; the adapter may translate the input, launch an isolated run and collect the output. | PROPOSAL — BRIEF DIRECTION (DIR-22) |
| BP-00-05 | This document selects **one** primary candidate (APEX-Agents 1.1) with rationale and conditions. The selection is a PROPOSAL; it is not approved. | PROPOSAL |
| BP-00-06 | Budget, N, k, judge and the final schedule are **open** decision queue items (§15); the document gives formulas and inputs, not numbers that would be presented as agreed. | UNKNOWN — open: DQ-04 / Q-01..Q-03, Q-05 (founder: Q-01, Q-02 → DQ-04; protocol-local: Q-03, Q-05 — map in Delivery plan §6); final schedule UNKNOWN until Q-01/Q-02 (§7). Not DEFERRED: the items are not consciously out of scope, but open in the queue BRIEF §20.3 (Critic note 28.09.2026) |
| BP-00-07 | No historical founder ratification from the branch `feature/harness-sota-bench` (δ=±5pp, banking_knowledge, N≈1500, six arms) transfers automatically to this protocol; they are tied to the old τ² design and go into the decision queue for re-confirmation. | DEFERRED (BRIEF §13.6 "Six arms and an arbitrary total N≈1500 are not mandatory up front") |
| BP-00-08 | A benchmark result on the current HEAD would not qualify for claims of "verified work": the verify phase is skipped by default, gates read model-supplied evidence. Therefore B2 depends on the W0 fixes (§7). | CONFIRMED AT REVISION (docs/plans/v1.2-evidence/phaseA/harness.md F-HARN-01/02/03/08; refute HOLDS 7/7) |

---

## 1. Sources and authority for this artifact

| Source | What it provides | Rule |
|---|---|---|
| BRIEF §3 D-06, D-15, D-18; §13 DIR-22, DIR-23; §13.1–13.6; §15.1 row B1–B3; §16 AT-21/AT-28/AT-29; §17 C18, C19; §18 A25, A29; §19 R08, R09; §20.3 "Benchmark budget" | authority for direction and boundaries | do not reopen |
| `docs/plans/v1.2-evidence/phaseA/external.md` §1 (Qwen), §4 (evidence cards), §6 (prices), §7 (open) | verified external facts as of 27.09.2026 | overrides S1 where they differ |
| `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-06 (prices), F-REL-12 (branch, cherry-pick inventory) | repo state | overrides S1 |
| `docs/plans/v1.2-evidence/phaseA/harness.md` + `harness.refute.md` F-HARN-01..09 | why the current harness is not benchmark-ready | HOLDS 7/7 |
| `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-04, F-EVO-06, F-EVO-07 | why the "evolved" arm waits for W3e | — |
| `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-15 | the LoCoMo regression gate does not exist in CI | — |
| S1 §2 A25, A29; §3 rows "Full six-arm N≈1500", "LongWork"; §7 question 5 | starting input | audit claims, revalidated above |
| Own read-only repo checks (this document, §2) | `git ls-files`, `git show`, `git grep` on HEAD and on the branch | paths below |

If the group `capability`, `ux-model`, `tiers-kvark` or `durable` affects a claim here, this is stated explicitly; otherwise those groups are not used.

---

## 2. State of the benchmark infrastructure at revision `2af0904d` (CONFIRMED AT REVISION)

### 2.1 What exists on `main`

| ID | What | Path | Callers / status | Assessment for the protocol |
|---|---|---|---|---|
| BP-INV-01 | Memory benchmark harness (LoCoMo / LongMemEval / BEAM): runner, judge client, cells, ingest, substrate | `benchmarks/harness/src/{runner,judge-runner,judge-client,cells,cells-ipb,substrate,ingest*,beam-*}.ts` | tests in `benchmarks/harness/tests/*` (not run) | CONFIRMED exists; **not** a knowledge-work runner; remains a regression tool for Hive Mind (BP-SEL-04) |
| BP-INV-02 | Statistics: Wilson CI, cluster bootstrap CI, Fleiss κ | `benchmarks/harness/src/stats/index.ts:19-26` (`computeFleissKappa`, `computeWilsonCI`, `computeClusterBootstrapCI`) | same harness | CONFIRMED; reusable in §10 |
| BP-INV-03 | Pre-registration emitter (`bench.preregistration.manifest_hash`), SHA-256 manifest YAML, dataset SHA, judge roster with `pinning_surface` | `benchmarks/harness/src/preregistration.ts:36-43,52-75`; test `benchmarks/harness/tests/preregistration.test.ts:1-16` | harness CLI | CONFIRMED; basis for the §12 manifest; `CANONICAL_MANIFEST_PATH` points to `decisions/2026-04-22-bench-spec-locked.manifest.yaml` (a reference string, not a runtime path — `:36-40`) |
| BP-INV-04 | Failure taxonomy (codes, rubric, validator, aggregate) | `benchmarks/harness/src/failure-taxonomy/*` | tests | CONFIRMED; basis for separating model/tool/infra/budget/evaluator failures (§10.6) |
| BP-INV-05 | Historical pre-registration manifests v5–v8.2 | `benchmarks/preregistration/manifest-v{5,6,7,8,8.1,8.2}*.{md,yaml}` | — | CONFIRMED; a pattern, not the current protocol |
| BP-INV-06 | LoCoMo offline recount (zero API calls; EXPECT 1332/1540) | `benchmarks/results/locomo-sota-2026-06/recount.mjs:1-5,13-20` | manual (`node recount.mjs`) | CONFIRMED; pattern for the "offline recount" requirement A25/AT-28 |
| BP-INV-07 | GAIA2 ARE narrow-proxy adapter | `benchmarks/gaia2/adapter.ts:1-12` ("NOT a full Gaia2 evaluation; it is cost-projection"); `:31-37` imports `runRetrievalAgentLoop` directly from `packages/agent/src/retrieval-agent-loop.js` | scripts in `benchmarks/gaia2/scripts` | CONFIRMED exists; **does not go through the production sidecar** (DIR-22) — keep for cost-projection, not for a claim |
| BP-INV-08 | τ² adapter | `git ls-files \| grep -iE "tau2\|tau-bench\|taubench"` → **0** | — | CONFIRMED NOT ON MAIN; exists only on the branch (§14) |
| BP-INV-09 | `turnId` per-turn trace propagation; the comment calls it "correlation key for the four-cell ablation harness JSONL output" | `packages/agent/src/turn-context.ts:1-20` | `chat.ts` → agent-loop → orchestrator → prompt-assembler | CONFIRMED exists; useful for joining the production trace with a benchmark row (BP-PROD-06) |
| BP-INV-10 | Production entry points | `packages/server/src/local/routes/chat.ts:1541` (`POST /api/chat`), `packages/server/src/local/routes/agent-run.ts:237` (`POST /api/agent/run`), `packages/server/src/local/routes/external-tool-runs.ts:173` (`POST /api/tools/run`) | web UI, CLI, launcher | CONFIRMED; `/api/chat` is the user path (D-08) → the only one acceptable for DIR-22 (BP-PROD-01) |
| BP-INV-11 | Per-instance data isolation: `WAGGLE_DATA_DIR` | `packages/server/src/local/index.ts:516` (`dataDir: config.dataDir ?? process.env.WAGGLE_DATA_DIR`), `:538` `agent-runs.json`, `:565` `personal.mind`, `:627` behavioral overrides, `:639` vault | boot | CONFIRMED; basis for run reset (§9.3) |
| BP-INV-12 | Partial kill switches of the recall/prompt path: `WAGGLE_RAWDETAIL=0` (one recall lane), `WAGGLE_RERANKER=0` (turns off the cross-encoder reranker, and with it the RAWDETAIL lane), `WAGGLE_PROMPT_ASSEMBLER=0` (restores the raw `buildSystemPrompt()` + `recallMemory()` path), `WAGGLE_CHUNK_RETRIEVAL=0` (chunk-vector search, write and read side) | `packages/agent/src/orchestrator.ts:858-866` (`:866` requires `reranker`), `packages/agent/src/orchestrator.ts:562-566`, `packages/agent/src/feature-flags.ts:33-38`, `packages/hive-mind-core/src/mind/search.ts:103-111` | recallMemory / `getReranker()` / agent-loop / HybridSearch | CONFIRMED; all knobs found are **partial** — none is a "memory OFF" or "harness OFF" ablation (no such flag exists) |
| BP-INV-13 | Hardware detection (NVIDIA/Apple/basic) | `packages/server/src/local/hardware-detect.ts:1-20` | local-inference routes | CONFIRMED; input for the manifest hardware field (BP-MAN-05); AMD/Intel/WMI intentionally not built (`:17-19`) |
| BP-INV-14 | Model registry for the benchmark | `benchmarks/harness/config/models.json:2-8` (`qwen3.6-35b-a3b` DashScope 0.20/0.80), `:61-67` (`qwen3.6-35b-a3b-local` price **0.0/0.0**), `:83-100` (`claude-opus-4-6/4-7` **15/75**) | harness | CONFIRMED; Opus prices are wrong (F-REL-06); "local = 0" violates BRIEF §13.6 (BP-COST-05) |

### 2.2 What was not found (checked by capability, multiple greps)

| ID | Capability sought | Grep (HEAD, `packages/server/src`, `packages/agent/src`, `sidecar`, `app/src-tauri`) | Status |
|---|---|---|---|
| BP-INV-20 | Production ablation flag "memory OFF / skills OFF / harness OFF" | `ablation\|benchmarkMode\|WAGGLE_BENCHMARK\|disableMemory\|skipRecall\|WAGGLE_DISABLE_(MEMORY\|SKILLS\|HARNESS)\|WAGGLE_NO_MEMORY` → only comments (`orchestrator.ts:861`, `turn-context.ts:16`); `memoryEnabled\|recallEnabled\|skipRecall\|disableRecall\|noMemory\|memoryOff\|skillsEnabled\|harnessEnabled` in `routes/chat*.ts`, `chat*.ts`, `orchestrator.ts` → 0 | **NOT FOUND** (memory/harness); skills OFF **UNKNOWN** (not grepped for `tool-filter` options) → W3 "production ablation flags" (S1 W3 net-new) is real work, not an existing function |
| BP-INV-21 | `benchmark` / `strict` mode on the chat route | `strict\|WAGGLE_AUTO_VERIFY\|verification` in `routes/chat.ts` → 0 | NOT FOUND; DIR-03 modes are W1/W3 work (harness.md F-HARN-09: harness selection is model-invoked text, not a server router) |
| BP-INV-22 | LoCoMo same-judge regression gate in CI | `.github/workflows/*` grep `locomo` → 0; a manual offline recount exists (`benchmarks/results/locomo-sota-2026-06/recount.mjs`, BP-INV-06) | PARTIAL/UNWIRED — the manual same-judge process exists, the CI gate does not (hivemind.md F-HM-15; the refuter `hivemind.refute.md` asks for exactly this label instead of "NOT CONFIRMED") |
| BP-INV-23 | Crash-injection receipt over the packaged build | release-oss.md F-REL-03 | NOT FOUND (relevant for the R08 internal crash/resume test, not for the public benchmark) |

### 2.3 Why HEAD is not benchmark-ready for a claim (CONFIRMED AT REVISION, docs/plans/v1.2-evidence/phaseA/harness.md; refute HOLDS)

| Finding | Evidence | Consequence for the protocol |
|---|---|---|
| F-HARN-01 verify skipped by default; `WAGGLE_AUTO_VERIFY` is not set anywhere in the repo | `packages/agent/src/workflow-harness.ts:313,474-482` | the "Waggle full" arm without the W0 fix measures a system without mandatory verify → must not be sold as "verified work" (DIR-07) |
| F-HARN-02 `VERDICT: FAIL` passes the regex | `packages/agent/src/builtin-harnesses.ts:128` | same |
| F-HARN-03 any bash = test; exit code discarded | `builtin-harnesses.ts:181`; `packages/agent/src/system-tools.ts:681-691` | ProofReceipt level 1 (§10.5) is not trustworthy |
| F-HARN-08 gates read `phase_output.tool_calls`, which the model writes | `packages/agent/src/workflow-tools.ts:330-358,412-422` | evidence of "what the tool did" must come from the server ledger before the benchmark measures "proof" |
| F-HARN-06 bridge: completed phase → `verified`, `ok:true/durationMs:0` | `packages/agent/src/harness-trace-bridge.ts:91,139-148` | `execution_traces` with `harness:%` and `outcome='verified'` **do not enter** the eval/holdout set (§9.2) |
| F-EVO-04/06/07 executor==judge, delta on different samples, holdout does not exist, secrets reach the judge | `packages/agent/src/evolution-llm-wiring.ts:214-260`; `iterative-optimizer.ts:205-211,315-325`; `evolution-orchestrator.ts:311-326` | the "+evolved" arm (PRD §12) is **DEFERRED** until W3e closes these findings (§6.3, R03/R04) |

---

## 3. Candidate evidence cards (BRIEF §13.1; source `docs/plans/v1.2-evidence/phaseA/external.md` §4, verified 27.09.2026)

Field format per §13.1: official source/version · availability of tasks and reference/scorer · usage permission · artifact/tool environment · local execution · grading method · published baselines · integration effort.

**Applies to all cards BP-EC-01..BP-EC-06:** rows with live external data (versions, task counts, licenses, grading/judge, leaderboard/taubench and blog baselines, repo activity) carry **AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8)** — a live external check, not a property of revision `2af0904d`, aligned with the PRD v1.2 legend. The same applies to BP-SEL-01 (§4) and to the prices/sizes in BP-COST-02/BP-COST-08 (§13; external.md §1.2–1.3, §6). Rows that refer to the repo (BP-EC-02 "Integration", BP-EC-03 "In the repo"; BP-INV-*, BP-PROD-09, `CLAUDE.md`) carry CONFIRMED AT REVISION. Critic note (28.09.2026): an earlier draft tied this note only to BP-EC-01. Critic note (second pass, 28.09.2026): the cards carried the label "CONFIRMED" (outside the BRIEF §2.2 taxonomy), and this note merely reinterpreted it — the labels are now corrected in the cards themselves; for the two repo rows the finding was applied as CONFIRMED AT REVISION, not as AUDIT FINDING, because they rely on BP-INV-07/08 and BP-PROD-09 (reading the revision and the branch via `git show`), not on a live external source.

### BP-EC-01 — APEX-Agents 1.1 (Mercor)

| Field | Value | Status |
|---|---|---|
| Source/version | HF dataset `mercor/apex-agents-v1.1`; blog 2026-09-08; runner Harbor **0.20.0** (`uv tool install harbor==0.20.0`); infrastructure Archipelago (`mercor-intelligence/archipelago`, Apache-2.0); reference agent `Mercor-Intelligence/apex_loop_truncated_tools_agent` | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks/scorer | **240** tasks (80 × investment banking, management consulting, corporate law); rubrics with binary criteria; all public | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Permission | dataset **CC-BY-4.0**; Archipelago Apache-2.0 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Artifact/tool environment | real project files + applications: documents, spreadsheets, PDF, email, chat, calendar; 3 shared `linux/amd64` Docker images | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Local execution | yes, with Docker (Windows: WSL2) **on the bench machine**; not a requirement for the product (certified desktop without Docker, CLAUDE.md §1) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Grading | rubrics; judge **DeepSeek-v4-Flash-0731, t=0.1** (cloud API); 1.1 "no longer rewards noncommittal answers" | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Baselines | Claude Fable 5.1 **68.6% pass@1**; GPT-6 Astra **56.3% pass^4** (highest pass^4); the authors highlight the pass@k vs pass^k gap | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8; as published) |
| Integration | Harbor agent shim → Waggle production sidecar (DIR-22); effort **M–H**; cost = judge API + model | PROPOSAL (estimate) |
| Open | whether the task-level score is binary (all criteria) or a fraction of criteria; whether the reference agent accepts an arbitrary OpenAI-compatible endpoint (local Qwen) | UNKNOWN — TO VERIFY in B1 |

### BP-EC-02 — τ²-bench (Sierra)

| Field | Value | Status |
|---|---|---|
| Source/version | `sierra-research/tau2-bench`, MIT, **v1.0.1** (July 2026); Python ≥3.12 <3.14 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks/scorer | domains mock/airline/retail/telecom/banking_knowledge; airline base 50 (30/20), retail 114 (74/40), telecom 20 in `tasks_small.json` (full set not counted), banking ≈100 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8; telecom: full set not counted) |
| Permission | MIT | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Environment | customer-service tool-agent + **LLM user-simulator** (cloud cost/dependency) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Local | yes (Python), without Docker | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Grading | deterministic: DB hash after replay + `communicate_info`; `NL_ASSERTION` LLM judge experimental | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Baselines (taubench.com) | τ² text: Qwen3.5-397B-A17B 87.9, Gemini 3.0 Pro 85.4, Claude Opus 4.5 85.3; τ³-Banking: Qwen 3.8 Max 55.2, Opus 5 48.7 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Integration | adapter only on the branch (§14); the bridge on the branch **does not go through the production sidecar** | CONFIRMED AT REVISION (BP-INV-08; branch `18e5b36a` read via `git show`, §6 BP-PROD-09) |
| Fit for D-06 | the domain is not a knowledge-work deliverable → **control for tool-use**, not the primary test | PROPOSAL |

### BP-EC-03 — GAIA2 / ARE (Meta)

| Field | Value | Status |
|---|---|---|
| Source | code MIT (`facebookresearch/meta-agents-research-environments`); dataset CC-BY-4.0 (synthetic data under Llama licenses) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks | 800 validation / 10 universes; 5 capabilities × 160; `gaia2-mini` 160; test set private | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Grading | Llama 3.3 70B judge + exact match | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Baselines | numbers not extracted | UNKNOWN |
| In the repo | narrow-proxy adapter (BP-INV-07); Phase 3 HALT $4.09/invocation (CLAUDE.md §10 C-3) | CONFIRMED AT REVISION (BP-INV-07; `CLAUDE.md` §10 C-3) |
| Fit | general agent, not a professional deliverable; poor economics | PROPOSAL: keep for cost-projection |

### BP-EC-04 — GDPval (OpenAI)

| Field | Value | Status |
|---|---|---|
| Source | HF `openai/gdpval` (sha `11e7900c`, 2026-02-10); arXiv 2510.04374 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks | gold subset 220 / 44 occupations; rubrics for all tasks? | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Permission | HF card **without** a license tag | UNKNOWN (dataset terms) |
| Grading | blind pairwise human + experimental OpenAI hosted grader (cloud; inadmissible in KVARK mode D-03) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Baselines | not extracted | UNKNOWN |
| Fit | the best "economic value" narrative, but grading is not reproducible locally | PROPOSAL: optional later with human raters |

### BP-EC-05 — FORTE (AGI-Eval)

| Field | Value | Status |
|---|---|---|
| Source | MIT; created 2026-06-29, last push 2026-06-30, 20★ | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks | declared 180 / 15 professions; **15 demo tasks public** | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Grading | LLM-as-judge all-or-nothing; runner tied to OpenClaw (roadmap-only in Waggle) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Fit | 15 public tasks are insufficient; adapter H | PROPOSAL: no |

### BP-EC-06 — OdysseyBench (Microsoft)

| Field | Value | Status |
|---|---|---|
| Source | MIT; 18★; last push 2026-06-11; arXiv 2508.09124 | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Tasks | OdysseyBench+ 300 real + Neo 302 synthetic; Word/Excel/PDF/Email/Calendar; long-horizon memory | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Grading | LLM judge + rule-based cross-validation (OfficeBench Docker) | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) |
| Baselines | not extracted | UNKNOWN |
| Fit | directly relevant to the Hive Mind thesis (D-12), but low activity | PROPOSAL: candidate for a later memory-in-work study, not primary |

Candidates seen, **not evaluated** (UNKNOWN): Agents' Last Exam, OmegaUse-OfficeVal, Workspace-Bench 1.0, WorkBench Revisited, FORCE-Bench; TheAgentCompany (`docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md`, state as of May 2026, not revalidated 27.09.2026).

---

## 4. Selection of the primary professional-work test

### BP-SEL-01 — Primary test: **APEX-Agents 1.1** (PROPOSAL, not approved)

Criteria from BRIEF §13.1, in order:

1. **Pinnability** — dataset (HF sha), Harbor 0.20.0, three image digests, judge ID+temperature; all go into the manifest (§12). AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8) that all elements are public.
2. **Public tasks and rubrics** — 240/240 under CC-BY-4.0; FORTE has 15/180, GDPval has no license and a hosted grader. AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8).
3. **Open runner and scorer** — Harbor/Archipelago Apache-2.0; grading reproducible with a pinned judge. AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8). (The judge is a cloud model: limitation §4.2.)
4. **Artifact environment = knowledge work** — documents/spreadsheets/PDF/email/chat/calendar match D-06 and the reference vertical of BRIEF §4.2 (research brief, document production). AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8).
5. **Published frontier baselines on the same protocol** — 68.6% pass@1 (Claude Fable 5.1) enables the system-to-system row from §13.2 with a named configuration, without adopting someone else's protocol. AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §4, §8; as published; our reproduction of the protocol is a condition, §5.3).
6. **Does not require Waggle to win** — all messages from the §11 ladder are available. DECISION D-18.

### BP-SEL-02 — Why not the others as primary (PROPOSAL)

| Candidate | Reason |
|---|---|
| τ²-bench | customer-service tool domain ≠ knowledge-work deliverable; requires a cloud user-simulator; remains a secondary tool-use control |
| GAIA2 | generic agent; $4.09/invocation HALT (CLAUDE.md §10 C-3); test set private |
| GDPval | dataset license UNKNOWN; grading by humans/OpenAI |
| FORTE | 15 public tasks; OpenClaw runner |
| OdysseyBench | maintenance; memory-heavy — better as a later D-12 study |

### BP-SEL-03 — Conditions and risks of the primary selection (must go into the manifest and the decision queue)

| ID | Condition/risk | Status |
|---|---|---|
| BP-SEL-03a | The judge is a cloud model (DeepSeek-v4-Flash-0731). Cost and dependency. Replacing it with a local judge breaks comparability with the leaderboard → reported as a **separate profile**, never mixed. | PROPOSAL; judge profile: UNKNOWN — open: Q-05 (protocol-local, §15) |
| BP-SEL-03b | In KVARK mode (D-03) a cloud judge is not allowed; this protocol is for individual Waggle (BYOK D-05) on the bench machine, not for KVARK evaluation. | DECISION (D-03/D-05) |
| BP-SEL-03c | Docker/WSL2 only on the bench machine; the certified Windows desktop remains without Docker. | CONFIRMED AT REVISION (current release contract `CLAUDE.md` §1; not D-nn) |
| BP-SEL-03d | Waggle must go through the production sidecar (§6). An adapter that calls `runRetrievalAgentLoop` or LiteLLM directly (like BP-INV-07 and the bridge on the branch) does not qualify. | PROPOSAL — BRIEF DIRECTION (DIR-22) |
| BP-SEL-03e | Contamination firewall: rubrics and `solution`/reference files do not enter `.mind`, cache or prompt (§9). | PROPOSAL — BRIEF DIRECTION (brief §13.4) |
| BP-SEL-03f | Task-level scoring semantics (binary vs fraction) determine the statistical design (§10). | UNKNOWN — B1 closes |
| BP-SEL-03g | Whether the reference agent and Harbor can use a local OpenAI-compatible endpoint (Ollama/vLLM) for baseline B0 with Qwen. | UNKNOWN — B1 closes at the level of reading the reference agent's code; confirmation by a run in B2-PR0 (§7) |

### BP-SEL-04 — Secondary tests (PROPOSAL)

| Test | Role | Condition |
|---|---|---|
| τ²-bench (retail/airline) | tool-use control; efficiency/pass^k | adapter cherry-pick + **rewire of the bridge onto the production sidecar** (§14) |
| GAIA2 narrow-proxy | cost-projection only | no claim |
| LoCoMo same-judge (`recount.mjs`) | **regression gate for Hive Mind**, not a headline | manual gate before merging changes to recall rendering (F-HM-15) |
| Internal crash/resume/change-input acceptance (AT-07, AT-22) | production evidence, not a public benchmark | R08: LongWork public dataset DEFERRED, internal tests mandatory |

---

## 5. Hypotheses and two separate comparisons (BRIEF §13.2)

### BP-HYP — Hypotheses (PROPOSAL wording; frozen in B3)

| ID | Hypothesis | Type | Comparison |
|---|---|---|---|
| H-A1 | The same local model M through the Waggle production path (W-full) achieves a higher primary score than M through a minimal sufficient tool adapter (B0). | superiority, one-sided | system lift |
| H-A2 | Removing layer X (memory / skills / recipe-harness) from W-full lowers the primary score or increases cost/latency ("where the lift comes from"). | ablation, two-sided, secondary | system lift |
| H-B1 | W-full(M) against a fully named frontier configuration F on the same benchmark/protocol: **descriptive**, with an interval for the difference; non-inferiority only with a pre-specified margin δ. | descriptive / non-inferiority | system-to-system |
| H-C (optional) | pass^k reliability W-full ≥ B0 at k repetitions. | reliability | system lift |

Not a hypothesis: "Qwen became a better base model" (BRIEF §13.2, second column). Not a hypothesis: "beat frontier" (§11).

### BP-CMP-01 — Comparison 1: what Waggle adds to the same model (system lift)

| Arm | Definition | What is the same | Status |
|---|---|---|---|
| **B0 "raw + minimal sufficient tool adapter"** | the same model M (same ID, revision, quant, runtime, reasoning/`thinking` setting, context limit) through the benchmark's **official reference agent** (`apex_loop_truncated_tools_agent`) in the same Harbor environment, with all tools the environment provides (reading/writing files, spreadsheets, mail/chat/calendar applications). The baseline is **not deprived** of file access. | model, data, environment tools, timeout, number of attempts, judge | PROPOSAL (definition per §13.2 "minimal sufficient tool adapter") |
| **B0-chat "vanilla chat without tools"** | M with the prompt + file contents inserted as text, without tools. | — | PROPOSAL; **may be shown only under that name**, not as a controlled harness effect (§13.2) |
| **W-full** | M through `POST /api/chat` of the production sidecar (BP-INV-10) in an isolated Workspace with the task files; Waggle tools, skills, recall, recipe (work mode, strict/benchmark gates); artifacts are returned to the Harbor output directory for grading. | same M, same data, same judge | PROPOSAL; depends on W0/W1/W3 (§7) |
| **W−mem** | W-full without Hive Mind recall (production ablation flag, BP-INV-20 → W3 work). Note: tasks are independent and memory is clean by protocol, so what is measured here is the effect of *intra-task* memory (working context, RAWDETAIL) — not "knowledge from the past". | — | PROPOSAL; flag does not exist (NOT FOUND) |
| **W−skills** | W-full without marketplace/starter skills (native tools only). | — | PROPOSAL; flag UNKNOWN |
| **W−recipe** | W-full with the conversation path instead of the work recipe (no phases/gates), but with the same tools. | — | PROPOSAL; modes do not exist (BP-INV-21) |
| **W+evolved** | W-full with a promoted variant from the bounded registry (DIR-14), evolved **exclusively on the dev set**. | — | DEFERRED until W3e (F-EVO-04/06/07); depends on W3e-PR9 and scope approval ODB-02 (Delivery plan §6.1; AWAITS A FOUNDER DECISION); in B3 only in option B "W3e-PR9 in G2" (Delivery plan §4.3, §6.1 "ODB-02 — options"); without this arm there is no claim about the contribution of the recipe layer (BP-MSG-01) |

Rules: benchmark mode does not unlock broader data/tools/approvals (BRIEF §6.1); the full Waggle configuration **does not skip** the mandatory verify (DIR-03); an ablation flag **must not** disable strict verification (A25) in any arm that uses the Waggle recipe. W−recipe is not an ablation flag over verify but a separate arm on the `conversation` path, without gates and without a Waggle `ProofReceipt` (FRD-05.9 R1); therefore its result is never presented as verified work. Waggle status and `GateOutcome` records of the W arms enter the manifest per FRD-05.9 R11. Baseline B0 is scored by the same independent scorer, without the Waggle verification pipeline (§13.3).

Minimum for the first final run (§13.3 "do not require every combination"): **B0, W-full and one ablation that explains the lift** (proposal: W−recipe, because recipe/proof is the largest new layer of W1/W3; alternative W−mem). Choice of the ablation arm: UNKNOWN — open: Q-04 (protocol-local, §15).

The W−recipe arm measures the manual recipe/proof path from W3 (phases, gates, `ProofReceipt`), not bounded recipe evolution (DIR-14, W3e-PR9). The contribution of variant evolution is measured only by the difference W+evolved − W-full (BP-MSG-01). In options A and C from Delivery plan §6.1 ("ODB-02 — options") B3 has no W+evolved arm.

### BP-CMP-02 — Comparison 2: how it stands against a competing system (system-to-system)

| Variant | Definition | Boundary of the conclusion | Status |
|---|---|---|---|
| S2S-ref | reference to **someone else's published measurement** (APEX blog: Claude Fable 5.1 68.6% pass@1, Harbor 0.20.0, judge DeepSeek-v4-Flash-0731) with an explicit match check: dataset version, Harbor version, judge+temperature, pass@1 definition, number of attempts, reasoning budget, tools | "W-full(M) achieved X% on APEX-Agents 1.1 under the same runner/judge; the published reference for F is Y%" — without a claim of winning if the protocol was not identically reproduced | PROPOSAL |
| S2S-own | own run of frontier model F through the **same reference agent** (B0 with F) and, optionally, F through W-full | "W-full(M) vs B0(F) under conditions Z" — an API model in a neutral runner is **not** the finished Claude/ChatGPT product (§13.2) | PROPOSAL; budget: UNKNOWN — open: DQ-04 / Q-01 |

Prohibited wording: "beat frontier" from a single subdomain (e.g. corporate law only) or from different protocols (§13.5).

---

## 6. Production sidecar path requirement (DIR-22) and adapter contract

### BP-PROD — Mandatory requirements

| ID | Requirement | Evidence/link | Status |
|---|---|---|---|
| BP-PROD-01 | The adapter communicates with Waggle **exclusively** via `POST /api/chat` (`chat.ts:1541`) with `workspaceId`/`sessionId` (`chat.ts:75-77,614-654`) and, as needed, the existing workspace/session routes for file preparation. No direct import of the `@waggle/agent` loop in the adapter. | BP-INV-10 | contract PROPOSAL (implements BRIEF DIRECTION DIR-22) |
| BP-PROD-02 | The sidecar under test is built from a **frozen revision** (SHA in the manifest) with the same build chain as the product (`npm run build:packages` + sidecar bundle). Whether the packaged Windows installer sidecar is used (cannot run in Linux Docker) or the same SHA run on the bench host — **UNKNOWN — open: Q-06** (protocol-local); in both cases the manifest states the build command and hash. | CLAUDE.md §2 build commands | PROPOSAL; Q-06 |
| BP-PROD-03 | The adapter may: translate the task into a prompt + files, create an isolated Workspace, launch the run, wait for completion, collect the artifacts and trace. The adapter **must not**: change the system prompt, add tools/verification that the public application does not have, retry outside the production policy. | DIR-22 | PROPOSAL — BRIEF DIRECTION (DIR-22) |
| BP-PROD-04 | One sidecar process + one `WAGGLE_DATA_DIR` (BP-INV-11) per task (or reset per task and hash-verified; §9.3). | §13.4 run reset | PROPOSAL |
| BP-PROD-05 | The model endpoint is the same as for the user: managed Ollama runtime or a validated OpenAI-compatible endpoint (BRIEF §11.3). For Qwen 3.8 27B: the managed runtime pin `OLLAMA_TARGET_VERSION='0.32.3'` (`packages/server/src/local/managed-ollama-runtime.ts:28-29`) **predates** the first Ollama version with `qwen3.8:27b` (v0.32.12) → repin + pull/generate/tool test is a prerequisite (external.md §1.3). | external.md #2 | AUDIT FINDING — TO VERIFY |
| BP-PROD-06 | Every benchmark row carries the `turnId`/run identity from the production trace (BP-INV-09) for offline audit. | turn-context.ts | PROPOSAL |
| BP-PROD-07 | Egress in W-full arms: only the local model endpoint (or the BYOK provider when M is a cloud model in S2S-own) and nothing else; the benchmark host measures egress (BRIEF §16 "measurement of unapproved egress"). The judge call is made by Harbor, not by Waggle. **Setup egress** (outside the task): downloading embedding/reranker weights from HF and pulling the model through managed Ollama happen only while preparing the pre-seed copy of `<dataDir>/models` (§9.3), and are logged separately in `egress_log` (BP-MAN-15); the same call during a task = a violation of this requirement. | AT-28; §9.3 | PROPOSAL |
| BP-PROD-08 | Benchmark mode = production semantics `work`+`strict`/`benchmark` (DIR-03), without hidden permission changes. Until the modes exist (BP-INV-21), W-full is defined as "production chat turn after the W0 fixes, under the G1 strict flag (W0-PR8)" and is named as such: verify runs without opt-out (`WAGGLE_AUTO_VERIFY` and the run opt-out do not apply, FRD-05.9 R5/S5), self-reported evidence yields `FAIL` (R3/S4), and no `conditionalPolicy` yields `completed=true` (S3; W0-PR2). The outcome must not be more lenient than rows S1–S8/B1–B8 (R11). A W-full result obtained without these semantics (e.g., the default `work · normal` policy with CONDITIONAL completion or "Completed (verify skipped)") is not B3/benchmark evidence; it may be used only as a development B2 A/B signal and is labeled as such in the manifest (BP-MAN-08 `mode`). | §6.1 | PROPOSAL |

### BP-PROD-09 — What violates DIR-22 today (CONFIRMED AT REVISION)

| Artifact | Evidence | Conclusion |
|---|---|---|
| `benchmarks/gaia2/adapter.ts` (main) | `:31-37` imports `runRetrievalAgentLoop` from `packages/agent/src/retrieval-agent-loop.js`; header `:1-12` "NOT a full Gaia2 evaluation" | in-process loop, not the sidecar → cost-projection only |
| `benchmarks/tau2/bridge/waggle-bridge-server.ts` (branch) | `:15-21`: "It does NOT run @waggle/agent's runAgentLoop … ‘Waggle under test’ narrows to system-prompt assembly (the AGENT_INSTRUCTION wrap + frozen recalled memory)"; `:33` `HybridSearch, MindDB` from `@waggle/core` directly; `llm-client.ts:2,79` "Direct litellm /chat/completions client" | the bridge measures prompt-assembly + recall, not the product; the PILOT-RESULT itself (§"Harness fidelity ceiling") admits this |
| `benchmarks/gaia2/waggle-container/stub-core/` (main) | `stub-core/index.js:1-7`: "Path-A stub for @waggle/core — the ONLY 2 symbols runAgentLoop's runtime chain needs"; re-exports only `createCoreLogger` and `scanForInjection` from `@waggle/hive-mind-core/dist/*` so that `runAgentLoop` starts **without better-sqlite3/sqlite-vec**; `stub-core/package.json` presents itself as `@waggle/core` version `0.0.0-gaia2-stub` | CONFIRMED AT REVISION: an agent loop without the memory substrate and without the sidecar — exactly what A25 prohibits ("not stub-core"); never as "Waggle under test" |

### BP-PROD-10 — Bench machine topology (PROPOSAL, two options for Q-06)

| Option | Description | Advantage | Risk |
|---|---|---|---|
| T1 host-sidecar | Harbor container (task files + applications) on WSL2/Linux; Waggle sidecar on the host (Windows or WSL2) at the frozen SHA; model server (Ollama/vLLM) on the host GPU; the agent shim in the container calls the sidecar over the network; task files shared via a volume | closer to the Windows product; GPU directly | two file systems (mount semantics), network isolation |
| T2 sidecar-in-container | sidecar in a separate container (Node 22 + native `better-sqlite3`/`onnxruntime`), model server on the host | clean reset per task (new container) | the Linux build of the sidecar is not the packaged Windows sidecar; the manifest must say so |

---

## 7. Phases B1 / B2 / B3 (BRIEF §15.1 row B1–B3) and dependencies

| Phase | Goal | Inputs | Output / exit criterion | Tied to | Status |
|---|---|---|---|---|---|
| **B1 — selection and protocol** (= Delivery plan `B1-PR1`) | **documentation work, no installation and no paid calls:** close the evidence card open items that can be closed by reading code/documentation (BP-SEL-03f; BP-SEL-03g at the level of reading the reference agent), finalize this protocol; **define** the split (§9.1: stratification, seed, hash rule), the firewall rules and the assertion list (§9.2) and the manifest schema (§12). **Not in B1:** installing Harbor 0.20.0 + images and the ruler reproduction (→ `B2-PR0`), the adapter shim (→ `B2-PR1`, Delivery plan §2), cherry-pick from the branch (→ `W3-PR8`, §14) | this document; external.md | `B1-EXIT-1` evidence card with no "TO VERIFY" items that can be closed by reading (the remainder explicitly moved to B2-PR0); `B1-EXIT-2` split **rule** (stratification, seed, hash) defined — generation and hashes in B2-PR0, sealed never opened; `B1-EXIT-3` firewall rules + assertion list defined (implementation = W3-PR8 ADAPT + B2-PR1); `B1-EXIT-4` manifest schema (§12) filled in as an empty template for the dry-run; `B1-EXIT-5` rough per-task cost estimate from **public prices** (BP-COST-01/02) → input for the Q-01 cap for B2-PR0 (measurement only in B2-PR0) | **early G2** (Delivery plan §2 "B1 (early, G2)", §4.1 row B1 2–3 / 1–2 days, §4.2 G2 "B1 1–2"); does not touch the runtime and does not spend budget; the text may be written in parallel with W0, but it is booked in G2 | PROPOSAL |
| **B2 — development A/B** | **`B2-PR0` (entry step, off the critical path; Delivery plan §4.1.1 breaks it down into `B2-PR0a` setup / `B2-PR0b` ruler + deviation analysis / `B2-PR0c` split):** installing Harbor 0.20.0 + three images on the bench machine, reproducing the **ruler** — the reference agent with a publicly released model on a small sample, compared with the published number within tolerance; split generation + hashes; **the only part of B before W3 that consumes the judge API** → Q-01/DQ-04 cap before the start. **`B2-PR3` (A/B entry step, R16):** configuration/tuning of the target model (sampling, thinking, tool parser, ctx/KV) before A/B; depends on W6-PR6 (Ollama repin, DQ-05); tuning and calibration **only on the dev split** (BP-DATA §9.1, BP-FW; validation/sealed are not looked at), and the resulting configuration is frozen and hashed into the manifest (BP-MAN-03) before A/B. **Then** the first controlled A/B as soon as the vertical works (G2 condition, BRIEF §5.1): B0 vs W-full on the **dev** set, N_dev small; purpose = errors, task variance, cost estimate, timeout calibration, ProofReceipt level check; **not a public "beats" headline** (§13.3) | B2-PR0: only Q-01/DQ-04 approval and the bench machine (Docker/WSL2); B2 A/B: W0 fixes (F-HARN-01/02/03/04/08), minimal W1 run, W3 recipe + production adapter (`B2-PR1` shim), W6 target readiness (AT-20), **W6-PR6** (Ollama repin for the target; DQ-05) and **`B2-PR3`** target model tuning (R16) — the same set as Delivery plan §3 ("B2 A/B (depends on W3-PR7 + W6-PR6 + W2-PR1 + B2-PR3)") | `B2-EXIT-0` ruler reproduced or deviation explained; measured judge+model cost per task → input for the Q-01 cap for B2 A/B and B3; split generated, hashes in the manifest; `B2-EXIT-1` ≥1 complete paired dev run without an infra error class >X% (X from B2-PR0); `B2-EXIT-2` measured discordance rate and variance → power calculation (§10.7); `B2-EXIT-3` failure taxonomy filled in; `B2-EXIT-4` firewall assertions 0 violations; `B2-EXIT-5` validation set used for configuration selection at most **once**, with a view log | G2 (Delivery plan §4.1 row B1–B3 and §4.1.1: B2 **12–21 / 7–12** days (classic / AI) = B2-PR0a/b/c 1.5–3 / 1.5–2 + B2-PR1 (shim only; manifest/reset = W3-PR7) 2.5–4 / 1–1.5 + B2-PR2a (rework fixes after the dev run; R4) 1–3 / 0.5–1.5 + B2-PR2 2–3 / 1–2 + B2-PR3 5–8 / 3–5; §4.2 G2 "B2 7–12" incl. B2-PR0, B2-PR2a and B2-PR3; the B2 re-run (0–2 wd) and the validation run are wall-clock placeholders in the G2 chain (Delivery plan §3/§4.3); §4.2 G2 "External blockers": DQ-04 incl. the judge API quota for the ruler) | PROPOSAL |
| **B3 — locked study** | freeze the hypothesis, metric, N, budget, stopping criteria and analysis (preregistration hash, `preregistration.ts`), then a single run on the **sealed** set; publication of the methodology and results regardless of the outcome (§5.1 "A negative result is not a reason to skip publication") | freeze candidate SHA (same as the release candidate or explicitly named), W3e if "+evolved" is included | `B3-EXIT-1` prereg hash emitted before the first sealed call; `B3-EXIT-2` complete output + grader output + recount script saved and verified offline (AT-28); `B3-EXIT-3` claim wording chosen from the ladder in §11 according to the result; `B3-EXIT-4` manifest complete (§12) | G3 (performance-led message) | PROPOSAL |

Dependencies (CONFIRMED from phaseA): B2 A/B cannot measure "verified work" before F-HARN-01/02/03/08 (harness.refute.md "Dependency order"); W+evolved not before F-EVO-04/06/07; W−mem/W−skills/W−recipe not before the W3 ablation flags (BP-INV-20); B2 A/B not before the `B2-PR3` target model tuning, and `B2-PR3` not before W6-PR6 (Delivery plan §3). B1 has no runtime dependency, does not spend budget and can start right away; B2-PR0 (Harbor + ruler) does not depend on the W waves, it depends only on Q-01/DQ-04 approval (judge API) and the bench machine, so it does not extend the critical path W1 → W3 → B2 A/B → F2; per Delivery plan §4.3, `B2-PR3` also runs in parallel, off that path.

Alignment with Delivery plan v1.2 (critique correction, 27.09.2026): the earlier draft placed B1 in G1 and gave it a scope that the Delivery plan (§2 B1-PR1 "evidence card + protocol", §4.1 "B1 2–3 / 1–2", §4.2 G2 "B1 1–2") does not cover (Harbor setup, ruler run with judge cost, shim, cherry-pick). Both documents now hold the same schedule: B1 = documentation, early G2, no budget; Harbor + ruler = `B2-PR0` in G2 with a judge API quota under DQ-04; shim = `B2-PR1`; cherry-pick = `W3-PR8`. Delivery plan §4.1/§4.1.1 (critique pass 28.09.2026) gives B2 **12–21 / 7–12** (incl. the broken-down B2-PR0a/b/c 1.5–3 / 1.5–2, B2-PR1 as shim only 2.5–4 / 1–1.5, B2-PR2a rework fixes 1–3 / 0.5–1.5 — R4: fixes after the dev run are an engineering PR, while the re-run remains compute — and B2-PR3 target model tuning 5–8 / 3–5, R16), and §4.2 G2 "B2 7–12". Critic note (28.09.2026): the earlier "B2 7–10 / 4–6" was stale; without B2-PR3 the sum per Delivery plan §4.1.1 (PR1 as shim, with B2-PR2a) is 7–13 / 4–7 (correction 1.2.1: the earlier subtotals "7.5–12 / 4.5–7" and "6–10 / 3.5–5.5" did not include B2-PR2a). PROPOSAL (schedule), not approval.

Calendar: the protocol does not give a B3 completion date — **UNKNOWN** until Q-01/Q-02. The calendar schedule is carried by Delivery plan §4.3: B3 execution is a PROPOSAL placeholder of 10–20 wd wall-clock (`docs/plans/v1.2-evidence/inputs/S1-audit-2026-09-27.md:238`), and the G3 expert range (not P50) is 16–27 weeks from 27.09.2026 (variant a, B3 ‖ W7/W8: 17.01.2027–04.04.2027; with W3e-PR9 only under condition (a'), and with T_evo before B3 on the same machine 16–28) or 18–30 weeks (variant b, B3 serial: 31.01.2027–25.04.2027; with W3e-PR9 the same, and with the T_evo placeholder of 1–8 wd 18–32 weeks, until 09.05.2027), with no external gates and no pauses, and with unmeasured AI throughput (the range is from the AI column; classic sensitivity of G3 23–45 weeks; the first measurement is the F1 retrospective — Delivery plan §4.3, R4) (Delivery plan §4.3, critique pass 28.09.2026; the G2 chain now also carries the B2 rework/re-run and the validation run from §9.1). The S1 range of 12–17 weeks = 20.12.2026–24.01.2027 (BRIEF §15.2) serves for comparison only. A measured deviation of the B3 duration from the placeholder (§10.7; Q-01/Q-02) shifts G3 1:1 in variant (b); in (a) only while the B3 chain exceeds the effort-bound (Delivery plan §4.3: effort-bound G3 without W3e-PR9 18.3–31.2 wd, so a shorter measured B3 does not shorten G3 1:1). Critic note (28.09.2026): the earlier text gave 1:1 without a condition.

---

## 8. Recipe paths under test (link with W3, BRIEF §4.2)

| ID | Recipe | Why in the benchmark | Status |
|---|---|---|---|
| BP-REC-01 | research brief | reference vertical; APEX consulting/banking tasks have a research+analysis character | PROPOSAL (W3) |
| BP-REC-02 | document production (DOCX/XLSX/PDF artifact) | APEX deliverables are files; ProofReceipt level 1 (parsing, sections) and level 2 (numbers/dates/citations) are applicable (BRIEF §7.2; AT-21) | PROPOSAL (W3) |
| BP-REC-03 | mapping APEX task → recipe: the router chooses by `task-shape` (`packages/agent/src/task-shape.ts:145` exists; recipe selection is W3 work, F-HARN-09) | misclassification is a legitimate source of failure and must be counted (not manually rerouted) | PROPOSAL |

A recipe must not be changed after the B3 freeze; changing a recipe after looking at sealed results = a new study.

---

## 9. Data, contamination, run reset (BRIEF §13.4)

### 9.1 BP-DATA — Set split (PROPOSAL; numbers: UNKNOWN — open: DQ-04 / Q-02)

| Set | Purpose | Access rule | Size proposal (input for Q-02, not a decision) |
|---|---|---|---|
| **dev** | errors, prompt/recipe iteration, variant evolution (DIR-14), cost estimate | free; every run logged | stratified by 3 domains; order of magnitude 40–60 of 240 |
| **validation** | configuration selection/promotion before B3 | limited number of views (proposal: ≤2), each view in the view log with the configuration SHA | order of magnitude 40–60 |
| **sealed** | the only source of a public claim | 0 views before the prereg hash; one run per frozen configuration; every additional run = a new prereg | remainder (order of magnitude 120–160) |

Stratification: by domain (3) and, if APEX provides difficulty/type, by that as well; deterministic seed; the split file with its SHA-256 goes into the manifest. Tool: `split-builder.ts` from the branch (§14) is an ADAPT candidate (deterministic stratified split). "At least 30" from A17 is not evidence of sufficient power (BRIEF §10.5); N is derived from the B2 discordance/variance (§10.7).

Note on the holdout from `execution_traces`: the existing `verified` harness rows (F-HARN-06) and `positiveOutcomes ?? ['success','verified']` (`packages/agent/src/eval-dataset.ts:208`) **must not** be a source of benchmark examples nor of the evolution promotion holdout until trace qualification (BRIEF §7.3) exists. CONFIRMED AT REVISION.

### 9.2 BP-FW — Contamination firewall

| ID | Rule | Mechanism | Status |
|---|---|---|---|
| BP-FW-01 | Rubrics, `solution`/reference files and grader prompts never enter the Waggle Workspace, `.mind`, cache, skills or prompt. The adapter mounts **only** task input files. | mount allowlist in the shim; assertion before the run | PROPOSAL |
| BP-FW-02 | Each task gets a clean scope (new Workspace + data dir reset), unless the benchmark explicitly requires continuity (APEX does not). | §9.3 | PROPOSAL |
| BP-FW-03 | After each task: substring gate (normalized gold/rubric text vs everything Waggle wrote to the mind/artifacts) + embedding gate with a preregistered threshold; mind hash before/after; 1 row per assertion in `events.jsonl`. | `firewall/{normalize,substring-gate,embedding-gate,hash-mind,emit}.ts` from the branch (§14) — ADAPT | PROPOSAL |
| BP-FW-04 | Evolution (W+evolved) runs only on the dev set; the promoted version is frozen before validation/sealed; the registry version hash goes into the manifest. | DIR-14/15; the F-EVO-07 finding (no holdout) must be closed | DEFERRED until W3e |
| BP-FW-05 | Learning traces produced during evaluation serve diagnostics and are **not** used for the next task (the protocol does not permit it). | per-task reset | PROPOSAL |
| BP-FW-06 | A memory benchmark (LoCoMo/BEAM) gets the same permitted history per the protocol, not additional knowledge for Waggle only. | existing harness | PROPOSAL — BRIEF DIRECTION (brief §13.4) |

### 9.3 BP-RESET — Run reset manifest (what is reset per task and how it is proven)

| Item | Path/mechanism at `2af0904d` | Reset | Evidence |
|---|---|---|---|
| Personal mind | `<WAGGLE_DATA_DIR>/personal.mind` (`index.ts:565`) | new data dir | SHA-256 of the directory before start = "clean baseline hash" in the manifest |
| Workspace minds | `<WAGGLE_DATA_DIR>/workspaces/<id>/workspace.mind` (hivemind.md F-HM-12: `workspace-manager.ts:139-140`) | new data dir | same |
| Run registry | `agent-runs.json` (`index.ts:538`) | new data dir | same |
| Persona/spec overrides | `personas/<id>.json`, `behavioral-overrides/` (`index.ts:627`; evolution.md §0) | new data dir; for W+evolved: a **controlled** copy of the frozen version with its hash | hash of the override files in the manifest |
| Vault | `VaultStore(dataDir)` (`index.ts:639`) | new data dir with **test** keys; never user accounts (§13.6 "do not send real business emails") | list of keys without values |
| Pending/held actions, cron | `CronStore` writes to the `cron_schedules` table **inside `personal.mind`** (`packages/core/src/cron-store.ts:386` `DELETE FROM cron_schedules`; construction `new CronStore(multiMind.personal)` in `packages/server/src/local/index.ts:585`); held actions per durable.md F-DUR-05 (`loop-executor.ts`) | new data dir (covered by the `personal.mind` reset) | CONFIRMED AT REVISION — same hash as the "Personal mind" row |
| Harness in-memory state | `activeHarnessRuns` process-global Map (`workflow-tools.ts:447`) | new sidecar process per task (BP-PROD-04) | PID/start time in the manifest |
| Embedding/model cache | production sidecar: embedder `cacheDir = <dataDir>/models` (`packages/core/src/config.ts:436` `path.join(this.configDir, 'models')`; `new WaggleConfig(fullConfig.dataDir \|\| undefined)` in `packages/server/src/local/index.ts:762-764`; certify checks it: `scripts/certify-windows-installer.ps1:2904` `$dataDir\models\Xenova\all-MiniLM-L6-v2\onnx\model.onnx`), reranker `<dataDir>/models/reranker` (`index.ts:791-792`, `waggleHome = fullConfig.dataDir \|\| ~/.waggle`) → **inside** `WAGGLE_DATA_DIR`; the default `~/.waggle/models` (`packages/hive-mind-core/src/mind/inprocess-embedder.ts:33`) applies only to standalone callers without `cacheDir` and to an empty `dataDir` (`config.ts:192-195`); the lock file `modelLoadLockPath` is written into `cacheDir` (`transformers-model-load.ts:27-32`) | do **not** reset the weights (they are not task knowledge). With a new data dir per task (BP-PROD-04), the sidecar would re-download them from HF for every task (embedding ~90 MB, `inprocess-embedder.ts:36`; reranker ~22 MB, `inprocess-reranker.ts:58`): the weights would be reset anyway, egress against BP-PROD-07 would occur, and additional wall-clock would be added. **Run reset step (PROPOSAL; unit of work `W3-PR7` "run reset", within its 4–5 / 1.5–2 eng-days — Delivery plan §2, §4.1.1):** preseed `<dataDir>/models/` from a verified local copy into every clean data dir before the sidecar starts; per-file hash in the manifest (BP-MAN-12), **outside** the data dir clean-baseline hash. The alternative, a shared read-only cache via configuration, currently has no knob other than `configDir`/`dataDir` (`config.ts:429-444`; `index.ts:791-792`), and the lock file is written into `cacheDir` → requires a code change (UNKNOWN; not planned — if chosen instead of the preseed, it goes into `W3-PR7` **outside** the 4–5 / 1.5–2 figure and, since W3-PR7 is on the G2 critical path, shifts G2 1:1; Delivery plan §4.1.1) | CONFIRMED AT REVISION path `<dataDir>/models` (code reading); per-task re-download and HF egress = AUDIT FINDING — TO VERIFY (not run; setup egress in BP-MAN-15); a separate query/embedding *result* cache UNKNOWN — B1 grep over `mind/`. Critic note (28.09.2026): the earlier row claimed "outside `WAGGLE_DATA_DIR`" — incorrect for the production sidecar. Critic note (second pass, 28.09.2026): the preseed/cache work had been attributed to `B2-PR1`, which in the Delivery plan is reduced to the shim only — redirected to `W3-PR7` |
| Ollama model store | managed runtime (BP-PROD-05): models `<dataDir>/models/ollama`, runtime `<dataDir>/runtimes/ollama` (`packages/server/src/local/managed-ollama-runtime.ts:603-604`; `dataDir` from `packages/server/src/local/routes/local-inference.ts:165-169`) → **inside** the data dir; an external endpoint (the user's Ollama/vLLM) is outside the data dir | do not reset; for the managed runtime the same preseed as in the row above (a copy of the store, outside the clean-baseline hash) — otherwise a model re-pull per task (Qwen 3.8 27B Q4_K_M 16.5–18 GB, BP-COST-08); model digest in the manifest | `ollama show` digest; CONFIRMED AT REVISION path; per-task effect AUDIT FINDING — TO VERIFY (earlier "outside the data dir" — incorrect for the managed runtime) |
| Task files | Harbor volume | new container per task (Harbor standard) | image digest |
| Writes outside `WAGGLE_DATA_DIR` (addendum 1.2.1, H-05) | at `2af0904d` under `os.homedir()/.waggle`: `workspaces/<id>/documents.json` and `pins.json` (`packages/server/src/local/routes/documents.ts:37`, `routes/pins.ts:32`), marketplace `skills/`, `plugins/` (`packages/marketplace/src/installer.ts:47-50`), `security-cache` (`packages/marketplace/src/security.ts:183,222`), adapters (`packages/agent/src/tool-manifest-loader.ts:141`) — CONFIRMED AT REVISION (code reading), runtime not reproduced | a new data dir does **not** reset them; the fix is W0-PR20 (G1), code not fixed; until then BP-INV-11 is not full isolation, and every run goes only in the safe test profile ([SAFE-IMPLEMENTATION-CHECKLIST](SAFE-IMPLEMENTATION-CHECKLIST.en.md), BTP) | PROPOSAL: the B2/B3 candidate contains W0-PR20 with a green sentinel test; without it, task X/Y isolation (AT-28) is not proven |

Rule (BRIEF §13.4): the reset covers `.mind`, caches, persisted artifacts, actions and knowledge from previous examples, with a verifiable manifest. If "cleanup" is used instead of a new data dir, there must be a hash comparison with the clean baseline; otherwise the result is unqualified.

---

## 10. Metrics and statistical design per metric (BRIEF §13.5; A25 "McNemar/TOST are not mandatory for every metric")

### 10.1 BP-MET — Metrics

| ID | Metric | Type | Source | Status |
|---|---|---|---|---|
| BP-MET-01 | **Primary:** APEX task score pass@1 (as defined by Harbor/the rubric) | binary per task **or** fraction of criteria — UNKNOWN (BP-SEL-03f) | grader output | PROPOSAL |
| BP-MET-02 | pass^k (all k attempts successful) | binary per task | k repetitions | PROPOSAL; k: UNKNOWN — open: Q-03 (protocol-local) |
| BP-MET-03 | Cost per task (model USD or local compute units), tokens in/out | continuous, right-skewed | production trace + manifest prices | PROPOSAL |
| BP-MET-04 | Latency per task (wall clock), number of tool calls, retries | continuous | trace | PROPOSAL |
| BP-MET-05 | ProofReceipt level reached (0/1/2/3, BRIEF §7.2) and whether "COMPLETED" was correct (gate_passed vs verified) | ordinal | server ledger (after W0/W1) | PROPOSAL; depends on the F-HARN fixes |
| BP-MET-06 | Failures by class: model / tool / infra / budget / evaluator (BRIEF §7.3) | categorical | failure taxonomy (BP-INV-04) | PROPOSAL |
| BP-MET-07 | Egress events outside permitted destinations | count | host measurement | PROPOSAL (AT-28) |
| BP-MET-08 | Judge stability: agreement of repeated judge calls on a subsample | κ / % agreement | `computeFleissKappa` (BP-INV-02) | PROPOSAL |

### 10.2 BP-STAT — Statistical procedure per metric

| Metric | Design | Test/interval | Why that one | Do not use |
|---|---|---|---|---|
| pass@1 **binary**, paired per task (B0 vs W-full) | paired | **exact McNemar** on discordant pairs + **paired difference CI** via cluster bootstrap (cluster = task family/domain; the existing `computeClusterBootstrapCI`, and the `PairedRow` design from the branch) | binary paired outcome; dependence within a domain | independent χ² / two-sample z-test (ignores the pairing) |
| pass@1 **fraction of criteria** (0..1) | paired | paired mean difference with bootstrap CI (cluster); Wilcoxon signed-rank as a robustness check | not binary → McNemar not applicable | McNemar |
| pass^k | paired binary | same as binary pass@1; also report pass@k to show the pass@k vs pass^k gap (the APEX authors highlight it) | — | mixing pass@k and pass^k in one number |
| cost, tokens, latency | paired, log scale | difference of log values with bootstrap CI; median and IQR; "×" ratio as the point estimate | right-skewed; the ratio is the natural message ("~N× cheaper") | t-test on raw USD |
| system-to-system H-B1 descriptive | independent (S2S-ref) or paired (S2S-own on the same tasks) | Wilson CI for each arm (`computeWilsonCI`); for paired S2S-own: paired difference CI | the leaderboard number has no per-task data → intervals only | a claim of a difference without paired data |
| non-inferiority / equivalence (only if H-B1 is preregistered that way) | paired | 90% paired CI within [−δ, +δ] (TOST logic; `equivalence-tost.ts` from the branch) with a **prespecified** δ and a power calculation | "no difference detected" ≠ "they are the same" (DIR-23) | p>0.05 as "matches" |
| ProofReceipt level | ordinal | distribution per arm; paired sign test on the level change | — | average level |
| failure classes | categorical | proportions with Wilson CI; no inference | diagnostics | — |
| judge stability | repeated measurement | Fleiss κ / % agreement on a subsample of n_j tasks × r repetitions | evaluator variability must go into the analysis (§13.5) | assuming a deterministic judge |

### 10.3 BP-STAT-MULT — Multiple comparisons and candidates

- One **primary** hypothesis (H-A1) and one primary outcome; everything else is secondary, with Holm correction within the family (PROPOSAL).
- The number of observed candidates (configurations) before the sealed run is recorded in the manifest; repeated selection on the validation set over time makes it part of the optimization (BRIEF §10.5) → view log (§9.1).
- Stochastic seeds: pin the seed where the runtime allows it; where it does not (thinking models), report k repetitions and pass^k.

### 10.4 BP-STAT-STOP — Stopping criteria (frozen in B3)

- Infra error class > threshold → pause and fix before continuing, without dropping tasks from the denominator (errors do not disappear because the scorer returns `null`, DIR-15).
- Budget cap reached → the study is reported as incomplete with N_reached; no "retroactive" reduction of N.
- Firewall violation → the row is marked as contaminated and **remains** in the report as such.

### 10.5 BP-STAT-PROOF — Three verification levels, not one boolean (BRIEF §7.2)

The benchmark grader scores the content (level 3 equivalent); Waggle's ProofReceipt level 1–2 is reported separately and does **not** enter the primary score. Comparing "ProofReceipt claims COMPLETED" vs "grader says pass" gives a measure of false-positive completions (BP-MET-05) — this is production quality, not a benchmark headline.

### 10.6 BP-STAT-FAIL — Separating failures

Model (wrong content), tool (exit≠0, tool timeout), infra (sidecar/model server crash, network), budget (token/cost cap), evaluator (judge error/timeout). The existing `failure-taxonomy` module (BP-INV-04) is an ADAPT candidate; infra and evaluator failures are reported and are **not** counted as "model fail" (F-EVO-06 shows the opposite pattern in the evolution code — do not repeat it).

### 10.7 BP-STAT-N — How N is derived (input for Q-02)

For a paired binary outcome: the required N depends on the expected discordance rate p_d and the target difference Δ (McNemar power); for non-inferiority, on δ and the variance of the difference. Both parameters are **measured in B2** (dev/validation), not assumed. The branch has a helper "powered TOST sample-size (gap + DEFF aware)" (commit `79381854`) — an ADAPT candidate only if non-inferiority is preregistered. Note from history: N=114 τ² pilot, p=0.110 n.s. (branch, `PILOT-RESULT-2026-06-30.md` §"UPDATE — N-bump") — carried over **only as a warning** (DIR-23), not as an input for the APEX N.

---

## 11. Ladder of permitted messages (DIR-23; BRIEF §13.5)

| Level | Condition (all must hold) | Permitted wording | Prohibited |
|---|---|---|---|
| L0 | the study has not been run or is dev/validation only | "Hypothesis: … Measurement in progress." | any number as a result |
| L1 | sealed run executed; the paired CI of the difference W-full − B0 covers 0 | "In this sample (N=…, APEX-Agents 1.1, Harbor 0.20.0, judge …) a difference between Waggle and the baseline **has not been established**." | "they are the same", "matches" |
| L2 | sealed run; paired CI of the difference > 0 (lower bound > 0) on the primary metric | "**Measured lift** of X pp [CI a–b] relative to our baseline (same model M, reference agent) on APEX-Agents 1.1 under conditions Z." | generalization to other benchmarks/models |
| L3 | preregistered margin δ; 90% paired CI ⊂ [−δ, +δ] relative to the named configuration F on the **same** protocol (S2S-own) | "**Confirmed non-inferiority** within ±δ pp relative to configuration F (model, agent, runner, judge) on APEX-Agents 1.1." | "frontier-class" without stating F and δ |
| L4 | paired CI of the difference W-full(M) − B0(F) > 0 on the same protocol, sealed, preregistered | "**Outperformed configuration F** on the APEX-Agents 1.1 benchmark under conditions Z (N=…, CI …)." | "beat frontier", "beats Claude/ChatGPT" (an API model in a runner is not a finished product) |
| L-cost | deterministically measured in the same run | "~N× lower cost per task (median) with an [L1/L2/L3] outcome on quality; local compute reported separately." | "free" for a local model |

Additional rules: no message from a subdomain (e.g., corporate law only) presented as an overall one; no comparison with a leaderboard number as a "win" (L4 requires S2S-own); a negative or L1 result is **published** together with the methodology (BRIEF §5.1). "Matches" from S1 C18 is **corrected** to the L1 wording until L3 exists (BRIEF §17 C18).

**BP-MSG-01 — Attribution rule for the bounded recipe evolution layer (PROPOSAL; revision 1.2.1, H-10).** The layer is W3e-PR9a..e: the registry of approved variants of the research/document procedure and the promoted variant (DIR-14, PRD-10-13, FRD-08.5).

1. The result of a configuration without this layer is not evidence of its contribution. This applies to every B2 or B3 run on a SHA that does not contain W3e-PR9a..e, to W-full without a promoted variant and to the W−recipe ablation. W−recipe measures the manual recipe/proof path from W3, not variant evolution.
2. A measurable contribution of the layer may be claimed only from the difference W+evolved − W-full. Both arms must be on the same frozen candidate (same SHA, model, runtime and protocol), on the sealed set and preregistered. The wording follows the levels of this section (L1 or L2), applied to that difference, with W-full as the comparison baseline.
3. The paired promotion result on the dev/holdout set (W3e-PR9c, AT-29 recipe part) is internal evidence that the promotion is correct. For a public message it is level L0: no number as a result.
4. Without the measurement from item 2 only the functional claim "Waggle compares and explicitly promotes approved variants of the research/document procedure" is permitted. Condition: ODB-02 = yes and the AT-29 recipe part passed on a qualified candidate (F3). If ODB-02 = no, not even that claim is permitted (PRD-10-13).
5. A B3 result on the F2 SHA without the layer describes that configuration. If the layer arrives after F2, the F2→F3 carry-forward review (Delivery plan §4.3, §5) lists it as a changed measured surface. The B3 message then stays tied to the F2 SHA and is not attributed to the layer.

---

## 12. Manifest fields (BRIEF §13.6, A25) — BP-MAN

Basis: the `benchmarks/harness/src/preregistration.ts` payload (`manifest_hash`, `manifest_path`, `manifest_locked_at`, `dataset_version/path/instance_count`, `per_cell`, `judge_tiebreak`, `judge_models[]` with `pinning_surface`) — CONFIRMED to exist; it is extended with the fields below (PROPOSAL).

| ID | Field | Note |
|---|---|---|
| BP-MAN-01 | `code_sha` (40 hex), `tree_clean: true`, build commands and the sidecar bundle hash | the prereg checklist from the branch (`gate/prereg-checklist.ts:1-11`) requires a clean tree — ADAPT |
| BP-MAN-02 | `installer_sha256` if the packaged sidecar is used; otherwise `sidecar_build: {cmd, node_version: 22.23.2, hash}` | Q-06 |
| BP-MAN-03 | `model`: `{id, hf_sha, quant, format, runtime: {name, version, digest}, thinking/reasoning_effort, context_limit, max_output_tokens, temperature/seed}` — for the target `Qwen/Qwen3.8-27B` sha `1d4bf0f2ff6012fd82039f2fa52739d0dd7c60c0`, Ollama tag+digest; for the control `Qwen/Qwen3.6-35B-A3B` sha `995ad96e…` and the **route** (local vs DashScope, `litellm-config.yaml:211-215`) | external.md §1; C19 "do not carry a score over between configurations" |
| BP-MAN-04 | `frontier_config` (S2S): `{provider, model_id, snapshot, reasoning/effort, agent, runner}` or `reference: {url, date, number}` | §5 |
| BP-MAN-05 | `hardware`: GPU model/VRAM, RAM, CPU, OS/WSL2, driver; from `hardware-detect.ts` where it has coverage (NVIDIA/Apple), manually otherwise | BP-INV-13 |
| BP-MAN-06 | `dataset`: HF id + sha, Harbor version, image digests, split file SHA-256, `sealed_view_count: 0` until the prereg, `validation_view_log[]` | §9.1 |
| BP-MAN-07 | `scorer`: judge model id/version/temperature, rubric version, `judge_out_tag` (fresh per judge pass), r repetitions | project memory on the fresh OUT_TAG; BP-MET-08 |
| BP-MAN-08 | `waggle_config`: recipe ID/version, skills list+hash, connectors (none live), persona/spec override hash, ablation flags, mode (`work`/`strict`/`benchmark`), token/context budget, timeout, retry policy, pause/recovery mode | §5, §8 |
| BP-MAN-09 | `baseline_config`: reference agent commit, tools, prompt, same model parameters | §5 |
| BP-MAN-10 | `attempts/seeds`, `k`, timeout per task, `max_steps` | §10 |
| BP-MAN-11 | `outputs`: paths to complete artifacts, traces (`turnId`), grader outputs, `events.jsonl` with firewall assertion rows, `recount` script + EXPECT | AT-28 |
| BP-MAN-12 | `reset`: per-task clean baseline hash of the data dir (without `models/`), per-file hash of the preseeded `<dataDir>/models/` (embedding, reranker, managed Ollama store), sidecar PID/start | §9.3 |
| BP-MAN-13 | `cost`: per item from §13 with the price source (URL + date) | A29 |
| BP-MAN-14 | `deviations[]`: every change to the official runner/scorer (FR-OSS-10 from FRD v1.1 §18; PRD v1.1 §14 "Benchmarks" / PRD v1.2 §15, PRD-15-02) | disclose |
| BP-MAN-15 | `egress_log`: permitted destinations and measured traffic; `setup_egress` (model preseed: HF embedding/reranker, managed Ollama pull — source, size, hash) kept separate from task egress | AT-28; §9.3, BP-PROD-07 |
| BP-MAN-16 | `prereg`: `bench.preregistration.manifest_hash` event time, hash, who approved | BP-INV-03 |

---

## 13. Cost, budget and N (UNKNOWN — open: DQ-04 / Q-01, Q-02; BRIEF §13.6, §20.3)

### 13.1 BP-COST — Cost items (nothing is "zero")

| ID | Item | How it is measured | Price source | Status |
|---|---|---|---|---|
| BP-COST-01 | Judge API (DeepSeek-v4-Flash-0731) per task × arms × k × r | tokens from the Harbor log | official DeepSeek price — **not verified** in external.md | UNKNOWN (B1 checks the price from a public source; the B2-PR0 ruler measures tokens per task) |
| BP-COST-02 | Frontier model for S2S-own (e.g., Claude) | tokens × price | official 27.09.2026 (external.md §6): Opus 4.6/4.7/4.8 = $5/$25, Sonnet 5 = $2/$10, Fable 5.1 = $10/$50, Haiku 4.5 = $1/$5 per MTok | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §6, §8) prices; choice of F: UNKNOWN — open: Q-07 (protocol-local) |
| BP-COST-03 | Local compute for Qwen: GPU hours × (hardware amortization + energy), measured on the bench machine | time per task × power | internal assumption in the manifest | UNKNOWN — to be measured |
| BP-COST-04 | Control Qwen3.6-35B-A3B if it goes via DashScope | tokens × price | `models.json:7-8` 0.20/0.80 not revalidated | UNKNOWN |
| BP-COST-05 | **Error in the repo:** `benchmarks/harness/config/models.json:61-67` `qwen3.6-35b-a3b-local` price 0.0/0.0 and `packages/agent/src/cost-tracker.ts:28-30` Opus 15/75 (3×), `:32` Sonnet 5 3/15 (1.5×), fallback `:66` — **do not use these tables for a claim**; fix before B2 (F-REL-06 smallest change = scope of Delivery plan W0-PR13: 4 rows + Haiku 3.5 `:39-40` (→ $0.80/$4 or a retired label) + fallback + test + `models.json`) | — | CONFIRMED AT REVISION |
| BP-COST-06 | τ² user-simulator (only if the secondary test runs) | tokens × price | — | UNKNOWN — open: DQ-04 / Q-01 (only if the secondary τ² test runs) |
| BP-COST-07 | Human work: judge adjudication on a subsample, adapter code review, analysis | hours | — | UNKNOWN |
| BP-COST-08 | Bench machine: Docker/WSL2 setup, disk (images + Qwen 3.8 27B Q4_K_M 16.5–18 GB, Q8 29–30 GB; external.md §1.2–1.3) | one-time | — | AUDIT FINDING — TO VERIFY (live 27.09.2026, source: external.md §1.2–1.3, §8) sizes |
| BP-COST-09 | Model download and managed Ollama re-pin (≥0.32.12; reasonably ≥0.32.15) + new router/installer receipt (CLAUDE.md §1) | engineering days | — | AUDIT FINDING — TO VERIFY |

### 13.2 BP-BUDGET — Estimation formulas (inputs are filled in by B1/B2)

- `cost_B3 ≈ N_sealed × grane × k × (c_model_grana + c_judge × r) + c_infra + c_human`
- `cost_B2 ≈ N_dev_run × 2 × (c_model + c_judge)` per iteration × number of iterations
- `c_model` for local Qwen = `t_task × P_GPU × cena_energije + amortizacija`; it is not 0.
- Historical order of magnitude (as a warning only, a different benchmark): τ² pilot opus ~$0.56/task vs qwen ~$0.022/task agent cost (branch, PILOT-RESULT) — **do not carry over to APEX** (longer tasks, different judge).

### 13.3 What is open here — UNKNOWN (decision queue §15)

Budget cap (Q-01), N per set (Q-02), k and r (Q-03), ablation arm (Q-04), judge profile (Q-05), production build topology (Q-06), frontier F and S2S-own (Q-07), model/quant/hardware pin (Q-08), δ (Q-09), publication condition (Q-10), APEX as primary (Q-00).

---

## 14. What the old branch `feature/harness-sota-bench` contributes (cherry-pick, not rebase)

State (CONFIRMED AT REVISION, release-oss.md F-REL-12 + `git diff --name-status` here): `origin/feature/harness-sota-bench` @ `18e5b36a` (2026-07-01); 66 commits ahead, 2022 behind `main`; merge-base `33a92354`; 121 files, +21435/−4; all files except 8 are **A** (they do not exist on main) → additive, no conflict; a conflict is certain only for `packages/agent/src/cost-tracker.ts` (+test).

| ID | Commits | Files | Decision for the protocol | Status |
|---|---|---|---|---|
| BP-CP-01 | `37fa8142`, `68fb47e3`, `dc278462`, `44e7d50c`, `fc61c636`, `e2287e8d`, `8e0a2b3e` | `benchmarks/harness/src/firewall/*` + `tests/firewall/*` (barrel `firewall/index.ts:1-8`: normalize, artifact, substring gate, embedding gate, hashMind, emit) | **ADAPT** for BP-FW-03; extend the "artifact kinds" contract to Waggle Workspace files/DOCX outputs | PROPOSAL |
| BP-CP-02 | `0f7d82b3`, `83edcb50`, `4fdaa67a`, `787952a2`, `fab0f0f1`, `f07148da`, `024f3394` | `benchmarks/harness/src/gate/{preflight,prereg-checklist,ruler-validation,index}.ts` + fixtures (`preflight.ts:1-13`: "priced run MUST NOT start unless this is green"; `prereg-checklist.ts:1-11`: clean tree + SHA) | **ADAPT** for the B2-PR0 ruler (§7) and the B3 freeze gate | PROPOSAL |
| BP-CP-03 | `967727b4`, `eb77bb7b`, `78072088`, `79381854`, `ced5a4b2` | `stats/equivalence-tost.ts` (+ 1-line export in `stats/index.ts`) — paired cluster-bootstrap difference CI, TOST, power helper (`equivalence-tost.ts:1-24`) | **ADAPT**: the paired difference CI is generally useful (§10.2); TOST **only** if H-B1 is preregistered as non-inferiority (A25: not blanket) | PROPOSAL |
| BP-CP-04 | `0404b106`, `4e8a6046`, `7a2e15ea`, `4d6a5c49`, `14b9bd1b`, `45fc53d4`, `19676850` | `benchmarks/harness/src/continual/*` (split-builder, mind-build/hash, overlap-audit, arm-runner) | **ADAPT** `split-builder` (deterministic stratified split, §9.1) and `mind-hash`; `arm-runner`/`mind-build` are τ²-specific (memory-ON/OFF with a frozen mind) — reference | PROPOSAL |
| BP-CP-05 | `7bec6062`, `56401547`, `daba32d6`, `9a653947`, `3a0842cc`, `227805a5`, `84527a87`, `9750ea3a`, `ca931116`, `cee97a47`, `be855789`, `cc580777` | τ² adapter: `benchmarks/harness/src/tau2/*`, `benchmarks/tau2/{VENDOR.md (pin 5ebebbe8…, MIT), scripts/vendor.sh, agent/*.py, bridge/*}` | **ADAPT shell** (vendor pin, argv builder, results/oracle parser, JSONL emitter) for the secondary test; **do NOT carry over the bridge (`waggle-bridge-server.ts`, `llm-client.ts`) as "Waggle under test"** — it violates DIR-22 (§6 BP-PROD-09); it must be rewritten to call `POST /api/chat` | PROPOSAL; the Python files are a dev tool, not part of the no-Python package (BRIEF §14) |
| BP-CP-06 | `e251bf3c`, `ddb7f5b0`, `dcbc42a7`, `ea078769` | `models.json`, `litellm-config.yaml` (+66 lines, clean patch) | **ADAPT with price correction** (F-REL-06); do not introduce "local = 0" | PROPOSAL |
| BP-CP-07 | `fe7804bf` | `packages/agent/src/cost-tracker.ts` + test | **SKIP** — it would delete the reservation ledger (`ModelSpendBudget`, `BudgetPricingUnavailableError`) and has the wrong price for 4.7 (15/75) | CONFIRMED AT REVISION (F-REL-06/12) |
| BP-CP-08 | `9eb454bd`, `16b4dc3d`, `df159ac2`, `18e5b36a` | `benchmarks/tau2/results-retail-pilot/*` (N=50 → N=114, McNemar p=0.077 → 0.110 n.s.) | **ARCHIVE** with the label "difference not confirmed; the bridge is not the production path" — never as a result (DIR-23, C18) | PROPOSAL — BRIEF DIRECTION (brief §13.5) |
| BP-CP-09 | `75303ac1`, `4d2ab660`, `fb5840c3`, `b3501c46`, `85bd1e59`, `4e751fd5` … | `docs/plans/harness-sota-recon/*` (00–15 + recon) | **REFERENCE**; the founder ratifications in `10-PREREGISTRATION-PARAMETERS.md` (δ=±5pp primary, ±3pp descriptive; `banking_knowledge` cell; ruler anchor banking×GPT-5.5=37.37; AppWorld arm; subject Qwen3.6-35B-A3B) are tied to the old τ² design and to a subject model that is no longer the target (D-15) → **they are not carried over**; they go into Q-09/Q-07 as historical input | DEFERRED |

Note: the branch also has `tests/frontier-baseline-smoke.test.ts` (env-gated, spends money) and the `ddeee231` pre-spend smoke — carry them over only with a clear env gate.

---

## 15. Decision queue (UNKNOWN — open; PROPOSAL + impact; nothing from D-01..D-18 is requested again)

| # | Open | Recommendation (PROPOSAL) | Impact if not decided | What is not open |
|---|---|---|---|---|
| Q-00 | APEX-Agents 1.1 as the primary test | yes, subject to the conditions of §4 BP-SEL-03 | B1 cannot pin the dataset/runner | the need for an executed fair study (D-18) |
| Q-01 | Budget cap (API + GPU + human) for the B2-PR0 ruler, B2 A/B and B3 (= Delivery plan DQ-04) | cap per phase; B2-PR0 ruler small (first paid step; B1 is cost-free); B2 A/B and B3 cap after the B2-PR0 measurement | nothing paid starts (DIR-01) | — |
| Q-02 | N per set (dev/validation/sealed) | derive from the B2 discordance; the §9.1 range is an input | B3 cannot be preregistered | "≥30" and "N≈1500" are not mandatory (A17, §13.6) |
| Q-03 | k repetitions (pass^k) and r judge repetitions | k≥2 on a subsample if the budget allows; r≥2 on a calibration subsample | reliability and evaluator variance remain unreported | — |
| Q-04 | Which ablation arm goes into the first final run | W−recipe (alternative W−mem) | "where the lift comes from" remains unverifiable | at least one ablation (§13.3) |
| Q-05 | Judge profile: official cloud judge (comparable with the leaderboard) vs local judge profile (separate) | official for the public claim; local as an additional profile if requested | BYOK budget vs comparability | KVARK without a cloud judge (D-03) |
| Q-06 | What the "production sidecar" is on the bench machine (T1 vs T2, §6 BP-PROD-10) | T1 host-sidecar on Windows/WSL2 with the same SHA; the manifest states the build | DIR-22 compliance disputed | DIR-22 itself |
| Q-07 | Frontier configuration F for S2S and whether S2S-own is done | S2S-ref mandatory; S2S-own if Q-01 allows, F = the closest to the publicly released one (Claude family) | L3/L4 messages unavailable | "API model ≠ finished product" |
| Q-08 | Model/quant/runtime/hardware pin for the target (Qwen 3.8 27B: Q4_K_M vs Q8; Ollama repin; ctx budget; GPU class) and the control (Qwen3.6-35B-A3B local vs DashScope) | Q4_K_M on the 24 GB class as a working assumption, to be measured (external.md §1.4); repin ≥0.32.15; H200 FP8 server measurements (LM TEK program) are neither a substitute nor a B2 profile (PRD-13-10 pt.6) | B2 cannot start with the target model | target Qwen 3.8 27B-class (D-15) |
| Q-09 | Margin δ for non-inferiority, if H-B1 is preregistered that way | postpone until the B2 variance; the historical ±5pp is an input, not a decision | L3 unavailable | — |
| Q-10 | Publication condition: publish the methodology and result regardless of the outcome; who signs off the wording from §11 | yes (publication regardless of the outcome already follows from BRIEF §5.1 and §11 "Additional rules"); the message level L0–L4 is determined by the §11 conditions from the executed result, and the wording is signed off by the Benchmark owner with an independent review — **protocol-local** per the Delivery plan §6 map, not a founder DQ; the public name/GO for release remains DQ-01 | risk of marketing running ahead of the result (§5.1) | a negative result is not hidden (BRIEF §5.1) |

---

## 16. Acceptance links (BRIEF §16)

| AT | How this protocol covers it | Phase |
|---|---|---|
| AT-28 | production path (§6), task X/Y isolation (§9.2–9.3), manifest + offline recount (§12, BP-MAN-11) | B2 dry-run, B3 |
| AT-29 | baseline and candidate on the same examples (§5, §10.2 paired), a candidate with a regression/cap is not promoted (BP-FW-04, W3e), holdout access log (§9.1) | B2/B3 + W3e |
| AT-21 | research/document fixture → a file that opens, sections, resolvable sources; the validator catches a wrong number/citation (BP-MET-05, §10.5) | B2 |
| AT-20 | the chosen local model passes generation + tool round-trip before B2 (BP-PROD-05) | B1/B2 |
| AT-07/AT-22 | internal crash/resume and change-input tests remain mandatory (R08), they are not part of the public benchmark | G2 |

---

## 17. Risks

| Risk | Likelihood/impact | Mitigation | Status |
|---|---|---|---|
| The APEX reference agent does not support a local endpoint → B0 with Qwen requires an adapter change (deviation) | UNKNOWN / high | B1 verifies; every change goes into `deviations[]` | UNKNOWN |
| Judge drift (the cloud model changes) between B2 and B3 | medium / high | pin version/date; re-judge all arms in the same window; fresh OUT_TAG | PROPOSAL |
| Qwen 3.8 27B does not fit or does not run usably on the available GPU | medium / high | hardware ladder measurement (A21); Q8 vs Q4 as separate configurations in the manifest; MoE control separately (C19) | FINDING — TO VERIFY |
| W-full before the W0 fixes yields "Completed" without verify → result unqualified | CONFIRMED / high | B2 waits for F-HARN-01/02/03/08 | CONFIRMED |
| Contamination through skills/marketplace content that quotes the benchmark | low / high | firewall substring/embedding gate over the prompt and the mind | PROPOSAL |
| An incorrect cost table in the product (`cost-tracker.ts`) enters the report | CONFIRMED / medium | manifest prices from the official source; fix F-REL-06 before B2 | CONFIRMED |
| Repeated viewing of the validation set | medium / medium | view log, ≤2 views, prereg hash | PROPOSAL |
| A cherry-pick from the `harness-sota-bench` branch brings in the τ² bridge as "Waggle" | medium / high | BP-CP-05 explicitly prohibits it; test that the adapter calls `/api/chat` | PROPOSAL |

---

## 18. What is UNKNOWN / open in this artifact (summary)

1. APEX task-level scoring semantics (binary vs fraction) and local-endpoint support in the reference agent — B1 (reading code/documentation), confirmation by a run in B2-PR0.
2. Budget, N, k, r, δ, frontier F — Q-01/02/03/07/09.
3. What counts as a "production sidecar" on the Linux/WSL2 bench machine (T1/T2) — Q-06.
4. Whether the Ollama pin 0.32.3 loads `qwen3.8:27b` at all; measured VRAM/latency per quant — Q-08.
5. Whether a separate query/embedding *result* cache exists in `mind/` that survives a new `WAGGLE_DATA_DIR` — B1. The weights are **not** outside the data dir: the production sidecar keeps them in `<dataDir>/models` (embedding, reranker, managed Ollama; §9.3), so per-task re-download and HF/Ollama egress are an AUDIT FINDING — TO VERIFY until the pre-seed step (§9.3; work unit `W3-PR7` run reset) is verified by a run — a reset test on an isolated data dir in `W3-PR7`, confirmation on the bench machine in the first B2 dev run (Delivery plan §3). Critic note (28.09.2026): the earlier text tied the verification to `B2-PR1`, which has been reduced to the shim only.
6. DeepSeek judge price; DashScope control price — B1.
7. B3 calendar (freeze + run + judge + analysis) — depends on Q-01/Q-02; the protocol gives no date (Delivery plan §4.3 carries only a PROPOSAL placeholder of 10–20 wd, §7).

Closed in this pass (was UNKNOWN in an earlier version of the draft): contents of `stub-core/` (BP-PROD-09), the cron store path (`cron_schedules` in `personal.mind`, §9.3), the F-HM-15 label aligned with the refuter (BP-INV-22). Critic note (28.09.2026): the earlier draft also listed "embedding cache path" (`~/.waggle/models`, outside `WAGGLE_DATA_DIR`) here as closed — incorrect for the production sidecar (`packages/core/src/config.ts:436`, `packages/server/src/local/index.ts:762-764,791-792`); corrected in §9.3 and item 5.

---

## Sources

- **D:** D-03, D-05, D-06, D-08, D-12, D-15, D-18 (BRIEF §3).
- **DIR:** DIR-01, DIR-03, DIR-07, DIR-14, DIR-15, DIR-22, DIR-23 (BRIEF §1, §6.1, §7.1, §10.3, §10.5, §13).
- **BRIEF sections:** §4.2, §5.1, §7.2–7.3, §11.3, §13.1–13.6, §14 (row "Benchmark projects"), §15.1 (row B1–B3), §15.2, §16 (AT-07, AT-20, AT-21, AT-22, AT-28, AT-29), §17 (C18, C19), §18 (A17, A19, A21, A25, A29), §19 (R03, R04, R08, R09), §20.1, §20.3, §20.4.
- **S1 (audit):** spot-check L18; C18, C19; A25, A29; §3 rows "Harness recipe evolution", "Waggle LongWork", "Full six-arm N≈1500"; §7 question 5.
- **Phase A:** `docs/plans/v1.2-evidence/phaseA/external.md` §0 #1–4, #8–10, #12; §1.1–1.5; §4.1–4.7; §6; §7 · `docs/plans/v1.2-evidence/phaseA/release-oss.md` F-REL-06, F-REL-12, §6 · `docs/plans/v1.2-evidence/phaseA/harness.md` F-HARN-01..09 + `harness.refute.md` (HOLDS 7/7; path correction `packages/agent/src/{system-tools,system-tools-helpers,tool-executor}.ts`) · `docs/plans/v1.2-evidence/phaseA/evolution.md` F-EVO-04, F-EVO-06, F-EVO-07 · `docs/plans/v1.2-evidence/phaseA/hivemind.md` F-HM-12, F-HM-15 + `hivemind.refute.md` (F-HM-15 → PARTIAL/UNWIRED) · `docs/plans/v1.2-evidence/phaseA/evolution.refute.md` (F-EVO-04/06/07 HOLDS) · `docs/plans/v1.2-evidence/phaseA/durable.md` F-DUR-05 + `durable.refute.md` (HOLDS).
- **Repo, revision `2af0904d` (read-only):** `packages/server/src/local/routes/chat.ts:75-77,614-654,1541` · `packages/server/src/local/routes/agent-run.ts:237` · `packages/server/src/local/routes/external-tool-runs.ts:173` · `packages/server/src/local/index.ts:516,538,565,627,639` · `packages/server/src/local/managed-ollama-runtime.ts:28-29` · `packages/server/src/local/hardware-detect.ts:1-20` · `packages/agent/src/orchestrator.ts:858-866` · `packages/agent/src/turn-context.ts:1-20` · `packages/agent/src/eval-dataset.ts:208` · `packages/agent/src/cost-tracker.ts:28-32,66` · `packages/agent/src/workflow-harness.ts:313,474-482` · `packages/agent/src/builtin-harnesses.ts:128,181` · `packages/agent/src/workflow-tools.ts:330-358,412-422,447` · `packages/agent/src/harness-trace-bridge.ts:91,139-148` · `packages/agent/src/task-shape.ts:145` · `benchmarks/gaia2/adapter.ts:1-12,31-37` · `benchmarks/gaia2/waggle-container/stub-core/{index.js:1-7,package.json}` · `packages/core/src/cron-store.ts:386` · `packages/server/src/local/index.ts:585,762-764,791-792` · `packages/core/src/config.ts:192-195,429-444` · `packages/server/src/local/managed-ollama-runtime.ts:603-604` · `packages/server/src/local/routes/local-inference.ts:165-169` · `scripts/certify-windows-installer.ps1:2904` · `packages/hive-mind-core/src/mind/inprocess-embedder.ts:33,36` · `packages/hive-mind-core/src/mind/inprocess-reranker.ts:58` · `packages/hive-mind-core/src/mind/transformers-model-load.ts:27-32` · `benchmarks/harness/src/stats/index.ts:19-26` · `benchmarks/harness/src/preregistration.ts:36-43,52-75` · `benchmarks/harness/src/failure-taxonomy/*` · `benchmarks/harness/config/models.json:2-8,61-67,83-100` · `benchmarks/results/locomo-sota-2026-06/recount.mjs:1-20` · `benchmarks/preregistration/*` · `docs/plans/BENCHMARK-LANDSCAPE-RESEARCH-2026-05-22.md` · `litellm-config.yaml:211-215`.
- **Branch `origin/feature/harness-sota-bench` @ `18e5b36a` (git show):** `benchmarks/tau2/bridge/waggle-bridge-server.ts:1-33` · `benchmarks/tau2/bridge/llm-client.ts:2,79` · `benchmarks/tau2/VENDOR.md` · `benchmarks/tau2/results-retail-pilot/PILOT-RESULT-2026-06-30.md` · `benchmarks/harness/src/firewall/index.ts:1-33` · `benchmarks/harness/src/stats/equivalence-tost.ts:1-24` · `benchmarks/harness/src/gate/preflight.ts:1-13` · `benchmarks/harness/src/gate/prereg-checklist.ts:1-11` · `docs/plans/harness-sota-recon/10-PREREGISTRATION-PARAMETERS.md` · `git log --oneline main..origin/feature/harness-sota-bench` (66 commits).
- **External sources (verified 27.09.2026 in `docs/plans/v1.2-evidence/phaseA/external.md` §8):** HF `mercor/apex-agents-v1.1`, Mercor blog 2026-09-08, `mercor-intelligence/archipelago`, `sierra-research/tau2-bench`, taubench.com, `facebookresearch/meta-agents-research-environments`, HF `openai/gdpval`, `AGI-Eval-Official/FORTE`, `microsoft/OdysseyBench`, HF `Qwen/Qwen3.8-27B`, ollama.com/library/qwen3.8, Anthropic/OpenAI/Google pricing pages.
