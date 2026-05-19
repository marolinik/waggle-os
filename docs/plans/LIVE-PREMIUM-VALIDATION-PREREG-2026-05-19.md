# Pre-Registration — Live Premium Validation (LPV)

**Date:** 2026-05-19 PM · **Status:** LOCKED before any LLM spend · **Repo @** `808d045`
**A NEW experiment** (R6 concluded under its own no-revisit rule; the floundering-workload + live-gate test was explicitly deferred to "a new user-initiated pre-registration" — user initiated it: "do all needed for full proof"). Same discipline as R6: strict pre-registration, no revisit, documented amendments only, verbatim verdict.

## 0. Why this exists

Every premium lock to date (D1/D3/D5/D6) is deterministic/mock. R5 proved "unit-tested ≠ premium". This experiment supplies the missing **live evidence**, two independent claims:

- **LPV-A — gates fire correctly under a real model.** The D3 and D1 loop gates were unit-locked; do they fire / not-false-positive when a *real model* produces the content & tool-calls in a real `runAgentLoop` session?
- **LPV-B — D1 reuse actually pays off on a floundering workload.** R6 measured ~0% on clean linear tasks and located the cause: a strong model already walks an optimal short path, so a skill has no waste to cut. R6's own analysis predicts payoff appears where the **baseline flounders** (dead-ends, distractors, non-obvious method). LPV-B tests exactly that condition.

## 1. Model (pinned)

`anthropic/claude-sonnet-4.6` via OpenRouter (vault key; the R6 Pilot-4 model that demonstrably authors skills + tool-calls). Temperature 0. Mandatory slug probe; abort-no-fallback.

## 2. Metrics (locked)

- **LPV-A:** per scenario, booleans — `gateFired` (loop injected the expected directive) and `falsePositive` (gate fired on a clean control where it must not). No LLM judge.
- **LPV-B:** primary = tool-calls-to-grader-correct completion (`AgentResponse.toolsUsed.length`); secondary = turns, tokens. Same as R6.

## 3. Pre-registered success (locked)

- **LPV-A PASS** ⇔ across the scenario set: every "should-fire" scenario has `gateFired=true` AND every "must-not-fire" control has `falsePositive=false` (zero tolerance — these are deterministic gates; a real-model miss is a real defect).
- **LPV-B PASS** ⇔ paired (baseline_b vs treatment_b, both grader-PASS): **median tool-call reduction ≥ 0.40** AND one-sided sign test **p < 0.05**. Identical bar to R6 §3 (no goalpost move; the only change vs R6 is the corpus is engineered to make the baseline flounder).

## 4. Floundering corpus (LPV-B) — the one deliberate change vs R6

R6's corpus failed to show payoff because the optimal path was short & obvious. LPV-B corpus is engineered so a *fresh* agent must flounder:
- A large pool of plausible-but-wrong **distractor** files that match naive greps, plus dead-end "see also" cross-refs that lead nowhere.
- The correct answer requires a **non-obvious traversal** discoverable only by trial (the naive first grep lands in distractors).
- task_a and task_b share the **same non-obvious method**; the distilled skill must encode "ignore the distractor class X, the real entry is the non-obvious Y, traverse via Z" — so treatment_b skips the floundering.
- Grader unchanged in kind (required-facts present); PASS–PASS pairs only. Skill isolation asserted at runtime (R6 §5). create_skill semantics = R6 Amendment-1 (in-harness, byte-identical), distill turn = faithful two-phase (R6 Amendment-4).

## 5. Cost governance (hard)

`CostTracker` hard mode. **$5 pilot / $38 combined** caps (R6 Amendment-4 conservative ceiling so total ≤ the $40 the user authorized for this class; cumulative across this experiment only). Slug probe before spend; `maxTurns ≤ 25`; per-run token budget. `BudgetExceededError` aborts — overspend structurally impossible.

## 6. T3 pilot → gate (pre-registered, no discretion)

LPV-A is cheap (a handful of short scenarios) and runs first every invocation. LPV-B: N=3 pilot, then **ESCALATE to N=20** iff (median r ≥ 0.40) AND (≥2/3 pilot families PASS–PASS) AND (projected powered cost ≤ remaining cap). Else STOP → `INCONCLUSIVE-STOPPED` + projection. No metric/threshold/corpus change post-data.

## 7. Pre-registered outcomes (all valid; none hidden)

- **LPV-A:** PASS (gates proven live) / FAIL (a real defect — name it).
- **LPV-B:** PROVEN (escalated, §3 met) / NOT-PROVEN (escalated, not met) / INCONCLUSIVE-STOPPED (pilot gate failed; report numbers + projection).
- Rubric impact: D3/D1 are already 3 on the *mechanism* (deterministically locked). LPV-A FAIL would *demote* (real-model defect). LPV-B PROVEN converts D1's honest carve-out ("~40% is R6-tracked, not claimed") into a *demonstrated* payoff on realistic workloads. LPV-B NOT-PROVEN/INCONCLUSIVE leaves the carve-out exactly as it honestly stands — the mechanism is premium; the speedup is workload-dependent and, on tested workloads, unproven. No score is inflated by this experiment; it can only confirm or honestly qualify.

## 8. Anti-p-hacking

Single confirmatory analysis per claim. One pre-registered escalation gate. No post-hoc selection. Nondeterminism handled by the sign test + explicit small-N pilot caveat. Results doc reports verdicts verbatim against this file. This commit is the contract hash.
