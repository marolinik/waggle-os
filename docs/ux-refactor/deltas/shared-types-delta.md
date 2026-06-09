# Shared Types Delta — UX Refactor

> Source of truth: PRD §15.2-15.6 (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md:942-1056`).
> Grounded against `apps/web/src/lib/types.ts`, `packages/shared/src/types.ts`, `packages/shared/src/mcp-catalog.ts`,
> `packages/hive-mind-core/src/mind/frames.ts`, and `docs/ux-refactor/_inventory/substrate-types.md`.
> Execution model is **in-place incremental refactor**: extend existing types, do not replace. NEW vs MODIFY is
> called out per type, with the current type cited.

---

## 0. Placement policy (where each type lives)

Two TS surfaces matter:

- **`packages/shared/src/types.ts`** — server/sidecar + cross-package domain types. Already holds `User`, `Team`,
  `AgentDef`, `Task`, `WaggleMessage`, `ConnectorDefinition`, `ConnectorHealth` (`packages/shared/src/types.ts:4-313`).
  Anything the **sidecar route layer must produce/persist** (entities, API payload shapes, RBAC) goes here so the
  server (`packages/server/src/local/routes/*`) and the FE import one definition.
- **`apps/web/src/lib/types.ts`** — FE display/view-model types. Already holds `Workspace`, `MemoryFrame`,
  `Persona`, `SkillPack`, `CronJob`, `Connector` (`apps/web/src/lib/types.ts:22-336`). These are intentionally
  **lossy projections** of the persisted shapes (substrate-inventory §(e), `_inventory/substrate-types.md:233-237`).

**Rule for this delta:**
1. The PRD §15.2 literal **enums/unions** are domain vocabulary → **`packages/shared`** (single source), then
   re-exported / imported by the FE. Avoid duplicating the union string lists in two files (drift risk —
   precedent: the `FrameSource` TS-vs-DB drift, `_inventory/substrate-types.md:120-121`).
2. **Persisted entity shapes** (WorkspaceConfigV2, Agent, Artifact, Skill, Automation, MCP) → **`packages/shared`**
   (server owns persistence; `WorkspaceConfig` itself currently lives in
   `packages/hive-mind-core/src/workspace-manager.ts:5-58`, not shared — see §1 note).
3. **FE view-models** that the screens actually render → **`apps/web/src/lib/types.ts`**, built FROM the shared
   entity (e.g. FE `Memory` adds derived `relevance`/UI flags). Where a FE thin type already exists
   (`SkillPack`, `Connector`, `Persona`, `CronJob`), MODIFY it rather than add a parallel type.

`@waggle/shared` is already imported by the FE (it ships `ConnectorDefinition` etc.), so importing shared enums into
`apps/web` is an existing, supported path.

---

## 1. §15.2 Enums / literal unions — **ALL NEW** → `packages/shared/src/types.ts`

None of these exist in either FE or shared today (`_inventory/substrate-types.md:218-229`). Add as a new
`// === UX-Refactor vocabulary (PRD §15.2) ===` block in `packages/shared/src/types.ts`. Use string-literal unions
(repo rule: prefer unions over `enum`, `rules/typescript/coding-style.md`).

```ts
// === UX-Refactor vocabulary (PRD §15.2) ===
export type WorkspaceType =
  | 'project' | 'client' | 'research' | 'personal' | 'team' | 'organization';
export type Scope = 'personal' | 'workspace' | 'team' | 'organization';
export type Confidence = number; // 0-100

export type MemoryKind =
  | 'fact' | 'decision' | 'task' | 'preference'
  | 'strategy' | 'learning' | 'goal' | 'entity';
export type ArtifactKind =
  | 'document' | 'presentation' | 'spreadsheet' | 'dashboard'
  | 'research' | 'code' | 'media' | 'design' | 'other';
export type AgentType = 'personal' | 'workspace' | 'team' | 'autonomous';
export type AutonomyLevel = 'manual' | 'guided' | 'medium' | 'high';
export type ExtensionType =
  | 'skill' | 'connector' | 'mcp' | 'model' | 'template' | 'external_tool';
```

**Consumed by screens:** `WorkspaceType` → Workspace Desktop header + switcher (§12.2). `Scope` → Memory Center
tabs/filters, MCP scope, Team sharing (§12.4, §12.8, §12.11, §17.1). `Confidence` → Memory confidence badge
(§12.4, §19.1). `MemoryKind` → Memory Center type filter (§12.4). `ArtifactKind` → Artifact Center categories
(§12.5). `AgentType` → Agent Center categories (§12.9). `AutonomyLevel` → Agent Builder (§12.9). `ExtensionType`
→ Win+K "Extend" section + Extend/Marketplace (§12.3, §12.7-12.8).

> **Drift watch:** `MemoryKind` OVERLAPS but does not match the existing FE `MemoryFrame.type`
> (`apps/web/src/lib/types.ts:120` = `'fact'|'event'|'insight'|'decision'|'task'|'entity'`) and the DB `frame_type`
> (`I|P|B`, an orthogonal axis — `_inventory/substrate-types.md:128`). Do NOT delete FE `type`; map it. The
> backend has no `kind` column today — `kind` is heuristically derived
> (`packages/server/src/local/routes/workspace-state.ts:82-111`) and lands in `metadata` per §3.

---

## 2. §15.3 `WorkspaceConfigV2` — MODIFY (two layers)

### 2a. Persisted config — MODIFY `WorkspaceConfig`
**Current:** `WorkspaceConfig` in `packages/hive-mind-core/src/workspace-manager.ts:5-58` (the `workspace.json`
shape). It already carries `id, name, group, icon, model, personaId, templateId, tools, skills, storageType,
storagePath, teamId, teamRole, riskLevel, created` (full mapping: `_inventory/substrate-types.md:18-42`).

**7 additive optional fields needed** (all JSON-file, NO DB migration — `_inventory/substrate-types.md:49-55`):
`description?`, `type` (`WorkspaceType`), `status` (`'active'|'paused'|'archived'`), `agentIds?`, `connectorIds?`,
`mcpIds?`, `updatedAt`, `lastActiveAt?`. Also extend `CreateWorkspaceOptions`
(`workspace-manager.ts:60-95`) for `description/type`, and add two write-side touches: stamp `updatedAt` in
`update()` (`workspace-manager.ts:222`), stamp `lastActiveAt` from the chat/agent loop.

Defaults for existing workspaces: `type` derivable from `templateId`/`group`; `status` defaults `'active'`.
Keep all extra current fields (`personality`, `team`, `storageConfig`, `budget`, `tone`,
`optimizationEnabled`, `riskClassifiedAt` — `_inventory/substrate-types.md:44-47`).

> **NEW shared alias:** export an `interface WorkspaceConfigV2` in `packages/shared/src/types.ts` matching PRD
> §15.3 exactly, and have `workspace-manager.ts` `WorkspaceConfig extends WorkspaceConfigV2` (plus its legacy
> extras). This gives the route layer the PRD contract type without moving the persistence struct.

### 2b. FE view-model — MODIFY `Workspace`
**Current:** `Workspace` in `apps/web/src/lib/types.ts:22-40` — a lossy projection (`persona: string` not
`personaId`; derived `hue/memoryCount/sessionCount/lastActive/health/budget/shared`;
`_inventory/substrate-types.md:233-237`).

Add (optional, to stay backward-compatible with derived usage): `description?`, `type?: WorkspaceType`,
`status?: 'active'|'paused'|'archived'`, `agentIds?: string[]`, `connectorIds?: string[]`, `mcpIds?: string[]`,
`updatedAt?: string`. Keep `persona`; optionally add `personaId?` and migrate consumers. Import `WorkspaceType`
from `@waggle/shared`.

**Consumed by:** Home Cockpit workspace cards (§12.1), Workspace Desktop header + right panel (§12.2),
Workspace switcher (§19.1).

---

## 3. §15.4 Memory with confidence/provenance — MODIFY FE + NEW shared + backend metadata

### 3a. Backend storage — metadata-first (one migration)
`memory_frames` has **NO `metadata` column** and no `confidence/kind/title/tags/scope/sourceId/sourceUrl/
status/updatedAt` (`_inventory/substrate-types.md:125-164`). PRD §15.4 endorses metadata-first
(PRD:1013). Lowest-risk: one additive `ALTER TABLE memory_frames ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'`
(idempotent ADD-COLUMN pattern already used for `source` — `packages/hive-mind-core/src/mind/db.ts:116-124`),
storing `{kind, title, scope, sourceId, sourceUrl, confidence, tags, evidence, relatedMemoryIds,
relatedArtifactIds, status}` as JSON. Promote `confidence REAL` to a real indexed column later IF it becomes a
primary filter axis (§12.4 "filter by confidence"). Existing columns map directly: `content`→`content`,
`created_at`→`createdAt`, `last_accessed`→`lastAccessedAt`, `importance`→`importance`, `source`→`source`.

### 3b. NEW shared `Memory` entity → `packages/shared/src/types.ts`
The route layer normalizes the DB row + `metadata` into the PRD shape (current normalizer is
`normalizeFrame`, `packages/server/src/local/routes/memory.ts:230`). Define the contract type once:

```ts
export interface Memory {
  id: string;
  kind: MemoryKind;
  title: string;
  content: string;
  scope: Scope;
  workspaceId?: string;
  teamId?: string | null;
  source: string;            // provenance class — maps from frames.source (FrameSource)
  sourceId?: string | null;
  sourceUrl?: string | null; // PRD "sourceUrl/path"
  confidence?: Confidence;   // 0-100
  importance: 'critical' | 'important' | 'normal' | 'temporary' | 'deprecated';
  evidence?: string[];
  tags?: string[];
  relatedMemoryIds?: string[];
  relatedArtifactIds?: string[];
  status: 'active' | 'low_confidence' | 'conflict' | 'deprecated' | 'archived' | 'trash';
  createdAt: string;
  updatedAt?: string;
  lastAccessedAt?: string;
}
```
`importance` reuses the existing `Importance` union from `frames.ts:20`. `source` stays a string keyed off
`FrameSource` (`frames.ts:21`) rather than re-declaring the enum (avoid the existing TS-vs-DB drift). `status`
enumerates the §12.4 Memory states (PRD:504-513) — superset of `importance='deprecated'`.

### 3c. FE view-model — MODIFY `MemoryFrame` (or add `Memory`)
**Current:** `MemoryFrame` in `apps/web/src/lib/types.ts:118-127` (`id/type/title/content/importance:number/
timestamp/workspaceId/metadata?`). It does NOT match what `/api/memory/frames` returns — a real FE/BE
mismatch to reconcile (`_inventory/substrate-types.md:239-247`).

Recommended: introduce FE `interface Memory` aligned to the shared `Memory` (import the shared type and add
only FE-derived display fields, e.g. `relevance?: number`). Keep `MemoryFrame` temporarily for back-compat,
then migrate Memory Center components off it. Do NOT silently widen `MemoryFrame.type`.

**Consumed by:** Memory Center cards/detail/filters (confidence badge, source/evidence chips, status states,
graph) — §12.4, §19.1. Home Cockpit "memory highlights" (§12.1). Workspace Desktop memory widget (§12.2).

---

## 4. §15.6 Artifact — **NEW everywhere** (largest gap)

No `Artifact` type, no artifacts table, no `/api/artifacts*` routes — entirely greenfield
(`_inventory/substrate-types.md:259-266`). Closest existing is `FileEntry` (`apps/web/src/lib/types.ts:42-50`),
a raw filesystem entry, NOT an outcome object with relations — do NOT overload it.

### 4a. NEW shared `Artifact` → `packages/shared/src/types.ts`
```ts
export type ArtifactStatus = 'draft' | 'ready' | 'in_review' | 'final' | 'archived';

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  workspaceId: string;
  teamId?: string | null;
  createdBy: string;
  source: string;            // agent | user | import | automation
  status: ArtifactStatus;
  mimeType?: string;
  storagePath?: string;
  previewUrl?: string;
  tags?: string[];
  relatedMemoryIds?: string[];
  relatedSessionIds?: string[];
  relatedTaskIds?: string[];
  relatedAgentIds?: string[];
  createdAt: string;
  updatedAt: string;
}
```
Backend: NEW `artifacts` table in `packages/hive-mind-core/src/mind/schema.ts` (keep the two-place DDL-sync
discipline noted for `install_audit`, `_inventory/substrate-types.md:171-172`) + NEW `/api/artifacts/*` routes
(PRD §16.6).

### 4b. FE — NEW `Artifact` view-model → `apps/web/src/lib/types.ts`
Import or re-shape the shared `Artifact`. **Consumed by:** Artifact Center grid/detail panel + cross-object
"Germany GTM" search (§12.5, acceptance criteria PRD:532); Workspace Desktop "key artifacts" widget (§12.2);
Win+K Search results (§12.3); `relatedArtifactIds` on Memory (§3) and Agent (§5).

---

## 5. §15.5 Agent — MODIFY shared `AgentDef` + NEW FE `Agent`

### 5a. Shared — MODIFY `AgentDef`
**Current:** `AgentDef` in `packages/shared/src/types.ts:36-47` (`id, userId, teamId, name, role, systemPrompt,
model, tools, config, createdAt`). MISSING vs §15.5: `type, goal, description, personaId, autonomyLevel,
workspaceIds, memoryScopes, skillIds, connectorIds, mcpIds, permissions, status, lastRunAt, successRate`
(`_inventory/substrate-types.md:249-257`).

Add as optional fields (keep `userId/role/systemPrompt/config` — existing callers depend on them):
```ts
type?: AgentType;
goal?: string;
description?: string;
personaId?: string;
autonomyLevel?: AutonomyLevel;
workspaceIds?: string[];
memoryScopes?: Scope[];
skillIds?: string[];
connectorIds?: string[];
mcpIds?: string[];
permissions?: string[];
status?: 'idle' | 'running' | 'paused' | 'error' | 'archived';
lastRunAt?: string;
successRate?: number;   // 0-1; derivable from execution_traces.outcome (schema.ts:206) / procedures.success_rate (schema.ts:147)
```
`type/autonomyLevel/memoryScopes` import from the §1 unions (same file). Backend: agents are not yet a
first-class persisted entity with these fields — `/api/agents/*` CRUD+run is net-new (PRD §16.7,
`_inventory/substrate-types.md:283`).

### 5b. FE — NEW `Agent` view-model → `apps/web/src/lib/types.ts`
The FE today has only thin `Persona` (`:256-272`) and `AgentStatus` (`:249-254`) — no full Agent entity.
Add an `Agent` view-model (import the extended `AgentDef`, or a FE projection of it) carrying the card fields
the screens render: goal, status, owner, workspace, capabilities, model, successRate, lastRun.

**Consumed by:** Agent Center cards/categories + Agent Builder steps (§12.9); Workspace Desktop status bar
"agents running" (§12.2); Home Cockpit (§12.1); FleetSession already partially covers runtime
(`apps/web/src/lib/types.ts:220-228`).

---

## 6. §12.6 Skill — MODIFY FE `SkillPack` (or add `Skill`)

PRD §15.2 has no standalone Skill interface, but §12.6 enumerates skill object fields explicitly: `name,
description, category, instructions, inputs, outputs, tools/data, memory access, owner, status, usage,
last used` (PRD:541).

**Current:** FE `SkillPack` (`apps/web/src/lib/types.ts:210-218`: `id, name, description, category, skills[],
installed, trust`) — a marketplace *pack*, not a single authored skill. Backend anchor is `ParsedSkill`/
`SkillFrontmatter` (`packages/agent/src/skill-frontmatter.ts:53-56`).

Recommended: NEW `interface Skill` (don't overload the pack) → place the entity in `packages/shared` (so
`/api/skills/*` CRUD, PRD §16.8, can produce it), FE view-model in `apps/web/src/lib/types.ts`:
```ts
export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  instructions?: string;
  inputs?: string[];
  outputs?: string[];
  tools?: string[];          // "tools/data"
  memoryScopes?: Scope[];    // "memory access"
  owner?: string;
  status: 'draft' | 'active' | 'archived';
  usageCount?: number;
  lastUsedAt?: string;
  trust?: 'verified' | 'community' | 'experimental';  // reuse SkillPack.trust vocabulary
}
```
Keep `SkillPack` for the marketplace-pack grouping; relate via `SkillPack.skills: string[]` → `Skill.id`.
**Consumed by:** Skills Hub tabs + Skill Builder (§12.6); Agent Builder skill assignment (§12.9); Win+K "Run"
(§12.3); Workspace `skills[]` (§2).

---

## 7. §12.10 Automation — MODIFY FE `CronJob` → NEW `Automation`

PRD has no §15 Automation interface, but §12.10 lists fields: `name, trigger, condition, actions, agent,
notification, schedule, workspace, status` (PRD:605).

**Current:** FE `CronJob` (`apps/web/src/lib/types.ts:230-238`: `id, name, schedule, workspaceId, enabled,
lastRun, nextRun`) — schedule-only, no trigger/condition/actions. Backend anchor is `CronSchedule`
(`packages/shared/src/types.ts:162-174`) + `cron-store.ts`.

Recommended: NEW `interface Automation` superset of CronJob (cron is one trigger type). Entity in
`packages/shared` (server owns `/api/automations/*`, PRD §16.10), FE view-model in `apps/web/src/lib/types.ts`:
```ts
export type AutomationTriggerType = 'schedule' | 'event' | 'manual';

export interface Automation {
  id: string;
  name: string;
  triggerType: AutomationTriggerType;
  schedule?: string;             // cron expr when triggerType === 'schedule'
  condition?: string;
  actions: string[];
  agentId?: string;
  notify?: boolean;
  workspaceId: string;
  status: 'active' | 'paused' | 'running' | 'failed';
  lastRun?: string;
  nextRun?: string;
}
```
Keep `CronJob` for the existing cron UI; `Automation` with `triggerType:'schedule'` projects onto it.
**Consumed by:** Automation Center tabs + Automation Builder (§12.10); Home Cockpit overnight/attention
(§12.1); Workspace Desktop status bar "automations active" (§12.2).

---

## 8. §12.7-12.8 Extension / Connector / MCP — MODIFY existing

### 8a. Connector — MODIFY FE `Connector`, reuse shared `ConnectorDefinition`
**Current shared (rich, keep):** `ConnectorDefinition` + `ConnectorHealth` + `ConnectorCredential` +
`ConnectorStatus` (`packages/shared/src/types.ts:249-313`) — already covers status, capabilities, category,
substrate, tools, setupGuide, lastSync via health. **Current FE (thin):** `Connector`
(`apps/web/src/lib/types.ts:280-285`: `id, name, type, status`).

Action: MODIFY the FE Connector Hub to consume the shared `ConnectorDefinition`/`ConnectorHealth` directly
(the FE already imports `@waggle/shared`), rather than the 4-field `Connector`. Optionally add `lastSyncAt?`,
`scope?: Scope` to `ConnectorHealth` for §12.7 "last sync" + §17.3 connector scope. **No new connector type
needed** — this is a consumption switch, not a new shape.
**Consumed by:** Connector Hub (§12.7), Win+K Extend (§12.3), Workspace `connectorIds[]` (§2).

### 8b. MCP — NEW FE `McpInstance`, reuse shared `McpServer` catalog
**Current:** `McpServer` catalog entry in `packages/shared/src/mcp-catalog.ts:17-28` (`id, name, description,
author, category, url, installCmd, capabilities, official, logo`) — a *catalog* entry, not an *installed
instance* with runtime state. §12.8 needs installed-instance fields: `version, status, connected to, last
used, locality, risk, permissions, logs` (PRD:573).

Recommended: NEW `interface McpInstance` in `packages/shared` (installed-state, references catalog `id`):
```ts
export interface McpInstance {
  id: string;               // catalog McpServer.id
  name: string;
  version?: string;
  status: 'installed' | 'running' | 'stopped' | 'error';
  scope: Scope;             // "locality": personal/workspace/team (§17.3)
  connectedTo?: string[];   // workspace/agent ids
  riskLevel?: 'low' | 'medium' | 'high' | 'critical';
  permissions?: string[];
  lastUsedAt?: string;
}
```
Install governance/audit already exists via `InstallAuditStore` + `AuditCapabilityType`
(`packages/core/src/install-audit.ts:22` includes `mcp|connector|skill|marketplace`) — the Extend view needs a
NEW `GET /api/extend/audit` read route (no write change; `_inventory/substrate-types.md:196-201`).
**Consumed by:** MCP Hub (§12.8), Win+K Extend (§12.3), Workspace `mcpIds[]` (§2).

> **Flag (latent, pre-existing):** `AuditRiskLevel` TS includes `'critical'` but both DDL CHECKs allow only
> `low|medium|high` (`install-audit.ts:65`, `schema.ts:130`) — a `record({riskLevel:'critical'})` throws.
> `McpInstance.riskLevel` above includes `'critical'`; if it ever writes to audit, fix the CHECK first
> (`_inventory/substrate-types.md:202-207`).

---

## 9. §12.3 Command — NEW everywhere → `packages/shared` + FE

Win+K Command Center needs a result/command shape (§12.3, §16.3 `/api/command/*` all net-new,
`_inventory/substrate-types.md:282`). No existing type.

NEW shared `Command` + `CommandResult`:
```ts
export type CommandCategory = 'search' | 'launch' | 'create' | 'run' | 'navigate' | 'extend';
export type CommandResultType =
  | 'workspace' | 'memory' | 'artifact' | 'session' | 'person'
  | 'agent' | 'skill' | 'command' | 'connector' | 'mcp' | 'automation';

export interface CommandResult {
  id: string;
  type: CommandResultType;
  title: string;
  subtitle?: string;
  category: CommandCategory;
  icon?: string;
  requiresApproval?: boolean;   // §12.3 permission-gated → approval prompt
  action?: { route?: string; endpoint?: string; payload?: Record<string, unknown> };
}
```
`CommandResultType` deliberately spans every searchable object class (§12.3 FR "search across workspaces,
memory, artifacts, sessions, people, agents, skills, commands, connectors, MCPs"). FE imports these for the
command palette and result grouping.
**Consumed by:** Win+K Command Center (§12.3) — the only consumer, but cross-cutting (it indexes every entity).

---

## 10. Summary table

| Type | NEW / MODIFY | Current (cite) | Lives in | Primary screens |
|---|---|---|---|---|
| §15.2 unions (8) | **NEW** | none (`_inventory:218-229`) | `packages/shared/src/types.ts` | all (vocabulary) |
| `WorkspaceConfigV2` | MODIFY | `workspace-manager.ts:5-58` + FE `Workspace` `types.ts:22-40` | shared (alias) + hive-mind-core (struct) + FE | §12.1, §12.2, switcher |
| `Memory` (+confidence/provenance) | MODIFY FE / NEW shared / +metadata col | FE `MemoryFrame` `types.ts:118-127`; `memory_frames` no metadata col (`_inventory:150-153`) | shared entity + FE view-model + DB migration | §12.4, §12.1, §12.2 |
| `Artifact` | **NEW** (all layers) | none (`_inventory:259-266`) | shared + DB table + FE | §12.5, §12.2, §12.3 |
| `Agent` | MODIFY shared / NEW FE | `AgentDef` `shared/types.ts:36-47` | shared (extend) + FE view-model | §12.9, §12.2 |
| `Skill` | MODIFY FE / NEW shared | FE `SkillPack` `types.ts:210-218`; `ParsedSkill` `skill-frontmatter.ts:53` | shared + FE | §12.6, §12.9 |
| `Automation` | MODIFY FE / NEW shared | FE `CronJob` `types.ts:230-238`; `CronSchedule` `shared:162-174` | shared + FE | §12.10, §12.1 |
| Connector | MODIFY (consume existing) | FE `Connector` `types.ts:280-285`; shared `ConnectorDefinition` `:276-302` | reuse shared | §12.7 |
| `McpInstance` | **NEW** (instance) | catalog `McpServer` `mcp-catalog.ts:17-28` | shared + FE | §12.8 |
| `Command`/`CommandResult` | **NEW** | none | shared + FE | §12.3 |

**Migration footprint:** WorkspaceConfigV2 = JSON-file only (no DB). Memory = 1 idempotent `ADD COLUMN metadata`.
Artifact = 1 new table + routes. Everything else is TS-type + route work (server CRUD net-new per PRD §16). No
literal-union duplication across files — enums live once in `packages/shared` and the FE imports them.
