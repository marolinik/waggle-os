# Gap Card — S02 · Workspace Desktop

> Screen S02 of the Waggle OS UX-refactor. PRD §12.2 (lines 412-447). Execution model: **in-place
> incremental refactor** of `apps/web` + targeted sidecar extensions. Mockup
> (`screen_02_workspace_desktop.png`) is **directional**; PRD acceptance criteria win.
> Every claim grounded in repo source (paths cited).

---

## 1. Screen & purpose

**Purpose (PRD §12.2):** the primary runtime for a single bounded work context. It demotes chat
from "the whole product" to **one widget among many**, surfacing workspace state, artifacts, memory,
tasks, research, and activity on a single screen, with chat/agent interaction co-resident.

**Mockup reading** (`Waggle_OS_Handoff_Assets/screen_02_workspace_desktop.png`): a full-screen
(non-floating) layout for "Germany GTM Strategy" with:
- **Left nav rail** — Workspaces / Memory / Agents / Automations / Files / MCP Hub / Connectors + favourites + user tile.
- **Header** — workspace name + status pill ("Active"), team avatar stack, Share button, global search.
- **Tab bar** — Overview · Chat · Research · Artifacts · Memory · Tasks · Timeline.
- **Main canvas (Overview tab)** — multi-widget grid: AI workspace/chat preview, Key Artifacts list,
  Tasks list, Memory highlights, Research overview (donut), Recent activity feed.
- **Right panel** — Workspace info, Members, Last activity, quick actions.
- (Implied) **status bar** — agents running / automations active / MCPs connected.

> The blueprint text page for "Screen 2 — Workspace Desktop" (`_blueprint_extracted.txt:675`) is an
> image-only placeholder; the only textual spec is PRD §12.2 + the §0/§9/§19 spine references
> (`_blueprint_extracted.txt:15,42,63,274,513,585`).

---

## 2. Required states (PRD/Blueprint)

**Functional requirements (PRD §12.2, lines 423-430):**
- Header: workspace name, **type**, **status**, team/avatar stack, share controls.
- Tabs: Overview, Chat, Research/Notes, Artifacts, Memory, Tasks, Timeline, Settings.
- Main canvas widgets: AI workspace/chat, key artifacts, tasks, memory highlights, research overview, recent activity.
- Right panel: workspace info, members, last activity, quick actions.
- Bottom/status bar: agents running, automations active, MCPs connected.
- Fixed default layout initial release; configurable widgets deferred to a later phase.

**States (PRD §12.2, lines 432-441):** No memory · Active work · Agent running · Artifact ready ·
Task blocked · Sync conflict · Permission denied · Offline.

**Acceptance criteria (PRD §12.2, lines 443-447):**
- Chat is one widget, not the whole product.
- Workspace state is always visible.
- User can reach memory, artifacts, agents, skills, tasks, automations, and settings from the workspace.

**Cross-cutting (Blueprint §state-rules):** server-derived state — "Home Cockpit and Workspace
Desktop must use server workspace-state/context APIs" (`_blueprint_extracted.txt:513`); cache
invalidation on memory import / artifact update / agent-run completion / connector sync / automation
completion / RBAC change (`:514`).

---

## 3. Current state in repo

**Disposition: `create-new` (the tabbed Workspace Desktop screen does not exist), reusing existing
substrate heavily.** There is **no** workspace-runtime surface today. The closest analog is a
chat-only floating window:

- **`apps/web/src/components/os/Desktop.tsx`** — root OS shell. `renderAppContent()` is a
  `switch(win.appId)` (`:276-360`); a workspace "opens" only as `case 'chat'` →
  `<ChatWindowInstance>` (`:278-296`). There is **no `case 'workspace'`** and no tabbed runtime.
  Apps are floating windows (`AppWindow` chrome), not a full-screen workspace surface. `appConfig`
  (`:77`) has no workspace entry.
- **`apps/web/src/components/os/apps/ChatWindowInstance.tsx`** — per-window wrapper: owns model
  fetch + per-window persona/autonomy, renders only `<ChatApp>` (`:221-248`). Chat **is** the whole
  window — the exact inversion PRD §12.2 forbids.
- **`apps/web/src/components/os/WorkspaceBriefing.tsx`** — ChatApp "home screen" shown when a session
  has no messages. Fetches `GET /api/workspaces/:id/context` via `adapter.getWorkspaceContext()`
  (`:57`) and renders greeting / stats / pending tasks / recent decisions / "I Remember" memories /
  recent threads / cross-workspace hints / suggested prompts / upcoming schedules. **This is the
  single best reuse seed** — it already consumes the "Workspace Now" block the Overview tab needs,
  but it lives *inside* chat and is read-only (no artifacts, no tasks CRUD, no tabs, no right panel).
- **`apps/web/src/components/os/apps/DashboardApp.tsx`** — Workspaces grid (select/create/open-chat).
  This is the workspace **list** (S01-adjacent), not the per-workspace runtime.
- **`apps/web/src/components/os/apps/RoomApp.tsx`** — live sub-agent tiles via `useRoomState` SSE
  (`:24`); the "agents running" status indicator can be derived from this per-workspace.
- **`apps/web/src/components/os/overlays/ContextRail.tsx`** — right-side rail for a clicked
  frame/entity (`ContextRailTarget`); a **reuse target for the right-panel detail pattern**, but it
  is an overlay keyed to a single frame, not a persistent workspace info/members/activity panel.

**Tabs that already have a host component** (to embed, not rebuild): Memory → `MemoryApp.tsx`,
Timeline → `TimelineApp.tsx`, Chat → `ChatWindowInstance`/`ChatApp`, Settings →
`SettingsApp.tsx`. **Tabs with NO host:** Overview (new), Research/Notes (new), Artifacts (no
backing entity at all — see §5), Tasks (store exists server-side, never wired to FE — see §4/§5).

**Adapter gap (confirmed by grep on `apps/web/src/lib/adapter.ts`):** `getWorkspaceContext` (`:272`),
`getWorkspaceFiles` (`:277`), `getPins`/`addPin` (`:1353/:1361`), `getDocuments` (`:1371`) exist;
**no `getTasks` / `getWorkspaceState` / `getWorkspaceActivity` methods** (0 matches). So the Tasks
list, the `/state` Overview source, and the activity feed have no client plumbing yet.

---

## 4. Frontend work

### Components to create
| Component | Role | Reuse / source |
|---|---|---|
| `apps/WorkspaceApp.tsx` (new) | Full-screen workspace runtime shell: header (name/type/status/avatars/Share) + `Tabs` + right panel + status bar. Owns `activeTab` state. | `components/ui/tabs.tsx`; header layout from `StatusBar.tsx` + `chat-header-layout.ts`; tab gating via `useFeatureGate`. |
| `workspace/OverviewTab.tsx` (new) | Default tab: widget grid (chat preview, key artifacts, tasks, memory highlights, research, recent activity). | **Port the read-only sections of `WorkspaceBriefing.tsx`** (greeting/decisions/memories/threads) into widget cards; add artifacts/tasks/activity widgets. |
| `workspace/WorkspaceInfoPanel.tsx` (new) | Right panel: info, members, last activity, quick actions. | Members from `adapter.getTeamMembers()`; "last activity" from new activity hook; quick actions raise `waggle:open-app`. ContextRail stays a separate frame-detail overlay. |
| `workspace/TasksTab.tsx` (new) | Task list/board for the workspace. | Net-new FE; backs onto existing `/api/workspaces/:id/tasks` (server store exists, FE plumbing missing). |
| `workspace/ResearchTab.tsx` (new) | Research/Notes surface. | Lightweight: notes-as-frames (memory) + wiki pages (`adapter.getWikiPages`). Lowest-fidelity tab; can ship as "notes" v1. |
| `workspace/ArtifactsTab.tsx` (new) | Artifacts grid (see S05 dependency). | Backs onto new `/api/artifacts` (net-new) or interim file-registry view via `getWorkspaceFiles`/`getDocuments`. |

### Components to rework / wire
- **`Desktop.tsx`** — add `case 'workspace'` to `renderAppContent` + an `appConfig.workspace`
  entry; route `openChatForWorkspace` callers that should open the *desktop* (not a chat window) to a
  new `openWorkspace(workspaceId)`. Decide window-vs-fullscreen (recommend full-bleed window using
  existing maximize path in `AppWindow.tsx` to avoid a parallel layout system). **Surgical** — do
  not refactor the window manager.
- **`useWindowManager.ts`** — add `workspace` to the `AppId` consumption; reuse `workspaceId` field
  already on `WindowState`. No new state shape.
- **Embed existing apps as tab panels** — Memory/Timeline/Chat/Settings render their existing
  components scoped by `workspaceId` (already accepted props on `TimelineApp`, `ChatWindowInstance`).

### Adapter methods / hooks to add (`lib/adapter.ts` — the one contract surface)
- `getWorkspaceState(id)` → `GET /api/workspaces/:id/state` (Overview; PARTIAL backend, §5).
- `getWorkspaceActivity(id, {limit})` → `GET /api/workspaces/:id/activity` (activity feed; PARTIAL, §5).
- `getTasks(workspaceId)` / `createTask` / `updateTask` / `deleteTask` → `/api/workspaces/:id/tasks*`
  (routes EXIST, adapter methods MISSING).
- New hook `useWorkspaceDesktop(workspaceId)` composing state + activity + tasks + members +
  fleet (agents-running) + cron (automations) + capabilities/status (MCPs-connected) for the status
  bar. Reuse `useRoomState` for live agents.

---

## 5. Backend work

Per PRD §16.2 plus the substrate the Overview/widgets/status-bar need. Cross-referenced against
backend-routes inventory + backend-map `03c`.

| PRD §16 endpoint | Status | Extend vs net-new · substrate · migration |
|---|---|---|
| `GET /api/workspaces/:id` | **EXISTS** | `workspaces.ts`. Header name/team. But `type`+`status` fields are **MISSING** on `WorkspaceConfig` (`hive-mind-core/src/workspace-manager.ts:5-58`) — additive JSON fields, **no DB migration** (workspace.json file). Default `status:'active'`; derive `type` from `templateId`/`group`. |
| `PATCH /api/workspaces/:id` | **EXISTS** | `workspaces.ts`. Used for status change / Share controls. Stamp `updatedAt` in `update()` (`workspace-manager.ts:222`, currently unstamped). |
| `GET /api/workspaces/:id/context` | **EXISTS** | `workspaces.ts:311` — the "Workspace Now" block (`buildWorkspaceNowBlock()`, `workspace-context.ts:191-404`). Direct feed for Overview widgets (greeting/decisions/memories/threads/pending/schedules). |
| `GET /api/workspaces/:id/state` | **PARTIAL → EXTEND** | No `/state` route. `buildWorkspaceState()` (`workspace-state.ts:234-311`) already produces `active/openQuestions/pending/blocked/completed/stale/recentDecisions/nextActions` and is surfaced *inside* `/context` as `workspaceState`. Add a thin `/state` route returning that sub-object directly (Overview/Tasks consume `pending`+`blocked` as task seeds). Substrate: `memory_frames` + session JSONL + `awareness`. No migration. |
| `GET /api/workspaces/:id/activity` | **PARTIAL → EXTEND** | No per-workspace `/activity`. Closest: `GET /api/events?workspaceId=` (`events.ts`) and `GET /api/teams/:id/activity`. Add a thin `/activity` alias over the audit-event query (substrate: `ai_interactions`/`execution_traces`/events). No migration. |
| Tasks: `GET/POST /api/workspaces/:id/tasks`, `PATCH/DELETE …/:taskId` | **EXISTS (server)** | `tasks.ts` (backend-routes §1.7). Only FE plumbing missing — no net-new backend. |
| Status bar feeds | **EXISTS, no aggregate** | agents → `GET /api/fleet` (`fleet.ts`); automations → `GET /api/cron` (`cron.ts`); MCPs connected → `GET /api/capabilities/status` (`mcpServers[]`) / `install_audit`. Compose client-side in v1; an aggregate `/status` route is optional. |
| Members / Share | **PARTIAL** | Members → `GET /api/team/members` (EXISTS). **Share** → PRD §16.11 `POST /api/share` is **MISSING** (grep-confirmed, backend-routes §16.11). Header Share button is net-new backend; for non-team workspaces it can be a no-op/disabled in v1. |
| Artifacts widget/tab | **MISSING (largest gap)** | No `Artifact` entity, table, or `/api/artifacts*` route anywhere (substrate-types §e; backend-routes §16.6). Interim: render the **file registry** `GET /api/workspaces/:id/files` (`workspaces.ts`) + document versions `GET /api/workspaces/:id/documents` (`documents.ts`) as "artifacts". Full Artifact Center is **S05's** scope — S02 should depend on it, not build it. |

**Migration flag:** the only `.mind` SQLite migration *adjacent* to this screen is the optional
`memory_frames.metadata`/`confidence`/`kind` additions (substrate-types §c) needed for richer Memory
**filters** — **not required for S02's Overview/Tasks/Timeline tabs**; defer to S04 (Memory Center).
S02's own missing fields (`type`, `status`, `updatedAt`, `lastActiveAt`) are JSON-file additive — **no
DB migration**.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

- **`WorkspaceType`, `Scope`, `Confidence` literal unions** (PRD §15.2) — **none exist** in
  `apps/web/src/lib/types.ts` (substrate-types §e). Add `WorkspaceType` + `WorkspaceStatus`
  (`active`/`paused`/`archived`) for header.
- **`Workspace` → `WorkspaceConfigV2` alignment** (PRD §15.3) — FE `Workspace` (`types.ts:22-40`)
  lacks `type`, `status`, `description`, `updatedAt`, `lastActiveAt` and uses `persona` vs config's
  `personaId`. Add the 5 missing fields (optional) for header/last-activity; keep DERIVED display
  fields.
- **`WorkspaceState` type** — exists server-side (`workspace-state.ts:38-55`) but is **not mirrored**
  in FE `types.ts`. Add a FE `WorkspaceState` mirror for the new `getWorkspaceState` method.
- **`Task` type** — `lib/types.ts` has no Task interface (server `tasks.ts` shape only). Add one for
  the Tasks tab.
- **`Artifact` type** — **greenfield** (PRD §15.6). Owned by S05; S02 imports it once defined.
- `WorkspaceContext` already exists in `types.ts` (consumed by `WorkspaceBriefing`) — reuse for Overview.

---

## 7. Dependencies (screens / phases first)

- **Phase 1 (Shell + Ctrl+K)** — `_blueprint_extracted.txt:582` — must land first: this screen is
  opened *from* the shell/route map and the left nav. S02 needs the new `route`/`activeWorkspaceId`
  global state + the `case 'workspace'` shell wiring.
- **Phase 2 (Home + Workspace)** — `_blueprint_extracted.txt:585` — S02 ships **with** S01 (Home
  Cockpit); both share `/api/workspaces/:id/context` + `/state`. S01's cross-workspace briefing
  reuses S02's per-workspace builder.
- **S05 Artifact Center** — hard dependency for the Artifacts tab/widget (entity + `/api/artifacts*`
  are entirely net-new there). S02 must ship the Artifacts tab as an **interim file-registry view**
  if S05 is not ready.
- **S04 Memory Center** — the Memory tab embeds `MemoryApp`; richer confidence/kind filters (and the
  `memory_frames` metadata migration) live there, not in S02.
- **S03 Command Center (Ctrl+K)** — the header search + quick actions route through the command provider.

---

## 8. Effort

**XL.** Net-new full-screen tabbed runtime that re-architects the product's primary surface (chat →
one-widget), needs 5-6 new FE components + several adapter methods/hooks, 2 thin backend routes
(`/state`, `/activity`) + workspace `type`/`status`/`updatedAt`/`lastActiveAt` additive fields, and
is gated on S05 (Artifacts) for one full tab. The read-only Overview seed exists
(`WorkspaceBriefing`), which keeps it from being 2×XL, but the shell-integration + tab embedding +
status-bar aggregation breadth dominate.

---

## 9. Open questions

1. **Window vs full-screen.** Should the Workspace Desktop be a maximized `AppWindow` (reuse existing
   window manager + chrome) or a dedicated full-bleed route bypassing the floating-window system? The
   mockup is full-screen; the current OS is windowed. Recommend maximized-window to avoid a parallel
   layout system — needs founder/eng confirmation.
2. **Chat-as-widget vs Chat-tab.** PRD says "chat is one widget" (Overview) AND lists a "Chat" tab.
   Is the Overview chat widget a live mini-composer or a read-only preview that deep-links to the Chat
   tab? Affects whether `ChatApp` must run in two render modes.
3. **`workspace.type` taxonomy.** PRD §15.2 names `WorkspaceType` but no enum values are given. Derive
   from the 15 existing `workspace-templates` categories, or define a new fixed set?
4. **`status` lifecycle.** Who/what sets `paused`/`archived` (manual header action vs automation)?
   PRD §12.2 lists the status states but not the transitions.
5. **Share scope.** `POST /api/share` is net-new (PRD §16.11). Is Share in S02's MVP, or stubbed
   until Team Workspace (S10)? For a solo/non-team workspace, what does Share do?
6. **Tasks store of record.** Tasks tab — back onto the existing `/api/workspaces/:id/tasks` store, or
   model tasks as `pending`/`blocked` `StateItem`s from `WorkspaceState` (which are session/awareness-
   derived, not first-class)? These are two different sources of truth to reconcile.
