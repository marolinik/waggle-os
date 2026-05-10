# Manifest v5 §1.3e RPD Feasibility Check

**Date:** 2026-04-24 · **Target:** PM-RATIFY-V5-RPD gate.

## §Call Count Derivation

`runner.ts:395-545` + `failure-mode-judge.ts:245-258` sequential ensemble
⇒ 1 Gemini/instance. `health-check.ts:106-108` ⇒ 1 Gemini/cell-ping.
Tie-break Grok-only. **Nominal = 5 × (400 + 1) = 2005.**

## §Isolation Verification

Grep `gemini-3.1-pro-preview` minus manifest/litellm-config → 7 dormant
files (docstring, `models.json:122` OpenRouter bucket, tests, eval,
Tauri bundle, docs). Zero active callers. Defensive sibling rpm:20
applied (Fold-in 3.5b, `d0ab680`).

## §Feasibility Arithmetic

- Prior today 80; Stage 3 2005; today-total 2085.
- vs 250 RPD: 8.3× over → **INFEASIBLE**.
- vs 2500 pending: 83% (415 headroom) → **FEASIBLE**.
- Tomorrow (reset −80): 80% / 2500.

## §Caveats

Google RPD window may be rolling. Worst-case retry 3× → 6015; §1.3c PASS
shows rpm:20 queues → retries dormant.

## §Verdict

**INFEASIBLE at 250 RPD. FEASIBLE at 2500 RPD.** Re-kick gated on Google
quota-ticket approval; PM confirms live RPD at Step 5.
