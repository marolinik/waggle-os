# R6 — W4 Memory-Test-Harness Recon

**Author:** recon agent (R6) · **Date:** 2026-06-16
**Scope:** Map the benchmark + memory-test code/results in the `D:/Projects/waggle-os-w4`
sibling worktree, relate it to the main repo (`D:/Projects/waggle-os`), and assess
reusability for the NEW goal: *"Waggle harness + Hive memory lifts small/OSS models
(Qwen 3.6) to premium-model (Opus 4.8) parity."*

> **One-line headline:** `waggle-os-w4` is a **stale read-only worktree of `feature/w4-port`**
> whose substrate code is **already merged to main**; its `benchmarks/harness/` is the
> *agentic 4-cell ablation rig* (GAIA/GEPA lineage) and is **byte-identical to main** — but
> the **actual 87.66 LoCoMo SOTA runner does NOT live here**: it is a loose `.mjs` pipeline
> in the separate repo **`D:/Projects/hive-mind-test/scripts/locomo/`**, orchestrated from
> **`D:/Projects/waggle-os/benchmarks/memori-replication/`**, scored by **GPT-4.1-mini
> answerer+judge** (Memori's protocol, one-sample z-test) — *not* trio-strict.

---

## 0. The single most important finding (read this first)

There are **TWO DISTINCT, UNRELATED benchmark systems** that this recon must keep separate.
Conflating them is the trap.

| | System A — "the harness" | System B — "the LoCoMo SOTA runner" |
|---|---|---|
| **Location** | `waggle-os-w4/benchmarks/harness/` (= identical in main) | `D:/Projects/hive-mind-test/scripts/locomo/*.mjs` |
| **What it is** | TypeScript 4-cell causal-ablation rig (raw / filtered / compressed / full-context + retrieval / agentic / no-context) | Loose Node `.mjs` script pipeline (00→44), Memori head-to-head |
| **Lineage** | Sprint 9–12, GAIA 2 / GEPA Stage-2/3 arc (Apr 2026) | LoCoMo May–Jun 2026 ("W3.3 arc") |
| **Subject model** | `qwen3.6-35b-a3b` (default), pluggable via `config/models.json` | `gpt-4.1-mini` (W3.3) / `gpt-4o-mini` (v4) — pinned in-script |
| **Judge** | Ensemble trio + Grok tie-break (Opus 4.7 / GPT-5.4 / Gemini 3.1-Pro) w/ Fleiss κ, OR single-judge — see `judge-runner.ts` | Memori's SAME-judge GPT-4.1-mini (in-harness) → the 87.66 number; **trio-strict** (`13-judge-trio.mjs`, Opus 4.7 + GPT-5.5 + MiniMax-M2.7) was the EARLIER v5/LongMemEval measurement |
| **Stat test** | Wilson CI + cluster-bootstrap CI + Fleiss κ | one-sample z-test vs Memori published (z=4.42) |
| **Produced 87.66?** | **NO** | **YES** |
| **Merged to main?** | Yes (identical) | N/A (separate repo, `master` branch) |

**Why the confusion exists:** the W4 *arc* refers to porting the LoCoMo-proven retrieval
stack into production. The *production substrate code* (the lanes that won the benchmark)
DID flow through `waggle-os-w4` (branch `feature/w4-port`) and is now on main. But the
*benchmark runner that measured 87.66* never lived in any `waggle-os` checkout — it is
`hive-mind-test` `.mjs` scripts that `import` directly from `D:/Projects/hive-mind`
(the OSS substrate mirror).

---

## 1. Top-level layout of `D:/Projects/waggle-os-w4`

`git rev-parse --show-toplevel` → `D:/Projects/waggle-os-w4` (it is a linked worktree; `.git`
is a 58-byte gitdir pointer file).

Relevant top-level dirs/files:
```
benchmarks/        <-- System A harness + all the W3/Stage-3 result markdown
packages/          <-- hive-mind-core (substrate), agent, server, core, shared, ...
scripts/           <-- oss-drift-check.sh, oss-subtree-split.sh, parity-check.sh, build-*, judge-calibration.mjs
docs/              <-- docs/paper/ (the arXiv SOTA draft), docs/plans/ (W4 plan, harness goal), docs/methodology.md
gepa-phase-5/      <-- GEPA evolution arc scratch
EVAL-RESULTS.md, EVAL-RESULTS-V5.md   <-- top-level eval rollups
litellm-config.yaml, package.json, vitest.config.ts, ...
```

### `benchmarks/` tree (depth 2)
```
benchmarks/
├── archive/                 # old runs
├── calibration/v6-kappa-recal/
├── chunk-probe/data/        # D1 chunk-retrieval needle probe
├── data/
│   ├── beam/   beam-128K.meta.json            (dataset NOT committed — meta only)
│   ├── locomo/ locomo-1540.jsonl (1.19 MB)    + locomo-1540.meta.json
│   └── longmemeval/ longmemeval.meta.json     (dataset NOT committed — meta only)
├── gaia2/runs/              # (empty / gitkept)
├── gepa/{oracle,scripts,src/faza-1,tests}/
├── harness/{config,scripts,src,tests}/   <-- System A (detail in §2)
├── preregistration/
├── probes/{judge-swap-validation,vertex-batch-eligibility}/
├── results/                # Stage-3 / GEPA-faza1 / pilot / v6 result markdown + jsonl
└── scripts/                # migrate-cell-names.ts
```

> Note: `benchmarks/data/locomo/locomo-1540.jsonl` is the **System A** dataset format
> (1531-instance canonical eval set, harness-normalized). The **System B** LoCoMo data is
> the raw `locomo10.json` + per-conversation `.mind` SQLite DBs under `hive-mind-test`.

### `docs/paper/` (the SOTA publication)
```
docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex     <-- 87.66 claim, full results tables
docs/paper/2026-06-12-locomo-sota-paper-draft.docx
docs/paper/2026-06-12-memory-sota-team-briefing.docx
```

---

## 2. System A — the agentic 4-cell ablation harness (`benchmarks/harness/`)

This is the TypeScript rig. **It did NOT produce the 87.66 LoCoMo number** — it is the
GAIA 2 / GEPA Stage-2/3 causal-isolation harness. It is, however, the most directly
reusable asset for the NEW agentic-parity goal.

### 2.1 File inventory (70 files, identical w4↔main)
- **Entry point:** `benchmarks/harness/src/runner.ts` (CLI; `#!/usr/bin/env tsx`).
  - Flags: `--cell {raw|filtered|compressed|full-context|retrieval|agentic|no-context}`,
    `--all-cells`, `--per-cell`, `--control verbose-fixed`, `--dataset {locomo|longmemeval|beam-128k|beam-1m|synthetic}`,
    `--model <id from config/models.json>`, `--judge <id>`, `--judge-ensemble m1,m2,m3`,
    `--judge-tiebreak {quadri-vendor|pm-escalation|majority}`, `--seed 42`, `--budget USD`,
    `--limit N`/`--full`, `--locomo-raw-path`, `--retrieval-top-k`, `--agentic-max-turns`,
    `--agentic-timeout-ms`, `--manifest-hash`, `--sample-lock`.
  - `runOne()` is the per-run driver (`runner.ts:335`). Per-instance loop at `runner.ts:395`;
    judge invoked inline at `runner.ts:462` via `runJudge`.
- **Cells (the memory toggle):** `benchmarks/harness/src/cells.ts`
  - Cell semantics documented at `cells.ts:1-22`. The memory-ON cell is **`retrieval`**:
    *"real `@waggle/core::HybridSearch` recall → top-K turn frames → '# Recalled Memories'
    block → baseline system prompt"*. The **`agentic`** cell runs `@waggle/agent::agent-loop`
    with a `search_memory` tool allowlist + 3-turn cap (the agent decides when to search).
    `raw` / `no-context` are the memory-OFF baselines.
- **Substrate (the memory under test):** `benchmarks/harness/src/substrate.ts`
  - `createSubstrate()` (`substrate.ts:58`) composes `MindDB(:memory:)` + `FrameStore` +
    `SessionStore` + `HybridSearch` from `@waggle/core`, default embedder
    `createOllamaEmbedder()` (nomic-embed-text, 1024-dim). Caller owns lifecycle (`close()`).
  - Corpus ingested once per invocation (`runner.ts:902-911`) via `ingestLoCoMoCorpus`
    (frame-per-turn, GATE-S0 lock).
- **`cells-ipb.ts`** — extends `retrieval` with I/P/B frame writes + a contradiction-check
  pass (`hive_mind_ipb` cell, used for the v8 BEAM run).
- **Judge:** `judge-runner.ts` (adapter) + `judge-client.ts` (LiteLLM HTTP client w/ retries)
  + `judge-types.ts`. The real judge prompt impl is **resolved dynamically at runtime**
  (`judge-runner.ts:96-118`) from `packages/server/src/benchmarks/judge/failure-mode-judge.ts`
  and `ensemble-tiebreak.ts` (NOT in the harness tree — lives in `packages/server`).
  - **Ensemble logic** (`judge-runner.ts:243-401`): for a 3-model ensemble, a **1-1-1 split**
    escalates to a 4th-vendor (Grok-4.20) tie-breaker; a 1-1-1-1 four-way → `PM_ESCALATION`
    (instance dropped, never a coin-flip verdict). The 3-vendor ratified trio is
    **Opus 4.7 + GPT-5.4 + Gemini 3.1-Pro** (`runner.ts:777-790`), Grok-4.20 = reserve.
- **Stats:** `benchmarks/harness/src/stats/`
  - `wilson-ci.ts` — Wilson score 95% CI (primary binomial CI; `wilson-ci.ts:1-23`).
  - `cluster-bootstrap.ts` — conversation-level cluster bootstrap CI (10 000 iters, seed 42,
    Mulberry32 PRNG; respects LoCoMo's hierarchical non-independence; `cluster-bootstrap.ts:1-25`).
  - `fleiss-kappa.ts` — pre-tie-break inter-judge agreement (Fleiss κ).
  - Barrel: `stats/index.ts`.
- **Metrics/aggregate:** `metrics.ts` (`JsonlWriter`, `buildAggregate`, `scoreAccuracy`,
  `percentile`).
- **Failure taxonomy:** `src/failure-taxonomy/{codes,rubric,aggregate,validator,index}.ts`
  (A3 LOCK § 6 8-value failure-code space F1–F6 + F_other).
- **Pre-registration / integrity:** `preregistration.ts` (manifest hash, locked-date,
  argv sanitization), `runner-lock.ts` (single-runner PID+heartbeat lock),
  `health-check.ts` (pre-cell upstream probe), `streak-tracker.ts` (consecutive-failure halt).
- **Config:** `config/models.json` (model registry w/ provider, judge_role, pinning_surface),
  `config/datasets.json` (locomo / longmemeval / beam-128k / beam-1m / synthetic dataset specs).
- **Dataset loaders/ingest:** `datasets.ts`, `ingest.ts`, `ingest-longmemeval.ts`,
  `ingest-beam.ts`. **Canonical builders:** `scripts/build-{locomo,longmemeval,beam}-canonical.ts`.
- **v8 runner:** `scripts/run-v8.ts` (BEAM 128K cell driver; produced the BEAM ipb 21.6% result).
- **Tests:** 40+ vitest files under `tests/` (cells, substrate, judge-wiring, stats/*, smoke).

### 2.2 What System A measured (results in `benchmarks/results/`)
- `stage3-n400-v6-final-analysis.md` — Stage-3 N=400 v6 (substrate-vs-no-context claim,
  Fisher p = 8.07×10⁻¹⁸, +19.25pp retrieval-vs-no-context lift). **This is the "C-2 Substrate
  Claim", NOT LoCoMo 87.66.**
- `agentic-locomo-2026-04-25T16-13-29-924Z.{jsonl,summary.json}` — early agentic-cell LoCoMo run.
- `gepa-faza1/` — GEPA evolution generation runs (checkpoint-a/b/c, null-baseline).
- `pilot-2026-04-26/` — the agentic-knowledge-work pilot (FAIL verdict).
- `v6-self-judge-rebench/` — self-judge-vs-trio comparison memo.
- `manifest-v4/v5-*` — pre-registration manifests.

---

## 3. System B — the actual 87.66 LoCoMo SOTA runner (`hive-mind-test/scripts/locomo/`)

**This is where the headline number was produced.** It is a separate git repo
(`D:/Projects/hive-mind-test`, branch `master`), a loose numbered `.mjs` pipeline.

### 3.1 Pipeline (numbered `.mjs` scripts)
```
00-fetch-dataset.mjs            download snap-research/locomo10.json
01-prepare-workspace.mjs        create per-conv .mind workspaces
02-ingest-conversation.mjs      ingest turns → I-frames
02b-ingest-all-convs.mjs        batch ingest (10 convs)
03-cognify.mjs / 03b-cognify-all.mjs   extraction passes
04-run-queries.mjs              baseline query loop
10-build-sample.mjs             build N-sample (natural-N, QID-pinned)
11-cell-oracle.mjs              ORACLE cell (gold context = memory-OFF ceiling)
12-cell-retrieval.mjs           RETRIEVAL cell (memory-ON) — the substrate under test
13-judge-trio.mjs               TRIO-STRICT judge (Opus 4.7 + GPT-5.5 + MiniMax-M2.7)
13b-judge-self.mjs / 13c-judge-mem0.mjs   self-judge / Mem0-prompt judge variants
14-report-trio.mjs              trio-strict report generator
21-34 ...                       gpt4o / claude / v2 / v3 / v4 retrieval cell iterations
25-ingest-categorized.mjs       category-aware ingest
28/31-distill-{memory-facts,dense}.mjs    distilled-facts lanes
32-cell-retrieval-v4.mjs        Track A v4 (gpt-4o-mini, distilled+importance+semantic blend)
33-distill-episodic.mjs         episodic events lane (write-time date resolution)
34-calibrate-episodic-threshold.mjs / 43-calibrate-rawdetail.mjs   lane calibration
35-distill-profiles.mjs         per-speaker profile cards lane
40-cell-retrieval-gpt41mini.mjs *** THE W3.3 87.66 CELL ***
44 (caption-parity patch)       blip-caption data-parity fix
```

### 3.2 The W3.3 87.66 cell — `40-cell-retrieval-gpt41mini.mjs`
- **Subject:** `gpt-4.1-mini`, temp 0, max_tokens 500, **direct OpenAI** (NOT LiteLLM) —
  matches Memori's protocol exactly (`40-...mjs:24, :63`).
- **Substrate import:** loads `@waggle/cli` `recall-context.js` + `@waggle/core` `db.js`
  **directly from `D:/Projects/hive-mind`** (`HIVE_MIND_ROOT = 'D:/Projects/hive-mind'`,
  seen in the v4 sibling `32-cell-retrieval-v4.mjs:28-30`). The cell does NOT import from
  any `waggle-os` checkout — it consumes the **OSS substrate mirror**.
- **Lanes (env-gated, the W3.3 stack):** `40-...mjs` reads `EPISODIC`, `EPISODIC_K`,
  `PROFILES`, `DATEWIN`, `RAWDETAIL`, `RAWDETAIL_K`, `PACK` env switches
  (`40-...mjs:71-81, :214-219, :607-698`). The FINAL W3.3 config =
  episodic-v1 wholesale + `PROFILES=1` + `DATEWIN=1` + `RAWDETAIL=1` (K=6, ±1 adjacency)
  + caption-parity substrate + W1 answer-policy prompt.
- **PROMPT_MODE** env: `theirs` (Memori's verbatim ANSWER_PROMPT, single user message —
  the load-bearing substrate-vs-substrate head-to-head) vs `ours` (our synthesis prompt =
  the deployment claim).
- **Token instrumentation:** counts the injected context block with `gpt-tokenizer`
  `o200k_base` (matches Memori's `encoding_for_model("gpt-4o-mini")`).

### 3.3 The judge that produced 87.66 — Memori SAME-judge, NOT trio-strict
**This is the critical methodology nuance.** Per `memori-phase22-RESULT.md` (W3.3 section,
lines 461-510) and the arXiv draft (`2026-06-12-locomo-sota-arxiv-draft.tex:42-89`):

> *"On LoCoMo under Memori's own protocol (**GPT-4.1-mini answerer+judge**, N=1540,
> in-harness same-judge), our substrate scores **87.66 overall — +5.71pp above Memori
> (81.95), z=4.42 (p<10⁻⁵)**."*

- **Judge = single GPT-4.1-mini** (same model as answerer), the Memori-paper protocol.
- **Stat = one-sample z-test** vs Memori's published 81.95 (N=1540).
- The **trio-strict ensemble** (`13-judge-trio.mjs`: Opus 4.7 + GPT-5.5 + MiniMax-M2.7,
  verdict = AND of three) was the **earlier v5 / LongMemEval** measurement (e.g. LongMemEval
  blend 75.2% trio-strict, LoCoMo v5 73.1%) — a SEPARATE, more conservative judge used
  before the Memori head-to-head. **Do not attribute 87.66 to trio-strict.**

`13-judge-trio.mjs` implementation detail (the trio-strict mechanic, for reference):
- 3 independent-family judges polled in parallel (`Promise.all`, `13-...mjs:196-200`).
- Binary CORRECT/INCORRECT prompt, identical wording for all judges (`buildJudgePrompt`,
  `13-...mjs:47-64`).
- `trio_strict = 1` only when ALL three say CORRECT (`13-...mjs:208`); `trio_majority` = ≥2.
- Unparsed verdict → `null` (instance excluded, not coin-flipped).

### 3.4 Where the 87.66 results/report live
- **Headline report:** `D:/Projects/waggle-os/benchmarks/results/memori-phase22-RESULT.md`
  (in MAIN, not w4) — the full P1→P5 + W1→W3.4 arc with per-phase z-tests and the final
  W3.3 87.66 table. **This is the canonical numbers file.**
- **arXiv draft:** `waggle-os-w4/docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex`
  (lines 42-89 abstract/claim; 248-254 results table; 358-411 column-scramble correction).
- **Orchestration / impl docs + logs:** `D:/Projects/waggle-os/benchmarks/memori-replication/`
  — `impl-bench.md`, `impl-prod.md`, `build-answerer.md`, `build-judge-report.md`,
  `build-their-env.md` (these are the Memori-env reproduction runbooks) + `logs/` with
  per-phase `{A1-answer,A2-judge,A3-report}-theirs` / `{B1,B2,B3}-ours` logs for every
  phase P1..P5, W1, W2, W2a, W3a/b/c. The W3.3 logs are `W3c-B1-answer-ours.log` etc.
- **Raw per-question artifacts + reports:** `D:/Projects/hive-mind-test/scripts/locomo/data/`
  (`answers/`, `judgments/`, `reports/RESULT-v5-2026-05-11.md`), plus
  `hive-mind-test/scripts/locomo/RESULT-backlog-closeout-2026-06-15.md` (token-efficiency
  PACK Pareto: −28% tokens at 85.32).
- **`.env.locomo-trio`** (`hive-mind-test/.env.locomo-trio`) holds the API keys
  (ANTHROPIC/OPENAI/MINIMAX/etc.) for both answerer and judges.

---

## 4. Git state & merge status

### 4.1 `waggle-os-w4` (this worktree)
```
$ git -C D:/Projects/waggle-os-w4 branch --show-current
feature/w4-port

$ git -C D:/Projects/waggle-os-w4 status -s
(empty — clean working tree)

$ git -C D:/Projects/waggle-os-w4 log --oneline -15
d146e906 docs(paper): rev2 — fold backlog close-out into briefing + paper (docx + tex)
74a5af64 docs(paper): LoCoMo SOTA arXiv draft (.tex) + readable .docx + team briefing .docx
20be7bb1 fix(memory): drop useless pool initializer in raw-detail-lane (OSS lint parity)
02f9f765 merge: concurrent main into feature/w4-port
f7d1e950 docs(memory): drift-triage closure — backfill shipped, forward-port PR #14 ...
4bd4adcb docs(ux): P4 record (two-round review dispositions) + decision-log P4 notes
1df65039 feat(ux): P4 — launch integrity: D11 dataDir, D12 sidecar bundle, ...
0ed97bed feat(memory): D1 follow-up — one-time vector repair + chunk backfill per mind
e6f5f529 feat(memory): D1 chunk retrieval DEFAULT-ON (kill switch =0) ...
38752506 merge: concurrent main into feature/w4-port before D1-D3 push
fc845b1d feat(memory): oss-drift D1 — chunk-level retrieval stack ...
ce12e575 feat(memory): oss-drift D2+D3 — LLM KG entity extraction (cron-wired) + ...
f9f1d3d5 docs(ux): P3 plan + 36-agent review record + decision-log D2 notes
b6d72fb9 feat(ux): P3 — D2 two-mind Memory Center (standalone, mind-strict, reviewed)
0949719f docs(memory): OSS drift triage record — 45-file matrix, R1-R7 ported, D1-D3 deferred
```

### 4.2 `waggle-os` main
```
$ git -C D:/Projects/waggle-os branch --show-current
feature/warm-hive-pr3            (current checkout; "main" is the merge target)

$ git -C D:/Projects/waggle-os log --oneline -5
10d8b1e0 feat(ux): warm-Hive PR3 Phase B1 — Chat in-place restyle
c37d439f fix(ux): clear the 2 deferred PR1 LOW items (PR3 Phase A)
09ed7968 feat(ux): warm-Hive PR3 Phase A — Home (Editorial)
0b15b91f feat(ux): warm-Hive PR3 Phase 0 — shared primitives (os/warm/)
6d645556 test(benchmarks): fix stale console spy ...
```

### 4.3 MERGED TO MAIN? — **PARTIAL (substrate = YES; w4 tip docs = NO)**

| Item | In `main`? | Evidence |
|---|---|---|
| W4 substrate/production-port code commits | **YES** | `git merge-base --is-ancestor` returns true for `9487f0d` (W4.1a), `eb8996f` (W4.1b), `f47ee8f` (W4.2 reranker), `8cd841c` (W4.3a), `1c337d7` (W4.4 captions), `5a5fc0a` (W4.5) — **all 6 IN main**. |
| `benchmarks/harness/` (System A) | **YES — byte-identical** | `comm` of file lists: 70 common files, **0 only-in-w4, 0 only-in-main**. `diff -q runner.ts` and `diff -q cells.ts` → no output (identical). |
| `benchmarks/results/memori-phase22-RESULT.md` (87.66 report) | **YES (lives in main)** | File exists at `waggle-os/benchmarks/results/...`; absent from w4. |
| `benchmarks/memori-replication/` (orchestration + logs) | **YES (lives in main)** | Present in `waggle-os/benchmarks/`; the w4 `benchmarks/` does NOT have it. |
| w4 branch tip: 3 commits `d146e906`, `74a5af64`, `20be7bb1` (arXiv paper docx/tex + 1 lint fix) | **NO** | `git merge-base --is-ancestor d146e906 main` → **NOT-ANCESTOR**. `git log main..feature/w4-port` lists exactly these 3. |
| System B runner (`hive-mind-test/scripts/locomo/*.mjs`) | **N/A** | Separate repo `D:/Projects/hive-mind-test` @ branch `master` (HEAD `e4e2fb6`). Never part of `waggle-os`. |

**Conclusion:** `waggle-os-w4` is a **stale worktree**. Its substrate code is on main; its
only unmerged content is the 3 documentation commits at the tip (the arXiv paper + a lint
parity fix). The benchmark *harness* (System A) is identical to main. For NEW work, treat
`waggle-os-w4` as a **read-only reference snapshot**, not a place to author code.

---

## 5. Reusability for the NEW goal (Qwen 3.6 → Opus 4.8 parity via Waggle harness + Hive memory)

The goal is an **agentic-harness parity claim**, which maps to **System A (the TS harness)** —
it already has a pluggable `--model`, the agentic cell, the judge ensemble, and the stats.
System B (LoCoMo `.mjs`) is **memory-QA-specific** and mostly NON-transferable.

### 5.1 DIRECTLY REUSABLE (System A — wire-and-go)
| Asset | Path | Why it transfers |
|---|---|---|
| **Model-swap mechanism** | `benchmarks/harness/config/models.json` + `runner.ts` `--model` | `qwen3.6-35b-a3b` (incl. `-local` Ollama variant) AND `claude-opus-4-*` already registered as first-class model specs. Add `claude-opus-4-8` + the Qwen target; no code change. This is the parity-pair plumbing. |
| **Judge ensemble + tie-break + Fleiss κ** | `judge-runner.ts` + `packages/server/.../{failure-mode-judge,ensemble-tiebreak}.ts` + `stats/fleiss-kappa.ts` | Provider-agnostic LLM-as-judge w/ 1-1-1→4th-vendor escalation + PM-escalation drop. Works on ANY answer regardless of task. Trio = Opus 4.7 / GPT-5.4 / Gemini 3.1-Pro (cross-family — exactly what a parity claim needs to avoid self-judge bias). |
| **Stats module** | `stats/{wilson-ci,cluster-bootstrap,fleiss-kappa}.ts` | Wilson CI + conversation-cluster bootstrap (10k iters, seed 42) + κ. Significance-testing two models' pass rates is the same math regardless of dataset. Cluster-bootstrap is reusable for any clustered eval set. |
| **Integrity / reproducibility scaffolding** | `runner-lock.ts`, `health-check.ts`, `streak-tracker.ts`, `preregistration.ts`, seed=42 default, `dataset_version` SHA stamping | Single-runner lock + pre-flight health probe + consecutive-failure halt + manifest pre-registration = exactly the audit trail a published parity claim must have. Free. |
| **Failure taxonomy** | `src/failure-taxonomy/` (F1–F6 + F_other) | Lets the parity claim be category-resolved ("Qwen matches Opus on X-class tasks, lags on Y") rather than a single scalar. |
| **The agentic cell** | `cells.ts` `agentic` cell (`runAgentLoop` + `search_memory` tool + turn cap) | **This is the heart of the NEW claim** — it runs Waggle's OWN `@waggle/agent` loop with memory access, swappable subject model. The parity test = run `agentic` cell with Qwen vs Opus, same judge. |
| **Memory toggle** | `retrieval` (mem-ON) vs `no-context`/`raw` (mem-OFF) cells + `substrate.ts` | The A/B that isolates "does Hive memory close the Qwen↔Opus gap?" already exists as distinct cells over an ephemeral `MindDB` substrate. |
| **GAIA 2 dataset config + ingest** | `config/datasets.json`, `ingest*.ts`, `build-*-canonical.ts` | Dataset specs + canonical builders for locomo/longmemeval/beam already wired; same loader pattern for any agentic dataset (GAIA 2). |

### 5.2 PARTIALLY REUSABLE (needs adaptation)
| Asset | Caveat for the agentic goal |
|---|---|
| `v8 run-v8.ts` / `cells-ipb.ts` | BEAM-128K-specific cell driver; the I/P/B-write + contradiction-check pattern is reusable but the dataset wiring is memory-QA shaped. |
| `gepa/` evolution arc | GEPA prompt-evolution rig — relevant only if the parity claim wants to *optimize* Qwen's prompt to reach Opus parity (a stretch lane), not for the baseline claim. |
| `docs/plans/HARNESS-BENCHMARK-GOAL-2026-05-22.md` + `HARNESS-BENCHMARK-PLAN-2026-05-22.md` | **The pre-existing Pillar-1 agent-harness benchmark design** (GAIA 2, Hermes head-to-head, sovereignty triple). Locked to "Reading B: Waggle = arena/governance". The NEW "Qwen→Opus parity" claim is a *variant* of Pillar-1 — these docs are the design substrate to extend, but their framing (Waggle-as-neutral-arena, not "our loop wins") may need re-reading for a parity claim. **Read before designing.** |

### 5.3 NOT TRANSFERABLE (memory-QA-specific, System B)
| Asset | Why it does NOT transfer to an agentic-harness benchmark |
|---|---|
| `hive-mind-test/scripts/locomo/*.mjs` (entire pipeline) | Hardcoded to LoCoMo conversation QA: per-conversation `.mind` ingest, distilled-facts/episodic/profile/date-window/raw-detail lanes are all *long-conversation-recall* mechanisms. An agentic GAIA-2 task is multi-tool-execution, not conversation recall. |
| `40-cell-retrieval-gpt41mini.mjs` 87.66 cell | Pinned to gpt-4.1-mini + Memori's single-message answer prompt + LoCoMo lanes. The 87.66 number itself is **memory-recall accuracy**, not agentic task success — irrelevant to a tool-use parity claim. |
| `13-judge-trio.mjs` binary-correctness prompt | The CORRECT/INCORRECT-vs-reference prompt assumes a short factoid gold answer. Agentic tasks need a task-success rubric (multi-step verification), not single-fact matching. *(The ensemble/trio MECHANISM is reusable — see 5.1 — but this specific PROMPT is not.)* |
| `memori-replication/` runbooks | Reproduce Memori's Python env / notebooks for the LoCoMo head-to-head specifically. |
| The 87.66 / trio-strict / Fisher-p numbers | All are MEMORY claims (LoCoMo recall, substrate-vs-no-context). None measure agentic parity. The NEW claim must be measured fresh. |

### 5.4 Concrete recommendation
1. **Base the new benchmark on System A (`benchmarks/harness/`) in MAIN** (not the w4
   worktree — it's stale and read-only; main is byte-identical and live). Branch from main.
2. **Reuse verbatim:** `config/models.json` model-swap, `judge-runner.ts` + `stats/*` +
   integrity scaffolding (lock/health/prereg/seed). These are task-agnostic.
3. **Use the `agentic` cell as the protagonist** — run it with subject `qwen3.6-35b-a3b`
   (incl. `-local` Ollama) vs `claude-opus-4-8` (add the spec), memory ON, same judge trio.
   The parity claim = no significant gap (Wilson/cluster-bootstrap) between the two on the
   chosen agentic dataset.
4. **Add a memory-ablation arm** (`retrieval`/agentic-with-memory vs `no-context`) to show
   the LIFT attributable to Hive memory — that is the differentiated part of the claim
   ("memory is what closes the gap").
5. **Do NOT reuse System B** except as a *methodology template* (the wave-gated, integrity-
   first, pre-registered, archive-before-wipe discipline documented in
   `memori-phase22-RESULT.md` and `docs/methodology.md` is the gold standard to copy).
6. **Read first:** `docs/plans/HARNESS-BENCHMARK-GOAL-2026-05-22.md` and
   `HARNESS-BENCHMARK-PLAN-2026-05-22.md` — the existing Pillar-1 design already anticipates
   a Qwen-local agentic run (MEMORY.md "Pillar-1 Qwen local follow-up": repeat the GAIA 2
   harness with Qwen 3.6 local; Sonnet result was Waggle ON PAR with Hermes 86.5% vs 89.2%
   trio-strict N=40). The NEW goal is essentially **finishing that queued Pillar-1 Qwen lane,
   reframed as a Qwen↔Opus parity claim.**

---

## 6. Appendix — exact provenance pointers

- **87.66 claim text:** `waggle-os-w4/docs/paper/2026-06-12-locomo-sota-arxiv-draft.tex:44`,
  `:86-89`, `:254`, `:411`, `:457`; `waggle-os/benchmarks/results/memori-phase22-RESULT.md:461-510`.
- **W4 production-port plan (which lanes won, and that they're on main):**
  `waggle-os-w4/docs/plans/W4-PRODUCTION-PORT-PLAN-2026-06-11.md` (esp. §0 headline, §1 gap
  matrix, §7 status log lines 115-152 = the W4.1–W4.6 commit SHAs already on main).
- **Recon provenance note (says runner is in hive-mind-test):** same plan, line 16:
  *"benchmark harness `D:/Projects/hive-mind-test/scripts/locomo/`."*
- **Trio-strict judge models:** `hive-mind-test/scripts/locomo/13-judge-trio.mjs:27-29`.
- **W3.3 cell + env lanes:** `hive-mind-test/scripts/locomo/40-cell-retrieval-gpt41mini.mjs:1-31,
  :63-81, :214-219, :607-698`.
- **Substrate import root for System B:** `hive-mind-test/scripts/locomo/32-cell-retrieval-v4.mjs:28`
  (`HIVE_MIND_ROOT = 'D:/Projects/hive-mind'`).
- **System A memory toggle:** `waggle-os-w4/benchmarks/harness/src/cells.ts:1-22`,
  `substrate.ts:58`, `runner.ts:902-911`.
- **Merge evidence:** `git -C D:/Projects/waggle-os merge-base --is-ancestor {9487f0d,eb8996f,
  f47ee8f,8cd841c,1c337d7,5a5fc0a} main` → all true; `d146e906` → false.
- **Harness identity:** `comm -23/-13` of `benchmarks/harness` file lists → 0 divergent;
  `diff -q runner.ts cells.ts` → identical.
