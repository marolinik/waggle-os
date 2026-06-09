# Gap Card — S04 Memory Center

> Screen S04 of the Waggle OS UX Refactor. Execution model: **in-place incremental
> refactor** of `apps/web` + targeted backend extension over the existing `.mind`
> substrate. Mockup is directional; PRD §12.4 + §16.4 acceptance criteria win.
> Sources: PRD `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`
> (§12.4 lines 484-517, §16.4 lines 1086-1094, §15.4 lines 988-1013, §20.2 line 1276);
> backend-map `sections/03b-api-memory.md`, `sections/05b-subsystem-memory.md`;
> inventories under `docs/ux-refactor/_inventory/`.

---

## 1. Screen & purpose

Make memory **visible, trustworthy, searchable, and editable** (PRD §12.4). Every
memory item must answer: *what do I know, why do I know it, where did it come from,
how confident am I, can I edit it?* (PRD line 517).

Mockup (`screen_04_memory_center.png`, directional) shows a 3-pane layout:
- **Left rail** — search box, type/source/confidence/workspace/tag/date filter facets, scope tabs.
- **Center list** — memory cards (title, type icon, snippet, confidence/importance, source chip, date).
- **Right detail panel** — selected memory: content, type/source/evidence, confidence ring/score,
  related memories, connected-graph mini-view, source-evidence chips, and an actions row
  (edit / merge / archive / delete / share / add-to-workspace). A right-most column in the
  mockup shows aggregate stats (frame count, distribution donut, top entities, recent activity).

This is the **Work-layer** "visible memory" pillar (PRD §1, §6 principle 2, §10.2).

---

## 2. Required states (PRD/Blueprint)

**Tabs (PRD §12.4):** `Active · Workspace · Team · Sources · Graph · Trash`.

**Filters (PRD §12.4):** type, source, confidence, importance, workspace, tag, date.

**Memory detail view fields (PRD §12.4 line 500):** content, type, source, evidence,
confidence, relevance, last used, tags, timeline, connected graph.

**Actions (PRD §12.4 line 502):** edit, merge, archive, delete, share, add to workspace/team;
show related memories + source evidence.

**Screen states (PRD §12.4 lines 504-513 + global §14.1/§14.4):** Empty memory · Importing ·
Consolidating · Active · Low confidence · Conflict · Deprecated · Source unavailable —
plus the global set Loading / Populated / Error / Offline-local-only / Permission-denied /
Partial-data / Approval-required, and the memory lifecycle states Raw/Imported/Working/
Consolidated/Active/Low-confidence/Conflicting/Deprecated/Archived/Deleted-tombstoned (§14.4).

**Acceptance (PRD line 517):** every memory exposes content + source + provenance + confidence
+ edit/delete. Privacy (§18.2): memory source and scope must be visible; user must be able
to archive/delete; team sharing requires explicit scope.

> Blueprint note: `_blueprint_extracted.txt` page 31 ("Screen 4 - Memory Center") is an
> image-only heading — no extra written spec beyond PRD. Cross-refs confirm the rework
> intent: line 571 "Turn `MemoryApp.tsx` into Memory Center with source/confidence/
> evidence/edit actions", line 296 "Visible memory with provenance and [confidence]".

---

## 3. Current state in repo

**Disposition: REWORK** (matches PRD §20.2 line 1276: `MemoryApp.tsx -> Memory Center`).
Substantial reuse of substrate + hook; the screen's tab axis, detail panel, and trust
surfacing are rebuilt.

**Primary component — `apps/web/src/components/os/apps/MemoryApp.tsx` (343 LOC).**
Today it is a 6-tab hub on a *different* axis than the PRD:
- `MEMORY_TABS` (line 46): `timeline | graph | harvest | weaver | wiki | evolution` — NOT the
  PRD's `Active/Workspace/Team/Sources/Graph/Trash`. Only **Graph** overlaps 1:1.
- Left sidebar (line 119): search input (`onSearchChange`), a type-filter chip set
  (`FRAME_TYPES`, line 21) + a min-importance range slider; flat chronological frame list.
- Detail pane (line 281): renders type icon, title, `type` chip, `importance: N/5`, timestamp,
  markdown content, and a raw `metadata` JSON dump (line 310). **Edit button is a no-op
  (line 289 — no handler); only Delete is wired.** No source, no confidence, no evidence,
  no relevance, no related-memories, no tags, no timeline, no merge/archive/share.
- `readFrameProvenanceTool()` (line 32) already reads `metadata.tool|sourceTool|source` and
  renders a small amber provenance badge (line 202) — the **only** trust signal present today.
- `ImportReminderBanner` (line 236) handles the "you have pending imports" nudge.

**Subcomponents — `apps/web/src/components/os/apps/memory/` (6 files):**
- `KnowledgeGraphViewer.tsx` → PRD **Graph** tab (keep-promote, reuse as-is).
- `HarvestTab.tsx` → maps to **Sources** tab inputs (keep; Sources tab wraps/extends it).
- `WeaverPanel.tsx`, `WikiTab.tsx`, `EvolutionTab.tsx`, `ImportReminderBanner.tsx` → these
  are **out of the PRD Memory-Center tab set**. Per inventory `frontend.md` (f), Weaver/Wiki/
  Evolution belong to the Intelligence layer (traces/distillation). The rework should **move
  them off the Memory-Center tab bar** (relocate to their IA home or keep behind a secondary
  surface) rather than delete — flag as IA cleanup, not in-scope deletion.
- Grep confirmed: **no file under `memory/` renders confidence/evidence/provenance** beyond the
  inline badge in `MemoryApp.tsx`. The trust UI is greenfield.

**Hook — `apps/web/src/hooks/useMemory.ts` (81 LOC).** Provides `frames`, `selectedFrame`,
`filters{types,minImportance,searchQuery}`, `addFrame/editFrame/deleteFrame/incrementAccess/
refresh`, `stats{total,filtered,entities,relations}`. Calls `adapter.getMemoryFrames`,
`searchMemory`, `getMemoryStats`, `addMemoryFrame`, `updateMemoryFrame`, `deleteMemoryFrame`,
`incrementFrameAccess`. **Reuse and extend** (add merge/archive, scope/source/confidence/tag
filters, single-frame fetch).

**Wiring — `Desktop.tsx`:** `const memory = useMemory(activeWorkspaceId)` (line 107);
`<MemoryApp .../>` rendered for appId `memory` (lines 309-316) with `frames/selectedFrame/
searchQuery/stats/typeFilters/minImportance` + KG props (`knowledgeGraph`, `kgScope`). The
appId `memory` already exists in `AppId` (dock-tiers) — no new route needed (single-route
windowed desktop; inventory `frontend.md` §b).

**Frontend type — `apps/web/src/lib/types.ts:118-127` `MemoryFrame`:** `id,type,title,content,
importance:number,timestamp,workspaceId,metadata?`. Note inventory finding: this FE shape does
**not** match what `/api/memory/frames` returns (server `normalizeFrame` emits `source,
source_mind, frameType, accessCount, score, …`, `memory.ts:25-58`) — a real FE/BE contract
mismatch to reconcile in this rework.

---

## 4. Frontend work

**Rework `MemoryApp.tsx` → Memory Center** (keep file path per §20.2; do not create a parallel app).

Components to create/rework (small files, per house rules):
1. **`MemoryApp.tsx` (rework shell)** — replace the 6-tab bar with PRD tabs
   `Active | Workspace | Team | Sources | Graph | Trash`. Keep the 3-pane layout
   (rail / list / detail). State: `activeTab`, `filters`, `selectedFrameId`, `view`.
2. **`memory/MemoryFilterRail.tsx` (new)** — facet filters: type, source, confidence range,
   importance, workspace, tag, date. Drives `useMemory().setFilters`.
3. **`memory/MemoryList.tsx` (new)** — extract the card list out of `MemoryApp`; each card shows
   title, type icon, snippet, confidence badge, source chip, date. Loading/empty/error states.
4. **`memory/MemoryDetailPanel.tsx` (new)** — the PRD detail view: content + type + source +
   `evidence[]` chips + `ConfidenceBadge` + relevance + last-used + tags + mini-timeline +
   connected-graph snippet + related-memories list. Actions row: edit, merge, archive, delete,
   share, add-to-workspace/team. Reuse design-system primitives from PRD §19.1
   (`Confidence badges`, `Source/evidence chips`, `Status badges`, `Timeline`, `Detail drawer`,
   `Approval prompt` for share/delete).
5. **`memory/MemoryEditDialog.tsx` (new)** — wire the currently-dead Edit button
   (`MemoryApp.tsx:289`) to `useMemory().editFrame`.
6. **`memory/MemoryMergeDialog.tsx` (new)** — select 2+ frames → call merge adapter method.
7. **Reuse as-is:** `KnowledgeGraphViewer.tsx` (Graph tab), `ContextMenu.tsx`,
   `HintTooltip`, `renderSimpleMarkdown`. **Relocate off this tab bar:** `WeaverPanel`,
   `WikiTab`, `EvolutionTab`, `HarvestTab` (Harvest folds into the new **Sources** tab).
8. **`overlays/ContextRail.tsx`** is already the right-side full-context rail (`onContextRail`
   prop, `MemoryApp.tsx:75,183`) — keep the integration.

**Hook/adapter work (`useMemory.ts` + `lib/adapter.ts`):**
- Extend `MemoryFilters` to `{ types, sources, minConfidence, minImportance, workspaceId,
  tags, dateFrom, dateTo, scope, searchQuery }`; filter client-side first, push server-side
  where the route supports it (`/api/memory/search` already accepts `since/until/workspace/scope`,
  `memory.ts:117-120`).
- New adapter methods (thin wrappers; adapter is the single sidecar contract surface — inventory
  `frontend.md` (c)): `getMemoryFrame(id)`, `archiveMemoryFrame(id)`, `mergeMemoryFrames(ids[])`,
  `shareMemoryFrame(id, scope)` (Team tab). Team tab reuses existing `searchTeamMemory`
  (`adapter.ts:489`).
- Reconcile `MemoryFrame` FE type vs server `normalizeFrame` output (add `source`, `sourceMind`,
  `confidence`, `tags`, `evidence`, `status`, `relatedMemoryIds` — see §6).

**States to implement (all PRD-required):** Loading / Empty / Populated / Error / Offline /
Permission-denied / Importing / Consolidating / Low-confidence (badge) / Conflict (badge +
`conflictNote` from `CombinedRetrieval`, backend-map 05b §8) / Deprecated / Source-unavailable /
Trash.

---

## 5. Backend work (PRD §16.4 endpoints)

Status per inventory `backend-routes.md` Part 2 §16.4, re-verified against
`packages/server/src/local/routes/memory.ts` + `knowledge.ts`. Substrate = `memory_frames`
(+`_fts`/`_vec`) and `knowledge_entities/relations` in `packages/hive-mind-core/src/mind/`.

| PRD §16.4 endpoint | Status | Action — EXTEND existing vs NET-NEW · substrate |
|---|---|---|
| `GET /api/memory` | **PARTIAL** | EXTEND: alias/accept on existing `GET /api/memory/frames` (`memory.ts:188`). No new substrate. |
| `GET /api/memory/:id` | **MISSING** | NET-NEW thin route reading `FrameStore.getById(id)` (backend-map 05b §2). `memory_frames`. No migration. |
| `POST /api/memory` | **PARTIAL** | EXTEND: alias on `POST /api/memory/frames` (`memory.ts:237`). |
| `PATCH /api/memory/:id` | **PARTIAL** | EXTEND `PUT /api/memory/frames/:id` (`memory.ts:448`) to accept `PATCH` + bare `:id`. `FrameStore.update`. |
| `POST /api/memory/:id/archive` | **MISSING** | NET-NEW. Model archive as `FrameStore.update(id, importance:'deprecated')` (no hard delete) OR add `status` in the new `metadata` column (§6). `memory_frames`. |
| `DELETE /api/memory/:id` | **PARTIAL** | EXTEND: alias bare `:id` over `DELETE /api/memory/frames/:id` (`memory.ts:551`, → `FrameStore.delete`). |
| `POST /api/memory/merge` | **MISSING** | NET-NEW. Read N frames, synthesize merged content, write one frame, archive/delete the originals. Reuse `FrameStore` + dedup (`findDuplicate`, 05b §2). `memory_frames`. |
| `GET /api/memory/graph` | **EXISTS** | `knowledge.ts` `GET /api/memory/graph?scope=` — Graph tab. No work. |

**Adjacent reuse (no new endpoint):** Team tab → existing `GET /api/team/memory/search`
(`team.ts`, **Tier: TEAMS**, inventory backend-routes 1.8); Sources tab → existing
`GET /api/harvest/sources` (`harvest.ts`); stats column → existing `GET /api/memory/stats`
(`memory.ts:391`); conflict/relevance signals available from `CombinedRetrieval`
(backend-map 05b §8 `hasConflict`/`conflictNote`, `finalScore` relevance).

**.MIND MIGRATION FLAG (one, low-risk).** To back confidence / provenance-id / source-url /
tags / evidence / kind / title / status / relatedMemoryIds, `memory_frames` has **NO metadata
column today** (substrate-types.md (c): unlike `awareness.metadata` etc.). The migration runner
already does idempotent additive `ADD COLUMN` (precedent: it added `source`, `mind/db.ts:116-124`).
**Recommended:** ONE additive migration adding nullable
`metadata TEXT NOT NULL DEFAULT '{}'` to `memory_frames`, storing
`{kind,title,scope,sourceId,sourceUrl,confidence,tags,evidence,relatedMemoryIds,status}` as JSON.
This avoids touching the FTS5/vec0 virtual tables and the IPB scoring path. If `confidence`
becomes a primary filter/sort axis (PRD "filter by confidence" / "low-confidence surfaced"),
promote `confidence REAL` to a real indexable column in a later migration (same ADD-COLUMN
pattern). PRD §15.4 line 1013 explicitly endorses metadata-first.

> Latent-bug flag (not session-induced, surfaced by substrate-types.md (d)): `AuditRiskLevel`
> TS includes `'critical'` but the DDL CHECK allows only `low/medium/high` — irrelevant to S04
> but the same install-audit store backs Sources-tab provenance if surfaced; note for the plan.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

PRD §15.2 unions — **none exist in `apps/web/src/lib/types.ts`** (substrate-types.md (e)):
- Add `MemoryKind = 'fact'|'decision'|'task'|'preference'|'strategy'|'learning'|'goal'|'entity'`
  (PRD line 949). Current `MemoryFrame.type` (`types.ts:120`) uses `fact/event/insight/decision/
  task/entity` — OVERLAPS but mismatched (`event`/`insight` vs PRD `preference/strategy/learning/
  goal`). Reconcile.
- Add `Scope = 'personal'|'workspace'|'team'|'organization'` (line 945) — drives the Active/
  Workspace/Team tab partition. Today scope is IMPLICIT (which `.mind` file; surfaced as `_mind`
  tag, `memory.ts:34`).
- Add `Confidence = number` (0-100, line 946).

Extend `MemoryFrame` (PRD §15.4, lines 990-1013) toward: `kind, title, content, scope,
workspaceId, teamId, source, sourceId, sourceUrl, confidence, importance, evidence[], tags[],
relatedMemoryIds[], relatedArtifactIds[], createdAt, updatedAt, lastAccessedAt, status`.
`relatedArtifactIds[]` stays **deferred** (no Artifact entity exists yet — that's S05;
substrate-types.md (e)). Also fix the FE-type ↔ `normalizeFrame` mismatch noted in §3/§4.

---

## 7. Dependencies (screens/phases first)

- **Phase placement:** PRD §8 Phase 2 / Sprint 4 (Memory + Artifacts). Depends on **Phase 0**
  (shared frontend types + AppShell/IA freeze — the §15.2 unions live there) and on the
  workspace-state/context contract from Phase 1.
- **Workspace scope** (`scope`/`workspaceId`) presupposes the S01/S02 workspace-type-and-status
  fields (`WorkspaceConfigV2`, substrate-types.md (a)) for the Workspace/Team partition; usable
  with the implicit `_mind` scope before that lands, so soft dependency only.
- **Team tab** depends on TEAMS tier + the team substrate (S10 Team Workspace); gate behind
  `useFeatureGate`/tier and degrade to a "Teams feature" empty state otherwise.
- **Sources tab** reuses Harvest (already shipped); the broader Memory Import onboarding (S15/S16)
  is independent.
- **No dependency on S05 Artifacts** for v1 (defer `relatedArtifactIds`).
- Open question O3 (PRD line 1418): Graph view in v1 or later — Graph already works, so keep.

---

## 8. Effort: **L**

Frontend is a multi-pane rework with a brand-new trust/detail surface (confidence, evidence,
related, merge, archive, share) replacing a thin detail pane, plus 4-5 new subcomponents and a
hook/adapter/type reconciliation. Backend is mostly EXTEND/alias over existing memory routes
(7 of 8 endpoints), but the trust fields require **one additive `.mind` migration** + a real
`merge` endpoint + a `:id` read + an archive path — net-new logic, low schema risk. The single
migration and the FE/BE `MemoryFrame` contract reconciliation push this past M into L.

---

## 9. Open questions

1. **Confidence source.** `memory_frames` has no confidence today; `knowledge_relations.confidence`
   exists (edges only, schema.ts:93). Do we (a) store confidence in the new `metadata` JSON,
   (b) promote to a `REAL` column now for indexable low-confidence filtering, or (c) derive a
   proxy from `source` trust-class + `importance` until real confidence is computed? (PRD §12.4
   wants "filter by confidence" + "low-confidence surfaced for review".)
2. **Conflict detection surfacing.** `CombinedRetrieval.detectConflict` (05b §8) yields
   `hasConflict`/`conflictNote` at recall time, not as a stored per-frame state. Is the PRD
   "Conflict" state (§14.4) a live recall-time signal or a persisted frame status?
3. **Archive vs deprecate vs tombstone.** PRD §14.4 distinguishes Deprecated / Archived /
   Deleted-tombstoned. `importance:'deprecated'` exists; is "archive" a distinct status (needs
   the `metadata.status` field) or an alias of deprecate? Delete = hard `FrameStore.delete` or
   tombstone? (PRD Open Question O8, line 1423.)
4. **Merge semantics.** Does `POST /api/memory/merge` LLM-synthesize a combined frame, or just
   concatenate + re-cognify? What happens to the originals (archive vs hard delete)?
5. **Tab-relocation scope.** Confirm Weaver/Wiki/Evolution move OUT of the Memory-Center tab bar
   to their Intelligence-layer home (frontend.md (f)) is in-scope for S04, or deferred to the IA
   pass so S04 only adds the new tabs and leaves the legacy ones temporarily.
6. **`MemoryKind` reconciliation.** Drop FE `event`/`insight` and add PRD `preference/strategy/
   learning/goal`? This changes existing frame rendering + the type-filter chips.
