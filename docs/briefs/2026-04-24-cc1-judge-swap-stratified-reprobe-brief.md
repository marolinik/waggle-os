# CC-1 Brief — §1.3h Judge Swap Stratified Discriminating Re-Probe

**Date**: 2026-04-24 (evening, post-§1.3g)
**Status**: §1.3h sub-gate, PM-adjudicated Path 2 (stratified re-probe) over Path 1 (accept-by-operational-criteria)
**Authorized by**: Marko Marković (2026-04-24, "ostalo se slazem pravi prompt" + MINIMAX_GROUP_ID added to .env)
**Predecessor**: §1.3g MULTI_PASS sa methodological caveat — κ=1.0000 tie across all 4 candidates na first-4-per-cell sample biased toward unanimous cases (split_consensus_excluded=0/20 vs full-set split rate 7%). Operational ranking (Zhipu > DeepSeek > MiniMax > Kimi) heuristic ne diskriminativan empirical signal.
**PM**: claude-opus-4-7 (Cowork)

---

## §0 Cilj re-probe-a

Diskriminisati 4 judge candidate-a na **challenging cases gde Opus ≠ GPT** (split consensus). Unanimous cases daju κ=1.0 by construction — nisu informativni. Split cases su gde stvarno vidimo judge character + calibration quality + independence from reference judges.

Output: empirical κ ranking based on discriminating signal, plus operational metrics (parse rate, latency, routing) na svežem challenging sample.

---

## §1 Path re-prioritization summary

§1.3g confirmed: all 4 candidates pass κ ≥ 0.70 threshold. §1.3h goal:
- Primary: rank candidates on SPLIT-CASE κ (discriminating)
- Secondary: re-measure parse rate + latency + routing na split cases (complexity may degrade metrics vs unanimous)
- Tertiary: sanity-check full 40-instance aggregate κ (should match or slightly exceed original if sample is representative)

**Post-§1.3h verdict scenarios**:
- **SPLIT_DISCRIMINATING**: κ values spread across candidates on splits → empirical ranking determines primary + backup
- **STILL_ALL_PASS**: all candidates κ ≥ 0.70 on splits too → operational secondary ranking legitimately tie-breaks
- **PARTIAL_FAIL**: some candidates κ < 0.70 on splits → subset passes, clean cut
- **ALL_FAIL_ON_SPLITS**: no candidate ≥ 0.70 on splits → swap path CLOSED, return to Branch B or Google ticket wait

---

## §2 Sample construction (40 instances, stratified)

### §2.1 Preserved unanimous subset (20 instances)

**Reuse existing §1.3g `sample-instances.jsonl`** (SHA `f4770fec...`). 20 instances gde Opus = GPT = Gemini. No need to re-select. For these, candidates already have verdicts from §1.3g — **reuse those verdicts, do NOT re-execute calls on unanimous subset**. Existing data is idempotent and counted in aggregate.

### §2.2 NEW split-cases subset (20 instances)

Select 20 instances iz full κ calibration set-a (the one that produced κ=0.7458 three-way; should be N≈100-300 range) gde **Opus verdict ≠ GPT verdict**. Full-set split rate = 7% per §1.3g memo; if full κ set = 286 instances, expected splits ≈ 20 (exactly our target), meaning selection may effectively be "all available splits".

Selection priority:
1. Stratified across cells (no-context, retrieval, full-context, oracle-context, agentic) — prefer balanced representation
2. If all-available-splits count < 20: use all, document shortage, proceed with smaller sample (minimum 12 for meaningful discrimination)
3. If all-available-splits count > 20: stratified random selection with `seed=20260424` for reproducibility

**Saving the split sample**: `benchmarks/probes/judge-swap-validation/split-cases-sample.jsonl` with fields: `instance_id`, `cell`, `opus_verdict`, `gpt_verdict`, `gemini_verdict` (if present in original κ set — reference only, NOT used as consensus).

**Critical note on consensus definition for split cases**:
On splits, Opus+GPT consensus doesn't exist. Use **dual reference measurement**:
- `agreement_vs_opus`: candidate == Opus verdict (0 or 1 per instance)
- `agreement_vs_gpt`: candidate == GPT verdict (0 or 1 per instance)
- Per candidate compute: `p_opus = agreement_vs_opus_count / split_n`, `p_gpt = agreement_vs_gpt_count / split_n`
- Well-calibrated judge ≈ 50/50 split (independent judgment; doesn't mimic either reference)
- Biased judge shows > 70/30 systematic lean (correlated with one reference style; less ideal for ensemble)
- Compute κ per candidate vs Opus alone AND vs GPT alone separately; take min(κ_vs_opus, κ_vs_gpt) as conservative split-case κ

---

## §3 MiniMax direct routing unblock

Marko confirmed: `MINIMAX_GROUP_ID` added to `D:\Projects\waggle-os\.env` between §1.3g and §1.3h sessions.

CC-1 sanity check on pre-flight:
- Verify `MINIMAX_GROUP_ID` env var resolves to non-empty string
- First MiniMax call routes direct (api.minimaxi.com or api.minimax.chat) with GroupId header/query param per MiniMax docs
- If direct still fails: fall back to openrouter as in §1.3g, document reason, continue (don't block probe on MiniMax routing issue — unanimous subset already has openrouter-routed MiniMax verdicts)

---

## §4 Execution

### §4.1 Call pattern

- Per NEW split instance: 4 API calls (Kimi + MiniMax + DeepSeek + Zhipu)
- Total NEW API calls: 4 × 20 = 80
- UNANIMOUS verdicts reused, zero new API calls for that subset
- Sequential OK
- Deterministic: `temperature=0.0`, matched `max_tokens`
- Retries: up to 3 on transient errors
- Kimi `max_tokens=4096` carry-over from §1.3g (addressed parse issues there)

### §4.2 Metrics per candidate

Compute on NEW split subset (20 instances):
- `parse_success`: <int>/20
- `agreement_vs_opus_count`: <int>/valid
- `agreement_vs_gpt_count`: <int>/valid
- `p_opus`, `p_gpt`: percentages
- `kappa_vs_opus`: Cohen's κ candidate-vs-Opus
- `kappa_vs_gpt`: Cohen's κ candidate-vs-GPT
- `kappa_conservative`: min(kappa_vs_opus, kappa_vs_gpt)
- `latency_p50_split`: median latency on split cases
- `latency_p95_split`: p95 latency on split cases (for N=400 cost projection)

Compute on AGGREGATE 40 (unanimous + split):
- `kappa_aggregate_vs_consensus`: κ on aggregated sample treating unanimous consensus as reference and split cases as per §2.2 dual reference with conservative min
- This combines known-high unanimous κ with discriminating split κ for holistic view

### §4.3 Per-candidate verdict (on split subset)

- κ_conservative ≥ 0.70 → PASS
- 0.60 ≤ κ_conservative < 0.70 → BORDERLINE
- κ_conservative < 0.60 → FAIL

### §4.4 Aggregate verdict

- **SPLIT_DISCRIMINATING**: spread in κ_conservative across candidates ≥ 0.15 (meaningful differentiation)
- **STILL_ALL_PASS**: all 4 κ_conservative ≥ 0.70, spread < 0.15 (tie — operational criteria determine rank)
- **PARTIAL_FAIL**: 1-3 candidates κ_conservative < 0.70 (subset passes, natural cut)
- **ALL_FAIL_ON_SPLITS**: 0 candidates κ_conservative ≥ 0.70 (swap path CLOSED)
- **INCONCLUSIVE**: parse rate < 80% on any candidate on splits; OR valid split sample size < 12 after selection

---

## §5 Scope guards

- Manifest v5 anchor `fc16925` immutable. NO v6 emission.
- HEAD `373516c` + 9 commits (including `8a2f0e6` §1.3g anchor) intact. No drift.
- §11 frozen paths untouched (runner, judge-runner, failure-mode-judge, health-check, litellm-config.yaml).
- No new LiteLLM aliases; probe bypasses proxy.
- Reuse existing Opus/GPT verdicts from full κ calibration set; NO new Opus/GPT calls.
- Modifications limited to `benchmarks/probes/judge-swap-validation/` (existing probe folder from §1.3g).

---

## §6 Deliverables

Commit na `feature/c3-v3-wrapper`:

1. `benchmarks/probes/judge-swap-validation/split-cases-sample.jsonl` — 20 new split-case instances with instance_id, cell, Opus verdict, GPT verdict, Gemini reference
2. `benchmarks/probes/judge-swap-validation/kimi-split-responses.jsonl` — 20 raw + parsed verdicts
3. `benchmarks/probes/judge-swap-validation/minimax-split-responses.jsonl` — 20 raw + parsed verdicts
4. `benchmarks/probes/judge-swap-validation/deepseek-split-responses.jsonl` — 20 raw + parsed verdicts
5. `benchmarks/probes/judge-swap-validation/zhipu-split-responses.jsonl` — 20 raw + parsed verdicts
6. `benchmarks/probes/judge-swap-validation/kappa-split-analysis.md` — per-candidate split κ matrix (κ_vs_opus, κ_vs_gpt, κ_conservative, p_opus, p_gpt balance analysis) + aggregate κ (40) + ranking by κ_conservative descending + per-candidate split verdict
7. `benchmarks/probes/judge-swap-validation/reprobe-memo.md` — ≤250 words, aggregate verdict (SPLIT_DISCRIMINATING / STILL_ALL_PASS / PARTIAL_FAIL / ALL_FAIL_ON_SPLITS / INCONCLUSIVE), final recommended primary + backup with reasoning, actual cost, wall-clock, MiniMax routing resolution (direct / openrouter / failed-back)

Existing §1.3g artefacts (`probe-script.py`, `sample-instances.jsonl`, 4× responses, `kappa-analysis.md`, `validation-memo.md`) remain unchanged. New artefacts are additive.

Anchor commit: `[probe] judge swap stratified reprobe on split cases - <aggregate_verdict>`. Parent = `8a2f0e6` (§1.3g).

---

## §7 Budget i halt criteria

- **Budget cap**: $3 (realno ~$1.50-2.50 expected: 80 calls × average $0.02)
- **Halt @ $5**: full escalation
- **Per-call timeout**: 60s (Kimi historical 32s; allow headroom)
- **Total wall-clock cap**: 60 min (setup + 80 calls + dual-κ compute + memo)

---

## §8 Halt ping format

Emit at completion:

- `aggregate_verdict: SPLIT_DISCRIMINATING | STILL_ALL_PASS | PARTIAL_FAIL | ALL_FAIL_ON_SPLITS | INCONCLUSIVE`
- Per-candidate block (all 4):
    `<candidate>_parse_success: <int>/20`
    `<candidate>_kappa_vs_opus: <float>`
    `<candidate>_kappa_vs_gpt: <float>`
    `<candidate>_kappa_conservative: <float>`
    `<candidate>_p_opus: <float>`
    `<candidate>_p_gpt: <float>`
    `<candidate>_latency_p50_split: <int>s`
    `<candidate>_latency_p95_split: <int>s`
    `<candidate>_routing_actual: direct | openrouter`
    `<candidate>_split_verdict: PASS | BORDERLINE | FAIL`
- `aggregate_kappa_40: { zhipu, deepseek, minimax, kimi }` (per candidate on combined 40)
- `ranking_by_kappa_conservative_desc: ordered list`
- `split_cases_selected: <int>/20` (actual selection count, may be < 20 if pool small)
- `recommended_primary: KIMI|MINIMAX|DEEPSEEK|ZHIPU|NONE`
- `recommended_backup: KIMI|MINIMAX|DEEPSEEK|ZHIPU|NONE`
- `minimax_routing_resolution: direct_successful | direct_failed_fell_back | openrouter_only`
- `anchor_commit: <full sha>`
- `artefact_shas: { split-sample, 4× split-responses, kappa-split-analysis, reprobe-memo }`
- `wall_clock: <duration>`
- `cost_actual: $<actual>` vs $3 cap
- `next_step_request: PM-RATIFY-JUDGE-SWAP-REPROBE`
- `cc1_state: HALTED`

CC-1 ne self-advances. Ne emituje manifest v6. Čeka PM ratifikaciju.

---

## §9 Task #29 trace update (post-reprobe)

- §1.1 ✓ §1.2 ✓ §1.3b IN_SCOPE ✓ §1.3c PASS ✓ §1.3e strict hold ✓ §1.3f INFEASIBLE ✓ §1.3g MULTI_PASS ✓ §1.3h <verdict>
- Post-§1.3h:
  - If SPLIT_DISCRIMINATING / PARTIAL_FAIL / STILL_ALL_PASS → PM emit manifest v6 swap proposal brief sa data-driven primary + backup
  - If ALL_FAIL_ON_SPLITS → swap path CLOSED; return to Google ticket waiting or Branch B prep
  - If INCONCLUSIVE → PM adjudicates: retry with larger sample, or alternate methodology

---

## §10 Authorized by

PM Marko Marković, 2026-04-24 evening. Verbatim: "ostalo se slazem pravi prompt". MINIMAX_GROUP_ID added to .env between sessions.

CC-1 may begin immediately — all prereqs in place (direct keys, GroupId, prior §1.3g artefacts on disk, gcloud tooling retained from §1.3f as permanent operational asset).
