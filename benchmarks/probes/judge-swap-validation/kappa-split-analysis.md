# §1.3h Judge Swap Stratified Re-Probe — Dual-κ Split Analysis

**Date:** 2026-04-24 (evening)  **Parent commit:** `8a2f0e6` (§1.3g anchor)
**Source:** `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl` (100 rows, authoritative).

**Split pool (Opus ≠ GPT):** **7** instances (use-all-available per PM amendment §1.3H-POOL-SHORTAGE OPTION 1).
**Split cell distribution:** `agentic=2`, `full-context=2`, `oracle-context=3`, `no-context=0`, `retrieval=0`.
**Structural observation:** All 7 splits have `Opus=correct / GPT=incorrect`. Zero inverse splits.

**PM-amended verdict caveat:** n=7 < 12 minimum for meaningful discrimination. All findings carry `n=7 pool-limited, observational not confirmatory` caveat. Primary value = operational signal (parse + latency + MiniMax routing) + bias detection via p_opus/p_gpt balance.

---

## §1 Per-candidate split metrics

| Cand | Parse | n_eval | p_opus | p_gpt | κ_vs_opus | κ_vs_gpt | κ_cons | p50 lat | p95 lat | Routing | Split verdict |
|------|-------|--------|--------|-------|-----------|----------|--------|---------|---------|---------|---------------|
| kimi | 5/7 (71.4%) | 5 | 80.0% (4/5) | 20.0% (1/5) | 0.0 deg | 0.0 deg | **N/A deg** | 32.0 s | 51.0 s | `direct` | **N/A deg** |
| minimax | 7/7 (100.0%) | 7 | 85.7% (6/7) | 14.3% (1/7) | 0.0 deg | 0.0 deg | **N/A deg** | 16.6 s | 21.2 s | `openrouter` | **N/A deg** |
| deepseek | 5/7 (71.4%) | 5 | 40.0% (2/5) | 60.0% (3/5) | 0.0 deg | 0.0 deg | **N/A deg** | 15.4 s | 21.2 s | `direct` | **N/A deg** |
| zhipu | 6/7 (85.7%) | 6 | 0.0% (0/6) | 100.0% (6/6) | 0.0 deg | 1.0 deg | **N/A deg** | 17.9 s | 22.5 s | `direct` | **N/A deg** |

### §1.1 Why κ on split-only is mathematically degenerate

All 7 splits are `Opus=correct / GPT=incorrect`. For a Cohen's κ on the split subset:
- `κ_vs_opus`: reference (Opus) has zero variance → ref_counts has single class → p_e = p_o → κ = (0 − 0)/(1 − 1) undefined → reported as `0.0 deg`
- `κ_vs_gpt`: same pathology → `0.0 deg` (except Zhipu, which perfectly matches GPT → `κ = 1.0 deg` by convention when `p_o = p_e = 1`)

**κ_cons = min() of two degenerate values is itself degenerate.** The informative signal on splits is NOT κ, it is the **p_opus / p_gpt balance** which reveals each candidate's calibration bias. The brief's κ-threshold classification (PASS/BORDERLINE/FAIL @ 0.70/0.60) does not apply to this structural case.

### §1.2 BIAS INTERPRETATION (actionable)

Since all splits are Opus=correct / GPT=incorrect:

- `p_opus=100%` = candidate lock-stepped with Opus (maximally lenient, adds no new signal vs Opus)
- `p_gpt=100%` = candidate lock-stepped with GPT (maximally strict, adds no new signal vs GPT)
- `p_opus ≈ p_gpt ≈ 50%` = candidate judges independently (ideal for 3-judge ensemble)

| Cand | p_opus | p_gpt | Calibration profile |
|------|--------|-------|----------------------|
| **DeepSeek** | 40% | 60% | **Most balanced — slight GPT lean, clearest independent judgment** |
| Kimi | 80% | 20% | Opus-lenient (echoes Opus 4/5 times) |
| MiniMax | 86% | 14% | Strongly Opus-lenient (echoes Opus 6/7 times) |
| Zhipu | **0%** | **100%** | **Pure GPT-echo — 6/6 parsed splits = GPT verbatim** |

**This is the critical finding the §1.3g probe could not produce.** On the 20 unanimous cases, all 4 candidates scored κ=1.0 — appeared equivalent. On split cases where judges diverge, DeepSeek uniquely exhibits independent calibration; Zhipu is effectively a GPT echo; Kimi/MiniMax echo Opus. For a 3-judge ensemble replacing Gemini, **independence from existing judges is a feature**, not a bug.

---

## §2 Aggregate κ on combined sample (27 = 20 unanimous + 7 splits)

Unanimous portion reuses §1.3g verdicts (consensus-matched, contributes κ=1.0 content). Split portion uses dual-reference with conservative min. Combined sample is non-degenerate (both classes present in Opus and GPT reference columns on the aggregate).

| Cand | n_combined | κ_agg_vs_opus | κ_agg_vs_gpt | κ_agg_cons | Aggregate verdict |
|------|------------|----------------|---------------|-------------|---------------------|
| **deepseek** | 23 | 0.7089 | 0.7473 | **0.7089** | **PASS (only one ≥ 0.70)** |
| kimi | 25 | 0.9110 | 0.5763 | **0.5763** | FAIL (κ_vs_gpt < 0.70) |
| minimax | 27 | 0.9222 | 0.4564 | **0.4564** | FAIL (κ_vs_gpt < 0.70) |
| zhipu | 25 | 0.4444 | 1.0000 | **0.4444** | FAIL (κ_vs_opus < 0.70) |

**Aggregate κ ranking (descending):** `deepseek, kimi, minimax, zhipu`

The aggregate picture inverts the split-only one: DeepSeek is the only candidate clearing 0.70 on the conservative dual-reference combined sample. Zhipu's perfect κ_vs_gpt is offset by its ~0.44 κ_vs_opus — clear asymmetry consistent with the bias finding.

---

## §3 Operational snapshot (split-case specific)

| Cand | Split parse | p50 (split) | p95 (split) | Routing | MiniMax status |
|------|-------------|-------------|-------------|---------|-------------------|
| kimi | 5/7 (71%) | 32.0 s | 51.0 s | direct | — |
| minimax | 7/7 (100%) | 16.6 s | 21.2 s | **openrouter** | **direct FAILED — international 401/err + legacy 401/err** |
| deepseek | 5/7 (71%) | 15.4 s | 21.2 s | direct | — |
| zhipu | 6/7 (86%) | 17.9 s | 22.5 s | direct | — |

### §3.1 MiniMax direct routing verdict

**Primary operational value focus per PM amendment.** Result:

- `direct_international` (`https://api.minimaxi.com/v1/text/chatcompletion_v2?GroupId=...`) — FAILED
- `direct_legacy` (`https://api.minimax.chat/v1/text/chatcompletion_v2?GroupId=...`) — FAILED
- `openrouter` fallback — SUCCEEDED (7/7 parse)

**Routing resolution: `direct_failed_fell_back_openrouter`.** The newly-added `MINIMAX_GROUP_ID` did not unblock direct routing. Either the key is not provisioned for v2 endpoints, the endpoint paths / model names need further research (e.g. raw v1 `chatcompletion_pro` format differs from OpenAI-compatible v2), or the account tier lacks direct API access. **Manifest v6 must route MiniMax via OpenRouter if MiniMax is selected** — direct routing is not a viable assumption.

### §3.2 Parse rate on challenging vs unanimous (regression check)

| Cand | Unanimous parse (§1.3g) | Split parse (§1.3h) | Δ |
|------|--------------------------|-----------------------|---|
| kimi | 20/20 (100%) | 5/7 (71%) | **−29 pp** (2 timeout-retries exhausted on long-context instances) |
| minimax | 20/20 (100%) | 7/7 (100%) | 0 pp |
| deepseek | 18/20 (90%) | 5/7 (71%) | **−19 pp** (2 verdict=None — likely malformed JSON or over-length) |
| zhipu | 19/20 (95%) | 6/7 (86%) | −9 pp |

Challenging cases expose degradation in Kimi and DeepSeek parse reliability. Zhipu and MiniMax (via OR) hold up best on difficult instances.

---

## §4 Aggregate verdict: **INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL**

**Per PM-amended §4.4.** Reasons (any single one triggers):
1. Split pool n=7 < 12 minimum for confirmatory κ discrimination
2. Parse rate <80% on 2 candidates (Kimi, DeepSeek) on split subset
3. Split-only κ is mathematically degenerate (structural Opus=correct / GPT=incorrect orientation)

However, three **operational-signal findings** are fully actionable:

- **A. Bias profile (novel finding):** DeepSeek is the only candidate with independent calibration. Zhipu is a GPT-echo (0% agreement with Opus on splits). MiniMax/Kimi are Opus-echoes.
- **B. Aggregate κ on combined 27:** DeepSeek is the only candidate κ_cons ≥ 0.70 on the non-degenerate combined sample.
- **C. MiniMax direct routing FAILED** even with MINIMAX_GROUP_ID. Manifest v6 cannot rely on direct; OpenRouter fallback is the operational truth.

---

## §5 Revised recommendation (integrating §1.3g + §1.3h)

**The §1.3g heuristic-based recommendation (Zhipu primary, DeepSeek backup) is not supported by §1.3h findings.**

### §5.1 Two viable paths, each with a clear trade-off

**Path 1 — Independence priority (DeepSeek primary):**
- Pros: Only candidate with balanced independent calibration (p_opus=40%, p_gpt=60%); only one clearing κ_agg_cons ≥ 0.70 on combined 27; direct routing works.
- Cons: Split parse rate 71% (2/7 NULL verdicts) — operational risk for N=400 unless root cause of parse drops on hard cases is addressed (likely `max_tokens=1024` ceiling being hit on reasoning chains, same pathology as Kimi; could be fixed by bumping to 2048/4096).
- Mitigation: Boost `max_tokens` to 2048+ for DeepSeek on judge role; re-verify parse rate on a follow-up probe if PM accepts this path.

**Path 2 — Reliability priority (Zhipu primary, MiniMax-via-OR backup):**
- Pros: Zhipu fastest p50 (9s from §1.3g, 18s on splits) + direct routing + parse 86% on splits; MiniMax 100% parse via OR.
- Cons: Zhipu is effectively a GPT-echo (0% independence on splits) — adds minimal new signal to an Opus+GPT+GPT-echo ensemble. Ensemble's value is correlated, not complementary; `κ(Gemini-replacement, GPT) ≈ 1.0` violates the independence assumption that motivated having a third judge in the first place.

### §5.2 PM adjudication required

**Recommended PM pick based on §1.3h empirical data:**

- **Primary: DEEPSEEK** with `max_tokens=2048` bump (independence > 80% parse in a 3-judge ensemble where the third judge's role is adding new information)
- **Backup: ZHIPU** (if parse-reliability becomes binding, accept the independence compromise; it's better than no third judge)

**Alternative if PM prefers §1.3g-style operational-first ranking:**

- Primary: ZHIPU (parse + speed + direct), Backup: DEEPSEEK-boosted (independence insurance if Zhipu ensemble correlation becomes a problem at N=400)

**If PM wants to fix the unknowns before committing:**

- Run a mini-confirmation probe: DeepSeek with `max_tokens=2048` on the same 7 splits + 13 additional split-candidates from a larger calibration pool (if one is built). Cost ~$0.50.

---

## §6 Halt ping data (machine-readable summary)

- `aggregate_verdict`: **INCONCLUSIVE_BUT_OPERATIONAL_SIGNAL**
- `ranking_by_k_agg_cons_desc`: deepseek (0.709), kimi (0.576), minimax (0.456), zhipu (0.444)
- `ranking_by_p_opus_balance`: deepseek (best: 40/60), kimi (80/20), minimax (86/14), zhipu (worst: 0/100)
- `recommended_primary` (empirical): **DEEPSEEK** (with max_tokens bump) — supersedes §1.3g Zhipu pick
- `recommended_primary` (operational-first, if PM prefers): **ZHIPU** with independence caveat
- `recommended_backup`: **ZHIPU** or **DEEPSEEK-boosted** (mirror of primary choice)
- `minimax_routing_resolution`: **direct_failed_fell_back_openrouter**
- `split_cases_selected`: 7/7 (all available from 100-row authoritative source)
- `empirical_finding_novel`: Zhipu 100% GPT-lock-step on splits → low independence from existing GPT judge

Raw summary also saved to `_summary-split.json`.
