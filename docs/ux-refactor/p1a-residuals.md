# P1a Conversion — Review Residuals (2026-06-10)

Source: adversarial review workflow over 93c7dd0..a6dc2e4 (30 raw findings; 7 confirmed -> fixed in 4e1d763; 6 refuted; 17 LOW unverified, listed here for P7/backlog triage).

## LOW findings (unverified — triage in P7 Hardening)

- [ ] Acceptance check 1's literal grep is not zero: legacy zIndex/cascadeOffset parsing survives in the migration module (plan-internal inconsistency, undocumented residual)
- [ ] Shim does not runtime-guard event input: unknown appId navigates to '/undefined', and routeFor('backup') + queryString can compose a malformed double-'?' URL
- [ ] Onboarding-finish drops the wizard-supplied workspaceName — transiently re-opens the exact race the old handler's bug #4/#8 fix existed for
- [ ] ChatHost keep-alive set is append-only — deleted/nonexistent workspace ids keep a hidden live ChatWindowInstance, portal container, and persisted chat entry forever
- [ ] Autonomy auto-revert has no mount-time check — an already-expired elevated grant is honored for up to 10s after a widget mounts, and sits un-reverted in storage for never-mounted workspaces
- [ ] loadChatEntries returns a fresh object per call when localStorage is unavailable — unstable useSyncExternalStore snapshot (infinite-render class) in no-storage environments
- [ ] Settings dock-labels toggle (M-19/UX-4) is now inert — its only renderer died with Dock.tsx
- [ ] Offline guidance banner lost — only the compact StatusBar icon remains
- [ ] routeFor('backup') composes a malformed double-? URL if a deep link ever carries a tab
- [ ] StatusBar breadcrumb is blank on routed surfaces with no nav entry (e.g. /settings/profile), where the old shell showed the window title
- [ ] Stale dock-era copy in untouched overlays: KeyboardShortcutsHelp says Ctrl+Shift+0 opens 'Dashboard' (killed), tooltips say 'Click dock icons'
- [ ] Files workspace selection lost its session stickiness — resets to the active workspace on every nav re-entry
- [ ] Duplicate 10s autonomy auto-revert intervals (one per useChatWidgetState call site), including one keyed 'local-default'
- [ ] getSnapshot returns a fresh object identity per call when localStorage is unavailable — useSyncExternalStore infinite-render risk in storage-less environments
- [ ] Keep-alive structures never prune: visited[] + module-level containers Map keep full chat runtimes (SSE/polling/intervals) alive for deleted workspaces, with no close affordance
- [ ] routeFor('backup') already embeds '?tab=backup'; shim appends a second '?' if a tab-carrying dispatch ever targets it
- [ ] WorkspaceRoute.onTabChange pushes duplicate history entries on same-tab clicks and drops query params on tab switches

## Refuted at review (no action — recorded so they are not re-found)

- Shim re-dispatch is a double-rAF timing heuristic that can fire before the target route commits under startTransition — silently drops the UserProfileApp deep link (acceptance check 3, second half)
- IndexRedirect consumes the one-shot salvaged route inside a useState initializer — impure render that silently burns the salvage under StrictMode double-invoke or a discarded concurrent render
- waggle:open-app shim's double-rAF re-dispatch is a timing guess — under v7_startTransition the target route may not be committed yet, silently dropping the live-listener deep link (acceptance check 3)
- PersonaSwitcher lost the only path that clears a workspace's agent-group (agentGroupId can now never be unset)
- Playwright e2e/vision suites still target the retired dock/desktop shell — flip shipped without re-establishing their coverage
- Shim's double-rAF re-dispatch is a timing heuristic that can fire before the target route commits — Identity-tab deep link (acceptance check 3) silently lost

## Known follow-ups owned elsewhere

- tests/e2e + tests/vision Playwright suites partially retargeted (phase-ab-verification.spec.ts done in 4e1d763); full sweep of remaining dock-era specs = P7.
- package-lock.json sync deferred to a Linux-side regen (Windows regen drops 20 linux/darwin optional entries) — pre-existing, tracked since 0601_s3.
- Killed AppId FILES (DashboardApp/VoiceApp/MissionControlApp/BackupApp) still on disk per plan §5.3.4 — separate dead-code commit.
