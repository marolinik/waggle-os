# LoCoMo Memory-SOTA — canonical evidence (86.49%, reproducible + pinned)

**Headline (defensible, same-judge, reproducible):** On LoCoMo under Memori's own published
protocol (gpt-4.1-mini answerer **and** judge, verbatim "be generous" ACCURACY_PROMPT, natural
full distribution, N=1,540), the Hive Mind 7-lane W4 substrate scores **86.49% overall
(1,332/1,540), +4.54pp over Memori's 81.95%** (one-sample z=4.64, p<10⁻⁵), leading every category.
Verify offline with `node recount.mjs`.

> **Supersedes the 87.66% claim.** 87.66% was the 2026-06-11 report; it does not reproduce on a
> fresh judge pass (85.19% on its own archived substrate, 86.49% on the current one) and was
> inflated by the stale-verdict-replay bug the harness documented on 2026-06-15. 86.49% is the
> honest, fresh, substrate-pinned number. Full story:
> `docs/analysis/locomo-87.66-vs-85.26-integrity-2026-06-30.md`.

## Contents
| File | What |
|---|---|
| `LOCOMO-SOTA-86.49-vs-Memori.md` | Canonical report — Memori head-to-head + Mem0 + reproduction. |
| `recount.mjs` | Offline verification (zero API): recounts the judgments → 1332/1540 = 86.49%. |
| `INDEX.md` | Single-source-of-truth index: every number + where each artifact lives. |
| `data/answers/…N1540.jsonl` | The 7-lane W4 per-question answers (raw_detail≈16, importance≈4.5). |
| `data/judgments/…N1540.jsonl` | The per-question judge verdicts — recount source of the 86.49%. |

## Per-category (7-lane W4, N=1,540, gpt-4.1-mini answerer+judge)
| Category | Ours | Memori (pub) | Δ | n |
|---|--:|--:|--:|--:|
| single-hop | 92.27 | 87.87 | +4.40 | 841 |
| multi-hop | 80.50 | 72.70 | +7.80 | 282 |
| temporal | 81.62 | 80.37 | +1.25 | 321 |
| open-ended | 69.79 | 63.54 | +6.25 | 96 |
| **overall** | **86.49** | **81.95** | **+4.54** | 1540 |

vs Mem0 (same-judge, our ruler): **86.49 vs 73.96, +12.53pp overall; temporal +30.84pp.**

## Substrate code that produces this (in this monorepo)
All under `packages/hive-mind-core/src/mind/`: `inprocess-reranker.ts`, `search.ts` (reranker
wiring), `resolve-relative-date.ts` + `parse-date-window.ts` (write-time temporal dating),
`raw-detail-lane.ts`, `recall-context.ts`. 7 lanes = distilled + semantic + importance-K5 +
episodic + profiles + date-window + raw-detail (CE-reranked).

## Reproduce
- **Offline (zero API):** `node recount.mjs` → asserts 1332/1540 per-category.
- **Full regen** (in `hive-mind-test/scripts/locomo`):
  `PROMPT_MODE=ours PROFILES=1 DATEWIN=1 EPISODIC=1 RAWDETAIL=1 OUT_TAG=<fresh> node 40-cell-retrieval-gpt41mini.mjs`
  → `41-judge --in=…-<fresh>.jsonl`. **Use a fresh `OUT_TAG`** (reusing a judgments file replays
  stale verdicts — that is what produced the bogus 87.66).

## Why this directory exists
The 86.49% claim previously lived only on local disk (git-ignored by `**/benchmarks/results/*`) +
the throwaway `hive-mind-test` repo, and its *number* had drifted from its *evidence*. This dir
pins report + answers + judgments + a recount check together, git-tracked via a `.gitignore`
negation exception. Do **not** remove that exception.
