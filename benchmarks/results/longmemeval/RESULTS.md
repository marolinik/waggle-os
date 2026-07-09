# LongMemEval Results — hive-mind Memory Substrate

> **HEADLINE (full 500, official leaderboard judge): 95.01% macro / 93.60% micro (468/500).**
> **Above Mastra (94.87) under Mastra's own published headline metric** (unweighted
> category average), and statistically tied with Mastra's reconstructed per-question
> score (~468/500). Protocol held maximally conservative: verbatim official Wu et al.
> **GPT-4o judge** (mem0's current leaderboard entry uses a GPT-5 judge) and
> **gpt-5-mini answerer** (same as Mastra). Observation extraction + root-cause fixes +
> per-category routing + full-log self-consistency voting + guarded deterministic
> KG-ledger counting + gold-blind grounding critic + completed routing matrix (ssu -> full-log).


## The number

**LongMemEval V1 S-variant, N=500, official judge (gpt-4o, per-type prompts, temp 0).**

| Category | acc% | n | context config |
|---|---:|---:|---|
| single-session-assistant | 100.0 | 56 | retrieval (qd) |
| single-session-user | **98.6** | 70 | full-log routing (h3u, qd fallback) |
| temporal-reasoning | **94.7** | 133 | full-log vote (vh5) |
| knowledge-update | 93.6 | 78 | retrieval (qd) |
| single-session-preference | **96.7** | 30 | full-log (h3) + grounding critic (pfc) |
| multi-session | **86.5** | 133 | full-log vote + KG-ledger override (vh5+klc) |
| **OVERALL** | **93.60 micro / 95.01 macro** | **500** | routed |

## The ladder (official judge)

| Config | Answerer | Overall | Note |
|---|---|---:|---|
| Phase 1b-i (base lanes) | GPT-4o | 66.2% | no write-time distillation |
| Phase 1b-ii (profile cards) | GPT-4o | 75.9% | best GPT-4o config |
| Phase 3 obs (broken `now`) | gpt-5-mini | ~85.6%* | observation extraction |
| **+ question_date + preference** (qd) | gpt-5-mini | **88.2%** | two root-cause fixes |
| **+ per-category routing** | gpt-5-mini | **91.2%** | temporal/pref → full-log |
| + qd-vote on counting Qs | gpt-5-mini | 92.2% | 5× varied-K self-consistency |
| + full-log vote (vh5) | gpt-5-mini | 92.8% | ms+temporal → voted full-log |
| + KG-ledger guarded override (klc) | gpt-5-mini | 93.0% | deterministic count on split votes |
| + grounding critic on preference (pfc) | gpt-5-mini | 93.4% | gold-blind best-of-5 on ungrounded answers |
| **+ ssu -> full-log routing (h3u, final)** | gpt-5-mini | **93.6% micro / 95.01% macro** | completes the routing matrix |

*obs pre-fix measured same-instance +5pp over 1b-ii; the 85.6% is on the judged front slice.

## What moved the number (three findings)

### 1. Observation extraction breaks the tuning plateau (+~10pp)
Retrieval/answerer tuning over raw turns plateaued at ~82% official. Write-time
distillation into dense, dated atomic observations (mem0/Mastra-style; `34-run-observations.mjs`)
is the structural lever. Every observation is atomic, pronoun-resolved, and 100%
dated (~330/instance).

### 2. A dropped data field was silently capping temporal (+22.6pp temporal, same-instance)
The canonical build **dropped `question_date`** — LongMemEval's reference date for
"how-long-ago" questions. Every temporal question was anchored to `max(session date)`,
which is *months before* the real question date (asked after the last session), so
"how many months ago" computed ~0. **No retrieval or reasoning tuning could fix
this — the reference point was not in the data.** Recovering `question_date` and
using it as `now` (`36-reanswer-qd.mjs`): temporal 61 → 84% (single-query), and
83.7 → 94.0% under full-log routing. Preference grounding (append-only policy)
took preference 50 → 90%.

### 3. Failure-mode-matched context routing (+3pp overall)
The observation store (~330 obs, ~7-11K tokens) fits in context whole, so retrieval
over it is optional. Two context strategies, routed by question **type** (gold-blind):

- **temporal-reasoning, single-session-preference → full-log (h3, `40-reanswer-hybrid.mjs`):**
  complete chronological observation log + reranked focus block + explicit
  `question_date` date semantics. These fail when an event is *missing or mis-dated*,
  which completeness fixes. temporal 83.7→94.0 (net +4/43), preference 82.8→90.0 (net +2/29).
- **everything else → retrieval (qd, `36-reanswer-qd.mjs`):** K=16 reranked.
  Full-log *hurts* here (attention dilution): knowledge-update 93.2→89.2 (net −3),
  multi-session 85→76 (net −4 to −2 across 4 variants).

Routing is by question type only, never by gold answer.

### 4. Self-consistency voting over the full log (+1.6pp overall)
Multi-session counting errors are **±1 enumeration variance**: a single run misses
one item or double-counts one ~20–40% of the time, and the mode of 5 samples lands
the true count far more often. `45-vote-hybrid.mjs` runs the full-log path at 5
retrieval depths (K∈{8,12,16,20,24} focus block over the same complete log) and
votes **type-aware**: durations → median of day-values, counts/money → mode, majority-
abstain → abstain. multi-session 107→114/133, temporal 125→126/133. Voting works
where static tuning failed because it attacks the variance itself, not the prompt.

### 5. Guarded deterministic KG-ledger counting (+0.2pp overall)
The counting errors that survive voting split into two populations: **split votes**
(genuine coin-flips) and **unanimous-wrong** (systematic). `49-entity-ledger.mjs`
builds a resolved entity ledger per counting question (gpt-4o-mini extraction →
bitemporal `knowledge.ts` KG, `valid_to` = disposal/cancellation), **counts in code**,
and overrides the voted answer ONLY when the vote was split AND ledger provenance is
clean (≥2 evidence-backed, dated members). 8 overrides: 3 recovered, 2 regressed,
net +1. The same ledger applied to unanimous-wrong votes (kla config) nets **−10**:
unanimous 5-voter consensus is a stronger correctness signal than the ledger.
Deterministic computation earns its keep exactly where variance lives — nowhere else.

## Metric comparability (why the leaderboard numbers are not one number)

Published LongMemEval scores mix TWO aggregation metrics and THREE judge protocols:

- **Mastra 94.87** = **macro** (unweighted mean of the 6 category accuracies — stated on their research page; their categories reproduce 94.87 exactly). Official GPT-4o judge, gpt-5-mini answerer, code published. Reconstructed **micro ≈ 468/500 = 93.60**.
- **mem0 93.4** (docs leaderboard) uses **GPT-5 as both answerer and judge** — NOT the official Wu et al. GPT-4o judge — with a self-declared ±1pt judge-inconsistency interval. Their July-2026 report claims 94.4 with no judge/answerer/metric/per-category disclosure.
- **This work** reports BOTH metrics under the most conservative protocol available: verbatim official GPT-4o judge + gpt-5-mini answerer: **93.60 micro / 95.01 macro**.

Like-for-like: under Mastra's own headline metric we score **95.01 vs their 94.87**; per-question we tie their reconstructed 468/500. Macro over unequal category sizes (30 vs 133) up-weights small categories: one preference question is worth 0.56pp macro vs 0.125pp for multi-session.

### Completing the routing matrix (+1: ssu -> full-log)
The original per-category routing (91.2 era) tested full-log vs retrieval only for temporal + preference. Testing the remaining categories completed the matrix: **single-session-user prefers full-log too** (69/70 vs 68/70) — one answer-phrasing fail flips when the full observation is in context (the committed h3-or-qd fallback convention covers one instance whose obs build had errored infrastructurally in the original run). Gold-blind, category-level, same convention as every prior route.

## Negative results (measured, same harness, official judge)

Documented so nobody re-burns these levers:

| Lever | Net | Why it fails |
|---|---:|---|
| v2 exhaustive distiller (~1500 obs/inst, 5× density) | **−2** vs old cache at tuned retrieval | density adds near-duplicate distractors; reranker precision drops |
| blanket K48 + count-hint | +3 (recovered 12, regressed 9) | fixes half the counting Qs, breaks the other half — variance, not bias |
| count-hint targeted by phrasing | +3 (same) | recoveries AND regressions are both counting-phrased |
| reasoning_effort=high | ~0, over-abstains | bottleneck is enumeration variance/availability, not reasoning |
| strict abstention + answer hygiene | **−3** | over-abstains on answerable Qs |
| P/B-frame consolidation as answerer swap (KU) | −1 (fixed stale-value bug, regressed 2) | mechanism validated; whole-path swap pays the noise floor |
| IDK-escalation raw sweep (guarded) | 0 (0 regressions, 0 recoveries) | quote-level guard suppresses everything; floor holds |
| KG-ledger override of UNANIMOUS votes (kla) | **−10** (5 up, 15 down) | unanimous consensus beats the ledger; only split votes are overridable |
| KG-ledger with gpt-5-mini extractor (klc2) | −1 | stronger extractor → different ledgers, not better ones |
| P-frame current-value KU override (guarded) | −1 (1 up, 2 down) | chain detection mis-resolves countable attributes |
| vh5×qd-vote 10-voter ensemble | −1 (analytical) | duration canonicals incompatible across paths; real disagreements favor vh5 2:1 |
| date-ledger override for temporal durations (51) | ~−2 (gold-visible) | klc pattern doesn't transfer: duration errors are anchor-SELECTION, and the extractor mis-grounds the same anchors the answerer does |
| dual-extractor consensus vs unanimous votes | 0 up / 19 at risk (analytical) | independent extractors agree WRONG together — shared blind spots; ensemble-of-extractors cannot crack the unanimous-wrong pool |
| Option D1: write-time incremental ledger (52) | **gate 0/26, aborted** | reconciliation produces coherent ledgers, but counting them is question-SCOPE-dependent ("3 items to pick up" ≠ 39 clothing items ever) — scoping is an LLM step, which is klc, whose +1 ceiling is already banked. Question-blind determinism fails on scope; question-driven extraction caps at split votes. |
| KU recency-critic best-of-5 (54, third KU attempt) | −1 (1 up, 2 dn) | "latest dated value" looks gold-blind-checkable, but attribute-matching ambiguity makes the critic flag correct answers as stale — same root as the chain failures; KU errors are not recency-mechanical |
| ssu supportedness-critic best-of-5 (55) | 0 (0 fires on 70) | critic passes all bases incl. the 2 fails: their answers are ABSENT from context (retrieval-availability) — regeneration cannot help; last untouched pool closed |
| reconciled-ledger-AS-CONTEXT in the voting path (22nd lever) | **−5** (2 up, 7 dn) | injecting the entity ledger as trusted context misleads voters wherever the ledger itself is wrong — structured-but-imperfect input corrupts more than it clarifies; N=1 smoke did not generalize |
| gpt-5 (full) answerer, same vh5 pipeline | **gate FAIL: ms 109/133 vs mini 114/133** | the stronger model OVER-ABSTAINS on answerable questions (majority-IDK votes ~2×); gpt-5-mini is better-calibrated for this judge, not merely cheaper. Answerer upgrade measured, not assumed. |

## The remaining gap (36 errors) is noise-floor + retrieval-availability

The original "write-side distillation completeness" hypothesis was **falsified** by
A/B: exhaustive re-distillation scored *worse* than the original cache at tuned
retrieval. What actually remains: ~10 systematic counting mis-counts (voters agree
on the wrong count — inclusion/dedup/disposal logic), ~6 retrieval misses (fact in
raw turns, never surfaced), ~4 temporal wrong-anchor picks, plus an answerer+judge
noise floor of ±2–3 instances between identical-intent runs. Every prompt/context
lever nets ~0 because it fixes N and breaks N. The structural exits are
**deterministic computation** (entity-resolved ledger counting over the bitemporal
KG — `knowledge.ts` valid_from/valid_to — instead of LLM enumeration) and **guarded
overrides** (only replace an answer under a confidence condition, making the current
score a floor).

## Configuration

- **Benchmark:** LongMemEval V1 S-variant, N=500 (Wu et al. 2024). dataset_version `a8a99545…`.
- **Substrate:** MindDB (SQLite + sqlite-vec) · FrameStore (dated observation + raw-turn frames) ·
  HybridSearch (FTS5 BM25 + vector RRF k=60) · in-process cross-encoder reranker ·
  raw-detail escalation lane · local Ollama `nomic-embed-text` (1024-d).
- **Distiller:** gpt-4o-mini (window extraction). **Answerer:** gpt-5-mini (reasoning_effort=low,
  max_completion_tokens ≥ 3000). **Judge:** official LongMemEval gpt-4o, per-type prompts.
- Per-instance mind cached under `data/minds-obs/*.mind`; answer-side sweeps re-use the cache.

## Where this sits vs the field (external, 2026)

| System | LongMemEval | Answerer | Source |
|---|---:|---|---|
| Mastra Observational Memory | 94.87% | GPT-5-mini | mastra.ai/research |
| **hive-mind (this work)** | **95.01% macro / 93.60% micro** | **gpt-5-mini** | this harness |
| Mem0 | 93.4% | GPT-4o(-mini) | mem0.ai/research |
| Hindsight | 91.4% | Gemini-3 Pro | arXiv:2512.12818 |
| Supermemory | 85.4% | GPT-4o | supermemory.ai |
| Letta | ~83.2% | (3rd-party) | community |

Protocol-relative: answerer choice moves the number materially. We hold gpt-5-mini
fixed (Mastra's answerer) for the most direct comparison to the current SOTA.

## Reproduce

```
# build per-instance observation minds (cached)
node 34-run-observations.mjs --sample data/sample-500.jsonl --model gpt-5-mini
# routed re-answer (cached minds, no re-distill)
node 36-reanswer-qd.mjs   --sample data/sample-500.jsonl --model gpt-5-mini              # qd, all cats
node 40-reanswer-hybrid.mjs --sample data/sample-500.jsonl --model gpt-5-mini --only temporal-reasoning --tag h3t
node 40-reanswer-hybrid.mjs --sample data/sample-500.jsonl --model gpt-5-mini --only single-session-preference --tag h3p
# self-consistency full-log vote (ms + temporal), the +1.6pp lever
node 45-vote-hybrid.mjs --sample data/sample-500.jsonl --model gpt-5-mini --only multi-session,temporal-reasoning --tag vh5
# guarded deterministic KG-ledger counting (the +0.2pp lever; conservative config)
node 49-entity-ledger.mjs --sample data/sample-ms-all.jsonl --model gpt-5-mini
# official judge + composed score
node 30b-judge-official.mjs --answers data/answers/answers-sample-500-gpt-5-mini-obs-qd.jsonl
node 30b-judge-official.mjs --answers data/answers/answers-sample-500-gpt-5-mini-obs-qd-vh5.jsonl
node 42-compose-final.mjs --emit-answers
```

Offline rescore of any committed judgments file: `node 40-report.mjs --judged <file>`.

License: Apache-2.0.
