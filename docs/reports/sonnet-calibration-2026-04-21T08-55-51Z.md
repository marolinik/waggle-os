# Sonnet 4.6 Calibration — Sprint 10 Task 1.3

**Generated:** 2026-04-21T08:55:51Z
**Calibration artifact:** `preflight-results/judge-calibration-sonnet-2026-04-21T08-55-51Z.json`
**Labels source:** `D:/Projects/PM-Waggle-OS/calibration/2026-04-20-failure-mode-calibration-labels.md`
**Judge model:** `claude-sonnet-4-6` (post Task 1.2 route repair, merge commit `a09831e`)
**Instances:** 10

---

## Result

**Match rate: 8/10 — verdict: PASS** (judge-calibration rubric: ≥8 = PASS, 6-7 = PARTIAL, <6 = FAIL).

**Spend:** $0.027 of $0.50 Task 1.3 budget (5.4%).

### Per-instance detail

| # | Instance | PM label | Sonnet label | Outcome |
|---|---|---|---|---|
| 1 | `locomo_conv-26_q109` | correct/null | correct/null | MATCH |
| 2 | `locomo_conv-41_q123` | incorrect/F3 | incorrect/F3 | MATCH |
| 3 | `locomo_conv-50_q141` | incorrect/F4 | incorrect/F3 | DIFF |
| 4 | `locomo_conv-42_q030` | incorrect/F2 | incorrect/F2 | MATCH |
| 5 | `locomo_conv-49_q015` | correct/null | correct/null | MATCH |
| 6 | `locomo_conv-41_q036` | incorrect/F5 | incorrect/F5 | MATCH |
| 7 | `locomo_conv-42_q038` | incorrect/F3 | incorrect/F3 | MATCH |
| 8 | `locomo_conv-41_q053` | incorrect/F4 | incorrect/F4 | MATCH |
| 9 | `locomo_conv-50_q037` | correct/null | incorrect/F4 | DIFF |
| 10 | `locomo_conv-47_q017` | incorrect/F1 | incorrect/F1 | MATCH |

---

## Decision tree (brief §1.3)

Brief §1.3 decision matrix on Sonnet match rate:

| Band | Action |
|---|---|
| ≥ 9/10 | Sonnet becomes Stage 2 primary default |
| **7-8/10** | **Trigger Task 2.2 Fleiss' kappa probe (multi-vendor LOCKED — not Claude-only)** |
| < 7/10 | Stick with Opus, PM review gate |

Task 1.3 landed at **8/10** → **triggers Task 2.2 multi-vendor kappa** path per brief. Sprint 10 Task 2.1 (multi-vendor ensemble baseline on same 10 triples) already ran as Day-2 Step 3 — see `docs/reports/multi-vendor-ensemble-baseline-2026-04-21T08-56-43Z.md`.

---

## Disagreement analysis

### Instance 3 — `locomo_conv-50_q141` (single-hop)

- **Question:** "Which city is featured in the photograph Dave showed Calvin?"
- **PM:** `incorrect/F4` (hallucination / fabrication)
- **Sonnet:** `incorrect/F3` (wrong content / entity)
- Both verdicts agree on **incorrect**; only the failure_mode taxonomy differs. Sonnet read the model's "Chicago" as a wrong-entity substitution (F3). PM labeled it as fabrication (F4).
- Subtle taxonomy judgment call — F3 vs F4 on a wrong-city answer is defensible either way depending on how strictly one reads F4 as "unsupported by any context" vs F3 as "identifiable wrong entity".
- **Impact on Stage 2 banner:** zero — both map to `incorrect` in the binary correctness rollup. Failure-mode breakdown shifts one count from F4 to F3.

### Instance 9 — `locomo_conv-50_q037` (open-ended)

- **Question:** "Does Calvin love music tours?"
- **PM:** `correct/null`
- **Sonnet:** `incorrect/F4` — "The model introduces fabricated details not present in the ground-truth context, specifically 'touring with Frank Ocean' and 'felt alive on stage in Tokyo'."
- **Historical pattern on this instance:**
  - Sprint 9 Haiku (Task 4 diagnostic): `incorrect/F4` — flagged the Frank Ocean fabrication.
  - Sprint 9 Opus 4.7 (Task 4 production): `correct/null` — accepted PM's label.
  - Sprint 10 Sonnet (this run): `incorrect/F4` — flags the fabrication.
  - Sprint 10 ensemble Opus 4.7: `correct/null` (unchanged).
  - Sprint 10 ensemble GPT-5.4: `incorrect/F4`.
  - Sprint 10 ensemble Gemini 3.1 Pro: `incorrect/F4`.
- **Aggregate cross-vendor disagreement with PM on instance 9:** 4 of 5 non-Opus-4.7 judgments (Haiku + Sonnet + GPT-5.4 + Gemini) flag F4; only Opus 4.7 agrees with PM's `correct/null`.
- **Signal:** consistent cross-family disagreement on a specific PM label, not a per-judge weakness. PM label may warrant a re-review — flagged to PM in the Task 2.1 baseline report §4.

---

## Conclusion

- Task 1.2 Sonnet route repair verified in production: 10/10 non-404 successful completions.
- Task 1.3 calibration at 8/10 PASS is within the brief-§1.3 borderline band, which correctly triggered the Task 2.1 ensemble path (ran Day-2 Step 3).
- Sonnet is production-viable as a Stage-2 judge candidate but does NOT auto-elevate to Stage 2 primary per brief conditional. Final Stage 2 primary selection waits on Task 2.2 full 15-triple Fleiss' kappa.

---

*End of Task 1.3 report. See Task 2.1 baseline for ensemble analysis and Stage 2 recommendations.*
