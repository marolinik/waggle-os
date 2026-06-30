<!--
CANONICAL LoCoMo SOTA evidence — committed copy (verbatim).
Source: hive-mind-test repo, scripts/RESULT-memori-ours-2026-06-11T01-01-10-434Z.md,
committed at 05f2146 (2026-06-16). Reproduced here verbatim so the headline claim travels
with the product monorepo. Raw answers/judgments (~3.8 MB) live in that repo (and the OSS
mirror); see ./README.md → Reproduction. Headline: 87.66% overall (1350/1540), +5.71pp over
Memori 81.95 (z=4.42, p<10^-5), same answerer+judge.
-->

# LoCoMo Memori Head-to-Head — 2026-06-11T01:01:10.435Z

**Our substrate's answers on Memori's exact ruler.** Subject = gpt-4.1-mini, judge = gpt-4.1-mini + Memori's verbatim "be generous" ACCURACY_PROMPT, natural full-N distribution, overall = count-weighted micro-average. Retrieval substrate byte-for-byte unchanged (recon-B substrate-unchanged invariant). Answerer-prompt variant: `ours` (a=ours / b=theirs).

Memori reference: Table 1 (single 87.87 / multi 72.70 / open 63.54 / temporal 80.37 / **overall 81.95** ; tokens/query 1294).

Category mix (n from data): single-hop=841 / multi-hop=282 / temporal=321 / open-ended=96 — total N=1540.

## Head-to-head vs Memori Table 1

| Category | Memori (Table 1) | **Our substrate** (gpt-4.1-mini) | Δ vs Memori | n |
|---|--:|--:|--:|--:|
| single-hop | 87.87 | **92.75%** (780/841) | +4.88pp | 841 |
| multi-hop | 72.7 | **82.98%** (234/282) | +10.28pp | 282 |
| temporal | 80.37 | **83.49%** (268/321) | +3.12pp | 321 |
| open-ended | 63.54 | **70.83%** (68/96) | +7.29pp | 96 |
| **Overall** (count-weighted) | **81.95** | **87.66%** (1350/1540) | **+5.71pp** | 1540 |

## Tokens/query (context-only, vs Memori 1294)

- avg context_tokens: **3747** (+2453 vs 1294)
- p50 context_tokens: **3702**
- counted over 1540/1540 rows.

### Statistical / weighting context

- Overall = pooled correct/n across categories (micro-average) = Memori's count-weighted overall under the natural sample. Sanity: `(n_single·single + n_multi·multi + n_temporal·temporal + n_open·open)/N`.
- Per-category n is unequal (from data): single-hop=841 / multi-hop=282 / temporal=321 / open-ended=96. Read per-category Δ against each category's own n, not an equal-N CI.
- Parse failures (judge verdict null) are excluded from correct but counted in n only if present as rows; check the judge log for the parse-failure count.

---
Inputs: `D:\Projects\hive-mind-test\scripts\locomo\data\judgments\memori-gpt41mini-ours-judgments.jsonl`
Answers: `D:\Projects\hive-mind-test\scripts\locomo\data\answers\cell-retrieval-memori-gpt41mini-ours.jsonl`
Prompt mode: ours (a=our synthesis prompt / b=Memori ANSWER_PROMPT). Disclose in the result doc.
