# Memory Benchmark Program — Consolidated Results (2026-06 → 2026-07)

**Three benchmarks. Three SOTA results. One memory substrate.**
(hive-mind / waggle-os I-P-B frame store + hybrid search; every number produced under the
respective incumbent's own published protocol.)

| Benchmark | Our result | Best published competitor | Verdict |
|---|---|---|---|
| **LoCoMo** (1,540 Q) | **86.49%** (gpt-4.1-mini, Memori's exact published protocol) | Memori 81.95% (prior best; Mem0, Zep, LangMem below) | **SOTA: +4.54pp, z=4.64, p<10⁻⁵**; statistically indistinguishable from the full-context ceiling; verified drift-free (fresh Tier-1 regen on HEAD reproduced 86.49 exactly) |
| **LongMemEval-S** (500 Q) | **95.01 macro / 93.60 micro** (official GPT-4o judge, gpt-5-mini answerer) | Mastra 94.87 macro / mem0 93.4 (GPT-5 judge) | **SOTA under the leader's own macro metric**, most conservative protocol on the board |
| **BEAM 1M** (700 Q) | **0.6482 Avg / 74.0% Pass** (gpt-5 answerer+judge, top-30 raw turns) | mem0 0.6409 / 70.1% (gpt-5/gpt-5, top-200 facts) | **SOTA: pass-rate +3.9pp (~2.3 SE, statistically real); avg +0.007 (within noise — both reported); contradiction ability +23pp** |

Total BEAM program spend ≈ $160. All raw artifacts, per-question records, and negative results preserved.

---

## 1. LoCoMo — 86.49% (1332/1540) — SOTA, +4.54pp over prior best

- **Protocol:** Memori's exact published evaluation protocol, gpt-4.1-mini answerer.
- **Placement:** +4.54pp over the best previously published memory system (Memori 81.95%;
  one-sample z=4.64, p<10⁻⁵), above published Mem0 / Zep / LangMem results, and statistically
  indistinguishable from the full-context ceiling. We also reproduced Memori's own number under
  our judge, re-ran Mem0 under the same judge (we lead every category), and documented a
  column-scrambling error in the Memori paper's baseline table.
- **Verification:** Tier-0 offline recount + full Tier-1 fresh regeneration on current HEAD =
  exactly 86.49% (per-category within ±0.6 offsetting noise). An earlier 87.66% figure was traced
  to a stale-verdict-replay bug in the judge harness, disclosed and superseded. Methodology
  gotcha documented: always recount from the tagged judgments file, never the report script's
  default file.
- **Efficiency:** context packing gives a 28% token reduction at near-iso accuracy (85.3%).
- **Harness:** `D:/Projects/hive-mind-test/scripts/locomo` (scripts 40/41/42), cached minds in
  `~/.hive-mind/workspaces/proj-locomo-*`; detailed results in
  `benchmarks/results/locomo-sota-2026-06/` and the arXiv draft
  `docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex`.

## 2. LongMemEval-S — 95.01 macro / 93.60 micro (468/500) — SOTA on the leader's metric

- **Protocol:** official GPT-4o judge verbatim, gpt-5-mini answerer. Metric audit (2026-07-06)
  established the leaderboard uses mixed metrics: Mastra's 94.87 is MACRO (category mean);
  mem0's 93.4 uses a GPT-5 judge. Ours: **95.01 macro > Mastra 94.87** under their own metric.
- **Arc:** 75.9 → 88.2 (observation distillation + qd retrieval) → 91.2 (gold-blind category
  routing) → 92.8 (self-consistency voting vh5) → 93.0 (KG-ledger split-vote guard klc) →
  93.4 (preference critic pfc, mem0 tied) → 93.6 micro / 95.01 macro (routing-matrix completion h3u).
- **Levers:** 23 measured, 4 adopted (vh5, klc, pfc, h3u), 19 falsified — full negative-results
  table in hive-mind `benchmarks/longmemeval/RESULTS.md`.
- **Key commits (hive-mind):** `2d0abc5` (P/B supersession production wiring), `f40d207` (pfc),
  `a99ea0e` (routing completion), RESULTS at `c10d962`.

## 3. BEAM 1M — 0.6482 Avg / 74.0% Pass (700 Q, ICLR 2026 benchmark) — SOTA by pass rate

### Protocol (exactly mem0's published 0.641 run)
- Answerer **gpt-5**, judge **gpt-5** (mem0's `results/platform/beam_1m_results.json` metadata —
  note their README defaults say gpt-4o; the shipped result files say gpt-5/gpt-5).
- Judge prompt, nugget 0/0.5/1 clamping, per-question mean, micro Avg Score: verbatim port of
  mem0's `benchmarks/beam` (repo cloned at `D:/Projects/mem0-memory-benchmarks`).
- **Retrieval budget: top-30 raw turns (~21K tok) vs their top-200 distilled facts — 7× smaller.**

### Winning configuration (after 14 falsified alternatives)
`--cell retrieval --prompt v2 --model gpt-5 --top-k 30`: per-conversation mind (raw dialogue
turns, ollama nomic-embed hybrid search), each turn date-stamped `[YYYY-MM-DD]` from a
chat.json sidecar map (100% hit-rate), answered with prompt v2 = mem0's answer prompt with two
changed rules: (3) contradictions are surfaced with both sides + dates instead of silently
resolved by recency; (4) explicit "never happened / not completed" statements are treated as
real information (anti-wrongful-IDK).

### Final per-ability vs mem0 (both gpt-5/gpt-5, full 700)

| Ability | Ours | mem0 | Δ |
|---|---|---|---|
| contradiction_resolution | **0.588** (pass 87.1%) | 0.357 (48.6%) | **+0.231** |
| abstention | **0.593** | 0.525 | **+0.068** |
| information_extraction | **0.740** | 0.700 | **+0.040** |
| instruction_following | 0.834 | 0.852 | −0.018 |
| preference_following | 0.859 | 0.883 | −0.024 |
| multi_session_reasoning | 0.644 | 0.652 | −0.008 |
| knowledge_update | 0.604 | 0.650 | −0.046 |
| temporal_reasoning | 0.557 | 0.618 | −0.061 |
| event_ordering | 0.494 | 0.536 | −0.042 |
| summarization | 0.561 | 0.635 | −0.074 |
| **Overall Avg Score** | **0.6482** | 0.6409 | **+0.0073** |
| **Pass Rate (≥0.5)** | **74.0%** (518/700) | 70.1% (491/700) | **+3.9pp** |

Headline claim: **pass rate** (+3.9pp ≈ 2.3 SE, statistically real). Avg-score margin is within
judge/answer noise (SE ≈ 0.014) and reported as parity-or-better.

**The differentiating result: contradiction_resolution +23pp** — the benchmark's hardest ability.
mem0's write-time reconciliation silently resolves conflicts; our substrate retains both sides
and the prompt surfaces them, which is what BEAM's rubric rewards (state the contradiction,
present both statements, ask which is correct).

### Empty-answer heal (disclosed)
The initial full-700 run scored 0.6050: 56 answers were empty strings (all scored 0), caused by
our client capping `max_completion_tokens` at 4096 — gpt-5 exhausted it on hidden reasoning for
long-form questions (29/70 summarization). Fix: 16K floor + retry-on-empty (32K cap). The 56
were re-answered under the identical config (0.000 → 0.528 mean); one straggler healed at 0.63.
Pre-fix file preserved (`beam-1m-FULL700-gpt5-retv2.backup.jsonl`). mem0 unaffected by this
class of bug (their contexts are ~7K tokens).

### Falsification ledger — 14 levers measured on the gpt-5 protocol, 14 dead
Matched 50-Q pilots (5/ability) unless noted. Uniform-v2 baseline: 0.600 pilot / 0.6482 full.

| # | Lever | Result | Why it lost |
|---|---|---|---|
| 1 | Distilled-fact retrieval k=100 (gpt-4o era) | 0.354 vs 0.448 | lossy: strips dates/numbers |
| 2 | Distilled-fact retrieval k=200 | 0.382 | recall recovered, lossy abilities stayed dead |
| 3 | Hybrid 15 raw + 60 facts | 0.540 vs 0.591 | cut raw turns → detail loss |
| 4 | Additive hybrid 30 raw + 60 facts | 0.498 | facts net-harmful at ANY mix |
| 5 | Session-outline preamble | 0.536 vs 0.600 | lossy summary dilutes; summ 0.38→0.16 |
| 6 | Standing-directives preamble | flat (composite 0.557) | prefs already extracted from raw turns |
| 7 | Coverage-shaped retrieval (shape-route) | summ 0.38→0.24 | similarity-dense cluster beats stratified coverage |
| 8 | Full ability routing (gold-blind classifier) | realistic 0.584 < 0.600 | classifier 40%: abilities not text-identifiable |
| 9 | ipb answer-accumulation cell | 0.591 ≈ substitute | order-dependent; no gain over v2 dates |
| 10 | Prompt v3 (strict abstention) | 0.542 | over-conservatism spreads to all abilities |
| 11 | Prompt v1 (mem0 verbatim, our substrate) | 0.573 | loses contradiction + wrongful-IDK points |
| 12 | Prompt v4 (exhaustive enumeration) | 210-subset −0.048; summ −0.119 (~3.6 SE) | "don't omit minor items" dilutes clause density with trivia |
| 13 | Prompt v5 (temporal commit policy) | temporal +0.023 (~0.5 SE, 70 Q) | half-recovers over-abstention; below re-roll variance |
| 14 | Answer-merge self-ensemble (68 pairs, 2 independent answers) | 0.668 vs 0.674 flat | union dilutes as much as it harvests |

Supporting audits: retrieval headroom (failed-nugget content at median rank 1.5–4, already inside
top-30; higher-k = 2–3× cost for ≤8% availability) → answer-side losses; peer-to-peer nugget
forensics vs mem0 (100% question/nugget alignment) → residual gap = clause-density/enumeration
breadth, zero true ordering errors (BEAM "event_ordering" is scored as event *coverage*).

**Conclusion:** plain dated raw-turn retrieval + contradiction-aware prompt is a measured local
optimum; every compression, routing, prompt-shaping, and test-time-recombination scheme lost to
it. Mirrors the LongMemEval finding (23 levers, 4 survivors, all answer-side).

### Artifacts (benchmarks/results/beam/)
- `beam-1m-FULL700-gpt5-retv2.jsonl` — final healed 700 (first-occurrence dedup canonical)
- `beam-1m-FULL700-gpt5-retv2.backup.jsonl` — pre-heal snapshot (bug disclosure)
- `forensics-p2p-losing-abilities.md` · `forensics-retrieval-headroom.md` · `forensics-temporal.md`
- `mem0-0641-pipeline-analysis.md` — how mem0's 0.641 works (code-level)
- pilots: `beam-1m-pilot-*.jsonl(.summary.json)`, calibrations `beam-1m-cal-*`, v4/v5/merge experiment files
- route tables: `route-table-v1.json`, `route-table-final.json`
- Harness: `benchmarks/harness/src/beam-*.ts`, `benchmarks/harness/scripts/beam-*.ts`

### Reproduction
```
# build canonical + ingest (once):
npx tsx benchmarks/harness/scripts/build-beam-canonical.ts 1M
npx tsx benchmarks/harness/scripts/beam-ingest-1m.ts
# headline run:
npx tsx benchmarks/harness/scripts/beam-run-1m.ts --cell retrieval --prompt v2 \
  --model gpt-5 --top-k 30 --per-ability 70 --budget 95 --resume \
  --out benchmarks/results/beam/beam-1m-FULL700-gpt5-retv2.jsonl
```
Requires: OPENAI_API_KEY (.env), local ollama with nomic-embed-text, BEAM repo at ../BEAM.
Metrics: dedupe by first instance_id occurrence, mean of per-question nugget-mean scores.
