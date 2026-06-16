# 11 — τ²-bench Study-Domain-Set Decision: "Why only retail+airline — why not other areas?"

**Date:** 2026-06-17 · **Status:** RECOMMENDATION — pending founder ratification, then folds into `10-PREREGISTRATION-PARAMETERS.md` §3 before the OSF/SHA freeze.
**Method:** 8-agent fan-out (5 per-domain deep readers of the vendored τ²-bench tree @ pinned commit `5ebebbe8` + a leaderboard headroom analyst + a design-contract reconciler → synthesizer). Every number verified against `data/tau2/domains/*` and `web/leaderboard/public/submissions/*/submission.json`.

---

## 1. Direct answer

The original **retail + airline** choice was directionally right but **under-characterized**: it picked the two canonical dual-control domains by familiarity and never ran the headroom/divergence test the pre-reg's own divergence gate (§3) demands. What it missed:

- **It never characterized `banking_knowledge`** — the *only* τ² domain that is simultaneously (a) genuinely divergent (frontier pass^1 9–37%, headroom **62.63pp**), (b) structurally distinct (a RAG-over-700-docs front-end on the dual-control loop), and (c) the **only** domain carrying the study's *named current-generation ceilings* (GPT-5.5 / Opus-4.7 / Gemini-3.1-Pro).
- **Both retail and airline are near-saturated for an *accuracy-equivalence* claim.** Retail is the better (graded 72→84, headroom 15.6pp); airline is a near-ceiling cluster (6/7 models within 5pp). The chosen pair gives the **agentic-harness exercise** (good) but gives the **accuracy-TOST secondary cell almost nothing to bite on**.

**Decision: conditionally ADD `banking_knowledge` as the accuracy-TOST / divergence cell** (C2-gated, see §3), keep retail + airline as the efficiency/pass^k harness cells, **DROP telecom** (saturated) and mock. Free to decide now — the pre-reg is DRAFT, unfrozen.

---

## 2. Per-domain verdict table

| domain | n | task_type | agentic harness? | headroom | verdict | proposed role |
|---|---|---|---|---|---|---|
| retail | 114 | agentic dual-control | yes-full | 15.57pp | DISCRIMINATIVE | **efficiency / pass^k cell** (primary harness) |
| airline | 50 | agentic dual-control | yes-full | 16.0pp | BORDERLINE (near-ceiling cluster) | **efficiency / pass^k cell** (secondary harness) |
| telecom | 2285 | agentic dual-control | yes-full | 2.19pp | **SATURATED** | **DROP** (equivalence-by-ceiling) |
| banking_knowledge | 97 | agentic dual-control + RAG | yes-full | 62.63pp | DISCRIMINATIVE (strongest) | **accuracy-TOST / divergence cell** (conditional) |
| mock | 10 | dual-control fixture | yes-full | — | dev fixture | DROP (smoke only) |

Headroom cohort = 0.2.1-dev / gpt-5.2-user-sim models (excludes the deliberately reasoning-disabled `gpt-5-2-none` config, which spuriously inflates spread).

---

## 3. The load-bearing ruling — agentic-harness or knowledge-QA?

Adding a *knowledge-QA* domain would **confound the new harness claim with the already-done memory/LoCoMo claim** (01-DESIGN-SPEC §1 non-goal: "NOT a memory-QA claim dressed as a harness claim"). So this is the decision that gates everything.

**Ruling: `banking_knowledge` is an agentic-harness domain, not knowledge-QA — but it ships behind a construct gate.** Evidence (decisive, harness side):
- Registered τ² `Environment` with `tools` + `user_tools` over one shared **17-table mutable TransactionalDB** — identical shape to retail/airline/telecom.
- True dual-control: **825 assistant + 102 user** requestor actions; real WRITE mutations + a discoverable-tool unlock mechanic.
- **Graded on end DB-state / actions, never answer text**: `reward_basis` = DB (88/97) / ACTION (9/97); `communicate_info` empty in **100%** of tasks. The RAG layer is a *front-end to action selection*, not the grader.

**The real risk is C2 (re-derivability), not task-type.** Because banking has a retrieval front-end, some tasks may only be solvable if memory *supplies KB knowledge an unbounded memory-OFF agent could not retrieve* — that would make a "harness lift" a smuggled retrieval lift (C2 violation). **Mandatory mitigation (pre-registered):** run the C2 re-derivability filter (exclude any banking task where memory-OFF-with-full-tools cannot in principle reach gold) + a construct check during the Plan-09 ruler/smoke pilot. **If the pilot reads banking as memory-QA, drop it from the headline family BEFORE freeze.** With C2 applied, banking *strengthens* the claim — it is the one cell with real graded discrimination (D4 "different structure-overlap profile").

---

## 4. Recommended τ² study-domain set

**`{ retail, airline, banking_knowledge(conditional) }`** — telecom dropped, mock dropped.

- **retail** — efficiency + pass^k harness cell. (A2 efficiency-led headline; D1 native distribution; B4/D4 ≥2 dual-control cells.)
- **airline** — efficiency + pass^k harness cell. (D4 second structure profile; B4 "lift positive in ≥k of m cells".)
- **banking_knowledge** — accuracy-TOST / divergence cell, *conditional on the C2 construct gate*. (A1 TOST only on divergent non-saturated cells, gap ≥ 2δ = 10pp, report headroom — banking is the only τ² domain that passes; A2 accuracy-equiv is secondary; C2 re-derivability exclusion; §6.1 n=97 is under-powered for a standalone ±5pp binary TOST → **descriptive 90% paired-diff CI with the ±δ band drawn**, items pooled into the cross-substrate TOST.)

**Do not justify banking on pooled-N grounds** — its +97 is ~17% of the 1,500 target; GAIA2 (~400) + AppWorld carry volume. Banking's value is *qualitative*: it is the divergence/headroom cell.

---

## 5. Ruler-anchor implication

The ruler gate must reproduce a published cell on the **exact protocol arm**: `tau2_bench_version = 0.2.1-dev` **AND** `user_simulator = gpt-5.2`. Tolerance is **N-derived**, not ±1pp.

- **Primary ruler anchor: `banking_knowledge × GPT-5.5` (published 37.37).** The only domain where the study's *named current-generation* exact-arm numbers exist (GPT-5.5 37.37, Opus-4.7 25.26, Gemini-3.1-Pro 22.54). For retail/airline the newest published frontier is the older Opus-4.5 / GPT-5.2 / Gemini-3-Pro batch — a retail anchor would validate against a one-generation-older tier.
- **Tolerance:** at n=97, p=0.3737, SE ≈ 4.9pp → a **±2·SE ≈ ±10pp** band (or require the published point inside the exact 95% Clopper–Pearson interval). **Reject ±1pp** — below the sampling-noise floor of a 97-item set.
- **Optional secondary cross-check:** `retail × Opus-4.5` (published **79.61**) at n=114 (SE ≈ 3.6pp → ±~7pp). *[Correction to the synthesis draft, which mislabeled this "84.43" — 84.43 is Qwen3.5-397B's retail ceiling, not Opus-4.5. If a Qwen-family anchor is preferred, Qwen3.5-397B retail = 84.43 is available; but it is NOT our subject (Qwen3.6-35B-A3B is unmeasured on the board).]*

---

## 6. Exact edits required (apply only after ratification)

**(a) `10-PREREGISTRATION-PARAMETERS.md` §3 — replace the domain line with:**

> **§3 τ² study-domain set.** Domains = **retail, airline, banking_knowledge**. **DROP telecom** (saturated: ceiling 97.81, headroom 2.19pp — equivalence-by-ceiling) and mock (10-item dev fixture). **Roles:** retail + airline = efficiency/pass^k harness cells (native distribution, D1). banking_knowledge = accuracy-TOST/divergence cell, **conditional on a construct-check gate run during the Plan-09 ruler/smoke pilot**: (i) confirm DB-state grading + dual-control (verified: reward_basis DB/ACTION, communicate_info empty 100%); (ii) apply the C2 re-derivability filter (exclude tasks where memory-OFF-with-full-tools cannot reach gold); (iii) if the pilot reads banking as memory-QA, **drop it from the headline family before freeze**. **Divergence gate:** run accuracy-TOST only where raw A–D or C–D gap ≥ 2δ = 10pp; banking passes (headroom 62.63pp), retail/airline do **not** (report descriptively). **Power:** banking n=97 under-powered for standalone ±5pp TOST → descriptive 90% paired-diff CI + pool C2-surviving items into the cross-substrate TOST. **Ruler anchor:** reproduce `banking_knowledge × GPT-5.5 = 37.37` on `tau2 v0.2.1-dev` + `gpt-5.2` user-sim, tolerance = 95% Clopper–Pearson at n=97 (≈±10pp), NOT ±1pp.

**(b) `10-PREREGISTRATION-PARAMETERS.md` §6.1 / line ~151 arithmetic fix:** the pooled-N text assumes τ² ≈ 360 — that silently still counts telecom's 114. With telecom dropped, **τ² = retail 114 + airline 50 = 164** (+ banking 97 = **261**). Correct at freeze.

**(c) New (no committed ruler config exists yet):** create `benchmarks/harness/config/rulers.json` carrying the pinned anchor(s) as the `--rulers` input to `gate`/`preflight` (currently the only reference is the `0.8195` *test fixture*, which was the borrowed Memori LoCoMo number — not a τ² number).

---

## 7. CONFIRMs required (founder / ops — gate the freeze)

1. **API access to `GPT-5.5`** on the τ² v0.2.1-dev arm — needed to reproduce the 37.37 banking anchor. If unavailable, fall back to `retail × Opus-4.5` (79.61) as the ruler anchor against the older batch.
2. **Access to the `gpt-5.2` user-simulator** — the entire protocol filter (and every published number quoted here) is conditioned on `user_simulator = gpt-5.2`; a different user-sim invalidates the leaderboard comparison.
3. **Founder ratification** of adding banking_knowledge (3rd τ² domain) into §3 before the OSF/SHA freeze, accepting the C2-gate drop-condition.

---

## 8. One-line recommendation

Ship **retail + airline (harness/efficiency cells) + banking_knowledge (conditional accuracy-TOST/divergence cell, C2-gated)**; drop telecom + mock; anchor the ruler on **`banking_knowledge × GPT-5.5 @ v0.2.1-dev / gpt-5.2-user-sim`** with an N-derived (~±10pp) tolerance.
