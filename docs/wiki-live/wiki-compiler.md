---
type: concept
name: "Wiki Compiler"
confidence: 0.85
sources: 30
last_compiled: 2026-04-13T20:36:56.109Z
frame_ids: [797, 800, 801, 802, 932, 928, 929, 808, 960, 965, 986, 36, 945, 950, 905, 944, 22, 990, 21, 3, 24, 174, 31, 4, 171, 45, 1, 28, 167, 42]
related_entities: ["Wiki Compiler"]
---

# Wiki Compiler

# Wiki Compiler

## TL;DR

Wiki Compiler is a Karpathy-style LLM system that synthesizes accumulated memory frames into persistent, interlinked markdown wiki pages. It combines structured memory storage (FrameStore + knowledge graph) with automatic compilation into human-readable entity, concept, and synthesis pages—the missing "READ" side of personal knowledge management.

## What We Know

### Core Concept & Inspiration

Wiki Compiler draws from **Karpathy's LLM Wiki pattern** (April 2026 decision, Frame #797), which uses LLMs to incrementally build a persistent markdown wiki from raw knowledge. The key insight: answers should compound into permanent reference material rather than disappearing into chat history. This is paired with **Waggle's memory engine** (FrameStore + hybrid search + knowledge graph), creating the first complete read-write cycle for a personal knowledge OS (Frame #932).

### Architecture & Compilation

The system uses a **6-layer architecture** (Frame #932):
1. **Raw sources** → ingest from markdown, PDF, URLs, plaintext, code, emails, Slack, Notion
2. **FrameStore** → structured memory frames with timestamps and types
3. **Knowledge Graph** → typed entities with relationships
4. **HybridSearch** → keyword + semantic retrieval across all sources
5. **Compilation engine** → LLM synthesis with citations
6. **Wiki output** → entity/concept/synthesis/index/health pages in markdown

### Page Types

Wiki Compiler generates **five distinct page types** (Frame #802):
- **Entity pages** — person, project, organization (e.g., "Waggle," "Karpathy")
- **Concept pages** — topic synthesis (e.g., "EU AI Act Compliance," "Memory MCP")
- **Synthesis pages** — cross-source patterns (the "killer feature," Frame #800) detecting recurring themes across multiple sources
- **Index pages** — navigable catalogs with summaries
- **Health pages** — contradictions, gaps, orphans, data quality scores

### Universal Source Pipeline

Frame #801 identifies a **multi-tier ingest strategy**:
- **Tier 1** (core): Markdown, PDF, URL, plaintext
- **Tier 2** (expanded): Obsidian vault imports, code artifacts, API exports
- **Tier 3** (live feeds): Email, Slack, Notion, GitHub via 148+ MCP connectors

The system auto-detects source type and routes to appropriate adapter (MarkdownAdapter, PlaintextAdapter, UrlAdapter, PdfAdapter, ClaudeCodeAdapter per Frame #929).

### Regulatory Compliance Layer

Frame #932 highlights **EU AI Act compliance** as a differentiator. The second brain itself serves as an audit trail:
- Articles 12/13/14/19/26/50 mapped to system components
- Auto-generated compliance pages
- Regulatory export packages for legal review
- PII filtering and GDPR-compliant data retention

### Implementation Status (v1 BUILD Complete)

As of 2026-04-13 (Frames #929, #932):

**Shipped in v1 BUILD:**
- `@waggle/wiki-compiler` package (941 lines, Frame #929)
- 5 core compilation methods: `compileEntityPage()`, `compileConceptPage()`, `compileSynthesisPage()`, `compileIndex()`, `compileHealth()`
- 4 source adapters: Markdown, Plaintext, URL, PDF
- ClaudeCodeAdapter with decision extraction (12 regex patterns)
- 2 cleanup MCP tools: `cleanup_frames`, `cleanup_entities`
- 1 ingest MCP tool: `ingest_source` (auto-detection)
- `CompilationState` with SQLite watermarks + incremental compilation
- Live test on 29 memory files + 422 messages: **57% hit rate** (4/7 pages genuinely useful, Frame #928)

**Architecture highlights:**
- Incremental compilation via watermarks (no re-processing entire corpus)
- Cross-ref linker + linter (detects orphan entities, contradictions)
- MCP tool integration (compile/search/lint available to agents)
- Privacy-first: local embeddings, optional Ollama/API fallback, zero telemetry

### Competitive Position

Frame #801 analyzed the landscape: **Google Brain** (markdown+PGLite but no real code), **Mem0** (facts graph), **Zep** (temporal), **Hindsight** (auto-capture), **Cognee** (scientific). Wiki Compiler combines:
- Hybrid search + typed knowledge graph
- Multi-workspace + team sync capability
- Universal harvest pipeline (30+ adapters)
- Compiled wiki output
- **AI Act compliance mapping** (unique)

No competitor combines all six elements (Frame #801).

### Dual-Track Delivery

- **Track A:** Waggle feature integration (packages/wiki-compiler) — Wiki tab in MemoryApp
- **Track B:** Open-source product (hive-mind-mcp) — standalone MCP server + CLI

### 9-Phase Execution Plan

Frame #932 outlines v1 BUILD → v1 TEST → v2 SCALE:
- Phase 0: Foundation types
- Phase 0.5: Tier 1 adapters (complete in v1 BUILD)
- Phase 1: Core compiler (complete in v1 BUILD)
- Phase 2: Linker + linter (in progress)
- Phase 3: MCP integration (ready)
- Phase 4: Waggle UI (Wiki tab design pending)
- Phase 5: Tier 2 adapters + Obsidian import
- Phase 6: Open-source npm package
- Phase 7: Polish + launch (Product Hunt, GEPA)
- Phase 8: Tier 3 adapters (email, Slack, Notion live sync)

## Sources & Evolution

**Initial concept** (Frame #797): Decision to adopt Karpathy-style LLM wiki pattern.

**Strategic framing** (Frame #800): Positioned as answer-to-knowledge compounding, differentiating from chat-based systems.

**Competitive analysis** (Frame #801): Identified gap in market (no one combines wiki + compliance + harvest + hybrid search).

**Architectural blueprint** (Frame #932): Full 6-layer stack