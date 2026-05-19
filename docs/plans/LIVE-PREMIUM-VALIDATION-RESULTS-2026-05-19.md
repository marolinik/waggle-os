# Results — Live Premium Validation (LPV)

**Contract:** `docs/plans/LIVE-PREMIUM-VALIDATION-PREREG-2026-05-19.md` @ `d628120`
Reported verbatim. No goalpost-moving; no autonomous re-run (no-revisit).

## LPV-B — D1 payoff on a floundering workload: `INCONCLUSIVE-STOPPED`

Pilot (sonnet-4.6, floundering corpus, harness `cebb25d`): spend **$0.1879 / $5**,
0/3 pairs. All families: `task_a grader-FAIL (tools=9-10, r1=gated-off)`.

The floundering corpus **succeeded** at its design goal — it forced genuine waste
(9-10 tool calls vs R6's clean 5-7) — but **overshot**: sonnet-4.6 floundered
through the decoys, failed the grader, and gave up (self-incapacity → the real
`planSkillDistillation` correctly gated off → no skill authored → no pair). The
pre-registered T3 gate STOPPED (0 < 2 PASS families). The $38 powered budget was
correctly never spent.

## The bracketing finding (binding)

Two rigorous, independently pre-registered experiments now **bracket** the D1
reuse-payoff question:

| | Corpus | Result | Why no payoff measured |
|---|---|---|---|
| R6 | clean, short optimal path | ~0% reduction | no waste for a skill to cut |
| LPV-B | heavy decoys, non-obvious | task_a unsolvable | no successful run to distil from |

The Hermes "~40% faster" payoff requires a workload that is **floundering-inducing
yet solvable** — a narrow calibration window neither synthetic corpus hit. Total
live spend across both ≈ **$0.23**. Honest conclusion: the speedup is **not
reproducible by us on a synthetic corpus**; a credible demonstration needs a
carefully-calibrated *realistic* engineering workload — a substantial new
user-initiated pre-registered experiment, not a synthetic quick-run.

## Effect on the rubric — NONE (the honest carve-out stands, now doubly-bracketed)

D1 stays **3 on the MECHANISM** (deterministically closed + regression-locked;
R6 Pilot-4 showed it fires live under a real model). The D1 carve-out is
**unchanged**: the ~40% *speedup* is not claimed — and is now empirically
bracketed as un-reproducible on synthetic corpora (R6 too easy, LPV-B too hard).
No score moves. The experiment did exactly what a pre-registered experiment
should: produced an honest, bounded answer instead of a chased number.

## LPV-A — partial

Not separately exercised this run (task_a failed before the distill turn).
Standing evidence: R6 Pilot-4 = sonnet authors skills live when the distill turn
is reached (D1-fires-live, partial). A full LPV-A (live D3 gate-diff + clean-run
false-positive rate) remains a deferred, user-scoped increment.
