---
report_id: 2026-04-28-gepa-faza1-gen-1-checkpoint-b
date: 2026-04-28
checkpoint: B (Gen 1 partial — 30/120 evals; per launch decision §E + Amendment 7 §checkpoint_b_tightened)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha_amendment_7: bc0bcf9bd8b0c8344b25e5f8ab15b0475039ba28a1f782ebffe4cc1c4ff7d1de
manifest_v7_sha_amendment_8: 85858f12f1270da28277dd4d98e454d1dae8ef970537cb8c561f484599c4e2e9
predecessor: investigate-report.md (b5avslp51 sunk; Amendment 8 fix landed)
status: HALT-AND-PM (Checkpoint B reached cleanly at 30 evals; Δ-floor PROCEED via threshold 2; PM ratify continuation per Amendment 7 §checkpoint_b_tightened.pm_ratify_gate)
authority: PM (Marko Markovic)
binding_directive: "PM must ratify Checkpoint B before post-Checkpoint-B continuation (Gen 1 30 → 120 evals). No silent advance." (Amendment 7 §checkpoint_b_tightened.pm_ratify_gate)
---

# Checkpoint B halt-and-PM report — Fresh Gen 1 partial

## TL;DR

Fresh Gen 1 partial run (`buc5febjp`, exit 0) **completed cleanly at 30/30 Checkpoint B evals** in 27 minutes wall clock at $3.69 cost (26% under $4.96 projection). Mutations executed correctly post-Amendment-8 fix — no REGISTRY-injection failures.

**Headline findings:**
- **claude::gen1-v1 is the breakout candidate**: 8/8 trio_strict_pass_II = 100% (+12.5pp vs NULL claude 87.5%). Meets §F.1 acceptance gate (≥+5pp delta). Wilson 95% CI [0.676, 1.000]; tight by N=8 standards.
- **claude::gen1-v2 regressed**: 6/8 = 75% (-12.5pp vs NULL). Mutation oracle produces variable-quality mutations on the same shape — gen1-v1 and gen1-v2 differ by 25pp on N=8.
- **claude::baseline reproduced NULL exactly**: 7/8 = 87.5% (delta 0pp). Consistent with NULL data; baseline drift not detected.
- **qwen-thinking::baseline retrieval anomaly**: mean 1.667 vs NULL 1.12 = +0.547 absolute. **This is BASELINE running on a 6/8 subset of NULL instances — not evolution signal**. Likely eval-time stochasticity (LLM sampling, agent planning variance). The Δ-floor threshold 2 PASS (>+0.10) fires on this baseline variance, NOT on mutation closure.
- **Mid-run halts: NO triggers** (all 3 Amendment 7 thresholds passed): per-candidate cost (max $0.127 < $0.156 threshold), per-shape variance (max 25pp < 40pp threshold), Qwen retrieval regression (NOT triggered — baseline went UP, not down).

**Δ-floor verdict: PROCEED** via threshold 2 alone. CC-2 flags caveat: threshold 2 PASS is mechanistically driven by qwen-thinking::baseline variance, not Qwen-shape evolution. The TRUE evolution test requires qwen-thinking::gen1-v1/v2 + qwen-non-thinking::* — none of which ran (90 evals remaining).

**PM decision points (§G):** continue to full Gen 1 (120 evals, +$11.20)? Or interpret claude::gen1-v1 +12.5pp as sufficient claude-shape signal + scope-reduce remaining candidates?

## §A — Run metadata

| Item | Value |
|---|---|
| Background job ID | `buc5febjp` |
| Wall clock | ~27 min (17:13Z start, 17:40Z halt at 30 evals) |
| Total cost | **$3.6883** |
| Evals completed | **30/30** ✅ (Checkpoint B target reached cleanly) |
| Halt reason | `none (Checkpoint B reached or completed)` — i.e., scheduled halt at 30 evals, NOT mid-run trigger |
| Manifest binding SHA | `85858f12f1270da28277dd4d98e454d1dae8ef970537cb8c561f484599c4e2e9` (Amendment 8) |
| Cumulative Faza 1 spend | **$30.23** ($25.18 pre-Gen-1 + $1.36 sunk b5avslp51 + $3.69 fresh) |
| Headroom under $115 cap | **$84.77** |
| Cost vs projection ($4.96) | -$1.27 (-26%) |

## §B — Per-candidate Tier 1/2/3 breakdown (Amendment 7 §checkpoint_b_tightened.report_extensions binding)

| Candidate | Shape | Variant | Evals | Pass II rate | Mean retrieval | Mean cost/eval | Cost overshoot | Tier 1 (delta_pp) | Tier 2 (retrieval bonus) | Tier 3 (anchor invariance) | Aggregate (saturated regime) | Saturated regime applied |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **claude::baseline** | claude | baseline | 8 | 87.5% | 1.25 | $0.1223 | NO | **0pp** | 0 (non-Qwen) | 0.10 (7/7) | **0.10** | true |
| **claude::gen1-v1** ⭐ | claude | gen1-v1 | 8 | **100%** | 1.625 | $0.1266 | NO | **+12.5pp** | 0 (non-Qwen) | 0.10 (7/7) | **0.10** | true |
| **claude::gen1-v2** | claude | gen1-v2 | 8 | 75% | 1.75 | $0.1217 | NO | **−12.5pp** | 0 (non-Qwen) | 0.10 (7/7) | **0.10** | true |
| **qwen-thinking::baseline** | qwen-thinking | baseline | 6 | 83.3% | 1.667 | $0.1207 | NO | **−4.17pp** | **0.25 (cap)** | 0.10 (7/7) | **0.35** | true |

**Tier 1 winner per shape (claude only — Qwen candidates not yet evaluated):** claude::gen1-v1 with +12.5pp delta vs NULL.

**Tie-breaker analysis (saturated regime):** All claude shape candidates have aggregate = 0.10 (Tier 2 = 0 for non-Qwen, Tier 3 = 0.10 for all valid mutations). Tier 1 differentiates: claude::gen1-v1 (+12.5pp) > claude::baseline (0pp) > claude::gen1-v2 (−12.5pp). Per Amendment 7 §fitness_function_tiered.tier_1.role_in_saturated_regime (TIE_BREAKER), claude::gen1-v1 wins for claude shape.

**Qwen-shape Tier 2:** Only qwen-thinking::baseline ran (6/8 evals). Tier 2 = 0.25 (cap reached at +5pp absolute retrieval increase from NULL 1.12 → 1.62 cap; observed 1.667 > 1.62 hits cap). **CAVEAT: This is BASELINE running, not evolution. Mutations qwen-thinking::gen1-v1/v2 + qwen-non-thinking::* did NOT execute in this Checkpoint B partial.**

## §C — Retrieval engagement deltas per Qwen-targeted shape (Amendment 7 binding)

| Shape | NULL baseline mean | Gen 1 partial mean | Delta absolute | Delta pp | Cap reached? |
|---|---|---|---|---|---|
| qwen-thinking | 1.12 | 1.667 (n=6) | **+0.547** | +54.7pp | YES (cap = +5pp = +0.05 absolute, far exceeded) |
| qwen-non-thinking | 1.25 | NOT_EVALUATED (n=0) | n/a | n/a | n/a |

**Critical interpretation:** The qwen-thinking +0.547 delta comes from BASELINE evals only (not mutation candidates). The increase reflects:
- 6 of 8 NULL instances re-evaluated with the SAME baseline shape
- Different mean retrieval count (1.667 vs NULL's 1.12) on same code path
- Likely cause: agent planning stochasticity (LLM sampling + retrieval result ordering)

This is the SAME shape executing the SAME 6 instances differently across runs. The Phase 4.5 finding (Qwen 1.33 baseline retrieval) was on different corpus + different instance ordering. NULL baseline of this Faza 1 corpus showed 1.12 mean. Fresh re-run shows 1.667 on a 6-instance subset. **Variance, not evolution.**

The Phase 4.5 mechanistic question — does the Qwen-shape mutation close the engagement gap? — REMAINS UNTESTED at this Checkpoint B. Need qwen-thinking::gen1-v1/v2 + qwen-non-thinking::gen1-v1/v2 evaluations to answer.

## §D — Cell-semantic anchor invariance count per candidate (Amendment 7 binding)

| Candidate | Anchor count (0..7) | Validator verdict |
|---|---|---|
| claude::baseline | 7/7 | n/a (baseline, anchor-invariant by definition) |
| claude::gen1-v1 | 7/7 | VALID (mutation_validator passed) |
| claude::gen1-v2 | 7/7 | VALID |
| qwen-thinking::baseline | 7/7 | n/a (baseline) |

**All 4 evaluated candidates achieve full anchor invariance (Tier 3 = 0.10 for all).** Consistent with pre-flight expectation: the 10 mutation candidates were validated at $1.43 oracle run (per Amendment 6 + audit chain). Cell-semantic substrate intact; no candidate shape modified types.ts, MULTI_STEP_ACTION_CONTRACT bytes, or any baseline shape file.

## §E — Pre-registered Δ-floor verdict (Amendment 7 §gen_1_pre_registered_delta_floor)

| Threshold | Verdict | Value | Notes |
|---|---|---|---|
| 1 — aggregate Tier 1 ≥+3pp | **FAIL** | -0.83pp (mean trio_strict across 30 evals = 0.867 vs NULL aggregate 0.875) | Aggregate dragged by claude::gen1-v2 -12.5pp; claude::gen1-v1 +12.5pp partly offsets |
| 2 — max Qwen retrieval ≥+0.10 absolute | **PASS** | +0.547 | Driven by qwen-thinking::baseline 1.667 vs NULL 1.12 (BASELINE variance, not evolution) |
| 3 — compound (Tier 1 ≥0pp AND Tier 2 ≥0.05) | **FAIL** | Tier 1 -0.83pp ✗ AND Tier 2 0.25 ✓ | Tier 1 fails compound gate |
| **Overall** | **PROCEED** | (any-one-passes rule) | Threshold 2 alone unlocks PROCEED |

**CC-2 caveat on PROCEED verdict:** Procedurally correct per Amendment 7 §gen_1_pre_registered_delta_floor.proceed_on_any_one_pass. Mechanistically, the trigger is qwen-thinking::baseline variance (not Qwen evolution signal). The MEANINGFUL evolution-test thresholds — Qwen-targeted MUTATION candidates closing the retrieval gap — are unevaluated. claude::gen1-v1 is the only mutation candidate with a positive Tier 1 signal so far; +12.5pp is the substantive evolution finding.

PM may interpret Δ-floor PROCEED as "evolution showed signal somewhere" (true: claude::gen1-v1) without granting that the Qwen mechanism is validated.

## §F — Mid-run halt threshold status (Amendment 7 §checkpoint_b_tightened.mid_run_halt_thresholds)

All three thresholds **NOT TRIGGERED** during the run.

| Threshold | Status | Observed | Threshold | Headroom |
|---|---|---|---|---|
| Per-candidate cost overshoot | NOT_TRIGGERED | 0 candidates >$0.156/eval (max $0.1266) | >3 candidates over $0.156 | Comfortable; max overshoot 81% of threshold |
| Per-shape variance widens | NOT_TRIGGERED | max range 25pp (claude shape: 100% gen1-v1 vs 75% gen1-v2) | >40pp | 15pp headroom |
| Qwen retrieval regression below NULL | NOT_TRIGGERED | qwen-thinking 1.667 ≥ NULL 1.12 (UP, not down) | < per-shape NULL with N≥3 | Reverse direction; halt logic inactive |

**Per-shape variance note:** 25pp range on claude shape (100% vs 75%) is informative — mutation oracle quality varies on the same shape. claude::gen1-v1 and claude::gen1-v2 use the same baseline (claude.ts) and same oracle prompt + temperature, but produce mutations with 25pp pass-rate spread. This is consistent with brief §3.3 (LLM stochasticity in mutation generation) and supports keeping N=2 mutations per shape (some hit, some miss).

## §G — Coverage analysis (what got tested vs what remains)

### G.1 — Evaluated at Checkpoint B (4 of 15 candidates × full or partial 8 evals = 30 total)

| Candidate | Evals | Status |
|---|---|---|
| claude::baseline | 8/8 | COMPLETE |
| claude::gen1-v1 | 8/8 | COMPLETE — **breakout candidate (+12.5pp)** |
| claude::gen1-v2 | 8/8 | COMPLETE — regressed (−12.5pp) |
| qwen-thinking::baseline | 6/8 | PARTIAL (halt fired before final 2 evals) |

### G.2 — NOT evaluated (90 evals remaining for full Gen 1)

| Candidate | Evals planned |
|---|---|
| qwen-thinking::baseline (remaining) | 2/8 |
| qwen-thinking::gen1-v1 | 8/8 |
| qwen-thinking::gen1-v2 | 8/8 |
| qwen-non-thinking::baseline | 8/8 |
| qwen-non-thinking::gen1-v1 | 8/8 |
| qwen-non-thinking::gen1-v2 | 8/8 |
| gpt::baseline | 8/8 |
| gpt::gen1-v1 | 8/8 |
| gpt::gen1-v2 | 8/8 |
| generic-simple::baseline | 8/8 |
| generic-simple::gen1-v1 | 8/8 |
| generic-simple::gen1-v2 | 8/8 |
| **Subtotal** | **90 evals** |

### G.3 — What we DON'T know yet

The Phase 4.5 mechanistic hypothesis — that Qwen-shape evolution can close the retrieval engagement gap — remains UNTESTED:
- qwen-thinking::gen1-v1 retrieval engagement: unknown
- qwen-thinking::gen1-v2 retrieval engagement: unknown
- qwen-non-thinking::*: entirely untested (baseline + 2 mutations all skipped)

The §F.1 acceptance gate per Amendment 5 + Amendment 7 requires:
- ≥+5pp trio_strict_pass delta on best candidate per shape (binding for all 5)
- For Qwen shapes: additionally mean retrieval ≥ 1.7 (Amendment 5 gate, Amendment 2 §F.5 false-positive guard at 1.5)

claude::gen1-v1 satisfies the Tier 1 portion (+12.5pp). For Qwen shapes, the gate is undefined until those candidates run.

## §H — Cost re-projection for full Gen 1 + Checkpoint C

| Phase | Evals | Per-eval (observed avg) | Subtotal | Cumulative post-phase |
|---|---|---|---|---|
| Gen 1 partial (Checkpoint B) | 30 | $0.1230 | **$3.69 (actual)** | $30.23 |
| Gen 1 remaining | 90 | $0.1230 | **$11.07** (projection) | $41.30 |
| Held-out validation (Checkpoint C) | 25 (5 shapes × 1 top × 5 instances) | $0.1230 | **$3.08** | $44.38 |
| Hard cap | n/a | n/a | $115.00 | n/a |
| Headroom post-Checkpoint-C | n/a | n/a | n/a | **$70.62** |

Per-eval cost is +0.6% above the Amendment 7 projection of $0.1243 — within sensitivity tolerance.

## §I — Recommendation paths for PM

CC-2 presents three paths.

### I.1 — Option A (CC-2 weak rec, ~$11.07): Continue to full Gen 1

Run remaining 90 evals to complete all 5 shapes × 3 candidates × 8 evals = 120 total. Halt-and-PM at Checkpoint C with held-out validation if §F.1 candidates emerge.

**Pros:**
- Tests Qwen-shape mechanistic hypothesis (whether mutations close retrieval gap on top of baseline variance)
- Tests gpt + generic-simple shapes that haven't been touched
- Methodologically tightest — full pre-registered Gen 1 design completed
- Cumulative post-full-Gen-1: $41.30 of $115 cap; healthy headroom

**Cons:**
- Spends $11+ on shapes that may not show evolution signal
- 90 evals × ~25 min per 30 evals = ~75 min wall clock additional time

### I.2 — Option B (~$0): Stop at Checkpoint B; treat claude::gen1-v1 as sole evolution finding

Treat claude::gen1-v1 +12.5pp as sufficient claude-shape signal. Skip remaining 90 evals. Author Faza 1 results decision (decisions/2026-04-XX-gepa-faza1-results.md) noting:
- claude shape: PASS (claude::gen1-v1 +12.5pp on N=8, Wilson [0.676, 1.000])
- Other 4 shapes: NOT EVALUATED in Faza 1; defer to Faza 2 expansion

**Pros:**
- Zero additional cost
- Fast path to Faza 1 closure

**Cons:**
- Faza 2 brief was supposed to gate on Faza 1 acceptance gate per all 5 shapes (or ≥3/5 per condition_2). With only 1 shape tested, conditional acceptance is uncertain.
- Doesn't test the Phase 4.5 mechanistic Qwen claim — the original brief's headline finding
- Methodologically informal — pre-registered design says 120 evals; stopping at 30 is a deviation requiring explicit Amendment

### I.3 — Option C (~$5.50): Scope-reduce — finish only Qwen shapes (mechanistic test)

Continue Gen 1 but evaluate ONLY qwen-thinking::baseline (2 remaining) + qwen-thinking::gen1-v1/v2 + qwen-non-thinking::baseline/gen1-v1/v2. Skip gpt + generic-simple. ~44 evals additional × $0.123 = ~$5.41.

**Pros:**
- Tests the Phase 4.5 mechanistic hypothesis (Qwen-shape evolution → retrieval gap closure) — the original Faza 1 motivation
- Gets §F.1 acceptance verdict on the most-load-bearing shape class
- Mid-cost option

**Cons:**
- Skips gpt + generic-simple — could miss positive findings on those (claude::gen1-v1's success suggests other shapes might also benefit)
- Requires scope-reduction Amendment (changes pre-registered design)

CC-2 weakly prefers **Option A** for methodological rigor — only $11 to finish a pre-registered design. Option C is a fair compromise if PM wants to ration cost; Option B is informal for a pre-registered design.

## §J — Audit chain

| Item | Path / SHA |
|---|---|
| This Checkpoint B report | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/checkpoint-b-report.md` |
| Run summary JSON | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-summary.json` |
| Run JSONL (30 records) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-eval.jsonl` |
| Run log | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-run.log` |
| Sunk b5avslp51 (preserved per Amendment 8 §sunk_disposition) | `*-void-registry-bug-superseded.{ext}` (3 files) + `investigate-report.md` |
| Manifest v7 SHA at run | `85858f12f1270da28277dd4d98e454d1dae8ef970537cb8c561f484599c4e2e9` (Amendment 8) |
| Predecessor commit | `4d43141` (Amendment 8 + registerShape fix) |

## §K — HALT criteria status

1. ✅ Checkpoint B report committed (this file)
2. ✅ All 4 Amendment 7 §checkpoint_b_tightened.report_extensions binding fields populated:
   - per-candidate Tier 1/2/3 breakdown ✓
   - retrieval engagement deltas per Qwen-targeted shape ✓ (qwen-thinking only; qwen-non-thinking not evaluated)
   - cell-semantic anchor invariance count per candidate ✓ (all 7/7)
   - pre-registered Δ-floor pass/fail per 3 thresholds ✓ (FAIL/PASS/FAIL → PROCEED via threshold 2)
3. ✅ Mid-run halt thresholds report ✓ (no triggers)
4. ⏳ **PM ratify path forward** (Option A / B / C per §I + interpretation of qwen-thinking::baseline retrieval anomaly per §C)

---

**End of Checkpoint B halt-and-PM report. Standing AWAITING PM ratification on §I path forward + interpretation of Qwen-baseline retrieval variance per §C before any further Gen 1 action.**
