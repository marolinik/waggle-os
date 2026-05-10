# Waggle UI/UX Component Inventory — OS Shell / Desktop App (`apps/web`)

**Date:** 2026-04-29
**Surface:** Tauri 2.0 native window hosting a macOS-paradigm desktop with 25 OS apps + dock + menubar + ⌘K palette
**Repo path:** `D:/Projects/waggle-os/apps/web`
**Sibling inventory:** Marketing landing (`apps/www`) lives in `briefs/2026-04-29-ui-ux-inventory-landing.md`. The two surfaces share **only the token vocabulary**; chrome paradigms, tech stacks, and component models diverge.

**Purpose:** Brief Claude Design (explore + research mode) on the current OS shell UI/UX state so it can produce a polish pass without re-discovering the surface area.

**Reading order for Claude Design:**
1. §1 — Tech stack and entry point
2. §2 — Chrome layer (menubar / dock / windows / desktop)
3. §3 — 25 OS apps inventory
4. §4 — 13 overlays inventory
5. §5 — shadcn/ui primitive library
6. §6 — Hooks (state surface)
7. §7 — Paradigm correction status
8. §8 — Texture opacity ramp + bee usage rules
9. §9 — Design tokens (shared with landing)
10. §10 — Drift and polish opportunities
11. §11 — Source artifacts to read
12. §12 — Suggested polish-pass briefing shape

---

## §1. Tech stack — actual

- **Build:** Vite + React + Tailwind
- **Tailwind config:** `apps/web/tailwind.config.ts` (configured)
- **Component library:** shadcn/ui (60+ primitives in `apps/web/src/components/ui/`)
- **Animation:** `framer-motion`
- **Icons:** `lucide-react`
- **State pattern:** custom hooks (`hooks/useWindowManager`, `useWaggleDance`, `useKnowledgeGraph`, `useOnboarding`, `useToast`, etc.)
- **Tauri adapter:** `apps/web/src/lib/adapter.ts` (web ↔ Tauri stub)
- **Entry:** `apps/web/src/main.tsx` → `App.tsx` → `pages/Index.tsx` → `os/Desktop.tsx`
- **Router:** Single-page; routes are app windows opened via dock/⌘K, not URL paths
- **Wallpaper assets:** `apps/web/src/assets/wallpaper.jpg` (dark) + `wallpaper-light.jpg`
- **Logo asset:** `apps/web/src/assets/waggle-logo.jpeg` (dark) + `.png` (light)

---

## §2. Chrome layer — `apps/web/src/components/os/`

These define the macOS-paradigm shell that wraps every app window. The `Desktop.tsx` component (497 LOC) is the orchestrator and imports every app + every overlay.

| Component | File | LOC | Role |
|---|---|---|---|
| `Desktop` | `Desktop.tsx` | 497 | Top-level shell — wallpaper, window manager host, app config map (per-app title / icon / position / size), overlay coordination, status bar focus context |
| `Dock` | `Dock.tsx` | 170 | Tier-aware dock with zone-based trays (`getDockForTier(tier, billingTier)` from `lib/dock-tiers.ts`). Handles open/minimized indicators, escape-to-close, dock labels via `useDockLabels` (visible while user is "new": <20 sessions OR <7 days installed, OR pinned in Settings) |
| `DockTray` | `DockTray.tsx` | — | Tray panel that pops out from a dock zone; outside-click + Escape dismissal |
| `AppWindow` | `AppWindow.tsx` | — | Draggable / resizable / minimize / maximize panel — traffic-light controls left per macOS convention, focus + z-order via `useWindowManager` |
| `StatusBar` | `StatusBar.tsx` | — | Top bar — status cluster (provider pill, cost meter, policy indicator, clock, ⌘K trigger). Focus context wired via `lib/status-bar-focus.ts` |
| `BootScreen` | `BootScreen.tsx` | — | Tauri cold-boot splash |
| `ContextMenu` | `ContextMenu.tsx` | — | Right-click menus on dock + windows |
| `ErrorBoundary` | `ErrorBoundary.tsx` | — | Per-app crash containment (mounted as `AppErrorBoundary`) |
| `LockedFeature` | `LockedFeature.tsx` | — | Tier-gate stub for features above current billing tier |
| `ModelSelector` | `ModelSelector.tsx` | — | LLM provider picker |
| `ModelPilotCard` | `ModelPilotCard.tsx` | — | Model presence card |
| `WorkspaceBriefing` | `WorkspaceBriefing.tsx` | — | Workspace landing card surfaced after switch |

**Per-app config shape** (extracted from `Desktop.tsx:75–80`):

```ts
const appConfig: Record<AppId, {
  title: string;
  icon: React.ReactNode;
  pos: { x: number; y: number };
  size: { w: string; h: string };
}> = {
  "chat":      { title: "Waggle Chat", icon: <MessageSquare className="w-3.5 h-3.5 text-primary" />,
                 pos: { x: 180, y: 40 }, size: { w: "520px", h: "520px" } },
  "dashboard": { title: "Dashboard",   icon: <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />,
                 pos: { x: 100, y: 60 }, size: { w: "560px", h: "440px" } },
  // ... 23 more entries
};
```

**Window default positions are hand-picked per app**, with cascade from `getSavedPosition(appId)` for restored sessions. Polish opportunity: review the cascade pattern, smart-stacking when N≥3 windows open.

---

## §3. OS Apps — `apps/web/src/components/os/apps/` (25 implemented)

The DS audit v2 references "24 OS Apps" per `docs/WAGGLE-SYSTEM-VISUAL.html:684`. Current count is **25 top-level components** plus 6 sub-folders for app internals.

### §3.1 Top-level app components

| # | Component file | App id (likely) | Per DS-audit MVP first-launch dock? |
|---|---|---|---|
| 1 | `ChatApp.tsx` + `ChatWindowInstance.tsx` | `chat` | ✅ |
| 2 | `DashboardApp.tsx` | `dashboard` | (Cockpit superset) |
| 3 | `CockpitApp.tsx` | `cockpit` | ✅ |
| 4 | `MemoryApp.tsx` | `memory` | ✅ |
| 5 | `AgentsApp.tsx` | `agents` | ✅ |
| 6 | `RoomApp.tsx` | `room` (multi-agent) | ✅ likely |
| 7 | `WaggleDanceApp.tsx` | `waggle-dance` | ✅ likely |
| 8 | `MissionControlApp.tsx` | `mission-control` | (probably gated) |
| 9 | `ConnectorsApp.tsx` | `connectors` | (Providers superset) |
| 10 | `CapabilitiesApp.tsx` | `capabilities` | (Skills/policy area) |
| 11 | `MarketplaceApp.tsx` | `marketplace` | |
| 12 | `FilesApp.tsx` + `FilesAppTabs.tsx` | `files` | ✅ |
| 13 | `VaultApp.tsx` | `vault` | |
| 14 | `EventsApp.tsx` | `events` | |
| 15 | `TimelineApp.tsx` | `timeline` | |
| 16 | `TelemetryApp.tsx` | `telemetry` | |
| 17 | `BackupApp.tsx` | `backup` | |
| 18 | `SettingsApp.tsx` | `settings` | ✅ |
| 19 | `UserProfileApp.tsx` | `user-profile` | |
| 20 | `ApprovalsApp.tsx` | `approvals` | |
| 21 | `ScheduledJobsApp.tsx` | `scheduled-jobs` | |
| 22 | `TeamGovernanceApp.tsx` | `team-governance` | (Teams tier) |
| 23 | `VoiceApp.tsx` | `voice` | |

### §3.2 Sub-folders (per-app internals)

`apps/web/src/components/os/apps/` contains these sub-folders with per-app sub-components:

- `agents/` — Agents app sub-components
- `chat-blocks/` — Chat message block primitives
- `cockpit/` — Cockpit dashboard widgets
- `connectors/` — Connector configuration UI
- `files/` — Files app sub-components
- `memory/` — Memory app sub-components

### §3.3 Apps named in DS audit v2 not directly visible as top-level files

These may live under sub-folders, may be planned/missing, or may be merged into existing apps. Polish step: reconcile against `apps/web/src/lib/dock-tiers.ts` to confirm the canonical AppId set.

`Graph`, `Provenance`, `Providers`, `Policy`, `Preferences`, `Wiki`, `Skills`, `Scopes`, `Tasks`, `Audit`, `Prompts`, `Search` (separate from `GlobalSearch` overlay), `Terminal`, `Notes`, `Export`, `About`.

DS audit v2 §"Apps za MVP prvi launch" calls for 12 apps in MVP dock: Cockpit, Memory, Graph, Agents, Chat, Provenance, Providers, Policy, Preferences, Settings, Files, Wiki. Reconciliation needed: of these 12, only **Cockpit, Memory, Agents, Chat, Settings, Files** map cleanly to existing top-level files. Graph / Provenance / Providers / Policy / Preferences / Wiki are missing or aliased.

---

## §4. Overlays — `apps/web/src/components/os/overlays/` (13 components)

System-level layer between windows and ⌘K palette. Per DS audit v2: "OVERLAYS LAYER — između window-a i palette-a, za OnboardingWizard, modal dialogs, toast notifications, global alerts."

| Component | File | Role |
|---|---|---|
| `GlobalSearch` | `GlobalSearch.tsx` | **⌘K Spotlight equivalent** — launch app, search memory, invoke command. DS audit v2 confirms this survives paradigm shift unchanged. |
| `OnboardingWizard` | `OnboardingWizard.tsx` + `onboarding/` subfolder | First-run guided tour |
| `OnboardingTooltips` | `OnboardingTooltips.tsx` | Contextual onboarding tooltips |
| `LoginBriefing` | `LoginBriefing.tsx` | Post-login briefing card; dismissed via `lib/login-briefing.ts` `writeLoginBriefingDismissed()` |
| `WorkspaceSwitcher` | `WorkspaceSwitcher.tsx` | Switch active workspace |
| `CreateWorkspaceDialog` | `CreateWorkspaceDialog.tsx` | New workspace creator |
| `PersonaSwitcher` | `PersonaSwitcher.tsx` | Active persona switcher |
| `SpawnAgentDialog` | `SpawnAgentDialog.tsx` | Spawn-agent shortcut from dock |
| `NotificationInbox` | `NotificationInbox.tsx` | Notification center |
| `KeyboardShortcutsHelp` | `KeyboardShortcutsHelp.tsx` | `?` overlay listing shortcuts |
| `ContextRail` | `ContextRail.tsx` | Side rail for active-app context (KG, memory frames, etc.); typed `ContextRailTarget` |
| `UpgradeModal` | `UpgradeModal.tsx` | Tier-gate upgrade prompt |
| `TrialExpiredModal` | `TrialExpiredModal.tsx` | Trial expiration prompt |

Sub-folder: `onboarding/` contains additional onboarding-specific components.

---

## §5. shadcn/ui primitive library — `apps/web/src/components/ui/`

Full shadcn surface installed (60+ components):

`accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hint-tooltip`, `hover-card`, `input`, `input-otp`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `toggle`, `toggle-group`, `tooltip`.

**Polish implication:** the design system primitives are already standardized via shadcn. The polish pass operates one layer up — composed components, density, state coverage, motion, micro-interactions. Do not re-author primitives.

---

## §6. Hooks — state surface (visible from `Desktop.tsx`)

These hooks model the live application state. Knowing them helps Claude Design design loading / empty / error states with the actual data shapes available.

| Hook | Purpose |
|---|---|
| `useWorkspaces` | Workspace list + active workspace |
| `useMemory` | Memory frames, search, tag, edit |
| `useEvents` | Event stream |
| `useAgentStatus` | Per-agent status (idle / running / done / error) |
| `useNotifications` | Notification feed |
| `useKeyboardShortcuts` | Global keymap |
| `useOnboarding` | First-run flow state |
| `useOfflineStatus` | Connectivity state for graceful degrade |
| `useKnowledgeGraph` | Bitemporal KG nodes + edges |
| `useWaggleDance` | Multi-agent orchestration sessions |
| `useWindowManager` | `WindowState` map, focus, z-order, minimize, maximize |
| `useOverlayState` | Active overlay tracking |
| `useDockNudge` | Dock attention nudges |
| `useDockLabels` | Show/hide dock icon labels (new-user heuristic) |
| `useToast` | Toast notification dispatch |
| `useMobile` | `apps/web/src/hooks/use-mobile.tsx` viewport detection (note: app is desktop-first inside Tauri; mobile responsiveness is a stretch goal) |

---

## §7. Paradigm correction status (DS audit v2, 2026-04-23)

Per `briefs/2026-04-23-ds-audit-v2-macOS-paradigm-correction.md`, the previous DS mockup (left HIVE/SCOPES/SETTINGS sidebar + central Memories canvas) was diagnosed as Linear/Notion SaaS dashboard, NOT operating system. The correction calls for a macOS-style chrome inside the Tauri native window.

| Paradigm element | Required state | Implementation evidence |
|---|---|---|
| Menubar (top, fixed) | Logo + system menus (File / Edit / View / Window / Help) + status cluster (provider pill / cost meter / policy / clock / ⌘K) | `StatusBar.tsx` exists; **verify menu items wired** |
| Dock (24 apps, bottom or side-left, toggleable) | Hover tooltip with app name, running indicator dot, magnification (optional but preferred), separator between system + user-pinned, right-click context menu | `Dock.tsx` (170 LOC) + `DockTray.tsx` present, tier-filtered via `dock-tiers.ts`. **Magnification — verify.** |
| App windows | Draggable / resizable / minimize / maximize, traffic-lights LEFT per macOS, multi-window z-order with focus, window shadow + subtle border-radius | `AppWindow.tsx` + `useWindowManager` hook live |
| Desktop background | Honeycomb texture **PROMINENT 25–35%**, blend-mode overlay or soft-light on dark base — brand-defining canvas, per-scope wallpaper later | `wallpaper.jpg` + `wallpaper-light.jpg` present; **opacity verification needed** |
| ⌘K palette | Modal layer above windows, launch app / search memory / invoke command — DS audit explicitly says preserves visual quality from prior design | `GlobalSearch.tsx` overlay present, polished |
| Overlays layer | Between windows and palette: OnboardingWizard, modals, toasts, global alerts | 13 overlays implemented |

### §7.1 What was rejected from prior DS mockup (per audit)

- Left HIVE / SCOPES / SETTINGS sidebar — **rejected**. Scopes are filters per-window, Settings is an app, HIVE elements are 4 separate dock icons.
- Central single-canvas Memories surface as "main view" — **rejected**. Memory is one app among many; user can have 3–4 windows open simultaneously.
- Fixed left sidebar always-visible pattern — **rejected**. macOS sidebar lives inside an app window (e.g., Files-style sidebar), never globally.

### §7.2 What survives the shift

- Design tokens (dark-first palette, honey accent, typography, spacing, radii, elevation)
- ⌘K palette component (already polished)
- Bee textures + persona artwork — **landing-only**, never injected into app chrome
- Typography + voice (bee/hive/honey metaphor preserved, redistributed to dock tooltips and empty-state copy)

---

## §8. Texture opacity ramp + bee usage rules (DS audit v2 LOCKED)

### §8.1 Honeycomb texture opacity ramp

| Surface | Opacity | Blend mode | Rationale |
|---|---|---|---|
| Desktop background (behind all windows) | **25–35%** | overlay or soft-light on dark base | Brand-defining canvas — this is where the texture should sing |
| App window background (inside content area) | **4–8%** | normal | Subtle hint of brand without harming density |
| Empty states inside an app window | **15–20%** | normal | Combined with persona illustration |
| Menubar / Dock chrome | **0–3%** | — | Chrome must stay clean for legibility |

### §8.2 Bee usage rules in OS shell

Per DS audit v2 §"Šta ostaje iz trenutnog DS rada": **bees are landing-only.** In the OS shell, bee illustrations are reserved for:

- **Loading skeletons** (sparingly — when content is loading from disk/network)
- **404 / error states** (Confused bee illustration)
- Optional **small monochrome footer brand mark** (as on landing — but not standard in app chrome)

**Forbidden in OS shell:**
- Bee mascots in dock icons (use `lucide-react` for app icons)
- Bee mascots in app window chrome
- Bee names as UI command aliases (Opcija 3 dual-layer compliance)
- Persona bee artwork inside any app

The `preview/bees.html` static reference page (currently broken per DS audit v2) should be repaired as a 13-bee static grid for DS reference only — not user-facing.

---

## §9. Design tokens — shared with landing

The OS shell uses the same token vocabulary as the landing but composes via Tailwind utilities (config in `apps/web/tailwind.config.ts`) rather than direct CSS custom properties.

### §9.1 Color (locked palette — same as landing)

```
/* Hive neutral ladder — 12 stops */
--hive-50  #f0f2f7     --hive-500 #3d4560     --hive-850 #11141c
--hive-100 #dce0eb     --hive-600 #2a3044     --hive-900 #0c0e14
--hive-200 #b0b7cc     --hive-700 #1f2433     --hive-950 #08090c   /* canonical dark ground */
--hive-300 #7d869e     --hive-800 #171b26
--hive-400 #5a6380

/* Honey accent ladder */
--honey-300 #fcd34d
--honey-400 #f5b731
--honey-500 #e5a000   /* primary CTA fill, active dock app indicator */
--honey-600 #b87a00

/* Status accents (sparingly) */
--status-ai      #a78bfa   /* violet — synthesis, AI activity, coordinator pulse */
--status-healthy #34d399   /* mint — done, healthy, success states */

/* Glow + elevation */
--honey-glow     rgba(229, 160, 0, 0.12)
--honey-pulse    rgba(229, 160, 0, 0.06)
--shadow-honey   0 0 24px rgba(229,160,0,0.12), 0 0 4px rgba(229,160,0,0.08)
--shadow-elevated 0 4px 16px rgba(0,0,0,0.5),  0 2px 4px rgba(0,0,0,0.3)
```

**Locked palette:** honey + violet + mint. **NO blue** — explicit anti-pattern.

In Tailwind utilities you'll see semantic aliases (e.g., `text-primary` for honey, `text-amber-300` for memory accent, `text-sky-400` for dashboard, `text-cyan-400` for events, `text-muted-foreground` for chrome). The semantic palette **must collapse** to the locked honey/violet/mint set; anything else is a drift candidate.

### §9.2 Typography

- Primary: `Inter` variable, 400–700
- Code / paths / tool names: `JetBrains Mono`
- Window title bar: minimalistic, dense, single-line
- Dock tooltip: small, condensed
- Empty-state text: 16–18px body with subtle muted-foreground

### §9.3 Motion

- Active dock indicator: honey accent dot
- Window focus: subtle shadow + border lift
- Coordinator agent status (Multi-Agent Room context): violet pulse for synthesis, mint check for done, honey ring for active
- `framer-motion` available for richer transitions but use sparingly

### §9.4 Iconography

- Primary library: `lucide-react` (consistent with landing)
- App icons: `MessageSquare` (Chat), `LayoutDashboard` (Dashboard), `Settings`, `Brain` (Memory), `Activity` (Events), `Package`, `Radio`, `Zap`, `FolderOpen` (Files), `Bot`, `Lock`, `UserCircle`, `Plug` (Connectors), `Clock`, `Store` (Marketplace), `Mic` (Voice), `Users` (Team), `Shield` — all `lucide-react`
- Dock icon size: small (`w-3.5 h-3.5` per `Desktop.tsx` config map)

---

## §10. Drift and polish opportunities (OS shell-only)

### §10.1 Critical drift (paradigm-blocking)

1. **Texture opacity unverified.** DS audit v2 specifies 25–35% on desktop background — this is the single highest-leverage brand moment. Verify current state of `wallpaper.jpg` overlay; tune if mismatched.
2. **Missing apps from canonical 24-list.** Top-level component files do not include explicit `Graph`, `Provenance`, `Providers`, `Policy`, `Preferences`, `Wiki`, `Audit`, `Prompts`, `Search`, `Terminal`, `Notes`, `Export`, `About`. Reconcile against `lib/dock-tiers.ts` — some may live in sub-folders or be aliased to existing apps.
3. **Window state matrix coverage.** DS audit v2 calls for 5 distinguishable window states (normal / focused / blurred / minimized-preview / maximized). Verify `AppWindow.tsx` renders all five with clear visual differentiation.
4. **Dock magnification.** DS audit v2 says "opciono ali poželjno" (optional but preferred). Verify whether implemented; consider adding for macOS-grammar fidelity.
5. **Menubar menu items.** DS audit calls for system menus (File / Edit / View / Window / Help). `StatusBar.tsx` exists but verify menu content is wired — many Tauri apps stub menubars.

### §10.2 Important drift (polish-grade)

6. **Empty states across all 25 apps.** DS audit v2 specifies persona-illustration accompaniment + 15–20% texture in empty states. Most app components likely lack this; audit per-app.
7. **Loading skeletons.** Sanctioned non-landing bee usage (per §8.2). Verify per-app loading states use `bee-*-dark.png` mascots in skeletons.
8. **Status bar density.** DS audit v2: "Visina ~28-32px. Tanka, elegantna, bez texture." Verify height + texture-zero.
9. **Window title bar layout.** macOS convention: traffic-lights LEFT, title CENTER, app-specific controls RIGHT. Verify `AppWindow.tsx` matches.
10. **Z-order on focus.** When user clicks a window, it should raise to top. Verify via `useWindowManager`.
11. **Dock running indicators.** Open vs minimized vs running-but-not-focused — three distinct states needed. Verify `Dock.tsx` indicator logic against `openApps` + `minimizedApps` props.
12. **Per-app sub-components.** Six sub-folders exist (`agents/`, `chat-blocks/`, `cockpit/`, `connectors/`, `files/`, `memory/`). Other apps may need similar sub-component organization for density and feature growth.

### §10.3 Polish-only (no architectural change)

13. **Coordinator/synthesis pulse** — violet pulse for AI activity (per locked palette + Multi-Agent Room spec). Verify usage in `AgentsApp` + `RoomApp` + `WaggleDanceApp`.
14. **Mint check on done states** — uniform across all async-status surfaces (events, schedules, jobs, approvals).
15. **Honey ring on active app indicator in dock** — verify `Dock.tsx` uses `--honey-500` accent.
16. **`framer-motion` usage audit** — consistent easing, durations, no scroll-triggered storytelling, respect `prefers-reduced-motion`.
17. **Window cascade pattern** — when user opens 3+ windows, smart-stack vs hand-picked positions; review `getSavedPosition()` recall behavior.
18. **Tier-gate visuals** — `LockedFeature` component + `UpgradeModal` + `TrialExpiredModal`. Verify visual consistency and friendly copy that doesn't shame the user.
19. **Onboarding flow** — `OnboardingWizard` + `OnboardingTooltips` + `LoginBriefing` overlap. Audit for redundancy.
20. **Keyboard shortcuts inventory** — `KeyboardShortcutsHelp` overlay + `useKeyboardShortcuts` hook. Verify completeness.
21. **Notification center** — `NotificationInbox` density, dismiss patterns, unread states.
22. **Context rail** — `ContextRail.tsx` is a side rail for active-app context (KG, memory frames). Audit visual integration with each app, especially Chat / Memory / Agents.
23. **`bees.html` reference broken** — DS audit v2 carry-over: static 13-bee grid for DS reference page needs repair (currently blank).
24. **Light mode wallpaper** — `wallpaper-light.jpg` exists; light mode is v3 stretch goal per landing v2.3, but if implemented in shell, ensure tokens flip correctly.

---

## §11. Source artifacts for Claude Design (priority-ranked)

### §11.1 Canonical (read in full)

1. `D:/Projects/PM-Waggle-OS/briefs/2026-04-23-ds-audit-v2-macOS-paradigm-correction.md` — 12KB, **OS shell paradigm correction with paste-ready DS chat prompt** for menubar / dock / windows / desktop / palette / overlays. Authoritative for the chrome.
2. `D:/Projects/waggle-os/docs/WAGGLE-SYSTEM-VISUAL.html` — architectural diagram referenced by DS audit v2 (lines 679, 684, 689, 698 cited as evidence for desktop paradigm + 24 apps).
3. `D:/Projects/PM-Waggle-OS/briefs/2026-04-23-ds-audit-honeycomb-and-stubs-findings.md` — 10KB, v1 audit (now superseded by v2). Useful for understanding what was rejected and why.

### §11.2 Supporting (skim or query)

4. `D:/Projects/waggle-os/CLAUDE.md` — repo-level instructions, persona canonical lists.
5. `D:/Projects/waggle-os/docs/ARCHITECTURE.md` — package structure, MultiMind layer, KnowledgeGraph SCD-2, IdentityLayer, AwarenessLayer.
6. `D:/Projects/PM-Waggle-OS/decisions/2026-04-22-h-audit-1-design-ratified.md` — design ratification decision log.

### §11.3 Repo references (verify against)

- `D:/Projects/waggle-os/apps/web/src/components/os/` — OS chrome (12 components).
- `D:/Projects/waggle-os/apps/web/src/components/os/apps/` — 25 OS apps + 6 sub-folders.
- `D:/Projects/waggle-os/apps/web/src/components/os/overlays/` — 13 overlays + `onboarding/` sub-folder.
- `D:/Projects/waggle-os/apps/web/src/components/ui/` — 60+ shadcn primitives.
- `D:/Projects/waggle-os/apps/web/src/lib/dock-tiers.ts` — **canonical AppId list + tier filtering rules** (read this to confirm 24-app canonical set).
- `D:/Projects/waggle-os/apps/web/src/lib/adapter.ts` — Tauri ↔ web adapter.
- `D:/Projects/waggle-os/apps/web/src/lib/window-positions.ts` — window position persistence.
- `D:/Projects/waggle-os/apps/web/src/lib/status-bar-focus.ts` — status bar focus context.
- `D:/Projects/waggle-os/apps/web/src/lib/login-briefing.ts` — login briefing dismissal state.
- `D:/Projects/waggle-os/apps/web/src/hooks/` — full hooks directory (15+ hooks listed in §6).
- `D:/Projects/waggle-os/apps/web/tailwind.config.ts` — Tailwind config.
- `D:/Projects/waggle-os/apps/web/src/pages/Index.tsx` — page entry.

### §11.4 Brand asset references

- `D:/Projects/waggle-os/apps/web/src/assets/wallpaper.jpg` (dark) + `wallpaper-light.jpg` — desktop background.
- `D:/Projects/waggle-os/apps/web/src/assets/waggle-logo.jpeg` (dark) + `waggle-logo.png` (light) — menubar logo.
- 13 × `bee-*-dark.png` from landing brand folder — sanctioned only for loading skeletons + 404 page in OS shell (NOT in chrome).

---

## §12. Polish-pass instruction shape (suggested briefing for Claude Design)

> Audit Waggle's OS shell (`D:/Projects/waggle-os/apps/web`) against the DS audit v2 macOS-paradigm correction (`briefs/2026-04-23-ds-audit-v2-macOS-paradigm-correction.md`). Verify the chrome layer (menubar / dock / windows / desktop / ⌘K palette / overlays) matches the macOS grammar with traffic-lights left, dock magnification, honey-accent active indicator, 25–35% honeycomb desktop background. Reconcile the 25 implemented apps against the canonical 24-app list in `apps/web/src/lib/dock-tiers.ts`, and produce empty/loading/error state coverage matrix for each. Produce: (a) a polish backlog grouped by surface (chrome / per-app) and severity, (b) targeted claude.ai/design iterations for the top 5 highest-leverage gaps (suggested order: desktop background opacity tune, window state matrix completion, per-app empty states with persona illustrations, dock magnification + indicators, status bar menu wiring), (c) per-app density audit using the existing shadcn primitive surface — do not author new primitives. Honor the locked palette (honey + violet + mint, NO blue), the bee-usage rules (NEVER in app chrome; only in loading skeletons + 404), the dark-first ground at `--hive-950` `#08090c`, and the texture opacity ramp in §8.1 of this inventory.

---

**End of OS shell inventory.**

Generated 2026-04-29 from read-only scan. Sibling: `briefs/2026-04-29-ui-ux-inventory-landing.md`.
