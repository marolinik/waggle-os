# LOCKED — Benchmark 7 Obligations

**Datum:** 2026-04-20
**Odobrio:** Marko Marković
**Status:** LOCKED
**Supersedes:** prethodna benchmark strategija (EVOLVESCHEMA + GEPA + ACE trojna kompozicija opisivala je samo `+memory+evolve` ćeliju)

---

## Odluka

Pre pokretanja bilo kakvog scored benchmark run-a, sedam obaveza mora biti pokriveno — u harness-u, u konfiguraciji, ili u pratećem artifakt-u. Svaka obaveza je pre-flight ili pre-publication requirement, ne optional.

**Obaveze:**

1. **Four-cell ablation** — raw / +memory only / +evolve only / +memory+evolve. Harness-level, obavezno pre prvog glavnog run-a. Bez ovoga kauzalni doprinos pojedinačnih slojeva nije izolovan.

2. **Three controls** — (a) verbose-fixed prompt (eliminiše "prompt engineering je pomoglo" objašnjenje), (b) naive-RAG (eliminiše "bilo koji retrieval bi bio isto dobar"), (c) oracle-memory ceiling (daje gornju granicu bilo koje memory arhitekture). Verbose-fixed pali u Day 1 kao harness sanity check; naive-RAG i oracle-memory u Week 2.

3. **Three-model coverage** — small open dense (Llama-3.1-8B-Instruct, non-Qwen family za validaciju modularnosti), mid open MoE (Qwen/Qwen3.6-35B-A3B, LOCKED 2026-04-19), proprietary frontier (claude-opus-4-6, ima PA V5 H1 PASS +5.2pp publishable rezultat). Week 2 proširenje posle Week 1 decisive Qwen × LoCoMo run-a.

4. **Benchmark set** — LoCoMo (dijalog-memory, 91.6% Mem0 reper), LongMemEval (long-context stress test), τ-bench (agent tool-use sa multi-turn interactions). GAIA kao stretch. Minimum za publishable claim: LoCoMo + LongMemEval + τ-bench.

5. **Cost-performance axis** — per-run beleženje `{accuracy, p50_latency_ms, p95_latency_ms, usd_per_query}` u reproducibility artifact. Kritično za KVARK TCO pitch prema EU enterprise kupcima.

6. **Failure mode taxonomy** — 5 mode-a: retrieval miss, retrieval hit + wrong reasoning, hallucinated memory, context window overflow, tool-call error. LLM-judge post-hoc klasifikacija na 200-turn uzorku iz cell 1 vs cell 4 razlike.

7. **Reproducibility artifact** — git repo (submodule ili zaseban), sadrži `{harness-src, model-configs, dataset-refs, run-scripts, raw-logs, aggregator, plots}`. Semver-tagovan za svaki broj koji iznesemo javno.

---

## Week 1 decisive result plan

Four-cell ablation na Qwen/Qwen3.6-35B-A3B × LoCoMo ili LongMemEval (izabrati jedan). Day 1 harness + verbose-fixed kontrola. Day 2 pre-flight $60-115 smoke (4×50 instanci). Day 3-4 main run. Day 5 failure mode klasifikacija.

**Target:** cell 4 − cell 1 > 20pp na izabranom benchmark-u = prvi defensible public broj.

---

## Blokeri pre prvog run-a

- CC sprint 7 tasks mora biti zatvoren (briefs/2026-04-20-cc-sprint-7-tasks.md)
- Four-cell harness scaffold mora postojati (Task 7)
- H-AUDIT-1 per-turn trace ID mora biti implementiran (Task 6)
- Regression suite zelen (Task 0)

---

## Referenca

- Strategy doc: `strategy/2026-04-20-benchmark-alignment-plan.md`
- Memorija: `.auto-memory/project_benchmark_alignment_plan.md`
- CC sprint: `briefs/2026-04-20-cc-sprint-7-tasks.md`
- Gemma probe LOCKED decision: `decisions/2026-04-20-gemma-week3-probe-locked.md`
