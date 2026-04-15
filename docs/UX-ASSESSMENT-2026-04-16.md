# Waggle OS -- UX Assessment
**Date:** 2026-04-16
**Assessor:** Automated deep read of all primary UI surfaces
**Scope:** Boot, onboarding, daily use, engagement, accessibility, responsive

---

## 1. Executive Summary

- **The onboarding flow is thorough and well-structured** (8 steps, skip-friendly, tier-adaptive, auto-advance guards), but the sheer number of decisions asked before the user ever sees the product risks abandonment -- particularly at the template/persona/API-key gauntlet in steps 4-6.

- **The desktop metaphor is visually striking and functionally deep** (25 registered apps, tiered dock, window snapping, global search, keyboard shortcuts), yet for a first-time non-technical user the initial empty desktop with only a dock and a cryptic "Click an app in the dock" hint provides almost zero guidance on *what to do first*.

- **The memory/harvest/wiki/evolution subsystem is Waggle's crown jewel**, but it is buried behind 6 tiny toggle icons in the Memory app sidebar header, none of which have visible labels -- discoverability of the most differentiating features is near zero without prior knowledge.

---

## 2. User Journey Analysis

### 2.1 Boot Screen (BootScreen.tsx, 173 lines)

**What happens:** Logo animates in, 5 phase messages cycle at 400ms each ("Initializing core systems..." through "Ready."), progress bar fills, skip hint appears at 1s. Total auto-duration: ~2.5s.

**Strengths:**
- Skippable via click or any keypress -- respects impatient users.
- Phase messages create a sense of technical substance without actually blocking anything.
- Smooth spring animation on logo entry; glow pulse adds polish.

**Issues:**
- The boot screen fires on every app load, including page refreshes during development. There is no "seen before" gate. Returning users who open the app 5 times a day will see this 5 times.
- The 5 phase messages are pure theatre -- there is no actual async initialization gated behind them. The user waits 2+ seconds for nothing functional. Novel on first launch, irritating by day 3.
- "Connecting to hive network..." is misleading -- the app may be fully offline. There is no conditional messaging based on actual connection state.

### 2.2 Onboarding Wizard (OnboardingWizard.tsx, 438 lines + 8 sub-step components)

**What happens:** 8-step full-screen wizard: Welcome (auto-advance 3s) -> Why Waggle (value props) -> Tier selection -> Memory Import -> Template selection (15 templates) -> Persona selection (19 personas) -> API Key entry -> Ready (auto-advance 2s).

**Strengths:**
- Escape key dismisses at any point -- good keyboard a11y.
- Progress bar with `role="progressbar"` and proper ARIA attributes.
- Auto-advance on Welcome (step 0) and Ready (step 7) reduces friction for users who don't need to linger.
- Smart vault pre-check: if an API key already exists, step 6 is auto-skipped entirely.
- Template-to-persona auto-mapping reduces cognitive load.
- Step dots corrected to match "Step X of 6" label (previously showed 8 dots).

**Issues:**
- **Too many decisions before value (CRITICAL).** The user must choose a tier, potentially import data, pick a template, pick a persona, and enter an API key -- all before seeing a single chat message. This is the classic "long registration form" anti-pattern. A user who just wants to try the product has to make 3-5 consequential choices with zero context.
- **"Why Waggle" step is dead weight for users who already chose to install.** They downloaded the app; they know why they are here. This step should be first-run-only or skippable without counting as a full step.
- **Tier step is confusing.** The tier names (Simple/Professional/Full Control) map to dock layout complexity, not to billing tiers (Trial/Free/Pro/Teams/Enterprise). A user selecting "Professional" here might think they are choosing a paid plan. The relationship between dock tiers and billing tiers is never explained.
- **Template grid (15 items) + persona grid (19 items) back-to-back is overwhelming.** These two steps present 34 cards to scan, each with a name, icon, and one-line description. Users with decision fatigue will either pick randomly or abandon.
- **No undo/back navigation visible.** The wizard renders `goToStep()` handlers in sub-components, but there is no visible "Back" button in the shell. A user who picks the wrong template has no obvious path to correct it without restarting.
- **API Key step has no "skip for now" option.** If the vault pre-check does not find a key, the user *must* enter one or skip the entire onboarding. For users evaluating the product, this is a hard gate. The step auto-advances to finish if a key exists, but does not surface a "try without a key" option.
- **Auto-advance timers can be disorienting.** Step 0 auto-advances after 3s, step 7 after 2s. Users who read slowly may be yanked forward before they finish reading. There is no "pause auto-advance on hover" behavior.

### 2.3 Post-Onboarding: Desktop (Desktop.tsx, 430 lines)

**What happens:** Full-screen wallpaper with Waggle logo hero (when no windows open), status bar at top, tiered dock at bottom, overlays for global search / workspace switcher / persona switcher / notifications.

**Strengths:**
- The empty state is visually beautiful -- large logo, "Autonomous Agent OS" tagline, subtle gradient divider.
- Offline mode is clearly indicated with a pulsing "Offline" badge and a hover tooltip explaining queuing behavior.
- Window management is surprisingly complete: drag, snap (left/right/top), resize from all 8 edges, minimize, maximize, double-click toggle, cascade offset for multiple windows of the same type.
- Global search (`Ctrl+K`) searches across commands, workspaces, sessions, memories, and skills with fuzzy matching. This is a power-user delight.
- Keyboard shortcuts are comprehensive: `Ctrl+Shift+P` for persona, `Ctrl+Shift+W` for workspace switcher, `Ctrl+`` for window cycling.
- Trial days remaining shown in status bar with visual urgency (red badge when <=3 days).
- Login Briefing ("Good morning" modal with memory highlights and workspace summaries) is a genuinely warm returning-user experience.

**Issues:**
- **The first thing a new user sees after onboarding is... the empty desktop with a cryptic hint.** "Click an app in the dock" with a pulsing animation at the bottom. The dock itself shows icons without labels (labels appear on hover only). A non-technical user does not know that "Chat" is the app they want, or that the hexagonal icon means "Home."
- **25 apps is too many for any dock.** Even the "simple" tier shows 6 items; "power" tier shows 14 top-level entries. The zone-parent grouping ("Ops", "Extend") helps but requires a click to expand, and the tray that appears uses the same tiny icon + label pattern.
- **StatusBar information density is extreme.** Workspace name, model name, token count, cost in USD, trial badge, search icon, bell icon, online/offline indicator, date, and time -- all in a 32px-tall bar. On a 1280px-wide screen, this will truncate or wrap. On mobile, it is unusable.
- **Window z-index management lacks visual cue.** When multiple windows overlap, there is no shadow depth differentiation or opacity change to indicate which is "on top." All windows use the same `shadow-2xl` and `glass-strong` backdrop, making layering ambiguous.
- **No guided first action.** After onboarding completes, the OnboardingTooltips component shows 4-7 tips in a floating card near the dock. But these tips are context-free -- they reference slash commands and features the user has never seen. The tooltip "Type / for 22 powerful commands" means nothing when the user has not yet opened a chat window.

### 2.4 Chat App (ChatApp.tsx, 700+ lines)

**What happens:** Chat interface with persona picker, model picker, autonomy toggle, session sidebar, slash commands, file drag-and-drop, approval gates, feedback buttons, pin system, and workspace briefing for empty states.

**Strengths:**
- WorkspaceBriefing is an excellent empty state -- it shows greeting, memory count, pending tasks, recent decisions, "I Remember" highlights, recent conversations, cross-workspace hints, and suggested prompts. This is *much* better than a blank chat.
- Slash command palette with arrow-key navigation and filtering.
- Approval gate UI is clear: "Allow once" / "Always allow" / "Deny" with a "Show details" toggle for the raw JSON. The "Always allow" button includes a title explaining the persistence.
- File drag-and-drop with a full-screen drop zone overlay.
- Autonomy toggle (Normal/Trusted/YOLO) with countdown timer and per-level TTL options.
- Feedback buttons with categorized downvote reasons.
- Pin system for saving important messages.

**Issues:**
- **The chat header is overloaded.** Persona picker + storage type badge + team presence avatars + autonomy toggle + model picker + pin button -- all in a single row. On a 520px-wide default window, this will overflow or compress to illegibility.
- **Session sidebar toggle is a tiny ChevronDown icon with no label.** Users will not discover that session history exists unless they click this unlabeled control.
- **Persona picker inside chat duplicates the global PersonaSwitcher.** The chat header shows a mini persona picker (dropdown with all 22 personas), while `Ctrl+Shift+P` opens the full modal PersonaSwitcher. The two operate on different targets (window persona vs. workspace persona). This dual-path is confusing.
- **Slash command list shows 11 commands; the tooltip says "22 powerful commands."** The discrepancy creates distrust. Some commands are client-only (/clear, /model) while others are server-dispatched (/research, /draft). There is no visual distinction.
- **No message editing or deletion.** Once a message is sent, it cannot be edited or deleted. The only recovery is `/clear` which wipes the entire history.

### 2.5 Memory App (MemoryApp.tsx, 285 lines)

**What happens:** Left sidebar with search, filters (type, importance), and frame list. Right panel shows frame detail, knowledge graph, harvest, weaver, wiki, or evolution tab.

**Strengths:**
- Frame type icons (emoji-based) provide instant visual categorization.
- Importance dots with color coding (muted through destructive) give at-a-glance priority.
- Context menu on right-click (View Details, Copy Content, Delete).
- Knowledge graph viewer, harvest tab, weaver panel, wiki tab, and evolution tab are all accessible from the same app -- comprehensive memory exploration.

**Issues:**
- **The 6 toggle icons in the sidebar header are completely unlabeled.** Filter, Network, Download, Activity, BookOpen, Sparkles -- each is a 12x12px icon. Their meaning is discoverable only via title tooltip on hover. A user who does not hover over each one will never find the Knowledge Graph, Harvest, Weaver, Wiki, or Evolution features. These are Waggle's most differentiating capabilities.
- **No empty-state guidance.** When the user first opens Memory with zero frames, they see a Brain icon and "No memories found." There is no explanation of how memories get created, no link to the Harvest tab, no suggestion to start a conversation.
- **The main content area has no back button when viewing a frame.** Clicking a frame in the sidebar shows its detail in the right panel, but there is no way to "deselect" the frame and return to the empty state except by clicking a different frame.

### 2.6 Settings App (SettingsApp.tsx, 350+ lines visible)

**What happens:** Tab sidebar (General, Models, Billing, Permissions, Team, Backup, Enterprise, Advanced) with content panels.

**Strengths:**
- Tab sidebar uses `role="tablist"` and `aria-selected` for proper ARIA semantics.
- Feature-gated tabs show a Lock icon when the user's tier does not support them.
- Theme selector with visual preview swatches (not just text labels).
- Dock Experience selector with clear descriptions for each tier.
- Provider API key status with green/amber dot indicators.
- ModelPilotCard for default/fallback/budget model configuration with visual hierarchy.
- Telemetry toggle with event count and "Delete all data" option -- transparent privacy controls.

**Issues:**
- **No save confirmation feedback on the General tab.** The model tab has a "Saved" toast, but theme changes apply immediately without confirmation, and dock tier changes persist via hook. The user has no way to know if their settings were saved.
- **"Dock Experience" naming is opaque.** The relationship between "Simple / Professional / Full Control" and what actually changes in the UI is not shown. A before/after preview or a screenshot would make this choice meaningful.
- **8 tabs is a lot.** Team, Backup, Enterprise, and Advanced are rarely used. A "Show advanced" toggle that hides infrequently used tabs would reduce cognitive load.

### 2.7 Dashboard App (DashboardApp.tsx, 233 lines)

**What happens:** Workspace grid grouped by category (Personal, Work, Research), with persona avatars, template badges, memory counts, health dots, and a cross-workspace task list.

**Strengths:**
- Clean card layout with health status dots.
- Group filter tabs with workspace counts.
- Open tasks surfaced at workspace-agnostic level.
- Persona and template badges give immediate context.
- Empty state with "Create your first workspace" call-to-action.

**Issues:**
- **No sorting or searching.** With 10+ workspaces, the grid becomes unwieldy. There is no way to sort by last active, memory count, or name.
- **The "+ New" button is easy to miss** -- small, top-right, no emphasis styling beyond a primary-color background.
- **Workspace health dots are tiny (1.5x1.5) and use color alone** to convey status (green/amber/red). Colorblind users cannot distinguish these.

### 2.8 Dock (Dock.tsx, 156 lines)

**What happens:** macOS-style dock at bottom center. Items bounce on hover (scale 1.2, y -8). Active apps show a dot below. Zone parents open a tray popover above.

**Strengths:**
- Spring-physics hover animation is satisfying.
- Open app indicators (bottom dot) with differentiation for minimized apps (half opacity).
- Tiered configuration means new users see only 6 items, not 14.
- Tooltip labels on hover.
- Waggle Dance badge count for unread signals.
- Escape key closes tray popovers.

**Issues:**
- **No labels visible without hover.** For a desktop app where the dock is the primary navigation, requiring hover to discover what each icon does is a barrier. At minimum, a first-run mode should show labels beneath icons.
- **The "Spawn Agent" button at the dock end is unlabeled** (Rocket icon only) and separated by a divider. Its purpose is non-obvious.
- **Zone parent trays open above the dock** but have no arrow/caret pointing to the parent icon. On a large screen, the spatial relationship between the tray and its trigger is unclear.
- **Touch target size.** Dock items are `p-2` (8px padding) around a 24x24 icon = ~40x40px effective. WCAG 2.5.8 recommends 44x44px minimum for touch targets.

---

## 3. Top 10 UX Issues (Ranked by Impact)

### #1 -- Too Many Decisions Before First Value (Critical)
**Where:** Onboarding wizard, steps 2-6
**Impact:** New user abandonment. A user who just installed the app must choose a tier, consider importing data, pick from 15 templates, pick from 19 personas, and enter an API key before seeing a chat.
**Recommendation:** Default to the "Blank" template with "General Purpose" persona and skip straight to the Ready step. Offer template/persona selection as a post-first-chat upsell: "Want to try a specialized persona? Open the Persona Switcher."

### #2 -- Empty Desktop Provides No Guided First Action (High)
**Where:** Desktop.tsx, post-onboarding
**Impact:** Users who complete onboarding land on a beautiful but empty desktop. The only instruction is a dim, pulsing "Click an app in the dock" text. The chat window is not auto-opened. The onboarding should end with a chat window already open, cursor in the input field, and a suggested first prompt.
**Recommendation:** `onFinish` in the wizard already calls `wm.openChatForWorkspace()`, but the workspace briefing must load first. Ensure the chat window opens immediately and is focused.

### #3 -- Memory App Feature Discoverability Near Zero (High)
**Where:** MemoryApp.tsx, sidebar header icons
**Impact:** The Knowledge Graph, Harvest, Weaver, Wiki, and Evolution features -- Waggle's most differentiating capabilities -- are hidden behind 6 unlabeled 12px icons. A user who does not systematically hover over each icon will never find them.
**Recommendation:** Replace the icon-only toggles with a horizontal tab bar with text labels: "Timeline | Graph | Harvest | Weaver | Wiki | Evolution". Use a scrollable tab strip if width is constrained.

### #4 -- Dock Has No Visible Labels (Medium-High)
**Where:** Dock.tsx
**Impact:** Icon-only navigation requires memorization. New users must hover over every icon to discover what it does. The "simple" tier dock has 6 items, which is manageable, but the "power" tier has 14.
**Recommendation:** For first-time users (first 7 days or first 20 sessions), show text labels below dock icons. After that, collapse to icon-only with a setting to re-enable labels.

### #5 -- Status Bar Information Overload (Medium)
**Where:** StatusBar.tsx
**Impact:** 10+ data points in a 32px bar. Token count and USD cost are developer-centric metrics that mean nothing to a marketer or consultant.
**Recommendation:** Show only workspace name, trial status, and essential controls (search, notifications, connectivity) by default. Move token count and cost to a "developer mode" toggle or to the Telemetry app.

### #6 -- Chat Header Overloaded (Medium)
**Where:** ChatApp.tsx, header bar
**Impact:** Persona picker + storage badge + team presence + autonomy toggle + model picker all compete for space in a 520px-wide default window. Controls overflow or become illegibly small.
**Recommendation:** Collapse secondary controls (storage badge, autonomy toggle, model picker) into a "..." overflow menu. Show only persona name/avatar and the most critical control (autonomy level) by default.

### #7 -- Onboarding Tier Step Conflates Dock Layout with Billing Tier (Medium)
**Where:** OnboardingWizard step 2 (TierStep)
**Impact:** Users selecting "Professional" may believe they are committing to a paid plan. The dock tier names (Simple/Professional/Full Control) are different from the billing tier names (Trial/Free/Pro/Teams/Enterprise), creating confusion.
**Recommendation:** Rename the dock tiers to "Essential / Standard / Everything" or "Minimal / Balanced / Full" to clearly separate them from billing. Add a note: "This controls which tools appear in your dock. Your billing plan is separate."

### #8 -- No Back Button in Onboarding Wizard (Medium)
**Where:** OnboardingWizard.tsx
**Impact:** A user who picks the wrong template at step 4 has no visible way to go back to step 3. The `goToStep()` function exists and sub-steps may call it, but there is no universal "Back" button in the wizard shell.
**Recommendation:** Add a "Back" button to the left of the step indicator for steps 2-6. Disable on step 1.

### #9 -- Workspace Health Dots Rely on Color Alone (Low-Medium)
**Where:** DashboardApp.tsx
**Impact:** WCAG 1.4.1 failure. Colorblind users cannot distinguish healthy (green) from degraded (amber) from error (red) using the 1.5x1.5 dots.
**Recommendation:** Add shape differentiation: filled circle for healthy, triangle for degraded, X for error. Or add a text label on hover.

### #10 -- Boot Screen on Every Load (Low-Medium)
**Where:** BootScreen.tsx
**Impact:** The 2.5-second boot animation plays on every app load, including refreshes. Returning users have no way to disable it.
**Recommendation:** Show the boot screen only on first launch (store a `waggle:booted` flag in localStorage). On subsequent loads, skip directly to the desktop or show a brief 0.5s fade-in.

---

## 4. Top 5 Quick Wins (< 1 Hour Each)

### QW-1: Auto-Open Chat Window After Onboarding
**File:** `apps/web/src/components/os/Desktop.tsx`, `handleOnboardingFinish`
**Effort:** 15 minutes
**Change:** The handler already calls `wm.openChatForWorkspace()`. Verify that this runs immediately and that the chat window receives focus. If there is a race condition with workspace creation, add a retry. The user should never see the empty desktop after completing onboarding.

### QW-2: Add Text Labels to Memory App Feature Tabs
**File:** `apps/web/src/components/os/apps/MemoryApp.tsx`, lines 96-137
**Effort:** 30 minutes
**Change:** Replace the 6 icon-only toggle buttons with a horizontal scrollable tab bar: `["Timeline", "Graph", "Harvest", "Weaver", "Wiki", "Evolution"]`. Each tab shows icon + text label. Active tab has primary color underline. This alone surfaces Waggle's most powerful features.

### QW-3: Skip Boot Screen on Return Visits
**File:** `apps/web/src/components/os/BootScreen.tsx`
**Effort:** 15 minutes
**Change:** Check `localStorage.getItem('waggle:boot-seen')` on mount. If present, call `onComplete()` immediately (or after a 300ms fade-in). Set the flag after first boot completes. Add a "Show boot animation" toggle in Settings > General for users who enjoy it.

### QW-4: Add "Back" Button to Onboarding Wizard
**File:** `apps/web/src/components/os/overlays/OnboardingWizard.tsx`, bottom of content area
**Effort:** 20 minutes
**Change:** In the wizard shell (not per-step), render a "Back" button that calls `goToStep(step - 1)` when `step >= 2 && step <= 6`. Position it to the left of the step indicator in the top bar. Hide on steps 0, 1, and 7.

### QW-5: Rename Dock Tiers to Avoid Billing Confusion
**Files:** `apps/web/src/components/os/overlays/onboarding/constants.ts` + `apps/web/src/components/os/apps/SettingsApp.tsx`
**Effort:** 15 minutes
**Change:** Rename: "Simple" -> "Essential", "Professional" -> "Standard", "Full Control" -> "Everything". Update `TIER_OPTIONS` in constants.ts and the `<select>` in SettingsApp.tsx. Add subtitle in the onboarding tier step: "This controls your dock layout, not your billing plan."

---

## 5. Engagement Strategy Recommendations

### 5.1 Memory as the Hook -- Surface It Earlier
The memory system is Waggle's moat: persistent recall across sessions, knowledge graphs, harvest from other AI platforms, wiki compilation. But a new user will not discover any of this until they manually open the Memory app and hover over tiny icons.

**Recommendation:** After the user's first 5 messages in a chat session, show a non-modal toast: "I just remembered something from our conversation. Open Memory to see what I've learned." Link directly to the Memory timeline view. This creates an "aha moment" that demonstrates persistent memory without requiring the user to seek it out.

### 5.2 The WorkspaceBriefing Is Underused
The WorkspaceBriefing component (shown when a chat has no messages) is one of the best UX elements in the entire app -- it shows pending tasks, recent decisions, "I Remember" highlights, cross-workspace hints, and suggested prompts. But it disappears the moment the user sends their first message and never comes back.

**Recommendation:** Make the briefing accessible as a sidebar or header section that can be collapsed/expanded. Show a "Briefing" icon in the chat header that re-opens it. This turns the briefing from a one-shot empty state into a persistent productivity dashboard.

### 5.3 Progressive Feature Unlocking
The tiered dock is a good start, but users on the "Simple" tier may never discover features like the Knowledge Graph, Room, or Waggle Dance because they are not in their dock.

**Recommendation:** After 10 chat sessions, show a non-intrusive nudge: "You've been using Waggle for a while. Want to unlock more tools? Switch to Standard mode in Settings." Provide a one-click upgrade link. After 50 sessions, suggest "Everything" mode.

### 5.4 LoginBriefing as Daily Re-Engagement
The LoginBriefing component is excellent -- "Good morning" greeting with memory highlights and workspace summaries. It feels like a colleague catching you up. But it is gated behind `showLoginBriefing` state and the user can dismiss it once and never see it again.

**Recommendation:** Show the LoginBriefing on every app launch (not just after onboarding completion). Allow the user to dismiss it per-session, but reset the flag on next launch. Add a "Don't show again" checkbox for users who find it annoying. This daily "I remember..." moment reinforces the memory moat.

### 5.5 Harvest as Onboarding Differentiator
The Memory Import step in onboarding (step 3) offers ChatGPT and Claude import. This is a powerful differentiator: "Bring your AI history with you." But it is presented as an optional step that many users will skip.

**Recommendation:** Move the harvest pitch to step 2 (replace or merge with "Why Waggle"). Frame it as: "Waggle remembers everything -- including conversations from other AI tools. Import your history from ChatGPT, Claude, Gemini, or Perplexity to get started with a brain that already knows you." Make it the *reason* to complete onboarding, not an optional detour.

### 5.6 Gamification of Memory Growth
Users have no visibility into how their memory corpus is growing. The stats in the Memory app sidebar (`X of Y frames`) are passive and easy to ignore.

**Recommendation:** Add a "Memory Score" or "Brain Health" metric to the Dashboard and StatusBar. Show a simple progress indicator: "Your AI has learned 47 things about your work." Celebrate milestones: "100 memories! Your AI is getting smarter." This creates a virtuous loop where users *want* to use the product more because it visibly gets better.

### 5.7 Suggested Next Actions
After the AI responds in chat, there is no suggestion for what to do next. The user must always initiate.

**Recommendation:** After each assistant response, show 2-3 contextual follow-up buttons below the message: "Go deeper", "Save this as a task", "Share to another workspace." These reduce friction for the next action and keep the user in a flow state.

---

## Appendix: Accessibility Notes (Beyond Existing Audit)

| Area | Finding | WCAG Criterion |
|---|---|---|
| Boot screen | No skip link for screen readers; keyboard skip works but is not announced | 2.1.1 Keyboard |
| Dock | Touch targets ~40x40px, below 44px minimum | 2.5.8 Target Size |
| Window title bar | Minimize/maximize buttons are color-only circles with no icon | 1.4.1 Use of Color |
| PersonaSwitcher | Locked persona cards use `grayscale` + `cursor-not-allowed` but no `aria-disabled` | 4.1.2 Name, Role, Value |
| Settings | Toggle switch for telemetry has no `role="switch"` or `aria-checked` | 4.1.2 Name, Role, Value |
| Dashboard | Health dots use color alone (green/amber/red) with no shape/text alternative | 1.4.1 Use of Color |
| Chat | Feedback reasons dropdown has no focus trap; arrow keys not supported | 2.1.1 Keyboard |
| Global Search | `role="dialog"` is missing on the search overlay | 1.3.1 Info and Relationships |
| Memory App | Importance range slider uses native `<input type="range">` with no ARIA label | 1.3.1 Info and Relationships |

## Appendix: Responsive / Mobile Notes

Waggle is a desktop Tauri application, so mobile is secondary. However, the web app (`apps/web`) can also be served via browser, and responsive gaps exist:

| Component | Issue |
|---|---|
| Desktop.tsx | `w-screen h-screen` fixed layout with no responsive breakpoints. On tablet or small laptop, windows overlap the dock. |
| AppWindow.tsx | Minimum window size is 320x240, but the default sizes (e.g., 640x520) exceed mobile viewport. No mobile-specific layout. |
| Dock.tsx | `fixed bottom-3 left-1/2` -- on a 375px-wide screen, the "power" dock (14 items) overflows horizontally. No scrolling or wrapping. |
| StatusBar.tsx | All 10+ items in a single `flex` row. No responsive hiding. Below ~900px width, items will overlap or wrap into the next line. |
| ChatApp.tsx | Session sidebar is 192px fixed width. On a 520px window, this leaves 328px for the chat -- barely usable. |
| OnboardingWizard | Template grid uses no responsive column count. 15 cards in a fixed layout will require extensive scrolling on a small screen. |
| DashboardApp.tsx | Uses `sm:grid-cols-2` -- the only component in the OS layer with a responsive breakpoint. |

---

*Assessment based on static code analysis of the 9 primary UI files plus supporting components. Runtime behavior may differ from code inspection in areas involving async state, server availability, and Tauri-specific rendering.*
