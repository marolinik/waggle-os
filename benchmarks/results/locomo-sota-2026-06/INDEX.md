# Hive Mind — LoCoMo SOTA results index (single source of truth)

> Tracked, in-repo copy of the canonical SOTA index (previously only at
> `~/.claude/projects/D--Projects-waggle-os/memory/project_sota_results_index.md`, untracked).
> Load this first when resuming the paper/article. All headline numbers verified 2026-06-16.

**Headline (defensible, same-judge):** On LoCoMo under Memori's own protocol (GPT-4.1-mini
answerer + judge, N=1540), Hive Mind = **87.66% overall, +5.71pp over Memori 81.95
(z=4.42, p<10⁻⁵)**, leading/tying every category. Two same-judge head-to-heads anchor it
(Memori + Mem0). Fully local substrate. OSS-public substrate code.

## The numbers (all GPT-4.1-mini answerer+judge, N=1540 unless noted)

### Final config (W3.3) vs Memori — same-judge
| Category | Ours (W3.3) | Memori (pub) | Δ |
|---|--:|--:|--:|
| single-hop | 92.75 | 87.87 | +4.88 |
| multi-hop | 82.98 | 72.70 | +10.28 |
| temporal | 83.49 | 80.37 | +3.12 |
| open-ended | 70.83 | 63.54 | +7.29 |
| **overall** | **87.66** | **81.95** | **+5.71 (z=4.42, p<10⁻⁵)** |
| tokens/q | 3747 | 1294 | — |
Reproduced Memori's own pipeline first: our nb02 = 81.98 vs their published 81.95.

### Competitor re-run — Mem0 on OUR ruler (same answerer+judge) [2026-06-16]
| Category | Ours | Mem0 (same-judge) | Δ |
|---|--:|--:|--:|
| single | 92.75 | 83.59 | +9.16 |
| multi | 82.98 | 74.82 | +8.16 |
| temporal | 83.49 | **50.78** | **+32.71** |
| open | 70.83 | 64.58 | +6.25 |
| **overall** | **87.66** | **73.96** | **+13.70** |
Lead every category; temporal landslide = write-time dating vs Mem0 ingestion-time stamping.

### Token efficiency — measured Pareto (PACK packing) [2026-06-16]
| Config | tok/q | overall | note |
|---|--:|--:|---|
| baseline W3.3 | 3747 | 87.66 | SOTA |
| **Config D (best knee)** | **2694 (−28%)** | **85.32 (−2.3pp)** | still +3.37 over Memori |
| Config C (≤Memori budget) | 1518 (−59%) | 76.62 (−11pp) | too aggressive |
Honest claim = "−28% at near-iso; matching Memori's 1,294 budget costs ~11pp."

### Corrected literature field (founder decision 2026-06-16)
Memori's Table-1 baselines were column-scrambled vs source (Du et al./MemR3). Zep + LangMem
stay literature-sourced: Zep = hosted-cloud/no-key; pip `langmem` 0.0.30 ≠ its LoCoMo baseline SDK.

### Cross-check — LongMemEval (guard, not a 2nd SOTA claim)
W4 recall path = 65.3% trio-strict (N=101) vs pre-W4 full-method 68.3% — within noise, no
regression. 75.2% blend remains best LME config (orthogonal to W4).

## Where everything lives

### Committed in THIS monorepo (waggle-os)
- `benchmarks/results/locomo-sota-2026-06/` — **this directory** (reports + index + README recipe).
- `docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex` (+ `.docx` paper + briefing) — arXiv draft (87.66 headline).
- `docs/methodology.md` §0 — canonical 87.66 headline. `docs/WAGGLE-CORNERSTONE.md` — claim.
- Substrate code: `packages/hive-mind-core/src/mind/{inprocess-reranker,search,resolve-relative-date,parse-date-window,raw-detail-lane,recall-context}.ts`.

### Raw benchmark evidence (`hive-mind-test`, master @ `05f2146`, pushed)
- `scripts/RESULT-memori-ours-2026-06-11T01-01-10-434Z.md` — primary head-to-head (87.66).
- `scripts/locomo/RESULT-backlog-closeout-2026-06-15.md` — Mem0 + token Pareto.
- Answers/judgments: `scripts/locomo/data/{answers,judgments}/` (memori ours/theirs, mem0, packc/packd).
- Harness: `scripts/locomo/40-cell-retrieval-gpt41mini.mjs` (+ `--measure`/`OUT_TAG`/`PACK`), `41-judge`, `42-report`, `mem0-runner.py`.

### OSS public (`marolinik/hive-mind`)
- Substrate code @ `bc4eba1` (PR #14): raw-detail-lane, inprocess-reranker, resolve-relative-date,
  parse-date-window, raw-turns, extract-memory-lanes, recall-context; CI green, 654/654.
- ⚠️ **As of 2026-06-30 the OSS `benchmarks/locomo/RESULTS.md` + README badge still show the OLD
  73.1% (N=320) result, NOT 87.66.** Updating the OSS results to 87.66 is gated on a founder
  go/no-go (it pre-announces the SOTA ahead of paper submission). See
  `docs/analysis/locomo-sota-evidence-drift-2026-06-30.md`.

## To reproduce a benchmark cell
`cd hive-mind-test/scripts/locomo` → `node --env-file=../../.env.locomo-trio
40-cell-retrieval-gpt41mini.mjs PROMPT_MODE=ours PROFILES=1 DATEWIN=1 EPISODIC=1 RAWDETAIL=1`
(+ `PACK=1 BODY_CAP=...` for packing) → `41-judge` → `42-report`. Free token measure:
`--measure --slice=N`. Keys in `.env.locomo-trio` (Python311 for mem0).

## Gotchas (cost real time — don't rediscover)
- `42-report` tokens/q line is a DISPLAY BUG (~3098); real tokens = `context_tokens` in answer rows.
- Judges RESUME by question_id and replay stale verdicts when answers change → use `--out=<fresh>`.
- Mem0 shares `~/.mem0/migrations_qdrant` lock → run per-conv (process isolation).
- Paper citations (Memori/LoCoMo) still have TODO author/ID verification before submission.
