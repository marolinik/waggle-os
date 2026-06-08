# 07 — FRONTEND REBUILD GUIDE (Lovable)

> **What this is.** The action-oriented, build-in-order playbook for rebuilding the Waggle OS web UI
> in Lovable against the **existing, unchanged Fastify sidecar**. The backend is the contract; the
> frontend is replaceable. Everything below is grounded in the backend map sections (`02c`, `03a–03g`,
> `04`) and the live `apps/web/src/` source. Field names, paths, ports, and tokens are quoted verbatim.
>
> **Companion docs (read alongside):**
> - `sections/04-feature-map.md` — full app↔endpoint matrix (the canonical screen list).
> - `sections/02c-shared-types-tiers.md` — wire types, Zod request schemas, the 5-tier capability matrix.
> - `sections/03a-api-chat-agents.md` — chat SSE event catalogue + approvals.
> - `sections/03f-api-realtime-ops.md` — the 4 SSE streams + ops endpoints.
> - `sections/03g-api-cloud-billing-kvark.md` — auth handshake, guards, Stripe.

---

## 0. The 60-second mental model

Waggle's UI is **a single-page "desktop OS"**, not a multi-route app. React Router has exactly two routes
(`/` → `<Index>`, `*` → `<NotFound>`). `Index` shows a boot screen then mounts `<Desktop>`, which **is** the
shell: it owns a window manager, a Dock, draggable app windows, and overlays. Apps are opened by `appId`,
not by URL. Everything talks to the backend through **one singleton adapter** pointed at the local Fastify
sidecar.

```
Lovable App
 └─ ServiceProvider (calls adapter.connect() once, exposes useService())
     └─ Desktop shell
         ├─ Dock (tier-filtered app launcher)
         ├─ WindowManager (open/close/focus windows by appId)
         │    └─ AppWindow × N → renderAppContent(appId) → <XxxApp />
         └─ Overlays (modals, rails, wizards)
     ── all of the above import the SAME `adapter` singleton ──
         └─ adapter → http://127.0.0.1:3333 (Fastify sidecar)
```

Build the adapter + ServiceProvider + Desktop shell **first**. Everything else is screens that call adapter
methods.

---

## 1. API base URL, transport, auth, headers, tier pattern

### 1.1 Base URL

| Concern | Value / behavior |
|---|---|
| Default server | `http://127.0.0.1:3333` (constant `DEFAULT_SERVER`) |
| Override | `localStorage["waggle:server-url"]`, settable via `adapter.setServerUrl(url)` |
| Resolution order | `ctorArg ?? localStorage["waggle:server-url"] ?? DEFAULT_SERVER` |
| Prefix | **None.** Every route hardcodes its own full path (`/api/...`, `/health`, `/ws`, `/v1/...`). Do **not** add a base prefix. |
| Same-origin reality | In the desktop binary the SPA is served BY the sidecar, so the page origin IS the API root (`http://localhost:3333` or `tauri://localhost`). For a Lovable web rebuild, hit `http://127.0.0.1:3333` explicitly; expect CORS to be pre-allowlisted for `localhost:5173/8080/8081/8082/3333/1420` and `tauri://localhost`. |

### 1.2 Auth handshake (two-step, no login form)

There is **no username/password UI** for the local sidecar. Auth is a boot-generated session token:

1. **Static shell loads token-free** — non-API GETs are auth-exempt.
2. **Fetch token once on connect:** `GET /api/auth/session-token` → `{ token }`. This route is auth-exempt
   but **same-origin gated**. Store it as `authToken`.
3. **Send Bearer on everything else:** every `/api/*` request must carry
   `Authorization: Bearer <token>`. Missing → `401 MISSING_TOKEN`; wrong → `401 INVALID_TOKEN`.
4. **WebSocket** (optional) uses the token in the query string: `GET /ws?token=<authToken>` (not a header).
   Wrong token closes the socket with code `4001`.

```
connect():
  GET /health                      → probe (fallback to DEFAULT_SERVER once if stored URL fails; persist working URL)
  GET /api/auth/session-token      → { token }; this.authToken = token
  set _connected = true
```

### 1.3 The single `fetch` wrapper (reproduce exactly)

Every request goes through one `adapter.fetch(path, init)`. It MUST:

- Add `Content-Type: application/json` **only when a body is present** and no content-type was supplied.
  (Body-less POSTs must NOT send a JSON content-type — this is a deliberate fix; sending it breaks some routes.)
- Add `Authorization: Bearer <authToken>` when the token is set.
- On HTTP **403** with body `{ error: 'TIER_INSUFFICIENT' }`, dispatch a global DOM event
  `window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', { detail: { required, actual, message } }))`.
  This is the **only** trigger for the Upgrade modal.
- Use a timeout: **10s default, 30s for upload/ingest/harvest**. Throw `TimeoutError` / `NetworkError`.
- Handle rate limits: the sidecar enforces sliding-window limits (default **100/min**; `/api/chat` 120/min;
  `/api/vault/*/reveal` 5/min; `/api/backup` & `/api/restore` 2/min; `/api/browse/local/mkdir` 10/min).
  On `429`, read `Retry-After` and back off.

### 1.4 Read-side normalizers (reproduce or the UI crashes on `undefined`)

The backend and UI disagree on several field names. The adapter normalizes on read; you must too:

| Helper | Mapping |
|---|---|
| `unwrapArray<T>(data)` | accepts a raw array OR `{ results: [...] }` / `{ <key>: [...] }` envelope |
| `normalizeFrame(raw)` | frameType code `I/F/E/D/T/N` → `insight/fact/event/decision/task/entity`; `importance` string ↔ number 1–4 |
| `normalizeCronJob(raw)` | server `cronExpr/lastRunAt/nextRunAt` → client `schedule/lastRun/nextRun` |
| `getFleet()` | server `durationMs/tokensUsed` → client `duration/tokenUsage` |
| `getModelPricing()` | server `inputPer1k/outputPer1k` → client `inputCostPer1k/outputCostPer1k` |
| `getMemoryStats()` | server `frameCount/entityCount/relationCount` → client `frames/entities/relations`; tolerate `workspace:null` |
| `getModel()` | accepts raw `string` OR `{ model }` |

> **Tauri dual-path (skip for Lovable web).** A few memory methods (`addMemoryFrame`, `searchMemory`,
> `getKnowledgeGraph`, `getIdentity`) branch on `isTauri()` and use Rust IPC. A web rebuild always takes the
> `else` HTTP branch — ignore the IPC path entirely.

### 1.5 Tier gating pattern (read this before gating any feature)

- Fetch the user's tier from `GET /api/tier` → `{ tier, trialDaysRemaining?, trialExpired?, capabilities, usage }`.
- **Always run the stored tier through `getEffectiveTier(tier, trialStartedAt)` before reading
  capabilities** — an expired TRIAL must collapse to FREE gating. (`getEffectiveTier`, `getCapabilities`,
  `hasCapability` live in `@waggle/shared/tiers`; port them or reimplement.)
- Gate UI on `TierCapabilities` flags, not on the tier name. `-1` means **unlimited** (short-circuits to allowed).
- The **upgrade trigger is Skills + Connectors + Team features** — never agents/memory (`spawnAgents` is `true`
  in every tier; memory/embedding quotas are `-1` everywhere). The full matrix is in `02c §15.2`.
- Two distinct tier axes exist:
  - `BillingTier` = `'TRIAL'|'FREE'|'PRO'|'TEAMS'|'ENTERPRISE'` (entitlements).
  - `UserTier` = `'simple'|'professional'|'power'|'admin'` (UI density / dock complexity).
  - The Dock is computed from both via `getDockForTier(userTier, billingTier)`.

---

## 2. Real-time: which endpoints stream, and how to consume each

There are **five** streaming surfaces. Four are SSE (`EventSource`), one is the chat POST-SSE hybrid, plus an
optional WebSocket. **The chat stream is a POST, so you cannot use `EventSource` for it** — you parse the
response body manually.

### 2.1 Chat token stream — `POST /api/chat` (SSE-formatted body)

- **Not** a JSON endpoint and **not** `EventSource`-compatible (EventSource is GET-only). Issue a `fetch` POST,
  read `response.body.getReader()`, decode, and split on `\n\n`; each frame is `event: <name>\ndata: <json>`.
- All validation/auth happen **before** the server hijacks the reply. So a `400`/`403` comes back as normal
  JSON; anything after is SSE. Check `response.ok` / content-type before entering the stream loop.
- **Request body:** `{ message (required), workspace?/workspaceId?, model?, session?, persona?, autonomy?, shape? }`.
  `autonomy = { level: 'normal'|'trusted'|'yolo', expiresAt? }`.
- **Event catalogue** (handle ALL of these):

  | `event:` | `data` | Action |
  |---|---|---|
  | `token` | `{ content }` | append to streaming assistant text |
  | `step` | `{ content }` | render a progress line ("Recalling memories…", budget notes) |
  | `tool` | `{ name, input }` | show tool-call block (adapter normalizes name `tool`→`tool_start`) |
  | `tool_result` | `{ name, result, duration?, isError }` | close tool block (normalized `tool_result`→`tool_end`) |
  | `file_created` | `{ filePath, fileAction: 'write'|'edit'|'generate' }` | show "file created" affordance |
  | `approval_required` | `{ requestId, toolName, input, sourceWorkspaceId, ...trustMeta }` | **PAUSE.** Render approve/deny; resolve via `POST /api/approval/:requestId` |
  | `gepa_choices` | `{ original, expanded, clarifyingQuestions[], intent }` | offer ask-first clarification |
  | `model_switch` | `{ model, reason, primary }` | toast "switched to <model>" |
  | `notification` | `{ type:'workflow_captured', title, message, pattern }` | suggest saving a workflow |
  | `done` | `{ content, usage{inputTokens,outputTokens}, toolsUsed[], model, cost?, tokens? }` | **terminal success** |
  | `error` | `{ message }` | **terminal failure** (user-friendly only) |

  Tolerate two `done` usage shapes: agent-loop `{ inputTokens, outputTokens }` and echo/command-path
  `{ prompt_tokens, completion_tokens, total_tokens }`.

- **Approvals are blocking.** When `approval_required` arrives the agent is paused awaiting a server-side
  Promise (auto-denies after **5 min**). POST `{ approved: boolean, always?: boolean, reason?, sourceWorkspaceId }`
  to `/api/approval/:requestId`, echoing `sourceWorkspaceId` verbatim. `always:true` persists a grant.

### 2.2 The four GET SSE streams (`EventSource`)

| Endpoint | How to subscribe | Events you read |
|---|---|---|
| `GET /api/waggle/stream` | `new EventSource(url)` + `addEventListener('signal', …)` | `signal` → full `WaggleSignal` JSON. Initial `event: connected`. Heartbeat `: heartbeat` every 30s. |
| `GET /api/events/stream` | `addEventListener('audit', …)` | `audit` → full `AuditEvent` JSON. Initial `data:{"type":"connected"}`. |
| `GET /api/notifications/stream` | **mixed:** `onmessage` for unnamed frames + `addEventListener('subagent_status'|'workflow_suggestion', …)` | `notification` arrives as an **unnamed** `data:` frame (use `onmessage`); `subagent_status` and `workflow_suggestion` are **named** events. |
| `GET /api/harvest/progress` | `new EventSource(url)` | `{ phase, current, total, source }` progress frames. Adapter wraps as `{ ready: Promise, close }`. |

**EventSource caveat:** native `EventSource` cannot set an `Authorization` header. The sidecar gates these
streams by **same-origin** (the SPA is same-origin in production). For a cross-origin Lovable dev build you may
need to either (a) run behind a same-origin dev proxy to the sidecar, or (b) use a fetch-stream polyfill that
injects the Bearer header. The streams set `Access-Control-Allow-Origin` only for allowlisted origins.

### 2.3 WebSocket (optional) — `GET /ws?token=<authToken>`

Local sidecar `/ws` is an event-bus relay. Server→client frames `{ event, data }` for
`approval_required | step | tool | done | error | presence_update | notification`. Client→server
`{ type: 'approve'|'deny', requestId }`. The SSE streams already cover the UI's needs, so WS is **optional** for
the rebuild. (The cloud-server `/ws` is a separate Clerk+Redis team-chat gateway — not used by the local UI.)

### 2.4 Hook pattern for streams

Mirror the existing domain hooks: each owns local state + opens its stream on mount, returns close on unmount.

```ts
// useEvents → subscribeEvents (/api/events/stream)
// useNotifications → /api/notifications/stream (unread count, markRead, markAllRead)
// useRoomState → subscribeSubagentStatus (named 'subagent_status' on /api/notifications/stream)
// useWaggleDance → subscribeWaggleDance (/api/waggle/stream) + publish/ack
// useChat → POST /api/chat fetch-stream → parses into ContentBlock[]
```

---

## 3. Global state & providers the rebuild needs

**There is no Redux / Zustand / React Query.** State = React Context (one provider) + custom hooks + the
singleton adapter + a `window` CustomEvent bus. Reproduce these four layers.

### 3.1 The one provider

| Provider | Provides | Behavior |
|---|---|---|
| `ServiceProvider` / `useService()` | `{ adapter, connected, connecting, error, reconnect }` | calls `adapter.connect()` **once** on mount; wrap the whole app. (Plus shadcn `TooltipProvider` + a toast `Toaster`.) |

### 3.2 Domain hooks (the de-facto store)

Recreate these as the state layer — each wraps adapter calls + `useState`. The Desktop shell composes them.

| Hook | Owns |
|---|---|
| `useWorkspaces` | workspaces, **active workspace**, select/create/patch/delete/refresh — the workspace context every other call needs |
| `useChat` | `messages` (as `ContentBlock[]`), `isLoading`, `sendMessage`, `clearHistory`, `pendingApproval`, `approveAction`; parses the chat SSE stream |
| `useSessions` | per-workspace session CRUD (list/create/rename/delete/search/export) |
| `useMemory` | frames, stats, search, add/update/delete, `incrementFrameAccess` |
| `useKnowledgeGraph` | `{ nodes, edges }` |
| `useEvents` | audit steps + live SSE |
| `useNotifications` | notifications, `unreadCount`, markRead/markAllRead, live SSE |
| `useRoomState` | live sub-agent map (named `subagent_status` SSE) |
| `useWaggleDance` | signals, filter, ack, publish, live SSE |
| `useAgentStatus` | polls `/api/agent/status` |
| `useBilling` | **tier**, `startCheckout`, `openPortal`, `syncAfterCheckout` (auto-detects `?session_id=` on load) |
| `useFeatureGate` | `{ planTier, isEnabled, gate }` — the per-feature gate front-end |
| `useOnboarding` | persisted `OnboardingState` in `localStorage["waggle:onboarding"]` (`completed, step, tier, workspaceId, apiKeySet, templateId, personaId, tooltipsDismissed`); honors `?skipOnboarding=true`, `?forceWizard=true` |
| `useOfflineStatus` | polls `/health` for the offline pill |
| `useProviders` | `/api/providers` |
| `useWindowManager` | window open/close/focus/minimize + **per-window persona & autonomy** |
| `useOverlayState` | boolean flags for every overlay |
| `useKeyboardShortcuts` | global hotkeys → open app/overlay (Cmd+K global search, etc.) |

### 3.3 The four pieces of "global context" the rebuild must thread

1. **Workspace context** — `useWorkspaces.active`. Nearly every call accepts `workspace`/`workspaceId`
   (alias-accepted; omit ⇒ `personal` mind). The active workspace id flows into chat, memory, files, sessions,
   events. The window manager can override **persona** and **autonomy** per-window.
2. **Session** — the boot session token (`adapter.authToken`) for transport auth, plus the per-workspace
   chat session id (`useSessions`, defaults to the workspace id then `'default'`).
3. **Persona** — workspace-default persona, overridable per-chat-window. Passed as `persona` in the chat body.
4. **Tier** — `useBilling.tier` → `getEffectiveTier` → capabilities, consumed by `useFeatureGate`, the Dock, and
   the Upgrade/TrialExpired modals.

### 3.4 Cross-component `window` event bus (no library — wire these)

| Event | Dispatched by | Consumed by |
|---|---|---|
| `waggle:tier-insufficient` `{ required, actual, message }` | `adapter.fetch` on 403 `TIER_INSUFFICIENT` | `UpgradeModal` |
| `waggle:open-app` `{ appId, tab? }` | apps (e.g. `HarvestTab`) | `Desktop` → `wm.openApp(appId)` |

---

## 4. Screen-by-screen data contract

Each row = an OS app/overlay → the adapter methods/endpoints it calls → request/response summary. Paths are
verbatim and all `/api/*` are Bearer-gated. The `AppId` union (window content switch) is:
`chat, dashboard, memory, events, capabilities, connectors, cockpit, mission-control, settings, vault,
profile, terminal, calculator, notes, waggle-dance, files, agents, scheduled-jobs, marketplace, voice, room,
approvals, timeline, backup, telemetry, governance, launcher`.
(`terminal`/`calculator`/`notes` are declared but unimplemented; `voice` is a static "Coming Soon" placeholder.)

### 4.1 Dock apps

| Screen (appId) | Key endpoints | Request → Response summary |
|---|---|---|
| **Chat** (`chat`) | `POST /api/chat` (SSE); `GET /api/history?workspace=&session=`; `DELETE /api/chat/history?session=`; `POST /api/approval/:id`; `POST /api/feedback`; `GET /api/memory/search?q=&scope=`; pins `GET/POST/DELETE /api/workspaces/:id/pins`; `POST /api/ingest`; `GET/PUT /api/agent/model`; `GET /api/settings`; `GET /api/team/members`; `PATCH /api/workspaces/:id` | Send `{message,workspace,session?,persona?,autonomy?,shape}` → SSE stream (§2.1). History → `{ sessionId, messages[{id,role,content,timestamp}], count }`. Feedback `{sessionId,messageIndex,rating,reason?,detail?}` → fire-and-forget. Pin `{messageContent,messageRole,label?}`. Model PUT `{model}`. |
| **Dashboard / Home** (`dashboard`) | `GET /api/memory/stats`; `GET /api/tasks` (raw) | stats → `{ personal, workspace, total }` each `{frames,entities,relations}`. Tasks → task list. |
| **Memory** (`memory`) — tabs: Frames, Knowledge Graph, Harvest, Wiki, Evolution | frames `GET/POST/PUT/DELETE /api/memory/frames`, `PATCH …/:id/access?workspace=`; `GET /api/memory/search?q=&scope=`; `GET /api/memory/graph?workspace=` (or `?scope=all\|personal`); `GET /api/memory/stats`; **Harvest:** `GET /api/harvest/sources`, `POST /api/harvest/scan-claude-code`, `POST /api/harvest/preview`, `POST /api/harvest/commit`, `GET /api/harvest/runs/latest-interrupted`, `POST /api/harvest/runs/:id/abandon`, `POST /api/harvest/extract-identity`, `GET /api/harvest/progress` (SSE), `PATCH/DELETE /api/harvest/sources/:source`; **Wiki:** `GET /api/wiki/pages`, `…/:slug`, `…/:slug/content`, `POST /api/wiki/compile`, `GET /api/wiki/health`, `POST /api/wiki/export/{obsidian,notion}`; **Evolution:** `GET/POST /api/evolution/{runs,runs/:id,run,targets,baseline,status}` (raw); **Weaver:** `GET /api/weaver/status`, `POST /api/weaver/trigger` | Frame (normalized) `{id,content,source,frameType,importance,timestamp,score?,gop,accessCount,…}`. Graph → `{ nodes:KGNode[], edges:KGEdge[] }`. Harvest preview `{data,source}` → `{ knowledgeExtracted[] }`; commit `{data,source}` / `{resumeFromRun}`. Wiki compile `{ mode:'incremental'\|'full', concepts? }`. |
| **Events & Logs** (`events`) | `GET /api/events?workspaceId=`; `GET /api/events/stream` (SSE) | `AgentStep[]` + live `audit` events `{id,timestamp,workspaceId,eventType,toolName?,input?,output?,model?,cost?,…}`. |
| **Skills & Apps** (`capabilities`) incl. Marketplace tab | `GET /api/skills`; `POST /api/skills/create`; `GET /api/skills/starter-pack/catalog`; `POST /api/skills/starter-pack/:skillId`; `GET /api/skills/capability-packs/catalog`; `GET /api/marketplace/packs`; `POST /api/marketplace/install`; `GET /api/audit/installs` + `GET /api/skills/test` (raw) | Skills `SkillPack[]` (forced `installed:true`). Install `{packageId}` → raw `Response` (403 → UpgradeModal). Create `{name,description}`. |
| **Connectors** (`connectors`) | `GET /api/connectors`; `GET /api/connectors/:id/health`; `POST /api/connectors/:id/connect`; `POST /api/connectors/:id/disconnect`; `POST /api/vault` | `ConnectorDefinition[]` (card: `{id,name,description,service,authType,status,capabilities[],substrate,tools[],logoUrl?,category?,setupGuide?}`). Add secret `{name,value,type?}`. |
| **Cockpit / Command Center** (`cockpit`) incl. Compliance | `GET /health`; `GET /api/agent/cost`; `GET /api/connectors`; `GET /api/cron`; `GET /api/vault`; `GET /api/capabilities/status`; `GET /api/audit/installs`; `GET /api/cost/summary`; `GET /api/weaver/status`; `GET /api/events/stats`; **Compliance:** `GET /api/compliance/status?workspaceId=`, `GET /api/compliance/templates`, `POST/PATCH/DELETE /api/compliance/templates*`, `POST /api/compliance/export`, `POST /api/compliance/export-pdf` (Blob) | health `{status,uptime,services[]}`; cost summary; event stats `{totalEvents,period,byType,byDay,topTools}`. |
| **Mission Control** (`mission-control`) | `GET /api/fleet`; `GET /api/team/members`; `GET /api/team/activity`; `GET /api/tools/detect`; `POST /api/fleet/:workspaceId/(pause\|resume\|kill)` | Fleet (normalized) `{workspaceId,workspaceName,personaId,model,status,lastActivity,duration,toolCount,tokenUsage,costEstimate}` + `{count,maxSessions}`. |
| **Waggle Dance** (`waggle-dance`) | `GET /api/waggle/signals`; `GET /api/waggle/stream` (SSE); `POST /api/waggle/signals`; `PATCH /api/waggle/signals/:id/ack` | `WaggleSignal{id,type,workspaceId,content,metadata?,timestamp,acknowledged}`. Publish `{type,content,workspaceId?,metadata?}`. |
| **Personas (Agents)** (`agents`) | `GET /api/personas`; `POST /api/personas`; `PATCH/DELETE /api/personas/:id`; `POST /api/personas/generate`; `GET /api/capabilities/status`; `GET /api/agent-groups`; `POST /api/agent-groups`; `PATCH/DELETE /api/agent-groups/:id`; `POST /api/agent-groups/:id/run`; `GET /api/jobs/:jobId`; `POST /api/jobs/:jobId/cancel` | Persona create `{name,description,icon?,systemPrompt,tools?}`. Generate `{prompt}` → `{name,description,systemPrompt,tools[]}`. Group create `{name,description?,strategy:'parallel'\|'sequential'\|'coordinator',members[{agentId,roleInGroup:'lead'\|'worker',executionOrder}]}`. Group run `{task,teamId?}` → queued stub. |
| **Files** (`files`) | `GET /api/workspaces/:id/files/list?path=`; `POST …/files/upload` (FormData, 30s); `GET …/files/download?path=` (Blob); `POST …/files/{mkdir,delete,move,copy}`; `GET …/documents`; `GET …/documents/:name/versions` | `FileEntry[]`. Move/copy `{from,to}`; delete/mkdir `{path}`. Upload `FormData(file,path)`. |
| **Scheduled Jobs** (`scheduled-jobs`) | `GET /api/cron`; `POST /api/cron`; `PUT /api/cron/:id`; `DELETE /api/cron/:id`; `POST /api/cron/:id/trigger` | CronJob (normalized) `{id,name,schedule,jobType,jobConfig,workspaceId,enabled,lastRun,nextRun,createdAt}`. Create `{name,cronExpr,jobType,jobConfig?,workspaceId?,enabled?}`. Trigger → `{triggered,autoEnabled?,schedule?}`. |
| **Marketplace** (`marketplace`) | `GET /api/marketplace/search?query=&limit=`; `GET /api/marketplace/installed`; `POST /api/marketplace/install`; `POST /api/marketplace/uninstall` | search/install/uninstall return **raw `Response`** for 403-aware handling. |
| **AI Tools / Launcher** (`launcher`) | `GET /api/tools/detect`; `POST /api/tools/launch`; `GET /api/tools/processes`; `POST /api/tools/kill`; `POST /api/tools/hooks` | detect → `{platform,detectedAt,tools[{id,displayName,installed,installedPath,version,hooksInstalled,…}]}`. Launch `{id,installedPath,workspaceId?,args?,cwd?}` → `{ok,pid,error?}`. Hooks `{id,action:'install'\|'verify'\|'uninstall',cliPath?}`. |
| **Room** (`room`) | `GET /api/notifications/stream` named `subagent_status` (SSE) | live sub-agent canvas `{agents[{id,name,role,status:'pending'\|'running'\|'done'\|'failed',task,toolsUsed,…}]}`. |
| **Approvals** (`approvals`, TEAMS+) | `GET /api/approval/pending`; `GET /api/approval/grants`; `POST /api/approval/:id`; `DELETE /api/approval/grants/:id`; `POST /api/approval/grants/clear` | pending `{pending[{requestId,toolName,input,timestamp}],count}`. |
| **Timeline** (`timeline`) | `GET /api/events?workspaceId=&limit=&from=` | `TimelineEvent[]`. |
| **Backup & Restore** (`backup`) | `GET /api/backup/metadata`; `POST /api/backup`; `POST /api/restore` (all raw) | backup streams `application/octet-stream` (`.waggle-backup`, ≤500MB). Restore `{ backup:<base64>, preview? }`. |
| **Usage & Telemetry** (`telemetry`) | `GET /api/cost/by-workspace`; `GET /api/events/stats` (raw) | cost-by-workspace + stats aggregates. |
| **Team Governance** (`governance`, TEAMS+) | none direct (props-driven sub-components) | renders governance UI. |
| **Settings** (`settings`) | `GET/PUT /api/settings`; `GET/PUT /api/settings/permissions`; `POST /api/settings/test-key`; `GET /api/providers`; `GET /api/telemetry/status`; `POST /api/telemetry/toggle`; `DELETE /api/telemetry/events`; `GET /api/team/status`; `POST /api/team/{connect,disconnect}`; `GET /api/export`, `/api/debug/logs` (raw) | Settings object; permissions `{defaultAutonomy,externalGates[],workspaceOverrides}`. Test key `{provider,apiKey}` → `{valid}`. |
| **Vault** (`vault`) | `GET /api/vault`; `POST /api/vault`; `DELETE /api/vault/:id`; `GET /api/connectors`; `POST /api/connectors/:id/(connect\|disconnect)` | secret `{name,value,type?}`. Vault reveal is rate-limited to 5/min. |
| **My Profile** (`profile`) | `GET/PUT /api/profile`; `POST /api/profile/analyze-style` `{text}`; `POST /api/profile/analyze-brand` `{description}`; `POST /api/profile/research` `{}` | profile object + analysis results. |

### 4.2 Overlays (rendered by Desktop, not windowed)

| Overlay | Key endpoints |
|---|---|
| **Onboarding wizard** (8 steps: Welcome, WhyWaggle, Tier, ModelTier, Import, Template, Persona, ApiKey, Ready) | `connect`, `GET /api/vault`, `/health`, `GET /api/providers`, `/api/v1/models`, harvest preview/commit, `POST /api/harvest/scan-claude-code`, import preview/commit, `POST /api/personas`, `POST /api/vault`, `POST /api/workspaces`, `PUT /api/settings` |
| **Login briefing** (session-start digest) | `GET /api/identity`, `GET /api/workspaces`, `GET /api/memory/search`, `GET /api/memory/stats`, `GET /api/workspaces/:id/context` |
| **Global search (Cmd+K)** | `GET /api/workspaces`, sessions, `GET /api/skills`, `GET /api/memory/search` |
| **Create workspace dialog** | `GET /api/browse/local?path=`, `POST /api/browse/local/mkdir`, `GET/POST/PUT/DELETE /api/workspace-templates*`, `POST /api/workspace-templates/generate`, `GET /api/connectors`, `GET /api/agent-groups` |
| **Persona switcher** | `GET /api/personas`, `GET /api/agent-groups` |
| **Spawn agent dialog** | `GET /api/litellm/models`, `/api/litellm/pricing`, `GET /api/providers`, `GET /api/agent/model`, `POST /api/workspaces`, `POST /api/fleet/spawn` (`{task,persona?,model?,parentWorkspaceId?}`) |
| **Erase data dialog (GDPR)** | `POST /api/data/erase` — header `X-Confirm-Erase: yes` + body `{ confirmation:'I UNDERSTAND THIS IS PERMANENT' }` |
| **Upgrade modal** | triggered by `waggle:tier-insufficient`; actions → `POST /api/tier/start-trial`, `POST /api/stripe/create-checkout-session` `{tier:'PRO'\|'TEAMS', billingPeriod?}` → `{url}` |
| **Trial expired modal** | `POST /api/stripe/create-checkout-session` |
| Workspace switcher / Notification inbox / Context rail / Keyboard help / Tooltips | props-driven or `lib/context-rail-fetch.ts`; no/minor direct calls |

### 4.3 Billing / tier endpoints (used across overlays + `useBilling`)

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/tier` | → `{ tier, trialDaysRemaining?, trialExpired?, capabilities, usage }` |
| POST | `/api/tier/start-trial` | → `{ tier, rawTier, trialStartedAt, trialDaysRemaining, trialExpired, capabilities }` (409 if already started) |
| POST | `/api/stripe/create-checkout-session` | `{ tier:'PRO'\|'TEAMS', billingPeriod?:'monthly'\|'annual' }` → `{ url }` (503 `STRIPE_NOT_CONFIGURED` if unset) |
| POST | `/api/stripe/sync` | `{ sessionId }` → `{ tier, customerId }` — **call this after the checkout redirect** (webhooks unreliable behind NAT) |
| POST | `/api/stripe/create-portal-session` | — → `{ url }` (requires PRO+) |

**Stripe flow for the rebuild:** open `{url}` from create-checkout-session → user pays → Stripe redirects to
`/payment-success?session_id=...` → `useBilling` detects `?session_id=` on load → `POST /api/stripe/sync` →
refresh tier. Render upgrade UI defensively when `503 STRIPE_NOT_CONFIGURED`.

---

## 5. Design system — Hive DS (dark default, desktop-OS metaphor)

The visual contract lives in `apps/web/src/index.css` (`@layer base` source of truth) + `waggle-theme.css`
(component aliases). It's a **shadcn-style HSL-variable system + a literal Hive palette**, with a `[data-theme="light"]`
override. **Default theme is dark.** Tailwind 4 + shadcn primitives + lucide icons.

### 5.1 Core brand tokens (the three the brief names)

| Token | Dark value | Role |
|---|---|---|
| Honey `--honey-500` | `#e5a000` | Primary brand / accent / focus ring / `--primary` (`40 100% 45%`) |
| Hive-950 `--hive-950` | `#08090c` | Deepest background / status bar; `--background` ≈ `222 20% 4%` |
| Accent (AI) `--status-ai` / `--accent` | `#a78bfa` / `270 60% 68%` | Secondary accent (AI, knowledge-concept highlights) |

### 5.2 Full palette (use the CSS variables, never hard-code hex)

- **Hive grays** (cold undertone): `--hive-950 #08090c → --hive-50 #f0f2f7` (12 steps). Surfaces:
  `--surface-card: var(--hive-850)`, `--surface-panel: var(--hive-800)`, `--surface-overlay: rgba(8,9,12,0.88)`.
- **Honey scale:** `--honey-600 #b87a00 … --honey-50 #fffbeb`, plus `--honey-glow rgba(229,160,0,0.12)`,
  `--honey-pulse rgba(229,160,0,0.06)`.
- **Status:** `--status-healthy #34d399`, `--status-warning #fbbf24`, `--status-error #f87171`,
  `--status-info #60a5fa`, `--status-ai #a78bfa`.
- **Knowledge-graph nodes:** `--kg-person #4A90D9`, `--kg-project #50C878`, `--kg-concept #9B59B6`,
  `--kg-org #E67E22`, `--kg-default #95A5A6`.
- **shadcn semantic vars** (HSL triplets, consumed via `hsl(var(--x))`): `--background, --foreground, --card,
  --popover, --primary (40 100% 45%), --secondary, --muted, --accent (270 60% 68%), --destructive, --border,
  --input, --ring (40 100% 45%), --radius 0.75rem`. Sidebar + chart vars mirror these.
- **Step/event colors** (event stream): `--step-running/-success/-pending/-error/-thinking/-search/-web/-tool/-writing`.

### 5.3 Typography, radius, shadows, motion

- **Fonts:** headings `Space Grotesk`; body `DM Sans` (fallback Inter/system); mono `JetBrains Mono`. Imported
  from Google Fonts in `index.css`. `--font-sans`, `--font-mono` aliases exist.
- **Type scale:** `--text-micro 11 → --text-display 24` (micro 11, caption 12, body-sm 13, body 14, title 16,
  heading 20, display 24).
- **Radius:** `--radius: 0.75rem`.
- **Shadows:** `--shadow-card`, `--shadow-elevated`, `--shadow-overlay`, `--shadow-honey` (honey glow),
  `--shadow-focus` (2px honey ring).
- **Signature motifs:** glassmorphism (`.glass` / `.glass-strong` — backdrop blur 20–30px), honeycomb hex
  background (`.honeycomb-bg`, SVG data-URI at 3% honey opacity), hex avatar clip-path (`.hex-avatar`),
  hex streaming cursor (`.hex-cursor`), honey-pulse on memory-save, heartbeat on health dot, float on the bee
  mascot, token-fade on streamed text. Selection + thin 5px scrollbars are honey/hive themed.
- **Interaction utilities:** `.waggle-interactive`, `.waggle-card-lift`, `.waggle-nav-hover`, `.waggle-press`,
  `.direction-d-card` (the canonical card: hive-700 border → honey-500 + honey-shadow on hover).

### 5.4 Light mode

`:root[data-theme="light"]` flips the hive scale (cream `#fdfcf9` bg, dark text), darkens honey + status +
KG colors for WCAG AA on cream, and softens shadows. Toggle by setting `data-theme="light"` on `:root`.
**Ship dark first**; light is a polish pass.

### 5.5 Layout — the desktop OS metaphor

- **Desktop**: full-viewport, `overflow:hidden` body, honeycomb wallpaper + `.desktop-overlay` wash.
- **Dock**: launcher rail (bottom/side) built from `lib/dock-tiers.ts`. Entries are `app | zone-parent
  (collapsible group) | separator`, each with `icon` (lucide), `label`, `color`. `getDockForTier(userTier,
  billingTier)` filters by `minBillingTier` (e.g. `governance` & `approvals` are TEAMS+; empty zone-parents are
  dropped). `simple` tier shows ~6 apps; `power`/`admin` show the full set incl. Ops + Extend zone groups.
- **Windows**: each open app is a draggable/resizable `AppWindow` keyed by `appId`; content via a
  `renderAppContent(appId)` switch. Windows carry per-window persona + autonomy.
- **Overlays**: modals/rails/wizards rendered directly by Desktop, gated by `useOverlayState` flags.
- **BootScreen**: shown until `localStorage["waggle-booted"]`, then Desktop mounts.

---

## 6. Prioritized rebuild order

Build in dependency order. Each phase is independently demoable.

**Phase 0 — Foundation (nothing renders without this).**
1. `adapter` singleton: base URL + `localStorage["waggle:server-url"]`, `connect()` (health probe + session-token
   bootstrap), the `fetch` wrapper (conditional content-type, Bearer, 403→`waggle:tier-insufficient`,
   10s/30s timeouts, 429 handling), and the §1.4 read normalizers.
2. `ServiceProvider` / `useService()` calling `adapter.connect()` once.
3. Hive DS tokens (`index.css` + `waggle-theme.css`), dark default, fonts, shadcn vars.
4. The `window` event bus (§3.4).

**Phase 1 — Shell.**
5. Desktop shell: `useWindowManager` (open by `appId`), Dock from `dock-tiers.ts`, `AppWindow` + `renderAppContent`
   switch, BootScreen, `useOverlayState`, `useKeyboardShortcuts` (Cmd+K).
6. `useWorkspaces` (active workspace context) + Workspace switcher + Create-workspace dialog.
7. `useBilling` + tier gating (`getEffectiveTier` → capabilities → `useFeatureGate`) + Upgrade/TrialExpired modals.

**Phase 2 — The product's core loop (Chat).**
8. **Chat** (`chat`) end-to-end: `POST /api/chat` fetch-stream parser → `ContentBlock[]`, all SSE events,
   inline approvals (`POST /api/approval/:id`), history, model switch, pins, feedback. This is the single
   highest-value screen — do it first and well.
9. **Dashboard / Home** (`dashboard`) — cheap, gives a landing surface (`/api/memory/stats`, `/api/tasks`).

**Phase 3 — Memory moat (the strategic lock-in).**
10. **Memory** (`memory`): Frames + Knowledge Graph tabs first, then **Harvest** (import is the moat: scan +
    preview/commit + progress SSE), then Wiki, then Evolution.
11. **Files** (`files`) — workspace file CRUD + upload/download.

**Phase 4 — Real-time ops + agents.**
12. **Events** (`events`, SSE), **Room** (`room`, `subagent_status` SSE), **Waggle Dance** (`waggle-dance`, SSE).
13. **Personas/Agents** (`agents`) + Spawn agent dialog + Mission Control (`mission-control`, fleet).
14. **Scheduled Jobs** (`scheduled-jobs`), **Notifications** inbox.

**Phase 5 — Extensibility + monetization surfaces.**
15. **Skills & Apps** (`capabilities`) + **Marketplace** (`marketplace`) + **Connectors** (`connectors`) +
    **Vault** (`vault`) — these are the upgrade triggers; wire 403→Upgrade carefully.
16. **Settings** (`settings`), **My Profile** (`profile`), **Cockpit** (`cockpit`) + Compliance.

**Phase 6 — Governance / admin / polish.**
17. **Approvals** (`approvals`, TEAMS+), **Team Governance** (`governance`, TEAMS+), **Timeline** (`timeline`),
    **Telemetry** (`telemetry`), **Backup** (`backup`), **Erase data** (GDPR).
18. **Onboarding wizard** (8 steps) + Login briefing + Global search polish.
19. **Light mode** pass.

**Rationale:** Phases 0–1 are non-negotiable scaffolding. Chat (Phase 2) is the product. Memory/Harvest (Phase 3)
is the strategic moat ("free forever" lock-in). Real-time + agents (Phase 4) prove the "OS" thesis.
Monetization surfaces (Phase 5) are where tier gating earns money. Governance + polish (Phase 6) come last.

---

## 7. Gotchas checklist (the things that bite a rebuild)

- [ ] Chat is **POST-SSE**, not `EventSource` — parse the body stream manually.
- [ ] Body-less POSTs must **not** send `Content-Type: application/json`.
- [ ] `EventSource` can't send Bearer headers — the SSE streams are **same-origin gated**; proxy or polyfill in dev.
- [ ] Run tier through **`getEffectiveTier`** before gating (expired TRIAL → FREE).
- [ ] `-1` in any capability/limit means **unlimited**, not "zero/disabled".
- [ ] Reproduce the §1.4 read normalizers or the UI breaks on renamed fields.
- [ ] Echo back `sourceWorkspaceId` verbatim when resolving approvals.
- [ ] After Stripe redirect, call `POST /api/stripe/sync { sessionId }` — do not trust the webhook for desktop.
- [ ] Handle two `done` usage shapes (agent-loop vs echo/command path).
- [ ] `/api/notifications/stream`: `notification` is an **unnamed** frame (`onmessage`); the others are named events.
- [ ] All `/api/*` paths are **flat** — no plugin prefix; the literal path in the table IS the path.
- [ ] Respect rate limits (chat 120/min, vault reveal 5/min, backup/restore 2/min) — handle `429` + `Retry-After`.
