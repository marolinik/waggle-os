# Frontend Inventory — `apps/web/src`

> Baseline for the Waggle OS UX-refactor planning track. Enumerates the current
> web frontend so all downstream planners share one ground-truth map.
> Every entry is grounded in source under `D:/Projects/waggle-os/apps/web/src`.
> Execution model is locked as an **in-place incremental refactor** of this code —
> this is the surface that gets extended, not replaced.

Entry point chain: `main.tsx` → `App.tsx` (`ServiceProvider` → `QueryClientProvider`
→ `TooltipProvider` → `BrowserRouter`) → `pages/Index.tsx` (route `/`) →
`BootScreen` then `Desktop`. There is **no react-router-based navigation between
apps** — routing is a single `/` page; all "navigation" is window management
inside `Desktop.tsx`.

---

## (a) App shells, overlays, and OS-level components

### `components/os/apps/*` — per-app window content (26 top-level + 3 sub-dirs)

| File | 1-line role |
|---|---|
| `ChatApp.tsx` | Core chat surface: message list + block rendering + composer + autonomy picker + persona header. The product's primary work surface. |
| `ChatWindowInstance.tsx` | Per-window wrapper around `ChatApp` — owns session selection, model selector, autonomy state, WorkspaceBriefing home screen; one instance per chat window. |
| `DashboardApp.tsx` | "Home" / Workspaces grid — lists workspaces, select/create, opens chat per workspace. Mapped to dock key `home`. |
| `MemoryApp.tsx` | Memory hub with 6 tabs: Timeline (frames), Graph (KG), Harvest (import other-AI convos), Weaver (distillation), Wiki (compiled pages), Evolution (self-evolving prompts). |
| `FilesApp.tsx` | File-manager layout shell (FileTree + FilePreview + FileActions + FileUploadZone). |
| `FilesAppTabs.tsx` | P16 three-tab wrapper around `FilesApp` — Virtual / Local / Team storage; remounts FilesApp per storageType. This is what `Desktop` renders for `files`. |
| `AgentsApp.tsx` | "Personas" manager — list/create/edit personas + agent groups; uses `agents/` subcomponents. |
| `ConnectorsApp.tsx` | Connectors manager with 2 tabs: Services (native connectors w/ status+actions) and MCP Servers (catalog). |
| `CapabilitiesApp.tsx` | "Skills & Apps" — starter packs, capability packs, and a Marketplace packs section (marketplace is folded in here, not a separate dock entry). |
| `MarketplaceApp.tsx` | Standalone marketplace browser (search/install/uninstall packages). Registered in `Desktop` appConfig as `marketplace` but no dock entry points at it (CapabilitiesApp hosts the surface). |
| `CockpitApp.tsx` | "Command Center" — system health, agent activity, cost/usage tiles; hosts `cockpit/ComplianceDashboard`. |
| `MissionControlApp.tsx` | Fleet/spawn overview + AI-tool inventory tile; "Spawn Agent" entry point. |
| `RoomApp.tsx` | The Room canvas — live sub-agent tiles across all workspaces via `useRoomState` SSE. |
| `WaggleDanceApp.tsx` | Multi-agent coordination signal feed (discovery/handoff/insight/alert/coordination) with detail pane + ack. |
| `EventsApp.tsx` | Agent event/log stream (think/tool_call/tool_result/response/error/spawn) with filter + autoscroll + abort. |
| `TimelineApp.tsx` | Per-workspace chronological timeline of tool/model/cost events (`GET /api/events`). |
| `TelemetryApp.tsx` | "Usage & Telemetry" — token/cost/tool-call totals, telemetry enable/clear. |
| `ScheduledJobsApp.tsx` | Cron jobs manager (list/create/update/delete/trigger). |
| `ApprovalsApp.tsx` | Approvals inbox (Phase B.3) — Pending requests tab + grants tab; same backend as inline chat approvals. |
| `BackupApp.tsx` | Backup & Restore — backup metadata, create/restore; 404 treated as "no backups yet". |
| `SettingsApp.tsx` | Settings shell with 8 tabs: General, Models, Billing, Permissions, Team, Backup, Enterprise, Advanced. |
| `VaultApp.tsx` | Secret vault — Secrets tab (add/delete keys) + additional tab(s). |
| `UserProfileApp.tsx` | "My Profile" — identity questionnaire, writing-style analysis, brand extraction, research (tabbed). |
| `VoiceApp.tsx` | Voice interaction surface (speech recognition / TTS). |
| `TeamGovernanceApp.tsx` | Team Governance panel (Teams-tier; roles/permissions surface). |
| `LauncherApp.tsx` | AI-OS tool launcher dock surface — detect/install-hooks/launch external AI tools (claude-code/cursor/claude-desktop launch cohort; codex/hermes/openclaw stubbed). |

Sub-directories under `apps/`:
- `agents/` — `AgentCard.tsx`, `AgentDetail.tsx`, `CreateAgentForm.tsx`, `CreateGroupForm.tsx`, `GroupCard.tsx`, `GroupExecutionPanel.tsx` (Personas/agent-group UI parts).
- `chat-blocks/` — `BlockRenderer.tsx`, `ModelSwitchBlock.tsx`, `StepBlock.tsx`, `ToolUseBlock.tsx` (renders the `ContentBlock` union inside chat messages).
- `cockpit/` — `ComplianceDashboard.tsx`.
- `connectors/` — `BrandTile.tsx`, `McpServerCard.tsx`.
- `files/` — `FileActions.tsx`, `FilePreview.tsx`, `FileTree.tsx`, `FileUploadZone.tsx`, `SyntaxPreview.tsx`, `WorkspaceRail.tsx`.
- `memory/` — `EvolutionTab.tsx`, `WeaverPanel.tsx`, `WikiTab.tsx`.

### `components/os/overlays/*` — modals, drawers, switchers (14)

| File | 1-line role |
|---|---|
| `OnboardingWizard.tsx` | First-launch wizard (rendered as full-screen early-return from `Desktop` when `!onboardingState.completed`); uses `onboarding/` step components. |
| `OnboardingTooltips.tsx` | Post-wizard "Tour" overlay (4 slides: commands, dock, memory, closing). |
| `LoginBriefing.tsx` | Session-start "I remember…" briefing — memory highlights + cross-workspace catch-up with workspace links. |
| `GlobalSearch.tsx` | Ctrl+K command palette + global search; navigates commands/workspaces/memory. |
| `PersonaSwitcher.tsx` | Persona picker (two-tier: universal modes + workspace specialists; hover tagline/bestFor/wontDo). Operates on focused chat window's persona or patches workspace. |
| `WorkspaceSwitcher.tsx` | Workspace quick-switcher list (filters E2E/test artefact names). |
| `SpawnAgentDialog.tsx` | Spawn a sub-agent (task + persona + model + parent workspace). |
| `CreateWorkspaceDialog.tsx` | New-workspace dialog (name/group/persona/template). |
| `NotificationInbox.tsx` | Notifications drawer (mark read / mark all read). |
| `KeyboardShortcutsHelp.tsx` | Keyboard shortcuts cheat-sheet modal. |
| `ContextRail.tsx` | Right-side rail showing full context for a clicked frame/entity (Phase C.1). Exports `ContextRailTarget`. |
| `UpgradeModal.tsx` | Upgrade/start-trial modal; calls `startTrial` / `createCheckoutSession`. |
| `TrialExpiredModal.tsx` | Trial-expired blocking modal → upgrade. |
| `EraseDataDialog.tsx` | GDPR Art. 17 erasure confirmation (3-state); triggered from Settings → General. |

Sub-directory `overlays/onboarding/`: `WelcomeStep.tsx`, `TierStep.tsx`, `ApiKeyStep.tsx`, `ReadyStep.tsx`.

### `components/os/*.tsx` — shell/runtime + shared OS components (12)

| File | 1-line role |
|---|---|
| `Desktop.tsx` | **Root OS shell.** Wires all domain hooks + window manager + overlays; holds `appConfig` (title/icon/pos/size per appId) and `renderAppContent` (the appId→component switch). |
| `Dock.tsx` | Bottom dock — renders tier-filtered `DockEntry[]`, zone-parent flyouts (via `DockTray`), open/minimized indicators, Spawn Agent button, Waggle badge. |
| `DockTray.tsx` | Portal-to-body flyout popover for a dock zone-parent's children. |
| `AppWindow.tsx` | Draggable/resizable/snappable/maximizable window chrome (title bar, min/max/close, edge+corner resize, left/right/top snap, position persistence). |
| `StatusBar.tsx` | Top bar — logo, workspace name, focused-window label, model, memory-frame trophy count, dev tokens/cost, trial badge, Search button, notifications bell, offline indicator, clock. |
| `BootScreen.tsx` | Animated boot splash (5 phases, click/key to skip); shown before `Desktop`. |
| `ErrorBoundary.tsx` | App-level error boundary (`AppErrorBoundary`) wrapping each window's content + the whole app. |
| `ContextMenu.tsx` | Generic right-click context menu primitive (used by MemoryApp frames etc.). |
| `LockedFeature.tsx` | Tier-gated "locked" overlay/badge for features above the user's plan. |
| `ModelSelector.tsx` | Reusable model picker (Settings/Onboarding/workspace-create/spawn); fetches via `useProviders`. |
| `ModelPilotCard.tsx` | 3-lane model fallback visualizer (Primary → Fallback → Budget Saver). |
| `WorkspaceBriefing.tsx` | ChatApp "home screen" when no messages — greeting/memories/decisions/tasks/suggested prompts from `GET /api/workspaces/:id/context`. |

---

## (b) Shell / runtime — how the window manager, dock, and nav work

**There is no per-app route.** The window manager is `hooks/useWindowManager.ts`,
consumed by `Desktop.tsx`. App opening is keyed by `AppId`, **not** by URL.

### Window manager (`useWindowManager(workspaces, { defaultAutonomy })`)
- State: `windows: WindowState[]` (persisted to `localStorage` key
  `waggle-window-state-v1`, version-gated), `focusedInstanceId`, z-index counter,
  cascade counter.
- `WindowState` fields: `instanceId`, `appId`, `workspaceId?`, `workspaceName?`,
  `personaId?`/`personaLabel?`, `templateLabel?`, `initialMessage?`,
  `autonomyLevel?`/`autonomyExpiresAt?`, `zIndex`, `minimized`, `cascadeOffset`.
- **How apps open by appId:** `openApp(id: AppId)` — for non-chat apps it reuses an
  existing window of that appId (focus + un-minimize) or pushes a new `WindowState`;
  for chat it always allows multiples. `openChatForWorkspace(workspaceId, name?,
  personaOverride?, initialMessage?)` — reuses the workspace's existing chat window
  unless a `personaOverride` is given (deliberate second specialist); seeds per-window
  persona + inherited `defaultAutonomy`.
- Per-window controls: `setWindowPersona`, `setWindowAutonomy` (TTL auto-revert every
  10 s), `closeApp`, `minimizeApp`, `focusWindow`, `cycleWindowFocus` (Ctrl+`),
  `closeTopWindow`, `minimizeTopWindow`, `getWindowTitle`.
- Reconciliation: migrates restored chat windows off the `local-default` placeholder
  onto the first real workspace; never deletes windows for missing workspaces.
- Derived: `openAppIds`, `minimizedAppIds` (drive dock indicators).

### How `Desktop` renders a window
`appConfig: Record<string, {title, icon, pos, size}>` keyed by appId provides chrome
defaults. `renderAppContent(win: WindowState)` is a `switch (win.appId)` mapping each
appId to its component with props. Position resolved via `getSavedPosition(appId)`
(from `lib/window-positions.ts`) or `computeCascadePosition` (from
`lib/window-cascade.ts`). Cross-component `waggle:open-app` CustomEvent lets any
surface raise a window.

### Dock + nav (`Dock.tsx` + `lib/dock-tiers.ts`)
- `getDockForTier(tier: UserTier, billingTier: BillingTier)` returns a
  `DockEntry[]`, recursively filtered by `minBillingTier`.
- `DockEntry.type` ∈ `'app' | 'zone-parent' | 'separator'`. Zone-parents
  (`Ops`, `Extend`) open a `DockTray` flyout of child apps.
- `TIER_DOCK_CONFIG` defines docks per `UserTier` (`simple`/`professional`/`power`/
  `admin`; power===admin===`POWER_CONFIG`). `UserTier` is the **UI density tier**
  (from onboarding), distinct from the billing tier.
- Clicking a dock app calls `onOpenApp(id)` → `Desktop` routes `chat` to
  `openChatForWorkspace`, everything else to `openApp`.

### The two app-id unions (IMPORTANT for the refactor)
- **`AppId`** (canonical, in `lib/dock-tiers.ts`, re-exported from `Dock.tsx`) — 27
  ids: `chat, dashboard, memory, events, capabilities, connectors, cockpit,
  mission-control, settings, vault, profile, terminal, calculator, notes,
  waggle-dance, files, agents, scheduled-jobs, marketplace, voice, room, approvals,
  timeline, backup, telemetry, governance, launcher`. (`terminal`/`calculator`/`notes`
  are declared but have **no app component / appConfig entry** — dead ids.)
- **`AppView`** (legacy, in `lib/types.ts`) — only 8 ids: `chat, dashboard, memory,
  events, capabilities, cockpit, mission-control, settings`. **Stale/partial union,
  superseded by `AppId`.** Not used by the window manager. Flag for cleanup.

### Keyboard shortcuts (`hooks/useKeyboardShortcuts.ts`, wired in `Desktop`)
`onOpenApp`, `onToggleGlobalSearch` (Ctrl+K), `onTogglePersonaSwitcher`,
`onToggleWorkspaceSwitcher`, `onToggleKeyboardHelp`, `onCloseTopWindow`,
`onMinimizeTopWindow`, `onNewChatWindow`; plus Ctrl+` window cycle in the WM itself.

---

## (c) Data layer — adapter singleton, ServiceProvider, domain hooks

### `lib/adapter.ts` — `LocalAdapter` singleton (exported `adapter`)
The single HTTP/SSE gateway to the Fastify sidecar. All `fetch` go through
`adapter.fetch(path, init)` (adds base URL, auth token, content-type, 403/tier
handling). Base URL resolved from `getServerUrl()`. Full method → endpoint map
(grounded in line numbers in `adapter.ts`):

**Connection / system:** `connect()` (`/api/auth/session-token`, health),
`setServerUrl`/`getServerUrl`, `fetch`, `getSystemHealth` (`/api/health` via
`connect`), `connectWebSocket`.

**Workspaces / templates:** `getWorkspaces` `GET /api/workspaces`; `createWorkspace`
`POST /api/workspaces`; `updateWorkspace` `PUT /api/workspaces/:id`; `patchWorkspace`
`PATCH /api/workspaces/:id`; `deleteWorkspace` `DELETE`; `getWorkspaceContext`
`GET /api/workspaces/:id/context`; `getWorkspaceFiles` `…/files`; `getWorkspaceTemplates`
`GET /api/workspace-templates`; `createWorkspaceTemplate`/`updateWorkspaceTemplate`/
`deleteWorkspaceTemplate`; `generateTemplateFromPrompt` `…/generate`.

**Files / browse:** `browseLocal` `GET /api/browse/local`; `browseLocalMkdir`;
`listFiles` `…/files/list`; `uploadFile` `…/files/upload`; `downloadFile`;
`createDirectory` `…/files/mkdir`; `deleteFile`; `moveFile`; `copyFile`.

**Chat / sessions / history:** `sendMessage` (async generator over SSE) `POST /api/chat`;
`abortAgent` `POST /api/agent/abort`; `clearHistory` `DELETE /api/chat/history`;
`getHistory` `GET /api/history`; `getSessions` `…/sessions`; `createSession`;
`renameSession`; `deleteSession`; `searchSessions` `…/sessions/search`;
`exportSession` `…/sessions/:id/export`.

**Memory / KG / identity:** `getMemoryFrames` `GET /api/memory/frames`; `addMemoryFrame`;
`updateMemoryFrame`; `deleteMemoryFrame`; `incrementFrameAccess` `…/frames/:id/access`;
`searchMemory` `GET /api/memory/search`; `searchTeamMemory` `/api/team/memory/search`;
`getKnowledgeGraph` `GET /api/memory/graph`; `getMemoryStats` `/api/memory/stats`;
`getIdentity` `/api/identity`; `getMindIdentity`/`getMindAwareness`/`getMindSkills`
`/api/mind/*`.

**Agent / models / providers:** `getEvents` `GET /api/events`; `getTimeline` `/api/events`;
`subscribeEvents` SSE `/api/events/stream`; `getEventStats` `/api/events/stats`;
`getAgentStatus` `/api/agent/status`; `getAgentCost` `/api/agent/cost`; `setModel`/`getModel`
`/api/agent/model`; `getModels` `/api/litellm/models`; `getProviders` `/api/providers`;
`getLiteLLMStatus` `/api/litellm/status`; `getModelPricing` `/api/litellm/pricing`;
`getLocalInferenceHardware`/`-Models`/`-Status`/`pullLocalModel` `/api/local-inference/*`.

**Skills / capabilities / marketplace:** `getSkills` `/api/skills`; `createSkill`;
`getStarterPacks` `/api/skills/starter-pack/catalog`; `getCapabilityPacks`
`/api/skills/capability-packs/catalog`; `installPack` `/api/skills/starter-pack/:id`;
`getCapabilitiesStatus`/`getCapabilityStatus` `/api/capabilities/status`;
`getMarketplacePacks` `/api/marketplace/packs`; `searchMarketplace`/`getMarketplaceInstalled`/
`installMarketplacePackage`/`uninstallMarketplacePackage`/`installMarketplacePack`/
`uninstallMarketplacePack` `/api/marketplace/*`.

**Fleet / agents / groups / jobs:** `getFleet` `/api/fleet`; `fleetAction`
`/api/fleet/:ws/:action`; `spawnAgent` `/api/fleet/spawn`; `getPersonas`/`createPersona`/
`deletePersona`/`updatePersona`/`generatePersona` `/api/personas*`; `getAgentGroups`/
`createAgentGroup`/`deleteAgentGroup`/`updateAgentGroup`/`runAgentGroup` `/api/agent-groups*`;
`getJobStatus` `/api/jobs/:id`; `cancelJob` `…/cancel`.

**Cron:** `getCronJobs`/`createCronJob`/`updateCronJob`/`deleteCronJob`/`triggerCronJob`
`/api/cron*`.

**Notifications / approvals:** `subscribeNotifications` SSE `/api/notifications/stream`;
`getNotificationHistory`; `markNotificationRead`; `markAllNotificationsRead`;
`getPendingApprovals` `/api/approval/pending`; `respondApproval` `/api/approval/:id`;
`getApprovalGrants`/`revokeApprovalGrant`/`clearApprovalGrants` `/api/approval/grants*`;
`subscribeSubagentStatus` (SSE, drives Room); `subscribeHarvestProgress`.

**Settings / permissions / keys:** `getSettings`/`saveSettings` `/api/settings`;
`getPermissions`/`savePermissions` `/api/settings/permissions`; `testApiKey`
`/api/settings/test-key`.

**Connectors / vault / profile:** `getConnectors` `/api/connectors`; `getConnectorHealth`;
`connectConnector`/`disconnectConnector`; `getVault`/`addVaultSecret`/`deleteVaultSecret`
`/api/vault*`; `getProfile`/`updateProfile`/`analyzeWritingStyle`/`analyzeBrand`/
`researchProfile` `/api/profile*`.

**Team:** `teamConnect`/`teamDisconnect`/`getTeamStatus`/`getTeamMembers`/`getTeamActivity`/
`getTeamMessages` `/api/team/*`.

**Costs / telemetry:** `getCosts` `/api/costs`; `getCostByWorkspace`; `getCostSummary`
`/api/cost/summary`; `getTelemetryStatus`/`toggleTelemetry`/`clearTelemetry`/`trackTelemetry`
`/api/telemetry/*`.

**Billing / tier / data:** `syncStripeCheckout` `/api/stripe/sync`; `createCheckoutSession`
`/api/stripe/create-checkout-session`; `createPortalSession`; `getTier` `/api/tier`;
`startTrial` `/api/tier/start-trial`; `eraseData` `/api/data/erase`.

**Harvest / import:** `importPreview`/`importCommit` `/api/import/*`;
`harvestPreview`/`harvestCommit` `/api/harvest/*`; `getHarvestSources`; `scanClaudeCode`
`/api/harvest/scan-claude-code`; `extractHarvestIdentity`; `getLatestInterruptedHarvestRun`;
`resumeHarvestRun`; `abandonHarvestRun`; `removeHarvestSource`; `toggleHarvestAutoSync`.

**Wiki:** `getWikiPages`/`getWikiPage`/`getWikiPageContent`/`compileWiki`/`getWikiHealth`/
`getWikiWatermark`/`exportWikiToObsidian`/`exportWikiToNotion` `/api/wiki/*`.

**Compliance:** `getComplianceStatus`/`exportComplianceReportPdf`/`exportComplianceReport`/
`getComplianceInteractions`/`getComplianceModels`/`listComplianceTemplates`/
`createComplianceTemplate`/`updateComplianceTemplate`/`deleteComplianceTemplate` `/api/compliance/*`.

**Misc:** `getWeaverStatus` `/api/weaver/status`; `getAuditInstalls` `/api/audit/installs`;
`ingestFile` `/api/ingest`; `executeCommand` `/api/commands/execute`;
`getPins`/`addPin`/`removePin` `/api/workspaces/:id/pins*`; `getDocuments`/`getDocumentVersions`
`…/documents*`; `submitFeedback` `/api/feedback`; `getWaggleSignals`/`publishWaggleSignal`/
`acknowledgeWaggleSignal` `/api/waggle/signals*`; `subscribeWaggleDance` SSE `/api/waggle/stream`;
AI-OS tools: `detectTools` `/api/tools/detect`, `launchTool` `/api/tools/launch`,
`getToolProcesses` `/api/tools/processes`, `killTool` `/api/tools/kill`, `manageHooks`
`/api/tools/hooks`.

### `providers/ServiceProvider.tsx`
The only React provider for the adapter. Calls `adapter.connect()` on mount, exposes
`{ adapter, connected, connecting, error, reconnect }` via `useService()`. Note: most
hooks import `adapter` **directly** rather than via `useService` — context is mainly
for connection status.

### Domain hooks (`hooks/*`) — name → adapter methods / endpoints

| Hook | Returns / role | Adapter methods used |
|---|---|---|
| `useWorkspaces` | workspaces, activeWorkspace(Id), select/create/delete/patch, refresh | `getWorkspaces`, `createWorkspace`, `deleteWorkspace`, `patchWorkspace` |
| `useChat({workspaceId,sessionId,persona,autonomy})` | messages, isLoading, sendMessage, clearHistory, pendingApproval, approveAction | `getHistory`, `sendMessage` (SSE), `clearHistory`, `respondApproval` |
| `useSessions` | sessions, activeSessionId, create/delete/rename | `getSessions`, `createSession`, `deleteSession`, `renameSession` |
| `useMemory` | filtered frames, selectedFrame, filters, add/edit/delete/incrementAccess, stats | `getMemoryFrames`, `searchMemory`, `getMemoryStats`, `addMemoryFrame`, `updateMemoryFrame`, `deleteMemoryFrame`, `incrementFrameAccess` |
| `useKnowledgeGraph` | nodes, edges, scope (current/personal/all), refresh | `getKnowledgeGraph` |
| `useEvents` | steps, filter, autoScroll | `getEvents`, `subscribeEvents` (SSE) |
| `useAgentStatus` | model/tokens/cost/isActive/offline (polled, backoff) | `getAgentStatus` |
| `useNotifications` | notifications, unreadCount, markRead, markAllRead | `getNotificationHistory`, `subscribeNotifications` (SSE), `markNotificationRead`, `markAllNotificationsRead` |
| `useWaggleDance` | signals (filtered), allSignals, publish, acknowledge, refresh | `getWaggleSignals`, `subscribeWaggleDance` (SSE), `publishWaggleSignal`, `acknowledgeWaggleSignal` |
| `useRoomState` | per-workspace live/recent sub-agent map, totalLive | `subscribeSubagentStatus` (SSE) → `lib/room-state-reducer.ts` |
| `useProviders` | providers, models, search providers, available/active models | `getProviders` |
| `useBilling` | tier, refreshTier, syncAfterCheckout, startCheckout, openPortal | `getTier`, `syncStripeCheckout`, `createCheckoutSession`, `createPortalSession` |
| `useFeatureGate` | planTier, isEnabled(feature), gate(feature) | (none; reads `useOnboarding` + `lib/feature-gates`) |
| `useOnboarding` | onboarding state (localStorage `waggle:onboarding`), update/complete/reset/replayTour | `getWorkspaces` (returning-user auto-complete) + tauri-bindings |
| `useOverlayState` | all overlay open/close flags + toggles | (none; pure UI state) |
| `useWindowManager` | window list + all window ops (see §b) | (none; localStorage only) |
| `useEvents`/`useSessions`/`useMemory` etc. are workspace-scoped | | |
| `useKeyboardShortcuts` | binds global hotkeys to callbacks | (none) |
| `useDockLabels`, `useDockNudge` | dock label visibility + milestone nudges | (none / local) |
| `useDeveloperMode`, `useIsLightTheme`, `useOfflineStatus`, `useContainerWidth`, `useFocusTrap`, `use-mobile`, `use-toast` | UI/utility hooks | (none) |

`lib/` also holds many **pure helper + state modules** (most with co-located `.test.ts`):
`brain-health`, `briefing-highlights`, `browse-breadcrumbs`, `chat-header-layout`,
`context-rail-fetch`, `cron-presets`, `dedupe-packs`, `dock-labels`, `dock-nudge`,
`feature-gates`, `fetch-utils`, `fuzzy-match`, `login-briefing(-brag)`,
`memory-recall-toast`, `modal-drag`, `onboarding-skip`, `onboarding-tier-filter`,
`persona-tier`, `persona-tooltip`, `persona-display`, `personas`, `posthog`, `providers`,
`render-markdown`, `room-state-reducer`, `settings-tier-filter`, `shape-selection`,
`skill-pack-display`, `skill-recommendations`, `spawn-agent-helpers`, `status-bar-focus`,
`suggested-actions`, `tauri-bindings`, `timeline-events`, `tiers`, `utils`,
`waggle-signals`, `window-cascade`, `window-positions`, `workspace-briefing-state`,
`workspace-groups`, `kg-export`, `launcher-prompt-args`, `context-menu-index`,
`decode-entities`.

---

## (d) `lib/types.ts` — exported types

Type aliases / unions: `AppView` (legacy 8-id, stale — see §b), `StorageType`,
`TemplateCategory`, `ContentBlock` (union).

Interfaces: `StorageConfig`, `Workspace`, `FileEntry`, `WorkspaceTemplate`,
`WorkspaceContext`, `ChatMessage`, `ToolExecution`, `ApprovalRequest`, `MemoryFrame`,
`AgentStep`, `TimelineEvent`, `TextContentBlock`, `StepContentBlock`,
`ToolUseContentBlock`, `ModelSwitchContentBlock`, `ErrorContentBlock`, `Session`,
`SkillPack`, `FleetSession`, `CronJob`, `Notification`, `AgentStatus`, `Persona`
(incl. `tagline`/`bestFor`/`wontDo`/`isReadOnly`), `SystemHealth`, `Connector`,
`StreamEvent`, `Settings`, `KGNode`, `KGEdge`, `ModelPricing`, `WaggleSignal`.

Notable type sources **outside** `types.ts`: `AppId`/`UserTier`/`BillingTier`/
`DockEntry` in `lib/dock-tiers.ts`; `WindowState`/`AutonomyLevel` in
`hooks/useWindowManager.ts`; `OnboardingState` in `hooks/useOnboarding.ts`;
`PlanTier`/`FeatureGate` in `lib/feature-gates.ts`; `Provider`/`ProviderModel`/
`SearchProvider` in `hooks/useProviders.ts`; `RoomAgent`/`WorkspaceAgents` in
`lib/room-state-reducer.ts`; `ContextRailTarget` in `overlays/ContextRail.tsx`.

---

## (e) Design-system primitives — `components/ui/*` (shadcn/ui, ~50)

Standard shadcn/ui set: `accordion, alert, alert-dialog, aspect-ratio, avatar, badge,
breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command,
context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label,
menubar, navigation-menu, pagination, popover, progress, radio-group, resizable,
scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table,
tabs, textarea, toast, toaster, toggle, toggle-group, tooltip`. Waggle-specific addition:
`hint-tooltip.tsx` (`HintTooltip`, used across StatusBar/AppWindow). Toast plumbing
duplicated in both `components/ui/use-toast.ts` and `hooks/use-toast.ts`. Theming via
`waggle-theme.css` + `index.css` (Hive DS semantic tokens: honey/hive-950/accent;
`data-theme` on `<html>` toggles dark/light, observed by `Desktop`). Also
`components/NavLink.tsx` (single router NavLink, near-unused given single-route app).

---

## (f) Current apps → new IA buckets (PRD §10)

PRD IA layers: Global, Work (10.2), Intelligence (10.3), Extend (10.4), Team (10.5),
System (10.6). Mapping the existing apps/surfaces to the locked Work / Intelligence /
Extend / Team / System buckets:

| Bucket (PRD) | Existing apps / surfaces |
|---|---|
| **Global** (cross-cutting) | `GlobalSearch` (Ctrl+K), `NotificationInbox`, `StatusBar`, `Dock`, `BootScreen`, `LoginBriefing`, `OnboardingWizard`/`Tooltips`. |
| **Work** | `DashboardApp` (Home Cockpit/Workspaces), `ChatApp`/`ChatWindowInstance` + `WorkspaceBriefing` (Sessions), `MemoryApp` (Memory: Timeline/Graph/Harvest/Weaver/Wiki), `FilesApp(Tabs)` (Artifacts), `TimelineApp`, `EventsApp` (session/agent activity), `WorkspaceSwitcher`/`CreateWorkspaceDialog`. |
| **Intelligence** | `AgentsApp` (+`agents/` + `PersonaSwitcher` + `SpawnAgentDialog`) = Agents; `CapabilitiesApp` (Skills); `ScheduledJobsApp` (Automations); `RoomApp` + `MissionControlApp` + `WaggleDanceApp` (multi-agent orchestration); `MemoryApp → Evolution tab` (traces/evolutions); `ApprovalsApp` (agent governance/decisions). |
| **Extend** | `ConnectorsApp` (Connectors + MCP catalog), `MarketplaceApp` + `CapabilitiesApp` marketplace section (Marketplace), `LauncherApp` (External tools), `ModelSelector`/`ModelPilotCard` + Settings→Models (Models). |
| **Team** | `TeamGovernanceApp` (members/roles), `searchTeamMemory` surface (shared memory), Settings→Team tab, `CockpitApp → ComplianceDashboard` (activity/audit). |
| **System** | `SettingsApp` (8 tabs: General/Models/Billing/Permissions/Team/Backup/Enterprise/Advanced), `VaultApp` (Security/secrets), `UserProfileApp` (Profile), `BackupApp` (Backup/restore + data), `TelemetryApp` (usage), `EraseDataDialog` (data deletion), `UpgradeModal`/`TrialExpiredModal` (Billing/plan). |

**Refactor-relevant observations** (grounded, for downstream planners):
- The product is a **single-route windowed desktop**, not a navigable app. The new IA's
  Work/Intelligence/Extend/Team/System "layers" must be expressed through the existing
  **dock zones** (`dock-tiers.ts` `zone-parent` model) + window manager, not new routes.
- **Dual app-id union drift**: `AppId` (27, canonical) vs `AppView` (8, stale in
  `types.ts`). The refactor should consolidate on `AppId`; `AppView` and the dead ids
  `terminal`/`calculator`/`notes` are cleanup candidates.
- **Marketplace is doubly represented** (standalone `MarketplaceApp` with no dock entry +
  a section inside `CapabilitiesApp`) — IA cleanup point.
- **`UserTier` (UI density: simple/professional/power/admin) ≠ `BillingTier`
  (FREE/TRIAL/PRO/TEAMS/ENTERPRISE) ≠ `PlanTier` (solo/teams/business/enterprise in
  feature-gates).** Three overlapping tier vocabularies the new IA gating will have to
  reconcile.
- Adapter is a fat single file (`lib/adapter.ts`, ~1930 lines, ~150 methods) and is the
  one contract surface to the sidecar — new PRD §16 endpoints get added here.
