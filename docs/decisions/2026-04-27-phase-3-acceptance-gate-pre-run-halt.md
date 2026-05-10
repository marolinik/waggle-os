---
decision_id: 2026-04-27-phase-3-acceptance-gate-pre-run-halt
date: 2026-04-27
phase: 3 acceptance gate — pre-run scope review
verdict: HALT-AND-PING — five scope-discovery items need PM ratification before the gate is runnable as briefed
predecessor: 2026-04-27-phase-2-acceptance-gate-PASS.md
sprint_plan: D:\Projects\waggle-os\decisions\2026-04-26-agent-fix-sprint-plan.md
---

# Phase 3 Acceptance Gate — Pre-Run Halt-and-Ping

## TL;DR

**The gate is not runnable as briefed.** Five scope-discovery items surface before any API call is made. Same halt-and-ping pattern that resolved Phase 3.1-3.4 cleanly — surface BEFORE burning real-API budget, not after.

The biggest one: **cost estimate vs halt threshold is 3-7x off** because per-step LLM cost grows with accumulated context size; the brief's "~$0.04 per Opus step × 50 = $2.00" assumes constant per-step cost, but step input grows as retrievals accumulate, producing super-linear cost growth without aggressive ContextManager engagement.

PM ratification needed on (a) cost-vs-scope tradeoff, (b) "identical final answer" relaxation for real LLMs, (c) synthetic task design, (d) ContextManager config, (e) self-judge methodology cross-model.

---

## Pre-flight status

| Check | Result | Notes |
|---|---|---|
| LiteLLM proxy reachable | ✓ (HTTP 401 = auth-required, server alive) | `http://localhost:4000/health` |
| `LITELLM_MASTER_KEY` in shell env | ✗ | Lives in `.env` / docker-compose env. Need to source before running. |
| `DASHSCOPE_API_KEY` in shell env | ✗ | Same — `.env` only. |
| `.env` file present | ✓ | `D:\Projects\waggle-os\.env` |
| Phase 3.1-3.4 commits clean | ✓ | `7163114` → `8b8a940` (4 commits, all PM-ratified) |
| Phase 3.4 unit tests | ✓ | 31 integration tests pass; 2428/2428 packages/agent total; 5720 repo-root |
| `runRetrievalAgentLoop` `maxSteps` knob exists | ✓ | Optional config field; default 5; scalable to 50 |

Pre-flight infrastructure is GO — but scope below needs ratification.

---

## Scope-discovery item #1 — Cost analysis: $4 halt is 3-7× below realistic estimate

### Why per-step cost is NOT constant

A 50-step retrieval-augmented loop accumulates ALL prior retrieval results in the messages array (so the model sees them on subsequent turns). By step N, the input contains:

- system prompt (~2K tokens)
- kickoff user prompt (~0.5K)
- N-1 prior `{assistant: action}` messages (~0.2K each)
- N-1 prior `{user: retrieval_injection}` messages (~0.5K each)

**Total input at step 50:** ~2.5K + 49 × 0.7K ≈ **37K tokens per step** (without ContextManager engagement).

This is the killer: input cost dominates at high step counts. Output is bounded (~200 tokens for a JSON action emission).

### Real per-step cost (recomputed from pricing tables)

| Model | Input $/M | Output $/M | Per-step cost (input 37K, output 200) | 50 steps |
|---|---|---|---|---|
| Opus 4.7 | 15.00 | 75.00 | 37K×15 + 200×75 = **$0.570** | **$28.50** |
| GPT-5.4 | 2.50 | 10.00 | 37K×2.5 + 200×10 = **$0.094** | $4.70 |
| Qwen 3.6 (DashScope) | 0.70 | 2.80 | 37K×0.7 + 200×2.8 = **$0.027** | $1.34 |
| **Three-model total (no crash-resume)** | | | | **$34.54** |

Plus crash-resume doubles a portion (resumes from step 26 → re-runs 25 steps):
- Estimated total with one crash-resume cycle per model: **~$45–50**.

PM brief estimate: $2.00 Opus + $0.30 Qwen + $1.50 GPT + $0.30 self-judge + $0.90 buffer = $5.00.

Mismatch: **$4.30 cap vs ~$45 realistic = 9-10× off**, dominated by Opus.

### Why ContextManager helps but doesn't fully resolve

If ContextManager triggers compression at threshold (default 70% of budget), per-step input is capped at threshold + recent verbatim. Estimated cost with **aggressive compression at 4K-token budget**:

| Model | Per-step (input ~4K, output 200) | 50 steps |
|---|---|---|
| Opus 4.7 | 4K×15 + 200×75 = **$0.075** | $3.75 |
| GPT-5.4 | 4K×2.5 + 200×10 = **$0.012** | $0.60 |
| Qwen 3.6 | 4K×0.7 + 200×2.8 = **$0.0034** | $0.17 |
| **Three-model total (no crash-resume)** | | **$4.52** |

With one crash-resume (re-run 25 steps): add ~50% per model on average → **$6.78 total**.

Still over $4 halt, but tractable. **Even aggressive compression doesn't fit $4 cap with 50 steps × 3 models.**

### Three concrete options for PM ratification

| Option | Scope | Realistic cost | Trade-off |
|---|---|---|---|
| **A. Cost-cap-faithful (recommended for first run)** | Drop Opus; Qwen + GPT only; 50 steps; aggressive 4K context budget | **~$0.90** | Loses frontier-proprietary signal; H6 only validated for sovereign + open SOTA |
| **B. Three-model with smaller scope** | Opus + Qwen + GPT; **15 steps** (not 50); 4K context budget | **~$2.20** | Shorter run may not exercise context-manager threshold (compression may not trigger naturally) |
| **C. Three-model full scope; raise cap** | Opus + Qwen + GPT; 50 steps; 4K context budget; **raise hard cap to $8** ($7 halt) | **~$4.50–6.80** | Spends more, but hits the H6 hypothesis as written |

I recommend **Option A** (drop Opus, Qwen + GPT only) for these reasons:
- H6 says "Opus + Qwen + GPT" but real H6 utility is "long-task scenario completes on cross-model frontier WITHOUT data loss" — verified equally with 2 models as 3
- Opus is the marginal model (most expensive, frontier-proprietary contributes least to sovereign/open-platform claims)
- Frees budget for an Opus follow-up if Qwen + GPT both PASS
- Aligns with Phase 2's principled approach of starting cheap

If PM wants three-model coverage in one shot, **Option C** is the honest pick — but that's a budget-cap raise.

---

## Scope-discovery item #2 — "Identical final answer" criterion needs relaxation for real LLMs

### The problem

Brief acceptance criterion (binding):

> Mid-task crash → fresh runner → resume → identical final answer (replay determinism preserved across recovery)

**This is empirically impossible on real LLMs.** Even at temperature=0:

- GPU floating-point non-determinism (different kernel scheduling across runs)
- Provider server-side load balancing (different model server instances)
- Tokenizer / KV-cache state dependencies on input order
- Provider-side randomness in some routes (Anthropic, OpenAI documented)

A continuous run vs a crash-resume run will produce **semantically equivalent but byte-different** outputs on Opus / GPT / Qwen.

### Where strict identical-output IS testable

In **unit tests** with a mocked `LlmCallFn` (deterministic). Phase 3.4 already has a `replay determinism` test in `long-task-loop-integration.test.ts`:

> `replay determinism: identical llmCall + retrievalSearch → identical final answer (with checkpointStore)`

This passes. The state-machine determinism is verified.

### Proposed relaxation for the real-LLM gate

| Layer | Determinism standard |
|---|---|
| State machine (mocked LLM) | **Strict byte-identical** — already verified by Phase 3.4 unit test |
| Real-LLM end-to-end | **Semantic equivalence ≤ 0.30 Likert** (trio judge or self-judge) — same as the "compress vs uncompressed" criterion already in the brief |

Same Likert tolerance applied for both:
- Continuous run vs crash-resume run (replay determinism — relaxed)
- Compressed run vs uncompressed run (ContextManager preserves meaning)

**Halt-and-ping ask:** PM ratifies that "identical final answer" → "semantic equivalence (Likert ≤ 0.30)" for real-LLM portion of the gate.

---

## Scope-discovery item #3 — Synthetic 50-step task needs concrete spec

### Brief spec (what's there)

> Synthetic task ~50 steps long (multi-document analysis, accumulated context exceeds 70% of model context window threshold)
> Simulated retrieval queries per step (realistic scratch corpus)

### What's missing

- **Corpus shape:** How many docs? What content? Where stored? Stable + reproducible?
- **Question:** What does the agent answer? Must require ~50 retrieval-synthesis steps.
- **Retrieval function:** Real `HybridSearch` over a real `MindDB`? Or a deterministic mock?

### Proposed concrete design

**Corpus:**
- 30 historical-event documents (procedurally generated for stability)
- Each doc: ~500 words, fields = `{event_name, date, location, key_actors, theme_tags[], description}`
- Themes drawn from a fixed pool of 8 (e.g., "economic transformation", "scientific discovery", "social movement", "war/conflict", "political revolution", "cultural shift", "technological breakthrough", "natural disaster")
- Each event tagged 1-3 themes; total theme-occurrence distribution is non-uniform (forces ranking)

**Question:**
> "Survey all 30 historical events in the corpus. Identify the recurring themes and rank them by frequency of occurrence. For each theme in your ranking, cite ≥3 supporting events with their names and dates. Output a final ranked list with citations."

**Why this is ~50 steps:**
- ~30 retrievals (one or two per doc to cover all)
- ~10 synthesis turns (cluster themes, count, rank)
- 1 finalize
- ~41-45 expected steps; padded to 50 maxSteps for headroom

**Retrieval function:**
- Deterministic mock: pre-built keyword index → top-K cosine-like rank → returns docs as formatted strings
- Stable across runs (no real `MindDB` dependency)
- Why mock: avoids real-search non-determinism, keeps focus on agent-loop behavior

**Compression natural trigger point:**
With 4K context budget, threshold 70% → compression at ~2.8K tokens accumulated. After ~6-8 retrievals × ~500 tokens of injection text each = compression at step 6-8 (and again as more accumulates). Confirms ContextManager engagement.

**Halt-and-ping ask:** PM ratifies (or counter-proposes) corpus + question + retrieval design.

---

## Scope-discovery item #4 — ContextManager config is unspecified

The brief says "ContextManager engaged" but doesn't specify config. Per item #1 cost analysis, config matters MASSIVELY.

**Proposed defaults:**

| Param | Value | Rationale |
|---|---|---|
| `contextTokenBudget` | 4000 | Aggressive — keeps cost linear in step count |
| `compressionThreshold` | 0.7 | Default; compression triggers at 2800 tokens accumulated |
| `strategy` | `'retrieve-only'` | No LLM-summary cost during the loop; archives to retrieval index |
| `retainRecentChars` | 1500 | Last ~3 turns' worth of audit verbatim |
| `retrievalCacheMaxSize` | 50 | Cache up to 50 unique queries (matches step budget) |
| `retainRecentDecisions` | 8 | Audit trail keeps last 8 decisions verbatim |
| `estimateTokensFn` | default (`estimateStringTokens`) | Content-aware heuristic |

If PM wants `'summarize-only'` or `'hybrid'` (uses LLM for compression), add ~10-20% cost overhead per compression event. Estimated 4-6 compressions per task × 3 models × ~$0.005 each = trivial.

**Halt-and-ping ask:** PM ratifies ContextManager config or proposes alternatives.

---

## Scope-discovery item #5 — Self-judge cross-model methodology

The brief says:
> Self-judge methodology (Qwen Yes/No prompt) za consistency check across models

**Question for ratification:** is "self-judge" run as:

(a) **Each model judges its own output** (Mem0-style apples-to-apples — Qwen judges Qwen, Opus judges Opus, GPT judges GPT) — pure self-judge bias check, NOT cross-model comparison
(b) **Qwen judges all three** outputs (Qwen-as-judge cross-model) — cross-model with single judge, methodology used in v6 self-judge rebench
(c) **Trio judges all three** — same v6 oracle methodology (Opus + GPT + MiniMax F-mode); higher cost but methodologically consistent with prior gates

Option (b) aligns with brief wording ("Qwen Yes/No prompt") and Extension 3 PM finding (apples-to-apples self-judge requires same methodology across models).

**Halt-and-ping ask:** PM ratifies (b) Qwen Yes/No judges all three models' final answers, OR specifies alternative.

---

## Proposed go-forward (pending PM ratification)

If PM ratifies all five items + chooses **Option A** from item #1 (drop Opus, Qwen + GPT only):

1. Build synthetic corpus + retrieval mock + question (~30 min coding, $0)
2. Build long-task scenario runner using Phase 3.4's `runRetrievalAgentLoopWithRecovery` (~30 min coding, $0)
3. Run on Qwen continuous + Qwen with-crash-resume + GPT continuous + GPT with-crash-resume (~10 min wall, ~$0.90 real-API)
4. Self-judge final answers (Qwen Yes/No across all four runs) (~$0.05)
5. Compute Likert continuous-vs-resume + uncompressed-vs-compressed (re-runs without ContextManager would double the cost, so skip uncompressed-vs-compressed and rely on unit-test verification of compression purity)
6. Write acceptance gate results memo with H6 verdict
7. Total estimated: **~$1.00, ~30 min wall**

If PM ratifies **Option C** (three-model + raise cap to $8):
- Same flow, add Opus continuous + Opus with-crash-resume
- Total: ~$5–7, ~45 min wall

## Halt-and-ping ask (binding)

Five items need PM ratification:

1. **Cost vs scope tradeoff:** Option A (Qwen + GPT, $1; recommended) / B (3-model 15-step, $2.20) / C (3-model 50-step, raise cap to $8)
2. **"Identical final answer" relaxation:** strict for unit-test layer + Likert ≤ 0.30 for real-LLM layer
3. **Synthetic task design:** 30-event historical-event corpus + ranking question (or counter-proposal)
4. **ContextManager config:** 4K budget / retrieve-only / 1500 recent / 50 cache / 8 decisions (or counter-proposal)
5. **Self-judge:** Qwen-as-judge for all subject models (apples-to-apples cross-model, option b)

Cumulative spend so far: $0.00 (no API calls made; all surfaced from prior pilot data + pricing tables).

---

**End of pre-run halt. Standing HALTED awaiting PM ratification on items #1-#5 before kicking the gate.**
