# Wave P — structural redesigns (2026-07-06 S2, goal: 5 judges ≥9/10)

Three lanes, one file-set each, no overlap. Grounding screenshots (what judges scored, R8):
`C:/Users/MarkoMarkovic/AppData/Local/Temp/claude/D--Projects-waggle-os/cd366627-6451-4ef6-b0d3-93a63ceb7678/scratchpad/shots/judge-round8/`

Shared vocabulary (index.css): shadows `--shadow-card/--shadow-elevated/--shadow/--shadow-sm/--shadow-honey`,
radii `--r-lg:18px / --r-xl:26px`, colors `--honey/--honey-text/--honey-wash/--honey-line`,
`--line-soft/--surface/--surface-2/--text/--text-2/--text-muted/--text-dim`, tones `--intel/--healthy/--risk/--attention` (+`-wash`).
Honesty contract (repo-wide): never render fabricated data; absent field ⇒ don't render.

## Lane 1 — Settings provider selector (`ModelGate.tsx` + `SettingsApp.tsx`) — worst surface 6.8
Judge ask (R7/R8 convergent): "11 identical check pills" → a REAL selector: filled tiles,
anchored density control, sub-nav structure.

1. **Provider tile grid** (ModelGate cloud tab, replaces the pill row; BOTH variants):
   - `grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2`. Tile = left-aligned mini-card,
     `rounded-[12px] border p-3`, two rows:
     row 1 name (13px semibold) + right-aligned state glyph (Check honey = keyed ·
     AlertTriangle amber = keyed-but-probe-failed · none = no key);
     row 2 quiet 11px meta: `N models` + state word ("Key in Vault" / "not responding" / "No key yet").
   - Fill states: keyed → `bg-[var(--honey-wash)] border-[var(--honey-line)]`; failing → risk/amber wash;
     unkeyed → transparent bg, `border-[var(--line-soft)] text-[var(--text-muted)]`.
   - Selected tile: honey ring (`ring-2 ring-[var(--honey-line)]` or border-primary) + `shadow-[var(--shadow-card)]`.
   - **Grouping**: when ≥1 keyed provider exists, two quiet group labels: "Your providers"
     (keyed incl. failing) then "Add a provider" (rest). Zero keyed (onboarding first-run) ⇒ one flat grid, no labels.
   - Keep: aria-pressed, keyboard focus-visible, existing handleSelect/probe logic untouched.
2. **Anchor the density control** (SettingsApp): move the floating top-right "Show Essential/Standard/Everything"
   segmented control to the BOTTOM of the left tab rail (it gates which tabs exist — anchor it to what it controls).
   Compact: caption "Show" (11px muted) above the 3 options stacked or segmented vertically. Keep
   aria-label "Settings detail level" + `useOnboarding().tier` mechanics. Update `src/test/pr5-settings-reskin.test.tsx`
   copy if it references "top-right" (behavioral assertions must keep passing).
3. **Models tab de-duplication** (SettingsApp models tab): the "Provider API Keys" row list now repeats the tile grid
   1:1 — replace that list with one quiet line ("Keys live in the Vault — manage them above or in the Vault app.")
   keeping the Lock note. Keep Search Providers section. Give the tab's three zones consistent section headers
   (match the `SectionLabel` uppercase-rule treatment used on Home).

## Lane 2 — Workspace card v3 (`AllWorkspacesApp.tsx`) — 7.0
Judge ask: aligned meta baseline + activity preview + hover affordance. See `122-workspaces-dark.png`:
meta rows sit at different heights; description-less cards feel empty; no visible open cue.

1. **Aligned baseline**: card → `flex flex-col` + `min-h-[168px]`; meta footer gets `mt-auto pt-3` so
   EVERY card's meta row sits on the same baseline regardless of body content.
2. **Body (activity preview, real data only)**: description (2-line clamp) when present; otherwise compose from
   real fields ONLY: created line + last-activity, e.g. `Created 3w ago · active 2w ago`. Check whether the server
   list rows carry a cached `summary` field (grep `summary` in lib/types + the /api/workspaces payload via
   useWorkspaces/ShellContext); if a real summary exists, render it exactly like description. NO invented copy.
3. **Hover affordance**: on group-hover, a quiet `Open →` cue fades in at the footer right (next to the actions menu),
   `text-[var(--honey-text)] opacity-0 group-hover:opacity-100`; keyboard focus shows it too (`focus-within`).
   Keep existing whole-card click + menu stopPropagation + testids.
4. Keep dup-name disambiguation; move the group/slug chips into the SAME fixed header block so they don't push
   the body around (header zone = fixed two-line height: title + one optional disambig/meta line).
5. Update `AllWorkspacesApp.test.tsx` only if assertions reference changed classes/copy; testids stay.

## Lane 3 — Home card system (`HomeCockpit.tsx` + `warm/OvernightHero.tsx`)
Judge ask (R7 #1 + R8): 3 card treatments in one viewport → ONE system with variants. See `121-home-dark.png`.

Unify to a 3-tier grammar:
- **Tier-1 hero** (StartHereCard + OvernightHero + FirstRunEmpty/empty-state cards): radius `rounded-[var(--r-xl)]`
  (26px — StartHere is currently an off-system 22px), `shadow-[var(--shadow-elevated)]`, p-6/7.
  StartHere keeps its honey identity (border honey-line + honey gradient) — it is THE action;
  Overnight keeps surface gradient + glow. IDENTICAL eyebrow anatomy on both:
  `flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em]` — StartHere: Sparkles + honey;
  Overnight: DotLive intel + text-dim. (Only tone differs, never structure.)
- **Tier-2 card** (RecentWorkspacesPanel): `rounded-[var(--r-lg)]` (18) + `shadow-[var(--shadow-card)]`,
  hover: honey-line border + `shadow-[var(--shadow)]` + lift (already mostly true — normalize).
- **Tier-3 row** (review banner + SuggestedActions rows): `rounded-[14px]`, flat (no shadow), hover border only.
  Review banner stays honey-wash (it's an alert) but same radius/height grammar as suggested rows.
- Sweep any remaining `rounded-[26px]`/`rounded-[22px]` literals on home surfaces to the token tiers above.
- CAUTION: `formatBriefingDate` exact-node test (P2) — don't touch the date render. Home tests live in
  `src/test/` (grep `home-cockpit` there); testids must survive.

## Per-lane gate (each lane runs before reporting)
- `npx vitest run <related test files>` green (find with: `npx vitest run --project` — or just run the specific
  test files touching your surfaces, e.g. src/test/pr5-settings-reskin.test.tsx, AllWorkspacesApp.test.tsx,
  and the home cockpit tests under src/test/).
- Confirm no new eslint errors in touched files (`npx eslint <files>`).
- Orchestrator runs full web tsc + vitest suite after all lanes merge.
