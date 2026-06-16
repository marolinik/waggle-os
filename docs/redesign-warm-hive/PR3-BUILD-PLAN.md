# PR3 — Build Plan · Warm-Hive Redesign · Screens 01 / 02 / 03

> Rebuilds three screens to the warm-Hive design **inside** the existing `apps/web`
> stack (React 19 + TS + Vite + Tailwind 3 + shadcn/ui + React Router 6). Recreate the
> concept — do **not** paste the HTML. One branch, one PR, commit-per-screen.
>
> Synthesised from the four recon files
> (`docs/redesign-warm-hive/pr3-recon/{home,chat,workspace,primitives}.md`),
> `BUILD-PLAN.md` §6, and `docs/design_handoff_waggle_app/{SCREENS.md §01/02/03, DESIGN_POV.md}`.
> Citations are `file:line` against the branch `feature/warm-hive-redesign`.

---

## 0. Scope + ground rules

### In scope (3 screens, ship-variation locked)
- **Screen 01 — Home / Cockpit → Variation A "Editorial"** (`HomeCockpit.tsx`).
- **Screen 02 — Chat / agent runtime → Variation B "Split work canvas"** (`ChatApp.tsx`
  inside the kept-alive `ChatHost` portal subtree).
- **Screen 03 — Workspace → Variation A "Overview + tabs", Memory stays a tab**
  (`WorkspaceDesktopApp.tsx` + `WorkspaceRoute.tsx`).

### Out of scope (do NOT build here)
- **PR3.5 — Memory-Trust layer (screen 19, DESIGN_POV #1).** Confidence/freshness on
  every memory, Forget/Correct, stale-review, "why did you do that?" trace. Separate
  later PR. **PR3 hooks to leave** (cheap, non-fabricating):
  - Use the existing `ConfidenceBadge` + `EvidenceChip`/`EvidencePanel`/`DetailDrawer`
    primitives (primitives.md §2) for fact rows and activity-stream provenance, so PR3.5
    can attach forget/correct affordances to the **same** components rather than re-laying
    them out.
  - Make every "What Waggle knows" fact row (Workspace) and every memory step (Chat)
    **clickable into a `DetailDrawer`** placeholder (or no-op with a `data-memory-id`
    attribute) so PR3.5 wires the trace/correct flow without a re-layout.
  - Keep the J08 review banner + `home-cockpit-review-cta` event payload intact (it is the
    Home entry-point into the unreviewed-memory queue PR3.5 expands).
  - **Do not** invent confidence/freshness numbers in PR3 — render provenance/confidence UI
    only where real data exists (see §5); leave the affordance, not fake data.
- **PR4+ surfaces** (Marketplace, Settings, Onboarding, Launcher, Power surfaces, etc.) —
  untouched. PR3 only restyles the three named screens; the 5-item spine + ⌘K (PR2) and
  tokens/ThemeProvider/fonts (PR1) are **already shipped** — reuse, do not re-author.

### Two deferred PR1 LOW items to clear in PR3 (BUILD-PLAN §9)
1. **Chat spine no-workspace dead-click.** `routeFor('chat')` falls back to `/home` when
   there is no real active workspace, so the Chat spine item isn't highlighted (Home
   wins) and the click feels dead. **Fix in PR3:** when `!hasRealActiveWorkspace`, route
   the Chat spine item to the workspace switcher / Home selector and/or dim it. Touch
   `Sidebar.tsx` consumer wiring (the spine-item builder), not the screen bodies.
2. **Sidebar user-row `userName={null}`** renders "Account" + "W". A real name exists in
   `HomeBriefing.userName` (home.ts:261-270). **Fix in PR3:** thread `briefing.userName`
   through to the Sidebar user row once Home loads the briefing (or via the existing
   identity surface). This is the "user-identity surface lands (PR3)" note.

### Execution model + process
- **In-place refactor of `apps/web`.** No Lovable, no new app. Restyle/replace the render
  bodies of the three existing components; keep route wrappers, data hooks, load() states,
  and all test-locked testids/behaviours.
- **One branch (`feature/warm-hive-redesign`), one PR, commit-per-screen.** Suggested
  commits: `Phase 0 primitives`, `Phase A Home`, `Phase B Chat`, `Phase C Workspace`,
  `LOW fixes (chat no-ws + userName)`, then verification fixups.
- **Dark-first** (BUILD-PLAN §6); light mode inherits via tokens — every new color must
  resolve from a `var(--token)` so the WCAG ratchet (`light-mode-tokens.test.ts`) stays
  green. Honor `prefers-reduced-motion` on every animated atom.
- **Reuse > rebuild; degrade gracefully on missing data; surgical changes** (CLAUDE.md §3).

---

## 1. Phase 0 — Shared primitives first (build BEFORE the screens)

All warm tokens + utility classes the design references **already exist** (primitives.md
§1: `--bg --surface* --line* --text* --honey* --work --intel --healthy --attention --risk`
+ washes, `--r/-lg/-xl`, shadows, `.hex`, `.comb`, `.dot-live`, Hanken/JetBrains).
**Do not re-add tokens.** Build only the **net-new composite atoms** (primitives.md §3)
that no component provides today, in a **new folder `apps/web/src/components/os/warm/`**.
Keep each < 80 LOC, token-driven, a11y-labeled, `prefers-reduced-motion`-safe.

**Build order** (shared atoms first, then screen-specific composites):

| # | Primitive | File | Minimal prop API | Consumed by |
|---|---|---|---|---|
| 0.1 | `HexAvatar` | `os/warm/HexAvatar.tsx` | `label: string; size?: number; gradient?: boolean; className?` — `.hex` clip + honey gradient + `#1a1407` initial; extract from `Sidebar.tsx:116` | **Home** (ws cards), **Chat** (context header + bot avatar), **Workspace** (46px header) |
| 0.2 | `SectionLabel` | `os/warm/SectionLabel.tsx` | `children; className?` — 11px mono, uppercase, `.12–.14em` tracking, `--text-dim`, trailing hairline rule (ref `Sidebar.tsx:102`) | all 3 screens |
| 0.3 | `DotLive` | `os/warm/DotLive.tsx` | `tone?: 'healthy'\|'attention'\|'risk'\|'work'\|'intel'\|'honey'; className?` — colored dot + `.dot-live` breathe; `prefers-reduced-motion` | **Home** greeting, **Chat** model pill, **Workspace** "agent live" |
| 0.4 | `ProvenanceLine` | `os/warm/ProvenanceLine.tsx` | `source: string; when?: string; onClick?` — `⬡ source · when`, mono `--intel`; thin wrapper over `EvidenceChip` styled to `--intel` | **Workspace** fact + recent-work rows; **Chat** activity steps |
| 0.5 | `RunChip` | `os/warm/RunChip.tsx` | `label: string; tone?: StatusTone` — status dot + label inline chip | **Home** overnight hero |
| 0.6 | `IconTile` | `os/warm/IconTile.tsx` | `icon: ElementType; tone?: StatusTone; size?: number` — tinted (`*-wash`) rounded icon tile | **Home** "Waggle suggests"; **Workspace** recent-work ext tiles |
| 0.7 | `HexCheckTile` | `os/warm/HexCheckTile.tsx` | `tone?; size?` — small `.hex` tile w/ check glyph | **Workspace** "What Waggle knows" fact rows |
| 0.8 | `StreakChip` | `os/warm/StreakChip.tsx` | `days: number; weekDots?: boolean[]; className?` — 🔥 + "N-day streak", `--honey-wash`/`--honey-line` | **Home** greeting (mock data — §5) |
| 0.9 | `ModelPill` | `os/warm/ModelPill.tsx` | `mode?: string; model: string; onClick?; title?` — "auto · Claude Sonnet" pill + healthy `DotLive` | **Chat** context header |
| 0.10 | `OvernightHero` | `os/warm/OvernightHero.tsx` (Home composite) | `eyebrow; statement: ReactNode; runs: RunChipProps[]` — `--r-xl` gradient card + honey radial glow; renders gracefully with `runs=[]` | **Home** (composes `RunChip`) |
| 0.11 | `AskBar` | `os/warm/AskBar.tsx` | `placeholder?; onSubmit: (text) => void; cmdkHint?: boolean; onPlus?` — full-width pill, honey `+`, ⌘K hint, honey send | **Home** (Chat composer reuses the send affordance only) |
| 0.12 | `ActivityStream` | `os/warm/ActivityStream.tsx` (Chat composite) | `summary: string; durationMs?; steps: {tone; text: ReactNode; provenance?: {source; when?}}[]; defaultOpen?: boolean` — collapsible `--bg-2` card, violet spark, per-step `DotLive` + `ProvenanceLine` | **Chat** activity card |
| 0.13 | `InlineApprovalCard` | `os/warm/InlineApprovalCard.tsx` | reuse `ApprovalRequest`; `onApprove; onDecline; alwaysAllow?` — `--honey-wash` bg, attention border, warning icon (inline, NOT a modal); shares risk vocab w/ `risk-display.tsx`/`ApprovalModal` `RISK_LABELS` | **Chat** approval card |

**Reuse as-is (do NOT rebuild — primitives.md §2):** `ConfidenceBadge`, `EvidenceChip`,
`EvidencePanel`, `StatusBadge`, `ApprovalModal` (vocab source), `DetailDrawer`, all shadcn
`ui/` primitives (tabs/card/button/badge/input/textarea/tooltip/popover/scroll-area),
`Sidebar` active-state recipe, `command-catalog.ts` (⌘K vocabulary).

**Phase 0 footprint: ~13 new files (all in `os/warm/`), 0 modified.**
Verify after Phase 0: `tsc -p apps/web/tsconfig.app.json` → 0; new atoms render in isolation
(optional smoke test file). No screen wiring yet.

---

## 2. Phase A — Home (Editorial)

**Primary file:** `apps/web/src/components/os/apps/HomeCockpit.tsx`. **Keep the component,
its route (`HomeRoute.tsx:13`), props, `load()` (`:467-497`), the `connecting` race guard
(`:499-507`), and all five render states.** Restyle/replace **only the normal-render body**
(`HomeCockpit.tsx:580`, `data-testid="home-cockpit"`) and the sub-state shells.

### A.1 Section build order (top → bottom, home.md §4)
1. **Container** — swap `max-w-4xl mx-auto p-6` (`:580`) → centered
   `max-w-[920px] mx-auto px-8 pt-[46px] pb-20`. Optional `.comb` honeycomb layer behind.
2. **Greeting** (rework `GreetingHeader` `:136-159`): mono date row (`--honey`, uppercase,
   `.1em` tracking) with leading `DotLive tone="healthy"` + right-aligned `StreakChip`;
   two-line H1 (Hanken 600, `clamp(34px,5vw,52px)`) with the keyword honey-spanned. **Keep
   the human-date rendering** (`formatBriefingDate` semantics, test 6).
3. **J08 review banner** (`:601-625`) — **KEEP intact** (testid `home-cockpit-review-banner`,
   cta `home-cockpit-review-cta`, event `{appId:'memory',filter:'unreviewed'}`); may restyle
   to a warm attention row. Test-locked (test 2/3).
4. **`OvernightHero`** (new, replaces `OvernightPanel` `:230-288`): eyebrow "While you slept"
   + composed story sentence + ≤4 `RunChip`s. **Must render when overnight is null/empty**
   (the test stubs `getHomeOvernight → null`) — degrade to a quiet "Nothing ran overnight"
   line, never crash.
5. **"Pick up where you left off"** (restyle `RecentWorkspacesPanel` `:162-227`): change head
   copy "You were working on" → **"Pick up where you left off"** via `SectionLabel`; 2-col
   grid of warm `.ws-card` with `HexAvatar` (glyph from `name[0]`), title/time/summary,
   **"Continue →"**, optional status badge. **Keep `WorkspaceActionsMenu` kebab** (real
   G1 CRUD). Returns null at 0 cards.
6. **"Waggle suggests"** (restyle `SuggestedActionsPanel` `:321-343`): head → **"Waggle
   suggests"**; pills → stacked `.move` rows (`IconTile` + title + composed sub-line +
   sliding arrow). Click → `onContinue(workspaceId, sessionId)`.
7. **"Up next"** (`UpNextPanel` `:291-318`): **KEEP conditional** — testid
   `home-cockpit-upnext` present-when-items / absent-when-empty is test-locked (test 4/5).
   Restyle only.
8. **`AskBar`** (new, replaces `QuickCapturePanel` `:346-434`): pill + honey "+" + ⌘K hint +
   honey send. Wire send → `onContinue`/new-chat; `+` keeps quick-capture (`adapter.quickCapture`)
   or opens ⌘K (`CommandCenter`).
9. **Drop:** `ActiveModelsTile` (`:437-448`, never populated) and the segmented QuickCapture panel.

### A.2 Data wiring (home.md §2 — real vs graceful-mock)
- **REAL (wire directly):** `briefing.greeting`, `briefing.userName` (also feeds the LOW
  user-row fix §0), `briefing.date` (humanize + add time), `recentWorkspaces[]`
  (name/group/summary/`formatRelative(lastActive)`/pendingCount), `suggestedActions[].label`,
  `upNext[]`, `overnight.{consolidated,artifactsCreated,automationsCompleted,failures}`,
  `needsReviewCount`.
- **COMPOSED client-side (honest, from real fields):** overnight **story sentence** from
  counts + failures; run-chip labels for `"N memories consolidated"`/`"N artifacts created"`/
  `"N export failed"`; suggestion **sub-lines** from workspace name + relative time. Hex
  glyph from `name[0]`.
- **MOCK — no data source anywhere (flag with `// TODO(backend): no data source yet`):**
  - 🔥 **streak** value (no `streak` field exists; habit-loop SCREENS §15 unimplemented).
  - "You're **ahead** of yesterday" second H1 line (no ahead-vs-yesterday signal).
  - "Teardown drafted · 9 competitors" first run chip + the "9 competitors" count (no
    per-run label field).
  - Workspace-card "agent live" badge (no per-card live flag) → derive or omit, don't fake.

### A.3 Exact copy (SCREENS §01 / home.html)
- Date row e.g. `"Friday · June 14 · 8:42"` (compose from `briefing.date`); streak `"🔥 12-day streak"`.
- H1 line 1 = `briefing.greeting` ("Good morning, Mara."); line 2 = "You're **ahead** of yesterday." (mock).
- Eyebrow "While you slept"; story "Waggle finished the **Q2 competitor teardown**, folded
  **14 new memories** into the hive, and ran into **one snag** worth a look." (numbers from real counts).
- Run chips: "Teardown drafted · 9 competitors" (healthy), "14 memories consolidated" (intel),
  "2 artifacts created" (work), "1 export failed" (risk).
- Section heads "Pick up where you left off" / "Waggle suggests".
- Ask-bar placeholder "Start something new — \"draft the board update from this week's work\"…".

### A.4 Test contract to keep green — `apps/web/src/test/p2-home-desktop.test.tsx`
1. `home-cockpit` root testid present after load.
2. `home-cockpit-review-banner` text "3 imported memories need your review" + `home-cockpit-review-cta`
   click dispatches `waggle:open-app {appId:'memory',filter:'unreviewed'}`.
3. Banner omitted when `needsReviewCount` undefined.
4. `home-cockpit-upnext` absent when `upNext` empty/undefined.
5. `home-cockpit-upnext` contains item label when ≥1 item.
6. Raw ISO must NOT appear; date humanized via `toLocaleDateString`.
- Must render `home-cockpit` with **all-empty arrays** + `getHomeOvernight → null` (no crash).
- Other testids (`home-cockpit-overnight/-suggested/-continue-*`, quickcapture) are **not**
  asserted → free to rename/remove.

### A.5 Files touched (Phase A)
- **Modify:** `HomeCockpit.tsx` (normal-render body + sub-states). Optionally co-locate
  presentational subcomponents in a `home/` dir (CLAUDE.md "many small files") — at minimum
  `OvernightHero`, `AskBar`, `StreakChip` come from `os/warm/`.
- **Touch (LOW fix #2):** Sidebar user-row wiring to pass `briefing.userName`.
- **Verify:** `tsc -p apps/web/tsconfig.app.json` 0; `npm run test --root apps/web` →
  `p2-home-desktop.test.tsx` green; light ratchet green; live smoke (cold load + empty arrays
  + null overnight render `home-cockpit`).

**Phase A footprint: ~1–4 files modified (HomeCockpit + optional `home/` subcomponents + Sidebar wiring), 0–3 created.**

---

## 3. Phase B — Chat (split work-canvas)

**Primary file:** `apps/web/src/components/os/apps/ChatApp.tsx`. The thread, tool cards,
artifact card, approval gate, model picker, persona pill, composer, and SSE/block reduction
(`useChat.ts`) **all already exist and are design-compatible** — most of Phase B is RESTYLE
+ token migration. Two things are net-new: the **right work canvas** and the **collapsible
ActivityStream**.

### B.1 Where the canvas lives (chat.md §1 — critical)
Append `<ChatWorkCanvas>` as a **sibling of ChatApp's chat column** inside ChatApp's existing
flex root — root `<div className="flex h-full relative">` (`ChatApp.tsx:697`), chat column
`<div className="flex flex-col flex-1 min-w-0">` (`:744`). This keeps the canvas **inside the
kept-alive portal subtree** (`ChatHost.tsx`), so its state survives navigation for free.
**Do NOT** add the canvas as a `WorkspaceDesktopApp` pane — that breaks the `chatSlot`/`activeTab`
contract pinned by `p1a-chat-state.test.tsx` and lives outside keep-alive.

### B.2 Build order
1. **Token migration** — Hive-DS classes (`bg-primary`, `text-emerald-400`, `bg-secondary`,
   `border-border`) → warm tokens (`--surface`, `--honey`, `--intel`, `--bg-2`, `--line-soft`).
2. **Context header** (restyle `chat-header` `:746`): `HexAvatar` "C" + workspace name + mono
   sub "workspace · N memories · N sources" + right-side `ModelPill` (the current model picker
   `:931` restyled with a healthy `DotLive` + "auto ·" prefix) + Memory icon button (the
   current Memory chip `:815`). Autonomy/storage/team chips not in the design header → fold
   into the overflow menu via the existing `chat-header-layout.ts` decision.
3. **Thread restyle** (`:1050-1191`):
   - User bubble (`:1108`): `bg-primary rounded-xl` → `--surface` bubble, asymmetric radius
     `4px 14px 14px 14px`, 15.5px/1.55.
   - Bot message: `HexAvatar` "W" + meta line "Waggle · {persona} · {model}"; honey `◆` bullets.
4. **`ActivityStream`** (new, chat.md §5 #3): a grouping wrapper in `chat-blocks/` —
   `BlockRenderer` collapses a consecutive run of `step` (and optionally tool) blocks into one
   collapsible card: violet spark + "Worked across memory, web & files · N steps · Ns" header
   + chevron. Derive step count + duration from the grouped blocks. **Default-open on the
   active turn** (track `isStreaming`/active turn), collapsed on prior turns. Per-step
   `DotLive` + `ProvenanceLine` **only when source data exists** — do NOT fabricate
   `⬡ mem://hive` (SSE `step` carries no source field today; flag to backend in §5).
5. **`InlineApprovalCard`** (restyle `ApprovalGate` `:223`): `--honey-wash` bg + attention
   border + warning icon; copy "Approve before I leave your machine" + mono external target +
   "Approve & export"/"Not now". **Keep `RiskBadge` + the Always-allow gating logic.**
6. **`ChatWorkCanvas`** (new `<aside>`): `--bg-2`, `--line-soft` left border, `width:42%`,
   `transition .25s`. Head: title (artifact basename) + healthy mono "● live draft" + "Open in
   Artifacts" icon button. Body = `.doc` rendered via the **existing markdown path** (reuse
   `TextBlock`'s renderer) from the **latest completed `write_file`/`edit_file` block's
   `input.content`/`result`** (reuse `ArtifactBlock.isArtifactBlock` `:21` + path logic).
   Blinking honey type-cursor (`.hex-cursor`) is **cosmetic, shown while `isStreaming`**. Thread
   `max-width` drops 760→~620px when open. `@media (max-width:820px)` → hide canvas (chat full width).
   Open/close state lives in ChatApp (inside keep-alive).
7. **Composer restyle** (`:1194`): `:focus-within` → `--honey-line` + `--honey-glow`; placeholder
   "Reply, or ask Waggle to take the next step…"; chips row Attach / "Persona: {name}" / Tools;
   mono hint "⏎ send · ⌘K commands"; honey ↑ send (40px). Keep the slash menu + send wiring.

### B.3 Data wiring (chat.md §2)
- **REAL (no hook change):** the entire `useChat` stream/`blocks[]` reduction; tool cards;
  artifact card + Open-in-Files; feedback; slash menu; pins; persona; autonomy; keep-alive.
- **DERIVED:** canvas doc body from the latest file-write block; ActivityStream summary
  (count/duration) from grouped blocks; ModelPill "auto" when model is default/unset.
- **MISSING (don't fabricate):** structured per-step `source`/provenance (no SSE field) →
  render the provenance pill only when present; canvas "live document body" stream (today only
  `input.path` + opaque `result`) → PR3 shows the **last completed artifact's content**, "live
  drafting" cursor is cosmetic.

### B.4 Test contract to keep green
- **`chat-artifact-block.test.tsx`** — keep `data-testid="chat-artifact-block"` +
  `chat-artifact-open`, Created/Updated copy, and the `isArtifactBlock` routing predicate. **The
  canvas is ADDITIVE — the inline artifact card stays.**
- **`p1a-chat-state.test.tsx`** — do NOT change `WorkspaceDesktopApp`'s `chatSlot` / `activeTab` /
  `onTabChange` contract (test ids `ws-tab-chat`, `ws-tab-tasks`, `ws-tasks-tab`, `chat-slot-stub`,
  `ws-chat-tab-open`-absent-when-slot). The canvas lives inside the slot subtree, not as a new
  desktop prop. Persona/autonomy persistence (`waggle-chat-state-v1`) unchanged.
- **`chat-blocks/TextBlock.test.tsx`**, **`context-rail-fetch.test.ts`** (the `onContextRail`
  double-click path `ChatApp.tsx:1095`) — keep behavior; grep before editing.

### B.5 Files touched (Phase B)
- **Modify:** `ChatApp.tsx` (header/thread/composer restyle + canvas sibling + open state);
  `chat-blocks/BlockRenderer.tsx` (group steps into `ActivityStream`); `chat-blocks/StepBlock.tsx`
  (feed into ActivityStream); `ChatWindowInstance.tsx` (only if canvas needs a model/"auto" prop —
  minimal).
- **Create:** `os/warm/ChatWorkCanvas.tsx` (or `chat-blocks/`), `os/warm/ActivityStream.tsx`,
  `os/warm/InlineApprovalCard.tsx`, `os/warm/ModelPill.tsx` (from Phase 0), a small canvas-content
  selector helper.
- **Verify:** `tsc -p apps/web/tsconfig.app.json` 0; FE vitest green incl. `chat-artifact-block.test.tsx`
  + `p1a-chat-state.test.tsx` + `chat-blocks/TextBlock.test.tsx`; live smoke (send a message →
  activity card default-open → file-write opens canvas → approval card renders → navigate away and
  back, canvas state survives).

**Phase B footprint: ~4 files modified, ~4–5 files created.**

---

## 4. Phase C — Workspace (Overview + tabs)

**Primary files:** `apps/web/src/components/os/apps/WorkspaceDesktopApp.tsx` (1020 LOC) +
`apps/web/src/routes/WorkspaceRoute.tsx`. Rebuild the **shell header + tab bar + Overview**;
the other 5 tabs embed/deep-link the **real existing screens** (workspace.md §6).

### C.1 Build order
1. **Tab set 8 → 6** (workspace.md G1): drop Research/Tasks/Timeline/Settings from the bar;
   final set **Overview · Chat · Memory · Artifacts · Files · Team**. Update `WorkspaceTabId`
   union + `TABS` (`WorkspaceDesktopApp.tsx:58-77`) and `WS_TABS` (`WorkspaceRoute.tsx:20-22`).
   - **Do NOT delete `<TasksTab>` the component** — relocate Tasks into the Overview "Up next"
     card; keep it reachable. Unknown `:tab?` already falls back to Overview
     (`WorkspaceRoute.tsx:43-45`), so stale `/workspaces/:id/tasks` links degrade gracefully.
   - **Files/Team** are NEW tabs → embed the existing Files surface (`getWorkspaceFiles`,
     already loaded) and Team (global roster today — documented TODO).
2. **Header** (restyle `:759-811`): breadcrumb `Home › {name}` (mono, `--text-dim`); 46px
   `HexAvatar`; H1 (Hanken 650, 28px); meta row `DotLive`+"1 agent live · N memories · N sources
   · updated Xago"; right actions = **Memory** (ghost) + **Continue →** (honey). **Keep
   `WorkspaceActionsMenu` kebab** (real CRUD, not in mock).
3. **Tab bar** (restyle `:814-839`): honey 2px bottom-border on active (honey already comes via
   `--primary`); add per-tab mono count `.cnt` span. Keep `ws-tab-bar`, `ws-tab-<id>` testids.
4. **Overview re-layout** (workspace.md G7): replace the 3-col widget grid (`OverviewTab`
   `:518-545`) with a **2-col grid `1.7fr / 1fr`, gap 22px**:
   - **Left col:** summary card (honey-bold keywords, from `ctx.summary`); **"What Waggle
     knows"** (`SectionLabel` + `HexCheckTile` fact rows + `ProvenanceLine`); **"Recent work"**
     (`IconTile` ext rows + name + sub + mono time + hover honey border).
   - **Right col (folds the old `w-72` aside in — G13):** **Status card** (agent/model/memories+delta/
     needs-review); **Up next** (derived from pending/blocked/nextActions/schedules); **Team card**
     (avatar rows + roles, global roster).
5. **Memory tab** stays `<MemoryCenterTab mind="workspace">` (`:937-941`) — **already correct, keep**.

### C.2 Data wiring (workspace.md §2)
- **REAL:** `ctx.summary`, `ctx.recentMemories`/`recentDecisions` (content + date), `ctx.stats`
  (memoryCount/sessionCount/fileCount → tab counts), `getWorkspaceFiles` (recent-work names + times),
  `useRoomState` live ("1 agent live"), `ctx.workspace.model`, `getWorkspaceActivity`,
  `getTeamMembers` (global), `state.{pending,blocked,nextActions}` + cron schedules (Up next).
  `relativeTime` (`:135-147`) + `initialsOf` (`:128-133`) helpers exist.
- **DERIVED:** "updated Xago" from `ctx.lastActive`; ext-tile from filename; tab counts from stats.
- **MOCK / data-gap (render only where real; flag, don't fabricate):**
  - **Per-fact / per-artifact provenance `⬡ source · when`** — frames HAVE a `source` column
    server-side (`workspaces.ts:291` writes, SELECTs around `:413`) but it is **not projected
    into `recentMemories`/`recentDecisions`** today. PR3 renders `ProvenanceLine` **with `when`
    (real date) and source only if projected**; otherwise show date-only and leave a
    `// TODO(backend): project frame.source` note. (This is the keystone PR3.5 hook — §0.)
  - "9 sources" (no `sourceCount`), "+6 today" delta, per-workspace "N to review", a distinct
    **artifacts** entity vs files, agent NAME on the live row → mock/omit, flagged.

### C.3 Exact copy (SCREENS §03 / workspace.html) — sample/derive
Summary, fact rows ("Mem0 is cloud-only…", prov `web · mem0.ai · 2h ago`), recent-work
(`teardown.md` "Q2 competitive teardown · 9 competitors · 2h ago"), Status
(`● Research-synth · live` / `auto · Claude Sonnet` / `142 +6 today` / `3 memories`), Up next
(`Board brief from teardown` draft / `Export table → Salesforce` awaiting you / `Weekly digest` 17:00),
Team (`Mara K. · Owner`, `Research-synth · Agent · live`). Use **real** fields where present;
sample strings are mock-until-backed.

### C.4 Test contract to keep green
- **`p1a-workspace-route.test.tsx`** — route↔shell contract: `selectWorkspace(routedId)` on
  deep-link / Back-Forward, skip-when-active, never sync `local-default`, `path="workspaces/:workspaceId/:tab?"`.
  The `:tab?` param + the `selectWorkspace` effect + the `local-default` guard must survive the rewrite.
- **`lib/workspace-briefing-state.test.ts`** — briefing-collapsed localStorage helpers (key prefix
  `waggle:workspace-briefing-collapsed:`); only relevant if briefing-collapse is carried into the new
  Overview; helpers reusable as-is.
- **Implicit testid contract (Playwright/smoke):** keep `ws-desktop-root`, `ws-tab-bar`, `ws-tab-<id>`,
  `ws-tab-panel`, `ws-overview-grid`, `ws-info-panel`, `ws-status-pill`, `ws-members-stack`,
  `ws-agents-running`, `ws-desktop-{loading,permission-denied,notfound,offline,retry}`, `ws-memory-tab`.
  Dropping Research/Tasks/Timeline/Settings removes `ws-tab-{research,tasks,timeline,settings}` — none
  appear in the two unit tests, but **grep untracked Playwright smokes before deleting**.
- **No test pins the 8-tab set, widget-grid, or right-panel** → the re-layout + tab reduction are free.

### C.5 Files touched (Phase C)
- **Modify:** `WorkspaceDesktopApp.tsx` (header + tab bar + Overview 2-col + tab set, fold aside in),
  `WorkspaceRoute.tsx` (`WS_TABS` 6-tab set + union). Optionally `os/apps/workspace/` subcomponents.
- **Create:** `os/warm/HexCheckTile.tsx` + `ProvenanceLine.tsx` (Phase 0); `FactRow`, `ArtRow`,
  `StatusCard`, `UpNextCard`, `TeamCard` (co-located `workspace/` or inline if small).
- **Verify:** `tsc -p apps/web/tsconfig.app.json` 0; FE vitest green incl. `p1a-workspace-route.test.tsx`
  + `workspace-briefing-state.test.ts`; live smoke (deep-link a tab, Back/Forward, Overview renders with
  real ctx, tabs route to real screens, empty-workspace state still renders).

**Phase C footprint: ~2 files modified, ~5–7 files created.**

---

## 5. Risks + open questions (need founder/data decision OR graceful degradation)

| Topic | Decision / risk | PR3 default (degrade gracefully) |
|---|---|---|
| **Overnight story = mocked vs real** | Server gives raw counts, no narrative or per-run labels (home.md §2). The hero sentence + "9 competitors" chip are composed/mock. | Compose the sentence from real counts/failures; flag the "9 competitors" chip `// TODO(backend)`. When overnight is null/empty → quiet "Nothing ran overnight" line, still render `home-cockpit`. |
| **Streak source** | No `streak` field anywhere (home.md §2; SCREENS §15 unimplemented). | Render `StreakChip` with a **constant mock value + explicit TODO**, or hide behind a flag until a backend field lands. Do not fake daily logic. |
| **"ahead of yesterday"** | No ahead-vs-yesterday signal. | Render as static copy with TODO, or drop the second H1 line if founder prefers no mock. |
| **Chat canvas content stream** | No live-document stream — only file-write `input.content`/opaque `result` (chat.md §2/§5 #2). | Canvas shows the **last completed artifact's content**; "live draft" cursor is cosmetic during `isStreaming`. Flag the need for a doc-body stream channel to backend. |
| **Provenance `⬡ source` (Chat steps + Workspace facts)** | Frame `source` exists server-side but is **not projected** into `recentMemories`/`recentDecisions`/steps (workspace.md §2; chat.md §2). This is the core trust pattern (README §6) **and** the PR3.5 keystone. | Render `ProvenanceLine` with **real `when` (date)** always; show source **only when projected** — otherwise date-only + `// TODO(backend): project frame.source`. **A tiny server change to project `source` would unlock this for both screens — recommend founder greenlight a 1-field projection in PR3 or PR3.5.** |
| **Workspace data gaps** | "9 sources", "+6 today", per-workspace "N to review", distinct artifacts entity, agent NAME on live row — all absent. | Omit or mock-with-TODO; never block render. |
| **Team roster is global, not per-workspace** | `getTeamMembers()` returns global roster (documented TODO `WorkspaceDesktopApp.tsx:660-662`). | Render global roster as today; note the scope gap. |
| **`continueSessionId` omitted server-side** | "Continue" lands at chat root, not a session (home.md §2). | Continue → chat root; acceptable, pre-existing. |
| **LOW fix — Chat no-workspace** | Needs `hasRealActiveWorkspace` signal in the spine builder. | Route Chat → switcher/Home when no real workspace; dim the item. Confirm the selector source. |

---

## 6. Verification gate (run per phase + final)

**Type + tests (cite exact targets):**
- `npx tsc -p apps/web/tsconfig.app.json` → **0 errors** (this is the FE typecheck; the
  `npm run -w apps/web typecheck` script is a silent no-op — solution tsconfig).
- FE vitest from `apps/web` root, **green**, specifically:
  - Home: `apps/web/src/test/p2-home-desktop.test.tsx`
  - Chat: `apps/web/src/test/chat-artifact-block.test.tsx`, `apps/web/src/test/p1a-chat-state.test.tsx`,
    `apps/web/src/components/os/apps/chat-blocks/TextBlock.test.tsx`, `apps/web/src/test/context-rail-fetch.test.ts`
  - Workspace: `apps/web/src/test/p1a-workspace-route.test.tsx`, `apps/web/src/lib/workspace-briefing-state.test.ts`
  - Theme ratchet (all screens): `apps/web/src/test/light-mode-tokens.test.ts`
- `npx eslint .` run from **`apps/web`** cwd → clean.

**Live smoke checklist (per screen, dark + light toggle):**
- **Home:** cold-load renders `home-cockpit`; greeting + streak + hero render; **empty arrays +
  null overnight still render** (no crash); J08 banner CTA fires `waggle:open-app`; ask-bar sends;
  user-row shows `userName`.
- **Chat:** send a message → ActivityStream default-open on active turn, collapses on prior; a
  file-write opens the work canvas; canvas hides < 820px; approval card renders honey-wash with
  working Allow/Deny; **navigate away and back — canvas + chat state survive** (keep-alive); inline
  artifact card + Open-in-Files still work.
- **Workspace:** deep-link a tab + Back/Forward (route↔shell intact); Overview 2-col renders with
  real ctx; fact rows show provenance `when`; tabs route to the real Chat/Memory/Artifacts/Files/Team
  screens; empty-workspace + error states still render.

**Definition of done:** tsc 0, all cited FE tests green, eslint clean, live smoke passes on all
three screens in both themes, the two PR1 LOW items cleared, no fabricated data shipped (mocks
carry `// TODO(backend)`), PR3.5 hooks left (clickable provenance/fact rows, intact J08 banner).
