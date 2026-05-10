# Manifest v6 κ Re-Calibration Analysis

**Date:** 2026-04-24  **Parent:** `38a830e` (v6 Phase 1 Commit 2)  **v6 anchor:** `60d061e`

**Sample:** 100 instances from `benchmarks/results/locomo-mini-n20-retry-2026-04-24T00-02-12Z.jsonl` (authoritative v5 κ set; zero new Opus/GPT calls).

**MiniMax verdicts:** 100 calls via OpenRouter `minimax/minimax-m2.7` (v6 alias: `minimax-m27-via-openrouter`); direct HTTP probe (LiteLLM proxy not in loop — isolates model behavior from middleware).

**Prompt:** verbatim `failure-mode-judge.ts:245-258` (same as §1.3g / §1.3h / §1.3h-C).
**Parameters:** `temperature=0.0`, `max_tokens=4096`.

---

## §1 Three pairwise Cohen's κ

| Pair | n | Agree | Raw % | κ |
|------|---|-------|-------|-----|
| Opus vs GPT | 100 | 93 | 93.00% | **0.8480** |
| Opus vs MiniMax | 100 | 93 | 93.00% | **0.8549** |
| GPT vs MiniMax | 100 | 90 | 90.00% | **0.7878** |

**Conservative trio κ = min = 0.7878**

## §2 Verdict: **PASS**

Per v6 §5.4 gate criteria:
- `κ_trio ≥ 0.70` → PASS, halt with PM-RATIFY-V6-KAPPA
- `0.60 ≤ κ_trio < 0.70` → BORDERLINE, halt with PM adjudication
- `κ_trio < 0.60` → FAIL, halt with swap-path-re-evaluation

---

## §3 Confusion matrices

### Opus vs GPT

| | GPT=correct | GPT=incorrect |
|---|---|---|
| **Opus=correct** | 32 | 7 |
| **Opus=incorrect** | 0 | 61 |

### Opus vs MiniMax

| | MiniMax=correct | MiniMax=incorrect |
|---|---|---|
| **Opus=correct** | 37 | 2 |
| **Opus=incorrect** | 5 | 56 |

### GPT vs MiniMax

| | MiniMax=correct | MiniMax=incorrect |
|---|---|---|
| **GPT=correct** | 32 | 0 |
| **GPT=incorrect** | 10 | 58 |

---

## §4 Per-cell κ breakdown (n=20 per cell)

| Cell | n | MiniMax parsed | κ(Opus,GPT) | κ(Opus,MiniMax) | κ(GPT,MiniMax) |
|------|---|-----------------|----------------|-------------------|------------------|
| no-context | 20 | 20 | 1.0000 | 1.0000 | 1.0000 |
| oracle-context | 20 | 20 | 0.7059 | 0.7917 | 0.7059 |
| full-context | 20 | 20 | 0.8000 | 0.7000 | 0.7059 |
| retrieval | 20 | 20 | 1.0000 | 0.8936 | 0.8936 |
| agentic | 20 | 20 | 0.7826 | 0.8980 | 0.6875 |

---

## §5 MiniMax operational metrics

- Calls: 100 total, parsed OK: **100/100 (100.0%)**
- Routing errors (non-200 HTTP): **0/100** (0.0%)
- Total retries: 0
- Latency p50: **11.9 s**  |  p95: **31.4 s**
- Token usage: prompt = 53,855, completion = 48,920
- Cost actual (OR MiniMax pricing $0.30/$1.20 per 1M): **~$0.0749**

Per brief §3.5 operational hedge thresholds:
- parse ≥95/100 target: **MET** — actual 100/100
- parse ≥90/100 halt: **MET** — actual 100/100
- latency p50 ≤25s: **MET** — actual 11.9s
- OR routing errors <5%: **MET** — actual 0.0%

---

## §6 Comparison to v5 historical baseline

v5 κ baseline reference: Fleiss' κ=0.7458 on three-way Opus+GPT+Gemini ensemble.
v6 κ(Opus, GPT) pairwise: **0.8480** — sanity check. If significantly different from v5 baseline range (~0.74-0.82 for a high-agreement pair), investigate.
v6 conservative trio κ (Opus+GPT+MiniMax): **0.7878**.