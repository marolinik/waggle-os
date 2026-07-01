# Hive Mind — LoCoMo SOTA results index (single source of truth)

> Tracked, in-repo, reproducible. **Headline = 86.49%** (7-lane W4, N=1540, same-judge vs Memori).
> Verify: `node recount.mjs`. Supersedes the non-reproducible 87.66% (see correction note below).

**Headline:** On LoCoMo under Memori's own protocol (gpt-4.1-mini answerer + judge, N=1540),
Hive Mind = **86.49% overall, +4.54pp over Memori 81.95 (z=4.64, p<10⁻⁵)**, leading/tying every
category. Two same-judge head-to-heads anchor it (Memori + Mem0). Fully local substrate.

## Correction note (2026-07-01)
The prior headline **87.66%** (2026-06-11 report) does **not reproduce**. Fresh 7-lane W4 + fresh
judge = **85.19%** on its own archived 2026-06-11 substrate, **86.49%** on the current substrate.
Cause: stale-verdict-replay bug (harness note 2026-06-15) inflated the original judge pass; that
1350-correct judgment set is lost. Adopted 86.49% as canonical (founder decision 2026-07-01).

## The numbers (gpt-4.1-mini answerer+judge, N=1540)

### 7-lane W4 vs Memori — same-judge
| Category | Ours | Memori (pub) | Δ |
|---|--:|--:|--:|
| single-hop | 92.27 | 87.87 | +4.40 |
| multi-hop | 80.50 | 72.70 | +7.80 |
| temporal | 81.62 | 80.37 | +1.25 |
| open-ended | 69.79 | 63.54 | +6.25 |
| **overall** | **86.49** | **81.95** | **+4.54 (z=4.64, p<10⁻⁵)** |

### Mem0 — same-judge, our ruler
Ours 86.49 vs Mem0 73.96 = **+12.53pp** overall; temporal 81.62 vs 50.78 = **+30.84pp**
(write-time dating vs ingestion-time). Mem0 judgments 1139/1540 committed.

### Token efficiency
Prior Config-D knee (−28% tokens for ~−1pp) was measured on an earlier answer set — **re-measure
on the current substrate before re-citing**. Do not carry the old 87.66-anchored Pareto numbers.

## Where everything lives

### Committed + reproducible in THIS monorepo
- `benchmarks/results/locomo-sota-2026-06/` — **this dir**: report + INDEX + `recount.mjs` +
  `data/{answers,judgments}/…N1540.jsonl` (the pinned raw evidence, recount = 1332/1540).
- Substrate code: `packages/hive-mind-core/src/mind/{inprocess-reranker,search,resolve-relative-date,parse-date-window,raw-detail-lane,recall-context}.ts`.

### Reproduction harness (`hive-mind-test/scripts/locomo`)
`40-cell-retrieval-gpt41mini.mjs` (7-lane: PROFILES/DATEWIN/EPISODIC/RAWDETAIL), `41-judge-memori-gpt41mini.mjs`,
`42-report-memori.mjs`. **Always fresh `OUT_TAG`** to avoid stale-verdict replay.

### OSS public (`marolinik/hive-mind`)
Substrate code @ `bc4eba1` (PR #14). Benchmark results being updated 73.1% → 86.49% (this arc).

## Gotchas (cost real time)
- **Stale-verdict replay:** `41-judge` resumes by row count on the OUT_FILE → reusing a judgments
  file replays old verdicts. This inflated 87.66. Use a fresh `OUT_TAG` every run.
- `42-report` tokens/query line is a display bug; real tokens = `context_tokens` in answer rows.
- Mem0 shares `~/.mem0/migrations_qdrant` lock → run per-conv.
- Zep + LangMem stay literature-sourced (founder 2026-06-16).
