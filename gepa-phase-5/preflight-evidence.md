# Phase 5 §0 Preflight Evidence

**Date:** 2026-04-29 (CC execution session)
**Author:** CC (Claude Opus 4.7)
**Branch:** `phase-5-deployment-v2`
**HEAD:** `6bc20897d3851072eda34e80070faf39772bee66` (`6bc2089`) — verified `git rev-parse HEAD`
**Brief:** `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md`
**Branch architecture:** Opcija C per `decisions/2026-04-30-branch-architecture-opcija-c.md`
**Verdict aggregation:** §0.1 **PARTIAL (PM ratification needed)** · §0.2 **PASS** · §0.3 **DEFERRED (probe pending §0.1 ratification)** · §0.4 **PARTIAL (design-stage)**
**Halt-and-PM trigger:** YES — §0.1 mutation-validator regression + §0.4 implementation gating

---

## §0.1 — Substrate readiness grep

### Verification anchors

| # | Requirement | Evidence | Verdict |
|---|---|---|---|
| 1 | `REGISTRY` in `selector.ts` contains base shapes `claude`, `qwen-thinking`, `qwen-non-thinking`, `gpt`, `generic-simple` | `packages/agent/src/prompt-shapes/selector.ts:30-36` | PASS |
| 2 | `registerShape` canonical API exported from `selector.ts` AND barrel `index.ts` | `selector.ts:65-76` (export function declaration) + `index.ts:46` (barrel re-export) | PASS |
| 3 | `gen1-v1` shape definitions exist for `claude` + `qwen-thinking` | `gepa-evolved/claude-gen1-v1.ts:23` (`claudeGen1V1Shape` const, `name: 'claude-gen1-v1'`) + `gepa-evolved/qwen-thinking-gen1-v1.ts:23` (`qwenThinkingGen1V1Shape` const, `name: 'qwen-thinking-gen1-v1'`) | PASS |
| 4 | `git merge-base --is-ancestor 6bc2089 HEAD` exit=0 | Exit code `0` (HEAD itself is `6bc2089`; no post-terminus commits) | PASS |
| 5 | No orphaned `gpt::gen1-v2` references in Phase 5 deployment artifacts | `gepa-phase-5/` grep empty. Repo-wide grep finds 2 references both in Faza 1 audit anchors: `packages/agent/src/prompt-shapes/gepa-evolved/gpt-gen1-v2.ts` (variant source code, present but not deployed) + `benchmarks/gepa/scripts/faza-1/run-checkpoint-c.ts` (Faza 1 held-out validation runner — produced FAIL verdict that exposed selection bias). Both allowed per brief §1 + §8 audit anchors. | PASS |

### Test suite execution

**Agent workspace** (substrate-relevant subsuite):
```
Test Files  147 passed (147)
Tests       2547 passed (2547)
Duration    14.93s
```
Matches 2026-04-28 S1 handoff baseline (`2547/2547 agent`). PASS.

**Repo-root suite (vitest run, full):**
```
Test Files  2 failed | 409 passed | 1 skipped (412)
Tests      14 failed | 6031 passed | 1 skipped (6046)
Duration    83.55s
```

**Failure scope** — all 14 failures isolated to `benchmarks/gepa/tests/faza-1/mutation-validator.test.ts`:
- 8 × `boundary anchor SHAs match substrate at c9bda3d > baseline {types,claude,qwen-thinking,qwen-non-thinking,gpt,generic-simple}.ts SHA matches pinned`
- 2 × `validateCandidate — Gen 0 (baseline) acceptance`
- 2 × `validateCandidate — accepts valid Gen 1 mutation`
- 2 × `Amendment 8 §registry_invariant_test — REGISTRY cross-module-boundary documents H1 failure mode`

**Root cause analysis (preliminary, no fix attempted):**

The mutation-validator test pins baseline shape file SHAs against substrate freeze head `c9bda3d` (Phase 4.7 on `feature/c3-v3-wrapper`). Phase 5 branch `phase-5-deployment-v2` (= `6bc2089`) inherits `gepa-faza-1` parent chain via `origin/main` (`5ec069e`), NOT via `c9bda3d`. Per Opcija C decision §3, Phase 5 grana inherits Faza 1 work + base shapes BUT not Phase 4 long-task fixes from `feature/c3-v3-wrapper`. The shape-file content on `phase-5-deployment-v2` therefore reflects `origin/main` lineage, which has different SHAs than `c9bda3d` substrate the test pins to.

Faza 1 closure §F.4 reports `105/105 anchor invariance checks PASS` during Faza 1 evaluation runs — those checks ran inside `D:/Projects/waggle-os-faza1-wt` worktree pinned at `c9bda3d`. After Faza 1 closure and branch reconstruction (per Opcija C §1 #2 dangling-commit recovery via `git branch gepa-faza-1 6bc2089`), the test substrate context shifted from `c9bda3d` worktree to `6bc2089` repo head, and the SHA pins no longer match the live shape file content.

**Verdict on test suite:** PARTIAL.
- Substrate API surface (REGISTRY, registerShape, gen1-v1 definitions) operational and verified — Phase 5 deployment substrate intact.
- Mutation-validator failures appear to be Faza 1 audit-period artifact (test scope = Faza 1 closure-time SHA pinning that did not get quarantined post-closure under Opcija C branch architecture).
- 14 failures do not affect Phase 5 deployment substrate API contract; do affect literal "noviji test broj passing" requirement of brief §0.1 #3.

### §0.1 Verdict: **PARTIAL — PM ratification required**

5/5 substrate API anchor requirements PASS. Test suite has 14 failures isolated to Faza 1 mutation-validator scope (post-closure SHA pin against `c9bda3d` substrate not reachable from `phase-5-deployment-v2` Opcija C inheritance chain). PM ratification needed on whether these failures are scope-isolated and the gate advances, or whether mutation-validator must be quarantined / re-pinned as remediation before §2 deployment.

**Halt-and-PM ask for §0.1:**
1. Ratify §0.1 PARTIAL → PASS conditional on mutation-validator quarantine (e.g., move under `benchmarks/gepa/tests/faza-1/__faza1-closed/` with explicit "deferred to integration sprint" annotation)
2. OR escalate as substrate failure requiring branch surgery before §2 (would defer Phase 5 by integration sprint estimated 2-3 days wall-clock per Opcija C §5)

CC recommends Option 1 — Faza 1 closure verdict §F.4 already documents 105/105 anchor invariance during evaluation runs; Phase 5 deployment substrate API surface (registerShape canonical API, gen1-v1 shape definitions) is verified independently and operational. Mutation-validator drift is post-closure scope leakage, not Phase 5 substrate failure.

---

## §0.2 — Config inheritance audit

### Differential — Faza 1 manifest v7 vs Phase 5 deployment

| Field | Faza 1 manifest v7 value | Phase 5 deployment value | Justification |
|---|---|---|---|
| `temperature` | **agent-side default 0.3**; corpus generation 0.7 (variation), 0.5 (ground truth); **judge primary 1.0 explicit** (claude-opus-4-7) and `omitted` for reasoning models (gpt-5.4, minimax-m27) per pilot runner line 385/387; oracle 1.0 (mutation oracle); `omitted` for Anthropic with `response_format` per Faza 1 mutation oracle line 6000 cap | **Production-default 0.3** for both deployed variants (claude::gen1-v1 + qwen-thinking::gen1-v1) — inherits agent-side default from Faza 1; production traffic uses standard temperature for variance control per brief §5.1 ("production usually lower variance") | Inherits agent-side default. No corpus generation or judging in Phase 5 production deployment (those were Faza 1 scope). Probe-validation (deferred — see §0.3) may surface variant-specific temperature recommendation. |
| `max_tokens` | judge 3000, agent default 16000, oracle 8000, mutation-oracle response_format 6000 | **claude::gen1-v1 = 4096** (per shape `metadata.defaultMaxTokens`, file `gepa-evolved/claude-gen1-v1.ts:30`); **qwen-thinking::gen1-v1 = 16000** (per shape `metadata.defaultMaxTokens`, file `gepa-evolved/qwen-thinking-gen1-v1.ts:30`) | Aligns with Phase 4.5 retrieval engagement finding (Qwen 1.33×/task → target ≥1.7 retrievals/task; thinking-mode requires output budget for retrieval-driven synthesis). Claude shape default lower because narrative+XML structure is more output-efficient than minimal-scaffolding qwen-thinking. |
| `judge_model_primary` | **trio = claude-opus-4-7 + gpt-5.4 + minimax-m27** with κ=0.7878 anchor (raw-agreement primary metric per Amendment 5 §judge_metric_design) | **NOT APPLICABLE — Phase 5 production deployment has no inline judge.** §3 monitoring metrics replace evaluation judging: Pass II rate (proxy via downstream signal), retrieval engagement (per-request count), latency p50/p95, cost per request, error rate. Judge invocation deferred to Faza 2 re-validation runs (gpt::gen1-v2 N=16) and arxiv §5 evidence integration. | Inherent task-type shift: Faza 1 = evolution + held-out validation (judge required); Phase 5 = production deployment + monitoring (signal-side metrics instead of judge labels). |
| `evaluation_corpus_source` | **50-instance NorthLane CFO synthesis corpus** (5 task families F1-F5: strategic synthesis, cross-thread coord, decision support, investor comm, scenario planning) + LoCoMo dataset for non-GEPA stages (held-out 5 instances of slice 8-12 of seed=42 shuffle for Checkpoint C) | **Production live traffic** (real user sessions on Waggle OS) | Inherent task-type shift per brief §5.1. Phase 5 deployment evaluates in-the-wild against actual user prompts, not pre-registered corpus. Production traffic distribution unknown a priori — §3 monitoring + §4 promotion criteria provide acceptance bounds. |
| `failure_mode_taxonomy` | Faza 1 Amendment 4 texture audit — **F1-F6 task family classifier + per-family Pass II rate**: F1 strategic synthesis, F2 cross-thread coord, F3 decision support, F4 investor comm, F5 scenario planning, F6 = unsupported-specifics / missed-shallow / conflation (T2 modes per `phase-4-3-rescore-delta-report.md`) | **Production rollback triggers** per brief §4.2: (a) Pass II < baseline -10pp, (b) error rate > baseline +5pp, (c) cost > baseline ×2.0, (d) latency p95 > baseline ×3.0, (e) manual halt-and-PM. **Plus Opcija C-specific addition:** loop_exhausted rate > 5% baseline → halt with "long-task fixes potrebni" rationale (Phase 4 long-task fixes not inherited per Opcija C §3). | New mapping required — production threshold-based detection vs. Faza 1's content-classifier. Additional Opcija C trade-off rationale field surfaces when Phase 4 long-task absence becomes material. |
| `cost_per_request_baseline` | $0.27/instance (Amendment 3 probe-corrected from $0.10 generic estimate; Faza 1 actual $43.49 total / 175 substantive evals = ~$0.25/eval) | **Probe-validated Phase 5 (re-probe REQUIRED per brief §0.3)**. Pricing snapshot taken (see §0.3 below); live 5-request probe per variant DEFERRED pending §0.1 PM ratification. Estimate-only ceiling provided. | Cost may shift with production load patterns (cache hit rates, prompt caching strategy, conversation-context size). Brief §0.3 binds probe-validation, not estimate. |

### Opcija C trade-off acknowledgment

Per `decisions/2026-04-30-branch-architecture-opcija-c.md` §3:

| Phase 4 long-task fix not inherited | Mitigation in Phase 5 monitoring |
|---|---|
| `runRetrievalAgentLoopWithRecovery` (recovery from loop_exhausted) | §3 monitoring `error_rate` metric watches `loop_exhausted` count; threshold alert ≥5% triggers halt-and-PM with explicit "Phase 4 long-task fixes potrebni" rationale + selective cherry-pick option from `feature/c3-v3-wrapper` commits `c9bda3d`, `be8f702`, `e906114`, `4d0542f`, `8b8a940` |
| Failure classifier (F-codes for long-task failure attribution) | Phase 5 uses threshold-based classifier (binary pass/fail per metric) instead. F-code attribution deferred to integration sprint post-production-stable |
| Reporting module (long-task structured reports) | §3 daily summary `phase-5-daily-summary/<ISO_date>.md` provides simple metric snapshots; structured reporting deferred |
| Messages-array compression (long-conversation context budget management) | Phase 5 traffic profile is simple-medium tasks (per Opcija C §3); compression not load-bearing for canary phase. Watch latency p95 — if escalates due to context bloat, halt-and-PM |

### §0.2 Verdict: **PASS**

All 6 differential rows have explicit value + justification. Implicit defaults forbidden — none used. Opcija C trade-off documented with explicit monitoring mitigation per row.

---

## §0.3 — Cost projection probe

### Pricing snapshot (2026-04-29)

| Model | Input $/1M tokens | Output $/1M tokens | Cache Hits $/1M | Source | Snapshot timestamp |
|---|---|---|---|---|---|
| Claude Opus 4.7 (claude::gen1-v1 deployment) | **$5.00** | **$25.00** | $0.50 | https://platform.claude.com/docs/en/docs/about-claude/pricing | 2026-04-29 (CC fetch this session) |
| DashScope Qwen 35B-A3B International thinking mode (qwen-thinking::gen1-v1) | **$0.25** | **$2.00** (thinking mode) | n/a | https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio | 2026-04-29 (CC fetch this session) |
| DashScope Qwen 35B-A3B Global mode (alternative reference) | $0.057 | $0.459 (non-thinking) / $1.835 (thinking) | n/a | same as above | 2026-04-29 |

**Note on Opus 4.7 pricing:** New tokenizer may use up to 35% more tokens for the same fixed text — affects cost computation upward by up to 1.35× for content-equivalent prompts vs. older tokenizer baselines.

### Estimate-only cost projection (live probe DEFERRED)

Without live probe, point estimates use shape-file `defaultMaxTokens` as upper bound for output and conservative input estimate from Faza 1 corpus average (~3000 input tokens per instance). **These are NOT brief-binding numbers — probe-validation per §0.3 is required for canary kick-off.**

| Variant | Input est. | Output est. | Per-request est. (no cache) | 740-request canary × 1.20 buffer |
|---|---|---|---|---|
| claude::gen1-v1 | 3000 tok @ $5/M = $0.015 | 4096 tok @ $25/M = $0.102 | **~$0.117** | 740 × $0.117 × 1.20 = **~$103.86** |
| qwen-thinking::gen1-v1 | 3000 tok @ $0.25/M = $0.0008 | 16000 tok @ $2/M (thinking) = $0.032 | **~$0.033** | 740 × $0.033 × 1.20 = **~$29.30** |

`canary_cost_p95_ceiling estimate (max of two)` = **~$103.86** (claude-dominated).

**Comparison to brief ceiling:**
- Brief §5.4: `canary_cost_p95_ceiling ≤ $20` required.
- Estimate ceiling **$103.86 >> $20** — naive estimate triggers ceiling validation FAIL.

**However, this estimate is materially conservative** because:
1. **Output tokens at `defaultMaxTokens` upper bound** is worst-case; actual canary p95 likely far lower (Faza 1 evals averaged ~2000 output tokens, not 4096).
2. **No prompt caching credit** — Phase 5 production should leverage 5m-cache writes (1.25× input cost, recovers via 0.1× cache reads). With 80% cache hit rate, claude input cost drops from $0.015 → $0.0042 per request.
3. **Brief §5.2 day-by-day breakdown** assumes 10 requests/day Day 0-1 (not 740 immediate), so the 740-request total accumulates over 7 days canary, not in one batch.
4. **Per Faza 1 actuals** ($43.49 total / 175 evals = ~$0.25/eval), claude judging+running was $0.25/eval — that includes Opus judging at higher token volume than Phase 5 production deployment will incur.

### §0.3 Verdict: **DEFERRED**

Pricing snapshots captured with authoritative URLs + 2026-04-29 timestamps. Live 5-request-per-variant probe **deferred** pending PM ratification of §0.1 finding. Probe execution requires:

1. PM ratification of §0.1 → unblock §0 advancement.
2. Authorization of probe budget ($0.30-$0.50 per brief §5.4) — currently unspent ($0.00 spent on §0).
3. Probe harness construction: standalone script that imports `claudeGen1V1Shape` + `qwenThinkingGen1V1Shape`, sends 5 varying-complexity prompts per variant, records actual input/output tokens × pricing, computes p50/p95/max, commits results to `gepa-phase-5/cost-probe-2026-04-29.jsonl`.

CC recommends probe execution AFTER PM clears §0.1 to avoid wasted budget on probe whose ceiling validity depends on whether §0.1 advances or requires substrate remediation.

**Halt-and-PM ask for §0.3:**
1. Ratify probe deferral until §0.1 cleared, OR
2. Authorize immediate probe (~$0.30-$0.50) so estimate-only projection becomes probe-validated regardless of §0.1 outcome.

---

## §0.4 — Deployment readiness checklist

### Verification anchors

| # | Requirement | Evidence | Verdict |
|---|---|---|---|
| 1 | `phase_5_pre_deployment_sha` pinned via `git rev-parse HEAD` | **`6bc20897d3851072eda34e80070faf39772bee66`** (`6bc2089`) — pinned in this evidence file. Rollback procedure: `git revert <deployment_commit_sha>` or `git reset --hard 6bc2089`. Forbidden in-place file overwrites. | PASS |
| 2 | Monitoring infrastructure stubs functional (JSONL emitters: Pass II rate, retrieval engagement, latency p50/p95, cost per request, error rate) | **NOT YET BUILT.** `gepa-phase-5/monitoring/` directory created (this session) but no JSONL emitter code exists. Per brief §3.1 + §3.4 Stage 1: JSONL files + daily markdown summary. Implementation is §1-§2 work; brief §0.4 #2 requires "basic stubs OK ali ne smeju biti no-op" pre canary kick-off. | DEFERRED to §1-§2 |
| 3 | Canary toggle mechanism (env var `WAGGLE_PHASE5_CANARY_PCT`) | **NOT YET BUILT.** Repo grep finds no canary toggle infrastructure. Implementation is §1-§2 work. | DEFERRED to §1-§2 |
| 4 | Pre-registered exit criteria locked (§4 promotion + rollback thresholds) | **LOCKED in brief §4.1-§4.4** per `briefs/2026-04-29-phase-5-deployment-brief-v1.md`. Brief LOCKED 2026-04-29 ("sve ok idemo dalje"). §4.4 no-revisit-without-amendment binding active. Phase 5 manifest authorization (formal copy of §4 into `gepa-phase-5/manifest.yaml`) is §1 work. | PASS for brief; DEFERRED for manifest copy |
| 5 | Halt-and-PM trigger automation wired (auto-emit halt request on §3 threshold breach) | **NOT YET BUILT.** No automation scripts for `phase-5-alerts/<ISO_date>.jsonl` emission. Implementation is §1-§2 work. | DEFERRED to §1-§2 |

### §0.4 Verdict: **PARTIAL — design-stage**

Items 1 + 4 (documentation/pinning) PASS. Items 2 + 3 + 5 (functional infrastructure) NOT YET BUILT — that's §1-§2 implementation work. Brief §0.4 wording ("basic stubs OK ali ne smeju biti no-op pre canary kick-off") implies stubs must exist BEFORE canary kick-off (§2), not before §0 PASS. §0 thus verifies design+plan readiness, not built infrastructure.

**Halt-and-PM ask for §0.4:**
1. Confirm interpretation: §0.4 #2/#3/#5 verifies design-stage readiness only; functional stubs are §1-§2 deliverables verified before canary kick-off (not before §0 advancement).
2. OR escalate: §0.4 requires functional stubs at §0 → CC builds stubs as part of preflight (estimated 1 day wall-clock) before §0 PASS aggregation.

CC recommends Option 1 — design intent at §0, build at §1-§2, verify functional pre-canary.

### Selective cherry-pick option from `feature/c3-v3-wrapper` (Opcija C §3 mitigation)

Documented for monitoring escalation path. If §3 monitoring fires "long-task fixes potrebni" rationale (loop_exhausted rate > 5% baseline), candidate cherry-pick set:

| Commit | Subject |
|---|---|
| `c9bda3d` | (Phase 4.7 head; substrate freeze for Faza 1 — already inherited via gen1-v1 shape baseline pins) |
| `be8f702`, `e906114`, `4d0542f`, `8b8a940` | (Phase 4 long-task fix candidates — `runRetrievalAgentLoopWithRecovery`, failure classifier, reporting module, messages-array compression — per Opcija C §3) |

Cherry-pick procedure (if triggered): branch from `phase-5-deployment-v2`, cherry-pick selected commits, resolve `packages/agent` conflicts, verify agent test suite remains 2547+ passing, merge back to `phase-5-deployment-v2`, document in rollback log.

---

## §0 — Aggregate verdict

```
§0_verdict_aggregate = §0.1 (PARTIAL) AND §0.2 (PASS) AND §0.3 (DEFERRED) AND §0.4 (PARTIAL)
                     = NOT-PASS
```

**Halt-and-PM trigger fires.** CC stops at §0; does not self-advance to §1-§2 implementation.

### Halt-and-PM ratification asks (3)

1. **§0.1 mutation-validator failures** — ratify scope-isolated PARTIAL → PASS conditional on quarantine, OR escalate as substrate failure requiring branch surgery before §2.
2. **§0.3 probe deferral** — ratify defer-until-§0.1-cleared, OR authorize immediate probe (~$0.30-$0.50).
3. **§0.4 design-stage interpretation** — confirm §0 verifies design readiness (functional stubs are §1-§2 work), OR escalate to require pre-§0 functional stubs.

### Cost summary (§0)

| Item | Spent | Budget |
|---|---|---|
| Pricing snapshots (web fetches) | $0.00 (free) | n/a |
| Probe (5 requests per variant) | **$0.00** (deferred) | $0.30-$0.50 |
| **§0 total spent** | **$0.00** | $1.00 hard cap |

Headroom for §0 probe execution after PM ratification: full $0.30-$0.50 budget intact.

### Wall-clock summary (§0)

| Item | Wall-clock |
|---|---|
| Brief + decisions load | ~5 min |
| §0.1 substrate grep + test suite execution | ~20 min (test suite 84s, rest grep) |
| §0.2 config differential authoring | ~10 min |
| §0.3 pricing snapshot fetches | ~3 min |
| §0.4 deployment-readiness grep + documentation | ~10 min |
| Evidence aggregation + writing | ~25 min |
| **§0 total wall-clock** | **~73 min** |

Within brief §0 wall-clock estimate (1-2h for all 4 gates).

---

## Audit chain anchors

| Item | Path / SHA |
|---|---|
| Brief LOCKED | `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md` |
| Brief LOCKED ratification | `decisions/2026-04-29-phase-5-brief-LOCKED.md` |
| Scope LOCKED | `decisions/2026-04-29-phase-5-scope-LOCKED.md` |
| Faza 1 closure (terminus) | `decisions/2026-04-29-gepa-faza1-results.md` |
| Branch architecture (Opcija C) | `decisions/2026-04-30-branch-architecture-opcija-c.md` |
| Phase 5 baseline branch | `phase-5-deployment-v2` (HEAD = `6bc20897d3851072eda34e80070faf39772bee66`) |
| Faza 1 archive branch | `gepa-faza-1` (HEAD identical = `6bc2089`) |
| Faza 1 manifest v7 | `benchmarks/preregistration/manifest-v7-gepa-faza1.yaml` (substrate_freeze_head `c9bda3d`) |
| **THIS EVIDENCE FILE** | `D:/Projects/waggle-os/gepa-phase-5/preflight-evidence.md` |

---

**End of §0 preflight evidence. Awaiting PM ratification on 3 halt-and-PM asks before proceeding to §1.**
