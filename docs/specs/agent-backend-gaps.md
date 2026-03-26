# Agent System — Backend Gaps Spec

## Status: ✅ Complete (all endpoints implemented 2026-03-26)
## Date: 2026-03-26

---

## 1. Summary

The Agents frontend (`AgentsApp.tsx`) and adapter (`adapter.ts`) call several backend endpoints that either don't exist or have mismatched semantics. This spec documents every gap and proposes the backend work needed.

---

## 2. Frontend ↔ Backend Route Mapping

### 2.1 Personas (Agents) — `/api/personas`

The frontend uses "Personas" as its API namespace for individual agents. The local server (`packages/server/src/local/routes/personas.ts`) implements:

| Frontend call | Backend route | Status |
|---|---|---|
| `GET /api/personas` | ✅ Exists (local) | Works — returns persona catalog |
| `POST /api/personas` | ✅ Exists (local) | Works — creates custom persona on disk |
| `DELETE /api/personas/:id` | ✅ Exists (local) | Works — deletes custom persona |
| `PATCH /api/personas/:id` | ❌ **MISSING** | Frontend calls PATCH to update custom personas |
| `POST /api/personas/generate` | ❌ **MISSING** | Frontend calls this for AI-generated persona creation |

**Note:** The team server (`packages/server/src/routes/agents.ts`) has a separate `agents` CRUD backed by Postgres. These are different entities from local personas. The frontend conflates them — it calls `/api/personas` for both local and team use. This needs reconciliation.

### 2.2 Agent Groups — `/api/agent-groups`

| Frontend call | Backend route | Status |
|---|---|---|
| `GET /api/agent-groups` | ✅ Exists (team server) | Works |
| `POST /api/agent-groups` | ✅ Exists (team server) | Works |
| `GET /api/agent-groups/:id` | ✅ Exists (team server) | Works |
| `POST /api/agent-groups/:id/run` | ✅ Exists (team server) | Works — queues job |
| `PATCH /api/agent-groups/:id` | ❌ **MISSING** | Frontend calls this to update group name/strategy/members |
| `DELETE /api/agent-groups/:id` | ❌ **MISSING** | Frontend calls this to delete a group |

### 2.3 Jobs — `/api/jobs`

| Frontend call | Backend route | Status |
|---|---|---|
| `GET /api/jobs/:id` | ✅ Exists (team server) | Works |
| `POST /api/jobs/:id/cancel` | ❌ **MISSING** | Frontend calls this to cancel running group execution |

---

## 3. Required Backend Work

### 3.1 `PATCH /api/personas/:id` (Local Server)

Update a custom persona's fields (name, description, icon, systemPrompt, tools).

```
PATCH /api/personas/:id
Body: { name?, description?, icon?, systemPrompt?, tools? }
Response: Updated persona object
```

Implementation: Read existing persona JSON from disk, merge fields, write back via `saveCustomPersona()`.

### 3.2 `POST /api/personas/generate` (Local Server)

AI-generate a persona definition from a natural language prompt.

```
POST /api/personas/generate
Body: { prompt: string }
Response: { name, description, systemPrompt, tools: string[] }
```

Implementation: Call LiteLLM with a meta-prompt that produces persona JSON. Do NOT save — just return the generated config for the user to review/edit before saving.

### 3.3 `PATCH /api/agent-groups/:id` (Team Server)

Update an agent group's name, description, strategy, and/or member list.

```
PATCH /api/agent-groups/:id
Body: { name?, description?, strategy?, members?: Array<{ agentId, roleInGroup, executionOrder }> }
Response: Updated group with members
```

Implementation:
1. Verify ownership (userId match)
2. Update `agent_groups` row
3. If `members` provided: DELETE existing `agent_group_members` for this group, INSERT new set
4. Return group + members

### 3.4 `DELETE /api/agent-groups/:id` (Team Server)

```
DELETE /api/agent-groups/:id
Response: 204 No Content
```

Implementation:
1. Verify ownership
2. DELETE `agent_group_members` WHERE groupId = :id
3. DELETE `agent_groups` WHERE id = :id

### 3.5 `POST /api/jobs/:id/cancel` (Team Server)

Cancel a running or queued job.

```
POST /api/jobs/:id/cancel
Response: { cancelled: true, jobId: string }
```

Implementation:
1. Look up job in `agent_jobs`
2. If status is `queued` or `running`: update status to `cancelled`, set `completedAt`
3. If BullMQ job exists: call `job.remove()` or `job.moveToFailed()`
4. Return success

### 3.6 Workspace ↔ Agent Group Assignment

Currently workspaces can have a `persona` (single agent). They should also support an `agentGroupId` so a group of agents can be assigned to handle workspace tasks collaboratively.

**Local workspace manager:** Add optional `agentGroupId` field to workspace config.
**Team server:** Add `agent_group_id` column to relevant workspace/session table if using Postgres workspaces.
**PATCH /api/workspaces/:id:** Accept `agentGroupId` field.
**Chat routing:** When a workspace has `agentGroupId` set, the chat handler should dispatch to the group execution pipeline instead of single-agent loop.

---

## 4. Frontend ↔ Backend Reconciliation: Personas vs Agents

The local server uses file-based "personas" (`~/.waggle/personas/`) while the team server uses Postgres-backed "agents" (`agents` table). The frontend adapter calls `/api/personas` for both.

**Recommendation:** The local server should proxy or merge both sources:
- Built-in + custom personas from disk (local)  
- Team agents from Postgres (team server, if connected)

This way the frontend has a single `/api/personas` endpoint that returns a unified list.

---

## 5. Data Flow: Group on Workspace

```
User selects group in CreateWorkspaceDialog or PersonaSwitcher
  → PATCH /api/workspaces/:id { agentGroupId: "..." }
  → Chat sends message to workspace
  → Backend detects agentGroupId on workspace config
  → Routes to group execution pipeline (parallel/sequential/coordinator)
  → SSE events stream per-member progress back to UI
```

---

## 6. Priority Order

1. **PATCH/DELETE agent-groups** — Needed for existing UI (edit/delete groups)
2. **PATCH personas** — Needed for editing custom agents
3. **POST personas/generate** — Needed for AI agent creation
4. **POST jobs/:id/cancel** — Needed for cancelling group runs
5. **Workspace agentGroupId** — New feature (group assignment to workspaces)
