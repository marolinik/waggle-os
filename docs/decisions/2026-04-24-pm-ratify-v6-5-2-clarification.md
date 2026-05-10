# LOCKED — PM-RATIFY-V6-5-2-CLARIFICATION ACCEPT, Phase B Authorization

**Date**: 2026-04-24 (evening)
**Ratified by**: Marko Marković (2026-04-24, Option B path selected at Phase 2 pre-flight blocker)
**PM**: claude-opus-4-7 (Cowork)
**Predecessor**: Phase 2 pre-flight BLOCKED (fa7464b) — §11 conflict + Kimi 2/3 cold probe → PM Option B adjudication

## Odluka

**ACCEPT §5.2.1 + §5.2.2 amendment commit `4ae9784`.** Kimi backup retracted per empirijske reliability findings (67-71% parse rate, p95 >60s timeout). 2-of-2 quorum policy on MiniMax failure established. Evaluator_loss on Opus/GPT split after MiniMax failure. Kimi alias retained as orphan in litellm-config (zero impact).

v6 canonical anchor `60d061e` preserved — amendment is in-place clarification, not supersession. Phase B (N=400 execution) autorizovan.

## Amendment details

**§5.2.1 (new):** Kimi retirement rationale + 2-of-2 quorum policy on MiniMax failure + evaluator_loss on Opus/GPT split. Verbatim text per PM amendment brief §1.2.

**§5.2.2 (new):** Kimi alias retention in litellm-config as orphan (not invoked at runtime).

**YAML twin delta log:** `section_5_2_1_clarification_2026_04_24` block added sa:
- PM adjudication anchor reference
- Phase 1 vs cold probe reliability data
- Retraction details
- New quorum semantics
- Expected failure rates

## Preserved (audit-critical)

1. v6 canonical anchor `60d061e` unchanged
2. §11 frozen paths — zero runner.ts / judge-runner.ts / failure-mode-judge.ts / health-check.ts / litellm-config.yaml modification
3. Ensemble membership Opus + GPT + MiniMax trio unchanged
4. Primary hypothesis H1 (retrieval > no-context, Fisher one-sided p < 0.10) unchanged
5. κ baseline 0.7878 conservative trio unchanged (Phase 1 result immutable)
6. Dataset (100-instance κ set + N=400 fixture) unchanged
7. SYSTEM_AGENTIC methodology unchanged
8. v6 §5.2 original "Backup activation policy" paragraph retained in-place for audit trail (not deleted, just superseded by §5.2.1)

## Superseded

v6 §5.2 "Backup activation policy" — Kimi per-instance failover + both-fail judge_ensemble_fail semantics. Text retained in document, superseded by §5.2.1 logic.

## Why amendment scope, not v7 emission

Three criteria for §5.2 clarification vs v7 re-pre-registration:
1. **Ensemble membership unchanged**: still Opus + GPT + MiniMax trio
2. **Primary hypothesis unchanged**: same H1, same test, same threshold
3. **κ baseline unchanged**: 0.7878 authoritative for new trio

Kimi retirement is failover-behavior clarification, not ensemble redesign. 2-of-3 quorum becomes 2-of-2 on MiniMax failure, which is stricter-or-equal not looser (never majority verdict with only 1 judge). This is scope-tightening not scope-expansion — acceptable under §5.2 clarification authority, not requiring v7.

Alternative (v7 re-pre-registration) would require: new anchor + full pre-reg copy + new delta log emission + new commit chain + new PM-RATIFY gate. Would delay Phase B by 1-2h without material audit benefit over clarification path.

## Phase B authorization

N=400 execution authorized. Parent commit for Phase B artefacts = `4ae9784`.

Per-instance execution updated semantics:
- Parallel primary: Opus + GPT + MiniMax
- MiniMax failure (API error, parse fail, timeout after 3 retries) → 2-of-2 quorum:
  - Opus == GPT → consensus verdict
  - Opus != GPT → `judge_ensemble_fail: true` + `evaluator_loss_reason: "minimax_failed_opus_gpt_split"`, excluded from H1
- NO Kimi runtime calls

Halt triggers updated:
- Budget halt $28 (total Phase 2 incl. pre-flight spent ~$0.08)
- evaluator_loss rate > 5% → pause + PM flag (loosened from 2% ensemble_fail because 2-of-2 quorum handles most cases)
- MiniMax parse < 90% cumulative → pause + PM flag

Expected outcomes (Phase 1 data-based projections):
- MiniMax parse ~100% → 0-3 instances might fail, evaluator_loss <1%
- Majority verdict available for ~99% of instances
- H1 Fisher test fully powered

## Budget + timing

- Phase 2 cap: $30 (unchanged from original Phase 2 brief)
- Pre-flight spent (fa7464b): ~$0.08
- Amendment commit cost: $0 (manifest edit only)
- Remaining for N=400: ~$29.92
- Projected N=400 cost: $20-25
- Wall-clock cap: 180 min
- Realistic wall-clock: 90-120 min if MiniMax holds Phase 1 profile

## Parent commit chain

```
fc16925 v5 anchor (superseded)
ad324cc → 3a146ef → e5696f4 → d0ab680 → 1d3851d (v5 era artifacts)
8ad0567 §1.3f Vertex Batch INFEASIBLE
8a2f0e6 §1.3g 4-candidate MULTI_PASS
ae0d312 §1.3h stratified re-probe
005a19a §1.3h-C DeepSeek mt=2048
60d061e v6 manifest emission (canonical anchor)
38a830e Phase 1 Commit 2: litellm-config amendment
01f7ead Phase 1 Commit 3: κ re-cal PASS trio=0.7878
fa7464b Phase 2 pre-flight halt: §11 + KIMI_UNREADY
4ae9784 §5.2.1+§5.2.2 amendment (THIS COMMIT)
```

14 commits od v4 `dedd698`. HEAD = `4ae9784`. Phase B executes from here.

## Task #29 trace

- §2.0 ✓ §2.1 ✓ (Phase 1 PASS)
- §2.2 N=400 execution: AUTHORIZED post-amendment
- PM-RATIFY-V6-5-2-CLARIFICATION ✓
- PM-RATIFY-V6-N400-COMPLETE: pending Phase B completion
- Gate D exit: pending PM-RATIFY-V6-N400-COMPLETE

## Odbacivanja (Option B was chosen over)

- **Option A (§11 carve-out for runner.ts)**: 1-2h implementation vs 5-min amendment; backup marginal-value given MiniMax reliability
- **Option C (MiniMax retry at longer timeout)**: judge-runner already has 3-retry policy at 60s each; no incremental benefit
- **Option D (raise Kimi timeout to 120s + runner edit)**: combined with A complexity, Kimi structural parse issues persist
- **Option E (new wrapper script)**: §10 deviation from pre-reg CLI template → requires v7 regardless of file-level §11 compliance; worst audit-trail path

## How to apply

Pattern for future judge-ensemble issues mid-pre-registration:
1. Distinguish clarification-scope (failover behavior, orphan alias handling) from deviation-scope (ensemble membership, hypothesis, methodology) changes
2. Clarification scope permits in-place amendment under existing anchor authority
3. Deviation scope requires versioned supersession (v6 → v7)
4. Criterion: can the change be framed as "tightening-or-equal" constraint (2-of-3 → 2-of-2 is tighter) rather than "new degree of freedom" (which would expand methodology space)?

Clarification amendments must preserve audit trail by retaining original text in-place, superseded by new section, with YAML delta log documenting the rationale chain.
