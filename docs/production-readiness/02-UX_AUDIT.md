# Phase 2: UX Audit — View-by-View Code Review

**Date:** 2026-03-20
**Auditor:** Production Readiness Automation (Phase 2)
**Scope:** All 7 views, sidebar, onboarding, Direction D compliance, emotional assessment
**Method:** Source code reading only (no runtime verification)

---

## 2A. View-by-View Scorecard

Each view scored 1-5 on 8 quality dimensions.

| View | Layout | Empty State | Loading State | Error State | Direction D | Typography | Spacing | Accessibility | **Avg** |
|------|--------|-------------|---------------|-------------|-------------|------------|---------|---------------|---------|
| Chat | 5 | 5 | 2 | 3 | 4 | 4 | 5 | 4 | **4.0** |
| Memory | 4 | 5 | 4 | 2 | 4 | 4 | 4 | 3 | **3.8** |
| Events | 4 | 5 | 4 | 2 | 4 | 4 | 4 | 2 | **3.6** |
| Capabilities | 5 | 5 | 4 | 4 | 3 | 4 | 5 | 4 | **4.3** |
| Cockpit | 5 | 4 | 5 | 5 | 4 | 4 | 5 | 2 | **4.3** |
| MissionControl | 4 | 5 | 4 | 4 | 4 | 4 | 4 | 2 | **3.9** |
| Settings | 4 | 3 | 3 | 2 | 4 | 4 | 4 | 3 | **3.4** |

**Overall View Average: 3.9 / 5.0**

---

### Chat View (avg 4.0)

**Files:** `app/src/views/ChatView.tsx`, `packages/ui/src/components/chat/ChatArea.tsx`, `ChatInput.tsx`, `ChatMessage.tsx`, `ToolCard.tsx`, `ApprovalGate.tsx`, `SubAgentProgress.tsx`, `FileDropZone.tsx`, `FeedbackButtons.tsx`, `WorkflowSuggestionCard.tsx`

**Layout (5/5):** Clean flex column with tabs, chat area, and input. FileDropZone wraps content. WorkflowSuggestionCard positioned above input. Persona indicator in header. All Tailwind.

**Empty State (5/5):** Two-tier empty state is excellent. With workspace context: shows "Workspace Now" block with summary, recent decisions, blockers, open items, threads, memories, suggested prompts, and onboarding hints for new workspaces. Without context: shows branded SVG icon, workspace name, contextual suggestion chips derived from workspace name (research, writing, planning, code, etc.). This is one of the strongest UX patterns in the entire app.

**Loading State (2/5):** The loading indicator uses BEM CSS classes (`chat-area__loading-dot`) with NO corresponding CSS definition anywhere in the codebase. These dots will render as invisible/unstyled `<span>` elements. The streaming indicator is effectively broken at the CSS level.

**Error State (3/5):** Server command fetch silently falls back to client commands (good graceful degradation). No explicit error UI for chat API failures -- the `isLoading` prop is the only signal. Tool errors are well-handled via ToolCard status states. ApprovalGate has clear error recovery paths.

**Direction D (4/5):** Mostly compliant. Uses `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `text-primary` consistently. One concern: `FileDropZone` uses `bg-indigo-500/[0.12]` and `border-indigo-500/60` and `text-indigo-500` -- indigo is NOT part of Direction D palette (should use `primary`/amber). ToolCard uses inline style for `justCompleted` transition. ChatMessage uses `text-[#3fb950]` for completed tool group dots (hardcoded green).

**Typography (4/5):** `font-mono` on ChatInput textarea and command palette. Prose classes for markdown rendering. Body text at 14px, code at 13px. Good hierarchy. Missing explicit `font-[Inter]` on some elements.

**Spacing (5/5):** Consistent use of Tailwind spacing: `px-6 py-4`, `gap-2`, `space-y-4`. Well-structured padding on workspace home block.

**Accessibility (4/5):** Chat area has `role="log"`, `aria-label`, `aria-live="polite"`. Messages have `role="article"` with user/agent labels. Trail toggle has `aria-expanded` and descriptive `aria-label`. Copy button has `aria-label`. Command palette has `focus-visible` styles. Missing: keyboard shortcut for file attachment, no `aria-label` on Send button.

---

### Memory View (avg 3.8)

**Files:** `app/src/views/MemoryView.tsx`, `packages/ui/src/components/memory/MemoryBrowser.tsx`, `MemorySearch.tsx`, `FrameTimeline.tsx`, `FrameDetail.tsx`

**Layout (4/5):** Two-panel split (50/50 timeline + detail). Search bar at top, filters below, stats footer at bottom. Clean structure. The 50/50 split may be suboptimal on narrow windows -- could benefit from responsive breakpoint.

**Empty State (5/5):** Shows brain emoji, "No memories yet" heading, and helpful description: "As you chat, important context is automatically saved here." Detail panel shows "Select a frame to view details" when no frame selected.

**Loading State (4/5):** Shows "Loading memories..." with `animate-pulse` class. Functional but not a skeleton loader.

**Error State (2/5):** No error state handling. If the API call fails, the component will show the empty state (no memories) which is misleading -- user won't know if data failed to load vs. genuinely empty.

**Direction D (4/5):** Uses theme tokens throughout. Filter chips use `bg-primary`/`text-primary-foreground`. Stats footer uses `text-muted-foreground`. No hardcoded colors in MemoryBrowser itself.

**Typography (4/5):** Good hierarchy with filter chips at `text-xs`, stats at `text-xs`, search area clean.

**Spacing (4/5):** Consistent padding `p-2`, `p-3`, `py-1.5`. Minor inconsistency: timeline panel has `p-2` while detail panel has `p-3`.

**Accessibility (3/5):** Search input likely has built-in label from MemorySearch component. Filter chips lack `role="group"` and `aria-label`. No keyboard navigation for frame selection.

---

### Events View (avg 3.6)

**Files:** `app/src/views/EventsView.tsx`, `packages/ui/src/components/events/EventStream.tsx`, `StepCard.tsx`, `SessionTimeline.tsx`

**Layout (4/5):** Two-tab layout (Live Events / Session Replay). Live tab wraps EventStream. Replay tab has session picker dropdown and SessionTimeline. Clean flex column structure.

**Empty State (5/5):** EventStream shows clipboard emoji, "No events recorded" heading, descriptive text about what appears there. SessionTimeline shows "No events" for empty sessions. Session picker shows "No sessions found" or "Select a workspace first" as appropriate.

**Loading State (4/5):** Shows "Loading sessions..." and "Loading timeline..." text indicators. EventStream does not have its own loading state indicator.

**Error State (2/5):** Network errors in session/timeline fetch silently result in empty arrays. User has no way to know if data failed to load. The `try/catch` blocks swallow errors with `// Network error` comments.

**Direction D (4/5):** Tab bar uses `bg-secondary`, `text-primary`, `bg-primary/15`. StepCard uses inline `style={{ borderLeftColor: typeColor }}` with dynamically computed colors. Session picker select uses `bg-black/30` -- a hardcoded value that won't adapt to light theme.

**Typography (4/5):** `font-mono` on timestamps. Step names are bold. Good hierarchy.

**Spacing (4/5):** Consistent `px-3 py-2` for sections. `gap-0.5` for tab buttons is tight but acceptable.

**Accessibility (2/5):** Tab buttons lack `role="tab"`, `aria-selected`, `aria-controls` attributes. Live/Replay tabs are plain `<button>` elements without tab semantics. StepCard has no keyboard navigation support for expand/collapse. SessionTimeline buttons lack `aria-expanded`.

---

### Capabilities View (avg 4.3)

**Files:** `app/src/views/CapabilitiesView.tsx`

**Layout (5/5):** Three-tab layout (Packs, Marketplace, Individual Skills). Max-width 960px centered. Clean tab bar with count badges. Marketplace has search, type filter chips, category filter chips, sort chips, and responsive grid layout. Create Skill form is a collapsible panel. This is the most feature-complete view.

**Empty State (5/5):** Multiple context-specific empties: no packs ("No recommended packs available"), server unreachable ("Failed to load capability packs. Is the server running?" with Retry button), marketplace empty (emoji + descriptive text + "Clear all filters" button), no search results.

**Loading State (4/5):** Text-based loading indicators for each section. Marketplace has debounced search (300ms). No skeleton loaders.

**Error State (4/5):** Pack error displayed as red banner. Marketplace error has inline Retry button. Community pack install shows per-package error list and retry button for failed packages. Install/uninstall errors are silently swallowed (comment: "Silently fail -- user can retry").

**Direction D (3/5):** Contains the highest density of hardcoded hex colors in the app. `priorityColor()` returns `'#d4a843'` for core (should be `var(--primary)`). `installTypeColor()` returns `'#3fb950'` for skills. Multiple `bg-[#d4a843]`, `text-[#d4a843]`, `border-l-[#d4a843]` hardcoded references (16 instances). These should use `bg-primary`, `text-primary`, `border-l-primary`. However, these represent intentional amber/brand coloring, and `#d4a843` IS the Direction D amber, so functional impact is low -- the concern is maintainability if the brand color changes.

**Typography (4/5):** `font-mono` on the outer container. Install type badges, pack names, descriptions all properly sized. Category chips are well-proportioned.

**Spacing (5/5):** Excellent spacing throughout. Marketplace grid uses `gap-2.5`, pack cards have `p-4 mb-3`, filter bars use `gap-1.5`. Consistent throughout.

**Accessibility (4/5):** Tab bar has `role="tablist"`, `aria-label`, buttons have `role="tab"`, `aria-selected`, `aria-controls`. Marketplace search has `aria-label`. Test IDs on key elements. Missing: filter chips lack `aria-pressed` state.

---

### Cockpit View (avg 4.3)

**Files:** `app/src/views/CockpitView.tsx`, 10 card sub-components in `app/src/components/cockpit/`

**Layout (5/5):** Responsive 2-column grid (`grid-cols-1 md:grid-cols-[repeat(auto-fit,minmax(420px,1fr))]`). Max-width 960px. 10 cards: SystemHealth, ServiceHealth, CostDashboard, MemoryStats, VaultSummary, CronSchedules, CapabilityOverview, AgentTopology, Connectors, AuditTrail. Plus new AgentIntelligenceCard. All use shared `Card` components from shadcn/ui.

**Empty State (4/5):** Each card handles its own empty state. CronSchedules: "No schedules configured." Connectors: "No connectors configured yet." AuditTrail: "No install events recorded yet." AgentIntelligence: "No feedback yet." Some cards show "Loading..." text which doubles as loading/empty indicator.

**Loading State (5/5):** Dedicated `CockpitSkeleton` component renders 6 skeleton cards during initial load. Individual cards show "Loading..." text. This is the best loading implementation in the app.

**Error State (5/5):** Dedicated `CockpitError` component with "Failed to load cockpit data. Is the server running?" message and Retry button. Health error tracking distinguishes server unreachable from data errors. 30-second auto-refresh on health endpoint.

**Direction D (4/5):** Cards use shared shadcn `Card` component. Stat boxes use `bg-white/[0.03]` (hardcoded white reference, won't work in light theme). `text-primary` for metric values. CostDashboardCard uses `style={{ width }}` and `style={{ height }}` for dynamic chart bars (justified -- these are computed values). Budget badge uses semantic colors. StatusBar background uses `bg-[#0a0a1a]` (hardcoded, not from theme).

**Typography (4/5):** `font-mono` on outer container. Card titles use `tracking-wide`. Stat values use `font-bold font-mono`. Labels use `uppercase tracking-wider`. Good hierarchy.

**Spacing (5/5):** Cards have consistent internal structure via shadcn Card components. Grid gap of 4. Internal padding consistent at `px-3 py-2.5`.

**Accessibility (2/5):** No ARIA attributes on any cockpit card. Interactive elements (toggle buttons, trigger buttons, connect buttons) lack `aria-label`. CronSchedule toggle buttons don't indicate ON/OFF state via `aria-pressed`. Connector form inputs lack `aria-label` or associated `<label>`.

---

### Mission Control View (avg 3.9)

**Files:** `app/src/views/MissionControlView.tsx`

**Layout (4/5):** Max-width 900px centered. Agent fleet cards in a vertical list. Resource summary as 3-column grid at bottom. Simple but effective. No collapsible sections or advanced layout features.

**Empty State (5/5):** Excellent empty state: bee emoji, "No active agents" heading, "Spawn sub-agents from chat or start parallel workspaces" guidance. Very on-brand.

**Loading State (4/5):** "Loading fleet data..." with `animate-pulse`. Centered in a fixed height container (h-64).

**Error State (4/5):** Shows red error text and Retry button. Error state properly prevents content rendering.

**Direction D (4/5):** Uses semantic classes: `text-primary`, `bg-primary/10`, `text-destructive`, `border-primary`, `border-destructive`, `border-muted-foreground`. Status dot classes map cleanly. One concern: uses emoji icons (`PERSONA_ICONS` map) instead of themed icons.

**Typography (4/5):** Good hierarchy: h1 at `text-xl font-bold`, h2 at `text-sm font-semibold`, session IDs at `text-[13px] font-semibold`. Duration and tool counts at `text-[11px]`.

**Spacing (4/5):** Consistent `gap-2` for card lists, `gap-3` for resource grid. Cards have `px-4 py-3` internal padding.

**Accessibility (2/5):** No ARIA attributes on fleet cards. Control buttons (Pause, Resume, Kill) lack `aria-label`. Status dots rely on color alone (no text label in collapsed state). No keyboard navigation between agent cards.

---

### Settings View (avg 3.4)

**Files:** `app/src/views/SettingsView.tsx`, delegates to `SettingsPanel` from `@waggle/ui`

**Layout (4/5):** Thin wrapper that delegates to `SettingsPanel`. Clean delegation pattern with controlled tab state for ContextPanel sync.

**Empty State (3/5):** Shows "Loading settings..." in dim text when config is null. No guidance text about what settings contain.

**Loading State (3/5):** Simple text "Loading settings..." at `text-muted-foreground/40`. No skeleton or spinner. The low opacity makes the text nearly invisible.

**Error State (2/5):** No error handling for failed config load. If `config` remains null indefinitely (e.g., server unreachable), the user sees "Loading settings..." forever with no way to retry.

**Direction D (4/5):** Wrapper is clean. Compliance depends on SettingsPanel implementation (separate audit needed for the full panel -- not read due to file size).

**Typography (4/5):** Inherits from SettingsPanel.

**Spacing (4/5):** `p-6` for loading state. Panel uses `h-full overflow-hidden`.

**Accessibility (3/5):** Depends heavily on SettingsPanel implementation. Controlled tab state (`activeTab`/`onTabChange`) enables ContextPanel sync which is good for orientation.

---

## 2B. Layout & Navigation Audit

**File:** `app/src/components/AppSidebar.tsx`, `packages/ui/src/components/common/Sidebar.tsx`

### Three-Zone Layout
**Status: PRESENT** -- AppShell composes sidebar + content + context panel. Sidebar is the left zone, main content is the center, context panel is collapsible right (managed in App.tsx).

### Sidebar Collapsible
**Status: PRESENT** -- Sidebar transitions between 48px (collapsed) and 200px (expanded) with `transition-[width,min-width] duration-200 ease-in-out`. Toggle button uses triangle arrows with `aria-label` and `aria-expanded`.

### Active View Indicator
**Status: PRESENT** -- Active nav item gets `bg-primary/10 border-l-primary text-primary` plus a small dot (`w-1 h-1 rounded-full bg-primary`). Keyboard shortcuts shown as `^1` through `^7` with opacity based on active state.

### Workspace Tree with Hue Colors
**Status: PRESENT** -- `WorkspaceTree` component with `microStatus` prop. App.tsx sets `--workspace-hue` CSS custom property. Sidebar includes ScrollArea for long workspace lists.

### Theme Toggle
**Status: PRESENT** -- Sun/moon icons (`\u2600`/`\u263E`) with "light mode"/"dark mode" labels. Uses `useTheme` hook from `@waggle/ui`.

### StatusBar Info
**Status: PRESENT** -- `StatusBar` component shows: workspace name, mode (Local/Team), offline indicator with queued message count (PM-6), model name (clickable for model picker), token count, cost. StatusBar uses `bg-[#0a0a1a]` hardcoded background.

### Issues Found
- Brand text uses `text-[#E8920F]` instead of `text-primary` -- this is a different shade of amber from the Direction D `#d4a843`
- Version badge `v1.0` is hardcoded
- StatusBar background `bg-[#0a0a1a]` will not adapt to light theme

---

## 2C. Onboarding Flow Audit

**Files:** `packages/ui/src/components/onboarding/OnboardingWizard.tsx`, `SplashScreen.tsx`, `steps/NameStep.tsx`, `steps/ApiKeyStep.tsx`, `steps/WorkspaceStep.tsx`, `steps/ReadyStep.tsx`

### Flow Sequence
Splash (startup) -> Name -> API Key -> Workspace -> Ready (with optional memory import)

### Flow Assessment

**Splash Screen (SplashScreen.tsx):**
- Shows startup progress bar with percentage
- Uses old blue gradient: `bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]` -- these are the pre-Direction-D navy colors
- Brand text uses `text-[#f5a623]` -- yet another amber shade, different from both `#d4a843` and `#E8920F`
- Progress bar uses `bg-[#f5a623]`
- **CRITICAL:** This is the user's FIRST visual impression and it uses the wrong color palette

**Name Step:**
- Clean, warm welcome: "Your AI Operating System / Welcome to Waggle"
- Subtitle: "Persistent memory. Workspace-native. Built for knowledge work."
- Name input with validation, Enter-to-continue
- Font declarations use inline `font-[Inter,system-ui,sans-serif]` instead of inheriting from body -- redundant but not harmful
- Button uses `bg-primary` correctly

**API Key Step:**
- Clear purpose: "To talk to AI models, I need at least one API key"
- Provider cards (Anthropic, OpenAI, Google, Other) with selection state
- Password input with Test Connection button and "Don't have one?" link
- Success/error feedback inline
- Missing: no explanation that Anthropic is recommended/default

**Workspace Step:**
- "Let's create your first workspace"
- Name input with label, group selector (Work/Personal/Study/Custom)
- Custom group allows freeform input
- Clean and functional

**Ready Step:**
- Personalized: "You're all set, [name]"
- Feature highlights (Persistent memory, Workspace isolation, Local-first) with branded icons
- Memory import from ChatGPT or Claude: source selection -> file picker -> preview with knowledge items -> commit/cancel
- Preview shows decisions/preferences/facts with type-colored icons
- Import success confirmation with count
- CTA: "Start working" with amber glow shadow

### Overall Onboarding Assessment
**Score: 4/5** -- The flow is logical, warm, and progressively reveals value. Memory import is a differentiator. Main issue is the Splash Screen using old navy-blue gradient instead of Direction D palette. Time to first value is reasonable: Name (5s) -> API Key (30s with key pasting) -> Workspace (10s) -> Ready (5s or 2min with import) = ~50s minimum.

---

## 2D. Chat Experience Deep Dive

| Feature | Status | Notes |
|---------|--------|-------|
| Workspace home block | PRESENT | Excellent "Workspace Now" with summary, decisions, blockers, tasks, threads, memories, suggestions |
| Suggestion chips | PRESENT | Contextual based on workspace name; clickable, disabled during loading |
| Slash command palette | PRESENT | Appears on `/` with filtered list, keyboard navigation (up/down/Enter/Tab/Escape) |
| File drop zone | PRESENT | FileDropZone wrapper with drag overlay, base64 reading, file categorization |
| Streaming indicator | BROKEN | Loading dots use BEM CSS classes with NO CSS definitions |
| Tool cards compact | PRESENT | Three-layer design (inline/detail/raw JSON). Auto-hide for read-only tools. Grouped tool display for runs of 2+ |
| Approval gates inline | PRESENT | Human-readable descriptions, raw JSON toggle, Approve/Deny buttons, yellow warning theme |
| Feedback buttons | PRESENT | Thumbs up/down on agent messages, reason dropdown for thumbs-down, optional detail text |
| Sub-agent progress | PRESENT | Collapsible panel above input, status dots, elapsed time, current tool name |
| Workflow suggestions | PRESENT | Amber-bordered card, tool chip preview, Save as Skill / Dismiss actions |
| Persona indicator | PRESENT | Clickable chip in header with icon + name, Ctrl+Shift+P shortcut noted |
| Copy button | PRESENT | Per-message copy with "Copied" feedback |
| Message markdown | PRESENT | Full Tailwind typography prose classes, DOMPurify sanitization |
| Scroll persistence | PRESENT | Scroll positions saved per workspace/session key |

### Critical Chat Issue
The streaming/loading indicator is effectively invisible. The `chat-area__loading`, `chat-area__loading-indicator`, and `chat-area__loading-dot` CSS classes are not defined in any CSS file. The dots render as unstyled `<span>` elements with no dimensions, no color, no animation.

---

## 2E. Direction D Compliance Scan

### Inline Styles Count

| Location | `style={{` Count | Justified | Unjustified |
|----------|-----------------|-----------|-------------|
| `app/src/` | 13 occurrences | 6 (dynamic widths/heights for charts, workspace-hue CSS var) | 7 (ServiceProvider hardcoded colors, GlobalSearch hue dot) |
| `packages/ui/src/` | 14 occurrences | 6 (KGViewer canvas positioning, dynamic colors) | 8 (StepCard borderLeftColor, TeamMessages borderLeftColor/color, TeamPresence backgroundColor, ToastContainer, SplashScreen width, ReadyStep colors) |
| **Total** | **27** | **12** | **15** |

Phase 10 claimed reduction to 19 inline styles -- current count is 27, slightly higher.

### Hardcoded Hex Colors (Non-Theme)

**CRITICAL -- SplashScreen (first impression):**
- `from-[#1a1a2e] via-[#16213e] to-[#0f3460]` -- old navy gradient, not Direction D
- `text-[#f5a623]` -- wrong amber shade (should be `text-primary`)
- `bg-[#f5a623]` -- wrong amber shade

**HIGH -- ServiceProvider (connection states):**
- `background: '#0a0a1a'`, `color: '#f87171'` -- hardcoded error screen colors
- `color: '#aaa'`, `color: '#666'` -- hardcoded grays
- `background: '#0a0a1a'`, `color: '#e0e0e0'` -- hardcoded loading screen colors
- `border: '2px solid #555'`, `borderTopColor: '#e0e0e0'` -- hardcoded spinner

**HIGH -- CapabilitiesView:**
- `'#d4a843'` used 16 times directly (should use `text-primary`/`bg-primary`)
- `'#3fb950'` for skill type color (hardcoded green)
- `'#58a6ff'` fallback for `var(--primary)` (old blue, wrong fallback)
- `'#8b949e'` fallback for `var(--text-muted)` (old gray)

**MEDIUM -- AppSidebar:**
- `text-[#E8920F]` for brand text (different amber from `#d4a843`)

**MEDIUM -- StatusBar:**
- `bg-[#0a0a1a]` -- hardcoded dark background, won't work in light theme
- `bg-[#d4a843]`, `text-[#1a1a2e]` -- offline indicator (should use `bg-primary text-primary-foreground`)

**MEDIUM -- ChatMessage:**
- `text-[#3fb950]` for completed tool dots

**MEDIUM -- FeedbackButtons:**
- `hover:text-[#3fb950]` (thumbs up hover)
- `hover:text-[#f85149]` (thumbs down hover)

**LOW -- ToastContainer:**
- 5 hardcoded category colors: `'#3b82f6'`, `'#10b981'`, `'#f59e0b'`, `'#8b5cf6'`, `'#6366f1'`

**LOW -- TeamPresence, TaskBoard, TeamMessages:**
- Multiple hardcoded status/type colors via style attributes

**LOW -- KGViewer:**
- SVG stroke/fill colors: `"#4B5563"`, `"#6B7280"`

### Direction D Compliance Percentage

- **Total component files scanned:** ~45 TSX files
- **Files with zero hardcoded colors:** ~30 files (67%)
- **Files with hardcoded colors:** ~15 files (33%)
- **Estimated Direction D compliance: ~78%**

The 22% non-compliance is concentrated in: SplashScreen (3 colors), ServiceProvider (6 colors), CapabilitiesView (16 references to `#d4a843`), StatusBar (3 colors), and team/workspace components (~10 colors).

### Light Theme Compatibility

Several hardcoded values will break in light theme:
- `bg-[#0a0a1a]` on StatusBar -- will appear as a dark bar on light background
- `bg-black/30` on EventsView session picker
- `bg-white/[0.03]` on cockpit stat boxes -- invisible on white background
- `bg-white/[0.06]` on progress bars
- SplashScreen navy gradient
- ServiceProvider connection screens

---

## 2F. Emotional Assessment

| # | Dimension | Score | Justification |
|---|-----------|-------|---------------|
| 1 | **Orientation** | 4/5 | Sidebar shows all 7 views with keyboard shortcuts, active indicator with left border highlight, workspace tree with micro-status dots. StatusBar shows current workspace, model, mode. Persona indicator in chat header. Missing: no breadcrumb trail, context panel open/close state not indicated in sidebar. |
| 2 | **Relief** | 5/5 | Workspace home block is the standout feature. On returning to a workspace, users see summary, recent decisions, blockers, open items, key memories, and suggested next actions. This is the "I don't have to hold this whole project in my head" moment. Auto-recall, contextual suggestions, and slash commands reduce cognitive load. |
| 3 | **Momentum** | 4/5 | Tool cards show real-time progress with status dots and completion animations. Sub-agent progress panel shows active agent status. Workflow suggestion card detects repeated patterns and offers skill creation. Missing: no progress indicators for long-running operations beyond the (broken) loading dots. |
| 4 | **Trust** | 5/5 | Three-layer tool transparency (inline summary -> formatted detail -> raw JSON) is exceptional. Approval gates show human-readable descriptions of what tools want to do. Auto_recall shows memory snippets being loaded. Feedback buttons let users correct agent behavior. Audit trail in Cockpit tracks all installs. |
| 5 | **Continuity** | 4/5 | Scroll position persistence across workspace switches. Session replay tab for browsing past tool timelines. Workspace home shows "Last active: X ago" and recent threads. Onboarding memory import preserves prior context. Missing: no visual indicator of what changed since last visit (session diff). |
| 6 | **Seriousness** | 3/5 | Mostly professional. Clean monospace/Inter typography. Amber brand identity is distinctive. However: SplashScreen uses wrong color palette (first impression). ServiceProvider connection screens use raw inline styles. Loading indicator is broken (invisible dots). Emoji use is inconsistent (brain, clipboard, bee in different views vs. unicode symbols in others). |
| 7 | **Personal Alignment** | 4/5 | Persona system with switchable identities. Memory import from ChatGPT/Claude in onboarding. Workspace isolation preserves different contexts. Onboarding personalization ("You're all set, [name]"). Missing: no visual personality/avatar for the agent itself. |
| 8 | **Controlled Power** | 4/5 | 13 slash commands, file drop, workspace management, model switching, cost tracking, cron schedules, connector management, skill creation, marketplace browsing. Approval gates prevent unintended mutations. Missing: no undo for destructive actions, Kill button in Mission Control has no confirmation. |

**Emotional Average: 4.1 / 5.0**

---

## Issue Registry

### CRITICAL

**UX-001: Streaming loading indicator is invisible**
- Severity: CRITICAL
- File: `packages/ui/src/components/chat/ChatArea.tsx:366-371`
- Issue: The loading indicator uses BEM CSS classes (`chat-area__loading`, `chat-area__loading-indicator`, `chat-area__loading-dot`) that are not defined in any CSS file. The three `<span>` dots render with no dimensions, no color, and no animation. Users cannot tell when the agent is thinking.
- Fix: Either define the CSS classes in a stylesheet, or replace with Tailwind classes (e.g., `<div className="flex gap-1 py-2"><span className="w-2 h-2 rounded-full bg-primary animate-bounce" />...`).

**UX-002: SplashScreen uses pre-Direction-D color palette**
- Severity: CRITICAL
- File: `packages/ui/src/components/onboarding/SplashScreen.tsx:25,27,39`
- Issue: The splash screen (user's FIRST visual impression of the app) uses old navy-blue gradient colors (`#1a1a2e`, `#16213e`, `#0f3460`) and the wrong amber shade (`#f5a623`). This is the only screen that still uses the old palette.
- Fix: Replace gradient with `bg-background` or a Direction D gradient. Replace `#f5a623` with `text-primary`.

### HIGH

**UX-003: ServiceProvider uses all-inline hardcoded styles**
- Severity: HIGH
- File: `app/src/providers/ServiceProvider.tsx:60-104`
- Issue: Connection error and loading screens use 100% inline styles with hardcoded hex colors (`#0a0a1a`, `#f87171`, `#aaa`, `#666`, `#e0e0e0`, `#555`). These screens are seen on every cold start and won't respect theme settings.
- Fix: Convert to Tailwind classes using theme tokens. Error: `bg-background text-destructive`. Loading: `bg-background text-foreground` with `border-border` spinner.

**UX-004: StatusBar hardcoded dark background**
- Severity: HIGH
- File: `packages/ui/src/components/common/StatusBar.tsx:89`
- Issue: StatusBar uses `bg-[#0a0a1a]` which will appear as a dark bar in light theme mode. Should use `bg-background` or `bg-card`.
- Fix: Replace `bg-[#0a0a1a]` with `bg-card` or define a semantic `--waggle-statusbar-bg` variable (already exists in waggle-theme.css but is not used).

**UX-005: Settings view has no error recovery**
- Severity: HIGH
- File: `app/src/views/SettingsView.tsx:30-35`
- Issue: If `config` is null (server unreachable), the view shows "Loading settings..." at very low opacity (`text-muted-foreground/40`) with no retry mechanism. This state persists indefinitely.
- Fix: Add a timeout after 10s that shows an error state with a Retry button, similar to CockpitView's `CockpitError`.

**UX-006: CapabilitiesView uses 16 hardcoded `#d4a843` references**
- Severity: HIGH
- File: `app/src/views/CapabilitiesView.tsx:123,143,160,670,691,761,792,818,1042,1212`
- Issue: While `#d4a843` is the correct Direction D amber, hardcoding it 16 times bypasses the theme system. If the brand color changes, all 16 references need manual update. Several helper functions return raw hex instead of CSS variables.
- Fix: Replace `#d4a843` with `text-primary`, `bg-primary`, `border-l-primary` Tailwind classes. Update `priorityColor()`, `installTypeColor()` to return CSS variable references.

**UX-007: Light theme will break multiple components**
- Severity: HIGH
- Files: Multiple (StatusBar, EventsView, Cockpit cards, ServiceProvider)
- Issue: `bg-white/[0.03]` on cockpit stat boxes is invisible on white backgrounds. `bg-black/30` on session picker won't work in light mode. `bg-[#0a0a1a]` on StatusBar is solid dark in light mode.
- Fix: Replace `bg-white/[0.03]` with `bg-muted/30` or `bg-card`. Replace `bg-black/30` with `bg-muted`. Replace StatusBar hardcoded bg with theme token.

### MEDIUM

**UX-008: FileDropZone uses non-Direction-D indigo color**
- Severity: MEDIUM
- File: `packages/ui/src/components/chat/FileDropZone.tsx:104-108`
- Issue: Drop overlay uses `bg-indigo-500/[0.12]`, `border-indigo-500/60`, `text-indigo-500`. Indigo is not part of the Direction D palette (amber/purple/green/red).
- Fix: Replace with `bg-primary/[0.12]`, `border-primary/60`, `text-primary`.

**UX-009: Brand text uses wrong amber shade**
- Severity: MEDIUM
- File: `app/src/components/AppSidebar.tsx:128`
- Issue: "WAGGLE" brand text uses `text-[#E8920F]` which is a different amber shade from the Direction D `#d4a843` / `hsl(40 65% 55%)`.
- Fix: Use `text-primary` or define a `--waggle-brand` variable if the logo color must be distinct.

**UX-010: Events tab buttons lack ARIA tab semantics**
- Severity: MEDIUM
- File: `app/src/views/EventsView.tsx:103-126`
- Issue: Live Events / Session Replay tab buttons are plain `<button>` elements without `role="tab"`, `aria-selected`, or `aria-controls` attributes. The tab container lacks `role="tablist"`.
- Fix: Add `role="tablist"` to container, `role="tab"` and `aria-selected` to buttons, and `role="tabpanel"` to content areas.

**UX-011: Memory view has no error state**
- Severity: MEDIUM
- File: `packages/ui/src/components/memory/MemoryBrowser.tsx`
- Issue: If the memory API fails, the component shows the empty state ("No memories yet") which is misleading. Users cannot distinguish between "no data" and "load failed."
- Fix: Add an `error` prop and render an error state with a Retry button when the API call fails.

**UX-012: Events view swallows all fetch errors**
- Severity: MEDIUM
- File: `app/src/views/EventsView.tsx:57-60, 78-80`
- Issue: Both `fetchSessions` and `fetchTimeline` have `catch` blocks that silently swallow errors, leaving the user with an empty state and no indication of failure.
- Fix: Track error state and show an inline error message with retry option.

**UX-013: Mission Control Kill button has no confirmation**
- Severity: MEDIUM
- File: `app/src/views/MissionControlView.tsx:124-129`
- Issue: The Kill button immediately terminates a session with no confirmation dialog. This is a destructive action.
- Fix: Add a confirmation step (e.g., "Kill session [id]? This cannot be undone." with confirm/cancel).

**UX-014: Cockpit cards have no ARIA attributes**
- Severity: MEDIUM
- Files: All `app/src/components/cockpit/*.tsx`
- Issue: Interactive elements (toggle buttons, trigger buttons, connect forms) lack `aria-label`, `aria-pressed`, or associated `<label>` elements. The Cron ON/OFF toggle does not communicate state to screen readers.
- Fix: Add `aria-label` to all interactive elements. Add `aria-pressed` to toggle buttons.

**UX-015: Three different amber shades in use**
- Severity: MEDIUM
- Files: SplashScreen (`#f5a623`), AppSidebar (`#E8920F`), CapabilitiesView + theme (`#d4a843`)
- Issue: The brand color appears in three different shades across the app. Direction D specifies `#d4a843` as the canonical amber.
- Fix: Standardize all amber references to use `text-primary` / `bg-primary` which maps to `hsl(40 65% 55%)` (approximately `#d4a843`).

### LOW

**UX-016: ToastContainer uses hardcoded category colors**
- Severity: LOW
- File: `packages/ui/src/components/ToastContainer.tsx:20-24`
- Issue: Toast category colors (`cron: '#3b82f6'`, `approval: '#10b981'`, etc.) are hardcoded hex values used in inline styles, not theme-aware.
- Fix: Map to Tailwind classes or CSS variables.

**UX-017: Team components use hardcoded status colors**
- Severity: LOW
- Files: `TeamPresence.tsx:18-20`, `TaskBoard.tsx:37-39`, `TeamMessages.tsx:26-29`
- Issue: Status/type color maps use hardcoded hex values via inline styles.
- Fix: Convert to Tailwind utility classes.

**UX-018: KGViewer uses hardcoded SVG colors**
- Severity: LOW
- File: `packages/ui/src/components/memory/KGViewer.tsx:246,254`
- Issue: SVG elements use hardcoded `stroke="#4B5563"` and `fill="#6B7280"`.
- Fix: Use `currentColor` with a parent text color class.

**UX-019: ToolResultRenderer uses hardcoded accent colors**
- Severity: LOW
- File: `packages/ui/src/components/chat/ToolResultRenderer.tsx:52,80,106,123,135,152`
- Issue: Uses `text-green-300`, `text-purple-300`, `text-cyan-300`, `text-yellow-300`, `text-orange-300` for different tool type results. These are Tailwind palette colors, not Direction D semantic tokens.
- Fix: Map tool types to Direction D semantic colors (success, accent, primary, warning).

### INFO

**UX-020: Onboarding steps redundantly declare Inter font**
- Severity: INFO
- Files: `NameStep.tsx`, `ReadyStep.tsx`
- Issue: Multiple elements declare `font-[Inter,system-ui,sans-serif]` inline despite Inter being set as the body font in `globals.css`.
- Fix: Remove redundant `font-[...]` declarations; the body font stack handles this.

**UX-021: ReadyStep hardcodes server URL**
- Severity: INFO
- File: `packages/ui/src/components/onboarding/steps/ReadyStep.tsx:27`
- Issue: `const BASE_URL = 'http://127.0.0.1:3333'` is hardcoded rather than using `getServerBaseUrl()`.
- Fix: Use the shared `getServerBaseUrl` utility.

**UX-022: Cockpit stat boxes use `bg-white/[0.03]`**
- Severity: INFO (becomes HIGH in light theme context -- see UX-007)
- Files: All cockpit cards using stat boxes
- Issue: The `bg-white/[0.03]` background is a common pattern across all stat boxes. It provides subtle elevation in dark mode but will be invisible in light mode.
- Fix: Use `bg-muted/20` or `bg-secondary/50` for theme-safe subtle elevation.

**UX-023: ToolCard uses inline style for completion flash**
- Severity: INFO
- File: `packages/ui/src/components/chat/ToolCard.tsx:270`
- Issue: Completion flash animation uses `style={justCompleted ? { opacity: 0.85, ... } : { ... }}` inline.
- Fix: Convert to Tailwind `opacity-85 transition-opacity duration-300` with conditional class.

---

## Summary

### Strengths
1. **Workspace Home block** is the single strongest UX feature -- it delivers instant context on return
2. **Three-layer tool transparency** (inline/detail/raw JSON) is production-grade and exceptional for trust
3. **Approval gates** with human-readable descriptions are well-designed
4. **Cockpit** has the best loading/error handling (skeleton + dedicated error component + retry)
5. **Capabilities** marketplace with search, filters, sort, install/uninstall is feature-complete
6. **Onboarding** flow with memory import is a differentiator
7. **Tailwind migration** is largely successful -- most components use theme-aware classes

### Critical Gaps
1. **Streaming indicator is invisible** (no CSS for loading dots) -- users can't tell when agent is thinking
2. **SplashScreen uses wrong palette** -- first impression violates brand identity
3. **Light theme will break** -- multiple hardcoded dark-mode assumptions in StatusBar, Cockpit, Events

### Key Metrics
- **Direction D compliance: ~78%** (22% non-compliant, concentrated in 15 files)
- **Inline styles: 27** (15 unjustified, 12 justified for dynamic values)
- **ARIA coverage: ~40%** (Chat and Capabilities have good coverage; Cockpit, Events, Mission Control are sparse)
- **Total issues found: 23** (2 CRITICAL, 5 HIGH, 7 MEDIUM, 4 LOW, 5 INFO)
- **View average score: 3.9/5.0**
- **Emotional average: 4.1/5.0**
