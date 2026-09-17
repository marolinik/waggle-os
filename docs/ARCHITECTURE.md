# Architecture

Waggle is a monorepo with **28 packages** under `packages/` organized around a layered architecture: the memory substrate, agent intelligence, server API, and UI presentation. This document covers the package structure, data flow, and extension points.

> **Note (2026-04-30 monorepo migration):** the persistent-memory substrate
> (`mind/` + `harvest/`) moved out of `@waggle/core` into
> `@waggle/hive-mind-core` (`packages/hive-mind-core/src/{mind,harvest}`). The
> React UI is **not** a package — it lives in `apps/web/src`. There is no
> `@waggle/ui` package.

## Package Overview

```
waggle-os/
  apps/
    web/            # Main web app UI (React 19 + Vite + Tailwind 4 + base-ui/react)
    www/            # Marketing site (Next.js)
    browser-ext/    # Browser extension (unpacked; not an npm workspace)
  packages/
    # Product packages (MIT)
    agent/          # Agent loop, tools, sub-agents, workflows, trust, hooks, personas, evolution
    core/           # Config, vault (secrets), cron, file store, telemetry, compliance/audit
    server/         # Fastify API server, local + team routes, daemons, KVARK client, scheduler
    shared/         # Shared types, Zod schemas, tiers, MCP catalog
    marketplace/    # Marketplace catalog, installer, security gate, sync
    optimizer/      # Prompt optimization (GEPA engine)
    weaver/         # Memory consolidation daemon
    waggle-dance/   # Swarm orchestration protocol
    worker/         # Background task processing (BullMQ)
    sdk/            # Plugin/skill SDK, capability packs, starter skills
    cli/            # Command-line REPL
    launcher/       # AI-tool launcher / dock backend
    admin-web/      # Admin dashboard for team deployments
    wiki-compiler/  # Knowledge / wiki compiler
    memory-mcp/     # MCP server exposing the memory substrate to external agents
    # Memory substrate — hive-mind-* (Apache-2.0), mirrored to marolinik/hive-mind
    hive-mind-core/         # The substrate: FrameStore, HybridSearch, KnowledgeGraph, Identity/Awareness, Harvest (src/mind + src/harvest)
    hive-mind-cli/          # CLI for the substrate
    hive-mind-mcp-server/   # MCP server for the substrate
    hive-mind-shim-core/    # Signal-emitter shim library
    hive-mind-wiki-compiler/# Wiki compiler (OSS)
    hive-mind-hooks-core/   # Shared hook library
    hive-mind-hooks-*/      # Per-tool capture hooks: claude-code, claude-desktop, codex,
                            #   codex-desktop, cursor, hermes, openclaw
  sidecar/          # Node.js sidecar for Tauri desktop app
  app/              # Tauri 2.0 desktop shell (Rust + WebView2) — loads the apps/web build
```

## Package Details

### @waggle/hive-mind-core

The persistent-memory substrate (Apache-2.0; mirrored to the public
[`marolinik/hive-mind`](https://github.com/marolinik/hive-mind) repo). Zero
network dependencies; runs on SQLite + sqlite-vec.

- **MindDB** (`src/mind/db.ts`, `schema.ts`): SQLite wrapper for `.mind` files. Tables for memory frames, knowledge-graph entities/relations, embeddings, sessions, and improvement signals.
- **FrameStore** (`src/mind/frames.ts`): CRUD on memory frames with FTS5 full-text search, importance ranking, and access counting.
- **HybridSearch** (`src/mind/search.ts`): vector + keyword retrieval, with an optional cross-encoder reranker.
- **KnowledgeGraph** (`src/mind/knowledge.ts`): entity-relation graph with temporal validity (`valid_from`/`valid_to`).
- **IdentityLayer / AwarenessLayer** (`src/mind/identity.ts`, `awareness.ts`): personal-identity persistence and active task/state tracking.
- **Embeddings** (`src/mind/*-embedder.ts`): pluggable providers — in-process, Ollama, Voyage, OpenAI, mock.
- **Harvest** (`src/harvest/`): conversation/file ingestion adapters (ChatGPT, Claude, Claude Code, Gemini, Perplexity, PDF, markdown, URL, plaintext) plus the dedup pipeline.

> Develop the substrate **here** and mirror it out — never the reverse. See the
> "Memory Substrate Sync" section of the root [`CLAUDE.md`](../CLAUDE.md).

### @waggle/core

The foundation layer for the desktop/server runtime. Zero network dependencies.

- **WaggleConfig**: Configuration management (`~/.waggle/config.json`). Provider keys, default model, team server config.
- **Vault**: AES-256-GCM encrypted secret storage. Stores API keys, connector credentials, and sensitive metadata.
- **MultiMind**: Manages personal + workspace minds simultaneously — routes searches to both and merges results. Wraps the `@waggle/hive-mind-core` substrate.
- **FileStore**: Workspace filesystem access with a segment-boundary + symlink-aware containment guard and a secret deny-list (see the [threat model](../THREAT_MODEL.md)).
- **CronStore**: Schedule management for the cron service. CRUD on cron expressions with last/next run tracking.
- **ImportParser** (`memory-import.ts`): parses ChatGPT and Claude export files into importable knowledge items.
- **InstallAudit**: append-only capability-install trail (proposed / approved / installed / rejected / uninstalled) backing the EU-AI-Act provenance story.
- **Telemetry / Compliance**: telemetry pipeline and compliance reporting (`compliance/`).

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

### apps/web (UI)

The React UI is an application, not a package — it lives in `apps/web/src`
(React 19 + Vite + Tailwind 4 + base-ui/react). There is no `@waggle/ui`
package. The desktop binary (`app/`) loads the `apps/web` build. Representative
surfaces:

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

---

## Layer Map & Dependency Rule

Added by Phase 5 (`clean-architecture`) of the technical-debt journey — see
[`REMOVE-TECHNICAL-DEBT-PLAN.md`](./REMOVE-TECHNICAL-DEBT-PLAN.md). The Dependency Rule:
source dependencies point inward, and nothing in an inner circle names anything in an outer one.

| Circle | What lives there | Where |
|---|---|---|
| Entities | tiers, wire types, Zod schemas, MCP catalog | `@waggle/shared` |
| Use cases | agent loop, personas, routing, evolution, capability/trust | `@waggle/agent` |
| Interface adapters | routes, persona/tool filters, governance, persistence, stores | `@waggle/server`, `@waggle/core`, `@waggle/hive-mind-core` |
| Frameworks & drivers | Fastify, better-sqlite3 + sqlite-vec, Tauri shell, Vite/React | `sidecar/`, `app/`, `apps/web` |

**Score: 4/10** (2 of 7 diagnostics satisfied, measured 2026-09-17 at `edf21ef6`).

Satisfied: the framework is confined to `packages/server` (no `fastify` import anywhere in
`@waggle/agent`, `@waggle/core` or `@waggle/shared`), and the component graph is acyclic —
`shared ← hive-mind-core ← core ← agent ← server`, with the only apparent back-edges being
comments in `hive-mind-core` that explain why the dependency was *avoided*. ADP holds, so no
component split is warranted here.

Failing: business rules cannot be tested without the DB and the framework; dependencies do not
all point inward; the DB cannot be swapped without touching use cases; the chat use case *is*
the delivery mechanism; and the composition root does not wire everything.

### Measured cost of the violations

| Import | Cost | Note |
|---|---|---|
| `routes/chat.ts` | 1352 ms | the whole server graph, for one pure predicate |
| `routes/chat-helpers.ts` | 77 ms | leaf module, same kind of rules |
| `@waggle/agent` (barrel) | 937 ms | the only entry point before this phase |
| `@waggle/agent/permissions` | 4 ms | where `READONLY_TOOLS` actually lives |
| `@waggle/agent/tool-filter` | 7 ms | where `isBoundedSingleFileRoundTrip` lives |

Measured with a `process.dlopen`-instrumented `tsx` probe under Node 22.23.2. No native binding
loads at import time in any of these paths — the cost is module graph, not SQLite.

### Violations

| # | Violation | Location | Fix | Priority | Status |
|---|---|---|---|---|---|
| CA-1 | ~770 lines of pure turn policy defined inside the Fastify plugin module, so every consumer and every test loads the delivery mechanism | `routes/chat.ts` (was lines 608–1781) | move to `routes/chat-turn-policy.ts`, re-export from `chat.ts`, guard the graph | P1 | **closed** — `a2f24546` + `3e380190` |
| CA-2 | `@waggle/agent` published only its barrel, so importing one frozen array cost 937 ms (CRP violated at the `exports` map) | `packages/agent/package.json` | additive `./permissions` and `./tool-filter` subpaths | P1 | **closed** — `86d0d19f` |
| CA-3 | Use cases name concrete persistence classes | `agent/src/cognify.ts`, `agent/src/orchestrator.ts` | the use case owns a `FrameStore`/`SessionStore` *interface*; `@waggle/core` implements it | P1 | open |
| CA-4 | `@waggle/agent` (use cases) imports `@waggle/core` (persistence) in 61 files | package edge `agent → core` | narrow through subpaths, then invert the memory boundary per CA-3 | P1 | open |
| CA-5 | Concrete infrastructure constructed inside the handler (`CredentialPool`, `TraceRecorder`) instead of at the composition root | `routes/chat.ts` | hoist construction to `local/index.ts`, inject through the existing decorator seam | P2 | open |
| CA-6 | Business rules still in the route module: regulated-content disclaimer, goal ancestry, approval-timeout policy | `routes/chat.ts` | second slice, same pattern as CA-1 | P2 | **closed** — `5b616dd2` (pin) + `2fe718da` (move) + `1c49e805` (disclaimer rule) |
| CA-7 | Nothing but one test enforces the layer; a new module in `routes/` inherits no boundary | repo-wide | `import/no-restricted-paths` ESLint rule covering the policy layer | P3 | open — Phase 6 |

### The boundary that now exists

`routes/chat-turn-policy.ts` (814 lines) holds the rules that decide what one chat turn may do.
Its entire transitive graph is three files — itself, `chat-helpers.ts`, and the import-free
`provider-model-catalog.ts` — and its only runtime package dependencies are
`@waggle/agent/permissions` and `@waggle/agent/tool-filter`. No framework, no persistence, no
`node:` I/O. `tests/local/chat-turn-policy-boundary.test.ts` walks that graph at the source level
and fails the first time an outward import appears; it was verified non-vacuous by adding
`import { FrameStore } from '@waggle/core'` and watching the first case go red.

Control flow still crosses inward from the route; only the source dependency was inverted.

CA-6 widened the same boundary rather than drawing a new one. `resolveChatAncestry`,
`hasRegulatedDisclaimer` and `resolveApprovalTimeoutPolicy` moved verbatim; the regulated-content
disclaimer — a `Record` literal rebuilt inside the handler body on every turn, plus a three-way
conjunction the route kept in step with two detectors it did not own — became
`regulatedDisclaimerSuffix`, which answers the whole question and returns the suffix or `''`. The
route keeps only `allowResponseDecoration`, which is turn scope, not the rule. The graph did not
change: the one new import is `GoalAncestry`, type-only and therefore erased.

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| 2026-09-17 | The extracted policy lives at `routes/chat-turn-policy.ts`, beside the four existing framework-free chat modules, rather than in a new folder or in `@waggle/agent` | The boundary is enforced by dependency direction and a guard test, not by folder name. `@waggle/agent` is the architecturally correct home but the cluster depends on `TurnMutationPolicy` from `chat-helpers.ts`; moving it there would either invert a dependency (agent importing server) or drag `chat-helpers.ts` along. Relocation is a Phase 8 concern, and CA-6 will use the same pattern first |
| 2026-09-17 | The `@waggle/agent` barrel leak is fixed by additive export subpaths, not by inlining the constants | Inlining `READONLY_TOOLS` would duplicate knowledge `@waggle/agent` owns — the DRY violation Phase 6 exists to catch. The subpaths are additive: no existing barrel consumer changes, and every future inward import has a light path to take |
| 2026-09-17 | Enforcement is a source-level import-graph walk, not a runtime probe and not a lint rule | An outward import that only a rare branch reaches still costs every consumer the load, and a runtime probe would not see it. A lint rule covers the whole layer at once and is the better long-term answer — it is ledgered as CA-7 for Phase 6, where habits that stop re-accumulation are the explicit subject |
| 2026-09-17 | The slice is the 33-commit churn cluster, moved verbatim, with `chat.ts` re-exporting every previously public symbol | 652 non-blank lines moved; six differ, each by a leading `export` keyword, because `chat.ts` still consumes them and they were module-private. No test file was edited, so the 717 pins that cover the cluster prove behavior preservation rather than being adjusted to fit it |
| 2026-09-17 | CA-6's disclaimer rule was pinned at the HTTP boundary before it moved, not after | `REGULATED_DISCLAIMER_MAP` is a `const` inside the handler body: no unit seam reaches it that the move itself would not have to create first, so a unit pin would have encoded the new shape and proved nothing about what shipped. An injected `agentRunner` isolates the block exactly — the neighbouring `/schedule` nudge and grounding hedge are both `!hasCustomRunner` gated. Proven non-vacuous by shortening the hr-manager string and watching that case go red |
| 2026-09-17 | CA-6 landed as two commits — a verbatim move, then an Extract Function — never one | The two need different proofs. The move is provable by set-differencing the destination's added lines against the source's removed lines (exactly one survives: the `GoalAncestry` type import). The extraction genuinely changes shape, so its proof is the seven pins written against the old code passing unchanged against the new. Mixing them would have left a reviewer unable to trust either |
| 2026-09-17 | No component split proposed | The package graph is already acyclic and the framework is already confined to one package. The debt is *inside* `packages/server` and at the `agent → core` edge — splitting services would add a distributed monolith on top of an unsolved boundary problem |
