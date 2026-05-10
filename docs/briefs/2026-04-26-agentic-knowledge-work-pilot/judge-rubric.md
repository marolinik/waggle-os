# Judge Rubric — Trio Ensemble × 6 Dimensions × Likert 1-5

**Purpose:** Calibrated quality assessment of agent responses to knowledge work tasks. Single-axis Yes/No judging (LoCoMo style) is unsuitable for synthesis tasks where "correctness" is multi-dimensional and the question itself is open-ended.

**Judge ensemble (locked):**
- Claude Opus 4.7 (`claude-opus-4-7`)
- GPT-5.4 (`gpt-5.4`)
- MiniMax M2.7 (`minimax-m2.7`)

**Reuses Stage 3 v6 trio infrastructure** — `κ_trio = 0.7878` (substantial agreement) calibrated 2026-04-24. No new judge calibration needed for this pilot. If pilot escalates to full N=400, recalibrate on synthesis-task subset (deferred to expansion brief).

---

## Six dimensions

Each judge scores each cell response on six dimensions, Likert 1-5. **Mean across dimensions = overall score.** Halt threshold: any cell scoring < 2.0 on majority of judges = critical failure flag.

### D1 — Completeness

*Did the response engage with all material provided, or did it ignore key inputs?*

- **5 — Comprehensive**: Engages with every document/thread/memo. Cites or references most. No material is treated as irrelevant without justification.
- **4 — Strong**: Engages with most materials. May skip minor items but justifies omissions.
- **3 — Adequate**: Engages with majority of materials. Some material visibly missed but core covered.
- **2 — Partial**: Significant material omitted without justification. Response treats subset as if it were the whole.
- **1 — Inadequate**: Response engages with minority of materials. Most input is ignored.

### D2 — Accuracy

*Are the facts cited from the materials accurate, or are there hallucinations / misreadings?*

- **5 — Faithful**: All cited facts traceable to materials. No hallucinations. Numbers correct. Names correct.
- **4 — Mostly faithful**: 1-2 minor inaccuracies (wrong number, slight name variant) but no material distortion.
- **3 — Mixed**: Some inaccuracies. Core narrative still defensible from materials.
- **2 — Weak**: Multiple factual errors. Some claims not in materials. Reader would be misled on specific points.
- **1 — Unreliable**: Significant fabrication or misreading. Reader cannot trust the response.

### D3 — Synthesis quality

*Does the response connect inputs across documents/threads/memos, or treat each in isolation?*

- **5 — Deeply synthesized**: Identifies non-obvious connections (e.g., "X in Doc 2 explains Y in Doc 5"). Surfaces interaction effects. Goes beyond the surface of any single input.
- **4 — Strong synthesis**: Connects most inputs. Cross-references where appropriate. May miss 1-2 deeper patterns.
- **3 — Adequate synthesis**: Some connections drawn. Mostly summarizes input-by-input with limited weaving.
- **2 — Weak synthesis**: Treats inputs in isolation. List-like structure mirroring input order.
- **1 — No synthesis**: Disconnected responses to individual inputs. No integration.

### D4 — Judgment quality

*Are the recommendations defensible? Are tradeoffs acknowledged? Is reasoning shown?*

- **5 — Senior-grade**: Recommendations are specific and actionable. Tradeoffs explicitly addressed. Counter-arguments anticipated. Reasoning visible at each step.
- **4 — Strong**: Recommendations are clear and reasoned. Most tradeoffs surfaced. Some implicit reasoning.
- **3 — Adequate**: Recommendations made but reasoning thin. Tradeoffs touched lightly.
- **2 — Weak**: Recommendations feel arbitrary. Tradeoffs ignored or minimized. Reasoning shallow.
- **1 — No judgment**: Recommendations missing, generic, or contradicted by their own analysis.

### D5 — Recommendation actionability

*Could the persona (CFO / Partner / CEO) act on this tomorrow morning, or is it advice-shaped fog?*

- **5 — Immediately actionable**: Specific actions, owners (where applicable), sequencing, success metrics. The persona could open a doc tomorrow and start executing.
- **4 — Mostly actionable**: Most actions are specific. Some require additional definition but the path is clear.
- **3 — Directionally actionable**: Direction is clear; specific next steps require persona to fill in.
- **2 — Vague**: General advice. Persona has to do meaningful translation work to derive actions.
- **1 — Not actionable**: Abstract reasoning without practical pathway. No persona could act on this.

### D6 — Structure / Communication

*Is the response organized for the reader's mental model? Is it the right length? Is it readable under time pressure?*

- **5 — Excellent**: Clear executive structure (e.g., headline → reasoning → asks). Appropriate length. Reader can scan in 60 seconds and read in detail in 5 minutes. Headers, emphasis, sequence used judiciously.
- **4 — Strong**: Well-organized. Reasonable length. Reader navigates easily.
- **3 — Adequate**: Comprehensible. Length OK. Some friction in scanning.
- **2 — Weak**: Disorganized. Too long or too brief. Reader has to work to extract main points.
- **1 — Poor**: Chaotic structure. Significantly mis-sized. Reader gets lost or gives up.

---

## Overall scoring

**Per judge per cell:** mean of D1-D6 = overall score (Likert 1-5)

**Per cell aggregated:**
- Trio mean: (Opus mean + GPT mean + MiniMax mean) / 3
- Trio strict-PASS: at least 2 of 3 judges score ≥ 3.5
- Trio FAIL: at least 2 of 3 judges score < 3.0

**Hypothesis verification (per task):**
- **H2 — Opus multiplier**: Cell B (Opus + memory + harness) trio mean > Cell A (Opus solo) trio mean by ≥ 0.30 Likert points
- **H3 — Qwen multiplier**: Cell D (Qwen + memory + harness) trio mean > Cell C (Qwen solo) trio mean by ≥ 0.30 Likert points
- **H4 — Sovereignty bridge**: Cell D trio mean ≥ Cell A trio mean (Qwen + harness reaches frontier-without-harness)

**Pilot binary verdict:**
- **PILOT PASS** = directional sign correct on H2/H3/H4 in ≥ 2 of 3 tasks (6/9 cells minimum), and no critical failure (no cell scoring < 2.0 on majority of judges)
- **PILOT FAIL** = otherwise

PASS authorizes full N=400 multiplier benchmark. FAIL halts expansion.

---

## Judge prompt template (per cell response)

```
You are evaluating an AI agent's response to a complex knowledge work task. The persona, scenario, materials, and question are provided. The response was generated under one of four configurations (revealed only after scoring): {model_only | model + memory + agent harness} × {Opus 4.7 | Qwen 3.6 35B-A3B}.

You do NOT know which configuration produced this response. Score blind.

Read the persona/scenario/question (provided), skim the materials (provided), then read the response carefully (provided).

Score the response on six dimensions, Likert 1-5:

1. COMPLETENESS — engagement with all material
2. ACCURACY — faithfulness to source materials, no hallucinations
3. SYNTHESIS — connections across inputs, not isolated treatment
4. JUDGMENT — defensible recommendations, tradeoffs acknowledged
5. ACTIONABILITY — would the persona act on this tomorrow
6. STRUCTURE — organization and readability

Output JSON only:
{
  "completeness": <1-5>,
  "accuracy": <1-5>,
  "synthesis": <1-5>,
  "judgment": <1-5>,
  "actionability": <1-5>,
  "structure": <1-5>,
  "rationale": "<1-2 sentences explaining the lowest scoring dimension>",
  "overall_verdict": "<one of: PASS_STRONG | PASS_ADEQUATE | FAIL_WEAK | FAIL_CRITICAL>"
}

PASS_STRONG: mean ≥ 4.0
PASS_ADEQUATE: mean 3.5-3.99
FAIL_WEAK: mean 2.5-3.49
FAIL_CRITICAL: mean < 2.5

[PERSONA + SCENARIO + QUESTION]
[MATERIALS]
[RESPONSE TO EVALUATE]
```

---

## Output JSONL schema (per cell, per task)

Each cell × task produces one record:

```json
{
  "task_id": "task-1" | "task-2" | "task-3",
  "cell_id": "A" | "B" | "C" | "D",
  "model": "claude-opus-4-7" | "qwen3.6-35b-a3b",
  "configuration": "solo" | "memory-harness",
  "candidate_response": "<full response text>",
  "candidate_latency_ms": <int>,
  "candidate_tokens_in": <int>,
  "candidate_tokens_out": <int>,
  "candidate_cost_usd": <float>,
  "judge_opus": {
    "completeness": <int>,
    "accuracy": <int>,
    "synthesis": <int>,
    "judgment": <int>,
    "actionability": <int>,
    "structure": <int>,
    "rationale": "<string>",
    "overall_verdict": "<string>",
    "mean": <float>
  },
  "judge_gpt": { ... same shape ... },
  "judge_minimax": { ... same shape ... },
  "trio_mean": <float>,
  "trio_strict_pass": <bool>,
  "trio_critical_fail": <bool>,
  "manifest_anchor": "pilot-2026-04-26-v1",
  "head_sha": "<git commit SHA at execution>"
}
```

12 records total (3 tasks × 4 cells).

---

## Aggregate summary file

After execution, produce `pilot-summary.json`:

```json
{
  "pilot_id": "agentic-knowledge-work-pilot-2026-04-26",
  "execution_window_utc": "<ISO start> to <ISO end>",
  "total_cost_usd": <float>,
  "total_judge_calls": 36,
  "total_candidate_calls": 12,
  "results_per_task": {
    "task-1": {
      "cell_A_trio_mean": <float>,
      "cell_B_trio_mean": <float>,
      "cell_C_trio_mean": <float>,
      "cell_D_trio_mean": <float>,
      "h2_delta_opus": <B - A>,
      "h3_delta_qwen": <D - C>,
      "h4_delta_sovereignty": <D - A>,
      "h2_directional_pass": <bool>,
      "h3_directional_pass": <bool>,
      "h4_directional_pass": <bool>
    },
    "task-2": { ... },
    "task-3": { ... }
  },
  "aggregate": {
    "h2_pass_count": <int 0-3>,
    "h3_pass_count": <int 0-3>,
    "h4_pass_count": <int 0-3>,
    "critical_failures": <int>,
    "pilot_verdict": "PASS" | "FAIL"
  }
}
```

PM and Marko adjudicate from this summary file.
