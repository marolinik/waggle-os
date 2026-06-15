# Warm-Hive Redesign — Build Plan (DRAFT, pending founder confirmation)

> Source design package: `docs/design_handoff_waggle_app/` (README.md, SCREENS.md,
> DESIGN_POV.md, `design-files/styles/waggle.css`, 19 HTML refs + screenshots).
> This plan recreates that concept **inside the existing `apps/web` stack** (React 19 +
> TS + Vite + Tailwind 3 + shadcn/ui + React Router 6) — not by pasting the HTML.
>
> **Status:** proposal. No feature code until the open decisions in §7 are confirmed.

---

## 1. The concept in one paragraph

A warmer **"Hive"** identity that fixes five live-product problems: overloaded nav
(~18 destinations), engineer-first language, flat 10–13px density, five semantic colors
firing at once, and buried differentiators. The fixes: a **5-item calm spine + ⌘K
command bar** (progressive disclosure), **plain labels with the technical term as a mono
subtitle**, a **single honey accent** with desaturated status-only semantics, **warm
graphite ↔ warm paper** themes, and **"hero moments"** for memory / overnight work /
coordination. Memory is sold as a trustworthy, *editable, accountable* asset — the
**Memory-Trust layer** (DESIGN_POV #1, already designed) is the keystone.

---

## 2. Current state → target gap (grounded in codebase recon)

| Area | Current reality (verified) | Target | Gap size |
|---|---|---|---|
| **Tailwind** | **3.4.17**, JS config `apps/web/tailwind.config.ts` (CLAUDE.md's "Tailwind 4" is stale; root has the `@tailwindcss/vite` plugin but web uses TW3) | n/a — keep TW3, remap token *values* | none (no migration) |
| **Theme infra** | `data-theme="light"` attribute + `localStorage['waggle-theme']`; boot in `App.tsx`, toggle in `SettingsApp.tsx`, reactivity via MutationObserver in `AppShell.tsx` + `useIsLightTheme.ts`. `next-themes` installed but **unused**. | A real **ThemeProvider** owning `data-theme` + persistence + system pref | medium (consolidate scattered logic; infra already matches design's `[data-theme]` selector) |
| **Tokens** | hive-grays (12) + honey (7) + status (5) + KG colors; cooler palette (`--hive-950:#08090c`, `--honey-500:#e5a000`). shadcn core in HSL. | warm Hive set from `waggle.css` (`--bg:#14110b`, `--honey:#e9a52c`, desaturated semantics, +wash/line/glow, r-sm..r-xl, 4 shadows) | medium (values swap + add missing tokens) |
| **Fonts** | Space Grotesk (display) + DM Sans (body) + JetBrains Mono | **Hanken Grotesk** (display+body) + JetBrains Mono | small |
| **UI lib** | **shadcn/ui fully installed** — `components.json`, 57 `ui/` components, `cn()`, CVA, Radix, lucide, framer-motion, sonner, cmdk. (`base-ui` at root but unused.) | same — style shadcn primitives to the tokens | none (design's shadcn assumption holds) |
| **Shell** | `AppShell.tsx` w-52 left nav rendering the **full 5-zone tree** (Work/Intelligence/Extend/Team/System, ~18 destinations) via `dock-tiers.ts` | **5-item spine** (Home, Chat, Memory, Agents & tasks, Library) + workspace switcher + user row; everything else → ⌘K | large (IA collapse) |
| **⌘K** | `CommandCenter.tsx` exists — cmdk, Ctrl/Cmd-K, 6 verb groups, backend search | regroup to **Jump to / Do / Power tools**, plain-name + mono subtitle, first-result auto-select, **Pro "★ Pinned"** group | medium (rework existing) |
| **Routing** | React Router 6.30, ~28 routes under `AppShell` layout, `routeFor(appId, ctx)` | unchanged; spine items map onto existing routes | none |

**Net:** the *plumbing* is in great shape (data-theme strategy, shadcn, cmdk, routing
all align with the design). The real work is (a) a faithful **token + font swap**, (b) a
**ThemeProvider** to replace ad-hoc DOM code, (c) **collapsing the visible nav to 5 + ⌘K**,
then (d) rebuilding screens to the specs.

---

## 3. Token mapping (PR1) — `waggle.css` → `apps/web`

**Strategy:** make the design's **named tokens the source of truth** in `index.css`
(`:root` dark + `:root[data-theme="light"]` light), set to the exact hex from
`waggle.css`, then point the shadcn HSL core tokens and the existing hive/honey scales at
those warm values so the 57 themed components restyle automatically.

### 3.1 Named tokens (verbatim from `waggle.css` §7) — add to `index.css`
- Surfaces: `--bg --bg-2 --surface --surface-2 --surface-3`
- Lines: `--line --line-soft --line-strong`
- Text: `--text --text-2 --text-muted --text-dim`
- Honey: `--honey --honey-bright --honey-deep --honey-wash --honey-line --honey-glow`
- Semantics: `--work --intel --healthy --attention --risk` + each `*-wash`
- Shadows: `--shadow-sm --shadow --shadow-lg --shadow-pop` (warm light variants)
- Radii: `--r-sm:8 --r:12 --r-lg:18 --r-xl:26`; pills/toggles `999px`
- Type: `--sans` (Hanken Grotesk) · `--mono` (JetBrains Mono) · `--serif: var(--sans)`

### 3.2 shadcn HSL core → derive from warm palette (recolor)
Convert warm hex → HSL channels (e.g. `--bg #14110b → --background: 40 29% 6%`):
`--background←--bg` · `--foreground←--text` · `--card/--popover←--surface` ·
`--secondary/--accent/--muted (surface)←--surface-2` · `--muted-foreground←--text-muted` ·
`--border/--input←--line` · `--ring←--honey` · `--primary←--honey` with
`--primary-foreground:#1a1407` · `--destructive←--risk`. Keep the existing
`hive-*`/`honey-*` Tailwind scales but recolor their CSS vars to the warm steps.

### 3.3 Fonts
Swap the Google Fonts `@import` to **Hanken Grotesk (300–800) + JetBrains Mono (400–600)**;
set `body`/`--font-sans` to Hanken, `h1–h6` display to Hanken 600 (`-0.02..-0.03em`),
keep `--font-mono`. (Self-host in the Tauri/Platform pass for offline — follow-up.)

### 3.4 Utilities (port into `waggle-theme.css`, reconcile with existing)
`.hex` clip-path (reconcile with existing `.hex-avatar`) · `.comb` honeycomb data-URI ·
`.dot-live` + `@keyframes breathe` (reconcile with existing `honey-pulse`) ·
`:focus-visible` honey outline · `::selection` honey · warm scrollbar · `.pill` `.kbd`.

### 3.5 PR1 verification
`tsc -p apps/web/tsconfig.app.json` 0 errors · `npm run test` (FE) green · `npm run lint`
clean · visual smoke: dark default + light toggle on Home/Chat/Settings, no contrast
regressions (re-run `light-mode-tokens.test.ts`).

---

## 4. Theme provider (PR1)

New `apps/web/src/providers/ThemeProvider.tsx`: context owning `'dark' | 'light' | 'system'`,
writes `data-theme` + `localStorage['waggle-theme']`, subscribes to
`matchMedia('(prefers-color-scheme)')` when `system`, honors `prefers-reduced-motion` for
entrance gating. Exposes `useTheme()`. **Refactor:** remove the boot snippet in `App.tsx`,
the toggle logic in `SettingsApp.tsx`, and re-back `useIsLightTheme()` with the context
(keep its signature). Recommend a **small custom context** over `next-themes` (Vite SPA,
not Next; keeps the exact `data-theme` contract the design's CSS already targets).

---

## 5. App shell — 5-item spine + ⌘K (PR2)

### 5.1 Sidebar (`ia.html`)
Replace the zone-tree render in `AppShell.tsx:272–303` with:
**workspace switcher pill** (hex + name + chevron) → **5 nav items** with honey active
state (left honey bar + `--honey-wash`) → "Everything else" **⌘K tile** → spacer →
**user row** (avatar + name → Settings). Spine → routes:

| Spine item | Route (initial) | Later combined surface |
|---|---|---|
| Home | `/home` | — |
| Chat | active workspace chat `routeFor('chat', ctx)` → `/workspaces/:id/chat` (fallback `/home`) | — |
| Memory | `/memory` | + per-workspace Memory tab |
| Agents & tasks `[badge]` | `/agents` (badge = pending approvals) | tabs: Agents · Automations · Approvals |
| Library | `/artifacts` | tabs: Artifacts · Files · Skills |

Everything else (waggle-dance, connectors, MCP, marketplace, launcher, room, vault,
mission-control, timeline, usage, team, evolution, benchmark, platform) → **⌘K only**.
**Pro mode** (tier-aware toggle) inserts a "Pinned · power tools" group (Agent swarm,
Connectors, Approvals). Pro-pinned may be deferred to a PR2 follow-up.

### 5.2 ⌘K (`CommandCenter.tsx` rework)
Regroup to **Jump to / Do / Power tools**; each result = icon + **plain name** + **mono
subtitle** (technical term) + optional shortcut; first result auto-selected; **Pro "★
Pinned · Pro"** group prepended in Pro mode. Reuse cmdk + the existing adapter search.
Copy patterns from SCREENS §05 ("Run a team of agents · waggle-dance · swarm", "Connect a
tool · MCP servers · 21 tools", "Launch a coding agent · Claude Code · Cursor · Codex").

### 5.3 PR2 verification
tsc/test/lint green · **live smoke**: every spine item routes; ⌘K opens (Ctrl/Cmd-K),
fuzzy filters, arrow/Enter/Esc nav, routes + closes; all hidden destinations reachable
from ⌘K; active-state highlight via `matchNavRoute`.

---

## 6. Phased roadmap (follows README §12; ship dark first)

| PR | Scope | Key files | Screens |
|---|---|---|---|
| **PR1** | Tokens → TW theme + ThemeProvider + fonts | `index.css`, `tailwind.config.ts`, `waggle-theme.css`, `providers/ThemeProvider.tsx`, `App.tsx`, `SettingsApp.tsx`, `useIsLightTheme.ts` | (foundation) |
| **PR2** | App shell: 5-item sidebar + ⌘K rework | `AppShell.tsx`, `dock-tiers.ts`, `CommandCenter.tsx` | 05 |
| **PR3** | Home (A Editorial) · Chat (B split-canvas) · Workspace (A overview+tabs) | `HomeCockpit`, `ChatWindowInstance`, `WorkspaceChatApp` | 01·02·03 |
| **PR3.5** | **Memory-Trust layer** (DESIGN_POV #1) — confidence/freshness + forget/correct + stale-review + "why did you do that?" trace | `MemoryCenterApp`, memory adapter, `confidence-badge`/`evidence-*` (exist) | 19 |
| **PR4** | Marketplace + **shared install store ("sync")** (grid + agent-pick + inline-in-chat) | `MarketplaceApp`, new install store | 09 |
| **PR5** | Settings (models-first + failover pilot) · Onboarding (6-step + **model gate**) | `SettingsApp`, onboarding wizard | 11·10 |
| **PR6** | Remaining surfaces: Launcher · Storage/Files · Power surfaces · App-surfaces sextet · Evolution · Benchmark · Platform · Habit-on-Home | many | 06·07·08·16·12·17·18·15·04 |
| **PR7** | Auth (Clerk themed) · Billing (Stripe themed) | `auth`, `billing` | 13·14 |
| **PR8** | `apps/www` landing (Next.js) — full content + identity | `apps/www` | Landing |

> **Memory-Trust early (PR3.5):** DESIGN_POV says its primitives "should land early because
> everything else trades on them." Memory is a spine item, so it surfaces in PR2/PR3 anyway —
> wiring trust right after gives the differentiator a real home before the long tail.

---

## 7. Open decisions (need founder confirmation before implementing)

1. **First-PR scope** — split **PR1 (tokens + ThemeProvider + fonts)** then **PR2 (shell +
   ⌘K)** *(recommended — tokens land first, lower risk per PR)*, or one combined PR?
2. **IA collapse** — confirm reducing the always-visible nav from ~18 → **5-item spine +
   ⌘K**, Settings via user row, power features ⌘K-only (+ optional Pro-pinned). Anything
   that **must** stay always-visible beyond the 5?
3. **Memory-Trust placement** — land **early (PR3.5, right after shell)** *(recommended)*
   or after the core screens?
4. **Recommend-and-proceed unless you object:** ThemeProvider = small custom context (not
   `next-themes`); fonts via Google Fonts now / self-host in Platform pass; keep Tailwind 3.
5. **Flag for later (blocks Billing/PR7, not now):** DESIGN_POV #4 — **who pays for
   inference** (BYO-key vs Waggle-metered). Decide before PR7.

---

## 8. Notes / discrepancies surfaced (honesty log)
- CLAUDE.md §1 lists **Tailwind 4** and **base-ui/react**; `apps/web` actually runs
  **Tailwind 3.4.17** and **shadcn/ui + Radix** (base-ui unused in web). No action — just
  don't trust those two CLAUDE.md lines for this work.
- `next-themes` is a dependency but unused; PR1 either adopts or removes it.
- All 19 screen HTMLs + per-screen "ship this variation" notes are in
  `docs/design_handoff_waggle_app/SCREENS.md` — consult per PR.
