# R7 — Hive Memory Substrate Recon (`D:/Projects/hive-mind`)

**Recon for:** harness-SOTA benchmark design (prove Waggle harness + Hive memory lifts Qwen 3.6 to Opus 4.8 parity)
**Target checkout:** `D:/Projects/hive-mind`
**Date:** 2026-06-16
**Author:** recon agent (R7)

---

## Headline

`D:/Projects/hive-mind` is a clean working clone of the **public OSS mirror `marolinik/hive-mind`** on `master`, fully synced with the monorepo substrate as of the 2026-06-12 mono-parity forward-port — its `mind/` and `harvest/` source is at content-parity with main (only OSS-adaptation noise + CRLF differs). What lives **only here** is the **`benchmarks/locomo/` LoCoMo-replay runner suite** (38 `.mjs` cells incl. a ready-made **Qwen 3.6 subject arm**) and the **73.1% v5 RESULTS.md** — none of which exist in main. **Recommendation: the benchmark code should run AGAINST main's `packages/hive-mind-core` substrate (canonical source of truth), but can REUSE the `benchmarks/locomo/*.mjs` runner harness from this checkout as a starting template (port it into main, do not author against the mirror).**

---

## 1. Top-level layout

```
D:/Projects/hive-mind/
├── packages/              # 8 OSS packages (curated mirror layout — NOT the monorepo's 27)
│   ├── core/              #   <-- the substrate: src/{mind,harvest}/  (mirror of hive-mind-core)
│   ├── cli/               #   recall-context, cognify, harvest, init, mcp-* commands
│   ├── mcp-server/        #   21 MCP tools incl. recall_memory (reranker wired — recall-rerank.test.ts)
│   ├── enrichment/        #   compare-cognify, native-node consumers
│   ├── wiki-compiler/     #   personal wiki build
│   ├── wiki-web/          #   local-first graph viewer (vendored vis-network + CSP)
│   ├── claude-code-hooks/ #   the one shipped hook package (claude-code only)
├── benchmarks/            # *** UNIQUE TO THIS CHECKOUT ***
│   ├── locomo/            #   38 .mjs LoCoMo-replay cells + RESULTS.md + docs/{LOCOMO-PLAN,MEM0-METHODOLOGY,COMPARE-vs-prior}.md
│   │   └── artifacts/     #   committed reproducibility artifacts (sample-cells-23-N320.jsonl, trio-judgments, MANIFEST)
│   └── recall-stress/     #   run.mjs + queries.example.json + README (per-category recall rollup)
├── scripts/               # first-run-smoke.sh  (only one script — NOT the monorepo's oss-* scripts)
├── docs/                  # OSS docs
├── e2e/                   # full-platform verification (21 MCP tools, 5 hooks, server handshake)
├── examples/  test-fixtures/  .changeset/  .claude-plugin/  .github/
├── AGENTS.md  CLAUDE.md  README.md  CHANGELOG.md  CONTRIBUTING.md  EXTRACTION.md  RELEASING.md
├── package.json  package-lock.json  tsconfig.base.json  vitest.config.ts  eslint.config.js
└── .mind/  .planning/  node_modules/
```

Note the **curated mirror layout**: substrate is `packages/core/src/{mind,harvest}/` here, whereas in the monorepo it is `packages/hive-mind-core/src/{mind,harvest}/`. This matches CLAUDE.md §7.5's "hand-curated forward-port, not a mechanical subtree split" description.

---

## 2. What this checkout IS (exact git output)

```
$ git -C D:/Projects/hive-mind remote -v
origin  https://github.com/marolinik/hive-mind.git (fetch)
origin  https://github.com/marolinik/hive-mind.git (push)

$ git -C D:/Projects/hive-mind branch --show-current
master

$ git -C D:/Projects/hive-mind status -s
(clean — no output)

$ git -C D:/Projects/hive-mind log --oneline -15
bc4eba1 Merge pull request #14 from marolinik/feature/mono-parity-2026-06-12
1ca36b9 fix(core): drop useless pool initializer in raw-detail-lane (eslint no-useless-assignment)
23e15ff feat(core): mono-parity 2026-06-12 — forward-port of the waggle-os substrate arc
9757b73 docs: fix stale MCP tool names to match the real 21
266aadb chore(release): add Changesets + OIDC publish pipeline; clear runtime audit vulns
b3b052b test(e2e): full-platform verification — 21 MCP tools, 5 hooks, server handshake
8aa03d2 fix(wiki-web): vendor vis-network + add CSP so the graph is truly local-first
1bc2d94 test(e2e): reproducible wiki-web E2E harness + adjudicated vision report
38936e4 fix(wiki-web): resolve /entity/:id by enumerating instead of name-searching the id
ace91db fix(enrichment): remove duplicate getCliPath export that crashed native-node consumers
e2db71a feat(core): assessRetrievalConfidence — abstain-path scaffold
7614ae8 docs(benchmarks): add METHODOLOGY.md pinning the reproducible benchmark recipe
37d00cc feat(benchmarks): per-category rollup in recall-stress
7b79179 fix(mcp): apply the reranker in recall_memory (MCP/CLI parity)
9a08d67 fix(smoke): avoid npm ci node_modules brick on Windows + add recovery hint
```

**Verdict:** This is the **published OSS mirror** (`marolinik/hive-mind`), working tree clean, on `master`, with the **2026-06-12 mono-parity forward-port already merged** (PR #14, tip `bc4eba1`). This is precisely the same parity port CLAUDE.md §7.5 / the W4 production-port arc describes — so the substrate here equals main's as of 2026-06-12.

The parity commit `23e15ff` self-documents the forward-ported arc:
- **scoring:** temporal decay anchors on `created_at` (write time) not `last_accessed`
- **search:** date-window correctness (10x over-fetch under since/until, same-day fencepost fix, FTS5→LIKE degrade, chunk-retrieval kill switch `HIVE_MIND_CHUNK_RETRIEVAL=0`)
- **content-hash/frames:** provenance-insensitive `hashFrameContent` (dedup across hook sources)
- **embedding-provider:** `maxEmbedCharsForModel` 8k-branch 24k→8k chars
- **harvest:** caption-aware adapters ×4 + `HARVEST_FRAME_CONTENT_CAP=10k`
- **new modules:** `extract-memory-lanes`, `raw-turns`, `raw-detail-lane`, temporal stack (`resolve-relative-date`, `parse-date-window`, `recall-context`)
- Verification claimed in-commit: `tsc --build` exit 0; vitest 57 files / 654 tests.

---

## 3. Benchmark / memory-experiment code living here (and ONLY here)

### 3.1 `benchmarks/locomo/` — the LoCoMo-replay substrate-quality suite (UNIQUE)

This entire directory **does not exist in main** (`D:/Projects/waggle-os/benchmarks/locomo/` → `No such file or directory`). Main's `benchmarks/` has a *different*, agentic GAIA-style harness (`benchmarks/harness/`, `benchmarks/gaia2/`, `benchmarks/results/agentic-locomo-*.jsonl`, `benchmarks/data/locomo10.json`) but **not** these simple substrate-retrieval `.mjs` cells.

38 numbered pipeline stages, e.g.:
```
00-fetch-dataset.mjs           10-build-sample.mjs            25-ingest-categorized.mjs
01-prepare-workspace.mjs       11-cell-oracle.mjs             28-distill-memory-facts.mjs
02-ingest-conversation.mjs     12-cell-retrieval.mjs          31-distill-dense.mjs
02b-ingest-all-convs.mjs       13-judge-trio.mjs              32-cell-retrieval-v4.mjs
03-cognify.mjs                 13c-judge-mem0.mjs             34-cell-retrieval-v4-qwen.mjs   <-- Qwen 3.6 subject arm
03b-cognify-all.mjs            21-cell-oracle-gpt4o.mjs       36-cell-retrieval-v5-claude.mjs
04-run-queries.mjs             22-cell-retrieval-gpt4o.mjs    37-judge-claude-v5.mjs
                               24-report-apples.mjs           38-judge-trio-v5.mjs
```
Plus `rescore.mjs`, `RESULTS.md`, committed `artifacts/` (sample, judgments, MANIFEST), and `docs/{LOCOMO-PLAN.md, MEM0-METHODOLOGY.md, COMPARE-vs-prior.md}`.

git-tracked (not untracked scratch): last commits `c05b671 test(locomo): commit reproducibility artifacts`, `b5f39ce fix: portable HIVE_MIND_ROOT`, `0f0505e fix: trio-strict parser bug`.

### 3.2 The Qwen 3.6 subject arm already exists — `34-cell-retrieval-v4-qwen.mjs`

This is **directly relevant to the new goal**. It is the exact "OSS-model arm" pattern: same v4 retrieval substrate, subject model swapped to Qwen via DashScope.
```js
// Track A v4-qwen — same v4 retrieval but Qwen3.6-35B-A3B SUBJECT (reference model).
process.env.HIVE_MIND_NO_SYNTH = '1';
const DASHSCOPE_BASE = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
const SUBJECT_MODEL = 'qwen3.6-35b-a3b';
const SEMANTIC_K = 10;
const IMPORTANCE_K = 5;
// loads recall from packages/cli/dist + packages/core/dist; context = Memory Facts + Retrieved Snippets
```
It calls the substrate through the **built CLI/core dist** (`packages/cli/dist/commands/recall-context.js`, `packages/core/dist/mind/db.js`) — i.e. the retrieval path is decoupled from the subject LLM, exactly what you need to hold memory constant while swapping Qwen 3.6 ↔ Opus 4.8.

### 3.3 The published result (RESULTS.md) — also unique to this checkout

`benchmarks/locomo/RESULTS.md` (LoCoMo v5, 2026-05-11) is the public substrate-claim evidence:
- **v5-claude (Opus 4.7): 73.1%** | **v4-qwen (Qwen3.6-35B): 73.4%** — same substrate, two SOTA subjects converge.
- Architecture: distilled-dense facts (53/conv) + K=5 importance + K=10 semantic + **reranker** + synthesis-encouraging prompt.
- Trio-strict re-judge (Opus 4.7 + GPT-5.5 + MiniMax M2.7): **67.8% strict / 70.0% majority**; self-judge inflation +5.3pp.
- +4.6pp over Mem0 paper (68.5%) under same dataset/protocol/judge.

**This is the strongest existing evidence that "substrate ≫ subject model"** — the precise thesis of the new benchmark. Qwen 3.6 and Opus 4.7 already hit parity (73.4 vs 73.1) on identical memory substrate in the LoCoMo retrieval setting.

### 3.4 `benchmarks/recall-stress/` — per-category recall rollup harness (also unique)

`run.mjs` + `queries.example.json` — a lighter recall-stress probe over the substrate. Not present in main.

---

## 4. Substrate version / capabilities for running memory inside a benchmark

### 4.1 HybridSearch + reranker surface (`packages/core/src/mind/search.ts`)

- `class HybridSearch` (line 119): Reciprocal Rank Fusion (k=60) over FTS5 (keyword) + sqlite-vec (vector), parallel, then ×personalization relevance (scoring.ts).
- `SearchOptions.reranker?: Reranker` + `rerankPoolSize?: number` (default 30): cross-encoder rerank applied AFTER RRF on the top pool (lines 270-289); **soft-fails to RRF ordering** on any reranker error.
- `SearchOptions.since/until` ISO date-window filters (date-only bounds via `substr(created_at,1,10)`).
- `assessRetrievalConfidence()` + `chunkRetrievalEnabled()` exported (abstain-path scaffold + chunk kill switch).
- `RechunkResult` / `rechunkAllFrames` for re-indexing.

### 4.2 Reranker (`packages/core/src/mind/inprocess-reranker.ts`)

- In-process **cross-encoder** via `@huggingface/transformers` (ONNX), default `Xenova/ms-marco-MiniLM-L-6-v2` (~22MB, ~30-50ms/pair CPU), cached at `~/.hive-mind/models`.
- `Reranker` iface: `score(q,doc)` + `scoreBatch(q,docs)`. Optional peer dep — throws if absent, caller falls back to no-rerank.
- **Byte-identical to main's `hive-mind-core/src/mind/inprocess-reranker.ts`** (CRLF-only diff). This is the reranker CLAUDE.md §7.5 says was once OSS-only and reverse-ported — it is now at parity in both.
- Wired into `recall_memory` (MCP) per commit `7b79179` (MCP/CLI parity) + `recall-rerank.test.ts`.

### 4.3 Embedding provider — fully LOCAL capable (`packages/core/src/mind/embedding-provider.ts`)

- Types: `'inprocess' | 'ollama' | 'voyage' | 'openai' | 'litellm' | 'mock'`.
- **`auto` fallback chain: `['inprocess', 'ollama', 'voyage', 'openai']`** then `mock` (always-available, with a loud stderr warning that mock = noise).
  - **`inprocess`** = `@huggingface/transformers` ONNX, default `Xenova/all-MiniLM-L6-v2` (downloads ~23MB, then **fully offline**).
  - **`ollama`** = local `http://localhost:11434`, default `nomic-embed-text`.
  - voyage/openai are skipped automatically when no API key — so on a key-less box auto resolves to inprocess or ollama, never a paid API.
- `embedding-provider.equivalence.test.ts` proves the embed/truncate surface is deterministic & hermetic ("zero DB, zero network, zero Ollama"), and `maxEmbedCharsForModel` caps long frames.

### 4.4 Vector store — local SQLite (`packages/core/src/mind/db.ts`)

- `better-sqlite3` + `sqlite-vec` (`sqliteVec.load(this.db)`), `vec0` virtual tables. Both are **hard `dependencies`** of `@hive-mind/core`. `@huggingface/transformers` + `pdf-parse` are **optional peer deps**.

### 4.5 Can memory run fully LOCAL for the OSS-model arms? — YES

SQLite + sqlite-vec (bundled) + **inprocess ONNX embeddings + inprocess ONNX cross-encoder reranker** = a complete retrieval stack with **no network and no API keys**. The only LLM call in a benchmark is the **subject model** answering the question (Qwen via DashScope/Ollama, Opus via Anthropic) and the **judge** — the memory substrate itself is 100% local. This is exactly the sovereign-local posture the harness goal wants for the OSS-model arms.

### 4.6 What is NOT here (PromptAssembler)

- **`prompt-assembler.ts` lives in main's `packages/agent/`, NOT in the substrate** (`packages/agent/src/prompt-assembler.ts` + 7 eval/test files). It is **proprietary harness code, not OSS substrate** — there is no assembler in the OSS mirror at all. The LoCoMo runners here build context inline (`buildContext()` concatenating "Memory Facts" + "Retrieved Snippets"), they do **not** use PromptAssembler. If the new benchmark wants the production PromptAssembler v5 path, that must come from main's `packages/agent`, not from this checkout.

---

## 5. Drift between this checkout and main's `packages/hive-mind-core`

### 5.1 File-name diff of `mind/` (excluding tests)

```
ONLY IN MAIN (packages/hive-mind-core/src/mind/):
  evolution-runs.ts
  execution-traces.ts
  improvement-signals.ts

ONLY IN HIVE-MIND CHECKOUT (packages/core/src/mind/):
  llm-extractor.ts
```

- `evolution-runs.ts`, `execution-traces.ts`, `improvement-signals.ts` are the **OSS-EXCLUDED** files per CLAUDE.md §7.5 (barrel-exported from hive-mind-core but stripped on export). Their absence here is **expected and correct** — they are Waggle-proprietary, not substrate. **Not retrieval-relevant** for a memory benchmark.
- `llm-extractor.ts` present here but not in main's `mind/` — likely a mirror-local placement of extraction logic that lives elsewhere in the monorepo (main puts memory-lane extraction under `harvest/extract-memory-lanes.ts`, which IS present in both). Worth a content check before relying on it, but not a blocker — the benchmark calls `recall-context`, not the extractor directly.

### 5.2 Content diff of retrieval-critical files (CRLF-normalized)

| File | Diff vs main | Nature |
|---|---|---|
| `inprocess-reranker.ts` | **IDENTICAL** (CRLF only) | parity |
| `raw-detail-lane.ts` | ~10 lines | OSS-adaptation only: "Forward-ported…" header, dropped `W4.6` tag, `let pool: FrameRow[]` vs `= []` (the eslint no-useless-assignment fix `1ca36b9`) |
| `search.ts` | ~460 diff lines BUT semantic | **OSS-adaptation noise**: rewritten header doc comment, dropped unused `ScoredResult` import (mirror tsconfig has `noUnusedLocals`), comment tags scrubbed (`F20:`/`W4.2:` removed), `gopId` comment trimmed. No behavioral logic divergence observed in the inspected hunks. |

This matches CLAUDE.md §7.5's note that `oss-drift-check.sh`'s ~50 "DIFFERS" are mostly OSS-adaptation noise (layout + import rewrites), not true drift.

### 5.3 Direction of truth

Per CLAUDE.md §7.5 (founder-ratified): **the monorepo is the SOLE source of truth.** The mirror is generated FROM main; substrate features must land in `packages/hive-mind-core` FIRST. As of `bc4eba1` / `23e15ff` (2026-06-12) the substrate here is a faithful forward-port of main's W4 arc — so **no substrate logic exists only here**. The only thing unique here is the **benchmark harness** (`benchmarks/locomo/`), which is throwaway experiment code, not substrate.

> CLAUDE.md §7.5 warning recap: parity is NOT automatic — the cross-encoder reranker once existed ONLY on this mirror and had to be reverse-ported (W4.2 `f47ee8f`). That specific drift is now closed (reranker byte-identical). But the lesson stands: **any new substrate work done in a `D:/Projects/hive-mind` checkout for the benchmark is throwaway unless reverse-ported into main.**

---

## 6. Recommendation — which substrate should the benchmark depend on?

**Depend on main's `packages/hive-mind-core` as the substrate; reuse this checkout's `benchmarks/locomo/*.mjs` as a runner template (ported into the monorepo).**

Rationale:
1. **Source of truth.** §7.5 is founder-ratified: monorepo is canonical; the mirror is generated from it. A benchmark that must be reproducible and defensible should pin to the canonical substrate, not a downstream mirror that can lag (it lagged on the reranker once already).
2. **No substrate-only code here.** As of 2026-06-12 parity, every retrieval-relevant file here is a forward-port of main (reranker identical; search/raw-detail-lane differ only in OSS-adaptation noise). There is **nothing in the substrate here that main lacks** — so depending on the mirror buys nothing and risks future lag.
3. **PromptAssembler + agent harness are only in main.** The new goal is "Waggle **harness** + Hive memory." The harness (PromptAssembler v5, agent-loop, personas, tool-filter) lives in main's `packages/agent` and has **no equivalent in this mirror**. The benchmark needs both halves; only main has both.
4. **The valuable unique asset here is the runner harness, not the substrate.** `benchmarks/locomo/` — especially `34-cell-retrieval-v4-qwen.mjs` (Qwen subject arm), `36-cell-retrieval-v5-claude.mjs` (Opus subject arm), the trio-judge stages (`13-judge-trio`, `38-judge-trio-v5`), `rescore.mjs`, and the committed N=320 sample/artifacts — is a **ready-made, reproducible Qwen-vs-Opus-on-fixed-substrate skeleton.** Port these into main's `benchmarks/` and repoint `HIVE_MIND_ROOT`/dist paths at `packages/hive-mind-core` (+ build it), rather than authoring against the mirror.
5. **Local arms work either way.** The local stack (SQLite + sqlite-vec + inprocess ONNX embeddings + ONNX reranker) is identical in both and needs no keys — so the OSS-model (Qwen-local) arm is fully sovereign regardless of which checkout supplies the substrate. This is a non-discriminator.

**Drift flags that matter for the benchmark:**
- ✅ Reranker: at parity (byte-identical) — safe to assume same behavior.
- ✅ Temporal/date-window/scoring/raw-detail-lane: forward-ported 2026-06-12, content-equivalent.
- ⚠️ `llm-extractor.ts` exists here but not in main's `mind/` — verify its monorepo home before depending on it (the benchmark recall path doesn't need it, so low risk).
- ⚠️ `evolution-runs/execution-traces/improvement-signals` absent here by design (OSS-excluded) — irrelevant to retrieval; do not treat as drift.
- ⚠️ If the benchmark wants the v5 **distilled-dense facts** lane (53 facts/conv, the lever that drove 73%), note the LoCoMo runners do their OWN distillation (`28-distill-memory-facts.mjs`, `31-distill-dense.mjs`) outside the substrate — that distillation step is benchmark harness logic, must be ported alongside the runners.

---

## Appendix — key paths

| Purpose | Path |
|---|---|
| Substrate (this checkout) | `D:/Projects/hive-mind/packages/core/src/{mind,harvest}/` |
| Substrate (canonical, USE THIS) | `D:/Projects/waggle-os/packages/hive-mind-core/src/{mind,harvest}/` |
| HybridSearch + reranker options | `…/mind/search.ts` (class HybridSearch L119; rerank L270-289) |
| Cross-encoder reranker | `…/mind/inprocess-reranker.ts` (Xenova/ms-marco-MiniLM-L-6-v2) |
| Embedding provider (auto chain) | `…/mind/embedding-provider.ts` (inprocess→ollama→voyage→openai→mock) |
| Local vector DB | `…/mind/db.ts` (better-sqlite3 + sqlite-vec vec0) |
| Recall entrypoint (CLI) | `D:/Projects/hive-mind/packages/cli/src/commands/recall-context.ts` |
| **Qwen subject arm (reuse)** | `D:/Projects/hive-mind/benchmarks/locomo/34-cell-retrieval-v4-qwen.mjs` |
| **Opus subject arm (reuse)** | `D:/Projects/hive-mind/benchmarks/locomo/36-cell-retrieval-v5-claude.mjs` |
| Trio judge stages | `…/benchmarks/locomo/{13-judge-trio,38-judge-trio-v5,38b-redo-trio-failures}.mjs` |
| Published result | `D:/Projects/hive-mind/benchmarks/locomo/RESULTS.md` (73.1% Opus / 73.4% Qwen) |
| Benchmark recipe | `…/benchmarks/locomo/docs/{LOCOMO-PLAN,MEM0-METHODOLOGY}.md` |
| PromptAssembler (only in main) | `D:/Projects/waggle-os/packages/agent/src/prompt-assembler.ts` |
| Parity commit | `23e15ff` (mono-parity 2026-06-12), merged in `bc4eba1` (PR #14) |
