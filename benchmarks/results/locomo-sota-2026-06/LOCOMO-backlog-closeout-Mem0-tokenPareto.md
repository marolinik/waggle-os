<!--
CANONICAL LoCoMo SOTA evidence — committed copy (verbatim).
Source: hive-mind-test repo, scripts/locomo/RESULT-backlog-closeout-2026-06-15.md,
committed at e4e2fb6 (2026-06-15). Covers the Mem0 same-judge competitor re-run and the
token-efficiency Pareto (Config D knee). Reproduced verbatim so the secondary claims travel
with the product monorepo; raw data lives in hive-mind-test (see ./README.md).
-->

# Memory backlog close-out — competitor re-run + token efficiency (2026-06-15)

Founder /goal: close token-efficiency, LongMemEval, competitor re-runs, OSS PR #14.
All on the LoCoMo Memori ruler (GPT-4.1-mini answerer + judge, N=1540) unless noted.

## Item 4 — Competitor re-run: Mem0 (same-judge, our ruler)

Mem0 OSS self-hosted (mem0ai 2.0.6, OpenAI gpt-4o-mini extractor + text-embedding-3-small,
embedded qdrant per conv), **same answerer (gpt-4.1-mini) + same judge (41)** as our W3.3 —
isolates the memory substrate. `mem0-runner.py` (per-conv process isolation to dodge the
shared `~/.mem0/migrations_qdrant` lock).

| Category | **Ours (W3.3)** | **Mem0 (our ruler)** | Δ (ours − Mem0) |
|---|---|---|---|
| single-hop | 92.75 | 83.59 | **+9.16** |
| multi-hop | 82.98 | 74.82 | **+8.16** |
| temporal | 83.49 | **50.78** | **+32.71** |
| open-ended | 70.83 | 64.58 | **+6.25** |
| **overall** | **87.66** | **73.96** | **+13.70** |

**We lead Mem0 in every category on its own protocol; temporal by +32.7pp** — the
write-time-dated episodic timeline vs Mem0's known temporal weakness, confirmed same-judge
(Mem0 literature temporal ≈57; here 50.8). This is the defensible same-judge competitor row.

**Zep — literature-sourced (FOUNDER ACCEPTED 2026-06-16):** hosted cloud, no key. Stays
literature-sourced (footnoted) unless a key is provided.
**LangMem — fidelity blocker:** pip `langmem` 0.0.30 is a LangGraph-era SDK, NOT the
LangMem that produced the LoCoMo literature number — re-running it would not be comparable.
Stays literature-sourced.

## Item 2 — Token efficiency (PACK packing)

Implemented `PACK=1` in `40-cell-retrieval-gpt41mini.mjs` buildContext: aligns the benchmark
renderer to production caps (production recall already caps at RECALL_LINE_LENGTH=300 + 40
events + 60 facts — the 3,747 was a benchmark-renderer artifact). Free `--measure` mode +
`OUT_TAG` for non-clobbering variant runs.

Token measurements (free, --measure, 120-row slice):

| Config | params | tok/q | overall (full N) | vs Memori |
|---|---|---|---|---|
| baseline (W3.3) | uncapped | 3747 | **87.66** | +5.71 |
| **Config D ★ knee** | body300 facts40 snip10 raw14 events∞ | **2694 (−28%)** | **85.32 (−2.34pp)** | **+3.37** |
| Config E | body240 facts30 snip8 raw10 events∞ | 2095 (−44%) | (not run) | — |
| Config C | body200 facts20 snip6 raw6 events30 | 1518 (−59%) | 76.62 (−11.04pp) | −5.33 |

Config D per-category vs W3.3: single 91.07 (−1.7), multi 79.43 (−3.6), temporal 80.37
(−3.1, exactly ties Memori 80.37), open 68.75 (−2.1).

**Finding — the Pareto frontier is real and steep:**
- **≤1,500-at-iso-accuracy is NOT achievable.** The lanes are load-bearing (W3.4: raw-detail
  lane drives single-hop). Hitting Memori's 1,294 budget (Config C, 1,518 tok) costs ~11pp.
- **Best practical operating point = Config D: −28% tokens (3747→2694) for −2.3pp** (85.32),
  still **+3.37pp over Memori** and above the W3.1 85.00 — leads/ties every category.
- The honest paper claim: *"matching the prior-SOTA token budget costs real accuracy; at a
  28% reduction we remain ahead of every memory system."* Not a free ≤1,500 win.

NOTE: 42-report's `tokens/query` line is a display bug (shows ~3098 regardless); the true
per-row `context_tokens` (mean 1518 for Config C) is in the answer files.

## Harness fixes shipped this session
- `PACK` packing + `--measure` (free token measurement) + `OUT_TAG` (40/41).
- Caught a **stale-cache trap**: `judge-trio.mjs` resumes by `question_id` ignoring whether
  the answer changed → silently replayed May-22 verdicts. Fixed by `--out=` to a fresh file.
- Mem0 per-conv process isolation (shared qdrant migrations lock).

## Items 1 & 3 (summary)
- **Item 1 ✅** OSS PR #14 merged → master `bc4eba1`; OSS carries the full winning stack;
  CI green; 654/654.
- **Item 3 ✅** LongMemEval W4 recall-path guard: 65.3% trio-strict vs pre-W4 full-method
  68.3% — within noise at N=101, no regression. (75.2% blend remains best LME config.)
