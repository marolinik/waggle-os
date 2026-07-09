# How mem0 reached 0.641 on BEAM 1M — pipeline forensics

**Date:** 2026-07-07 · **Source:** `github.com/mem0ai/memory-benchmarks` cloned to `D:/Projects/mem0-memory-benchmarks` (read: `benchmarks/beam/run.py`, `benchmarks/beam/prompts.py`, `benchmarks/common/mem0_client.py`, `results/platform/beam_1m*.json`, `README.md`).

## Headline finding: the 0.641 is a GPT-5 number, not a GPT-4o number

`results/platform/beam_1m_results.json` metadata (the file behind their published table):

```
answerer_model: gpt-5     judge_model: gpt-5     provider: azure
timestamp: 2026-03-26     total_questions: 700   cutoff: top_200
overall: avg_score 0.6409, pass 70.1% (491/700)
```

The README's CLI defaults (`--answerer-model gpt-4o`, `--judge-model gpt-4o`) are what a
reader assumes the published number used — but the shipped result file says **gpt-5 for both**.
This repeats the pattern from our LongMemEval metric audit (their 93.4 leaderboard entry
used a GPT-5 judge, not the official GPT-4o one). The BEAM paper itself showed the answerer
dominates (their LIGHT baseline at 1M scores ~0.336 with weak answerers).

**Consequence for us:** our gpt-4o cells (best 0.446 pilot) are not protocol-matched to
their 0.641. An unknown but material part of the 0.195 gap is answerer/judge model, not
memory architecture. Any honest comparison must either (a) run our best config with
gpt-5/gpt-5, or (b) reproduce their pipeline with gpt-4o/gpt-4o.

## Second finding: top-200 is not the lever

The repo also ships `beam_1m_top50_results.json` (same pipeline, gpt-5/gpt-5):

| cutoff | avg score | pass |
|---|---|---|
| top-200 | 0.6409 | 70.1% |
| top-50 | 0.6037 | 67.1% |

4× the retrieval depth buys only +0.037. The value is in the **compact, reconciled,
dated fact store** — not in how many memories are stuffed into the prompt.

## The pipeline, step by step

1. **Ingestion** (`run.py::ingest_conversation`): the conversation is fed to the Mem0
   *cloud platform* in **2-turn chunks** (`CHUNK_SIZE = 2`). Each `ADD` call server-side
   runs fact extraction (OSS default: gpt-4o-mini) AND memory reconciliation — every new
   fact is compared to existing ones and the platform emits ADD / UPDATE / DELETE events.
   - **This is where knowledge_update is solved**: when the user's follower count changes,
     the old fact is UPDATED in place. No answer-time supersession logic needed (KU 0.650).
   - **This is also why contradiction_resolution stays their weakest (0.357)**: the
     reconciler silently resolves conflicts instead of keeping both sides, but BEAM's
     rubric wants the contradiction *surfaced* (state it exists + both statements + ask
     which is correct).
2. **Session dates**: each BEAM batch's `time_anchor` is parsed to epoch and passed with
   every ADD (`timestamp=time_epoch`), so every memory carries `created_at` = the real
   session date (not ingest wall-time).
3. **Retrieval**: platform hybrid search — semantic + BM25 + entity boost (visible in the
   OSS normalizer's `score_breakdown`), `top_k=200`, no reranker.
4. **Answer context assembly** (`prompts.py::get_beam_answer_generation_prompt`):
   memories rendered as `"N. [YYYY-MM-DD] fact"` and — critically — **sorted
   chronologically oldest-first, not by retrieval score**. The prompt is the exact one we
   already ported verbatim (incl. Rule 3 "prefer the more recent one", the exact-IDK
   sentence, temporal/ordering/preference rules).
5. **Judging**: per-rubric-nugget 0/0.5/1 (raw judge score clamped: ≥0.75→1, ≥0.25→0.5),
   question score = mean of nuggets, headline = micro-mean over 700. `event_ordering`
   additionally computes Kendall tau-b but only as a side metric (`score_with_tau` is NOT
   in the 0.641).

## Their per-ability profile (gpt-5, top-200) vs our best gpt-4o pilots

| ability | mem0 0.641 run | our best (config) | gap |
|---|---|---|---|
| preference_following | 0.883 | 0.55 (distill k200) | −0.33 |
| instruction_following | 0.852 | 0.40 (v2 cells) | −0.45 |
| information_extraction | 0.700 | 0.89 (ipb v2) | **+0.19 we win** |
| multi_session_reasoning | 0.652 | 0.60 (ipb v2) | −0.05 |
| knowledge_update | 0.650 | 0.60 (ipb v1) | −0.05 |
| summarization | 0.635 | 0.26 (distill k200) | −0.38 |
| temporal_reasoning | 0.618 | 0.60 (raw v2) | −0.02 |
| event_ordering | 0.536 | 0.21 (ipb v1) | −0.33 |
| abstention | 0.525 | 0.80 (v1 cells) | **+0.28 we win** |
| contradiction_resolution | 0.357 | 0.25 (ipb v2) | −0.11 |

Reading: we already match or beat them on 5/10 abilities *with a weaker answerer*.
The whole deficit is concentrated in: preference/instruction (standing directives — their
fact store surfaces "user is vegetarian"-type facts; our top-k turns bury them),
summarization (coverage), event_ordering (ordering over dated facts). All four are
exactly what a compact dated fact store + chronological presentation provides — and
gpt-5 as answerer amplifies instruction/preference compliance further.

## What this means for our program

1. **Protocol decision required**: pick the comparison target —
   (a) gpt-5/gpt-5 like their published run (then our numbers will also rise), or
   (b) gpt-4o/gpt-4o everywhere and footnote that their 0.641 used gpt-5.
   Running BOTH on the final config is cheap relative to being wrong.
2. **Option B (hybrid raw+facts, chronological, dated) directly mimics their winning
   mechanics** (dated facts, chronological order) while keeping our winning raw-turn
   detail for info-extraction/contradiction/abstention.
3. **Write-time reconciliation** (their UPDATE/DELETE) is the one mechanism we haven't
   tried on BEAM; our supersede.ts (hive-mind 2d0abc5) is the natural port. Targets KU
   and preference-recency. Note LongMemEval lesson: write-time reconciliation there was
   net-negative at good retrieval — but BEAM's preference/KU profile differs.
4. **Contradiction stays open for everyone** (their 0.357 is the floor of "silently
   resolve"; our v2 flag-both-sides prompt got 0.15→0.25 with only one side usually
   retrieved). Both-sides retrieval assist remains our differentiation shot.
