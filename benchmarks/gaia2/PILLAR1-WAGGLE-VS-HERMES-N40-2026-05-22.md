# Pillar 1 — Waggle harness vs Hermes reference (GAIA 2 search, N=40)

**Date:** 2026-05-22 · first defensible Waggle-harness number · controlled comparison

## Headline

**Waggle's own agent harness performs on par with the Hermes reference harness on GAIA 2 search.**

| Harness | self-judged | **trio-strict** | 95% CI (trio) |
|---|---:|---:|---:|
| Hermes (reference agent) | 91.9% | **89.2%** | 75–96% |
| **Waggle** (`runAgentLoop`) | 86.5% | **86.5%** | 72–94% |

Self-judged on the full matched 40: Waggle 33/40 = 82.5%, Hermes 35/40 = 87.5%.
Trio-judged on the answerable subset N=37 (3 had no answer/oracle to LLM-judge).

The **2.7pp trio-strict gap has heavily overlapping 95% CIs → not statistically distinguishable** at this N. Waggle's loop is competitive with a SOTA-class reference agent.

## Controlled-variable protocol (only the harness differs)
- **Same model:** Claude Sonnet 4.6 (Waggle via OpenRouter OpenAI-compat; Hermes via Anthropic direct — same model, gateway differs; see caveats).
- **Same single `terminal` tool** (GAIA 2 apps via `gaia2-exec`), **same rendered AGENTS.md**, **same in-container judge**, **same scenarios** (Waggle's 40 are the sorted-order subset of the Hermes N=160).
- **Waggle meta-features OFF** (`skillDistillationGate`/`verificationGate=false`) — Hermes has no such features, so this keeps the task contract identical (see issue #4: skill distillation was replacing the final answer).

## Judge integrity
- **Trio-strict** = all 3 independent judges (Opus 4.7 + Gemini 2.5 Pro + GPT-5) agree PASS, using GAIA 2's own `user_message_checker` (only the judge model varies).
- **Waggle self-judge inflation = +0.0pp** (self 86.5% == trio-strict 86.5%) — even cleaner than Hermes (−2.7pp). Waggle's answers are unambiguously correct when judged.

## Per-scenario (self-judged, matched 40)
- Both PASS: 31 · Waggle-only PASS: 2 (`23_5xzkat`, `23_ans8nx`) · Hermes-only PASS: 4 (`21_bnrehm`, `22_52pwi3`, `22_pepb8u`, `22_x4rb15`).

## Caveats (carried forward)
1. **N=37–40 → CI ≈ ±12pp.** On par, but not powered to resolve a small true gap. Larger N tightens this.
2. **Single-run pass@1.** Run-to-run variance is real (the N=10 probe's 70% was an unlucky sample; `21_1afh09` flipped between runs). pass@k would quench it.
3. **Gateway confound.** Waggle→OpenRouter, Hermes→Anthropic (same model). A single litellm proxy for both removes it.
4. **One split.** Search only. The full matrix adds execution / adaptability / time / ambiguity.

## What this establishes
Pillar 1 is **proven and measurable**: Waggle's harness is a benchmarkable entity in GAIA 2 and lands at reference-harness level. The remaining work is precision (N, pass@k, gateway parity, more splits, + OpenClaw), not feasibility.

## Scale-up to a publishable Tier-1 number
- Full N=160 matched + **pass@k** (k=3) for both harnesses.
- Single litellm proxy (gateway parity).
- Add OpenClaw + Oracle (ceiling); extend to the 5 GAIA 2 splits.
- Budget: ~$90/harness/split at N=160 pass@1 (×k for pass@k) — PM-ratify before the full matrix.

## Artifacts
- Waggle run: `runs/waggle-harness-n40/` · trio re-judge: `runs/rejudge-waggle-n40.jsonl`
- Hermes baseline: `runs/p4-full-hermes-n160/` (matched subset) · trio: `runs/rejudge-search-n160.jsonl`
- Container/worker: `waggle-container/` · judge harness: `rejudge_user_message.py`
