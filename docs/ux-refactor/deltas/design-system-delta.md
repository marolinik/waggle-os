# Design System Delta — Waggle OS UX Refactor

**Scope:** PRD §19 (Design System Requirements) + Blueprint "Design System Direction"
mapped against the live Hive DS in `apps/web/src`.
**Execution model (locked):** in-place incremental refactor — reuse existing shadcn/Hive
primitives in `apps/web/src/components/ui/*`; build NEW DS components only where PRD §19.1
names a concept with no existing reusable primitive.

**Grounding sources (read):**
- Tokens: `apps/web/src/index.css` (canonical palette + light theme), `apps/web/src/waggle-theme.css` (aliases), `apps/web/tailwind.config.ts` (token→utility wiring).
- Primitive inventory: `apps/web/src/components/ui/*` (49 files).
- PRD §19.1/§19.2/§19.3 — `docs/.../Waggle_OS_UX_Refactor_PRD.md` lines 1222-1261.
- Blueprint "Design System Direction" — `_blueprint_extracted.txt` lines 479-492.
- Ad-hoc precedents: `MemoryApp.tsx` (provenance chip), `TimelineApp.tsx` (timeline), `OnboardingWizard.tsx` (ad-hoc steps), `ApprovalsApp.tsx` (approvals).

---

## (a) PRD §19.1 Component List — EXISTS vs BUILD-NEW

PRD §19.1 (lines 1226-1242) lists 19 core components. Blueprint adds a few named variants
(ContextCard, MemoryCard, ArtifactRow, AgentCard, SkillCard, ConnectorCard, MCPRow,
AutomationRunRow, EvidencePanel, ApprovalModal — `_blueprint_extracted.txt` lines 487-488).
Mapping below merges both lists.

| PRD §19.1 component | Status | Existing file / build location | Notes |
|---|---|---|---|
| **AppShell** | BUILD-NEW (composes EXISTS) | new `components/os/AppShell.tsx`; compose `ui/sidebar.tsx` + `ui/scroll-area.tsx` | No single AppShell today; current shell is `os/Desktop.tsx` (windowing). PRD §20.3 lists AppShell as Create. Reuse `ui/sidebar.tsx` for left nav. |
| **Primary navigation** | EXISTS (extend) | `ui/sidebar.tsx`, `ui/navigation-menu.tsx` | Full sidebar primitive present (collapsible, rail, groups). Re-label to Work/Intelligence/Extend/Team IA (PRD §3.2). |
| **Workspace switcher** | BUILD-NEW (compose EXISTS) | new; compose `ui/command.tsx` + `ui/dropdown-menu.tsx` | Pattern exists in `sidebar.tsx` docs; assemble against workspace list. |
| **Command Center modal** | EXISTS (primitive) → BUILD-NEW (Ctrl+K shell) | primitive `ui/command.tsx` (cmdk: CommandDialog/Input/Group/Item); new `CommandCenter.tsx` | `ui/command.tsx` is full cmdk wrapper. PRD §20.3 + Blueprint require a global Ctrl+K provider/overlay on top — build the provider, reuse the primitive. Existing `overlays/GlobalSearch.tsx` is a prior, narrower attempt to fold in. |
| **Card: workspace** (ContextCard/MemoryCard/AgentCard/SkillCard/ConnectorCard) | EXISTS (base) → BUILD-NEW (typed variants) | base `ui/card.tsx`; new per-object cards under `components/os/cards/` | `ui/card.tsx` is the generic shadcn card (Header/Title/Content/Footer). Build typed object cards on top (each renders StatusBadge + actions). `.direction-d-card` / `.waggle-card-lift` utilities (`waggle-theme.css`) give the hover/lift treatment. |
| **ArtifactRow / MCPRow / AutomationRunRow** (table rows) | EXISTS (base) | `ui/table.tsx` | Blueprint density rule (line 491): cards for Home/Workspace, **tables** for Memory/Artifacts/Agents/Automations. Use `ui/table.tsx`; build row cell formatters only. |
| **Status badges** | EXISTS (base) → BUILD-NEW (StatusBadge variant) | base `ui/badge.tsx`; new `components/os/StatusBadge.tsx` | `ui/badge.tsx` has only default/secondary/destructive/outline — **no semantic status variants** and no icon/dot. Build `StatusBadge` mapping the state enums (PRD §14: running/paused/failed/healthy/...) to the color semantics in (b), with a **non-color dot + text label** (a11y §19.3). |
| **Confidence badges** | **BUILD-NEW** | new `components/os/ConfidenceBadge.tsx` | No confidence component exists. `MemoryApp.tsx` has no confidence rendering today (grep: only `provenance`). Renders 0-100 (PRD §15.4) as tiered band (high/med/low) with numeric + label; band color from semantics in (b). |
| **Source / evidence chips** (EvidenceChip + EvidencePanel) | **BUILD-NEW** (chip has ad-hoc precedent) | new `components/os/EvidenceChip.tsx` + `components/os/EvidencePanel.tsx` | Closest precedent: the inline provenance pill in `MemoryApp.tsx` (lines ~202-208, `readFrameProvenanceTool`) — promote to a reusable `EvidenceChip`. `EvidencePanel` (Blueprint line 488) is the grouped detail (source + sourceUrl/path + snippet) inside DetailDrawer. |
| **Timeline** | **BUILD-NEW** (logic exists) | new `components/os/Timeline.tsx`; reuse `lib/timeline-events.ts` | `TimelineApp.tsx` + `lib/timeline-events.ts` (`iconForEvent`/`colorForEvent`/`describeEvent`) hold the rendering logic, but it is app-specific, not a reusable DS component. Extract the grouped-by-day list into `Timeline`. |
| **Activity feed** | **BUILD-NEW** | new `components/os/ActivityFeed.tsx` | No reusable feed today. Distinct from Timeline: feed = reverse-chron event stream for Workspace right-panel "last activity" (PRD §12.2) + Home overnight summary (§12.1). Can share the row renderer with Timeline. |
| **Detail drawer** (DetailDrawer) | EXISTS (two bases) → BUILD-NEW (typed wrapper) | bases `ui/sheet.tsx` (right-side, Radix Dialog) and `ui/drawer.tsx` (vaul, bottom); new `components/os/DetailDrawer.tsx` | **Recommend `ui/sheet.tsx` side="right"** as the base — matches Blueprint "optional right context rail" (line 483) and is the standard detail surface for Memory/Artifact/Agent. `ui/drawer.tsx` (vaul) is bottom-sheet, keep for mobile/secondary. Build one `DetailDrawer` wrapper that takes header + EvidencePanel + actions. |
| **Builder stepper** (BuilderStepper) | **BUILD-NEW** | new `components/ui/stepper.tsx` (or `components/os/BuilderStepper.tsx`) | **No Stepper primitive exists.** `OnboardingWizard.tsx` hand-rolls step state (`useState(state.step)` + `goToStep`) with no shared progress UI. PRD §19.2: "Create flows use stepper patterns" — needed by Skill/Agent/Automation builders (PRD §12.6/§12.9/§12.10) + Onboarding. Build once, retrofit onboarding. |
| **Approval prompt** (ApprovalModal) | EXISTS (base + app) → BUILD-NEW (typed modal) | base `ui/alert-dialog.tsx`; existing app `os/apps/ApprovalsApp.tsx` + `overlays/SpawnAgentDialog.tsx`; new `components/os/ApprovalModal.tsx` | `ui/alert-dialog.tsx` (Radix) is the confirm base; `ApprovalsApp.tsx` already implements an approvals inbox surface. Build a shared `ApprovalModal` (declares: actor, requested action, scope, risk badge, approve/deny/modify) for the permission-gated flows (PRD §12.3 command exec, §12.9 agent elevation, §17.3 elevated actions). |
| **Empty state** | **BUILD-NEW** | new `components/os/EmptyState.tsx` | No reusable empty-state component (grep found none). Required on every major screen (PRD §14.1, §22.2). Build icon + headline + body + primary CTA. |
| **Error state** | **BUILD-NEW** (base exists) | base `ui/alert.tsx`; new `components/os/ErrorState.tsx` | `ui/alert.tsx` (default/destructive) covers inline alerts; build a full-surface `ErrorState` (illustration + retry) for screen-level errors (PRD §14.1). |
| **Skeleton loader** | EXISTS | `ui/skeleton.tsx` | Present. Compose per-surface skeletons (card grid / table rows). |
| **Table/list/grid view toggle** | **BUILD-NEW** (base exists) | base `ui/toggle-group.tsx`; new `components/os/ViewToggle.tsx` | `ui/toggle-group.tsx` (Radix, single/multiple) is the base. No `ViewToggle` exists. Build a 3-state (table/list/grid) toggle for Memory/Artifact/Agent surfaces (PRD §19.1 last item, Blueprint density rule). |

### Supporting primitives confirmed present (reuse, do not rebuild)
`ui/tabs.tsx` (workspace tabs PRD §12.2), `ui/dialog.tsx`, `ui/popover.tsx`, `ui/tooltip.tsx` + `ui/hint-tooltip.tsx`, `ui/progress.tsx`, `ui/avatar.tsx` (team avatar stack), `ui/select.tsx`/`ui/checkbox.tsx`/`ui/radio-group.tsx`/`ui/switch.tsx`/`ui/slider.tsx` (builder form fields), `ui/form.tsx` (+ react-hook-form), `ui/chart.tsx` (dashboards/Home metrics), `ui/resizable.tsx` (workspace panels), `ui/scroll-area.tsx`, `ui/separator.tsx`, `ui/breadcrumb.tsx`, `ui/sonner.tsx`/`ui/toast.tsx`/`ui/toaster.tsx` (notifications), `ui/dropdown-menu.tsx`/`ui/context-menu.tsx`, `ui/collapsible.tsx`/`ui/accordion.tsx`.

### Summary counts
- **EXISTS (reuse as-is):** Primary nav (sidebar), Skeleton, Tabs, plus the full supporting-primitive set above.
- **EXISTS-as-base → BUILD typed wrapper:** Command Center, object Cards, Status badge, Detail drawer, Approval modal, Error state, View toggle (7).
- **BUILD-NEW (no reusable base):** ConfidenceBadge, EvidenceChip, EvidencePanel, BuilderStepper, ActivityFeed, Timeline (DS extraction), EmptyState, AppShell, ViewToggle base-toggle exists but component new (≈8 net-new components).

---

## (b) Color Semantics → Hive DS Token Mapping

PRD/Blueprint semantic palette (Blueprint lines 485-486): **blue = command/work, purple =
intelligence, green = healthy/complete, orange = attention/automation, red = risk/failure.**

The Hive DS already ships these as CSS vars in `index.css` and exposes them as Tailwind
utilities via `tailwind.config.ts` (`status.*`, `honey.*`, `hive.*`). **No new base tokens
are required** — only a semantic-alias layer so components reference intent, not raw color.

| UX semantic | Meaning | Existing Hive token (dark, `index.css`) | Tailwind utility | Light-theme value (`index.css` `[data-theme="light"]`) |
|---|---|---|---|---|
| **Blue = command / work** | running, info, in-progress, command surfaces | `--status-info: #60a5fa` | `text-status-info` / `bg-status-info` | `#1d4ed8` (AA on cream, ratio 6.30) |
| **Purple = intelligence** | agents, AI/skills, memory-AI | `--status-ai: #a78bfa` (= DS accent `--accent: 270 60% 68%`) | `text-status-ai` / `bg-status-ai`; `accent` for AI brand | `#6d28d9` (ratio 6.68) |
| **Green = healthy / complete** | success, connected, completed, high confidence | `--status-healthy: #34d399` | `text-status-healthy` / `bg-status-healthy` | `#047857` (ratio 5.16) |
| **Orange = attention / automation** | warning, attention-required, automation, **medium confidence** | `--status-warning: #fbbf24` (NOT honey-brand) | `text-status-warning` / `bg-status-warning` | `#b45309` (ratio 4.72) |
| **Red = risk / failure** | error, failed, high-risk, revoked, **low confidence** | `--status-error: #f87171` (= shadcn `--destructive: 0 72% 63%`) | `text-status-error` / `bg-status-error` / `destructive` | `#b91c1c` (ratio 6.09) |

**Critical disambiguation — orange ≠ brand honey.** The Hive **brand/primary is honey gold**
(`--primary: 40 100% 45%` → `--honey-500: #e5a000`), used for primary CTAs, focus rings,
selection, and brand accents (`--ring`, `.glow-primary`, `--shadow-honey`). The UX "orange =
attention/automation" semantic must map to **`--status-warning` (#fbbf24)**, a distinct amber,
NOT to honey/primary. Keep "attention" and "brand action" visually separable:
- Brand / primary action → `bg-primary` / `honey-*`.
- Attention / automation status → `bg-status-warning` / `text-status-warning`.

**Confidence band mapping (ConfidenceBadge, PRD §15.4 `confidence: 0-100`):**
- high (≥ ~70) → green `status-healthy`
- medium (~40-69) → orange `status-warning`
- low (< ~40) → red `status-error`
(Thresholds are DS defaults; finalize against the memory scoring scale in `packages/hive-mind-core/src/mind/scoring`.)

**Implementation note — add a semantic alias layer.** Today components would have to reach
for `status-info`/`status-ai` directly. Add intent aliases in `waggle-theme.css` (`:root`
already holds `--success/--warning/--error` at lines 44-46) so the new layer reads:
```
--sem-work:        var(--status-info);   /* blue   */
--sem-intelligence:var(--status-ai);     /* purple */
--sem-healthy:     var(--status-healthy); /* green  */
--sem-attention:   var(--status-warning);/* orange */
--sem-risk:        var(--status-error);  /* red    */
```
`StatusBadge`/`ConfidenceBadge`/cards reference `--sem-*` so the mapping lives in one place
and inherits both dark and light themes automatically.

---

## (c) Dark-default + Light-variant Note

- **Dark is the default** (Blueprint line 484: "Dark default for desktop agent feel").
  `index.css :root` IS the dark theme (background `222 20% 4%`); no `data-theme` attr needed.
- **Light variant exists and is complete** — `:root[data-theme="light"]` (index.css lines
  140-221) overrides background, hive scale (inverted), honey (contrast-adjusted), **and all
  `--status-*` + `--kg-*` tokens darkened for WCAG AA on the cream surface** (ratios documented
  in source: healthy 5.16, warning 4.72, error 6.09, info 6.30, ai 6.68). Light mode is
  explicitly intended for "data-heavy Memory/Artifact tables" (Blueprint line 484).
- **Consequence for new components:** because the semantic mapping in (b) references
  `--status-*` (which the light block already overrides), every new component
  (StatusBadge, ConfidenceBadge, EvidenceChip, etc.) inherits AA-correct light colors **for
  free** as long as it uses tokens — never hardcode hex. This matches the CLAUDE.md §10
  closed item "CR-2 hive-950 → semantic tokens" (do not reintroduce raw `hive-950` refs).
- **Theme switch mechanism:** toggling `data-theme="light"` on `:root` (the desktop wallpaper
  overlay + honeycomb-bg already branch on it, index.css lines 269/277). New surfaces must not
  assume a fixed background.

---

## (d) Accessibility Requirements (PRD §19.3 + Blueprint line 489-490)

PRD §19.3 (lines 1254-1261) + Blueprint "Keyboard-first... no color-only status, text labels
for all badges." Per-component obligations for the new/extended DS components:

1. **Full keyboard support.** Ctrl+K (`CommandCenter`) opens from anywhere via global key
   handler; builders, drawers, modals are fully tab-navigable. cmdk (`ui/command.tsx`) and
   Radix bases (`alert-dialog`, `sheet`, `dialog`, `toggle-group`) provide focus trap +
   arrow-key nav out of the box — preserve, don't override.
2. **Visible focus states.** Use the DS focus ring (`--shadow-focus` / `--ring` = honey).
   shadcn primitives already render `focus:ring-2 focus:ring-ring`; new wrappers must keep it.
3. **ARIA labels for command palette + builders.** `CommandCenter` needs `role`/`aria-label`
   on the dialog + labelled groups; `BuilderStepper` needs `aria-current="step"` on the active
   step and accessible step names (extend from `OnboardingWizard.tsx` `STEP_NAMES`).
4. **Sufficient contrast for dark theme.** Dark `--status-*` are bright on `#08-11` surfaces;
   light variants are pre-darkened to ≥4.5:1 (documented in index.css). Do not place
   `status-warning`/`status-info` as small text on light surfaces without the light token.
5. **Non-color status indicators (CRITICAL).** `StatusBadge` and `ConfidenceBadge` MUST pair
   color with a **text label AND/OR a shape/icon** (dot, icon glyph). PRD §19.3 + Blueprint
   "no color-only status" + "text labels for all badges." This is the single biggest gap vs
   the current `ui/badge.tsx` (color-only). Confidence must show the number/label, not just a
   colored band.
6. **Screen-reader-friendly tables/lists.** Memory/Artifact/Agent/Automation tables
   (`ui/table.tsx`) need proper `<th scope>`, caption, and row `aria-label`; `ViewToggle`
   needs labelled options ("table view"/"grid view"). `Timeline`/`ActivityFeed` use an ordered
   list semantic with per-item timestamps in accessible text.
7. **Approval flows announce intent.** `ApprovalModal` must expose the requested action, scope,
   and risk level as text (not icon-only) so denial/approval is an informed, SR-readable
   decision (ties to PRD §17.3 elevated-action approval).

---

## Net build list (for the impl plan)

**New DS components to author** (under `components/ui/` for generic, `components/os/` for product-typed):
1. `StatusBadge` (extend `badge.tsx` with semantic variants + non-color indicator)
2. `ConfidenceBadge`
3. `EvidenceChip` (promote from `MemoryApp.tsx` provenance pill)
4. `EvidencePanel`
5. `BuilderStepper` / `stepper.tsx`
6. `DetailDrawer` (wrap `sheet.tsx` right-side)
7. `ApprovalModal` (wrap `alert-dialog.tsx`)
8. `ActivityFeed`
9. `Timeline` (extract from `TimelineApp.tsx` + `lib/timeline-events.ts`)
10. `EmptyState`
11. `ErrorState` (wrap `alert.tsx`)
12. `ViewToggle` (wrap `toggle-group.tsx`)
13. `AppShell` + `WorkspaceSwitcher` + `CommandCenter` (compose existing sidebar/command primitives)
14. Object cards: `WorkspaceCard`/`MemoryCard`/`ArtifactRow`/`AgentCard`/`SkillCard`/`ConnectorCard`/`MCPRow`/`AutomationRunRow`

**Token work:** add `--sem-*` alias layer in `waggle-theme.css` (no new base palette tokens).
All bases for the above already exist in `ui/*`; nothing requires a new dependency.
