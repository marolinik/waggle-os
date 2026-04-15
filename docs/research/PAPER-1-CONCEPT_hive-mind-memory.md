# Paper 1 — Hive-Mind: Frame-Graph Memory for Autonomous AI Agents

**Status:** CONCEPT — section skeleton + key claims. Full write-up after v2 memory evaluation runs.
**Target:** arXiv cs.AI preprint → NeurIPS / ACL workshop on AI Agents
**Authors:** Marko Markovic (Egzakta Group)
**Drafted:** 2026-04-15

---

## Thesis

Memory for AI agents should be modeled as a **temporal frame graph** — not turn-blobs, not key-value pairs, not unstructured entity graphs. The frame model (borrowed from video compression's I/P/B encoding) gives consolidation, decay, and link formation natural semantics. Combined with multi-tenant isolation and compliance-by-default auditing, this produces a memory system that is simultaneously rich, performant, enterprise-ready, and legally defensible.

---

## Section Skeleton

### 1. Abstract (~250 words)
- Four contributions: frame model, multi-mind isolation, compliance-by-default, wiki compilation
- System is deployed in production (Waggle OS desktop)
- Key numbers: [X] frames across [Y] users, [Z] harvest adapters, [W] retrieval latency
- **Placeholder:** insert real numbers after evaluation runs

### 2. Introduction
- **Position:** Four-taxonomy of memory approaches:
  1. Turn-blob (naive chatbot, early ChatGPT) — high fidelity, catastrophic recall-cost growth
  2. Key-value (mem0, OpenAI Memory) — efficient but loses context + temporal reasoning
  3. Graph-augmented (Zep/Graphiti, Microsoft GraphRAG) — rich but expensive writes
  4. **Frame-graph (ours)** — temporal continuity + consolidation + multi-scope + compliance
- Why a fifth approach is needed: enterprise deployments require isolation + audit trails that none of the above provide

### 3. The Frame Model
- **I/P/B types** from video compression:
  - I-frame: standalone fact (full context, no dependencies)
  - P-frame: predicted/derivative (references one I-frame, delta encoding)
  - B-frame: bidirectional (links two frames, captures relationships)
- **Formal definition:** 5 fields (id, gop_id, frame_type, content, importance, source, confidence, created_at)
- **Importance levels:** critical > important > normal > temporary > deprecated
- **Source provenance:** user_stated, tool_verified, agent_inferred → confidence derivation
- **Decay/consolidation semantics:** importance-aware retention, compaction within GOPs
- **Write-path dedup:** 3-level (exact match → normalized string → embedding cosine similarity > 0.95)
- **Write-path contradiction detection:** detects conflicting saves, emits correction signals

### 4. Multi-Mind Isolation
- **Scope hierarchy:** personal → workspace → team → enterprise
- Each scope is a separate `.mind` SQLite file
- **Cross-mind reads** require explicit approval gates (ALWAYS_CONFIRM list)
- **Write routing:** B1 guardrail detects workspace-specific content being saved to personal mind, silently redirects
- **Skill promotion chain:** personal → workspace → team → enterprise with tier gates (TEAMS required for team scope)
- **MultiMindCache:** LRU eviction, path-traversal guard, lifecycle management

### 5. Hybrid Retrieval
- **FTS5 + sqlite-vec fused via Reciprocal Rank Fusion (RRF_K=60)**
- 4 scoring components: recency, importance, access frequency, connection density
- 4 scoring profiles with explicit weight vectors (balanced/recent/important/connected)
- Knowledge graph overlay: entity-relation graph with bitemporal validity
- Temporal filtering (since/until params)
- **Placeholder:** retrieval quality benchmarks (precision@k, MRR) after evaluation

### 6. Wiki Compilation
- Entity pages, concept pages, synthesis pages — generated from frame corpus
- Incremental compilation (only recompile affected pages on new frame)
- Health reports (coverage, freshness, gaps)
- **Placeholder:** wiki quality metrics after evaluation

### 7. Compliance-by-Default
- EU AI Act article mapping:
  - Art. 12: Automatic event logging (inputs + outputs, not just token counts)
  - Art. 14: Human oversight (approval/denial actions)
  - Art. 19: Log retention (180-day minimum, system-age-aware check)
  - Art. 26: Deployer monitoring (cost, tools, model ID, persona)
  - Art. 50: Model transparency (model inventory disclosed)
- Append-only audit log with DDL-level triggers (BEFORE DELETE / BEFORE UPDATE → RAISE ABORT)
- Audit report PDF generation (boardroom-grade, pdfmake)
- GDPR Art. 17 intersection: pseudonymize-and-tombstone design for erasure requests

### 8. Harvest Pipeline
- 11 adapters: ChatGPT, Claude, Claude Code, Gemini, Perplexity, Markdown, Plaintext, PDF, URL, Universal
- 4-pass distillation: classify → extract → synthesize → dedup
- Model tiering: cheap model for classification, accurate model for extraction/synthesis
- Injection scan at pipeline entry (scanForInjection on all imported content)

### 9. Evaluation (TO BE COMPLETED)
- **Retrieval quality:** precision@k, MRR, recall against ground-truth frames
- **Write-path correctness:** dedup accuracy, contradiction detection precision/recall
- **Compliance completeness:** audit report vs manual Art. 12 checklist
- **Harvest quality:** frame quality scores across adapter types
- **Performance:** frames/sec ingestion, search latency at 10K/100K/1M frames
- **Comparison:** vs mem0, vs Letta/MemGPT, vs raw vector search

### 10. Related Work
- mem0 (48k stars) — API-first key-value, no multi-tenant, no compliance
- Letta/MemGPT (13k stars) — virtual context management, no frame model
- Zep/Graphiti (24.5k stars) — knowledge graph, no compliance-by-default
- Microsoft GraphRAG (31k stars) — community detection, batch-oriented, no agent integration
- Mastra (22k stars) — Apache 2.0 + ee/ pattern (we adopt same licensing strategy)
- Cognee (14.2k stars) — knowledge pipeline, no multi-mind

### 11. Limitations
- Single-node SQLite (no distributed scaling yet)
- LLM-dependent for entity extraction and wiki synthesis
- English-only content detection patterns
- v1 user base (production but limited scale data)

### 12. Conclusion
- Frame-graph memory is a viable fourth position
- Compliance-by-default is a differentiator, not an afterthought
- Open-source plan: `hive-mind` Apache 2.0 for memory primitives

---

## Key Claims (must be defensible with data)

| # | Claim | Evidence needed | Status |
|---|-------|----------------|--------|
| 1 | I/P/B frame model enables better consolidation than flat key-value | Comparative eval vs mem0 | PLANNED |
| 2 | Multi-mind isolation prevents cross-workspace leakage | Security test suite (already passing) | DONE |
| 3 | Hybrid search (FTS5+vec RRF) outperforms pure vector search | Retrieval benchmarks | PLANNED |
| 4 | Write-path contradiction detection catches conflicting saves | Unit tests (already passing) | DONE |
| 5 | Compliance report passes manual Art. 12 checklist | Audit comparison | PLANNED |
| 6 | Harvest pipeline ingests 1000 conversations in <5 min | Performance benchmark | PLANNED |

---

## What Needs to Happen Before Full Write-Up

1. **Run retrieval benchmarks** — precision@k, MRR on a curated test set
2. **Run performance benchmarks** — ingestion rate, search latency at scale
3. **Run comparative eval** — mem0 vs Hive-Mind on the same dataset
4. **Collect production metrics** — real user frame counts, search latencies
5. **External reviewer pass** — one ML peer reads the methods section
