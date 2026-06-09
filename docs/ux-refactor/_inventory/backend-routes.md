# Backend Route Inventory — Waggle OS UX Refactor

> **Purpose.** Source-grounded inventory of every existing **local Fastify sidecar** endpoint, plus a
> cross-reference of every **PRD §16 target endpoint** against the current backend. This is the contract
> reference for the in-place incremental refactor (LOCKED execution model): we reuse the existing sidecar
> surface and add/extend only the net-new endpoints the PRD names.
>
> **Method.** Primary source = the audited backend-map (`docs/backend-map/sections/03a–03g`, 65/65 local
> routes documented, ~96% overall coverage per `docs/backend-map/AUDIT.md`). Spot-verified against
> `packages/server/src/local/routes/*.ts` for every PRD-critical path (grep/read).
>
> **Scope note.** Everything below is the **Local Sidecar** (`packages/server/src/local/index.ts` →
> `buildLocalServer()`, default loopback `:3333`, flat `/api/*`, Bearer session-token + same-origin
> guards). The desktop frontend talks ONLY to this server. A separate **Cloud server**
> (`packages/server/src/routes/*.ts`, Clerk-JWT, `:3100`) exists for SaaS/team deployments — its
> `/api/agents`, `/api/jobs`, `/api/scout`, `/api/suggestions` routes are **NOT** in the sidecar and are
> flagged explicitly where they collide with PRD paths. **KVARK** has no Fastify routes (in-process
> `KvarkClient` only).

---

## Part 1 — Existing Local Sidecar Endpoints (by domain)

All paths are relative to the sidecar base (`http://127.0.0.1:3333`). Source files are under
`packages/server/src/local/routes/`. SSE/streaming and non-JSON responses are noted.

### 1.1 Chat / Agent execution / Sessions (`03a`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| POST | `/api/chat` | `chat.ts` | The chat turn — **SSE** stream (token/step/tool/approval_required/done/error). Largest route (~1.7k LOC). |
| DELETE | `/api/chat/history` | `chat.ts` | Clear a session's in-RAM state (`?session=`). Does NOT delete on-disk `.jsonl`. |
| GET | `/api/history` | `agent.ts` | Load a session's messages (RAM-first then disk). |
| GET | `/api/agent/status` | `agent.ts` | Agent + cost snapshot. |
| GET | `/api/agent/cost` | `agent.ts` | Detailed cost breakdown (string summary). |
| POST | `/api/agent/cost/reset` | `agent.ts` | No-op cost reset stub. |
| GET | `/api/agent/model` | `agent.ts` | Current model. |
| PUT | `/api/agent/model` | `agent.ts` | Switch model (`{ model }`). |
| GET | `/api/agents/active` | `agent.ts` | Sub-agent orchestrator state (`{ workers, active }`). |
| POST | `/api/commands/execute` | `commands.ts` | Run a slash command out-of-band (subset of CommandContext). |
| POST | `/api/agent/run` | `agent-run.ts` | One-shot structured retrieval — **SSE** (distinct events from `/api/chat`). |
| GET | `/api/workspaces/:workspaceId/sessions` | `sessions.ts` | List sessions (`?hideEmpty=`). |
| GET | `/api/workspaces/:workspaceId/sessions/search` | `sessions.ts` | Full-text session search (`?q=&limit=`). |
| GET | `/api/workspaces/:workspaceId/sessions/:sessionId/export` | `sessions.ts` | Export one session as Markdown. |
| GET | `/api/workspaces/:workspaceId/sessions/:sessionId/timeline` | `sessions.ts` | Tool-event timeline. |
| POST | `/api/workspaces/:workspaceId/sessions` | `sessions.ts` | Create a session. |
| PATCH | `/api/sessions/:sessionId` | `sessions.ts` | Rename a session. |
| DELETE | `/api/sessions/:sessionId` | `sessions.ts` | Delete a session's `.jsonl`. |
| GET | `/api/sessions/:sessionId/summary` | `sessions.ts` | Structured post-session summary. |
| GET | `/api/agent-groups` | `agent-groups.ts` | List multi-agent group configs. |
| POST | `/api/agent-groups` | `agent-groups.ts` | Create a group. |
| PATCH | `/api/agent-groups/:id` | `agent-groups.ts` | Update a group. |
| DELETE | `/api/agent-groups/:id` | `agent-groups.ts` | Delete a group. |
| POST | `/api/agent-groups/:id/run` | `agent-groups.ts` | **Placeholder** — returns a queued stub, does NOT execute. |

### 1.2 Approvals (`03a` / `03e`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| POST | `/api/approval/:requestId` | `approval.ts` | Approve/deny a paused tool (`{ approved, always? }`). |
| GET | `/api/approval/pending` | `approval.ts` | List paused approvals (reconnect/recovery). |
| GET | `/api/approval/grants` | `approval.ts` | List persistent "always allow" grants. |
| DELETE | `/api/approval/grants/:id` | `approval.ts` | Revoke one grant. |
| POST | `/api/approval/grants/clear` | `approval.ts` | Wipe all grants. |

### 1.3 Memory / Knowledge graph (`03b`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/memory/search` | `memory.ts` | Full-text frame search across personal + workspace minds. |
| GET | `/api/memory/frames` | `memory.ts` | List recent frames (Memory tab initial load). |
| POST | `/api/memory/frames` | `memory.ts` | Save a frame (optional entity extraction). |
| PUT | `/api/memory/frames/:id` | `memory.ts` | Edit a frame's content/importance. |
| PATCH | `/api/memory/frames/:id/access` | `memory.ts` | Increment `access_count`. |
| DELETE | `/api/memory/frames/:id` | `memory.ts` | Delete a frame. |
| GET | `/api/memory/stats` | `memory.ts` | Frame/entity/relation counts. |
| GET | `/api/memory/graph` | `knowledge.ts` | Read entities + relations (`?scope=all\|personal\|current`). No write/CRUD route. |

### 1.4 Wiki compiler (`03b`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/wiki/pages` | `wiki.ts` | List compiled page metadata. |
| GET | `/api/wiki/pages/:slug` | `wiki.ts` | One page's metadata. |
| GET | `/api/wiki/pages/:slug/content` | `wiki.ts` | Full markdown content of a page. |
| POST | `/api/wiki/compile` | `wiki.ts` | Trigger compilation (503 if no real embedder). |
| GET | `/api/wiki/health` | `wiki.ts` | Compilation health report (503 if no real embedder). |
| GET | `/api/wiki/watermark` | `wiki.ts` | Current compilation watermark/state. |
| POST | `/api/wiki/export/obsidian` | `wiki.ts` | Write all pages to an Obsidian-vault dir. |
| POST | `/api/wiki/export/notion` | `wiki.ts` | Push pages to Notion (needs `notion-wiki-token` vault secret). |

### 1.5 Harvest (external AI export ingestion) (`03b`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| POST | `/api/harvest/preview` | `harvest.ts` | Parse an export, show what would import (no save). |
| POST | `/api/harvest/commit` | `harvest.ts` | Full pipeline: save → cognify → wiki recompile. |
| GET | `/api/harvest/sources` | `harvest.ts` | List registered harvest sources. |
| POST | `/api/harvest/sources` | `harvest.ts` | Register/update a source. |
| DELETE | `/api/harvest/sources/:source` | `harvest.ts` | Remove a source. |
| PATCH | `/api/harvest/sources/:source` | `harvest.ts` | Toggle auto-sync/interval. |
| GET | `/api/harvest/progress` | `harvest.ts` | **SSE** import progress stream. |
| GET | `/api/harvest/runs` | `harvest.ts` | List recent harvest runs. |
| GET | `/api/harvest/runs/latest-interrupted` | `harvest.ts` | Latest resumable run. |
| POST | `/api/harvest/runs/:id/abandon` | `harvest.ts` | Discard an interrupted run. |
| POST | `/api/harvest/extract-identity` | `harvest.ts` | LLM-extract identity facts from recent frames. |
| POST | `/api/harvest/scan-claude-code` | `harvest.ts` | Scan local `~/.claude` for Claude Code history. |

### 1.6 Legacy import / File ingestion / Identity / Documents / Erasure (`03b`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| POST | `/api/import/preview` | `import.ts` | Legacy ChatGPT/Claude export preview. |
| POST | `/api/import/commit` | `import.ts` | Legacy import + save to personal memory. |
| POST | `/api/ingest` | `ingest.ts` | Base64 file ingestion (images/pdf/docx/pptx/xlsx/csv/code/zip) → LLM text + frames. |
| GET | `/api/identity` | `identity.ts` | Read the structured identity record (upsert table). |
| POST | `/api/identity` | `identity.ts` | Create/update identity record. |
| GET | `/api/mind/identity` | `mind.ts` | Rendered identity **context string**. |
| GET | `/api/mind/awareness` | `mind.ts` | Awareness state context. |
| GET | `/api/mind/skills` | `mind.ts` | Loaded skills list. |
| GET | `/api/workspaces/:id/documents` | `documents.ts` | List tracked document versions. |
| POST | `/api/workspaces/:id/documents` | `documents.ts` | Register a new document version. |
| GET | `/api/workspaces/:id/documents/:name/versions` | `documents.ts` | List versions of one document. |
| POST | `/api/data/erase` | `data-erase.ts` | GDPR erasure (double-confirm; wipes at next startup). |
| POST | `/api/export` | `export.ts` | Generate + download a ZIP of all user data. |

### 1.7 Workspaces / Templates / Storage / Files / Tasks / Pins (`03c` + `04`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/workspaces` | `workspaces.ts` | List workspaces (`?group=&teamId=`). |
| POST | `/api/workspaces` | `workspaces.ts` | Create a workspace (tier `workspaceLimit`). |
| GET | `/api/workspaces/:id` | `workspaces.ts` | Get one workspace. |
| GET | `/api/workspaces/:id/context` | `workspaces.ts` | "Workspace Now" catch-up block (summary/threads/prompts/state). |
| GET | `/api/workspaces/:id/files` | `workspaces.ts` | List ingested/registered files (file registry, newest first). |
| PUT | `/api/workspaces/:id` | `workspaces.ts` | Update workspace (full). |
| PATCH | `/api/workspaces/:id` | `workspaces.ts` | Partial update (`personaId:null` clears). |
| DELETE | `/api/workspaces/:id` | `workspaces.ts` | Delete workspace + mind DB. |
| GET | `/api/workspaces/:id/export` | `workspaces.ts` | Export workspace (`?format=briefing`→md, else JSON). |
| GET | `/api/workspaces/:id/cost` | `workspaces.ts` | Per-workspace spend vs budget + 7-day history. |
| GET | `/api/workspaces/:id/storage` | `workspaces.ts` | Virtual/linked storage stats. |
| GET | `/api/workspaces/:id/storage/files` | `workspaces.ts` | List files in workspace storage. |
| GET | `/api/workspaces/:id/storage/read` | `workspaces.ts` | Read a file (`?path=`, `?raw=`). |
| POST | `/api/workspaces/:id/storage/write` | `workspaces.ts` | Write a file. |
| DELETE | `/api/workspaces/:id/storage/delete` | `workspaces.ts` | Delete a file. |
| GET | `/api/workspace-templates` | `workspace-templates.ts` | List 15 built-in + user templates. |
| POST | `/api/workspace-templates` | `workspace-templates.ts` | Create a custom template. |
| PUT | `/api/workspace-templates/:id` | `workspace-templates.ts` | Update a custom template (403 if built-in). |
| DELETE | `/api/workspace-templates/:id` | `workspace-templates.ts` | Delete a custom template (403 if built-in). |
| POST | `/api/workspace-templates/generate` | `workspace-templates.ts` | AI-generate a template config. |
| GET | `/api/workspaces/:workspaceId/files/list` | `files.ts` | List managed files in a workspace storage dir (`?path=`). |
| POST | `/api/workspaces/:workspaceId/files/upload` | `files.ts` | Upload a file into workspace storage. |
| GET | `/api/workspaces/:workspaceId/files/download` | `files.ts` | Download a file (`?path=`). |
| POST | `/api/workspaces/:workspaceId/files/mkdir` | `files.ts` | Create a directory. |
| POST | `/api/workspaces/:workspaceId/files/delete` | `files.ts` | Delete a file/dir. |
| POST | `/api/workspaces/:workspaceId/files/move` | `files.ts` | Move a file. |
| POST | `/api/workspaces/:workspaceId/files/copy` | `files.ts` | Copy a file. |
| GET | `/api/tasks` | `tasks.ts` | List tasks across workspaces. |
| GET | `/api/workspaces/:id/tasks` | `tasks.ts` | List tasks for a workspace. |
| POST | `/api/workspaces/:id/tasks` | `tasks.ts` | Create a task. |
| PATCH | `/api/workspaces/:id/tasks/:taskId` | `tasks.ts` | Update a task. |
| DELETE | `/api/workspaces/:id/tasks/:taskId` | `tasks.ts` | Delete a task. |
| GET | `/api/workspaces/:id/pins` | `pins.ts` | List pinned messages. |
| POST | `/api/workspaces/:id/pins` | `pins.ts` | Add a pin. |
| PATCH | `/api/workspaces/:id/pins/:pinId` | `pins.ts` | Update pin status/label. |
| DELETE | `/api/workspaces/:id/pins/:pinId` | `pins.ts` | Remove a pin. |

### 1.8 Team / RBAC (`03c`)

> Two prefixes: `/api/team/*` = remote-server proxy (local fallbacks when disconnected); `/api/teams/*` = local CRUD (always works, `teams.db`).

| Method | Path | Route file | Purpose |
|---|---|---|---|
| POST | `/api/team/connect` | `team.ts` | Connect to remote team server. **Tier: TEAMS.** |
| POST | `/api/team/disconnect` | `team.ts` | Clear team-server config. |
| GET | `/api/team/status` | `team.ts` | Connection status. |
| GET | `/api/team/teams` | `team.ts` | List teams from remote server. |
| GET | `/api/team/members` | `team.ts` | List members (remote or local fallback). |
| GET | `/api/team/presence` | `team.ts` | Presence (`?workspaceId=`). |
| GET | `/api/team/activity` | `team.ts` | Recent activity from remote. |
| GET | `/api/team/messages` | `team.ts` | Recent WaggleDance messages. |
| GET | `/api/team/governance/permissions` | `team.ts` | Effective capability permissions. **Tier: ENTERPRISE.** |
| GET | `/api/team/memory/search` | `team.ts` | Search team memory frames. |
| POST | `/api/teams` | `team.ts` | Create a local team. |
| GET | `/api/teams` | `team.ts` | List teams the local user belongs to. |
| GET | `/api/teams/:id` | `team.ts` | Team detail + members + workspaces. |
| PUT | `/api/teams/:id` | `team.ts` | Update team (owner/admin). |
| DELETE | `/api/teams/:id` | `team.ts` | Delete team (owner only). |
| POST | `/api/teams/:id/members` | `team.ts` | Add/invite member (owner/admin). |
| PUT | `/api/teams/:id/members/:userId` | `team.ts` | Change member role (owner only). |
| PATCH | `/api/teams/:id/members/:userId` | `team.ts` | Change member role (owner/admin). |
| DELETE | `/api/teams/:id/members/:userId` | `team.ts` | Remove member. |
| GET | `/api/teams/:id/activity` | `team.ts` | Aggregated audit events across team workspaces. |

### 1.9 Personas / Settings / Tier / Profile (`03c`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/personas` | `personas.ts` | List persona catalog. |
| POST | `/api/personas` | `personas.ts` | Create custom persona. **Tier: PRO.** |
| PATCH | `/api/personas/:id` | `personas.ts` | Update custom persona. |
| POST | `/api/personas/generate` | `personas.ts` | AI-generate a persona. **Tier: PRO.** |
| DELETE | `/api/personas/:id` | `personas.ts` | Delete custom persona. |
| GET | `/api/settings` | `settings.ts` | Read config (keys masked). |
| PUT | `/api/settings` | `settings.ts` | Update models/budgets/providers. |
| PATCH | `/api/settings` | `settings.ts` | Partial merge (non-provider). |
| POST | `/api/settings/test-key` | `settings.ts` | Validate API-key format (no network). |
| GET | `/api/settings/permissions` | `settings.ts` | Read autonomy/gates/overrides. |
| PUT | `/api/settings/permissions` | `settings.ts` | Save permission settings. |
| GET | `/api/tier` | `settings.ts` | **Authoritative tier source** (effective tier, trial, capabilities). |
| PATCH | `/api/tier` | `settings.ts` | Dev tier override (fail-closed). |
| POST | `/api/tier/start-trial` | `settings.ts` | Start the 15-day TRIAL. |
| GET | `/api/cloud-sync` | `settings.ts` | Cloud-sync status. |
| POST | `/api/cloud-sync/toggle` | `settings.ts` | Toggle cloud sync. **Tier: TEAMS.** |
| GET | `/api/admin/overview` | `settings.ts` | Admin dashboard data. **Tier: TEAMS.** |
| GET | `/api/admin/audit-export` | `settings.ts` | Export audit log. **Tier: TEAMS.** |
| GET | `/api/profile` | `profile.ts` | Full user profile. |
| PUT | `/api/profile` | `profile.ts` | Partial-merge profile update. |
| POST | `/api/profile/analyze-style` | `profile.ts` | LLM-analyze writing sample. |
| POST | `/api/profile/analyze-brand` | `profile.ts` | LLM-extract brand colors/fonts. |
| GET | `/api/profile/style` | `profile.ts` | Writing-style summary. |
| GET | `/api/profile/brand` | `profile.ts` | Brand profile. |
| POST | `/api/profile/research` | `profile.ts` | LLM-research user/company → bio. |

### 1.10 Marketplace / Skills / Plugins / Connectors / Tools (`03d`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/marketplace/search` | `marketplace.ts` | FTS5 + faceted catalog search. |
| GET | `/api/marketplace/packs` | `marketplace.ts` | List capability packs. |
| GET | `/api/marketplace/packs/:slug` | `marketplace.ts` | Pack detail + packages. |
| GET | `/api/marketplace/enterprise-packs` | `marketplace.ts` | KVARK-gated packs. **Tier: ENTERPRISE.** |
| POST | `/api/marketplace/install` | `marketplace.ts` | Install a package (SecurityGate). **Tier: PRO.** |
| POST | `/api/marketplace/uninstall` | `marketplace.ts` | Uninstall a package. |
| GET | `/api/marketplace/installed` | `marketplace.ts` | List installed packages. |
| POST | `/api/marketplace/security-check` | `marketplace.ts` | Scan a package without installing. |
| GET | `/api/marketplace/sources` | `marketplace.ts` | List marketplace sources. |
| POST | `/api/marketplace/sources` | `marketplace.ts` | Add a user source + sync. |
| DELETE | `/api/marketplace/sources/:id` | `marketplace.ts` | Remove a user source. |
| GET | `/api/marketplace/categories` | `marketplace.ts` | Category taxonomy. |
| POST | `/api/marketplace/sync` | `marketplace.ts` | Manual catalog sync. |
| GET | `/api/marketplace/security-status` | `marketplace.ts` | Scanner availability + scan counts. |
| POST | `/api/marketplace/publish` | `marketplace.ts` | Publish a local skill to the catalog. **Tier: PRO.** |
| GET | `/api/skills/starter-pack/catalog` | `skills.ts` | Browse starter skills with state. |
| POST | `/api/skills/starter-pack` | `skills.ts` | Install all starter skills. |
| POST | `/api/skills/starter-pack/:id` | `skills.ts` | Install ONE starter skill. |
| GET | `/api/skills/capability-packs/catalog` | `skills.ts` | List capability packs with states. |
| POST | `/api/skills/capability-packs/:id` | `skills.ts` | Install all skills in a pack. |
| GET | `/api/skills` | `skills.ts` | List installed skills. |
| GET | `/api/skills/suggestions` | `skills.ts` | Contextual skill recommendations. |
| GET | `/api/skills/:name` | `skills.ts` | Full skill content. |
| POST | `/api/skills` | `skills.ts` | Create skill from raw `{ name, content }`. |
| POST | `/api/skills/create` | `skills.ts` | Create skill from structured template. |
| PUT | `/api/skills/:name` | `skills.ts` | Update skill content. |
| DELETE | `/api/skills/:name` | `skills.ts` | Delete skill. |
| GET | `/api/skills/hash-status` | `skills.ts` | Which skills changed on disk. |
| POST | `/api/skills/test` | `skills.ts` | Sandbox/dry-run a skill (prompt injection preview). |
| GET | `/api/audit/installs` | `skills.ts` | Recent install audit trail. |
| GET | `/api/plugins` | `skills.ts` | List installed plugins. |
| POST | `/api/plugins/install` | `skills.ts` | Install a plugin from a local dir. |
| DELETE | `/api/plugins/:name` | `skills.ts` | Uninstall a plugin. |
| GET | `/api/plugins/:name/tools` | `skills.ts` | List a plugin's tools + impl status. |
| GET | `/api/plugins/:name/tools/:toolName` | `skills.ts` | Get one tool's impl file. |
| PUT | `/api/plugins/:name/tools/:toolName` | `skills.ts` | Write a tool impl file. |
| DELETE | `/api/plugins/:name/tools/:toolName` | `skills.ts` | Delete a tool impl file. |
| POST | `/api/plugins/:name/tools` | `skills.ts` | Declare a new tool in the manifest. |
| GET | `/api/hooks` | `skills.ts` | List `pre:tool` deny rules. |
| POST | `/api/hooks` | `skills.ts` | Add a deny rule. |
| DELETE | `/api/hooks/:index` | `skills.ts` | Remove a rule by index. |
| GET | `/api/connectors` | `connectors.ts` | List all connector definitions. |
| GET | `/api/connectors/:id/health` | `connectors.ts` | Live health probe. |
| POST | `/api/connectors/:id/connect` | `connectors.ts` | Store credentials + re-init connector. |
| POST | `/api/connectors/:id/disconnect` | `connectors.ts` | Remove credential + sub-keys. |
| GET | `/api/tools/detect` | `tools.ts` | Scan machine for supported AI tools (AI-OS). |
| POST | `/api/tools/launch` | `tools.ts` | Spawn a tool with workspace env. |
| GET | `/api/tools/processes` | `tools.ts` | List tracked running processes. |
| POST | `/api/tools/kill` | `tools.ts` | Kill a tracked PID. |
| POST | `/api/tools/hooks` | `tools.ts` | Run hive-mind hook install/verify/uninstall. |
| GET | `/api/oauth/providers` | `oauth.ts` | List OAuth providers + token status. |
| GET | `/api/oauth/:provider/authorize` | `oauth.ts` | Build + redirect to provider OAuth URL. |
| GET | `/api/oauth/:provider/callback` | `oauth.ts` | Exchange code → token (HTML response). |
| GET | `/api/vault` | `vault.ts` | List secrets (no values) + suggestions. |
| POST | `/api/vault` | `vault.ts` | Add/update a secret. |
| DELETE | `/api/vault/:name` | `vault.ts` | Delete a secret. |
| POST | `/api/vault/:name/reveal` | `vault.ts` | Decrypt + return value (local-origin only). |
| GET | `/api/providers` | `providers.ts` | LLM + search providers, models, key status. |

> **Dev-only (not a production contract):** `marketplace-dev.ts` registers `/_dev/marketplace/{search,security-check,packs,health}` behind env `WAGGLE_DEV_MARKETPLACE=1`. Excluded from PRD cross-reference.

### 1.11 Evolution / Feedback / Telemetry / Compliance / Cost / Capabilities (`03e`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/evolution/runs` | `evolution.ts` | List evolution runs. |
| GET | `/api/evolution/runs/:uuid` | `evolution.ts` | Single run detail. |
| POST | `/api/evolution/runs/:uuid/accept` | `evolution.ts` | Accept + deploy a run. |
| POST | `/api/evolution/runs/:uuid/reject` | `evolution.ts` | Reject a run. |
| GET | `/api/evolution/targets` | `evolution.ts` | Enumerate evolvable targets. |
| GET | `/api/evolution/baseline` | `evolution.ts` | Current baseline text for a target. |
| POST | `/api/evolution/run` | `evolution.ts` | Trigger a real run (JSON or **SSE**). |
| GET | `/api/evolution/status` | `evolution.ts` | Aggregate status counts. |
| POST | `/api/feedback` | `feedback.ts` | Record thumbs up/down on a message. |
| GET | `/api/feedback/stats` | `feedback.ts` | Improvement stats + trend. |
| GET | `/api/telemetry/summary` | `telemetry.ts` | Local telemetry summary. |
| GET | `/api/telemetry/events` | `telemetry.ts` | Query telemetry events. |
| DELETE | `/api/telemetry/events` | `telemetry.ts` | Clear all telemetry events. |
| GET | `/api/telemetry/status` | `telemetry.ts` | Telemetry enabled flag + count. |
| POST | `/api/telemetry/toggle` | `telemetry.ts` | Enable/disable telemetry. |
| POST | `/api/telemetry/track` | `telemetry.ts` | Record a single event (frontend). |
| GET | `/api/compliance/status` | `compliance.ts` | EU AI Act per-article status. |
| POST | `/api/compliance/export` | `compliance.ts` | Generate audit report (JSON). |
| POST | `/api/compliance/export-pdf` | `compliance.ts` | Generate audit report (PDF binary). |
| GET | `/api/compliance/interactions` | `compliance.ts` | List recorded AI interactions. |
| POST | `/api/compliance/interactions` | `compliance.ts` | Record an AI interaction. |
| GET | `/api/compliance/models` | `compliance.ts` | Model inventory for a date range. |
| GET | `/api/compliance/templates` | `compliance.ts` | List compliance report templates. |
| GET | `/api/compliance/templates/:id` | `compliance.ts` | Get one template. |
| POST | `/api/compliance/templates` | `compliance.ts` | Create a template. |
| PATCH | `/api/compliance/templates/:id` | `compliance.ts` | Update a template. |
| DELETE | `/api/compliance/templates/:id` | `compliance.ts` | Delete a template. |
| GET | `/api/cost/summary` | `cost.ts` | Cost dashboard (today/week/all-time + budget). |
| GET | `/api/cost/by-workspace` | `cost.ts` | Per-workspace cost. **Tier: TEAMS.** |
| GET | `/api/costs` | `cost.ts` | Alias → `/api/cost/summary`. |
| GET | `/api/capabilities/status` | `capabilities.ts` | Plugins/MCP/skills/tools/commands/hooks/workflows status. |
| POST | `/api/capabilities/plugins/:name/enable` | `capabilities.ts` | Enable a plugin. |
| POST | `/api/capabilities/plugins/:name/disable` | `capabilities.ts` | Disable a plugin. |

### 1.12 Workflows (`03e`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/workflows` | `workflows.ts` | List built-in + custom workflow templates. |
| POST | `/api/workflows` | `workflows.ts` | Create a custom workflow template. |
| DELETE | `/api/workflows/:name` | `workflows.ts` | Delete a custom workflow template. |

### 1.13 Real-time / Ops (`03f`)

| Method | Path | Route file | Purpose |
|---|---|---|---|
| GET | `/api/waggle/signals` | `waggle-signals.ts` | List recent WaggleDance UI signals. |
| POST | `/api/waggle/signals` | `waggle-signals.ts` | Publish a UI signal. |
| PATCH | `/api/waggle/signals/:id/ack` | `waggle-signals.ts` | Acknowledge a signal. |
| GET | `/api/waggle/stream` | `waggle-signals.ts` | **SSE** signal stream. |
| POST | `/api/waggle-dance/signal` | `waggle-dance.ts` | v2 protocol bus: dispatch a signal. |
| GET | `/api/waggle-dance/signals` | `waggle-dance.ts` | v2 ring-buffer snapshot. |
| GET | `/api/events` | `events.ts` | Paginated audit-event listing. |
| GET | `/api/events/stats` | `events.ts` | Audit aggregates. |
| GET | `/api/events/stream` | `events.ts` | **SSE** live audit events. |
| POST | `/api/cron` | `cron.ts` | Create a cron schedule. |
| GET | `/api/cron` | `cron.ts` | List schedules. |
| GET | `/api/cron/:id` | `cron.ts` | Get one schedule. |
| PATCH | `/api/cron/:id` | `cron.ts` | Update a schedule. |
| DELETE | `/api/cron/:id` | `cron.ts` | Delete a schedule. |
| POST | `/api/cron/:id/trigger` | `cron.ts` | Manually run now (auto-enables). |
| GET | `/api/cron/:id/history` | `notifications.ts` | Cron execution history. |
| GET | `/api/notifications/stream` | `notifications.ts` | **SSE** notifications + subagent status. |
| GET | `/api/notifications` | `notifications.ts` | List persisted notifications. |
| POST | `/api/notifications/:id/read` | `notifications.ts` | Mark one read. |
| GET | `/api/notifications/history` | `notifications.ts` | List (alias, limit 100). |
| PATCH | `/api/notifications/:id/read` | `notifications.ts` | Mark one read (PATCH). |
| POST | `/api/notifications/read-all` | `notifications.ts` | Mark all read. |
| GET | `/api/offline/status` | `offline.ts` | Offline state. |
| POST | `/api/offline/queue` | `offline.ts` | Queue a message. |
| GET | `/api/offline/queue` | `offline.ts` | List queued messages. |
| DELETE | `/api/offline/queue/:id` | `offline.ts` | Remove one queued message. |
| DELETE | `/api/offline/queue` | `offline.ts` | Clear all queued messages. |
| POST | `/api/backup` | `backup.ts` | Build + stream encrypted backup archive. |
| POST | `/api/restore` | `backup.ts` | Restore from an archive (`preview?`). |
| GET | `/api/backup/metadata` | `backup.ts` | Last backup info. |
| GET | `/api/fleet` | `fleet.ts` | List active workspace sessions (Mission Control). |
| POST | `/api/fleet/spawn` | `fleet.ts` | Spawn a new agent session. |
| POST | `/api/fleet/:workspaceId/pause` | `fleet.ts` | Pause a session. |
| POST | `/api/fleet/:workspaceId/resume` | `fleet.ts` | Resume a session. |
| POST | `/api/fleet/:workspaceId/kill` | `fleet.ts` | Abort + close a session. |
| GET | `/api/litellm/status` | `litellm.ts` | LiteLLM router status. |
| POST | `/api/litellm/restart` | `litellm.ts` | Restart the router. |
| GET | `/api/litellm/models` | `litellm.ts` | Available model IDs. |
| GET | `/api/litellm/pricing` | `litellm.ts` | Static per-model pricing. |
| GET | `/api/local-inference/hardware` | `local-inference.ts` | Detect GPU/RAM/CPU. |
| GET | `/api/local-inference/models` | `local-inference.ts` | Recommend models that fit. |
| GET | `/api/local-inference/status` | `local-inference.ts` | Ollama/vLLM availability. |
| POST | `/api/local-inference/pull` | `local-inference.ts` | Pull a model via Ollama. |
| GET | `/v1/health/liveliness` | `anthropic-proxy.ts` | Built-in proxy health. |
| POST | `/v1/chat/completions` | `anthropic-proxy.ts` | OpenAI-compatible Anthropic proxy (**SSE** when `stream`). |
| GET | `/api/browse/local` | `browse.ts` | List directories (local-only). |
| POST | `/api/browse/local/mkdir` | `browse.ts` | Create a directory (local-only). |
| GET | `/api/browser-ext/health` | `browser-ext.ts` | Browser-extension health check. |
| GET | `/api/telegram/status` | `telegram.ts` | Telegram config status. |
| POST | `/api/telegram/config` | `telegram.ts` | Save Telegram creds. |
| POST | `/api/telegram/test` | `telegram.ts` | Send a test message. |
| POST | `/api/telegram/send` | `telegram.ts` | Send arbitrary text. |
| GET | `/api/weaver/status` | `weaver.ts` | Weaver subsystem status. |
| POST | `/api/weaver/trigger` | `weaver.ts` | Trigger a Weaver run. |

### 1.14 Bootstrap / Stripe billing / WebSocket (`03g`)

| Method | Path | Source | Purpose |
|---|---|---|---|
| GET | `/health` | `local/index.ts` (inline) | Health probe (auth-exempt). |
| GET | `/api/auth/session-token` | `local/index.ts` (inline) | Bootstrap session token (same-origin, auth-exempt). |
| GET | `/api/debug/logs` | `local/index.ts` (inline) | Support bundle (same-origin). |
| GET | `/api/docs` | `local/index.ts` (inline) | Auto-generated route/OpenAPI listing. |
| GET | `/ws` | `local/index.ts` (inline) | WebSocket event-bus relay (`?token=`). |
| GET | `/*` | `local/index.ts` (inline) | SPA fallback (serves `index.html`). |
| POST | `/api/stripe/create-checkout-session` | `stripe/` (`stripeRoutes`) | Start Stripe checkout (PRO/TEAMS). |
| POST | `/api/stripe/webhook` | `stripe/` | Stripe webhook (raw body, signature-verified). |
| POST | `/api/stripe/sync` | `stripe/` | Poll-fallback payment confirmation. |
| POST | `/api/stripe/create-portal-session` | `stripe/` | Stripe billing portal. **Tier: PRO.** |

---

## Part 2 — PRD §16 Target Endpoints → Cross-Reference

Status legend:
- **EXISTS** — a sidecar route already serves this exact (or path-equivalent) contract.
- **PARTIAL** — closest current capability exists but path/shape/semantics differ; the refactor extends/aliases rather than builds net-new.
- **MISSING** — no sidecar route provides this; net-new backend work required.

> Verification: every MISSING row was grep-confirmed absent from `packages/server/src/local/routes/*.ts`
> (`/api/share`, `/api/home`, `/api/quick-capture`, `/api/command`, `/api/artifacts`, `/api/automations`,
> `/api/mcps`, `/api/agents/:id/{run,pause,traces}`, `/api/skills/:id/{install,test}`,
> `/api/memory/merge`, `/api/memory/:id/archive`, `/api/connectors/:id/{sync,revoke}` — **0 matches**).

### 16.1 Home

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/home/briefing` | **MISSING** | No `/api/home/*` route. Data is assemblable from `GET /api/workspaces/:id/context` (greeting/summary/threads/pendingTasks/upcomingSchedules) + `GET /api/cost/summary`, but no Home aggregation endpoint exists. Net-new. |
| `POST /api/quick-capture` | **PARTIAL** | No `/api/quick-capture`. Closest: `POST /api/memory/frames` (`memory.ts`) writes a frame directly. Quick-capture = thin wrapper (default personal mind + `source`); extend rather than build new substrate. |
| `GET /api/home/overnight` | **MISSING** | No overnight-digest route. Inputs exist (`GET /api/events`, `GET /api/notifications`, `GET /api/cron/:id/history`) but no aggregation endpoint. Net-new. |

### 16.2 Workspaces

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/workspaces` | **EXISTS** | `workspaces.ts`. |
| `POST /api/workspaces` | **EXISTS** | `workspaces.ts`. |
| `GET /api/workspaces/:id` | **EXISTS** | `workspaces.ts`. |
| `PATCH /api/workspaces/:id` | **EXISTS** | `workspaces.ts` (also `PUT`). |
| `GET /api/workspaces/:id/state` | **PARTIAL** | No `/state` route. `GET /api/workspaces/:id/context` returns `workspaceState` as a sub-object. Either alias `/state` to that sub-object or add a thin route. |
| `GET /api/workspaces/:id/context` | **EXISTS** | `workspaces.ts` — the "Workspace Now" catch-up block. |
| `GET /api/workspaces/:id/activity` | **PARTIAL** | No per-workspace `/activity`. Closest: `GET /api/events?workspaceId=` (`events.ts`) and `GET /api/teams/:id/activity`. Add a thin `/activity` alias over the audit-event query. |

### 16.3 Command Center

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/command/search?q=` | **MISSING** | No `/api/command/*`. Note `commands.ts` is `/api/commands/execute` (slash-command exec, different shape). PRD's "command palette" search needs net-new (federate over workspaces/memory/skills/sessions). |
| `POST /api/command/execute` | **PARTIAL** | `POST /api/commands/execute` exists (note **plural** `commands`) but only runs slash commands with a subset CommandContext; PRD's generic command-palette execute is broader. Reuse/rename + extend. |
| `GET /api/command/recent` | **MISSING** | No recent-commands surface. Net-new (or derive client-side from session history). |
| `GET /api/command/suggestions` | **MISSING** | No command-suggestions route. Closest analog is `GET /api/skills/suggestions` (different domain). Net-new. |

### 16.4 Memory

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/memory` | **PARTIAL** | List is `GET /api/memory/frames`; search is `GET /api/memory/search`. PRD's bare `/api/memory` maps to `/frames` (alias or accept both). |
| `GET /api/memory/:id` | **MISSING** | No single-frame GET. Frames are addressable for PUT/PATCH/DELETE (`/api/memory/frames/:id`) but there is no `GET .../frames/:id`. Add a thin read route. |
| `POST /api/memory` | **PARTIAL** | `POST /api/memory/frames` exists. PRD bare path = alias of `/frames`. |
| `PATCH /api/memory/:id` | **PARTIAL** | `PUT /api/memory/frames/:id` edits content/importance (PRD uses `PATCH`; semantics match). Accept `PATCH` + bare path or alias. |
| `POST /api/memory/:id/archive` | **MISSING** | No archive action. `importance: 'deprecated'` exists as a value but no archive endpoint; closest mutation is `PUT /api/memory/frames/:id`. Net-new (or model archive as an importance/status edit). |
| `DELETE /api/memory/:id` | **PARTIAL** | `DELETE /api/memory/frames/:id` exists; PRD uses the bare `:id` path. Alias. |
| `POST /api/memory/merge` | **MISSING** | No frame-merge route. Net-new (dedup/merge of duplicate frames). |
| `GET /api/memory/graph` | **EXISTS** | `knowledge.ts`. |

### 16.5 Harvest

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `POST /api/harvest/preview` | **EXISTS** | `harvest.ts`. |
| `POST /api/harvest/commit` | **EXISTS** | `harvest.ts`. |
| `GET /api/harvest/sources` | **EXISTS** | `harvest.ts`. |
| `POST /api/harvest/sources/:id/sync` | **PARTIAL** | No per-source `/sync` action. Sources are registered/toggled via `POST /api/harvest/sources`, `PATCH /api/harvest/sources/:source` (auto-sync config); the actual sync happens through `POST /api/harvest/commit`. Add a thin per-source `/sync` that resolves the source + calls commit. Note PRD uses `:id`; current sources are keyed by `:source` name. |

### 16.6 Artifacts

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/artifacts` | **PARTIAL** | No `/api/artifacts` domain. Closest substrates: workspace file registry `GET /api/workspaces/:id/files` (`workspaces.ts`), managed files `GET /api/workspaces/:workspaceId/files/list` (`files.ts`), and document versions `GET /api/workspaces/:id/documents` (`documents.ts`). PRD "artifacts" = a new unified abstraction over these; needs a net-new aggregation layer reusing the existing stores. |
| `POST /api/artifacts` | **PARTIAL** | Closest writes: `POST /api/ingest`, `POST /api/workspaces/:workspaceId/files/upload`, `POST /api/workspaces/:id/documents`. New artifact-create endpoint needed. |
| `GET /api/artifacts/:id` | **MISSING** | No artifact-by-id read. Net-new. |
| `PATCH /api/artifacts/:id` | **MISSING** | No artifact update. Net-new. |
| `DELETE /api/artifacts/:id` | **PARTIAL** | Closest: `POST /api/workspaces/:workspaceId/files/delete`, `DELETE /api/workspaces/:id/storage/delete`. New artifact-delete endpoint needed. |
| `GET /api/artifacts/search-related?q=` | **MISSING** | No related-artifact search. Net-new (could lean on memory/wiki search internally). |

### 16.7 Agents

> **Naming collision:** PRD's `/api/agents/*` (CRUD + run/pause/traces) matches the **Cloud** server's
> Clerk-gated `routes/agents.ts` (`/api/agents`, `/api/agents/:id`, etc.) — **NOT** the sidecar. The
> sidecar's agent surface is `/api/agent/*` (singular: status/cost/model) + `/api/agents/active` +
> `/api/agent-groups/*` + `/api/fleet/*`. So in the desktop (sidecar) context, the PRD §16.7 agent CRUD
> is **MISSING** locally even though a Clerk-gated cloud analog exists.

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/agents` | **MISSING (sidecar)** | Sidecar has `GET /api/agents/active` (live orchestrator state) only. Persona catalog `GET /api/personas` + groups `GET /api/agent-groups` are the closest "agent definitions". Cloud `GET /api/agents` (Clerk) is a separate server. |
| `POST /api/agents` | **MISSING (sidecar)** | No sidecar agent-create. Closest: `POST /api/personas` (custom persona) / `POST /api/agent-groups`. Cloud-only `POST /api/agents` exists (Clerk). |
| `GET /api/agents/:id` | **MISSING** | No sidecar agent-by-id. Net-new (or map onto persona/group id). |
| `PATCH /api/agents/:id` | **MISSING** | No sidecar route. Closest: `PATCH /api/personas/:id` / `PATCH /api/agent-groups/:id`. |
| `POST /api/agents/:id/run` | **PARTIAL** | No per-agent `/run`. Closest run paths: `POST /api/fleet/spawn` (`{ task, persona?, model? }` — real execution), `POST /api/agent/run` (one-shot retrieval SSE), `POST /api/agent-groups/:id/run` (placeholder stub). Wire `/agents/:id/run` onto fleet-spawn. |
| `POST /api/agents/:id/pause` | **PARTIAL** | No per-agent `/pause`. Closest: `POST /api/fleet/:workspaceId/pause`. Map agent→session and reuse. |
| `GET /api/agents/:id/traces` | **PARTIAL** | No per-agent `/traces`. Closest: session timeline `GET /api/workspaces/:wid/sessions/:sid/timeline` and the execution-trace store (no dedicated HTTP listing). Add a `/traces` route reading the trace store. |

### 16.8 Skills

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/skills` | **EXISTS** | `skills.ts`. |
| `POST /api/skills` | **EXISTS** | `skills.ts` (raw create; also `POST /api/skills/create` structured). |
| `PATCH /api/skills/:id` | **PARTIAL** | Update is `PUT /api/skills/:name` (keyed by **name**, method `PUT`). PRD uses `PATCH` + `:id`. Accept `PATCH` / alias name↔id. |
| `POST /api/skills/:id/test` | **PARTIAL** | Test exists but as `POST /api/skills/test` (body-driven, not per-id path). Add `:id` path variant or pass via body. |
| `POST /api/skills/:id/install` | **PARTIAL** | No per-skill `/install` by arbitrary id. Closest installs: `POST /api/skills/starter-pack/:id`, `POST /api/skills/capability-packs/:id`, and marketplace `POST /api/marketplace/install`. Add a unified `/skills/:id/install` that dispatches by source. |

### 16.9 Connectors / MCPs / Marketplace

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/connectors` | **EXISTS** | `connectors.ts`. |
| `POST /api/connectors/:id/connect` | **EXISTS** | `connectors.ts`. |
| `POST /api/connectors/:id/sync` | **MISSING** | No connector `/sync` action. Net-new (re-fetch from connected service). |
| `POST /api/connectors/:id/revoke` | **PARTIAL** | Closest: `POST /api/connectors/:id/disconnect` (removes vault creds + sub-keys). Same intent, different verb. Alias `/revoke` → disconnect or add. |
| `GET /api/mcps` | **PARTIAL** | No `/api/mcps`. MCP servers surface inside `GET /api/capabilities/status` (`mcpServers[]`); MCP catalog lives in `@waggle/shared` `mcp-catalog.ts` (no dedicated HTTP route). Net-new dedicated MCP listing endpoint (or extract from capabilities/status + catalog). |
| `POST /api/mcps/install` | **PARTIAL** | No `/api/mcps/install`. MCP servers are installed via the marketplace path (`POST /api/marketplace/install`) and plugin install (`POST /api/plugins/install`). Add an MCP-specific install or route through marketplace. |
| `POST /api/mcps/:id/test` | **MISSING** | No MCP test/health route. Closest analog: `GET /api/connectors/:id/health`. Net-new for MCP. |
| `POST /api/mcps/:id/revoke` | **MISSING** | No MCP revoke/uninstall by id. Closest: `DELETE /api/plugins/:name`. Net-new for MCP. |
| `GET /api/marketplace` | **PARTIAL** | Marketplace listing is `GET /api/marketplace/search` (+ `/packs`, `/installed`, `/categories`). PRD's bare `/api/marketplace` = alias of `/search` (default params). |
| `POST /api/marketplace/install` | **EXISTS** | `marketplace.ts` (**Tier: PRO**, SecurityGate). |

### 16.10 Automations

> **No `/api/automations/*` routes exist.** The underlying capability is **cron** (`cron.ts`,
> `/api/cron/*`), which provides full CRUD + trigger + history. "Automations" = a rename/extension of cron.

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/automations` | **PARTIAL** | Maps to `GET /api/cron` (`cron.ts`). Rename/alias the cron surface as "automations". |
| `POST /api/automations` | **PARTIAL** | Maps to `POST /api/cron`. |
| `PATCH /api/automations/:id` | **PARTIAL** | Maps to `PATCH /api/cron/:id`. |
| `POST /api/automations/:id/run` | **PARTIAL** | Maps to `POST /api/cron/:id/trigger` (auto-enables + runs). |
| `POST /api/automations/:id/pause` | **PARTIAL** | No `/pause`; equivalent is `PATCH /api/cron/:id { enabled: false }`. Add a thin `/pause` or use the enabled flag. |
| `GET /api/automations/:id/logs` | **PARTIAL** | Maps to `GET /api/cron/:id/history` (in `notifications.ts`). |

### 16.11 Team / RBAC

| PRD endpoint | Status | Current path / note |
|---|---|---|
| `GET /api/teams/:id` | **EXISTS** | `team.ts` (local CRUD; returns members + workspaces). |
| `POST /api/teams/:id/invite` | **PARTIAL** | Invite is `POST /api/teams/:id/members` (`{ userId?, email?, displayName?, role? }`). Same intent, different path name. Alias `/invite` → `/members`. |
| `PATCH /api/teams/:id/members/:memberId` | **EXISTS** | `team.ts` — `PATCH /api/teams/:id/members/:userId` (PRD's `:memberId` == `:userId`). Also `PUT` variant. |
| `GET /api/teams/:id/audit` | **PARTIAL** | Closest: `GET /api/teams/:id/activity` (aggregated audit events across team workspaces) and `GET /api/events`. Alias `/audit` → `/activity` or add. |
| `POST /api/share` | **MISSING** | No `/api/share` route anywhere in the repo (grep-confirmed). Sharing is implicit via team workspaces + `teamId` linkage; no explicit share endpoint. Net-new. |

---

## Part 3 — Summary Counts

### Existing local sidecar endpoints (Part 1)

| Domain group | Count |
|---|---|
| Chat / Agent exec / Sessions (`03a`) | 23 |
| Approvals (`03a`/`03e`) | 5 |
| Memory + Knowledge graph (`03b`) | 8 |
| Wiki (`03b`) | 8 |
| Harvest (`03b`) | 12 |
| Import / Ingest / Identity / Mind / Documents / Erase / Export (`03b`) | 13 |
| Workspaces / Templates / Storage / Files / Tasks / Pins (`03c`+`04`) | 38 |
| Team / RBAC (`03c`) | 20 |
| Personas / Settings / Tier / Profile (`03c`) | 26 |
| Marketplace / Skills / Plugins / Connectors / Tools / OAuth / Vault / Providers (`03d`) | 56 |
| Evolution / Feedback / Telemetry / Compliance / Cost / Capabilities (`03e`) | 31 |
| Workflows (`03e`) | 3 |
| Real-time / Ops (`03f`) | 60 |
| Bootstrap / Stripe / WebSocket (`03g`) | 10 |
| **Total existing local sidecar endpoints** | **313** |

> Aligns with the backend-map domain overview (~294 endpoints across 7 domains in `06-api-domains.md`;
> this inventory additionally counts inline bootstrap routes, the `/v1/*` proxy, weaver/tasks/files, and
> tier-gated billing routes individually). Dev-only `/_dev/marketplace/*` (4 routes, env-gated) and the
> separate Clerk-gated **Cloud** server routes are excluded.

### PRD §16 target endpoints (Part 2)

| Section | Total | EXISTS | PARTIAL | MISSING |
|---|---|---|---|---|
| 16.1 Home | 3 | 0 | 1 | 2 |
| 16.2 Workspaces | 7 | 5 | 2 | 0 |
| 16.3 Command Center | 4 | 0 | 1 | 3 |
| 16.4 Memory | 8 | 2 | 4 | 2 |
| 16.5 Harvest | 4 | 3 | 1 | 0 |
| 16.6 Artifacts | 6 | 0 | 3 | 3 |
| 16.7 Agents | 7 | 0 | 3 | 4 |
| 16.8 Skills | 5 | 2 | 3 | 0 |
| 16.9 Connectors/MCPs/Marketplace | 10 | 2 | 4 | 4 |
| 16.10 Automations | 6 | 0 | 6 | 0 |
| 16.11 Team/RBAC | 5 | 2 | 2 | 1 |
| **Total** | **65** | **16** | **30** | **19** |

**Headline:** Of 65 PRD §16 target endpoints, **16 EXIST** as-is, **30 are PARTIAL** (closest current
path exists — refactor extends/aliases over the existing substrate), and **19 are MISSING** (net-new
backend work). The MISSING set clusters in three net-new domains the PRD invents — **Home** (briefing/
overnight), **Command Center** (palette search/recent/suggestions), and **Artifacts** (unified
file/document/output abstraction) — plus **MCP-specific** management (test/revoke), **memory merge/
archive/by-id**, **per-agent run/traces**, and **`/api/share`**. None require a new data store: every
MISSING endpoint can be built over existing substrates (memory frames, file registry, document versions,
cron, audit events, execution traces, capabilities/status), consistent with the LOCKED in-place
incremental-refactor model.
