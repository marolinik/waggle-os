# waggle-memory-mcp

Persistent memory MCP server for **Claude Code**, **Claude Desktop**, and any MCP-compatible AI system.

Give your AI assistant memory that persists across conversations — facts, decisions, preferences, project context, and a knowledge graph of entities and relationships.

Powered by the [Waggle OS](https://waggle-os.ai) memory engine.

## Features

- **Persistent Memory** — Save and recall facts, decisions, preferences across conversations
- **Semantic Search** — Hybrid FTS5 keyword + sqlite-vec vector search with RRF fusion
- **Knowledge Graph** — Entities (people, projects, concepts) and their relationships
- **Identity** — Persistent user profile (name, role, capabilities)
- **Awareness** — Short-lived context markers for active tasks and flags
- **Workspaces** — Isolated memory spaces for different projects
- **Harvest** — Import conversation history from ChatGPT, Claude, Gemini, and more
- **Zero Config Embeddings** — Offline vector search using a local ONNX model (23MB, auto-downloaded)
- **Shared Data** — Same `~/.waggle/` directory as Waggle OS desktop app

## Installation

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "waggle-memory": {
      "command": "npx",
      "args": ["-y", "waggle-memory-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "waggle-memory": {
      "command": "npx",
      "args": ["-y", "waggle-memory-mcp"]
    }
  }
}
```

### Custom Data Directory

```json
{
  "mcpServers": {
    "waggle-memory": {
      "command": "npx",
      "args": ["-y", "waggle-memory-mcp"],
      "env": {
        "WAGGLE_DATA_DIR": "/path/to/your/.waggle"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `save_memory` | Save a memory (fact, decision, preference) with importance level |
| `recall_memory` | Semantic search across memories with scoring profiles |
| `search_entities` | Search the knowledge graph for entities |
| `save_entity` | Create or update an entity in the knowledge graph |
| `create_relation` | Create a relationship between entities |
| `get_identity` | Get the user's persistent identity profile |
| `set_identity` | Create or update identity (name, role, etc.) |
| `get_awareness` | Get active tasks, pending items, context flags |
| `set_awareness` | Set a short-lived awareness item |
| `clear_awareness` | Remove awareness items by ID or category |
| `list_workspaces` | List all workspaces with memory stats |
| `create_workspace` | Create a new isolated workspace |
| `harvest_import` | Import conversations from ChatGPT, Claude, Gemini |
| `harvest_sources` | List registered harvest sources and sync status |

## Resources

| URI | Description |
|-----|-------------|
| `memory://personal/stats` | Frame count, entity count, embedding provider status |
| `memory://identity` | Current identity profile |
| `memory://awareness` | Active awareness items |
| `memory://workspace/{id}` | Workspace config and memory stats |

## Architecture

```
~/.waggle/
├── personal.mind          ← SQLite database (WAL mode + sqlite-vec)
├── models/                ← Cached ONNX embedding model
├── config.json            ← Settings
└── workspaces/
    └── {id}/
        ├── workspace.json ← Workspace config
        └── workspace.mind ← Workspace SQLite database
```

### Memory Model

- **I-Frame** (Identity): Base facts — "User prefers TypeScript"
- **P-Frame** (Procedural): Updates to I-Frames
- **B-Frame** (Bridging): Links between frames

### Search Pipeline

1. FTS5 keyword search (stop-word filtered, OR-based)
2. sqlite-vec k-NN vector search (1024-dim embeddings)
3. RRF fusion (K=60) combines both result sets
4. Relevance scoring with 4 profiles: balanced, recent, important, connected

### Embedding Provider Chain

Probed in order, first success wins:

1. **InProcess** — `all-MiniLM-L6-v2` ONNX model, zero config, ~23MB download
2. **Ollama** — `nomic-embed-text` (requires local Ollama)
3. **Voyage/OpenAI** — API-based (requires API keys)
4. **Mock** — Deterministic fallback (always works, no semantic quality)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WAGGLE_DATA_DIR` | Data directory path | `~/.waggle` |
| `WAGGLE_EMBEDDING_PROVIDER` | Force a specific provider | `auto` |
| `WAGGLE_OLLAMA_URL` | Ollama server URL | `http://localhost:11434` |
| `WAGGLE_OLLAMA_MODEL` | Ollama model name | `nomic-embed-text` |
| `WAGGLE_VOYAGE_API_KEY` | Voyage AI API key | — |
| `WAGGLE_OPENAI_API_KEY` | OpenAI API key | — |

## Shared with Waggle OS

If you also run [Waggle OS](https://waggle-os.ai) desktop, this MCP server shares the **same data directory**. Memories saved in Claude Code appear in Waggle OS and vice versa. SQLite WAL mode supports concurrent readers.

## Development

```bash
# From the waggle-os monorepo root
cd packages/memory-mcp
npm install
npm run build
npm start
```

## License

MIT - Egzakta Group
