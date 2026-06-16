# Harness SOTA Recon — (A) Memory Toggle Mechanism + Leakage Protocol, (B) Publishable-Claim Rigor Template

**Author:** research agent · **Date:** 2026-06-16 · **Status:** recon for the harness-benchmark design
**Scope:** Two jobs. (A) How recalled memory enters the agent context and how the benchmark harness toggles memory on/off, plus the leakage-prevention protocol. (B) The exact methodology of the existing MEMORY SOTA claim, distilled into a reusable rigor checklist the harness benchmark must match or exceed.

> Citations: code is `path:line`; numbers are quoted from the named result/handoff doc. Where I could not verify, it is stated under "Open gaps / risks".

---

# JOB A — The Memory Toggle: how recalled memory enters context, and how the harness flips it on/off

## A.1 Production recall path (what "memory-on" actually injects)

In production, the agent's memory enters context through **two distinct channels** built by `Orchestrator`:

1. **Preloaded session context** — `buildSystemPrompt()` (`packages/agent/src/orchestrator.ts:301-341`) assembles three sections: Identity (`:306-310`), Self-awareness (`:313-329`), and "Context From Your Memory" (`:332-337`) which calls `loadRecentContext()`. This is *recency-based*, not query-relevant — it preloads the last N frames regardless of the user query.

2. **Query-relevant recall** — `recallMemory(query, limit, opts)` (`packages/agent/src/orchestrator.ts:453-814`) is the load-bearing retrieval. It runs HybridSearch over the active mind(s) and renders a `# Recalled Memories` block (`:779-794`). As of the W4 production port this is a **7-lane** retrieval (handoff `project_session_handoff_0611_s3.md`, "Production recall now runs 6 of 7 benchmark lanes"):
   - importance lane (critical/important, K=5, `:553-575`)
   - date-window lane (deterministic period parser → `since`/`until`, `:526-546`)
   - semantic/keyword RRF lane via `HybridSearch.search` (`:535-538`)
   - extraction lanes: Profiles / Facts(60) / Events(40 chronological) via `[mind-*]` prefix frames (`:602-682`)
   - cross-encoder reranker, DEFAULT-ON (`:438-451`, kill switch `WAGGLE_RERANKER=0`)
   - RAWDETAIL verbatim-excerpt lane (`:710-739`, requires reranker, kill switch `WAGGLE_RAWDETAIL=0`)

   The rendered block carries `TEMPORAL_GUIDANCE` + a reference-date anchor (`:772-794`) and an explicit **anti-confabulation / honest-provenance instruction** (`:779-786`): state only what the memories say, attribute provenance, never claim continuity on a first turn.

**Substrate primitives** (read at a glance):
- `HybridSearch.search` (`packages/hive-mind-core/src/mind/search.ts:117-256`): RRF fusion (`RRF_K=60`, `:43`) of keyword (FTS5) + vector (sqlite-vec) lanes; optional `since/until` temporal filter (`:174-197`); optional cross-encoder reranker on top-30 pool (`:235-253`, soft-fails to RRF order). Chunk-level retrieval is DEFAULT-ON (`chunkRetrievalEnabled`, `:63-65`, kill switch `WAGGLE_CHUNK_RETRIEVAL=0`).
- `scoring.ts` (`packages/hive-mind-core/src/mind/scoring.ts:22-27`): `computeRelevance` = weighted temporal/popularity/contextual/importance. **Known gap (`:12-21`):** no production caller passes `graphDistances`, so the `contextual` dimension (20% of 'balanced') is a uniform constant 0 — ranking-neutral but documented dead weight (KnowledgeGraph contributes 0 to recall).
- `frames.ts`: SQLite-backed frame CRUD + FTS index (the `memory_frames` table is the unit of recall).

## A.2 Harness recall path — the four-cell ablation and what "filtered = memory-on" really means

`benchmarks/harness/README.md:6-23` defines the four-cell grid:

| Cell | Memory | Prompt-evolution | What it injects |
|------|--------|------------------|-----------------|
| `raw` | no | no | LLM only, stateless |
| `filtered` | **yes** | no | memory-layer contribution isolated |
| `compressed` | no | yes | GEPA prompt-evolution isolated |
| `full-context` | yes | yes | joint memory × evolution |

**CRITICAL FINDING — the four named cells are NOT the real memory toggle. There are two generations of cells in `cells.ts`, and the README's `filtered`/`full-context` are LEAKING SCAFFOLD PROXIES, not real recall.**

- `cells.filtered` (`benchmarks/harness/src/cells.ts:300-306`) calls `buildUserPromptRetrieved(instance)` (`:181-187`), which injects **`instance.context` verbatim** — the dataset's oracle/gold-selected context — framed as "Retrieved context (from session memory)". It runs **no HybridSearch at all.** The file header (`:1-23`) labels `filtered` a "Sprint 9 scaffold proxy — retained for back-compat" and explicitly names the real replacement: **the `retrieval` cell.**
- The honest, real-substrate cells are:
  - **`retrieval`** (`:337-350`): real `@waggle/core::HybridSearch` RRF recall, conv-scoped via `gopId`, top-K=20, formatted into the `# Recalled Memories` block (`formatRecalledMemories`, `:193-203`).
  - **`agentic`** (`:370-462`): real `runAgentLoop` with a single `search_memory` tool (`makeSearchMemoryTool`, `:223-267`), 3-turn cap, `gopId`-bound, forced-answer fallback.
  - **`no-context`** (`:480-486`): true zero-memory baseline (question-only). The header notes (`:464-479`) that `raw` is NOT zero-memory on LoCoMo — it embeds the oracle `instance.context` — so it was re-aliased `oracle-context` and `no-context` is the honest comparator.

**Operational definition of "harness + memory" for a publishable claim:**
> "harness + memory" = the **`retrieval`** cell (or `agentic` for tool-using recall): the LoCoMo corpus is ingested turn-by-turn into a fresh ephemeral `MindDB` (`substrate.ts:58-79`), and at inference time the model sees **only** what `HybridSearch.search(question, {gopId, limit})` returns from that ingested corpus — the same production code path. The honest memory-lift contrast is `retrieval − no-context` (manifest-v4 §1: `≥5pp`, Fisher one-sided p<0.10). **Do NOT use `filtered`/`full-context` for the SOTA claim** — they feed oracle context and measure prompt format, not retrieval.

## A.3 The central validity threat — test-answer leakage into memory, and the protocol to prevent it

Memory must be built **only from legitimately-available conversation context, never from gold answers or question metadata.** Four leakage vectors and the controls already present (or required):

### Leakage vector 1 — Oracle context masquerading as recall (PRESENT in the legacy cells)
`filtered`/`full-context` inject `instance.context` (the dataset's curated evidence) as "retrieved memory" (`cells.ts:181-187, 300-322`). On LoCoMo the `instance.context` is the *oracle-selected* evidence turn(s) for that question — i.e. retrieval is "solved" for free. **This is leakage by construction for any memory-quality claim.**
→ **Control:** the publishable claim must use `retrieval`/`agentic`, which ingest raw turns and retrieve at inference. The manifest already encodes this: manifest-v4 §3 cells 1 (`no-context`) and 4 (`retrieval`) are the honest pair; §2 alias `oracle-context` is explicitly "cannot claim direct comparability" (manifest-v4 §12).

### Leakage vector 2 — Gold answers entering the ingested corpus
The LoCoMo ingest (`ingest.ts:87-129`) extracts **only `turn.text`** from `session_N` arrays and writes `{speaker}: {text}` frames (`:123`). It **ignores the `qa` array** (`LocomoRawSample.qa`, `:52`) entirely — questions and gold answers are never ingested. ✓ This is the correct boundary.
→ **Control to lock:** assert in the harness that no frame content contains any gold-answer string and that the `qa` field is never read by the ingest path. The blip-caption parity patch (handoff s3: 1,226 turns patched to include `[Shared image: {query — blip_caption}]`) is the one place image *captions* enter the corpus — verify those captions are part of the **conversation turn**, not the QA gold (the handoff frames it as "INPUT parity with the published protocol" — the captions are conversation content Memori also ingests, not answers).

### Leakage vector 3 — Conversation scope (cross-conversation contamination)
LoCoMo QA pairs are conversation-local. Whole-corpus search leaks evidence from *other* conversations: manifest-v4 §1 documents that whole-corpus search "leaked 8/20 retrievals to other conversations for instance 0 of conv-26, while conv-scope returned 20/20 from conv-26." 
→ **Control (already locked):** every retrieval/agentic search is scoped to `gopId = instance.conversation_id` (`cells.ts:341, 380`; manifest-v4 §6 "scope filter"), and the agent **cannot override** the binding (the tool exposes no `gopId` param, `cells.ts:215-220`). Scope is a benchmark invariant, not an agent decision.

### Leakage vector 4 — Embedder / model memorization & answer-time peeking
The subject model could "know" LoCoMo from pretraining, or the prompt could smuggle the answer.
→ **Controls:** (a) `no-context` baseline measures exactly the parametric-knowledge floor — memory-lift is `retrieval − no-context`, which nets out memorization. (b) Embedder is **local** (`createOllamaEmbedder`, nomic-embed-text, $0, `substrate.ts:14-17`) — no external call that could leak. (c) `temperature=0` for reproducibility (harness README:117). (d) The production recall block runs `scanForInjection` on recalled text (`orchestrator.ts:760-770`) — a poisoned frame can't smuggle instructions; this should be retained in the harness recall path too.

### The leakage-prevention protocol (assert these as ex-ante harness invariants)
1. **Memory is built from conversation turns only.** Ingest reads `session_N[].text` (+ legitimately-shared image captions); it never reads `qa`, `answer`, `evidence`, or `category`. (assert: no gold-answer substring appears in any frame)
2. **No oracle context.** The claim cell is `retrieval`/`agentic`, never `filtered`/`full-context`/`raw`(=oracle on LoCoMo). Report `no-context` as the floor.
3. **Scope is conversation-local and agent-non-overridable.** `gopId`-bound search; verify 0 cross-conversation hits in a spot audit.
4. **Retrieval is at inference time over the ingested corpus**, using the production `HybridSearch` code path (manifest-v4 §11 freezes cell + substrate code for the run).
5. **Local embedder, T=0, fixed seed.** No external retrieval/embedding service.
6. **Injection-scan recalled memory** before it reaches the model (port `scanForInjection` into the harness recall, as production does).
7. **Pre-register the memory-on definition** (which cell, which K, which lanes, which kill-switch states) in the manifest BEFORE the run; freeze the code at a SHA.

---

# JOB B — The Rigor Template: methodology of the existing MEMORY SOTA claim

## B.1 The headline numbers (and exactly which protocol produced each)

**There are TWO judging regimes in play. A skeptical reviewer will conflate them — do not.**

### Regime 1 — LoCoMo "87.66 SOTA" claim (Memori protocol, SINGLE judge)
Source: `benchmarks/results/memori-phase22-RESULT.md` (WAVE 3.3 + ARC COMPLETE sections) and handoff `project_session_handoff_0611_s3.md`.
- **Headline:** LoCoMo overall **87.66** (1350/1540), vs Memori published **81.95** → **+5.71pp, z=4.42, p<10⁻⁵** (one-sample z vs published value). (`memori-phase22-RESULT.md` "ARC COMPLETE" + W3.3 table)
- **Per-category (W3.3):** single-hop 92.75 (z=3.16 vs base), multi-hop 82.98, temporal 83.49, open-ended 70.83. Token cost 3,747/q vs Memori 1,294. (W3.3 table)
- **N = 1540**, adversarial category excluded; canonical stratification **single 841 / multi 282 / temporal 321 / open 96** (audited correct vs MemR3 §C.3 canon; MEMORY-SOTA-PROPOSAL §0).
- **Answerer + Judge: BOTH `gpt-4.1-mini`, temperature 0**, using Mem0/Memori's verbatim "be-generous" `ACCURACY_PROMPT` (byte-identical across arms). Overall = count-weighted micro-average. (`memori-head-to-head-RESULT-2026-06-09.md:11`)
- **Ruler validation:** reproduced Memori's own `02_run_benchmark.ipynb` at **81.98%** vs their published 81.95% (within 0.03pp) — the ruler is trustworthy (`memori-head-to-head:7`).
- **Significance test:** **two-proportion z-test** per category, full N, ours-vs-previous-wave (per-wave gate, e.g. W3.3 single-hop z=3.16 p<0.002, overall z=2.15 p<0.05); plus a **one-sample z vs Memori's published 81.95** for the field claim (z=4.42). (W3.3 table; ARC COMPLETE)
- **Re-baseline correction (critical to the claim's honesty):** the Memori paper's Table 1 baselines are **column-scrambled** (Du et al./MemR3 values printed under wrong headers). "LangMem temporal 86.92" was its single-hop; real LangMem temporal = 61.06. Our harness labels were audited correct. (MEMORY-SOTA-PROPOSAL §0; memori-phase22-RESULT "SOTA Assessment" correction box)

⚠️ **Honesty caveat the docs themselves flag (`memori-head-to-head:44`):** "Single-judge (gpt-4.1-mini judging gpt-4.1-mini) — symmetric across arms, but absolute numbers carry the usual self-judge leniency; the *relative* deltas are the load-bearing result." **The 87.66 is a single-judge, self-judge number.** It is rigorous *as a same-ruler relative comparison vs Memori* but is NOT trio-strict ensemble-graded.

### Regime 2 — Trio-strict ensemble (the harsher, more publishable judge)
Used for the internal pillar benchmarks (LongMemEval, GAIA stage3) and the harness's built-in ensemble path.
- **LongMemEval:** blend-tuned **75.2% trio-strict (N=100)** (`project_pillar2_longmemeval_result.md`); "trio-strict is the harshest metric; SOTA papers usually single-judge."
- **GAIA stage3 substrate claim:** N=400, **Fisher one-sided p = 8.07×10⁻¹⁸**, +19.25pp retrieval-vs-no-context lift (CLAUDE.md §10 C-2; `benchmarks/results/stage3-n400-v6-final-analysis.md`).
- **LoCoMo v5:** 73.1% Opus / 73.4% Qwen3.6 self; **67.8% trio-strict** (AND-of-3), N=320 stratified, +4.6pp over Mem0 (CLAUDE.md §10 C-1; `manifest-v8-gaia2-preregistration.md:437` "Trio-strict re-judge (67.8% AND-of-3)").

**Trio-strict = AND-of-3: an answer counts correct only if ALL THREE judges vote correct** (`manifest-v8-gaia2-preregistration.yaml:492` "67.8% AND-of-3"). This is the most conservative possible ensemble rule and is the gold standard the harness benchmark should adopt for a public claim.

## B.2 The trio-strict ensemble judge roster (which models, how votes combine, why)

**Judge ensemble (manifest-v4 §5.2 — the locked production roster):**
| Slot | Model | Role | Pinning |
|------|-------|------|---------|
| primary_judge_1 | `claude-opus-4-7` | primary | `anthropic_immutable` |
| primary_judge_2 | `gpt-5.4` | primary | floating_alias |
| primary_judge_3 | `gemini-3.1-pro` | primary | floating_alias |
| tiebreak_reserve | `grok-4.20` | reserve (1/1/1 only) | floating_alias |

- **Why three vendors:** cross-vendor diversity removes single-model leniency/bias; a same-vendor ensemble would correlate errors. (manifest-v4 §5.2 "same physical judge models … no snapshot drift")
- **Why a fourth (Grok) reserve:** breaks a 1-1-1 three-way split without a coin flip (`judge-runner.ts:289-365`); a 1-1-1-1 four-way escalates to PM and the instance is **skipped, never coin-flipped** (`judge-runner.ts:326-343`, "NEVER fabricating a verdict").
- **Vote combination — two operationalizations, both reported:**
  - **Majority vote** (3-0 / 2-1) → the per-cell accuracy used in monotonicity/CI. (`judge-runner.ts:369-385`)
  - **Trio-strict (AND-of-3)** → the harsher "all three agree correct" rate used for SOTA claims (`manifest-v8` 67.8% AND-of-3).
- **Roster note:** the κ *calibration* runs used **Opus 4.7 + GPT + MiniMax** (a swap validated empirically — MiniMax agreed with Opus *more* than GPT did, `v6-kappa-memo.md:15`), and the v5 historical baseline used **Opus + GPT + Gemini**. The exact three-model roster for a given claim must be pinned in that claim's manifest. CLAUDE.md §10 M6 records the locked judge roster as **Opus 4.7 / GPT-5.4 / Gemini 2.5 Pro / Haiku 4.5 (2026-05-21)**.

## B.3 Inter-rater agreement (κ) — values and gates

- **Implementation:** Fleiss' κ (`benchmarks/harness/src/stats/fleiss-kappa.ts`, 1971 formula `:9-16`) on the **pre-tie-break 3-judge vote matrix**; Cohen's κ pairwise for diagnostics.
- **Measured κ (v6 re-cal, n=100, `kappa-v6-analysis.md` / `v6-kappa-memo.md`):**
  - Opus vs GPT **0.8480**, Opus vs MiniMax **0.8549**, GPT vs MiniMax **0.7878**.
  - **Conservative trio κ = min pairwise = 0.7878** → PASS.
  - v5 historical baseline: Fleiss κ **0.7458** three-way (Opus+GPT+Gemini).
  - Per-cell κ ranges 0.6875 (agentic, borderline-flagged) → 1.0000 (no-context). (`kappa-v6-analysis.md §4`)
- **κ gates (manifest-v4 §5.2 / kappa memo):** pass-no-flag **κ ≥ 0.65**; pass-with-flag **[0.60, 0.65]**; **HALT ≤ 0.60**. (A3 LOCK §4 also cites a mid-run abort at κ<0.60.)
- **Methodology lock referenced:** Fleiss' κ = 0.8784 in one lock, 0.7458 in v5 — the point is κ is **measured and gated**, not assumed.

## B.4 Sample size, stratification, significance tests, CIs

- **N:** LoCoMo full = **1540** (or 1531 canonical after 9 drops, manifest-v4 §4); GAIA stage3 = **400**; LongMemEval pillar = **100**; LoCoMo trio-strict re-judge = **320**.
- **Stratification:** LoCoMo by category — single 841 / multi 282 / temporal 321 / open 96 (canon, MEMORY-SOTA-PROPOSAL §0; manifest-v4 §4 lists 841/281/320/89 for the 1531 build). **Matched-pairs design:** the same seed-42 instances flow through every cell (manifest-v4 §3 "matched-pairs").
- **Significance tests used:**
  - **Two-proportion z-test** per category, full N — the per-wave gate (memori-phase22-RESULT, every wave table).
  - **One-sample z** vs a published competitor value (e.g. 87.66 vs Memori 81.95 → z=4.42).
  - **Fisher exact one-sided** for the primary memory-lift endpoint (`retrieval − no-context ≥ 5pp`, p<0.10; manifest-v4 §1; GAIA p=8.07e-18).
  - **95% Wilson score interval** for per-cell proportions (`stats/wilson-ci.ts`; Z=1.959964); STRONG-PUBLISHABLE gate = Wilson lower bound ≥ target.
  - **Cluster bootstrap CI** (10,000 iters, seed 42, cluster unit = `conversation_id`) for the hierarchical structure — instance rows within a conversation are NOT independent, so Wilson under-estimates uncertainty (`stats/cluster-bootstrap.ts:1-54`). **This is the most reviewer-defensible CI for LoCoMo.**
- **Power / honesty caveats the docs enforce:** open-domain n=96 → SE ≈ ±5pp, so single-category steps "can't reach significance at this n" (memori-phase22 W1 note); per-step deltas were repeatedly reported as **ns** while only the **cumulative arc** crossed z>1.96 (W2a z=2.71). Mid-run year-match proxies overcounted +10pp and were rejected — **full-N real-judge only** (handoff s1 ops lessons).

## B.5 Pre-registration & reporting discipline (the gold-standard scaffolding)

The benchmark already has a **formal pre-registration system** — this is the single biggest rigor asset to mirror.
- **Manifest pre-registration** (`manifest-v4-preregistration.md`, and v5–v8 in `benchmarks/preregistration/`): committed BEFORE the run, with primary hypothesis (§1), secondary endpoints (§2), sample design (§3), dataset + SHA-256 (§4), model stack (§5), substrate (§6), prompt bytes + SHA-256 (§7), **stopping rules / no-interim-looks** (§8), **post-hoc exclusion policy = NONE** (§9), deviation policy = halt-restart (§10), **code freeze at a SHA** (§11), scope boundaries / what-cannot-be-claimed (§12).
- **Tamper-evident anchoring:** the runner emits `bench.preregistration.manifest_hash` (SHA-256 of the manifest YAML) once per run (`preregistration.ts:212-214`); dataset archive + canonical build are SHA-256 pinned (manifest-v4 §4: raw `79fa87e…`, canonical `39e415e…`). Argv is sanitized of secrets before it enters the audit trail (`preregistration.ts:227-244`).
- **No post-hoc exclusion** (manifest-v4 §9): every emitted eval enters the denominator; judge failures are counted as `evaluator_loss` and reported **separately**, never silently dropped. "Selective exclusion is the single largest source of inflated significance."
- **No interim looks** (manifest-v4 §8): the run does not peek to selectively halt; halt only on budget / streak / health / lock / deviation.
- **Scope honesty** (manifest-v4 §12): explicitly enumerates what CANNOT be claimed (e.g. direct comparability to Mem0 91.6% because of scope differences; multi-model generalization from a single-model run).
- **Reproducibility:** seed=42 fixes instance order + dry-run stub; T=0 on subject + judges; results published per-wave in `benchmarks/results/`.

---

# THE REUSABLE PUBLISHABLE-CLAIM RIGOR CHECKLIST (match or exceed)

The harness benchmark must satisfy ALL of the following to make a defensible public memory-lift claim. Each item cites where the memory claim already meets it.

### 1. Pre-registration (BEFORE the run)
- [ ] Manifest committed before run start: primary hypothesis (directional + test + threshold), secondary endpoints (descriptive), sample design, dataset SHA-256, model stack, substrate config, **exact "memory-on" cell definition** (which cell, K, lanes, kill-switch states), prompt bytes + SHA-256. (template: `manifest-v4-preregistration.md` §1–§7)
- [ ] Manifest hash emitted at run time as the audit anchor (`preregistration.ts:212`).
- [ ] Code frozen at a named SHA for the duration (manifest-v4 §11).

### 2. Sample size & stratification
- [ ] N ≥ 1540 for LoCoMo (full set), category-stratified single/multi/temporal/open with verified canon counts. (memory claim: N=1540, 841/282/321/96)
- [ ] Matched-pairs: identical seed-42 instances through every cell. (manifest-v4 §3)
- [ ] Per-category SE reported; flag any category where n is too small for single-step significance (open n=96 → ±5pp).

### 3. Memory toggle integrity (the leakage firewall — Job A)
- [ ] "Memory-on" = real `HybridSearch` `retrieval`/`agentic` cell, NOT `filtered`/`full-context` (which inject oracle `instance.context`).
- [ ] Honest floor = `no-context`; headline lift = `retrieval − no-context`.
- [ ] Ingest reads conversation turns only; never `qa`/gold answers (assert no gold substring in any frame).
- [ ] Conversation-scoped, agent-non-overridable `gopId` search; spot-audit 0 cross-conversation hits.
- [ ] Local embedder, T=0, fixed seed; injection-scan on recalled memory.

### 4. Judge: trio-strict cross-vendor ensemble (exceed the 87.66 single-judge)
- [ ] **3 distinct-vendor judges** (Opus 4.x + GPT-5.x + Gemini 3.x), pinned in the manifest; tie-break reserve (Grok) for 1-1-1; PM-escalate (skip, never coin-flip) for 1-1-1-1.
- [ ] Report BOTH **majority** and **trio-strict (AND-of-3)** accuracy. The public claim leads with **trio-strict** (the 87.66 LoCoMo number is single-judge self-judge — upgrade it).
- [ ] Judge prompt bytes pinned; judge T=0 (or omitted for temp-rejecting models).

### 5. Inter-rater agreement (κ)
- [ ] Fleiss' κ on the pre-tie-break 3-judge matrix, reported with the claim. (`stats/fleiss-kappa.ts`)
- [ ] κ gate: PASS ≥ 0.65, flag [0.60,0.65], HALT ≤ 0.60. (memory claim: trio κ 0.7878)
- [ ] Per-cell κ reported; borderline cells flagged (agentic dipped to 0.6875).

### 6. Significance tests & CIs
- [ ] Primary endpoint: **Fisher exact one-sided** on memory-lift (≥5pp, p<0.10), OR two-proportion z per category on full N.
- [ ] Field claim: one-sample z vs the (corrected, un-scrambled) published competitor value.
- [ ] **95% CI: cluster bootstrap** (conv-level, 10k iters, seed 42) as primary; Wilson as secondary. Report the Wilson/bootstrap **lower bound**, not just the point estimate.
- [ ] No mid-run proxy metrics — full-N real-judge gating only.

### 7. Reporting & honesty discipline
- [ ] Post-hoc exclusion = NONE; `evaluator_loss` counted + reported separately (manifest-v4 §9).
- [ ] No interim looks; ex-ante stopping rules only (manifest-v4 §8).
- [ ] Scope-boundary section: enumerate what the claim CANNOT say (manifest-v4 §12).
- [ ] Competitor baselines de-scrambled / re-verified before comparison (the Memori column-scramble lesson — MEMORY-SOTA-PROPOSAL §0).
- [ ] Ruler validation: reproduce the competitor's own published number within ~0.1pp before claiming a delta on the same ruler (memory claim: 81.98 vs 81.95).
- [ ] Token cost reported alongside accuracy (the one axis where the memory substrate currently loses: 3,747/q vs 1,294).

---

# Open gaps / risks a skeptical reviewer will attack

1. **The 87.66 headline is single-judge self-judge (gpt-4.1-mini judges gpt-4.1-mini).** Defensible as a same-ruler *relative* delta vs Memori, but a reviewer will discount the *absolute* number for self-judge leniency. The harness benchmark should publish a **trio-strict** number, not inherit the single-judge one. (`memori-head-to-head:44`)
2. **Two judging regimes are easy to conflate.** 87.66 (single GPT-4.1-mini) vs 67.8% trio-strict (AND-of-3) are NOT comparable; presenting both without the regime label invites a "cherry-picked judge" accusation.
3. **The README's `filtered`/`full-context` cells are oracle-leaking proxies** still labeled "memory-on." Anyone running the README literally measures a leaked result. The harness must route the claim through `retrieval`/`agentic` and ideally deprecate/relabel the proxies.
4. **W3.3's two components (caption-parity + raw-detail lane) shipped together; the per-component split is unmeasured** (handoff s3 "attribution caveat"). W3.4 ablation attributed most of the gain to the lane (+2.40) over captions-alone (+0.26), but a reviewer may want the clean ablation cell (raw-detail WITHOUT captions — explicitly noted as never measured, handoff s3 P2).
5. **Competitor numbers were not re-run on our ruler** (Zep/LangMem/Mem0 are from the de-scrambled MemR3 table, not a same-harness head-to-head). Handoff s1/s3 flag this as required "before any public paper-grade claim" — cross-lab LoCoMo numbers are noisy.
6. **`graphDistances` dead weight:** 20% of 'balanced' scoring is constant-0 (KnowledgeGraph contributes nothing to recall). Ranking-neutral, but a reviewer auditing the substrate will notice a documented dead lane. (`scoring.ts:12-21`)
7. **Production vs benchmark substrate parity:** the SOTA numbers were produced by the hive-mind-test harness (NOT a git repo at the time — handoff s1/s3); the W4 port brought production to "6 of 7 lanes." A claim about *production* memory must re-measure on the ported production path, not cite the harness number. (manifest-v4 §12 "cannot claim production performance")
8. **Canon count drift:** MEMORY-SOTA-PROPOSAL/result docs use 841/282/321/96 (N=1540); manifest-v4 §4 uses 841/281/320/89 (N=1531 canonical, 9 dropped). Pin one canonical build + SHA in the new manifest and state it.
9. **LongMemEval trio-strict is only N=100** — the docs themselves queue N=500. A public cross-benchmark transfer claim needs the larger N.
10. **Could not verify** the exact live judge roster used for the 87.66 run beyond "gpt-4.1-mini answerer+judge" (Memori protocol) — the trio-strict roster (Opus/GPT/Gemini/Grok) is from the manifest + GAIA/pillar runs, a DIFFERENT protocol. Confirm the intended roster for the harness benchmark before pre-registering.
