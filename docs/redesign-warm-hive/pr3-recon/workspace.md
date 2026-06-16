# PR3 Recon — SCREEN 03 · Workspace (Variation A: Overview + tabs)

Maps the **current** Workspace surface against the warm-Hive design (`workspace.html`,
`SCREENS.md` §03). Ship target = **Variation A "Overview + tabs"**, **Memory stays a
tab** (do NOT make the knowledge-graph the default — that's the alternate Variation B,
deferred).

Primary file: `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx` (1020 LOC).
Route wrapper: `apps/web/src/routes/WorkspaceRoute.tsx`.
Design ref: `docs/design_handoff_waggle_app/design-files/screens/workspace.html`.

---

## 1. Current structure (with line refs)

`WorkspaceDesktopApp.tsx` is a fixed-layout shell (no drag/resize grid, per its header
comment lines 9-21). Composition top-to-bottom:

- **Tab model** — 8 tabs, `WorkspaceTabId` union + `TABS` array
  (`WorkspaceDesktopApp.tsx:58-77`): `overview · chat · research · artifacts · memory ·
  tasks · timeline · settings`. Each tab is `{ id, label, icon }` (lucide icons). **No
  per-tab counts.**
- **Header** (`:759-811`) — flat row: `<h2>` workspace name (`:761`), a **type pill**
  (`:762-766`), a **status pill** (`statusPillClass`, `:767-772` + helper `:117-126`),
  an inline "N running" agent indicator (`:773-778`), a **members avatar stack**
  (`:783-798`, initials, max 5 + overflow), and the **`WorkspaceActionsMenu`**
  (`:800-809`, rename/archive/restore/export/delete). **No breadcrumb. No hex avatar.
  No meta row** (memories/sources/updated). **No "Memory"/"Continue" header buttons.**
- **Tab bar** (`:814-839`) — horizontal scroll nav, `role=tablist`. Active tab =
  `border-primary` bottom border + `text-foreground` (`:827-831`); honey comes via the
  `--primary` token so the underline is already honey-tinted. Icon + label per tab, **no
  count badges**.
- **Body = main canvas + right context panel** (`:842-969`):
  - **Overview** (`OverviewTab`, `:518-545`) — a **widget grid**
    (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`, fixed 16rem row height, `:530-533`):
    5 `WidgetCard`s — `ChatPreviewWidget` (read-only thread preview, `:184-232`),
    `ArtifactsWidget` (file registry, `:241-283`), `TasksWidget` (pending+blocked from
    state, `:286-333`), `MemoryHighlightsWidget` (decisions + "I remember", `:335-377`),
    `ActivityWidget` (audit feed, `:379-401`). Empty-state when everything empty
    (`:850-868`).
  - **Other tabs** — `chat` renders the `chatSlot` or a deep-link placeholder
    (`:882-902`); `tasks` → `<TasksTab>` (`:904`); `memory` →
    `<MemoryCenterTab mind="workspace">` (`:937-941`); `research`/`timeline`/`settings`
    are `<TabPlaceholder>` stubs (`:906-957`); `artifacts` is an inline file-card grid
    or placeholder (`:914-932`).
  - **Right context panel** (`WorkspaceInfoPanel`, `:405-514`, `hidden lg:flex w-72`):
    Workspace block (name/desc + memory/session counts, `:422-439`), **Team members**
    (`:441-460`, global roster — see §2), **Last activity** + "N agents running"
    (`:462-481`), **Quick actions** (Open chat / View memory / Review tasks, `:483-511`).
- **Whole-screen states** — loading (`:691-698`), `permission`/`notfound`/`offline`
  error variants (`:700-754`) via `FullScreenState` (`:1000-1018`), empty-workspace
  (`:850-868`).
- **Route wrapper** (`WorkspaceRoute.tsx`) — `/workspaces/:workspaceId/:tab?`; the URL
  drives `activeTab` (controlled seam §5.2a, `:43-54`); `onTabChange` navigates
  (overview = bare `/workspaces/:id`, `:52-53`); `chatSlot` portals the live chat
  (`:57`); URL→shell sync effect (`:34-38`). The 8 tabs are pinned in `WS_TABS`
  (`:20-22`).
- **`WorkspaceBriefing.tsx`** (284 LOC) — a SEPARATE component, shown **inside ChatApp**
  when a thread has no messages (header comment `:1-5`). Reads the SAME
  `getWorkspaceContext` (`:57`). Holds "I Remember" / "Recent Decisions" / "Recent
  Conversations" / suggested-prompt chips / stats bar. **It is not part of the Workspace
  Desktop shell** — it's the chat empty-state. Useful as a copy/data reference for the
  Overview's "What Waggle knows" rows but is not the screen being rebuilt. Its
  collapsed-state persistence is `lib/workspace-briefing-state.ts` (tested — see §3).

---

## 2. Data contract — what's REAL vs mocked

The Overview's three data feeds come from real, populated endpoints (verified in
`packages/server/src/local/routes/workspaces.ts`). The DESIGN, however, surfaces several
fields the contract does NOT yet provide. Table below; "✔ real" = endpoint returns it
today, "✖ mock" = design shows it but no field exists, "~ derivable" = computable from
existing data.

### Endpoints + adapter methods (all real, no envelope)
| Adapter (`lib/adapter.ts`) | Route (`workspaces.ts`) | Returns |
|---|---|---|
| `getWorkspaceContext(id)` `:582` | `GET /:id/context` `workspaces.ts:364-655` | summary, recentMemories, recentDecisions, recentThreads, suggestedPrompts, `stats{memoryCount,sessionCount,fileCount}`, greeting, pendingTasks, workspace{type,status,description} |
| `getWorkspaceState(id)` `:601` | `GET /:id/state` `:663-693` | active/openQuestions/**pending**/**blocked**/completed/stale/recentDecisions/nextActions (WorkspaceStateView) |
| `getWorkspaceActivity(id,limit)` `:606` | `GET /:id/activity` `:699-742` | `{events:[{id,ts,type,actor?,summary}]}` from audit_events |
| `getWorkspaceFiles(id)` `:587` | `GET /:id/files` `:744-756` | `{files:[…]}` from file registry (interim "artifacts") |
| `getTeamMembers()` `:2160` | (global team roster) | `[{id,name,status,avatar?}]` — **NOT workspace-scoped** (`WorkspaceDesktopApp.tsx:660-666` TODO) |

### Design field → reality
| Design element (workspace.html / SCREENS §03) | Source | Status |
|---|---|---|
| **Header meta: "142 memories"** | `ctx.stats.memoryCount` | ✔ real |
| **Header meta: "9 sources"** | — | ✖ mock (no `sourceCount`; harvest sources exist in mind but not exposed on context) |
| **Header meta: "1 agent live"** | `useRoomState().workspaceMap.get(id).live.length` (`:603-607`) | ✔ real (live SSE) |
| **Header meta: "updated 2h ago"** | `ctx.lastActive` (`:592,646`) | ~ derivable (have `lastActive`; relativeTime helper exists `:135-147`) |
| **Tab counts (Chat 3 · Memory 142 · Artifacts 7 · Files 12 · Team 4)** | memory=`stats.memoryCount` ✔; sessions=`stats.sessionCount` ✔; files=`stats.fileCount` ✔; team=`getTeamMembers().length` ✔(global); **artifacts** ✖ (no distinct artifact entity — interim = files) | ~ mostly derivable; artifacts count is the gap |
| **Left: summary card** | `ctx.summary` (`composeWorkspaceSummary` `workspaces.ts:31-75`) | ✔ real |
| **"What Waggle knows" fact rows** | `ctx.recentMemories` (content+importance+date) and/or `ctx.recentDecisions` | ✔ content real; **✖ per-fact provenance `⬡ source · when`** (frames have no `source` surfaced — design's "web · mem0.ai", "teardown.md" are mock; `date` IS present so "·when" is real) |
| **"Recent work" artifact rows (ext tile + name + provenance + time)** | `getWorkspaceFiles` → `normalizeArtifacts` (`:977-998`): name, mimeType/modifiedAt | ✔ name+time real; **✖ provenance source** ; ext-tile derivable from filename |
| **Right Status: agent live + name** | `useRoomState` live list — name not in the view-model today | ~ "live" real, agent NAME ✖ mock |
| **Right Status: model "auto · Claude Sonnet"** | `ctx.workspace.model` (`workspaces.ts:625`) | ✔ real (model id; "auto" + friendly name is display) |
| **Right Status: "+6 today"** | — | ✖ mock (no per-day memory delta on context; overnight delta exists on Home `OvernightSummary.consolidated` but not per-workspace) |
| **Right Status: "3 to review / Needs review"** | `HomeBriefing.needsReviewCount` exists at HOME scope (J08); per-workspace ✖ | ✖ mock at workspace scope |
| **Right "Up next" rows** | `state.pending` + `state.blocked` + `state.nextActions` + cron `upcomingSchedules` | ~ derivable (TasksWidget already uses pending/blocked; nextActions+schedules unused on this screen) |
| **Right Team avatar rows** | `getTeamMembers()` | ✔ real but **global roster, not per-workspace** (documented TODO `:660-662`) |

**Net:** the three load-bearing columns (summary, knowledge/memory facts, recent
work/artifacts, status counts, up-next, team) are all **backed by real endpoints**. The
**provenance `⬡ source · when` line** (a core trust pattern, README §6) is the single
biggest data gap — memory frames have a `source` column server-side
(`workspaces.ts:291` writes `source`, `:413` SELECTs around it) but it is **not
projected into `recentMemories`/`recentDecisions`** today, nor onto file rows. "9
sources", "+6 today", per-workspace "N to review", and a distinct **artifacts** entity
(vs files) are genuinely absent.

---

## 3. Test contract

What PR3 must NOT break (existing tests touching this surface):

- **`apps/web/src/test/p1a-workspace-route.test.tsx`** — pins the **route ↔ shell
  contract**, NOT the visual layout. Asserts `WorkspaceRoute` calls
  `selectWorkspace(routedId)` on deep-link / Back-Forward, skips when already active,
  and **never** syncs the `local-default` placeholder (`:56-80`). It mocks
  `WorkspaceDesktopApp` to a stub (`:30-32`) and `ChatHost`/`ChatSlot` (`:33-36`). The
  route renders under `path="workspaces/:workspaceId/:tab?"` (`:44`). **Constraint:** the
  `:tab?` param, the `selectWorkspace`-on-route effect, and the `local-default` guard
  must survive any rewrite of `WorkspaceRoute`.
- **`apps/web/src/lib/workspace-briefing-state.test.ts`** — pins the per-workspace
  briefing-collapsed localStorage helpers (key prefix `waggle:workspace-briefing-
  collapsed:`, sanitisation, per-id isolation, no colon-boundary leak). Only relevant if
  the briefing collapse behavior is carried into the new Overview; the helpers themselves
  can be reused as-is.
- **Implicit `data-testid` contract** (consumed by live-smoke / Playwright + the empty
  flows): `ws-desktop-root`, `ws-tab-bar`, `ws-tab-<id>`, `ws-tab-panel`,
  `ws-overview-grid`, `ws-widget-{chat,artifacts,tasks,memory,activity}`,
  `ws-info-panel`, `ws-status-pill`, `ws-members-stack`, `ws-agents-running`,
  `ws-desktop-{loading,permission-denied,notfound,offline,retry}`, `ws-memory-tab`.
  Changing the tab set (8→6) removes `ws-tab-{research,tasks,timeline,settings}` — grep
  for those test ids before deleting (none appear in the two test files above, so the
  risk is in untracked Playwright smokes, not unit tests).

There is **no test that pins the 8-tab set, the widget-grid layout, or the right-panel
contents** — so the Overview re-layout (grid → 2-col 1.7fr/1fr) and the tab reduction
are free to change as long as the route/shell contract and the load-bearing test ids are
preserved.

---

## 4. Design spec — Variation A (exact copy + structure)

From `SCREENS.md` §03 + `workspace.html` Variation A markup:

**Header** (`workspace.html:138-155`):
- **Breadcrumb** (`.crumbs`, mono 11.5px, `--text-dim`): `Home › **Competitive
  Intelligence**` (current workspace bold).
- **46px hex avatar** (`.wmark.hex`, 46×52, honey gradient `--honey-bright → --honey-deep`,
  `#1a1407` glyph) showing the workspace initial.
- **H1** title (Hanken 650, 28px, `-0.02em`).
- **Meta row** (`.wmeta`, 13px `--text-muted`, gap 14px): `● 1 agent live` (live dot
  `--healthy`) · `142 memories` · `9 sources` · `updated 2h ago`.
- **Header actions** (right): `Memory` (ghost button) + `Continue →` (honey primary).

**Tab bar** (`.tabs`, `workspace.html:157-164`): `Overview · Chat 3 · Memory 142 ·
Artifacts 7 · Files 12 · Team 4`. Active tab = `--text` + **2px honey bottom-border**
(`.tab.on`, `:44`). Each count is a mono 11px `--text-dim` `.cnt` span.

**Overview content** — 2-col grid `1.7fr / 1fr`, gap 22px (`.grid`, `:49`):

- **Left col:**
  - **Summary card** (`.card`, `.summary` 15.5px/1.6, honey-bold keywords). Exact sample
    copy: *"This workspace tracks the **persistent-memory competitor landscape** for the
    Q2 board cycle. Waggle has mapped **9 rivals**, pulled current pricing, and drafted a
    teardown — the live thread is mid-flight on turning the opening into a board brief."*
  - **"What Waggle knows"** section (`.sec-h` mono uppercase label + brain icon, `:177`)
    → `.knows` list of `.fact` rows (`:61-67`): each = a **30px hex check tile**
    (honey-gradient, `#1a1407` checkmark) + fact text (honey-bold spans) + a
    **provenance line** `⬡ **source** · when` (`.prov`, mono 10.5px, `.src` =
    `--intel`). Sample facts (`:279-284`): "Mem0 is cloud-only and raised prices ~15%…"
    (`web · mem0.ai · 2h ago`), "Only 2 of 9 rivals ship local-first memory."
    (`teardown.md · 2h ago`), "Mara wants the board brief to lead with the regulated-
    industries opening." (`chat · Tue · 2d ago`), etc.
  - **"Recent work"** section (file icon, `:182`) → `.arts` list of `.art` rows
    (`:71-78`): **32px ext tile** (tinted by type color, mono ext label e.g. `MD`/`XLS`/
    `PDF`) + name (`<b>`) + subtitle + right-aligned mono `.when` time. Samples (`:288-291`):
    `teardown.md` "Q2 competitive teardown · 9 competitors" `2h ago`,
    `pricing-landscape.xlsx`, `mem0-teardown.pdf`. Rows hover → `--honey-line` border.

- **Right col** (three `.card`s):
  - **Status** (`:188-194`): `.stat-line` rows — `Agent` → `● Research-synth · live`
    (`--healthy`); `Model` → `auto · Claude Sonnet`; `Memories` → `142 **+6 today**`
    (delta `--healthy`); `Needs review` → `3 memories` (`--attention`).
  - **Up next** (`:196-201`): `.agentrow`s — colored dot + label + mono status: `Board
    brief from teardown` (draft, `--work`); `Export table → Salesforce` (awaiting you,
    `--attention`); `Weekly digest` (`17:00`, `--healthy`).
  - **Team** (`:203-206`): `.person` rows — 30px round avatar (initial, colored bg) +
    name + role: `Mara K. · Owner`, `Research-synth · Agent · live`, `Deck-builder ·
    Agent · idle`, `Jonas P. · Editor`.

**Non-Overview tabs** in this concept pass are a single empty placeholder (`.emptytab`,
`:211-216`): *"This tab is wired in the full prototype — Overview is the focus of this
concept pass."* — i.e. the design only fully specs Overview; the other tabs route to the
**real existing screens** (see §6).

**Memory stays a tab** (SCREENS §03 emphatic, README §4/§5 table). Variation B
(memory-forward knowledge-graph as the default view, `workspace.html:219-265`) is an
**alternate to defer**, NOT this PR.

---

## 5. Gap table (current → design)

| # | Area | Current | Design (Var A) | Severity |
|---|------|---------|----------------|----------|
| G1 | **Tab set** | 8 tabs: Overview/Chat/**Research**/Artifacts/Memory/**Tasks**/**Timeline**/**Settings** (`:68-77`) | 6 tabs: Overview/Chat/**Memory**/Artifacts/**Files**/**Team** | HIGH — drop Research/Tasks/Timeline/Settings from the bar; add Files + Team; reorder |
| G2 | **Tab counts** | none | per-tab mono count (Chat N·Memory N·Artifacts N·Files N·Team N) | MED — wire from `stats` + members; artifacts count gap |
| G3 | **Header avatar** | none | 46px hex avatar, honey gradient, workspace initial | MED — reuse `.hex` clip-path + initialsOf |
| G4 | **Breadcrumb** | none | `Home › Workspace` mono crumb | LOW |
| G5 | **Header meta row** | type pill + status pill + "N running" | `● agent live · N memories · N sources · updated Xago` | HIGH — restyle to meta row; "sources" is a data gap (§2) |
| G6 | **Header actions** | WorkspaceActionsMenu (kebab) | `Memory` ghost + `Continue →` honey | MED — add the two buttons; KEEP the actions menu (real feature, not in mock) |
| G7 | **Overview layout** | 3-col equal-height widget grid | 2-col 1.7fr/1fr: left summary+knows+recent-work, right status+upnext+team | HIGH — full re-layout |
| G8 | **"What Waggle knows" rows** | `MemoryHighlightsWidget` (plain list, no provenance, no hex tile) | `.fact` rows: hex check tile + honey-bold text + `⬡ source · when` provenance | HIGH — new row component; **provenance source is a data gap** |
| G9 | **"Recent work" rows** | `ArtifactsWidget` (file icon + name) | `.art` rows: ext tile + name + subtitle + mono time + hover border | MED — restyle; ext-tile + provenance |
| G10 | **Status card** | scattered in right panel (counts + last activity) | one Status card: agent/model/memories+delta/needs-review | MED — consolidate; "+6 today" & "needs review" are data gaps |
| G11 | **Up next card** | none (tasks live in a widget + Tasks tab) | `.agentrow` list (draft/awaiting-you/scheduled) | MED — derivable from pending/blocked/nextActions/schedules |
| G12 | **Team card** | right-panel "Team members" (global roster) | Team card with role labels (Owner/Agent·live/Editor) | LOW — restyle; still global-roster-backed |
| G13 | **Right context panel** | persistent `w-72` aside (info/team/last-activity/quick-actions) | folded INTO the Overview right column; no separate aside | MED — the aside's content moves into the grid's right col |
| G14 | **Provenance pattern** | absent on this screen | `⬡ source · when` on every fact + artifact (core trust pattern) | HIGH (trust) — needs `source` projected from frames (§2) |
| G15 | **Tokens/typography** | shadcn `text-foreground/muted-foreground`, `font-display`, 10-12px dense | warm tokens, Hanken H1 28/650, 13-16px body, mono labels | MED — apply warm-Hive tokens (already shipped, §6) |
| G16 | **Memory tab** | `<MemoryCenterTab mind="workspace">` already embedded (`:937-941`) | Memory stays a tab | ✅ already correct — keep |

---

## 6. Reuse + build — tab bar → existing routes

The 6 design tabs map cleanly onto surfaces that **already exist**; PR3 rebuilds the
SHELL + Overview, and the other 5 tabs embed/deep-link the real screens:

| Design tab | Maps to | Exists? | How to wire |
|---|---|---|---|
| **Overview** | `WorkspaceDesktopApp` Overview canvas | ✔ (re-layout) | Rebuild as 2-col grid; this is the bulk of PR3 |
| **Chat** | `ChatSlot` (live per-workspace chat) | ✔ — `WorkspaceRoute.tsx:57` already portals `<ChatSlot workspaceId>` into the `chat` tab via the `chatSlot` seam (`WorkspaceDesktopApp.tsx:112,885`) | reuse as-is |
| **Memory** | `MemoryCenterTab` | ✔ — already embedded `WorkspaceDesktopApp.tsx:937-941` (`mind="workspace"`, `consumeDeepLinks={false}`) | reuse as-is (✅ G16) |
| **Artifacts** | `ArtifactsRoute`/Artifact Center | ✔ route exists (`routes/index.ts:36`); workspace tab currently inlines a file-card grid (`:914-932`) | embed the Artifact Center component, or keep the file grid until the real artifact entity lands (§2 gap) |
| **Files** | `FilesRoute` | ✔ route exists (`routes/index.ts:37`) | NEW tab — embed the Files surface scoped to the workspace; data via `getWorkspaceFiles` (already used) |
| **Team** | `TeamRoute` | ✔ route exists (`routes/index.ts:48`) | NEW tab — embed Team; or a workspace-scoped panel. NB roster is global today (§2) |

**Drop from the bar** (no longer top-level per design): **Research** (placeholder stub
only `:906-912`), **Tasks** (still a real `<TasksTab>` `:904` — relocate to the
Overview "Up next" card + keep reachable, don't delete the component), **Timeline**
(stub `:943-948` — lives at `/settings/timeline` per `routes/index.ts:29`), **Settings**
(stub `:951-957` — lives at `/settings`). Update `WS_TABS` in `WorkspaceRoute.tsx:20-22`
and the `WorkspaceTabId` union to the 6-tab set; unknown `:tab?` already falls back to
overview (`WorkspaceRoute.tsx:43-45`), so stale `/workspaces/:id/tasks` links degrade
gracefully.

**Reuse without change:**
- **Warm tokens already shipped** (PR1): `apps/web/src/index.css` defines `--honey`,
  `--honey-wash`, `--honey-line`, `--honey-bright/-deep`, `--intel`, `--work`,
  `--healthy`, `--bg`, `--surface*`, `--text*` (verified `:149-167`) + the shadcn HSL
  core derives from them (`--primary` = honey `:29`). The Overview can use these
  directly. `apps/web/src/waggle-theme.css` is the companion sheet.
- **Helpers in-file:** `initialsOf` (`:128-133`, for hex avatar + team), `relativeTime`
  (`:135-147`, for "updated Xago" + artifact times), `normalizeArtifacts` (`:977-998`),
  `humanizeActivitySummary` (`lib/activity-labels`).
- **Hex motif:** README §7 `.hex { clip-path: polygon(...) }` — add a Tailwind/utility
  class for the 46px header avatar + the 30px fact check-tiles + 32px ext tiles.
- **Data plumbing:** the existing `useEffect` load (`:613-679`) already fetches context/
  state/activity/members/files — **no new adapter calls needed** for Overview except
  optionally projecting `source` onto memory rows (server change, §2/G14) and a per-
  workspace artifacts/sources count (G2/G5).
- **`WorkspaceBriefing.tsx`** importance pills + "I Remember"/"Recent Decisions" copy
  (`:181-199,164-178`) are a good reference for the "What Waggle knows" fact rows, but
  the briefing itself stays the chat empty-state — don't fold it into the shell.

**Build new:** the 2-col Overview grid + `FactRow` (hex check tile + provenance),
`ArtRow` (ext tile + provenance + time), `StatusCard`, `UpNextCard`, `TeamCard`, the
46px hex header avatar + breadcrumb + meta row, and the `Memory`/`Continue →` header
buttons. Fold the current right `aside` content into the grid's right column (G13).
