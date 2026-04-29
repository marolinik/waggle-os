# §1.3g Judge Swap κ Analysis (4-Candidate Roster)

**Date:** 2026-04-24 · **Sample:** N=20 stratified 4-per-cell from Stage 2-Retry κ-calibration set.

**Consensus reference:** Opus 4.7 + GPT-5.4 agreement.

**Opus≠GPT splits (excluded from κ):** **0 / 20**

**Consensus subset size (denominator for κ):** **20 / 20**


## Per-candidate results (ranked by κ descending)

| Rank | Candidate | Model ID | Routing | κ | Raw agreement | n compared | Parse OK / 20 | Verdict |
|------|-----------|----------|---------|-----|---------------|------------|----------------|---------|
| 1 | kimi | `kimi-k2.6` | direct | **1.0000** | 100.00% (20/20) | 20 | 20/20 | **PASS (excellent)** |
| 2 | minimax | `minimax/minimax-m2.7` | openrouter | **1.0000** | 100.00% (20/20) | 20 | 20/20 | **PASS (excellent)** |
| 3 | deepseek | `deepseek-v4-pro` | direct | **1.0000** | 100.00% (18/18) | 18 | 18/20 | **PASS (excellent)** |
| 4 | zhipu | `glm-5.1` | direct | **1.0000** | 100.00% (19/19) | 19 | 19/20 | **PASS (excellent)** |

## Aggregate verdict: **MULTI_PASS**
- PASS (κ ≥ 0.70): **4**
- BORDERLINE (0.60 ≤ κ < 0.70): **0**
- FAIL (κ < 0.60): **0**
- INCONCLUSIVE (parse < 18/20): **0**

### Sample-selection caveat (transparent)

Full 100-row κ-calibration set has 7/100 = **7% Opus-GPT split rate**.
Our 20-instance deterministic first-4-per-cell sample caught **0/20
splits** — consistent with binomial variance at low end but signals
selection bias toward "easier" instances where the two primary judges
already agree. κ = 1.0 on all 4 candidates should be read as "all
candidates match the consensus on a biased subset", not "all candidates
match Opus+GPT on arbitrary LoCoMo instances". Recommended follow-up
(Task 2.6): stratified-on-split re-probe at N=40-60 with split-inclusion
oversampling to derive κ values that discriminate among the 4.

### Secondary criteria (tie-break at κ=1.0)

| Cand | Parse OK/20 | p50 latency | p95 latency | avg out tokens | retries | routing |
|------|-------------|-------------|-------------|----------------|---------|---------|
| zhipu | 19/20 | 9 s | 22 s | 357 | 0 | direct (api.z.ai) |
| minimax | 20/20 | 12 s | 28 s | 483 | 0 | openrouter |
| deepseek | 18/20 | 12 s | 29 s | 465 | 0 | direct (api.deepseek.com) |
| kimi | 20/20 | **32 s** | **110 s** | 1002 (near cap) | 4 | direct (api.moonshot.ai) |

**Revised ranking by secondary criteria** (κ tie-break via speed ×
parse-reliability × direct-routing):

1. **Zhipu GLM-5.1** — fastest p50 (9 s), direct, 19/20 parse. Best
   operational profile for N=400 (Stage 3 × 5 cells × ~1 judge triple ⇒
   ~2000 Gemini-replacement calls at ~9 s each ≈ 5 hr judge-thread
   wall-clock).
2. **DeepSeek V4-Pro** — direct, 18/20 parse, clean retries.
3. **MiniMax M2.7 (via OR)** — 20/20 parse but OpenRouter fallback =
   extra dependency.
4. **Kimi k2.6** — 20/20 parse but 3.5× slower than Zhipu; N=400 judge
   thread would be >20 hr on Kimi's p50. Operational deal-breaker for
   Stage 3 timeline.

**Revised recommended primary:** **ZHIPU**
**Revised recommended backup:** **DEEPSEEK**

Marko's original preference (Kimi/MiniMax) preserved as 3rd/4th picks —
both PASS κ-wise but lose on speed (Kimi) or routing-stack (MiniMax).
PM adjudicates final pick at manifest v6 brief time.

## Per-cell breakdown (top-2 by κ)

### kimi (kimi-k2.6)
| Cell | n | Agree | Raw % |
|------|---|-------|-------|
| agentic | 4 | 4 | 100% |
| full-context | 4 | 4 | 100% |
| no-context | 4 | 4 | 100% |
| oracle-context | 4 | 4 | 100% |
| retrieval | 4 | 4 | 100% |

### minimax (minimax/minimax-m2.7)
| Cell | n | Agree | Raw % |
|------|---|-------|-------|
| agentic | 4 | 4 | 100% |
| full-context | 4 | 4 | 100% |
| no-context | 4 | 4 | 100% |
| oracle-context | 4 | 4 | 100% |
| retrieval | 4 | 4 | 100% |
