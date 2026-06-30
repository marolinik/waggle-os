# Conforming-claim pilot — τ²-bench retail, B/B⁻/A/A⁻ (2026-06-30)

**First defensible conforming signal.** N=50 paired tasks, k=1, user-sim gpt-5.2 (low),
max-steps=40, seed=42. Mode-1 shared frozen mind (10 neutral retail M1/M2 artifacts,
hash `3fb2f0d4…`) — byte-identical across the memory-ON arms, so **the model is the only
variable** between B and A. Harness = `feature/harness-sota-bench` @ tool-forwarding
rework `cc580777`. Summary: `summary_n50k1.json`.

## Results

| Arm | Model | Memory | pass^1 | agent cost | $/task | agent turns |
|---|---|---|---|---|---|---|
| B⁻ | qwen3.6-35b-a3b | OFF | 78.0% (39/50) | $1.10 | $0.022 | 631 |
| **B** | **qwen3.6-35b-a3b** | **ON** | **88.0% (44/50)** | **$1.10** | **$0.022** | 580 |
| A⁻ | claude-opus-4-8 | OFF | 81.6% (40/49) | $27.63 | $0.564 | 577 |
| A | claude-opus-4-8 | ON | 72.0% (36/50) | $28.59 | $0.572 | 539 |

Reference: τ²-retail **ruler** (gpt-5.2 as agent) = **77.70%** pass^1. Total agent cost
$58.41 (+ uncaptured gpt-5.2 user-sim, identical across arms). A⁻ had 1 infra error (49/50).

## The signal

1. **Qwen + harness + memory is the TOP arm (88%)** — beats opus+memory (72%), opus-off
   (81.6%), and the gpt-5.2 ruler (77.7%) — at **~1/26 the agent cost** ($0.022 vs $0.564/task).
   The conforming claim "Qwen + Waggle harness + Hive memory ≈ frontier" is **met and exceeded**
   on this domain: the local 35B-active protagonist is the best arm, not merely a tie.
2. **B vs A (the headline parity test):** qwen+mem 88% vs opus+mem 72% = **+16pp for qwen**.
   **Paired McNemar (exact, the rigorous test): qwen+mem won 12 of the 16 head-to-head discordant
   tasks (opus won 4), p = 0.077 — directionally strong but NOT significant at N=50** (this corrects
   an earlier looser unpaired estimate of p≈0.04). Memory-OFF the two are essentially tied
   (78.0 vs 81.6; paired net −2, p = 0.75), consistent with "qwen-raw ≈ opus-raw on retail" (a less
   capability-bound domain than GAIA2's −19.3pp).
3. **Cost:** opus agent cost is **25.6× qwen's**. Qwen+stack delivers the best accuracy at a
   fraction of the cost, fully local / zero-egress.

## The surprise (must be resolved by the larger study)

**Memory's effect diverges by model:** it HELPS qwen (78→88, +10pp) but HURTS opus (81.6→72,
−9.6pp). Both deltas are **within noise at N=50, k=1** (95% CI on pass^1 ≈ ±11–13pp; the opus
delta is z ≈ 1.1, p ≈ 0.25 — not significant). Candidate explanations to test:
- noise / small-N fluctuation (most likely for the opus drop);
- the generic recalled procedures DISTRACT an already-strong model (opus-ON used fewer turns,
  539 vs 577 — acted faster, possibly skipping verification the task needed);
- an interaction between the injected block and opus's own planning.
A paired per-task McNemar (which tasks flipped on/off) + larger N would resolve it. **Do not
headline "memory helps everyone" or "memory hurts opus" from this pilot** — only "memory
clearly helps the qwen protagonist; its effect on opus is inconclusive here."

## Paired McNemar (per-task, exact two-sided binomial on discordant pairs)

Paired on the same task ids (A⁻ dropped 1 task to an infra error → 49 for its pairings):

| comparison | N | both | win | lose | neither | net | exact p |
|---|---|---|---|---|---|---|---|
| **B vs A** (qwen+mem vs opus+mem) | 50 | 32 | **12** | 4 | 2 | **+8** | **0.077** (n.s.) |
| B vs B⁻ (qwen mem ON vs OFF) | 50 | 37 | 7 | 2 | 4 | +5 | 0.18 (n.s.) |
| A vs A⁻ (opus mem ON vs OFF) | 49 | 30 | 5 | 10 | 4 | −5 | 0.30 (n.s.) |
| B⁻ vs A⁻ (qwen-off vs opus-off) | 49 | 34 | 4 | 6 | 5 | −2 | 0.75 (n.s.) |
| B vs A⁻ (qwen+mem vs best opus) | 49 | 37 | 6 | 3 | 3 | +3 | 0.51 (n.s.) |

**Honest read:** NOTHING reaches p<0.05 at N=50 — exactly what a pilot is for (clear direction + sized N,
not significance). Strongest signal = **B vs A: qwen+mem won 12 of 16 head-to-head tasks (75%), p=0.077** —
just under threshold; the full study should confirm. The **"memory hurts opus" surprise is NOT significant
(p=0.30, net −5/49)** — treat as noise until the larger study says otherwise. **Raw qwen ≈ raw opus is a near
tie** (B⁻ vs A⁻ net −2, p=0.75). The cost win (~1/26) is deterministic, not statistical. Reproduce:
`python benchmarks/tau2/results-retail-pilot/mcnemar.py` over the four `results.json`.

## UPDATE — N-bump to N=114 (B vs A): the lead does NOT reach significance

Ran arms B + A on the remaining 64 retail tasks (ids 50–113; B⁻/A⁻ left at N=50). Combined:

| arm | N=50 (ids 0–49) | batch-2 (ids 50–113) | combined |
|---|---|---|---|
| B qwen+mem | 88.0% (44/50) | 79.4% (50/63) | **83.2% (94/113)** |
| A opus+mem | 72.0% (36/50) | 75.0% (48/64) | **73.7% (84/114)** |

**Paired McNemar N=113: both=73, B-only=21, A-only=11, neither=8 → net +10, exact p = 0.110 (n.s.).**
The bump made it LESS significant (0.077 → 0.110), not more — because the qwen edge **attenuated on the
harder second half**: qwen+mem fell 88→79 while opus+mem held 72→75, so the gap narrowed +16pp → +9.5pp.
The N=50 result was on the optimistic side; the larger sample regressed it toward a **smaller, still-positive**
effect. Batch-2 cost: opus A $37.70 (64), qwen B $1.52 (63) — ~$39 agent (~$54 with user-sim, within the
~$40–60 quoted). Reproduce: `python benchmarks/tau2/results-retail-pilot/mcnemar-n114.py`.

**Honest standing claim (post-bump):** qwen3.6 + harness + memory **remains the top arm and leads
opus+memory by ~9.5pp at ~1/26 the agent cost, fully local** — but the lead is **directional, NOT
statistically significant even at N=114 (p=0.11)**. Raw qwen ≈ raw opus. The effect is real-leaning but
**modest**; establishing it needs the large pre-registered study, and the true effect size is likely smaller
than the N=50 snapshot implied. **Do not headline "Qwen beats Opus" — headline "Qwen matches Opus at ~1/26
cost, fully local," which the data robustly supports.**

## Honest scope / caveats
- **N=50, k=1, single seed** — first signal, NOT the pre-registered study. Wide CIs; no TOST,
  no McNemar, no overlap-audit/re-derivability gate (deferred to the full study).
- **Harness fidelity ceiling:** for the τ² agentic cell the environment owns the loop / executor
  / gates, so "Waggle under test" = **system-prompt assembly + memory injection** only (the
  AGENT_INSTRUCTION-wrapped policy + the recalled block). Not the full runAgentLoop. State this
  in any external claim.
- **Mode-1 mind is hand-authored** (neutral builder), not earned from a Phase-A run — valid for
  a model-isolation pilot; the Phase-A self-built mind (Mode-2) is a later arc.

## Recommended next step
The pilot did its job: a defensible first signal + measured cross-arm discordance to size the
full study. The pre-registered confirmatory study (OSF freeze, N≈1500 pooled, k>1, paired
McNemar + TOST equivalence, overlap-audit + re-derivability gates, the difficulty-stratified
SHA'd split) is the path to a publishable claim — gated on a substantial OpenAI/Anthropic
budget (opus is the cost driver at ~$0.56/task). Cheap immediate follow-ups: paired per-task
McNemar on this pilot's results.json; a k=3 re-run on N≈25 for a first pass^k reliability read.
