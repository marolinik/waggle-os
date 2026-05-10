# LOCKED — PM-RATIFY Judge Swap Validation Sequence (§1.3g + §1.3h + §1.3h-C CLOSED)

**Date**: 2026-04-24
**Ratified by**: Marko Marković ("prihvatam tvoje preporuke, idemo dalje")
**PM**: claude-opus-4-7 (Cowork)
**Scope**: Consolidated ratification of three sequential validation sub-gates producing MiniMax primary + Kimi backup selection for manifest v6 swap

## Sub-gate chain

| Sub-gate | Verdict | Anchor | Cost | Wall-clock |
|---|---|---|---|---|
| §1.3g 4-candidate MULTI_PASS | ACCEPT with methodological caveat (κ=1.0 tie was unanimous-sample selection bias) | `8a2f0e6` | $0.25 | 35 min |
| §1.3h Stratified re-probe on 7 splits | INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL (Option 1 PROCEED accepted; splits all Opus-correct/GPT-incorrect invalidated balance metric) | `ae0d312` | $0.30 | 9 min |
| §1.3h-C DeepSeek mt=1024→2048 parse fix | ACCEPT with B-equivalent matrix placement (parse fixed 7/7 but correctness regressed 40%→14%; DeepSeek disqualified for GPT-alignment) | `005a19a` | $0.05 | 2.4 min |

Total probe investment: $0.60, ~47 min wall-clock, 11 anchor commits from v4 `dedd698`.

## Final selection

**Primary**: MiniMax M2.7 (openrouter routing, 86% correctness on splits, 7/7 parse, 16s p50 latency)
**Backup**: Kimi K2.6 (direct routing, 80% correctness, 5/7 parse, 32s p50 latency — per-instance failover only)

**Disqualified**:
- Zhipu GLM-5.1: 100% GPT-echo (0% correctness on splits, ensemble diversity = 0)
- DeepSeek V4 Pro: GPT-alignment escalates with reasoning budget (40%→14% correctness at mt1024→mt2048)

## Key methodological findings

1. §1.3g κ=1.0 tie across all 4 candidates was **selection-bias artifact** from first-4-per-cell unanimous sample (split rate in full κ set = 7%, sample had 0%). Formal κ on unanimous cases is uninformative for ensemble selection.

2. §1.3h splits were homogeneous Opus-correct / GPT-incorrect distribution (all 7/7). CC-1's initial "balance = independence = good" metric was theoretically valid but empirically inapplicable because Opus was ground-truth correct. PM correctness re-analysis memo (`2026-04-24-pm-correctness-reanalysis-memo.md`) documents metric correction.

3. DeepSeek parse regression at higher reasoning budget is a novel empirical finding: **GPT-alignment surfaces under reasoning pressure**. Consistent with industry observation that some Chinese models trained on GPT synthetic data inherit GPT reasoning style. Strategic implication: future ensemble diversity tests must validate candidates at multiple reasoning budgets.

## Backup activation policy

**Per-instance failover** (not per-batch). Sequence on N=400 run:
1. Instance → ensemble call to MiniMax (third judge)
2. If MiniMax returns parseable verdict → use MiniMax
3. If MiniMax fails (API error, parse failure, timeout) → attempt Kimi on same instance
4. If Kimi also fails → mark instance `judge_ensemble_fail`, document in audit trail, exclude from final analysis
5. Continue to next instance; no batch switching

Rationale: zero-waste execution, clean audit trail attribution per instance, minimizes correlated failure risk (MiniMax-openrouter issue doesn't propagate to Kimi-direct).

## Scope guard amendment (required for v6)

Manifest v5 §11 lists `litellm-config.yaml` as frozen. Manifest v6 emission **explicitly supersedes v5 §11 freeze**; v6 will contain new §11 pinning file state after MiniMax + Kimi alias additions. Same supersession pattern used v4→v5 for Gemini rpm:20 edit.

CC-1 must edit `litellm-config.yaml` **under v6 authority** (commit message references v6 anchor), not as ad-hoc change under v5.

## κ re-calibration requirement

κ=0.7458 is three-way (Opus+GPT+Gemini). New trio (Opus+GPT+MiniMax) requires fresh κ calculation before N=400 kick. Scope: full 100-instance re-calibration (3 judges × 100 = 300 calls), budget ~$25, wall-clock 30-45 min. Audit defensibility priority over reduced-sample shortcut.

Success criterion: new κ ≥ 0.70 substantial agreement. If κ < 0.70 → trio validity compromised, swap path re-evaluates (may require Kimi promoted to primary, or different backup exploration).

## Total v6 remaining path budget & timeline

- Manifest v6 emission + config amendment: ~5 min, $0
- κ re-calibration: 30-45 min, ~$25
- PM-RATIFY-V6-KAPPA checkpoint
- N=400 execution with new trio: 2-3h, ~$25
- Gate D exit adjudication
- **Total**: ~3-4h wall-clock from v6 ratification, ~$50 cost

## Post-SOTA follow-up items (Task 2.6 backlog)

1. Stratified κ calibration on split-oversampled instances (resolve unanimous bias permanently; n=40+ with intentional Opus-vs-GPT balance)
2. Ensemble diversity validation methodology at multiple reasoning budgets (catch GPT-alignment escalation pattern)
3. MiniMax direct routing unblock investigation (GroupId didn't unblock; may need support ticket to api.minimaxi.com)
4. Document v6 swap as precedent for future preview-model quota issues

## Parent commit chain (since v4 anchor `dedd698`)

```
fc16925  v5 anchor
ad324cc  Step 2 rpm:20 (Gemini alias)
3a146ef  §1.3c probe v2 PASS
e5696f4  Fold-in 3.5a
d0ab680  Fold-in 3.5b
1d3851d  §1.3e RPD memo
8ad0567  §1.3f Vertex Batch INFEASIBLE
8a2f0e6  §1.3g 4-candidate MULTI_PASS
ae0d312  §1.3h stratified re-probe
005a19a  §1.3h-C DeepSeek mt=2048 parse fix
```

11 commits od v4. HEAD intact. Zero N=400 calls still.

## Task #29 trace

- All sub-gates CLOSED
- Next step: manifest v6 emission brief (PM authoring now)
- GATE-D-REKICK-GO authorization pending after PM-RATIFY-V6-KAPPA
