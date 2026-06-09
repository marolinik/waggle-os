# Gap Card — S18 Agent Builder

> UX-refactor planning artifact. Execution model: **in-place incremental refactor** of
> `apps/web` + targeted backend extensions. Every claim is grounded in a real file.
> PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`
> (§12.9 + §16.7). Mockup (directional only) =
> `Waggle_OS_Handoff_Assets/screens_18_21_builders_and_marketplace.png`.

---

## 1. Screen & purpose

Create an **agent as an explicit work actor** through a guided stepper, with no hidden
memory/tool access. PRD §12.9: "Manage agents as explicit work actors… User can explain
what an agent can see and do before enabling it." Blueprint Screen 18 (`_blueprint_extracted.txt:410-416`):
"Create an agent with goal, model, autonomy, memory, skills and permissions. Configure,
test, review, create. States: Draft; validation; approval needed; created. Acceptance:
No agent has hidden memory/tool access."

The Agent Builder is the create-flow companion to the **Agent Center** (Screen 9, a
separate gap card). S18 is one of four builder/marketplace screens grouped in the same
mockup (18 Agent Builder, 19 Skill Builder, 20 Automation Builder, 21 Marketplace).

PRD §16.7 names the agent CRUD/run/traces API surface this builder writes to.

---

## 2. Required states (PRD / Blueprint)

**Builder steps (PRD §12.9, line 589):** `Basic Info → Capabilities → Memory & Tools → Permissions → Review & Create` (5-step stepper).

**Agent fields the builder must collect (PRD §12.9 line 590 + §15.5 lines 1015-1036):**
name, goal, description, persona/avatar, model, autonomyLevel (`manual|guided|medium|high`,
PRD §15.2), type (`personal|workspace|team|autonomous`), memoryScopes, skillIds,
connectorIds, mcpIds, permissions, status, workspaceIds, createdBy, lastRunAt, successRate.

**Per-screen states (blueprint `:413-414` + `:461-463`):**
- `Draft` — partially-filled builder, save without activating.
- `Validation` — required-field gating (goal, model, memory scope, skills/tools/MCPs, autonomy per blueprint `:134`).
- `Approval needed` — elevated permission selections require an approval prompt before create (PRD §12.9 "all elevated access is reviewed"; §17.3 "elevated actions require human approval").
- `Created` — agent appears in Agent Center + target workspace (Journey 10, PRD lines 746-753).
- Plus global states (PRD §14.1): Loading, Error, Offline/local-only, Permission denied.

**Hard acceptance gate (blueprint `:415-416`, `:134`):** "No agent has hidden memory/tool access" and "Agent Builder must require model, goal, memory scope, skills/tools/MCPs and autonomy level." The Review step must render the full effective permission/memory/tool surface before the user confirms.

**Test affordance:** blueprint `:413` "Configure, **test**, review, create" — a dry-run before create (analogous to Skill Builder's test). PRD §12.9 does not list test as a functional requirement; treat as optional (open question §9).

---

## 3. Current state in repo — disposition: **create-new** (builder) + **partial** (substrate reuse)

There is **no Agent Builder and no first-class Agent entity** today. The closest existing
surface is a **persona/agent-group** model, which is a strict subset of the PRD Agent.

**Existing frontend (the seed):**
- `apps/web/src/components/os/overlays/SpawnAgentDialog.tsx` — a 2-step dialog (`config → confirm`, `:29`) that spawns a **transient sub-agent** (task + persona + model + parent workspace) via `adapter.spawnAgent` → `POST /api/fleet/spawn`. It collects only `task/persona/model/workspaceMode` (`:37-44`); it has model-fetch with 3-tier fallback (`:50-99`) and a cost-estimate review pane (`:388-421`). It does **not** persist an agent definition — it fires a one-shot fleet job. This is the seed named in the task, but it is a *spawn* dialog, not a *builder*.
- `apps/web/src/components/os/apps/AgentsApp.tsx` — titled **"Personas"** (`:175`), two tabs (`agents`/`groups`, `:16`). Lists personas via `adapter.getPersonas()` (`:36`) and agent-groups via `adapter.getAgentGroups()` (`:38`). "New Persona" → `CreateAgentForm`.
- `apps/web/src/components/os/apps/agents/CreateAgentForm.tsx` — a **single-page** form (not a stepper) collecting `name/description/icon/systemPrompt/tools[]` (`:9`), with an "Generate with AI" box (`:58-81`) → `adapter.generatePersona`. This is the closest existing "create-an-agent" UI, but it maps to a **persona** (no goal/autonomy/model/memoryScope/connectors/mcps/permissions).
- `apps/web/src/components/os/apps/agents/AgentDetail.tsx` — read view showing icon/name/description/tools/commands/affinity (`:49-103`). No goal/model/autonomy/permissions/successRate/status.

**Existing backend (the substrate to reuse, not rebuild):**
- `packages/server/src/local/routes/personas.ts` — `GET/POST/PATCH/DELETE /api/personas` + `POST /api/personas/generate`. POST persists a custom `AgentPersona` to disk (`saveCustomPersona`, `:57`); fields are `id/name/description/icon/systemPrompt/modelPreference/tools/workspaceAffinity/suggestedCommands/defaultWorkflow` (`:45-56`). **No** goal/autonomy/memoryScopes/connectorIds/mcpIds/permissions/status. PRO-tier gated (`:32`).
- `AgentPersona` interface (`packages/agent/src/personas.ts`; full field list in `docs/backend-map/sections/05a-subsystem-agent-runtime.md:198-218`) already carries `suggestedSkills?/suggestedConnectors?/suggestedMcpServers?/disallowedTools?/isReadOnly?` — useful seed columns for the richer Agent.
- `packages/server/src/local/routes/agent-groups.ts` — `GET/POST/PATCH/DELETE /api/agent-groups` + `POST /api/agent-groups/:id/run` (the run is a **placeholder stub**, `:105-127` — returns a queued jobId, does not execute). Groups persist to `{dataDir}/agent-groups.json` (`:29`). This is the closest "agent persistence on disk via JSON file" precedent.
- `packages/server/src/local/routes/fleet.ts` — `POST /api/fleet/spawn` is the **only real agent-execution path** (`:66-257`): creates a session, emits Waggle signals, and **fire-and-forgets `runAgentLoop`** in the background (`:142-245`). `POST /api/fleet/:workspaceId/pause|resume|kill` (`:260-290`). This is what `/api/agents/:id/run` and `/pause` must wire onto.
- `execution_traces` table (`packages/hive-mind-core/src/mind/schema.ts:199`) is written from `chat.ts` and `evolution.ts` (grep-confirmed) but has **no HTTP read route** — `/api/agents/:id/traces` is net-new over this store.

**Why create-new, not rework:** the PRD Agent (§15.5) is a **superset** of persona — it
adds goal, autonomy, type, memoryScopes, connectorIds, mcpIds, permissions, status,
workspaceIds, lastRunAt, successRate. A persona is the *behavioral template*; a PRD Agent
is an *instantiated, scoped, governed actor*. Bending `CreateAgentForm`/persona-POST to
carry all of that would corrupt the persona contract (shared by the runtime prompt
composer). The clean model: **net-new Agent entity + 5-step builder**, with a persona
selected *as one field* of the agent. Heavy reuse of persona catalog, model picker,
tool catalog, fleet-spawn, and execution-traces underneath.

---

## 4. Frontend work

**Create new — `apps/web/src/components/os/overlays/AgentBuilder.tsx`** (or
`components/os/apps/agents/AgentBuilder.tsx` if hosted inside the Agents app shell).
A 5-step stepper matching PRD §12.9:

1. **Basic Info** — name, goal (required), description, persona/avatar picker, type (`AgentType`).
2. **Capabilities** — model (required), autonomyLevel (required), defaultWorkflow.
3. **Memory & Tools** — memoryScopes (required), skillIds, tools[] (required-ish per blueprint `:134`).
4. **Permissions** — connectorIds, mcpIds, explicit permissions; surface elevated-access warnings here (drives the "approval needed" state).
5. **Review & Create** — full effective surface (the "no hidden access" gate), then create.

**Reuse targets (do not rebuild):**
- **Stepper chrome:** there is no shared `BuilderStepper` primitive yet (PRD §19.1 lists "Builder stepper" as a design-system component to create). S18/S19/S20 all need it — build it **once** as `components/ui/builder-stepper.tsx` and share. (Cross-screen dependency — flag to the Skill Builder & Automation Builder cards.)
- **Model picker:** reuse `components/os/ModelSelector.tsx` (already used by Spawn/Settings/onboarding) instead of `SpawnAgentDialog`'s bespoke model-button grid (`SpawnAgentDialog.tsx:328-344`).
- **Persona picker:** reuse the persona grid pattern from `SpawnAgentDialog.tsx:258-276` + `PERSONAS` from `@/lib/personas`; or fetch live via `adapter.getPersonas()` (as `AgentsApp.tsx:36`).
- **Tool picker:** reuse the searchable checkbox list from `CreateAgentForm.tsx:104-145` (tools sourced from `adapter.getCapabilityStatus()` → flattened `ToolDef[]`, `AgentsApp.tsx:49-55`).
- **Skills/connectors/MCPs pickers:** `adapter.getSkills()`, `adapter.getConnectors()`, and MCP list (see §5 — MCP list endpoint is itself partial). Persona's `suggestedSkills/suggestedConnectors/suggestedMcpServers` (05a `:216-218`) can pre-seed recommendations.
- **Cost-estimate review pane:** lift from `SpawnAgentDialog.tsx:388-421` (`adapter.getModelPricing()`).
- **Approval prompt:** reuse the approvals pattern (`ApprovalsApp` / inline chat approvals) for the elevated-access gate; do not invent a new modal.

**Adapter methods to add (`apps/web/src/lib/adapter.ts` — the single sidecar gateway, ~150 methods):**
`getAgents()`, `createAgent(def)`, `getAgent(id)`, `patchAgent(id, partial)`, `runAgent(id, {task?})`,
`pauseAgent(id)`, `getAgentTraces(id)`. (Today the adapter has `getPersonas/createPersona/…`,
`spawnAgent`, `getFleet/fleetAction`, `getAgentGroups/…` — none of these is the PRD Agent CRUD.)

**Wiring:** register the builder open path through the existing `waggle:open-app` CustomEvent
/ overlay state (`useOverlayState`); add it as a "New Agent" entry in the Agents app (which
should be renamed/retitled from "Personas" to host both — Agent Center card decides final IA).
**Reuse SpawnAgentDialog** as the quick "run now without saving" path — keep it; it is a
different verb (ephemeral spawn) from the builder (persisted definition).

---

## 5. Backend work (PRD §16.7 endpoints)

> Naming collision (backend-routes inventory `:486-492`): the **Cloud** server has a
> Clerk-gated `routes/agents.ts` with `/api/agents` CRUD — but that is NOT the sidecar.
> The desktop frontend talks only to the **local sidecar**, where the sidecar agent surface
> is `/api/agent/*` (singular) + `/api/agents/active` + `/api/agent-groups/*` + `/api/fleet/*`.
> So in the desktop context every §16.7 row below is MISSING-or-PARTIAL **locally**.

| PRD §16.7 endpoint | Status (sidecar) | Extend vs net-new + substrate |
|---|---|---|
| `GET /api/agents` | **MISSING** | Net-new route. Reads a net-new agent-definition store. Closest existing "definitions": `GET /api/personas` (`personas.ts:15`) + `GET /api/agent-groups` (`agent-groups.ts:49`) — neither is the PRD Agent. |
| `POST /api/agents` | **MISSING** | Net-new. **Pattern to reuse:** agent-groups JSON-file persistence (`agent-groups.ts:29-43`, `{dataDir}/agent-groups.json`) → store agents at `{dataDir}/agents.json` (no SQLite, mirrors persona/group precedent). Validate goal/model/memoryScopes/autonomy/permissions. PRO-tier gate like `personas.ts:32`. |
| `GET /api/agents/:id` | **MISSING** | Net-new read over the new store. |
| `PATCH /api/agents/:id` | **MISSING** | Net-new partial-update (mirror `agent-groups.ts:74-90` PATCH shape). |
| `POST /api/agents/:id/run` | **PARTIAL** | **Extend, do not build new execution.** Resolve agent → call the real executor `POST /api/fleet/spawn` (`fleet.ts:66`, the only path that actually runs `runAgentLoop` `:185`). Map agent's persona/model/memoryScope/workspace onto the spawn body. (`/api/agent-groups/:id/run` is a stub — `agent-groups.ts:105` — do NOT reuse it as the model.) |
| `POST /api/agents/:id/pause` | **PARTIAL** | **Extend.** Map agent's running session → `POST /api/fleet/:workspaceId/pause` (`fleet.ts:260`). |
| `GET /api/agents/:id/traces` | **PARTIAL / net-new route** | No HTTP route reads traces today. The `execution_traces` table exists (`schema.ts:199`) and is written by `chat.ts`/`evolution.ts`. Add a thin read route over the execution-trace store, filtered by agent/session. Fallback: session timeline `GET /api/workspaces/:wid/sessions/:sid/timeline` (`sessions.ts`). |

**Substrate touched:** new `{dataDir}/agents.json` (file store — no DB migration);
`personas.ts` (read for persona field); `fleet.ts` (run/pause delegation);
`execution_traces` (read for traces); `install_audit` (write an audit entry on agent
create when elevated connectors/MCPs are attached — `InstallAuditStore`, see §d of the
substrate inventory; note the `risk_level='critical'` CHECK-constraint drift bug flagged
there `install-audit.ts:16` vs DDL `:65`).

**.mind migration:** **NONE required.** The agent definition lives in a JSON file (precedent:
persona disk store + `agent-groups.json`), not in SQLite. `lastRunAt`/`successRate` are
derived (successRate from `execution_traces.outcome` / `procedures.success_rate`
`schema.ts:147,206`), not new columns. This matches the LOCKED in-place model and the
backend-routes inventory verdict ("none require a new data store").

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

Per substrate inventory §(e): **none of the PRD §15.2 unions exist in `apps/web/src/lib/types.ts`.**
S18 needs:
- `AgentType = 'personal' | 'workspace' | 'team' | 'autonomous'` (PRD §15.2) — **MISSING**.
- `AutonomyLevel = 'manual' | 'guided' | 'medium' | 'high'` (PRD §15.2) — **MISSING** in FE (note: a *different* `AutonomyLevel` exists in `hooks/useWindowManager.ts` for chat windows — Normal/Trusted/YOLO; do **not** reuse, they are different vocabularies — flag the collision).
- `Scope = 'personal' | 'workspace' | 'team' | 'organization'` (for `memoryScopes`) — **MISSING**.
- A full **`Agent`** interface (PRD §15.5 fields) — **MISSING**. Today `packages/shared/src/types.ts` has a thin `AgentDef` (`:36-47`: id/userId/teamId/name/role/systemPrompt/model/tools/config/createdAt) lacking goal/type/autonomy/memoryScopes/skillIds/connectorIds/mcpIds/permissions/status/lastRunAt/successRate. Decide: extend `AgentDef` (shared, cloud-aligned) vs add a desktop-local `Agent` in `lib/types.ts`. Given the sidecar-only execution model, a **new `Agent` interface in `lib/types.ts` + a matching server-side type** is cleanest; keep `AgentDef` for the cloud path.
- `ExtensionType` (for the connector/mcp/skill pickers' provenance) — **MISSING** but shared with S19/S21.

Keep types consistent with the new `agents.json` shape (PRD §22.2 "Frontend types are
consistent with API contracts").

---

## 7. Dependencies (screens / phases first)

- **Phase 3 (Intelligence layer)** per PRD §8 / Sprint 6 — same phase as Agent Center (S9), Skill Builder (S19), Automation Builder (S20).
- **Agent Center (Screen 9)** — the builder's create result must land somewhere; the Agent Center list/card view + the new `Agent` type + `GET /api/agents` are a shared prerequisite. Sequence: define `Agent` type + agent store + `GET/POST /api/agents` **with** Agent Center, then layer the builder on top.
- **Shared `BuilderStepper` primitive** (PRD §19.1) — build once, shared by S18/S19/S20. Whichever builder ships first owns it.
- **Connector Hub (S?) / MCP Hub (S?)** — the Permissions step picks connectorIds/mcpIds; the MCP listing is itself PARTIAL (no `GET /api/mcps`; data lives in `capabilities/status.mcpServers[]` + `@waggle/shared mcp-catalog.ts`). The picker can read those existing surfaces without waiting for the full Hubs, but the canonical MCP list endpoint is a cross-card dependency.
- **Approval prompt** component (PRD §19.1) — reuse existing approvals plumbing; not a hard blocker.
- **AppShell / IA** (Phase 0/1) — the builder opens via the existing window-manager overlay path; no new routing (single-route windowed desktop, per frontend inventory §b).

---

## 8. Effort: **L**

Net-new 5-step builder UI + net-new `Agent` entity, store, and CRUD routes, plus
run/pause delegation onto fleet and a net-new traces read route — but **every backend
piece reuses an existing substrate** (persona catalog, agent-groups JSON-file precedent,
fleet-spawn executor, execution-traces store; no `.mind` migration). The heavy reuse and
absence of a DB migration keep it off XL; the breadth (4 new + 3 partial endpoints, a new
shared entity/type, a shared stepper primitive, and the elevated-access approval gate)
keeps it above M.

---

## 9. Open questions

1. **Agent vs persona boundary.** Confirm the model: persona = behavioral template (one
   *field* of an agent) vs agent = scoped governed instance. This card assumes that split.
   Should creating an agent ever auto-create a backing persona, or always reference one?
2. **Store location.** `{dataDir}/agents.json` (mirrors `agent-groups.json`) vs a new
   `agents` row in personal `.mind`. This card recommends the JSON file (no migration,
   matches precedent). Confirm.
3. **`/run` semantics.** Does Agent Builder's eventual run mean "fleet-spawn a one-shot in
   a chosen workspace" (current real path) or "persistent agent that keeps running"? PRD
   agent states include `Running/Paused/Completed` (§14.5) — confirm the lifecycle the
   sidecar must support beyond fleet's ephemeral sessions.
4. **Test step.** Blueprint says "configure, **test**, review, create" (`:413`); PRD §12.9
   omits test. Include a dry-run (like Skill Builder's `POST /api/skills/:id/test`) or defer?
5. **`successRate` source.** Derive from `execution_traces.outcome` vs `procedures.success_rate`
   vs a new counter? (Both exist; pick one to avoid a third tally vocabulary.)
6. **Autonomy vocabulary collision.** PRD `AutonomyLevel` (`manual/guided/medium/high`) vs
   the chat-window `AutonomyLevel` (Normal/Trusted/YOLO in `useWindowManager.ts`) vs the
   agent-loop's tiered-autonomy. Which governs an agent's tool execution at run time?
7. **Cloud vs sidecar `/api/agents`.** The Cloud server already has Clerk-gated `/api/agents`
   CRUD. Should the desktop sidecar's new routes share a contract/shape with it for future
   sync, or stay independent?
