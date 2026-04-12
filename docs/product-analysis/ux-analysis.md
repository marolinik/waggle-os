# Waggle OS -- Comprehensive UX Analysis

**Date:** April 2026
**Scope:** `apps/web/` (primary frontend), with references to `app/` (legacy Tauri app)
**Analyst:** Automated deep-read of all views, overlays, hooks, and design tokens

---

## 1. Architecture Overview

Waggle OS presents itself as an "Autonomous Agent OS" -- a full desktop operating system metaphor running inside a browser window. The experience is structured as:

```
Index page
  -> BootScreen (animated boot sequence)
  -> Desktop (the full OS environment)
       -> StatusBar (top menu bar)
       -> AppWindow instances (draggable/resizable windows)
       -> Dock (bottom app launcher)
       -> Overlays (modal dialogs/command palette)
```

This is a React SPA using React Router with a single route (`/`). There is no multi-page navigation. All state lives in hooks managed by the `Desktop` component.

---

## 2. The Desktop OS Metaphor

### 2.1 Boot Screen (`BootScreen.tsx`)

On first load, the user sees an animated boot sequence with five phases:

1. "Initializing core systems..."
2. "Loading agent kernel..."
3. "Connecting to hive network..."
4. "Mounting workspaces..."
5. "Ready."

Each phase displays for 600ms with a progress bar. The logo pulses with a honey-gold glow. After "Ready," the boot screen fades out and the Desktop appears. Total boot time: approximately 4.8 seconds.

**UX Assessment:** The boot animation strongly reinforces the OS metaphor and creates a premium first impression. However, 4.8 seconds is long for a returning user. There is no "skip boot" mechanism or localStorage-based fast boot for repeat visits.

### 2.2 Desktop (`Desktop.tsx`)

The desktop has three layers:

1. **Wallpaper** -- A full-screen background image (`wallpaper.jpg`) with a 20% dark overlay
2. **Content area** -- When no windows are open, shows a large Waggle AI logo with the tagline "Autonomous Agent OS" and a hint: "Click an app in the dock - Ctrl+` to switch windows"
3. **Windows** -- AppWindow instances rendered with absolute positioning, z-index management, and framer-motion animations

The empty desktop state is well-designed: the logo fades in with letter-spacing animation, and there is a subtle pulsing hint at the bottom.

### 2.3 Status Bar (`StatusBar.tsx`)

A fixed 32px-tall bar at the top of the screen. Left side shows:
- Waggle logo (16x16)
- "Waggle AI" brand text
- Active workspace name (dot-separated)
- Current model name (honey-colored)
- Token count and cost (when > 0)

Right side shows:
- Search icon (triggers Global Search)
- Notification bell (with unread badge)
- WiFi/WifiOff status indicator
- Volume and Battery icons (decorative -- not functional)
- Date and live clock

**UX Assessment:** The status bar effectively communicates system state (online/offline, model, cost). The decorative Volume and Battery icons feel like unnecessary OS-ism that could confuse users since they don't reflect actual device state.

### 2.4 App Windows (`AppWindow.tsx`)

Each app opens in a draggable, resizable window with:

- **Title bar** with icon, title, and three traffic-light buttons (minimize/maximize/close as colored circles)
- **Drag** via framer-motion drag controls on the title bar
- **Resize** via 8 edge/corner handles (N, S, E, W, NE, NW, SE, SW)
- **Snap zones** -- drag to left/right edges snaps to half-screen; drag to top maximizes
- **Snap preview** -- a translucent overlay shows where the window will snap during drag
- **Minimize** animates the window down to the dock area (opacity: 0, scale: 0.3)
- **Maximize** fills the usable area (between StatusBar and Dock)
- **Double-click** title bar toggles maximize
- **Escape** closes the focused window
- **Position persistence** via `window-positions.ts` (saves to localStorage)
- **Cascade offset** -- new windows open slightly offset from the previous

**UX Strengths:**
- Window management feels polished and responsive
- Snap zones mirror Windows 11 / macOS behavior
- Position persistence is smart for power users

**UX Weaknesses:**
- No way to tile or arrange multiple windows automatically (no "tile all" command)
- Escape closing the focused window could be surprising -- it conflicts with standard "close overlay" behavior in many of the overlays
- The minimize/maximize/close buttons are styled as three identical small circles (only close is red-tinted) -- difficult to distinguish visually, unlike macOS traffic lights which are red/yellow/green

### 2.5 Window Manager (`useWindowManager.ts`)

Manages all open windows with:
- **Multi-instance chat** -- Multiple chat windows can coexist for different workspaces
- **Single instance for other apps** -- Opening an already-open app brings it to focus
- **Z-index management** -- Click to focus, incremental z-index
- **Ctrl+`** cycles window focus
- **Title generation** -- Chat windows show "WorkspaceName - Template - Persona"

### 2.6 Dock (`Dock.tsx`)

A centered, fixed bottom dock with glassmorphism styling (`glass-strong`). Features:

- **Icons** with hover labels and spring animations (scale 1.2, y: -8 on hover)
- **Open indicator** -- small dot below open apps (solid for visible, faded for minimized)
- **Zone parents** -- grouped items (Ops, Extend) that expand into a DockTray popup
- **Spawn Agent** shortcut at the far right with a separator
- **Badge count** on Waggle Dance icon for unacknowledged signals

**Tier-based dock configuration:**

| Tier | Apps Shown |
|------|-----------|
| Simple | Home, Chat, Files, Vault, Settings (5 items) |
| Professional | Home, Chat, Agents, Files, Memory, Vault, Settings (7 items) |
| Power/Admin | Home, Chat, Agents, Files, Waggle Dance, Ops zone, Extend zone, Vault, Settings (full set) |

**UX Assessment:** The dock is well-executed. Hover animations feel playful without being distracting. The tier-based progressive disclosure is excellent -- new users see a simple dock that does not overwhelm. The zone-parent grouping (Ops, Extend) is a clever way to hide complexity.

**Weakness:** The DockTray popup for zones appears directly above the clicked icon but has no arrow/pointer connecting it to the parent, which could feel disconnected.

---

## 3. All Application Views (17 Apps)

### 3.1 Chat App (`ChatApp.tsx` + `ChatWindowInstance.tsx`)

The primary application. ~730 lines of well-structured UI code.

**Layout:**
- Optional session sidebar (collapsible, 192px wide) listing past sessions
- Header bar with: session toggle, persona picker dropdown, team presence avatars, model picker dropdown
- Collapsible "Agent Profile" panel showing persona avatar, template badge, model badge
- Pin bar (if pins exist) -- shows count, expandable to see pinned messages
- Message area with auto-scroll
- Input area with slash command support, file attachment, and send button

**Message Rendering:**
- User messages: right-aligned, honey/primary background
- Assistant messages: left-aligned with persona avatar, secondary background, Sparkles icon
- System messages: muted, italic, smaller
- Block renderer: supports TextBlock, ToolUseBlock, StepBlock, ModelSwitchBlock for structured agent output
- Tool cards: expandable with status icons (running/done/error/denied/pending), raw JSON toggle
- Copy button: appears on hover (top-right of message)
- Pin button: appears on hover for assistant messages
- Feedback buttons: thumbs up/down with reason picker for negative feedback (wrong answer, too verbose, wrong tool, too slow, other)

**Slash Commands (11):**
`/model`, `/models`, `/cost`, `/clear`, `/skills`, `/help`, `/research`, `/draft`, `/review`, `/spawn`, `/plan`

**File Handling:**
- Drag-and-drop zone over entire chat area
- File picker via paperclip button
- Supports PDF, CSV, TXT, images

**Approval Gate:**
- When the agent requests dangerous actions, an amber-bordered card appears
- Shows tool name, description, Approve/Deny/Raw JSON buttons

**Workspace Briefing:**
- When a chat has no messages, it shows a rich "home screen" (`WorkspaceBriefing.tsx`)
- Fetches workspace context: greeting, summary, memory stats, pending tasks, recent decisions, key memories, recent threads, cross-workspace hints, suggested prompts, upcoming schedules
- Suggested prompts are clickable to pre-fill the input

**Team Presence:**
- Shows online team members as overlapping avatars (max 4 visible + count)
- Each avatar has a green/gray online status dot and hover tooltip

**UX Strengths:**
- The WorkspaceBriefing is outstanding -- it grounds the user in context before they start chatting
- Block-based rendering means the agent can produce structured output, not just text
- Feedback mechanism with reasons is valuable for ML quality improvement
- Pin system lets users save important responses
- Multi-session support with sidebar navigation

**UX Weaknesses:**
- The chat header is information-dense: persona picker, team presence, model picker, session toggle, agent profile -- this creates visual clutter in a small window
- No markdown rendering in the basic text path (only `whitespace-pre-wrap`)
- Copy button uses the Code icon which could be confused with "view code"
- Textarea doesn't auto-resize based on content (fixed rows=1, max-h only from CSS)

### 3.2 Dashboard App (`DashboardApp.tsx`)

Workspace overview with:
- "Workspaces" heading + "New" button
- Group filter tabs (All, Personal, Work, Research, custom groups)
- Workspace cards in a 2-column grid, each showing:
  - Persona avatar
  - Workspace name + group badge
  - Template label + persona label
  - Health indicator dot (healthy/degraded/error)
  - Hue-tinted left border
- Quick tasks section (fetches from `/api/tasks?status=open`)

**UX Assessment:** Clean and functional. The group filtering is useful for power users with many workspaces. The health indicator dots are subtle but informative.

### 3.3 Settings App (`SettingsApp.tsx`)

Tabbed interface with 7 tabs: General, Models, Permissions, Team, Backup, Enterprise, Advanced.

- **Models tab** includes ModelPilotCard (3-lane model selector: Primary/Fallback/Budget Saver)
- **General tab** includes dock tier selector (Simple/Professional/Full Control)
- **Team and Enterprise** tabs can be locked behind feature gates
- Uses `LockedFeature` component to show blurred content with upgrade prompt

**UX Assessment:** The ModelPilotCard is a standout UX pattern -- visually showing the fallback chain helps users understand how model routing works. The tier-gated tabs with blur effect communicate upgrade paths without being aggressive.

### 3.4 Memory App (`MemoryApp.tsx`)

Two views: Timeline (list) and Graph (SVG visualization).

**Timeline view:**
- Search bar with type filters (fact, event, insight, decision, task, entity)
- Importance slider filter
- Memory frames listed with type emoji, content preview, importance coloring
- Right-click context menu (View, Copy, Delete)
- Detail panel for selected frame

**Graph view:**
- SVG circular layout of knowledge graph nodes and edges
- Nodes colored with honey/primary, edges as semi-transparent lines
- Labels truncated to 12 characters

**UX Assessment:** The timeline view is functional but the graph visualization is extremely basic -- a simple circular layout with no interactivity, no zoom, no click-to-focus. For a product that positions memory as a core differentiator, this visualization needs significant investment.

### 3.5 Agents App (`AgentsApp.tsx`)

Two tabs: Agents and Groups.

**Agents tab:**
- Search bar + "Create Agent" button
- Cards for each persona (backend or local fallback)
- Agent detail panel with edit/delete
- Create agent form with: name, description, icon, system prompt, tool selection

**Groups tab:**
- Agent groups with strategy (parallel/sequential/consensus)
- Group execution panel with real-time member status
- Create/edit/duplicate group forms

**UX Assessment:** The agent management UI is comprehensive. The group execution panel showing real-time status of each member in a multi-agent execution is a differentiating feature.

### 3.6 Files App (`FilesApp.tsx`)

At ~56K, this is the largest single component. Features file management with:
- Tree view of workspace files
- Syntax-highlighted preview (via `SyntaxPreview.tsx`)
- Upload, rename, delete operations
- File type icons and metadata

### 3.7 Cockpit App (`CockpitApp.tsx`)

Operational dashboard with cards for:
- System health (service status list)
- Cost tracking (total tokens, estimated cost, budget)
- Connectors status
- Cron jobs
- Memory stats
- Weaver (memory consolidation) status
- Event statistics
- Auto-refresh every 30 seconds

Handles offline state gracefully with an error banner.

### 3.8 Events App (`EventsApp.tsx`)

Real-time event stream showing agent execution steps. Features:
- Auto-scroll toggle
- Filter by event type
- Abort button to stop running agents
- Step status coloring (running, done, error, etc.)

### 3.9 Other Apps

| App | Status | Description |
|-----|--------|-------------|
| Connectors | Complete | Grid of service integrations with install/uninstall |
| Vault | Complete | API key management with validation, multi-provider |
| User Profile | Complete | Identity questionnaire, preferences |
| Mission Control | Complete | Agent monitoring + spawn shortcut |
| Capabilities | Complete | Skills/plugins/MCP servers management |
| Waggle Dance | Complete | Multi-agent collaboration signals |
| Scheduled Jobs | Complete | Cron job list with enable/disable |
| Marketplace | Complete | Browse and install extensions |
| Voice | Placeholder | "Coming Soon" with microphone icon |

---

## 4. Overlay System (10 Overlays)

All overlays share a consistent pattern:
- Fixed full-screen backdrop with `bg-background/60 backdrop-blur-sm`
- Centered (or positioned) panel with `glass-strong` or `glass` styling
- Click-outside-to-close behavior
- framer-motion enter/exit animations (scale 0.95 -> 1)

### 4.1 Onboarding Wizard (`OnboardingWizard.tsx`)

An 8-step full-screen wizard (~800 lines). Steps:

| Step | Name | Content |
|------|------|---------|
| 0 | Welcome | Logo + "Welcome to the Hive" (auto-advances in 3s) |
| 1 | Why Waggle | 3 value props: memory, workspace-native, real tools |
| 2 | Choose Experience | Tier selector: Simple / Professional / Full Control |
| 3 | Memory Import | Import from ChatGPT or Claude (JSON upload + preview) |
| 4 | Choose Template | 15 templates in a 5-column grid + workspace name input |
| 5 | Choose Persona | 19 personas in a 4-column grid + custom persona creation |
| 6 | API Key | Provider selector + key input + validation |
| 7 | Ready | Auto-launches workspace (auto-advances in 2s) |

**Templates (15):** Sales Pipeline, Research Hub, Engineering, Marketing & Content, Product Management, Legal & Compliance, Consulting, Customer Support, Finance, HR & People, Operations, Data & Analytics, Recruiting, Design Studio, Blank Workspace.

**Personas (19):** General Purpose, Researcher, Writer, Analyst, Coder, Project Manager, Exec Assistant, Sales Rep, Marketer, Senior PM, HR Manager, Legal Counsel, Business Finance, Consultant, Support Agent, Ops Manager, Data Engineer, Recruiter, Creative Director.

**Key UX features:**
- Progress bar at top + step dots
- "Skip setup" link always visible
- Template-to-persona auto-mapping (e.g., selecting "Sales Pipeline" pre-selects "Sales Rep")
- Agent explainer tips between template and persona steps explaining the relationship
- "Recommended" badge on the auto-mapped persona
- Custom persona creation inline
- Multi-provider API key support with validation
- Telemetry tracking per step

**UX Strengths:**
- The two-step agent creation (template = what, persona = how) is elegant
- Auto-mapping reduces friction while still allowing override
- Memory import from competitors is a smart acquisition tactic
- The "Choose Your Experience" tier step sets expectations early

**UX Weaknesses:**
- The 15-template grid in 5 columns makes each item very small -- on smaller screens this would be cramped
- Step 3 (Memory Import) requires JSON file knowledge -- most users won't know how to export from ChatGPT/Claude
- No visual preview of what the workspace will look like with the selected template
- The wizard is approximately 800 lines in a single component -- maintenance risk

### 4.2 Global Search (`GlobalSearch.tsx`)

Spotlight/command-palette style search (Ctrl+K):
- Full-text search across commands, workspaces, and memory
- Fuzzy matching with scoring
- Categorized results (Commands, Workspaces, Memories, Sessions)
- Keyboard navigation (arrow keys, Enter to select, Escape to close)
- Debounced memory search (300ms, minimum 2 characters)
- Footer hints showing keyboard shortcuts

**UX Assessment:** This is excellent. The command palette is a power-user essential and the implementation is thorough. The fuzzy matching, categorized results, and keyboard navigation are all well-done.

### 4.3 Persona Switcher (`PersonaSwitcher.tsx`)

Three-tier layout:
1. **Universal Modes** (General Purpose, Planner, Verifier, Coordinator) -- 2-column grid
2. **Knowledge Workers** (Researcher, Writer, Analyst, Coder) -- 2-column grid
3. **Specialists** (all domain personas) -- 2-column grid

Also has a Groups tab for switching to agent groups.

Feature gating: non-free personas show a lock icon and are disabled. Upgrade prompt shown at bottom.

### 4.4 Other Overlays

| Overlay | Trigger | Description |
|---------|---------|-------------|
| Create Workspace | Dashboard "New" button | Full workspace creation with template, persona, settings |
| Workspace Switcher | Ctrl+Tab | List of workspaces with persona avatar and group |
| Notification Inbox | Bell icon in StatusBar | Typed notifications (cron, approval, task, message, agent) with mark-read |
| Keyboard Shortcuts | Ctrl+? | Three-section help: Navigation, Quick Actions, Chat |
| Spawn Agent Dialog | Rocket icon in Dock | Task input, persona/model selection, workspace target |
| Login Briefing | Auto on load (after onboarding) | Cross-workspace summary with pending tasks and memories |
| Onboarding Tooltips | After onboarding completes | Progressive tip carousel above the dock |

---

## 5. Design System -- "Hive DS"

### 5.1 Color Palette

The design system is called "Honey on Dark Steel" -- warm amber/honey accents on a near-black background with cold blue undertones.

**Core Colors:**
- Background: `#08090c` (hive-950) -- near-black with blue undertone
- Card/Surface: `#11141c` (hive-850) -- slightly elevated
- Primary/Brand: `#e5a000` (honey-500) -- the distinctive honey gold
- Accent: `#a78bfa` -- AI activity purple
- Foreground: `#e8eaf0` -- warm light text

**Honey Scale (8 stops):**
`#b87a00` -> `#e5a000` -> `#f5b731` -> `#fcd34d` -> `#fde68a` -> `#fef3c7` -> `#fffbeb`
Plus `honey-glow` (12% opacity) and `honey-pulse` (6% opacity) for subtle backgrounds.

**Hive Grays (12 stops):**
From `#08090c` (950) through `#f0f2f7` (50) -- cold-toned grays.

**Status Colors:**
- Healthy: `#34d399` (emerald)
- Warning: `#fbbf24` (amber)
- Error: `#f87171` (soft red)
- Info: `#60a5fa` (blue)
- AI: `#a78bfa` (purple)

### 5.2 Typography

- **Display font:** Space Grotesk (headings, labels, UI chrome) -- applied via `.font-display`
- **Body font:** DM Sans (body text, messages, content)
- **Mono font:** JetBrains Mono / Cascadia Code (code blocks, raw JSON)

The web app imports Space Grotesk and DM Sans from Google Fonts. The Tauri app bundles Inter locally.

### 5.3 Glass Morphism

Two glass utility classes dominate the visual language:

```css
.glass {
  background: hsla(30, 8%, 14%, 0.7);
  backdrop-filter: blur(20px);
  border: 1px solid hsla(38, 40%, 30%, 0.3);
}

.glass-strong {
  background: hsla(30, 8%, 12%, 0.85);
  backdrop-filter: blur(30px);
  border: 1px solid hsla(38, 40%, 30%, 0.3);
}
```

Used on: Dock, StatusBar, AppWindows, all overlay panels, tooltips, context menus.

### 5.4 Spacing and Radius

- Border radius: `0.75rem` (12px) -- generous rounding
- Consistent padding patterns: `p-2` to `p-6` depending on context
- Text sizes: extensive use of `text-xs` (12px), `text-[10px]`, `text-[11px]`, and `text-[9px]` for labels

**UX Concern:** The heavy use of very small text sizes (9-10px) could cause accessibility issues. Much of the UI information is rendered at sizes below the WCAG recommended minimum.

---

## 6. Navigation and Information Architecture

### 6.1 Navigation Model

There is no traditional sidebar or tab navigation. Instead:
1. **Dock** -- primary app launcher (always visible at bottom)
2. **Global Search** (Ctrl+K) -- command palette for everything
3. **Keyboard shortcuts** (Ctrl+Shift+0-9) -- direct app access
4. **Window cycling** (Ctrl+`) -- switch between open windows
5. **Workspace switching** (Ctrl+Tab) -- change active workspace context
6. **Status bar** -- search and notifications

This is a pure desktop-OS navigation model. There are no breadcrumbs, no URL changes, no browser back/forward.

### 6.2 Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl+K | Global Search |
| Ctrl+Shift+P | Persona Switcher |
| Ctrl+Tab | Workspace Switcher |
| Ctrl+? | Keyboard Help |
| Ctrl+W | Close focused window |
| Ctrl+Shift+M | Minimize focused window |
| Ctrl+Shift+0-9 | Open specific app |
| Ctrl+` | Cycle window focus |
| Escape | Close focused window (if focused) |
| / | Slash commands (in chat input) |
| Enter | Send message |
| Shift+Enter | New line in message |

**UX Assessment:** The keyboard shortcut system is comprehensive and follows established patterns (Ctrl+K for search, etc.). The keyboard shortcuts help dialog is clear and well-organized.

---

## 7. Onboarding Flow Analysis

### 7.1 Flow Summary

```
Boot Screen (4.8s)
  -> Onboarding Wizard (if not completed)
       Step 0: Welcome (auto-advance 3s)
       Step 1: Why Waggle (value props)
       Step 2: Choose Experience (tier)
       Step 3: Memory Import (optional)
       Step 4: Choose Template (15 options)
       Step 5: Choose Persona (19 options)
       Step 6: API Key (provider + key)
       Step 7: Ready (auto-launches, 2s)
  -> Login Briefing (cross-workspace summary)
  -> Desktop with Onboarding Tooltips (progressive tips)
```

### 7.2 Time to First Value

**Best case (skip everything):** ~5 seconds (boot + click skip)
**Typical case (complete wizard):** ~2-3 minutes
**Worst case (with import + custom persona):** ~5+ minutes

The wizard allows skipping at any point, which is good. But the boot screen has no skip mechanism, adding 5 seconds of mandatory wait on every visit.

### 7.3 Post-Onboarding Support

After the wizard completes:
1. **Onboarding Tooltips** appear above the dock as a progressive tip carousel
2. Tips are template-specific (e.g., Sales Pipeline users see "Try 'Research [company name]'")
3. Users can dismiss all tips or step through them
4. **Login Briefing** (on subsequent visits) shows a cross-workspace summary

This is a well-layered progressive disclosure approach.

---

## 8. Responsiveness and Platform Support

### 8.1 Desktop-Only Design

The application is explicitly designed for desktop viewports:
- `w-screen h-screen overflow-hidden` on the root container
- Fixed pixel dimensions for windows (520px, 560px, etc.)
- Snap zones assume full desktop-width screens
- Dock uses `fixed bottom-3 left-1/2` positioning
- Status bar is `fixed top-0`
- No media queries or responsive breakpoints in the main CSS
- No mobile navigation pattern

### 8.2 Assessment

This is intentionally desktop-only, which is appropriate for an "AI Agent OS" product. The window management paradigm fundamentally requires a large screen. However, there is no graceful degradation for tablet or narrow desktop windows -- the UI would break or become unusable below approximately 768px width.

---

## 9. UX Strengths Summary

1. **The OS metaphor is fully committed and well-executed** -- boot screen, windows, dock, status bar, snap zones all work together coherently
2. **Progressive disclosure via tier-based dock** -- new users see 5 icons, power users see 12+
3. **Workspace Briefing** is a standout feature -- contextual greeting with memories, tasks, suggested prompts
4. **Global Search / Command Palette** is thorough with fuzzy matching and categorized results
5. **Onboarding wizard** with template+persona two-step agent creation is elegant
6. **Glassmorphism design language** is consistent and visually distinctive
7. **Keyboard-first design** with comprehensive shortcuts
8. **Feature gating** with blurred locked content and upgrade prompts
9. **Agent feedback mechanism** with categorized reasons (thumbs + reason picker)
10. **Multi-model support** with 3-lane fallback chain (Primary/Fallback/Budget) in settings

---

## 10. UX Weaknesses and Improvement Opportunities

### Critical

1. **Boot screen has no skip/fast-boot for returning users** -- 4.8 seconds of mandatory wait on every load
2. **Very small text sizes (9-10px) throughout** -- accessibility concern; WCAG recommends minimum 12px for body text
3. **No responsive design** -- completely breaks on tablets or narrow windows
4. **ChatApp.tsx at 730+ lines, FilesApp.tsx at 56K, OnboardingWizard at 800+ lines** -- maintenance risk from monolithic components

### High

5. **Window control buttons are visually indistinct** -- three near-identical circles (only close has red tint); consider macOS-style color coding or icon labels
6. **Knowledge graph visualization is primitive** -- a simple circular SVG layout with no interaction; needs zoom, click-to-focus, drag, filtering for the feature to be useful
7. **Memory import requires JSON expertise** -- most users won't know how to get a ChatGPT/Claude export file
8. **No undo/redo in any context** -- deleting a memory frame, workspace, or agent is irreversible with no confirmation
9. **Volume/Battery icons in status bar are decorative** -- they add OS flavor but could confuse users expecting real indicators

### Medium

10. **Chat header is information-dense** -- persona picker, team presence, model picker, session toggle, agent profile all in one row
11. **No "tile windows" or "arrange all" command** -- common OS feature missing
12. **DockTray popup has no visual connector** to its parent zone icon
13. **Template grid in onboarding (5 columns of 15)** -- too many small items on smaller monitors
14. **Voice app is a placeholder** -- should either be hidden or marked as "Coming Soon" more prominently
15. **No dark/light mode toggle** -- only dark theme exists (appropriate for the brand, but limits accessibility)
16. **`App.css` contains Vite scaffold styles** -- dead code from the project template, including unused `.logo` and `.card` classes

---

## 11. Component Inventory

### OS Shell (7 components)
- `Desktop.tsx` (287 LOC) -- orchestrator
- `AppWindow.tsx` (308 LOC) -- window frame with drag/resize/snap
- `Dock.tsx` (156 LOC) -- bottom launcher
- `DockTray.tsx` (50 LOC) -- zone popup
- `StatusBar.tsx` (84 LOC) -- top menu bar
- `BootScreen.tsx` (139 LOC) -- animated boot sequence
- `ErrorBoundary.tsx` (30 LOC) -- app-level error catch

### App Windows (17 apps)
- `ChatApp.tsx` + `ChatWindowInstance.tsx` + 6 chat-block components
- `DashboardApp.tsx`, `SettingsApp.tsx`, `MemoryApp.tsx`, `AgentsApp.tsx`
- `FilesApp.tsx`, `CockpitApp.tsx`, `EventsApp.tsx`, `ConnectorsApp.tsx`
- `VaultApp.tsx`, `UserProfileApp.tsx`, `MissionControlApp.tsx`
- `CapabilitiesApp.tsx`, `WaggleDanceApp.tsx`, `ScheduledJobsApp.tsx`
- `MarketplaceApp.tsx`, `VoiceApp.tsx`

### Overlays (10 overlays)
- `OnboardingWizard.tsx`, `PersonaSwitcher.tsx`, `GlobalSearch.tsx`
- `CreateWorkspaceDialog.tsx`, `SpawnAgentDialog.tsx`, `WorkspaceSwitcher.tsx`
- `NotificationInbox.tsx`, `KeyboardShortcutsHelp.tsx`
- `LoginBriefing.tsx`, `OnboardingTooltips.tsx`

### Supporting Components
- `ContextMenu.tsx`, `LockedFeature.tsx`, `ModelPilotCard.tsx`, `ModelSelector.tsx`
- `WorkspaceBriefing.tsx`

### Hooks (12 custom hooks)
- `useWindowManager`, `useOverlayState`, `useKeyboardShortcuts`
- `useWorkspaces`, `useMemory`, `useEvents`, `useAgentStatus`
- `useNotifications`, `useOnboarding`, `useOfflineStatus`
- `useKnowledgeGraph`, `useWaggleDance`

---

## 12. Data Flow Architecture

```
Desktop (root state coordinator)
  |
  |-- useWorkspaces() --> workspaces, activeWorkspace, create/select/patch
  |-- useMemory(activeWorkspaceId) --> frames, filters, stats
  |-- useEvents(activeWorkspaceId) --> steps, filters
  |-- useAgentStatus() --> model, tokens, cost
  |-- useNotifications() --> notifications, unread, mark
  |-- useOnboarding() --> state, update, complete
  |-- useOfflineStatus() --> boolean
  |-- useKnowledgeGraph(activeWorkspaceId) --> nodes, edges
  |-- useWaggleDance() --> signals
  |-- useWindowManager(workspaces) --> windows, open/close/focus
  |-- useOverlayState() --> show/hide toggles
  |-- useKeyboardShortcuts(handlers) --> event listeners
```

All backend communication goes through `adapter` (in `@/lib/adapter`) which provides a consistent API abstraction layer. The adapter handles offline fallbacks gracefully throughout.

---

## 13. Conclusion

Waggle OS is an ambitious and well-executed desktop OS metaphor for AI agents. The visual design is distinctive (Hive DS with honey/dark-steel palette), the window management is polished, and the progressive disclosure model (tier-based dock, onboarding wizard, tooltips) is thoughtfully layered.

The core strengths are in the "workspace as OS" concept, the rich workspace briefing that leverages persistent memory, and the comprehensive keyboard-first interaction model. The chat experience with block rendering, tool cards, feedback, and pins goes significantly beyond a basic chat interface.

The main areas for investment are: accessibility (text sizes, contrast, responsive design), the knowledge graph visualization (currently too primitive for a memory-centric product), boot performance for returning users, and breaking up the larger monolithic components for maintainability.

The product effectively communicates its tier structure through feature gating without being pushy, and the KVARK enterprise upsell path is subtly woven into the experience rather than being in-your-face.
