# PDF Deferred — Product Decision Briefs

**Scope:** 7 deferred items from `docs/plans/PDF-E2E-ISSUES-2026-04-17.md` that the
S3 handoff (§"PDF deferred — need your call before engineering") flagged as
blocked on a Marko decision or investigation, not on more engineering.

**How to use this doc:** Read each section, mark your pick in the "Decision"
line at the bottom of each, and the next session ships from that input.
No engineering happens on these until you've picked.

**Effort estimates are post-decision — they exclude the thinking time.**

---

## P4 · Permissions / Mutation Gates confusing — merge with 3-level tool approval?

**Current state.** `SettingsApp.tsx:526` renders a "Mutation Gates" toggle
backed by `mutationGates: boolean` (types.ts:299). Separately, Chat has an
inline approval prompt when the agent attempts a mutating tool call. Two
surfaces for what the user experiences as one concept: "when can the agent
change things without asking?"

**Problem.** A binary on/off on one screen plus an inline prompt on another
doesn't match how users think about trust. Users want "always ask / ask for
risky ones / never ask" as one unified control.

**Options.**
1. **Three-level enum** (ask-every-time / ask-for-risky / never-ask) in Settings.
   Delete the inline prompt. Risk classification driven by tool metadata
   (already partially there — `isReadOnly` was added for personas in S3).
2. **Three-level enum + keep inline prompt as emergency override** — Settings
   sets default; inline override for the current action only. More complex.
3. **Status quo + rename** — keep two surfaces but rename "Mutation Gates" to
   "Approval Mode" so it reads as what it is. Minimal change.

**Recommendation.** Option 1. The current split is the source of the
confusion; adding a rename doesn't fix the architecture. Option 2 over-models
a case that's rare in practice.

**Effort (post-decision).** ~1 d engineering. Settings UI refactor + Chat
prompt removal + `toolRiskLevel` classifier on ~40 tools in `packages/agent`.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P6 · Room — verify 2 parallel agents visualization actually works

**Current state.** Room canvas + per-window personas + cross-workspace tools
shipped in Phase A/B (session 0411). Unit tests pass. Live binary smoke of
"two agents working in parallel on distinct windows in the same Room" has not
been done.

**Problem.** This is a verification task, not a product decision. Gets
listed as "deferred" because it needs live binary testing, not code.

**Options.**
1. **Playwright E2E** — scripted "spawn agent A in window 1, spawn agent B in
   window 2, send different prompts, verify both stream concurrently without
   cross-contamination." ~2 hr script + run.
2. **Live binary session** — build + run Tauri locally, manual click-through,
   record loom. ~1 hr.
3. **Defer until H-35** (launch binary smoke) — fold into the broader
   pre-launch smoke. Saves today's time; risks shipping a broken Room.

**Recommendation.** Option 1. Playwright coverage is durable, scriptable, and
matches the "Lead via Playwright, don't make the user click" feedback memory.
Option 3 is fine if you're comfortable carrying the risk until H-35.

**Effort (post-decision).** ~2 hr for option 1, ~1 hr for option 2, 0 for option 3.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P10 · Bee-style persona icons (dark + light)

**Current state.** `apps/web/src/assets/personas/` has 13 icons as
`.jpeg` — analytics, content-writer, forecaster, hook-analyzer, publisher,
and others. All are photographic portraits, not bee/hive-themed sprites.
17 personas total means 4 are missing even the current style.

**Problem.** Product vision is "bee-themed stylized agents" per CLAUDE.md
§1 ("Hive DS"). Current photographic icons undercut the brand.

**Options.**
1. **Commission a designer** — brief + 17×2 = 34 sprites. External cost
   ~$500-1500 depending on turnaround. 1-2 week lead time.
2. **Generate via nano-banana / Midjourney / DALL·E** — consistent prompt
   template for "stylized bee mascot doing <persona's job>, honey palette,
   transparent bg, 512×512, dark+light variants." ~$20 credits, ~2 hr work.
3. **Ship launch without bee icons** — keep photos for now, file as post-launch.
   Personas still work; visual debt is deferred but measurable.

**Recommendation.** Option 2 (AI-generated). The Hive DS is honey-themed enough
that a consistent AI-generated sprite set will match brand tone at near-zero
cost. Option 1 is better quality but 20-30× cost and calendar; not worth it
pre-revenue. Option 3 is fine if calendar is tighter than brand polish.

**Effort (post-decision).** ~2 hr for option 2 (prompt iteration + batch run +
integration). Option 1 is mostly your time writing the brief. Option 3 is 0.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P14 · Virtual storage path truncated + Local browser only shows drive D (need C: too)

**Current state.** `FilesApp.tsx` renders three storage types (virtual,
local, team) via `StorageType` union. The local-browser path fetches from
the Tauri sidecar which uses a fs-scope in `app/src-tauri/capabilities/`.
On Windows with multiple drives, only the configured scope root is visible.

**Problem.** Tauri's fs plugin requires explicit allowlist per directory.
C: drive isn't in the default scope. Adding it is straightforward but has
a security implication: full read access to system drive.

**Options.**
1. **Allowlist C:/Users/<current>** — user's home on C: only, not the full
   drive. Covers Documents/Desktop/Downloads/OneDrive which is 95% of what
   users want. Low-risk scope widening.
2. **Allowlist any drive the user picks** — add a "Pick drive root" UI,
   persist the chosen paths in config, expand the Tauri scope at runtime.
   More flexible but Tauri capability changes require app rebuild, so runtime
   expansion isn't trivial.
3. **Defer until post-launch** — keep D-only for now, file as polish. Users
   on single-drive machines (most laptops) don't notice.

**Recommendation.** Option 1. Marko's machine has C: + D:. His users will
mostly be single-drive. "Home on C: + D:" covers both cases without building
a drive-picker for a niche need. Option 2 is over-engineering for v1.

**Effort (post-decision).** ~1 hr for option 1 (capability update + resigning).
~1 d for option 2. 0 for option 3.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P15 · Create Template modal overlaps Dashboard — "can't drag"

**Current state.** `CreateWorkspaceDialog.tsx:452` renders a modal that is
already centered via standard flex layout. The "can't drag" phrasing
in the PDF is ambiguous — modals aren't typically draggable by design.

**Problem.** Not clear whether the complaint is:
(a) The modal covers the dashboard and the user wants to reference
dashboard content while filling the form → needs a different layout
(side panel? collapsible?), or
(b) The modal is draggable in another app and should be here too → needs
react-draggable integration, or
(c) The modal is miscentered on some viewport sizes → needs responsive fix.

**Options.**
1. **Convert to right-side panel** (300-400px slide-in from the right) — user
   can see dashboard behind. Matches Linear / Notion / Figma patterns. Breaks
   the "modal = blocking decision" contract slightly but that's fine here.
2. **Add drag handle** — title bar becomes grab-target. Modal stays blocking
   but repositionable. Smaller UX shift; reuses existing modal skeleton.
3. **Leave alone, investigate viewport bug** — if the real complaint is (c),
   it's a 1-line fix. Worth investigating before committing to UX change.

**Recommendation.** Option 3 first (20 min investigation), then option 2
if no viewport bug found. Option 1 is a bigger UX change that'd need more
thinking than a single deferred-item decision justifies.

**Effort (post-decision).** ~20 min for option 3. If escalates to option 2,
+1 hr. Option 1 is ~3 hr.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P16 · Files app only shows Virtual storage — need local create + explorer-style browse

**Current state.** `FilesApp.tsx` already imports `FileTree`, `FilePreview`,
`FileActions`, `WorkspaceRail`. It has `StorageType` supporting virtual /
local / team. The "only virtual" complaint suggests the UX isn't surfacing
local + team clearly enough, not that the code is missing.

**Problem.** Users don't realize local + team storage exist because the
entry point is hidden. Also: can't create new files in local storage (only
upload existing ones).

**Options.**
1. **Explorer-style split pane** — left: tree of (virtual / local / team)
   roots, right: current folder view with thumbnails + list toggle. Add "new
   file" and "new folder" buttons to the right pane. Full Windows Explorer
   / Finder parity.
2. **Three-tab layout** — top tabs: "Virtual | Local | Team". Each tab is
   current FilesApp layout. Cheaper; better signals that local + team exist.
3. **Keep current layout, add storage-type dropdown** in the WorkspaceRail.
   Smallest change. Doesn't fully solve discoverability.

**Recommendation.** Option 2. It's one day of work, fully solves the "didn't
know local exists" problem, and keeps the existing per-tab layout as-is.
Option 1 is multi-day and matches user expectations but we're rebuilding
Explorer; high cost for launch. Option 3 doesn't actually fix the problem.

**Effort (post-decision).** ~1 d for option 2 (tab component + per-tab state +
local-create tools). ~4 d for option 1. ~2 hr for option 3.

**Decision:** `__________` (options: 1 / 2 / 3)

---

## P17 · App-wide tooltip pass — 20+ files of badges need hover tooltips

**Current state.** Only 7 files in `components/os/apps/` import Radix Tooltip
(out of ~30 app components). Most badges / icon buttons rely on `title=""`
which is styled inconsistently and a11y-poor.

**Problem.** Scope is too big to do exhaustively in one session. Needs
prioritization — which 3-5 badges confuse users most?

**Options.**
1. **Top-5 prioritized list** (you pick from the PDF): pick the 5 most
   confusing badges from the PDF complaints, convert only those. Ship the
   rest as post-launch polish. Tight scope.
2. **Systematic pass by app** — one commit per app (Settings, Chat, Files,
   Cockpit, etc.), each converting `title=""` to Radix Tooltip. ~2 d total.
3. **Codemod** — write a small transform that rewrites `title={foo}` to
   `<Tooltip content={foo}>...</Tooltip>` across the tree. Risk: not every
   site is a tooltip (some are form hints). ~4 hr codemod + ~2 hr manual review.

**Recommendation.** Option 1. Ask me: "which 5 badges most confuse users?"
and I ship a focused commit. Option 2 is right if you want it done fully
before launch. Option 3 is tempting but the semantic mismatch risk (title
on a form input ≠ tooltip) is real.

**Effort (post-decision).** ~1 hr for option 1 per badge (including test).
~2 d for option 2. ~6 hr for option 3.

**Your top-5 picks:** `__________` (write item numbers from the PDF, or "all"
for option 2, or "codemod" for option 3)

---

## Summary — what the next session ships after you decide

| Item | Your pick | Effort | Shippable if you pick today |
|---|---|---|---|
| P4 mutation gates | | 1 d | Next long session |
| P6 Room verification | | 2 hr / 1 hr / 0 | Any session |
| P10 bee icons | | 2 hr / weeks / 0 | Next long session |
| P14 multi-drive | | 1 hr / 1 d / 0 | Any session |
| P15 template modal | | 20 min investigation | This session |
| P16 Files app | | 1 d / 4 d / 2 hr | Next long session |
| P17 tooltips | | 1 hr × 5 / 2 d / 6 hr | This session (option 1) |

**Fastest session-end answer:** "P15=3 (investigate viewport), P17 top 5=<your picks>,
defer rest." That unblocks ~2 hours of work right now and leaves the big
decisions for when you have time.
