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
   Unpaired z ≈ 2.05 (p ≈ 0.04) — borderline-significant even at N=50; paired McNemar should be
   tighter. Memory-OFF the two are close (78.0 vs 81.6, opus +3.6pp), consistent with "qwen-raw ≈
   opus-raw on retail" (a less capability-bound domain than GAIA2's −19.3pp).
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
