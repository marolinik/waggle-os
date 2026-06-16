# PR3 Recon — Warm-Hive primitives & global patterns

> One shared vocabulary for the three PR3 screen builders (Home / Chat / Workspace).
> Post-PR1 inventory of what already exists in `apps/web` + the design's global
> patterns extracted from `docs/design_handoff_waggle_app/`. **Use the token names
> and components below — do NOT invent ad-hoc colors or re-build atoms that exist.**

Sources of truth:
- Warm tokens: `apps/web/src/index.css` (`@layer base`) + `apps/web/src/waggle-theme.css`
  (note: file is at `src/`, NOT `src/styles/`).
- Tailwind utilities: `apps/web/tailwind.config.ts`
- Design global: `docs/design_handoff_waggle_app/README.md` §6/§7 + `SCREENS.md` 01/02/03

---

## 1. Warm token cheatsheet

Dark is the default `:root`; `:root[data-theme="light"]` overrides every color. Radii /
type / shadow tokens are theme-independent. Prefer the **named warm token** (`var(--x)`)
for screen chrome; the **shadcn HSL utility** (`bg-card`, `text-foreground`) for any
component that already derives from the HSL core.

### Surfaces (`apps/web/src/index.css:20-44, 149-153`)
| Token | Dark hex | Tailwind / usage |
|---|---|---|
| `--bg` | `#14110b` | `bg-background` — app shell |
| `--bg-2` | `#1a160f` | rails, recessed panels (sidebar uses `bg-[var(--bg-2)]`) |
| `--surface` *(= `--card`)* | `#1f1a12` | `bg-card` — cards |
| `--surface-2` *(= `--secondary`)* | `#272117` | `bg-secondary` — hover/insets |
| `--surface-3` *(= `--muted`)* | `#322a1d` | `bg-muted` — chips, icon tiles |
| `--line` | `#38301f` | `border-border` ≈ — default border |
| `--line-soft` | `#2a2417` | subtle dividers (card border in design = `--line-soft`) |
| `--line-strong` | `#4a4030` | emphasized border / kbd / scrollbar |

### Text (`index.css:21,36,89,153` + `waggle-theme.css:24-29`)
| Token | Tailwind / alias |
|---|---|
| `--text` *(= `--foreground`)* `#f6f1e4` | `text-foreground` |
| `--text-2` `#c8bfa9` | secondary copy |
| `--text-muted` *(= `--muted-foreground`)* `#948a73` | `text-muted-foreground` |
| `--text-dim` *(= `--hive-500` `#6b6250`)* | labels, meta, mono section labels |

### Honey — the ONE accent (`index.css:91-100, 155-159`)
| Token | Dark hex | Notes |
|---|---|---|
| `--honey` *(= `--honey-500`, `--primary`)* | `#e9a52c` | `bg-primary` / `text-honey-500`; primary btn, active nav, key numbers, focus |
| `--honey-bright` *(= `--honey-400`)* | `#f6c45a` | gradient top of hex avatar |
| `--honey-deep` *(= `--honey-600`)* | `#c07e16` | gradient bottom of hex avatar |
| `--honey-wash` | `rgba(233,165,44,.10)` | tinted fills (active nav bg, streak/honey chips) |
| `--honey-line` | `rgba(233,165,44,.28)` | tinted borders (card hover, chip border) |
| `--honey-glow` | `rgba(233,165,44,.12)` | soft glow / `--shadow-honey` |
| **On-honey ink** | `#1a1407` | text/icon color on any honey fill (matches `--primary-foreground`) |

### Semantics — desaturated, STATUS ONLY (never decoration) (`index.css:161-169`)
| Token | Dark / Light | Meaning | Wash |
|---|---|---|---|
| `--work` | `#7aa6d6` / `#3f72b0` | tasks, workspaces (blue) | `--work-wash` |
| `--intel` | `#b196dd` / `#7d57b8` | memory / intelligence / **provenance** (violet) | `--intel-wash` |
| `--healthy` | `#6cb78c` / `#3c8a5f` | complete / healthy (sage) | `--healthy-wash` |
| `--attention` | `#e9a52c` / `#b57d12` | attention / automation (= honey) | (use `--honey-wash`) |
| `--risk` | `#db8068` / `#c0573c` | risk / failure (terracotta) | `--risk-wash` |

> There is also a parallel `--sem-*` alias set (`--sem-work/-intelligence/-healthy/-attention/-risk`,
> `index.css:110-114`) wired into the EXISTING primitives (StatusBadge, ConfidenceBadge).
> The vivid `--status-*` / `bg-status-*` tokens (`#34d399` etc.) are the legacy palette —
> **prefer the desaturated `--work/--intel/...` (or `--sem-*`) for warm-Hive screens.**

### Shadows / radii / fonts (`index.css:171-183`)
| Token | Value |
|---|---|
| `--shadow-sm` / `--shadow` / `--shadow-lg` / `--shadow-pop` | card → overlay elevation |
| `--shadow-honey` | `0 0 0 1px rgba(233,165,44,.25), 0 8px 30px -10px rgba(233,165,44,.35)` |
| `--r-sm` 8px · `--r` 12px · `--r-lg` 18px · `--r-xl` 26px · pills `999px` | `rounded-sm/md/lg/xl` map to the shadcn radius scale, NOT these raw px — use `rounded-[18px]`/`rounded-[var(--r-lg)]` for design-exact cards |
| `--sans` Hanken Grotesk · `--mono` JetBrains Mono | `font-sans` / `font-mono`; `--serif` = `--sans` (no book-serif) |

> Caveat for builders: Tailwind `rounded-lg` = `--radius` (0.75rem/12px = design `--r`),
> NOT `--r-lg` (18px). Design **cards** want 18px → use `rounded-[18px]`. Design hero
> card wants 26px → `rounded-[26px]`. Pills → `rounded-full`.

### Utility classes already shipped (`index.css` + `waggle-theme.css`)
- `.hex` (`waggle-theme.css:140`) — hex clip-path for brandmark/avatars/tiles.
- `.hex-avatar` (`index.css:377`) — same clip path (duplicate; either works).
- `.comb` (`waggle-theme.css:143`) + `.honeycomb-bg` (`index.css:369`) — subtle hex mesh bg.
- `.dot-live` → `@keyframes breathe` 2.4s (`index.css:429-435`) — live/active status dot.
- `.heartbeat` (2s), `.honey-pulse`, `.float`, `.hex-cursor` (streaming type cursor),
  `.token-stream`, `.send-flash`, `.card-enter`, `.hex-spin` — all in `index.css:408-503`
  and mirrored as Tailwind `animate-*` in `tailwind.config.ts:107-156`.
- `.pill` (`waggle-theme.css:151`) — status/filter chip base.
- `.kbd` (`waggle-theme.css:160`) — keyboard hint chip.
- `.glass` / `.glass-strong` / `.glow-primary` / `.text-glow` (`index.css:334-358`).
- `.waggle-card-lift` (`waggle-theme.css:112`) — hover `translateY(-2px)` + honey border
  (matches design card hover). `.waggle-interactive`, `.waggle-nav-hover`, `.waggle-press`.
- Focus: global `:focus-visible { outline: 2px solid var(--honey-500); offset 2px }`
  (`index.css:389`). Selection = honey @ .28 (`index.css:383`).

---

## 2. Existing reusable components (REUSE — do not rebuild)

| Component | Path | Props | Reuse for which PR3 screen |
|---|---|---|---|
| `ConfidenceBadge` | `apps/web/src/components/ui/confidence-badge.tsx:22` | `value?: number; compact?: boolean; className?` — 0-100 → High/Med/Low band via `--sem-*`, never color-only | Workspace "What Waggle knows" fact rows; Chat memory-write steps |
| `EvidenceChip` | `apps/web/src/components/ui/evidence-chip.tsx:16` | `label: string; title?; onClick?; className?` — the inline provenance pill promoted to a primitive | Chat activity-stream provenance pills; Workspace fact/artifact `⬡ source · when` |
| `EvidencePanel` | `apps/web/src/components/ui/evidence-panel.tsx:18` | `source?; sourceId?; sourceUrl?; evidence?: string[]; className?` — "Provenance & evidence" block of chips | Workspace memory detail; Chat memory-write detail |
| `StatusBadge` | `apps/web/src/components/ui/status-badge.tsx:31` | `tone: 'healthy'\|'attention'\|'risk'\|'info'\|'neutral'; label: string; icon?; className?` — always-labeled `--sem-*` pill | Home run-chip status dots, Workspace status card, all status pills |
| `ApprovalModal` | `apps/web/src/components/ui/approval-modal.tsx:60` | `request: ApprovalRequest\|null; approveLabel?; busy?; onApprove; onCancel` (`ApprovalRequest = {action, scope[], riskLevel, approvalClass?, trustSource?}`) | Chat **inline approval card** is a different surface — but reuse this modal for the same flow + share `RISK_LABELS`/`risk-display.tsx` |
| `DetailDrawer` | `apps/web/src/components/ui/detail-drawer.tsx:22` | `open; onOpenChange; title; subtitle?; headerExtra?; footer?; children; className?` — right sheet for object detail | Workspace fact/artifact detail; Chat artifact detail |
| `BuilderStepper` | `apps/web/src/components/ui/stepper.tsx:29` | `steps: BuilderStep[]; ...` body-portaled focus-trapped modal stepper | not core to Home/Chat/Workspace; available |
| shadcn primitives | `apps/web/src/components/ui/` | card, button, badge, tabs, dialog, tooltip, popover, command, scroll-area, separator, avatar, input, textarea, switch, sheet, sonner/toast, hover-card, dropdown-menu, alert-dialog, progress, skeleton, table, +30 more | Workspace **tab bar** = `tabs.tsx`; ⌘K already on `command.tsx`; cards/buttons everywhere; toasts via `sonner` |
| `Sidebar` (calm spine) | `apps/web/src/components/os/Sidebar.tsx:44` | `workspaceName; spine: SidebarNavItem[]; pinned?; onOpen*; userName; tierLabel` — already implements **active = left honey bar + `--honey-wash` + honey icon** (`Sidebar.tsx:82-91`) and the **hex avatar** inline (`:116`) | Already the shell; reuse its active-state recipe + hex pattern verbatim |
| ⌘K catalog | `apps/web/src/lib/command-catalog.ts:58` | `buildCommandCatalog(ctx)` → plain-name + mono-subtitle groups (Pinned/Jump/Do/Power) | Chat/Home "⌘K" hints route here; don't re-author the vocabulary |

> shadcn `button.tsx` `default` variant = `bg-primary text-primary-foreground` = honey
> bg / `#1a1407` ink → already matches the design primary button. `ghost`/`outline`
> variants cover the design "ghost" button. shadcn `badge.tsx` is **color-capable but
> not always-labeled** — prefer `StatusBadge` when conveying status (a11y).

---

## 3. Missing primitives to build in PR3 (NET-NEW shared components)

These appear across Home/Chat/Workspace and have **no component today** (the hex avatar
exists only as inline markup in `Sidebar.tsx:116`). Build them once as shared atoms.
**Suggested home: `apps/web/src/components/os/warm/`** (new folder for warm-Hive-specific
composite atoms) — keep generic, token-driven, a11y-labeled primitives in `ui/` and the
opinionated warm compositions in `os/warm/`.

| Net-new primitive | Where | Minimal prop API | Used by |
|---|---|---|---|
| `HexAvatar` | `os/warm/HexAvatar.tsx` | `label: string; size?: number; gradient?: boolean; className?` — `.hex` clip + honey gradient `linear-gradient(150deg,var(--honey-bright),var(--honey-deep))` + `#1a1407` initial; extract from `Sidebar.tsx:116` | workspace switcher, Home workspace cards, Chat context header, Workspace header (46px), bot avatar |
| `DotLive` | `os/warm/DotLive.tsx` | `tone?: 'healthy'\|'attention'\|'risk'\|'work'\|'intel'\|'honey'; className?` — colored dot + `.dot-live` breathe; honor `prefers-reduced-motion` | Home greeting live dot, Workspace "1 agent live", status cards |
| `RunChip` | `os/warm/RunChip.tsx` | `label: string; tone?: StatusTone` — status dot + label inline chip ("Teardown drafted · 9 competitors") | Home overnight hero run-chip row |
| `StreakChip` | `os/warm/StreakChip.tsx` | `days: number; weekDots?: boolean[]; className?` — 🔥 + "12-day streak", `--honey-wash` bg / `--honey-line` border | Home greeting (§ habit-loop mechanic lives on Home, not a page) |
| `SectionLabel` | `os/warm/SectionLabel.tsx` | `children; className?` — 11px mono, uppercase, `.12-.14em` tracking, `--text-dim`, trailing hairline rule | every screen section header (README §6) |
| `ScreenHead` (`.shead`) | `os/warm/ScreenHead.tsx` | `title; subtitle?; action?: ReactNode` — H1 (Hanken 600 ~24-28px) + subtitle + primary action row | Workspace header; power surfaces; generic screen chrome (README §6 / SCREENS §08) |
| `ProvenanceLine` | `os/warm/ProvenanceLine.tsx` | `source: string; when?: string; onClick?` — `⬡ source · when` in mono `--intel` | Workspace fact rows + recent-work rows; Chat activity steps (thin wrapper over `EvidenceChip` styled to `--intel` mono) |
| `ModelPill` | `os/warm/ModelPill.tsx` | `mode?: string; model: string; onClick?` — "auto · Claude Sonnet" pill in Chat header | Chat context header |
| `ActivityStream` | `os/warm/ActivityStream.tsx` | `summary: string; durationMs?; steps: {tone, text, provenance?}[]; defaultOpen?` — collapsible `--bg-2` card, violet spark, per-step colored dot + `ProvenanceLine` | Chat "the magic" activity card (default-open on active turn) |
| `InlineApprovalCard` | `os/warm/InlineApprovalCard.tsx` | reuse `ApprovalRequest`; `onApprove; onDecline; alwaysAllow?` — `--honey-wash` bg, attention border, warning icon (NOT a modal — inline in thread) | Chat approval card (shares risk vocab w/ `ApprovalModal`) |
| `OvernightHero` | `os/warm/OvernightHero.tsx` (composite, Home-only) | `eyebrow; statement: ReactNode; runs: RunChipProps[]` — `--r-xl` gradient card + honey radial glow | Home (composes RunChip) |
| `AskBar` | `os/warm/AskBar.tsx` | `placeholder?; onSubmit; cmdkHint?: boolean` — full-width pill, honey `+`, ⌘K hint, honey send | Home (and Chat composer reuses the send affordance) |
| `HexCheckTile` | `os/warm/HexCheckTile.tsx` | `tone?; size?` — small `.hex` tile w/ check, for fact rows | Workspace "What Waggle knows" fact rows |
| `IconTile` | `os/warm/IconTile.tsx` | `icon: ElementType; tone?: StatusTone` — tinted (`*-wash`) rounded square icon tile | Home "Waggle suggests" rows; Workspace recent-work ext tiles |

> Build order suggestion: `HexAvatar`, `SectionLabel`, `ProvenanceLine`, `DotLive`,
> `RunChip`, `IconTile` first (shared by all three screens), then the screen-specific
> composites. Keep each <80 LOC, token-driven, `prefers-reduced-motion`-safe.

---

## 4. Global pattern rules (apply on every PR3 screen)

From `README.md` §6 and `SCREENS.md`:

1. **Density / scale:** body 16px / line-height 1.55 (set on `body`, `index.css:321`);
   **never below 12px**. Honey words in headlines are honey-colored, **not italic**,
   same weight. Headlines Hanken 600, `letter-spacing -0.02em` (already on `h1-h6`,
   `index.css:327`).
2. **Section labels:** 11px **mono**, uppercase, `.12-.14em` tracking, `--text-dim`,
   trailing hairline rule. (Sidebar zone label is the reference: `Sidebar.tsx:102`,
   `9.5px mono uppercase tracking-[0.14em] text-[var(--text-dim)]`.)
3. **One accent — honey, sparingly:** primary buttons, active nav, **key numbers**,
   focus only. Semantics are desaturated and status-only, never decoration.
4. **Cards:** `bg-card` (`--surface`), `1px solid` **`--line-soft`**, radius **18px**
   (`--r-lg`), hover → `--honey-line` border + `translateY(-2px)` + `--shadow`. Use
   `.waggle-card-lift` for the hover recipe.
5. **Active nav state:** **left honey bar** (`absolute -left-3 h-[18px] w-[3px] bg-[var(--honey)]`)
   + `--honey-wash` bg + honey icon — already implemented in `Sidebar.tsx:82-91`; mirror
   on the Workspace tab bar as a **honey underline** on the active tab.
6. **Provenance everywhere:** any memory / fact / artifact shows `⬡ source · when` in
   **mono / `--intel`**. Core trust pattern — never drop it. Use `ProvenanceLine` /
   `EvidenceChip`.
7. **Buttons:** primary = honey bg / `#1a1407` ink (shadcn `default`); ghost = `bg-card`
   / `--line-strong` border, hover honey border. Radius 9-13px.
8. **Hex motif:** brandmark + agent/workspace avatars + icon tiles use `.hex` clip with
   the honey gradient. Honeycomb (`.comb`/`.honeycomb-bg`) is decorative-only at ~.05.
9. **Motion:** entrances `cubic-bezier(.16,1,.3,1)` ~.7s, **content visible without JS /
   reduced-motion**. Hover transitions .14-.18s. Live status = `.dot-live` (breathe 2.4s).
   **Honor `prefers-reduced-motion`** on every animated atom.
10. **Focus / a11y:** `2px solid --honey`, 2px offset (global). Status is **never
    color-only** — always a text label (StatusBadge/ConfidenceBadge pattern). Keep
    keyboard access on ⌘K, tabs, composer.
11. **Dark + light:** both warm (graphite ↔ paper) via `:root[data-theme="light"]`;
    drive through the app theme provider (`apps/web/src/providers/ThemeProvider.tsx`),
    NOT localStorage scaffolding. Every new color must resolve from a token so light
    mode inherits for free (light-mode AA is test-guarded).

### Per-screen anchor (ship-variation)
- **Home → Variation A (Editorial):** centered column max-w 920px; greeting (mono date +
  DotLive + StreakChip) → OvernightHero (run chips) → "Pick up where you left off" 2-col
  workspace cards (HexAvatar) → "Waggle suggests" rows (IconTile) → AskBar. (`SCREENS.md` 01)
- **Chat → Variation B (Split work canvas):** context header (HexAvatar + name + memory
  count + ModelPill) → thread (user bubble asymmetric radius `4px 14px 14px 14px`; bot
  hex avatar; ActivityStream w/ ProvenanceLine; InlineApprovalCard) → composer; right
  work-canvas (~42%) with `.hex-cursor` live draft. (`SCREENS.md` 02)
- **Workspace → Variation A (Overview + tabs, Memory = a tab):** ScreenHead (breadcrumb +
  46px HexAvatar + meta) → Tabs (Overview/Chat/Memory/Artifacts/Files/Team, honey
  underline) → 2-col (1.7fr/1fr): left = summary + "What Waggle knows" (HexCheckTile +
  ProvenanceLine fact rows) + "Recent work" (IconTile rows); right = Status card +
  Up-next + Team. **Do NOT make the graph the default.** (`SCREENS.md` 03)
