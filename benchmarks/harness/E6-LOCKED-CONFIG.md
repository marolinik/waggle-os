# E6 Evidence-Ledger — LOCKED CONFIG (matched-50 = 0.7748, gate met)

Frozen 2026-07-16. Composed matched-50 (convs 1/10/11, 5 Q × 10 abilities) = **0.7748**,
above Eywa-on-same-50 (0.7704). This is the config to run on full-700 — do not change the
`abilityInstruction()` prompts without re-validating matched-50.

## The config
- **Runner:** `scripts/beam-run-ledger.ts` — `abilityInstruction()` holds the locked,
  per-ability prompts (cumulative iter2–iter6 additive edits). Each ability's current
  prompt is the exact version that produced its composing answers.
- **Answerer:** `anthropic/claude-sonnet-4.6` via OpenRouter, prompt caching ON.
- **Judge:** `openai/gpt-5` via OpenRouter (NEVER bare `gpt-5` — direct account quota is
  dead). Pass `--judge-model openai/gpt-5`.
- **Context:** whole-ledger prefix = P2 STATE (`convN.state.txt`) + P1 ledger
  (`convN.ledger.txt`); detail abilities also get top-N raw dated turns.

## Per-ability provenance (which iteration's prompt is locked)
information_extraction, abstention = pilot · contradiction_resolution,
instruction_following = iter2 · temporal_reasoning, preference_following = iter4 ·
event_ordering, knowledge_update = iter5 · summarization, multi_session_reasoning = iter6.

## Full-700 run (P4)
```
npx tsx scripts/beam-run-ledger.ts --convs 1-35 --judge-model openai/gpt-5 \
  --tag e6-ledger-FULL700 --resume --budget 60
```
Processes grouped by conversation for cache warmth; `--resume` skips done rows. Requires
ledgers + states for all 35 convs (P1/P2). Dedup by `instance_id` for final metrics.

## Reference points (matched-50)
baseline 0.5533 · best read-time 0.6198 · pilot 0.6825 · Eywa same-50 0.7704 · E6 0.7748.
Full-700 targets: ≥0.8285 = SOTA vs Eywa; ≥0.80 = strong co-SOTA. Old full-700 baseline
(pre-E6) = 0.6482.
