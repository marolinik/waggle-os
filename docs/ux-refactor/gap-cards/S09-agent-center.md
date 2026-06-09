# Gap Card — S09 Agent Center

> UX-refactor planning artifact. Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extensions over the existing sidecar/substrate. Mockup is directional; PRD §12.9 + §16.7 acceptance criteria win.
> PRD: `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md` (§12.9 lines 581-595, §16.7 lines 1112-1120, §15.5 lines 1015-1035).

---

## 1. Screen & purpose

**Agent Center** — manage agents as explicit, governed work actors (PRD §12.9, blueprint Screen 9, page 36). Per blueprint p.8 "Agent Model" (lines 125-136), an Agent is a scoped worker carrying goal, model, autonomy, memory scopes, skills, tools, MCPs, permissions — distinct from a Persona (a prompt+tools template). The Center is the list/manage surface; the **Agent Builder** (S18, PRD §12.9 + blueprint p.45) is the 5-step create flow.

Mockup (`screen_09_agent_center.png`, directional): top category tab strip (All Agents / Personal / Workspace / Team / Autonomous / Archive) + Templates + Filters + **Create Agent**; a KPI metric row (active count, success-rate avg, run counts, hours-saved, cost); a left list/table of agent rows (avatar, name, goal sub-line, type chip, model, status pill, success-rate bar, owner avatars, last-run, sparkline); a right rail (Agents by Type donut, Top Capabilities, Recent Activity, Quick Actions). Search + sort + pagination on the list.

---

## 2. Required states (PRD/Blueprint)

PRD §12.9 functional requirements:
- **Agent categories:** Personal, Workspace, Team, Autonomous, Templates, Archive (tabs).
- **Agent card/list** shows: goal, status, owner, workspace, capabilities, model, success rate, last run.
- **Agent Builder** steps: Basic Info → Capabilities → Memory & Tools → Permissions → Review & Create.
- **Agent fields** (§15.5): name, goal, description, persona/avatar, model, autonomy, type, memoryScopes, skillIds, connectorIds, mcpIds, permissions, status, createdBy, lastRunAt, successRate.
- **Agent safety:** no hidden tool/memory access; all elevated access reviewed (blueprint p.8: "Agent Builder must require model, goal, memory scope, skills/tools/MCPs and autonomy level"; "run logs link to execution_traces and ai_interactions"; "Autonomous agents require explicit schedule/trigger and stop/pause").

PRD agent state model (§14.5): Draft · Idle · Running · Paused · Failed · Waiting for approval · Completed · Archived. Blueprint p.18 (line 342): Idle; running; paused; failed; needs approval; archived.

Global states (§14.1) every screen must implement: Loading · Empty · Populated · Error · Offline/local-only · Syncing · Permission denied · Partial data · Approval required.

Acceptance: "User can explain what an agent can see and do before enabling it." (PRD line 595.)

---

## 3. Current state in repo (exact files + what they do)

**Disposition: `rework`** (the AgentsApp surface is a Personas manager, not the PRD Agent Center; the new IA needs an agent-as-actor object the current code does not model — but it reuses persona/group/fleet/trace substrate, so it is a rework + create-new-entity, not a from-scratch replacement).

Live frontend (grep-confirmed under `apps/web/src/components/os/apps/`):
- `AgentsApp.tsx` (346 LOC) — titled **"Personas"**, NOT "Agents". Two tabs: `agents` (= persona catalog) + `groups` (= agent groups). Loads `adapter.getPersonas()` + `adapter.getCapabilityStatus()` (for tool list) + `adapter.getAgentGroups()`. CRUD over **personas** (`createPersona/updatePersona/deletePersona/generatePersona`) and **groups** (`create/update/delete/runAgentGroup`). No goal/status/owner/successRate/last-run/autonomy concept; no category tabs; no KPI row; no run/pause controls on a card.
- `agents/AgentCard.tsx` (48 LOC) — avatar + name + description + delete (custom only) + chevron. No status pill, success bar, model, owner, last-run.
- `agents/AgentDetail.tsx` (108 LOC) — persona detail: tools list, suggested commands, workspace affinity. No run/pause/traces, no permissions panel.
- `agents/CreateAgentForm.tsx`, `CreateGroupForm.tsx`, `GroupCard.tsx`, `GroupDetail.tsx`, `GroupExecutionPanel.tsx` — persona/group create+exec UI. `CreateAgentForm` is a single form (name/description/icon/tools/systemPrompt), NOT the PRD 5-step Builder.
- `agents/types.ts` — `BackendPersona` (id/name/description/icon/affinity/commands/tools/systemPrompt/custom), `AgentGroup`, `GroupExecState`. **No Agent type with goal/autonomy/status/successRate.**
- `overlays/SpawnAgentDialog.tsx` (447 LOC) — ad-hoc sub-agent run: task + persona-override + model + parent-workspace; 2-step config→confirm with cost estimate; calls `adapter.spawnAgent()` → `POST /api/fleet/spawn`. This is the real "run an agent" path today, but it is launch-only, not a managed agent.
- `apps/MissionControlApp.tsx` (227 LOC) — live **fleet** sessions (`adapter.getFleet()`), per-session pause/resume/stop (`fleetAction`), plus team/activity tabs and AI-tool inventory. This is the closest existing "running agents" view; it shows sessions, not agent definitions.
- `apps/RoomApp.tsx` + `apps/WaggleDanceApp.tsx` + `apps/EventsApp.tsx` — live sub-agent tiles / coordination signals / event stream (run-time visibility, not agent management).

Registration: `agents` is an `AppId` in `lib/dock-tiers.ts` and routed in `Desktop.tsx` `renderAppContent`; `mission-control` is a separate AppId. Frontend inventory confirms: `AgentsApp` = "Personas manager" mapped to Intelligence bucket (`_inventory/frontend.md:29,361`).

Live backend (grep-confirmed, `_inventory/backend-routes.md` §16.7):
- Persona catalog CRUD: `/api/personas` GET/POST/PATCH/DELETE + `/generate` (`personas.ts`; POST/generate are **Tier: PRO**). 22 built-in personas in `packages/agent/src/persona-data.ts` + custom from disk (`05a:220-261`).
- Agent groups: `/api/agent-groups` GET/POST/PATCH/DELETE + `/run` — **`/run` is a placeholder stub, does NOT execute** (`03a:221`, JSON file `dataDir/agent-groups.json`).
- Sub-agent orchestrator state: `GET /api/agents/active` → `{ workers, active }` (`03a:136`).
- Fleet (real run/pause/resume/kill of sessions): `GET /api/fleet`, `POST /api/fleet/spawn`, `POST /api/fleet/:workspaceId/{pause,resume,kill}` (`backend-routes §1.13`).
- One-shot retrieval: `POST /api/agent/run` (SSE, separate path; `03a:228`).
- Trace store: `execution_traces` table (`mind/schema.ts:199`) with per-trace outcome/cost/duration; `TraceRecorder` auto-wires from agent loop (`05a:65`). **No HTTP listing route for traces** (`_inventory/backend-routes.md §16.7` → `/traces` PARTIAL).

**Key finding:** PRD's `/api/agents/*` (CRUD + run/pause/traces) is the **Cloud** server's Clerk-gated `routes/agents.ts`, NOT the sidecar. In the desktop (sidecar) context the entire §16.7 agent CRUD is **MISSING locally** (`backend-routes.md` §16.7 note, lines 488-492). There is **no persisted Agent entity** with PRD §15.5 fields anywhere local.

---

## 4. Frontend work

**Rework `AgentsApp.tsx` into the Agent Center** (keep the file; restructure). Concrete:

- **New `AgentCenter` shell** (rework `AgentsApp.tsx`): category tab strip (All / Personal / Workspace / Team / Autonomous / Templates / Archive) replacing the current Personas/Groups toggle. Keep Groups as a sub-view or fold groups under "Team/Autonomous". Add KPI metric row (active count, avg success rate, runs, est. hours saved, est. cost) — sourced from existing `getAgentStatus`/`getCostSummary`/`getFleet` + new agent list.
- **New `AgentRow`/rework `AgentCard.tsx`**: avatar, name, goal sub-line, type chip (`AgentType`), model, **status pill** (PRD §14.5 union), **success-rate bar**, owner avatar(s), last-run relative time, run/pause action buttons. Reuse `components/ui/badge` (status), `progress` (success bar), `avatar`. Status colors can follow `MissionControlApp` statusColors map.
- **Rework `AgentDetail.tsx`**: add Goal, Autonomy, Memory scope, Permissions panel, Run/Pause controls, and a **Traces** tab (links to `execution_traces` via new `/api/agents/:id/traces`).
- **New `AgentBuilder`** (PRD §20.3 "create"; blueprint S18): 5-step stepper (Basic Info → Capabilities → Memory & Tools → Permissions → Review & Create). Reuse the design-system **Builder stepper** (PRD §19.1) and the existing model picker `components/os/ModelSelector.tsx` + `lib/spawn-agent-helpers.ts` (model default selection) + persona/skill/connector/MCP multi-selects. `CreateAgentForm.tsx` (persona form) is a partial reuse target for the Basic Info + tools steps but must be extended to the agent contract.
- **Right rail**: Agents-by-Type donut (reuse `components/ui/chart`), Top Capabilities, Recent Activity (reuse fleet/events feed), Quick Actions.
- **Wire run/pause to fleet**: card "Run" → `/api/agents/:id/run` (which maps onto `fleet/spawn` per §5); "Pause" → `/api/agents/:id/pause` (maps onto `fleet/:wid/pause`). Keep `SpawnAgentDialog` as the quick-launch entry but have it also accept a saved agent id.
- **States**: implement all §14.1 globals — Loading (existing `Loader2`), Empty ("No agents — create one"), Error (existing error banner pattern in `AgentsApp`), Offline (`useOfflineStatus`), Permission denied (Team agents gated by `useBilling`/tier), Approval required (reuse `ApprovalsApp`/inline approval surface for elevated agent actions).

**Adapter methods/hooks (add to `lib/adapter.ts` — the single sidecar gateway):**
- `getAgents()`, `getAgent(id)`, `createAgent(body)`, `patchAgent(id, body)`, `runAgent(id, opts)`, `pauseAgent(id)`, `getAgentTraces(id)`.
- New `useAgents()` hook (mirror `useWorkspaces` shape: list/select/create/patch/run/pause/refresh). Reuse `useAgentStatus`, `useEvents`, `useRoomState`, `getFleet` for live run state.

**Shared types (FE):** add `Agent`, `AgentType`, `AutonomyLevel`, `AgentStatus`(state union) to `lib/types.ts` (see §6).

---

## 5. Backend work (PRD §16.7, against the local sidecar)

> Naming collision flagged: `/api/agents/*` CRUD currently exists ONLY on the Clerk-gated **Cloud** server (`packages/server/src/routes/agents.ts`), not the sidecar. The desktop talks only to the sidecar, so all of §16.7 is net-new **locally**. Add a new sidecar route file `packages/server/src/local/routes/agents.ts` registered in `local/index.ts`.

| PRD §16.7 endpoint | Status (sidecar) | Plan — EXTEND vs NET-NEW + substrate |
|---|---|---|
| `GET /api/agents` | **MISSING** | NET-NEW route. Backed by a **new agent store** (see migration note) — a persisted Agent entity. List can union saved agents + (optionally) derive read-only "agents" from `getPersonas()` for back-compat. Reuse `/api/agents/active` + `/api/fleet` to overlay live status. |
| `POST /api/agents` | **MISSING** | NET-NEW. Persist an Agent (§15.5 fields). Closest existing writes: `POST /api/personas` (custom persona) / `POST /api/agent-groups`. Record install/elevated-permission grant to `install_audit` if the agent claims elevated tools/MCPs. |
| `GET /api/agents/:id` | **MISSING** | NET-NEW read from the agent store (or map onto persona/group id for legacy). |
| `PATCH /api/agents/:id` | **MISSING** | NET-NEW. Closest: `PATCH /api/personas/:id` / `PATCH /api/agent-groups/:id`. |
| `POST /api/agents/:id/run` | **PARTIAL** | EXTEND: wire onto `POST /api/fleet/spawn` (`fleet.ts`, real execution — `{task, persona?, model?, parentWorkspaceId?}`). Resolve agent → persona+model+workspace, then spawn. Do NOT use `agent-groups/:id/run` (stub). Substrate: fleet/orchestrator + `execution_traces` via `TraceRecorder`. |
| `POST /api/agents/:id/pause` | **PARTIAL** | EXTEND: map agent→active session, reuse `POST /api/fleet/:workspaceId/pause`. |
| `GET /api/agents/:id/traces` | **PARTIAL** | EXTEND/NET-NEW thin route reading the `execution_traces` store (`mind/schema.ts:199`) filtered by agent/session; also expose `ai_interactions` links per blueprint p.8. No HTTP listing exists today — add one. Also reuse session timeline `GET /api/workspaces/:wid/sessions/:sid/timeline`. |

**Substrate touched:** persona catalog (`personas.ts` + `persona-data.ts`), agent-groups JSON store, fleet/sub-agent orchestrator (`05a`), `execution_traces` + `ai_interactions` tables, `install_audit` (for elevated-permission grants), `cron` (for Autonomous agents' schedule/trigger — blueprint p.8 line 136).

**.mind migration flag (REQUIRED for full §15.5 persistence):** there is **no Agent entity/table** in `mind/schema.ts` and personas live on disk (not as agents with goal/autonomy/status/successRate). Two options, lowest-risk first:
1. **JSON store (no DB migration):** persist agents to a `dataDir/agents.json` (mirroring the agent-groups JSON pattern, `03a:213`) — additive, reversible, no schema change. Recommended for v1.
2. **Mind table:** add an `agents` table to `mind/schema.ts` (bump `SCHEMA_VERSION`, use the established idempotent `ADD COLUMN`/`CREATE TABLE IF NOT EXISTS` migration pattern in `mind/db.ts`). Only if agents must be FTS/relation-queryable.
`successRate`/`lastRunAt` are **derivable** from `execution_traces.outcome` + `procedures.success_rate` (`schema.ts:147,206`) — compute at read time rather than store, per the §15.5 note that successRate "partially exists … derivable" (`substrate-types.md:255`).

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

None of the PRD §15.2 agent unions exist today (`substrate-types.md:218-229,249-257`). Add to `apps/web/src/lib/types.ts` (and mirror in `packages/shared/src/types.ts` if the cloud/agent runtime consumes them):

- `type AgentType = 'personal' | 'workspace' | 'team' | 'autonomous';` — **MISSING** (PRD §15.2 line 951).
- `type AutonomyLevel = 'manual' | 'guided' | 'medium' | 'high';` — **MISSING** (PRD §15.2 line 952).
- `type AgentRunState = 'draft' | 'idle' | 'running' | 'paused' | 'failed' | 'waiting_for_approval' | 'completed' | 'archived';` — **MISSING** (PRD §14.5). Note the existing FE `AgentStatus` (`types.ts:249-254`) is the cost/model snapshot, NOT this lifecycle union — keep both, distinct names.
- `interface Agent { id; name; goal; description?; type: AgentType; personaId?; avatar?; model?; autonomyLevel: AutonomyLevel; workspaceIds?: string[]; teamId?; memoryScopes?: Scope[]; skillIds?: string[]; connectorIds?: string[]; mcpIds?: string[]; permissions?: ...; status: AgentRunState; createdBy?; lastRunAt?; successRate?; createdAt; updatedAt }` — **MISSING entirely.** Closest is shared `AgentDef` (`packages/shared/src/types.ts:36-47`: id/userId/teamId/name/role/systemPrompt/model/tools/config/createdAt) which lacks goal/type/autonomy/status/scopes/successRate — extend or define `Agent` alongside it.
- `type Scope = 'personal' | 'workspace' | 'team' | 'organization';` — **MISSING** (PRD §15.2 line 946), shared by S06 Memory; define once.

The existing `BackendPersona` (`agents/types.ts:3-13`) stays for the persona catalog; the new `Agent` is a distinct object that may *reference* a `personaId`.

---

## 7. Dependencies (screens/phases first)

- **Phase 0 (Shell/IA)** — `Agent` shared types + `AgentType`/`AutonomyLevel`/`AgentRunState`/`Scope` unions must land first (consumed here + by S06 Memory + S18 Builder).
- **S04 Workspace Desktop** — Workspace agents are scoped by workspace; Agent Center's Workspace/Team tabs depend on `WorkspaceConfigV2.agentIds` (a §15.3 MISSING field, `substrate-types.md:32`) and `type`/`status`. Coordinate the workspace-config additive change.
- **S18 Agent Builder** — the create flow is a sibling screen (PRD §12.9 same section); Agent Center's "Create Agent" opens it. Plan together.
- **S11 Automation Center** — "Autonomous" agents need a schedule/trigger; depends on cron substrate shared with Automations.
- **S08 MCP Hub / S07 Connector Hub / S05 Skills Hub** — the Capabilities/Memory&Tools builder steps pick from those catalogs (`skillIds`/`connectorIds`/`mcpIds`); their list endpoints feed the multi-selects.
- **Approval surface** — elevated agent actions reuse `ApprovalsApp` + `/api/approval/*` (already exists).
- Lands in **Phase 3 (Intelligence layer)** per PRD §8 / Sprint 6 (§21).

---

## 8. Effort: **L**

Rework of a 6-file persona surface into a category-tabbed Agent Center, a net-new persisted Agent entity (JSON store v1) + 4 net-new sidecar routes + 3 extend-over-fleet/traces routes, new shared types, plus a 5-step Agent Builder (sibling). Not XL because the run/pause/trace substrate (fleet, execution_traces, orchestrator) already exists and is wired — the work is a management/persistence layer + IA over it, not new agent-execution machinery. Builder may split into its own card to keep this at L.

---

## 9. Open questions

1. **Agent vs Persona boundary:** does v1 introduce a true persisted Agent object distinct from Persona, or does Agent Center initially just re-skin the persona catalog with derived status? (Recommend: real Agent entity, JSON store, referencing `personaId`.)
2. **`/api/agents/*` collision:** confirm the desktop should get its OWN sidecar `agents.ts` rather than proxying the Clerk-gated cloud route (the sidecar has no Clerk). (Backend-map says local is MISSING; assume net-new sidecar.)
3. **Persistence choice:** JSON store (`agents.json`, no migration) vs `agents` table in `mind/schema.ts` (SCHEMA_VERSION bump)? PRD §14.4 non-goal favors minimal backend; JSON recommended for v1.
4. **successRate/lastRun:** derive at read from `execution_traces`/`procedures`, or persist on the agent? (Derive recommended; storing risks staleness.)
5. **Autonomous agents:** are these modeled as Agent + linked cron automation (S11), or a distinct entity? Blueprint p.8 says "explicit schedule/trigger" — likely an Agent that owns a cron id.
6. **Categories taxonomy:** PRD lists Personal/Workspace/Team/Autonomous/Templates/Archive (6); mockup shows All/Personal/Workspace/Team/Autonomous/Archive + a separate Templates control. Confirm whether Templates is a tab or a side affordance.
7. **Run target resolution:** when an agent has multiple `workspaceIds`, which workspace does `/run` spawn into? Needs a picker or a default.
