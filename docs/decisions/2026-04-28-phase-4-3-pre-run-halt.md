---
decision_id: 2026-04-28-phase-4-3-pre-run-halt
date: 2026-04-28
phase: 4.3 re-score validation — pre-run scope review
verdict: HALT-AND-PING — Phase 4.3 brief assumes a factoid-shaped pilot but the 2026-04-26 pilot is synthesis-Likert. Need scope adjustment before re-scoring.
predecessor: 2026-04-27-phase-3-acceptance-gate-results.md
sprint_plan: D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md
---

# Phase 4.3 Re-Score Validation — Pre-Run Halt-and-Ping

## TL;DR

Phase 4.3 brief assumes the 2026-04-26 pilot has factoid-shaped records (binary judge verdicts, gold_answer field, substring-match scoring) that can be re-bucketed into Phase 4.1's 10-category failure taxonomy at $0 cost. **The pilot is actually synthesis-Likert** — 6-dimensional 1-5 scoring with no gold answer, and ALL 12 cells already trio_strict_pass=true. The "FAIL" verdict comes from per-task H2/H3/H4 *comparison deltas*, not per-cell binary outcomes.

Phase 4.3's central question (**how much of H3/H4 FAIL is Tier 1 fix-able vs Tier 2 GEPA-required?**) IS still answerable, but via a different methodology than the brief specifies. Halt-trigger #3 ("schema mismatch") fires; proposing Option D (token-level normalize delta + 4-category subset classifier) below.

Halt-trigger fired in pre-flight — no scope work performed yet. **Cumulative spend: $0.**

---

## What the brief assumes vs. what the pilot actually is

### Brief assumptions

> 12 pilot cells × 3 judges = 36 records
> Each record contains: candidate_response, judge verdicts (Opus + GPT + MiniMax), trio_mean, original failure mode classifications

> Apply Phase 1.1 output-normalize sa benchmark-strict preset
> Apply Phase 4.1 failure-classify za each cell + judge combination (10-bucket taxonomy)
> NOTE: not re-judging via API — re-classifying existing judge verdicts sa novom failure taxonomy. $0 API cost expected.

The brief presupposes Phase 4.1 classifier inputs: `model_output` + `gold_answer` (substring match) + binary `judge_verdict`.

### Pilot actuality (verified from `pilot-summary.json` + 12 cell JSONL files)

**Per-cell schema** (12 records, one per JSONL file):
```
{
  task_id, cell_id, model, configuration,
  candidate_response,                     // long-form synthesis ~5-7K chars
  candidate_tokens_in, candidate_tokens_out, candidate_cost_usd, candidate_latency_ms,
  judge_opus:    { completeness, accuracy, synthesis, judgment, actionability, structure,
                   rationale, overall_verdict, mean }    // 6-dim Likert 1-5
  judge_gpt:     { same shape }
  judge_minimax: { same shape }
  trio_mean,                              // average of 3 judges' .mean
  trio_strict_pass,                       // bool — currently TRUE for all 12 cells
  trio_critical_fail,                     // bool — currently FALSE for all 12 cells
  loop_exhausted, retrieval_calls, steps_taken, ...
}
```

**There is NO `gold_answer` field, NO `subject.content`, NO `judges.<x>.verdict`** as Phase 4.2's `fromPilotRecord` adapter expects.

**Per-cell pass rate: 12/12 = 100%.** Every cell scored ≥3/5 on all six Likert dimensions. trio_strict_pass=true everywhere.

### Where the "FAIL" comes from

`pilot-summary.json` aggregate:
```
h2_pass_count: 1/3   (does Opus retrieval beat Opus solo? → 1 of 3 tasks did)
h3_pass_count: 0/3   (does Qwen reach Opus quality? → 0 of 3 tasks)
h4_pass_count: 0/3   (does sovereign Qwen+retrieval beat Opus+solo? → 0 of 3)
pilot_verdict: FAIL
```

The H2/H3/H4 hypotheses are **per-task delta comparisons** between cells, not per-cell pass/fail. H3 deltas (Qwen vs Opus) across the 3 tasks: −0.19, −0.72, −0.33 — Qwen scored LOWER than Opus on every task. H4 deltas (sovereign Qwen+retrieval vs Opus+solo): −0.22, −1.00, −0.39 — even worse.

**The strategic question Phase 4.3 wants answered:** are these negative deltas caused by *Tier 1 artifacts* (thinking-leakage / metadata-copy / format-violation in Qwen's output that judges marked down on, but that Phase 1.1 `benchmark-strict` would have stripped) — or by *Tier 2* (Qwen genuinely produces lower-quality synthesis on these tasks)?

This is still a meaningful and answerable question. But the methodology has to be different from the brief.

---

## Why the brief's methodology can't directly run

Phase 4.1's `classifyFailure(input)` requires:
- `input.model_output` ✓ (have it: `candidate_response`)
- `input.gold_answer` ✗ **(don't have it — synthesis tasks have no gold)**

Six of the 10 categories presume substring-match against gold:
- `correct_answer_with_extra_text` — needs gold to substring-match
- `punctuation_or_case_only` — needs gold
- `wrong_span` — needs gold token overlap
- `wrong_entity` — needs gold token overlap
- `hallucination` — soft default but presumes gold context
- `unknown_false_negative` — presumes gold is answerable

Four categories DO apply gold-free (detect via output text alone):
- `thinking_leakage` — literal `<think>` tag or CoT prefix
- `metadata_copy` — literal substrate metadata patterns
- `format_violation` — code fence / JSON / bullet-list when prose expected
- `retrieval_or_harness_error` — upstream error field

So a meaningful Tier-1-vs-Tier-2 analysis exists, just at a smaller-than-10-category resolution.

---

## Proposed scope adjustment (Option D)

**$0 cost, ~1-2 hours effort, answers the strategic question directionally without re-judging.**

For each of the 12 candidate_responses:

### 1. Phase 1.1 normalize delta
Apply `benchmark-strict` preset (strip `<think>` tags / strip CoT prefixes / strip metadata patterns / strip code fences). Compute:
- `chars_before` vs `chars_after`
- `which rules fired` (audit trail from `NormalizationResult.actions`)
- `delta_pp` = (chars_before − chars_after) / chars_before × 100

If a response had thinking-leakage / metadata-copy / format-wrapping that Phase 1.1 strips, this delta is non-zero. If the response was already clean, delta = 0%.

### 2. Phase 4.1 gold-free classifier subset
Run the four gold-free categories against the raw `candidate_response`:
- `thinking_leakage` (priority 2 in the cascade)
- `metadata_copy` (priority 3)
- `format_violation` (priority 4)
- `retrieval_or_harness_error` (priority 1; loop_exhausted as proxy)

Skip the six gold-dependent categories — explicitly mark "not applicable to synthesis-Likert data" in the report.

### 3. Per-judge rationale evidence
For each cell × each judge, scan `judge_X.rationale` text for evidence terms suggesting Tier 1 issues affected the score:
- thinking-related: "chain of thought", "reasoning shown", "thinking aloud", "explicit reasoning steps"
- format-related: "formatting", "structure", "presentation", "bullet", "fence", "code block"
- metadata-related: "metadata", "session", "memory:", "[ref:"

This isn't ground-truth but is corroborating evidence.

### 4. Aggregate per-cell + per-task
Output: for each (task, cell) tuple:
- Tier 1 artifact count (categories that fired)
- Phase 1.1 normalize delta_pp
- Judge rationale evidence count
- Original trio_mean
- Original judge dim scores (lowest-dimension, e.g., if "structure" is consistently the lowest dim, format issues likely material)

Then answer:
- **Aggregate Tier 1 incidence** — what % of the 12 cells had at least one detectable Tier 1 artifact?
- **Qwen-vs-Opus comparison** — are Tier 1 artifacts disproportionately in Qwen cells (C, D) vs Opus cells (A, B)? If yes → Phase 1.1 normalize may rescue some H3/H4 delta. If no (similar across both) → Tier 2 is the real gap.
- **Per-task variation** — Task 2's H4 delta is the worst (−1.00). Is Qwen's Task 2 cell-D output drowning in artifacts, or is the synthesis genuinely off-topic?

### What this DOESN'T tell us
- The exact judge rescore post-normalize. We're not re-running the judge LLM calls (that would cost real $).
- Whether stripping artifacts would have changed the judge's overall_verdict. We can only estimate based on whether artifacts appear material in rationales.

### What this DOES tell us
- **Lower bound on Tier 1 fix-ability:** % of cells with detectable artifacts.
- **Directional signal for H3/H4:** does the artifact pattern explain the negative deltas, or are they orthogonal?
- **Strategic decision input:** does Phase 5 mini re-pilot need Tier 2 GEPA work, or can Phase 1.1 normalize alone potentially rescue?

---

## Alternative: extend `fromPilotRecord` adapter

Phase 4.2's `fromPilotRecord` was built for the LoCoMo pilot (factoid + binary judge verdict). The 2026-04-26 synthesis pilot needs a separate adapter. Sketching:

```ts
export interface AgenticPilotJsonlRecord {
  task_id: string;
  cell_id: string;
  model: string;
  configuration: string;
  candidate_response: string;
  candidate_cost_usd?: number;
  candidate_latency_ms?: number;
  candidate_tokens_in?: number;
  candidate_tokens_out?: number;
  judge_opus: AgenticJudgeBlock;
  judge_gpt: AgenticJudgeBlock;
  judge_minimax: AgenticJudgeBlock;
  trio_mean: number;
  trio_strict_pass: boolean;
}

export function fromAgenticPilotRecord(r: AgenticPilotJsonlRecord): AgentPredictionRecord;
```

This would let Phase 4.2 `report.ts` consume the synthesis pilot, but only if we redefine `accuracy` as `trio_strict_pass ? 1 : 0` (binary) — and that loses the Likert dimensional signal. The dimensional info would have to live in a side-car field.

This is more work and doesn't directly answer the Tier 1 vs Tier 2 question. Option D above is more targeted.

---

## PM ratification asks

Pick one (or counter-propose):

1. **Option D — gold-free classifier + normalize delta** ($0, ~1-2 hr): execute against the 12 candidate_responses; output the rescored-delta memo with directional signals. **Recommended** — answers strategic question without re-judging.

2. **Option D + LLM rationale-scan via Phase 4.1 judge fallback** ($0.10-0.20, ~1-2 hr): same as D, plus invoke Phase 4.1 LLM judge fallback on cells where rule-based classifier returns "low confidence". Adds nuance but small additional cost. Useful if Option D leaves the Tier 1 vs Tier 2 split borderline (45-55%).

3. **Full re-judge of 12 candidate_responses post-normalize** ($1.50-2.00 with cheap Qwen-as-judge, ~3-4 hr): apply Phase 1.1 normalize to each candidate_response → re-call all 3 judges on the normalized output → compute delta in trio_mean. This is the gold-standard Tier 1 measurement but costs real $.

4. **Defer Phase 4.3 entirely** — not enough Tier 1 signal in the synthesis pilot to be worth analyzing. Move to Phase 4.4/4.5 (skills/tools sweep) and let Phase 5 mini re-pilot empirically tell us whether Phase 1.1 + normalize were enough.

5. **Counter-propose** different methodology / data source.

If PM picks Option D (recommended), I can have the memo posted within the next session for your review.

---

## Audit chain

| Item | Value |
|---|---|
| Branch HEAD | `c9bda3d` (Phase 4.7 commit) |
| Pilot data | `D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-task-{1,2,3}-{A,B,C,D}.jsonl` |
| Pilot summary | `D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-summary.json` |
| All cells trio_strict_pass | true (12/12) |
| Aggregate verdict | FAIL via H2/H3/H4 delta comparisons (1/3 + 0/3 + 0/3) |
| Cumulative spend | $0 (no work performed) |

**Standing HALTED awaiting PM ratification on which option to execute.**
