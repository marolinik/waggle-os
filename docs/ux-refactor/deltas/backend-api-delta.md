# Backend API Delta — Waggle OS UX Refactor (Master List)

> **Purpose.** The single, consolidated, de-duplicated, **ordered** master list of every backend
> endpoint the UX refactor must build or extend, plus every `.mind`/relational schema migration
> required. This is the build contract for the LOCKED execution model: **in-place incremental
> refactor** of `apps/web` + targeted **local Fastify sidecar** extensions. Every endpoint is built
> over the existing substrate — no new database, minimal-to-zero SQLite migration (see §M).
>
> **Sources (all read & grounded):** PRD §16 (`docs/.../Waggle_OS_UX_Refactor_PRD.md:1060-1158`),
> PRD §8/§21 phase+sprint structure (`:212-253`, `:1304-1374`), PRD §15 data model (`:918-1057`);
> the 22 gap cards (`docs/ux-refactor/gap-cards/S00–S21`); the route/substrate inventories
> (`docs/ux-refactor/_inventory/{backend-routes,substrate-types,frontend}.md`); the audited
> backend-map (`docs/backend-map/sections/03a–03g`); and spot-verified live source under
> `packages/server/src/local/routes/*.ts`, `packages/server/src/local/workspace-state.ts`,
> `packages/hive-mind-core/src/{workspace-manager,mind/schema,mind/db}.ts`,
> `packages/core/src/{install-audit,cron-store}.ts`.
>
> **Scope.** Everything is the **Local Sidecar** (`packages/server/src/local/index.ts` →
> `buildLocalServer()`, loopback `:3333`, flat `/api/*`, Bearer session-token). The desktop frontend
> talks ONLY to this server. The Clerk-gated **Cloud** server (`packages/server/src/routes/*.ts`) is
> out of scope — where its routes collide with PRD paths (notably `/api/agents/*`) the sidecar work is
> still **net-new locally** and flagged.

---

## How to read this

Each row carries:

- **Method + Path** — the PRD/refactor contract path (PRD-literal where §16 names it).
- **Disposition** — `NET-NEW` (no route serves this; build it) · `EXTEND` (a real handler exists;
  add alias/param/field/behavior) · `NET-NEW (thin dispatcher/alias)` (new path, delegates wholly to
  existing handlers, no new logic).
- **Build target** — the exact route file to create or the existing file/handler/builder to extend
  (with line where load-bearing). **Verified absent:** `agents.ts`, `artifacts.ts`, `home.ts`,
  `command.ts`, `mcps.ts`, `automations.ts`, `quick-capture.ts` do **not** exist under
  `packages/server/src/local/routes/` (grep-confirmed) — all are net-new files.
- **Substrate** — the store(s) it reads/writes.
- **Shape** — a 3–5 line request/response sketch.
- **Screens** — gap-card IDs that consume it.

Counts are in §Counts at the bottom. **De-dup note:** §16 lists 65 endpoints but several are consumed
by multiple screens (e.g. `/api/workspaces/:id/state` → S01+S02; `/api/skills/*` → S06+S19;
`/api/agents/*` → S09+S18; the cron→automations aliases → S11+S20; connector/MCP → S07+S08+S14+S17;
harvest → S15+S16). This master list states each endpoint **once**, attributing all consuming screens.
Endpoints that **EXIST as-is** with zero backend work (e.g. `GET /api/workspaces`, `GET /api/connectors`,
`GET /api/memory/graph`, the team CRUD core, the harvest engine) are **excluded** — they need only FE
wiring. Only NET-NEW + EXTEND backend work is listed.

---

## Phase 0 — Architecture alignment (PRD §8 Phase 0 / §21 Sprint 1)

No new endpoints. Backend-relevant work is **type alignment + shared additive fields** that later
phases write through. Land these first because Phase 1–5 write paths depend on them.

| Item | Disposition | Build target | Substrate | Notes / shape |
|---|---|---|---|---|
| `WorkspaceConfig` V2 additive fields | EXTEND (no route, no migration) | `packages/hive-mind-core/src/workspace-manager.ts:5-58` (interface) + `CreateWorkspaceOptions :60-95` | `workspace.json` (file, NOT SQLite) | Add optional `description, type(WorkspaceType), status('active'\|'paused'\|'archived'), agentIds[], connectorIds[], mcpIds[], updatedAt, lastActiveAt`. Default `status:'active'`; derive `type` from `templateId`/`group` for existing workspaces. **No DB migration** (JSON file). Consumed by S02/S17. |
| Stamp `updatedAt` on write | EXTEND | `workspace-manager.ts:222` (`update()` currently stamps nothing but `riskClassifiedAt`) | `workspace.json` | One-line write-side touch. |
| Stamp `lastActiveAt` | EXTEND | agent loop / chat route write-back | `workspace.json` | Currently `lastActive` is DERIVED at read from session mtimes (`workspace-context.ts:375-387`); persist it. |
| Shared frontend type unions | EXTEND (FE only) | `apps/web/src/lib/types.ts` | — | Add `WorkspaceType, Scope, Confidence, MemoryKind, ArtifactKind, AgentType, AutonomyLevel, ExtensionType` (PRD §15.2). Reconcile FE `MemoryFrame`/`Workspace` lossy projections against API shapes (substrate-types §e). |

---

## Phase 1 — Core runtime: Home, Workspace Desktop, Command Center (PRD §8 Phase 1 / §21 Sprint 2–3)

### 1a. Home Cockpit + Quick Capture (S01) — new `home.ts` + extend `memory.ts`

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/home/briefing` | **NET-NEW** | new `routes/home.ts`; fans `buildWorkspaceState()` (`workspace-state.ts:234`) / `buildWorkspaceNowBlock()` (`workspace-context.ts:191`) over `WorkspaceManager.list()` and ranks | `memory_frames`, session JSONL, `awareness`, `cron_schedules`, `identity` (for name) | `→ { greeting, userName, date, workspaces:[{id,name,rank,summary,pending,nextActions}], suggestedActions[] }`. Cross-workspace ranking aggregator (per-workspace builder is the seed; no cross-WS ranker exists today). | S01 |
| `GET /api/home/overnight` | **NET-NEW** | new `routes/home.ts`; aggregates over since-last-login window | `events`/`ai_interactions`, `notifications`, `cron_execution_history`, `memory_frames` | `?since=<iso> → { memoriesAdded, artifactsCreated, automationsCompleted, failures:[{source,error}], window:{from,to} }`. No time-windowed delta exists today. | S01 |
| `POST /api/quick-capture` | **EXTEND** (thin handler delegating to memory write) | `routes/memory.ts` `POST /api/memory/frames` (`:248`) as the write primitive; new thin handler or alias | `memory_frames` (personal `.mind`) + `awareness` (for `kind:task`) + `POST /api/ingest` (for `kind:file`) | `{ kind:'note'\|'task'\|'link'\|'file', content, workspaceId? } → { frameId }`. Defaults to personal mind, stamps `source:'quick-capture'`; `task` also writes an awareness row so it surfaces in `nextActions`. **No migration.** | S01 |

### 1b. Workspace Desktop (S02) — extend `workspaces.ts`

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/workspaces/:id/state` | **EXTEND** (thin route) | new thin route in `workspaces.ts` returning the `buildWorkspaceState()` sub-object already computed inside `/context` (`workspaces.ts:311`) | `memory_frames` + session JSONL + `awareness` | `→ WorkspaceState { active, openQuestions, pending, blocked, completed, stale, recentDecisions, nextActions }` (`workspace-state.ts:38-55`). `pending`+`blocked` seed the Tasks tab. No migration. | S01, S02 |
| `GET /api/workspaces/:id/activity` | **EXTEND** (thin alias) | new thin route over `GET /api/events?workspaceId=` (`events.ts`) | `ai_interactions` / `execution_traces` / `audit_events` | `?limit= → { events:[{ts,type,actor,summary}] }`. Per-workspace audit feed. No migration. | S02 |

> **No backend work** for S02 Tasks (`tasks.ts` CRUD EXISTS), Members (`/api/team/members` EXISTS),
> or status-bar feeds (`/api/fleet`, `/api/cron`, `/api/capabilities/status` all EXIST — compose
> client-side; an aggregate `/status` route is optional and deferred). Artifacts tab is **S05's**
> scope; S02 ships an interim file-registry view via existing `GET /api/workspaces/:id/files`.

### 1c. Command Center (Ctrl+K) (S00, S03) — new `command.ts`

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/command/search?q=` | **NET-NEW** | new `routes/command.ts` federating route | reads `/api/memory/search` (`memory.ts:120`), `WorkspaceManager.list()`, `/api/skills`, `/api/workspaces/:id/sessions/search` (`sessions.ts`) — **no new store** | `?q=&scope= → { results:[CommandResult{id,kind:'search'\|'launch'\|'create'\|'run'\|'navigate'\|'extend', objectType, title, subtitle?, score, requiresApproval?, payload?}] }`. Federates over ~4 substrates. | S00, S03 |
| `POST /api/command/execute` | **EXTEND** | existing `POST /api/commands/execute` (note **plural**, `commands.ts`) — extend for navigate/create/run/extend dispatch, OR add a singular `/command/execute` alias | command runtime + dispatch targets | `{ command, objectType?, payload?, workspaceId? } → { ok, result? }`. Current runs slash-commands with a subset CommandContext; PRD's palette execute is broader. | S00, S03 |
| `GET /api/command/recent` | **NET-NEW** (or client-derive first) | new `routes/command.ts` reading `ai_interactions` (or derive from session/event history) | `ai_interactions` (read-only) | `→ { recent:[{command,ts,objectType}] }`. No schema change. Cheapest v1 = client-side from session history; promote to server when a consumer needs cross-device. | S03 |
| `GET /api/command/suggestions` | **NET-NEW** | new `routes/command.ts` reusing `deriveNextActions` (`workspace-state.ts:182-218`) + folding in `/api/skills/suggestions` | read-only over `memory_frames`/`awareness`/`cron` | `→ { suggestions:[CommandResult] }`. No migration. | S03 |

---

## Phase 2 — Work layer: Memory Center, Artifact Center, Workspace Creation, Onboarding (PRD §8 Phase 2 / §21 Sprint 4–5)

### 2a. Memory Center (S04, S16) — extend `memory.ts` + ONE optional migration

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/memory` | **EXTEND** (alias) | accept bare path on existing `GET /api/memory/frames` (`memory.ts:188`) | `memory_frames` | `?scope=&kind=&confidence=&status= → { frames:[...] }`. Alias only. | S04 |
| `GET /api/memory/:id` | **NET-NEW** (thin) | new thin read in `memory.ts` over `FrameStore.getById(id)` (no `GET .../frames/:id` exists today) | `memory_frames` | `→ { frame }`. Drawer detail. No migration. | S04 |
| `POST /api/memory` | **EXTEND** (alias) | alias on `POST /api/memory/frames` (`memory.ts:248`) | `memory_frames` | `{ kind,title,content,scope,tags? } → { id }`. | S04 |
| `PATCH /api/memory/:id` | **EXTEND** | extend `PUT /api/memory/frames/:id` (`memory.ts:448`) to accept `PATCH` + bare `:id` | `memory_frames` (`FrameStore.update`) | `{ content?, importance?, status?, tags? } → { ok }`. | S04 |
| `POST /api/memory/:id/archive` | **NET-NEW** (thin) | new thin route; model archive as `FrameStore.update(id, importance:'deprecated')` OR `status` in the new metadata column | `memory_frames` | `→ { ok }`. No hard delete. | S04 |
| `DELETE /api/memory/:id` | **EXTEND** (alias) | alias bare `:id` over `DELETE /api/memory/frames/:id` (`memory.ts:551`) | `memory_frames` (`FrameStore.delete`) | `→ { ok }`. | S04 |
| `POST /api/memory/merge` | **NET-NEW** | new route in `memory.ts`; real logic (read N frames, synthesize merged content, write one, archive/delete originals) — reuse `FrameStore` + `findDuplicate` dedup | `memory_frames` | `{ frameIds:[...], strategy?:'concat'\|'llm' } → { mergedId, archived:[...] }`. Net-new logic, low schema risk. | S04 |
| Harvest preview/commit confidence + selection | **EXTEND** | `POST /api/harvest/preview` (`harvest.ts:221`) → return ALL items (or paged) + per-item `confidence` + normalized `kind`; `POST /api/harvest/commit` (`harvest.ts:243`) → accept `{ selectedIds?:[] }` filter before the `createIFrame` loop (`:382-409`) | in-memory parse (preview) / `memory_frames` (commit) | Honors the trust-gate AC ("nothing imports without approval"). Preview confidence needs a classifier (LLM or heuristic). Preview-only confidence needs **no** migration. | S16 |

### 2b. Artifact Center (S05) — new `artifacts.ts` (largest net-new domain; aggregation only)

> **Single largest entity gap:** no `Artifact` type, table, or `/api/artifacts*` route exists anywhere
> (substrate-types §e). The backend is a **thin net-new aggregation/normalization layer** over three
> existing stores — **NO new data store**. A lightweight `artifacts.json` index holds title/status/
> tags/relations; the bytes stay in the existing file/document/storage stores.

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/artifacts` | **NET-NEW** | new `routes/artifacts.ts`; normalize 3 stores | `GET /api/workspaces/:id/files` (`workspaces.ts:594`), document versions (`documents.ts`), storage files (`workspaces.ts /storage/files`) + `artifacts.json` index | `?workspaceId=&kind=&status= → { artifacts:[Artifact{id,title,kind,workspaceId,status,mimeType,storagePath,tags,relatedMemoryIds,...}] }`. | S02, S05 |
| `POST /api/artifacts` | **NET-NEW** | `artifacts.ts`; delegates byte-write to `POST /api/ingest` / `files/upload` / `documents` | file/document stores + `artifacts.json` | `{ title,kind,workspaceId,content?/file? } → { id }`. | S05 |
| `GET /api/artifacts/:id` | **NET-NEW** | `artifacts.ts`; resolve composite id → normalized Artifact + relations + preview meta | 3 stores + `documents.ts` versions | `→ { artifact, relatedVersions[], relatedMemoryIds[] }`. | S05 |
| `PATCH /api/artifacts/:id` | **NET-NEW** | `artifacts.ts`; update title/status/tags/relations in `artifacts.json` (move = re-point storagePath via `files/move`) | `artifacts.json` (+ `files/move`) | `{ title?, status?, tags?, relatedMemoryIds? } → { ok }`. | S05 |
| `DELETE /api/artifacts/:id` | **NET-NEW** (route) | `artifacts.ts`; remove index entry + optionally backing file via `files/delete`/`storage/delete` | `artifacts.json` + file stores | `?deleteBacking=bool → { ok }`. | S05 |
| `GET /api/artifacts/search-related?q=` | **NET-NEW** | `artifacts.ts`; lean on `memory_frames_fts` + wiki search internally | `memory_frames_fts`, sessions, tasks, fleet | `?q=&artifactId= → { related:[{type,id,title,score}] }`. | S05 |

### 2c. Workspace Creation (S17) — extend `workspaces.ts` write path

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `POST /api/workspaces` (extend body) | **EXTEND** | `workspaces.ts:116-135` + `WorkspaceManager.create` (`workspace-manager.ts:60-95`) | `workspace.json` | Accept `description, type, status, skills[], agentIds[], connectorIds[], mcpIds[]` (the Phase-0 additive fields). **No DB migration.** | S17 |
| `GET /api/workspace-templates` (extend shape) | **EXTEND** (optional) | `workspace-templates.ts:33` | template store | Add `skills[]`/`mcps[]`/`type` to `WorkspaceTemplate` so a chosen template pre-populates all 4 suggestion panels. | S17 |

### 2d. Onboarding: First Launch, Who-Are-You, Tool Discovery, Memory Import (S12–S15)

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `PUT /api/profile` (extend merge) | **EXTEND** | `profile.ts:167-228` allow-list (`:172-196`) + `UserProfile` (`:41-94`) + `DEFAULT_PROFILE` (`:96-135`) | `profile.json` (NOT SQLite) | Add `workType, teamSize, goals[]` to the merged-fields allow-list + interface. Already mirrors identity → memory P/I frame (`:201-224`). **No migration.** | S13 |
| `POST /api/harvest/sources/:id/sync` | **NET-NEW** (thin) | new thin route in `harvest.ts`; resolve registered source + re-run commit | `harvest_sources` + `memory_frames` | `→ { runId }`. Sync today = `POST /api/harvest/commit`. NOTE: current sources keyed by `:source` **name** (not `:id`) — keep name key or alias. No new substrate. | S15, S16 |

> **S12 First Launch + S14 Tool Discovery need ZERO net-new backend** — all source catalogs already
> have routes (`GET /api/connectors`, `GET /api/tools/detect`, `GET /api/offline/status`,
> `GET /api/workspaces`); selections persist client-side in `OnboardingState` (localStorage),
> optionally threaded via the extended `PUT /api/profile`. The full harvest engine
> (`preview/commit/sources/progress/scan-claude-code/runs/extract-identity` + `POST /api/ingest`)
> already EXISTS for S15 — only the `/sources/:id/sync` alias (above) and the S16 confidence/selection
> extension (Phase 2a) are new.

---

## Phase 3 — Intelligence layer: Agents, Skills, Automations (PRD §8 Phase 3 / §21 Sprint 6)

### 3a. Agent Center + Agent Builder (S09, S18) — new sidecar `agents.ts` + agent store

> **Naming collision:** `/api/agents/*` CRUD exists ONLY on the Clerk-gated **Cloud** server
> (`packages/server/src/routes/agents.ts`) — NOT the sidecar (confirmed absent). All of §16.7 is
> **net-new locally**: a new `packages/server/src/local/routes/agents.ts` registered in `local/index.ts`.
> **Persistence (recommended v1):** a `{dataDir}/agents.json` file store, mirroring the agent-groups
> JSON precedent (`agent-groups.ts:29`) — **no SQLite migration**. (Alternative: an `agents` table in
> `mind/schema.ts` with SCHEMA_VERSION bump — only if agents must be FTS/relation-queryable. See §M.)

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/agents` | **NET-NEW** | new `routes/agents.ts`; reads agent store; overlay live status from `/api/agents/active` + `/api/fleet` | `agents.json` (new) | `→ { agents:[Agent{id,name,type,goal,personaId,model,autonomyLevel,status,lastRunAt,successRate,...}] }`. May union saved agents + read-only personas for back-compat. | S09, S18 |
| `POST /api/agents` | **NET-NEW** | `agents.ts`; persist Agent (§15.5 fields); PRO-tier gate like `personas.ts:32` | `agents.json` + `install_audit` (if elevated tools/MCPs claimed) | `{ name,type,goal,model,personaId?,autonomyLevel,memoryScopes,skillIds,connectorIds,mcpIds,permissions } → { id }`. | S18 |
| `GET /api/agents/:id` | **NET-NEW** | `agents.ts` read over store | `agents.json` | `→ { agent }`. | S09, S18 |
| `PATCH /api/agents/:id` | **NET-NEW** | `agents.ts`; mirror `agent-groups.ts:74-90` PATCH shape | `agents.json` | `{ ...partial } → { ok }`. | S18 |
| `POST /api/agents/:id/run` | **EXTEND** | resolve agent → call real executor `POST /api/fleet/spawn` (`fleet.ts:66`, the only path that runs `runAgentLoop :185`). **Do NOT** use `agent-groups/:id/run` (stub `:105`). | fleet/orchestrator + `execution_traces` via `TraceRecorder` | `{ input?, workspaceId? } → { sessionId }`. Map agent persona/model/memoryScope/workspace onto spawn body. | S09, S18 |
| `POST /api/agents/:id/pause` | **EXTEND** | map agent→active session → `POST /api/fleet/:workspaceId/pause` (`fleet.ts:260`) | fleet | `→ { ok }`. | S09, S18 |
| `GET /api/agents/:id/traces` | **NET-NEW** (route over existing store) | new thin read over `execution_traces` (`mind/schema.ts:199`, written by `chat.ts`/`evolution.ts`, **no HTTP read today**), filtered by agent/session; fallback session timeline `sessions.ts` | `execution_traces` + `ai_interactions` | `?limit= → { traces:[{ts,step,tool,outcome,cost}] }`. | S09, S18 |

### 3b. Skills Hub + Skill Builder (S06, S19) — extend `skills.ts`

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `PATCH /api/skills/:id` | **EXTEND** | add `PATCH` alias + `:id`↔`:name` over `PUT /api/skills/:name` (`skills.ts:506`) | `~/.waggle/skills/*.md` | `{ content? } → { ok }`. No new substrate. | S06, S19 |
| `POST /api/skills/:id/test` | **EXTEND** | add `:id` path variant routing to existing `POST /api/skills/test` (body-driven) | skill file + `parseSkillFrontmatter` | `{ testInput? } → { wouldInject, frontmatter }`. Sandbox/dry-run only; no execution. | S06, S19 |
| `POST /api/skills/:id/install` | **NET-NEW** (thin dispatcher) | new dispatcher over `POST /api/skills/starter-pack/:id`, `capability-packs/:id`, `marketplace/install` (keep `requireTier('PRO')` for marketplace-sourced) | `marketplace.db` + `MarketplaceInstaller` + `SecurityGate` + `install_audit` | `{ source:'starter'\|'pack'\|'marketplace' } → { installed }`. Resolves source + delegates. | S06 |

> Skill **create** is the existing structured `POST /api/skills/create` (`skills.ts:431` →
> `generateSkillMarkdown` + `redactSkillContent` + audit + hash) — the Builder's real target,
> **EXISTS**. Publish reuses `POST /api/marketplace/publish` (PRO). Optional later: extend
> `SkillFrontmatter` for structured inputs/outputs/memoryAccess (Builder Steps 3–4) — open question, not
> in §16.8. No `.mind` migration (skills are flat files; marketplace is `marketplace.db`).

### 3c. Automation Center + Automation Builder (S11, S20) — alias cron as automations

> **The capability is cron** (`cron.ts`, `/api/cron/*` — full CRUD + trigger + history). "Automations"
> = a rename/alias surface. **Zero MISSING, all PARTIAL.** Register a real `/api/automations/*` alias
> plugin (PRD vocabulary) OR point the new UI at `/api/cron`. Trigger/condition/actions ride in the
> existing `job_config TEXT` blob → **no `.mind` migration** for v1.

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/automations` | **EXTEND** (alias) | alias of `GET /api/cron` (`cron.ts:94`); reshape `toResponse` to expose `trigger/condition/actions/status` from `job_type`+`job_config` | `cron_schedules` | `→ { automations:[...] }`. | S11, S20 |
| `POST /api/automations` | **EXTEND** (alias) | alias of `POST /api/cron` (`cron.ts:67`); persist `trigger/condition/actions` into `job_config` (+ `cron_expr` for schedule triggers) | `cron_schedules` | `{ name,trigger,condition?,actions[],schedule? } → { id }`. | S11, S20 |
| `PATCH /api/automations/:id` | **EXTEND** (alias) | alias of `PATCH /api/cron/:id` (`cron.ts:124`) | `cron_schedules` | `{ ...partial } → { ok }`. **Note real bug:** FE `updateCronJob` calls `PUT /api/cron/:id` but only `PATCH` is registered (adapter.ts:836 vs cron.ts) — fix the adapter. | S11, S20 |
| `POST /api/automations/:id/run` | **EXTEND** (alias) | alias of `POST /api/cron/:id/trigger` (`cron.ts:174`; auto-enables + executes + notifies) | `cron_schedules` + executor (`index.ts:1379`) | `→ { runId }`. | S11, S20 |
| `POST /api/automations/:id/pause` | **NET-NEW** (thin) / EXTEND | add thin `/pause` route OR adapter calls `PATCH /api/cron/:id { enabled:false }` | `cron_schedules.enabled` + scheduler | `→ { ok }`. Add `/pause` for PRD contract. | S11, S20 |
| `GET /api/automations/:id/logs` | **EXTEND** (alias) | alias of `GET /api/cron/:id/history` (in `notifications.ts:202` → `cronStore.getExecutionHistory`) | `cron_execution_history` | `?limit= → { logs:[...] }`. | S11, S20 |
| `POST /api/automations/test` | **NET-NEW** | new dry-run route (PRD §12.10 "test before activate"); current `POST /api/cron/:id/trigger` really executes | cron executor (no-persist mode) | `{ trigger,actions[] } → { previewResult }`. No log/notify side-effects. | S20 |

---

## Phase 4 — Extend layer: Connectors, MCPs, Marketplace, Install Audit (PRD §8 Phase 4 / §21 Sprint 7)

### 4a. Connector Hub (S07, S14) — extend `connectors.ts`

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `POST /api/connectors/:id/sync` | **NET-NEW** | new route in `connectors.ts` (`WaggleConnector` has `connect`/`healthCheck`/`execute` but **no `sync()`**) | vault sub-key `connector:<id>:lastSync` (or small store) + activity event + `install_audit` | `→ { lastSyncAt, ok }`. **Phased:** MVP = `healthCheck()` + stamp `lastSyncAt` + emit event; full data re-pull is a larger connector-SDK addition. No `.mind` migration. | S07 |
| `POST /api/connectors/:id/revoke` | **EXTEND** (alias) | alias to `POST /api/connectors/:id/disconnect` (`connectors.ts:107`) + write `install_audit` `action:'rejected'`/revoke | vault + `install_audit` | `→ { ok }`. Same intent, PRD verb. | S07 |
| `POST /api/connectors/:id/connect` (extend) | **EXTEND** | `connectors.ts:55` — add `auditStore.record(...)` on success | vault + `install_audit` | (audit-trail enrichment, no shape change). | S07, S14 |
| `GET /api/connectors` (extend payload) | **EXTEND** (optional) | `connectors.ts:6` — carry `category` (already on type, `types.ts:299`) + `lastSyncAt` so UI drops hardcoded CATEGORIES/sync-shim | connector registry | (payload enrichment). | S07, S14 |
| `GET /api/connectors/health` (aggregate) | **NET-NEW** (optional, mockup) | `connectors.ts` — fan `healthCheck()` across connectors | connector registry | `→ { connectors:[{id,status,lastSyncAt}], systemHealth }`. Optional v1; compose client-side otherwise. | S07 |
| `GET /api/connectors/activity` | **NET-NEW** (or use shared `/api/extend/audit?type=connector`) | reads `install_audit` rows filtered to `type:'connector'` | `install_audit` | `→ { activity:[...] }`. **Prefer the shared `/api/extend/audit`** (4c) which serves S07+S08+S21 with one route. No migration. | S07 |

### 4b. MCP Hub (S08, S17) — new `mcps.ts` + persisted MCP-config store + runtime population

> **The deepest backend gap in the Extend layer.** Today `mcpRuntime` is **empty and never populated**
> (`local/index.ts:911`); there is no `GET /api/mcps`, no persisted MCP-config store, no boot-time
> population. All routes live in a new `packages/server/src/local/routes/mcps.ts`. **Substrate decision:**
> persist installed MCP configs as a JSON file / `.mcp.json` (no migration) — confirm dataDir path +
> multi-workspace scoping (open question). The MCP catalog is static in `@waggle/shared mcp-catalog.ts`.

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/mcps` | **NET-NEW** | `routes/mcps.ts`; join static catalog (`@waggle/shared mcp-catalog.ts`) + installed-state (`capabilities/status.mcpServers[]`, `.mcp.json`, `marketplace mcp-registry.ts`) | catalog + `.mcp.json` + `install_audit` | `→ { mcps:[{id,name,status,installed,tools[],scope}] }`. Reads existing substrate; no migration. | S08, S17 |
| `POST /api/mcps/install` | **EXTEND** | route through existing marketplace installer `POST /api/marketplace/install` (already handles `installType:'mcp'` → writes `.mcp.json`, `installer.ts:580`) | `marketplace.db` + `.mcp.json` + `install_audit` | `{ mcpId } → { installed }`. Resolve MCP id → marketplace package → install. Audit already recorded. | S08 |
| `POST /api/mcps/:id/test` | **NET-NEW** | `mcps.ts`; resolve server, `start()` if needed, assert `isHealthy()` (`mcp-runtime.ts:94,399`) and/or `tools/list` round-trip | `McpRuntime` | `→ { ok, tools[], error? }`. Open question: live spawn-and-handshake vs static manifest validation. | S08 |
| `POST /api/mcps/:id/revoke` | **NET-NEW** | `mcps.ts`; `mcpRuntime.removeServer(name)` (`mcp-runtime.ts:327`) + delete persisted config + `install_audit` `action:'revoked'` | `McpRuntime` + `.mcp.json` + `install_audit` | `→ { ok }`. | S08 |
| `POST /api/mcps` (add custom) | **NET-NEW** | `mcps.ts`; persist config + add to runtime (blueprint API line 530) | `.mcp.json` + `McpRuntime` | `{ name, command, args[], env{}, workspaceId? } → { id }`. | S08 |
| `POST /api/mcps/:id/start` · `POST /api/mcps/:id/stop` | **NET-NEW** | `mcps.ts`; map to `McpRuntime` start/stop (PRD §12.8 start/stop) | `McpRuntime` | `→ { status }`. | S08 |
| `PATCH /api/mcps/:id/permissions` | **NET-NEW** | `mcps.ts` (blueprint API line 530) | `.mcp.json` config | `{ scope?, permissions? } → { ok }`. | S08 |
| `GET /api/mcps/:id/logs` | **NET-NEW** (phased) | `mcps.ts`; needs a ring-buffer of stderr/stateChange in `McpServerInstance` (no log capture today) | new in-memory ring buffer | `→ { logs:[...] }`. Defer to later phase if log-capture infra not built. | S08 |

> **Boot-time runtime population** (populate `mcpRuntime` from the persisted config at startup,
> `local/index.ts:911`) is the foundational non-route work item that unblocks all of the above.

### 4c. Marketplace / Extend + Install Audit (S21, shared S06/S07/S08)

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `GET /api/marketplace` | **EXTEND** (alias) | bare path = alias of `GET /api/marketplace/search` with default params (`marketplace.ts:56`) | `marketplace.db` | `→ { results:[...] }`. | S21 |
| `GET /api/extend/audit` (shared governance read) | **EXTEND** (param) | the install-audit read route `GET /api/audit/installs` **already EXISTS** (`skills.ts:685`); add `?capability=` / `?type=` filter exposing `getByCapability()` (`install-audit.ts:125`) | `install_audit` | `?type=skill\|connector\|mcp\|marketplace&limit= → { entries:[AuditEntry] }`. Serves S06+S07+S08+S21 with one route. No migration. **Note:** substrate-types §d#1 listed this as missing; it is present — the work is the filter param, not a new route. | S06, S07, S08, S21 |

> **No `POST /api/share`** here — that is Phase 5 (Team). Per-workspace install scoping (§12.13) is
> net-new product surface; PRD §22 risk register says "start with catalog + install audit, postpone
> billing/public marketplace" — **defer to Phase 4 polish**.

---

## Phase 5 — Team intelligence: Team Workspace, RBAC, Sharing, Audit (PRD §8 Phase 5 / §21 Sprint 8)

> Team CRUD core EXISTS in `team.ts` (`teams.db`): `GET/POST/PUT/DELETE /api/teams`, `/:id`,
> `/members`, `/members/:userId`, `/activity`. No `.mind` migration for the team core (`teams.db`
> standalone; `team_capability_policies`/`overrides`/`requests` exist in migration `0001`).

| Method + Path | Disposition | Build target | Substrate | Shape | Screens |
|---|---|---|---|---|---|
| `POST /api/teams/:id/invite` | **EXTEND** (alias) | thin `/invite` alias forwarding to `POST /api/teams/:id/members` (`team.ts:581`, owner/admin gated) | `team_members` (`teams.db`) | `{ email?, userId?, role? } → { ok }`. No new substrate. | S10 |
| `GET /api/teams/:id/audit` | **EXTEND** (alias) | alias `/audit` → existing `GET /api/teams/:id/activity` (`team.ts:690`, reads `audit_events` via `getAuditDb`) | `audit_events` | `→ { events:[...] }`. Or add audit-export shape. No new store. | S10 |
| `PATCH /api/teams/:id/members/:memberId` (fix gate) | **EXTEND** (bug fix) | `team.ts:642` (`:userId`==`:memberId`); **fix PUT(owner-only `:615`) vs PATCH(owner/admin `:642`) role-gate inconsistency** | `team_members` | (behavior fix, no shape change). | S10 |
| `POST /api/share` | **NET-NEW** | new route (no `/api/share` anywhere — grep-confirmed); shares memory/artifact with role-appropriate perms | `workspace.json teamId` linkage + (if frame-level) `memory_frames` metadata | `{ objectType:'memory'\|'artifact'\|'workspace', objectId, teamId, role } → { ok }`. **Open:** frame-level scope needs the `memory_frames` metadata migration (§M); v1 may scope implicitly via workspace `teamId`. Gate behind TEAMS tier like `/api/team/*`. | S05, S10 |
| `POST /api/artifacts/:id/share` | **NET-NEW** (blueprint) | maps to `POST /api/share` + artifact scope; gate TEAMS | `artifacts.json` + team scope | `{ teamId, role } → { ok }`. Blueprint action not in §16.6; defer to Phase 5. | S05 |
| `GET /api/teams/:id/governance` (optional) | **NET-NEW** (optional) | surface `team_capability_policies`/`overrides`/`requests` (migration `0001`); Enterprise proxy `GET /api/team/governance/permissions` (`team.ts:418`) is the remote analog | `team_capability_policies` etc. | `→ { policies[], overrides[], requests[] }`. RBAC UI. | S10 |

---

## §M — Schema migrations required

> **Headline: the entire refactor needs AT MOST ONE conditional SQLite migration**, and it is
> deferrable. Every other "schema addition" is to a **JSON file** (`workspace.json`, `profile.json`,
> `agents.json`, `artifacts.json`, `.mcp.json`) — **not** a database — so it is a pure additive
> TypeScript-interface change with **no migration**. The migration runner already does idempotent
> additive `ADD COLUMN` on `memory_frames` (precedent: it added `source`, `mind/db.ts:116-124`;
> pattern = `pragma_table_info` guard + `ALTER TABLE … ADD COLUMN`).

### M1 — `memory_frames.metadata` (CONDITIONAL — Phase 2/Phase 5) — the only `.mind` SQLite migration

- **What:** add one nullable column `metadata TEXT NOT NULL DEFAULT '{}'` to `memory_frames`
  (`mind/schema.ts:47`). Store `{kind, title, scope, sourceId, sourceUrl, confidence, tags, evidence,
  relatedMemoryIds, relatedArtifactIds, status}` as JSON (PRD §15.4 fields; PRD endorses metadata-first,
  `:1013`).
- **Why conditional:** `memory_frames` is the **only** mind table without a JSON blob column (unlike
  `awareness.metadata`, `knowledge_entities.properties`, etc.). Needed ONLY when persisted
  confidence/provenance/scope/status becomes a real **query/filter axis** (S04 Memory Center filters;
  S16 persisted-confidence review; S10/S05 frame-level `/api/share` scope). **NOT needed** if S16
  review is preview-only (pre-commit) and S04 filtering is in-app over the existing columns.
- **Risk:** low — single additive nullable column; avoids touching the FTS/vec virtual tables and IPB
  scoring. **Promotion path:** if `confidence` becomes a primary indexed filter, a later migration adds
  `confidence REAL` as a real column (same ADD-COLUMN pattern).
- **Screens:** S04, S16, S10, S05. **Build target:** `packages/hive-mind-core/src/mind/db.ts` migration
  block + `mind/schema.ts`.

### M2 — `install_audit` risk-level CHECK fix (RECOMMENDED — pre-Phase 4, latent bug)

- **What:** the TS `AuditRiskLevel` includes `'critical'` (`install-audit.ts:16`) but **both** DDL CHECK
  constraints allow only `('low','medium','high')` (`install-audit.ts:65` AND `schema.ts:130` — duplicated
  DDL that must stay in sync). A `record({riskLevel:'critical'})` throws a CHECK violation.
- **Why:** Phase 4 connector/MCP/skill installs all route through `auditStore.record(...)`. The
  marketplace route currently side-steps by mapping CRITICAL→`riskLevel:'high'`+`approvalClass:'blocked'`
  (`marketplace.ts:224-319`) — but any new Extend caller passing `'critical'` crashes.
- **Fix (pick one):** (a) widen both CHECK constraints to include `'critical'` (additive CHECK migration
  — needs table rebuild for SQLite CHECK change, or relax to no-CHECK), OR (b) lock the CRITICAL→`'high'`
  mapping as the permanent contract and drop `'critical'` from the TS union. (b) is zero-migration.
- **Risk:** low. **Screens:** S06, S07, S08, S21 (all Extend installs). **Build target:**
  `install-audit.ts:65` + `mind/schema.ts:130` (kept in sync) OR the TS union.

### M3 — `agents` table (OPTIONAL — Phase 3, NOT recommended for v1)

- **What:** an `agents` table in `mind/schema.ts` with a `SCHEMA_VERSION` bump.
- **Recommendation: do NOT do this for v1.** Persist agents to `{dataDir}/agents.json` (file store,
  mirrors the `agent-groups.json` precedent `agent-groups.ts:29`) — **no migration, reversible.** Only
  add the table if agents must be FTS/relation-queryable. PRD §14.4 non-goal favors minimal backend.
- **Screens:** S09, S18.

### Non-migrations (additive JSON-file / interface changes only — listed for completeness, NOT migrations)

- `WorkspaceConfig` V2 fields → `workspace.json` (Phase 0; substrate-types §a).
- `UserProfile` `workType/teamSize/goals` → `profile.json` (S13).
- `Agent` entity → `agents.json` (Phase 3, M3 alt).
- `Artifact` index → `artifacts.json` (Phase 2b).
- MCP installed configs → `.mcp.json` (Phase 4b).
- Automation `trigger/condition/actions` → existing `job_config TEXT` blob (Phase 3c; no schema change).
- `cron_schedules`/`cron_execution_history`/`notifications` tables already exist with lazy creation
  (`cron-store.ts:135-157`) — no migration for Automations.

---

## Counts

> Counted as **distinct backend endpoints** (each method+path = 1). Endpoints that **EXIST as-is** and
> need only frontend wiring are **excluded**. Phase-0 non-route work (V2 fields, FE type unions, write-
> side stamps) is counted separately under "interface/field extensions", not as endpoints.

- **Total endpoints requiring backend work: 53** (NET-NEW + EXTEND, de-duplicated).
- **NET-NEW endpoints: 35**
  - Home ×2 (`/home/briefing`, `/home/overnight`)
  - Command ×3 (`/command/search`, `/command/recent`, `/command/suggestions`)
  - Memory ×3 (`/memory/:id`, `/memory/:id/archive`, `/memory/merge`)
  - Artifacts ×6 (GET, POST, `/:id`, PATCH `/:id`, DELETE `/:id`, `/search-related`)
  - Agents ×5 (GET, POST, `/:id`, PATCH `/:id`, `/:id/traces`)
  - Skills ×1 (`/skills/:id/install`)
  - Automations ×1 (`/automations/test`)
  - Connectors ×3 (`/:id/sync`, `/connectors/health`, `/connectors/activity`)
  - MCPs ×8 (`GET /mcps`, `/:id/test`, `/:id/revoke`, `POST /mcps` custom, `/:id/start`, `/:id/stop`, `PATCH /:id/permissions`, `/:id/logs`)
  - Team ×3 (`POST /api/share`, `POST /artifacts/:id/share`, `GET /teams/:id/governance`)
  - *(Several MCP/connector/team items are blueprint-implied beyond the §16 literal list; `/api/automations/:id/pause` is counted under EXTEND as a thin alias over the cron `enabled` flag.)*
- **EXTEND endpoints: 18** (distinct backend touch-points; an EXTEND may be an alias, an added param, or added behavior)
  - `/quick-capture` (delegates to memory write)
  - `/workspaces/:id/state`, `/workspaces/:id/activity` (thin routes over existing builders/events)
  - `/command/execute` (broaden dispatch)
  - `/memory` GET, `/memory` POST, `/memory/:id` PATCH, `/memory/:id` DELETE (aliases over `/memory/frames*`)
  - `/harvest/preview` + `/harvest/commit` (confidence + `selectedIds` selection)
  - `/harvest/sources/:id/sync` (thin re-commit alias)
  - `/workspaces` POST (richer body)
  - `/agents/:id/run`, `/agents/:id/pause` (delegate to fleet)
  - `/skills/:id` PATCH, `/skills/:id/test` (`:id` variants)
  - 6× `/automations/*` aliases over `/cron/*` (GET, POST, PATCH, run, pause, logs)
  - `/connectors/:id/revoke`, `/connectors/:id/connect` (+audit), `/connectors` GET (payload)
  - `/mcps/install` (via marketplace installer)
  - `/marketplace` (bare-path alias)
  - `/extend/audit` filter param (over existing `/audit/installs`)
  - `/teams/:id/invite`, `/teams/:id/audit`, `/teams/:id/members/:memberId` (alias + role-gate fix)
- **Phase-0 interface/field extensions (NOT endpoints): 5** — `WorkspaceConfig` V2 fields + `updatedAt`/
  `lastActiveAt` write-stamps (`workspace-manager.ts`), FE type unions (`types.ts`), `UserProfile`
  `workType/teamSize/goals` (`profile.ts`), `WorkspaceTemplate` shape, `Connector` interface fields.
- **PRD §16 cross-reference (from `_inventory/backend-routes.md`):** of 65 §16-literal endpoints —
  **16 EXIST** as-is (FE wiring only), **30 PARTIAL** (→ EXTEND), **19 MISSING** (→ NET-NEW). This
  master list adds ~16 blueprint-implied endpoints (MCP start/stop/logs/permissions/custom, connector
  health/activity, automations/test, team governance, artifact-share, extend/audit) beyond the §16
  literal set.
- **Schema migrations:** **1 conditional** SQLite (M1 `memory_frames.metadata`) + **1 recommended**
  CHECK fix (M2 `install_audit` risk-level) + **1 optional/deferred** (M3 `agents` table — recommend
  NOT doing in v1). Net likely-to-ship: **1** (`memory_frames.metadata`); **0 strictly required** if
  S16 confidence stays preview-only and `/api/share` scopes implicitly via workspace `teamId`.
- **New sidecar route files: 5** (`home.ts`, `command.ts`, `artifacts.ts`, `agents.ts`, `mcps.ts`)
  + 1 alias plugin (`automations.ts` → cron). **New JSON file stores: 2** (`agents.json`,
  `artifacts.json`); plus reuse of `.mcp.json`, `workspace.json`, `profile.json`.
