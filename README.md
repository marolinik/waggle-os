# Waggle OS

Workspace-native AI agent platform with persistent memory, model-agnostic orchestration, and skill-extensible capabilities.

## Architecture

```
waggle-os/
├── apps/web/          # React frontend (Vite + shadcn/ui + Framer Motion)
├── packages/
│   ├── core/          # MindDB, memory frames, knowledge graph, sessions
│   ├── agent/         # Orchestrator, 53+ tools, 29 connectors
│   ├── server/        # Fastify HTTP server, SSE streaming, routes
│   ├── worker/        # BullMQ background job processor
│   ├── marketplace/   # Package catalog, SecurityGate
│   ├── optimizer/     # GEPA prompt optimization
│   ├── weaver/        # Memory consolidation daemon
│   ├── waggle-dance/  # Swarm orchestration protocol
│   ├── sdk/           # Plugin/skill SDK
│   ├── shared/        # Shared types & utilities
│   ├── cli/           # CLI interface
│   └── launcher/      # App launcher
├── sidecar/           # Node.js sidecar (for Tauri desktop)
└── docs/              # Documentation
```

## Quick Start

```bash
# Prerequisites: Node.js >= 20, npm
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY

# Start the backend (port 3333)
npm run dev:server

# In another terminal, start the frontend (port 8080)
npm run dev:web

# Open http://localhost:8080
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for agent |
| `OPENAI_API_KEY` | No | For LiteLLM multi-model routing |
| `EMBEDDING_PROVIDER` | No | `local` (default) or `openai` |
| `DATABASE_URL` | Team only | PostgreSQL connection string |
| `REDIS_URL` | Team only | Redis for job queue |

## License

MIT
