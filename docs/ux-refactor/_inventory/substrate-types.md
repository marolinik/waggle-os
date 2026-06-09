# Substrate & Types Inventory — UX Refactor

> Source-grounded inventory for the Waggle OS UX-refactor plan. Every claim cites a real file
> path (and line where load-bearing). Execution model is **in-place incremental refactor** of the
> existing substrate, not a rebuild. PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.

---

## (a) WorkspaceConfig — current fields vs PRD §15.3 `WorkspaceConfigV2`

**Current type:** `WorkspaceConfig` in `packages/hive-mind-core/src/workspace-manager.ts:5-58`
(the persisted `workspace.json` shape; CRUD via `WorkspaceManager.create/list/get/update/delete`,
same file `:124-244`). The frontend mirror is `Workspace` in `apps/web/src/lib/types.ts:22-40`
(a DIFFERENT, lossy shape — see delta in §(e)).

PRD §15.3 target: `WorkspaceConfigV2` (PRD lines 961-985).

| PRD V2 field | Present in current `WorkspaceConfig`? | Notes / source |
|---|---|---|
| `id` | ✅ present | `:6` |
| `name` | ✅ present | `:7` |
| `description` | ❌ **MISSING** | not in config; would be new persisted field |
| `type` (`WorkspaceType`) | ❌ **MISSING** | no workspace-type concept; only `group` (free string) + `templateId` exist (`:8`, `:15`) |
| `group` | ✅ present | `:8` |
| `icon` | ✅ present | `:9` |
| `status` (`active`/`paused`/`archived`) | ❌ **MISSING** | no lifecycle status field anywhere in config |
| `model` | ✅ present | `:10` |
| `personaId` | ✅ present | `:13` |
| `templateId` | ✅ present | `:15` |
| `tools` | ✅ present | `:16` |
| `skills` | ✅ present | `:17` |
| `agentIds` | ❌ **MISSING** | no agent-membership array on workspace |
| `connectorIds` | ❌ **MISSING** | connectors are global (`/api/connectors`), not workspace-scoped in config |
| `mcpIds` | ❌ **MISSING** | MCPs tracked via `install_audit` / marketplace, not on workspace config |
| `storageType` | ✅ present | `:22` (`'virtual' \| 'local' \| 'team'`) — matches V2 exactly |
| `storagePath` | ✅ present | `:24` |
| `teamId` | ✅ present | `:31` |
| `teamRole` (`owner/admin/member/viewer`) | ✅ present | `:35` — matches V2 union exactly |
| `riskLevel` (`minimal/limited/high-risk/unacceptable`) | ✅ present | `:55` (`AIActRiskLevel`, defined `:3`) — matches V2 union exactly |
| `created` | ✅ present | `:27` (ISO string) |
| `updatedAt` | ❌ **MISSING** | `update()` overwrites `workspace.json` but stamps NO `updatedAt` (`:222-234`). Only `riskClassifiedAt` is auto-stamped on risk change (`:226-229`). |
| `lastActiveAt` | ❌ **MISSING** | not persisted. Frontend `Workspace.lastActive` (`apps/web/src/lib/types.ts:32`) is DERIVED at read time from session-file mtimes / frame `created_at` (see `workspace-context.ts:375-387` legacy path), never written back to config. |

**Extra current fields NOT in PRD V2 (keep — do not drop):** `personality` (`:11`),
`team` (legacy nullable string, `:18`), `storageConfig` (`:26`), `teamServerUrl`/`teamUserId`
(`:33`,`:37`), `budget` (`:41`), `tone` (`:45`), `optimizationEnabled`/`optimizationBudget`
(`:49`,`:51`), `riskClassifiedAt` (`:57`).

**Migration verdict:** All 7 missing V2 fields (`description`, `type`, `status`, `agentIds`,
`connectorIds`, `mcpIds`, `updatedAt`, `lastActiveAt`) live in a JSON file (`workspace.json`),
NOT in SQLite — so there is **no DB migration**. They are pure additive optional fields on the
`WorkspaceConfig` interface + `CreateWorkspaceOptions` (`workspace-manager.ts:60-95`), plus two
write-side touches: stamp `updatedAt` in `update()` (`:222`) and stamp `lastActiveAt` from the
agent loop / chat route. `type` and `status` need defaults for the ~existing workspaces
(`type` derivable from `templateId`/`group`; `status` defaults `'active'`).

---

## (b) Workspace-state builder outputs vs Home Cockpit + Workspace Desktop needs

**Builders (two layers):**
- `buildWorkspaceState()` → `WorkspaceState` — `packages/server/src/local/workspace-state.ts:234-311`.
  Outputs (interface `:38-55`): `active`, `openQuestions`, `pending`, `blocked`, `completed`,
  `stale`, `recentDecisions`, `nextActions`. Each is `StateItem[]` (`:30-36`:
  `content / freshness('fresh'|'aging'|'stale') / source('memory'|'session'|'awareness') /
  sourceId / dateLastTouched`), except `nextActions: string[]`.
- `buildWorkspaceNowBlock()` → `WorkspaceNowBlock` — `packages/server/src/local/routes/workspace-context.ts:191-404`.
  Wraps `WorkspaceState` for backward-compat (`:14-29`): `workspaceName`, `summary`,
  `recentDecisions[]`, `activeThreads[]`, `progressItems[]`, `nextActions[]`, `greeting`,
  `pendingTasks[]`, `upcomingSchedules[]`, plus the raw `structuredState`.

**Data sources:** memory frames (`memory_frames`, via `MindDB`), session JSONL logs
(`extractProgressItems`/`extractOpenQuestions`/`classifyThreads` from `routes/sessions.js`,
imported `workspace-state.ts:16-23`), awareness layer (`awareness` table,
`extractAwarenessItems` `:122-138`), and cron schedules (`buildUpcomingSchedules`
`workspace-context.ts:169-187`). Freshness is timestamp-derived, not type-derived (`:63-72`).

### Coverage vs PRD §12.1 Home Cockpit (PRD lines 384-393)

| Home Cockpit FR | Backed by current builder? | Gap |
|---|---|---|
| Greeting + name + date/time | Partial — `greeting` exists (`buildTimeAwareGreeting` `workspace-context.ts:119-152`) | Greeting is workspace-scoped + time/inactivity-based; carries NO user name (identity name lives in `identity` table, not threaded in). Home is cross-workspace; builder is single-workspace. |
| Active/recent workspaces ranked by recency+priority | ❌ **MISSING** | Builder is **per-workspace**. No cross-workspace ranking aggregator exists. Home needs a NEW `GET /api/home/briefing` that fans out over `WorkspaceManager.list()` and ranks. |
| Overnight summary (memories consolidated, artifacts created, automations completed, failures) | ❌ **MISSING** | No "overnight"/time-windowed delta. `completed` exists but is session-derived, not a since-last-login diff. No artifact or automation counters. PRD §16.1 `GET /api/home/overnight` is net-new. |
| Upcoming meetings/events/tasks | Partial | `upcomingSchedules` (cron only, `:169-187`) + `pendingTasks` (`:158-163`). No calendar/meeting source. |
| Suggested next actions | ✅ present | `nextActions` (`deriveNextActions` `workspace-state.ts:182-218`) — but per-workspace, not blended cross-workspace. |
| Quick capture (note/task/link/file) | ❌ **MISSING** | No capture endpoint. PRD §16.1 `POST /api/quick-capture` is net-new (can write to `memory_frames` + `awareness`). |

### Coverage vs PRD §12.2 Workspace Desktop (PRD lines 423-429)

| Workspace Desktop need | Backed? | Gap |
|---|---|---|
| Header: name, **type**, **status**, team/avatars, share | Partial | name/team present; `type`+`status` are the missing `WorkspaceConfigV2` fields (§a). |
| Tabs: Overview/Chat/Research/Artifacts/Memory/Tasks/Timeline/Settings | Partial | Overview = `WorkspaceState`; Memory = `/api/memory/frames`; Timeline = `ai_interactions`/`execution_traces`; **Artifacts has no backing entity at all** (see §e). Tasks ≈ `pending`/`blocked` StateItems + `awareness` (no first-class task store locally). |
| Canvas widgets: chat, key artifacts, tasks, memory highlights, research, recent activity | Partial | memory highlights = `recentDecisions`/frames; recent activity = `active`/`activeThreads`; **artifacts widget unbacked**; "research overview" unbacked. |
| Right panel: info, members, last activity, quick actions | Partial | last activity derivable; members from `/api/team/members`; "last activity" needs `lastActiveAt` (§a missing). |
| Status bar: agents running, automations active, MCPs connected | Partial | agents via `/api/fleet`; MCPs connected derivable from `install_audit`/connectors; automations = cron. No single aggregate. |

**Verdict:** The per-workspace builder is a strong seed for **Workspace Desktop Overview** and
maps cleanly to `GET /api/workspaces/:id/state` (PRD §16.2 — note: route does NOT exist yet;
only `/api/workspaces/:id/context` exists, `workspaces.ts:311`). **Home Cockpit needs a NEW
cross-workspace aggregation layer** (`/api/home/briefing`, `/api/home/overnight`,
`/api/quick-capture` — all net-new) that fans the existing single-workspace builder over
`WorkspaceManager.list()` and adds overnight-delta + quick-capture write paths.

---

## (c) Mind schema tables & Memory provenance/confidence (PRD §15.4)

**Schema:** `packages/hive-mind-core/src/mind/schema.ts` (`SCHEMA_VERSION = '1'`, `:1`). Tables:
`meta`, `identity` (`:11`), `awareness` (`:24`), `sessions` (`:35`), **`memory_frames`** (`:47`),
`memory_frames_fts` (`:68`), `memory_frames_vec` (vec0 1024-d, `VEC_TABLE_SQL :261`),
`knowledge_entities` (`:75`), `knowledge_relations` (`:88`), `improvement_signals` (`:103`),
`install_audit` (`:119`), `procedures` (`:141`), `ai_interactions` (`:155`),
`execution_traces` (`:199`), `evolution_runs` (`:220`), `harvest_sources` (`:246`).

**`memory_frames` columns** (`:47-62`): `id, frame_type('I'|'P'|'B'), gop_id, t, base_frame_id,
content, importance(critical/important/normal/temporary/deprecated), source(user_stated/
tool_verified/agent_inferred/import/system), access_count, created_at, last_accessed`.
TS mirror: `MemoryFrame` in `mind/frames.ts:23-35` (note: `FrameSource` union in TS `:21` is
WIDER — adds `personal/workspace/team_sync` — than the DB CHECK; a latent drift).

### PRD §15.4 field-by-field (PRD lines 990-1013)

| PRD memory field | Backing in `memory_frames`? | Gap / where it fits |
|---|---|---|
| `id` | ✅ `id` | — |
| `kind` (`fact/decision/task/preference/strategy/learning/goal/entity`) | ❌ **MISSING** | Only `frame_type` (I/P/B) exists — an orthogonal axis. PRD `MemoryKind` is currently DERIVED heuristically (LIKE-matching content for "decision" in `workspace-state.ts:82-111`). Needs a `kind` column OR metadata. |
| `title` | ❌ **MISSING** | Frames are content-only; title is synthesized from first line (`workspace-state.ts:97-101`). |
| `content` | ✅ `content` | — |
| `scope` (`personal/workspace/team/organization`) | ⚠️ **IMPLICIT** | Not a column. Scope is encoded by WHICH `.mind` file the frame lives in (personal.mind vs workspace.mind), surfaced as `_mind` tag in the API (`memory.ts:200,209`). No `team`/`organization` scope on a single frame. |
| `workspaceId` | ⚠️ **IMPLICIT** | Per-file, not per-row (frames live in that workspace's `.mind`). |
| `teamId` | ❌ **MISSING** | team frames are a separate sync path; no `teamId` on frame. |
| `source` (origin label) | ✅ `source` | `:56` — but enum is provenance-CLASS (`user_stated`/`import`/...), not a source id/url. |
| `sourceId` | ❌ **MISSING** | Harvest provenance is embedded as a text prefix `[hm session:… src:…]` in `content` (`frames.ts:51-62`, `stripHmPrefix`), NOT a structured column. |
| `sourceUrl/path` | ❌ **MISSING** | Same — only in the text prefix / not structured. (`harvest_sources.source_path` exists at source-level `:251`, not per-frame.) |
| `confidence` (0-100) | ❌ **MISSING on frames** | NO confidence column on `memory_frames`. (Confidence DOES exist on `knowledge_relations.confidence REAL` `:93` — graph edges only.) Closest frame proxy is `importance` (categorical) + `source` (trust class). |
| `importance` | ✅ `importance` | `:54` — categorical, not numeric. |
| `evidence[]` | ❌ **MISSING** | No evidence list. Could map to FTS hits / `base_frame_id` lineage (`:52`) / related entities, but no first-class field. |
| `tags[]` | ❌ **MISSING** | No tags column. |
| `relatedMemoryIds[]` | ⚠️ Partial | `base_frame_id` (`:52`) gives I→P lineage only; no general relation. |
| `relatedArtifactIds[]` | ❌ **MISSING** | No artifact entity exists (§e). |
| `createdAt` | ✅ `created_at` | — |
| `updatedAt` | ❌ **MISSING** | Frames are append-only (P-frames supersede); `last_accessed` (`:60`) is access-time, not edit-time. |
| `lastAccessedAt` | ✅ `last_accessed` | `:60` |
| `status` | ⚠️ Partial | `importance='deprecated'` (`:55`) ≈ archived/deprecated; no explicit `active/conflict/trash` status. PRD §12.4 Memory tabs need Active/Trash + conflict/low-confidence states (PRD 498,504-513). |

### Metadata vs migration verdict

**Critical:** `memory_frames` has **NO `metadata` column** (unlike `awareness.metadata`,
`knowledge_entities.properties`, `knowledge_relations.properties`, `improvement_signals.metadata`,
`evolution_runs.artifacts_json` — all of which have a JSON blob). PRD §15.4's "use `metadata`
initially" assumes a metadata column that does not exist on frames today.

The migration runner already does idempotent additive `ADD COLUMN` on `memory_frames`
(it added `source` — `mind/db.ts:116-124`, pattern: `pragma_table_info` guard + `ALTER TABLE …
ADD COLUMN`). So the lowest-risk path is one migration adding a single nullable
`metadata TEXT NOT NULL DEFAULT '{}'` column to `memory_frames`, storing
`{kind, title, scope, sourceId, sourceUrl, confidence, tags, evidence, relatedMemoryIds, status}`
as JSON. This avoids touching the FTS/vec virtual tables and the IPB scoring logic.
PRD §15.4 itself endorses metadata-first, explicit-fields-later (PRD line 1013). If
`confidence` becomes a primary query/filter axis (PRD §12.4 "filter by confidence",
"low-confidence surfaced for review"), promote `confidence REAL` to a real column in a later
migration (precedent: same ADD-COLUMN pattern) so it's indexable.

---

## (d) install-audit — capabilities for Extend governance

**Store:** `InstallAuditStore` in `packages/core/src/install-audit.ts` (operates on `.mind`).
DDL duplicated in two places that MUST stay in sync (`install-audit.ts:54-74` and
`schema.ts:119-138` — comment warns of prior drift crash, `schema.ts:122-126`).

**Audit entry shape** (`InstallAuditEntry` `:24-37`):
`id, timestamp, capability_name, capability_type, source, version, risk_level, trust_source,
approval_class, action, initiator, detail`.

**Enums (governance-relevant):**
- `AuditCapabilityType` (`:22`): `native | skill | plugin | mcp | connector | marketplace` —
  covers the entire PRD Extend layer (Connectors/MCPs/Marketplace/Skills).
- `AuditAction` (`:15`): `proposed | approved | installed | rejected | failed | blocked`.
- `AuditTrustSource` (`:17-19`): `builtin | starter_pack | local_user | third_party_verified |
  third_party_unverified | unknown | security-gate`.
- `AuditApprovalClass` (`:20`): `standard | elevated | critical | blocked`.
- `AuditInitiator` (`:21`): `agent | user | system`.
- `AuditRiskLevel` (TS `:16`): `low | medium | high | critical`.

**Read API (in-store, not yet HTTP):** `getByCapability()` (`:125`), `getByAction()` (`:132`),
`getRecent(limit)` (`:139`), `getAll()` (`:146`).

**Write path (live):** the marketplace install route calls `fastify.auditStore.record(...)` on
every SecurityGate verdict (CRITICAL→403, HIGH gated, MEDIUM/LOW logged) —
`packages/server/src/local/routes/marketplace.ts:224-319`. So an audit trail is already being
written for installs.

**Gaps for Extend governance UI:**
1. **No HTTP endpoint surfaces the audit trail.** `getRecent`/`getByCapability` have no route
   (grep over `packages/server/src/local/routes` finds writes only). The Extend governance view
   (who installed what, when, risk, trust, approval) needs a NEW read route, e.g.
   `GET /api/extend/audit` — there is no PRD §16 endpoint for this; it's an implied addition
   to §16.9.
2. **`risk_level` enum drift (latent bug, not session-induced).** TS `AuditRiskLevel` includes
   `'critical'` (`install-audit.ts:16`) but BOTH DDL CHECK constraints only allow
   `('low','medium','high')` (`install-audit.ts:65` and `schema.ts:130`). A `record()` with
   `riskLevel:'critical'` would throw a CHECK violation. The marketplace route sidesteps this by
   mapping CRITICAL severity to `riskLevel:'high'` + `approvalClass:'blocked'` — but any future
   caller passing `'critical'` crashes. Flag for the plan.
3. **Audit is per-`.mind` (per-workspace).** Governance across all installs (the Extend layer is
   global) requires either querying personal.mind or aggregating — confirm which `.mind` the
   `auditStore` decorator binds to.

---

## (e) Frontend types delta vs PRD §15.2-15.6

**Frontend types:** `apps/web/src/lib/types.ts`. Shared/server types: `packages/shared/src/types.ts`.

### PRD §15.2 target literal unions (PRD 944-954) — NONE currently exist in frontend

| PRD union | In `apps/web/src/lib/types.ts`? | Closest existing |
|---|---|---|
| `WorkspaceType` | ❌ **MISSING** | none |
| `Scope` (`personal/workspace/team/organization`) | ❌ **MISSING** | `_mind` informal tag only |
| `Confidence` (0-100) | ❌ **MISSING** | `MemoryFrame.importance: number` (`:124`) — different axis |
| `MemoryKind` | ❌ **MISSING** | `MemoryFrame.type` (`:120`: `fact/event/insight/decision/task/entity`) — OVERLAPS but mismatched (FE has `event`/`insight`; PRD has `preference`/`strategy`/`learning`/`goal`) |
| `ArtifactKind` | ❌ **MISSING** | none — no Artifact type at all |
| `AgentType` | ❌ **MISSING** | none (`AgentDef` in shared has no `type`) |
| `AutonomyLevel` | ❌ **MISSING** | none in FE types (autonomy exists conceptually in agent runtime) |
| `ExtensionType` | ❌ **MISSING** | none |

### §15.2 Frontend `Workspace` (types.ts:22-40) vs `WorkspaceConfigV2`

The FE `Workspace` is a **lossy projection** distinct from the persisted `WorkspaceConfig`:
has `persona` (string, vs config `personaId`), `hue`/`memoryCount`/`sessionCount`/`lastActive`/
`health`/`budget{used,limit}`/`shared` (DERIVED display fields, not persisted), but LACKS
`type`, `status`, `description`, `agentIds`, `connectorIds`, `mcpIds`, `updatedAt`. To reach V2
the FE type needs the same 7 additions as §(a) plus alignment of `persona`→`personaId`.

### §15.4 Memory — FE `MemoryFrame` (types.ts:118-127)

FE shape: `id, type(MemoryKind-ish), title, content, importance(number), timestamp, workspaceId,
metadata?`. Closer to PRD than the DB row (it HAS `title`, `metadata`, `workspaceId`), but
MISSING: `kind` (uses `type`), `scope`, `teamId`, `source`, `sourceId`, `sourceUrl`, `confidence`,
`evidence[]`, `tags[]`, `relatedMemoryIds[]`, `relatedArtifactIds[]`, `status`, `updatedAt`,
`lastAccessedAt`. Note the FE `MemoryFrame` does NOT match what `/api/memory/frames` returns
(server returns the raw DB row shape + `_mind`, normalized via `normalizeFrame`,
`memory.ts:230`) — a real FE/BE contract mismatch to reconcile.

### §15.5 Agents — `AgentDef` (`packages/shared/src/types.ts:36-47`)

Has: `id, userId, teamId, name, role, systemPrompt, model, tools, config, createdAt`.
MISSING vs PRD §15.5: `type(AgentType)`, `goal`, `description`, `personaId`, `autonomyLevel`,
`workspaceIds`, `memoryScopes`, `skillIds`, `connectorIds`, `mcpIds`, `permissions`, `status`,
`lastRunAt`, `successRate`. (`successRate` partially exists on `procedures.success_rate`
`schema.ts:147` and per-trace outcome in `execution_traces` `schema.ts:206` — derivable.)
FE also has a thin `Persona` (`types.ts:256-272`) and `AgentStatus` (`:249-254`) but no
full Agent entity.

### §15.6 Artifacts — **NO backing entity anywhere**

- No `Artifact` type in `apps/web/src/lib/types.ts` (closest is `FileEntry` `:42-50`:
  `name/path/type/size/mimeType/modifiedAt/createdAt` — a raw filesystem entry, not an outcome
  object with relations).
- No artifacts table in `schema.ts`. No `/api/artifacts*` routes (PRD §16.6 is entirely net-new).
- ALL of PRD §15.6 (`kind, status, previewUrl, relatedMemoryIds, relatedSessionIds,
  relatedTaskIds, relatedAgentIds`, etc.) is greenfield. This is the single largest entity gap.

---

## Cross-cutting: API contract delta (PRD §16 vs live routes)

Grounded against `packages/server/src/local/routes/*`:

- **Exists, reusable:** `GET /api/workspaces` (`workspaces.ts:101`), `POST /api/workspaces`
  (`:135`), `GET /api/workspaces/:id/context` (`:311`); `/api/memory/frames` GET/POST/PATCH/DELETE
  (`memory.ts:188,237,448,551`), `/api/memory/search` (`:120`), `/api/memory/stats` (`:391`);
  `/api/harvest/preview|commit|sources` (`harvest.ts:221,243,538`); marketplace + connectors +
  personas + compliance + fleet + workflows routes.
- **PRD §16 endpoints that DO NOT EXIST (net-new):** `/api/home/briefing`, `/api/quick-capture`,
  `/api/home/overnight` (§16.1); `/api/workspaces/:id/state`, `/api/workspaces/:id/activity`
  (§16.2 — only `/context` exists); `/api/command/*` (§16.3); the PRD's `/api/memory` (current is
  `/api/memory/frames`), `/api/memory/merge`, `/api/memory/graph`, `/api/memory/:id/archive`
  (§16.4); ALL `/api/artifacts/*` (§16.6); `/api/agents/*` CRUD+run (§16.7); most `/api/skills/*`
  and `/api/automations/*`; and the missing **install-audit read route** for Extend governance (§d).

These are the full-stack hooks the plan must scope (locked SCOPE: net-new + extended backend APIs).
