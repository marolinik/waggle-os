# 03a · Chat / Agent-Execution / Session API

## Purpose

This is the contract for the **conversational core** of Waggle OS: how the frontend submits a chat turn, how tokens and tool events stream back over Server-Sent Events (SSE), how tool-execution approvals are negotiated mid-stream, how sessions are created/listed/renamed/deleted/exported, and how slash commands are run. Every endpoint here lives in the **local Fastify sidecar** (`packages/server/src/local/routes/`), mounted at base path `/api`. If you are rebuilding the frontend, this file is your source of truth for these flows — the names, paths, and JSON shapes below are quoted verbatim from the code.

> **Two distinct execution paths.** `POST /api/chat` (conversational, multi-turn message history, `runAgentLoop`) is the one the chat UI uses. `POST /api/agent/run` (one-shot structured retrieval, shape-driven, `runRetrievalAgentLoop`) is a separate research path backing a Tauri `run_agent_query` command. Both stream SSE but with **different event names**. Do not conflate them.

---

## 1. The chat turn — `POST /api/chat` (SSE)

**File:** `packages/server/src/local/routes/chat.ts` (1708 LOC — the largest route in the codebase).

This is **not** a JSON request/response endpoint. The server validates the body, then calls `reply.hijack()` and writes a raw `text/event-stream`. **All validation and auth happen BEFORE the hijack** — once hijacked, `reply.status()` is a silent no-op, so any 400/403 you get back is a normal JSON error; anything after that is SSE.

### Request body

| Field | Type | Required | Notes |
|---|---|---|---|
| `message` | `string` | **yes** | The user's turn. Max length `WAGGLE_MAX_MESSAGE_LENGTH` env (default **50000** chars) → else `400 MESSAGE_TOO_LONG`. |
| `workspace` | `string` | no | Workspace ID. `workspaceId` is accepted as a synonym (P0-4 backwards-compat). Defaults to `'default'`. |
| `workspaceId` | `string` | no | Alias for `workspace`. |
| `model` | `string` | no | Model override. Falls back to workspace model → config default → `'claude-sonnet-4-6'`. |
| `session` | `string` | no | Session ID. Defaults to `workspace`, else `'default'`. Determines the `.jsonl` file written. |
| `workspacePath` | `string` | no | Explicit working dir. Path-traversal guarded: must resolve inside `dataDir`, else `400 PATH_TRAVERSAL`. |
| `persona` | `string` | no | Per-window persona override (takes precedence over workspace default for THIS request only). |
| `autonomy` | `{ level: 'normal' \| 'trusted' \| 'yolo', expiresAt?: number }` | no | Relaxes the tool-confirmation gate. Expired (`expiresAt < Date.now()`) falls back to `'normal'`. |

### Pre-stream rejections (regular JSON, HTTP error codes)

| Condition | Status | Body |
|---|---|---|
| Missing `message` | 400 | `{ error: 'message is required' }` |
| Message too long | 400 | `{ error: 'Message too long (...)', code: 'MESSAGE_TOO_LONG' }` |
| Injection score ≥ 0.7 | 400 | `{ error: 'Message blocked by security scanner', code: 'INJECTION_DETECTED' }` (flags NOT leaked) |
| Viewer in team workspace | 403 | `{ error: 'Viewers cannot send messages...', code: 'VIEWER_READ_ONLY' }` |
| `workspacePath` escapes dataDir | 400 | `{ error: 'Invalid workspace path', code: 'PATH_TRAVERSAL' }` |
| Unsafe `workspace`/`session` segment | 400 | thrown by `assertSafeSegment` → Fastify default `{ statusCode: 400 }` |

### SSE response headers

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
X-Accel-Buffering: no
Access-Control-Allow-Origin: <validated origin>
```

Each event is written as `event: <name>\ndata: <json>\n\n`.

### SSE event catalogue (`/api/chat`)

These are the exact event names emitted via `sendEvent(event, data)`. The frontend MUST handle all of them.

| `event:` | `data` shape | Meaning |
|---|---|---|
| `token` | `{ content: string }` | One streamed chunk of the assistant's text. Concatenate in order. |
| `step` | `{ content: string }` | Human-readable progress line ("Recalling relevant memories...", "✔ tool approved", budget/compression notices, model-switch notes). |
| `tool` | `{ name: string, input: object }` | Agent is invoking a tool. Pair with the `step` line from `describeToolUse`. |
| `tool_result` | `{ name, result: string, duration?: number, isError: boolean }` | Tool finished. `isError` true when result starts with `Error:`/`Error `. |
| `file_created` | `{ filePath: string, fileAction: 'write' \| 'edit' \| 'generate' }` | Emitted after `write_file` / `edit_file` / `generate_docx` succeed. |
| `approval_required` | `{ requestId, toolName, input, sourceWorkspaceId, ...trustMeta }` | **Blocking.** Agent is paused; client must POST to `/api/approval/:requestId` (see §4). For `install_capability`, `trustMeta` adds `riskLevel`, `approvalClass`, `trustSource`, `assessmentMode`, `explanation`, `permissions`. |
| `gepa_choices` | `{ original, expanded, clarifyingQuestions: string[], intent }` | GEPA optimizer expanded a vague first message; offers ask-first clarification choices. |
| `model_switch` | `{ model, reason, primary }` | Active model changed mid-turn (budget cap, retry/fallback, credential exhaustion). |
| `notification` | `{ type: 'workflow_captured', title, message, pattern }` | Auto-skill capture suggested a repeatable workflow. |
| `done` | see below | **Terminal success.** Full final content + usage + cost. |
| `error` | `{ message: string }` | **Terminal failure.** User-friendly message only (raw traces/context never leaked). |

`done` data:

```jsonc
{
  "content": "<final assistant text, may include appended disclaimers/notes>",
  "usage": { "inputTokens": 0, "outputTokens": 0 },   // AgentResponse.usage
  "toolsUsed": ["save_memory", "..."],
  "model": "claude-sonnet-4-6",
  "cost": 0.001234,                                    // present only when usage known; rounded to 1e-6
  "tokens": { "input": 0, "output": 0 }                // present only when cost present
}
```

> Note: in echo mode and command-only paths, `done` carries `usage: { prompt_tokens, completion_tokens, total_tokens }` (all 0) and `toolsUsed: []` — a **different usage shape** than the agent-loop `done` (`inputTokens`/`outputTokens`). The frontend should tolerate both.

### What happens inside one chat turn (server-side, in order)

1. Validate body, scan for injection, RBAC + path guards (all pre-hijack).
2. `reply.hijack()`, write SSE headers, wire `AbortController` to client disconnect (`request.raw.on('close')`).
3. Resolve model with fallback chain: explicit → workspace → config default → `claude-sonnet-4-6`; apply budget-model and smart-routing (`routeMessage`) overrides.
4. Load/create session history (RAM cache `sessionHistories`, else `loadSessionMessages` from disk); push user message; `persistMessage` to `.jsonl`.
5. Create a per-session `Orchestrator` scoped to the workspace mind (`sessionManager.getOrCreate`), else fall back to the shared singleton.
6. Probe LiteLLM availability → choose **agent-loop**, **echo mode**, or **slash-command** path.
7. **Slash command?** → run via `commandRegistry.execute` (works even in echo mode). Result either streams as `token`s + `done`, or — if prefixed `AGENT_LOOP_REROUTE::` — falls through to the agent loop with a rewritten message.
8. Agent-loop path: auto-recall memory (`auto_recall` tool events), GEPA expand (first message only), ambiguity guard, build system prompt (persona + profile + skills + workspace-now + behavioral spec), filter tools by persona/availability, register the `pre:tool` confirmation hook, compress context, then call `runAgentLoop` with `stream: true` and `onToken`/`onToolUse`/`onToolResult` callbacks that emit the SSE events above.
9. Credential-pool key rotation + model fallback on retryable errors.
10. Post-processing: cost tracking, trace finalize, auto-save memory, skill distillation, KG entity extraction, correction detection, regulated-persona disclaimers, grounding hedge notes.
11. Push assistant message to history, `persistMessage`, emit `done`.
12. `finally`: unregister the `pre:tool` hook, finalize any pending trace as `abandoned`, `raw.end()`.

### `DELETE /api/chat/history`

Clears a session's in-RAM state. Querystring `?session=<id>` (default `'default'`). Evicts the session from `sessionHistories`, `systemPromptCache`, `compressionSummaries`, and `sessionToolSequences`. Returns `{ ok: true, cleared: <sessionId> }`. **Does not delete the on-disk `.jsonl`** — use `DELETE /api/sessions/:sessionId` for that.

---

## 2. Conversation history — `GET /api/history`

**File:** `agent.ts`. Loads a session's messages, RAM-first then disk (`dataDir/workspaces/<workspace>/sessions/<session>.jsonl`).

Querystring: `session?` (defaults to `workspace` then `'default'`), `workspace?` (default `'default'`).

Response:

```jsonc
{
  "sessionId": "default",
  "messages": [
    { "id": "hist-0", "role": "user", "content": "...", "timestamp": "ISO-8601" }
  ],
  "count": 1
}
```

---

## 3. Agent status / cost / model — `agent.ts`

| Method | Path | Purpose | Response |
|---|---|---|---|
| GET | `/api/agent/status` | Agent + cost snapshot | `{ running: true, model, tokensUsed, estimatedCost, turns, usage }` |
| GET | `/api/agent/cost` | Detailed cost breakdown | `{ summary: <formatted string>, ...stats }` |
| POST | `/api/agent/cost/reset` | (No-op) cost reset | `{ ok: true, message: 'Cost tracking resets on server restart' }` |
| GET | `/api/agent/model` | Current model | `{ model }` |
| PUT | `/api/agent/model` | Switch model | body `{ model }` → `{ ok: true, model }`; missing model → `400 { error }` |
| GET | `/api/agents/active` | Sub-agent orchestrator state | `{ workers: [...], active: [...] }` (empty arrays when no workflow running) |

---

## 4. Tool-execution approvals — `approval.ts`

When the agent wants to run a gated tool, the chat SSE stream emits `approval_required` and **pauses** (awaiting a `Promise` registered in `pendingApprovals`). The frontend resolves it via a separate HTTP call. Auto-denies after **5 minutes** (fail-safe).

| Method | Path | Body / Params | Purpose |
|---|---|---|---|
| POST | `/api/approval/:requestId` | `{ approved: boolean, always?: boolean, reason?: string, sourceWorkspaceId?: string\|null }` | Approve/deny the paused tool. `always: true` persists a grant so future identical (tool + target) calls auto-pass. `404` if no such pending request. Returns `{ ok: true, requestId, approved, always }`. |
| GET | `/api/approval/pending` | — | List paused approvals (for reconnect/recovery): `{ pending: [{ requestId, toolName, input, timestamp }], count }`. |
| GET | `/api/approval/grants` | — | List persistent "always allow" grants: `{ grants, count }`. |
| DELETE | `/api/approval/grants/:id` | — | Revoke one grant. `404` if not found. |
| POST | `/api/approval/grants/clear` | — | Wipe all grants. `{ ok: true }`. |

> The `requestId` you POST back is the exact `requestId` from the `approval_required` SSE event. Echo `sourceWorkspaceId` back verbatim so the grant is scoped correctly.

---

## 5. Slash commands — `commands.ts` + `command-registry.ts`

| Method | Path | Body | Purpose |
|---|---|---|---|
| POST | `/api/commands/execute` | `{ command: string, workspaceId?: string }` | Run a slash command out-of-band (not through chat SSE). Missing `command` → `400`. Returns `{ result: string, command: string }`. |

- A command is any input matching `/^\/\w/` (`commandRegistry.isCommand`). Parsed as `/<name> <args>`; aliases supported.
- This route wires a **subset** of `CommandContext`: `searchMemory`, `getWorkspaceState`, `listSkills`. It **omits** `runWorkflow` and `spawnAgent` (those need the full agent loop), so workflow commands like `/research`, `/plan`, `/spawn` return their "not available in this context" fallback. To run those, send the command **through `POST /api/chat`** instead — chat detects the slash command and, when the LLM is available, can reroute it through the agent loop via the `AGENT_LOOP_REROUTE::` prefix.
- There is **no** `GET /api/commands` listing endpoint. The registry has `list()`/`search()` in code but they are not exposed over HTTP, so the frontend cannot fetch the command catalogue from the server — it must hardcode/derive autocomplete client-side.

---

## 6. Sessions CRUD — `sessions.ts` + `session-utils.ts`

Sessions are **JSONL files on disk**: `dataDir/workspaces/<workspaceId>/sessions/<sessionId>.jsonl`. Line 0 is a `{ type: "meta", title, summary?, created, distilled?, outcome? }` record; subsequent lines are `{ role, content, timestamp }`. All path segments pass `assertSafeSegment`.

| Method | Path | Params / Query / Body | Purpose & response |
|---|---|---|---|
| GET | `/api/workspaces/:workspaceId/sessions` | query `?hideEmpty=true` | List sessions (sorted by `lastActive` desc). Returns `SessionInfo[]`. Unknown workspace → `[]`. |
| GET | `/api/workspaces/:workspaceId/sessions/search` | query `?q=<≥2 chars>&limit=<≤50>` | Full-text search across session content/summary. `<2` chars → `400`. Unknown ws → `404`. Returns `SessionSearchResult[]`. |
| GET | `/api/workspaces/:workspaceId/sessions/:sessionId/export` | — | Export one session as Markdown (`Content-Type: text/markdown`). `404` if missing. |
| GET | `/api/workspaces/:workspaceId/sessions/:sessionId/timeline` | — | Tool-event timeline (`TimelineEvent[]`, heuristically reconstructed from assistant content patterns; `spawn_agent` nests children). `404` if missing. |
| POST | `/api/workspaces/:workspaceId/sessions` | body `{ title? }` | Create a session (writes meta line). `404` if workspace missing. `201` + `SessionInfo`. |
| PATCH | `/api/sessions/:sessionId` | body `{ title }`, query `?workspace=` | Rename. Searches all workspaces if `workspace` omitted. Missing title → `400`; not found → `404`. Returns `{ id, title }`. |
| DELETE | `/api/sessions/:sessionId` | query `?workspace=` | Delete the `.jsonl`. Searches all workspaces if omitted. `404` if not found. Returns `{ deleted: true }`. |
| GET | `/api/sessions/:sessionId/summary` | query `?workspace=` | Structured post-session summary (counts user/assistant/tool/memory/doc). `404` if not found. |

### `SessionInfo` (list/create shape)

```ts
{ id: string; title: string; summary: string | null; messageCount: number; lastActive: string; created: string }
```

### `/api/sessions/:sessionId/summary` shape

```jsonc
{
  "sessionId", "title", "messageCount",
  "userMessages", "assistantMessages",
  "toolsUsed", "memoriesSaved", "documentsCreated",
  "summary", "lastActive", "created"
}
```

### Other types from `session-utils.ts` the frontend may render

- `SessionSearchResult`: `{ sessionId, title, summary, matchCount, snippets: [{ text, role }], lastActive }`
- `TimelineEvent`: `{ id, timestamp, toolName, status: 'success'|'error', durationMs, inputPreview, outputPreview, fullInput, fullOutput, children? }`
- `ThreadInfo`: `{ title, lastActive, freshness: 'fresh'|'aging'|'stale', messageCount, sessionId }` (fresh `<2d`, aging `<7d`, else stale — timestamp-based, NOT importance)
- `ProgressItem` / `OpenQuestion` / `SessionOutcome` / `DistillableSession` — heuristic extractions used by `/catchup`-style features (not directly exposed as REST here).

> Summaries are **lazily generated** (`generateSessionSummary`) for sessions with ≥4 messages and persisted back into the meta line — no LLM needed.

---

## 7. Agent groups — `agent-groups.ts`

Multi-agent group configs stored in `dataDir/agent-groups.json`. A group has a `strategy` (`parallel` | `sequential` | `coordinator`) and ordered `members`.

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/agent-groups` | — | List all groups (`AgentGroup[]`). |
| POST | `/api/agent-groups` | `{ name, description?, strategy, members: AgentGroupMember[] }` | Create. Missing name → `400`. `201` + group. |
| PATCH | `/api/agent-groups/:id` | partial of the above | Update fields. `404` if not found. |
| DELETE | `/api/agent-groups/:id` | — | Delete. `404` if not found. Returns `{ deleted: true }`. |
| POST | `/api/agent-groups/:id/run` | `{ task, teamId? }` | **Placeholder** — does NOT execute. Returns a queued stub: `{ jobId, groupId, groupName, strategy, memberCount, task, status: 'queued' }`. Missing task → `400`. |

`AgentGroup`: `{ id, name, description?, strategy, members, createdAt }`.
`AgentGroupMember`: `{ agentId, roleInGroup: 'lead'|'worker'|string, executionOrder }`.

---

## 8. One-shot structured retrieval — `POST /api/agent/run` (SSE)

**File:** `agent-run.ts`. Backs the Tauri `run_agent_query` command. Shape-aware research flow via `runRetrievalAgentLoop` — **distinct from `/api/chat`**. Requires `multiMind.personal` + an embedding provider, else `503`.

### Request body (`AgentRunBody`)

| Field | Type | Notes |
|---|---|---|
| `question` | `string` | **required**; non-string → `400 { error: 'question is required' }`. |
| `shape` | `string?` | Prompt-shape name. Validated against `listShapes()`; unknown → warn + fall back to model-default (NOT a 400). |
| `model` | `string?` | Default `'claude-sonnet-4-6'`. |
| `persona` | `string?` | Default `'general-purpose'`. |
| `workspace` / `workspaceId` | `string?` | Target mind; `'personal'` or absent → personal mind. |
| `maxSteps` | `number?` | Default `5`. |
| `maxRetrievalsPerStep` | `number?` | Default `8`. |

### SSE events (`/api/agent/run`) — **different from `/api/chat`**

| `event:` | `data` |
|---|---|
| `started` | `{ shape, shapeRequested, shapeRecognized, model }` |
| `progress` | per-step `AgentRunProgressEvent` (from the loop's `onProgress`) |
| `finalized` | `{ rawResponse, normalizedResponse, promptShapeName, stepsTaken, retrievalCalls, loopExhausted, totalTokensIn, totalTokensOut, totalCostUsd, totalLatencyMs }` |
| `error` | `{ error: string }` |
| `done` | `{ ok: true }` (always last) |

---

## 9. Persistence & context model (mental model)

- **Session file** = JSONL, append-only. Meta line first, then `{ role, content, timestamp }` per message. Written by `persistMessage`, read by `loadSessionMessages`.
- **History cache** = `server.agentState.sessionHistories: Map<sessionId, {role,content}[]>` — RAM mirror, lazily hydrated from disk.
- **Context window** = `MAX_CONTEXT_MESSAGES = 50`. When a budget model exists, chat uses intelligent `compressConversation` (LLM-summarize the middle); otherwise the simple `applyContextWindow` sliding window with a prepended `[Context summary — N earlier messages compressed]` system message.
- **Governance** (`chat-governance.ts`): for team workspaces, blocked-tool policies are fetched directly from the team server (5-min cache), no HTTP loopback.

---

## 10. Flow diagram — submitting a chat turn with a gated tool

```mermaid
sequenceDiagram
    participant UI as Frontend
    participant Chat as POST /api/chat (SSE)
    participant Loop as runAgentLoop
    participant Appr as POST /api/approval/:id
    participant Disk as session .jsonl

    UI->>Chat: { message, workspace, session, model?, persona?, autonomy? }
    Note over Chat: validate · injection scan · RBAC · path guard (pre-hijack)
    alt rejected
        Chat-->>UI: 400/403 JSON error
    else accepted
        Chat->>Disk: persist user message
        Chat-->>UI: event: step "Recalling relevant memories..."
        Chat-->>UI: event: tool / tool_result (auto_recall)
        Chat->>Loop: stream=true, onToken/onToolUse/onToolResult
        Loop-->>UI: event: token (xN, assistant text)
        Loop-->>UI: event: tool { name, input }
        Note over Loop: gated tool hits pre:tool hook
        Loop-->>UI: event: approval_required { requestId, toolName, input }
        UI->>Appr: { approved: true, always? }
        Appr-->>Loop: resolve(true) (or auto-deny after 5 min)
        Loop-->>UI: event: tool_result { name, result, isError }
        Loop-->>UI: event: token (xN, more text)
        Chat->>Disk: persist assistant message
        Chat-->>UI: event: done { content, usage, toolsUsed, model, cost? }
    end
    Note over Chat: on failure → event: error { message } (+ raw turn still persisted)
```
