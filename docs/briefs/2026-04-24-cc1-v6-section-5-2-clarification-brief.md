# CC-1 Brief — v6 §5.2 Quorum Clarification + Phase 2 N=400 Resume

**Date**: 2026-04-24 (evening, post-Phase 2 pre-flight blocker)
**Status**: §5.2 amendment under v6 authority, unblocks Phase 2 N=400 kick
**Authorized by**: Marko Marković (pending ratification via PM-ADJUDICATE-V6-PHASE2-BLOCKERS Option B)
**Predecessor**: Phase 2 pre-flight BLOCKED on §11 conflict + Kimi backup unready
**PM**: claude-opus-4-7 (Cowork)

---

## §0 Adjudication summary

Pre-flight halt findings adjudicated: **Option B ACCEPT — drop Kimi backup, accept evaluator_loss on MiniMax failures.**

Rationale (full text in PM adjudication response):
- MiniMax Phase 1 empirical reliability: 100/100 parse, 0 errors → projected <1% failure rate
- Kimi backup structurally unreliable (67-71% parse on probe samples) — insurance that fails when needed
- §5.2 clarification scope, not §10 deviation — v7 re-pre-reg not required
- Minimal engineering: single amendment commit + direct N=400 kick (15-30 min vs 2-4h alternatives)

---

## §1 v6 §5.2 amendment specification

### §1.1 Current §5.2 text (v6 anchor `60d061e`)

Pre-registered: "One judge call per instance per primary; backup activated only on primary failure. No prompt-level batching. Identical prompt template per failure-mode-judge.ts:245-258 verbatim. 2-of-3 quorum on primary cells, tie-break policy on splits per existing runner logic."

### §1.2 Amendment (insert clarification paragraph)

Add to §5.2:

```
§5.2.1 Failover behavior on MiniMax unavailability (clarification).
The pre-registered backup activation ("Kimi K2.6 per-instance failover")
is RETRACTED based on §1.3g-h-C Kimi reliability findings (parse rate
67-71% on challenging samples, p50 32s latency, p95 exceeds 60s timeout
threshold). Kimi retirement from v6 ensemble is a clarification, not
substantive methodology change: ensemble membership (Opus+GPT+MiniMax trio),
primary hypothesis test, and κ baseline remain unchanged.

Quorum policy on MiniMax failure (API error, parse fail, timeout >60s
after standard 3-retry judge-runner policy):
- If Opus and GPT agree → majority verdict = their consensus (2-of-2 quorum)
- If Opus and GPT disagree → evaluator_loss marker, instance excluded
  from primary hypothesis analysis
- Expected MiniMax failure rate <1% per Phase 1 empirical evidence
  (100/100 parse, 0 routing errors)
- Expected evaluator_loss rate projected <1% of N=400

§5.2.2 Kimi alias retention in litellm-config.
Kimi alias (`kimi-k26-direct`) retained in litellm-config.yaml as orphan
declaration (not invoked by runner). Removal would require additional
config amendment commit; retention preserves audit trail of v6 Phase 1
intent and is zero-cost operationally.
```

### §1.3 Deliverable

Single amendment commit to `benchmarks/preregistration/manifest-v6-preregistration.md` AND `manifest-v6-preregistration.yaml` (twin update).

Commit message: `[v6] §5.2 clarification: retract Kimi backup per §1.3g-h-C reliability findings, 2-of-2 quorum on MiniMax failure, evaluator_loss on split; anchor=60d061e (v6)`

Parent = `fa7464b` (Phase 2 cold probe halt anchor). New HEAD after this commit.

### §1.4 Scope guards

- Manifest v6 anchor `60d061e` remains canonical — amendment updates the authoritative pre-reg but does NOT re-emit v6 under new anchor
- All other v6 §11 frozen paths untouched (runner.ts, judge-runner.ts, failure-mode-judge.ts, health-check.ts, litellm-config.yaml)
- Kimi alias stays in litellm-config (orphan, zero impact)
- Pre-flight probe artefacts (§1.3 cold probes + halt anchor fa7464b) remain intact as audit record

---

## §2 N=400 execution resume (same as prior Phase 2 brief with amendments)

All prior Phase 2 brief sections (benchmarks/briefs/2026-04-24-cc1-manifest-v6-phase2-n400-execution-brief.md) remain authoritative EXCEPT:

### §2.1 Amendments to original Phase 2 brief

1. **§1.3 pre-flight probes**: SKIP (already executed, MiniMax 3/3 passed, Kimi probe now moot under Option B)
2. **§2.3 per-instance failover**: SUPERSEDED by §5.2.1 amendment above. New per-instance logic:
   - Parallel primary judges: Opus + GPT + MiniMax
   - MiniMax failure (API error, parse fail, timeout after 3 retries) → NO Kimi call. Instead:
     - If Opus and GPT verdicts agree → use their consensus as majority verdict
     - If Opus and GPT verdicts disagree → mark `judge_ensemble_fail: true` (evaluator_loss) AND `evaluator_loss_reason: "minimax_failed_opus_gpt_split"`, exclude from H1
   - If MiniMax succeeds but Opus or GPT fail → standard runner logic applies (tie-break or evaluator_loss per existing policy)
3. **§2.4 logging**: remove `minimax_backup_triggered`, `kimi_*` fields. Add:
   - `minimax_failed: true|false`
   - `minimax_failure_reason` (api_error|parse_fail|timeout)
   - `evaluator_loss_reason` (if applicable)
4. **§2.5 halt triggers**: remove backup activation rate trigger. Retain:
   - Budget halt at $28
   - `evaluator_loss` rate >5% → pause + PM adjudication (was 2% ensemble_fail, now looser because 2-of-2 quorum handles most cases)
   - MiniMax parse <90% cumulative → pause + PM flag

### §2.2 Budget adjustment

- Kimi pre-flight probe actual: ~$0.05 (2/3 calls)
- MiniMax pre-flight probe actual: ~$0.03 (3/3 calls)
- Combined pre-flight spent: ~$0.08
- Remaining Phase 2 budget: $30 - $0.08 = $29.92
- Projected N=400 cost: ~$20-25 (MiniMax only; no Kimi activation)
- Margin: ~$5 comfort

---

## §3 Execution sequence (post-amendment commit)

1. Commit §5.2 amendment per §1.3 above (single commit, updates MD + YAML twin)
2. Emit halt ping confirming amendment landed + new HEAD
3. Await PM-RATIFY-V6-5-2-CLARIFICATION (brief PM gate — low-friction, expect immediate ACCEPT)
4. On ratification: kick N=400 execution per amended Phase 2 brief
5. Halt on PM-RATIFY-V6-N400-COMPLETE as originally specified

---

## §4 Halt ping format (amendment commit only)

Emit after §5.2 amendment commit:

- `amendment_verdict: LANDED`
- `amendment_anchor: <full sha>`
- `v6_manifest_md_sha_updated: <new sha>`
- `v6_manifest_yaml_sha_updated: <new sha>`
- `v6_anchor_canonical: 60d061e` (unchanged)
- `parent_commit: fa7464b` (Phase 2 cold probe halt)
- `next_step_request: PM-RATIFY-V6-5-2-CLARIFICATION`
- `cc1_state: HALTED`

PM ratifies amendment (expect immediate ACCEPT), then CC-1 resumes Phase 2 N=400 kick.

---

## §5 Halt ping format (N=400 completion)

Per original Phase 2 brief §4, with field amendments:

- Replace `minimax_backup_triggered_count` with `minimax_failed_count`
- Replace `kimi_backup_success_count` with N/A (remove)
- Replace `judge_ensemble_fail_count` with `evaluator_loss_count`
- Add `evaluator_loss_reasons_breakdown: { minimax_failed_opus_gpt_split, other }`

All other fields (H1 block, secondary cells, budget, wall-clock) unchanged.

---

## §6 Task #29 trace

- §2.2 N=400 execution: AUTHORIZED post-§5.2 amendment
- §5.2 amendment: <pending CC-1 commit>
- PM-RATIFY-V6-5-2-CLARIFICATION: <pending>
- PM-RATIFY-V6-N400-COMPLETE: pending Phase 2 N=400 completion

---

## §7 Authorized by

PM Marko Marković, 2026-04-24 evening, PM-ADJUDICATE-V6-PHASE2-BLOCKERS adjudication verbatim (Option B ACCEPT).

CC-1 may begin amendment commit immediately. N=400 kick waits PM-RATIFY-V6-5-2-CLARIFICATION.
