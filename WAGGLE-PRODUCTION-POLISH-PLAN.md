# Waggle OS — Production Polish Master Plan
## From Pre-Production to Shippable: Solo & Teams Tiers
**Prepared for:** Marko Marković, Partner — Egzakta Group
**Date:** March 30, 2026
**Execution method:** Claude Code sessions, phased prompts
**Estimated scope:** 10 sessions across ~5 working days

---

## Situation Assessment

After synthesizing all six input documents — the 42-finding test report, the four-perspective user evaluation (11 bugs, 15 improvements), the orchestrator analysis (8 improvement areas), the dock refactor spec (6 phases), the competitive intelligence landscape (12 platforms), and a full repo structure review of the 15-package monorepo — the picture is clear:

**The architecture is sound. The differentiation is real. The surface is fragile.**

Waggle's crown jewels (.mind files, GEPA optimization, 97+ tools, 13 personas, 4-tier architecture, 8.2MB Tauri delivery) are genuinely unmatched in the March 2026 landscape. But two P0 bugs, silent error swallowing across the entire frontend, a dock that overwhelms every user tier, and zero frontend tier-gating mean the product cannot ship. The gap is not architectural — it is execution polish.

This plan closes that gap in 10 structured Claude Code sessions.

---

## Plan Architecture

The plan is organized into **10 sessions**, each independently shippable. Every session has:

- **Objective** — what it accomplishes
- **Files touched** — scope containment
- **Claude Code prompt** — copy-paste ready
- **Verification checklist** — manual QA after each session
- **Risk notes** — what to watch for

Sessions are ordered by dependency and impact. Each session assumes the previous ones are complete.

---

## SESSION 1: P0 Crash Fixes — Unblock Basic Navigation
**Impact:** Eliminates the two show-stoppers that make the app unusable
**Effort:** ~30 minutes
**Files:** `AppWindow.tsx`, `Desktop.tsx`, `WaggleDanceApp.tsx`

### Claude Code Prompt

```
Read these files and fix the following P0 bugs:

1. `apps/web/src/components/os/AppWindow.tsx`
   - The window close button (red traffic light dot) does not work.
   - Find the close button element — the `onClose` prop is likely not bound
     to an onClick handler. Fix it so clicking the red dot calls onClose.
   - Also increase the close/minimize/maximize button click targets to at
     least 24px diameter (currently ~12px). Use invisible expanded hit areas
     if needed to preserve the visual size.
   - Add an onKeyDown handler to the AppWindow container: when Escape is
     pressed and this is the focused/topmost window, call onClose.

2. `apps/web/src/components/os/Desktop.tsx` + `apps/web/src/components/os/apps/WaggleDanceApp.tsx`
   - Clicking the Waggle Dance dock icon (lightning bolt) renders a full
     black screen with no content and no way to escape.
   - Wrap the WaggleDanceApp render case in Desktop.tsx with an ErrorBoundary.
   - In WaggleDanceApp.tsx, if the component is not ready for production,
     replace its content with a "Coming Soon" placeholder that matches the
     visual style of other app windows (use the same glass-strong background,
     centered icon + message pattern).

3. While you're in Desktop.tsx, wrap EVERY app render case with an
   ErrorBoundary component that shows a recovery UI (app icon + "Something
   went wrong" + "Close" button that calls the window close handler). If an
   ErrorBoundary component already exists in the codebase, reuse it. If not,
   create one at `apps/web/src/components/os/ErrorBoundary.tsx`.

After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Red close button closes windows on first click
- [ ] Yellow minimize button works
- [ ] Escape key closes the topmost window
- [ ] Waggle Dance icon shows "Coming Soon" instead of black screen
- [ ] If any app crashes, ErrorBoundary catches it and shows recovery UI
- [ ] No TypeScript compilation errors

---

## SESSION 2: Resilient Networking — Kill the Infinite Spinners
**Impact:** Every offline/degraded state becomes user-friendly instead of a dead end
**Effort:** ~45 minutes
**Files:** New utility file, every hook that calls `fetch`

### Claude Code Prompt

```
The application has a systemic problem: every fetch() call hangs indefinitely
when the backend is unreachable. There are no timeouts, no AbortControllers,
and no user-visible error states. Fix this globally.

1. Create `apps/web/src/lib/fetch-utils.ts`:
   - Export a `fetchWithTimeout(url, options, timeoutMs = 10000)` function
     that wraps fetch with an AbortController.
   - On timeout, throw a typed error: `TimeoutError`.
   - On network failure, throw a typed error: `NetworkError`.
   - Export a `useApiHealth()` hook that pings `/health` every 30 seconds
     and exposes `isServerReachable: boolean`.

2. Search the entire `apps/web/src/hooks/` directory for every file that
   uses `fetch(`. Replace every bare fetch with fetchWithTimeout. Fix the
   catch blocks:
   - Remove EVERY empty catch block, every `catch { /* silent */ }`,
     every `catch { /* ignore */ }`.
   - Replace with: `catch (err) { console.error('[HookName] API error:', err); }`
   - For hooks that set state, set an appropriate error state.

3. In the following view components, add an offline/error state that shows
   when the backend is unreachable (use the pattern from SettingsApp.tsx
   which already has a 10-second timeout with retry button):
   - `ChatApp.tsx` — show "Connect to backend to start chatting" with
     a link/button to open Settings
   - `ConnectorsApp.tsx` — show "Server unreachable" with retry button
   - `CockpitApp.tsx` — show "Server unreachable" with retry button
   - `AgentsApp.tsx` — show "Server unreachable" with retry button

4. Also search `apps/web/src/components/` for any direct fetch() calls
   and apply the same fetchWithTimeout + error handling pattern.

Do NOT touch the packages/server directory — this is frontend only.
After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Stop the backend server, open the app — no infinite spinners
- [ ] Chat view shows clear "connect to backend" message
- [ ] Connectors shows "Server unreachable" with retry
- [ ] Cockpit shows "Server unreachable" with retry
- [ ] Start the backend — all views recover within 10 seconds
- [ ] Browser console shows structured error messages, no silent swallowing
- [ ] No TypeScript compilation errors

---

## SESSION 3: Agent Quality — Disclaimer Decontamination & Prompt Tightening
**Impact:** Transforms perceived agent intelligence. The #1 quality-of-life fix.
**Effort:** ~30 minutes
**Files:** `packages/agent/src/personas.ts`, `packages/server/src/local/routes/chat.ts`

### Claude Code Prompt

```
Read these files carefully before making any changes:
- packages/agent/src/personas.ts
- packages/server/src/local/routes/chat.ts
- packages/agent/src/orchestrator.ts

The agent system has a disclaimer contamination problem. Disclaimers are
injected at THREE levels simultaneously, causing the agent to append
financial/legal disclaimers to trivial questions like "What is 2+2?" when
a regulated persona is active.

Fix all three layers:

1. In `personas.ts`:
   - Find every persona that has "DISCLAIMER" or "MANDATORY" in its
     systemPrompt (likely: finance-owner, hr-manager, legal-counsel,
     researcher, executive-assistant, analyst).
   - Remove "MANDATORY on EVERY response" language.
   - Replace with contextual instruction: "Include a brief professional
     disclaimer ONLY when your response contains substantive advice on
     [domain] matters such as [2-3 examples]. Do NOT add disclaimers to
     casual conversation, simple questions, or topics outside your
     regulated domain."

2. In `chat.ts`:
   - Find the blanket disclaimer rule in the behavioral rules section
     (around lines 509-513). Change it from "always disclaim" to:
     "Disclaimers are required ONLY when your response provides actionable
     guidance on regulated topics (financial advice, legal counsel, medical
     guidance, HR policy). They are NOT required for general conversation,
     factual questions, creative tasks, or technical assistance."
   - Find the post-response disclaimer injection (around lines 1443-1458).
     Keep the mechanism but make it topic-aware: only inject if the
     response actually contains regulated content. Add a simple check —
     if the response doesn't contain keywords related to the persona's
     regulated domain, skip the injection.

3. In `personas.ts`, also fix instruction duplication:
   - Find instructions that appear in BOTH individual persona prompts AND
     the core behavioral rules (e.g., "ALWAYS search memory", "cite sources").
   - Remove the duplicated instruction from the persona prompt. The core
     behavioral rules already enforce these universally.
   - Leave ONLY role-specific differentiation in persona prompts.

4. In `chat.ts`, audit the behavioral rules section for verbosity:
   - The section is reportedly ~300 lines. Look for redundant or
     overlapping instructions.
   - Consolidate without losing meaning. Target: reduce by 20-30%.
   - Keep the section well-organized with clear headers.

After making changes, verify the packages compile with no TypeScript errors.
```

### Verification Checklist
- [ ] Start backend, open Chat with a "Banking" workspace active
- [ ] Ask "What is 2+2?" — response should NOT contain any disclaimer
- [ ] Ask "Should I invest in bonds?" — response SHOULD contain a disclaimer
- [ ] Switch to Researcher persona, ask a factual question — no disclaimer
- [ ] Ask for investment analysis — disclaimer appears
- [ ] Memory recall still works (auto_recall fires on relevant questions)
- [ ] No TypeScript compilation errors in agent or server packages

---

## SESSION 4: Window Management & Desktop Polish
**Impact:** Completes the OS metaphor — windows behave like a real desktop
**Effort:** ~1 hour
**Files:** `AppWindow.tsx`, `Desktop.tsx`, `useKeyboardShortcuts.ts`

### Claude Code Prompt

```
Read these files:
- apps/web/src/components/os/AppWindow.tsx
- apps/web/src/components/os/Desktop.tsx
- apps/web/src/hooks/useKeyboardShortcuts.ts
- apps/web/src/components/os/Dock.tsx

Implement proper window management to complete the OS metaphor:

1. **Window position persistence** (Desktop.tsx):
   - When a user drags/resizes a window, save the position and size to
     localStorage under `waggle:window-positions:{appId}`.
   - When opening an app, check localStorage for a saved position. If
     found, restore it. If not, use the current default positioning.
   - Structure: `{ x: number, y: number, width: number, height: number }`

2. **Minimize to dock** (AppWindow.tsx + Desktop.tsx + Dock.tsx):
   - The yellow traffic light button should minimize the window (hide it
     but keep it in the open apps list).
   - In Desktop.tsx, maintain a `minimizedApps` state (may already exist).
   - Clicking a minimized app's dock icon should restore it.
   - Add a subtle visual indicator on the dock icon for minimized apps
     (e.g., a dimmed dot instead of bright dot).

3. **Fullscreen toggle** (AppWindow.tsx):
   - The green traffic light button should toggle between windowed and
     fullscreen mode.
   - Fullscreen: the window fills the viewport minus the dock height and
     status bar height.
   - Store fullscreen state in the window's local state.
   - Double-clicking the title bar should also toggle fullscreen.

4. **Window focus/z-index management** (Desktop.tsx):
   - Clicking on a window should bring it to front (highest z-index).
   - Maintain a z-index counter that increments on each focus event.
   - The most recently focused window should receive keyboard events.

5. **Keyboard shortcuts** (useKeyboardShortcuts.ts):
   - Ctrl+W (or Cmd+W on Mac): close the topmost window
   - Ctrl+Tab: cycle through open windows (bring next one to front)
   - Ctrl+Shift+M: minimize current window

6. **Fix Profile and Vault rendering**:
   - Check `UserProfileApp.tsx` and `VaultApp.tsx` — they reportedly
     render but show invisible/empty content.
   - Diagnose the root cause (likely a missing data fetch, wrong CSS,
     or a conditional render that evaluates to false).
   - Fix so both apps display their content properly.

After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Drag a window, close it, reopen — it appears at the saved position
- [ ] Yellow button minimizes window; dock icon click restores it
- [ ] Green button toggles fullscreen; double-click title bar also works
- [ ] Clicking a window brings it to front over other windows
- [ ] Ctrl+W closes the topmost window
- [ ] Ctrl+Tab cycles through open windows
- [ ] Profile app shows content (tabs: Identity, Writing Style, Brand, Interests)
- [ ] Vault app shows content (encrypted secrets list)
- [ ] No TypeScript compilation errors

---

## SESSION 5: Dock Refactor — Tier-Based Progressive Disclosure
**Impact:** Transforms the 15-icon overwhelm into a curated, tier-appropriate experience
**Effort:** ~1.5 hours
**Files:** Per DOCK-REFACTOR-SPEC.md (6 phases)

### Claude Code Prompt

```
Read `docs/DOCK-REFACTOR-SPEC.md` in full — it contains the complete
implementation specification for this refactor. Also read the HTML prototype
at `docs/dock-v2-macos.html` to understand the target UX.

Implement the dock refactor in the exact phased order specified in Section 13
of the spec. Here is the summary:

**Phase 1 — Foundation:**
- Create `apps/web/src/lib/dock-tiers.ts` with UserTier type, DockEntry
  interface, TIER_DOCK_CONFIG, and getDockForTier() helper.
- Add new AppIds: 'scheduled-jobs', 'marketplace', 'voice'.
- Modify `apps/web/src/hooks/useOnboarding.ts` to add tier field to
  OnboardingState, defaulting to 'professional'.

**Phase 2 — Dock rewrite:**
- Rewrite `apps/web/src/components/os/Dock.tsx` to accept a tier prop
  and render from TIER_DOCK_CONFIG[tier] instead of the hardcoded array.
- Handle three item types: 'app' (direct launcher), 'separator' (divider),
  'zone-parent' (opens DockTray popover).
- Create `apps/web/src/components/os/DockTray.tsx` — a popover above the
  dock for zone-parent children. AnimatePresence slide-up, click-outside
  close, Escape close.
- Modify Desktop.tsx to read tier from onboarding state and pass to Dock.
  Add appConfig entries for new AppIds.

**Phase 3 — Placeholder apps:**
- Create ScheduledJobsApp.tsx, MarketplaceApp.tsx, VoiceApp.tsx as
  simple "Coming Soon" shells matching the existing app window style.

**Phase 4 — Onboarding upgrade:**
- Insert tier selection step into OnboardingWizard.tsx at position 2.
- Show three cards: Simple, Professional, Full Control. Each with a
  brief description and dock preview.
- Shift all subsequent steps by +1. Update step count and progress bar.

**Phase 5 — Command palette + shortcuts:**
- Expand QUICK_COMMANDS in GlobalSearch.tsx to match the new app structure.
- Update keyboard shortcuts in useKeyboardShortcuts.ts per the spec.

**Phase 6 — Settings integration:**
- Add a "Dock Experience" dropdown to SettingsApp.tsx under Appearance
  or General section, allowing tier switching post-onboarding.
- Ensure backward compatibility: existing users (completed onboarding,
  no tier field) default to 'professional'.

IMPORTANT: Preserve ALL existing Framer Motion animations on dock items.
Preserve the Spawn Agent button. Preserve the open-app dot indicator.
Preserve the waggle badge count display.

After each phase, verify the app compiles. Test incrementally.
```

### Verification Checklist
- [ ] Simple tier: dock shows exactly 5 items (Home, Chat, Files, separator, Settings)
- [ ] Professional tier: dock shows 7 items (Home, Chat, Agents, Files, sep, Memory, Settings)
- [ ] Power tier: dock shows all zones including Ops and Extend zone-parents
- [ ] Clicking Ops zone-parent opens tray with Command Center, Events & Logs, Scheduled Jobs
- [ ] Clicking Extend opens tray with Skills & Apps, Connectors, Marketplace
- [ ] Tray closes on click-outside, Escape, or item selection
- [ ] Only one tray open at a time
- [ ] Switching tier in Settings immediately updates the dock
- [ ] New user onboarding shows tier selection at step 2
- [ ] Existing user (no tier field in localStorage) defaults to professional
- [ ] Ctrl+K command palette shows updated commands
- [ ] Spawn Agent button still present and functional
- [ ] Hover magnification animation preserved
- [ ] No TypeScript compilation errors

---

## SESSION 6: UI Bug Fixes — Console Hygiene & Visual Polish
**Impact:** Eliminates every visible bug from the test report and evaluation
**Effort:** ~45 minutes
**Files:** Various view components

### Claude Code Prompt

```
Fix the following UI bugs found during testing. Read each file before editing.

1. **42 duplicate-key errors in Skills & Apps grid**
   File: `apps/web/src/components/os/apps/CapabilitiesApp.tsx`
   - The grid rendering likely uses array index or a non-unique field as
     React key. Find the map/render loop and ensure each item has a truly
     unique key (use package name + version, or a UUID if available).
   - Also fix: the Marketplace tab reportedly duplicates the Installed tab
     content. Verify they render from different data sources.

2. **Memory content shows raw markdown**
   File: `apps/web/src/components/os/apps/MemoryApp.tsx`
   - Memory frame titles and content display literal `**bold**` markers.
   - Add a simple markdown-to-HTML renderer for the frame content display.
   - Use a lightweight approach: either import an existing markdown library
     already in the project, or write a simple regex-based renderer for
     bold, italic, links, and code (no need for full markdown support).

3. **HTML entities not decoded in Events**
   File: `apps/web/src/components/os/apps/EventsApp.tsx`
   - Event content shows `Serbia&#x27;s` instead of `Serbia's`.
   - Find where event content is rendered and add HTML entity decoding.
   - Simple approach: create a `decodeHtmlEntities(str)` utility that
     uses a textarea element or a regex map for common entities.

4. **Connectors panel semi-transparent background**
   File: `apps/web/src/components/os/apps/ConnectorsApp.tsx`
   - The connector list has too-low background opacity, causing the
     hexagon wallpaper to bleed through behind text.
   - Find the container's background class and change to a more opaque
     variant (e.g., from `bg-background/80` to `bg-background/95` or
     `bg-background`).

5. **Token count disappears from top bar intermittently**
   File: `apps/web/src/components/os/StatusBar.tsx` (or wherever the
   top bar is rendered)
   - The token counter in the status bar loses state during window
     operations. Find the token count state and ensure it persists
     properly (likely needs to be lifted to Desktop.tsx or a shared context).

6. **React Router v7 future-flag warnings**
   File: wherever the router is configured (likely `main.tsx` or `App.tsx`)
   - Add both future flags: `v7_startTransition` and `v7_relativeSplatPath`
     to the router configuration.

7. **Memory frame accessCount always 0**
   File: `apps/web/src/components/os/apps/MemoryApp.tsx` or the memory
   hook/API
   - When a memory frame detail is viewed, the accessCount should increment.
   - Add a PATCH/POST call to the memory API on frame detail view load.

8. **Cockpit "Degraded" health status with no explanation**
   File: `apps/web/src/components/os/apps/CockpitApp.tsx`
   - The health status shows "Degraded" in orange with no context.
   - Add explanatory text below the status indicator: when degraded, show
     what is causing it (e.g., "2 connectors offline", "embedding service
     unavailable"). If the data isn't available, show "Some services are
     running at reduced capacity" with a link to the full status panel.

After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Skills & Apps grid — no duplicate-key errors in console
- [ ] Marketplace tab shows different content than Installed tab
- [ ] Memory frames render bold/italic text properly (no raw `**`)
- [ ] Events log shows `Serbia's` not `Serbia&#x27;s`
- [ ] Connectors panel has opaque background — no wallpaper bleed-through
- [ ] Token count persists in status bar across window operations
- [ ] No React Router deprecation warnings in console
- [ ] Memory frame accessCount increments when viewed
- [ ] Cockpit "Degraded" status shows explanatory text
- [ ] Total console errors reduced to <5 (from 42+)

---

## SESSION 7: Agent Orchestrator Hardening
**Impact:** Fixes memory quality, sub-agent consistency, and token efficiency
**Effort:** ~45 minutes
**Files:** `packages/agent/src/` — orchestrator, subagent-orchestrator, agent-session

### Claude Code Prompt

```
Read these files carefully:
- packages/agent/src/orchestrator.ts
- packages/agent/src/subagent-orchestrator.ts
- packages/agent/src/agent-session.ts
- packages/agent/src/improvement-detector.ts

Implement these orchestrator improvements:

1. **SubagentOrchestrator context inheritance** (subagent-orchestrator.ts):
   - Find the `buildWorkerContext()` method.
   - Currently, spawned workers get a minimal system prompt (name, role,
     task, previous step results) with NO parent context.
   - Create a `buildWorkerBaseContext()` method that produces a condensed
     version of the parent agent's context: identity summary (2-3 lines),
     user profile (name, role, preferences), workspace context (name,
     domain), and the 3 most critical behavioral rules (memory-first,
     groundedness, safety).
   - Inject this base context at the top of every worker's system prompt.
   - Keep it under 500 tokens — workers don't need the full self-awareness
     block or the complete behavioral specification.

2. **Harden autoSaveFromExchange** (orchestrator.ts or wherever this
   method lives):
   - Find the `autoSaveFromExchange()` method that uses regex to detect
     what to save to memory.
   - The current patterns produce false positives: "I'd rather not discuss
     this" matches as a preference, "let's go with pizza" matches as a
     decision.
   - Add a minimum message length filter: only consider messages >100
     chars for auto-save (short messages are rarely worth memorizing).
   - Add a confidence scoring approach: require at least 2 signals to
     converge before auto-saving (e.g., message is long AND matches a
     pattern AND is not a casual/social message).
   - Add a simple negative pattern list to exclude obvious false positives:
     casual food/social references, negation patterns ("rather not",
     "don't want to"), greetings, small talk.

3. **System prompt token monitoring** (chat.ts or orchestrator.ts):
   - Add a function `estimatePromptTokens(prompt: string): number` that
     uses the rough heuristic of chars/4 to estimate token count.
   - At the point where the final system prompt is assembled, log the
     estimated token count: `console.log('[Orchestrator] System prompt:
     ~${tokens} tokens (${sections})')` where sections lists which blocks
     were included.
   - If the total exceeds 12,000 tokens, log a warning.

4. **Behavioral spec extraction** (chat.ts):
   - The behavioral specification is currently a long template string
     embedded in chat.ts.
   - Extract it into a separate file: `packages/agent/src/behavioral-spec.ts`
   - Export it as a named constant with a version identifier:
     `export const BEHAVIORAL_SPEC_V2 = { version: '2.0', content: '...' }`
   - Import and use in chat.ts. This enables future versioning and A/B
     testing.

After making changes, verify both agent and server packages compile.
```

### Verification Checklist
- [ ] Start the backend, spawn a sub-agent via the main chat
- [ ] Sub-agent response references the user by name (inherited context)
- [ ] Sub-agent respects workspace context (mentions the workspace domain)
- [ ] Console shows system prompt token estimate on each chat request
- [ ] No token estimate warnings for normal workspaces (<12K tokens)
- [ ] Behavioral spec lives in its own file with version identifier
- [ ] Short casual messages ("let's get pizza") don't get auto-saved to memory
- [ ] Substantive decisions ("We agreed to price enterprise at $499/month") do get saved
- [ ] No TypeScript compilation errors in agent or server packages

---

## SESSION 8: Frontend Tier-Gating — Enable the Commercial Model
**Impact:** Makes the Solo vs Teams vs Business distinction real in the UI
**Effort:** ~1 hour
**Files:** Multiple view components, settings, types

### Claude Code Prompt

```
Read the tier system created in Session 5 (dock-tiers.ts, useOnboarding.ts)
and the existing settings infrastructure.

The current app has zero frontend tier-gating — a Solo user sees the exact
same UI as an Enterprise user. Implement progressive feature visibility.

1. **Define feature gates** — create `apps/web/src/lib/feature-gates.ts`:

```typescript
export type PlanTier = 'solo' | 'teams' | 'business' | 'enterprise';

export interface FeatureGate {
  feature: string;
  minTier: PlanTier;
  label: string;        // display name
  upgradePrompt: string; // shown when locked
}

export const FEATURE_GATES: FeatureGate[] = [
  // Solo: Chat, Files, 3 personas, 1 workspace, basic memory
  { feature: 'multi-workspace', minTier: 'teams', label: 'Multiple Workspaces', upgradePrompt: 'Upgrade to Teams for unlimited workspaces' },
  { feature: 'all-personas', minTier: 'teams', label: 'All 13 Personas', upgradePrompt: 'Upgrade to Teams to unlock all agent personas' },
  { feature: 'connectors', minTier: 'teams', label: 'Connectors', upgradePrompt: 'Upgrade to Teams for third-party integrations' },
  { feature: 'waggle-dance', minTier: 'teams', label: 'Waggle Dance', upgradePrompt: 'Upgrade to Teams for multi-agent workflows' },
  { feature: 'terminal', minTier: 'teams', label: 'Terminal', upgradePrompt: 'Upgrade to Teams for terminal access' },
  { feature: 'mission-control', minTier: 'business', label: 'Mission Control', upgradePrompt: 'Upgrade to Business for team management' },
  { feature: 'scheduled-jobs', minTier: 'business', label: 'Scheduled Jobs', upgradePrompt: 'Upgrade to Business for scheduled automation' },
  { feature: 'audit-trail', minTier: 'enterprise', label: 'Audit Trail', upgradePrompt: 'Enterprise feature — contact sales' },
  { feature: 'rbac', minTier: 'enterprise', label: 'Role-Based Access', upgradePrompt: 'Enterprise feature — contact sales' },
];

export function isFeatureEnabled(feature: string, currentTier: PlanTier): boolean { ... }
export function getUpgradePrompt(feature: string): string | null { ... }
```

2. **Create a `useFeatureGate` hook** — `apps/web/src/hooks/useFeatureGate.ts`:
   - Reads the current plan tier from settings/onboarding state
   - Returns `{ isEnabled: (feature) => boolean, gate: (feature) => FeatureGate | null }`
   - For now, default everyone to 'teams' tier (the first paid tier)
     so the app is fully functional during development

3. **Create a `<LockedFeature>` component** — `apps/web/src/components/os/LockedFeature.tsx`:
   - Wraps gated content with a lock overlay
   - Shows the feature name, a lock icon, and the upgrade prompt
   - Visually: semi-transparent overlay with centered lock message
   - Should feel like a gentle gate, not a wall

4. **Apply gates to Settings tabs**:
   - In SettingsApp.tsx, find the tab navigation (General, Providers,
     Enterprise, Team, etc.)
   - Enterprise tab: gate to 'enterprise' tier
   - Team tab: gate to 'business' tier
   - Add a small lock icon next to gated tab labels when the user's
     tier is below the minimum

5. **Apply gates to the persona selector**:
   - Solo tier: only show 3 personas (General Assistant, Researcher, Writer)
   - Teams: all 13 personas
   - Show locked personas as disabled with a subtle lock indicator

6. **Apply gates to workspace creation**:
   - Solo tier: maximum 1 workspace
   - Show an upgrade prompt when trying to create a second workspace on Solo

After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Set tier to 'solo' in settings — only 3 personas visible, others locked
- [ ] Solo tier: cannot create second workspace (upgrade prompt shown)
- [ ] Solo tier: Enterprise and Team settings tabs show lock icon
- [ ] Set tier to 'teams' — all 13 personas available
- [ ] Locked features show the upgrade prompt, not a dead end
- [ ] Tier switching updates all gates immediately (no refresh needed)
- [ ] No TypeScript compilation errors

---

## SESSION 9: Notification Center & Context Menus — Complete the OS
**Impact:** Resolves dangling UI elements and adds expected OS behaviors
**Effort:** ~45 minutes
**Files:** `NotificationInbox.tsx`, `FilesApp.tsx`, `MemoryApp.tsx`, `StatusBar.tsx`

### Claude Code Prompt

```
The app shows notification badges (bell icon "9+", dock badges) but has no
notification center. It also lacks right-click context menus expected in an
OS metaphor. Fix both.

1. **Notification Center** (apps/web/src/components/os/overlays/NotificationInbox.tsx
   or create if needed):
   - Clicking the bell icon in the top status bar should open a dropdown
     notification panel (not a full window).
   - Panel: glass-strong background, slides down from the bell icon, max
     height 400px with scroll.
   - Each notification: icon + title + description + timestamp + dismiss button.
   - "Clear All" button at the bottom.
   - If no notifications: show "All caught up" empty state.
   - Connect to the existing notifications hook (useNotifications.ts).
   - Clicking a notification should navigate to the relevant context
     (e.g., clicking an agent notification opens the Agents app).
   - Badge count on bell icon should update when notifications are dismissed.

2. **Right-click context menu for Files** (FilesApp.tsx):
   - Right-clicking a file should show a context menu with:
     Open, Download, Rename, Delete, Copy Path.
   - Right-clicking a folder: Open, New File, New Folder, Rename, Delete.
   - Right-clicking empty space: New File, New Folder, Refresh.
   - Use a simple custom context menu component (prevent default browser
     context menu on right-click within the Files app).
   - Create `apps/web/src/components/os/ContextMenu.tsx` as a reusable
     context menu component: position at cursor, click-outside-close,
     keyboard navigation (arrow keys + Enter).

3. **Right-click context menu for Memory** (MemoryApp.tsx):
   - Right-clicking a memory frame: View Details, Edit, Delete, Copy Content.
   - Use the same ContextMenu component.

4. **StatusBar cleanup** (StatusBar.tsx):
   - Ensure the bell icon click handler opens NotificationInbox (not crash).
   - Ensure the badge count reflects actual unread notification count.
   - If the notification system doesn't have real data yet, show 0 and
     hide the badge. Do NOT show fake "9+" badges.

After making changes, verify the app compiles with no TypeScript errors.
```

### Verification Checklist
- [ ] Clicking bell icon opens notification dropdown (not crash)
- [ ] Badge count is 0 when no notifications (badge hidden)
- [ ] Right-click on a file in Files shows context menu
- [ ] Right-click on empty space shows New File, New Folder, Refresh
- [ ] Context menu closes on click-outside or Escape
- [ ] Right-click on memory frame shows View/Edit/Delete/Copy options
- [ ] Context menu actions actually work (not just visible)
- [ ] No TypeScript compilation errors

---

## SESSION 10: Final Integration Testing & Hardening
**Impact:** The confidence pass — catch anything the prior sessions missed
**Effort:** ~1 hour
**Files:** Cross-cutting

### Claude Code Prompt

```
This is the final integration pass. Read through the following files to
verify everything is connected properly after Sessions 1-9:

1. **App.tsx decomposition** — the god-component issue:
   - Read `apps/web/src/App.tsx` (reportedly 1,348 lines with 15+ state vars).
   - Extract window management state into a custom hook:
     `useWindowManager()` — handles openApps, minimizedApps, windowPositions,
     z-index management, open/close/minimize/maximize/focus operations.
   - Extract modal/dialog state into `useModalState()` — handles which
     overlays are visible (onboarding, workspace switcher, persona switcher,
     spawn agent dialog, etc.).
   - Keep App.tsx as a thin orchestrator that composes these hooks and
     renders Desktop with the right props.
   - Target: App.tsx under 400 lines.

2. **ARIA labels and basic accessibility**:
   - Add aria-label to every dock icon button: `aria-label={entry.label}`
   - Add aria-label to the three traffic light buttons: "Close window",
     "Minimize window", "Toggle fullscreen"
   - Add role="dialog" and aria-labelledby to AppWindow
   - Add aria-label to the notification bell
   - Add aria-label to the search/command palette trigger
   - This is NOT a full accessibility audit — just the most visible gaps.

3. **Build verification**:
   - Run `npm run build` (or the equivalent build command) and fix any
     TypeScript or build errors.
   - Run `npm run lint` if a linter is configured, and fix any errors
     (warnings are acceptable).
   - Run `npm run test` if tests exist, and fix any failures.

4. **Console hygiene check**:
   - Open the app in the browser and navigate through every dock item.
   - There should be zero errors in the console during normal operation.
   - Warnings are acceptable but should be under 5 total.

5. **localStorage cleanup**:
   - Verify that all localStorage keys used by the app are namespaced
     under `waggle:` prefix (e.g., `waggle:onboarding`, `waggle:window-positions`).
   - If any bare keys exist, add the namespace prefix.

After making changes, verify the app builds cleanly and runs without errors.
```

### Verification Checklist
- [ ] App.tsx is under 400 lines
- [ ] useWindowManager hook handles all window state
- [ ] useModalState hook handles all overlay state
- [ ] Dock icons have aria-labels (inspect in DevTools)
- [ ] Traffic light buttons have aria-labels
- [ ] `npm run build` succeeds with zero errors
- [ ] `npm run lint` produces zero errors
- [ ] Opening every dock app produces zero console errors
- [ ] All localStorage keys are namespaced under `waggle:`
- [ ] Full navigation walkthrough: no crashes, no dead ends, no broken states

---

## Execution Sequence & Dependencies

```
Session 1 ──→ Session 2 ──→ Session 3 ──→ Session 4 ──→ Session 5
(P0 fixes)    (Network)     (Agent)       (Windows)     (Dock)
    │                                                      │
    └── These 5 are sequential, each depends on the prior ─┘
                                                           │
                              ┌─────────────────┬──────────┤
                              ▼                 ▼          ▼
                          Session 6         Session 7   Session 8
                          (UI bugs)         (Orchestr)  (Tier-gate)
                              │                 │          │
                              └────────┬────────┘          │
                                       ▼                   │
                                   Session 9 ◄─────────────┘
                                   (Notif+ctx)
                                       │
                                       ▼
                                   Session 10
                                   (Integration)
```

Sessions 6, 7, and 8 can run in parallel (independent concerns).
Session 9 depends on 6 and 8. Session 10 is always last.

---

## What This Plan Does NOT Cover (Deferred to M2/M3)

| Item | Rationale | Target |
|------|-----------|--------|
| Real embedding provider (replace mock) | Requires external dependency decision (Ollama vs API) | M2 |
| Messaging channels (WhatsApp/Telegram) | Major feature, not polish | M2 |
| Browser automation / computer use | Major feature, not polish | M2 |
| SSO/SAML enterprise auth | Enterprise tier scope | M3 |
| RBAC implementation | Enterprise tier scope | M3 |
| Audit trail UI | Enterprise tier scope | M3 |
| Prompt versioning / A/B testing infra | Strategic infrastructure | M3 |
| Light theme | Design effort beyond polish | M2 |
| KVARK sovereign integration | Separate track | Ongoing |
| Open-source packaging (MIT core) | Strategic decision pending | M2 |

---

## Success Criteria

After all 10 sessions are complete, the application should meet these standards:

1. **Zero P0 bugs** — no crashes, no traps, no data loss
2. **Graceful degradation** — offline mode shows clear states, not spinners
3. **Tier-aware UI** — Solo sees 5 dock icons, Professional sees 7, Power sees full control
4. **Intelligent agent** — no disclaimer on "2+2", disclaimer on actual regulated advice
5. **Complete OS metaphor** — windows close, minimize, fullscreen, persist position
6. **Clean console** — zero errors during normal operation
7. **< 400 line App.tsx** — decomposed into focused hooks
8. **Production build succeeds** — zero TypeScript errors, zero build failures

This is the bar for a credible Solo and Teams tier launch.

---

*Plan prepared March 30, 2026. Based on: 42-finding test report, 4-perspective user evaluation, orchestrator analysis, dock refactor spec, competitive intelligence (12 platforms), and full 15-package repo structure review.*
