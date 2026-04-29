---
report_id: 2026-04-28-gepa-faza1-checkpoint-a-v2
date: 2026-04-28
checkpoint: A v2 (post NULL-baseline re-run with shape-override fix per Amendment 6)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha256_amendment_6: 0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a
predecessor_artifactual: checkpoint-a-report-artifactual-bug-superseded.md
status: HALT-AND-PM (LOCKED §C verdict ANOMALOUS — INVESTIGATE; substantive interpretation suggests pre-registered bands were mis-specified given bug-fix nature; PM ratify path)
authority: PM (Marko Markovic)
---

# Checkpoint A v2 Halt-and-PM Report — NULL-baseline (Amendment 6 fix)

## TL;DR

Re-run NULL-baseline complete (40/40 evals, $4.97 — essentially identical cost envelope to $4.95 artifactual). **LOCKED §C pre-registered band verdict: ANOMALOUS** (claude delta +37.5pp > 30pp threshold). Hypothesis tree (§F.1 below) suggests this is most likely an artifact of pre-registered bands being mis-specified — the artifactual claude=50% was a single-replicate of qwen-thinking-on-Qwen-subject (per Amendment 6 bug), not a meaningful claude-shape baseline. Real per-shape data shows tight clustering (75-100% pass rate, mean 87.5%) consistent with H1: variance noise on N=8. Substantive recommendation: PM ratify whether to (a) override LOCK as expected-given-bug-fix → Gen 1 GO, or (b) hold investigation path.

Mutation oracle invariance §B.1: PASS (cell-semantic anchors byte-identical to Amendment 6 pins). Raw agreement min: 65% (PASS Amendment 5 §judge_metric_design threshold). Pre-Gen-1 cost gate (§A.10): $14.91 << $78 threshold = PASS by 5.2× margin. §F-saturated rule (§D): revoke globally, apply §F.1 (≥+5pp delta) to all 5 shapes (no shape's CI_low ≥ 0.88).

## §A — Run metadata

| Item | Value |
|---|---|
| Background job ID | `bhe0zwi91` |
| Wall clock | ~74 min (re-run started ~13:10Z, completed ~14:24Z per log timestamps) |
| Total cost | **$4.9716** (subject $0.1765 + judge $4.7951) |
| Evals | 40/40 ✅ |
| Manifest v7 SHA at run time | `0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a` (Amendment 6 binding) |
| Bug fix commit (`promptShapeOverride: shape.name`) | landed pre-run; regression test 4/4 PASS |
| Cumulative Faza 1 spend | **$25.18** ($13.35 corpus + $0.40 probes + $4.95 sunk null + $4.97 re-run + $1.43 mutations + ~$0.08 misc) |
| Headroom under $115 cap | **$89.82** |

## §B — Per-shape results

### B.1 — Mutation oracle invariance proof (LOCKED PRE-RUN-OUTPUT)

**LOCKED + verified PRE re-run output.** Verifies cell-semantic anchors are byte-identical to Amendment 6 pinned values.

| Anchor | Expected SHA-256 (Amendment 6 pin) | Actual SHA-256 (post-fix) | Match |
|---|---|---|---|
| `packages/agent/src/prompt-shapes/types.ts` | `1a9fa329e4b66ed9f0abe8bc22cbbf0124e0c879e1e78ec806d557cab25bc94d` | identical | ✅ |
| `MULTI_STEP_ACTION_CONTRACT` body (252 bytes) | `70a1701dfa126f8dc1df9c116f0a8469da005821ecadc59d9b8f348568e755ba` | identical | ✅ |
| Baseline `claude.ts` | `cbaf0c37b067b025a1fe97f2feeec11fae4070a8b3fcfaad1da8775dda451cc0` | identical | ✅ |
| Baseline `qwen-thinking.ts` | `848a4e4917baa5c7bbcc3bb35fb8cb4b4ac8f0ab537243f14cbef3a99197aacb` | identical | ✅ |
| Baseline `qwen-non-thinking.ts` | `35be379be9a8caafc2c419e32da5f63f92fc83f6f6d70d9df76029c1e8584572` | identical | ✅ |
| Baseline `gpt.ts` | `5dc6d750d52a68feb9d37ad8384b2bcd59d70962066122ff086b0e5888413576` | identical | ✅ |
| Baseline `generic-simple.ts` | `81189817f560e26a69394248d8bd9089cae72c7d40825323e2b7407e36026172` | identical | ✅ |

10 mutation candidate file SHAs recorded for audit chain (see commit history for full list). All files exist + are byte-stable.

**Verdict: PASS.** Bug fix is exclusively shape-routing; no cell-semantic file changed. Mutation oracle outputs from $1.43 oracle run carry forward into Gen 1 unchanged.

### B.2 — Per-shape aggregates table

| Shape | n | trio_strict_pass_II (≥4.0) | pass_II rate | Wilson 95% CI | trio_strict_pass_I | mean_trio | mean_retr | mean_eval_cost |
|---|---|---|---|---|---|---|---|---|
| **claude** | 8 | 7/8 | **87.5%** | [0.529, 0.978] | 8/8 | 4.299 | 1.12 | $0.1225 |
| **qwen-thinking** | 8 | 7/8 | **87.5%** | [0.529, 0.978] | 7/8 | 4.201 | 1.12 | $0.1276 |
| **qwen-non-thinking** | 8 | 8/8 | **100.0%** | [0.676, 1.000] | 8/8 | 4.264 | 1.25 | $0.1265 |
| **gpt** | 8 | 6/8 | **75.0%** | [0.409, 0.929] | 7/8 | 4.146 | 1.00 | $0.1224 |
| **generic-simple** | 8 | 7/8 | **87.5%** | [0.529, 0.978] | 8/8 | 4.208 | 1.12 | $0.1225 |
| **AGGREGATE** | 40 | **35/40** | **87.5%** | [0.737, 0.949] | 38/40 (95%) | 4.224 | 1.12 | $0.1243 |

**Loop_exhausted:** 0/40 across all shapes (consistent with NULL-baseline-v1 + Phase 4.5).

**Retrieval distribution:** {1: 35, 2: 5}. Mean across all 40: 1.12 (vs 1.05 artifactual; small upward shift).

### B.3 — Raw agreement + κ (Amendment 5 §judge_metric_design)

| Pair | Raw agreement | Cohen's κ |
|---|---|---|
| Opus ↔ GPT | **70.0%** (28/40) | +0.324 |
| **Opus ↔ MiniMax** | **95.0%** (38/40) ⭐ | **+0.724** |
| GPT ↔ MiniMax | 65.0% (26/40) | +0.198 |
| **MIN raw agreement** | **65.0%** | — |
| **MIN κ (conservative trio)** | — | +0.198 |

**Raw agreement primary verdict:** min 65% **PASS** Amendment 5 §judge_metric_design 65% threshold (exact boundary; passes per ≥65% inclusive).

**κ audit reference:** Opus↔MiniMax κ = +0.724 — substantially closer to canonical 0.7878 than artifactual run's −0.111. Cohen high-base-rate paradox still affects opus-gpt + gpt-minimax pairs (GPT pass rate 57.5% creates moderate base-rate imbalance vs Opus 87.5% and MiniMax 92.5%).

**Per-judge pass rates at threshold 4.0:**
- Opus: 35/40 (87.5%) — was 90% artifactual
- GPT: 23/40 (57.5%) — was 65% artifactual (still strict tail)
- MiniMax: 37/40 (92.5%) — was 90% artifactual

## §C — Pre-registered threshold band classification (LOCKED PRE-RUN-OUTPUT)

### Per-shape band check

| Shape | Real | Expected band (artifactual ±15pp) | In band? |
|---|---|---|---|
| claude | 87.5% | [35, 65] | **OUT** |
| qwen-thinking | 87.5% | [85, 100] | IN |
| qwen-non-thinking | 100.0% | [60, 90] | **OUT** |
| gpt | 75.0% | [73, 100] | IN |
| generic-simple | 87.5% | [73, 100] | IN |

**Per-shape bands: 3/5 IN, 2/5 OUT** → fails per-shape band condition (1).

### Uniform shift check

Deltas vs artifactual: claude +37.5, qwen-thinking −12.5, qwen-non-thinking +25, gpt −12.5, generic-simple 0.

- All same sign? NO (mixed: +37.5, −12.5, +25, −12.5, 0)
- Range = 50pp (max 37.5 − min −12.5)
- Uniform shift ≤25pp? NO

→ fails uniform shift condition (2).

### Anomalous criteria

| Criterion | Triggered? | Detail |
|---|---|---|
| Any per-shape \|delta\| > 30pp | **YES** | claude +37.5pp |
| Sign flips > 2 (above/below 50%) | NO | 0 flips (all shapes ≥50% in both runs) |
| Raw agreement min collapse > 20pp | NO | artifactual 70% → real 65% = 5pp drop |

**LOCKED VERDICT (per §C pre-registration): ANOMALOUS → file as INVESTIGATE per PM brief Step 0.5.**

## §D — §F-saturated rule re-evaluation per-shape table

Per PM brief: render this table even if §C verdict is ANOMALOUS (informational; does not feed into PASS verdict if §C is ANOMALOUS).

| Shape | Real NULL pass rate | Wilson 95% CI low | ≥0.88 met? | §F policy |
|---|---|---|---|---|
| claude | 7/8 (87.5%) | 0.529 | N | original §F.1 (≥+5pp) |
| qwen-thinking | 7/8 (87.5%) | 0.529 | N | original §F.1 (≥+5pp) |
| qwen-non-thinking | 8/8 (100.0%) | 0.676 | N | original §F.1 (≥+5pp) |
| gpt | 6/8 (75.0%) | 0.409 | N | original §F.1 (≥+5pp) |
| generic-simple | 7/8 (87.5%) | 0.529 | N | original §F.1 (≥+5pp) |

**Decision: GLOBAL — revoke §F-saturated; apply original §F.1 (≥+5pp delta) to all 5 shapes.** No shape's lower CI ≥ 0.88. Per Amendment 6 reversal protocol, §F-saturated PAUSED → REVOKED for Faza 1.

This is a clean global decision (not mixed). Subjectively, qwen-non-thinking 8/8 (100% on this sample) is intriguing — but Wilson lower CI 0.676 is well under 0.88, so even the most permissive interpretation can't justify saturated-rule for it on N=8.

## §E — Cost re-projection with sensitivity check

| Item | Artifactual | Real | Sensitivity |
|---|---|---|---|
| Per-eval cost mean | $0.1240 | $0.1243 | **+0.2%** |
| Pre-Gen-1 projection (5×3×8 × per-eval) | $14.86 | **$14.91** | +0.3% |
| Halt threshold (§A.10, 30% over $60 manifest) | $78.00 | $78.00 | — |
| Margin under threshold | +$63.14 | **+$63.09** | — |
| §E sensitivity gate (>20% over) | n/a | NO | OK |

**Pre-Gen-1 gate verdict (per §A.10): PASS by 5.2× margin.**

Cost discipline is excellent: post-fix per-eval cost essentially identical to artifactual ($0.124 vs $0.124, +0.2%). Cost is shape-independent in practice — subject + judge cost dominate; shape's prompt structure has near-zero cost impact.

## §F — Recommended next action

### F.1 — Hypothesis tree for §C ANOMALOUS verdict

**H1 (most likely, ~70% credence): The pre-registered bands in §C were mis-specified given the bug-fix context.**

The artifactual `claude=50%` (4/8) was actually 8 evals of `qwen-thinking` shape on Qwen subject (per Amendment 6 bug analysis). It was an **unlucky variance draw** of qwen-thinking-shape, not a meaningful claude-shape signal. Setting `claude expected band = 50% ± 15pp` assumed informative artifactual data. The bands implicitly trusted the bug-affected per-shape labels as approximate baselines, but per the Amendment 6 root cause they had ZERO informational content for individual shapes.

Real-run aggregate: 35/40 = 87.5% pass rate. Artifactual aggregate: 32/40 = 80%. Aggregate delta: +7.5pp. **This is well within the alternative `uniform shift ≤25pp` criterion** if interpreted as "the bug-affected aggregate vs the bug-fixed aggregate" rather than per-shape. The per-shape bands are the right concept but the per-shape *anchors* were stale.

**Evidence supporting H1:**
- Aggregate-level delta is small (+7.5pp)
- Per-shape spread is consistent with N=8 binomial variance around true rates of 75-90% (which would yield 6-8/8 with high probability)
- Cost sensitivity is +0.2% — runs are highly comparable in compute envelope
- Mutation oracle invariance proves no cell-semantic drift
- Wilson CIs for all 5 shapes overlap heavily (e.g., gpt [0.41, 0.93] overlaps qwen-non-thinking [0.68, 1.00] entirely)

**H2 (~20% credence): Shape-specific real differences exposed by bug fix.**

Some genuine per-shape variation exists; the bug-fixed run shows it for the first time. qwen-non-thinking 8/8 might reflect that explicit-structured-output shape is well-fit for Qwen synthesis. gpt 6/8 (lowest) might reflect that GPT-tailored framing has slight mismatch on Qwen subject.

**Evidence supporting H2:**
- 5pp spread among IN-band shapes (qwen-thinking 87.5, gpt 75, generic-simple 87.5)
- qwen-non-thinking outlier-high (100% vs others 75-87.5%)

But note: with N=8, Wilson CIs are too wide for any of these to be statistically distinguishable from each other or from a common true rate.

**H3 (~10% credence): Subtle other change between runs.**

Time-of-day effects on LiteLLM proxy, model-side stochasticity, or other external variance. Improbable given short interval (~1.5h between runs) and identical infrastructure.

### F.2 — §F verdict

**Per LOCKED §C protocol: INVESTIGATE.** Literal verdict respected.

**Substantive recommendation for PM:**
- **Option A (CC-2 rec): PM overrides LOCK** as anomaly being expected-given-bug-fix-context (H1 dominant); §F verdict reframed as **GO** for Gen 1; manifest v7 Amendment 7 documents the override + rationale.
- **Option B: Treat ANOMALOUS literally; INVESTIGATE.** No Gen 1 kick. Execute hypothesis tree investigation: e.g., re-run NULL-baseline a 3rd time to check variance stability ($5 + 1h); or run N=16 instead of N=8 to tighten CIs ($10 + 2h); or other.
- **Option C: Hybrid.** Acknowledge LOCK, accept H1 as the primary explanation, document rationale, proceed to Gen 1 with extra scrutiny at Checkpoint B.

CC-2 prefers Option A on these grounds:
1. The pre-registration, while well-intentioned, anchored on artifactual shape-labels that were known (post Amendment 6) to be uninformative
2. All other quality gates pass (mutation invariance, raw agreement, cost sensitivity, §F-saturated decision)
3. The "anomaly" reflects that the bug fix exposed real per-shape variance for the first time — exactly what we wanted

CC-2 fully respects PM's right to choose Option B (literal LOCK enforcement). This is exactly the discipline pre-registration is designed to enforce. PM is the right person to make that call.

## §G — Open questions for PM

1. **Override LOCK or hold investigation?** (§F.2 above — A vs B vs C)
2. **If GO, classify §F-saturated decision now or at Checkpoint C re-evaluation?** Current data says revoke globally for Faza 1; but if any shape reaches 100% on Gen 1, retroactive saturated-rule could apply. (Already covered in launch decision §A.12 retroactive clause; just confirming PM agrees with global revoke for now.)
3. **Fitness function applicability check:** with 4 of 5 shapes at 87.5% NULL and one at 100%, the §F.1 ≥+5pp delta criterion is moderately tight (claude 87.5% → 92.5%+ would mean 8/8 on Gen 1; possible but not guaranteed). For Qwen-targeted shapes, the retrieval engagement bonus +0.05 is the primary differentiator. PM ratify continuing or amending §F.1 thresholds for any shape close to 100%?

## Audit chain

| Item | Value |
|---|---|
| Real NULL-baseline JSONL | `benchmarks/results/gepa-faza1/null-baseline/null-baseline-eval.jsonl` (40 records) |
| Run log | `benchmarks/results/gepa-faza1/null-baseline/null-baseline-run.log` |
| Aggregates JSON | `benchmarks/results/gepa-faza1/null-baseline/checkpoint-a-v2-aggregates.json` |
| Old artifactual artifacts (preserved) | `*-artifactual-bug-superseded.{ext}` (5 files) |
| Manifest v7 SHA (Amendment 6 BINDING) | `0b55d8e353299594254e1a4a76f26f53014d726315dc6a0e5d6dc1a3a44a368a` |
| Substrate | `c9bda3d` (Phase 4.7) via worktree |
| Sampling seed | 42 (deterministic; same 8 instances across all 5 shapes) |

---

## HALT criteria status (per PM brief)

1. ✅ Checkpoint A v2 report committed (this file, full data filled)
2. ✅ Mutation oracle invariance proof committed (§B.1, PASS)
3. ✅ Per-shape §F-saturated decision table committed (§D, decision = revoke globally)
4. ⏳ **PM ratifies in writing** (Option A / B / C per §F.2)

---

**End of Checkpoint A v2 halt-and-PM report. Standing AWAITING PM ratification on §F.2 + §G open questions before any Gen 1 kick.**
