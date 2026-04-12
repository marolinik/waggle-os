# Waggle Memory Plugin — Claude Code Agent Onboarding Brief

**Date:** 2026-04-13
**Author:** Marko Markovic + Claude (Waggle OS session)
**Purpose:** Everything a new Claude Code agent needs to build the Waggle Memory plugin for Claude Code, Claude.ai, Cowork, OpenClaw, and compatible systems.

---

## 1. What You're Building

A **persistent memory MCP server** that gives Claude Code (and any MCP-compatible AI system) the ability to:

1. **Remember** across conversations — save decisions, preferences, facts, project context
2. **Recall** with semantic search — keyword + vector hybrid search over all memories
3. **Harvest** — import conversation history from ChatGPT, Gemini, Perplexity, Cursor, Copilot exports
4. **Knowledge Graph** — automatically extract and track entities (people, projects, concepts) and their relationships
5. **Cross-workspace** — organize memories into workspaces and search across them

This is NOT a toy memory system. It's battle-tested production code from Waggle OS (a Tauri desktop app with 150+ API routes, 60+ agent tools, 305 test files) being extracted into a standalone MCP server.

---

## 2. Source Code Available

The full Waggle OS codebase has been copied to your working directory. The relevant packages:

```
packages/core/src/               ← THE MEMORY ENGINE (this is what you're wrapping)
├── mind/
│   ├── db.ts                    MindDB — SQLite wrapper (WAL mode, sqlite-vec loaded)
│   ├── schema.ts                Full schema: memory_frames, FTS5, vec table, entities, relations
│   ├── frames.ts                FrameStore — I/P/B frame CRUD, dedup, compact
│   ├── search.ts                HybridSearch — FTS5 keyword + sqlite-vec k-NN + RRF fusion
│   ├── knowledge.ts             KnowledgeGraph — entity/relation CRUD, traversal, validation
│   ├── identity.ts              IdentityLayer — user identity persistence
│   ├── awareness.ts             AwarenessLayer — active task/context tracking
│   ├── sessions.ts              SessionStore — conversation session tracking
│   ├── scoring.ts               Relevance scoring (temporal, popularity, importance, contextual)
│   ├── embeddings.ts            Embedder interface
│   ├── inprocess-embedder.ts    Zero-config embedder (Xenova/all-MiniLM-L6-v2, 384→1024 dims)
│   ├── ollama-embedder.ts       Ollama embedder (nomic-embed-text)
│   ├── api-embedder.ts          OpenAI/Voyage embedder
│   ├── embedding-provider.ts    Provider chain: InProcess → Ollama → API → Mock
│   ├── entity-normalizer.ts     Dedup entity names
│   ├── ontology.ts              Entity type validation
│   └── reconcile.ts             FTS/vec index repair
├── harvest/
│   ├── pipeline.ts              4-pass harvest: Classify → Extract → Synthesize → Dedup
│   ├── chatgpt-adapter.ts       ChatGPT export parser
│   ├── claude-adapter.ts        Claude export parser
│   ├── claude-code-adapter.ts   Claude Code session scanner
│   ├── gemini-adapter.ts        Gemini export parser
│   ├── universal-adapter.ts     Generic JSON/JSONL parser
│   ├── source-store.ts          Track registered sources + auto-sync
│   ├── dedup.ts                 SHA-256 dedup within 500-frame window
│   └── types.ts                 ImportSourceType, UniversalImportItem, etc.
├── multi-mind.ts                MultiMind (personal + workspace search)
├── multi-mind-cache.ts          LRU cache of open MindDB handles (max 20)
├── workspace-config.ts          Workspace CRUD (id, name, directory, config)
├── config.ts                    WaggleConfig (settings persistence)
├── team-sync.ts                 Push/pull frames to team server
└── file-store.ts                FileStore (Local, Linked, S3)
```

---

## 3. Architecture of the Memory System

### Frame Types (the fundamental unit)
- **I-Frame (Identity):** Base fact — "User prefers TypeScript over JavaScript"
- **P-Frame (Procedural):** Update to an I-Frame — "Also prefers functional style"
- **B-Frame (Bridging):** Links between frames

### Importance Levels
`critical | important | normal | temporary | deprecated`

### Source Provenance
`user_stated | tool_verified | agent_inferred | import | system | team_sync`

### Search Pipeline
1. **FTS5 keyword search** — stop-word filtered, OR-based
2. **sqlite-vec k-NN search** — 1024-dim embeddings
3. **RRF Fusion** (K=60) — combines keyword + vector results
4. **Relevance scoring** — 4 profiles: balanced, recent, important, connected

### Embedding Chain (probed in order)
1. **InProcess** — Xenova/all-MiniLM-L6-v2, 384→1024 dims, zero config, ~23MB download
2. **Ollama** — nomic-embed-text (needs local Ollama)
3. **Voyage/OpenAI** — API-based (needs keys)
4. **Mock** — deterministic fallback (always works)

### Knowledge Graph
- Entities: `{ type, name, properties, validFrom, validTo }`
- Relations: `{ sourceId, targetId, type, confidence, properties }`
- Traversal: BFS with depth limit
- Types: person, project, concept, organization, technology, tool, location, event

---

## 4. What the MCP Server Should Expose

### Tools (MCP tool definitions)

```
save_memory(content, importance?, workspace?)
  → Creates an I-Frame in the target workspace mind
  → Auto-indexes in FTS5 + vector
  → Returns { id, content, importance, timestamp }

recall_memory(query, limit?, workspace?, scope?)
  → HybridSearch across personal + workspace minds
  → scope: 'current' | 'personal' | 'all' | 'global'
  → Returns ranked results with scores

search_entities(query, type?, limit?)
  → Search the knowledge graph for entities
  → Returns matching entities with relations

save_entity(type, name, properties?)
  → Upsert an entity in the knowledge graph
  → Auto-dedup by normalized name

get_identity()
  → Returns the user's identity profile from IdentityLayer

set_identity(updates)
  → Update identity (name, role, preferences, etc.)

get_awareness()
  → Returns current awareness items (active tasks, context)

set_awareness(key, value, priority?, ttl?)
  → Set an awareness item (active context)

list_workspaces()
  → Returns all workspaces with stats

harvest_import(source, data_or_path)
  → Import conversations from external sources
  → source: 'chatgpt' | 'claude' | 'claude-code' | 'gemini' | 'universal'
```

### Resources (MCP resource definitions)

```
memory://personal/stats     → frame count, entity count, last session
memory://workspace/{id}     → workspace info + memory stats
memory://identity           → current identity profile
memory://awareness          → current awareness items
```

---

## 5. How to Build It

### Step 1: Create the MCP Server

The MCP server uses `@modelcontextprotocol/sdk` (the official MCP SDK). It communicates over stdio (for Claude Code) or HTTP/SSE (for web clients).

```typescript
// Structure
waggle-memory-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts          ← Entry point, MCP server setup
│   ├── tools/
│   │   ├── memory.ts     ← save_memory, recall_memory
│   │   ├── knowledge.ts  ← search_entities, save_entity
│   │   ├── identity.ts   ← get/set identity
│   │   ├── awareness.ts  ← get/set awareness
│   │   ├── workspace.ts  ← list_workspaces
│   │   └── harvest.ts    ← harvest_import
│   ├── resources/
│   │   └── memory.ts     ← MCP resource handlers
│   └── core/
│       └── setup.ts      ← MindDB init, embedding provider, workspace manager
```

### Step 2: Depend on @waggle/core

The MCP server should import directly from the Waggle core package:

```typescript
import {
  MindDB, FrameStore, HybridSearch, KnowledgeGraph,
  IdentityLayer, AwarenessLayer, SessionStore,
  MultiMind, MultiMindCache, WorkspaceManager,
  createEmbeddingProvider,
  HarvestSourceStore, ChatGPTAdapter, ClaudeAdapter,
  ClaudeCodeAdapter, GeminiAdapter, UniversalAdapter,
} from '@waggle/core';
```

### Step 3: Data Storage

Default data directory: `~/.waggle/` (same as Waggle OS — the plugin IS the same memory)

```
~/.waggle/
├── config.json              ← settings
├── personal.mind            ← personal SQLite mind
├── workspaces/
│   ├── {id}/
│   │   ├── workspace.json   ← workspace config
│   │   ├── workspace.mind   ← workspace SQLite mind
│   │   └── files/           ← workspace files
```

**CRITICAL:** If the user also runs Waggle OS desktop, the MCP server shares the SAME data directory. This is BY DESIGN — memories saved in Claude Code appear in Waggle OS and vice versa. The SQLite WAL mode supports concurrent readers.

### Step 4: Registration in Claude Code

The user adds to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "waggle-memory": {
      "command": "npx",
      "args": ["waggle-memory-mcp"],
      "env": {
        "WAGGLE_DATA_DIR": "~/.waggle"
      }
    }
  }
}
```

Or for Claude Code CLI in `~/.claude/settings.json` under `mcpServers`.

---

## 6. Key Design Decisions

### Shared data directory
The MCP server and Waggle OS desktop share `~/.waggle/`. This means:
- Memory saved in Claude Code → visible in Waggle OS
- Memory saved in Waggle OS → available to Claude Code
- The user has ONE memory, not two

### Embedding provider
The InProcess embedder works offline with zero config. It downloads a 23MB ONNX model on first run. This should be the default — no API keys needed.

### Workspace management
- The MCP server can create/list/switch workspaces
- Each workspace gets its own `.mind` SQLite file
- A "current workspace" can be set via a tool or env var
- Default: personal mind (no workspace)

### Concurrent access safety
- SQLite WAL mode allows concurrent readers
- The MCP server should open MindDB handles and keep them open (not open/close per request)
- Use MultiMindCache for LRU management of workspace handles

---

## 7. Compatibility Targets

### Primary: Claude Code
- MCP server over stdio
- `~/.claude/settings.json` registration

### Secondary: Claude.ai / Claude Desktop
- MCP server over stdio
- `~/.claude/claude_desktop_config.json` registration

### Tertiary: Compatible systems
- Any MCP-compatible host: OpenClaw, Hermes Agent, Cowork, etc.
- Same stdio protocol
- The MCP SDK handles the transport

---

## 8. What NOT to Build

- **No UI** — this is a headless MCP server. Waggle OS desktop IS the UI.
- **No LLM integration** — the host (Claude Code) provides the LLM. The MCP server is tools-only.
- **No auth** — local-only server. Auth is handled by the host.
- **No HTTP server** — stdio transport only (Claude Code standard). HTTP/SSE can be added later.
- **No team sync** — the MCP server works on the local mind only. Team features need Waggle OS.

---

## 9. SQLite Schema (from packages/core/src/mind/schema.ts)

The schema auto-creates when MindDB is instantiated. Key tables:

```sql
-- Memory frames (the fundamental unit)
memory_frames (
  id INTEGER PRIMARY KEY,
  gop_id TEXT NOT NULL REFERENCES sessions(gop_id),
  frame_type TEXT NOT NULL CHECK (frame_type IN ('I','P','B')),
  base_frame_id INTEGER REFERENCES memory_frames(id),
  t INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  importance TEXT NOT NULL DEFAULT 'normal',
  source TEXT DEFAULT 'user_stated',
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  content_hash TEXT
)

-- Full-text search index
memory_frames_fts USING fts5(content, content='memory_frames', content_rowid='id')

-- Vector embeddings (sqlite-vec)
memory_embeddings USING vec0(embedding float[1024])

-- Knowledge graph
knowledge_entities (id, type, name, properties JSON, valid_from, valid_to, created_at)
knowledge_relations (id, source_id, target_id, type, confidence, properties JSON, valid_from, valid_to)

-- Sessions
sessions (gop_id TEXT PK, title TEXT, summary TEXT, status TEXT, created_at, closed_at)

-- Identity
identity (key TEXT PK, value TEXT, updated_at TEXT)

-- Awareness
awareness_items (key TEXT PK, value TEXT, priority INTEGER, expires_at TEXT, created_at)

-- Harvest tracking
harvest_sources (source TEXT UNIQUE, display_name, source_path, last_synced_at, items_imported, frames_created, auto_sync, sync_interval_hours)
```

---

## 10. Testing Checklist

Before shipping:
- [ ] `save_memory` creates an I-Frame retrievable by `recall_memory`
- [ ] `recall_memory` returns relevant results with semantic search (not just exact match)
- [ ] FTS5 index stays in sync with frames
- [ ] Vector index stays in sync with frames
- [ ] Knowledge graph entities extractable from saved memories
- [ ] Harvest import works for at least: ChatGPT JSON, Claude JSON, Claude Code local scan
- [ ] Multiple workspaces can be created and searched independently
- [ ] `scope: 'global'` searches all workspaces
- [ ] InProcess embedder works with zero config
- [ ] Concurrent access doesn't corrupt (two MCP instances)
- [ ] Shared data dir with Waggle OS desktop works (read memories saved by the other)

---

## 11. Package Dependencies

From Waggle OS (copy or depend directly):
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "better-sqlite3": "^11.0.0",
    "sqlite-vec": "^0.1.0",
    "@xenova/transformers": "^2.17.0",
    "glob": "^10.0.0"
  }
}
```

If depending on `@waggle/core` directly (recommended):
```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "latest",
    "@waggle/core": "workspace:*"
  }
}
```

---

## 12. Quick Start for the Building Agent

```bash
# 1. Read the core memory engine
cat packages/core/src/mind/db.ts          # MindDB constructor + schema
cat packages/core/src/mind/frames.ts      # FrameStore API
cat packages/core/src/mind/search.ts      # HybridSearch API
cat packages/core/src/mind/knowledge.ts   # KnowledgeGraph API

# 2. Read the embedding provider
cat packages/core/src/mind/embedding-provider.ts  # Provider chain

# 3. Read the harvest pipeline
cat packages/core/src/harvest/pipeline.ts
cat packages/core/src/harvest/types.ts

# 4. Read the workspace manager
cat packages/core/src/workspace-config.ts

# 5. Check the MCP runtime pattern (how Waggle already runs MCP servers)
cat packages/agent/src/mcp/mcp-runtime.ts
```

The entire memory engine is in `packages/core/`. You're wrapping it in an MCP server. Don't reinvent — import and expose.

---

*Generated from Waggle OS codebase audit, session 2026-04-12/13. 26 commits shipped this session.*
