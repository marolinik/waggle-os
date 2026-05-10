# Pilot Decision Template — Go/No-Go for Full N=400 Multiplier Benchmark

**Authored:** 2026-04-26 (pre-results, in advance of pilot completion)
**Decision owner:** Marko (ratifies); PM (drafts)
**Trigger:** CC-1 emits `pilot-summary.json` after agentic knowledge work pilot completes
**Pilot ID:** `agentic-knowledge-work-pilot-2026-04-26`
**Manifest anchor:** `pilot-2026-04-26-v1` (amendment SHA `3946d3e0`)

**Why this template exists pre-results:** Pre-built decision branches force honest threshold adherence. When results arrive, PM doesn't draft a memo from scratch under emotional pressure to rationalize the outcome — PM populates the appropriate branch with verbatim numbers. This is the discipline `feedback_substrate_readiness_gate` and `Anti-pattern #4 reminder: thresholds do not shift post-hoc` from manifest v6 are enforcing.

---

## §1 — Pre-registered hypotheses (do NOT modify)

From `cc1-brief.md` §2 + amendment §1:

- **H2 — Opus multiplier**: Cell B trio mean > Cell A trio mean by ≥ 0.30 Likert points, on ≥ 2 of 3 tasks
- **H3 — Qwen multiplier**: Cell D trio mean > Cell C trio mean by ≥ 0.30 Likert points, on ≥ 2 of 3 tasks
- **H4 — Sovereignty bridge**: Cell D trio mean ≥ Cell A trio mean, on ≥ 2 of 3 tasks

**Pilot binary verdict:**
- **PASS** = H2 + H3 + H4 each show directional sign on ≥ 2 of 3 tasks AND no critical failures (no cell scoring < 2.0 on majority of judges)
- **FAIL** = otherwise

---

## §2 — Decision template — Branch A: PILOT PASS

If pilot summary shows PASS, PM populates this branch and submits to Marko for ratification.

### Memo header

**Subject:** PM-RATIFY — Full N=400 multiplier benchmark authorization (pilot PASSED)
**Date:** [populate from pilot completion timestamp]
**Author:** PM
**Decision asks:** (1) Authorize full N=400 multiplier scope; (2) Confirm budget envelope; (3) Ratify model roster; (4) Lock manifest v7 anchor

### Memo body

**Pilot result summary:**
- H2 directional pass: [X of 3 tasks]
- H3 directional pass: [X of 3 tasks]
- H4 directional pass: [X of 3 tasks]
- Critical failures: [count]
- Pilot verdict: **PASS**
- Wall-clock: [actual hh:mm]
- Total cost: $[actual]
- HEAD SHA at execution: [commit hash]

**Cell-by-cell deltas (per task, trio means):**

| Task | A (Opus solo) | B (Opus + harness) | C (Qwen solo) | D (Qwen + harness) | H2 Δ (B-A) | H3 Δ (D-C) | H4 Δ (D-A) |
|---|---|---|---|---|---|---|---|
| Task 1 | [X.X] | [X.X] | [X.X] | [X.X] | [+/-X.X] | [+/-X.X] | [+/-X.X] |
| Task 2 | [X.X] | [X.X] | [X.X] | [X.X] | [+/-X.X] | [+/-X.X] | [+/-X.X] |
| Task 3 | [X.X] | [X.X] | [X.X] | [X.X] | [+/-X.X] | [+/-X.X] | [+/-X.X] |

### Recommended full N=400 multiplier scope

**Sample size:** N=400 instances per cell, drawn from real-world knowledge work corpus (TBD construction — synthetic-realistic per pilot pattern, scaled to 400 instances)

**Cells (3 cells, not 4):**
- Cell A: Opus 4.7 solo
- Cell B: Opus 4.7 + memory + agent loop
- Cell C: Qwen 3.6 35B-A3B + memory + agent loop

(H4 sovereignty bridge claim is most-actionable comparison; Cell C-Qwen-solo redundant if pilot demonstrates Qwen + harness ≥ Opus solo. Confirm with Marko whether Cell D-Qwen-solo retained as control.)

**Optional addition — Cell D: GPT-5.4 + memory + agent loop** for cross-vendor frontier comparison.

**Models tested:**
1. claude-opus-4-7 (frontier proprietary)
2. qwen3.6-35b-a3b-via-openrouter (sovereign reference)
3. (optional) gpt-5.4 (frontier proprietary, second vendor)

**Judge ensemble:** Same trio-strict (Opus + GPT + MiniMax) per pilot. Re-calibrate κ on N=14 synthesis-task subset before full launch.

**Budget envelope:**
- Candidate model spend: $40-90 (Opus dominates, 400 × multi-step × Opus rate)
- Trio judge spend: $30-50 (1200-1600 judge calls)
- Buffer: $30
- Total cap: **$150 hard cap, $130 halt**

**Wall-clock target:** 36-48 hours runner time (parallel cell execution where possible)

**Pre-registration manifest v7:**
- Anchor commit at full launch (TBD)
- Hypothesis statements identical to pilot (H2, H3, H4) — unchanged
- Cost cap, halt thresholds locked
- Sample size N=400, seed 42
- Output schema same as pilot
- F-mode taxonomy reused

### Decision asks (Marko ratifies)

1. **Authorize full N=400 multiplier benchmark** with scope above? (Y/N)
2. **Cell D-Qwen-solo retained or descoped?** Pilot showed [X of 3 sovereignty bridges]; descoping reduces cost ~$30. Recommendation: [retain/descope based on pilot results]
3. **Add GPT-5.4 cell or stay 3-cell?** Adds ~$30 cost, strengthens cross-vendor frontier claim for paper. Recommendation: [add/skip based on paper plans]
4. **Manifest v7 anchor commit** — current HEAD or fresh commit before kick? Recommendation: [based on tree state]
5. **Run timing** — kick off [today/tomorrow/post-arxiv] given concurrent landing copy + arxiv work?

---

## §3 — Decision template — Branch B: PILOT FAIL

If pilot summary shows FAIL, PM populates this branch.

### Memo header

**Subject:** PM-HALT — Multiplier expansion deferred (pilot FAILED)
**Date:** [populate from pilot completion timestamp]
**Author:** PM
**Decision asks:** (1) Confirm halt; (2) Choose next-action path; (3) Update launch narrative if material

### Memo body

**Pilot result summary:**
- H2 directional pass: [X of 3 tasks] — required ≥ 2
- H3 directional pass: [X of 3 tasks] — required ≥ 2
- H4 directional pass: [X of 3 tasks] — required ≥ 2
- Critical failures: [count]
- Pilot verdict: **FAIL**

**Failure mode classification (which hypothesis failed and why):**

#### Sub-branch B.1 — H2 (Opus multiplier) failed
**Implication:** Adding hive-mind + agent loop to a frontier model does NOT reliably lift performance on knowledge work. This contradicts PA V5 finding (April 2026, Opus 4.6 +5.2pp publishable on H1). Possible causes:
- V1 retrieval quality is insufficient; agent loop pulls noisy chunks and degrades vs. full-context Opus baseline
- Multi-step agent loop overhead exceeds value-add at 5-step ceiling
- Knowledge work tasks do not benefit from memory in the same way memory-recall tasks do

**Recommended response:** Pause multiplier expansion. Prioritize retrieval V2 work (5 directions identified in arxiv §5.3). Re-run pilot post-V2.

#### Sub-branch B.2 — H3 (Qwen multiplier) failed
**Implication:** Qwen 35B-A3B + harness does NOT lift Qwen performance reliably. Possible causes:
- Qwen 35B-A3B context utilization is already strong; full-context cell is competitive baseline
- Agent loop self-prompting confuses Qwen more than it helps
- Knowledge work tasks require cognitive capability that base Qwen struggles with regardless of harness

**Recommended response:** Run Qwen-only ablation isolating each loop component (retrieval-only, self-prompt-only, full harness). Identify which component degrades vs. helps.

#### Sub-branch B.3 — H4 (Sovereignty bridge) failed
**Implication:** Qwen + harness does NOT match Opus solo on knowledge work. Sovereignty narrative weakens.

**Recommended response:** Honest framing in launch — "sovereignty class leader, not frontier-equivalent" rather than "SOTA-on-local". Update landing copy v3 §3 Claim 3 accordingly. Continue retrieval V2 work as primary path to closing the gap.

#### Sub-branch B.4 — Critical failures (any cell < 2.0)
**Implication:** Pilot harness or retrieval is broken at base level. Cannot interpret hypothesis results because system was not functional.

**Recommended response:** Halt pilot expansion. Diagnose specific failure mode. Likely candidates: agent loop crash, judge JSON parse failure, hive-mind retrieval contamination. Fix before re-running pilot.

### Launch narrative impact (if material)

If H2 fails: arxiv paper §5.4 (multiplier section) is dropped or deferred. Paper claim #2 changes from "substrate + harness lift frontier model performance" to TBD.
If H3 fails: sovereignty multiplier framing in landing copy v3 weakens; emphasize substrate ceiling instead.
If H4 fails: landing copy v3 §3 Claim 3 reframed.

### Decision asks (Marko ratifies)

1. **Confirm halt** of full N=400 multiplier benchmark? (Y/N)
2. **Next-action path:**
   - (a) Retrieval V2 work first, pilot retry after
   - (b) Diagnose specific failure mode, fix, re-run pilot
   - (c) Drop multiplier from paper, focus on substrate-only narrative
3. **Launch comms update** — does pilot fail trigger landing copy v3 revision before launch? (Recommend: only if pilot fails AND original copy makes multiplier claim, which v3 currently does not.)

---

## §4 — Decision template — Branch C: PILOT PARTIAL (mixed signals)

If pilot summary shows mixed results — e.g., H2 PASS, H3 FAIL, H4 PASS — PM uses this branch.

### Default disposition

Mixed signals are **inherently ambiguous on N=3**. Sample size is too small to distinguish "true mixed reality" from "noise on a small sample".

**Default recommendation:** Run pilot retry at N=20-30 (not N=400) to reduce uncertainty before committing to full N=400 budget.

### Sub-branch C.1 — Strong signal on majority, weak on minority
If 2 of 3 hypotheses pass strongly + 1 fails marginally → recommend full N=400 with the failing hypothesis flagged as "exploratory" not "confirmatory" in paper. This requires Marko ratification because it's a methodological judgment call.

### Sub-branch C.2 — Strong on minority, weak on majority
If 1 of 3 hypotheses passes strongly + 2 fail marginally → recommend retrieval V2 work first. Multiplier story is too uncertain to publish.

### Sub-branch C.3 — All marginal (none clearly pass, none clearly fail)
Strict reading: pilot FAIL. But may indicate threshold (≥0.30 Likert delta) was too strict for synthesis tasks where judge variance is naturally higher. Marko + PM ratify whether to:
- (a) Treat as FAIL per pre-registration discipline (recommended; preserves anti-pattern #4)
- (b) Run pilot retry with calibrated threshold based on observed Likert variance

Anti-pattern #4 reminder: thresholds do not shift post-hoc. Sub-branch C.3 (b) is a methodological deviation that requires explicit acknowledgment and Marko ratification — not a quiet adjustment.

---

## §5 — Cost reality check + audit trail

**Pilot cost cap (per amendment §6):** $7.00 hard, $6.00 halt
**Full N=400 cost cap (Branch A recommendation):** $150 hard, $130 halt
**Ratio:** 21x scale-up in budget for ~33x scale-up in sample size (12 → 400 instances)
**Implication:** per-instance cost decreases due to amortized fixed costs; consistent with pilot-validated economics

**Audit trail requirement:**
Every populated branch must include verbatim from pilot-summary.json:
- `pilot_id`
- `manifest_anchor`
- `total_cost_usd`
- `total_judge_calls`, `total_candidate_calls`
- `pilot_verdict`
- All 3 task results structures (cell trio means, deltas, directional passes)
- Full HEAD SHA at execution
- Amendment SHA `3946d3e0`

If pilot-summary.json is missing any field required for branch population, PM halts and pings CC-1 to re-emit summary. Memo is not authored on incomplete data.

---

## §6 — Memory + decisions folder updates

After Marko ratifies:

- `decisions/2026-04-26-pilot-verdict-{PASS|FAIL|PARTIAL}.md` — populated branch saved as decision record
- `.auto-memory/project_pilot_2026_04_26_result.md` — memory entry summarizing verdict + ratified next action
- `MEMORY.md` index updated with pilot result entry

If Branch A (PASS): also create:
- `decisions/2026-04-26-full-n400-multiplier-authorized.md` — authorization record for full benchmark
- Update `.auto-memory/project_benchmark_strategy.md` with full N=400 scope locked
- New CC-1 brief at `briefs/2026-04-27-cc-multiplier-n400-brief.md` based on pilot wrapper learnings

If Branch B (FAIL): also create:
- `decisions/2026-04-26-multiplier-expansion-deferred.md` — halt record with diagnostics
- `briefs/2026-04-27-retrieval-v2-priority.md` — V2 work priorities (assuming sub-branch B.1 or B.4)
