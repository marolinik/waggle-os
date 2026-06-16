# PR3 Recon — SCREEN 01 · Home / Cockpit (ship Variation A "Editorial")

Maps the **current** Home/Cockpit implementation against the warm-Hive design spec for
SCREEN 01. Scope: what renders today, the live data contract, the test contract that
must keep passing, the Editorial target with exact copy, the gap list, and the
reuse/build plan.

Primary files:
- Current UI: `apps/web/src/components/os/apps/HomeCockpit.tsx` (the real Home; **this is the one PR3 rebuilds**)
- Route wrapper: `apps/web/src/routes/HomeRoute.tsx`
- `CockpitApp.tsx` (`apps/web/src/components/os/apps/CockpitApp.tsx`) is a **separate** system-health dashboard (Mission-Control-style), **NOT** the Home surface — see note in §1.
- Server contract: `packages/server/src/local/routes/home.ts`
- FE types: `apps/web/src/lib/types.ts:266-331`
- Test contract: `apps/web/src/test/p2-home-desktop.test.tsx`
- Design: `docs/design_handoff_waggle_app/SCREENS.md` §"01 · Home / Cockpit" + `design-files/screens/home.html` (view `#view-a`)

---

## 1. Current structure — what `HomeCockpit.tsx` renders today (section by section)

`HomeCockpit` is the default `/home` surface (`HomeRoute.tsx:13`). It is a single
scrolling column, `p-6 max-w-3xl mx-auto` on the sub-states and `max-w-4xl mx-auto` on
the normal render (`HomeCockpit.tsx:580`). Data loads in `load()`
(`HomeCockpit.tsx:467-497`): `adapter.getHomeBriefing()` then a best-effort
`adapter.getHomeOvernight()`; deferred until `useService().connecting` settles
(cold-load 401 race guard, `:499-507`).

**Render states (root, `:509-650`):**
1. **Loading** — `CockpitSkeleton` (`:84-98`), `data-testid="home-cockpit-loading"`.
2. **Permission denied (403)** — `:514-527`, `data-testid="home-cockpit-permission-denied"`.
3. **Load error / offline** — `:531-554`, `data-testid="home-cockpit-error"` + Retry.
4. **First-run empty** — `FirstRunEmpty` (`:101-125`), `data-testid="home-cockpit-empty"`, "Create your first workspace" CTA.
5. **Normal** — `:579-649`, `data-testid="home-cockpit"`.

**Normal render, top to bottom:**
- **`GreetingHeader`** (`:136-159`, rendered `:581`): H1 = `briefing.greeting` (`text-2xl font-display font-bold`), sub = `formatBriefingDate(briefing.date)` rendered as a human date (`:130-134`). Right side: optional offline "Local only" pill + a static `Ctrl+K` chip (`:153-156`). **No mono date row, no live dot, no streak chip.**
- **Attention banner** (`:583-599`, `data-testid="home-cockpit-attention-banner"`): only when `overnight.failures.length > 0`. Honey-tinted `role="alert"`.
- **J08 review banner** (`:601-625`, `data-testid="home-cockpit-review-banner"`): only when `briefing.needsReviewCount > 0`; "N imported memories need your review" + Review CTA that dispatches `waggle:open-app {appId:'memory', filter:'unreviewed'}` (`:573-577`).
- **`RecentWorkspacesPanel`** (`:162-227`, rendered `:627-632`): section head **"You were working on"** (`:174-176`), 2-col grid (`sm:grid-cols-2`). Each card: name + `group` chip, optional 2-line `summary`, `lastActive` relative time + `pendingCount` "pending" warning, a **"Continue →"** button (`:208-215`), and a `WorkspaceActionsMenu` kebab (G1 rename/archive/delete). Card body click → `onOpenDesktop`. Returns null when 0 cards.
- **`OvernightPanel`** (`:230-288`, rendered `:637`, suppressed when offline): section head **"Overnight"**, a 3-counter grid (Memories consolidated / Artifacts created / Automations completed), then a failures block (deep-links each failure to the Automation Center logs, `:271-280`). Hidden when no activity.
- **`SuggestedActionsPanel`** (`:321-343`, rendered `:639`): section head **"Suggested next actions"**, wrap of pill buttons from `briefing.suggestedActions`, each → `onContinue(a.workspaceId, a.sessionId)`.
- **`UpNextPanel`** (`:291-318`, rendered `:643`): section head **"Up next"**, list of up to 6 items (event/task/schedule icons). Returns null when 0 items.
- **`QuickCapturePanel`** (`:346-434`, rendered `:645`): "Quick capture" — a 4-kind segmented selector (note/task/link/file) + text input + Capture button → `adapter.quickCapture()`. **Not in the Editorial design.**
- **`ActiveModelsTile`** (`:437-448`, rendered `:647`): tiny "Active models: …" chips row when `briefing.activeModels` present.

**Styling today:** uses shadcn semantic classes (`bg-secondary/30`, `border-border/30`,
`text-muted-foreground`) and inline `var(--sem-intelligence)` / `--sem-attention` /
`--sem-work` / `--sem-healthy` / `--sem-risk` semantic tokens. Layout is **dense and
utilitarian** (10-13px text, `rounded-xl`, compact panels) — the opposite of the
Editorial spec's calm, large-type, story-led 920px column.

> **Note on `CockpitApp.tsx`:** despite the name, this is the system-health/ops
> dashboard (System Health, Cost, Memory Weaver, Cron, Connectors, Audit Trail,
> ComplianceDashboard) on a 30s refresh. It is **not** the Home surface and **not in
> scope for SCREEN 01** — it corresponds to "Mission Control" (SCREENS §16) /
> "surfaces" (§08). Listed in the task only to disambiguate; PR3 Home work happens
> entirely in `HomeCockpit.tsx`.

---

## 2. Data contract — `HomeBriefing` shape + feeding routes (real vs mocked)

### Types (FE mirror `apps/web/src/lib/types.ts:266-331`; server `home.ts:43-95`)

```ts
interface HomeBriefing {
  greeting: string;            // server builds via buildTimeAwareGreeting + personalizeGreeting (home.ts:401-407)
  userName?: string;           // from IdentityLayer on personal mind (home.ts:261-270); optional
  date: string;                // now.toISOString() (home.ts:412) — RAW ISO, FE must humanize
  recentWorkspaces: RecentWorkspaceCard[];
  suggestedActions: SuggestedAction[];
  upNext: UpNextItem[];
  activeModels?: string[];     // OPTIONAL — server briefing NEVER populates it (no producer in home.ts)
  isFirstRun: boolean;         // ranked.length === 0 (home.ts:418)
  needsReviewCount?: number;   // J08 unreviewed personal-mind frames (home.ts:382-389)
}

interface RecentWorkspaceCard {
  id; name; group;             // group = workspace.group string
  summary?;                    // state.recentDecisions[0].content (home.ts:314-316)
  lastActive: string;          // ISO; ranking timestamp
  pendingCount: number;        // state.pending.length + state.blocked.length
  continueSessionId?;          // NOTE: server never sets it (home.ts card builder omits) → Continue has no session seed
}

interface SuggestedAction { label; workspaceId; sessionId?; kind; }  // kind always 'next-action' from server
interface UpNextItem { id; label; workspaceId?; at?; kind: 'event'|'task'|'schedule'; }
                       // server only ever emits kind:'schedule' from cron; 'event'/'task' are type-only
                       // server NEVER sets `at` → UpNextPanel's time column is always empty today

interface OvernightSummary {       // GET /api/home/overnight (separate call)
  consolidated; artifactsCreated; automationsCompleted;
  failures: OvernightFailure[];    // {id,label,automationId?,error,at} from cron execution history
  window?: { from; to };
}
```

### Routes feeding Home
| Route | Method | Adapter | Source / realness |
|---|---|---|---|
| `/api/home/briefing` | GET | `adapter.getHomeBriefing()` (`adapter.ts:612-615`) | **Real.** Server-side cross-workspace fan-out (`home.ts:257-423`); personal-only (A2), excludes team/archived. Reuses `buildWorkspaceState`, `buildTimeAwareGreeting`, `buildUpcomingSchedules`, `IdentityLayer`, cron store, audit DB. |
| `/api/home/overnight` | GET | `adapter.getHomeOvernight(since?)` (`adapter.ts:617-621`) | **Real.** Audit-event counts (`memory_write` → consolidated; file-write `tool_call` → artifacts) + cron execution history → automations/failures (`home.ts:425-503`). |
| `/api/quick-capture` | POST | `adapter.quickCapture()` (`adapter.ts:623-627`) | **Real.** Used by `QuickCapturePanel` (not in Editorial layout). |

### Real vs mocked / missing, per design need
- **REAL:** greeting, userName, date (ISO), recentWorkspaces (name/group/summary/lastActive/pendingCount), suggestedActions, upNext (schedule labels only), overnight counters + failures, needsReviewCount.
- **NOT produced by the server (treat as absent):**
  - `continueSessionId` — never set → "Continue" can't target a session (already a known gap, `HomeRoute.tsx:16-19`).
  - `UpNextItem.at` (time) and `event`/`task` kinds — never set; only `schedule` from cron.
  - `activeModels` — typed-optional, **no producer**; tile never shows from the real route.
- **NO DATA ANYWHERE (must mock for the Editorial design):**
  - **🔥 streak chip** — `grep` across `packages/server/src` and `apps/web/src` finds **no** `streak` field. Habit-loop spec (SCREENS §15) says the streak lives on Home but it is unimplemented. **Needs-mock** (or a follow-up backend field).
  - **Overnight "story" sentence** + **run chips with labels** ("Teardown drafted · 9 competitors") — server gives raw counts, not a composed narrative or per-run labels. The narrative must be **composed client-side** from `OvernightSummary` (counts + failures), and the first "Teardown drafted" run chip has **no backing field** (would need the top suggestedAction/workspace summary as a proxy) → **partial mock**.
  - **Workspace card hex avatar glyph / "agent live" badge** — no `glyph`/`live` field; derive glyph from `name[0]`, and there is no per-card live-agent flag → **derive / mock badge**.

---

## 3. Test contract — `apps/web/src/test/p2-home-desktop.test.tsx`

These assertions constrain the rebuild (the `describe('HomeCockpit (P2)')` block,
`:73-129`). All must keep passing. The harness renders `HomeCockpit` bare with mocked
`adapter`, `useService` (`{connecting:false, connected:true}`), offline=false, and a
stub `ShellContext` (`:38-46`).

Required behaviors / DOM contract:
1. **Root testid** — after load, `screen.getByTestId('home-cockpit')` must exist (`:81`). **Keep `data-testid="home-cockpit"` on the normal-render root.**
2. **J08 review banner** (`:84-98`) — with `needsReviewCount:3`, `data-testid="home-cockpit-review-banner"` renders text containing **"3 imported memories need your review"**, and `data-testid="home-cockpit-review-cta"` click dispatches exactly `waggle:open-app` with detail `{ appId:'memory', filter:'unreviewed' }`. **Keep the banner, its copy pattern, the CTA testid, and the event payload.**
3. **Banner omitted at 0/undefined** (`:100-103`) — no `home-cockpit-review-banner` when `needsReviewCount` is undefined.
4. **Up next omitted when empty** (`:105-111`) — no `home-cockpit-upnext` when `upNext` is `[]` or undefined.
5. **Up next present with items** (`:113-118`) — `home-cockpit-upnext` contains the item label ("Weekly digest") when ≥1 item.
6. **Human date** (`:120-128`) — the raw ISO (`2026-06-11T07:42:13.512Z`) must **not** appear; the date must render via `new Date(iso).toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'})`. **Keep `formatBriefingDate` semantics; the mono date row must humanize, not print ISO.**

The mocked briefing factory (`:57-67`) defines the minimum shape the component must
tolerate: `{greeting, userName:'Marko', date, recentWorkspaces:[], suggestedActions:[],
upNext:[], isFirstRun:false, needsReviewCount:0}`. The Editorial rebuild must still
render `home-cockpit` with all-empty arrays (no crash on empty overnight/workspaces).

**Implication:** PR3 may freely restyle and re-lay-out, but must preserve these
testids + behaviors: `home-cockpit`, `home-cockpit-review-banner`,
`home-cockpit-review-cta` (+ event payload), `home-cockpit-upnext` (present/absent
rules), and human-date rendering. The `up next` empty/present rule means the Editorial
"Up next" (if kept) stays conditional. Other testids (`home-cockpit-overnight`,
`home-cockpit-suggested`, `home-cockpit-continue-*`, quickcapture testids) are **not**
asserted in this file — they can be renamed/removed if their features are reshaped.

---

## 4. Design spec (Editorial / Variation A) — target sections + exact copy

From `SCREENS.md` §01 (ship = Variation A) and `home.html` `#view-a` (`:157-186`).
**Layout:** single centered column, **max-width 920px, 46px top padding**
(`home.html:31`). Sections top to bottom:

### 4.1 Greeting (`home.html:158-161`)
- **Mono date row** (`--honey`, uppercase, `.1em` tracking) with a **live dot**
  (`.dot-live`, `--healthy`) on the left, and a **right-aligned 🔥 streak chip**
  (pill, `--honey-wash` bg, `--honey-line` border, `--honey` text).
- **H1** Hanken 600, `clamp(34px,5vw,52px)`, line-height 1.02; the keyword **"ahead"**
  is honey (`em`, not italic; `--honey`).
- **Exact copy:** date `"Friday · June 14 · 8:42"` (compose from `briefing.date`);
  streak `"🔥 12-day streak"`; H1 = **"Good morning, Mara."** / **"You're _ahead_ of yesterday."**
  - Maps to: greeting → `briefing.greeting` (real, already personalized server-side; the design's literal "Good morning, Mara." is `buildTimeAwareGreeting`'s output). "You're ahead of yesterday" second line + the honey "ahead" → **needs-mock / composed** (no "ahead vs yesterday" signal exists). Date → **real** (`briefing.date`, reformatted with time). Streak → **needs-mock**.

### 4.2 Overnight hero card (`home.html:163-172`)
- Radius `--r-xl`, gradient `--surface → --surface-2`, `--shadow`, soft honey radial
  glow top-right (`::after`). Mono eyebrow with `--intel` dot.
- **Eyebrow (exact):** "While you slept".
- **Story line (exact):** Hanken 600, clamp 21→28px, max-width 30ch; honey key numbers (`b`):
  **"Waggle finished the _Q2 competitor teardown_, folded _14 new memories_ into the hive, and ran into _one snag_ worth a look."**
- **Run chips (exact, status dot + label):**
  - `"Teardown drafted · 9 competitors"` (dot `--healthy`)
  - `"14 memories consolidated"` (dot `--intel`)
  - `"2 artifacts created"` (dot `--work`)
  - `"1 export failed"` (dot `--risk`)
  - Maps to: counters are **real** (`overnight.consolidated`, `.artifactsCreated`, `failures.length`). The **composed sentence** + the **"Teardown drafted · 9 competitors"** label are **needs-mock/composed** (no narrative producer; no per-run "9 competitors" field). Build the sentence from counts + failures client-side; degrade gracefully when overnight is null/empty (must still render `home-cockpit`).

### 4.3 "Pick up where you left off" (`home.html:174-175, 287-299`)
- Section head = mono uppercase `--text-dim` with trailing hairline rule (`.sec-h`).
- 2-col grid (`.ws-grid`) of `.ws-card`: **hex avatar** (honey gradient, glyph =
  first letter), **title** (16px, 650), **time** (mono `--text-dim`, e.g. "2h ago"),
  **summary** (13.5px `--text-muted`), footer = **"Continue →"** (honey) + optional
  **status badge** (`pend` honey-wash "3 to review" / `live` healthy-wash "agent live").
  Hover: honey border + `translateY(-3px)` + `--shadow`.
  - Maps to: **real** — `recentWorkspaces[].name`, `.summary`, `formatRelative(lastActive)`, `.pendingCount` (→ "N to review"/"N pending"). Hex glyph = derive from `name[0]`. "agent live" badge → **no field, mock/omit**. **Section head copy must change** "You were working on" → **"Pick up where you left off"**.

### 4.4 "Waggle suggests" (`home.html:177-178, 301-306`)
- Section head "Waggle suggests". Stacked **`.move` rows**: tinted icon tile
  (`--*-wash` bg), **title** (14.5px 600) + **sub** (12.5px `--text-muted`), arrow
  that slides on hover.
- **Exact sample copy (design data):** "Review the competitor teardown" / "9
  competitors · ready since 02:40 · ~6 min read"; "Send the board update" / "Draft
  built from this week's work in Q2 Board Deck"; "Confirm 3 imported memories" / "From
  Tuesday's pricing call — Waggle wants your sign-off".
  - Maps to: title → **real** `suggestedActions[].label`. The **sub-line** has no
    backing field (server emits label only, `kind:'next-action'`) → **needs-mock/derive**
    (e.g. workspace name + relative time). Section head copy "Suggested next actions" →
    **"Waggle suggests"**. Rows become **stacked** (not pills).

### 4.5 Ask bar (`home.html:180-185`)
- Full-width pill (`.ask`), honey **"+"** icon left, text input
  (placeholder **"Start something new — "draft the board update from this week's
  work"…""**), mono **"⌘K"** hint, honey round **send** button ("→"). Focus → honey
  border + glow.
  - Maps to: **net-new on Home.** No current "ask bar" on HomeCockpit. Wire send →
    `onContinue`/new-chat or open ⌘K (PR2 `CommandCenter`). This **replaces** the
    current QuickCapturePanel as the primary input affordance. The "+" can keep a
    quick-capture role, but the design's primary intent is "start a task".

### 4.6 Not in Editorial (drop or relocate)
- **Quick capture segmented panel** — replaced by the ask bar; the
  `adapter.quickCapture` API can be kept behind the "+" icon or dropped from Home.
- **Active models tile** — not in Editorial (and route never populates it). Drop.
- **Attention/review banners** — not literally in the Editorial mock, but the **J08
  review banner is test-locked** (keep it; can be styled as a run-chip-adjacent
  attention row or kept above the hero). The overnight-failure attention banner maps
  naturally onto the "1 export failed" run chip + (optionally) Variation C's risk
  alert pattern.

---

## 5. Gap list

| Design section | Current state | Gap | Data available? | Severity |
|---|---|---|---|---|
| 920px centered column, 46px top pad | `max-w-4xl mx-auto p-6` dense | Re-layout to 920px / `pt-[46px]`, larger type scale | n/a (layout) | MED |
| Mono date row + live dot | Plain `text-sm` sub under H1, no dot | Add mono uppercase honey date row + `.dot-live` | date = real; format with weekday+time | MED |
| 🔥 streak chip (right pill) | Absent | Add streak chip | **No data** — needs-mock or new backend field | HIGH |
| H1 with honey "ahead" keyword | H1 = raw greeting, no honey span | Two-line H1; honey-span a keyword | greeting real; "ahead of yesterday" composed | MED |
| Overnight **hero** card (gradient + glow) | `OvernightPanel` = 3 plain counters + failures, suppressed offline, hidden when empty | Rebuild as hero card w/ eyebrow + story + run chips; must still render when empty/null | counts real; **story + run-chip labels composed/mock** | HIGH |
| Run chips (4, status-dotted) | Counter tiles only | Render chips w/ status dots; map counts | 3 of 4 real (consolidated/artifacts/failed); "Teardown drafted · 9 competitors" mock | MED |
| "Pick up where you left off" head | "You were working on" | Copy + `.sec-h` hairline style | n/a (copy) | LOW |
| Workspace cards: hex avatar + 16px title + Continue→ + badge | Cards w/ name+group chip, Continue button, kebab | Add hex avatar (glyph from name), restyle; keep Continue + kebab | name/summary/time/pending real; glyph derived; "agent live" mock/omit | MED |
| "Waggle suggests" stacked rows w/ sub-line | "Suggested next actions" pills, label-only | Copy + restyle to `.move` rows; add sub-line | label real; **sub-line composed/mock** | MED |
| Ask bar (pill, +/⌘K/send) | None on Home (QuickCapture panel instead) | Net-new ask bar; wire to chat/⌘K | n/a (action wiring) | MED |
| `continueSessionId` for targeted resume | Plumbed but server omits | Continue lands at chat root, not a session | **Not produced** by `home.ts` | LOW |
| Quick capture panel | Present | Remove/relocate behind "+" | n/a | LOW |
| Active models tile | Present, never populated | Remove from Home | route never sets `activeModels` | LOW |
| J08 review banner (test-locked) | Present + correct | Preserve testids/copy/event while restyling | needsReviewCount real | (keep) |
| Overnight-failure attention banner | Present | Reconcile with "1 export failed" run chip | failures real | LOW |

**Gap count (distinct design-vs-impl gaps): 11** (excludes the two "keep as-is"
test-locked rows and the layout-only re-layout row counted once).

---

## 6. Reuse + build

### 6.1 Reuse (already shipped in PR1 — do NOT recreate)
All warm-Hive tokens the design references already exist in
`apps/web/src/index.css` and `apps/web/src/waggle-theme.css`:
- **Surfaces/lines/text:** `--bg --bg-2 --surface --surface-2 --line --line-soft --line-strong --text-2 --text-muted --text-dim` (`index.css:149-153`).
- **Honey + washes:** `--honey --honey-bright --honey-deep --honey-wash --honey-line --honey-glow` (`index.css:99,155-159`).
- **Semantics + washes:** `--work --intel --healthy --attention --risk` + each `*-wash` (`index.css:161-169`).
- **Radii:** `--r:12 --r-lg:18 --r-xl:26` (`index.css:177-179`).
- **Shadows:** `--shadow --shadow-sm --shadow-lg --shadow-pop` (`index.css:171-174`).
- **Fonts:** Tailwind `font-display` / `font-sans` → Hanken Grotesk, `font-mono` → JetBrains Mono (`tailwind.config.ts:87-90`). Hanken/JetBrains `@import` already in `index.css`.
- **Utilities:** `.hex` clip-path (`waggle-theme.css:140`), `.comb` honeycomb bg (`:143-146`), `.dot-live` + `@keyframes breathe` (`index.css:428-435`), `.kbd`/mono helper (`waggle-theme.css:161`).
- **Existing component primitives:** `WorkspaceActionsMenu` (kebab CRUD — keep on cards), `formatRelative` / `formatBriefingDate` (`HomeCockpit.tsx:69-81,130-134`), the adapter trio (`getHomeBriefing`/`getHomeOvernight`/`quickCapture`), `useOfflineStatus`, `useService().connecting` race guard, shadcn `ui/` (button/input/card available if wanted), lucide icons, `waggle:open-app` deep-link shim. ⌘K lives in `CommandCenter.tsx` (PR2) — wire the ask-bar "⌘K" hint / send to it.

### 6.2 Net-new (build for Editorial)
- **Mono date row** with live dot + **🔥 streak chip** (streak value mocked/constant until a backend field exists — flag in code).
- **Honey-keyword H1** (two-line; second line composed; honey-span helper).
- **Overnight hero card** — a new presentational component: eyebrow "While you slept" + composed story sentence (from `OvernightSummary` counts + failures) + 4 run chips. Must render gracefully when overnight is null/empty (no crash; the test renders with `getHomeOvernight → null`).
- **Run-chip** component (status dot + label).
- **Hex-avatar workspace card** restyle (`.ws-card` look: hex glyph, hover lift, "Continue →", badge).
- **`.move` suggestion row** restyle (icon tile + title + sub + sliding arrow); compose sub-line from workspace/time.
- **Ask bar** (pill input + honey "+" + "⌘K" hint + honey send) — replaces QuickCapture as the primary input; wire send to chat/⌘K.

### 6.3 Recommended build approach
1. **Keep `HomeCockpit.tsx` as the component** (route + props + load() + all five render
   states + the test-locked testids/banners stay). Restyle/replace only the **normal
   render body** (`:579-649`) and the sub-state shells to the warm Editorial look.
2. **Container:** swap `max-w-4xl mx-auto p-6` → a centered **`max-w-[920px] mx-auto px-8 pt-[46px] pb-20`** wrapper; optionally drop a `.comb` honeycomb layer behind it.
3. **Extract small presentational subcomponents** within the file (or co-located
   `home/` dir, per CLAUDE.md "many small files"): `GreetingHeader` (rework),
   `OvernightHero` (new, replaces `OvernightPanel`), `RunChip`, `WorkspaceCard`
   (hex restyle of the existing card), `SuggestRow` (restyle of `SuggestedActionsPanel`),
   `AskBar` (new). Keep `UpNextPanel` conditional (test 4/5) or fold it into the dash —
   simplest is to **retain it** below suggestions to satisfy the present/absent tests.
4. **Compose, don't fetch:** the overnight **story sentence** and **run-chip labels**
   are derived client-side from the existing `OvernightSummary` + top `suggestedAction`
   /workspace summary. Mark the **streak** and **"ahead of yesterday"** as explicit
   `// TODO(backend): no data source yet` constants so the mock is honest.
5. **Preserve behavior:** J08 banner (copy + `home-cockpit-review-cta` event payload),
   human-date, `home-cockpit` root testid, `home-cockpit-upnext` present/absent rule.
6. **Dark-first** (per BUILD-PLAN §6); verify light via the existing ratchet
   (`light-mode-tokens.test.ts`). Gates: `tsc -p apps/web/tsconfig.app.json` 0,
   `npm run test` (FE) green incl. `p2-home-desktop.test.tsx`, lint clean.

> Honesty flags for the rebuild: (a) **streak** has no data anywhere — it is a pure
> mock until a backend field lands; (b) the overnight **narrative + "9 competitors"**
> run-chip and the suggestion **sub-lines** are composed/mocked, not server-provided;
> (c) `continueSessionId` is still omitted server-side so "Continue" lands at chat root.
