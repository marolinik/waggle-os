# LoCoMo Memory-SOTA — canonical evidence (June 2026, W3.3)

**Headline (defensible, same-judge):** On LoCoMo under Memori's own published protocol
(GPT-4.1-mini answerer **and** judge, Memori's verbatim "be generous" `ACCURACY_PROMPT`,
natural full distribution, N=1,540), the Hive Mind substrate scores **87.66% overall
(1,350/1,540), +5.71pp over Memori's 81.95%** (one-sample z=4.42, p<10⁻⁵), leading every
category. A second same-judge head-to-head re-runs **Mem0** on the identical ruler:
**87.66% vs 73.96% (+13.70pp overall; temporal +32.71pp)**.

This directory is the **committed, in-repo home** of that claim's reports, so the SOTA
result travels with the product monorepo. It previously lived only on local disk plus the
`hive-mind-test` side repo — see [`docs/analysis/locomo-sota-evidence-drift-2026-06-30.md`](../../../docs/analysis/locomo-sota-evidence-drift-2026-06-30.md)
for why, and the structural fix.

## Contents
| File | What |
|---|---|
| `LOCOMO-SOTA-87.66-W3.3-vs-Memori.md` | Primary head-to-head report (per-category + tokens/query). |
| `LOCOMO-backlog-closeout-Mem0-tokenPareto.md` | Mem0 same-judge re-run + token-Pareto (Config D knee). |
| `INDEX.md` | Single-source-of-truth index: every number + where each artifact lives. |

## Per-category (W3.3, N=1,540, GPT-4.1-mini answerer+judge)
| Category | Ours | Memori (pub) | Δ | n |
|---|--:|--:|--:|--:|
| single-hop | 92.75 | 87.87 | +4.88 | 841 |
| multi-hop | 82.98 | 72.70 | +10.28 | 282 |
| temporal | 83.49 | 80.37 | +3.12 | 321 |
| open-ended | 70.83 | 63.54 | +7.29 | 96 |
| **overall** | **87.66** | **81.95** | **+5.71** | 1540 |
| tokens/q | 3747 | 1294 | — | — |

Memori baseline reproduced first on our own harness: nb02 = **81.98** vs Memori published 81.95
(ruler validated before claiming the lift).

## Substrate code that produces this (in this monorepo)
All under `packages/hive-mind-core/src/mind/`:
- `inprocess-reranker.ts` — cross-encoder rerank (reverse-ported from the OSS mirror in `f47ee8f`, 2026-06-11).
- `search.ts` — HybridSearch with `reranker` / `rerankPoolSize` options.
- `resolve-relative-date.ts` + `parse-date-window.ts` — **write-time temporal dating** (the +32.7pp temporal lever vs ingestion-time stamping).
- `raw-detail-lane.ts` — raw-turn lane (drives single-hop).
- `recall-context.ts` — recall assembly.

## Reproduction — raw answers/judgments are NOT in this product repo (they're large)
Raw per-question answers + judge verdicts (~3.8 MB for the Memori head-to-head; more with
Mem0/PACK variants) live in:
- **`hive-mind-test`** @ `05f2146` — `scripts/locomo/data/{answers,judgments}/`
- **OSS `marolinik/hive-mind`** — `benchmarks/locomo/` (public release set)

To re-run a cell (in `hive-mind-test/scripts/locomo`):
```
node --env-file=../../.env.locomo-trio 40-cell-retrieval-gpt41mini.mjs \
  PROMPT_MODE=ours PROFILES=1 DATEWIN=1 EPISODIC=1 RAWDETAIL=1     # + PACK=1 BODY_CAP=... for packing
node ... 41-judge      # Memori verbatim ACCURACY_PROMPT, gpt-4.1-mini
node ... 42-report     # NOTE: tokens/query line is a DISPLAY BUG; real tokens = context_tokens in answer rows
```
Free token measurement: add `--measure --slice=N` (no LLM spend).

## Provenance / decisions
- **Zep + LangMem stay literature-sourced** (founder decision 2026-06-16): Zep = hosted-cloud / no key;
  pip `langmem` 0.0.30 ≠ the SDK that produced its LoCoMo baseline.
- These files are git-tracked via a `.gitignore` **negation exception** (the folder is otherwise
  swallowed by `**/benchmarks/results/*`). Do **not** remove that exception — that swallow is exactly
  what hid this evidence from the repo for two weeks.
