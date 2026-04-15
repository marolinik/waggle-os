# Hive-Mind: Frame-Graph Memory with Compliance-by-Default and Closed-Loop Prompt Evolution for Autonomous AI Agents

**Marko Markovic**
Egzakta Group
marko@egzakta.com

**April 2026**

---

## Abstract

Autonomous AI agents require persistent memory systems that go beyond turn-level conversation buffers. Existing approaches model memory as either flat key-value stores (mem0), virtual paging over conversation history (Letta/MemGPT), or entity-relation graphs built atop retrieval (Zep/Graphiti, Microsoft GraphRAG). Each design makes implicit tradeoffs between retrieval fidelity, write-path consistency, multi-tenant isolation, and regulatory compliance. We present **Hive-Mind**, a memory architecture that introduces four contributions. First, we propose a **frame-graph model** with three frame types---Independent, Predicted, and Bidirectional---borrowed by analogy from video compression, enabling temporal grouping, consolidation, and decay over semantic clusters rather than individual turns. Second, we implement **multi-mind isolation** across personal, workspace, team, and enterprise scopes with approval-gated cross-mind reads and write-path contradiction detection. Third, we ship **compliance-by-default**: every AI interaction is logged in an append-only audit store with DDL-level tamper prevention, mapping directly to EU AI Act Articles 12, 14, 19, 26, and 50, producing structured audit reports as a first-class output. Fourth, we integrate a **closed-loop prompt evolution** subsystem combining GEPA (Agrawal et al., 2026) for instruction-level optimization with schema-level structural evolution inspired by ACE (Zhang et al., 2025), operating over execution traces persisted in the memory substrate. A preliminary v1 evaluation (n=10, 4 blind multi-vendor judges) measured Gemma 4 31B with a Waggle-evolved prompt at 108.8% of raw Claude Opus 4.6 on per-judge mean C/A ratio; a rigorous v2 replication (n=60, 3 domains, hard train/test split, 4-vendor judge pool, bootstrap confidence intervals) is in progress. The system is implemented as a library (not a hosted service) using SQLite with sqlite-vec for embedded vector search, deployed in Waggle OS---a desktop AI agent platform built on Tauri 2.0. We describe the architecture, formal properties of the frame model, the retrieval pipeline, the wiki compilation layer, the compliance mapping, and the evolution integration, and discuss limitations including single-node scaling, English-only detection patterns, and the preliminary nature of the current experimental evidence.

---

## 1. Introduction

The deployment of autonomous AI agents that maintain state across sessions, tools, and users has moved from research curiosity to production requirement. A financial analyst needs her agent to remember that she prefers DCF over comparables; a legal team needs an agent to recall the clause structure negotiated six weeks ago; an enterprise deployer needs to demonstrate to a regulator that every AI interaction was logged, every human override was recorded, and no audit entry was silently deleted.

Existing memory systems for AI agents fall into three architectural categories:

1. **Turn-blob memory.** The conversation history is stored verbatim and retrieved by vector similarity. This is the implicit design of most chatbot integrations and early custom-instructions features. It is high-fidelity at small scale but suffers from catastrophic recall-cost growth: a 50,000-turn history cannot be searched efficiently, and relevance degrades as unrelated conversations accumulate in the same embedding space.

2. **Key-value memory.** Structured facts are stored with explicit keys and updated on user signal or LLM extraction. mem0 (Mem0 Team, 2024; approximately 48,000 GitHub stars as of April 2026) exemplifies this approach with a developer-friendly API. Key-value memory is storage-efficient and retrieval-fast, but it loses temporal context ("what did we decide about X *last month*?"), cannot represent refinement chains (a fact that was amended three times still shows as one key), and struggles with contradictions (the latest write silently overwrites the previous).

3. **Graph-augmented memory.** Entity-relation graphs are extracted from conversational content and combined with vector search for retrieval. Zep and its Graphiti library (approximately 24,500 GitHub stars), Microsoft GraphRAG (approximately 31,000 stars), and Cognee (approximately 14,200 stars) exemplify this family. Graph-augmented memory handles multi-hop reasoning well but requires either expensive LLM calls on every write path (for entity extraction) or significant upfront schema work, and typically does not model temporal validity of relations.

We propose a **fourth position**: memory is best modeled as a temporal frame graph with explicit continuation semantics, multi-scope isolation, and compliance-grade auditing as architectural primitives rather than add-on features.

### 1.1 Contributions

This paper makes four contributions:

**C1. The I/P/B frame model.** We introduce a memory primitive inspired by Group-of-Pictures (GOP) encoding from video compression (Wiegand et al., 2003). An I-frame (Independent) is a self-contained keyframe. A P-frame (Predicted) is a continuation delta referencing an I-frame within the same GOP. A B-frame (Bidirectional) is a cross-reference link between frames in different GOPs. This encoding supports consolidation (merging P-frames back into a richer I-frame), decay (discarding old P-frames without losing the core memory), and structural linking (B-frames forming a navigable graph across sessions).

**C2. Multi-mind isolation.** Personal, workspace, team, and enterprise memories are physically separate databases. Cross-mind access is an explicit, auditable event requiring approval gates. Write-path contradiction detection emits structured improvement signals rather than silently accepting conflicting data. A skill promotion chain (personal to workspace to team to enterprise) transforms individual knowledge artifacts into governed organizational assets.

**C3. Compliance-by-default.** Every AI interaction---LLM call, tool invocation, human override---is logged in an append-only store protected by DDL-level triggers that prevent UPDATE and DELETE at the database engine level. The log maps directly to EU AI Act articles: Article 12 (automatic event logging), Article 14 (human oversight recording), Article 19 (retention enforcement), Article 26 (deployer monitoring), and Article 50 (model transparency). A ComplianceStatusChecker produces structured audit reports with per-article pass/warn/fail verdicts as a first-class system output.

**C4. Closed-loop prompt evolution.** An evolution subsystem integrates GEPA---Genetic-Pareto prompt optimization (Agrawal et al., 2026; ICLR 2026 Oral)---with a structural schema evolution layer whose closest published analog is ACE---Agentic Context Engineering (Zhang et al., 2025). The integration operates over execution traces persisted in the memory substrate, composing instruction-level and structure-level optimization through a feedback-separation mechanism, with constraint gates preventing prompt bloat and regression before deployment.

### 1.2 Design philosophy

Hive-Mind is a **library, not a service**. It runs in-process with the agent runtime. Storage is a single SQLite file (a `.mind` database) per scope, using `better-sqlite3` for synchronous access and `sqlite-vec` for embedded vector search. There is no external database server, no network round-trip on the memory hot path, and no cloud dependency. This design choice is deliberate: it enables offline operation, simplifies deployment to a single binary, and keeps user data on the user's machine---a property that matters both for privacy-conscious individuals and for enterprises operating under data sovereignty constraints.

The system is implemented in TypeScript and deployed commercially as part of Waggle OS, a workspace-native AI agent platform built on Tauri 2.0 for Windows and macOS. The core memory primitives are planned for Apache 2.0 open-source release as the `hive-mind` package; the product layer (agent runtime, evolution stack, UI, compliance reporting) remains in the commercial repository.

---

## 2. System Architecture

### 2.1 High-level overview

Figure 1 shows the high-level architecture. The agent runtime (Waggle or any user-provided host) interacts with the Hive-Mind API surface. The API surface comprises seven subsystems: FrameStore, HybridSearch, KnowledgeGraph, IdentityLayer, AwarenessLayer, WikiCompiler, and ComplianceStore. All subsystems share a single SQLite database per mind scope.

```
+----------------------------------------------------------------------+
|                   Agent Runtime (host process)                       |
+----------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+------------------+  +----------------+  +------------------+
|   FrameStore     |  | HybridSearch   |  | KnowledgeGraph   |
| (I/P/B frames,   |  | (FTS5 + vec0,  |  | (entities,       |
|  GOP sessions,   |  |  RRF fusion,   |  |  relations,      |
|  consolidation)  |  |  4 profiles)   |  |  SCD-2 temporal) |
+--------+---------+  +--------+-------+  +---------+--------+
         |                     |                     |
+--------+---------------------+---------------------+--------+
|              SQLite + sqlite-vec (.mind file)                |
|  10 tables, FTS5 virtual table, vec0 virtual table (1024-d) |
|  WAL mode, append-only audit triggers                        |
+--------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+------------------+  +----------------+  +------------------+
| IdentityLayer    |  | AwarenessLayer |  | ComplianceStore  |
| (stable user     |  | (volatile task |  | (append-only     |
|  profile, <500   |  |  state, <=10   |  |  interaction log, |
|  tokens)         |  |  active items) |  |  Art. 12/14/19/  |
+------------------+  +----------------+  |  26/50 mapping)  |
                                          +------------------+
         |                    |
         v                    v
+------------------+  +------------------+
| WikiCompiler     |  | EvolutionStore   |
| (entity/concept/ |  | (execution       |
|  synthesis pages,|  |  traces, runs,   |
|  incremental)    |  |  deploy log)     |
+------------------+  +------------------+
```

*Figure 1. Hive-Mind system architecture. All components share a single SQLite database per mind scope. The EvolutionStore (Section 8) is shown separately as it bridges the memory and agent layers.*

### 2.2 Storage model

Each mind scope is a single `.mind` file---a SQLite database opened in WAL (Write-Ahead Logging) mode for concurrent read access during writes. The schema comprises 10 persistent tables across 8 logical layers, plus two virtual tables:

| Layer | Table(s) | Purpose |
|-------|----------|---------|
| 0 | `identity` | Stable user profile (single row, constrained to id=1) |
| 1 | `awareness` | Volatile task/state tracking (capped at 10 active items) |
| -- | `sessions` | GOP-to-project mapping with status lifecycle |
| 2 | `memory_frames` | I/P/B frames with GOP grouping and importance levels |
| 2a | `memory_frames_fts` | FTS5 full-text index on frame content (Porter stemming + Unicode) |
| 2b | `memory_frames_vec` | sqlite-vec virtual table for 1024-dimensional embeddings |
| 3 | `knowledge_entities` | Typed entities with SCD-2 temporal validity |
| 3 | `knowledge_relations` | Typed, confidence-scored relations with SCD-2 validity |
| 4 | `procedures` | GEPA-optimized prompt templates with versioning |
| 5 | `improvement_signals` | Recurring behavioral patterns (capability gaps, corrections, workflow patterns, skill promotions) |
| 6 | `install_audit` | Capability installation trust trail |
| 7 | `ai_interactions` | Append-only EU AI Act compliance log |
| 8 | `harvest_sources` | Memory harvest sync tracking per source |
| 9 | `execution_traces` | Per-turn agent execution history for evolution |
| 10 | `evolution_runs` | Proposed/accepted/rejected self-evolution runs |

The `ai_interactions` table is protected by two DDL-level triggers that prevent UPDATE and DELETE operations, raising an ABORT with the message "ai_interactions is append-only (EU AI Act Art. 12 audit log)." This is an architectural guarantee: even a motivated attacker with direct database access cannot silently modify audit entries without disabling the triggers, which itself would be detectable.

### 2.3 Component inventory

The following verified numbers characterize the system as of April 2026:

- **10 harvest adapters**: ChatGPT, Claude, Claude Code, Claude Desktop, Gemini, Perplexity, Markdown, Plaintext, PDF, URL (plus a universal fallback)
- **22 agent personas** with tool allowlists and documented failure patterns
- **13 SQL tables** across 8 schema layers
- **1024-dimensional** embeddings via sqlite-vec virtual table
- **RRF_K = 60** for hybrid search fusion
- **4 scoring profiles**: balanced, recent, important, connected
- **60+ native agent tools** across memory, filesystem, git, web, planning, workflow, and compliance categories

---

## 3. The Frame Model

### 3.1 Motivation

Most memory systems treat individual messages, facts, or documents as atomic storage units. This forces a false choice: either store everything (turn-blob) and accept linear growth, or extract and compress (key-value, graph) and accept information loss. Neither approach naturally represents the temporal structure of how knowledge evolves through conversation.

Consider a realistic scenario: a user discusses "the Acme contract" across five sessions over three weeks. The first session establishes the basic terms. The second amends the payment schedule. The third flags a liability concern. The fourth resolves the concern with a new clause. The fifth finalizes the deal. A turn-blob system stores all five sessions and relies on vector similarity to find the relevant turns. A key-value system stores "Acme contract: finalized with amended payment schedule and liability clause"---losing the deliberation history. A graph system stores entities (Acme, contract, payment, liability) with relations, but the relations are typically atemporal and do not capture the refinement chain.

The frame model encodes a different bet: **most useful memory is a branching temporal graph with explicit grouping and refinement semantics.** The five Acme sessions produce one or more I-frames (the core facts at each stage), several P-frames (amendments, clarifications, decisions), and B-frames linking the Acme discussion across sessions. Consolidation periodically merges P-frames back into a richer I-frame, upgrading its content while preserving the property that old, unused P-frames can be decayed without losing the core memory.

### 3.2 Definitions

**Definition 1 (Frame).** A frame $F$ is a tuple $(id, type, gop, t, base, content, importance, source, access)$ where:

- $type \in \{I, P, B\}$ is the frame type
- $gop$ is a group-of-pictures identifier linking the frame to a session
- $t \in \mathbb{N}$ is the temporal index within the GOP (monotonically increasing)
- $base \in \mathbb{N} \cup \{\bot\}$ is the base frame reference (null for I-frames)
- $content$ is the textual payload
- $importance \in \{critical, important, normal, temporary, deprecated\}$ is a five-level importance tag
- $source \in \{user\_stated, tool\_verified, agent\_inferred, import, system\}$ is provenance metadata
- $access \in \mathbb{N}$ is the access count (used for popularity scoring and decay decisions)

**Definition 2 (I-frame).** An Independent frame is a self-contained memory keyframe. It carries complete, context-free content that can be understood without reference to any other frame. An I-frame has $base = \bot$. Every GOP must contain at least one I-frame.

**Definition 3 (P-frame).** A Predicted frame is a continuation delta. It references a base I-frame within the same GOP via $base = id_I$ and carries content that adds to, refines, extends, or amends the I-frame's content. A P-frame is not self-contained; its full meaning requires reading the base I-frame.

**Definition 4 (B-frame).** A Bidirectional frame is a structural link between two frames, potentially in different GOPs. It stores a JSON payload containing a description and a list of referenced frame identifiers. B-frames express entity co-occurrence, causal links, contradiction flags, or topical connections.

**Definition 5 (GOP).** A Group of Pictures is identified by a `gop_id` string and corresponds to a session or conversational thread. A GOP is associated with zero or one project identifiers and has a lifecycle status (active, closed, archived). Within a GOP, there is typically one I-frame (the session keyframe) followed by $n$ P-frames. B-frames may link across GOPs.

### 3.3 Formal properties

Let $\mathcal{F}$ be the set of all frames and $gop: \mathcal{F} \to \mathcal{G}$ the GOP assignment function.

**Invariant 1 (GOP containment).** For every GOP $g \in \mathcal{G}$, there exists at least one frame $F_I \in \mathcal{F}$ with $gop(F_I) = g$ and $type(F_I) = I$. This invariant ensures that every session has a keyframe from which P-frames can derive their context.

**Invariant 2 (Delta referential integrity).** For every P-frame $F_P$, there exists an I-frame $F_I$ with $gop(F_I) = gop(F_P)$, $type(F_I) = I$, and $id(F_I) = base(F_P)$. This invariant is enforced via a foreign key constraint (`FOREIGN KEY (base_frame_id) REFERENCES memory_frames(id)`) in the schema.

**Invariant 3 (B-frame validity).** Every B-frame references two or more valid, non-deprecated frames. B-frames whose referents are all deprecated are themselves candidates for decay.

**Invariant 4 (Temporal monotonicity).** Within a GOP $g$, $t$ values are strictly increasing: if $F_a$ was created before $F_b$ in the same GOP, then $t(F_a) < t(F_b)$. This is enforced at the application level by the `nextT()` method, which queries the current maximum $t$ and increments.

### 3.4 The video compression analogy

The vocabulary is borrowed from MPEG and H.264/AVC (Wiegand et al., 2003), but the compression mathematics is not. We do not claim coding-theoretic optimality for memory; we claim the *conceptual analogue* is useful:

| Video compression | Hive-Mind memory |
|-------------------|-----------------|
| I-frame: complete image, expensive to store | I-frame: complete memory, anchors a session |
| P-frame: forward-predicted delta, cheap | P-frame: refinement delta, references an I-frame |
| B-frame: bidirectional reference, cross-cutting | B-frame: structural link across sessions |
| GOP: sequence of frames forming a scene | GOP: session/thread forming a conversational unit |
| Consolidation: periodic I-frame refresh | Consolidation: merge P-frames into a richer I-frame |
| Decay: discard old predicted frames | Decay: deprecate low-access P-frames |

The analogy holds at the level of information management strategy: expensive keyframes carry structure, cheap predicted frames carry deltas, and bidirectional references carry cross-cutting structure. The specific gain in memory systems is that consolidation and decay become structurally grounded operations rather than heuristics applied to a flat list.

### 3.5 Source provenance and confidence

Each frame carries source provenance:

- **user_stated**: The user explicitly asserted this fact. Highest default trust.
- **tool_verified**: A tool call (file read, API response, database query) produced this fact. High trust for the specific domain of the tool.
- **agent_inferred**: The agent derived this fact from reasoning over existing frames. Medium trust; subject to contradiction detection.
- **import**: The fact was harvested from an external conversation (ChatGPT, Claude, Gemini export, etc.). Trust depends on the source adapter's fidelity.
- **system**: Internal bookkeeping frames (session markers, consolidation summaries).

The importance level (critical through deprecated) and the source provenance together inform the scoring pipeline (Section 5) and the decay policy: a `user_stated` / `critical` frame is never automatically decayed, while an `agent_inferred` / `temporary` frame with zero access count is a prime candidate.

### 3.6 Deduplication

Write-path deduplication operates at multiple levels:

1. **Exact content match**: Before creating an I-frame, `FrameStore.findDuplicate()` checks for an existing frame with identical content. If found, the existing frame's access count is incremented and the existing frame is returned. This prevents re-imports and repeated saves from creating duplicates.

2. **Normalized string match**: During harvest ingestion, content is normalized (whitespace collapsed, case-folded) before comparison.

3. **Embedding cosine similarity**: During cross-mind harvest, frames with cosine similarity > 0.95 to existing frames are flagged as potential duplicates.

4. **Cross-mind check**: When harvesting from a workspace mind into a personal mind (or vice versa), existing frames in the target mind are checked before insertion.

---

## 4. Multi-Mind Isolation

### 4.1 Scope hierarchy

Hive-Mind defines four memory scopes, each physically implemented as a separate `.mind` SQLite database:

1. **Personal mind**: Contains the user's individual memories, preferences, communication style, and personal knowledge. One per user.

2. **Workspace mind**: Contains project-specific or context-specific memories. A user may have many workspaces (e.g., "Legal Research," "Q2 Planning," "Startup Idea"). Each workspace has its own mind.

3. **Team mind**: Contains shared organizational knowledge accessible to team members. Synchronized via a `TeamSync` layer that pushes and pulls frames.

4. **Enterprise mind**: Contains company-wide policies, procedures, and institutional knowledge. Accessible to all team members; write access is governance-controlled.

### 4.2 The MultiMindCache

The `MultiMindCache` manages open database handles via an LRU eviction policy. When the agent's orchestrator needs to access a workspace mind, it calls `cache.getOrOpen(workspaceId)`, which either returns a cached handle or opens the `.mind` file and evicts the least recently used handle if the cache is full.

A defense-in-depth path traversal guard prevents a crafted `workspaceId` (e.g., `../../other-user.mind`) from opening an arbitrary filesystem path. If an `allowedRoot` is configured, any resolved path that does not descend from it is rejected:

```typescript
if (this.allowedRoot) {
  const resolved = path.resolve(mindPath);
  if (!resolved.startsWith(this.allowedRoot + path.sep)) {
    log.warn('path outside allowedRoot - rejecting');
    return null;
  }
}
```

### 4.3 Cross-mind read protocol

Cross-mind access is not transparent. When an agent needs to read from a workspace mind other than its current context, it invokes the `read_other_workspace` tool, which triggers an approval gate. The gate can be resolved in three ways:

- **Per-session grant**: The user approves access for the current session only. The grant expires when the session closes.
- **Permanent grant**: The user approves standing access between the two minds. Recorded in the approval log.
- **Denied**: The user denies the request. The denial is logged.

All three outcomes are recorded as auditable events in the compliance store. This makes cross-mind read an *event* rather than a *capability*---a critical distinction for regulated environments where the auditor's question is not "can the system access this data?" but "did the system access this data, and was it authorized?"

### 4.4 Write-path contradiction detection

Every `save_memory` call runs `detectContradiction(newContent, recentFrames)` before writing. The detector operates heuristically, focusing on decision reversals: when both the new content and an existing frame contain decision-like language and share significant keyword overlap but have opposing sentiment (positive vs. negative sentiment words), a contradiction is flagged.

When a contradiction is detected:

1. The frame is still written. Contradictions are data, not errors; the user may be deliberately changing their mind.
2. The return value is annotated with `[flag: contradicts_existing (excerpt)]` so the caller can surface the conflict.
3. A `correction`-category `ImprovementSignal` is emitted with a pattern key encoding both sides of the conflict.

These improvement signals flow downstream into the evolution subsystem (Section 8), where recurring contradiction patterns can trigger prompt mutations that improve the agent's handling of ambiguous or evolving user preferences.

### 4.5 Skill promotion chain

Adjacent to the memory core, Hive-Mind supports a skill promotion mechanism. A *skill* is a versioned Markdown file with YAML frontmatter (name, description, scope, permissions) plus a body describing how to accomplish a specific task. Skills have a four-level scope hierarchy mirroring the mind hierarchy:

**personal** $\to$ **workspace** $\to$ **team** $\to$ **enterprise**

A skill is promoted one rung at a time, with tier gating (team requires `teamSkillLibrary` capability; enterprise requires the ENTERPRISE tier). Each promotion:

1. Rewrites the frontmatter (scope field, appends to `promoted_from` history)
2. Moves the file to the scope-appropriate directory
3. Emits a `skill_promotion`-category improvement signal
4. Is rollback-safe (the old copy is preserved on collision)

Skills also auto-extract from conversation history: when the same tool sequence repeats two or more times across sessions, `autoExtractAndCreateSkill` produces a draft skill from the detected pattern. The user accepts or rejects the suggestion; accepted skills enter the personal scope and can then be promoted.

Decay: skills unused for 90 or more days are archived to a recoverable `skills-archive/` directory, keeping the library lean without data loss.

---

## 5. Hybrid Retrieval

### 5.1 Query pipeline

Hive-Mind's retrieval combines keyword search (FTS5) and vector search (sqlite-vec) through Reciprocal Rank Fusion (RRF). The pipeline proceeds as follows:

1. **Embed the query** using the configured embedder (Ollama, LiteLLM, or any OpenAI-compatible API).

2. **Vector search** via sqlite-vec with cosine similarity over 1024-dimensional embeddings stored in the `memory_frames_vec` virtual table.

3. **Keyword search** via SQLite FTS5 with Porter stemming and Unicode61 tokenization over the `memory_frames_fts` virtual table.

4. **RRF fusion** with $K = 60$:

$$\text{score}_{RRF}(d) = \sum_{r \in \{\text{vec}, \text{kw}\}} \frac{1}{K + \text{rank}_r(d)}$$

The RRF_K constant of 60 follows the standard recommendation from Cormack et al. (2009) for fusing heterogeneous ranked lists.

5. **Relevance scoring** via a weighted combination of four signals:

$$\text{relevance}(F) = w_t \cdot S_{temporal}(F) + w_p \cdot S_{popularity}(F) + w_c \cdot S_{contextual}(F) + w_i \cdot S_{importance}(F)$$

where the weights $w_t, w_p, w_c, w_i$ are determined by the scoring profile.

6. **Final score**: $\text{final}(F) = \text{score}_{RRF}(F) \times \text{relevance}(F)$

### 5.2 Scoring components

**Temporal score.** Recent frames receive a full score (1.0) within a 7-day recency boost window. Beyond 7 days, the score decays exponentially with a 30-day half-life:

$$S_{temporal}(F) = \begin{cases} 1.0 & \text{if } \Delta t \leq 7 \text{ days} \\ 0.5^{\Delta t / 30} & \text{otherwise} \end{cases}$$

**Popularity score.** A logarithmic function of access count: $S_{popularity}(F) = 1 + 0.1 \cdot \log_{10}(1 + \text{access\_count}(F))$.

**Contextual score.** Based on BFS distance in the knowledge graph from the query's focal entity to the frame: distance 0 scores 1.0, distance 1 scores 0.7, distance 2 scores 0.4, distance 3 scores 0.2, and beyond 3 scores 0.

**Importance score.** Directly maps to the frame's importance level: critical = 2.0, important = 1.5, normal = 1.0, temporary = 0.7, deprecated = 0.3.

### 5.3 Scoring profiles

Four profiles define the weight vectors:

| Profile | $w_{temporal}$ | $w_{popularity}$ | $w_{contextual}$ | $w_{importance}$ | Typical use case |
|---------|:---:|:---:|:---:|:---:|---|
| **balanced** | 0.4 | 0.2 | 0.2 | 0.2 | General-purpose queries |
| **recent** | 0.6 | 0.1 | 0.2 | 0.1 | "What did we discuss yesterday?" |
| **important** | 0.1 | 0.1 | 0.2 | 0.6 | "What are the critical decisions?" |
| **connected** | 0.1 | 0.1 | 0.6 | 0.2 | "What else relates to entity X?" |

Making the scoring profile explicit in the API surface allows agents to request the appropriate prior for each query type. This is an intentional departure from systems that apply a single ranking function to all queries.

### 5.4 Temporal filtering

In addition to scoring-based recency signals, the search API supports hard temporal filters (`since` and `until` ISO date strings) that restrict the candidate set before scoring. This enables precise temporal queries like "retrieve all frames from Q1 2026" without relying on the temporal score's soft decay.

### 5.5 Knowledge graph overlay

The knowledge graph (Section 5.6) provides an additional retrieval pathway. When the query mentions or maps to a known entity, the search can compute BFS distances from that entity's frame references to other frames in the graph, injecting graph-structural relevance into the scoring function via the contextual component.

### 5.6 Knowledge graph with SCD-2 temporal validity

Entities and relations in the knowledge graph have `valid_from` and `valid_to` columns implementing a Slowly Changing Dimension Type 2 (SCD-2) pattern. When an entity is updated, the old row is closed (its `valid_to` is set to the current timestamp) and a new row is opened. This enables temporal reasoning: "what did we believe about entity X on date D?" is answerable as a point-in-time query.

Auto-population is handled by a CognifyPipeline: on every frame save, an LLM extracts entities and relations; new entities are inserted; existing entities matched by name (with fuzzy matching) have their access counts strengthened.

Relations carry a confidence score (0.0 to 1.0, default 1.0) and typed relation strings (e.g., `works_at`, `decided_on`, `contradicts`), enabling both structural queries and confidence-weighted graph traversals.

---

## 6. Consolidation, Decay, and Strengthening

The MemoryWeaver subsystem maintains the frame corpus through three scheduled operations:

### 6.1 Consolidation

On an hourly cadence, `consolidateGop(gop_id)` gathers all P-frames under a GOP's current I-frame, merges their content into a new, richer I-frame, and marks the old P-frames as `deprecated`. This operation:

- Reduces the number of active frames while preserving information density
- Produces a more complete keyframe that can serve as context without requiring the P-frame chain
- Is idempotent: re-running consolidation on a GOP with no new P-frames is a no-op

### 6.2 Decay

On a daily cadence, `decayFrames()` deletes `deprecated` frames with zero access count. This is non-destructive in the sense that recently accessed frames survive longer. A `deprecated` frame that was read even once since deprecation is retained until the next decay cycle, allowing a grace period for frames that proved useful after consolidation.

### 6.3 Strengthening

On a weekly cadence, `strengthenFrames()` promotes frames with high access counts: `temporary` frames with sufficient access are promoted to `normal`, and `normal` frames with very high access are promoted to `important`. This creates a feedback loop where frequently retrieved memories become harder to decay---a rough analog to long-term potentiation in biological memory.

### 6.4 Automatic linking

`linkRelatedFrames(kg)` iterates over entities in the knowledge graph, finds frames that mention each entity, and creates B-frames for pairs that are not yet linked. This ensures that the frame graph's cross-GOP structure grows organically as new content is added, without requiring explicit linking by the user or agent.

---

## 7. Wiki Compilation

### 7.1 Overview

The WikiCompiler transforms the frame corpus into structured, navigable Markdown pages that serve as a living "second brain." Three page types are generated:

**Entity pages** (one per high-connectivity entity): Who or what is this entity? Timeline of mentions across sessions. Related entities. Relevant frames with citations.

**Concept pages** (thematic clusters): What is this topic? Who has mentioned it? What decisions have been made? A synthesis of frames that cluster around a common theme.

**Synthesis pages** (query-driven): Given a specific question, compile an answer from relevant frames with inline frame citations. These are generated on demand rather than on a schedule.

### 7.2 Incremental compilation

Compilation is incremental: only entities and concepts with new frames since the last compilation are rebuilt. The compiler tracks the last compilation timestamp per entity and per concept, and queries the frame store for frames created after that timestamp. For a 1,000-frame mind with approximately 50 entity pages, a full recompilation typically completes in minutes; an incremental update after a single session touches only the affected pages.

### 7.3 Health reports

The compiler produces health reports that identify:

- Entities with many frames but no compiled page (suggesting the compilation should run)
- Pages whose source frames have all been deprecated (suggesting the page is stale)
- Orphan entities with no relations in the knowledge graph (suggesting entity extraction quality issues)
- Concept clusters with low internal coherence (suggesting the clustering threshold should be adjusted)

### 7.4 Browsability

The compiled wiki is browsable in Waggle's Memory application and exportable as a static site. Entity pages link to related entity pages via the knowledge graph's relation structure, creating a navigable web of interconnected knowledge.

---

## 8. Compliance-by-Default

### 8.1 Design principle

Compliance-by-default means that the compliance layer is not an optional module, a premium feature, or a post-hoc integration. It is an architectural primitive: every AI interaction is logged automatically, the log is structurally tamper-resistant, and audit reports are a first-class system output available to every user regardless of tier.

This design is motivated by the observation that compliance requirements (particularly the EU AI Act, Regulation 2024/1689, applicable from August 2, 2026) impose obligations on *deployers* of AI systems, not just providers. A desktop AI agent platform's users *are* deployers, and they need compliance capabilities that work out of the box, not after a $50,000 enterprise integration.

### 8.2 EU AI Act article mapping

The following table maps Hive-Mind's compliance features to specific EU AI Act articles:

| Article | Requirement | Implementation |
|---------|------------|----------------|
| **Art. 12** | Automatic recording of events | Every LLM call, tool invocation, and agent action is logged in `ai_interactions` with timestamp, model, provider, token counts, cost, tools called, and (since the April 2026 revision) the actual input and output text |
| **Art. 14** | Human oversight | The `human_action` field records whether each interaction was approved, denied, modified, or required no human intervention. Approval gates, tool deny lists, and autonomy levels are available as oversight mechanisms |
| **Art. 19** | Log retention | Retention policy defaults to permanent. The `ComplianceStatusChecker` verifies that logs span at least 180 days by comparing the oldest log timestamp against system age, detecting pruning |
| **Art. 26** | Deployer monitoring | Four active monitors are always running: cost tracking, tool logging, model identification, and persona tracking |
| **Art. 50** | Model transparency | Every interaction logs the specific model identifier. A model inventory is available via `getModelInventory()`. Models are disclosed in the status bar UI |

### 8.3 Append-only enforcement

The `ai_interactions` table is protected by two SQLite triggers:

```sql
CREATE TRIGGER ai_interactions_no_delete
BEFORE DELETE ON ai_interactions
BEGIN
  SELECT RAISE(ABORT, 'ai_interactions is append-only
    (EU AI Act Art. 12 audit log)');
END;

CREATE TRIGGER ai_interactions_no_update
BEFORE UPDATE ON ai_interactions
BEGIN
  SELECT RAISE(ABORT, 'ai_interactions is append-only
    (EU AI Act Art. 12 audit log)');
END;
```

These triggers operate at the database engine level. Application code cannot bypass them through normal database operations. Disabling them requires DDL access (DROP TRIGGER), which is itself a detectable schema modification.

For GDPR Article 17 (right to erasure), the planned approach is a `pseudonymize_and_tombstone` flow that replaces input/output text with tombstone markers via a fresh INSERT with a status flag, rather than by bypassing the triggers. This preserves the audit trail's structural integrity while complying with erasure obligations.

### 8.4 ComplianceStatusChecker

The `ComplianceStatusChecker` evaluates compliance status per workspace and produces a structured report with per-article verdicts:

```typescript
interface ComplianceStatus {
  overall: 'compliant' | 'warning' | 'non-compliant';
  art12Logging: ArticleStatus & { totalInteractions: number };
  art14Oversight: ArticleStatus & { humanActions: number;
                                    approvalRate: number };
  art19Retention: ArticleStatus & { oldestLogDate: string | null;
                                    retentionDays: number };
  art26Monitoring: ArticleStatus & { activeMonitors: string[] };
  art50Transparency: ArticleStatus & { modelsDisclosed: boolean };
}
```

The overall status is `compliant` only if all five articles pass. A single `warning` (e.g., no interactions logged yet, which is expected for new workspaces) makes the overall status `warning`. A single `non-compliant` makes the overall status `non-compliant`.

The retention check (Article 19) is particularly careful: it distinguishes between "the system is new and hasn't been running for 180 days yet" (compliant) and "the system has been running for 200 days but the oldest log is only 30 days old" (warning---logs appear to have been pruned). This distinction is enabled by tracking system age via a `first_run_at` metadata entry set on schema initialization.

### 8.5 Audit report generation

A ReportGenerator produces structured audit reports that can be rendered as PDF (styled with Waggle's Hive design system tokens, locale-pinned to en-US for cross-jurisdiction portability). Reports include:

- Per-article compliance status with explanatory detail
- Model inventory (all models used, with interaction counts)
- Human oversight log (most recent 50 oversight actions, with approval/denial/modification breakdown)
- Harvest provenance (sources imported, frame counts, last sync dates)
- Interaction summary (total interactions, cost breakdown, token usage)

---

## 9. Identity and Awareness Layers

### 9.1 IdentityLayer

The IdentityLayer stores stable user facts in a single-row table constrained to `id = 1`:

- **name**: User's name
- **role**: Professional role or title
- **department**: Organizational unit
- **personality**: Communication style preferences
- **capabilities**: Declared competencies (used for agent calibration)
- **system_prompt**: Persistent customization of the agent's behavior

The identity is auto-derived during onboarding from the first $N$ harvested conversations via a one-shot LLM extraction, and is user-editable thereafter. At prompt construction time, the orchestrator injects the identity into the system prompt, giving the agent stable context without requiring a memory search for basics.

### 9.2 AwarenessLayer

The AwarenessLayer stores volatile state---active tasks, recent tool uses, pending approvals, flags---capped at 10 active items. Items are categorized as `task`, `action`, `pending`, or `flag`, and can carry optional expiration timestamps. The awareness state is refreshed every agent turn.

The separation between Identity (stable, rarely changing) and Awareness (volatile, per-turn) is deliberate: it prevents the agent from confusing "who the user is" with "what the user is doing right now," a conflation that degrades agent performance when both are stored in the same retrieval-ranked memory pool.

---

## 10. Harvest Pipeline

### 10.1 Overview

The Harvest Pipeline ingests conversational data from external AI platforms, transforming foreign formats into Hive-Mind frames. This enables users to bootstrap their memory from existing conversation histories rather than starting from scratch.

### 10.2 Adapter architecture

Each source is handled by a `SourceAdapter` implementing a common interface:

```typescript
interface SourceAdapter {
  sourceType: ImportSourceType;
  parse(input: unknown): UniversalImportItem[];
}
```

Adapters normalize source-specific formats (JSON exports from ChatGPT, Claude conversation exports, Gemini data takeouts, etc.) to a common `UniversalImportItem` structure. Each item flows through classification (what type of content is this?), extraction (what entities and facts does it contain?), distillation (what is the essential content?), and frame save (create appropriate I/P/B frames with correct provenance).

### 10.3 Supported sources

| Source | Format | Adapter |
|--------|--------|---------|
| ChatGPT | JSON export (`conversations.json`) | `chatgpt` |
| Claude | Conversation export | `claude` |
| Claude Code | Session history with tool calls | `claude-code` |
| Claude Desktop | Exported conversations | `claude-desktop` |
| Gemini | Google Takeout format | `gemini` |
| Perplexity | Search conversation export | `perplexity` |
| Markdown | `.md` files | `markdown` |
| Plaintext | `.txt` files | `plaintext` |
| PDF | Parsed PDF content | `pdf` |
| URL | Web page content (fetched and parsed) | `url` |
| Universal | Generic JSON/text fallback | `universal` |

### 10.4 Provenance tracking

Every frame created from a harvest carries `source = 'import'` and the harvest source metadata (original source type, original item ID, import timestamp) is preserved in the `harvest_sources` tracking table. This ensures that harvested memories can be distinguished from organically created ones and traced back to their origin.

### 10.5 Multi-layer deduplication

Harvest deduplication operates at four levels (as described in Section 3.6): exact match, normalized string match, embedding cosine similarity > 0.95, and cross-mind check. This prevents re-imports from the same or overlapping sources from creating duplicate frames.

---

## 11. Closed-Loop Prompt Evolution

### 11.1 Overview

The evolution subsystem closes the loop from memory to improvement. Execution traces (persisted in the memory substrate) feed into an evaluation pipeline, which drives prompt mutations, which are judged and gated before deployment. The system integrates two lines of prior work:

1. **GEPA** (Genetic-Pareto; Agrawal et al., arXiv:2507.19457, ICLR 2026 Oral): a reflective prompt evolution algorithm that maintains a population of prompt candidates, evaluates them on a Pareto frontier across multiple objectives, and uses judge feedback as "Actionable Side Information" (ASI) to drive targeted mutations rather than blind search. GEPA outperforms reinforcement learning baselines (GRPO) by +6% average and +20% maximum with up to 35x fewer rollouts, and outperforms MIPROv2 (Opsahl-Ong et al., 2024) by >10%.

2. **ACE** (Agentic Context Engineering; Zhang et al., arXiv:2510.04618, Stanford/SambaNova): a framework for incremental playbook evolution that avoids context collapse in long-running agents. Waggle's `EvolveSchema` module draws on this line of work for structural schema evolution---evolving output *structure* (fields, types, ordering, constraints) orthogonally to instruction text.

### 11.2 Evolution pipeline

The pipeline proceeds through six stages:

```
Execution Traces  -->  Eval Dataset  -->  ComposeEvolution  -->  Gates
      |                                         |                  |
      v                                         v                  v
 (per-turn          (curated train/     (GEPA + EvolveSchema    (size, growth,
  recordings)        test split)         two-stage pipeline)     structural,
                                                                 regression)
                                                                    |
                                                                    v
                                                              EvolutionRunStore
                                                                    |
                                                                    v
                                                              User accepts/rejects
                                                                    |
                                                                    v
                                                              Deploy callback
                                                              (persona override,
                                                               behavioral-spec
                                                               override, etc.)
```

**Stage 1: Trace recording.** Every chat turn is recorded as an `execution_trace` with session ID, persona ID, workspace ID, model, task shape, outcome (success/corrected/abandoned/verified/pending), a JSON trace payload, cost, and duration. The `TraceRecorder` is wired into the agent loop and the chat server route, ensuring traces flow automatically without explicit instrumentation.

**Stage 2: Dataset construction.** The `EvalDatasetBuilder` curates evaluation examples from recorded traces, filtering by outcome quality (preferring traces with `success` or `verified` outcomes) and stratifying by persona and task shape.

**Stage 3: Two-stage composition.** `ComposeEvolution` runs two stages with feedback separation:

- **Stage 3a: EvolveSchema.** Evolve the output *structure*---field names, types, descriptions, ordering, constraints. Uses three mutation phases per generation: structure discovery (add/replace/drop fields), field-order probes (permutation), and failure-driven refinement (targeted field edits based on judge feedback). Pareto selection is 2-dimensional: (accuracy, negative complexity). Eight typed mutations are available: `add_output_field`, `remove_field`, `edit_field_desc`, `change_field_type`, `add_constraint`, `remove_constraint`, `reorder_fields`, `replace_output_fields`.

- **Stage 3b: Iterative GEPA.** Freeze the winner schema from Stage 3a. Evolve the *instruction prompt* that fills that schema. GEPA maintains a population of candidates, screens them via micro-eval on a small sample, mini-evals passing candidates on a larger sample, then spawns reflective mutations of the top Pareto candidate using aggregated judge feedback. An anchor evaluation on the full eval set picks the winner. Pareto selection is 3-dimensional: (correctness, procedure-following, conciseness).

**Critical design detail (feedback separation):** If the judge complains "missing reasoning field" during Stage 3b (instruction optimization), and GEPA sees that feedback, it would mutate the instruction to try to compensate for a structural deficiency---undoing the schema Stage 3a just evolved. Therefore, Stage 3b receives a *filtered* judge that strips structural complaints and keeps only value-level signals (correctness, format-of-values, tone, conciseness).

**Stage 4: Constraint gates.** Before a candidate reaches production, it must pass four gate categories:

- **Size gates**: Hard character caps per target type (persona prompt $\leq$ 3,000 chars, tool description $\leq$ 500, skill $\leq$ 15KB, behavioral-spec section $\leq$ 4,000).
- **Growth gates**: Percentage cap over baseline (default +20%) prevents runaway prompt bloat across generations.
- **Structural gates**: Non-empty, no unresolved placeholders (`[PLACEHOLDER]`, `TODO:`), balanced markdown fences.
- **Regression gates**: Score delta on a held-out eval set must not drop below tolerance (default -2%).

Each gate returns structured reasons so the orchestrator can log *why* a candidate was rejected and surface it in the UI.

**Stage 5: Persistence.** Every run---proposed, accepted, rejected, deployed, or failed---is persisted in the `evolution_runs` table with full artifacts (baseline text, winner text, winner schema, accuracy delta, gate verdicts, gate reasons, user notes). This creates an auditable evolution history.

**Stage 6: Deployment.** When the user accepts a proposed run, a pluggable deploy callback fires. The callback writes to the appropriate target (persona file override, behavioral-spec override, etc.), reloads the affected caches, and emits an event for hot-reload. The orchestrator then marks the run as deployed. If the callback throws, the run is marked as failed with the error message preserved.

### 11.3 LLM-as-Judge

The judge scores candidate responses along three weighted dimensions:

| Dimension | Weight | Description |
|-----------|:------:|-------------|
| Correctness | 0.50 | Does the answer match the expected output? |
| Procedure-following | 0.30 | Did the agent follow the instructions and format? |
| Conciseness | 0.20 | Is the response on-point without padding? |

A length penalty is applied as a soft cap multiplied into the final score. The textual feedback produced by the judge is the input that drives GEPA's reflective mutations---it must explain *what* went wrong (or right) so the next prompt variation can target the identified weakness.

The judge is model-agnostic: the caller provides an `llmCall` function. The v1 experiment used a 4-judge pool (Claude Opus 4.6, Claude Sonnet 4.6, GPT-5, Gemini 2.5 Pro); the v2 design drops Opus as a judge (since it is also the baseline arm) and replaces it with Claude Haiku 4.5.

### 11.4 Boot-time integration

At server startup, `buildActiveBehavioralSpec(overrides)` merges any deployed behavioral-spec overrides with the baseline specification. The active spec is cached as a server decorator, and the chat route uses it for all subsequent interactions. When a new evolution run is accepted and deployed, a `behavioral-spec:reloaded` event triggers hot-reload of the cached spec without server restart.

---

## 12. Experimental Results

### 12.1 Preliminary result (v1)

We conducted a preliminary evaluation of the closed-loop evolution subsystem. The experimental setup was as follows:

**Task.** 10 curated coder questions spanning code generation, debugging, refactoring, and architecture tasks.

**Arms.** Two arms:
- Arm A: Claude Opus 4.6 with no special prompting (the baseline flagship model)
- Arm C: Gemma 4 31B (Google, released April 2, 2026 under Apache 2.0; Arena #3 open model at 1452 Elo as of April 2026) with a prompt evolved by Waggle's GEPA + EvolveSchema loop

**Judges.** Four blind judges, each scoring both arms on a 1-5 rubric:
1. Claude Opus 4.6 (Anthropic)
2. Claude Sonnet 4.6 (Anthropic)
3. GPT-5 (OpenAI)
4. Gemini 2.5 Pro (Google)

Arm labels were randomized per example to prevent positional bias. Judges were not informed which arm used which model.

**Primary metric.** Per-judge C/A ratio (evolved Gemma score / raw Opus score), aggregated as the mean across judges.

**Result.** Mean per-judge C/A ratio: **108.8%**. That is, the 4-judge mean rated Gemma 4 31B with the Waggle-evolved prompt 8.8 percentage points *above* raw Opus 4.6. Notably, the Opus judge itself ranked evolved-Gemma above raw-Opus---the opposite of self-preservation bias. The evolved prompt added only +91 tokens over the baseline.

### 12.2 Limitations of v1

We enumerate six specific limitations of the v1 result:

1. **Small sample size.** n=10 is severely underpowered for any claim of statistical significance.
2. **Single domain.** Coder questions only; generalization to other task families (writing, analysis, research) is undemonstrated.
3. **Weak baseline.** The "raw Opus" baseline used no system prompt engineering; a well-engineered Opus prompt would likely close the gap.
4. **Train/test contamination.** GEPA and the judges saw the same 10 examples; there is no held-out test set.
5. **Opus-as-judge conflict.** Opus was both Arm A (the model being compared against) and one of the four judges, creating a potential (though empirically unfavorable) self-bias pathway.
6. **No confidence interval.** No bootstrap CI or significance test was computed.

We present this result as a motivating preliminary finding, not as a validated claim. The v2 experiment (Section 12.3) is designed to address each of these limitations.

### 12.3 v2 experimental design (in progress)

The v2 evaluation scales to address the v1 limitations:

**Dataset.** 60 examples: 30 training, 30 held-out test. Stratified across 3 domains (writer, analyst, researcher), with 10 examples per domain per stratum.

**Arms.** Four arms, all non-A arms running on Gemma 4 31B:
- Arm A: Raw Claude Opus 4.6 (baseline flagship)
- Arm B1: Gemma + weak prompt ("Answer the question clearly.")
- Arm B2: Gemma + human-engineered prompt (~100 tokens, task-aware, hand-crafted)
- Arm B3: Gemma + GEPA-evolved global prompt (the evolved candidate)

The inclusion of three graded baselines (weak, human-engineered, evolved) addresses the v1 limitation of comparing only against a zero-effort baseline.

**Judges.** Four judges from three vendor lineages (Opus dropped entirely):
1. Claude Sonnet 4.6 (Anthropic)
2. Claude Haiku 4.5 (Anthropic)
3. GPT-5 (OpenAI)
4. Gemini 2.5 Pro (Google)

Letter-to-arm randomization is applied per example to prevent positional bias.

**Evolution.** A single global prompt is evolved via GEPA against all 30 training examples simultaneously (per the Q4 decision to test global rather than per-domain prompts). Iteration cap: 500 iterations or $80 spend, whichever fires first. Early-abort trigger: if mean training-set score plateaus below 0.85 for 50 consecutive iterations.

**Statistical tests.**
- 10,000-iteration bootstrap 95% confidence interval on the C/A ratio
- Permutation test at $\alpha = 0.05$

**Hypotheses.**
- H1: C/A $\geq$ 0.95 for 2+ of 3 domains (evolved Gemma is competitive with Opus)
- H2: C/A $\geq$ 1.00 for 1+ domain (replicates the v1 headline)
- H3: C/A < 0.90 for 2+ domains (negative result)

**Pre-commitment.** We commit to publishing the result regardless of outcome: positive, negative, or mixed. This pre-commitment is documented in `docs/hypothesis-v2-decisions.md` (Q5 decision) and is intended as a credibility signal.

**Budget.** $200 hard cap, tracked via `CostTracker`. Approximately $80 for GEPA training, $80 for test-set evaluation (360 judge calls), and $40 contingency.

**Reproducibility.** The dataset, split seed, judge prompts, evolved prompt, and raw scores will be published in a public repository upon completion.

---

## 13. Related Work

### 13.1 Memory systems for AI agents

**Letta/MemGPT** (Packer et al., 2023; approximately 13,000 GitHub stars). Introduces the analogy between LLM context management and operating system virtual memory, with archival and recall memory paging. The agent explicitly manages what is in the "working set" (context window) by paging facts in and out. Hive-Mind differs in that memory management is structural (frame types determine consolidation and decay behavior) rather than procedural (the agent deciding what to page).

**mem0** (Mem0 Team, 2024; approximately 48,000 GitHub stars). Packages memory as a developer-friendly API with automatic extraction, key-value semantics, and multi-user support. mem0 is designed as a hosted service or self-hosted API server. Hive-Mind differs in three ways: (a) it is a library, not a service, eliminating the network hop on the memory hot path; (b) it uses frame-graph rather than key-value semantics, preserving temporal structure; (c) it includes compliance auditing and multi-mind isolation as first-class features.

**Zep and Graphiti** (Zep Team, 2024; Graphiti approximately 24,500 GitHub stars). Combines knowledge graphs with temporal recency for agent memory. Graphiti specifically focuses on incrementally building a knowledge graph from conversational data. Hive-Mind's knowledge graph layer is conceptually similar but operates as one component within a broader architecture that includes frame-level storage, multi-mind isolation, and compliance auditing. The SCD-2 temporal validity on both entities and relations is a distinguishing detail.

**Microsoft GraphRAG** (Microsoft Research, 2024; approximately 31,000 GitHub stars). Applies graph-based retrieval to multi-hop queries over private corpora. GraphRAG is primarily a retrieval technique operating over a pre-built graph; Hive-Mind is a broader memory system that includes graph-based retrieval as one component alongside frame storage, consolidation, compliance, and evolution.

**Cognee** (approximately 14,200 GitHub stars). Focuses on graph reasoning over memory with a modular pipeline architecture. Hive-Mind shares the emphasis on graph structure but differs in the frame-level storage primitive and the integrated compliance layer.

**Mastra** (approximately 22,000 GitHub stars; Apache 2.0 + enterprise extensions). An agent framework with memory capabilities. Mastra's architecture (open core with an `ee/` directory for enterprise features) is a relevant precedent for the planned open-source release of Hive-Mind's core primitives.

### 13.2 Prompt optimization

**DSPy** (Khattab et al., 2023; approximately 28,000 GitHub stars, approximately 160,000 monthly PyPI downloads). A framework for programming---rather than prompting---language models, with automatic optimization of prompts and few-shot examples. GEPA has been integrated into DSPy 3.0 as `dspy.GEPA`. Hive-Mind's evolution subsystem integrates GEPA at the level of the agent runtime rather than at the DSPy program level, operating over execution traces rather than DSPy program signatures.

**GEPA** (Agrawal et al., arXiv:2507.19457, ICLR 2026 Oral). Genetic-Pareto prompt optimization using reflective mutations driven by judge feedback (Actionable Side Information). Maintains a population of candidates on a Pareto frontier across multiple objectives. Outperforms GRPO by +6% average / +20% max with 35x fewer rollouts; outperforms MIPROv2 by >10%. This is the core instruction-level optimization algorithm in Hive-Mind's evolution pipeline.

**ACE** (Zhang et al., arXiv:2510.04618, Stanford/SambaNova). Agentic Context Engineering for incremental playbook evolution. Avoids context collapse in long-running agents by evolving the agent's operational playbook. This line of work informs Hive-Mind's `EvolveSchema` module for structural schema evolution, though the specific implementation is independent.

**TextGrad** (Yuksekgonul et al., Nature 2025). Treats LLM outputs as differentiable text and uses natural-language "gradients" for optimization. A complementary approach to GEPA's population-based search.

**OPRO** (Yang et al., arXiv:2309.03409). Large language models as optimizers, using an LLM to iteratively generate and evaluate optimization candidates. An early entry in the LLM-based prompt optimization space.

**Promptbreeder** (Fernando et al., arXiv:2309.16797, DeepMind). Self-referential self-improvement for LLM prompt generation. Evolves both the task prompts and the mutation operators themselves.

**APE** (Zhou et al., arXiv:2211.01910). Automatic Prompt Engineer: LLM-based generation and selection of instruction prompts. An early demonstration that LLMs can optimize their own prompts.

### 13.3 AI governance and compliance

The compliance mapping draws on EU AI Act interpretive guidance (European Parliament, 2024; Regulation 2024/1689) and the NIST AI Risk Management Framework (NIST AI RMF 2.0, 2024). To our knowledge, no other open-source memory system ships compliance-by-default audit generation as a first-class feature with DDL-level tamper prevention.

---

## 14. Limitations and Future Work

We identify the following limitations of the current system:

### 14.1 Single-node architecture

Hive-Mind is backed by SQLite, which is a single-writer, file-based database. This is an intentional design choice for the desktop deployment scenario (single user, local-first, no server dependency), but it imposes scaling constraints:

- **No horizontal scaling.** Multiple nodes cannot write to the same `.mind` file simultaneously.
- **No distributed consensus.** The multi-mind protocol anticipates multi-tenant isolation but not distributed replication.
- **Write throughput ceiling.** SQLite's write throughput is sufficient for conversational workloads (hundreds of writes per second) but may constrain high-volume automated ingestion.

For enterprise deployments requiring multi-node access, a migration path to PostgreSQL (with pgvector replacing sqlite-vec) is architecturally straightforward but not yet implemented.

### 14.2 LLM dependency

Several operations depend on LLM inference:

- **Entity extraction** (CognifyPipeline) requires an LLM for each frame save
- **Wiki compilation** requires an LLM for synthesis page generation
- **Evolution** is inherently LLM-intensive (judge calls, mutation generation)

Offline-only deployments fall back to raw frame storage without knowledge graph enrichment or wiki compilation. This is acceptable for basic memory and retrieval but limits the graph-augmented capabilities.

### 14.3 Language coverage

The contradiction detector's sentiment word lists, the entity normalizer, and the injection scanner's pattern sets are English-only. Multilingual deployments would require language-specific word lists and potentially different detection strategies for languages with different morphological properties.

### 14.4 Adapter coverage

The harvest pipeline supports 11 source types as of April 2026. Notable gaps include Cursor, GitHub Copilot, Notion, Obsidian, and voice-transcript services. The adapter interface is designed for easy extension, but each new adapter requires source-specific format parsing and validation.

### 14.5 Compliance scope

The current compliance mapping covers the EU AI Act. HIPAA (US healthcare), SOC 2 (service organization controls), ISO 27001 (information security management), and other regulatory frameworks require bespoke mapping and configuration. The architecture supports this (the ComplianceStatusChecker is extensible), but the implementation work is not done.

### 14.6 Experimental evidence

The v1 evolution result (108.8% C/A ratio) is preliminary. n=10, single domain, weak baseline, no held-out test set, and no confidence intervals. The v2 experiment is designed to address these limitations but has not yet been executed. We present the architecture and integration as the primary contribution of this paper; the empirical evaluation of the evolution subsystem's effectiveness across diverse task families is future work.

### 14.7 Frame content type

Frames currently store textual content only. Images, code blocks, and video references are stored as text descriptions or metadata tags rather than first-class content. Multi-modal memory (storing and retrieving image embeddings alongside text embeddings) is future work.

### 14.8 Organizational fit

The four-scope model (personal, workspace, team, enterprise) may not fit all organizational structures. Flat team-member-level permissions, hierarchical department structures, and matrix organizations may require more flexible scope definitions.

---

## 15. Conclusion

Hive-Mind makes four architectural bets about how AI agent memory should work:

1. **Temporal frames over flat stores.** The I/P/B frame model with GOP grouping provides structurally grounded consolidation, decay, and cross-reference operations that flat key-value or turn-blob designs cannot support without ad hoc heuristics.

2. **Multi-mind isolation as a first-class primitive.** Physical separation of memory scopes, approval-gated cross-access, and path-traversal-guarded cache management provide auditable data boundaries that matter for both privacy-conscious individuals and regulated enterprises.

3. **Compliance by default, not by upgrade.** Append-only audit logging with DDL-level tamper prevention, direct EU AI Act article mapping, and structured audit report generation should be available to every user of an AI agent platform, not gated behind an enterprise tier.

4. **Closed-loop evolution over the memory substrate.** The integration of GEPA instruction optimization, schema-level structural evolution, constraint gates, and user-controlled deployment---operating over execution traces persisted in the same database as the agent's memory---creates a self-improving system whose improvements are auditable and reversible.

Each bet is independently defensible and jointly positions the system to serve a range of users from solo prosumers to regulated enterprises. The frame model and multi-mind isolation are generalizable beyond Waggle OS; the compliance layer is a differentiator for European markets ahead of the August 2026 AI Act applicability date; and the evolution integration is a practical demonstration of how persistent memory enables closed-loop agent improvement.

The empirical work is partly ahead of us: the v1 result is encouraging but preliminary, and the v2 experiment will determine whether the evolution hypothesis holds at scale across domains. The architecture is available now, and we invite the research and practitioner community to build on, critique, and extend it.

---

## Acknowledgments

The author thanks the Waggle OS contributors and the Egzakta Group AI team. The evolution subsystem builds on GEPA (Agrawal et al., ICLR 2026 Oral) as the core instruction-level optimization algorithm and draws on ACE (Zhang et al., 2025) as the closest published analog for structural context evolution. The compliance mapping draws on EU AI Office interpretive guidance and NIST AI RMF 2.0. The video compression analogy for memory frame types was inspired by the H.264/AVC standard (Wiegand et al., 2003).

---

## References

Agrawal, L., Opsahl-Ong, K., & Khattab, O. (2026). GEPA: Genetic-Pareto Prompt Optimization. *Proceedings of the International Conference on Learning Representations (ICLR)*, Oral. arXiv:2507.19457.

Cormack, G. V., Clarke, C. L., & Buettcher, S. (2009). Reciprocal Rank Fusion outperforms Condorcet and individual Rank Learning Methods. *Proceedings of the 32nd International ACM SIGIR Conference*, 758-759.

European Parliament. (2024). Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence (AI Act). *Official Journal of the European Union*, L series.

Fernando, C., Banarse, D., Michalewski, H., Osindero, S., & Rocktaschel, T. (2023). Promptbreeder: Self-Referential Self-Improvement via Prompt Evolution. arXiv:2309.16797.

Khattab, O., Singhvi, A., Maheshwari, P., Zhang, Z., Santhanam, K., et al. (2023). DSPy: Compiling Declarative Language Model Calls into Self-Improving Pipelines. arXiv:2310.03714.

National Institute of Standards and Technology. (2024). AI Risk Management Framework (AI RMF) 2.0. NIST AI 100-1 Rev. 1.

Opsahl-Ong, K., Ryan, M. J., Peng, J., Zhong, M., Jia, J., et al. (2024). Optimizing Instructions and Demonstrations for Multi-Stage Language Model Programs. arXiv:2406.11695.

Packer, C., Wooders, S., Lin, K., Fang, V., Patil, S. G., Stoica, I., & Gonzalez, J. E. (2023). MemGPT: Towards LLMs as Operating Systems. arXiv:2310.08560.

Wiegand, T., Sullivan, G. J., Bjontegaard, G., & Luthra, A. (2003). Overview of the H.264/AVC Video Coding Standard. *IEEE Transactions on Circuits and Systems for Video Technology*, 13(7), 560-576.

Yang, Z., Wang, J., Ruan, Z., Pei, K., & Chen, H. (2023). Large Language Models as Optimizers. arXiv:2309.03409.

Yuksekgonul, M., Bianchi, F., Boen, J., Liu, S., Huang, Z., Guestrin, C., & Zou, J. (2025). TextGrad: Automatic Differentiation via Text. *Nature*.

Zhang, Q., Gao, J., Williams, A. L., & Zou, J. (2025). ACE: Agentic Context Engineering for Long-Horizon Agent Tasks. arXiv:2510.04618.

Zhou, Y., Muresanu, A. I., Han, Z., Paster, K., Pitis, S., Chan, H., & Ba, J. (2022). Large Language Models Are Human-Level Prompt Engineers. arXiv:2211.01910.

---

## Appendix A: SQL Schema (Authoritative)

The following is the complete schema from `packages/core/src/mind/schema.ts`, governing all persistent storage:

```sql
-- Layer 0: Identity (single-row stable user profile)
CREATE TABLE IF NOT EXISTS identity (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  department TEXT NOT NULL DEFAULT '',
  personality TEXT NOT NULL DEFAULT '',
  capabilities TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Layer 1: Awareness (volatile task state, <=10 items)
CREATE TABLE IF NOT EXISTS awareness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL
    CHECK (category IN ('task','action','pending','flag')),
  content TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);

-- Sessions: GOP-to-project mapping
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gop_id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','closed','archived')),
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT,
  summary TEXT
);

-- Layer 2: Memory Frames (I/P/B with GOP grouping)
CREATE TABLE IF NOT EXISTS memory_frames (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  frame_type TEXT NOT NULL
    CHECK (frame_type IN ('I','P','B')),
  gop_id TEXT NOT NULL,
  t INTEGER NOT NULL DEFAULT 0,
  base_frame_id INTEGER REFERENCES memory_frames(id),
  content TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'normal'
    CHECK (importance IN
      ('critical','important','normal','temporary','deprecated')),
  source TEXT NOT NULL DEFAULT 'user_stated'
    CHECK (source IN
      ('user_stated','tool_verified','agent_inferred','import','system')),
  access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (gop_id) REFERENCES sessions(gop_id)
);

-- FTS5 full-text index (Porter stemming + Unicode)
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_fts
  USING fts5(content, content_rowid='id',
             tokenize='porter unicode61');

-- sqlite-vec virtual table (1024-dimensional embeddings)
CREATE VIRTUAL TABLE IF NOT EXISTS memory_frames_vec
  USING vec0(embedding float[1024]);

-- Layer 3: Knowledge Graph - Entities (SCD-2 temporal)
CREATE TABLE IF NOT EXISTS knowledge_entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  name TEXT NOT NULL,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Layer 3: Knowledge Graph - Relations (SCD-2 temporal)
CREATE TABLE IF NOT EXISTS knowledge_relations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL
    REFERENCES knowledge_entities(id),
  target_id INTEGER NOT NULL
    REFERENCES knowledge_entities(id),
  relation_type TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  properties TEXT NOT NULL DEFAULT '{}',
  valid_from TEXT NOT NULL DEFAULT (datetime('now')),
  valid_to TEXT,
  recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Layer 5: Improvement Signals
CREATE TABLE IF NOT EXISTS improvement_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL
    CHECK (category IN ('capability_gap','correction',
                        'workflow_pattern','skill_promotion')),
  pattern_key TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  first_seen TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  surfaced INTEGER NOT NULL DEFAULT 0,
  surfaced_at TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

-- Layer 7: AI Interactions (append-only compliance log)
CREATE TABLE IF NOT EXISTS ai_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  workspace_id TEXT,
  session_id TEXT,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  tools_called TEXT NOT NULL DEFAULT '[]',
  human_action TEXT
    CHECK (human_action IN ('approved','denied','modified','none')),
  risk_context TEXT,
  imported_from TEXT,
  persona TEXT,
  input_text TEXT,
  output_text TEXT
);

-- Append-only triggers (EU AI Act Art. 12)
CREATE TRIGGER IF NOT EXISTS ai_interactions_no_delete
BEFORE DELETE ON ai_interactions BEGIN
  SELECT RAISE(ABORT,
    'ai_interactions is append-only (EU AI Act Art. 12 audit log)');
END;
CREATE TRIGGER IF NOT EXISTS ai_interactions_no_update
BEFORE UPDATE ON ai_interactions BEGIN
  SELECT RAISE(ABORT,
    'ai_interactions is append-only (EU AI Act Art. 12 audit log)');
END;

-- Layer 9: Execution Traces (evolution foundation)
CREATE TABLE IF NOT EXISTS execution_traces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  persona_id TEXT,
  workspace_id TEXT,
  model TEXT,
  task_shape TEXT,
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN
      ('success','corrected','abandoned','verified','pending')),
  trace_json TEXT NOT NULL DEFAULT '{}',
  cost_usd REAL NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  finalized_at TEXT
);

-- Layer 10: Evolution Runs
CREATE TABLE IF NOT EXISTS evolution_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_uuid TEXT NOT NULL UNIQUE,
  target_kind TEXT NOT NULL,
  target_name TEXT,
  baseline_text TEXT NOT NULL,
  winner_text TEXT NOT NULL,
  winner_schema_json TEXT,
  delta_accuracy REAL NOT NULL DEFAULT 0,
  gate_verdict TEXT NOT NULL DEFAULT 'pass'
    CHECK (gate_verdict IN ('pass','fail')),
  gate_reasons_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN
      ('proposed','accepted','rejected','deployed','failed')),
  artifacts_json TEXT,
  user_note TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  deployed_at TEXT
);
```

---

## Appendix B: Hive-Mind Public API (TypeScript)

```typescript
import { MindDB } from 'hive-mind/db';
import { FrameStore } from 'hive-mind/frames';
import { HybridSearch } from 'hive-mind/search';
import { KnowledgeGraph } from 'hive-mind/knowledge';
import { IdentityLayer } from 'hive-mind/identity';
import { AwarenessLayer } from 'hive-mind/awareness';
import { SessionStore } from 'hive-mind/sessions';

// Open a mind database
const db = new MindDB('/path/to/workspace.mind');
const frames = new FrameStore(db);
const search = new HybridSearch(db, embedder);
const kg = new KnowledgeGraph(db);
const sessions = new SessionStore(db);

// Create a session and write frames
const session = sessions.create();
const keyframe = frames.createIFrame(
  session.gop_id,
  'Alice suggested we use Postgres for the new service.',
  'normal',
  'user_stated'
);
const delta = frames.createPFrame(
  session.gop_id,
  'Team agreed on Postgres. Bob will handle migration.',
  keyframe.id,
  'important',
  'user_stated'
);

// Query with scoring profile
const results = await search.search(
  'what database did the team choose?',
  { profile: 'recent', limit: 10 }
);

// Knowledge graph: temporal entity query
const alice = kg.searchEntities('Alice')[0];
const relations = kg.getRelationsFrom(alice.id);

// Consolidation
const weaver = new MemoryWeaver(db, frames, sessions);
weaver.consolidateGop(session.gop_id);
```

---

## Appendix C: Scoring Profile Weight Vectors

| Profile | Temporal | Popularity | Contextual | Importance |
|---------|:--------:|:----------:|:----------:|:----------:|
| balanced | 0.40 | 0.20 | 0.20 | 0.20 |
| recent | 0.60 | 0.10 | 0.20 | 0.10 |
| important | 0.10 | 0.10 | 0.20 | 0.60 |
| connected | 0.10 | 0.10 | 0.60 | 0.20 |

Temporal decay: 7-day recency boost (score = 1.0), then exponential decay with 30-day half-life.

Popularity: $1 + 0.1 \cdot \log_{10}(1 + \text{access\_count})$.

Contextual: BFS distance from query entity: 0 $\to$ 1.0, 1 $\to$ 0.7, 2 $\to$ 0.4, 3 $\to$ 0.2, >3 $\to$ 0.

Importance: critical = 2.0, important = 1.5, normal = 1.0, temporary = 0.7, deprecated = 0.3.

---

## Appendix D: Evolution Gate Defaults

| Gate category | Parameter | Default |
|--------------|-----------|---------|
| Size: persona prompt | Max characters | 3,000 |
| Size: tool description | Max characters | 500 |
| Size: skill body | Max characters | 15,000 |
| Size: behavioral-spec section | Max characters | 4,000 |
| Size: generic | Max characters | 8,000 |
| Growth | Max % over baseline | +20% |
| Regression | Max accuracy drop | -2% |
| Structural | Unresolved placeholders | Forbidden |
| Structural | Balanced markdown fences | Required |
| Structural | Empty candidate | Forbidden |

---

## Appendix E: Code Availability

- **Hive-Mind** (Apache 2.0, planned): `github.com/waggle-os/hive-mind`
- **Waggle OS** (commercial + open product): `waggle-os.ai`
- **KVARK** (sovereign enterprise tier): `www.kvark.ai`
- **v2 hypothesis reproducibility** (forthcoming): `github.com/waggle-os/evolution-hypothesis-v2`
