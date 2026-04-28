---
report_id: 2026-04-29-gepa-faza1-checkpoint-c
date: 2026-04-29
checkpoint: C (held-out validation; 15/15 evals; final Faza 1 acceptance gate)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha_amendment_11: fa716ff90a4345eb87962789f3a2ab3d54994edc93964f850ad64cf6fbf6d227
predecessor: final-gen-1-close-report.md (full Gen 1 §F.2 PASS at 3/5 shapes)
status: HALT-AND-PM (Checkpoint C completed cleanly at 15 evals; §F.2 confirmation MIXED — 2/3 candidates pass §F.5 condition_2 overfitting bound; Faza 2 deployment authorization PARTIAL)
authority: PM (Marko Markovic)
binding_directive: "PM ratify final Faza 1 closure: §F.2 still PASSES at 3/5 shapes (all 3 PASS §F.1 on held-out vs NULL); but §F.5 condition_2 FAILS for gpt::gen1-v2 (20pp in-sample-vs-held-out gap > 15pp threshold). Phase 5 deployment authorized for 2/3 candidates."
---

# Checkpoint C halt-and-PM report — 2/3 candidates PASS §F.5 overfitting bound; gpt::gen1-v2 EXPOSED as in-sample selection bias

## TL;DR

Checkpoint C held-out validation (`bbudc8f27`, exit 0) completed **15/15 evals** in 18 min wall clock at $1.93 cost (vs $3.10 PM brief projection = 38% under).

**§F.5 condition_2 verdicts (overfitting bound ±15pp, in-sample vs held-out Pass II):**

| Candidate | In-sample (N=8) | Held-out (N=5) | Gap (pp) | §F.5 condition_2 | Phase 5 deployment |
|---|---|---|---|---|---|
| **claude::gen1-v1** | **100%** | **100%** | **0pp** | **PASS** | **AUTHORIZED** |
| **qwen-thinking::gen1-v1** | **100%** | **100%** | **0pp** | **PASS** | **AUTHORIZED** + Phase 4.5 POSITIVE replicated on held-out |
| gpt::gen1-v2 | 100% | 80% (4/5) | **20pp** | **FAIL** | NOT AUTHORIZED (selection bias exposed) |

**§F.2 verdict confirmation: MIXED** (2/3 candidates PASS §F.5 condition_2). However, ALL 3 candidates still PASS §F.1 (≥+5pp delta vs NULL) on held-out — gpt::gen1-v2 held-out 80% vs NULL 75% = +5pp (at threshold). The §F.5 failure is about *out-of-distribution generalization*, not absolute acceptance.

**Faza 2 deployment authorization: PARTIAL** (2 candidates authorized: claude::gen1-v1, qwen-thinking::gen1-v1; gpt::gen1-v2 withheld).

**Cumulative Faza 1 spend:** $43.49 / $115 cap (38% used; headroom **$71.51**).

**Next steps per summary:**
1. Compute κ_trio on combined Gen 1 (120) + Checkpoint C (15) = 135 evals for §F.3 verdict
2. Author Faza 1 final summary memo per PARTIAL authorization status
3. PM ratify final Faza 1 closure decision

## §A — Run metadata

| Item | Value |
|---|---|
| Background job ID | `bbudc8f27` |
| Wall clock | ~18 min (held-out 15 evals × ~70s/eval avg) |
| Total cost | **$1.9322** |
| Evals completed | **15/15** ✅ |
| Halt reason | scheduled completion (no mid-run halts) |
| Manifest binding SHA | `fa716ff90a4345eb87962789f3a2ab3d54994edc93964f850ad64cf6fbf6d227` (Amendment 11) |
| Cumulative Faza 1 spend | **$43.49** ($25.18 pre-Gen-1 + $1.36 sunk + $15.02 Gen 1 + $1.93 Checkpoint C) |
| Headroom under $115 cap | **$71.51** |
| Cost vs PM brief projection | $1.93 actual / $3.10 projected = -38% |

## §B — Held-out instance selection (per pre-registration)

5 instances selected via `deterministicShuffle(corpus, seed=42).slice(8, 13)` — same shuffle order Gen 1 used (Gen 1 used slice(0, 8)). NO overlap with Gen 1 sample.

| Index | Instance ID | Task family | Persona | Stage |
|---|---|---|---|---|
| 8 | h3-F2-p3_coo-stage_b_post_profitable_consolidation-001 | F2 (cross-thread coordination) | p3_coo | stage_b |
| 9 | h3-F1-p2_cfo-stage_a_series_b_growth_burning-001 | **F1 (strategic synthesis)** ⭐ | p2_cfo | stage_a |
| 10 | h3-F4-p2_cfo-stage_b_post_profitable_consolidation-001 | F4 (investor communications) | p2_cfo | stage_b |
| 11 | h3-F5-p1_founder_ceo-stage_a_series_b_growth_burning-001 | F5 (scenario planning) | p1_founder_ceo | stage_a |
| 12 | h3-F3-p2_cfo-stage_a_series_b_growth_burning-001 | F3 (decision support) | p2_cfo | stage_a |

Notable: **F1 (strategic synthesis) is exclusively in held-out** — Gen 1's 8-instance sample didn't include any F1 instance per the seed=42 shuffle ordering. Held-out provides the only Faza 1 evidence on F1 task family. All 5 task families (F1-F5) covered across in-sample + held-out combined.

## §C — Per-candidate analysis

### C.1 — claude::gen1-v1: GENERALIZES PERFECTLY

| Metric | In-sample (N=8) | Held-out (N=5) | Delta |
|---|---|---|---|
| Trio Pass II rate | 100% (8/8) | **100% (5/5)** | 0pp |
| Mean retrieval | 1.625 | 1.4 | -0.225 (within ±0.55 noise band) |
| Tier 1 (vs NULL claude 87.5%) | +12.5pp | **+12.5pp** | identical |
| Tier 2 (non-Qwen) | 0 | 0 | n/a |
| Tier 3 (anchor invariance) | 0.10 | 0.10 | identical |
| §F.5 condition_2 | n/a | gap 0pp ≤ 15pp threshold | **PASS** |
| **Phase 5 deployment** | n/a | **AUTHORIZED** | — |

claude::gen1-v1 generalizes flawlessly. Same Pass II rate on held-out as in-sample, demonstrating the in-sample +12.5pp finding wasn't selection-biased.

### C.2 — qwen-thinking::gen1-v1: PHASE 4.5 MECHANISM REPLICATES ON HELD-OUT

| Metric | In-sample (N=8) | Held-out (N=5) | Delta |
|---|---|---|---|
| Trio Pass II rate | 100% (8/8) | **100% (5/5)** | 0pp |
| Mean retrieval | 2.375 | **2.0** | -0.375 |
| Tier 1 (vs NULL qwen-thinking 87.5%) | +12.5pp | **+12.5pp** | identical |
| Tier 2 retrieval bonus (cap 0.25) | 0.25 (cap, +0.505 vs NULL) | **0.25 cap** (+0.88 vs NULL) | cap maintained |
| Tier 3 | 0.10 | 0.10 | identical |
| §F.5 condition_2 | n/a | gap 0pp ≤ 15pp threshold | **PASS** |
| **Phase 5 deployment** | n/a | **AUTHORIZED** | — |

**Phase 4.5 mechanistic verdict CONFIRMED ON HELD-OUT** per Amendment 9 §qwen_evolution_verdict_capture.positive_signal_definition:
- ✓ Tier 1 +12.5pp (target ≥+5pp)
- ✓ Mean retrieval 2.0 ≥ 1.7 (target Amendment 5 §F.1 Qwen sub-criterion)
- ✓ Mutation 2.0 > NULL 1.12 (mutation > same-shape baseline analog; same-shape baseline not run on held-out, but NULL-baseline serves as anchor)
- ✓ False-positive guard 2.0 ≥ 1.5

The retrieval engagement closure (Phase 4.5 mechanism) is REAL — held-out 2.0 retrieval is slightly below in-sample 2.375 but well above the 1.7 floor and the NULL 1.12 baseline. Out-of-distribution generalization preserves the mechanism activation.

This is the strongest finding in Faza 1: not just that mutations improve quality, but that the MECHANISTIC explanation (retrieval engagement closure) generalizes to held-out instances.

### C.3 — gpt::gen1-v2: SELECTION BIAS EXPOSED

| Metric | In-sample (N=8) | Held-out (N=5) | Delta |
|---|---|---|---|
| Trio Pass II rate | **100% (8/8)** | **80% (4/5)** | **-20pp** |
| Mean retrieval | 2.0 | 1.8 | -0.2 |
| Tier 1 (vs NULL gpt 75%) | +25pp | **+5pp** | -20pp |
| Tier 2 (non-Qwen) | 0 | 0 | n/a |
| Tier 3 | 0.10 | 0.10 | identical |
| §F.5 condition_2 | n/a | gap 20pp > 15pp threshold | **FAIL** |
| **Phase 5 deployment** | n/a | **NOT AUTHORIZED** | — |

**Substantive interpretation:**
- gpt::gen1-v2 still PASSES §F.1 (held-out +5pp delta vs NULL gpt 75% = exactly at threshold)
- But the in-sample +25pp signal was selection-biased: 8/8 perfect in-sample, only 4/5 on held-out
- The "+25pp" was lucky-draw on the seed=42 8-instance sample; true effect size is closer to +5pp (or potentially less, given Wilson CI on 4/5 is wide)
- Phase 5 deployment NOT authorized per pre-registered §F.5 condition_2 (overfitting bound)

The 1 failing held-out instance (h3-F4-p2_cfo-stage_b_post_profitable_consolidation-001) had trio_mean = 3.833, just below the ≥4.0 threshold. Wilson 95% CI on 4/5 = [0.376, 0.964] — very wide; cannot statistically distinguish from in-sample 100% but trend is concerning.

This is the EXACT methodological purpose of held-out validation: detect overfitting that in-sample data alone cannot.

## §D — §F.2 verdict confirmation status

§F.2 binding gate: ≥3/5 shapes show best-mutation ≥+5pp delta vs NULL.

### D.1 — Held-out delta vs NULL (does §F.2 still PASS without §F.5 caveat?)

| Shape | Best candidate | In-sample delta | Held-out delta | §F.1 on held-out |
|---|---|---|---|---|
| claude | gen1-v1 | +12.5pp | +12.5pp | **PASS** |
| qwen-thinking | gen1-v1 | +12.5pp | +12.5pp | **PASS** |
| gpt | gen1-v2 | +25pp | +5pp | PASS (at threshold) |

**3/5 shapes still PASS §F.1 on held-out.** §F.2 PASS verdict (from Gen 1) is NOT reverted — it survives generalization on the threshold criterion.

### D.2 — §F.5 condition_2 + §F.2 confirmation

§F.5 condition_2 (held-out within ±15pp of in-sample) is a STRICTER acceptance — overfitting must be bounded for Phase 5 deployment. Per Checkpoint C summary:
- 2/3 candidates PASS §F.5 condition_2 (claude::gen1-v1, qwen-thinking::gen1-v1)
- 1/3 candidate FAILS §F.5 condition_2 (gpt::gen1-v2)

§F.2 confirmation status: **MIXED** (per pre-registered logic in run-checkpoint-c.ts: all PASS → CONFIRMED, all FAIL → REVERTED, else MIXED).

**Substantive interpretation:** §F.2 PASS at the §F.1 (threshold) level holds; §F.2 PARTIAL when filtered through §F.5 condition_2 (deployment authorization).

## §E — Faza 2 deployment authorization: PARTIAL

| Candidate | Phase 5 deployment | Rationale |
|---|---|---|
| claude::gen1-v1 | **AUTHORIZED** | §F.5 condition_2 PASS (gap 0pp); generalizes flawlessly |
| qwen-thinking::gen1-v1 | **AUTHORIZED** | §F.5 condition_2 PASS (gap 0pp) + Phase 4.5 mechanism replicated on held-out |
| gpt::gen1-v2 | NOT AUTHORIZED | §F.5 condition_2 FAIL (gap 20pp > 15pp); in-sample +25pp was selection bias |

Faza 2 expansion brief authoring should:
1. Inherit claude::gen1-v1 + qwen-thinking::gen1-v1 as deployable variants
2. Document gpt::gen1-v2 as showing real but smaller signal (+5pp held-out, not +25pp); recommend re-evaluation at N=16+ in Faza 2 to tighten Wilson CI
3. arxiv §5.4 reflects PARTIAL authorization status with explicit selection-bias-exposure narrative

## §F — Anti-misattribution lock confirmation (Amendment 9 §qwen_baseline_anomaly_disposition)

The qwen-thinking::gen1-v1 held-out finding is FREE of any prior anti-misattribution concern:
- Held-out is N=5 on instances NOT in Gen 1 sample
- Comparison to NULL baseline 1.12 (full N=8 from Checkpoint A v2) — anchored, audit-chain-pinned
- Mutation candidate retrieval 2.0 vs NULL 1.12 = +0.88 absolute lift on out-of-distribution sample
- All 4 Amendment 9 positive_signal gates PASS on held-out

**Sanctioned attribution for arxiv §5.4 / Phase 5 brief:**
- "qwen-thinking::gen1-v1 retrieval engagement closure (1.12 NULL → 2.0 held-out, +0.88 absolute) generalizes to held-out instances; Phase 4.5 mechanism not selection-biased"
- "claude::gen1-v1 +12.5pp signal generalizes flawlessly; held-out 100% Pass II matches in-sample 100%"
- "gpt::gen1-v2 +25pp in-sample reduced to +5pp on held-out — selection-biased on N=8 sample; true effect size requires N=16+ for tight CI"

**Forbidden attribution:**
- "Faza 1 fully validates GEPA evolution mechanism across all shapes" (false — qwen-non-thinking + generic-simple still UNTESTED on held-out; gpt overfit)
- "gpt::gen1-v2 +25pp evolution signal" (revised — true effect size +5pp, in-sample was selection-biased)

## §G — Pending §F.3 (κ stability) recompute

Combined Gen 1 (120) + Checkpoint C (15) = 135 evals. CC-2 has not yet computed κ_trio on the combined sample. Per launch decision §F condition_3, κ must remain within ±0.05 of canonical 0.7878 (drift band [0.7378, 0.8378]).

Initial expectation (based on Checkpoint A v2 pattern):
- Opus↔MiniMax κ at NULL was +0.724 (substantial recovery from artifactual -0.111 pre-Amendment-6)
- Gen 1 sample with high-base-rate skew (most shapes near 75-100% Pass II) likely keeps κ in similar range
- Cohen 1960 high-base-rate paradox (Amendment 5 §judge_metric_design.cohen_paradox_note) means literal κ values may be small even with high raw agreement

PM ratify whether to:
- Compute κ now (CC-2 can run via kappa-audit.ts module on combined JSONL)
- Defer to Faza 1 closure decision authoring step
- Document κ as supplementary metric per Amendment 5 §judge_metric_design (raw agreement primary)

## §H — Audit chain

| Item | Path / SHA |
|---|---|
| This Checkpoint C report | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/checkpoint-c/checkpoint-c-report.md` |
| Run summary JSON (15 evals) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/checkpoint-c/checkpoint-c-summary.json` |
| Run JSONL (15 records) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/checkpoint-c/checkpoint-c-eval.jsonl` |
| Run log | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/checkpoint-c/checkpoint-c-run.log` |
| Manifest binding | `fa716ff90a4345eb87962789f3a2ab3d54994edc93964f850ad64cf6fbf6d227` (Amendment 11) |
| Predecessor commits | Final Gen 1 close `bf9219a` + run-checkpoint-c.ts commit (post-edit) |

## §I — HALT criteria status

1. ✅ Checkpoint C report committed (this file)
2. ✅ Per-candidate held-out Pass II + Tier 1/2/3 fitness computed (§C)
3. ✅ In-sample-vs-held-out gap analysis per candidate (§C tables)
4. ✅ §F.5 condition_2 verdicts captured (claude PASS / qwen-thinking PASS / gpt FAIL)
5. ✅ §F.2 confirmation status: MIXED (2/3 §F.5 PASS; all 3 §F.1 PASS on held-out)
6. ✅ Faza 2 deployment authorization: PARTIAL (2/3 candidates authorized)
7. ⏳ §F.3 (κ stability) — pending recompute (PM ratify timing)
8. ⏳ Faza 1 final summary memo — pending authoring
9. ⏳ **PM ratify final Faza 1 closure decision** (`decisions/2026-04-29-gepa-faza1-results.md`)

## §J — PM ratify path forward

CC-2 presents three paths for Faza 1 closure.

### J.1 — Option A (CC-2 weak rec): Standard closure with κ recompute

1. CC-2 computes κ_trio on combined 135 evals (~$0, no LLM calls)
2. CC-2 authors Faza 1 results decision (`decisions/2026-04-29-gepa-faza1-results.md`) documenting:
   - §F.1: 3/5 shapes PASS on held-out (claude + qwen-thinking + gpt; latter at threshold)
   - §F.2: PASS at §F.1 level; PARTIAL at §F.5 condition_2 level
   - §F.3: κ verdict per recompute
   - §F.4: PASS (105/105 anchor invariance)
   - §F.5: PASS for claude::gen1-v1 + qwen-thinking::gen1-v1; FAIL for gpt::gen1-v2
   - Faza 2 authorization: PARTIAL (2/3 candidates)
   - Phase 5 GEPA-evolved variant deployment authorized for claude + qwen-thinking shapes only
3. PM ratifies decision; Faza 1 CLOSED

### J.2 — Option B (~$2-4): Re-validate gpt::gen1-v2 at N=16

Run 11 additional held-out evals on gpt::gen1-v2 (5 already done; 11 more × $0.13 = ~$1.43) on different held-out subset (slice 13-23) to tighten Wilson CI.

**Pros:** addresses selection bias on gpt::gen1-v2 directly; could authorize Phase 5 deployment if confirmed
**Cons:** $1.43 + investigation cost; goes beyond pre-registered design

### J.3 — Option C (~$0): Hard close, no further action

Skip κ recompute; close Faza 1 with current data; defer all loose ends to Faza 2.

**Pros:** fastest closure
**Cons:** §F.3 verdict missing; §F.5 gpt::gen1-v2 finding incomplete

CC-2 weakly prefers **Option A** — clean closure with κ recompute is ~$0 incremental and produces a complete Faza 1 verdict ready for Phase 5 deployment authorization + arxiv §5.4 framing.

---

**End of Checkpoint C halt-and-PM report. Standing AWAITING PM ratification on §J path forward + acknowledgment of partial Faza 2 deployment authorization (claude::gen1-v1 + qwen-thinking::gen1-v1 AUTHORIZED; gpt::gen1-v2 NOT AUTHORIZED due to §F.5 condition_2 fail).**
