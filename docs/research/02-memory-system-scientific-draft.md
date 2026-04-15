# Hive-Mind: Persistent, Multi-Tenant, Compliance-First Memory for Autonomous AI Agents

**Authors:** Marko Markovic (Egzakta Group), Waggle OS team
**Date:** Draft — 2026-04-15
**Status:** Working paper. Numbers and external evaluation pending the v2 hypothesis run + agent-architecture verification. This is the structural + conceptual draft for internal review.
**Target venue:** arXiv cs.AI preprint; potential conference workshop (ACL / NeurIPS Agents / ACL NLP-for-agents).

---

## Abstract

We present Hive-Mind, the memory system powering Waggle OS, a workspace-native AI agent platform for single-user through enterprise deployments. Hive-Mind departs from the dominant key-value and turn-blob memory designs in three ways. First, it models memory as a temporal **frame graph** with three frame types (Independent/Predicted/Bidirectional) inspired by video-compression encoding, allowing consolidation, decay, and link formation to operate over semantic clusters rather than individual turns. Second, it treats **multi-mind isolation** (personal, workspace, team, enterprise scope) as a first-class concept rather than an add-on, with provenance tracking and approval-gated cross-mind reads. Third, it ships **compliance-by-default** — every interaction is logged in a format that maps directly to EU AI Act Articles 10, 12, 14, 19, 26, and 50, producing audit reports as a first-class output rather than a post-hoc integration. On top of this foundation, Hive-Mind compiles a living **wiki** of entity, concept, and synthesis pages from the frame corpus, giving users a navigable second-brain over their unstructured conversational history. We describe the system architecture, the frame model's formal properties, the multi-mind consistency protocol, the compilation pipeline, and the integration with Waggle's closed-loop prompt-evolution subsystem. We report preliminary results on write-path contradiction detection and skill auto-extraction, and outline a roadmap for empirical evaluation against existing memory libraries.

---

## 1. Introduction

Autonomous AI agents that maintain long-term state are an active area of research and deployment [Letta/MemGPT; mem0; Zep; GraphRAG]. The dominant designs fall in three categories:

- **Turn-blob / scrollback memory:** store full conversation history; retrieve by vector similarity. Exemplified by naive chatbot memory and early ChatGPT custom-instructions.
- **Key-value memory:** structured facts with keys; updated on explicit user signal. Exemplified by mem0's API-first design and OpenAI's "Memory" feature.
- **Graph-augmented memory:** entity-relation graphs over conversational content; retrieval combines graph walks with vector search. Exemplified by Zep, GraphRAG.

Each design solves specific problems and sidesteps others. **Turn-blob** is high-fidelity but has catastrophic recall-cost growth. **Key-value** is efficient but loses context and struggles with temporal reasoning ("what did we decide when we talked about X?"). **Graph-augmented** combines well but requires either expensive LLM calls for every write (for entity extraction) or heavy upfront schema work.

Hive-Mind takes a **fourth position:** memory is best modeled as a temporal graph of frames with explicit continuation semantics. Combined with multi-mind isolation and compliance-grade auditing, this gives a memory system that is simultaneously rich, performant, multi-tenant, and enterprise-ready.

Our contributions:

1. The **I/P/B frame model** for AI memory, borrowed from video compression, with formal decay/consolidation semantics
2. A **multi-mind protocol** for isolating personal, workspace, team, and enterprise memory while supporting sanctioned cross-mind access
3. **Write-path contradiction detection** that emits actionable improvement signals rather than silently accepting conflicting data
4. **Skill promotion** as an organizational mechanism on top of memory: scope-graded extraction and distribution of re-usable prompt modules, with tier gates and audit trails
5. A **wiki compilation layer** that produces structured entity/concept/synthesis pages from the frame corpus incrementally
6. A **compliance-by-default** interaction log with direct mapping to EU AI Act articles, producing audit-ready PDFs as a primary output

The system is implemented in a dual-license configuration: the memory primitives are slated for Apache 2.0 release as `hive-mind`; the product layer (agent runtime, evolution stack, UI, compliance reporting) remains in Waggle's commercial repository.

---

## 2. System architecture

### 2.1 High-level

Hive-Mind is a library, not a service. It runs in-process with the agent runtime. Storage is SQLite (via better-sqlite3) with `sqlite-vec` for embedded vector search. A single deployment is a single `.mind` file; multi-mind deployments have multiple `.mind` files coordinated by a cache + multiplex layer.

```
┌────────────────────────────────────────────────────┐
│ Agent Runtime (Waggle or user-provided)            │
├────────────────────────────────────────────────────┤
│ Hive-Mind API surface                              │
│   FrameStore  HybridSearch  KnowledgeGraph         │
│   IdentityLayer  AwarenessLayer  CognifyPipeline   │
│   MemoryWeaver  WikiCompiler                       │
├────────────────────────────────────────────────────┤
│ SQLite + sqlite-vec                                │
│   memory_frames  knowledge_entities  …             │
└────────────────────────────────────────────────────┘
```

### 2.2 The frame model

A frame is the atomic storage unit. Every frame has:

```
{
  id, gop_id, frame_type ∈ {I, P, B},
  content,
  importance ∈ {critical, important, normal, temporary, deprecated},
  source ∈ {user_stated, tool_verified, agent_inferred},
  confidence ∈ {high, medium, low, unverified},
  access_count, created_at, updated_at
}
```

Where:

- **I-frame (Independent):** a keyframe; complete, self-contained content.
- **P-frame (Predicted):** a continuation delta with a reference to an earlier I-frame in the same GOP. Represents "this adds to / refines / extends" the I-frame's content.
- **B-frame (Bidirectional):** a link between two frames expressing a structural relation (shared entity, causal link, contradiction flag).

A *Group of Pictures* (GOP, identified by `gop_id`) corresponds roughly to a session or thread. Within a GOP, there is typically one I-frame followed by N P-frames; B-frames may link across GOPs.

#### 2.2.1 Why this model

The design choice encodes a bet: **most useful memory is not a flat sequence of assertions but a branching temporal graph with explicit grouping and refinement semantics.** A conversation about "the Acme contract" produces one I-frame (the core facts) and many P-frames over time (amendments, clarifications, decisions). Consolidation (§2.3) periodically merges P-frames back into the I-frame, upgrading its richness while preserving the decay-friendly property that *old unused P-frames can be discarded without losing the core memory*.

This mirrors the intuition behind MPEG video encoding: the expensive keyframes carry structure; the cheap predicted frames carry deltas; the bidirectional frames carry cross-reference structure.

#### 2.2.2 Formal properties

Let frames be $F_i$ with I/P/B tags. Let $\text{gop}(F_i)$ denote the GOP, $\text{parent}(F_i)$ the referenced I-frame for a P-frame.

- **Containment:** for each GOP $g$, there exists at least one $F_i$ with $\text{gop}(F_i) = g$ and $\text{frame\_type}(F_i) = I$.
- **Delta referential integrity:** for every P-frame $F_p$, $\exists F_I$ with $\text{gop}(F_I) = \text{gop}(F_p) \land \text{frame\_type}(F_I) = I \land \text{id}(F_I) = \text{parent}(F_p)$.
- **B-frame validity:** every B-frame references two valid non-deprecated frames.

These invariants are maintained as DB constraints + application-level checks in `FrameStore`.

### 2.3 MemoryWeaver — consolidation, decay, strengthening

On a scheduled cadence (hourly consolidation, daily decay, weekly strengthening):

- **`consolidateGop(gop_id)`:** gather all P-frames under the GOP's current I-frame; merge content; emit a new I-frame; mark old P-frames `deprecated`.
- **`decayFrames()`:** delete `deprecated` frames with `access_count == 0`. (Non-destructive decay: frames that were read recently survive longer.)
- **`strengthenFrames()`:** promote `temporary → normal → important` for frames with high access counts.
- **`linkRelatedFrames(kg)`:** for each entity in the knowledge graph, find frames that mention it; create B-frames for pairs not yet linked.

This gives the memory a self-maintaining property: the useful content densifies, the irrelevant content dissolves, and cross-cutting connections emerge automatically.

### 2.4 HybridSearch with RRF

Query pipeline:

1. Embed the query with the configured embedder (Ollama / LiteLLM / API).
2. Vector search via `sqlite-vec` with cosine similarity.
3. Keyword search via SQLite FTS5.
4. Fuse via **Reciprocal Rank Fusion** (RRF_K = 60):
   $\text{score}(d) = \sum_{r \in \{\text{vec}, \text{kw}\}} \frac{1}{K + \text{rank}_r(d)}$
5. Apply scoring profile (balanced / recent / important / connected) — weighted reranking by timestamp, importance enum, or connection-count signal.

Scoring profiles are important: the same query may want different results depending on the user's task (`recent` for "what did we discuss yesterday?", `connected` for "what's relevant to this entity?"). Making the profile explicit in the API surface lets agents request the appropriate prior.

### 2.5 Knowledge graph with SCD-2

Entities + relations have `valid_from` / `valid_to` columns. When an entity is updated, the old row is closed and a new row opened. This gives temporal reasoning: "what did we believe about X on date D?" is answerable as a point-in-time query.

Auto-population via `CognifyPipeline`: on every frame save, an LLM extracts entities and relations; new ones are inserted; existing ones matched by name (with fuzzy match) are strengthened in access_count.

### 2.6 Identity and awareness layers

Two lightweight layers orthogonal to the frame graph:

- **IdentityLayer** stores stable user facts — name, role, organizations, preferences, communication style. Auto-derived during onboarding from the first N harvested conversations via a one-shot LLM extraction. User-editable.
- **AwarenessLayer** stores volatile state — active tasks, recent tool uses, pending approvals, flags. Refreshed every agent turn.

Both are used at prompt construction time to give the agent context without searching memory for basics.

### 2.7 Harvest pipeline

Ingest foreign conversational data from 11 source types via adapter interface:

```
SourceAdapter {
  sourceType: ImportSourceType,
  parse(input: unknown): UniversalImportItem[]
}
```

Adapters include chatgpt, claude, claude-code, claude-desktop, gemini, perplexity, markdown, plaintext, pdf, url, universal. Each normalizes its source-specific format to a common `UniversalImportItem` which then flows through classification → extraction → distillation → frame save. Multi-layer deduplication (exact match + normalized string match + embedding cosine similarity > 0.95 + cross-mind check) prevents re-imports from double-writing.

Harvest provenance is preserved: every frame from a harvest carries `originalSource`, `originalId`, `importedAt`.

### 2.8 Write-path contradiction detection

Introduced as of this work's 2026-04 revision, every `save_memory` call runs `detectContradiction(newContent, recentFrames)` before writing. When detected:

1. The frame is still written (contradictions are data, not errors).
2. The return string is annotated `[flag: contradicts_existing (excerpt)]` so the caller / user can see the conflict.
3. A `correction`-category `ImprovementSignal` is emitted with pattern key `write-conflict:<normalized>` and metadata capturing both sides.

Downstream, these signals flow into the closed-loop evolution subsystem (§4).

### 2.9 Compliance-by-default interaction store

Independent of the frame store, every interaction (LLM call, tool call, approval event) is logged with:

```
{ id, timestamp, workspaceId, sessionId, model, provider,
  inputTokens, outputTokens, costUsd, toolsCalled,
  humanAction ∈ {approved, denied, modified, none},
  riskContext, importedFrom, persona }
```

This maps to AI Act Article 12 (logging of AI system operation). The `humanAction` field maps to Article 14 (human oversight). The `riskContext` field maps to Article 26 (risk classification). The log is append-only and retained per configurable retention policy, maps to Article 19 (retention).

A `ComplianceStatusChecker` and `ReportGenerator` produce structured audit reports with per-article pass/warn/fail status, model inventory, oversight log, harvest provenance, and interaction counts. A separate renderer produces a boardroom-grade PDF (styled with Hive DS tokens, locale-pinned to en-US for cross-jurisdiction portability).

### 2.10 Multi-mind protocol

Personal, workspace, team, and enterprise minds are separate `.mind` files. The `MultiMindCache` opens and closes them on demand via LRU. The agent's orchestrator injects `WorkspaceLayers` into tool dependencies so read/write tools route to the right mind.

Cross-mind access requires approval: the `read_other_workspace` tool triggers an approval gate (which can be granted per-session, permanent, or denied). This makes cross-mind read an *event* that's auditable, rather than a silent capability.

Team minds are synchronized via a `TeamSync` layer that pushes/pulls frames (currently frame-only; skill and KG sync are roadmap).

### 2.11 Wiki compiler

On demand or on cadence, the compiler produces structured Markdown pages from the frame corpus:

- **Entity pages** (one per high-connectivity entity): who/what is this, timeline of mentions, related entities, relevant frames
- **Concept pages** (thematic clusters): what is this topic, who's mentioned it, what's been decided
- **Synthesis pages** (query-driven): given a question, compile an answer from relevant frames with inline citations

Incremental: only entities/concepts with new frames since last compilation get rebuilt. The compilation is an LLM call; for 1k-frame minds with ~50 entity pages, full compile typically completes in minutes.

The wiki output is browsable in Waggle's Memory app and exportable as a static site.

---

## 3. Skill promotion: organizational memory

Adjacent to the memory core, we ship a skill-promotion mechanism. A *skill* is a versioned Markdown file with YAML frontmatter (name, description, scope, permissions) plus a body describing how to accomplish a specific task well.

Scopes: **personal → workspace → team → enterprise**. A skill is promoted one rung at a time with tier gating (team requires `teamSkillLibrary` capability; enterprise requires ENTERPRISE tier). Each promotion:

1. Rewrites frontmatter (scope + appends to `promoted_from` history)
2. Moves the file to the scope-appropriate directory
3. Emits a `skill_promotion`-category `ImprovementSignal`
4. Is rollback-safe (old copy preserved on target-collision)

This mechanism transforms skills from a personal-tool artifact into a **governed organizational knowledge asset**. A senior legal counsel authors the `nda-review` skill for personal use, promotes to team after vetting, promotes to enterprise after compliance review. Every version of every skill has an author trail and a deployment trail.

Skills also auto-extract from conversation history: when the same tool-sequence repeats 2+ times, `autoExtractAndCreateSkill` produces a draft SKILL.md from the detected pattern. Users accept/reject the suggestion; accepted skills enter the personal scope and can then be promoted.

Decay: skills unused for ≥90 days are archived to a recoverable `skills-archive/` directory — keeps the library lean without data loss.

---

## 4. Closed-loop prompt evolution integration

Hive-Mind's companion evolution subsystem (open-source roadmap pending but not in the initial `hive-mind` OSS split) closes the loop from memory → improvement signals → prompt mutations → judged candidates → deployed prompts.

Specifically: `ExecutionTraceStore` records every chat turn with input/output/score. The eval-dataset builder curates held-out subsets from these traces. `IterativeOptimizer` runs a GEPA-style rank-by-score mutation loop. `EvolveSchema` (integration targeting Mikhail's 2026 paper) runs structural schema-level evolution. `ComposeEvolution` combines signals from both. `EvolutionGates` enforce constraints. `EvolutionOrchestrator` coordinates end-to-end runs with accept/reject gates presented to the user.

Preliminary result: an internal v1 evaluation (n=10 coder questions, 4 blind multi-vendor judges) measured Gemma 4 31B with a Waggle-evolved prompt at **108.8 % of raw Claude Opus 4.6** per-judge mean (v2 scaling to n=60 × 3 domains × 3 baselines with hard train/test split is pending execution). This is discussed in a companion paper and is not the focus of this work; mentioned here because the evolution subsystem is architecturally dependent on the memory subsystem described above.

---

## 5. Evaluation

*(To be completed with real numbers post-implementation validation and post-benchmark suite.)*

### 5.1 Evaluation plan

We propose three evaluation axes:

#### 5.1.1 Retrieval quality

- **Dataset:** a synthesized 10,000-frame corpus covering a synthetic multi-month conversation history across 5 domains (work, family, health, finance, hobby).
- **Queries:** 500 questions with known-answer frames (oracle provides ground truth).
- **Baselines:** mem0 (API-mapped equivalent), Zep, Letta archival-vs-recall, LangChain's ConversationBufferMemory + vector store.
- **Metrics:** recall@5, recall@20, MRR, latency p50/p95.
- **Hypothesis:** Hive-Mind's RRF hybrid + frame-model recency signal outperforms pure vector baselines by ≥15% on recall@5 for ambiguous queries.

#### 5.1.2 Consolidation quality

- **Dataset:** a 30-day conversation simulation with 10-20 turns per session.
- **Metric:** After 30 days of simulated use + MemoryWeaver running on schedule, what's the delta between pre-consolidation frame count and post? What's the loss on a 100-query held-out test of the pre-consolidation content?
- **Hypothesis:** 50-70% frame-count reduction with ≤ 5% answer-quality loss.

#### 5.1.3 Compliance report fidelity

- **Method:** a mock AI-Act audit scenario (50 regulator-style questions against a 30-day interaction log).
- **Metric:** does the `AuditReport` answer each question correctly from the structured log?
- **Hypothesis:** 100% structured-answerable; 0% requiring manual data archaeology.

### 5.2 Preliminary numbers

*From the Waggle production deployment (personal mind seeded with 156 real Claude Code frames per prior telemetry):*

- Median query latency over 1,200-frame mind: under 100ms for balanced-profile search *(preliminary; requires instrumented benchmarking)*.
- Write-path contradiction detection: 3 unit-test cases shipped, production-path integration verified. Field validation pending larger corpora.
- Skill auto-extract: 7 unit-test cases shipped; triggers on ≥3-tool-sequence + ≥2 repetitions.
- Compliance PDF generation: 11 unit-test cases shipped covering all 5 article status blocks + empty-state fallbacks + 50-cap oversight log truncation.

*Full evaluation suite is pending. The claim of this paper is the architecture and the integration, not the benchmark dominance — that will require its own follow-up.*

---

## 6. Related work

**Memory for agents.** Letta/MemGPT [Packer et al. 2023] introduced archival vs recall memory paging as an LLM-native OS analogue. mem0 [Mem0 Team, 2024+] packages memory as a dev API. Zep [Zep Team, 2024+] combines knowledge graphs and temporal recency. Cognee focuses on graph reasoning + memory. GraphRAG [Microsoft, 2024] applies graph retrieval to multi-hop queries. LangChain's memory modules provide per-turn aggregation.

**Differentiators.** Hive-Mind departs from these by: (a) the frame model, which models continuation / refinement explicitly rather than as flat turn-list; (b) write-path contradiction detection + signal emission, which treats contradictions as improvement opportunities rather than silent conflicts; (c) multi-mind isolation with sanctioned cross-access as first-class; (d) compliance-by-default auditing; (e) wiki compilation for navigable memory.

**Video-compression analogy.** The I/P/B frame model borrows the vocabulary from MPEG and H.264 [Wiegand et al.] but not the compression mathematics. The analogy is conceptual: keyframes carry structure, predicted frames carry deltas, bidirectional frames carry cross-reference. We don't claim a coding-theoretic optimality result for memory; we claim the conceptual analogue is useful and solves real problems that flat-turn designs struggle with.

**Prompt evolution and self-improvement.** Integration with the GEPA + EvolveSchema [to be cited] stack is the companion work; see §4.

**Compliance and governance.** The AI-Act mapping is informed by EU AI Office guidance and NIST AI RMF 2.0. We are not aware of other OSS memory systems shipping compliance-by-default audit generation as a first-class feature.

---

## 7. Limitations

- **Single-node.** SQLite-backed; we do not yet claim support for multi-node replication or horizontal scaling. The multi-mind protocol anticipates multi-tenant isolation but not distributed consensus.
- **LLM dependency for ingest.** CognifyPipeline and the distillation path require an LLM for entity extraction and summarization. Offline-only deployments fall back to raw frame storage without KG enrichment.
- **Adapter coverage.** 11 harvest sources today; ecosystem gaps include Cursor, Copilot, Notion, Obsidian, voice-transcript services. Adapter addition is straightforward but each requires source-specific parsing.
- **Compliance scope.** We map to EU AI Act today; HIPAA, SOC2, ISO 27001 mappings are conceptual and require bespoke configuration per deployment.
- **Benchmark gap.** The evaluation section above is a proposal rather than completed empiricism. A full multi-memory-system benchmark is a follow-up effort.
- **Skill promotion model.** Four-scope model (personal / workspace / team / enterprise) may not fit all organizational structures. Flat team-member-level permissions may be desired for some users.
- **Frame size.** Frames today are single-content strings; richer content (images, code, video references) is tagged metadata rather than first-class frame content. Multi-modal memory is future work.

---

## 8. Conclusion

Hive-Mind is a memory system for AI agents that takes four architectural bets: (1) temporal frames with I/P/B typing are a better primitive than flat turn-blobs or key-value; (2) multi-mind isolation should be first-class, not retrofitted; (3) contradictions and skill-learning should trigger structured improvement signals, not silent overwrites; (4) compliance should be the default, not the upsell.

We believe each bet is independently defensible and jointly position the system to serve a range of users from solo prosumers to regulated enterprises. We ship the core memory primitives as Apache 2.0 open-source via the `hive-mind` project and integrate them commercially in Waggle OS with additional skill promotion, evolution, and UI layers.

The empirical work is ahead of us. The architecture is available now. We invite the research and practitioner community to build on, critique, and extend it.

---

## 9. Code availability

- **hive-mind** (Apache 2.0): `github.com/waggle-os/hive-mind` *(publication pending; 12-week sprint planned per report 01)*
- **Waggle OS** (commercial + open product): `waggle-os.ai`
- **Sovereign enterprise tier (KVARK):** `www.kvark.ai`
- **v2 hypothesis reproducibility repo** (companion work): `github.com/waggle-os/evolution-hypothesis-v2` *(forthcoming with v2 run)*

---

## Acknowledgments

Marko Markovic leads Waggle OS as part of Egzakta Group's AI portfolio. The evolution subsystem integrates GEPA [citation pending — overnight research agent verifying] and EvolveSchema [Mikhail et al., 2026 — citation pending]. The compliance mapping draws on EU AI Office interpretive guidance. Contributors to the Waggle OS codebase are listed in the repository.

---

## References

*(Placeholder — to be populated with proper citations during final editorial pass. Confirmed-needed-citations below.)*

- Packer et al., MemGPT: Towards LLMs as Operating Systems, 2023
- Microsoft Research, GraphRAG: Unlocking LLM discovery on narrative private data, 2024
- Wiegand et al., Overview of the H.264/AVC Video Coding Standard, IEEE 2003
- Khattab et al., DSPy: Compiling Declarative Language Model Calls, 2023
- Yuksekgonul et al., TextGrad, 2024
- Yang et al., OPRO: Large Language Models as Optimizers, 2023
- Fernando et al., Promptbreeder, 2023
- Zhou et al., APE: Automatic Prompt Engineer, 2022
- GEPA paper — citation pending from overnight research
- EvolveSchema paper (Mikhail et al., 2026) — citation pending from overnight research
- Regulation (EU) 2024/1689 (AI Act)
- NIST AI Risk Management Framework 2.0

---

## Appendix A — SQL schema excerpt (illustrative)

*(Illustrative schema. See `packages/core/src/mind/schema.ts` for the canonical definitions. Agent D's overnight architectural map will replace this appendix with the authoritative schema listing.)*

```sql
CREATE TABLE memory_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gop_id TEXT NOT NULL,
  frame_type TEXT NOT NULL CHECK (frame_type IN ('I','P','B')),
  content TEXT NOT NULL,
  parent_id INTEGER,
  importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (importance IN ('critical','important','normal','temporary','deprecated')),
  source TEXT DEFAULT 'agent_inferred',
  confidence TEXT,
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_frames_gop ON memory_frames(gop_id);

CREATE TABLE knowledge_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT
);

CREATE TABLE knowledge_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL,
  target_id INTEGER NOT NULL,
  relation_type TEXT NOT NULL,
  confidence REAL,
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT,
  FOREIGN KEY (source_id) REFERENCES knowledge_entities(id),
  FOREIGN KEY (target_id) REFERENCES knowledge_entities(id)
);

CREATE TABLE improvement_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK (category IN (
    'capability_gap','correction','workflow_pattern','skill_promotion'
  )),
  pattern_key TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  surfaced INTEGER NOT NULL DEFAULT 0,
  surfaced_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);
CREATE UNIQUE INDEX idx_signals_category_key ON improvement_signals(category, pattern_key);
```

*Note: FTS5 tables and sqlite-vec virtual tables are declared alongside — see the authoritative schema in the source tree.*

---

## Appendix B — Hive-Mind public API sketch (TypeScript)

```ts
import { MindDB, FrameStore, HybridSearch, KnowledgeGraph,
         IdentityLayer, AwarenessLayer } from 'hive-mind';

const db = new MindDB(path.join(home, '.mind'));
const frames = new FrameStore(db);
const search = new HybridSearch(db, embedder);
const kg = new KnowledgeGraph(db);

// Write
const session = sessions.create();
frames.createIFrame(session.gop_id, 'Alice suggested we use Postgres.', 'normal');

// Query
const results = await search.search('what did Alice suggest', { profile: 'recent', limit: 10 });

// KG walk
const alice = kg.searchEntities('Alice')[0];
const outRelations = kg.getRelationsFrom(alice.id);

// Consolidation
const weaver = new MemoryWeaver(db, frames, sessions);
setInterval(() => weaver.consolidateGop(session.gop_id), 3600_000);
```

The commercial Waggle product wraps this API with its agent runtime, skill system, UI, and evolution stack.

---

*End of working draft. Architectural details, citations, and empirical numbers to be refined when overnight research agents return and when the v2 hypothesis run completes. This draft exists so the structural narrative is reviewable before the details are finalized.*
