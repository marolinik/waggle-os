# Waggle UI/UX Component Inventory — 2026-04-29

**Purpose:** Brief Claude Design (explore + research mode) on the current UI/UX state of Waggle so it can produce a polish pass without re-discovering the surface area.

**Scope:** Read-only scan. No code changes performed. Sources of truth cited at the end so Claude Design can pull primary artifacts directly.

**Reading order for Claude Design:**
1. §1 — Two distinct UI surfaces exist (do not conflate)
2. §2–§3 — Surface inventories (Landing → OS Shell)
3. §4 — Cross-surface design system tokens (single source of truth)
4. §5 — Drift / open issues / polish opportunities
5. §6 — Source artifacts to consume (priority-ranked)

---

## §1. Two distinct UI surfaces

Waggle has two physically separate UI codebases with different chrome paradigms, different tech stacks, and different design maturity. **They share only the design tokens.**

| Surface | Repo path | Purpose | Stack | Maturity |
|---|---|---|---|---|
| **A. Marketing landing** | `D:/Projects/waggle-os/apps/www` | waggle-os.ai marketing site (download CTA, pricing, persona narrative) | Vite + React 19, **pure CSS with custom properties** (no Tailwind in `apps/www` despite v2.3 spec calling for Tailwind 4), `lucide-react` icons | Legacy v0/v1 implementation present; v2.3 spec authored but **not yet generated** (output pending claude.ai/design `ea934a60` paste) |
| **B. OS shell / desktop app** | `D:/Projects/waggle-os/apps/web` | macOS-style desktop inside Tauri 2.0 native window — 25 OS apps + dock + menubar + ⌘K | Vite + React + Tailwind + shadcn/ui (60+ primitives) + `framer-motion` + `lucide-react` | Paradigm correction in flight (DS audit v2 issued 2026-04-23). Chrome scaffolding built; per-app polish needed. Bees confirmed landing-only. |

`apps/web` runs inside the Tauri shell as the desktop app. `apps/www` is the public marketing site. Do not mix patterns between the two.

---

## §2. Surface A — Marketing landing (`apps/www`)

### §2.1 Tech stack — actual

- Entry: `apps/www/src/main.tsx` → `App.tsx`
- Styles: `apps/www/src/styles/globals.css` (96 lines, **pure CSS custom properties**, no Tailwind)
- Components: `apps/www/src/components/*.tsx` (10 files, 1,003 LOC total)
- Tests: `apps/www/__tests__/BrandPersonasCard.test.tsx`
- Data: `apps/www/src/data/personas.ts`

**Drift from spec:** v2.3 brief (`briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §5) prescribes Tailwind 4 utilities. Reality is inline styles + CSS custom properties. Polish should reconcile (either keep pure CSS for substrate independence, or migrate; do not author against a missing Tailwind config).

### §2.2 Implemented components — current `App.tsx` mount sequence

Order of mount in `apps/www/src/App.tsx`:

| # | Component | File | LOC | Status / notes |
|---|---|---|---|---|
| 1 | `Navbar` | `components/Navbar.tsx` | 77 | Implemented |
| 2 | `Hero` | `components/Hero.tsx` | 50 | Implemented — uses `bee-orchestrator-dark.png` directly in hero (legacy art-direction; v2.3 spec moves bees to footer mark only) |
| 3 | `Features` | `components/Features.tsx` | 58 | Implemented |
| 4 | `CrownJewels` | `components/CrownJewels.tsx` | 93 | Implemented (legacy "Crown Jewels" framing — not in v2.3 spec; likely candidate for replacement by Proof/SOTA band) |
| 5 | `HowItWorks` | `components/HowItWorks.tsx` | 51 | Implemented |
| 6 | `Pricing` | `components/Pricing.tsx` | 134 | Implemented (3-tier or 4-tier — verify against v2.3 4-tier spec: Free/Pro/Teams/Enterprise) |
| 7 | `Enterprise` | `components/Enterprise.tsx` | 34 | Implemented (KVARK bridge) |
| 8 | `BetaSignup` | `components/BetaSignup.tsx` | 62 | Implemented (legacy beta CTA; v2.3 spec removes BetaSignup entirely — Download is the conversion) |
| 9 | `Footer` | `components/Footer.tsx` | 26 | Implemented |

### §2.3 Orphan / unmounted components

| Component | File | LOC | State |
|---|---|---|---|
| `BrandPersonasCard` | `components/BrandPersonasCard.tsx` | **419** | **Implemented but NOT imported into `App.tsx`** — orphan. Has its own test file. Per v1.1 LOCKED wireframe + LOCKED 2026-04-22 personas decisions, this is the canonical 13-bee `6+6+1` personas grid component. Polish target: re-mount in correct slot per v2.3 (4×4 + Coordinator callout — note v2.3 evolved away from 13 bees toward 17 agent personas, see drift in §5). |

### §2.4 Components specified in v2.3 but not yet implemented

Per `briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §3 + §5, the v2.3 ship version requires these components which do **not** exist in `apps/www/src/components/`:

| Spec'd component | Spec section | Notes |
|---|---|---|
| `<Hero variant="A\|B">` with variant resolver | §3 SECTION 1 | Hero exists but not as variant component; `lib/hero-headline-resolver.ts` not present |
| `<ProofPointsBand>` (5-card elastic grid) | §3 SECTION 2 | Not implemented; replaces `CrownJewels` semantically |
| `<HarvestBand>` (11 logo tiles + 2 sync-mode callouts + feature stripe) | §3 SECTION 3 | Not implemented |
| `<MultiAgentRoom>` (window mockup + persona tiles + message bus + code snippet) | §3 SECTION 4 | Not implemented |
| `<HowItWorks>` 3-step variant | §3 SECTION 5 | Existing `HowItWorks` is 5-step from v1.1 wireframe — v2.3 simplified to 3 steps. Reconciliation needed. |
| `<PersonasGrid>` 4×4 + Coordinator sidebar | §3 SECTION 6 | `BrandPersonasCard` is the closest — but it implements 13-bee `6+6+1` from LOCKED 2026-04-22 IA, not the 4×4+1 agent-personas grid v2.3 ships |
| `<PricingTiers>` 4-tier (Free/Pro/Teams/Enterprise) + billing toggle + collapsible compare | §3 SECTION 7 | `Pricing.tsx` exists; verify tier count + billing toggle implementation |
| `<TrustBand>` (5 trust signals + Egzakta spine + hex-texture bg + MCP one-line) | §3 SECTION 8 | Not implemented |
| `<FinalCTA>` + KVARK bridge | §3 SECTION 9 | Partial via `Enterprise`; not in canonical FinalCTA shape |
| Updated `Footer` 5-column layout | §3 SECTION 10 | Existing 26-LOC `Footer.tsx` likely needs full rebuild |
| `lib/hero-headline-resolver.ts` | §5 | Variant gate for `?p=` / `utm_source` |
| `data/proof-points.ts` | §5 | 5 entries, ordered |
| `data/harvest-adapters.ts` | §5 | 11 entries |
| `data/pricing.ts` | §5 | 4 tiers |
| Event taxonomy (`landing.*` events) | §5 | Stub only required pre-launch |

### §2.5 Design tokens (canonical: `apps/www/src/styles/globals.css`)

This file is the **single source of truth** for landing tokens. Mirror these into Claude Design's token panel before iterating.

```css
:root {
  /* Hive neutral ladder — 12 stops */
  --hive-50:  #f0f2f7;
  --hive-100: #dce0eb;
  --hive-200: #b0b7cc;
  --hive-300: #7d869e;
  --hive-400: #5a6380;
  --hive-500: #3d4560;
  --hive-600: #2a3044;
  --hive-700: #1f2433;
  --hive-800: #171b26;
  --hive-850: #11141c;
  --hive-900: #0c0e14;
  --hive-950: #08090c;   /* canonical dark ground */

  /* Honey accent ladder — 4 stops + 2 glow tokens */
  --honey-300: #fcd34d;
  --honey-400: #f5b731;
  --honey-500: #e5a000;   /* primary CTA fill */
  --honey-600: #b87a00;
  --honey-glow:  rgba(229, 160, 0, 0.12);
  --honey-pulse: rgba(229, 160, 0, 0.06);

  /* Status accents (sparingly) */
  --status-ai:      #a78bfa;   /* violet — synthesis / AI activity */
  --status-healthy: #34d399;   /* mint — done / healthy */

  /* Elevation */
  --shadow-honey:    0 0 24px rgba(229,160,0,0.12), 0 0 4px rgba(229,160,0,0.08);
  --shadow-elevated: 0 4px 16px rgba(0,0,0,0.5),    0 2px 4px rgba(0,0,0,0.3);
}
```

**Typography:**
- Primary: `Inter` (variable), system-ui fallback
- Code: `JetBrains Mono` (per spec; verify in landing — code blocks rare on landing)
- Anti-aliasing: `-webkit-font-smoothing: antialiased`
- Selection color: `rgba(229, 160, 0, 0.3)` on `--hive-50`
- Headline scale per v2.3 spec: hero 48–64px, section 36–48px, subhead 24–32px
- Body: 16–18px, caption 14px
- Letter-spacing on display: `-0.02em`

**Motion utilities (defined in `globals.css`):**
- `@keyframes float` — translateY ±8px, 3s ease-in-out infinite
- `@keyframes honey-pulse` — opacity 0.4↔0.8 + scale 1↔1.05, 3s
- `@keyframes card-enter` — opacity + 20px translateY, 0.6s ease-out
- Stagger classes: `.card-enter-1` through `.card-enter-4` (0.1s steps)
- Hover affordance: `.card-lift` (translateY -2px + shadow-honey + honey-500 border)
- Active feedback: `.btn-press` (scale 0.97)
- Background: `.honeycomb-bg` — inline SVG hex pattern at `#1f2433` 15% opacity

**Breakpoints (per v1.1 wireframe spec):** `sm` 640 / `md` 768 / `lg` 1024 / `xl` 1280. Desktop-first; every section must collapse cleanly at `sm`.

### §2.6 Brand assets

| Asset | Location | Usage rules (v2.3 LOCKED) |
|---|---|---|
| `waggle-logo.svg` | `apps/www/public/brand/` | Header + footer ONLY |
| 13 × `bee-*-dark.png` (orchestrator, hunter, researcher, analyst, connector, architect, builder, writer, marketer, team, celebrating, confused, sleeping) | `apps/www/public/brand/` + reference copies in `D:/Projects/PM-Waggle-OS/_generated/bee-assets/` | **Landing-restricted.** v2.3 says: NOT in primary sections; reserved for loading skeletons, 404 page, and optional small monochrome footer mark. Do NOT inject into OS shell chrome. |
| `hex-texture-dark.png` honeycomb pattern | `apps/www/public/brand/` | Trust band background ONLY at 8–12% opacity, soft-light blend (per v2.3 §3 SECTION 8) |
| `bee-builder-dark-v1.png` + 2k variant | `_generated/bee-assets/` | Reference renders; latest builder-bee from 2026-04-21 regen |

**Conflict to resolve:** current `Hero.tsx` mounts `bee-orchestrator-dark.png` at 176×176 in hero center — directly contradicts v2.3 anti-pattern. Polish pass should remove or relocate.

### §2.7 Anti-patterns (v2.3 binding — surface to Claude Design)

Generation will fail pre-launch review if any of these are present. Pulling the most polish-relevant entries:

- NO blue accent — locked palette is honey + violet + mint
- NO LoCoMo / Opus / SOTA performance numbers (held until benchmark publishes)
- NO competitor names (Cowork, Mem0, Letta, Notion AI, Cursor as competitor, etc.)
- NO bee mascot grid as primary section; bees footer-mark only on landing
- NO "mind" as user-facing vocabulary — use "memory" or "knowledge graph"
- NO "cognitive layer" jargon in first 3 scroll viewports
- NO trust-logos carousel, NO CEO quote carousel, NO feature-icon grid
- NO scroll-triggered storytelling motion — hover micro-interactions only
- NO 5+ tier pricing — exactly 4 tiers (Free / Pro / Teams / Enterprise)
- NO `github.com` URL until repo migrates to egzakta org

Full list: `briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` §4 (correctness, voice, hygiene tiers).

---

## §3. Surface B — OS shell / desktop app (`apps/web`)

### §3.1 Tech stack — actual

- Entry: `apps/web/src/main.tsx` → `App.tsx` → `pages/Index.tsx`
- Tailwind: `apps/web/tailwind.config.ts` (configured)
- shadcn/ui: 60+ primitives in `apps/web/src/components/ui/`
- Animation: `framer-motion`
- Icons: `lucide-react`
- State: hooks pattern (`hooks/useWindowManager`, `useWaggleDance`, `useKnowledgeGraph`, `useOnboarding`, etc.)
- Adapter: `lib/adapter.ts` (Tauri ↔ web stub)

### §3.2 Chrome layer (`apps/web/src/components/os/`)

These define the macOS-paradigm shell that wraps every app window.

| Component | File | Role |
|---|---|---|
| `Desktop` | `Desktop.tsx` (497 LOC) | Top-level shell — wallpaper, window manager host, app config map, overlay coordination, status bar focus |
| `Dock` | `Dock.tsx` (170 LOC) | Tier-aware dock with zone-based trays (`getDockForTier(tier, billingTier)`) — handles open/minimized indicators, escape-to-close, dock labels (`useDockLabels`) |
| `DockTray` | `DockTray.tsx` | Tray panel that pops out from a dock zone |
| `AppWindow` | `AppWindow.tsx` | Draggable / resizable / minimize / maximize panel — traffic-light controls per macOS convention |
| `StatusBar` | `StatusBar.tsx` | Top bar — status cluster (provider pill, cost meter, policy indicator, clock, ⌘K trigger) |
| `BootScreen` | `BootScreen.tsx` | Tauri cold-boot splash |
| `ContextMenu` | `ContextMenu.tsx` | Right-click menus on dock + windows |
| `ErrorBoundary` | `ErrorBoundary.tsx` | Per-app crash containment |
| `LockedFeature` | `LockedFeature.tsx` | Tier-gate stub |
| `ModelSelector` / `ModelPilotCard` | `ModelSelector.tsx` / `ModelPilotCard.tsx` | LLM provider pickers |
| `WorkspaceBriefing` | `WorkspaceBriefing.tsx` | Workspace landing card |

**Wallpaper:** `apps/web/src/assets/wallpaper.jpg` (dark) + `wallpaper-light.jpg` — desktop-background brand-defining surface (DS audit v2 calls for 25–35% honeycomb texture overlay; verify current opacity).

**Logo asset:** `apps/web/src/assets/waggle-logo.jpeg` (dark) + `.png` (light).

### §3.3 OS Apps (25 implemented in `apps/web/src/components/os/apps/`)

The DS audit v2 references "24 OS Apps" per `docs/WAGGLE-SYSTEM-VISUAL.html:684`. Current count is **25 app components**:

| # | Component file | Likely app id | Per DS-audit MVP first-launch dock? |
|---|---|---|---|
| 1 | `ChatApp.tsx` + `ChatWindowInstance.tsx` | chat | ✅ |
| 2 | `DashboardApp.tsx` | dashboard | (Cockpit superset) |
| 3 | `CockpitApp.tsx` | cockpit | ✅ |
| 4 | `MemoryApp.tsx` | memory | ✅ |
| 5 | `AgentsApp.tsx` | agents | ✅ |
| 6 | `RoomApp.tsx` | room (multi-agent) | ✅ (likely) |
| 7 | `WaggleDanceApp.tsx` | waggle-dance | ✅ (likely) |
| 8 | `MissionControlApp.tsx` | mission-control | (probably gated) |
| 9 | `ConnectorsApp.tsx` | connectors | (Providers superset) |
| 10 | `CapabilitiesApp.tsx` | capabilities | (Skills/policy area) |
| 11 | `MarketplaceApp.tsx` | marketplace | |
| 12 | `FilesApp.tsx` + `FilesAppTabs.tsx` | files | ✅ |
| 13 | `VaultApp.tsx` | vault | |
| 14 | `EventsApp.tsx` | events | |
| 15 | `TimelineApp.tsx` | timeline | |
| 16 | `TelemetryApp.tsx` | telemetry | |
| 17 | `BackupApp.tsx` | backup | |
| 18 | `SettingsApp.tsx` | settings | ✅ |
| 19 | `UserProfileApp.tsx` | user-profile | |
| 20 | `ApprovalsApp.tsx` | approvals | |
| 21 | `ScheduledJobsApp.tsx` | scheduled-jobs | |
| 22 | `TeamGovernanceApp.tsx` | team-governance | (Teams tier) |
| 23 | `VoiceApp.tsx` | voice | |
| (sub) | `agents/`, `chat-blocks/`, `cockpit/`, `connectors/`, `files/`, `memory/` | per-app sub-component folders | — |

**Apps named in DS audit v2 not directly visible as top-level files (likely under sub-folders or pending):** Graph, Provenance, Providers, Policy, Preferences, Wiki, Skills, Scopes, Tasks, Audit, Prompts, Search, Terminal, Notes, Export, About. Polish step: reconcile against `lib/dock-tiers.ts` to confirm canonical AppId set.

### §3.4 Overlays (13 implemented in `apps/web/src/components/os/overlays/`)

System-level layer between windows and ⌘K palette.

| Component | Role |
|---|---|
| `GlobalSearch.tsx` | **⌘K Spotlight equivalent** — launch app, search memory, invoke command. DS audit v2 confirms this survives paradigm shift. |
| `OnboardingWizard.tsx` + `OnboardingTooltips.tsx` + `onboarding/` subfolder | First-run guided tour |
| `LoginBriefing.tsx` | Post-login briefing card |
| `WorkspaceSwitcher.tsx` + `CreateWorkspaceDialog.tsx` | Workspace switcher + creator |
| `PersonaSwitcher.tsx` | Active persona switcher |
| `SpawnAgentDialog.tsx` | Spawn-agent shortcut from dock |
| `NotificationInbox.tsx` | Notification center |
| `KeyboardShortcutsHelp.tsx` | `?` overlay listing shortcuts |
| `ContextRail.tsx` | Side rail for active-app context (knowledge graph, memory frames, etc.) |
| `UpgradeModal.tsx` + `TrialExpiredModal.tsx` | Tier-gate modals |

### §3.5 shadcn/ui primitive library (60 + components in `components/ui/`)

Full shadcn surface installed: `accordion`, `alert`, `alert-dialog`, `aspect-ratio`, `avatar`, `badge`, `breadcrumb`, `button`, `calendar`, `card`, `carousel`, `chart`, `checkbox`, `collapsible`, `command`, `context-menu`, `dialog`, `drawer`, `dropdown-menu`, `form`, `hint-tooltip`, `hover-card`, `input`, `input-otp`, `label`, `menubar`, `navigation-menu`, `pagination`, `popover`, `progress`, `radio-group`, `resizable`, `scroll-area`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `slider`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `toast`, `toaster`, `toggle`, `toggle-group`, `tooltip`.

**Polish implication:** the design system primitives are already standardized; the polish pass operates one layer up — composed components, density, state coverage, motion, micro-interactions.

### §3.6 Hooks (state surface visible in `Desktop.tsx`)

`useWorkspaces`, `useMemory`, `useEvents`, `useAgentStatus`, `useNotifications`, `useKeyboardShortcuts`, `useOnboarding`, `useOfflineStatus`, `useKnowledgeGraph`, `useWaggleDance`, `useWindowManager`, `useOverlayState`, `useDockNudge`, `useDockLabels`, `useToast`. Knowing these helps Claude Design design loading / empty / error states with the actual data shapes available.

### §3.7 Paradigm correction status (DS audit v2, 2026-04-23)

Per `briefs/2026-04-23-ds-audit-v2-macOS-paradigm-correction.md`, the previous DS mockup (left HIVE/SCOPES/SETTINGS sidebar + central Memories canvas) was diagnosed as Linear/Notion SaaS dashboard, not OS. The correction calls for:

| Paradigm element | Required state | Implementation evidence |
|---|---|---|
| Menubar (top, fixed) | Logo + system menus + status cluster + ⌘K | `StatusBar.tsx` exists; verify menu items wired |
| Dock (24 apps) | Hover tooltip, running-app indicator, magnification, separators | `Dock.tsx` + `DockTray.tsx` present, tier-filtered via `dock-tiers.ts` |
| App windows | Draggable / resizable / minimize / maximize, traffic-lights left, multi-window z-order | `AppWindow.tsx` present; `useWindowManager` hook live |
| Desktop background | Honeycomb texture **25–35%** overlay/soft-light (brand-defining canvas) | `wallpaper.jpg` present; **opacity verification needed** |
| ⌘K palette | Modal layer above windows, launch app / search memory / invoke command | `GlobalSearch.tsx` overlay present |
| Overlays layer | Between windows and palette: OnboardingWizard, modals, toasts, alerts | 13 overlays implemented |

Texture opacity ramp (DS audit v2 §"Honeycomb texture"): Desktop BG 25–35% / Window BG 4–8% / Empty states 15–20% / Menubar+Dock chrome 0–3%. **Polish target — verify and tune.**

**Reserved bee usage in OS shell:** loading skeletons, 404 page, optional small footer brand mark. Bees never decorate app chrome.

---

## §4. Cross-surface design system

Both surfaces share **only** the token vocabulary. They diverge on chrome paradigm.

### §4.1 Color (locked palette)

- Ground: `--hive-950` `#08090c` (dark-first locked across both surfaces; light mode is v3 stretch)
- Accent: honey 400/500/600 (CTA, focus rings, brand emphasis)
- Status: violet `#a78bfa` (AI activity, synthesis pulse) + mint `#34d399` (healthy, done state)
- **No blue** — explicit anti-pattern
- Hex texture: `#1f2433` at 15% opacity in `.honeycomb-bg` SVG

### §4.2 Typography
- Display + body: `Inter` variable (400–700)
- Monospace: `JetBrains Mono` (code blocks, tool names, file paths)
- Headline scale: 48–64 hero / 36–48 section / 24–32 subhead
- Body: 16–18 / caption 14
- Letter-spacing on display: `-0.02em`

### §4.3 Motion
- Hover micro-interactions only (no scroll-triggered storytelling per v2.3 anti-pattern)
- `prefers-reduced-motion: reduce` mandatory on hero MPEG-4 loop
- Easing: ease-out for entrances, ease-in-out for loops

### §4.4 Iconography
- Primary library: `lucide-react` (used in both `apps/www` and `apps/web`)
- DS bee illustrations are landing-only

### §4.5 Iconic moments to preserve in polish
- Honey-pulse halo behind hero CTA (`apps/www/Hero.tsx` lines 8–12)
- Card lift hover (`apps/www/globals.css` `.card-lift`)
- Honeycomb SVG background pattern
- Floating bee animation (landing only)

---

## §5. Drift / open issues / polish opportunities

These are the gaps a polish pass should close. Ranked rough-priority.

### §5.1 Critical drift (ship-blocking)

1. **Landing section sequence mismatch.** `App.tsx` mounts a 9-section legacy layout (Navbar / Hero / Features / CrownJewels / HowItWorks / Pricing / Enterprise / BetaSignup / Footer). v2.3 ship spec requires (Hero / Proof / Harvest / MultiAgent / How / Personas / Pricing / Trust / FinalCTA / Footer). Five new sections need to land; two legacy sections (`CrownJewels`, `BetaSignup`) need to be retired or reframed.
2. **Personas grid model conflict.** v1.1 LOCKED wireframe (2026-04-22) ships **13 brand bees in `6+6+1`** geometry via `BrandPersonasCard` (orphan in code). v2.3 ship brief (2026-04-28) replaces with **17 agent personas in `4×4 + Coordinator sidebar`** (text-only tiles, no bee mascots). PM ratification trail favors v2.3. Polish must pick one — and `BrandPersonasCard.tsx` either rebuilds or retires.
3. **Hero copy + art-direction.** Current `Hero.tsx` shows "Your AI Operating System" / "AI Agents That Remember" with bee-orchestrator center. v2.3 requires variant A (Marcus default) "Your AI doesn't reset. Your work doesn't either." + variant B (Klaudia/regulated) "AI workspace that satisfies your CISO." with NO bee in primary content. Hero variant resolver also missing.
4. **Pricing tier count.** v2.3 mandates **4 tiers** (Free / Pro / Teams / Enterprise). Verify `Pricing.tsx` matches; in v1.1 the spec said 3 tiers (Solo / Pro / Teams + KVARK in Enterprise tier card). Drift between locked decisions is real and PM ratification trail favors v2.3 4-tier.

### §5.2 Important drift (polish-grade)

5. **Tailwind absent on landing.** v2.3 §5 prescribes Tailwind 4 utilities; reality is inline styles + CSS custom properties. Decide: keep pure CSS (substrate independence) or migrate. Mixed approach will rot.
6. **Bee-on-hero violation.** `Hero.tsx` line 16 mounts a 176px bee illustration centrally — directly contradicts v2.3 binding rule "bee illustrations: NOT in primary sections."
7. **`HowItWorks` step count.** v1.1 wireframe locks 5 steps (Capture / Encode / Retrieve / Reason / Audit). v2.3 collapses to 3 steps (Install once / Work normally / Compound). Decide and align.
8. **OS shell texture opacity.** DS audit v2 calls for 25–35% honeycomb on desktop background. Verify `wallpaper.jpg` overlay matches; if not, this is the single highest-leverage brand moment in the entire OS shell.
9. **OS shell missing apps from canonical 24-list.** Top-level component files do not include explicit `Graph`, `Provenance`, `Providers`, `Policy`, `Preferences`, `Wiki`, `Audit`, `Prompts`, `Search`, `Terminal`, `Notes`, `Export`, `About`. Reconcile against `lib/dock-tiers.ts` — some may live in sub-folders.

### §5.3 Polish-only (no architectural change)

10. Empty states across all 25 OS apps need persona-illustration + 15–20% texture per DS audit v2 ramp.
11. Window state matrix coverage: spec calls for normal / focused / blurred / minimized-preview / maximized variants — verify `AppWindow.tsx` renders all five distinguishable.
12. Loading skeletons should use bee-* mascots (the only sanctioned non-landing bee usage).
13. Status bar density tuning (28–32px height per DS audit v2; "tanka, elegantna, bez texture").
14. Dock magnification on hover — DS audit calls it "opciono ali poželjno"; check current implementation.
15. ⌘K palette (`GlobalSearch.tsx`) already polished per DS audit; preserve in any iteration.
16. Footer needs 5-column rebuild (Product / Research / OSS / Company / Legal) per v2.3 §3 SECTION 10.
17. Trust band hex-texture-dark.png at 8–12% soft-light blend, not yet implemented (no Trust component).
18. Pricing billing toggle (Monthly / Annual save ~17%) — verify presence in `Pricing.tsx`.

---

## §6. Source artifacts (priority-ranked for Claude Design)

Read these in order. The first three are the **canonical** sources; everything below is supporting evidence or audit trail.

### §6.1 Canonical (read in full)

1. `D:/Projects/PM-Waggle-OS/strategy/landing/landing-wireframe-spec-v1.1-LOCKED-2026-04-22.md` — 65KB, 7-section landing wireframe with locked component contracts, copy keys, measurability, anti-patterns. Authoritative for any section v2.3 hasn't changed.
2. `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-claude-design-landing-v2.3-prompt.md` — 36KB, **ship version** for landing v2 generation. Contains the 9-section + footer brief, palette lock, anti-patterns, 22 PASS/FAIL signals.
3. `D:/Projects/PM-Waggle-OS/briefs/2026-04-23-ds-audit-v2-macOS-paradigm-correction.md` — 12KB, OS shell paradigm correction with paste-ready DS chat prompt for menubar / dock / windows / desktop / palette / overlays.

### §6.2 Supporting (skim or query)

4. `D:/Projects/PM-Waggle-OS/strategy/landing/information-architecture-2026-04-19.md` — 50KB master IA (9 sections; v1.1 simplified to 7; v2.3 evolved to 9 again).
5. `D:/Projects/PM-Waggle-OS/strategy/landing/persona-research-2026-04-18-rev1.md` — 84KB persona research, 7 archetypes for v2.3 hero variant gating.
6. `D:/Projects/PM-Waggle-OS/briefs/2026-04-28-landing-copy-v4-waggle-product.md` — 31KB latest landing copy v4.
7. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-claude-design-landing-brief.md` — original Claude Design landing brief (audit trail; superseded by v2.3).
8. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-brand-bee-personas-card-spec.md` — 6.6KB, 13-bee persona card component spec.
9. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-cc-personas-card-component-parallel.md` — 11KB, parallel implementation brief that produced `BrandPersonasCard.tsx`.
10. `D:/Projects/PM-Waggle-OS/briefs/2026-04-22-personas-card-copy-refinement.md` — 9.9KB, locked persona copy.
11. `D:/Projects/PM-Waggle-OS/decisions/2026-04-22-h-audit-1-design-ratified.md` — design ratification decision log.
12. v2.0 / v2.1 / v2.2 prompt history under `briefs/` — audit trail for how v2.3 evolved (do not reuse).

### §6.3 Repo references (verify against)

- `D:/Projects/waggle-os/apps/www/src/styles/globals.css` — canonical token source for landing.
- `D:/Projects/waggle-os/apps/www/src/components/*.tsx` — current implementation (10 components).
- `D:/Projects/waggle-os/apps/www/src/data/personas.ts` — persona data (13-bee shape).
- `D:/Projects/waggle-os/apps/web/src/components/os/` — OS shell + 25 apps + 13 overlays + 60+ shadcn primitives.
- `D:/Projects/waggle-os/apps/web/tailwind.config.ts` — Tailwind config (OS shell only).
- `D:/Projects/waggle-os/apps/web/src/lib/dock-tiers.ts` — canonical dock AppId list + tier filtering rules.
- `D:/Projects/waggle-os/docs/WAGGLE-SYSTEM-VISUAL.html` — architectural diagram referenced by DS audit v2.
- `D:/Projects/waggle-os/CLAUDE.md` + `docs/ARCHITECTURE.md` — package + persona canonical lists.

### §6.4 Brand assets (binary references)

- `D:/Projects/waggle-os/apps/www/public/brand/` — `waggle-logo.svg`, 13 × `bee-*-dark.png`, `hex-texture-dark.png`.
- `D:/Projects/PM-Waggle-OS/_generated/bee-assets/` — latest builder-bee renders (v1, 2k variant).
- `D:/Projects/waggle-os/apps/web/src/assets/` — `wallpaper.jpg` (dark) + `wallpaper-light.jpg`, `waggle-logo.jpeg/.png`.

---

## §7. Polish-pass instruction shape (suggested — for Claude Design briefing)

Suggested framing for the Claude Design exploration prompt:

> Audit Waggle's two UI surfaces (`apps/www` landing and `apps/web` OS shell) against the v1.1 wireframe spec, the v2.3 ship brief, and the DS audit v2 paradigm correction. Reconcile drift between implemented components (per §2.2 and §3.2–§3.4 of `briefs/2026-04-29-ui-ux-component-inventory.md`) and the locked targets. Output: (a) a polish backlog grouped by surface and severity, (b) targeted Figma / claude.ai/design iterations for the top 5 highest-leverage gaps, (c) per-app empty/loading/error state coverage matrix for the 25 OS apps. Honor the locked palette (honey + violet + mint, no blue), the bee-usage rules (landing-only, footer-mark only on landing primary, never on app chrome), the macOS desktop paradigm in the shell, and the dark-first ground at `--hive-950` `#08090c`.

---

**End of inventory.**

Generated 2026-04-29 from read-only scan. No code or repo files modified.
