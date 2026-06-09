# Gap Card — S05 Artifact Center

> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extensions.
> Mockups are directional; PRD acceptance criteria win over pixels (PRD §24).
> Sources: PRD §12.5 + §16.6, blueprint p.32 (`_blueprint_extracted.txt:306-317, 525, 547`),
> mockup `screen_05_artifact_center.png`, baseline inventories under `docs/ux-refactor/_inventory/`,
> backend-map `sections/04-feature-map.md`.

---

## 1. Screen & purpose

The **Artifact Center** is the **outcome layer**: it organizes *outputs* (documents, presentations,
spreadsheets, dashboards, research, code, media, designs, other) as first-class **relational objects** —
not file attachments. PRD §12.5 purpose verbatim: "Organize outcomes, not just attachments." The
headline acceptance criterion (PRD line 532): **searching a topic (e.g. "Germany GTM") returns all
relevant outcome objects plus related memories, sessions, tasks, agents, and people — not just files.**

Mockup (directional): left filter rail (type / status / workspace / tag facets), a center **artifact
table** (icon, title, type, workspace, status badge, updated, owner) with a top search bar + view
toggle + pagination, and a right **detail panel** (preview thumbnail, metadata, related items, actions).
This is a **data-heavy table+detail screen**, the same shape the blueprint flags as acceptable in light
variant (`_blueprint_extracted.txt:484`).

The defining difference from today's Files app: an artifact is an **outcome with relations**
(`relatedMemoryIds / relatedSessionIds / relatedTaskIds / relatedAgentIds`,
`generatedByAgentId`, `status: draft|final|shared|generated`), addressable by a stable `id`, spanning
**all storage backends and all formats**. Today's Files app exposes only a raw filesystem tree scoped to
one workspace + one storage tab.

---

## 2. Required states (PRD / Blueprint)

PRD §12.5 functional requirements:
- Artifact **categories** (= `ArtifactKind`, PRD §15.2 line 950): `document | presentation |
  spreadsheet | dashboard | research | code | media | design | other`.
- **Topic search returns artifacts + related memories/sessions/tasks/agents/people** (the §16.6
  `GET /api/artifacts/search-related?q=` contract).
- **Detail panel**: preview, metadata, workspace, creator, updated time, access, status, tags, related
  items, actions.
- **Actions**: open, share, duplicate, move, delete, relate to workspace/memory/session/task.

State model — PRD §14.1 global states (every major screen): Loading, Empty, Populated, Error,
Offline/local-only, Syncing, Permission denied, Partial data, Approval required.
Plus the **artifact-specific states** (PRD §14 line not enumerated but blueprint `:312-314, 458`):
**Draft, Final, Shared, Generated, External-missing (source unavailable), Permission denied.**

So the concrete states to build:
1. Loading (skeleton table + skeleton detail).
2. Empty ("no artifacts yet" — first-run / no outputs produced).
3. Populated (table + facets + detail).
4. Error (fetch failed).
5. Offline/local-only (sidecar unreachable — mirror FilesApp offline banner pattern).
6. Permission denied (team-scoped artifact the user can't view).
7. Per-row status badges: Draft / Final / Shared / Generated.
8. Source-unavailable (artifact row whose backing file/url is missing — show broken-link affordance).

---

## 3. Current state in repo (disposition: **create-new** for the screen; **keep-promote** the substrates)

**There is NO Artifact entity, type, route, or component anywhere.** Grep-confirmed:
- No `Artifact` type in `apps/web/src/lib/types.ts` (the only `Artifact` hit in `apps/web/src` is
  `components/os/apps/memory/EvolutionTab.tsx`, referring to evolution `artifacts_json` — unrelated).
- No `artifacts` table in `packages/hive-mind-core/src/mind/schema.ts`.
- No `/api/artifacts/*` routes (grep over `packages/server/src/local/routes/*.ts`: 0 matches).
- Confirmed by `_inventory/substrate-types.md:259-266` ("**NO backing entity anywhere** … the single
  largest entity gap") and `_inventory/backend-routes.md:476-484` (all 6 §16.6 rows PARTIAL/MISSING).

**The closest current surface is the Files app** (the current-component hint), which is **NOT an
artifact center** — disposition for it is **keep-as-is, do not retrofit**:
- `apps/web/src/components/os/apps/FilesAppTabs.tsx` — P16 three-tab (Virtual/Local/Team) wrapper that
  remounts `FilesApp` per `storageType`. Storage-location switcher, not an outcome browser.
- `apps/web/src/components/os/apps/FilesApp.tsx` (735 LOC) — full file-manager: tree + list/grid +
  preview + upload + rename/move/copy/delete + bulk ops + properties dialog + inline `VersionHistory`.
  It is **path/workspace/storage-scoped** (`adapter.listFiles(workspaceId, currentPath)`), has no
  cross-workspace aggregation, no type/status/relation model, no facet filtering by outcome kind.
- Sub-components `components/os/files/{FileTree,FilePreview,FileActions,FileUploadZone,SyntaxPreview,
  WorkspaceRail}.tsx` — operate on `FileEntry` (`lib/types.ts:42-50`: `name/path/type/size/mimeType/
  modifiedAt/createdAt`), a raw FS entry, not an outcome object.

**Three existing backend substrates the new Artifact layer must aggregate over (reuse, do not duplicate):**
1. **Workspace file registry** — `GET /api/workspaces/:id/files` (`workspaces.ts:594-606`) returns
   `readFileRegistry(dataDir, id)` of `FileRegistryEntry { name, type, summary, sizeBytes, ingestedAt }`
   (`routes/ingest.ts:125-130`). This is an **ingest log**, newest-first — closest thing to a
   per-workspace "produced/ingested things" list, but no id, no status, no relations.
2. **Document version registry** — `GET /api/workspaces/:id/documents` +
   `/documents/:name/versions` (`routes/documents.ts`, JSON at
   `~/.waggle/workspaces/{id}/documents.json`, shapes `TrackedDocument`/`DocumentVersion`). Gives
   versioning + size + createdAt keyed by name; already surfaced in FilesApp's `VersionHistory`
   (`FilesApp.tsx:27-54`). No type/status/relations.
3. **Workspace storage files** — `GET /api/workspaces/:id/storage/files` + `/storage/read|write|delete`
   (`workspaces.ts:885+`) — the actual byte store for virtual/local/team.

**Verdict:** the screen is **create-new** (`ArtifactCenter` is in PRD §20.3 "Create" list, line 1289).
The backend is **a thin net-new aggregation/normalization layer over the three existing stores** — no
new data store required (`_inventory/backend-routes.md:604-607`).

---

## 4. Frontend work

**New top-level app (dock id `artifacts`).** Register in `Desktop.tsx` `appConfig` + `renderAppContent`
switch, add `AppId` `'artifacts'` in `lib/dock-tiers.ts`, and a Work-bucket dock entry (the IA maps
Artifacts to the **Work** layer — `_inventory/frontend.md:360`). Do **not** route — this is a windowed
single-route desktop; opening is by `AppId` via `openApp` (`useWindowManager`).

Components to **create** (keep files small, ~200-400 LOC each per repo file-org rule):
- `components/os/apps/ArtifactCenterApp.tsx` — shell: search bar + view toggle + facet rail + table +
  detail panel + pagination. Owns query/filter/selection state. Mirrors the FilesApp three-pane layout
  idiom (rail / main / detail) so it feels native.
- `components/os/artifacts/ArtifactTable.tsx` (or `ArtifactRow.tsx` — blueprint names `ArtifactRow`,
  `_blueprint_extracted.txt:487`) — list rows with icon/title/type/workspace/status badge/updated/owner.
- `components/os/artifacts/ArtifactFacetRail.tsx` — type/status/workspace/tag facet filters (left rail in mockup).
- `components/os/artifacts/ArtifactDetailPanel.tsx` — preview + metadata + related-items list + actions.
- `components/os/artifacts/ArtifactRelatedList.tsx` — renders related memories/sessions/tasks/agents;
  clicking a related item should raise the relevant window via the existing `waggle:open-app`
  CustomEvent (and/or `onContextRail` like FilesApp does, `FilesApp.tsx:206-208`).

**Reuse targets (do not rebuild):**
- Status/confidence badges, `Skeleton`, `Table`, view-toggle, `Pagination`, `HoverCard` — all exist in
  `components/ui/*` (shadcn set, `_inventory/frontend.md:337-342`).
- Offline banner pattern + retry — copy from `FilesApp.tsx:384-389`.
- File preview for an artifact's backing file — reuse `components/os/files/FilePreview.tsx`.
- Empty-state idiom — `FilesApp.tsx:470-477`.
- Detail-panel metadata layout idiom — FilesApp Properties dialog (`FilesApp.tsx:667-729`).
- ContextRail for "show full context of this artifact" — `overlays/ContextRail.tsx` already exists
  (extend `ContextRailTarget` with an `'artifact'` variant).

**New hook + adapter methods:**
- `hooks/useArtifacts.ts` — `{ artifacts, filters, setFilter, selected, select, search, refresh,
  create, patch, remove, share }`; reads/writes through the adapter. Follow the `useMemory` shape
  (`hooks/useMemory.ts`).
- Extend `lib/adapter.ts` (the single sidecar gateway, ~1930 LOC — new §16 methods land here per
  `_inventory/frontend.md:380`) with: `getArtifacts`, `getArtifact`, `createArtifact`,
  `patchArtifact`, `deleteArtifact`, `searchRelatedArtifacts`, `shareArtifact`.

**Props/state notes:** `ArtifactCenterApp` takes `{ workspaces?, activeWorkspaceId?, onSelectWorkspace?,
onContextRail? }` (same cross-workspace pattern FilesApp uses). It is **cross-workspace by default**
(the whole point vs FilesApp) — workspace becomes a *facet*, not a hard scope.

---

## 5. Backend work (PRD §16.6)

> No new data store. Every endpoint is a **net-new aggregation/normalization route** over the existing
> file registry + document versions + workspace storage. New file:
> `packages/server/src/local/routes/artifacts.ts`, registered in `local/index.ts`. The Artifact `id`
> can be a stable composite of `workspaceId + source-store + name/path` (or a registry-assigned id if a
> lightweight `artifacts.json` index is added per workspace, mirroring `documents.json`).

| PRD §16.6 endpoint | Status | Plan (EXTEND vs NET-NEW) + substrate |
|---|---|---|
| `GET /api/artifacts` | **PARTIAL → NET-NEW route** | No `/api/artifacts` domain. NET-NEW `GET /api/artifacts` in `artifacts.ts` that **fans out over `WorkspaceManager.list()`** and, per workspace, normalizes (a) file registry `GET /api/workspaces/:id/files` (`workspaces.ts:594`, `FileRegistryEntry`), (b) document versions `GET /api/workspaces/:id/documents` (`documents.ts`), into a unified `Artifact[]`. Supports `?workspaceId=&type=&status=&tag=&q=` facet filters. Cross-workspace = the differentiator. |
| `POST /api/artifacts` | **PARTIAL → NET-NEW route (thin)** | Closest writes that already persist bytes: `POST /api/ingest` (`ingest.ts`), `POST /api/workspaces/:id/files/upload` (`files.ts`), `POST /api/workspaces/:id/documents` (`documents.ts`), `POST /api/workspaces/:id/storage/write` (`workspaces.ts`). NET-NEW `POST /api/artifacts` records artifact metadata (kind/title/status/tags/relations + `generatedByAgentId`) in a per-workspace `artifacts.json` index and (optionally) writes the backing file via the storage route. |
| `GET /api/artifacts/:id` | **MISSING → NET-NEW** | Resolve composite id → normalized `Artifact` with relations + preview metadata. Reuse `documents.ts` version lookup for `relatedVersions`. |
| `PATCH /api/artifacts/:id` | **MISSING → NET-NEW** | Update title/status/tags/relations in the `artifacts.json` index (move = re-point `workspaceId`/`storagePath`; reuse `files/move`). |
| `DELETE /api/artifacts/:id` | **PARTIAL → NET-NEW route** | Closest: `POST /api/workspaces/:id/files/delete` (`files.ts`), `DELETE /api/workspaces/:id/storage/delete` (`workspaces.ts`). NET-NEW `DELETE /api/artifacts/:id` removes the index entry and (optionally) the backing file via those. |
| `GET /api/artifacts/search-related?q=` | **MISSING → NET-NEW (the headline endpoint)** | Federated search: query the normalized artifact index **plus** `GET /api/memory/search` (`memory.ts`), session search `GET /api/workspaces/:wid/sessions/search` (`sessions.ts`), tasks `GET /api/tasks` (`tasks.ts`), and fleet/agents (`GET /api/agents/active`/`/api/fleet`), returning grouped `{ artifacts, memories, sessions, tasks, agents }`. Internally can lean on existing FTS (`memory_frames_fts`, marketplace FTS5, wiki search). Delivers PRD line 532 acceptance. |
| `POST /api/artifacts/:id/share` (blueprint `:525`) | **MISSING → NET-NEW** | Blueprint adds a `/share` action not in PRD §16.6 list. Maps to the missing `POST /api/share` (`_inventory/backend-routes.md:551`) + team scope. Defer to the Team phase (see §7); gate behind TEAMS tier like `/api/team/*`. |

**Substrate touched:** workspace file registry (`ingest.ts` `FileRegistryEntry`), document versions
(`documents.ts` JSON), workspace storage (`workspaces.ts` storage routes), memory FTS
(`memory_frames_fts`), sessions JSONL, tasks store, fleet/orchestrator. **No `.mind` migration
required** for a metadata-first implementation: artifact metadata + relations live in a per-workspace
`artifacts.json` index (same pattern as `documents.json`). If artifacts must later be queryable in SQL
alongside frames, a future additive `artifacts` table in `schema.ts` follows the established
idempotent ADD-pattern (`mind/db.ts:116-124`) — flag, not now.

**Governance note:** if agent-generated artifacts (`generatedByAgentId`) need an audit trail, reuse
`InstallAuditStore`/`emitAuditEvent` (`workspaces.ts:631` already emits `workspace_update`) rather than
a parallel log.

---

## 6. Shared types needed (PRD §15.2 / §15.6 vs `lib/types.ts`)

**Net-new, none exist today** (`_inventory/substrate-types.md:226, 259-266`):
- `ArtifactKind` union (PRD §15.2 line 950) — add to `lib/types.ts` (and `packages/shared/src/types.ts`
  if the sidecar route also imports it, to keep one contract).
- `ArtifactStatus = 'draft' | 'final' | 'shared' | 'generated'` (from blueprint states `:312`,
  PRD §14 artifact states). Note blueprint also implies `external-missing`/`source-unavailable` —
  model as a derived flag, not a status value.
- `Artifact` interface — PRD §15.6 (lines 1039-1056) ∪ blueprint `:547`: `id, title, kind, workspaceId,
  teamId?, createdBy, generatedByAgentId?, source, status, mimeType?, storagePath?, previewUrl?,
  summary?, tags[], relatedMemoryIds[], relatedSessionIds[], relatedTaskIds[], relatedAgentIds[],
  createdAt, updatedAt`.
- `RelatedSearchResult` — the grouped `{ artifacts, memories, sessions, tasks, agents }` envelope for
  `search-related`.

**Reconcile, don't fork:** define `Artifact`/`ArtifactKind`/`ArtifactStatus` **once** (shared package
preferred) so the sidecar route and the frontend hook share the contract — avoid the existing
FE↔BE `MemoryFrame` drift the inventory flags (`_inventory/substrate-types.md:246-247`). Optionally add
`relatedArtifactIds[]` to the memory side later (PRD §15.4) so the relation is bidirectional.

---

## 7. Dependencies (screens / phases first)

- **PRD Phase 2 — Work layer** (this screen's home; Memory Center is its sibling, Sprint 4). The
  `search-related` federated endpoint is the binding dependency on Memory (FTS) + Sessions + Tasks.
- **AppShell / dock IA (Phase 0/1)** must exist first so `artifacts` registers as a Work-bucket dock
  entry (consolidate on `AppId`, retire stale `AppView`).
- **Win+K Command Center (Phase 1)** should index artifacts (`_blueprint_extracted.txt:515` — command
  index unifies artifacts) — soft dependency; Artifact Center can ship before Win+K wires it in.
- **`WorkspaceConfigV2` `type`/`status` fields** (S-workspace cards) help facet labels but are not
  blocking.
- **Team Workspace / RBAC (Phase 5)** gates `POST /api/artifacts/:id/share` + permission-denied state.
  Ship Artifact Center personal-scoped first; share/team-scope is a follow-on.
- **Agent run → artifact linkage** (PRD Journey 7, §15.6 `generatedByAgentId`) depends on the agent
  runtime writing artifact records — a downstream integration, not a blocker for the read/browse screen.

---

## 8. Effort: **L**

Net-new full-stack surface: 5-6 new frontend components + a new hook + 7 new adapter methods, **plus**
a net-new backend aggregation domain (`artifacts.ts`, ~6 routes) that must normalize **three** existing
stores into one entity and a **federated** search across memory/sessions/tasks/agents. No new DB and
heavy component/route reuse keep it out of XL, but the cross-workspace aggregation + the
`search-related` federation + a brand-new shared `Artifact` contract make it clearly more than M.

---

## 9. Open questions

1. **Artifact identity & index.** Synthesize `id` as a composite (`workspaceId:store:name`), or add a
   per-workspace `artifacts.json` index (mirroring `documents.json`) that assigns stable ids and holds
   status/tags/relations? (PATCH/relations effectively require the latter.) → maps to PRD Open Q6
   (storage: workspace FS vs virtual store vs external refs, PRD line 1421).
2. **What counts as an artifact in v1?** Only explicit outputs (generated docs/decks/etc.), or every
   ingested file in the registry? The registry mixes ingested inputs with produced outputs — need a
   classification rule for `kind`/`status`.
3. **`search-related` scope/cost.** Federating memory FTS + sessions + tasks + agents per query — cap
   per-source result counts and run async result groups (PRD §24 perf mitigation), or a single indexed
   provider? (Mirrors the Command Center search concern.)
4. **Share semantics (blueprint `/share` vs PRD `/api/share`).** Is `POST /api/artifacts/:id/share`
   in-scope for the first Artifact Center cut, or deferred entirely to the Team phase?
5. **Preview generation.** `previewUrl`/thumbnails — generate server-side, reuse `FilePreview`
   on-demand client-side, or skip thumbnails in v1 (icon + on-click preview only)?
6. **Bidirectional relations.** Do we add `relatedArtifactIds[]` to memory frames now (PRD §15.4) or
   keep relations one-directional (artifact → others) in v1?
