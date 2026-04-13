---
type: concept
name: Mind Architecture
confidence: 0.96
sources: 6
last_compiled: 2026-04-13
related_entities:
  - Waggle OS
---

# Mind Architecture

## Summary

The .mind file is [[Waggle OS]]'s core technical innovation — a single SQLite
database per user or workspace that stores persistent memory in a 6-layer
architecture inspired by video codecs (I-Frames and P-Frames).

## The 6 Layers

| Layer | Name | Content | Load Time | Size |
|-------|------|---------|-----------|------|
| 0 | Identity | WHO the agent is (name, role, personality) | <1ms | ~500 tokens |
| 1 | Awareness | WHERE the agent is (active tasks, context) | <50ms | ~2000 tokens |
| 2 | Memory Stream | I-Frames (snapshots) + P-Frames (deltas) | <200ms | Unbounded |
| 3 | Knowledge Graph | Entities + typed relations + confidence | Query-time | Unbounded |
| 4 | Session Store | Frame grouping by session/conversation | Query-time | Unbounded |
| 5 | Embedding Index | sqlite-vec vectors for semantic search | Query-time | ~50MB |

## How Search Works

Hybrid search combining three strategies with Reciprocal Rank Fusion (RRF):
1. **BM25** via FTS5 — catches exact keyword matches
2. **Vector similarity** via sqlite-vec — catches semantic meaning
3. **Knowledge Graph traversal** — catches relationship-based connections

## Key Design Decisions

- **SQLite, not Postgres:** Zero external dependencies. Embedded. Portable.
  A .mind file IS the memory — copy it, and the agent's memory travels with it.
- **Video codec metaphor:** I-Frames are complete snapshots (like keyframes).
  P-Frames are deltas/updates. This enables efficient storage with temporal
  reconstruction.
- **Confidence scoring:** Every entity and relation has a confidence score
  (0-1). Multiple sources reinforcing the same fact increase confidence.
  Contradictions lower it.
- **Frame sources:** Every frame is tagged: user_stated, tool_verified,
  agent_inferred, system, import. This enables trust hierarchies.

## Scale

Target: ~500MB-1GB per .mind file per employee. Current personal.mind has 202
frames and 2,734 entities. Production workloads expected to reach thousands
of frames with sub-200ms query times.

## Relations

- [[Waggle OS]] — the product built on this architecture
- [[LLM Provider Stack]] — how the agent routes LLM requests for memory operations
