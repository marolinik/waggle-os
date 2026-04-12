# Waggle OS -- Design System Audit

**Date:** April 2026
**Scope:** `apps/web/` (primary frontend), `app/` (Tauri app), shared CSS and design tokens
**Method:** Automated deep scan of all CSS files, component source, and design token definitions

---

## Summary

**Overall Score: 6.3 / 10**

Waggle OS has a distinctive and intentional design identity ("Honey on Dark Steel") that is rare among AI products. The Hive DS token system is well-defined at the CSS variable level. However, there is a significant gap between the *defined* design system and its *applied* usage. Arbitrary Tailwind values are rampant (433 instances of `text-[Npx]` across the web app), two separate CSS systems exist for the two app targets with divergent token definitions, and accessibility is weak at the fundamentals level (tiny text, no responsive design, inconsistent focus states). The product looks good in screenshots but would not survive a WCAG audit.

---

## Dimension Scores

### 1. Color Consistency -- 7/10

**What exists:**
The Hive DS defines a comprehensive palette in `app/src/styles/globals.css`:
- Hive gray scale: 12 stops (`--hive-950` through `--hive-50`)
- Honey scale: 8 stops (`--honey-600` through `--honey-50`) plus `--honey-glow` and `--honey-pulse`
- Status colors: 5 named (`--status-healthy`, `--status-warning`, `--status-error`, `--status-info`, `--status-ai`)
- Semantic surfaces: 5 (`--surface-card`, `--surface-panel`, `--surface-overlay`, `--surface-hover`, `--surface-selected`)
- Shadows: 4 (`--shadow-card`, `--shadow-elevated`, `--shadow-overlay`, `--shadow-honey`)
- Knowledge graph node colors: 5 (`--kg-person`, `--kg-project`, `--kg-concept`, `--kg-org`, `--kg-default`)

**What is actually used:**
Components mostly use the semantic Tailwind tokens (`text-foreground`, `bg-card`, `text-primary`, etc.) which is correct. However, there are systemic leaks:

- **Direct Tailwind color classes bypass the design system.** Status colors are applied via `text-emerald-400`, `text-amber-400`, `text-violet-400`, `text-cyan-400`, `text-orange-400`, `text-sky-400`, `text-destructive` rather than through the defined `--status-*` tokens. This means status colors are hardcoded in 50+ locations across OS component files.
  - `CockpitApp.tsx:66` -- `text-emerald-400` / `text-amber-400` inline instead of referencing status tokens
  - `Desktop.tsx:63-75` -- Each app icon uses a different Tailwind color (`text-amber-300`, `text-cyan-400`, `text-emerald-400`, `text-violet-400`, `text-orange-400`)
  - `VaultApp.tsx:66-71` -- TYPE_BADGES use `bg-sky-500/20 text-sky-400`, `bg-emerald-500/20 text-emerald-400`, etc.
  - `CapabilitiesApp.tsx:7-16` -- Trust levels and category colors hardcoded as Tailwind classes
- **Two divergent CSS systems exist.** `app/src/styles/globals.css` defines HSL values one way (`--background: 222 20% 4%`), while `apps/web/src/index.css` defines them differently (`--background: 30 6% 8%`). The hue families are completely different (222 cold blue vs 30 warm amber). This means the Tauri app and web app render different colors from the "same" design system.
- **Inline hex values in SVG.** `MemoryApp.tsx:62,73` uses `stroke="hsl(38, 92%, 50%)"` and `fill="hsl(38, 92%, 50%)"` directly instead of referencing a CSS variable.
- **UserProfileApp.tsx:59-61** -- Default brand colors hardcoded as hex (`#D4A84B`, `#1a1a1a`, `#3b82f6`). The accent `#3b82f6` (Tailwind blue-500) is not part of the Hive DS palette at all.

**Fix recommendations:**
1. Create Tailwind theme extensions for status colors: `text-status-healthy`, `bg-status-warning/20`, etc., mapped to the existing `--status-*` CSS variables.
2. Reconcile the two CSS systems. The `apps/web/src/index.css` warm-amber base and `app/src/styles/globals.css` cold-blue base need to converge on one.
3. Replace all inline `hsl()` and hex values in TSX files with CSS variable references.

---

### 2. Typography Hierarchy -- 4/10

**What exists:**
- Display font: Space Grotesk (headings, labels) via `.font-display` utility
- Body font: DM Sans (web app) / Inter (Tauri app) -- another divergence
- Mono font: JetBrains Mono / Cascadia Code / Fira Code
- Body font size set to `13px` in `app/src/styles/globals.css`
- Chat prose styles are well-defined: h1=18px, h2=16px, h3=14px, p=14px, code=13px

**What is actually used -- the font size disaster:**

Arbitrary `text-[Npx]` values across `apps/web/src/**/*.tsx`: **433 total instances**.

Breakdown by size:
| Size | Count | WCAG Status |
|------|-------|-------------|
| `text-[7px]` | ~2 | FAIL -- unreadable |
| `text-[8px]` | ~8 | FAIL -- nearly unreadable |
| `text-[9px]` | ~25 | FAIL -- below minimum |
| `text-[10px]` | ~45 | FAIL -- below WCAG 12px minimum for body text |
| `text-[11px]` | ~10 | BORDERLINE |
| `text-[12px]` | ~7 | PASS (barely) |

Plus standard Tailwind classes in OS components: **460 instances** of `text-xs` (12px), `text-sm` (14px), `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`.

The worst offenders:
- `StatusBar.tsx` -- Almost all content is `text-[10px]`: workspace name, model name, token count, cost. This is the bar users see constantly.
- `ModelPilotCard.tsx` -- 16 instances of arbitrary sizes from `text-[8px]` to `text-[10px]`. The 3-lane model selector is a wall of microscopic text.
- `Dock.tsx:121,144` -- Hover labels are `text-[10px]`.
- `WorkspaceBriefing.tsx:70` -- Memory stats at `text-[11px]`.
- `SpawnAgentDialog.tsx` -- 11 instances of `text-[10px]`.

**The core problem:** There is no defined type scale. Developers pick whatever pixel value feels right at the time. The result is at least **10 distinct font sizes** (`7px, 8px, 9px, 10px, 11px, 12px, 13px, 14px, 16px, 18px`) used across the app, with no documented hierarchy.

**Fix recommendations:**
1. Define a type scale in the design tokens: `--text-micro: 11px`, `--text-caption: 12px`, `--text-body-sm: 13px`, `--text-body: 14px`, `--text-title: 16px`, `--text-heading: 20px`, `--text-display: 24px`.
2. Map these to Tailwind utilities and ban arbitrary `text-[Npx]` values via ESLint.
3. **Eliminate all text below 11px.** The `text-[7px]`, `text-[8px]`, and `text-[9px]` instances need to be bumped to at minimum 11px. Nothing in a productivity app needs to be 8 pixels tall.
4. The StatusBar and ModelPilotCard need a redesign to work at readable sizes.

---

### 3. Spacing Rhythm -- 7/10

**What exists:**
The Tailwind 4px grid is used consistently in most places. Components use standard Tailwind spacing: `p-2`, `p-3`, `p-4`, `gap-1.5`, `gap-2`, `gap-3`, `mb-4`, etc.

**What is used well:**
- Very few arbitrary spacing values. The grep for `p-[`, `m-[`, `gap-[`, `space-[` found almost no custom component instances (only shadcn UI library internals like `p-[1px]` in scroll-area).
- Border radius is consistent at `--radius: 0.75rem` (12px) with `rounded-xl`, `rounded-lg` variations.
- Cards use consistent padding patterns: `p-3` for compact, `p-4` for standard.

**Minor issues:**
- Window sizes are hardcoded pixel values in `Desktop.tsx:58-76`: `"520px"`, `"560px"`, `"640px"`, `"480px"`, etc. These should be tokens or at minimum constants.
- `EventsApp.tsx:176` uses `paddingLeft: ${depth * 20 + 8}px` for tree indentation -- calculated inline.

**Fix recommendations:**
1. Extract window dimensions to a constant map or config.
2. Replace calculated inline padding with Tailwind `pl-*` classes using data attributes or CSS custom properties for depth.

---

### 4. Component Consistency -- 6/10

**What exists:**
Two separate shadcn/ui component libraries:
- `app/src/components/ui/` -- 21 components (Tauri app). Uses `@base-ui/react` primitives, newer shadcn patterns with `data-slot` attributes and `class-variance-authority`.
- `apps/web/src/components/ui/` -- 49 components (web app). Uses `@radix-ui/react-*` primitives, standard shadcn patterns with `forwardRef`.

These are **two completely different component libraries** with different underlying primitives, different APIs, and different styling approaches. The `app/` Button uses `@base-ui/react/button` with CVA variants including `xs`, `sm`, `default`, `lg`, `icon`, `icon-xs`, `icon-sm`, `icon-lg`. The `apps/web/` Button uses `@radix-ui` with `default`, `sm`, `lg`, `icon` sizes.

**Custom components in `apps/web/src/components/os/`:**
- **Buttons are inconsistent.** Some views use the shadcn `<Button>` component, but many views construct buttons inline:
  - `AgentsApp.tsx:237` -- `<input ... className="w-full text-xs bg-secondary/30 border border-border/30 rounded-lg pl-8 pr-3 py-2">` (hand-rolled input, not shadcn Input)
  - `CreateAgentForm.tsx:68,85,88,91` -- All inputs are hand-rolled `<input>` elements with bespoke classes
  - `CreateGroupForm.tsx:66,68` -- Same pattern: hand-rolled inputs
  - `SettingsApp.tsx:166,269` -- `<input>` with custom `bg-muted/50 border border-border/50 rounded-lg`
  - `GroupDetail.tsx:201` -- Another hand-rolled input
- **Cards are mostly consistent.** Most views use `bg-card`, `border border-border/30`, `rounded-xl` patterns consistently, though not all use the shadcn `<Card>` component.
- **Focus styles diverge.** Hand-rolled inputs use `focus:outline-none focus:border-primary/50` while shadcn components use `focus-visible:ring-2 focus-visible:ring-ring`. These are visually different focus indicators.

**Fix recommendations:**
1. Pick ONE component library. The web app (`apps/web/`) is the primary frontend per project memory. Standardize on its shadcn/ui library.
2. Replace all hand-rolled `<input>` elements with the shadcn `<Input>` component. There are at least 10-15 instances of bespoke inputs.
3. Create an `<IconButton>` wrapper if the shadcn Button icon variant doesn't cover all use cases.
4. Standardize focus styles project-wide: `focus-visible:ring-2 focus-visible:ring-ring` (the shadcn pattern).

---

### 5. Responsive Behavior -- 2/10

**This is intentionally desktop-only**, which is acknowledged in the UX analysis. However, even for a desktop-only app, there are problems.

**Evidence:**
- Responsive breakpoint utilities (`sm:`, `md:`, `lg:`, `xl:`) appear in the web app, but **only inside shadcn/ui library components** (alert-dialog, dialog, sheet, sidebar, calendar, breadcrumb). Zero custom OS components use responsive utilities.
- Root container: `w-screen h-screen overflow-hidden` -- no flexibility.
- Window sizes are hardcoded pixels.
- The 5-column template grid in `OnboardingWizard.tsx` and the 4-column persona grid have no responsive fallbacks.
- No `min-width` media query or warning for narrow viewports.

**Fix recommendations:**
1. Add a minimum viewport warning: "Waggle requires a screen width of at least 1024px."
2. Make the OnboardingWizard grids responsive: 5 columns on wide screens, 3 on narrower, 2 on smallest.
3. Add `min-w-[1024px]` to the root container to prevent layout breakage.

---

### 6. Dark Mode -- 8/10

**Strengths:**
- The dark theme is the primary and well-defined theme. Every token has a dark value.
- **A full light theme exists** in `app/src/styles/globals.css` under `:root[data-theme="light"]`, with warm beeswax/ivory palette. This includes inverted hive scale, adjusted honey values for contrast, light shadows, and light semantic surfaces. The scrollbar and honeycomb background also have light variants.
- Bee image variants for light mode exist (`bee-orchestrator-light.png`, etc.).
- The `apps/web/src/index.css` does NOT define a light theme, meaning the web app is dark-only.

**Weaknesses:**
- Light theme exists in CSS but there appears to be no UI toggle to activate it (per UX analysis: "No dark/light mode toggle -- only dark theme exists").
- The light theme only exists in the Tauri app's CSS, not the web app's. This is a gap.

**Fix recommendations:**
1. Add a theme toggle to Settings (General tab).
2. Port the light theme from `app/src/styles/globals.css` to `apps/web/src/index.css`.
3. Test all components in light mode -- the status colors (`emerald-400`, `amber-400`, etc.) will likely have contrast issues on a light background.

---

### 7. Animation -- 8/10

**Strengths:**
The animations are purposeful, restrained, and on-brand:
- **Boot sequence:** Spring-based logo entrance, sequential phase text with fade transitions, progress bar animation, phase dot scaling. All using framer-motion. Duration is proportional (600ms per phase). (`BootScreen.tsx`)
- **Window management:** `window-open` animation (scale 0.9 + translateY to normal), minimize shrinks to dock. (`AppWindow.tsx`, `tailwind.config.ts`)
- **Dock:** Spring-based hover animation (scale 1.2, y: -8) with `dock-bounce` keyframe. Playful without being distracting. (`Dock.tsx`)
- **Overlays:** Consistent pattern -- backdrop fade + panel scale from 0.95 to 1. (`GlobalSearch.tsx`, `PersonaSwitcher.tsx`, etc.)
- **Custom Hive animations in CSS:** `honey-pulse` (memory save), `heartbeat` (health dot), `float` (bee mascot), `hex-cursor` (streaming), `token-fade` (token streaming), `send-flash` (input border), `hex-spin` (loading), `card-enter` (card entrance). All defined in `globals.css`.
- **Loading states:** Consistent use of `Loader2` from Lucide with `animate-spin`, found in 25+ components.
- **Streaming indicator:** Three bouncing dots with staggered `animationDelay` (`TextBlock.tsx:17-19`) plus a pulsing cursor bar.

**Minor issues:**
- `FilesApp.tsx:450` uses `animate-bounce` on the upload icon, which feels more playful than necessary for a file upload zone.
- The `fade-up` animation (0.4s) is defined but usage is limited.

**Fix recommendations:**
1. Consider reducing the boot screen total duration for returning users (currently ~4.8s).
2. The `animate-bounce` on file upload could be toned down to `animate-pulse`.

---

### 8. Accessibility -- 3/10

**This is the weakest dimension.**

**Text size failures:**
- 97 instances of text below 10px (`text-[7px]`, `text-[8px]`, `text-[9px]`) across the web app.
- The StatusBar, ModelPilotCard, and ModelSelector are built almost entirely at 9-10px sizes.
- WCAG SC 1.4.4 requires text to be resizable to 200% without loss of content. At 8-9px base, 200% zoom is still only 16-18px -- barely readable.

**Contrast concerns:**
- `text-muted-foreground` (`#5a6380` / HSL 225 12% 50%) on `--background` (`#08090c`): contrast ratio is approximately 3.5:1. WCAG AA requires 4.5:1 for normal text. This fails.
- `honey-500` (`#e5a000`) on dark background (`#08090c`): approximately 7.5:1 -- passes AA.
- `text-emerald-400` on dark: approximately 8:1 -- passes.
- `text-amber-400` on dark: approximately 7:1 -- passes.
- The muted foreground color is used extensively across all apps for secondary text, labels, and helper text. This is a systematic contrast failure.

**ARIA attributes:**
- **Good:** `AppWindow.tsx` has `role="dialog"` and `aria-label={title}`. Window control buttons have `aria-label` ("Minimize window", "Toggle fullscreen", "Close window"). StatusBar buttons have `aria-label`. Dock items have `aria-label`. The shadcn components include proper ARIA attributes from Radix primitives.
- **Bad:** Most custom interactive elements (cards that act as buttons, clickable divs, tab-like interfaces built with `<button>` arrays) lack ARIA roles and states. The tab interfaces in `AgentsApp.tsx`, `VaultApp.tsx`, `SettingsApp.tsx`, and `CapabilitiesApp.tsx` are all built with `<button>` elements styled as tabs but without `role="tablist"`, `role="tab"`, or `aria-selected`.

**Focus management:**
- shadcn components use `focus-visible:ring-2 focus-visible:ring-ring` consistently.
- Hand-rolled inputs use `focus:outline-none focus:border-primary/50` -- visible but less prominent.
- Many interactive divs (clickable cards, persona grid items, template selections in onboarding) have no visible focus indicator at all.
- No skip-to-content link.
- No focus trap in overlays (though click-outside-to-close exists).

**Keyboard navigation:**
- Global keyboard shortcuts are comprehensive (Ctrl+K, Ctrl+Tab, Ctrl+Shift+P, etc.).
- Within individual apps, keyboard navigation is limited. Tab order follows DOM order but many interactive elements are not focusable.

**Fix recommendations (priority order):**
1. **Increase `--muted-foreground` contrast.** Change from `#5a6380` to at minimum `#7d869e` (`--hive-300`) for AA compliance.
2. **Eliminate all text below 11px.** This is a hard accessibility requirement.
3. **Add `role="tablist"` / `role="tab"` / `aria-selected`** to all custom tab interfaces (at least 5 views).
4. **Add focus-visible indicators** to all interactive elements (clickable cards, persona items, template selections).
5. **Add focus trap** to overlay components (or verify framer-motion handles it).
6. **Add skip link** for keyboard users.

---

### 9. Information Density -- 6/10

**Well-balanced views:**
- `DashboardApp.tsx` -- Clean 2-column grid with cards. Good use of whitespace.
- `ChatApp.tsx` -- The chat area itself is clean. The block-based rendering prevents wall-of-text.
- `BootScreen.tsx` -- Minimal and focused.
- `Desktop.tsx` (empty state) -- Beautiful: centered logo, subtle animation, dock hint.

**Overly dense views:**
- **StatusBar** -- Packs workspace name, model, token count, cost, search, notifications, wifi status, decorative volume/battery, date, and clock into a 32px bar. At `text-[10px]`, this is a pixel-packed nightmare.
- **ModelPilotCard** -- The 3-lane model selector crams lane title, description, model name, cost indicator, provider, current badge, and switch buttons into tiny cards. Text ranges from 8px to 10px. Users will need a magnifying glass.
- **OnboardingWizard Step 4** -- 15 templates in a 5-column grid. Each card has icon, name, and description. On screens narrower than 1400px, this will be unreadable.
- **SettingsApp.tsx** -- 7 tabs with dense content in each. The Permissions tab alone has auto-approve toggle, always-require list, and explanatory text in a small window.
- **FilesApp.tsx** -- At 1,176 lines, the file manager tries to be a full IDE: tree view, preview, upload, rename, delete, context menu, syntax highlighting, drag-drop. The split-pane layout works but the metadata badges use `text-[9px]`.

**Fix recommendations:**
1. StatusBar: Remove decorative Volume/Battery icons. Move token count and cost to a hover tooltip or the Cockpit view.
2. ModelPilotCard: Increase minimum text to 11px. Consider a different layout (vertical stack instead of 3-column).
3. OnboardingWizard: Use 3 columns max for templates, with a category filter or search.

---

### 10. Polish -- 7/10

**Loading states -- GOOD:**
Loading states are consistently handled across the app. Every data-fetching view has a loading spinner:
- `Loader2 className="animate-spin"` pattern used in 25+ components
- `CockpitApp.tsx` shows `RefreshCw` icon spinning during refresh
- `CreateWorkspaceDialog.tsx` shows loading spinners during folder creation, AI generation, and saving
- Consistent pattern: centered spinner with optional text

**Empty states -- MODERATE:**
- `MemoryApp.tsx:211` -- "No memories found" with muted text
- `AgentsApp.tsx:253` -- "No agents found" with muted text
- `CapabilitiesApp.tsx:222` -- "No {tab} packs found"
- `FilesApp.tsx:648` -- "Empty directory"
- `MarketplaceApp.tsx:171` -- Context-aware empty state ("No packages installed yet" vs "No results for...")
- `KGViewer` (MemoryApp) -- Network icon + "No knowledge graph data"
- **Missing:** No empty state for DashboardApp when there are no workspaces. No empty state for EventsApp when there are no events.

**Error states -- GOOD:**
- `CockpitApp.tsx:77-80` -- Offline banner with AlertTriangle icon and destructive styling
- `ErrorBoundary.tsx` -- App-level error catch
- `VaultApp.tsx` -- Toast notifications for validation errors
- Network offline detection throughout (`useOfflineStatus` hook)

**Hover states -- EXCELLENT:**
- 272 `hover:` utility uses across OS components
- 298 `transition` uses across OS components
- Consistent hover patterns: `hover:bg-muted`, `hover:text-foreground`, `hover:border-primary/50`
- The `waggle-interactive`, `waggle-card-lift`, `waggle-nav-hover`, and `waggle-press` utility classes in `waggle-theme.css` provide standardized hover/active behaviors
- Chat messages show copy and pin buttons on hover

**Micro-interactions:**
- `send-flash` animation on chat send
- `honey-pulse` animation on memory save
- `heartbeat` animation on health dots
- `hex-cursor` blinking for streaming state
- Dock items bounce on hover (spring animation)
- Window snap preview shows before drop

**Fix recommendations:**
1. Add empty state illustrations for DashboardApp (no workspaces) and EventsApp (no events).
2. Consider skeleton loading states instead of spinner-only for content-heavy views (DashboardApp, AgentsApp).

---

## AI Slop Detection

**Score: 2/10 sloppiness (meaning: mostly clean)**

**Gratuitous gradients:**
- Only one gradient found: `Desktop.tsx:203` uses `linear-gradient(90deg, transparent, hsl(var(--primary) / 0.3), transparent)` for a decorative divider line on the empty desktop. This is tasteful, not gratuitous.
- `Desktop.tsx:189-190` uses a radial gradient mask on the logo. Functional, not decorative.
- No purple-to-blue gradient defaults anywhere. The accent purple (`#a78bfa`) is used sparingly and intentionally for AI activity indicators.

**Glass morphism:**
- Used extensively: `glass` and `glass-strong` utility classes. Found in 17 components (`backdrop-blur-sm` or `backdrop-blur`).
- The glass morphism is part of the intentional OS metaphor (Dock, StatusBar, window snap preview, overlays). It is consistent and purposeful, not slapped on randomly.
- Overlay backdrops consistently use `bg-background/60 backdrop-blur-sm` -- a unified pattern.
- **Verdict:** Intentional design choice, not AI slop.

**Generic patterns:**
- `App.css` in the web app (`apps/web/src/App.css`) is **pure Vite scaffold CSS** that was never cleaned up. It contains `.logo`, `.card`, `.read-the-docs`, and `logo-spin` animation from the default Vite React template. This is dead code.
- No "inspired by Vercel" black-and-white defaults. The Hive DS color palette is distinctive.
- No gratuitous purple-to-blue gradients.
- No generic "glassmorphism card with gradient border" patterns that scream AI-generated.

**Verdict:** The design is authentically crafted, not AI-generated slop. The honey/dark theme is distinctive and consistent. The one flag is the dead `App.css` scaffold that should be deleted.

---

## Design Token Inventory

### What Exists (Defined)

| Category | Count | Location |
|----------|-------|----------|
| Hive gray scale | 12 stops | `app/src/styles/globals.css` |
| Honey scale | 8 stops + 2 special | `app/src/styles/globals.css` |
| shadcn semantic colors | 16 vars | `app/src/styles/globals.css` |
| Status colors | 5 | `app/src/styles/globals.css` |
| Semantic surfaces | 5 | `app/src/styles/globals.css` |
| Shadows | 4 | `app/src/styles/globals.css` |
| KG node colors | 5 | `app/src/styles/waggle-theme.css` |
| Step/event stream colors | 10 | `app/src/styles/waggle-theme.css` |
| Chat bubble colors | 2 | `app/src/styles/waggle-theme.css` |
| Legacy component tokens | 8 | `app/src/styles/waggle-theme.css` |
| Glass utility | 2 classes | `apps/web/src/index.css` |
| Interaction utilities | 4 classes | `app/src/styles/waggle-theme.css` |
| Animations | 9 keyframes | `app/src/styles/globals.css` |
| Light theme | Full set | `app/src/styles/globals.css` |
| Tailwind custom keyframes | 4 | `apps/web/tailwind.config.ts` |

### What Is Needed But Missing

| Token | Why |
|-------|-----|
| **Type scale** | No defined set of font sizes. Currently 10+ arbitrary sizes used. Need 6-7 named stops. |
| **Status color Tailwind mappings** | `--status-healthy` exists but no `text-status-healthy` Tailwind utility. Devs use `text-emerald-400` instead. |
| **Tier colors** | Solo/Basic/Teams/Enterprise tiers have no defined color tokens. Templates and personas also lack color tokens. |
| **Icon size scale** | Icons range from `w-2.5` to `w-10` with no defined scale. Need `--icon-xs`, `--icon-sm`, `--icon-md`, `--icon-lg`. |
| **Spacing tokens for layout** | Window dimensions, dock height, status bar height, sidebar width -- all hardcoded. Should be design tokens. |
| **Z-index scale** | Z-indexes range from 1 to 9999 with no defined layers. Need named layers: `--z-dock`, `--z-window`, `--z-overlay`, `--z-boot`. |
| **Breakpoint tokens** | No responsive breakpoints defined. Need at minimum a `--min-viewport` token. |
| **Focus ring token** | Already exists via shadcn `--ring` but not used consistently in hand-rolled components. |

---

## Critical Finding: Two Divergent CSS Systems

The most significant structural problem is that `app/` (Tauri) and `apps/web/` (web) have completely different CSS foundations:

| Property | `app/src/styles/globals.css` | `apps/web/src/index.css` |
|----------|------------------------------|--------------------------|
| Tailwind version | v4 (`@import "tailwindcss"`) | v3 (`@tailwind base/components/utilities`) |
| Background hue | `222` (cold blue) | `30` (warm amber) |
| Card hue | `222` (cold blue) | `30` (warm amber) |
| Primary | `40 100% 45%` | `38 92% 50%` |
| Accent | `270 60% 68%` (purple) | `38 92% 50%` (same as primary!) |
| Body font | Inter (bundled) | DM Sans (Google CDN) |
| Display font | (not explicitly set) | Space Grotesk (Google CDN) |
| Glass utility | Not defined in CSS | Defined in `@layer utilities` |
| Extended palette | Full hive/honey/status/semantic | None |
| Light theme | Full definition | None |
| Chat prose | Full definition | None |
| Animations | 9 custom keyframes | None |
| Interaction utilities | 4 utility classes | None |

**The web app is missing the entire extended Hive DS palette, light theme, animations, and interaction utilities.** It relies on inline `style={{ color: 'var(--hive-400)' }}` references to CSS variables that are not defined in its own stylesheet (they would only work if the `app/` CSS were also loaded, which it is not in the web build).

**This means:** Every `style={{ color: 'var(--hive-XXX)' }}` in the web app components is referencing **undefined variables**. These will render as black or the initial value. There are 35 such references across 13 files in `apps/web/src/`.

**Fix recommendations:**
1. **Port the extended Hive DS palette** from `app/src/styles/globals.css` to `apps/web/src/index.css`.
2. **Reconcile the base HSL values** -- pick either warm-amber or cold-blue, not both.
3. **Fix the accent divergence** -- in the web app, `--accent` equals `--primary` (both honey). In the Tauri app, `--accent` is purple. This breaks any component that differentiates between primary and accent colors.
4. Consider a shared `packages/ui/styles/tokens.css` that both apps import.

---

## Summary and Priority Matrix

| Dimension | Score | Priority |
|-----------|-------|----------|
| 1. Color consistency | 7/10 | P1 -- Status color tokens needed |
| 2. Typography hierarchy | 4/10 | **P0 -- Type scale is absent, accessibility failure** |
| 3. Spacing rhythm | 7/10 | P2 -- Minor cleanup |
| 4. Component consistency | 6/10 | P1 -- Hand-rolled inputs, dual libraries |
| 5. Responsive behavior | 2/10 | P2 -- Intentional but needs minimum safeguards |
| 6. Dark mode | 8/10 | P2 -- Light theme exists but is inaccessible |
| 7. Animation | 8/10 | P3 -- Minor polish |
| 8. Accessibility | 3/10 | **P0 -- Contrast failure, tiny text, missing ARIA** |
| 9. Information density | 6/10 | P1 -- StatusBar and ModelPilot too dense |
| 10. Polish | 7/10 | P2 -- Missing some empty states |
| **AI Slop** | **Clean** | P3 -- Delete dead `App.css` |
| **CSS divergence** | **Critical** | **P0 -- Two incompatible CSS systems** |

**Overall: 6.3 / 10**

### Top 5 Actions (In Order)

1. **Unify the CSS systems.** Port the Hive DS extended palette, light theme, animations, and interaction utilities from `app/src/styles/globals.css` into a shared location that `apps/web/src/index.css` imports. Fix the 35 undefined CSS variable references in web app components.

2. **Define and enforce a type scale.** Create 6-7 named size tokens, add Tailwind utilities, ban arbitrary `text-[Npx]`. Eliminate all text below 11px (97 instances).

3. **Fix muted-foreground contrast.** Increase from `#5a6380` (3.5:1) to at minimum `#7d869e` (5:1) for WCAG AA. This affects every component in the app.

4. **Create status color Tailwind utilities.** Map `--status-healthy`, `--status-warning`, `--status-error`, `--status-info`, `--status-ai` to Tailwind classes so developers stop using raw `text-emerald-400` (50+ instances to replace).

5. **Replace hand-rolled form inputs with shadcn components.** At least 15 `<input>` elements across AgentsApp, SettingsApp, CreateAgentForm, CreateGroupForm, and GroupDetail are styled inconsistently and have different focus behaviors than the shadcn Input component.

---

*Audit conducted via automated source scan of all CSS files, Tailwind configs, and 45+ component files in `apps/web/src/components/os/`. All line references are from the current HEAD.*
