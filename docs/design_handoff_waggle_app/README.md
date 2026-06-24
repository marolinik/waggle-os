# Handoff: Waggle — App + Landing Refactor (the "warm Hive" concept)

> A complete design concept for refactoring **Waggle OS** — the persistent-memory,
> local-first, model-agnostic AI workspace (monorepo: `marolinik/waggle-os`,
> memory substrate: `marolinik/hive-mind`). This package contains **22 interactive
> HTML design references** plus the design-system stylesheet, and the brief to
> recreate them in the real codebase.

---

## 1. Overview

Waggle is a workspace-native AI agent platform: persistent memory that compounds,
model-agnostic orchestration (Claude / GPT / Gemini / **local** models), a skills +
connectors marketplace, a multi-agent "waggle-dance" swarm, and an "AI-OS" launcher
that runs external coding agents (Claude Code, Cursor, Codex…) **inside a workspace's
shared memory**. It ships as a **Tauri desktop app for Windows + macOS**.

This concept is a top-to-bottom redesign addressing five problems found in the live
product:

1. **Overloaded navigation** — ~18 always-visible destinations across 5 zones.
2. **Engineer-first language** — "Spawn", "Waggle-Dance", "MCPs", "GEPA".
3. **Uniform 10–13px density** — reads as a control panel, never premium.
4. **Five semantic colors firing at once** over glass + wallpaper + honeycomb.
5. **Hidden differentiators** — memory, overnight work, coordination buried in tallies.

The response is a **warmer "Hive" identity**, a **5-item spine + ⌘K command bar**
(progressive disclosure), **plain-language labels with the technical term as a
subtitle**, and **legible "hero moments"** for the differentiators.

**Target users:** knowledge workers / operators (non-technical first), without
removing any depth power users need.

---

## 2. About the design files (READ THIS FIRST)

The files in `design-files/` are **design references created in HTML** — interactive
prototypes that show intended **look, layout, copy, and behavior**. They are **not
production code to copy verbatim.**

**Your task:** recreate these designs inside the **existing Waggle codebase**
(`apps/web` is React + TypeScript + Vite + Tailwind + shadcn/ui + React Router;
`apps/www` is the Next.js marketing site), using its established components,
routing, state, and data layer. Where this concept introduces a new pattern (e.g.
the ⌘K palette, the warm token set), implement it in the codebase's idiom — don't
paste HTML/inline styles.

Two files are the entry points:
- **`Waggle Reimagined.html`** — the concept narrative + an index that embeds every
  app screen in an iframe. Open it first; its top nav links to every section.
- **`Waggle Landing.html`** — the redesigned public marketing site (`apps/www`).

Everything shares **one stylesheet: `design-files/styles/waggle.css`** — the source
of truth for tokens (see §7).

---

## 3. Fidelity

**High-fidelity.** Final colors, typography, spacing, radii, shadows, motion, and
copy are all intentional and specified in §7 and the per-screen appendix (§10).
Recreate the UI pixel-faithfully using the codebase's existing libraries — map the
tokens in `waggle.css` onto the Tailwind theme / CSS variables, then build screens
with shadcn/ui primitives styled to match.

One caveat: the prototypes use vanilla JS for view-switching and the dark/light
toggle. That plumbing is **demonstration scaffolding** — replace it with real React
state, React Router routes, and the app's theme provider. The visuals, layout, and
interaction *design* are what to preserve.

---

## 4. Information architecture (the spine)

Collapse ~18 destinations into **5 everyday places**, with everything else reachable
from **⌘K**:

| Spine item        | Plain label        | Maps to existing routes / apps |
|-------------------|--------------------|--------------------------------|
| Home              | Home               | `/home` (HomeCockpit)          |
| Chat              | Chat               | the agent runtime / chat       |
| Memory            | Memory             | `/memory` + per-workspace Memory tab |
| Agents & tasks    | Agents & tasks     | `/agents` + `/automations` + `/approvals` |
| Library           | Library            | `/artifacts` + `/files` + `/skills` |

**⌘K command bar** holds the full depth, each entry **plain-language with the
technical term as a subtitle** (e.g. "Run a team of agents · waggle-dance · swarm";
"Connect a tool · MCP servers"; "Launch a coding agent · Claude Code · Cursor").
A **Pro mode** floats a "★ Pinned" group of power tools to the top of ⌘K.

Reference: `screens/ia.html` (working sidebar + ⌘K + Pro toggle).

---

## 5. The screens (what's in this bundle)

22 interactive references. Most use a top **segmented control** to switch
variations or sub-views — that chrome is prototype-only; ship the chosen variation
(noted per screen in §10) or wire the others as real routes/states.

| # | File | Screen(s) | Notes |
|---|------|-----------|-------|
| — | `Waggle Reimagined.html` | Concept index + narrative | embeds all app screens; coverage map at the end |
| — | `Waggle Landing.html` | Marketing site (`apps/www`) | hero, BYO-agent, proof (SOTA), self-evolve, personas, pricing, footer |
| 01 | `screens/home.html` | Home / Cockpit | **ship variation A (Editorial)**; B/C are alternates |
| 02 | `screens/chat.html` | Chat / agent runtime | **ship variation B (split work-canvas)** as default |
| 03 | `screens/workspace.html` | Single workspace | **ship variation A (Overview+tabs)**; Memory stays a tab |
| 04 | `screens/workspaces.html` | All-workspaces index | grid + table; storage badges; search/filter |
| 05 | `screens/ia.html` | Sidebar + ⌘K command bar | calm spine + Pro-pinned |
| 06 | `screens/launcher.html` | Launcher (AI-OS) | external agents share workspace memory |
| 07 | `screens/storage.html` | Storage & Files | virtual/local/team model + file browser |
| 08 | `screens/surfaces.html` | Power surfaces | Tools · Automations · Approvals · Vault · Usage |
| 09 | `screens/marketplace.html` | Marketplace | agent-searchable; **shared install state ("sync")**; inline-in-chat |
| 10 | `screens/onboarding.html` | First-run (6 steps) | includes the **required model gate** |
| 11 | `screens/settings.html` | Settings | progressive disclosure; **Models + failover pilot** |
| 12 | `screens/evolution.html` | Skill evolution + diffusion | the second moat |
| 13 | `screens/auth.html` | Auth (Clerk) | sign in/up, OTP verify, SSO |
| 14 | `screens/billing.html` | Billing (Stripe) | plans → checkout → success → manage |
| 15 | `screens/habit.html` | Engagement / habit loop | streak, compounding, variable reward, nudges |
| 16 | `screens/appsurfaces.html` | Agents · Room · Artifacts · Mission Control · Timeline · Profile | six routes, one rail |
| 17 | `screens/benchmark.html` | Benchmarks | capability matrix vs competitors + LoCoMo SOTA |
| 18 | `screens/platform.html` | Platform & roadmap | Tauri desktop, boot, 404, "coming next" |

Per-screen detail (layout, components, copy, interactions, ship-this-variation) is
in **§10**.

---

## 6. Global patterns (apply everywhere)

- **App chrome:** left **sidebar** (5 items + workspace switcher + user row), main
  column with a **`.shead`** (title + subtitle + primary action) over a scrolling
  body. Power surfaces and Settings use a **secondary left rail** inside the main column.
- **Density & scale:** body 16px / 1.55; never below 12px. Section labels are
  11px mono, uppercase, `.12em` tracking, `--text-dim`, with a trailing hairline rule.
- **One accent:** honey (`--honey`) is used sparingly — primary buttons, active nav,
  key numbers, focus. Semantics (work/intel/healthy/attention/risk) are **desaturated**
  and only for status, never decoration.
- **Provenance everywhere:** any memory/fact/artifact shows a `⬡ source · when` line in
  mono / `--intel`. This is a core trust pattern — keep it.
- **Cards:** `--surface` bg, `1px solid --line-soft`, radius `--r-lg` (18px),
  hover → `--honey-line` border + `translateY(-2px)` + `--shadow`.
- **Buttons:** primary = honey bg / `#1a1407` text; ghost = `--surface` / `--line-strong`
  border, hover honey border. Radius 9–13px. See §7.
- **Dark + light:** every screen supports both via `[data-theme]`. The toggle in the
  prototypes writes `localStorage['waggle-concept-theme']`; replace with the app theme
  provider. Both themes are warm (warm graphite ↔ warm paper) — see §7.
- **Motion:** entrances `cubic-bezier(.16,1,.3,1)` ~.7s, gated so content is visible
  if JS/print/reduced-motion. Hover transitions .14–.18s. A live "breathing" dot
  (`@keyframes breathe`) marks active/live status. Honor `prefers-reduced-motion`.
- **Focus:** `2px solid --honey`, `2px` offset. Keep keyboard access on ⌘K, OTP, forms.

---

## 7. Design tokens (source of truth: `styles/waggle.css`)

Map these onto the codebase's Tailwind theme + CSS variables. **Dark is default;**
`[data-theme="light"]` overrides. All radii/type/shadow tokens are theme-independent.

### Colors — Dark (default)
```
--bg:          #14110b   (app background, warm near-black)
--bg-2:        #1a160f   (recessed panels, rails)
--surface:     #1f1a12   (cards)
--surface-2:   #272117   (hover / insets)
--surface-3:   #322a1d   (chips, icon tiles)
--line:        #38301f   (default border)
--line-soft:   #2a2417   (subtle dividers)
--line-strong: #4a4030   (emphasized border / scrollbar)
--text:        #f6f1e4   (primary)
--text-2:      #c8bfa9   (secondary)
--text-muted:  #948a73   (tertiary / body-muted)
--text-dim:    #6b6250   (labels, meta)
```
### Colors — Light (`[data-theme="light"]`)
```
--bg:#f7f1e4  --bg-2:#f1e9d8  --surface:#fffdf8  --surface-2:#f6efe0  --surface-3:#efe6d2
--line:#e4d8be  --line-soft:#ede3cd  --line-strong:#d2c3a2
--text:#211b11  --text-2:#5a5140  --text-muted:#847a64  --text-dim:#a99e85
```
### Accent — Honey (the one accent)
```
Dark:   --honey:#e9a52c  --honey-bright:#f6c45a  --honey-deep:#c07e16
Light:  --honey:#b57d12  --honey-bright:#cf932a  --honey-deep:#92620a
--honey-wash: rgba(honey, .10)   (tinted fills)
--honey-line: rgba(honey, .28)   (tinted borders)
--honey-glow: 0 0 0 1px rgba(honey,.25), 0 8px 30px -10px rgba(honey,.35)
On honey buttons, text/icon color is #1a1407.
```
### Semantics (desaturated; status only) — Dark / Light
```
--work     #7aa6d6 / #3f72b0   (tasks, workspaces, blue)
--intel    #b196dd / #7d57b8   (memory/intelligence, violet) — also provenance
--healthy  #6cb78c / #3c8a5f   (complete/healthy, sage)
--attention#e9a52c / #b57d12   (attention/automation = honey)
--risk     #db8068 / #c0573c   (risk/failure, terracotta)
Each has a matching *-wash at ~.12 alpha for tinted chips/fills.
```
### Typography
```
--sans:  'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
--mono:  'JetBrains Mono', ui-monospace, monospace
--serif: var(--sans)   ← display intentionally uses the SAME grotesk (no book-serif)

Display headlines: Hanken Grotesk 600, letter-spacing -0.02 to -0.03em.
  - Hero (landing): clamp(40px, 5.6vw, 68px)
  - Section H2:     clamp(28px, 3.8vw, 44px)
  - Screen H1:      ~24–28px / 650
Body: 14–16px / 400–550, line-height ~1.55.
Labels/meta: 10–12px JetBrains Mono, uppercase, letter-spacing .10–.14em.
Honey words in headlines are NOT italic — same weight, just --honey color.
```
### Radius / Shadow / Misc
```
--r-sm:8px  --r:12px  --r-lg:18px  --r-xl:26px   (pills/toggles: 999px)
--shadow-sm: 0 1px 2px rgba(0,0,0,.4)
--shadow:    0 4px 24px -8px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.4)
--shadow-lg: 0 24px 60px -20px rgba(0,0,0,.7), 0 2px 8px rgba(0,0,0,.4)
--shadow-pop:0 30px 80px -24px rgba(0,0,0,.8)
(light theme has softer brown-tinted equivalents — see waggle.css)
Hexagon motif: .hex { clip-path: polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%); }
  used for the brandmark, agent/workspace avatars, icon tiles.
Honeycomb texture: .comb (inline SVG bg at ~.05 opacity) — very subtle, decorative only.
Live dot: .dot-live → @keyframes breathe (2.4s).
```

---

## 8. Cross-cutting behaviors to implement

- **⌘K command palette** (`screens/ia.html`): global hotkey (⌘/Ctrl-K) toggles a
  centered modal; fuzzy filter over grouped commands; arrow/Enter/Esc keyboard nav;
  groups = Jump to / Do / Power tools; Pro mode prepends a "★ Pinned" group. Each
  result = plain name + mono subtitle (technical term). Routes to real destinations.
- **Theme:** dark default; persist user choice; both themes are warm. Use the app
  theme provider, not localStorage scaffolding.
- **Marketplace install = one shared state** (`screens/marketplace.html`): a single
  install store drives the grid, the agent-suggestion picks, AND the inline-in-chat
  card — installing anywhere reflects everywhere ("sync"). Type-aware one-click flows:
  **skill** = instant Add; **connector** = "Connect" → auth → token to Vault;
  **MCP** = "Enable" tools. Each fires a confirmation toast + updates an
  "N in this workspace" bar.
- **Onboarding model gate** (`screens/onboarding.html`, step 3): the flow **cannot
  reach "first task" without a working model** — either a validated provider API key
  or a detected/running local model. This mirrors the hard requirement that Waggle
  needs ≥1 working model. The same gate's permanent home is Settings → Models.
- **Model failover pilot** (`screens/settings.html`): Primary → **Fallback on
  error** → **Budget/local model when daily budget hit**. Maps to the repo's
  `defaultModel / fallbackModel / budgetModel` + `budgetThreshold / dailyBudget`.
- **Provenance** on every memory/artifact/fact (see §6).
- **Approvals**: agent actions that touch external systems gate on a risk-badged
  approval card (inline in chat + an Approvals surface). "Always allow for this
  workspace" is an option.

---

## 9. The marketing site (`Waggle Landing.html` → `apps/www`)

Full content rewrite + new identity. Sections in order: nav → hero ("Your AI
doesn't reset. Your work doesn't either.") → trust band → problem → 6 pillars →
how-it-works (3 steps) → **Bring-your-own-agent** band (launch Claude Code/Cursor/Codex
into shared memory) → **Proof** (LoCoMo SOTA: Waggle 87.66 vs Memori 81.95 /
LangMem 78.05 / Mem0 62.47; +5.71pp, p<10⁻⁵; 92.75% single-hop; 100% local) →
**Self-evolving** (skills improve 71→84→91% + diffuse across the hive) → personas
(13) → pricing (Solo $0 / Pro $19 / Teams $49-seat + KVARK sovereign) → final CTA →
footer. All copy is final; lift it verbatim. Reveal-on-scroll is JS-gated so content
is always visible without JS (keep that property for SEO/no-JS).

**Numbers come from the real benchmark docs / `hive-mind` repo. Keep them accurate;
if the public claim must stay conservative until the SOTA PR merges, gate the headline.**

---

## 10. Per-screen specifications

See **`SCREENS.md`** in this folder for the full per-screen breakdown (layout,
components, exact copy, interactions, and **which variation to ship**).

---

## 11. Assets

- **No raster assets / no external images.** All iconography is **inline SVG**
  (1.7–1.8 stroke, round caps) — reuse the codebase's icon set (e.g. lucide) matched
  to these shapes. The brandmark is the letter **W** in a `.hex` clip-path over a
  honey gradient. The honeycomb texture is an inline SVG data-URI (`.comb` in
  `waggle.css`).
- **Fonts:** Hanken Grotesk + JetBrains Mono (Google Fonts). Self-host in the Tauri
  app for offline use.
- **Competitor / provider names** (Stripe, Clerk, Salesforce, Claude, GPT, etc.) are
  shown as mono text/initials, not logos — swap in real logos per each brand's
  guidelines if desired.

---

## 12. Tech mapping (existing monorepo)

```
apps/web   React + TS + Vite + Tailwind + shadcn/ui + React Router  → all app screens
apps/www   Next.js marketing site                                   → Waggle Landing.html
apps/browser-ext                                                    → roadmap (beta)
packages/* core / memory (hive-mind) / agent runtime / connectors / mcp
Desktop    Tauri (Windows + macOS)                                  → screens/platform.html
Auth       Clerk    → screens/auth.html
Billing    Stripe   → screens/billing.html
```
Recommended order: **(1)** tokens → Tailwind theme + theme provider; **(2)** app
shell (sidebar + ⌘K); **(3)** Home, Chat, Workspace; **(4)** Marketplace + install
store; **(5)** Settings (models/failover) + Onboarding gate; **(6)** the remaining
surfaces; **(7)** Auth + Billing; **(8)** `apps/www` landing. Ship dark first.

---

## 13. Files in this bundle
```
design_handoff_waggle_app/
├── README.md            ← this file
├── SCREENS.md           ← per-screen specifications
├── DESIGN_POV.md        ← designer's strategic contributions (incl. the built Trust layer)
├── screenshots/         ← reference captures (1 per screen) + index
│   ├── README.md
│   └── 00–19 *.png
└── design-files/
    ├── Waggle Reimagined.html   ← concept index (open first)
    ├── Waggle Landing.html      ← marketing site
    ├── styles/waggle.css        ← design tokens (source of truth)
    └── screens/*.html           ← 19 app-screen references
```
Open `design-files/Waggle Reimagined.html` in a browser and use its top nav to walk
the whole concept; toggle dark/light with the ☾ button; try ⌘K inside the Navigation
section.
