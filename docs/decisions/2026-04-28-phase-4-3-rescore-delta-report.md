---
decision_id: 2026-04-28-phase-4-3-rescore-delta-report
date: 2026-04-28
phase: 4.3 re-score validation — delta report
verdict: H3/H4 FAIL is overwhelmingly Tier 2 (real semantic gap). Tier 2 GEPA work is REQUIRED pre Phase 5; Phase 1.1 normalize alone WILL NOT rescue the multiplier teza.
predecessor: 2026-04-28-phase-4-3-pre-run-halt.md
sprint_plan: D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md
data: D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\
analysis_artifact: D:\Projects\waggle-os\tmp\phase-4-3-rescore\rescore-summary.json
---

# Phase 4.3 Re-Score Validation — Delta Report

## TL;DR

**Overwhelmingly Tier 2.** Across 36 judge rationales (12 cells × 3 judges):

- **T1 (presentation/format/strictness — Phase 1.1 fix-able): 5.6%** (2 / 36)
- **T2 (semantic/comprehension — Tier 2 GEPA-required): 72.2%** (26 / 36)
- **Ambiguous (worst-case T1 ceiling): 22.2%** (8 / 36)

Even in the worst-case "all ambiguous = T1" scenario, T1 ceiling is **27.8%** — below the PM-ratified 30% threshold for "Tier 2 GEPA work confirmed."

**H4 (sovereign multiplier — D vs B) is 100% T2 with zero ambiguity.** Every single rationale on Qwen+retrieval cells across all 3 tasks × 3 judges points to a genuine content gap, not a presentation artifact.

**Phase 1.1 normalize delta = 0% across all 12 cells.** `benchmark-strict` preset strips nothing material from any candidate_response. There are no `<think>` tags, no metadata leakage, no format wrappers to remove. This is the strongest possible Tier 1 negative signal: the classifier didn't *miss* T1 — there was no T1 to find.

**Strategic recommendation: ratify Tier 2 GEPA work brief authoring for parallel execution with Phase 5 mini re-pilot.** Phase 1.1 normalize alone will not move H3/H4 deltas.

## Methodology recap

Per PM ratification 2026-04-28 (Option D + LLM fallback):
1. Phase 1.1 `benchmark-strict` normalize applied to each of 12 `candidate_response` strings; chars-before/after delta + rules fired captured.
2. Phase 4.1 gold-free classifier subset (4 of 10 categories: thinking_leakage / metadata_copy / format_violation / retrieval_or_harness_error) on raw responses.
3. Rule-based rationale tier classification on each of 36 judge rationales (3 judges × 12 cells), using:
   - 8 Tier 1 patterns (verbose-preamble, rambling, too-long, thinking-leakage, unnecessary-prose, metadata-copy, format-wrapper, presentation)
   - 10 Tier 2 patterns (didnt-consider, missed, wrong-entity, unsupported-specifics, overreach, fabrication, conflation, weak-synthesis, off-topic, shallow)
4. Qwen-as-classifier LLM fallback for ambiguous (rule-based unclear) rationales — structured prompt asking `T1 | T2 | AMBIGUOUS`.

Cost: **$0.077** (well under $0.20 halt / $0.30 hard cap). 27 LLM fallback calls of 30 max budget.

## Aggregate distribution

| Bucket | Count | Pct |
|---|---|---|
| **T1 — fix-able by Phase 1.1 normalize** | 2 | **5.6%** |
| **T2 — Tier 2 GEPA-required** | 26 | **72.2%** |
| Ambiguous (post-LLM-fallback) | 8 | 22.2% |
| **Total rationales** | **36** | **100%** |

Worst-case T1 ceiling (assume all ambiguous = T1): **27.8%**. Below 30% threshold. PM-ratified rule: "<30% → real harness-design issue confirmed; Tier 2 GEPA work brief authoring authorized."

## Per-hypothesis breakdown

| Hypothesis | Description | Cells | T1% | T2% | AMB% | Verdict |
|---|---|---|---|---|---|---|
| **H2** | B vs A — Opus retrieval lift | task-1/B, task-2/B, task-3/B | 11.1% | 55.6% | 33.3% | T2-dominated; ambiguity from rationales praising Opus retrieval cells (high baseline trio_mean ~5.0, fewer concrete weaknesses to label) |
| **H3** | C vs A — Qwen solo reaches Opus quality | task-1/C, task-2/C, task-3/C | 11.1% | 66.7% | 22.2% | T2-dominated; worst-case T1 ceiling 33.3% — borderline by ambiguity inflation but still well below 50% |
| **H4** | D vs B — sovereign Qwen+retrieval beats Opus+retrieval | task-1/D, task-2/D, task-3/D | **0.0%** | **100.0%** | **0.0%** | **Unambiguous T2.** Every rationale on every Qwen+retrieval cell across all 3 tasks × 3 judges points to real content gaps. Zero presentation-artifact rescue path. |

H4 is the most definitive single signal in this entire re-scoring. It's the hypothesis that most directly underwrites the "sovereign multiplier" paper claim. **It fails 100% on Tier 2 grounds with no statistical noise.**

## Per-task breakdown

| Task | Total rationales | T1% | T2% | AMB% |
|---|---|---|---|---|
| task-1 (strategic synthesis) | 12 | 8.3% | 75.0% | 16.7% |
| task-2 (cross-thread coordination) | 12 | 0.0% | 75.0% | 25.0% |
| task-3 (decision support) | 12 | 8.3% | 66.7% | 25.0% |

No task has > 10% T1 incidence. The signal is uniform across task types — this is not a "one bad task" artifact.

## Per-cell findings

| Task | Cell | Model | trio_mean | normalize_delta | gold-free cats | T1 | T2 | AMB |
|---|---|---|---|---|---|---|---|---|
| task-1 | A | Opus solo | 4.61 | 0.0% | format_violation* | 0 | 3 | 0 |
| task-1 | B | Opus retrieval | 4.94 | 0.0% | format_violation* | 0 | 1 | 2 |
| task-1 | C | Qwen solo | 4.58 | 0.0% | format_violation* | 1 | 2 | 0 |
| task-1 | D | Qwen retrieval | 4.39 | 0.0% | format_violation* | 0 | 3 | 0 |
| task-2 | A | Opus solo | 4.94 | 0.0% | format_violation* | 0 | 2 | 1 |
| task-2 | B | Opus retrieval | 5.00 | 0.0% | retrieval_or_harness_error + format_violation* | 0 | 2 | 1 |
| task-2 | C | Qwen solo | 4.67 | 0.0% | format_violation* | 0 | 2 | 1 |
| task-2 | D | Qwen retrieval | 3.94 | 0.0% | format_violation* | 0 | 3 | 0 |
| task-3 | A | Opus solo | 4.94 | 0.0% | format_violation* | 0 | 1 | 2 |
| task-3 | B | Opus retrieval | 4.89 | 0.0% | retrieval_or_harness_error + format_violation* | 1 | 2 | 0 |
| task-3 | C | Qwen solo | 4.89 | 0.0% | format_violation* | 0 | 2 | 1 |
| task-3 | D | Qwen retrieval | 4.56 | 0.0% | (none) | 0 | 3 | 0 |

\* `format_violation` fires here because the classifier detects markdown headers (`# MEMO:`, `## RISK 1`) at the start of synthesis responses. **For synthesis tasks, markdown structure is EXPECTED format**, not a violation. This is a known classifier false-positive for this data shape — the Phase 4.1 classifier was tuned for factoid output where markdown wrapping IS unusual. **Do not interpret `format_violation` here as a Tier 1 signal.** Documented for the methodology disclosure section.

`retrieval_or_harness_error` fires on task-2/B and task-3/B because their `loop_exhausted: true` flag was set (Opus retrieval cells exhausted their max_steps budget). Real harness signal but doesn't speak to Tier 1 vs Tier 2 of the synthesis quality.

## Sample rationales (illustrative)

**Worst H4 cell — Qwen retrieval, task-1/D, trio_mean 4.39 (vs B's 4.94, delta −0.55):**

Judge Opus: *"Completeness is the relative weak point: while it engages all six docs, customer churn/NRR is folded into other risks rather than treated as its own critical thread, and the at-risk $1.4M ARR base receives less direct attention than warranted given its severity."*
→ T2: "folded into" + "less direct attention" = conflation + shallow synthesis. No format/strictness component.

Judge GPT: *"Accuracy is the weakest dimension because the memo introduces several unsupported specifics and overreaches beyond the materials—for example promising AI MVP by Q2 instead of the stated Q3 target, citing monthly burn as $1.05M from a quarterly cash-burn figure, and proposing bi-weekly board reporting and specific hiring/contractor actions not grounded in the source documents."*
→ T2: "unsupported specifics" + "overreaches beyond the materials" + concrete examples of fabricated facts. Pure semantic/grounding gap. Phase 1.1 normalize cannot fix this.

Judge MiniMax: *"Actionability scores 4 rather than 5 because while the memo provides specific budget reallocations and headcount actions, it lacks precise implementation timelines… and clear ownership assignments…"*
→ T2: "lacks precise implementation timelines" + "ownership assignments" = missing content. Real synthesis depth issue, not artifact.

**3/3 judges, all T2.** Consistent across rubric dimensions and models. This pattern repeats across all three D cells.

## Interpretation: why is Tier 1 so low?

Three reasons converge:

1. **Phase 1.1 normalize delta = 0% across 12/12 cells.** No `<think>` tags, no `[memory:]` patterns, no code-fence wrappers, no rambling preambles. The candidate_responses were already format-clean. This isn't an artifact-removal opportunity.

2. **Qwen 3.6 was already prompted with `enable_thinking: true` + max_tokens 16000** per amendment v2. Thinking tokens were generated but stripped at the API boundary BEFORE landing in `candidate_response`. The visible response is post-thinking — already normalized.

3. **The synthesis tasks are open-ended Likert-scored, not exact-match factoid.** Judges weren't penalizing format issues (which would be the T1 signal); they were penalizing missing content, weak conflation of risks, ungrounded specifics, and shallow analysis. These are content-level issues that Phase 1.1 normalize was never designed to address.

## Strategic implications

### What this means for Phase 5 mini re-pilot

If Phase 5 re-runs the same 12-cell pilot scenario with **only** Phase 1.1 + Phase 3.x + Phase 4.6 infrastructure changes (no Tier 2 GEPA work), the H3/H4 deltas will not move materially. Phase 1.1 normalize has nothing to strip; Phase 3.x adds checkpointing/recovery (irrelevant for completion-quality measurement); Phase 4.6 adds messages-array compression (cost reduction, not quality improvement).

The infrastructure improvements from Phase 1-4 are **valid** and **important** for production reliability and scalability — they're not wasted work. But they don't address the specific failure mode that drove the original pilot FAIL verdict. **The sovereign multiplier teza requires real per-model prompt evolution (GEPA) to close the H4 gap.**

### Concrete recommendations (in priority order)

1. **AUTHORIZE Tier 2 GEPA work brief authoring for parallel execution with Phase 5.** Specifically, target the 26 T2 rationales' failure modes:
   - `unsupported-specifics` / `overreach` / `fabrication` (10 of 26 T2 hits) → GEPA should evolve a stricter "stay grounded in materials" prompt directive
   - `missed` / `didn't-consider` / `shallow` (9 of 26 T2 hits) → GEPA should evolve coverage-completeness checks
   - `conflation` / `weak-synthesis` (5 of 26 T2 hits) → GEPA should evolve disambiguation/separation prompts
   - The remaining 2 T2 hits (`off-topic`, `wrong-entity`) are sparse — bundle with the above

2. **Run Phase 5 with the EXISTING infrastructure first** (Phase 1.1 + 3.x + 4.6) to establish a clean baseline post-infrastructure-changes. Expected outcome: H3/H4 deltas change by ≤0.05 (within noise). This is valuable as a NULL result confirming Tier 2 is the actual blocker — and confirms our infrastructure work didn't accidentally regress synthesis quality.

3. **Then run Phase 5 with GEPA-evolved prompts** for cells C and D. This is where the H3/H4 needle is expected to move.

4. **Phase 4.4 / 4.5 (skills + tools sweep)** are still worth doing — they're in scope per the sprint plan and unrelated to the synthesis quality question. They probe a different model-portability concern.

### What the data does NOT tell us

- Whether **stricter agentic prompting** (Cell B / D protocol changes) would have helped. The candidate_responses are already produced; we'd need to re-run with different prompts.
- Whether **a different retrieval strategy** (different K, different formatter) would have helped. Same caveat.
- Whether **a different judge rubric** would have produced different verdicts. The judges scored per the existing 6-dim Likert; their concerns are real but the rubric is fixed.

These are all GEPA territory — the prompt-shape evolution would address them.

## Audit chain

| Item | Value |
|---|---|
| Branch HEAD | `c9bda3d` (Phase 4.7) |
| Pilot data | `D:\Projects\waggle-os\benchmarks\results\pilot-2026-04-26\pilot-task-{1,2,3}-{A,B,C,D}.jsonl` |
| Rescore script | `D:\Projects\waggle-os\tmp\phase-4-3-rescore\rescore.ts` |
| Rescore JSON output | `D:\Projects\waggle-os\tmp\phase-4-3-rescore\rescore-summary.json` |
| Phase 1.1 normalize preset | `benchmark-strict` (PRESETS export) |
| Phase 4.1 classifier subset | thinking_leakage / metadata_copy / format_violation / retrieval_or_harness_error (4 of 10 gold-free) |
| LLM fallback | qwen3.6-35b-a3b-via-dashscope-direct (Mem0-style structured prompt) |
| LLM fallback calls | 27 (of 30 max) |
| LLM fallback cost | $0.077 (under $0.20 halt) |
| Total budget used | $0.077 / $0.30 cap |

## PM ratification asks

1. **Accept H3/H4 = Tier 2** verdict and authorize Tier 2 GEPA work brief authoring for parallel execution with Phase 5.
2. **Approve recommendation order**: Phase 5 NULL-result baseline run first (infrastructure-only), then Phase 5 with GEPA-evolved prompts.
3. **Continue Phase 4.4 / 4.5** (skills + tools sweep) per existing sprint plan — orthogonal concern, still valid.

---

**End of Phase 4.3 re-score validation. Standing AWAITING PM strategic ratification on items 1-3 above.**
