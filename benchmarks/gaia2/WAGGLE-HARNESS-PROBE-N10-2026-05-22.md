# Waggle harness — first GAIA 2 probe (N=10, PRELIMINARY)

**Date:** 2026-05-22 · Pillar 1 first apples-to-apples · **NOT a conclusion**

## What this is
The first run of **Waggle's own `runAgentLoop`** inside the GAIA 2 rig, vs the Hermes
reference harness, on the **same 10** search-split scenarios (sorted-order subset of the
Hermes N=160). Same model (Sonnet 4.6), same single `terminal` tool, same AGENTS.md,
same in-container judge. Waggle gates OFF (skillDistillation/verification) for fairness —
Hermes has no such meta-features.

## Result (self-judged, matched N=10)

| Harness | PASS | Rate |
|---|---:|---:|
| Hermes (reference) | 9/10 | 90% |
| Waggle | 7/10 | 70% |

Per-scenario: Waggle FAILed `21_1afh09`, `21_5bftlu` (both Hermes PASS); both FAILed `21_eo7tr6`; rest PASS.

## Why this is NOT yet a verdict on harness quality
1. **N=10 → Wilson CI ≈ ±28pp.** 70% vs 90% overlaps massively — not statistically distinguishable.
2. **Run-to-run variance is real.** `21_1afh09` PASSED in the gates-off n1 smoke but FAILED in this
   probe under identical config → single-run-per-scenario is noisy at this N. A real comparison needs
   larger N and/or pass@k.
3. **Self-judged.** The Hermes headline was validated by an independent trio (JUDGE-DELTA doc). Waggle's
   answers must get the same trio re-judge for parity before any comparison is published.
4. **Gateway confound.** Waggle → OpenRouter (Sonnet 4.6, OpenAI-compat); Hermes → Anthropic direct
   (Sonnet 4.6). Same model, different gateway. For strict parity, point both at one litellm proxy.

## The value delivered
The **measurement rig works end-to-end** — Waggle's harness is now a benchmarkable entity in GAIA 2.
That was the hard part (native-dep gate, container, socket worker, terminal→gaia2-exec, fairness config).
The digit (70%) is a placeholder until a real run.

## Next for a defensible Pillar-1 number
- Larger N (≥40, ideally the full 160 matched set) + **pass@k** to quench single-run variance.
- **Trio-strict re-judge of Waggle** (reuse `rejudge_user_message.py`) — same protocol as Hermes.
- Optional: single litellm proxy for both harnesses to remove the gateway confound.
- Report Waggle strict + trio-strict alongside Hermes 83.8% / 80.6% under one protocol.

## Artifacts
- Waggle run: `runs/waggle-harness-probe-n10/`
- Hermes baseline: `runs/p4-full-hermes-n160/` (matched subset)
- Container/worker: `waggle-container/` · build: `waggle-container/BUILD.md`
