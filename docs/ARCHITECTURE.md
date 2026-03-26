# Architecture

Waggle is a monorepo with 15 packages organized around a layered architecture: core data, agent intelligence, server API, and UI presentation. This document covers the package structure, data flow, and extension points.

## Package Overview

```
waggle-poc/
  packages/
    core/           # Memory, embeddings, .mind files, vault, cron, knowledge graph
    agent/          # Agent loop, tools, sub-agents, workflows, trust, hooks, personas
    server/         # Fastify API server, routes, daemons, KVARK client, scheduler
    ui/             # React component library (chat, memory, settings, workspace)
    cli/            # Command-line REPL
    sdk/            # Plugin/skill SDK, capability packs, starter skills
    marketplace/    # Marketplace catalog, installer, security gate, sync
    optimizer/      # Prompt optimization (GEPA engine)
    weaver/         # Memory consolidation daemon
    worker/         # Background task processing (BullMQ)
    shared/         # Shared types and utilities
    admin-web/      # Admin dashboard for team deployments
    waggle-dance/   # Swarm orchestration protocol
  sidecar/          # Node.js sidecar for Tauri desktop app
  app/              # Tauri 2.0 desktop application (Rust + WebView2)
```

## Package Details

### @waggle/core

The foundation layer. Zero network dependencies. Everything here runs synchronously on SQLite.

- **MindDB**: SQLite database wrapper for `.mind` files. Creates and manages tables for memory frames, knowledge graph entities/relations, embeddings, and improvement signals.
- **FrameStore**: CRUD operations on memory frames. Supports FTS5 full-text search, importance ranking, and access counting.
- **MultiMind**: Manages personal + workspace minds simultaneously. Routes searches to both and merges results.
- **KnowledgeGraph**: Entity-relation graph stored in the mind database. Supports temporal validity (valid_from/valid_to).
- **Embeddings**: Vector embedding generation (sqlite-vec) for semantic search.
- **WaggleConfig**: Configuration management (`~/.waggle/config.json`). Provider keys, default model, team server config.
- **Vault**: AES-256-GCM encrypted secret storage (`vault.db`). Stores API keys, connector credentials, and sensitive metadata.
- **CronStore**: Schedule management for the cron service. CRUD on cron expressions with last/next run tracking.
- **ImportParser**: Parses ChatGPT and Claude export files, extracts knowledge items for import.

### @waggle/agent

The intelligence layer. Orchestrates tool execution, sub-agents, and workflows.

- **AgentLoop**: Core loop that sends messages to the LLM, parses tool calls, executes tools, and streams results. Supports up to 200 turns per conversation.
- **Tools (97+)**: Organized across 12 categories:
  - System tools: `bash`, `read_file`, `write_file`, `edit_file`, `search_files`, `search_content`, `list_directory`
  - Memory tools: `search_memory`, `save_memory`, `forget_memory`
  - Web tools: `web_search`, `web_fetch`
  - Git tools: `git_status`, `git_diff`, `git_log`, `git_commit`
  - Plan tools: `create_plan`, `add_plan_step`, `execute_step`, `show_plan`
  - Document tools: `generate_docx`
  - Sub-agent tools: `spawn_agent`, `coordinate_agents`
  - Skill tools: dynamically generated from installed skills
  - KVARK tools: `kvark_search`, `kvark_ask_document`, `kvark_feedback`, `kvark_action`
  - Team tools: `request_team_capability`, `assign_task`, `update_task`
  - Audit tools: `audit_trail`, `trust_assessment`
  - Connector tools: dynamically generated from connected services
- **CapabilityRouter**: Routes user intents to the appropriate tool or workflow based on context.
- **WorkflowComposer**: Dynamically composes multi-step workflows from templates.
- **Workflow Templates**: `research-team` (parallel research), `review-pair` (draft + review), `plan-execute` (plan + execute steps).
- **SubagentOrchestrator**: Manages sub-agent lifecycle -- spawning, monitoring, result collection.
- **CommandRegistry**: Slash command registration and execution (14 commands).
- **HookRegistry**: Event-driven hooks (before/after tool calls, session start/end, etc.).
- **Personas**: 8 predefined agent configurations with system prompts and tool presets.
- **TrustModel**: Assesses capability risk level, trust source, and approval class.
- **SkillRecommender**: Context-aware skill suggestions based on conversation content.

### @waggle/server

The API layer. Fastify server exposing 29 route modules.

- **Local Server** (`src/local/`): Solo mode on localhost:3333. Routes for chat, workspaces, sessions, memory, settings, vault, skills, plugins, connectors, marketplace, cron, fleet, etc.
- **Team Server** (`src/routes/`): Multi-user mode with PostgreSQL (Drizzle ORM), Redis, Clerk auth, and WebSocket presence.
- **SSE Streaming**: Chat responses stream via Server-Sent Events.
- **Anthropic Proxy**: Built-in `/v1/chat/completions` endpoint that translates OpenAI format to Anthropic API.
- **KVARK Client** (`src/kvark/`): HTTP facade for enterprise retrieval. User-level Bearer tokens.
- **Daemons**: Background processes (memory consolidation, proactive checks).
- **Scheduler** (`src/scheduler/`): LocalScheduler that ticks cron schedules and dispatches jobs.
- **ConnectorRegistry**: Registers and manages 29 native connectors. Generates agent tools from connected services.
- **Session Manager**: Manages parallel workspace sessions for Mission Control.
- **Notification System**: Event bus + SSE stream for real-time notifications (cron, approval, task, agent events).

### @waggle/ui

React component library. All components are TypeScript with CSS modules.

- **ChatArea**: Main conversation interface with streaming, tool cards, approval gates, and file upload.
- **MemoryBrowser**: Frame list with search, importance filters, and knowledge graph visualization.
- **WorkspaceHome**: Context-rich home screen with summary, decisions, threads, and suggestions.
- **Settings**: Tabbed settings (Models, Permissions, Vault, Appearance, Advanced).
- **Cockpit**: System dashboard showing health, schedules, runtime stats, connectors, trust audit.
- **Capabilities**: Skill/pack browser with install state and family grouping.
- **Events**: Tool event log with grouping and completion animations.
- **Onboarding**: First-run setup flow (API key, workspace creation, starter skills, import).

### @waggle/marketplace

Marketplace infrastructure. SQLite-based catalog with FTS5 search.

- **MarketplaceDB**: 120+ packages across skills, plugins, and MCP servers. Auto-seeded from bundled data.
- **MarketplaceInstaller**: Install/uninstall with dependency tracking.
- **SecurityGate**: Heuristic-based security scanner. Scans for dangerous patterns before install.
- **MarketplaceSync**: Syncs catalog from configured sources.
- **Enterprise Packs**: KVARK-dependent packs (only available with enterprise connection).

### @waggle/waggle-dance

Swarm orchestration protocol for multi-agent coordination.

- **Protocol**: Message types for task assignment, status updates, and result collection.
- **Dispatcher**: Routes work to available agents based on capability and load.
- **HiveQuery**: Broadcast queries across multiple agents for parallel investigation.

### @waggle/worker

Background task processing for team mode.

- **BullMQ Integration**: Redis-backed job queues.
- **Execution Strategies**: Parallel (fan-out), sequential (pipeline), and coordinator (master-worker).
- **Agent Worker**: Real `runAgentLoop` execution in background worker processes.

## Data Flow

### Chat Message Flow

```
User Input
  --> POST /api/chat (Fastify route)
    --> Workspace context loaded (memory, state, persona)
    --> System prompt composed (core + persona + skills + context)
    --> runAgentLoop() invoked
      --> LLM API call (Anthropic proxy or direct)
      --> Tool calls parsed and executed
        --> Approval gate check (if sensitive)
        --> Tool result returned
      --> Memory auto-save (decisions, facts, preferences)
      --> SSE events streamed to client
    --> Session persisted to .jsonl file
  --> UI renders streaming response
```

### Memory Flow

```
Conversation
  --> Agent detects important information
  --> save_memory tool called
    --> FrameStore.add() writes to workspace .mind
    --> Embeddings generated (sqlite-vec)
    --> Knowledge graph updated (entity extraction)

Later search:
  --> search_memory tool called
  --> MultiMind.search() queries personal + workspace minds
  --> FTS5 + vector similarity results merged
  --> Top results injected into agent context
```

### Workspace Startup Flow

```
Open workspace
  --> GET /api/workspaces/:id/context
    --> Load workspace mind (MindDB)
    --> Read recent memory frames
    --> Extract decisions from memories
    --> Read session files (titles, summaries)
    --> Extract progress items (tasks, completions, blockers)
    --> Build workspace state summary
    --> Generate contextual suggested prompts
  --> UI renders Home screen
```

## Extension Points

### Adding a New Tool

1. Define the tool in the appropriate category under `packages/agent/src/`
2. Follow the `ToolDefinition` interface: name, description, parameters (JSON Schema), handler function
3. Register the tool in the agent's tool list
4. If the tool is sensitive, add it to the approval gate check list

### Adding a New Connector

1. Implement the `ConnectorCapability` interface in `packages/server/src/services/connectors/`
2. Define `id`, `name`, `service`, `authType`, `connect()`, `healthCheck()`, and `generateTools()`
3. Register in `packages/server/src/local/index.ts` with `connectorRegistry.register()`
4. The connector's tools are automatically available when credentials are in the vault

### Adding a Skill

Create a markdown file in `~/.waggle/skills/`. The skill content is appended to the agent's system prompt. Use YAML frontmatter for metadata:

```markdown
---
name: my-skill
permissions:
  - read_file
  - web_search
---
# My Skill

Instructions for the agent...
```

### Adding a Slash Command

1. Create a `CommandDefinition` in `packages/agent/src/commands/`
2. Implement `name`, `aliases`, `description`, `usage`, and `handler`
3. Register with `registry.register()` in the appropriate registration function

### Adding a Workflow Template

1. Define a factory function that returns a `WorkflowTemplate` with steps
2. Register in the `WORKFLOW_TEMPLATES` map in `packages/agent/src/`
3. Each step defines a role, instructions, and optional tool restrictions

## Storage Locations

| Data | Location | Format |
|------|----------|--------|
| Personal memory | `~/.waggle/default.mind` | SQLite |
| Workspace memory | `~/.waggle/workspaces/{id}/workspace.mind` | SQLite |
| Sessions | `~/.waggle/workspaces/{id}/sessions/*.jsonl` | JSON Lines |
| Tasks | `~/.waggle/workspaces/{id}/tasks.jsonl` | JSON Lines |
| File registry | `~/.waggle/workspaces/{id}/files.jsonl` | JSON Lines |
| Config | `~/.waggle/config.json` | JSON |
| Vault | `~/.waggle/vault.db` | SQLite (encrypted values) |
| Marketplace | `~/.waggle/marketplace.db` | SQLite |
| Skills | `~/.waggle/skills/*.md` | Markdown |
| Plugins | `~/.waggle/plugins/` | Package directories |
| Permissions | `~/.waggle/permissions.json` | JSON |

## Security Model

- **Vault**: AES-256-GCM encryption for all secrets. Keys never stored in plain text after vault migration.
- **Approval Gates**: Sensitive tool executions require explicit user approval.
- **SecurityGate**: Marketplace installs scanned for dangerous patterns. CRITICAL severity always blocked.
- **Content Hashing**: SHA-256 hashes detect unauthorized skill modifications.
- **Audit Trail**: Every capability install, uninstall, and security decision is recorded.
- **Input Validation**: All route parameters validated against path traversal and injection.
- **YOLO Mode**: Opt-in auto-approval, disabled by default.
