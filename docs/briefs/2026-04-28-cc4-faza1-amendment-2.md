# CC-2 Faza 1 — Amendment 2 (Phase 4.5 retrieval-engagement signal incorporation)

**Date:** 2026-04-28
**Author:** PM
**Status:** RATIFIED, supplements Amendment 1, binding upon paste-into-CC-2
**Predecessor:** `briefs/2026-04-28-cc4-faza1-amendment-1.md`
**Trigger:** Phase 4.5 tools audit (CC-1 commit reference: decision memo `decisions/2026-04-28-phase-4-5-tools-audit-results.md`) surfaced empirical mechanistic signal not visible at Amendment 1 authoring time

---

## §1 — Why this amendment exists

Phase 4.5 produced an empirical, pilot-anchored mechanistic finding that **directly changes GEPA Faza 1 fitness function design**. Without incorporation pre corpus-generation, GEPA risks evolving prompt-shapes that improve trio-judge scores via surface-level mutation while leaving the underlying behavioral gap untouched. That would produce false-positive Faza 1 PASS → Phase 5 GEPA-evolved FAIL — the worst possible outcome (we'd waste Faza 2 expansion + Phase 5 budget on shapes that don't actually rescue H4).

Amendment 2 incorporates the signal as a binding fitness function modification before any GEPA evolution happens.

---

## §2 — The empirical signal (Phase 4.5 §"Pilot retrieval engagement empirical signal")

| Cell | Model | retrieval_calls | steps | loop_exhausted | trio_mean |
|---|---|---|---|---|---|
| Task 1 / B | Opus | 2 | 3 | false | 4.94 |
| Task 1 / D | Qwen | 1 | 2 | false | 4.39 |
| Task 2 / B | Opus | 2 | 3 | **true** | 5.00 |
| Task 2 / D | Qwen | 1 | 2 | false | 3.94 |
| Task 3 / B | Opus | 3 | 4 | **true** | 4.89 |
| Task 3 / D | Qwen | 2 | 4 | false | 4.56 |
| **Mean** | **Opus 2.33 / Qwen 1.33** | | **Opus 67% exhausts** | **Δ=−0.65** |

Three observations from Phase 4.5:

1. Qwen retrieves ~half as often as Opus (1.33 avg vs 2.33 avg) on byte-identical tool surface
2. Opus exhausts maxSteps in 2 of 3 retrieval runs (loop_exhausted=true) — wants more retrievals than 5-turn budget
3. Qwen retrieval scores LOWER than Opus retrieval on every task (Δ mean −0.65)

The H4 score gap mechanistically traces (at least partially) to under-engagement with retrieval, not to format issues — Phase 4.5 verified MULTI_STEP_ACTION_CONTRACT renders identically across all 5 prompt shapes.

**Implication for GEPA:** the failure mode is "Qwen finalizes prematurely with insufficient evidence base." The mutation surface (prompt-shape body) IS where this can be addressed — by evolving instruction phrasing that triggers more retrieval iterations / discourages early finalization on Qwen-targeted shapes.

---

## §3 — Fitness function update (binding)

Brief §3.1 originally specified:
> Fitness = trio-strict accuracy − cost penalty (−0.5pp per $0.10 cost above baseline median)

**UPDATED for Faza 1:**

```
Per-shape fitness function:

For Qwen-targeted shapes (qwen-thinking, qwen-non-thinking):
  fitness = trio_strict_pass_rate
          + retrieval_engagement_bonus
          - cost_penalty

  where retrieval_engagement_bonus = 
    +0.05 (5pp)  if mean retrieval_calls per task ≥ 2.0  (Opus parity proxy)
     0.00        if mean retrieval_calls per task in [1.5, 2.0)
    -0.05 (5pp)  if mean retrieval_calls per task < 1.5  (Qwen baseline behavior penalty)

For non-Qwen shapes (claude, gpt, generic-simple):
  fitness = trio_strict_pass_rate − cost_penalty
  (retrieval engagement signal not weighted; these shapes don't have the gap)

Cost penalty unchanged: −0.5pp per $0.10 cost above per-shape baseline median.
```

**Rationale for Qwen-only weighting:** Phase 4.5 finding is Qwen-specific. Opus shape does NOT have the gap (loop_exhausted=true means Opus engages retrieval aggressively). Applying retrieval-engagement bonus uniformly across all shapes would distort fitness for shapes that don't have the underlying behavioral problem.

**Rationale for ±5pp band:** matches the brief §4 condition 1 "+5pp threshold" — keeps signal magnitudes consistent. Wider band would dominate trio-strict signal; narrower would be noise-floor.

**Rationale for 2.0 threshold:** Opus mean 2.33 is the parity target; 2.0 is a slightly relaxed target acknowledging that Faza 1 shapes are mid-evolution and may not perfectly match Opus. Achievement of 2.0 retrieval mean signals "shape closes the engagement gap to within 14% of Opus" — sufficient signal for fitness ranking.

---

## §4 — Mutation oracle prompt update (binding)

Brief §3.3 mutation oracle prompt is updated to include explicit guidance for Qwen-targeted shape mutations:

```
For qwen-thinking and qwen-non-thinking shape mutations specifically:
- Emphasize multi-turn retrieval over single-shot retrieval
- Discourage premature finalization (e.g., "Continue retrieving until 
  you have evidence from at least 2 distinct queries before finalizing")
- Encourage iterative refinement of retrieval queries based on prior turn results
- Anti-premature-finalization scaffolding (e.g., "Before finalizing, ask: 
  what gap in evidence remains? Issue another retrieval if any gap exists.")
- Preserve cell semantic boundary (per Amendment 1 §6.4 mutation validator)

For claude, gpt, generic-simple shape mutations:
- Standard mutation guidance per original brief §3.3 applies
- No Qwen-specific scaffolding (these shapes don't exhibit the gap)
```

CC-2 implementing this update will fork the mutation oracle prompt template into two paths (Qwen vs non-Qwen) — a deliberate added complexity justified by the empirical Phase 4.5 signal. Document the fork in manifest v7 §mutation_oracle_design block.

---

## §5 — Acceptance criteria update (Faza 1 → Faza 2 gate)

Amendment 1 updated §4 condition 1 to reference trio_strict_pass rate. **Amendment 2 adds a Qwen-shape-specific sub-criterion:**

**§4 condition 1 (UPDATED twice — current binding form):**
"Best GEPA candidate per shape beats NULL-baseline by ≥+5pp on trio_strict_pass rate (where trio_strict_pass = trio_mean ≥ 4.0). For Qwen-targeted shapes (qwen-thinking, qwen-non-thinking), additionally: best candidate must have mean retrieval_calls per task ≥ 1.7 (engagement gap closed by ≥50% relative to Qwen baseline 1.33 → Opus parity 2.33)."

§4 conditions 2-4 unchanged:
- §4.2: ≥3/5 shapes show positive delta on trio_strict_pass
- §4.3: trio judge κ within ±0.05 of canonical 0.7878
- §4.4: zero cell semantic violations

**Additional FAIL condition added:**
- **§4.5 (NEW):** if best Qwen-shape candidate achieves +5pp trio_strict delta WITHOUT closing retrieval engagement gap (mean retrieval_calls < 1.5), this signals false-positive evolution (improvement via mutation-noise rather than mechanistic fix). Result: candidate REJECTED, shape marked FAIL even if other criteria pass. PM ratifies whether to re-run mutation generation with stronger anti-premature-finalization scaffolding or escalate.

---

## §6 — Forward to Phase 5 GEPA-evolved variant (out-of-Faza-1 scope, but recorded)

Phase 4.5 also specifies acceptance criteria for the Phase 5 GEPA-evolved variant (separate from Faza 1):

> If GEPA achieves both:
> - Qwen retrieval_calls ≥ Opus retrieval_calls per task (engagement parity)
> - Qwen H4 trio_mean delta from Opus narrowed by ≥ 0.30 points (score parity proxy)
> 
> the sovereign multiplier teza is rescued.

These are **Phase 5 acceptance criteria, not Faza 1.** Faza 1 acceptance per §5 above is necessary-but-not-sufficient — it validates that GEPA can produce candidates that score better AND engage retrieval more. Phase 5 GEPA-evolved variant validates that the engagement gain translates to score gain at scale (N ≥ 30 per cell, full pilot scenario reproduction).

CC-2 must NOT optimize for Phase 5 criteria during Faza 1 selection. Faza 1 selection is per §5 only. Phase 5 is downstream brief authored by PM post Faza 1 Checkpoint C.

---

## §7 — Cost projection (unchanged from Amendment 1)

Per-shape fitness function complexity does not increase per-call LLM cost — retrieval_calls counter is already telemetry on the agent harness (per pilot 2026-04-26 trace data). No additional API calls.

Total Faza 1 expected: ~$100.50, $100 hard cap, $80 internal halt — all unchanged.

Mutation oracle complexity (forked Qwen vs non-Qwen prompts) also unchanged in cost; the fork happens in oracle prompt construction, single LLM call per mutation regardless.

---

## §8 — Implementation order (binding)

CC-2 incorporates Amendment 2 changes into the manifest v7 + launch decision LOCK at the same time as Amendment 1 ratifications. Both amendments are paste-ratified by PM in single message; CC-2 should treat as conjoined binding contract.

Specifically:
1. Manifest v7 §metric_operationalization adds `retrieval_engagement_bonus` block per §3 above
2. Manifest v7 §mutation_oracle_design adds forked Qwen vs non-Qwen prompt template paths per §4 above
3. Launch decision §A inherited rules also includes Phase 4.5 retrieval-engagement signal as Cumulative Pre-flight Rule §A.9 (extending the original 8 sub-rules)
4. Launch decision §acceptance_criteria reflects updated §5 Qwen-specific sub-criterion
5. GEPA harness scaffold (per Amendment 1 §7 step 7) implements per-shape fitness function with telemetry hook on retrieval_calls counter

Test coverage requirements (Amendment 1 §8): unit tests for the per-shape fitness function (≥80% coverage) MUST include test cases for the Qwen-engagement bonus boundary conditions (1.49 / 1.5 / 1.99 / 2.0 / 2.5 retrieval_calls means).

---

## §9 — Cross-references

- Amendment 1: `briefs/2026-04-28-cc4-faza1-amendment-1.md`
- Original brief: `briefs/2026-04-28-cc4-gepa-tier2-evolution-faza1-brief.md`
- Pre-flight report: `briefs/2026-04-28-cc4-faza1-preflight-report.md`
- Phase 4.5 source: `decisions/2026-04-28-phase-4-5-tools-audit-results.md`
- Phase 4.3 verdict: `decisions/2026-04-28-phase-4-3-rescore-delta-report.md`
- Pilot data: `benchmarks/results/pilot-2026-04-26/pilot-task-{1,2,3}-{B,D}.jsonl`
- MULTI_STEP_ACTION_CONTRACT: `packages/agent/src/prompt-shapes/types.ts` (cell semantic boundary linchpin)

---

**End of Amendment 2. Conjoined with Amendment 1, binding upon single paste-into-CC-2.**
