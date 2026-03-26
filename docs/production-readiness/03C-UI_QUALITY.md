# Phase 3C: UI & Frontend Code Quality Audit

**Auditor**: Senior Engineer Code Review (automated)
**Date**: 2026-03-20
**Scope**: `app/src/` (Tauri desktop app) + `packages/ui/src/` (shared React component library)
**Mode**: READ-ONLY

---

## Summary Counts

| Metric | Count |
|--------|-------|
| Total `any` type usages | 20 (11 in app/src, 9 in packages/ui/src) |
| Total inline styles | 29 (13 in app/src, 16 in packages/ui/src) |
| Error boundaries | 0 |
| Effects without cleanup (where cleanup is needed) | 5 |
| `React.memo` usage | 0 |
| `React.lazy` / code splitting | 0 |
| ESLint rule suppressions | 5 |
| Dead/orphaned files | 5 |
| Duplicate SSE connections | 2 (same endpoint) |

---

## Findings

### CQ-001: Zero Error Boundaries
- **Severity**: CRITICAL
- **Package**: app + @waggle/ui
- **File**: app/src/App.tsx (entire tree)
- **Issue**: No `ErrorBoundary` or `componentDidCatch` exists anywhere in the app or UI library. The entire component tree is unwrapped. A single uncaught render error in any view (Chat, Cockpit, Memory, Capabilities, MissionControl, Settings) will crash the entire application to a white screen.
- **Impact**: In production, any rendering error (bad API response shape, undefined property access in JSX) will take down the whole desktop app. Users lose all context with no recovery path.
- **Fix**: Add error boundaries at the view level (wrapping each `<ChatView>`, `<CockpitView>`, etc.) and at the root level in `App()`. Each boundary should render a fallback UI with a "Retry" button.

### CQ-002: Duplicate SSE Connections to Same Endpoint
- **Severity**: HIGH
- **Package**: @waggle/ui
- **File**: packages/ui/src/hooks/useNotifications.ts:46, packages/ui/src/hooks/useSubAgentStatus.ts:55
- **Issue**: Both `useNotifications` and `useSubAgentStatus` open independent `EventSource` connections to the exact same endpoint (`/api/notifications/stream`). This doubles the number of persistent HTTP connections per client.
- **Impact**: Wastes server resources (2x SSE connections per client). Under load or on constrained networks, this halves available connections. Browser SSE connection limits (6 per domain in some browsers) are consumed faster.
- **Fix**: Create a single shared SSE connection hook (e.g., `useSSEStream`) that multiplexes events to multiple subscribers. Both `useNotifications` and `useSubAgentStatus` should subscribe to the shared connection.

### CQ-003: No Code Splitting or Lazy Loading
- **Severity**: HIGH
- **Package**: app
- **File**: app/src/App.tsx, app/vite.config.ts
- **Issue**: All 7 views (Chat, Memory, Events, Capabilities, Cockpit, MissionControl, Settings) are eagerly imported. No `React.lazy()` or `Suspense` is used anywhere. The Vite config has no `manualChunks` configuration in `rollupOptions`. The `CapabilitiesView` alone is 1227 lines. `CockpitView` imports 10 sub-components eagerly.
- **Impact**: The initial bundle includes all views and their dependencies, increasing initial load time. Views like MissionControl and Capabilities that users may rarely visit are loaded upfront.
- **Fix**: Wrap non-default views with `React.lazy()` + `Suspense`. Add `manualChunks` to `vite.config.ts` to split vendor code (marked, DOMPurify) from app code. At minimum, lazy-load Capabilities, MissionControl, Cockpit, and Settings views.

### CQ-004: Monolithic App Component (~1300 lines, 30+ useState calls)
- **Severity**: HIGH
- **Package**: app
- **File**: app/src/App.tsx:87-1290
- **Issue**: `WaggleApp` is a single component with ~30 `useState` hooks, ~15 `useEffect` hooks, and ~20 `useCallback` hooks. It manages team messages, notifications, toasts, agent status, offline status, personas, workspace context, file drops, approval gates, slash commands, keyboard shortcuts, tab management, sessions, memory, events, and more -- all in one function body.
- **Impact**: Any state change triggers reconciliation of the entire component. Difficult to test individual concerns. High cognitive load for maintenance. Makes it impossible to optimize re-renders without major refactoring.
- **Fix**: Extract logical domains into custom hooks or sub-providers: `useTeamState()`, `useAgentStatus()`, `useOfflineStatus()`, `useSlashCommands()`, `useFileHandling()`. Consider a state management solution (Zustand is lightweight and fits) to share state without prop drilling through the 1300-line component.

### CQ-005: Zero React.memo Usage Across Entire Codebase
- **Severity**: MEDIUM
- **Package**: app + @waggle/ui
- **File**: all components
- **Issue**: Not a single component uses `React.memo()`. Given the monolithic `WaggleApp` component, every state change (e.g., toast notification, agent token count update from polling) causes React to re-render and diff the entire component tree including ChatView, ContextPanel, AppSidebar, StatusBar, and all their children.
- **Impact**: Unnecessary re-renders on every 15s offline poll, 30s agent status poll, 30s team message poll, and every SSE notification. On complex views (Capabilities with 100+ packages, Memory with frames, Chat with long message lists), this causes visible jank.
- **Fix**: Apply `React.memo()` to leaf components that receive stable props: `ToolCard`, `ChatMessage`, `SessionCard`, `AgentFleetCard`, `ToastItem`, `StatusBar`. The `ChatView` and `ContextPanel` are also good candidates since they receive many callbacks wrapped in `useCallback`.

### CQ-006: Unsafe `as any` Casts for Team Adapter Methods
- **Severity**: HIGH
- **Package**: app
- **File**: app/src/App.tsx:910, 916, 921, 926
- **Issue**: Team-related adapter methods are called via `(adapter as any).getTeamStatus()`, `(adapter as any).connectTeam()`, `(adapter as any).disconnectTeam()`, and `(adapter as any).listTeams()`. These methods are not on the `WaggleService` type interface but are called through an `any` cast with no runtime type checking.
- **Impact**: If the adapter implementation changes or these methods are removed, TypeScript won't catch it. Runtime errors will be silently swallowed (caught by empty catches). The team connection feature could silently break without any indication.
- **Fix**: Add `getTeamStatus`, `connectTeam`, `disconnectTeam`, and `listTeams` to the `WaggleService` interface (or a `TeamService` extension interface) so TypeScript can verify the contract. If these are optional features, use a type guard or feature-detection pattern instead of `as any`.

### CQ-007: Dead Code — Orphaned Legacy Components
- **Severity**: MEDIUM
- **Package**: app
- **File**: app/src/components/chat/ChatView.tsx, app/src/hooks/useChat.ts, app/src/hooks/useSidecar.ts, app/src/components/layout/Sidebar.tsx, app/src/components/layout/TitleBar.tsx, app/src/components/onboarding/OnboardingWizard.tsx
- **Issue**: Multiple files are never imported by the active application:
  - `app/src/components/chat/ChatView.tsx` — legacy chat view (replaced by `app/src/views/ChatView.tsx` which uses `@waggle/ui`)
  - `app/src/hooks/useChat.ts` — legacy chat hook using old `ipc.sendMessage()` (only imported by the orphaned ChatView above)
  - `app/src/hooks/useSidecar.ts` — legacy service connection hook (replaced by `ServiceProvider`)
  - `app/src/components/layout/Sidebar.tsx` — legacy sidebar (replaced by `AppSidebar`)
  - `app/src/components/layout/TitleBar.tsx` — legacy title bar
  - `app/src/components/onboarding/OnboardingWizard.tsx` — legacy onboarding (replaced by `@waggle/ui`'s `OnboardingWizard`)
  - `app/src/components/settings/SettingsPanel.tsx` — legacy settings (M1-era, uses old `ipc` API; the active `SettingsView` imports from `@waggle/ui`)
- **Impact**: Increases bundle size, confuses developers about which components are canonical, and the dead `ipc`-based code references API patterns that no longer exist. The legacy `SettingsPanel` stores API keys in plaintext via `/api/settings` instead of the vault.
- **Fix**: Delete the 7 orphaned files. They are M1/M2-era relics superseded by the `@waggle/ui` component library.

### CQ-008: useTeamActivity Fetcher Not Stable — Causes Re-renders
- **Severity**: MEDIUM
- **Package**: @waggle/ui
- **File**: packages/ui/src/hooks/useTeamActivity.ts:31-49
- **Issue**: `fetchActivity` is defined as a plain `async function` inside the component body (not wrapped in `useCallback`). It is then called inside a `useEffect` that lists `[baseUrl, teamId, limit]` as dependencies, but the function itself is recreated on every render. The effect works because it captures the function by closure, but the `fetchActivity` function returned as `refresh` from the hook will be a new reference on every render, causing re-renders in any consumer that uses it in a dependency array.
- **Impact**: Any component using the `refresh` callback in a dependency array or passing it as a prop will re-render on every cycle. Minor performance issue but indicates a pattern inconsistency.
- **Fix**: Wrap `fetchActivity` in `useCallback` with `[baseUrl, teamId, limit]` as dependencies, matching the pattern used in `useTeamPresence`.

### CQ-009: Missing Race Condition Guard in useChat History Load
- **Severity**: MEDIUM
- **Package**: @waggle/ui
- **File**: packages/ui/src/hooks/useChat.ts:151-178
- **Issue**: When session/workspace changes, the effect loads history via `service.getHistory()`. While `abortRef.current = true` is set at the top of the effect to abort in-flight streams, the history load itself is not guarded by a cancellation flag. If a user rapidly switches sessions, completed history loads from a prior session could overwrite messages for the current session.
- **Impact**: When rapidly switching between sessions, messages from the wrong session could briefly appear, creating confusion. The `setMessages` call at line 162 could apply stale data.
- **Fix**: Add a `cancelled` flag (like `useMemory` does) and check it before calling `setMessages` in the `.then()` callback. Return a cleanup function that sets `cancelled = true`.

### CQ-010: ESLint Exhaustive-Deps Suppressions Hiding Bugs
- **Severity**: MEDIUM
- **Package**: app + @waggle/ui
- **File**: app/src/App.tsx:402, app/src/App.tsx:774, packages/ui/src/hooks/useWorkspaces.ts:60, packages/ui/src/hooks/useSessions.ts:76
- **Issue**: Five `eslint-disable-line react-hooks/exhaustive-deps` comments suppress dependency warnings. Notable cases:
  - App.tsx:402 — `checkPending` effect has empty deps `[]` but references `setMessages` and `SERVER_BASE`. While `setMessages` is stable (from useState), the pattern hides the dependency on `SERVER_BASE`.
  - App.tsx:774 — Keyboard handler effect is missing `handleNewTab` from dependencies. If `handleNewTab` changes (e.g., new workspace selected), the keyboard shortcut will use stale data.
  - useWorkspaces.ts:60 — Missing `activeId` dependency. Intentional (to avoid re-fetching when active changes) but the lint suppression hides the rationale.
- **Impact**: Stale closures in keyboard handlers and startup effects. The keyboard shortcut handler (Cmd+T for new tab) may operate on a stale workspace reference.
- **Fix**: For App.tsx:774, add `handleNewTab` to the dependency array. For App.tsx:402, the empty deps are intentional (run once on mount) but should use a ref for `SERVER_BASE` or document the intentionality with a comment. For useWorkspaces.ts:60, document why `activeId` is excluded.

### CQ-011: setTimeout Without Cleanup in SettingsPanel and ChatMessage
- **Severity**: LOW
- **Package**: app + @waggle/ui
- **File**: app/src/components/settings/SettingsPanel.tsx:25, packages/ui/src/components/chat/ChatMessage.tsx:136
- **Issue**: Both files use `setTimeout` outside of `useEffect`, meaning there is no cleanup mechanism:
  - `SettingsPanel.tsx:25`: `setTimeout(() => setSaved(false), 2000)` — called in an event handler, not in an effect. If the component unmounts within 2 seconds (user navigates away), React will warn about updating state on an unmounted component.
  - `ChatMessage.tsx:136`: `setTimeout(() => setCopied(false), 1500)` — same pattern in a click handler.
- **Impact**: React "Can't perform a React state update on an unmounted component" warnings in the console. Not a memory leak per se, but indicates sloppy lifecycle management. In production with React strict mode, this produces visible console noise.
- **Fix**: Use a ref to track mounted state, or use `useEffect` with cleanup for timer-based state resets. Alternatively, use a custom `useTimeout` hook that auto-cleans up.

### CQ-012: Tauri Event Listener Cleanup Race Condition
- **Severity**: MEDIUM
- **Package**: app
- **File**: app/src/App.tsx:214-265
- **Issue**: The Tauri event listeners are registered asynchronously inside an IIFE within `useEffect`. The cleanup function `listeners.forEach(unlisten => unlisten())` runs synchronously when the component unmounts. However, if the component unmounts before the `await listen(...)` calls complete, the listeners will be pushed to the `listeners` array after cleanup has already run, leaving dangling event listeners.
- **Impact**: If the component unmounts and remounts quickly (e.g., during hot reload or React strict mode double-render), Tauri event listeners may accumulate. The `waggle://quit` listener could fire multiple times. In production with stable mounts this is unlikely, but it is architecturally unsound.
- **Fix**: Add a `cancelled` flag. Check `cancelled` before pushing to `listeners`. In the cleanup, both set `cancelled = true` and iterate existing listeners. Alternatively, use an AbortController pattern.

### CQ-013: `useActiveWorkspace` Hook Exported But Never Used
- **Severity**: LOW
- **Package**: @waggle/ui
- **File**: packages/ui/src/hooks/useActiveWorkspace.ts
- **Issue**: This hook is exported from `packages/ui/src/index.ts` but never imported by any consumer. The `app/src/App.tsx` manages active workspace state directly via `useWorkspaces` which returns `activeWorkspace` and `setActiveWorkspace`.
- **Impact**: Dead code in the published package. Increases bundle size marginally and adds confusion about which hook to use for workspace selection.
- **Fix**: Either remove the hook and its export, or refactor `App.tsx` to use it (consolidating workspace selection logic).

### CQ-014: SessionList Debounce Timer Not Cleaned Up on Unmount
- **Severity**: LOW
- **Package**: @waggle/ui
- **File**: packages/ui/src/components/sessions/SessionList.tsx:42-53
- **Issue**: The `debounceRef` stores a setTimeout reference for search debouncing. While individual timeouts are cleared when new input arrives (line 47), there is no `useEffect` cleanup to clear the pending timeout if the component unmounts while a search is pending.
- **Impact**: If the user types a search query and immediately switches views (unmounting SessionList), the debounced `onSearch` callback will fire after unmount, potentially causing a state update on an unmounted component.
- **Fix**: Add a `useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); }, [])` cleanup.

### CQ-015: Inline Styles for Dynamic CSS Variables
- **Severity**: LOW
- **Package**: app + @waggle/ui
- **File**: app/src/App.tsx:1106, app/src/providers/ServiceProvider.tsx:60-107, packages/ui/src/components/chat/ToolCard.tsx:270, packages/ui/src/components/ToastContainer.tsx:60-62
- **Issue**: 29 inline `style={}` usages across the codebase. Most are in `ServiceProvider.tsx` (loading/error screens use pure inline styles instead of Tailwind classes). The `ToolCard` uses inline styles for transition animations. `ToastContainer` uses inline styles for dynamic border colors.
- **Impact**: Inline styles bypass the Tailwind design system, create inconsistent styling patterns, and cannot be easily themed. The ServiceProvider loading/error screens look visually disconnected from the rest of the app.
- **Fix**: Replace inline styles with Tailwind classes where possible. For dynamic values (workspace hue, toast border color), use CSS custom properties set via `style` combined with Tailwind classes that reference them. The ServiceProvider loading/error screens should use the same Tailwind classes as the rest of the app.

### CQ-016: `err: any` Catches Instead of `unknown`
- **Severity**: LOW
- **Package**: app + @waggle/ui
- **File**: app/src/providers/ServiceProvider.tsx:46, packages/ui/src/components/settings/TeamSection.tsx:42,55, packages/ui/src/components/onboarding/steps/ReadyStep.tsx:102,136
- **Issue**: Five catch clauses use `catch (err: any)` instead of `catch (err: unknown)` with proper type narrowing. This bypasses TypeScript's strict checking within the catch block.
- **Impact**: Minor type safety gap. Any property access on `err` is unchecked, so accessing `err.message` on a non-Error throw would silently produce `undefined` instead of failing at compile time.
- **Fix**: Change to `catch (err: unknown)` and use `err instanceof Error ? err.message : String(err)` pattern (already used elsewhere in the codebase).

### CQ-017: Module-Level Singleton State Outside React
- **Severity**: LOW
- **Package**: app + @waggle/ui
- **File**: app/src/App.tsx:61-62, packages/ui/src/hooks/useSubAgentStatus.ts:37, packages/ui/src/hooks/useChat.ts:29
- **Issue**: Three module-level singletons exist:
  - `adapter` (App.tsx:62) — single `LocalAdapter` instance created at module load time
  - `dismissedPatterns` (useSubAgentStatus.ts:37) — `Set<string>` shared across all hook instances
  - `messageIdCounter` (useChat.ts:29) — global counter for message IDs
- **Impact**: In testing or SSR contexts, these singletons persist across renders/tests. The `dismissedPatterns` set grows unboundedly throughout the app's lifetime (minor memory concern). The `adapter` being module-level means it cannot be reconfigured without a page reload.
- **Fix**: For `adapter`, this is acceptable for a desktop app (single instance). For `dismissedPatterns`, consider a WeakMap or periodic cleanup. For `messageIdCounter`, the pattern is safe but could use `crypto.randomUUID()` for test isolation.

### CQ-018: `CapabilitiesView` is 1227 Lines — Needs Decomposition
- **Severity**: MEDIUM
- **Package**: app
- **File**: app/src/views/CapabilitiesView.tsx (1227 lines)
- **Issue**: This single component contains the Packs tab, Marketplace tab (with search/filter/sort), Individual Skills tab (with create-skill form), all the fetching logic, install/uninstall handlers, bulk install progress tracking, and community pack management. It has 20+ `useState` calls, 10+ `useCallback` hooks, and embeds the entire Create Skill form inline.
- **Impact**: Difficult to test individual features. Very high cognitive load. Any change to marketplace search risks breaking pack install logic. The component cannot be code-split below the view level.
- **Fix**: Extract into sub-components: `PacksTab`, `MarketplaceTab`, `SkillsTab`, `CreateSkillForm`. Extract data-fetching into custom hooks: `useCapabilityPacks()`, `useMarketplace()`, `useCommunityPacks()`.

### CQ-019: Notifications Converted to Toasts Without Deduplication
- **Severity**: LOW
- **Package**: app
- **File**: app/src/App.tsx:195-208
- **Issue**: The effect that converts notifications to toasts uses `notifications.length === 0` as a guard and always takes `notifications[0]` (the latest). However, the `notifications` array from `useNotifications` accumulates up to 50 items. If the `notifications` state reference changes (even without new items), the effect could fire again and create a duplicate toast from the same notification.
- **Impact**: Potential duplicate toasts if the notifications array reference changes without content changes. The `Math.random()` in the toast ID prevents deduplication.
- **Fix**: Track the last-processed notification timestamp or ID in a ref. Only create a toast if the latest notification is newer than the last-processed one.

### CQ-020: `fetchActivity` in `useTeamActivity` Causes Re-render Loop Risk
- **Severity**: LOW
- **Package**: @waggle/ui
- **File**: packages/ui/src/hooks/useTeamActivity.ts:51-53
- **Issue**: The `useEffect` at line 51 has `[baseUrl, teamId, limit]` in its dependency array, but it calls `fetchActivity()` which is a plain function (not memoized). ESLint would flag `fetchActivity` as a missing dependency, but the lint rule isn't running. The function works correctly because it captures `baseUrl`, `teamId`, `limit` from closure, but the pattern is fragile and inconsistent with other hooks that use `useCallback` for fetch functions.
- **Impact**: Functional but violates the established pattern. If someone adds `fetchActivity` to the dependency array (following the pattern from `useTeamPresence`), it would cause an infinite re-render loop since `fetchActivity` is recreated every render.
- **Fix**: Wrap `fetchActivity` in `useCallback` with `[baseUrl, teamId, limit]` dependencies and add it to the effect's dependency array.

---

## Overall Frontend Quality Assessment

### Strengths

1. **TypeScript strict mode is ON** in both `app/tsconfig.json` and `packages/ui/tsconfig.json`. The `strict: true`, `noUnusedLocals: true`, and `noUnusedParameters: true` flags are all enabled. This is excellent.

2. **Effect cleanup is generally well-handled.** Most `setInterval`, `addEventListener`, and `EventSource` usages have proper cleanup in their `useEffect` return functions. The `useTeamPresence`, `useNotifications`, `useSubAgentStatus`, `useSessions`, `useMemory`, `useWorkspaces`, and keyboard handler effects all clean up correctly.

3. **Hooks extract testable pure functions.** `useChat` exports `processStreamEvent()`, `useMemory` exports `executeMemorySearch()`, `useKnowledgeGraph` extracts `toKGData()`. This pattern enables unit testing without React.

4. **`useCallback` usage is thorough.** The codebase uses `useCallback` extensively for event handlers passed as props — ~72 occurrences across app/src alone. This prevents unnecessary re-renders in child components (though the benefit is limited without `React.memo`).

5. **Race condition guards exist in key hooks.** `useMemory`, `useSessions`, `useWorkspaces`, and `ServiceProvider` all use `cancelled` flags to prevent state updates after unmount.

6. **Accessibility basics are present.** ARIA roles (`role="tablist"`, `role="tab"`, `aria-selected`, `role="dialog"`, `aria-modal`, `role="listbox"`, `role="option"`) are used in Modal, CommandPalette, CapabilitiesView tabs, and similar interactive components.

7. **Key props on lists are correct.** All `.map()` calls that render JSX use appropriate `key` props (workspace IDs, session IDs, pack slugs, package IDs, etc.). No index-only keys on dynamic lists.

8. **Sanitization is present.** Markdown rendering in `ChatMessage` uses `DOMPurify.sanitize()` on the output of `marked.parse()`, preventing XSS through user/agent messages.

### Weaknesses

1. **No error boundaries** — the single most critical gap. A rendering error anywhere crashes the entire app.

2. **No `React.memo`** — combined with the monolithic App component, this means every poll interval (15s, 30s) and every SSE event causes a full tree reconciliation.

3. **No code splitting** — all views are eagerly loaded. For a desktop app this is less critical than web, but it still impacts cold start time.

4. **State management is all local** — 30+ useState calls in one component with prop drilling through 5 levels. No state management library or context splitting.

5. **Dead code accumulation** — 7 orphaned files from earlier milestones remain in the tree.

### Risk Rating

| Category | Rating |
|----------|--------|
| Crash resilience | POOR (no error boundaries) |
| Performance | FAIR (no memoization, no splitting, but app is desktop-bound) |
| Type safety | GOOD (strict mode, limited `any` usage) |
| Memory leak risk | GOOD (cleanup patterns are solid) |
| Maintainability | FAIR (monolithic App, large views, but hooks are well-structured) |
| Security (XSS) | GOOD (DOMPurify in place) |

**Overall: FAIR** — The codebase has solid foundations (TypeScript strict, effect cleanup, sanitization) but lacks production hardening (error boundaries, performance optimization, code splitting). The most urgent fix is adding error boundaries to prevent white-screen crashes.
