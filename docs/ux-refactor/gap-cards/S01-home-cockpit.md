# Gap Card — S01 Home Cockpit

> Execution model: **in-place incremental refactor** of `apps/web` + targeted backend extensions.
> PRD source of truth: §12.1 (lines 373-410), §15 (data model), §16.1 (API), §20.1 (keep/promote).
> Mockup `screen_01_home_cockpit.png` is **directional** — acceptance criteria win over pixels.

---

## 1. Screen & purpose

Home Cockpit is the **daily executive briefing and launch surface** — the first thing the user
sees after boot, before opening any workspace. PRD §12.1: "Give the user a useful daily briefing
and immediate next actions." Acceptance bar (§12.1): user understands the day in <30 s, continues a
workspace in one click, opens Win+K from the keyboard, and captures a note/task/link/file from Home.

This is a **new top-level surface** in the IA spine (PRD §1: spine item #1). Today there is no Home
Cockpit; the closest things are the per-workspace `WorkspaceBriefing` (chat home screen) and the
modal `LoginBriefing` (one-shot catch-up overlay). The mockup shows six regions: greeting + date,
"You were working on" (recent workspaces with Continue), "Overnight" (consolidated / artifacts /
failures counters), "Up next" (events/tasks), "Suggested next actions", "Quick capture", and an
"Active models" tile.

---

## 2. Required states (PRD §12.1 + Blueprint p.265/447)

Functional requirements (§12.1):
- Greeting with user name + date/time.
- Active/recent workspaces ranked by recency and priority, each with one-click Continue.
- Overnight summary: memories consolidated, artifacts created, automations completed, failures.
- Upcoming meetings/events/tasks ("Up next").
- Suggested next actions (memory/session/task/schedule-derived).
- Quick capture for note/task/link/file.
- Active models + current mode, only if relevant (do not clutter).
- Win+K hint/access.

States to implement (§12.1 "States" + Blueprint line 447):
`Loading` · `First-run empty` · `Normal populated` · `Attention required` · `Offline/local-only` ·
`Overnight failure` · `Permission denied for shared/team data`.

---

## 3. Current state in repo — disposition: **partial (keep-promote + create-new)**

PRD §20.1 explicitly: `WorkspaceBriefing.tsx` → "seed for Home Cockpit widgets" (keep and promote).
There is **no `HomeCockpit` component today** — it is a §20.3 "Create" item. So the work is: extract
reusable widget logic from the two existing briefing surfaces, build a new full-screen `HomeCockpit`,
and wire it to a new cross-workspace aggregation endpoint.

Existing files that feed this screen:

| File | What it does | Reuse role |
|---|---|---|
| `apps/web/src/components/os/WorkspaceBriefing.tsx` (283 LOC) | Per-workspace "home screen" inside ChatApp when a chat has no messages. Fetches `GET /api/workspaces/:id/context`; renders greeting, stats bar, pending tasks, recent decisions, "I Remember" memories, recent threads, cross-workspace hints, persona skill chips, suggested prompts, upcoming schedules. Collapse state persisted per-workspace via `lib/workspace-briefing-state`. | **Keep-promote.** Its section components (memory list, pending tasks, decisions, suggested-prompt chips, upcoming schedules) are the widget vocabulary the Cockpit reuses. It is **per-workspace**, so it can't be the Cockpit as-is. |
| `apps/web/src/components/os/overlays/LoginBriefing.tsx` (363 LOC) | Modal "I remember…" catch-up shown once after boot. Already does **cross-workspace aggregation** client-side: `getWorkspaces()` → per-workspace `getWorkspaceContext()` (N calls) + `searchMemory('…','global')` + `getMemoryStats()`. Builds workspace summaries (memoryCount/sessionCount/lastActive/summary/pendingTasks), ranked memory highlights (`lib/briefing-highlights`), brag header (`lib/login-briefing-brag`), time-aware greeting + identity name. Has first-run empty hook (3 demo bubbles). Filters E2E/test workspaces. | **Keep-promote (heaviest reuse).** Its data-gathering and ranking is exactly the Cockpit's "You were working on" + greeting + first-run-empty logic — but it does the N+1 fan-out **on the client**, which §20.4 forbids ("do not duplicate backend state calculation in frontend"). Promote this logic **into the new `GET /api/home/briefing`** server route. |
| `apps/web/src/components/os/apps/DashboardApp.tsx` | Dock app `home` — Workspaces grid (select/create/open chat), brain-health tier. Currently the thing the `home` dock key opens. | **Rework/keep.** Becomes the workspaces-grid sub-view; Home Cockpit becomes the new default `home` surface. Not the briefing itself. |
| `apps/web/src/components/os/apps/CockpitApp.tsx` (315 LOC) | "Cockpit" = system/ops dashboard (health, cost, crons, connectors, weaver, event stats, compliance). Dock id `cockpit`. **Name collision only** — this is the ops Command-Center surface, NOT the PRD Home Cockpit. | **Out of scope / do not conflate.** Maps to PRD §12.3-ish ops, not §12.1. Flag the naming clash. |
| `apps/web/src/components/os/cockpit/ComplianceDashboard.tsx` | EU AI Act compliance tiles, hosted inside `CockpitApp`. | Not relevant to S01. |

Supporting lib (frontend, reuse as-is):
`lib/briefing-highlights.ts` (`selectBriefingHighlights` — importance-then-recency ranking),
`lib/login-briefing-brag.ts` (`computeBragSummary`/`formatBragLine`/`timeAgo`),
`lib/workspace-briefing-state.ts` (collapse persistence), `lib/persona-display.ts`,
`lib/skill-recommendations.ts` (persona skill chips). **Note:** `lib/suggested-actions.ts` is for
**chat follow-up chips** (regex over the last assistant message) — it is NOT the Home "suggested next
actions" generator; do not reuse it for the Cockpit. Suggested actions for Home come from
`buildWorkspaceState().nextActions` (backend) aggregated cross-workspace.

Backend builder already present (keep-promote, §20.1): `packages/server/src/local/workspace-state.ts`
`buildWorkspaceState()` → typed `WorkspaceState` (active/openQuestions/pending/blocked/completed/stale/
recentDecisions/`nextActions`) with freshness classification. This is the per-workspace next-action
engine the Home briefing aggregates over.

---

## 4. Frontend work

**Create** `apps/web/src/components/os/apps/HomeCockpitApp.tsx` (new top-level surface; register in
`Desktop.tsx` `appConfig` + `renderAppContent`, and make the `home` dock key open it instead of
`DashboardApp` — `DashboardApp` demotes to a "Workspaces" grid reachable from a Cockpit tile/Win+K).

Widget components (extract from the two briefing files so logic is shared, not copy-pasted — CLAUDE.md
"many small files"):
- `home/GreetingHeader.tsx` — greeting + name + date/time (promote from `LoginBriefing` lines 84-95 +
  `WorkspaceBriefing` greeting). Reuse `buildTimeAwareGreeting` semantics from backend; client just renders.
- `home/RecentWorkspacesPanel.tsx` — "You were working on": ranked workspace cards w/ Continue button →
  `openChatForWorkspace(id)` (via `useWindowManager`). Promote `LoginBriefing` summaries list (lines 277-334).
- `home/OvernightPanel.tsx` — counters (consolidated / artifacts / automations done / failures); failure
  rows expandable → Automation Center. **New** (no current equivalent).
- `home/UpNextPanel.tsx` — upcoming events/tasks/schedules. Reuse `upcomingSchedules` + `pendingTasks`
  shapes; aggregate across workspaces.
- `home/SuggestedActionsPanel.tsx` — top N `nextActions` aggregated from `buildWorkspaceState`, each
  routing to its workspace. **Not** `lib/suggested-actions.ts`.
- `home/QuickCapturePanel.tsx` — note/task/link/file input → `POST /api/quick-capture`. **New.**
- `home/ActiveModelsTile.tsx` — promote `ModelPilotCard` / `useProviders`; render only when relevant.

Data layer:
- New hook `hooks/useHomeBriefing.ts` → `adapter.getHomeBriefing()` + `adapter.getOvernight()`, with
  the §12.1 state machine (loading/empty/populated/attention/offline/overnight-failure/permission-denied).
- Extend `lib/adapter.ts` (the single sidecar gateway) with `getHomeBriefing()`, `getOvernight()`,
  `quickCapture(payload)`. Per the frontend inventory, all PRD §16 endpoints get added here.
- First-run empty: reuse `LoginBriefing`'s demo-bubble hook (lines 222-247).
- Offline/local-only: reuse `useOfflineStatus`; degrade overnight/team tiles, keep local workspaces.
- Win+K hint: surface the existing `GlobalSearch` (Ctrl/Win+K) — already wired in `useKeyboardShortcuts`.

**Decision required (Open Q):** does `LoginBriefing` (modal) survive alongside Home Cockpit, or does the
Cockpit absorb it? They overlap ~80%. Recommend: collapse `LoginBriefing` into the Cockpit's first paint
and retire the modal (avoid two catch-up surfaces).

---

## 5. Backend work (PRD §16.1)

| PRD endpoint | Status | Plan |
|---|---|---|
| `GET /api/home/briefing` | **MISSING** | **NET-NEW** route (new `routes/home.ts` registered in `local/index.ts`). Server-side aggregation that promotes `LoginBriefing`'s client N+1 fan-out: iterate `workspaceManager` workspaces → reuse per-workspace logic already in `routes/workspaces.ts` `/context` handler (greeting/summary/recentMemories/pendingTasks/upcomingSchedules) + `buildWorkspaceState()` (`workspace-state.ts`) for `nextActions`, ranked by recency/priority. Reuse `briefing-highlights` ranking server-side. **Substrate touched:** `memory_frames` (per-workspace `.mind`), session JSONL, `awareness`, `cron-store`. No new store. **Refactor over EXTEND:** factor the `/context` body into a shared builder so `/context` and `/home/briefing` don't duplicate SQL. |
| `POST /api/quick-capture` | **PARTIAL** | **EXTEND** `routes/memory.ts` (or thin new handler delegating to it). Closest existing write is `POST /api/memory/frames`. Quick-capture = thin wrapper: default to **personal** mind, stamp `source: 'quick-capture'`, accept `kind ∈ note|task|link|file`. For `task` also write an `awareness` row so it surfaces in `nextActions`; for `file` route through `POST /api/ingest`. **Substrate:** `memory_frames` (personal `.mind`), `awareness`. No migration. |
| `GET /api/home/overnight` | **MISSING** | **NET-NEW** route (same `routes/home.ts`). Aggregate from existing substrates — **no new store**: `cron`/automation runs via `GET /api/cron/:id/history` (`notifications.ts`) + cron-store; consolidation/artifact counts from `events.ts` audit events (`GET /api/events?since=`) and `weaver` status (`/api/weaver/status`); failures from cron history error rows + notifications. Returns `{ consolidated, artifactsCreated, automationsCompleted, failures[] }`. The `Overnight failure` state is driven by `failures.length > 0`. |

Notes for the implementer:
- **Reuse, don't reinvent (§20.4):** the per-workspace catch-up math lives in `routes/workspaces.ts`
  lines 311-592 and `workspace-state.ts`. Extract the shared body before adding the cross-workspace loop.
- **Privacy gate (CRITICAL — already bit us):** cross-workspace content aggregation was previously a
  privacy leak. `routes/workspaces.ts` lines 553-564 show `crossWorkspaceHints` is **deliberately
  DISABLED** (returns `[]`) because the original iterated every workspace MindDB and returned content
  snippets with no grant check (security review: `cowork/Code-Review_MultiMind_April-2026.md` Critical #1).
  `GET /api/home/briefing` is the SAME pattern (read every workspace) — but for Home it is the user's
  **own** workspaces, so it is legitimate for personal scope. **Team/shared workspace rows must respect
  `approvalGrantStore` / team RBAC** (PRD §12.1 `Permission denied for shared/team data` state). Do not
  leak team-workspace content the caller can't access.
- Tier: Home briefing must work on FREE/TRIAL (it's the daily landing surface). Team-overnight rows are
  TEAMS-gated; gate the team slice, not the whole endpoint.

**No `.mind` schema migration required.** All three endpoints read existing tables (`memory_frames`,
`awareness`, audit `events`) and write only via existing frame/awareness paths. (PRD §15.4 confidence/
provenance fields are a *separate, later* migration — not needed for S01.)

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

Today `lib/types.ts` has `WorkspaceContext` (lines 66-85) — per-workspace, already carries
greeting/recentMemories/pendingTasks/upcomingSchedules/crossWorkspaceHints. **Reuse its sub-shapes.**

Add new interfaces (in `lib/types.ts`, mirrored server-side):
- `HomeBriefing { greeting; date; recentWorkspaces: RecentWorkspaceCard[]; suggestedActions: SuggestedAction[]; upNext: UpNextItem[]; activeModels?; isFirstRun: boolean }`
- `RecentWorkspaceCard { id; name; group; summary?; lastActive; pendingCount; continueSessionId? }`
- `OvernightSummary { consolidated: number; artifactsCreated: number; automationsCompleted: number; failures: OvernightFailure[] }`
- `OvernightFailure { id; label; automationId?; error; at }`
- `QuickCaptureInput { kind: 'note'|'task'|'link'|'file'; content; workspaceId? }`
- `SuggestedAction { label; workspaceId; sessionId?; kind }`

Align kinds with PRD §15.2 (`MemoryKind`, `ArtifactKind`) where they overlap. These are net-new vs the
current `lib/types.ts` (which has no Home/Overnight/QuickCapture types).

---

## 7. Dependencies (screens/phases first)

- **AppShell / IA (Sprint 1, PRD §21):** Home Cockpit is the default landing surface — needs the dock
  `home` key repointed and the §10 IA buckets settled first.
- **Win+K Command Center (S03):** §12.1 acceptance "open Win+K from the keyboard" — `GlobalSearch`
  already exists, so this is a soft dep (hint only).
- **Workspace Desktop (S02):** "Continue" routes into the per-workspace runtime; needs `openChatForWorkspace`
  (already in `useWindowManager`) — soft dep.
- **Automation Center (S11):** overnight failure rows link there; can ship Home with the count + a stub link.
- Belongs to **Sprint 2 ("Home and workspace state")** per PRD §21 — after shell, alongside the
  workspace-context/state API extension.

---

## 8. Effort: **L**

Frontend is mostly **promotion** of two existing briefing surfaces into shared widgets (medium), but the
backend adds **two net-new aggregation routes** (`/home/briefing`, `/home/overnight`) that must (a)
refactor the per-workspace `/context` body into a shared builder to avoid duplication and (b) re-implement
the cross-workspace aggregation **safely** behind the grant/RBAC gate that previously caused a privacy
leak. The security-sensitive cross-workspace read is what pushes this from M to L. Not XL — no new data
store, no schema migration, and the ranking/greeting logic already exists.

---

## 9. Open questions

1. **LoginBriefing fate:** retire the modal and absorb its catch-up into Home Cockpit's first paint, or
   keep both? (~80% overlap; two catch-up surfaces is confusing.)
2. **"Overnight" semantics:** time-window = since last app close? since midnight local? last 12 h? Affects
   the `since=` query for events/cron history.
3. **Cross-workspace personal read:** confirm reading the user's *own* workspaces server-side (for the
   briefing) is acceptable now that it's same-user (the prior leak was content snippets without grant
   checks). Team/shared rows still gate through `approvalGrantStore`/RBAC — confirm the gate boundary.
4. **`home` vs `cockpit` naming:** `CockpitApp` already owns "Cockpit" (ops). PRD calls S01 "Home Cockpit".
   Final dock/app naming to avoid the collision (proposal: S01 = `home`/"Home"; keep ops as `cockpit`).
5. **DashboardApp role:** does the Workspaces grid live as a Cockpit tab, a Win+K destination, or stay a
   separate dock app? (Affects whether `home` dock key fully repoints to HomeCockpit.)
6. **Quick-capture `file` flow:** does a file capture upload into a default/personal store, or prompt for a
   target workspace? `POST /api/ingest` needs a destination.
