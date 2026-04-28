---
report_id: 2026-04-28-gepa-faza1-post-amendment-10-halt
date: 2026-04-28
checkpoint: Post-Amendment-10 resume halt (57/120 evals; mid-run halt fired with calibration_fix in place)
manifest_anchor: manifest-v7-gepa-faza1
manifest_v7_sha_amendment_9: 5e3ad831c61beb19ccb4ff42b455b4c3964d830808944d4915189c5e9b1709b8
manifest_v7_sha_amendment_10: 7fb2fb930670b5a28e417a76c64ca1a556f05afb9cf0761aba9f83f0c5de1c9b
predecessor: full-gen-1-halt-report.md (53/120 halt; Amendment 10 §10.1 calibration_fix authored)
status: HALT-AND-PM (calibration_fix did NOT prevent halt; mutation_execution_gate satisfied via N=1 mutation eval but aggregate baseline-only due to MIN_EVALS=5 filter; binding protocol escalates to Option C / Amendment 11)
authority: PM (Marko Markovic)
binding_directive: "Amendment 10 §10.1.binding_per_run_protocol: if halt fires AGAIN with calibration fix in place, that IS Phase 4.5 direction_2 verdict per Amendment 9. Halt + capture; do NOT auto-recover. Escalate to Option C (Amendment 11 interface refactor)."
---

# Post-Amendment-10 halt-and-PM report — calibration nuance + Option C escalation question

## TL;DR

Resume run (`bj1vq1gxq`, exit 0) executed **4 additional evals** beyond the prior halt (54 → 57 cumulative) before the Amendment 7 mid-run halt fired AGAIN — this time with the Amendment 10 §10.1 calibration_fix in place.

**Halt details:** `qwen-non-thinking` aggregate mean retrieval 1.125 < NULL 1.250 (n=8). The mutation_execution_gate from Amendment 10 §10.1 was SATISFIED (qwen-non-thinking::gen1-v1 had 1 eval), but the MIN_EVALS=5 filter EXCLUDED the mutation eval from the aggregate (1 < 5), so the aggregate is computed from BASELINE evals only.

**Mechanistic nuance:** the single qwen-non-thinking::gen1-v1 eval showed retrieval = 2.0 (vs baseline 1.125 = **+0.875 absolute**) — pointing in the POSITIVE direction (closer to qwen-thinking::gen1-v1 pattern), opposite of direction_2 (regression). But N=1 is too thin to verdict.

**Per binding protocol (Amendment 10 §10.1.binding_per_run_protocol):** halt → escalate to Option C / Amendment 11 interface refactor; do NOT auto-recover.

**CC-2 substantive observation:** the halt fires on baseline-aggregate-driven signal even with calibration_fix, because MIN_EVALS=5 excludes a mutation that had only 1 eval at halt time. This is a second-order calibration question: should mutation candidates with N<MIN_EVALS still count toward the aggregate (with weight) or be entirely excluded? Amendment 10 §10.1 chose exclusion (noise control); current halt is the consequence.

PM ratify: Option C escalation (per binding) | Option D second-order calibration tweak (count mutation evals partially) | Option E interpret as Phase 4.5 mixed verdict (POSITIVE qwen-thinking + INCONCLUSIVE qwen-non-thinking).

## §A — Run metadata

| Item | Value |
|---|---|
| Background job ID | `bj1vq1gxq` |
| Wall clock | ~3 min (20:36 UTC start, 20:38 UTC halt; resume from 53 to 57 evals) |
| Incremental cost (this run) | **$0.48** (4 new evals × ~$0.12) |
| Total cost in JSONL (cumulative) | **$7.0346** |
| Evals (cumulative) | **57/120** ⚠️ (halted pre-target; +4 vs prior halt) |
| Halt reason | `Amendment 7 §checkpoint_b_tightened.qwen_retrieval_engagement_regression (post Amendment 10 §10.1 calibration_fix): shape=qwen-non-thinking mean=1.125 < NULL baseline 1.250 (n=8; ≥1 mutation candidate evaluated for shape)` |
| Manifest binding SHA | `7fb2fb930670b5a28e417a76c64ca1a556f05afb9cf0761aba9f83f0c5de1c9b` (Amendment 10) |
| Cumulative Faza 1 spend | **$33.57** ($25.18 pre-Gen-1 + $1.36 sunk-bug + $7.03 cumulative-Gen-1) |
| Headroom under $115 cap | **$81.43** |

## §B — Calibration diagnostic: how the halt fired despite Amendment 10 §10.1

### B.1 — Code state post-Amendment-10

```typescript
const QWEN_RETRIEVAL_REGRESSION_MIN_EVALS = 5;  // raised from 3

// in checkMidRunHalts():
const allShapeAccs = [...accs.values()].filter(a => a.shape === shape);
const hasMutationEvalsForShape = allShapeAccs.some(a => a.variant !== 'baseline' && a.evalCount > 0);
if (!hasMutationEvalsForShape) continue;  // mutation_execution_gate

const shapeAccs = allShapeAccs.filter(a => a.evalCount >= QWEN_RETRIEVAL_REGRESSION_MIN_EVALS);
if (shapeAccs.length === 0) continue;
// aggregate over shapeAccs
```

### B.2 — Halt-time state for qwen-non-thinking shape

| Candidate | evalCount | meanRetrieval | Passes mutation_execution_gate? | Passes MIN_EVALS=5 filter? | In aggregate? |
|---|---|---|---|---|---|
| qwen-non-thinking::baseline | 8 | 1.125 | n/a (baseline) | YES (8 ≥ 5) | YES |
| qwen-non-thinking::gen1-v1 | **1** | **2.0** | YES (variant !== 'baseline') | **NO** (1 < 5) | **NO** |
| qwen-non-thinking::gen1-v2 | 0 | n/a | n/a | NO | NO |

**`hasMutationEvalsForShape` = TRUE** (gen1-v1 has 1 eval). **Mutation_execution_gate satisfied.**

**Aggregate computed over baseline only** (gen1-v1 below MIN_EVALS=5 threshold).

Aggregate mean = (1.125 × 8) / 8 = **1.125** < NULL baseline **1.250** → HALT FIRED.

### B.3 — What direction is qwen-non-thinking actually pointing?

| Source | mean retrieval | Notes |
|---|---|---|
| NULL-baseline (Checkpoint A v2 §B.2, n=8) | 1.250 | reference baseline on same 8 instances |
| Gen 1 baseline (n=8 fresh re-run on same 8 instances) | 1.125 | -0.125 absolute vs NULL (variance, slightly outside ±0.10 noise band) |
| Gen 1 mutation gen1-v1 (n=1 partial) | **2.000** | +0.875 absolute vs same-shape baseline (POSITIVE direction, but N=1) |
| If gen1-v1 were INCLUDED in aggregate (n=9 total) | (1.125×8 + 2.0×1) / 9 = **1.222** | -0.028 absolute vs NULL (within ±0.10 noise band) |

**The single mutation eval points in POSITIVE direction** (closer to qwen-thinking::gen1-v1 pattern of +0.75 absolute lift). **If counted in aggregate, halt would NOT have fired** (1.222 vs NULL 1.250 = -0.028 within noise band).

The halt is procedurally correct per Amendment 10 §10.1 (MIN_EVALS=5 filter is binding). Mechanistically, it's firing on baseline-aggregate within ±0.13 of NULL while a mutation candidate showed lift on the only eval that ran.

## §C — Per-candidate Tier 1/2/3 breakdown (8 candidates evaluated; 4 partial)

### C.1 — claude shape (3/3 candidates, full N=8 each)

| Candidate | n | Pass II | Mean retrieval | Tier 1 | Tier 2 | Tier 3 | Aggregate |
|---|---|---|---|---|---|---|---|
| claude::baseline | 8 | 87.5% | 1.25 | 0pp | 0 | 0.10 | 0.10 |
| **claude::gen1-v1** ⭐ | 8 | **100%** | 1.625 | **+12.5pp** | 0 | 0.10 | **0.10** |
| claude::gen1-v2 | 8 | 75% | 1.75 | -12.5pp | 0 | 0.10 | 0.10 |

**§F.1 acceptance:** claude::gen1-v1 PASS (+12.5pp ≥ +5pp).

### C.2 — qwen-thinking shape (3/3 candidates, full N=8 each) — Phase 4.5 POSITIVE confirmed

| Candidate | n | Pass II | Mean retrieval | Tier 1 | Tier 2 | Tier 3 | Aggregate |
|---|---|---|---|---|---|---|---|
| qwen-thinking::baseline | 8 | 87.5% | 1.625 | 0pp | 0.25 (cap) | 0.10 | 0.35 |
| **qwen-thinking::gen1-v1** ⭐⭐ | 8 | **100%** | **2.375** | **+12.5pp** | **0.25 cap** | 0.10 | **0.35** |
| qwen-thinking::gen1-v2 | 8 | 75% | 2.125 | -12.5pp | 0.25 cap | 0.10 | 0.35 |

**§F.1 acceptance:** qwen-thinking::gen1-v1 PASS (+12.5pp + retrieval 2.375 ≥ 1.7).

**Phase 4.5 POSITIVE verdict** (per Amendment 9 §qwen_evolution_verdict_capture):
- ✓ +12.5pp trio_strict vs NULL
- ✓ Retrieval 2.375 ≥ 1.7
- ✓ Mutation > same-shape baseline (2.375 > 1.625, +0.75 absolute)
- ✓ False-positive guard 2.375 ≥ 1.5
- **Phase 4.5 mechanism CONFIRMED on qwen-thinking shape at full N=8.**

### C.3 — qwen-non-thinking shape (1/3 candidates full + 1/3 partial)

| Candidate | n | Pass II | Mean retrieval | Tier 1 | Tier 2 | Tier 3 | Aggregate | Notes |
|---|---|---|---|---|---|---|---|---|
| qwen-non-thinking::baseline | 8 | 100% (8/8) | 1.125 | 0pp | 0 (delta -0.125 vs NULL) | 0.10 | 0.10 | Full sample |
| **qwen-non-thinking::gen1-v1** | **1** | 100% (1/1) | **2.0** | 0pp* | **0.25 cap*** | 0.10 | **0.35** | **N=1 partial; Tier 1 reflects 1/1 vs NULL 1.0; Tier 2 reflects +0.875 absolute lift** |
| qwen-non-thinking::gen1-v2 | 0 | n/a | n/a | n/a | n/a | n/a | n/a | NOT EVALUATED |

\* Tier 1 for gen1-v1 N=1 is mathematically 0pp because 1/1 = 100% = NULL 100%; Tier 2 is computed against per-shape NULL baseline 1.25 (delta 2.0-1.25 = +0.75 absolute → cap 0.25).

**§F.1 acceptance status:** UNDEFINED (mutation candidates have N=1 + N=0; cannot verdict on N<8 per pre-registered design).

**Critical observation per Amendment 9 §qwen_baseline_anomaly_disposition:** qwen-non-thinking::baseline retrieval -0.125 absolute vs NULL is variance/baseline-shift, NOT evolution. The mutation candidate (gen1-v1 single eval) shows +0.875 absolute lift over same-shape baseline — direction_1 (positive) signal, but UNDER-POWERED at N=1.

### C.4 — gpt + generic-simple shapes (NOT EVALUATED)

| Shape | Candidates evaluated | Status |
|---|---|---|
| gpt | 0/3 | NOT EVALUATED (24 evals remaining) |
| generic-simple | 0/3 | NOT EVALUATED (24 evals remaining) |

**Total evals remaining for full Gen 1: 63** (qwen-non-thinking 15 + gpt 24 + generic-simple 24).

## §D — Δ-floor verdict (full N=57)

| Threshold | Verdict | Value | Notes |
|---|---|---|---|
| 1 — Tier 1 ≥+3pp aggregate | FAIL | +1.97pp | improved from -0.83pp at Checkpoint B; still below +3pp threshold |
| 2 — Qwen retrieval ≥+0.10 absolute | **PASS** | +0.92 | qwen-thinking dominates aggregate; mechanism active per §C.2 |
| 3 — compound (Tier 1 ≥0pp AND Tier 2 ≥0.05) | **PASS** | Tier 1 +1.97pp ≥0 ✓, Tier 2 0.20 ≥0.05 ✓ | both gates met |
| **Overall** | **PROCEED** | thresholds 2 + 3 PASS | mechanistically driven by qwen-thinking::gen1-v1 |

## §E — Phase 4.5 mechanistic verdict per shape

| Shape | Verdict | Confidence | Evidence |
|---|---|---|---|
| qwen-thinking | **POSITIVE** | High (N=8 mutation, N=8 baseline) | gen1-v1: +12.5pp trio + retrieval 2.375 (vs same-shape baseline 1.625, +0.75); 91% of Opus parity; all 4 Amendment 9 gates PASS |
| qwen-non-thinking | **AMBIGUOUS** | Low (N=1 mutation, N=8 baseline) | gen1-v1 single eval shows +0.875 absolute retrieval lift vs same-shape baseline (POSITIVE direction); but N=1 cannot verdict; baseline -0.125 vs NULL is within edge-of-variance band |

The Phase 4.5 finding is REAL on qwen-thinking. On qwen-non-thinking, evidence is *suggestive of positive* but insufficient. Per Amendment 9 §qwen_evolution_verdict_capture, the qwen-non-thinking verdict is currently UNDEFINED (N<8 on both mutation candidates).

The halt that fired is procedurally direction_2 per Amendment 10 §10.1 binding, but mechanistically the available data (gen1-v1 N=1 +0.875 absolute) is in the POSITIVE direction. **The binding rule and the empirical data point opposite ways.**

## §F — Why Amendment 10 §10.1 didn't prevent this halt

Amendment 10 §10.1 had two changes:
1. `MIN_EVALS = 3 → 5`
2. `mutation_execution_gate` — halt only fires when ≥1 mutation has any eval

Both changes activated as designed. The interaction is the issue: when MIN_EVALS=5 EXCLUDES the mutation candidate (N=1 < 5) from the aggregate, the aggregate becomes baseline-only — but the mutation_execution_gate still allows the halt because the mutation has SOME eval. So the halt fires on baseline aggregate while the mutation-gate is mechanically satisfied.

This is a **second-order calibration question** Amendment 10 didn't address: should `mutation_execution_gate` require the mutation to be IN the aggregate (i.e., ≥MIN_EVALS evals on a mutation candidate), not just ≥1 eval? Or should the aggregate include all evals on that shape (baseline + mutation, no MIN_EVALS filter on individual candidates)?

CC-2 had not anticipated this interaction at Amendment 10 authoring time. The two-run empirical evidence basis (b5avslp51 + b1t474yqd) was halts on baseline-only data with no mutation evaluation; this halt is a NEW mode (halt with mutation having minimal evaluation).

## §G — PM ratify path forward

### G.1 — Option C (per Amendment 10 binding, ~$15K wall clock no add'l cost): Escalate to Amendment 11 interface refactor

Per Amendment 10 §10.1.binding_per_run_protocol, this halt IS Phase 4.5 direction_2 verdict. Escalate to Amendment 11. Author manifest amendment documenting:
- Faza 1 verdict: PARTIAL (qwen-thinking POSITIVE confirmed; qwen-non-thinking AMBIGUOUS at halt)
- Interface refactor scope: redesign mutation injection mechanism (e.g., pass PromptShape object directly via `promptShapeObject?: PromptShape` parameter, not via REGISTRY name lookup)
- Faza 1 closure with §F.2 status 2/5 confirmed positive
- Faza 2 expansion brief authoring re-scoped to test interface refactor

**Pros:** strict adherence to binding protocol; CC-2 followed PM directive without deviation
**Cons:** ignores empirical data showing qwen-non-thinking::gen1-v1 N=1 +0.875pp lift in POSITIVE direction; halt mechanistically driven by baseline aggregate not mutation regression; gpt + generic-simple control shapes never tested

### G.2 — Option D (~$8 + Amendment 11): Second-order calibration fix + resume

Author Amendment 11 §11.1 amended_calibration:
- Option D-α: extend mutation_execution_gate to require ≥MIN_EVALS evals on at least 1 mutation candidate (not just ≥1 eval). With MIN_EVALS=5, halt waits until a mutation has 5+ evals before becoming active.
- Option D-β: aggregate over ALL evals on shape (no MIN_EVALS filter on individual candidates), require ≥10 total evals across shape before halt active. With current state (8 baseline + 1 mutation = 9 total on qwen-non-thinking), would not have fired.
- Option D-γ: use both: require mutation ≥MIN_EVALS on at least one candidate AND aggregate over all qualifying candidates.

CC-2 leans Option D-α (cleanest delta from Amendment 10 §10.1; preserves noise-control rationale; just defers halt activation until mutation data is statistically meaningful).

**Pros:** halt rule honors empirical insight (Amendment 10 §10.1 was correct direction; just missed the second-order interaction); finishes pre-registered design; gets §F.2 verdict
**Cons:** another calibration cycle; PM may view as moving the goalposts; methodologically requires ratification

### G.3 — Option E (~$0): Accept halt + Faza 1 closure with mixed verdicts

Treat current 57/120 as terminal. Faza 1 closure decision:
- claude shape: PASS (gen1-v1 +12.5pp)
- qwen-thinking shape: PASS + Phase 4.5 POSITIVE
- qwen-non-thinking shape: AMBIGUOUS (N=1 mutation suggests positive but unverdicted; baseline -0.125 within edge-of-variance)
- gpt shape: NOT EVALUATED
- generic-simple shape: NOT EVALUATED
- §F.2 (≥3/5 positive): 2/5 confirmed → FAIL

Author Amendment 11 §scope_reduction documenting closure rationale + arxiv §5.4 framing.

**Pros:** zero additional cost; respects halt-and-PM binding (no auto-recover); avoids further calibration cycles
**Cons:** §F.2 cannot pass at 2/5; pre-registered design 47.5% complete (57/120); gpt + generic-simple control evidence missing

### G.4 — Option F (~$8 + halt-bypass note): One-time halt override + finish

Per investigate-report style: bypass the halt for the rest of this run (not a calibration change). Add audit note that this is a deliberate one-time override based on §B.3 mechanistic analysis. Finish 63 evals.

**Pros:** fastest path to full coverage; preserves Amendment 10 §10.1 unchanged for future runs
**Cons:** bypasses binding halt mechanism; methodologically informal; sets precedent that overrides are acceptable when CC-2 disagrees with verdict

### CC-2 weak preference

CC-2 weakly prefers **Option D-α** — the empirical interaction (mutation excluded from aggregate by its own MIN_EVALS filter) was an unanticipated second-order effect; tightening the gate to require mutations be statistically meaningful before activating halt is the cleanest fix. It's also consistent with the rationale of Amendment 10 §10.1 (don't fire on under-powered evidence).

PM may reasonably prefer Option C (binding adherence) — that's a defensible methodological choice. Option E is an acceptable scope-reduction Faza 1 closure with explicit caveats. Option F is not recommended (informal vs binding).

## §H — Audit chain

| Item | Path / SHA |
|---|---|
| This halt report | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/post-amendment-10-halt-report.md` |
| Run summary JSON (57 evals) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-summary.json` |
| Run JSONL (57 records) | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-eval.jsonl` |
| Run log | `D:/Projects/waggle-os-faza1-wt/benchmarks/results/gepa-faza1/gen-1/gen-1-run.log` |
| Manifest binding | `7fb2fb930670b5a28e417a76c64ca1a556f05afb9cf0761aba9f83f0c5de1c9b` (Amendment 10) |
| Predecessor commits | `7366063` (full Gen 1 halt @ 53/120), Amendment 10 commit (post-edit) |

## §I — HALT criteria status

1. ✅ Post-Amendment-10 halt report committed (this file)
2. ✅ Calibration diagnostic surfaced per §B (mutation_execution_gate fired correctly; aggregate driven by MIN_EVALS exclusion of N=1 mutation)
3. ✅ Phase 4.5 POSITIVE on qwen-thinking confirmed at full N=8 (per Amendment 9 §qwen_evolution_verdict_capture all 4 gates)
4. ✅ qwen-non-thinking verdict captured as AMBIGUOUS (N=1 mutation +0.875 absolute lift in POSITIVE direction; baseline within edge-of-variance)
5. ⏳ **PM ratify path forward** (Option C / D / E / F per §G)

---

**End of post-Amendment-10 halt-and-PM report. Standing AWAITING PM ratification on §G path forward + acknowledgment of Phase 4.5 POSITIVE on qwen-thinking + AMBIGUOUS on qwen-non-thinking before any further action.**
