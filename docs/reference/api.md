# API Reference

The Waggle local server runs on `http://localhost:3333`. All endpoints accept and return JSON unless otherwise noted.

## Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` | Send a message and receive an SSE stream of agent responses. Body: `{ message, workspaceId, sessionId, model? }` |
| GET | `/api/history` | Get conversation history. Query: `?session=ID&workspace=ID` |

The chat endpoint streams responses via Server-Sent Events (SSE). Events include `message`, `tool_call`, `tool_result`, `approval_request`, `done`, and `error`.

## Workspaces

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces` | List all workspaces |
| POST | `/api/workspaces` | Create a workspace. Body: `{ name, group, icon?, model?, personaId?, directory?, teamId? }` |
| GET | `/api/workspaces/:id` | Get workspace by ID |
| PUT | `/api/workspaces/:id` | Update workspace. Body: `{ name?, group?, icon?, model?, personaId? }` |
| DELETE | `/api/workspaces/:id` | Delete workspace |
| GET | `/api/workspaces/:id/context` | Workspace catch-up context: summary, threads, decisions, suggestions, stats |
| GET | `/api/workspaces/:id/files` | List ingested files for a workspace |

## Sessions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/:wid/sessions` | List sessions for a workspace, sorted by last active |
| POST | `/api/workspaces/:wid/sessions` | Create a new session. Body: `{ title? }` |
| GET | `/api/workspaces/:wid/sessions/search` | Search across sessions. Query: `?q=query&limit=20` |
| GET | `/api/workspaces/:wid/sessions/:sid/export` | Export session as Markdown. Returns `text/markdown` |
| PATCH | `/api/sessions/:id` | Rename a session. Body: `{ title }`. Query: `?workspace=ID` |
| DELETE | `/api/sessions/:id` | Delete a session. Query: `?workspace=ID` |

## Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/memory/search` | Search memory. Query: `?q=query&scope=all|personal|workspace&limit=20&workspace=ID` |
| GET | `/api/memory/frames` | Recent frames without search. Query: `?workspace=ID&limit=50` |
| GET | `/api/memory/graph` | Knowledge graph entities and relations. Query: `?workspace=ID` |

## Agent

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent/status` | Agent status: model, tokens used, estimated cost, turn count |
| GET | `/api/agent/cost` | Detailed cost breakdown with formatted summary |
| POST | `/api/agent/cost/reset` | Reset cost tracking (takes effect on server restart) |
| GET | `/api/agent/model` | Current model name |
| PUT | `/api/agent/model` | Switch model. Body: `{ model }` |
| GET | `/api/agents/active` | Active sub-agent orchestrator state |

## Approval Gates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/approval/pending` | List pending approval requests |
| POST | `/api/approval/:requestId` | Approve or deny. Body: `{ approved: boolean, reason? }` |

## Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Read config: default model, providers (masked keys), paths |
| PUT | `/api/settings` | Update config. Body: `{ defaultModel?, providers? }` |
| POST | `/api/settings/test-key` | Validate API key format. Body: `{ provider, apiKey }` |
| GET | `/api/settings/permissions` | Read permission settings (YOLO mode, external gates) |
| PUT | `/api/settings/permissions` | Update permissions. Body: `{ yoloMode?, externalGates?, workspaceOverrides? }` |

## Vault

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/vault` | List all secrets (names and types only, no values) |
| POST | `/api/vault` | Add or update a secret. Body: `{ name, value, type? }` |
| DELETE | `/api/vault/:name` | Delete a secret |
| POST | `/api/vault/:name/reveal` | Decrypt and return the full value |

## Skills

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skills` | List all installed skills |
| GET | `/api/skills/:name` | Get full skill content |
| POST | `/api/skills` | Create a new skill. Body: `{ name, content }` |
| PUT | `/api/skills/:name` | Update skill content. Body: `{ content }` |
| DELETE | `/api/skills/:name` | Remove a skill |
| GET | `/api/skills/suggestions` | Contextual skill recommendations. Query: `?context=text&topN=3` |
| GET | `/api/skills/hash-status` | Check which skills have changed on disk |
| POST | `/api/skills/starter-pack` | Install all starter skills |
| GET | `/api/skills/starter-pack/catalog` | Browse starter skills with install state and family grouping |
| POST | `/api/skills/starter-pack/:id` | Install a single starter skill |
| GET | `/api/skills/capability-packs/catalog` | List all packs with skill states |
| POST | `/api/skills/capability-packs/:id` | Install all skills in a pack |

## Plugins

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/plugins` | List all installed plugins |
| POST | `/api/plugins/install` | Install a plugin. Body: `{ sourceDir }` |
| DELETE | `/api/plugins/:name` | Uninstall a plugin |

## Capabilities

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/capabilities/status` | Aggregated capability dashboard: plugins, MCP, skills, tools, commands, hooks, workflows |
| POST | `/api/capabilities/plugins/:name/enable` | Enable a plugin |
| POST | `/api/capabilities/plugins/:name/disable` | Disable a plugin |

## Marketplace

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/marketplace/search` | Search catalog. Query: `?query=text&type=skill&category=cat&limit=20&offset=0` |
| GET | `/api/marketplace/packs` | List all capability packs |
| GET | `/api/marketplace/packs/:slug` | Pack detail with packages |
| GET | `/api/marketplace/enterprise-packs` | Enterprise packs (requires KVARK) |
| POST | `/api/marketplace/install` | Install package. Body: `{ packageId, installPath?, settings?, force? }` |
| POST | `/api/marketplace/uninstall` | Uninstall package. Body: `{ packageId }` |
| GET | `/api/marketplace/installed` | List installed packages |
| POST | `/api/marketplace/security-check` | Security scan without install. Body: `{ packageId }` |
| GET | `/api/marketplace/sources` | List marketplace sources |
| POST | `/api/marketplace/sync` | Sync from sources. Body: `{ sources?: string[] }` |

## Connectors

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/connectors` | List all connectors with status |
| GET | `/api/connectors/:id/health` | Check connector health |
| POST | `/api/connectors/:id/connect` | Store credentials. Body: `{ token?, apiKey?, refreshToken?, expiresAt?, scopes?, email? }` |
| POST | `/api/connectors/:id/disconnect` | Remove credentials from vault |

## Personas

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/personas` | List all available personas (ID, name, description, icon, affinity, commands) |

## Cron (Scheduling)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/cron` | Create schedule. Body: `{ name, cronExpr, jobType, jobConfig?, workspaceId?, enabled? }` |
| GET | `/api/cron` | List all schedules |
| GET | `/api/cron/:id` | Get one schedule |
| PATCH | `/api/cron/:id` | Update schedule. Body: `{ name?, cronExpr?, jobConfig?, workspaceId?, enabled? }` |
| DELETE | `/api/cron/:id` | Delete schedule |
| POST | `/api/cron/:id/trigger` | Manually trigger a schedule |

## Tasks

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/workspaces/:id/tasks` | List tasks. Query: `?status=open|in_progress|done` |
| POST | `/api/workspaces/:id/tasks` | Create task. Body: `{ title, assigneeName?, assigneeId? }` |
| PATCH | `/api/workspaces/:id/tasks/:taskId` | Update task (status, assignment) |
| DELETE | `/api/workspaces/:id/tasks/:taskId` | Delete task |

## Fleet (Mission Control)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/fleet` | List active workspace sessions with status and duration |
| POST | `/api/fleet/:workspaceId/pause` | Pause a workspace session |
| POST | `/api/fleet/:workspaceId/resume` | Resume a paused session |
| POST | `/api/fleet/:workspaceId/kill` | Abort and close a session |

## File Ingestion

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/ingest` | Ingest files. Body: `{ files: [{ name, content (base64) }], workspaceId? }`. Max 15MB. |

Supported types: images (PNG, JPG, GIF, WebP, SVG), documents (PDF, DOCX, PPTX), spreadsheets (XLSX, CSV), text/code (50+ extensions), archives (ZIP).

## Import

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/import/preview` | Preview import from ChatGPT or Claude export. Body: `{ data, source: "chatgpt"|"claude" }` |
| POST | `/api/import/commit` | Import and save to personal memory. Body: `{ data, source }` |

## Feedback

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/feedback` | Record feedback. Body: `{ sessionId, messageIndex, rating: "up"|"down", reason?, detail? }` |
| GET | `/api/feedback/stats` | Improvement stats: positive rate, top issues, corrections, trend |

## Notifications

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/notifications/stream` | SSE stream of notifications (cron, approval, task, message, agent events) |

## Audit

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/audit/installs` | Recent install audit trail. Query: `?limit=20` |

## Team

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/team/connect` | Connect to team server. Body: `{ serverUrl, token }` |
| POST | `/api/team/disconnect` | Disconnect from team server |
| GET | `/api/team/status` | Current team connection status |

## Anthropic Proxy

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/chat/completions` | OpenAI-compatible endpoint that translates to Anthropic API. Used by internal agent loop. |

## Commands

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/commands/execute` | Execute a slash command. Body: `{ command, workspaceId, sessionId }` |

## SSE Streaming

The `/api/chat` endpoint uses Server-Sent Events for real-time streaming. Event types:

| Event | Description |
|-------|-------------|
| `message` | Agent text chunk |
| `tool_call` | Agent is calling a tool (shows tool name and input) |
| `tool_result` | Tool execution result |
| `approval_request` | Agent needs approval before proceeding |
| `approval_resolved` | Approval was granted or denied |
| `memory_saved` | A memory frame was auto-saved |
| `done` | Agent turn complete |
| `error` | Error occurred |
