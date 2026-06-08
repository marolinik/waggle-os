# 03f — Real-Time & Ops API Surface

**Purpose.** This section is the frontend rebuild contract for Waggle OS's *real-time and operations* backend: the two WaggleDance signal systems (the UI-facing `/api/waggle/*` stream plus the v2 protocol bus `/api/waggle-dance/*`), the audit `/api/events` stream, cron schedules, persisted notifications, offline message queue, encrypted backup/restore, the agent fleet, the LiteLLM / local-inference / Anthropic LLM proxies, filesystem browse, the browser extension health check, and Telegram outbound push. Four of these endpoints are **Server-Sent Events (SSE)** streams the UI subscribes to with `EventSource`; everything else is plain JSON REST.

All routes are served by the **Node.js Fastify sidecar** bundled into the Tauri desktop binary. Every path below was read directly from `packages/server/src/local/routes/` and `packages/server/src/local/`.

---

## 1. SSE / streaming endpoints (read these first)

Four endpoints hold the connection open and push `text/event-stream` frames. The frontend consumes them with `new EventSource(url)`. Each sends an initial connect frame, a periodic heartbeat/keepalive comment (`: ...`), and named events.

| Endpoint | Initial frame | Named events emitted | Heartbeat | Source |
|---|---|---|---|---|
| `GET /api/waggle/stream` | `event: connected\ndata: {}` | `signal` (full `WaggleSignal` JSON) | `: heartbeat` every 30s | `routes/waggle-signals.ts` |
| `GET /api/events/stream` | `data: {"type":"connected"}` | `audit` (full `AuditEvent` JSON) | `: keepalive` every 30s | `routes/events.ts` |
| `GET /api/notifications/stream` | `data: {"type":"connected"}` | `notification` (default unnamed `data:` frame), `subagent_status`, `workflow_suggestion` | `: heartbeat` every 30s | `routes/notifications.ts` |
| `POST /v1/chat/completions` (when `stream:true`) | none | streamed OpenAI-format `data:` chunks, terminated by `data: [DONE]` | none | `routes/anthropic-proxy.ts` |

**Notes for the frontend:**
- On `/api/notifications/stream`, `notification` events arrive as **unnamed** `data:` frames (use `eventSource.onmessage`); `subagent_status` and `workflow_suggestion` arrive as **named** events (use `addEventListener('subagent_status', ...)`).
- The SSE streams set `Access-Control-Allow-Origin` only when the request `Origin` passes the same exact-match allowlist the CORS plugin uses (`corsOriginAllowed` / `validateOrigin`). A cross-origin page cannot read these streams.
- The connection is held open server-side via `await new Promise(() => {})` (waggle/stream) or by hijacking the raw reply; closing the `EventSource` triggers `request.raw.on('close')` cleanup that removes the listener and clears the heartbeat.

---

## 2. WaggleDance signals — UI stream (`/api/waggle/*`)

Source: `routes/waggle-signals.ts`. In-memory store of the last **500** signals (newest-first `unshift`, capped). This is the legacy/high-level signal shape the existing `WaggleDanceApp` UI renders.

### `WaggleSignal` shape (the JSON the UI receives)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | `sig-<epochMs>-<rand4>` |
| `type` | `string` | e.g. `agent:started`, `tool:called`, `memory:saved`, `agent:completed`, `agent:spawned`, `agent:error`, or bridged `waggle-dance:<category>` |
| `workspaceId` | `string` | defaults to `'global'` if unset |
| `content` | `string` | human-readable primary text |
| `metadata` | `Record<string,unknown>` (optional) | arbitrary provenance |
| `timestamp` | `string` | ISO-8601 |
| `acknowledged` | `boolean` | toggled by the ack PATCH |

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/waggle/signals` | List recent signals. Query: `limit` (default 50, max 200), `unacked=1` (only unacknowledged). Returns `{ signals, total }`. |
| `POST` | `/api/waggle/signals` | Publish a signal. Body `{ type, content, workspaceId?, metadata? }` (`type` + `content` required). Returns 201 with the full signal. |
| `PATCH` | `/api/waggle/signals/:id/ack` | Mark a signal acknowledged. Returns `{ acknowledged: true, id }`. |
| `GET` | `/api/waggle/stream` | **SSE.** Stream of new signals (see §1). |

`emitWaggleSignal(...)` is the internal publish helper called from the chat loop and `fleet.ts` spawn flow.

---

## 3. WaggleDance v2 protocol bus (`/api/waggle-dance/*`)

Source: `routes/waggle-dance.ts` + `signal-bus.ts` + `waggle-dance-bridge.ts`. This is the AI-OS Phase 1B cross-tool activity bus. It uses the **protocol** message shape (`WaggleMessage`), not the UI signal shape. A `SignalBus` ring buffer (default capacity **500**, drops oldest) backs it, decorated onto the Fastify instance as `server.signalBus`.

### `WaggleMessage` shape (`packages/shared/src/types.ts`)

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | auto-filled `randomUUID()` |
| `teamId` | `string` | defaults to `personal::<senderId>` when `teamId` omitted — this is the personal-tier moat |
| `senderId` | `string` | defaults to `'local'` |
| `type` | `'broadcast' \| 'request' \| 'response'` | |
| `subtype` | `MessageSubtype` (10 values, see below) | |
| `content` | `Record<string, unknown>` | |
| `referenceId` | `string \| null` | |
| `routing` | `Array<{ userId; reason }> \| null` | |
| `createdAt` | `Date` | auto-filled |

### Valid `type` → `subtype` combinations (`packages/waggle-dance/src/protocol.ts`)

The POST endpoint **rejects** (400) any combo not in this table:

| `type` | Allowed `subtype` values |
|---|---|
| `request` | `knowledge_check`, `task_delegation`, `skill_request`, `model_recommendation` |
| `response` | `knowledge_match`, `task_claim` |
| `broadcast` | `discovery`, `routed_share`, `skill_share`, `model_recipe` |

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/waggle-dance/signal` | Normalize + validate + dispatch a v2 signal. Body `{ type, subtype, content, senderId?, teamId?, referenceId?, routing? }`. Returns **201** `{ dispatched: true, response, message }`; **400** on validation/combo/dispatch failure. |
| `GET` | `/api/waggle-dance/signals` | Snapshot of the ring buffer, newest-first. Query: `subtype?`, `tool?`, `teamId?`, `limit?` (max 1000), `since?` (ISO). Returns `{ signals, total }`. |

### The bridge (zero-frontend-change cross-tool activity)

`installWaggleDanceBridge(bus)` subscribes the v2 bus and re-emits every message into the legacy `/api/waggle/signals` stream as a `waggle-dance:<category>` signal, so the existing UI surfaces cross-tool activity with no changes. The 10 protocol subtypes collapse to **5 UI categories**:

| v2 subtype(s) | → UI category |
|---|---|
| `discovery`, `knowledge_check`, `skill_request` | `discovery` |
| `task_delegation`, `skill_share`, `routed_share` | `handoff` |
| `knowledge_match` | `insight` |
| `task_claim`, `model_recipe`, `model_recommendation` | `coordination` |
| any with `content.priority === 'critical'` | `alert` (overrides the above) |

Bridged signal `metadata` preserves `{ subtype, senderId, tool, teamId, referenceId, routing, priority, protocolMessage }`.

---

## 4. Audit events (`/api/events`)

Source: `routes/events.ts`. Backed by a **separate `audit.db` SQLite database** in `dataDir` (WAL mode), table `audit_events`. Default retention **90 days** (cron cleanup). This is the full audit trail for tool calls, memory ops, workspace changes, approvals, and exports.

### `AuditEventType` (15 values)

`tool_call`, `tool_result`, `memory_write`, `memory_delete`, `workspace_create`, `workspace_update`, `workspace_delete`, `session_start`, `session_end`, `approval_requested`, `approval_granted`, `approval_denied`, `approval_auto`, `export`, `cron_trigger`, `data_erase_requested`.

### `AuditEvent` shape (camelCased in responses by `normalizeEvent`)

`id`, `timestamp` (ISO), `workspaceId`, `userId?`, `eventType`, `toolName?`, `input?` (parsed JSON), `output?` (parsed JSON), `model?`, `tokensUsed?`, `cost?`, `sessionId?`, `approved?` (boolean).

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/events` | Paginated, filterable listing. Query: `workspaceId`/`workspace`, `type`/`eventType`, `from`, `to`, `sessionId`, `limit` (default 100, max 1000), `offset`. Returns `{ events, total, limit, offset, hasMore, page, totalPages }`. |
| `GET` | `/api/events/stats` | Aggregates. Query: `workspaceId`/`workspace`, `days` (default 30, max 365). Returns `{ totalEvents, period:{days,since}, byType, byDay, topTools }`. |
| `GET` | `/api/events/stream` | **SSE.** Live audit events (see §1). |

---

## 5. Cron schedules (`/api/cron`)

Source: `routes/cron.ts`, backed by `server.cronStore` (Wave 1.1 Solo Cron Service). Execution runs through `server.scheduler.executeJob`.

### Schedule response shape (camelCased from DB snake_case)

`id` (number), `name`, `cronExpr`, `jobType` (`CronJobType`), `jobConfig` (object; corrupt rows degrade to `{}`), `workspaceId`, `enabled` (boolean), `lastRunAt`, `nextRunAt`, `createdAt`.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/cron` | Create. Body `{ name, cronExpr, jobType, jobConfig?, workspaceId?, enabled? }` (first three required). `workspaceId:'global'` is normalized to `'*'`. |
| `GET` | `/api/cron` | List all. Returns `{ schedules, count }`. |
| `GET` | `/api/cron/:id` | Get one. 404 if not found, 400 if id non-numeric. |
| `PATCH` | `/api/cron/:id` | Update. Body any of `{ name, cronExpr, jobConfig, workspaceId, enabled }`. |
| `DELETE` | `/api/cron/:id` | Delete. Returns `{ ok: true, id }`. |
| `POST` | `/api/cron/:id/trigger` | Manually run now. **Auto-enables a disabled job before executing.** Returns `{ triggered, id, nextRunAt, autoEnabled, schedule }` and emits a `cron`-category notification on success. |
| `GET` | `/api/cron/:id/history` | (registered in `notifications.ts`) Execution history. Query `limit` (default 20). Returns `{ history, count }`. 503 if unavailable. |

---

## 6. Notifications (`/api/notifications`)

Source: `routes/notifications.ts`. Two surfaces: the live SSE stream and a persisted-notification REST store (`cronStore` persists them so they survive restart).

### `NotificationEvent` shape

`type:'notification'`, `title`, `body`, `category` (`'cron' \| 'approval' \| 'task' \| 'message' \| 'agent'`), `timestamp` (ISO), `actionUrl?`.

The stream also relays two other event shapes:
- **`subagent_status`** — `{ type, workspaceId, agents:[{ id, name, role, status:'pending'|'running'|'done'|'failed', task, toolsUsed, startedAt?, completedAt? }], timestamp }`.
- **`workflow_suggestion`** — `{ type, workspaceId, pattern:{ name, description, steps, tools, category }, reason, timestamp }`.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/notifications/stream` | **SSE.** Live notifications + subagent status + workflow suggestions (see §1). |
| `GET` | `/api/notifications` | List persisted notifications. Query `since`, `limit` (default 50), `unread=true`. Returns `{ notifications, count, unread }`. |
| `POST` | `/api/notifications/:id/read` | Mark one read. Returns `{ read: true, id }`. |
| `GET` | `/api/notifications/history` | Alias of list with `limit` default 100. Returns `{ notifications, count, unread }`. |
| `PATCH` | `/api/notifications/:id/read` | Mark one read (PATCH variant). |
| `POST` | `/api/notifications/read-all` | Mark all read. Returns `{ markedRead: count }`. |

---

## 7. Offline mode (`/api/offline`)

Source: `routes/offline.ts`, backed by `server.offlineManager`. Queues user messages while the connection is down. If the manager is absent, status returns `{ offline:false, since:null, queuedMessages:0, lastCheck }` and queue ops return 503/empty.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/offline/status` | Current offline state `{ ...mgr.state, lastCheck }`. |
| `POST` | `/api/offline/queue` | Queue a message. Body `{ message, workspaceId?/workspace? }` (`message` required; workspace defaults `'default'`). Returns `{ queued }`. |
| `GET` | `/api/offline/queue` | List queued messages `{ messages }`. |
| `DELETE` | `/api/offline/queue/:id` | Remove one. 404 if not found. Returns `{ removed: true }`. |
| `DELETE` | `/api/offline/queue` | Clear all. Returns `{ cleared: <n> }`. |

---

## 8. Backup & restore (`/api/backup`, `/api/restore`)

Source: `routes/backup.ts`. Produces a single encrypted archive of the `~/.waggle/` data dir for machine migration. Format: gzipped JSON manifest, AES-256-GCM encrypted when a `.vault-key` exists, with magic header `WAGGLE-BACKUP-V1`. Extension `.waggle-backup`. **Max 500 MB**; excludes `node_modules`, `.git`, `models` (re-downloadable ONNX weights), and `marketplace.db*`.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/backup` | Build + stream the archive as `application/octet-stream` (`Content-Disposition: attachment; filename="waggle-backup-<date>.waggle-backup"`). Response headers `X-Waggle-Backup-Encrypted` and `X-Waggle-Backup-Files`. 413 if over 500 MB; 400 if no files. |
| `POST` | `/api/restore` | Restore from an archive. Body `{ backup: <base64>, preview? }`. `preview:true` returns `{ preview, backupCreatedAt, totalFiles, existingFiles, newFiles, conflicts }` without writing. Apply returns `{ restored, filesRestored, totalFiles, conflicts, errors?, backupCreatedAt }`. Path-traversal protected; `marketplace.db` is skipped (re-syncs on startup). |
| `GET` | `/api/backup/metadata` | Last backup info `{ lastBackupAt, sizeBytes, fileCount }`. 404 if none. |

---

## 9. Agent fleet (`/api/fleet`)

Source: `routes/fleet.ts`. Mission-Control surface over `server.sessionManager` workspace sessions. Spawning is free for all tiers (agents generate memory). `maxSessions` is tier-gated: FREE=3, PRO=10, TEAMS=25, ENTERPRISE/TRIAL=100.

### Session shape (in `GET /api/fleet`)

`workspaceId`, `workspaceName`, `personaId`, `model`, `status`, `lastActivity`, `durationMs`, `toolCount`, `tokensUsed`, `costEstimate`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/fleet` | List active workspace sessions. Returns `{ sessions, count, maxSessions }`. |
| `POST` | `/api/fleet/spawn` | Spawn a new agent session. Body `{ task, persona?, model?, parentWorkspaceId? }` (`task` required). Creates/uses the workspace session, emits `agent:spawned` then fire-and-forget runs the agent loop emitting `agent:started`/`tool:called`/`agent:completed`/`agent:error` signals. Returns `{ id, workspaceId, sessionId, status, startedAt, task, persona, model }`. 404 if workspace has no mind; 409 on spawn failure. |
| `POST` | `/api/fleet/:workspaceId/pause` | Pause a session. 404 if not found/already paused. |
| `POST` | `/api/fleet/:workspaceId/resume` | Resume a paused session. 404 if not found/not paused. |
| `POST` | `/api/fleet/:workspaceId/kill` | Abort + close a session. 404 if not found. |

---

## 10. LiteLLM control (`/api/litellm`)

Source: `routes/litellm.ts`. Manages the optional LiteLLM router process (lifecycle helpers `getLiteLLMStatus`/`startLiteLLM`/`stopLiteLLM`) and proxies its model list.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/litellm/status` | `{ running, port, error? }`. |
| `POST` | `/api/litellm/restart` | Stop then start. `{ running, port, error? }`. |
| `GET` | `/api/litellm/models` | Available model IDs from LiteLLM `{ models: string[] }` (empty array on failure). |
| `GET` | `/api/litellm/pricing` | Static per-model pricing array `[{ model, inputPer1k, outputPer1k, provider }]` (claude-sonnet/haiku/opus-4-6, gpt-5.4(+mini), gemini-3.1-pro/flash). |

---

## 11. Local inference (`/api/local-inference`)

Source: `routes/local-inference.ts`. Hardware detection + local model recommendations via the `llmfit` CLI (falls back to OS/RAM basics), plus Ollama/vLLM availability and model pulls. Ollama defaults to `http://localhost:11434`, vLLM to `http://localhost:8000` (overridable via `OLLAMA_HOST`/`VLLM_HOST`).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/local-inference/hardware` | Detect GPU/RAM/CPU. `{ hardware:<HardwareInfo>, source:'llmfit'|'basic', llmfitAvailable }`. |
| `GET` | `/api/local-inference/models` | Recommend models that fit. Query `useCase?`, `limit?` (default 20). `{ models:<ModelRecommendation[]>, source, totalScanned }`. |
| `GET` | `/api/local-inference/status` | Ollama/vLLM availability + installed models. `{ servers, primaryServer, ollamaInstalled, ollamaUrl, vllmUrl, totalLocalModels }`. |
| `POST` | `/api/local-inference/pull` | Pull a model via Ollama. Body `{ model }`. 502 if Ollama unreachable; up to 10-min timeout. |

`HardwareInfo` includes `totalRamGb, availableRamGb, cpuCores, cpuName, platform, hasGpu, gpuName, gpuVramGb, gpuCount, gpus[], backend`. `ModelRecommendation` includes `name, provider, parameterCount, paramsB, useCase, category, fitLevel, score, scoreComponents{quality,speed,fit,context}, estimatedTps, memoryRequiredGb, memoryAvailableGb, utilizationPct, bestQuant, runMode, runtime, contextLength, isMoe, notes[]`.

---

## 12. Anthropic proxy (`/v1/chat/completions`)

Source: `routes/anthropic-proxy.ts`. A built-in **OpenAI-compatible** proxy backed by the Anthropic Messages API — replaces LiteLLM when calling Anthropic models directly. The API key is read from the **vault** first (key `anthropic`), then `ANTHROPIC_API_KEY` env, then `config.json`. Applies Anthropic prompt caching (system + rolling last-3-message window).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/health/liveliness` | Always `{ status: 'healthy' }` (built-in, never down). |
| `POST` | `/v1/chat/completions` | OpenAI chat-completions body `{ model, messages, tools?, stream?, stream_options?, max_tokens?, temperature? }`. Translates to/from Anthropic. **SSE when `stream:true`** (OpenAI-format chunks, terminated by `data: [DONE]`); otherwise a single OpenAI `{ choices, usage, model }` JSON. 500 if no API key. |

Model names are normalized in `mapModel` (strips provider prefix, dots→dashes; Haiku 4.6 typos map to the valid Haiku 4.5 snapshot; Sonnet/Opus 4.6 pass through as floating aliases).

---

## 13. Filesystem browse (`/api/browse`)

Source: `routes/browse.ts`. System-level directory browsing (not workspace-scoped) for the Create-Workspace dialog. **Local-only** — both endpoints reject external origins with 403 via `isLocalRequest`. On Windows, abstract root `/` returns the full drive list.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/browse/local` | List directories. Query `path` (default `/`). Returns `{ entries:[{name,path,type:'directory'}], current }`. Skips hidden + non-dir entries. 403/404/400/403(EACCES). |
| `POST` | `/api/browse/local/mkdir` | Create a directory (recursive). Body `{ path }`. Returns 201 `{ name, path, type:'directory' }`. |

---

## 14. Browser extension health (`/api/browser-ext`)

Source: `routes/browser-ext.ts`. Single health check for the `apps/browser-ext` Chrome MV3 extension. Ingest/ask flows reuse `/api/memory/frames` and `/api/chat`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/browser-ext/health` | `{ ok: true, version: '0.1.0', activeWorkspace }` so the extension can show "saving to: &lt;workspace&gt;". |

---

## 15. Telegram outbound push (`/api/telegram`)

Source: `routes/telegram.ts`. One-way push from Waggle to a user's Telegram (no webhook receiver). Bot token + chat_id stored in the **vault** (`telegram_bot_token`, `telegram_chat_id`). URL is hard-coded to `api.telegram.org` (no SSRF). Text capped at 4096 chars. `pushTelegramMessage(server, text)` is the internal hook cron jobs call.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/telegram/status` | `{ configured, hasToken, hasChatId }`. |
| `POST` | `/api/telegram/config` | Save creds. Body `{ botToken?, chatId? }`. Validates `botToken` against `<id>:<secret>` pattern and `chatId` as a signed integer string; 400 on bad format. Returns `{ ok: true }`. |
| `POST` | `/api/telegram/test` | Send a "Waggle is connected" test message. 400 if not configured; 502 on Telegram error. Returns `{ ok, messageId }`. |
| `POST` | `/api/telegram/send` | Send arbitrary text. Body `{ text, parseMode? }` (`text` required, ≤4096). 400/502. Returns `{ ok, messageId }`. |

---

## 16. How it connects (data flow)

```mermaid
flowchart TD
  subgraph Agent["Agent runtime / chat loop / fleet spawn"]
    AL[runAgentLoop]
  end

  subgraph V2["WaggleDance v2 (protocol)"]
    POSTv2["POST /api/waggle-dance/signal"]
    DISP[WaggleDanceDispatcher]
    BUS[(SignalBus ring buffer 500)]
    GETv2["GET /api/waggle-dance/signals"]
    BRIDGE[installWaggleDanceBridge]
  end

  subgraph UI["WaggleDance UI stream (legacy)"]
    EMIT[emitWaggleSignal]
    STORE[(signals[] 500)]
    GETs["GET /api/waggle/signals"]
    SSEs["GET /api/waggle/stream (SSE)"]
  end

  subgraph Ops["Ops subsystems"]
    AUDIT[(audit.db SQLite)]
    SSEev["GET /api/events/stream (SSE)"]
    EB[(eventBus EventEmitter)]
    SSEnotif["GET /api/notifications/stream (SSE)"]
    CRON[cronStore + scheduler]
  end

  Frontend["Frontend (EventSource + fetch)"]

  AL -->|emitWaggleSignal| EMIT
  POSTv2 --> DISP --> BUS
  BUS --> GETv2
  BUS -->|subscribe| BRIDGE -->|waggle-dance:category| EMIT
  EMIT --> STORE --> GETs
  EMIT -->|EventEmitter signal| SSEs --> Frontend
  GETs --> Frontend
  GETv2 --> Frontend

  AL -->|emitAuditEvent| AUDIT
  AUDIT -->|eventBus audit_event| EB --> SSEev --> Frontend
  CRON -->|emitNotification| EB
  EB -->|notification / subagent_status / workflow_suggestion| SSEnotif --> Frontend
  CRON -->|saveNotification| AUDIT
```

**Key wiring facts:**
- Two parallel signal systems exist: the **legacy UI store** (`signals[]`, `EventEmitter`, `/api/waggle/*`) and the **v2 protocol bus** (`SignalBus`, `/api/waggle-dance/*`). The **bridge** is one-directional: v2 → legacy. The frontend only needs to read `/api/waggle/stream` to see both.
- `server.eventBus` (a Node `EventEmitter`, max 50 listeners) is the shared relay for audit, notification, subagent-status, and workflow-suggestion SSE.
- Persistence: audit events → `audit.db`; notifications + cron history → `cronStore`; v2 signals + UI signals are **in-memory only** (lost on sidecar restart).
