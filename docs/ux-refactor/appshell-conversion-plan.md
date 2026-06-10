# AppShell Conversion Plan — Phase 0 Spine Freeze (D1-b)

**Status:** CANONICAL CONTRACT — Phases 1+ implement this document.
**Authority:** Ratification register D1–D15 (2026-06-10), `docs/ux-refactor/deltas/open-questions.md` §"UX Refactor v2.1 — Ratification" > Brief v2.1 > `docs/UX_REFACTOR_STATE_AUDIT.md`.
**Decision implemented:** D1 option (b) — convert the windowed dock shell to **AppShell + left nav + single canvas + URL routes**, reusing every shipped screen component unchanged. B1 (2026-06-09, "keep windowed AppId nav, NO react-router") is superseded.
**Code baseline:** `main @ 9dfcc75`. File:line citations are against that commit; an in-flight D8/D9 naming sweep on this branch shifts a few cited lines by ±1 (comment/label-only diff: `Desktop.tsx`, `HomeCockpit.tsx`, `CommandCenter.tsx`, `adapter.ts`, `dock-tiers.ts` — e.g. dock `cockpit` label is already "Mission Control" at `dock-tiers.ts:97`).

D1 conditions this plan operationalizes:
1. Zero screen-component rewrites during conversion (one **derived** exception — §5.2, flagged §9.8: required by condition 4, not separately ratified; goes to the founder for explicit sign-off with this plan, before P1a).
2. URLs are the navigation contract; `waggle:open-app` becomes a shim (§2).
3. No window z-order code ships; `waggle-window-state-v1` migrates then clears (§3).
4. Chat = one widget inside Workspace Desktop, one per workspace (§4).
5. B4 ("alias, don't rename" `/api/*`) survives — this conversion touches **zero** server files (§8).

---

## 1. Canonical route map

Routing stack: `react-router-dom@^6.30.1`, already installed (`apps/web/src/App.tsx:2,20-28` — today exactly 2 routes: `/` and `*`). The conversion replaces the `/`→`Index`→`Desktop` chain with a layout route: `/` → `AppShell` (BootScreen gate + nav + StatusBar + overlays + `<Outlet/>`), index redirect → `/home`.

### 1.1 Frozen route groups (brief) → all 28 AppIds + dispositions

The full `AppId` union (28 ids) is `apps/web/src/lib/dock-tiers.ts:7-18`; the window registry `appConfig` and `renderAppContent` switch are `Desktop.tsx:82-115` and `:339-469`. Every id is dispositioned below — nothing is left implicit.

| Route | AppId(s) | Component (unchanged) | Nav zone | Notes |
|---|---|---|---|---|
| `/home` | `home` | `HomeCockpit` | Work | Launch surface. Replaces the launch-flip (`Desktop.tsx:192-206`): index route redirects `/` → `/home` unconditionally. `dashboard` (legacy `DashboardApp`, kept only "for back-compat with persisted window state", `Desktop.tsx:360-362`) is **KILLED** — the back-compat reason dies with `waggle-window-state-v1` (§3.3). |
| `/workspaces/:workspaceId/:tab?` | `workspace-desktop`, `chat` | `WorkspaceDesktopApp` (+ embedded `ChatWindowInstance`) | Work ("Chat" entry) | `:tab?` ∈ the 8 PRD §12.2 tabs already defined in `WorkspaceDesktopApp.tsx:53-72` (`overview` default, `chat`, `research`, `artifacts`, `memory`, `tasks`, `timeline`, `settings`). Chat widget = `/workspaces/:id/chat` (§4). `?session=<id>` reserved for session deep links (server already emits `action.route: /workspace/:id/session/:sid` at `routes/command.ts:152` — advisory only, FE parses result ids; B4 untouched). Bare `/workspaces` → redirect `/home` (Home IS the workspace selector per A2/Journey 1 — flagged §9). |
| `/memory/:mindScope?` | `memory` | `MemoryApp` (P1) → standalone `MemoryCenterApp` (P3, D2) | Work | P1 mounts the existing 7-tab `MemoryApp` at `/memory` (props re-hosted, §5.1). `:mindScope?` ∈ `personal\|workspace` is **reserved now, implemented in P3** with the D2 two-mind split. `?tab=graph\|timeline\|harvest\|weaver\|wiki\|evolution` addresses the legacy tabs (D2: capability stays reachable); `MemoryApp` has no `initialTab` prop today, so `?tab=` wiring is **P3 phase work, not conversion work** (exclusion §5.3). |
| `/artifacts` | `artifacts` | `ArtifactCenterApp` | Work | `?workspace=<id>` optional; wrapper passes `?workspace ?? activeWorkspaceId` (prop today: `Desktop.tsx:435`). |
| `/files` | `files` | `FilesAppTabs` | Work | **Flagged addition** (§9) — Work-zone primary-spine entry (`dock-tiers.ts:55`) the brief's group list omits. `?workspace=<id>` replaces the `filesViewWorkspaceId` local state plumbing (`Desktop.tsx:211,436-451`). |
| `/agents` | `agents` | `AgentsApp` | Intelligence | Internal detail/builder (AgentCenterDetail, AgentBuilder S18) stay component-internal; no `/agents/new` at conversion. |
| `/automations` | `scheduled-jobs` | `AutomationCenterApp` | Intelligence | `?tab=logs&automationId=<id>` replaces the Journey-16 CustomEvent payload (`Desktop.tsx:172-190`, consumer `AutomationCenterApp.tsx:104-114`). |
| `/skills` | `capabilities` | `CapabilitiesApp` | Intelligence | SkillBuilder (S19) stays internal (`CapabilitiesApp.tsx:393`). |
| `/connectors` | `connectors` | `ConnectorsApp` | Extend | Wrapper passes `personaId={activeWorkspace?.persona}` (today `Desktop.tsx:410`). |
| `/mcps` | `mcp-hub` | `MCPHubApp` | Extend | Same `personaId` prop (`Desktop.tsx:411`). |
| `/marketplace` | `marketplace` | `MarketplaceApp` | Extend | **Flagged addition** (§9) — the brief omits an Extend-zone group for it; it is a shipped S21 surface with a dock entry (`dock-tiers.ts:78`). |
| `/launcher` | `launcher` | `LauncherApp` | Extend (label "AI Tools") | **Flagged addition** (§9) — dock parity (`dock-tiers.ts:79`); also hosts S14 Tool Discovery per D6. Wrapper passes `activeWorkspaceId`. |
| `/room` | `room` | `RoomApp` | Intelligence | **Flagged addition** (§9) — dock entry `dock-tiers.ts:65` + Ctrl+Shift+R (`useKeyboardShortcuts.ts:70-74`). Wrapper builds `workspaceNames` map (today `Desktop.tsx:456-461`). |
| `/waggle-dance` | `waggle-dance` | `WaggleDanceApp` | Intelligence | **Flagged addition** (§9) — dock entry `dock-tiers.ts:66`. |
| `/approvals` | `approvals` | `ApprovalsApp` | Intelligence (nav hidden < TEAMS) | D5: tier-hidden, not stripped. Route registered; nav entry carries `minBillingTier:'TEAMS'` exactly as `dock-tiers.ts:68`. PRO visibility = post-launch consideration (D5), untouched here. |
| `/team` | `governance` | `TeamGovernanceApp` | Team (zone hidden < TEAMS) | **Reserved — does not ship in nav below TEAMS.** Identical semantics to today's `filterByBillingTier` (`dock-tiers.ts:84-88,135-149`): route renders the legacy app for TEAMS+; FREE/PRO never see the zone. No new Team work (D5). |
| `/settings` | `settings` | `SettingsApp` | System | `?tab=general\|models\|billing\|permissions\|team\|backup\|enterprise\|advanced` (internal tabs, `SettingsApp.tsx:34-42`) — URL→tab wiring is best-effort at conversion, same exclusion class as `/memory?tab=` (§5.3). |
| `/settings/vault` | `vault` | `VaultApp` | System | System-zone surfaces nest under `/settings/*` — flagged call §9. Renders full-canvas with System nav section active; NOT embedded inside SettingsApp's UI (zero-rewrite). |
| `/settings/profile` | `profile` | `UserProfileApp` | System (no nav entry — parity with today) | `?tab=identity` replaces the HarvestTab deep link (`memory/HarvestTab.tsx:298-299` dispatches `{appId:'profile', tab:'identity'}`); consumer keeps its `waggle:open-app` listener untouched via the shim's post-navigation re-dispatch (§2.3 — the listener is live-only; `UserProfileApp` never calls `consumeDeepLink`). |
| `/settings/mission-control` | `cockpit` | `CockpitApp` | System | D8: label "Mission Control" (already applied, `dock-tiers.ts:97`). "Command Center" is reserved for the Ctrl+K palette. |
| `/settings/timeline` | `timeline` | `TimelineApp` | System | Wrapper passes `workspaceId={activeWorkspaceId}` (today `Desktop.tsx:463`). |
| `/settings/events` | `events` | `EventsApp` | System | Props re-hosted from `useEvents` (§5.1). |
| `/settings/usage` | `telemetry` | `TelemetryApp` | System | Dock label "Usage & Cost" (`dock-tiers.ts:99`). |
| — KILLED | `dashboard` | `DashboardApp` | — | See `/home` row. No route. File removal deferred to dead-code phase work (CLAUDE.md §3.3 — not conversion work). |
| — KILLED | `voice` | `VoiceApp` | — | No dock entry, no live opener anywhere in `apps/web/src` (grep: zero `openApp('voice')` / `appId:'voice'` dispatch hits). No route. |
| — KILLED | `mission-control` | `MissionControlApp` | — | Not in any dock config; only reachable via dead `GlobalSearch.tsx:47` (retained-for-rollback, no live imports per audit §2d). D8 moves the "Mission Control" name to `CockpitApp`. No route. Its spawn affordance survives via the global `SpawnAgentDialog` overlay. |
| — KILLED | `backup` | `BackupApp` | — | Duplicated by SettingsApp's internal `backup` tab (`SettingsApp.tsx:34,42,733-766`; dock comment `dock-tiers.ts:100` "Backup stays in Settings"). Only opener was dead GlobalSearch. `/settings?tab=backup` is the address. |

Count check: 22 routed ids + `chat` (widget, §4) + `workspace-desktop` (= `/workspaces/:id`) + 4 killed = 28. ✓

### 1.2 Overlays — disposition: overlay-stays-overlay, mounted ONCE in AppShell

All overlays currently mounted in `Desktop.tsx:569-663` move verbatim into AppShell (global across every route). None becomes a route.

| Overlay | Trigger | Conversion delta |
|---|---|---|
| `CommandCenter` (Ctrl+K palette) | `useKeyboardShortcuts.ts:92-97` + StatusBar | None to component; `onNavigate` handler retargets to `navigate()` (§2.2). |
| `PersonaSwitcher` | Ctrl+Shift+P | Retargets the **active workspace chat widget** persona instead of "focused chat window" (`Desktop.tsx:583-604` focused-window resolution dies with focus tracking — §4.3). |
| `WorkspaceSwitcher` | Ctrl+Tab | `onSelect` → `navigate('/workspaces/'+id)` instead of `openChatForWorkspace`. |
| `CreateWorkspaceDialog`, `SpawnAgentDialog`, `NotificationInbox`, `KeyboardShortcutsHelp`, `OnboardingTooltips`, `LoginBriefing`, `UpgradeModal` (D7), `TrialExpiredModal` | unchanged | Mount relocation only. `LoginBriefing.onOpenWorkspace` → `navigate()`. UpgradeModal/TrialExpiredModal checkout-failure fallbacks (`wm.openApp('settings')`, `Desktop.tsx:651,661`) → `navigate('/settings')` — instance of §2.1 rule 3, noted so the conversion diff is fully accounted. |
| `OnboardingWizard` | `!onboardingState.completed` early-return (`Desktop.tsx:325-336`) | Stays a full-screen takeover at the AppShell layout level (renders INSTEAD of nav+canvas, any URL). Not a route at conversion. `onFinish` retargets per §2.2: seed chat widget (`{personaId, initialMessage}`, §4.2) + `navigate()` to the new workspace's chat tab. |
| `ContextRail` | per-surface `onContextRail` callbacks | This is the brief's **optional right rail** — stays an overlay panel owned by AppShell; surfaces keep their existing `onContextRail` props. |
| `GlobalSearch.tsx` | none (dead, "retained for rollback") | Deleted with the window manager (§3.2) — rollback is git, not dead files. |

### 1.3 Left-nav zone → route entry points

The nav consumes the **same data** the dock consumes today: `POWER_CONFIG` 5 IA zones + `filterByBillingTier` + `getDockForTier` (`dock-tiers.ts:50-153` — survives unchanged as the nav model; `Dock.tsx`/`DockTray.tsx` renderers die). Each entry gains a `route` field next to its `appId` (additive change to `dock-tiers.ts`, the transition's appId→route table — §2.3).

- **Work:** Home→`/home` · Chat→`/workspaces/<active>/chat` (no active workspace → `/home`) · Memory→`/memory` · Files→`/files` · Artifacts→`/artifacts`
- **Intelligence:** Agent Center→`/agents` · Skills Hub→`/skills` · Automation Center→`/automations` · Room→`/room` · Waggle Dance→`/waggle-dance` · Approvals→`/approvals` (TEAMS+)
- **Extend:** Connector Hub→`/connectors` · MCP Hub→`/mcps` · Marketplace→`/marketplace` · AI Tools→`/launcher`
- **Team (hidden < TEAMS):** Team Governance→`/team`
- **System:** Settings→`/settings` · Vault→`/settings/vault` · Mission Control→`/settings/mission-control` · Timeline→`/settings/timeline` · Events & Logs→`/settings/events` · Usage & Cost→`/settings/usage`

The `simple`/`professional` UI-complexity tiers (`TIER_DOCK_CONFIG`, `dock-tiers.ts:105-128`) keep filtering the nav exactly as they filter the dock today.

---

## 2. Navigation contract — URL is the single source of truth

### 2.1 The contract

1. **AppShell layout route** owns: BootScreen gate (FR #23 sequencing moves from `pages/Index.tsx:14-36` into the layout), onboarding takeover, StatusBar, left nav, global overlays, the persistent ChatHost (§4.2), and `<Outlet/>` as the single canvas.
2. **Active nav state derives from the URL** (`useLocation` prefix match against the entry's `route`). No `openAppIds`/`minimizedAppIds` indicator state (`useWindowManager.ts:438-451` dies).
3. **Every navigation is `navigate()`.** No surface raises a window. Browser/Tauri back-forward works by construction.

### 2.2 Existing navigation surfaces — retarget table

| Surface today | Evidence | Becomes |
|---|---|---|
| `handleSearchNavigate` (palette result clicks) | `Desktop.tsx:258-288` — type-prefixed ids: `workspace:`→`openWorkspaceDesktop`, `session:<ws>:<sid>`→`openChatForWorkspace`, `memory:`→`openApp('memory')`, `skill:`/`connector:`/`mcp:`→hub apps, `command:`→`openApp(bareId)` | Pure function `routeForSearchResult(type,id)` → `navigate()`: `workspace:`→`/workspaces/:id` · `session:`→`/workspaces/:ws/chat?session=:sid` · `memory:`→`/memory` · `skill:`→`/skills` · `connector:`→`/connectors` · `mcp:`→`/mcps` · `command:`→`routeFor(appId)` fallback · `person:`→no-op (parity: unhandled today too — the server intentionally doesn't federate `person` yet, `routes/command.ts:22-24`; retarget to `/team` when it federates). This makes `routeForSearchResult` total over `NAVIGABLE_TYPES` (`CommandCenter.tsx:66-68`). `CommandCenter.tsx` itself is untouched (its `onNavigate(type,id)` prop contract holds, `CommandCenter.tsx:170,351-360`). |
| Keyboard Ctrl+Shift+0-9 | `useKeyboardShortcuts.ts:16-27,86-90` | `onOpenApp(id)` handler → `navigate(routeFor(id))`. Map entries pointing at killed ids retarget: `0:dashboard`→`/home`, `4:cockpit`→`/settings/mission-control`. Hook unchanged; only the Desktop-supplied callback changes. |
| Dock clicks | `Desktop.tsx:564-567` | Nav entry click → `navigate(entry.route)`; Chat special-case resolves active workspace (§1.3). |
| Launch-flip | `Desktop.tsx:192-206` | Deleted — index redirect `/`→`/home` subsumes it. |
| `waggle:open-app` CustomEvent | dispatchers: `HomeCockpit.tsx:255`, `MarketplaceApp.tsx:265`, `CapabilitiesApp.tsx:509`, `MissionControlApp.tsx:57`, `memory/HarvestTab.tsx:298`; Desktop listener `Desktop.tsx:178-190` | **Internal shim during transition** (§2.3). |
| `handleOnboardingFinish` (wizard `onFinish`) | `Desktop.tsx:309-313` — `selectWorkspace` + `wm.openChatForWorkspace(workspaceId, workspaceName, personaId, firstMessage)` + `refreshWorkspaces`. First-run critical path: lands the user in chat with the wizard-chosen persona and the QW-1 starter prompt prefilled (bug #4/#8/P1 fixes, comment block `Desktop.tsx:297-308`) | `selectWorkspace` + seed the workspace's chat widget with `{personaId, initialMessage: firstMessage}` via the ChatHost seed API (§4.2) + `navigate('/workspaces/'+workspaceId+'/chat')` + `refreshWorkspaces`. Verified by acceptance check 8. |

### 2.3 The `waggle:open-app` shim (D1 condition 2)

Dispatching components are screen components — rewriting their dispatch sites would violate D1 condition 1. So:

- AppShell installs ONE listener (replacing `Desktop.tsx:178-190`): `{appId, tab?, automationId?}` → `navigate(routeFor(appId) + queryString({tab, automationId}))` **and** keeps calling `stashDeepLink` (`lib/app-deeplink.ts:21-24`) so the mount-time consumer (`AutomationCenterApp.tsx:104-114` — the ONLY `consumeDeepLink` caller in the tree) works unchanged. The other consumer, `UserProfileApp.tsx:105-118`, **never reads the stash** — it has only a *live* `waggle:open-app` listener, which today works because the dispatcher (HarvestTab) and an already-mounted profile window can coexist. Under the single canvas they cannot, so after `navigate()` the shim **re-dispatches the same event once, on the tick after the target route has rendered** (detail marked `redispatch: true`; the shim ignores its own re-dispatches). The freshly mounted live listener catches the re-dispatch — zero screen-component edits, D1 condition 1 intact, and acceptance check 3's tab-preselect holds for both consumer styles (stash-on-mount and live-listener).
- `routeFor(appId, ctx?: { activeWorkspaceId?: string })` is the §1.1 table as code, co-located with `dock-tiers.ts`. A **function, not a `Record<AppId, string>`**: `chat` and `workspace-desktop` resolve to parameterized routes (`/workspaces/:id(/chat)`; no active workspace → `/home`, §1.3) that a static record cannot express. All three chat-capable consumers — the nav Chat entry (§1.3), Ctrl+Shift+1 (§2.2), and this shim (theoretical arm: no dispatcher emits `appId:'chat'` today) — resolve through it, so the chat special-case is implemented exactly once.
- **Slated for removal** (tracked exclusion, post-conversion phase work): dispatch sites migrate to `useNavigate`/`Link`, consumers migrate to `useSearchParams`, then the event listener + `app-deeplink.ts` are deleted. URLs are the contract from day one; the event is plumbing.

---

## 3. Window-manager retirement inventory (D1 condition 3)

### 3.1 Code that DIES (no z-order code ships — brief §6.5)

| Unit | Evidence | Verdict |
|---|---|---|
| z-order: `topZRef`, `nextZ()`, `zIndex` on `WindowState` | `useWindowManager.ts:122,190,44` | DELETE |
| Focus: `focusedInstanceId`, `focusWindow`, `cycleWindowFocus` + Ctrl+` listener, dangling-focus reassignment | `useWindowManager.ts:124,390-426,373-384` | DELETE (Ctrl+` shortcut retires) |
| Minimize: `minimizeApp`, `minimizeTopWindow`, `minimized`, `minimizedAppIds`; Ctrl+Shift+M / Ctrl+W handlers | `useWindowManager.ts:386-388,412-414,439-451`; `useKeyboardShortcuts.ts:56-67` | DELETE |
| Cascade: `cascadeCounter`, `cascadeOffset`, `computeCascadePosition` | `useWindowManager.ts:123`; `lib/window-cascade.ts` | DELETE |
| Open/close: `openApp`, `openChatForWorkspace`, `openWorkspaceDesktop`, `closeApp`, `closeTopWindow` | `useWindowManager.ts:192-309,363-365,408-410` | DELETE — replaced by `navigate()` (chat seeding logic relocates, §4) |
| Persistence: `loadPersistedWindows`/`savePersistedWindows` on `waggle-window-state-v1` | `useWindowManager.ts:7,54-84,186-188` | DELETE after one-shot migration (§3.3) |
| `AppWindow.tsx` (drag via framer-motion `useDragControls`, 8-direction resize) | 321 LOC; drag `:70,:232-236`, resize `:18-21,:73-176` | DELETE |
| `Dock.tsx` + `DockTray.tsx` renderers | audit §2a | DELETE — replaced by AppShell nav rendering the same `dock-tiers.ts` data |
| `lib/window-positions.ts` (`getSavedPosition`), `lib/status-bar-focus.ts` (`buildStatusBarFocus`) | `Desktop.tsx:67,536,515-525` | DELETE — StatusBar breadcrumb derives from the matched route's title instead |
| `overlays/GlobalSearch.tsx` (dead) | audit §2d | DELETE |
| Workspace-reconciliation sweep for restored chat windows | `useWindowManager.ts:155-183` | DELETE — chat instances are route/widget-scoped, no restored-window orphans exist (its one legacy duty, re-homing `'local-default'`-stamped chat state, is performed once by §3.3 steps 2–3) |

Deletion, not retention: D1-3 says no z-order code *ships*. Rollback is the git tag (§6), not dead files on disk.

### 3.2 What SURVIVES (transitional shim)

- **Per-chat persona/autonomy state**: `WindowState.personaId/autonomyLevel/autonomyExpiresAt` + `setWindowPersona`/`setWindowAutonomy` + the 10s autonomy auto-revert interval (`useWindowManager.ts:316-361`) relocate into a new `useChatWidgetState(workspaceId)` hook owned by the ChatHost (§4.2). Logic moves verbatim; the keying changes from `instanceId` to `workspaceId`. `WindowState.initialMessage` (`useWindowManager.ts:30`) relocates as the one-shot payload of the §4.2 chat seed API (it is transient intent, not persisted state — not part of the `waggle-chat-state-v1` key).
- `getWindowTitle`'s chat-title composition (`useWindowManager.ts:428-436`) → chat widget header label.
- **`useDockNudge`** (M-24/ENG-3 session-10/50 zone nudges — `Desktop.tsx:218-223`; `lib/dock-nudge.ts` + tests): relocates verbatim into AppShell. The IA zones it points at survive as nav zones (§1.3), so the behavior stays meaningful; the copy strings that say "dock" (`dock-nudge.ts:25,60-61`) retarget to the left nav — a lib copy edit, not a screen-component edit (D1-1 intact).
- `useWindowManager.ts` itself is deleted once both relocations land; it does NOT survive as a runtime shim.

### 3.3 `waggle-window-state-v1` migration → clear

One-shot, on first AppShell boot, before first render of the canvas:

1. Read + parse the key (same validation as `loadPersistedWindows`, `useWindowManager.ts:54-72`).
2. **Initial-route salvage:** highest-`zIndex` non-minimized window → `routeFor(appId)` (chat → `/workspaces/:workspaceId/chat`; a chat stamped with the `'local-default'` pre-fetch placeholder → `/home`) → seed the initial navigation. No windows / parse failure → `/home`.
3. **Chat-state salvage:** for each `appId==='chat'` entry, write `{personaId, autonomyLevel, autonomyExpiresAt}` keyed by `workspaceId` into the new chat-widget state store (last-write-wins when multiple windows share a workspace — the multi-instance case collapses per §4). Entries keyed `'local-default'` (the placeholder today's reconciliation sweep re-homes onto the first real workspace, `useWindowManager.ts:167-172` — sweep deleted in §3.1) re-key to the first real workspace when the chat-state store first sees the real workspace list (the migration itself runs pre-fetch); one-shot legacy re-key mirroring the deleted sweep — new widget state is never placeholder-stamped, so the re-key dies with the §2.3 shim cleanup.
4. `localStorage.removeItem('waggle-window-state-v1')` — unconditionally, including on parse failure. No dual-format support, ever.

---

## 4. Chat-as-widget design (D1 condition 4)

### 4.1 Current semantics being mapped

- Chat is the ONLY multi-instance app: singleton-per-workspace unless an explicit `personaOverride` spawns a second window on the same workspace (`useWindowManager.ts:223-268`; Ctrl+Shift+N via `handleNewChatWindow`, `Desktop.tsx:233-239`; PersonaSwitcher acting on the focused chat window, `Desktop.tsx:583-604`).
- `ChatWindowInstance` (per-window chat runtime: own `useChat`/`useSessions`, persona + autonomy header controls) receives everything via props (`ChatWindowInstance.tsx:50+`; render site `Desktop.tsx:341-358`).
- `WorkspaceDesktopApp` already has a `chat` tab whose body is a **placeholder that deep-links out** via `onOpenChat` (`WorkspaceDesktopApp.tsx:65,86-90,851`; "the shell never embeds a live composer itself", `:88`).

### 4.2 Target

- **One chat widget per workspace**, living at `/workspaces/:id/chat`: the `chat` tab body renders `ChatWindowInstance` (unchanged component) instead of the placeholder; `onOpenChat` callers inside the component (Overview preview widget `:161-199`, header button `:469`) retarget to the chat tab — which they already do semantically ("deep-links to the Chat tab", `:29`).
- **ChatHost keep-alive:** AppShell hosts a `ChatHost` that mounts one `ChatWindowInstance` per *visited* workspace this session, keyed by `workspaceId`, hidden (not unmounted) when the route is elsewhere. This preserves today's behavior where an open chat window keeps streaming while the user works in other windows — route unmounting would kill in-flight `useChat` SSE streams, which IS a hard requirement (an agent run must survive navigation). This is shell plumbing, not a screen rewrite.
- Per-widget persona/autonomy state: `useChatWidgetState(workspaceId)` (§3.2), persisted under a new versioned key (`waggle-chat-state-v1`), seeded by the §3.3 migration.
- **Chat seed API (imperative, one-shot):** `useChatWidgetState`/ChatHost expose `seedChat(workspaceId, {personaId?, initialMessage?})`; the widget consumes the seed on its first mount for that workspace. This is the post-conversion carrier for what `WindowState.initialMessage`/`personaId` carry today into the `ChatWindowInstance` `initialPersona`/`initialMessage` props (`useWindowManager.ts:30`, `Desktop.tsx:350-351`) — without it, wizard chat seeding dies with `openChatForWorkspace` (§3.1). Sole conversion-time caller: the wizard `onFinish` retarget (§2.2). Reusable by HomeCockpit `onContinue` when `?session=` seeded restore lands (§5.3 #5).
- PersonaSwitcher (Ctrl+Shift+P) targets the active workspace's widget; fallback to patching the workspace record stays (`Desktop.tsx:595-601` logic, re-hosted).
- Ctrl+Shift+N ("new chat window") retires as a window spawner; it navigates to the active workspace's chat tab. New-session affordance already exists inside `ChatWindowInstance` via `useSessions`.

### 4.3 D1-c lite (detached chat) — **NOT NEEDED**

Searched for a hard requirement; none exists in code. The only capability lost is *N concurrent same-workspace chat windows with different personas* (Phase A.2 convenience, `useWindowManager.ts:219-221`). Nothing depends on it: each window runs an independent `useChat` session; no cross-instance coordination, no feature consumes the multiplicity (PersonaSwitcher/Ctrl+Shift+N merely create it). Per-workspace persona switching survives in the widget header (`onPersonaChange` prop, `Desktop.tsx:352`). Cross-WORKSPACE parallelism survives fully: ChatHost keeps every visited workspace's widget alive (§4.2). Verdict: ship without the exception; if dogfood surfaces real demand for side-by-side personas, propose D1-c lite then — do not pre-build it.

---

## 5. Zero-rewrite mounting plan (D1 condition 1)

### 5.1 Mechanism: route wrappers re-host Desktop's prop plumbing

`Desktop.tsx` is today's single integrator: it owns the domain hooks (`useWorkspaces`, `useMemory`, `useEvents`, `useKnowledgeGraph`, `useAgentStatus`, `useNotifications`, `useWaggleDance`, `useOnboarding`, `useOfflineStatus` — `Desktop.tsx:119-128`) and feeds props in `renderAppContent`. The conversion relocates, never rewrites:

- **AppShell context** hosts the cross-cutting hooks once (workspaces/tier/notifications/onboarding/offline/agent-status — everything StatusBar + nav + overlays need).
- **One thin wrapper per route** (`apps/web/src/routes/*.tsx`, new files) reads route params + shell context, hosts any surface-local hooks, and renders the existing component **with byte-identical props**. `AppErrorBoundary` wraps each route surface exactly as it wraps window content today (`Desktop.tsx:556-558`).

| Screen | Props needed (source today) | Wrapper supplies |
|---|---|---|
| `HomeCockpit` | `onContinue`/`onOpenWorkspaceDesktop`/`onCreateWorkspace` (`Desktop.tsx:363-382`) | `navigate('/workspaces/:id/chat')` / `navigate('/workspaces/:id')` / open CreateWorkspaceDialog overlay |
| `WorkspaceDesktopApp` | `workspaceId`, `workspaceName`, `onOpenChat` (`Desktop.tsx:392-406`) | `useParams().workspaceId`; `onOpenChat`→chat tab |
| `MemoryApp` | 12+ props from `useMemory` + `useKnowledgeGraph` + `onContextRail` (`Desktop.tsx:412-423`) | wrapper hosts both hooks (heaviest re-host; verbatim move) |
| `ArtifactCenterApp` | `activeWorkspaceId`, `workspaceName` (`Desktop.tsx:435`) | `?workspace` ?? shell context |
| `FilesAppTabs` | `workspaceId`, `workspaces`, `onSelectWorkspace`, `onContextRail` (`Desktop.tsx:436-451`) | `?workspace` param replaces `filesViewWorkspaceId` state |
| `AgentsApp` | `workspaces` (`Desktop.tsx:434`) | shell context |
| `AutomationCenterApp`, `CapabilitiesApp`, `MarketplaceApp`, `SettingsApp`, `VaultApp`, `UserProfileApp`, `BackupApp`*, `TelemetryApp`, `CockpitApp`, `WaggleDanceApp`, `ApprovalsApp`, `TeamGovernanceApp` | zero props (`Desktop.tsx:407-409,430-433,452-453,462,464-466`) | mount bare (*BackupApp killed) |
| `ConnectorsApp` / `MCPHubApp` | `personaId` (`Desktop.tsx:410-411`) | shell context |
| `EventsApp` | `useEvents` bundle + `onAbort` (`Desktop.tsx:424-429`) | wrapper hosts `useEvents` |
| `TimelineApp` / `RoomApp` / `LauncherApp` | workspaceId / names map / activeWorkspaceId (`Desktop.tsx:454-463`) | shell context |
| `ChatWindowInstance` | full prop set (`Desktop.tsx:341-358`) | ChatHost + `useChatWidgetState` (§4.2) |

### 5.2 The ONE sanctioned component edit

`WorkspaceDesktopApp` must (a) accept a controlled `activeTab`/`onTabChange` pair (today internal state, `:615`) so `:tab?` is URL-driven, and (b) render the chat widget in the `chat` tab body (today a placeholder, `:851`). This is **derived from D1 condition 4**, not a discretionary rewrite — condition 4's chat-widget-inside-Workspace-Desktop cannot ship without both seams. The register itself never ratified a screen edit (condition 1 reads "screens mount under routes as-is"), so these two seams require **explicit founder sign-off as part of the Phase 0 ratification of this plan, before P1a starts** — scoped to exactly those two seams, test-pinned, everything else in the file untouched.

### 5.3 Exclusions — divergences that are PHASE work, not conversion work

1. `/memory?tab=` + `/settings?tab=` URL→internal-tab wiring (components lack tab props) → P3 (D2 rework) / P7.
2. Memory two-mind `/:mindScope` implementation → P3 (D2).
3. `waggle:open-app` dispatch-site + consumer migration off the shim → post-conversion cleanup (§2.3).
4. Dead-file removal beyond the §3.1 inventory (`DashboardApp`, `VoiceApp`, `MissionControlApp`, `BackupApp` files) → dead-code commit per CLAUDE.md §4.
5. `?session=` chat session-targeted restore (chat runtime doesn't accept a sessionId seed yet — `Desktop.tsx:366-373` comment) → carries as the existing known gap, URL shape reserved now.
6. D3 auth-gate, D2, D4, D11/D12 — own phases per the ratified sequence.

---

## 6. Transition sequencing

| Step | Content | Class |
|---|---|---|
| **P0 (this doc)** | Route map + contract frozen. No code. | — |
| **P1a — conversion** | Tag `checkpoint/pre-appshell-2026-06`. Then one PR: AppShell layout + nav (from `dock-tiers.ts` data) + route wrappers + ChatHost + §3.3 migration + retarget table (§2.2) + §3.1 deletions + §5.2 edit. FE-only; `packages/server` diff = **empty** (B4). | Mechanical: routes/wrappers/nav/retargets/deletions. **Risky:** ChatHost keep-alive + chat-state migration; `WorkspaceDesktopApp` tab control; MemoryApp hook re-host. Risk is isolated in NEW files + the one sanctioned edit. |
| **P1b — D3** | Adapter-level auth gate lands ON the converted shell (gate once, on one spine). | per ratification |
| **P2+** | Verify+J08, D2 (P3), D11/D12 (P4), D4 (P5), D15 (P7) — per the ratified phase sequence. | — |
| **Rollback** | Conversion is one revertable PR: screen components untouched (±§5.2) ⇒ `git revert` of the conversion merge restores the windowed shell byte-for-byte. The §3.3 migration deletes `waggle-window-state-v1`, so a rollback boots to the empty-desktop launch-flip (`home` opens) — accepted, not data loss. | — |

Note (flagged §9): the ratification's phase list reads "P1=D3" and left the conversion *build* implicit ("Phase 0 = D1 conversion plan"). This plan assigns the build to P1a, ahead of D3, so the structural auth gate is built once against the final spine instead of being re-plumbed after.

---

## 7. Launch-cut screen inventory lock (audit §3, frozen)

20 in-scope blueprint screens — verdicts restated from `docs/UX_REFACTOR_STATE_AUDIT.md` §3; this table is the Phase 0 freeze. No screen is rebuilt by the conversion.

| S# | Screen | Verdict | Component | Route (per §1) |
|---|---|---|---|---|
| 1 | Home Cockpit | exists | `HomeCockpit.tsx` | `/home` |
| 2 | Workspace Desktop | exists | `WorkspaceDesktopApp.tsx` | `/workspaces/:id` |
| 3 | Command Center (Ctrl+K) | exists | `overlays/CommandCenter.tsx` | overlay (global) |
| 4 | Memory Center | exists (tab; D2 promotes P3) | `MemoryApp.tsx` + `memory/MemoryCenterTab.tsx` | `/memory` |
| 5 | Artifact Center | exists | `ArtifactCenterApp.tsx` | `/artifacts` |
| 6 | Skills Hub | exists | `CapabilitiesApp.tsx` | `/skills` |
| 7 | Connector Hub | exists | `ConnectorsApp.tsx` | `/connectors` |
| 8 | MCP Hub | exists | `MCPHubApp.tsx` | `/mcps` |
| 9 | Agent Center | exists | `AgentsApp.tsx` | `/agents` |
| 10 | Team Workspace | DEFERRED (legacy app tier-hidden, D5) | `TeamGovernanceApp.tsx` | `/team` (reserved) |
| 11 | Automation Center | exists | `AutomationCenterApp.tsx` | `/automations` |
| 12 | First Launch | exists | `onboarding/WelcomeStep.tsx` | OnboardingWizard takeover |
| 13 | Who Are You | exists | `onboarding/WhoAreYouStep.tsx` | (wizard) |
| 14 | Tool Discovery | partial — relocated to Launcher (D6 ratified) | `LauncherApp.tsx` | `/launcher` |
| 15 | Memory Import | exists | `onboarding/ImportStep.tsx` | (wizard) |
| 16 | Memory Review | partial — relocated to Memory Center "Needs review" (D6) | `memory/MemoryCenterTab.tsx` | `/memory` |
| 17 | Create Workspace | exists | `onboarding/WorkspaceCreateStep.tsx` + `CreateWorkspaceDialog.tsx` | (wizard) + overlay |
| 18 | Agent Builder | exists | `agents/AgentBuilder.tsx` | inside `/agents` |
| 19 | Skill Builder | exists | `skills/SkillBuilder.tsx` | inside `/skills` |
| 20 | Automation Builder | exists | `automations/AutomationBuilder.tsx` | inside `/automations` |
| 21 | Marketplace / Extend | exists | `MarketplaceApp.tsx` | `/marketplace` (flagged) |

---

## 8. Acceptance checks (conversion done = ALL pass)

1. **No z-order code ships (brief §6.5):** `grep -rn "zIndex\|nextZ\|cascadeOffset\|minimizeApp\|focusWindow\|buildStatusBarFocus" apps/web/src` → zero hits outside CSS/z-index utility classes; `useWindowManager.ts`, `AppWindow.tsx`, `window-cascade.ts`, `window-positions.ts`, `status-bar-focus.ts` (+ its `.test.ts`), `Dock.tsx`, `DockTray.tsx`, `GlobalSearch.tsx` do not exist.
2. **Every §1.1 routed screen reachable by typing its URL** into a fresh tab (post-boot, post-onboarding) — including param forms `/workspaces/:id/chat` and `/automations?tab=logs&automationId=x`. Unknown URLs → existing `NotFound`.
3. **Deep links are URLs:** dispatching `waggle:open-app {appId:'scheduled-jobs', tab:'logs', automationId}` changes `location` to `/automations?tab=logs&automationId=…` AND the Logs tab preselects (stash consumed on mount, §2.3); HarvestTab's "Open Profile" lands on `/settings/profile?tab=identity` **with the Identity tab preselected** (the shim's post-render re-dispatch reaches `UserProfileApp`'s live listener, §2.3).
4. **Ctrl+K works on every route** (palette mounts in AppShell); a `workspace:` result click changes the URL to `/workspaces/:id`; browser Back returns to the prior route.
5. **B4 untouched:** `git diff main --stat -- packages/` for the conversion PR is **empty**. All `/api/*` aliases (`/api/automations`, `/api/command/*`, …) keep answering — FE adapter calls unchanged.
6. **Migration clean (D1-3):** boot with a populated `waggle-window-state-v1` → lands on the salvaged route, chat persona/autonomy preserved per workspace, key **absent** from localStorage afterward; boot with a corrupt value → `/home`, key absent, no crash.
7. **Chat-as-widget (D1-4):** one chat per workspace at `/workspaces/:id/chat`; an in-flight agent stream survives navigating to `/memory` and back (ChatHost keep-alive); persona change in the widget header does not mutate the workspace record.
8. **First-run chat seeding (wizard onFinish):** completing the onboarding wizard lands on `/workspaces/<newId>/chat` with the wizard-chosen persona active in the widget header and the QW-1 starter prompt prefilled in the composer — behavioral parity with `handleOnboardingFinish` (`Desktop.tsx:309-313`) via the §4.2 seed API.
9. **Zero-rewrite (D1-1):** `git diff main --stat -- apps/web/src/components/os/apps apps/web/src/components/os/overlays` shows changes ONLY in `WorkspaceDesktopApp.tsx` (§5.2); all other screen/overlay files byte-identical.
10. **Gates:** FE vitest suite green (`--root apps/web`); `tsc -p apps/web/tsconfig.app.json` 0 errors; lint 0.

---

## 9. Deviations & flagged calls

Calls made here (not deferred). Each is reversible at route level without touching screens.

1. **`/marketplace` added** — the brief's 11 route groups omit the shipped S21 Extend surface (`dock-tiers.ts:78`). A dock-reachable screen with no URL would fail acceptance check 2. Top-level route, Extend zone.
2. **`/files` added** — Work-zone primary-spine entry (`dock-tiers.ts:55`) omitted by the brief. Same reasoning.
3. **`/launcher` (AI Tools) and `/room`, `/waggle-dance` added** — Extend/Intelligence dock entries omitted by the brief; `/launcher` additionally hosts the D6-ratified S14 relocation, and Room has a shipped keyboard shortcut. Killing them would strip ratified/shipped capability; Phase 0 freezes them as routes.
4. **System-zone surfaces nest under `/settings/*`** (vault, profile, mission-control, timeline, events, usage) instead of new top-level groups — keeps the brief's 11-group spine intact while giving every System surface a URL. They render full-canvas; SettingsApp is not modified.
5. **Four AppIds killed** (no route): `dashboard` (back-compat shim obsoleted by §3.3), `voice` + `mission-control`/`MissionControlApp` (no live opener anywhere — dead surfaces; D8 reassigns the "Mission Control" name to CockpitApp), `backup`/`BackupApp` (duplicated by `SettingsApp` `?tab=backup`). Files deleted in a later dead-code commit, not the conversion PR.
6. **`/approvals` ships tier-hidden (TEAMS), `/team` reserved + tier-hidden** — exact D5 parity with today's `filterByBillingTier`; "reserve /team, do NOT ship" is implemented as no-nav-below-TEAMS + no new Team code.
7. **Bare `/workspaces` redirects to `/home`** — no workspace-list screen exists; Home is the selector (A2). Building a list screen would be net-new scope.
8. **`WorkspaceDesktopApp` is the single sanctioned component edit** (controlled tab + chat-tab embed) — derived from D1 condition 4 itself, NOT separately ratified (the register's condition 1 says "as-is"); the two seams go to the founder for explicit sign-off with this plan, before P1a. Held to two seams and pinned by tests (§5.2).
9. **Conversion build assigned to P1a, before D3** — the ratification's phase list says "P1=D3" but leaves the D1 build unassigned; building the shell first means the structural auth gate is wired once, on the final spine.
10. **D1-c lite NOT invoked** — no hard detached-chat requirement found in code (§4.3); concurrent same-workspace multi-persona windows are consciously dropped. Re-proposable post-dogfood with evidence.
11. **Window-manager files deleted, not retained-for-rollback** — D1-3's "no z-order code ships" is read literally; rollback = `checkpoint/pre-appshell-2026-06` tag + single PR revert. The dead `GlobalSearch.tsx` goes with them.
12. **ChatHost keep-alive mounting** (one live `ChatWindowInstance` per visited workspace, hidden off-route) — not in the brief, but required so route navigation cannot kill in-flight agent SSE streams; this is the conversion's only behavioral guarantee carried over from windowing. Non-chat surfaces accept standard route remount semantics (server-side state, refetch on entry).

---
*Authored 2026-06-10 · Phase 0, UX Refactor v2.1 Launch Cut · implements ratified D1(b)*
