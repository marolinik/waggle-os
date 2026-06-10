# Gap Card — S00 · AppShell + Information Architecture + Navigation

> Screen ID: **S00** · UX-refactor planning track · grounded in live `apps/web/src` + `packages/*`.
> Execution model is **LOCKED**: in-place incremental refactor of the existing shell, not a rebuild.
> PRD = `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`.
> Disposition: **rework** (the shell exists and is strong; it is reframed + extended, not recreated).

---

## 1. Screen & purpose

S00 is the **application chrome and navigation spine** that every other screen mounts inside — it is
not a "screen" the user opens, it is the frame they always see. PRD §1 names the spine: Home Cockpit,
Workspace Desktop, Command Center (Ctrl+K), visible Memory, Extend layer, Team. S00 is the layer that
makes that spine reachable.

Per the blueprint Developer Handoff (`_blueprint_extracted.txt:498`), **AppShell** = "Global route
layout, sidebar, active workspace, top status, command palette provider." Its responsibilities:

- Persistent top status bar (workspace, model, memory trophy, trial, search, notifications, clock).
- Primary navigation expressing the six IA layers (PRD §10: Global / Work / Intelligence / Extend /
  Team / System) — blueprint `_blueprint_extracted.txt:68-81` + page-3 `06_board_all_in_one.png`.
- Global, always-available command layer (Ctrl+K) — PRD §12.3, §6.3.
- Active-workspace context held in a global store and threaded to every surface
  (`_blueprint_extracted.txt:512`).
- The container for empty / loading / error / offline / permission-denied states (PRD §14.1).

**Purpose:** collapse the current 27-app "app-launcher" mental model into the IA spine
(PRD §3.2, §3.3, §20.4 "do not add more top-level apps without fitting IA"), without rebuilding
the windowed runtime that already works.

---

## 2. Required states (PRD / Blueprint)

S00 itself is mostly stateless chrome, but it **hosts** the global states and must render them:

- **Global states (PRD §14.1, blueprint AC `:604`):** Loading, Empty, Populated, Error,
  Offline/local-only, Syncing, Permission denied, Partial data, Approval required — every screen
  inside the shell must support these; the shell provides the offline indicator + error boundary +
  approval modal mounts.
- **Navigation states:** active layer/route highlighted; active workspace shown in status; open vs
  minimized window indicators (current dock dots).
- **Command Center states (PRD §12.3):** Idle, Query active, Grouped results, No results, Permission
  prompt, Command success, Command failure.
- **Offline / local-only (PRD §6.7, §14.1; blueprint `:516`):** shell degrades connectors/MCPs
  gracefully while keeping local workspace + memory reachable; offline badge in status bar.
- **First-run vs returning:** onboarding wizard replaces the shell entirely on first launch
  (current behavior, see §3); returning users land in the populated shell.
- **Accessibility (PRD §19.3, blueprint `:489`):** keyboard-first, Ctrl+K + tab nav, visible focus,
  non-color status, text labels on all badges.

Layout direction (blueprint `:483`, directional only): "Desktop-first, **left navigation**, central
workspace canvas, optional right context rail, Ctrl+K overlay." Note this conflicts with the current
**bottom-dock** shell — see Open Questions Q1 (the PRD acceptance criteria, not the mock, win:
PRD §24 risk row "Visual mocks overfit implementation").

---

## 3. Current state in repo (disposition: **rework**)

**There is no `AppShell` / `AppLayout` / `GlobalLayout` component** — grep over `apps/web/src` for
`AppShell|GlobalLayout|AppLayout` returns **zero matches**. The shell's responsibilities are spread
across these real files:

| File | What it does today |
|---|---|
| `apps/web/src/components/os/Desktop.tsx` | **The de-facto AppShell.** Root OS shell: wires all domain hooks, the window manager, `appConfig` (per-`AppId` title/icon/pos/size, `:77-102`), `renderAppContent` (the `switch(win.appId)` app router, `:276-363`), all overlays, theme observer, trial/tier fetch, onboarding early-return (`:262-273`), the `waggle:open-app` CustomEvent bus (`:162-169`). ~550 LOC. |
| `apps/web/src/components/os/StatusBar.tsx` | Top bar (PRD "top status"): logo, workspace name, focused-window label, model, memory-frame trophy, dev tokens/cost, trial badge, **Search button (Ctrl+K)**, notifications bell, offline indicator, clock. |
| `apps/web/src/components/os/Dock.tsx` + `lib/dock-tiers.ts` + `DockTray.tsx` | **The de-facto primary navigation.** Bottom dock, tier-filtered `DockEntry[]`, `zone-parent` flyouts (Ops, Extend) via portal-to-body `DockTray`, open/minimized dots, Spawn Agent, Waggle badge. `dock-tiers.ts` is the canonical `AppId` union + `getDockForTier()`. |
| `apps/web/src/components/os/AppWindow.tsx` | Draggable/resizable/snappable window chrome (one per open app). The "windowed runtime" — orthogonal to IA but the thing the IA must keep. |
| `apps/web/src/hooks/useWindowManager.ts` | Window state machine (`WindowState[]`, persisted to `localStorage waggle-window-state-v1`), `openApp(AppId)` / `openChatForWorkspace(...)`, focus/minimize/cycle. **Navigation == window ops, keyed by `AppId`, NOT by URL.** |
| `apps/web/src/hooks/useOverlayState.ts` | All overlay open/close flags (global search, switchers, notifications, etc.) — the global "command palette state / overlay state" store. |
| `apps/web/src/components/os/overlays/GlobalSearch.tsx` | **The de-facto Command Center (Ctrl+K).** Ctrl+K palette, 5 categories (`command\|workspace\|memory\|session\|skill`, `:15`), but built on a **static `COMMANDS[]` array (`:40-64`)** that is hand-synced to `appConfig` (drift warning in-file `:33-39`) — no Create/Run/Extend categories, no backend command index. |
| `apps/web/src/hooks/useKeyboardShortcuts.ts` | Binds global hotkeys (Ctrl+K search, persona/workspace switchers, new chat, window cycle). |
| `apps/web/src/lib/types.ts` | Holds the **stale** `AppView` union (8 ids, `:3-11`). |
| `apps/web/src/pages/Index.tsx` (route `/`) + `App.tsx` | Single-route app: `BrowserRouter` → `/` → `BootScreen` → `Desktop`. **No per-app routes exist** (frontend inventory `frontend.md:9-13`). |

**Key structural facts driving the rework (not a rebuild):**

1. **Single-route windowed desktop, not a navigable app.** "Navigation" is window management by
   `AppId`. The blueprint's `/home,/workspaces,/memory,…` route groups (`:81`) and "left navigation"
   (`:483`) are **directional**; the in-place model expresses the six IA layers through the existing
   **dock-zone model** (`dock-tiers.ts` `zone-parent`) + window manager — NOT by introducing
   react-router routes (PRD §20.2 "App surfaces -> Work/Intelligence/Extend categories";
   §20.4 "Do not add more top-level apps without fitting IA").
2. **Dual app-id union drift (cleanup target).** `AppId` (27 ids, canonical, `dock-tiers.ts:7-13`)
   vs `AppView` (8 ids, stale, `types.ts:3-11`). `AppView` is unused by the window manager. Dead ids
   `terminal` / `calculator` / `notes` are declared in `AppId` but have **no component / no
   `appConfig` entry** (Desktop `:77-102`) — dead.
3. **Three overlapping tier vocabularies** the IA gating must reconcile (frontend inventory
   `frontend.md:376`): `UserTier` (UI density `simple\|professional\|power\|admin`, `dock-tiers.ts:15`),
   `BillingTier` (`FREE\|TRIAL\|PRO\|TEAMS\|ENTERPRISE`, `:17`), and `PlanTier`
   (`solo\|teams\|business\|enterprise` in `lib/feature-gates.ts`). Dock filters on
   `UserTier` × `BillingTier` (`getDockForTier`, `:127`).
4. **Marketplace is doubly represented** (standalone `MarketplaceApp`, no dock entry, + a section
   inside `CapabilitiesApp`) — an IA-consolidation point (frontend inventory `frontend.md:374`).
5. **IA→existing-app mapping already drafted** in `frontend.md:357-364` (Global/Work/Intelligence/
   Extend/Team/System buckets → current apps). S00 hardens that mapping into dock zones + labels.

**Why rework, not create-new:** Desktop/Dock/StatusBar/AppWindow/window-manager are functional,
test-covered, and PRD §20.1 explicitly says keep+promote the substrate. The deliverable is an IA
**reframe** (zone labels, consolidation, union dedup, command-index wiring), not a new shell.

---

## 4. Frontend work

> Principle (CLAUDE.md §3.3 surgical changes): extend the existing shell. Do not introduce
> react-router app routes. Express IA through dock zones + a shared app catalog.

### 4a. Consolidate to one app catalog (kills the drift)
- **Rework `lib/dock-tiers.ts` into / beside a `lib/app-catalog.ts`** that is the single source for:
  `AppId`, per-app metadata (title, icon, default pos/size — currently siloed in `Desktop.appConfig`
  `:77-102`), IA-layer membership (`Work|Intelligence|Extend|Team|System|Global`), and tier gating.
  Derive **both** `appConfig` (Desktop) and `COMMANDS[]` (GlobalSearch `:40-64`) and `DockEntry[]`
  from it. Fixes FR #13 drift (called out in `GlobalSearch.tsx:33-39`).
- **Delete the stale `AppView` union** (`types.ts:3-11`) and the dead `terminal`/`calculator`/`notes`
  ids from `AppId` (exhaustive grep first per CLAUDE.md §3.5 — they appear in `dock-tiers.ts`,
  possibly tests).

### 4b. IA reframe of the dock (the "primary navigation")
- **Rework `TIER_DOCK_CONFIG`** (`dock-tiers.ts:82-105`) so the power-tier dock zones map 1:1 to the
  PRD IA layers: today there are 2 zone-parents (`Ops`, `Extend`); the target is the six-layer IA
  (`frontend.md:357-364` mapping). Likely outcome: rename/regroup into **Work** (Home, Chat, Memory,
  Files/Artifacts, Sessions), **Intelligence** (Personas/Agents, Skills, Automations, Room/Mission
  Control), **Extend** (Connectors, MCPs, Marketplace, AI Tools), **Team**, **System** (Settings,
  Vault, Profile, Backup, Telemetry). Keep the existing `zone-parent` + `DockTray` mechanism.
- Resolve **Marketplace double-representation** — one canonical surface (Extend), remove the orphan.
- Keep tier filtering (`filterByBillingTier`, `:111`); reconcile the three tier vocabularies into one
  gating helper (or document the mapping) as part of this card so downstream cards inherit it.

### 4c. Extract an explicit `AppShell` boundary (optional, low-risk)
- `Desktop.tsx` is ~550 LOC and conflates shell + router + state wiring (CLAUDE.md §3.2/§4 favor
  smaller files). Optionally extract a thin `AppShell` that owns: status bar + dock + overlay mounts +
  error boundary + offline state, leaving `Desktop` to own only the window manager + `renderAppContent`.
  This is the component the blueprint names (`:498`). **Not required for behavior** — flag as a clean-up
  the plan can sequence late.

### 4d. Command Center upgrade (Ctrl+K) — depends on backend §16.3 (see §5)
- **Rework `GlobalSearch.tsx`** from static-list + client fuzzy-match into a backend-fed command index:
  add the PRD §12.3 category sections **Search / Launch / Create / Run / Navigate / Extend** (today only
  command/workspace/memory/session/skill exist), federated over `/api/command/search` when present.
  Reuse `fuzzyMatch` (`lib/fuzzy-match.ts`) as the offline fallback. Add the Command Center states
  (§2). Keep the `onNavigate(type,id)` → `Desktop.handleSearchNavigate` (`Desktop.tsx:217-225`)
  wiring; extend it for Create/Run/Extend dispatch.

### 4e. Global store for shell state (blueprint `:512`)
- Today shell state is scattered (`useWorkspaces`, `useOverlayState`, ad-hoc `Desktop` `useState` for
  tier/trial/theme). Consolidate the **global** slice the blueprint names — `{ activeWorkspaceId,
  command palette state, user profile, connection/offline status, feature flags }` — behind a single
  provider/hook so Home/Workspace/Command surfaces read one source. Reuse `useOverlayState`,
  `useWorkspaces`, `useOfflineStatus`, `useBilling`/`useFeatureGate` rather than replacing them.

**Reuse targets:** `Desktop.tsx`, `Dock.tsx`/`DockTray.tsx`/`dock-tiers.ts`, `StatusBar.tsx`,
`AppWindow.tsx`, `useWindowManager`, `useOverlayState`, `GlobalSearch.tsx`, `useKeyboardShortcuts`,
`ErrorBoundary.tsx`, `useOfflineStatus`, `useBilling`/`useFeatureGate`.

**Props/state:** `AppShell` (if extracted) takes no props (reads global store); the app catalog is a
pure module; `Dock` keeps its current props (`tier`, `billingTier`, `onOpenApp`, `openApps`,
`minimizedApps`, `onSpawnAgent`, `waggleBadgeCount`); `GlobalSearch` keeps `{open,onClose,onNavigate}`
plus internal async result groups.

**Adapter methods/hooks:** S00 chrome needs none beyond what exists. The Command Center upgrade
(4d) needs new adapter methods `commandSearch(q)` / `commandExecute(...)` / `commandRecent()` /
`commandSuggestions()` added to `lib/adapter.ts` (the one contract surface, `frontend.md:380`) once
the backend routes (§5) land.

---

## 5. Backend work

**S00 as pure shell/IA/navigation needs NO new backend** — it is frontend chrome + client-side
window routing. The dependency is the **Command Center (4d)**, which the IA spine requires
(PRD §6.3 "Ctrl+K always available"; blueprint `:515` "command index should unify workspaces, memory,
artifacts, sessions, agents, skills, connectors, MCPs, actions and recent commands").

PRD §16.3 Command Center endpoints (cross-ref `backend-routes.md:444-451`):

| PRD §16 endpoint | Status | EXTEND vs NET-NEW · substrate · note |
|---|---|---|
| `GET /api/command/search?q=` | **MISSING** | **NET-NEW** federating route. No `/api/command/*` exists; `commands.ts` is `/api/commands/execute` (slash-exec, different shape). Touches no new store — fans out over `/api/memory/search` (`memory.ts`), `WorkspaceManager.list()` (`workspaces.ts`), `/api/skills`, `/api/workspaces/:id/sessions/search` (`sessions.ts`). New `command.ts` route under `packages/server/src/local/routes/`. |
| `POST /api/command/execute` | **PARTIAL** | **EXTEND** `POST /api/commands/execute` (note **plural** `commands`, `commands.ts`). Current runs slash commands with a subset CommandContext; PRD's generic palette execute is broader (navigate/create/run/extend dispatch). Extend or add a thin singular alias. |
| `GET /api/command/recent` | **MISSING** | **NET-NEW** (or derive client-side from session/window history — defer to client first). |
| `GET /api/command/suggestions` | **MISSING** | **NET-NEW**. Closest analog `GET /api/skills/suggestions` (`skills.ts`, different domain) is a pattern to copy, not reuse. |

**No `.mind` migration for S00.** None of the Command Center routes add a data store
(`backend-routes.md:604-607`: every MISSING endpoint is buildable over existing substrates). The
status bar's memory trophy already uses `GET /api/memory/stats` (`StatusBar.tsx:40`), and trial/tier
uses `GET /api/tier` (`Desktop.tsx:136`) — both EXIST.

> Note: a command-index that searches "artifacts" (PRD §12.3) is blocked on the Artifacts domain
> (PRD §16.6, entirely MISSING — `backend-routes.md:477-484`). S00's Command Center can ship the
> existing object types first and add Artifacts/Agents/Automations groups as those screens land.

---

## 6. Shared types needed (PRD §15 vs `lib/types.ts`)

S00 is mostly literal-union + nav typing. PRD §15.2 target unions — **none currently exist** in
`apps/web/src/lib/types.ts` (substrate-types `substrate-types.md:218-229`):

- **Reframe the IA into types:** introduce a `IALayer = 'global'|'work'|'intelligence'|'extend'|
  'team'|'system'` union and attach it to the app-catalog entry type (new, in `lib/app-catalog.ts`
  or `dock-tiers.ts`). Not a PRD §15 type but the type that makes the IA explicit.
- **Delete `AppView`** (`types.ts:3-11`) — superseded by `AppId` (§4a). Consolidate exports so
  `AppId`/`UserTier`/`BillingTier`/`DockEntry` (currently in `dock-tiers.ts`) and the catalog type
  live in one place.
- **Command Center types (for 4d):** extend `SearchCategory` (`GlobalSearch.tsx:15`) beyond
  the 5 current values to PRD §12.3's Search/Launch/Create/Run/Navigate/Extend; add a `Command`
  result type (PRD §11 glossary "Command" object). Add a `CommandResult` interface used by both the
  adapter method return and the palette.
- **Tier reconciliation type:** a single helper type mapping `UserTier`↔`BillingTier`↔`PlanTier`
  (currently three vocabularies across `dock-tiers.ts` + `feature-gates.ts`). Document or unify so
  every downstream gap card inherits one gating contract.

PRD §15.2 entity unions (`WorkspaceType`, `Scope`, `Confidence`, `MemoryKind`, `ArtifactKind`,
`AgentType`, `AutonomyLevel`, `ExtensionType`) are **owned by their respective screens**, not S00 —
S00 only needs the nav/command/tier types above. Establishing the shared-types module location is an
S00 responsibility (blueprint Phase 0 "Define shared frontend types", PRD §8 Phase 0).

---

## 7. Dependencies (screens/phases first)

- **Blocks everything.** S00 is PRD Phase 0 / blueprint Phase 0 ("Freeze UX spine: route names,
  screen inventory, navigation, naming, data scopes", `_blueprint_extracted.txt:581`) and PRD §21
  Sprint 1 ("AppShell navigation, route map, shared types, command provider skeleton"). Every other
  gap card (Home Cockpit S0x, Workspace Desktop, Memory Center, Extend, Team) mounts inside this shell
  and consumes the app catalog + IA layering + global store defined here.
- **Internal ordering:** 4a (app catalog / union dedup) → 4b (dock IA reframe) → 4e (global store)
  can all ship **frontend-only, no backend**. 4d (Command Center upgrade) is gated on backend §5
  `/api/command/*` (PRD §21 Sprint 3) — ship the Ctrl+K **skeleton + static/offline fallback** in
  Phase 0/Sprint 1 (matches "command provider skeleton", PRD §21 Sprint 1), then wire the backend
  index in Sprint 3.
- **Depends on no other screen.** Consumes only existing substrate (`GET /api/tier`,
  `GET /api/memory/stats`, `GET /api/workspaces`) which all EXIST.

---

## 8. Effort: **L**

Frontend-heavy reframe touching the highest-traffic, highest-blast-radius files in the app
(`Desktop.tsx` ~550 LOC, `Dock.tsx`, `dock-tiers.ts`, `GlobalSearch.tsx`, window manager) plus a
union/tier-vocabulary consolidation that requires exhaustive grep (CLAUDE.md §3.5) and the net-new
`/api/command/*` federating route. Not XL because it reuses the working windowed runtime wholesale
(no rebuild) and adds no data store / migration. The Command Center backend index pushes it from M→L.

---

## 9. Open questions

1. **Bottom dock vs left navigation.** Blueprint `:483` + mock `06_board_all_in_one.png` show
   **left navigation**; the live shell is a **bottom dock** (`Dock.tsx`). Mocks are directional
   (PRD §24); does the founder want the dock reframed-in-place (cheaper, keeps the OS feel) or
   migrated to a left rail (closer to mock, larger blast radius)? Recommend in-place dock reframe
   unless the left rail is a hard requirement.
2. **Routes vs window-IDs.** Blueprint `:81` asks for `/home,/workspaces,…` route groups; the app
   is single-route windowed. Confirm we keep `AppId`-keyed window navigation (recommended, in-place)
   rather than introducing react-router app routes (larger change, conflicts with multi-window).
   Deep-linking/back-button behavior is the only thing real routes would buy.
3. **Tier-vocabulary unification.** Three tiers (`UserTier`/`BillingTier`/`PlanTier`) gate the dock,
   billing, and features independently. Should S00 unify them into one model now (clean but
   cross-cutting), or just document the mapping and defer? PRD §17 RBAC roles add a 4th axis.
4. **Command Center scope for v1 (PRD §23 Q-implied).** Which object types ship in the Ctrl+K index
   first? Artifacts/Agents/Automations are blocked on their domains (§5 note). Propose:
   workspaces + memory + sessions + skills + commands at launch, add the rest as screens land.
5. **AppShell extraction now or later?** Pull the shell out of `Desktop.tsx` (4c) up front for a
   clean boundary, or defer to a polish pass to minimize churn during the high-velocity refactor?
