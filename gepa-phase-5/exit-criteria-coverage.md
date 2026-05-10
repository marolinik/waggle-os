# Phase 5 §4 Exit Criteria — Coverage Map

**Date:** 2026-04-30
**Status:** §4 BIND — pre-registered, no-revisit-without-amendment per brief §4.4
**Manifest:** `gepa-phase-5/manifest.yaml`
**Brief:** `D:/Projects/PM-Waggle-OS/briefs/2026-04-29-phase-5-deployment-brief-v1.md` §4
**Monitoring code:** `packages/agent/src/canary/phase-5-monitoring.ts`

This doc traces every brief §4 threshold to its manifest field + monitoring code reference. Any drift between brief / manifest / code is an authoring bug and must be reconciled before canary kick-off.

---

## §4.1 — Promotion criteria (canary → full enable)

Brief §4.1 binds **5 conditions + wall-clock floor** with ε = 1e-9 inclusive boundary.

| # | Condition | Brief §4.1 wording | Manifest field | Code reference |
|---|---|---|---|---|
| 1 | Pass II rate | `variant_pass_ii ≥ baseline + 0pp − ε`; stretch goal +5pp not blocking | `promotion_criteria.criteria[0].condition` + `inclusive_boundary_epsilon: 1.0e-9` | `PROMOTION_THRESHOLDS.pass_ii_delta_pp = 0` + `inclusive_boundary_epsilon = 1e-9` |
| 2a | Retrieval engagement (qwen-thinking) | `variant_retrieval ≥ baseline_retrieval × 0.80` | `promotion_criteria.criteria[1].condition_qwen_thinking` | `PROMOTION_THRESHOLDS.retrieval_qwen_thinking_multiplier = 0.80` |
| 2b | Retrieval engagement (claude) | `variant_retrieval ≥ baseline_retrieval` | `promotion_criteria.criteria[1].condition_claude` | `PROMOTION_THRESHOLDS.retrieval_claude_multiplier = 1.0` |
| 3 | Latency p95 | `variant_p95 ≤ baseline_p95 × 1.20` | `promotion_criteria.criteria[2].condition` | `PROMOTION_THRESHOLDS.latency_p95_multiplier = 1.20` |
| 4 | Cost per request | `variant_cost ≤ baseline_cost × 1.15` | `promotion_criteria.criteria[3].condition` | `PROMOTION_THRESHOLDS.cost_per_request_multiplier = 1.15` |
| 5 | Error rate | `variant_error ≤ baseline_error + 1pp` | `promotion_criteria.criteria[4].condition` | `PROMOTION_THRESHOLDS.error_rate_delta_pp = 1` |
| floor | Wall-clock | `max(7_days_since_canary_kickoff, 30_samples_per_metric)` ⚠️ brief §4.1 says `min(...)` — flagged as authoring typo | `promotion_criteria.wall_clock_floor.formula` (binds `max()` per brief §2.2 + intent) + `canonical_intent` field documenting the discrepancy | `PROMOTION_THRESHOLDS.sample_floor_per_metric = 30` + `days_min = 7` |

**Inconsistency flag:** Brief §2.2 says `max(7_days_floor, 30_samples_floor)` (correct: both must hold). Brief §4.1 says `min(...)` (incorrect: would allow promotion at 7 days even with < 30 samples). Manifest binds `max()` per intent ("sample floor je hard guard protiv small-sample-effect stage promotion"). PM correction recommended in brief §4.1 wording before canary kick-off.

---

## §4.2 — Rollback triggers (immediate)

Brief §4.2 binds **5 triggers** plus an Opcija C-specific 6th (per `decisions/2026-04-30-branch-architecture-opcija-c.md` §3 + manifest § rollback_triggers.opcija_c_long_task_loop_exhausted).

| # | Trigger | Brief §4.2 wording | Manifest field | Code reference (`packages/agent/src/canary/phase-5-monitoring.ts`) |
|---|---|---|---|---|
| 1 | Pass II rate collapse | `variant < baseline − 10pp` (consecutive 2 windows of 10-sample each) | `rollback_triggers.triggers[0]` | `ROLLBACK_THRESHOLDS.pass_ii_collapse_pp = -10`, `pass_ii_consecutive_windows = 2`, `pass_ii_window_size = 10` + `checkPassIIRateCollapse()` |
| 2 | Error rate spike | `variant > baseline + 5pp` (consecutive 24h) | `rollback_triggers.triggers[1]` | `ROLLBACK_THRESHOLDS.error_rate_spike_pp = 5`, `error_consecutive_window_hours = 24` + `checkErrorRateSpike()` |
| 3 | Cost per request spike | `variant > baseline × 2.0` (immediate single-window) | `rollback_triggers.triggers[2]` | `ROLLBACK_THRESHOLDS.cost_per_request_multiplier = 2.0` + `checkSingleEventRollback()` for `metricName === 'cost_usd'` |
| 4 | Latency p95 spike | `variant > baseline × 3.0` (immediate single-window) | `rollback_triggers.triggers[3]` | `ROLLBACK_THRESHOLDS.latency_p95_multiplier = 3.0` + `checkSingleEventRollback()` for `metricName === 'latency_ms'` |
| 5 | Manual halt | PM, Marko, or CC observed anomaly outside thresholds | `rollback_triggers.triggers[4]` (`manual_halt_or_pm`) | Out-of-band: PM + Marko discretion; CC emits halt-and-PM via `emitAlert` with `is_rollback_trigger: true` |
| 6 | Opcija C long-task | `loop_exhausted_rate > 5% baseline` → halt diagnostic "long-task fixes potrebni" + cherry-pick option | `rollback_triggers.triggers[5]` (`opcija_c_long_task_loop_exhausted`) including cherry_pick_candidate_set commits | `ROLLBACK_THRESHOLDS.opcija_c_loop_exhausted_rate_pct = 5` + `checkLoopExhaustedRate()` (diagnostic includes `c9bda3d, be8f702, e906114, 4d0542f, 8b8a940`) |

All rollback alerts emit `PHASE5-ROLLBACK-TRIGGER` stderr line for halt-and-PM automation hook.

---

## §4.3 — Production-stable definition

Brief §4.3 binds **3 conditions** for "production-stable" status that unblocks §6 cross-stream dependencies.

| # | Condition | Brief §4.3 wording | Manifest field |
|---|---|---|---|
| 1 | Days zero rollback | 30 days zero rollback events | `production_stable_status.conditions.days_zero_rollback: 30` |
| 2 | Metrics within pass bands | All 5 §4.1 metrics maintained within pass bands | `production_stable_status.conditions.metrics_within_pass_bands_count: 5` |
| 3 | Halt-and-PM emissions | Zero halt-and-PM trigger emissions | `production_stable_status.conditions.halt_and_pm_emissions: 0` |

Production-stable status `unblocks: cross_stream_dependencies` per manifest § production_stable_status.unblocks.

---

## §4.4 — No-revisit-without-amendment binding

Brief §4.4 binds: "Sve §4.1, §4.2, §4.3 thresholdi su LOCKED. Ako tokom Phase 5 CC discover-uje da neki threshold treba relaxation ili tightening, halt-and-PM proceduru sa amendment proposal. Marko ratifikuje, novi LOCKED memo, restart canary phase ako threshold change znači redo."

**Bound by manifest:**
- `promotion_criteria.binding_rule: no_revisit_without_amendment`
- `rollback_triggers.binding_rule: automatic_rollback_per_section_2_3`
- Audit anchor: `audit_anchors.brief_LOCKED` + `audit_anchors.scope_LOCKED` + `audit_anchors.cost_amendment_LOCKED`

**Bound by code:** ROLLBACK_THRESHOLDS + PROMOTION_THRESHOLDS are `as const` frozen registries; mid-flight code mutation would require source-edit + commit (visible in audit trail).

**Precedent:** Faza 1 Amendment 11 terminal_calibration_clause — strict pre-registration discipline applies.

---

## Cost cap discipline (related: §5.4 amendment)

Per `feedback_production_vs_research_cost_discipline` (NEW 2026-04-30):

- Cost cap (§5.4) is **production deployment** regime — operational projection, amendable via PM decision memo + ratification (Phase 5 amendment $25→$75 precedent).
- §4.1-§4.4 thresholds are **methodology binding** — strict no-revisit-without-amendment per Faza 1 Amendment 11 precedent.

Two regimes; only the cost cap was amended 2026-04-30 (per `decisions/2026-04-30-phase-5-cost-amendment-LOCKED.md`). All §4 promotion + rollback thresholds remain LOCKED at brief §4.1-§4.3 values.

---

**End of coverage map. All 5 promotion criteria + 6 rollback triggers + 3 production-stable conditions captured in manifest + code with explicit cross-references.**
