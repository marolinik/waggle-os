# Retrieval V2 + Embeddings Audit Brief

**Date:** 2026-04-26
**Author:** PM
**Status:** Authored awaiting Marko ratification + downstream sequencing
**Target executor:** CC-3 (or CC-1 after Phase 5 re-pilot completion; or CC-2 after Step 3 sync workflow live)
**Scope corollary:** Korak 2 iz 14-step launch plan (memory retrieval V2 + embeddings audit)

---

## §1 — Goal

Production memory retrieval (V1 — `packages/core/src/mind/search.ts` HybridSearch) underperforms substrate ceiling on canonical Stage 3 v6 N=400 LoCoMo benchmark. V2 work closes the gap.

**Empirical anchors (LOCKED, both methodologies cited explicitly per `feedback_config_inheritance_audit.md` Extension 2):**

| Cell | Trio-strict (canonical paper claim) | Self-judge (apples-to-apples per Mem0 methodology) |
|------|-------------------------------------|---------------------------------------------------|
| oracle-context | 33.50% (134/400) | 74.0% (296/400) |
| full-context | 27.25% (109/400) | (TBD if not separately re-judged) |
| retrieval (V1) | **22.25% (89/400)** | (TBD — was reported as ~48% in prior PM docs but methodology unclear) |
| no-context | 3.00% (12/400) | (TBD) |

**Critical finding from Stage 3 v6 trio-strict numbers:** V1 retrieval (22.25%) is *below* full-context (27.25%) by 5pp. This means **V1 retrieval actively hurts vs. giving model entire conversation history**, on synthesis tasks where conversation fits in context window. Retrieval has no production deployment justification at current quality unless context window forces it.

**V2 targets (binding goals — both methodologies):**

- Trio-strict: V1 22.25% → V2 ≥30% (close at least 70% of 11.25pp gap to oracle ceiling)
- Trio-strict: V2 must **beat full-context (27.25%)** as deployment threshold — below this, retrieval is net-negative
- Self-judge: re-judge V1 retrieval JSONL with current self-judge methodology to establish proper baseline; V2 target = close 70% of gap to 74% oracle ceiling
- Production deployment threshold: V2 retrieval must beat full-context on BOTH methodologies, not just one

---

## §2 — Current state audit (V1 implementation)

### 2.1 — search.ts (HybridSearch RRF fusion)

**Implementation summary (verified via direct code read):**

```
keyword (FTS5) || vector (sqlite-vec)  → RRF fusion (K=60)  → relevance multiplier  → final score
```

- RRF_K = 60 hardcoded — standard literature value, no empirical tuning evidence in repo
- Keyword query construction: OR-based (W3.6 commit) with stop word filtering (60+ English stop words) and min word length > 2
- Vector search: sqlite-vec MATCH with k=limit*3 fallback for GOP-scoped, k=limit for global
- No learned reranker (cross-encoder, MS-MARCO style)
- No query expansion (synonyms, entity extraction, KG-aware reformulation)
- No semantic-only fallback path; if both keyword and vector fail, returns empty

**Identified weak points:**

1. **Stop word list is English-only.** Marko's conversational corpus likely includes Serbian (per CLAUDE.md ekavica preference). Multi-language stop word handling is missing. Plus stop word removal is destructive — `"ko je rekao šta"` (`"who said what"` in Serbian) becomes empty after filtering.

2. **Min word length > 2 filters legitimate 2-char tokens** (AI, OK, LM, v6, JS, TS). Domain-specific terminology lost.

3. **OR-based query** maximizes recall but tanks precision. No phrase matching (e.g., `"Q4 strategy"` as bigram), no fuzzy matching for typos/variants.

4. **No re-ranking.** RRF + relevance multiplication is baseline algorithm. Modern memory systems use cross-encoder rerankers on top-K candidates (e.g., cohere-rerank-v3 or local fine-tuned BGE-rerank).

5. **No query expansion.** Question `"what did Marko say about pricing"` does not trigger entity extraction (`Marko` → entity ID for KG traversal) or topic expansion (`pricing` → related concepts).

6. **GOP scope is good** for session-isolated retrieval (per amendment v2 §4 of pilot brief), but does not bridge knowledge graph traversal across sessions when query references cross-session entities.

### 2.2 — scoring.ts (relevance multiplier)

**Implementation summary:**

```
final_score = rrf_score × relevance_score
relevance_score = (temporal × w_t) + (popularity × w_p) + (contextual × w_c) + (importance × w_i)
```

Four hardcoded profiles:
- `balanced`: 0.4/0.2/0.2/0.2
- `recent`: 0.6/0.1/0.2/0.1
- `important`: 0.1/0.1/0.2/0.6
- `connected`: 0.1/0.1/0.6/0.2

Sub-scores:
- temporal: exponential decay, 30-day half-life, 7-day recency boost (1.0 ceiling)
- popularity: `1 + log10(1+access_count) × 0.1` (max ~0.5 boost on 1000 accesses)
- contextual: BFS graph distance (0 → 1.0, 1 → 0.7, 2 → 0.4, 3 → 0.2, else 0)
- importance: `IMPORTANCE_WEIGHTS` (critical=2.0, important=1.5, normal=1.0, temporary=0.7, deprecated=0.3)

**Identified weak points:**

1. **Contextual signal often unused in practice.** `graphDistances` is optional in `ScoringContext`. If caller doesn't pre-compute graph traversal and pass results, contextual = 0 across the board. HybridSearch.search() default flow does NOT compute graph distances — meaning the connected profile's 0.6 weight is multiplied by 0 most of the time. Effectively dead code for typical retrieval calls.

2. **Per-task-type weight tuning is non-existent.** Synthesis tasks may benefit from `important` profile (high importance weight for marked critical knowledge). Coordination tasks may benefit from `recent` (latest thread state matters). But selection requires explicit caller specification — no auto-routing per query type.

3. **Multiplication of rrf × relevance** amplifies bias. If rrf score is high but relevance is borderline (e.g., 0.5), final = rrf * 0.5 — half rank. Additive `rrf + α·relevance` may be more robust. No empirical evidence to justify multiplication choice in repo.

4. **30-day temporal half-life is arbitrary.** Some conversational memory has 365-day relevance (long-running consulting engagement). Some has 24-hour relevance (active incident). Per-user or per-domain tuning missing.

5. **Importance weights are hardcoded.** No empirical calibration against user feedback (did user act on results marked critical vs normal?).

### 2.3 — entity-normalizer.ts

**Implementation summary:** 10 hardcoded alias groups (postgres/postgresql/pg, javascript/js, typescript/ts, kubernetes/k8s, etc.).

**Identified weak points:**

1. **Domain coverage is thin.** Project-specific entities (KVARK, hive-mind, Waggle, Egzakta, LM TEK, ChainSight, Helix, Quanta, NorthLane, etc.) not in list. No mechanism to extend list per-deployment.

2. **No fuzzy matching.** `"GitHub"` → `"github"` works (case-only). `"Git Hub"` → no match. Lemmatization absent (`"Markov"` → `"Marko"` for possessive forms).

3. **No entity extraction from text.** Entity normalizer normalizes entities given as input; does not extract candidates from unstructured text. Knowledge graph population depends on external entity extraction (probably LLM call in harvest pipeline).

### 2.4 — embedding-provider.ts (provider chain + tier gating)

**Implementation summary:**

- Provider chain (auto-detect): `inprocess` → `ollama` → `voyage` → `openai` → `mock` fallback
- Default models per provider:
  - inprocess: `Xenova/all-MiniLM-L6-v2` (384 native dimensions)
  - ollama: `nomic-embed-text` (768 native)
  - voyage: `voyage-3-lite` (TBD native dims)
  - openai: `text-embedding-3-small` (1536 native, configurable)
- Default `targetDimensions = 1024` — pads or truncates from native to 1024
- Tier gating + monthly quota tracking (Solo/Pro/Teams capabilities)
- Mock fallback is deterministic but **semantically meaningless** (TextEncoder bytes / 128); explicitly documented as last resort

**Identified weak points:**

1. **Default inprocess model `Xenova/all-MiniLM-L6-v2` is small (22M params, 384 native dims).** Modern competitive embedding models are 100M-1B+ parameters: BGE-base-en-v1.5 (110M, 768 dims), nomic-embed-text-v1.5 (137M, 768 dims), gte-Qwen2-1.5B-instruct (1.5B, 1536 dims). MiniLM-L6 is 2019-era technology; conversational memory benchmarks favor newer models by 5-10pp.

2. **Padding/truncation to 1024 is suboptimal.** If native is 384, padding to 1024 with zeros wastes 60% of vector space and dilutes similarity scores. If native is 1536, truncation to 1024 throws away 33% of learned signal. Native-dim retention with per-model configuration is better.

3. **Mock fallback path is invisible to caller in production failures.** If real provider fails mid-run, embedder silently switches to mock. Retrieval quality collapses but no surfaced telemetry. Phase 5 of agent fix sprint (re-pilot) MUST verify this didn't happen during Stage 3 v6 — if mock fallback was active for any portion, V1 retrieval baseline 22.25% may be over-pessimistic (real provider would do better).

4. **No re-embedding strategy on model upgrade.** If we upgrade from MiniLM-L6 to BGE-base, all stored embeddings are stale. No migration path; manual re-embed required.

5. **Stage 3 v6 actual embedder used during retrieval cell run is not documented in summary.** Need audit of `stage3-n400-v6-final-analysis.md` or equivalent to confirm which provider was active. If mock, retrieval baseline is misleading.

### 2.5 — Memory sync state for retrieval files

Per Memory Sync Audit (`decisions/2026-04-26-memory-sync-audit.md`), waggle-os and hive-mind have divergent `mind/` substrate:

- `search.ts` waggle-os 8440 bytes vs hive-mind 8689 bytes (hive-mind +3%)
- `scoring.ts` waggle-os 2887 vs hive-mind 3386 (hive-mind +17%)
- `entity-normalizer.ts` waggle-os 1167 vs hive-mind 1627 (hive-mind +39%)
- `embedding-provider.ts` waggle-os 16694 vs hive-mind 11047 (waggle-os +51%, but waggle-os has tier-gating + quota tracking that hive-mind doesn't per EXTRACTION.md scrub)

V2 work MUST start after Memory Sync Step 3 (CI/CD sync workflow) is live. Otherwise V2 changes will land in one repo and divergence will grow.

---

## §3 — Five V2 directions (binding work scope)

Per arxiv §5.3 + §7 Future Work + this audit:

### 3.1 — Direction A: Embedding model upgrade

**Hypothesis:** Default `Xenova/all-MiniLM-L6-v2` (2019-era, 384-dim) under-performs modern models by 5-10pp on conversational memory recall.

**Implementation:**
- Add `bge-base-en-v1.5` (or `bge-large-en-v1.5` for higher quality) as new in-process option via `@xenova/transformers` or `transformers.js`
- Add `gte-Qwen2-1.5B-instruct` via Ollama for users with GPU
- Add `nomic-embed-text-v1.5` as Ollama default upgrade (already supported, but version pinned)
- Per-model `nativeDimensions` exposed; abandon padding/truncation in favor of model-native dim throughout pipeline
- Add per-user `embedding_model_version` field in DB schema; migration: if field changes, re-embed all frames in background
- Telemetry hook: surface mock-fallback events to caller (so Phase 5 re-pilot can verify real embedder was used)

**Empirical validation:** ablation N=20-30 on retrieval cell with each candidate model (MiniLM-L6 baseline, BGE-base, BGE-large, nomic-v1.5, gte-Qwen2) — measure trio-strict accuracy delta and per-task-type breakdown.

**Cost:** ~$5-10 per ablation run × 5 models = $25-50.

### 3.2 — Direction B: Hybrid scoring weight optimization

**Hypothesis:** Fixed 4-profile scoring weights are suboptimal. Per-task-type tuning (factoid vs synthesis vs coordination vs decision support) plus learned per-user preference can lift retrieval recall.

**Implementation:**
- Add `task_type` parameter to `SearchOptions` (factoid / synthesis / coordination / decision-support / unknown)
- Per-task-type default scoring weights (initial: hand-tuned from Stage 3 v6 per-question-type breakdown if available, otherwise empirical sweep)
- Learnable weights per-user via implicit feedback (which retrieved memory was actually used in agent response → boost; which was ignored → demote). Out-of-scope for first V2; shipping fixed-per-task-type weights initially.
- Replace multiplication `rrf × relevance` with additive `rrf + α·relevance`; tune α in ablation.
- Auto-detect task type from question structure (heuristic: question word + length + presence of named entities → classifier). Phase 2 work; initial V2 ships with explicit `task_type` parameter, auto-detection deferred.

**Empirical validation:** ablation per profile combination on N=20-30 synthetic per-task-type subset of LoCoMo.

**Cost:** ~$10-20 per ablation × 5-10 weight combinations = $50-200.

### 3.3 — Direction C: Temporal-aware retrieval

**Hypothesis:** Bitemporal queries (event-time vs state-time) require retrieval that respects temporal ordering and validity windows, not just lexical/semantic similarity.

**Implementation:**
- Extend HybridSearch.search() signature with `temporalIntent` parameter: `event-time-recent` / `state-time-as-of-X` / `temporal-range` / `non-temporal`
- For temporal queries, prepend timestamp-aware re-ranker on top of RRF candidates (boost candidates whose `created_at` matches query temporal scope)
- Test: Stage 3 v6 LoCoMo has temporal questions per question_type field; isolate them and measure delta with and without temporal-aware ranking
- Knowledge graph integration: temporal queries with named entities should trigger BFS over entity's temporal validity windows (uses bitemporal KG layer that already exists in `mind/knowledge.ts`)

**Empirical validation:** N=30-50 isolated temporal subset of LoCoMo; measure trio-strict accuracy delta.

**Cost:** ~$10-15 ablation.

### 3.4 — Direction D: Learned reranker on top-K candidates

**Hypothesis:** RRF top-50 candidates pruned to top-10 via learned reranker (cohere-rerank-v3 or local cross-encoder) lifts precision substantially.

**Implementation:**
- Add post-RRF reranker layer; configurable provider (cohere API, local BGE-reranker-v2-m3, openai-style)
- Reranker takes (query, candidate_doc) pairs, returns relevance score; resort RRF candidates by reranker score
- Optional: only invoke reranker for top-N RRF candidates (cost optimization)
- Tier gating: reranker may be Pro/Teams feature if cost adds up (cohere $1/1k searches per current pricing)

**Empirical validation:** N=30-50 ablation with and without reranker, measure precision@10 + trio-strict.

**Cost:** ~$15-25 ablation (reranker API calls add up).

### 3.5 — Direction E: Entity-aware retrieval + KG bridge

**Hypothesis:** Question entity extraction + knowledge graph traversal + explicit entity bridge to retrieval candidates lifts recall on multi-entity questions.

**Implementation:**
- Pre-retrieval: extract entities from question (LLM call: "list named entities and their types in this question, JSON output")
- Knowledge graph lookup: for each extracted entity, find canonical entity ID via entity-normalizer + KG search
- Boost RRF candidates that mention or relate to extracted entities (additive boost in scoring.ts contextual layer; reuses existing graph distance code)
- Side benefit: populates `graphDistances` in `ScoringContext`, which currently is unused in practice (per audit §2.2 finding 1)

**Empirical validation:** N=20-30 multi-entity subset of LoCoMo (LoCoMo has named-entity-rich questions per dataset).

**Cost:** ~$10-15 ablation + LLM extraction cost (~$0.01 per question).

---

## §4 — Phasing (A → B → C, no Tier oznake)

### Phase A — Audit + baseline reproduction (1 week, ~$20-30)

1. Confirm Stage 3 v6 retrieval cell baseline reproducibility on N=20 subset (smoke check before any change)
2. Confirm which embedder was active during Stage 3 v6 run (audit `stage3-n400-v6-final-analysis.md`)
3. Per-question-type breakdown of V1 retrieval failures (which question types fail most: temporal? multi-entity? long-context?)
4. Document baseline cost + latency profile per direction
5. Memo: `decisions/2026-04-XX-retrieval-v2-phase-a-baseline.md`

### Phase B — Per-direction ablations (2-3 weeks, ~$100-200)

Run each direction (A through E) in isolation on N=20-30:
- Direction A: 5 candidate embedding models × N=20 = ~$50-100
- Direction B: 5-10 weight combinations × N=20 = ~$50-100
- Direction C: temporal-aware reranker × N=30-50 = ~$15
- Direction D: 2-3 reranker variants × N=30 = ~$15-25
- Direction E: KG-bridge × N=20-30 = ~$15

Per-direction memo: `decisions/2026-04-XX-retrieval-v2-direction-{A..E}-results.md`

Halt-and-ratify: each direction memo includes "ship/extend/skip" recommendation. PM ratifies subset that ships in Phase C.

### Phase C — Full N=400 V2 reproduction sa best combination (1 week, ~$30-50)

1. Combine ratified directions into single V2 build
2. Pre-registered manifest v7 (Phase A baselines + Phase B directional gains + Phase C combined V2)
3. Trio-strict + self-judge re-evaluation on N=400 (both methodologies per Mixed-methodology baseline rule)
4. Compare V2 vs V1 baselines vs oracle ceiling
5. Acceptance: V2 trio-strict ≥30% AND V2 trio-strict beats full-context (27.25%) on majority of question types

If acceptance fails: halt + diagnose which direction(s) didn't combine well; iterate.

If acceptance passes: V2 ships to production (waggle-os/packages/core/src/mind/) + sync to hive-mind via Step 3 CI/CD workflow.

---

## §5 — Sequencing constraints

V2 work cannot start until:

1. **Memory sync Step 3 (CI/CD sync workflow) is LIVE.** Otherwise V2 changes land in one repo and divergence grows. (~Step 2-3 take ~1-2 weeks per CC-2 brief estimates.)

2. **Agent fix sprint Phase 5 (re-pilot) is LIVE or substrate baselines are independently reproducible.** Otherwise V2 baseline measurements may be confounded by simultaneous agent harness changes. Phase 1 already PASSED gate; Phase 2-5 are paths critical to V2 baseline stability. (~Phase 2 unification ~1 week, Phase 3 long-task ~1 week, Phase 4-5 re-pilot validation ~2 weeks.)

3. **Tooling decision: who runs V2.** Three options:
   - (a) Same CC-1 sesion that did agent fix Phase 1-5 → context warm but big context window after months of work
   - (b) New CC-3 session with fresh context + this brief as starting point
   - (c) CC-2 (memory sync) takes V2 after Step 3 done — context warm on substrate code
   
   PM recommendation: (b) CC-3 fresh session. Reasons: (1) avoids CC-1 context exhaustion, (2) avoids CC-2 task overlap with sync repair, (3) clean PM ratification chain per direction memo.

**Realistic V2 timeline:** earliest start 2-3 weeks from now (post-CC-1 Phase 5 + post-CC-2 Step 3). Phase A through C: 4-5 weeks total. **V2 production-ready ETA: 6-9 weeks from today.**

**PRE-LAUNCH SEQUENCING (RATIFIED 2026-04-26):** Marko ratified V2 work as launch prerequisite, not post-launch follow-up. Quote: "nema launcha dok se sve ne sredi". This means:

- Launch ETA shifts to 6-9 weeks from today (V2 completion + remaining 14-step launch plan items)
- Substrate-ceiling-led launch comms (substrate 74% self-judge oracle + V1 retrieval honest disclosure framing) is REPLACED by V2 retrieval results in launch comms
- arxiv §5.3 will publish V2 results at launch, not "limited V1 + V2 follow-up"
- Landing copy v3 §3 Claim 3 will cite V2 numbers + production deployment justification, not V1 honest disclosure
- Decision Matrix amendment 2026-04-26 PHF (PASS-WITH-HONEST-FRAMING) is augmented: PHF still binding for substrate claim methodology framing, but retrieval framing strengthens from "V1 honest, V2 in progress" to "V2 production-ready"

PM update to landing copy + arxiv + Decision Matrix to reflect this sequencing change is queued as separate stream (independent of CC-1/CC-2/CC-3 code work).

---

## §6 — Cost estimate

| Phase | Sub-component | Cost | Time |
|-------|--------------|------|------|
| A | Baseline reproduction + audit + per-question-type breakdown | $20-30 | 1 week |
| B | Direction A (embedding model ablation) | $50-100 | 1 week |
| B | Direction B (scoring weight ablation) | $50-100 | 1 week (parallel with A) |
| B | Direction C (temporal-aware) | $15 | 0.5 week |
| B | Direction D (learned reranker) | $15-25 | 0.5 week |
| B | Direction E (KG bridge + entity-aware) | $15 | 0.5 week |
| C | Full N=400 V2 reproduction (trio-strict + self-judge) | $30-50 | 1 week |
| **Total** | | **$195-335** | **4-5 weeks** |

Compare to Stage 3 v6 cost ($29.75) — V2 is ~7-10× more expensive but produces evidence for paper §5.3 V2 results section + production deployment justification.

---

## §7 — Acceptance criteria (binding)

V2 ships to production iff:

1. **Trio-strict V2 ≥ 30%** on N=400 (close 70% of 11.25pp gap to oracle 33.5%)
2. **Trio-strict V2 > 27.25%** (must beat full-context baseline, otherwise retrieval has no production deployment justification)
3. **Self-judge V2 ≥ 65%** on N=400 (close 70% of gap to oracle 74%)
4. **No critical regression** on any directional ablation (each direction memo confirms ship/extend/skip)
5. **Memory sync verified** (Step 3 CI/CD workflow shipped V2 to both repos, parity check passes)
6. **arxiv paper §5.3 updated** with V2 results table replacing "five identified directions" enumeration with empirical results
7. **Cost stayed within envelope** ($335 total) — if exceeded, halt + PM ratification

---

## §8 — Marko ratifications (resolved 2026-04-26)

All five questions resolved:

1. **V2 sequencing — PRE launch (not post).** Marko: "Nema launcha dok se sve ne sredi". V2 work is launch prerequisite, not follow-up. Implication: realistic launch ETA shifts to 6-9 weeks from today (CC-1 Phase 5 + CC-2 Step 3 + CC-3 Phase A-C sequential). This is consistent with Marko's earlier "datum je sada nebitan, izgubili smo dosta vremena" stance and produces a stronger product at launch.

2. **CC-3 fresh session for V2.** Ratified.

3. **Direction priority — ALL FIVE directions execute, no cuts.** Marko: "sve". Cost envelope $195-335 binding; any direction-level scope reduction requires explicit Marko ratification. Direction A embedding model + B scoring weights + C temporal + D learned reranker + E entity-aware KG bridge all in scope.

4. **Tier-gating ratified.** Pro tier for reranker (cohere ~$1/1k searches), Voyage/OpenAI embedding remain Free tier.

5. **Mock-fallback telemetry — internal observability only.** Ratified. Per-deployment audit log; not landing-facing transparency feature.

---

## §9 — Cross-references

- arxiv paper outline: `research/2026-04-26-arxiv-paper/00-paper-outline.md`
- arxiv paper skeleton §5.3: `research/2026-04-26-arxiv-paper/01-paper-skeleton.md`
- Memory sync audit: `decisions/2026-04-26-memory-sync-audit.md`
- Pilot verdict: `decisions/2026-04-26-pilot-verdict-FAIL.md`
- Decision Matrix amendment (PHF): `decisions/2026-04-26-decision-matrix-self-judge-reframe.md`
- Stage 3 v6 5-cell summary: `D:\Projects\waggle-os\benchmarks\results\stage3-n400-v6-final-5cell-summary.md`
- Manifest v6: `D:\Projects\waggle-os\benchmarks\preregistration\manifest-v6-preregistration.yaml`
- 14-step launch plan: in PM session memory (Korak 2 = this brief)
- Mixed-methodology baseline rule: `feedback_config_inheritance_audit.md` Extension 2
