# Sprint 10 Close-Out — Task 2.2 + Judge-Methodology Validation

**Datum:** 2026-04-21T13:07:02.515Z
**Artifact:** `preflight-results/judge-calibration-ensemble-14inst-2026-04-21T13-00-04Z.json`
**Labels source:** 14-instance merged set — 9 retained from Sprint 9 (instance #9 Frank Ocean dropped per PM Option C) + 5 new PM-authored triples finalized 2026-04-22.
**Ensemble vendors:** claude-opus-4-7, gpt-5.4, gemini-3.1-pro
**Total calls:** 42 (3 vendors × 14 instances) · **Spend:** $0.151110 of $0.20 Task 2.2 ceiling (75.6%)

---

## 1. Headline result

| Metric | Value | Interpretation |
|---|---|---|
| Majority match vs PM | **13/14** (92.9%) | well above 8/10 PASS threshold |
| Fleiss' κ — vendors only | **0.8784** | strong |
| Fleiss' κ — vendors + PM (4 raters) | **0.8640** | strong |
| Sprint 11 GO/NO-GO (judge-methodology axis) | **GO** | authorized |

### Interpretation band (brief §pre-registered)

| κ range | Band | Stage 2 implication |
|---|---|---|
| ≥ 0.80 | strong | ensemble verdict primary |
| 0.60 — 0.80 | substantial | ensemble ready + tie-breaker policy (documented Day-2 §5 of multi-vendor baseline) |
| 0.40 — 0.60 | moderate | PM review gate |
| < 0.40 | fair or worse | scope pivot to single-judge Opus |

**Delta vs Day-2 10-instance baseline:** Day-2 κ = 0.7458 (n=10) → Day-3 κ = 0.8784 (n=14). Band shifted; diagnostic below.

## 2. Per-vendor match rate vs PM

| Vendor | Match | Spend | Avg latency | Disagreements |
|---|---|---|---|---|
| `claude-opus-4-7` | 12/14 (85.7%) | $0.050184 | 2917ms | 2 |
| `gpt-5.4` | 13/14 (92.9%) | $0.034119 | 2093ms | 1 |
| `gemini-3.1-pro` | 12/14 (85.7%) | $0.066807 | 6973ms | 2 |

## 3. Per-pair Cohen's κ (inter-vendor agreement)

| Pair | κ | Band | Agree% |
|---|---|---|---|
| `claude-opus-4-7` ↔ `gpt-5.4` | 0.9103 | strong | 92.9% |
| `claude-opus-4-7` ↔ `gemini-3.1-pro` | 0.8170 | strong | 85.7% |
| `gpt-5.4` ↔ `gemini-3.1-pro` | 0.9085 | strong | 92.9% |

## 4. Per-category Fleiss' κ breakdown

Categories combine both LoCoMo-native labels (single-hop / multi-hop / temporal / open-ended) and new PM categories (temporal-scope / null-result / chain-of-anchor).

| Category | n | κ | Band |
|---|---|---|---|
| `single-hop` | 3 | 1.0000 | strong |
| `multi-hop` | 3 | 0.6897 | substantial |
| `temporal` | 2 | 0.4545 | moderate |
| `open-ended` | 1 | undefined | n<2, kappa undefined |
| `temporal-scope` | 2 | 1.0000 | strong |
| `null-result` | 2 | undefined | undefined |
| `chain-of-anchor` | 1 | undefined | n<2, kappa undefined |

## 5. Per-F-mode Fleiss' κ breakdown

F-mode taxonomy per judge rubric: F1 (valid abstain), F2 (partial coverage / omission), F3 (misread of substrate), F4 (fabrication), F5 (other). `correct/null` is the PM ground-truth label indicating a correct answer with no failure mode.

| F-mode | n | κ | Band |
|---|---|---|---|
| `F1` | 1 | undefined | n<2, kappa undefined |
| `F2` | 2 | undefined | undefined |
| `F3` | 4 | 0.6250 | substantial |
| `F4` | 4 | undefined | undefined |
| `F5` | 1 | undefined | n<2, kappa undefined |
| `correct/null` | 2 | undefined | undefined |

## 6. Disagreement log

| Vendor | Instance | PM | Vendor |
|---|---|---|---|
| `correct/null` | 7 (locomo_conv-42_q038) | `incorrect/F3` | `correct/null` |
| `correct/null` | 10 (locomo_conv-44_pm_2026-04-22_001) | `incorrect/F3` | `correct/null` |
| `correct/null` | 10 (locomo_conv-44_pm_2026-04-22_001) | `incorrect/F3` | `correct/null` |
| `incorrect/F4` | 6 (locomo_conv-41_q036) | `incorrect/F5` | `incorrect/F4` |
| `correct/null` | 10 (locomo_conv-44_pm_2026-04-22_001) | `incorrect/F3` | `correct/null` |

### Disagreement rationale detail

- **`claude-opus-4-7` on instance 7 (locomo_conv-42_q038)** — PM `incorrect/F3` vs vendor `correct/null`: *7 September 2022 was the Friday before 14 September 2022, matching the ground truth.*
- **`claude-opus-4-7` on instance 10 (locomo_conv-44_pm_2026-04-22_001)** — PM `incorrect/F3` vs vendor `correct/null`: *Early April 2023 is an acceptable equivalent formulation of around April 2, 2023.*
- **`gpt-5.4` on instance 10 (locomo_conv-44_pm_2026-04-22_001)** — PM `incorrect/F3` vs vendor `correct/null`: *The model's answer, 'early April 2023,' is a reasonable equivalent of the ground truth 'around April 2, 2023' and adds no incorrect information.*
- **`gemini-3.1-pro` on instance 6 (locomo_conv-41_q036)** — PM `incorrect/F5` vs vendor `incorrect/F4`: *The model fails to mention the music events John attended and instead hallucinates activities like walks and picnics that are not present in the ground-truth context.*
- **`gemini-3.1-pro` on instance 10 (locomo_conv-44_pm_2026-04-22_001)** — PM `incorrect/F3` vs vendor `correct/null`: *The model's answer of 'early April 2023' accurately reflects the ground truth date of 'around April 2, 2023'.*

## 7. GO/NO-GO signal for Sprint 11 LoCoMo SOTA

**Verdict: GO**

Fleiss' κ = 0.8784 ≥ 0.60 floor. Judge-methodology axis authorized per brief §pre-registered-threshold. Sprint 11 LoCoMo SOTA run cleared on the ensemble layer; pre-registered LoCoMo bands (≥91.6% NEW_SOTA / 85.0-91.5% SOTA_IN_LOCAL_FIRST / <85% GO_NOGO_REVIEW) remain LOCKED for the downstream Sprint 11 outcome.

**Pre-registered LoCoMo thresholds (carried from parent brief §5, LOCKED):**

| Sprint 11 final score | Banner | Consequence |
|---|---|---|
| ≥ 91.6% | `NEW_SOTA` | Full launch narrative (Opus-class multiplier claim) |
| 85.0 — 91.5% | `SOTA_IN_LOCAL_FIRST` | Narrower framing (sovereignty vs cloud-revenue positioning) |
| < 85.0% | `GO_NOGO_REVIEW` | Auto-halt; scope reclassification with PM pre public comms |

Anti-pattern #4 reminder: **thresholds do NOT shift post-hoc.** This clause remains the same as before any Task 2.2 result.

## 8. Sprint 10 scorecard

| Sprint 10 task | Status | Key deliverable |
|---|---|---|
| 1.2 Sonnet route repair | ✅ CLOSED | PR #1 merged `a09831e`; smoke PASS |
| 1.3 Sonnet calibration re-run | ✅ CLOSED | 8/10 match on repaired route, triggered multi-vendor path |
| 1.4 DashScope dual-route | ✅ CLOSED | 3/3 routes PASS; real qwen3.6-35b-a3b on intl tenant |
| 2.1 Tri-vendor ensemble setup | ✅ CLOSED | Fleiss' κ=0.7458 on 10-instance baseline, substantial band |
| 2.2 Full 14-instance Fleiss' κ | ✅ CLOSED | **κ=0.8784** · strong band · **Sprint 11 GO** |
| 1.1 Qwen stability matrix | scaffold CLOSED, live-run pending | Matrix driver + classifier dry-run verified |
| 1.5 Harvest Claude artifacts adapter | unblocked Day-3 (fresh zip landed); implementation pending | hive-mind backlog entry `b3348fb` |

## 9. Cost accounting

| Line | Spend | Running total |
|---|---|---|
| Day-1 vendor probe | $0.001 | $0.001 |
| Day-2 Sonnet calibration | $0.027 | $0.028 |
| Day-2 Tri-vendor 10-instance baseline | $0.101 | $0.129 |
| Day-3 Task 2.2 14-instance ensemble | $0.151 | $0.280 |

**Sprint 10 total: $0.280 of $15 hard-stop ceiling (1.9%)**

## 10. Anti-pattern #4 compliance check

- Pre-registered κ band floor (0.60) set BEFORE Task 2.2 ran. Verdict delivered against that floor unchanged.
- 14-instance dataset composition defined BEFORE ensemble run (Option C drop of #9, 5 ratified triples finalized, slot-fill via Draft #3). No post-hoc dataset shuffling.
- Single PM-vs-ensemble disagreement (instance 10, temporal precision) is logged, not hidden. Ensemble called "correct/null" where PM called F3 — interpretive disagreement on "early April" vs "around April 2", not a judge fabrication.
- LoCoMo Sprint-11 banner thresholds (≥91.6% / 85-91.5% / <85%) untouched.

## 11. Ready-state for Sprint 11

- Judge methodology: **AUTHORIZED** at κ=0.8784 (strong band).
- Tri-vendor ensemble verified on 14 instances covering 6 F-mode categories across 7 question categories.
- Tie-breaker policy documented Day-2 (first-in-list today; escalate-to-PM recommended for Sprint 11 Stage-2 full-run to preserve multi-vendor defensibility).
- Outstanding Sprint-10 items (Task 1.1 live run + Task 1.5 artifacts adapter) are not Sprint-11-blocking — 1.1 blocks Stage 2 Qwen full-run specifically; 1.5 blocks next dogfood cycle on real Marko corpus. Sprint 11 LoCoMo SOTA run uses public dataset, neither item gates it.

---

*End of Sprint 10 close-out. Sprint 10 scope delivered. Handoff to PM for Sprint 11 kickoff decision.*
