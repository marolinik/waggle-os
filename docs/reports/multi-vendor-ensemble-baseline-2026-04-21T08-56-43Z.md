# Multi-Vendor Ensemble Baseline — Sprint 10 Task 2.1

**Generated:** 2026-04-21T09:02:49.039Z
**Calibration artifact:** `preflight-results/judge-calibration-ensemble-2026-04-21T08-56-43Z.json`
**Labels source:** `D:/Projects/PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md`
**Ensemble vendors:** claude-opus-4-7, gpt-5.4, gemini-3.1-pro
**Instances:** 10

---

## 1. Per-vendor match rate vs PM ground truth

| Vendor | Match rate | Spend | Avg latency | Disagreements |
|---|---|---|---|---|
| `claude-opus-4-7` | 9/10 | $0.031446 | 2577ms | 1 |
| `gpt-5.4` | 9/10 | $0.021648 | 2891ms | 1 |
| `gemini-3.1-pro` | 8/10 | $0.048090 | 7376ms | 2 |

**Ensemble majority match rate:** 9/10
**Total ensemble spend:** $0.101184 (30 calls across 3 vendors × 10 instances)

---

## 2. Pair-wise Cohen's kappa (inter-rater, vendors only)

| Pair | Kappa | Band | Agree% |
|---|---|---|---|
| `claude-opus-4-7` ↔ `gpt-5.4` | 0.7531 | substantial | 80.0% |
| `claude-opus-4-7` ↔ `gemini-3.1-pro` | 0.6250 | substantial | 70.0% |
| `gpt-5.4` ↔ `gemini-3.1-pro` | 0.8718 | strong | 90.0% |

### Dataset-wide Fleiss' kappa

- **Vendors only (3 raters):** κ = **0.7458** → substantial
- **Vendors + PM (4 raters):** κ = **0.7897** → substantial

### Interpretation band (brief §2.2)

| κ range | Band | Stage 2 implication |
|---|---|---|
| ≥ 0.80 | strong | ensemble ready; ensemble verdict primary |
| 0.60 — 0.80 | substantial | ensemble ready + tie-breaker policy documented |
| 0.40 — 0.60 | moderate | **PM review required before Stage 2 kickoff** |
| < 0.40 | fair or worse | **go/no-go review**; scope pivot to single-judge Opus + rubric refinement |

---

## 3. Disagreement log (vendor vs PM)

### `claude-opus-4-7` — 1 disagreement(s)

**Instance 7** (locomo_conv-42_q038)
- PM: `incorrect/F3`
- Vendor: `correct/null`
- Rationale: 7 September 2022 is the Friday before 14 September 2022, matching the ground truth.

### `gpt-5.4` — 1 disagreement(s)

**Instance 9** (locomo_conv-50_q037)
- PM: `correct/null`
- Vendor: `incorrect/F4`
- Rationale: The yes/no answer matches the ground truth, but it adds unsupported claims such as touring with Frank Ocean and feeling alive on stage in Tokyo, which are not present in the provided context.

### `gemini-3.1-pro` — 2 disagreement(s)

**Instance 6** (locomo_conv-41_q036)
- PM: `incorrect/F5`
- Vendor: `incorrect/F4`
- Rationale: The model fails to mention the music events John attended and instead hallucinates activities like walks and picnics that are not present in the ground-truth context.

**Instance 9** (locomo_conv-50_q037)
- PM: `correct/null`
- Vendor: `incorrect/F4`
- Rationale: The model includes a fabricated detail about touring with Frank Ocean, which does not appear in the ground-truth context.

---

## 4. Notes for Stage 2 primary-judge selection

Sprint 10 brief §1.3 + §2.1 decision tree:
- Task 1.3 Sonnet calibration produced 8/10 match → borderline 7-8 band → **multi-vendor kappa required before Stage 2 primary lock**.
- Task 2.1 ensemble majority produced 9/10 match → near-unanimous with PM on the current 10-instance dataset.
- Fleiss' κ (vendors only) = 0.746 → **substantial** band.

**Task 2.2 scope:** brief §2.2 calls for 15 triples (10 Sprint-9 + 5 new PM-authored) to extend this baseline. The 10-instance result above is INDICATIVE, not final — full band assessment requires the additional 5 triples to avoid small-sample bias.

**Open signal (flagged to PM):**
- Instance 9 (`locomo_conv-50_q037`) — PM labeled `correct/null`; Haiku (Sprint 9 Task 4), Sonnet (Sprint 10 Task 1.3), and 2-of-3 ensemble vendors (GPT-5.4 + Gemini 3.1 Pro) flag `incorrect/F4` (fabrication: "touring with Frank Ocean" + "Tokyo stage").
- Sprint 9 Task 4 Opus 4.7 solo agreed with PM. Today's ensemble Opus 4.7 also agrees with PM.
- Signal: one PM label may warrant re-review. Not a judge weakness; a consistent-across-3-vendor-families disagreement on a specific instance.

---

## 5. Tie-breaker policy (brief §2.2 substantial-band requirement)

The substantial band (`0.60 ≤ κ < 0.80`) requires a documented tie-breaker policy per brief §2.2. This section specifies what the current code does, and the recommended policy for Stage 2 full-run use.

### 5.1 Current behaviour (`failure-mode-judge.ts::computeMajority`)

1. Verdict + failure_mode are joined into a single key per vendor judgment.
2. Vendor judgments are tallied.
3. The key with the highest count wins outright if it has a strict plurality.
4. **On any tie, the first model in the `judgeModels` list wins** (the "first-in-list" tie-breaker).

In this Task 2.1 run the invocation order was `claude-opus-4-7, gpt-5.4, gemini-3.1-pro` → Opus 4.7 acts as tie-breaker on any 1-1-1 disagreement. This did not fire on the 10-instance dataset (the single mismatch with PM on instance 9 was a 2-of-3 plurality for `incorrect/F4`, not a tie).

### 5.2 Implications of first-in-list tie-breaker on a multi-vendor ensemble

The whole point of the tri-vendor ensemble is to neutralize same-family bias (brief §2 rejection rationale for Claude-only trio). If 1-1-1 ties are resolved by an Anthropic-family judge, Claude bias leaks back in via the tie-break channel. Fleiss' κ = 0.75 on this dataset means 1-1-1 ties are expected at low frequency but will occur over Stage 2's ~200 instances per cell.

### 5.3 Recommended Stage 2 policy (pending PM ratification)

For Stage 2 full-run use, **escalate 1-1-1 three-way disagreements to PM human review** instead of resolving via first-in-list. Rationale:

- Rare event by construction (κ ≥ 0.60 substantial agreement + 3-way distinct-label cases are ~5-10% of all judgments at this band).
- Preserves the "no Anthropic-family tie-breaker" defensibility claim for the launch narrative.
- Stage 2 scope is 200 instances × 4 cells = 800 judgments; 5-10% = ~40-80 PM-review escalations over the run — tractable manual pass.
- Non-Stage-2 runs (Week-1 smaller batches) can keep first-in-list for throughput; the escalation path is reserved for the launch-defensibility deliverable.

Implementation sketch: extend `JudgeConfig` with an optional `tieBreakerPolicy: 'first-in-list' | 'escalate-to-pm'` (default `first-in-list` to preserve current behavior). When `escalate-to-pm`, return a `majority` with `verdict: 'tie_unresolved'` + full per-vendor rationale; the aggregator adds a counter + emits a flag in the markdown report for operator attention.

**Not implementing in Sprint 10** — this is brief-§2.2 documentation-only. Implementation slot (if PM ratifies policy) opens in Sprint 11 or a bolt-on PR before Stage 2 kickoff.

### 5.4 Joint-label tie on unanimous verdict

A sub-class of ties to note: all three vendors agree on `verdict` (e.g., all `incorrect`) but disagree on `failure_mode` (e.g., F3/F4/F5 one-each). Current code treats these as full ties under the joint key; the first-in-list rule applies.

For Stage-2 LoCoMo, the binary-correct-or-not summary statistic is what feeds the NEW_SOTA / SOTA_IN_LOCAL_FIRST / GO_NOGO_REVIEW banner (brief §5). Failure-mode distribution is a diagnostic rollup, not a pass/fail gate. On a unanimous-verdict / mixed-failure-mode case, the verdict is unambiguous for banner computation regardless of which failure_mode wins the tie. Safe to ignore this sub-class for Stage-2-banner purposes.

---

## 6. Task 2.1 CLOSED — acceptance check

Per brief §2.1:

| Acceptance criterion | Status |
|---|---|
| Sva tri vendora vraćaju parsable verdict sa istog prompt shape-a. | ✅ PASS — 30/30 parses |
| Per-vendor match rate zabeležen. | ✅ §1 |
| Ensemble Fleiss' kappa izračunat na 10 triples minimum pre pravog Stage 2 run-a. | ✅ §2 — κ=0.7458 (substantial) |
| Baseline markdown report written. | ✅ this document |
| Spend ≤ $5. | ✅ $0.101 of $5 (2.0%) |

---

*End of Task 2.1 baseline report. Task 2.2 (full 15-triple Fleiss' kappa) opens next after PM authors the 5 additional ground-truth triples.*
