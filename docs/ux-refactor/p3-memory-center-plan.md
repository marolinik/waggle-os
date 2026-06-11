# P3 — D2 Two-Mind Memory Center (plan, 2026-06-11)

> **STATUS (2026-06-11, end of session): SHIPPED.** All sections below built as designed,
> then hardened by a 36-agent adversarial review (19 confirmed findings incl. 1 HIGH — all
> fixed; see `p3-review-record.md`). Final gates: FE 874/874 · server-local 891/891 · both
> tsc 0 · lint 0. Live Playwright runs verified all six flows against real data twice
> (pre- and post-review-fixes) AND caught two pre-existing defects the unit suites couldn't
> see (fixed + documented in the Live-run findings section at the bottom).

**Ratification:** D2 (open-questions.md §527): standalone `MemoryCenterApp` (ArtifactCenterApp
shape), top-level two-mind split — "About you" (Personal Mind) / "About this work" (Workspace
Mind, per workspace). Reuse `MemoryCenterTab` internals as the per-mind list. Legacy MemoryApp
tabs remain accessible as secondary tabs — restructure the entry, don't delete capability.
Also in P3 per conversion plan §5.3 #1-2: `/:mindScope` implementation + `?tab=` URL→tab wiring;
plus the P2-ledgered S02-FR2 Memory-tab embed in WorkspaceDesktopApp.

## Verified current state

- `GET /api/memory` (memory-center.ts:137) **always merges** personal + workspace stores; no
  mind-only selector. Response discriminator: `workspaceId` set ⇔ workspace mind.
- `MemoryCenterTab` is hardcoded personal-mind: `listMemories` without `workspaceId`, and its
  mutations (`patchMemory`/`archiveMemory`/`deleteMemoryById`/`mergeMemories`) never pass
  `workspaceId` — they would 404 on workspace-mind frames (candidateStores searches workspace
  store only when the param is present).
- **Latent id-collision class:** personal and workspace minds are separate SQLite DBs with
  colliding autoincrement frame ids. The merged list view can render key collisions and PATCH
  `?workspace=X` shadows a personal frame with the same id. The two-mind split structurally
  fixes the UI ambiguity (every view is single-mind); the merged legacy server behavior stays
  for back-compat but the new UI never uses it.
- `/memory/:mindScope?` route param reserved in App.tsx:68; MemoryRoute reads + voids it.
- AppShell §2.3 shim stashes `{appId, tab, automationId, filter}` and navigates with
  `queryString({tab, filter, ...})` — `?tab=` already arrives at the route; only `filter` is
  re-stashed today.
- WorkspaceDesktopApp `memory` tab = `TabPlaceholder` (line 982).
- MemoryApp.tsx (347 ln): 7-tab shell (memories/timeline/graph/harvest/weaver/wiki/evolution);
  'memories' → MemoryCenterTab; timeline = frames sidebar + detail pane (embedded JSX);
  graph = KnowledgeGraphViewer (props from route hooks); harvest/weaver/wiki/evolution are
  self-contained. Sole consumer: MemoryRoute.

## Design

1. **Server (additive):** `GET /api/memory` gains `mind=personal|workspace`.
   - `mind=personal` → personal store only. `mind=workspace` → workspace store only
     (requires `workspace` param → 400 without it; unknown workspace → empty results).
   - No `mind` → legacy merge (back-compat; nothing else consumes it after this phase, but
     the contract is public).
2. **Adapter:** `listMemories` gains `mind?: 'personal' | 'workspace'`.
3. **MemoryCenterTab** gains optional `{ mind = 'personal', workspaceId }` props.
   - `listMemories({ mind, workspaceId: mind==='workspace' ? workspaceId : undefined, ... })`.
   - All mutations pass `workspaceId` when mind is workspace (fixes the 404 class).
   - Reload on mind/workspaceId change (load deps). Defaults keep the 3 p2 tests + the
     WorkspaceDesktop embed call sites compatible.
4. **New `MemoryCenterApp.tsx`** — standalone shell, controlled like the ratified
   WorkspaceDesktopApp two-seam pattern:
   - Props: `{ mind, onMindChange, tab, onTabChange, workspaceId, workspaceName, ... }` +
     pass-through frame/KG props for the legacy tabs (from the route's useMemory /
     useKnowledgeGraph hooks, unchanged).
   - Tab row = Memories · Timeline · Graph · Harvest · Weaver · Wiki · Evolution (visual
     divider after Memories). Mind pills ("About you" / "About this work · {ws name}")
     render only on the Memories tab — legacy tabs keep their own scoping (Graph has its
     scope selector; Harvest writes personal by design).
   - "About this work" with no active workspace → disabled pill + hint (Home selects
     workspaces).
   - ImportReminderBanner carries over above the tab bar.
5. **Timeline extraction:** MemoryApp's frames-sidebar + detail JSX moves to
   `memory/TimelineTab.tsx` (same props, verbatim move). MemoryApp.tsx is then
   consumer-less and is **deleted** — every one of its 7 views remains reachable in the new
   shell (capability preserved; entry restructured, per D2).
6. **MemoryRoute:** validates `mindScope` (personal|workspace, default/unknown → personal)
   and `?tab=` (known tab ids, default memories); keeps the `?filter=` stash (J08 unchanged —
   default mind is personal, matching the personal-mind-only needsReviewCount). Mind switch →
   `navigate('/memory/'+mind+search)`; tab switch → setSearchParams. URL is the single
   source of truth (no internal state fork).
7. **WorkspaceDesktopApp:** memory TabPlaceholder → `<MemoryCenterTab mind="workspace"
   workspaceId={workspaceId} />` (S02-FR2 Memory part).

## Tests

- server memory-center: mind=personal excludes workspace frames; mind=workspace excludes
  personal; mind=workspace w/o workspace → 400; no mind → merge (regression pin).
- FE MemoryCenterTab: workspace mind passes mind+workspaceId to listMemories; patch/archive/
  delete/merge carry workspaceId; personal default unchanged.
- FE MemoryCenterApp: pills render/switch; legacy tabs mount their components; pills hidden
  on legacy tabs; disabled state w/o workspace.
- FE route: /memory/workspace lands workspace mind; ?tab=graph lands graph; invalid scope →
  personal; /memory?filter=unreviewed still seeds the status filter (J08 pin).
- FE WorkspaceDesktopApp: memory tab renders the per-mind list (placeholder gone).

## Sequencing

1. `feat(ux)`: server mind param + adapter + MemoryCenterTab parameterization + tests.
2. `feat(ux)`: MemoryCenterApp + TimelineTab extraction + MemoryApp retirement + route wiring
   + WS desktop embed + tests.
3. Adversarial review workflow → fixes → live Playwright smoke (mind pills, tab deep-link,
   J08 filter, workspace embed) → docs/decision-log note → commit/push.

## Out of scope

Namespacing frame ids across minds (server-wide change, post-launch); Research/Timeline/
Settings WorkspaceDesktop embeds (P7); memory-mcp canonical decision (deferred).

## Live-run findings (2026-06-11 smoke against real data)

1. **KnowledgeGraphViewer hard-crashed on untyped entities** — `n.type.toLowerCase()` threw
   on the real 214-entity personal graph (54 rows with no `type`), sending the whole Memory
   surface into its boundary. Pre-existing (the old MemoryApp Graph tab crashed identically);
   the new `?tab=graph` deep link surfaced it. Fixed with a single-entry `safeNodes` memo
   (`type || 'unknown'`, `label || String(id)`); 'unknown' joins the legend as a first-class
   chip (verified live: 60 nodes, `unknown 54` chip, no boundary).
2. **Timeline duplicate React keys on real data** — frame id `36` exists in BOTH minds and the
   legacy frames API merges them; `key={f.id}` duplicated. The exact cross-mind id-collision
   class this plan documented. Fixed: `key={'${workspaceId ?? "personal"}:${id}'}`.
3. **Self-review (pre-smoke): stale rows under the new mind's pill** — on mind switch the old
   list stayed rendered until the new fetch landed (`loading && length===0` gate). Fixed by
   clearing the list in the mind-switch reset effect; pinned with a never-resolving second
   fetch test.

Both live-run defects were invisible to the unit suites for the same reason as P2's
artifacts-envelope HIGH: tests mock the adapter above the layer where real data misbehaves.
The live run remains mandatory phase kit.
