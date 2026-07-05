# UX Transformation Report — 2026-07-04

Mission: experience Waggle OS as a real user (headless-Chromium walkthroughs of every
core journey), fix what breaks the experience, iterate until marginal. Benchmark: Apple.

**Commits:** `c03ca816` (wave 1) · `ad885d49` (wave 2) · `3091b04a` + `c04d049e` (wave 3) ·
`1e27933a` + `60616f8a` (wave 4) · `27e94077` (wave 5) · `8a4d2549` (wave-5 QA follow-up:
briefing dedup phrase-strip). All on local `main`, NOT pushed.
**Evidence:** `ux-audit-2026-07-04.md` (F1–F12), `ux-audit-2026-07-04-part2.md` (F13–F32),
`ux-wave2-plan-2026-07-04.md` (plan + deferred + incidental defects).
**Gates at close:** web tsc 0 · server tsc 0 · build:packages clean · web vitest 1323/1323 ·
every wave browser-verified by an independent QA agent (wave 1: 8/8, wave 2: 7/7 + regressions,
wave 4: 3 clean PASS + 4 patched post-QA, wave 5: verified — see below).

## Shipped

**Wave 1 — the first-run interruption stack (F1–F5, F8–F11):**
trial-paywall re-firing on every navigation → gated (session-once + 7-day snooze +
post-onboarding quiet window); "Let's go!" now actually sends the first task;
model-gate claim probe-backed (new `POST /api/settings/probe-provider`); LLM errors
became actionable ErrorBlocks (Retry + settings deep-link); coach marks defer on
first landing; sidebar active-state, fresh-workspace briefing copy, ⌘K collision.

**Wave 2 — the app no longer contradicts itself (F6, F7, F12–F16, F19, F21, F27):**
active workspace never silently switches; one source of truth for workspace counts
(dev-noise filter, switcher checkmark + overflow); friendly model labels everywhere +
fallback≠primary; Memory Graph scope fix (renders 1,698 nodes where it said "no data")
+ server stats undercount fix + scope-labeled counts; onboarding polish (Recommended
template from role, goals unselected, single Back, tailored suggestions, static
language badge); IA renames (Agents / Library / General); briefing-modal a11y
(focus trap, Escape, labeled close); failed turns re-render as ErrorBlock on reload.

**Wave 3 — QA residuals:** paywall never stacks on the briefing modal; probe banner
names the verified provider; step counter 4-of-5/5-of-5; redundant storage pill hidden.

**Wave 4 — root-cause dig + remaining-list cleanup (browser QA in flight):**
- **DB-flake ROOT-CAUSED** (not yet fixed — see below): `MultiMindCache` LRU evicts
  and closes an in-use `MindDB` mid-turn; post-response writes then throw "database
  connection is not open" and are silently swallowed. Confirmed exact mechanism.
  Added a classifier + structured warn logs at the two silent seams (autoSaveFromExchange,
  KG extraction) in `chat.ts` so it's now observable. **The real fix (pin/refcount on
  MultiMindCache, or a reopen-on-closed-handle guard in db.ts) lives in
  `packages/hive-mind-core/src/{multi-mind-cache,db}.ts` — off-limits to this arc per
  §7.5 (substrate changes land there first, not as a side effect of a UI sprint).**
  Also flagged: `WorkspaceSessionManager.closeIdleSessions()` is dead code (defined,
  never invoked) — likely related, needs wiring to an interval.
- F22 memory dedup: fixed. Cards collapse by normalized content with a "×N" badge;
  briefing highlights route through the same normalizer.
- F25 notifications: badge/panel count now share one derivation (no more independent
  drift); copy humanized; dead deep-links corrected across 5 server files; relative
  timestamps. QA-verified clean.
- F28 responsive: top bar protected (no-wrap brand, shrink-safe chips); sidebar
  collapses to an icon rail with tooltips under `lg`. QA-verified clean.
- F15 long tail: model-label wired into ChatApp, TelemetryApp, WorkspaceDesktopApp,
  ChatWindowInstance toast.
- F31 Solo→Free rename; F24 Weaver plain-language explainer + "Last Decay" tooltip.
  QA-verified clean.

**Wave 4 post-QA patch round (browser-verified after fix):**
QA ran the fresh build and found F22 had NOT shipped despite the implementer's claim,
plus two partial misses. Root-caused and fixed all three directly (no new workflow):
- **F22 dedup — real root cause was different from the original hypothesis.** Live
  data doesn't just differ by a stripped volatile token; a benchmark "anchor" memory
  gets re-written repeatedly with more appended turns each time (same title, content
  is a strict prefix of the next copy) — 6 visibly-duplicate cards, a growing chain
  pass-1 exact-match dedup can never merge. Added a second dedup pass:
  bucket by normalized title, absorb any entry whose content is a normalized prefix
  of a longer sibling's. Also found the normalizer's volatile-token regexes missed
  the *actual* live shapes: a raw epoch `Timestamp: 1782400441971` (not ISO-8601),
  a bare `audit-<digits>` id (RUN_ID_RE required the literal word "run"), and a
  `BENCH-SECRET-<token>`. Fixed all three; live-verified — the 6-card BENCHMARK
  family now renders as one card with an accurate `×7` badge.
- **F15 StatusBar chip — real bug, not stale HMR.** `formatModelLabel`'s catalog-match
  branch trusts any provider-catalog `name` that differs from the `id` as an
  already-friendly display name — true for the static cloud catalog, but Ollama's
  catalog `name` is *deliberately* the bare installed tag (`routes/providers.ts`
  `fetchOllamaModels`, "Display name stays the bare tag"), so it short-circuited
  before the heuristic humanized it. Fixed by skipping the catalog-trust branch for
  `ollama/`-prefixed ids. Live-verified: chip now reads "Gemma4 (31b)".
- **F24 Weaver tooltip — NOT a bug.** Verified live after a full daemon + Vite
  restart: the tooltip renders correctly (a real `[role=tooltip]` DOM node appears
  on hover). QA's long-running session (hours, 4 waves of live edits) is the more
  likely explanation than a code defect here — the same explanation QA itself gave
  for the sidebar/model-chip tooltips not screenshotting.
- F30 copy nit: found the SAME missing-pluralization bug duplicated in two server
  files (`workspace-context.ts` + `workspaces.ts`, 4 near-identical string templates
  each) — fixed all 8 occurrences.

**Wave 5 — final polish (F32, F17/F18, F12, F23):**
- F32: top-bar breadcrumb now reflects the active workspace sub-tab (was stuck on
  "Chat" for every tab — root cause: dock-tiers chat entry `route:'/workspaces'` was
  the only longest-prefix match); context-rail/detail-drawer cleared on real route
  change so it can't pin over the next page.
- F17 (safety posture, revertable): "Erase All Data" wrapped in a bordered all-tier
  "Danger Zone" section at the bottom of General. **The implementer correctly refused
  the literal "move to Advanced" plan** — Advanced is tier-gated (`settings-tier-filter.ts`
  POWER_SETTINGS_TAB_IDS), so moving a GDPR Art.17 erase control there would hide it
  from FREE/PRO tiers = a real compliance regression. Danger-zone framing resolves the
  actual complaint (plain 4th item under the theme picker) without tier-gating.
- F18 (safety posture, revertable): "Never ask" (auto-pass-everything) autonomy level
  now fires a one-time confirm on the transition INTO it + amber danger styling only
  while selected. Default stays 'normal'; safe levels never gated/restyled.
- F12: Agent Center sparse state — 2-3 suggested-agent template cards render under the
  list when ≤2 agents exist on the unfiltered tab (fills the honeycomb void).
- F23: Wiki tab display-level quality floor (hide entity pages with name <3 chars OR
  <2 sources), all counts derive from the floored set. Conservative — catches genuinely
  thin entities in clean data; a no-op on the benchmark-polluted dev corpus (whose junk
  all reports "30 sources"). A fragment heuristic for those was deliberately NOT shipped
  blind (false-positive-prone).
- Files-tab empty state: copy + "Open chat" CTA only — NO upload button, because
  `getWorkspaceFiles` (ingest registry) and `uploadFile` (storage-provider fs) are
  provably disjoint stores; an upload button would succeed yet leave the tab empty.
- W5D **surfaced a real contradiction, resolved conservatively**: the CreateWorkspaceDialog
  "Free plan includes one workspace" copy — canonical `tiers.ts` says FREE=5 / PRO=unlimited,
  but the legacy `feature-gates.ts` gates `multi-workspace` behind `minTier:'teams'`, so
  the runtime blocks FREE (and PRO-as-'solo') at workspace #2. Quoting either "1" or "5"
  contradicts a source and (for "5") creates a broken promise in the paywall's own dialog.
  Made the copy number-free ("Upgrade to add more workspaces — each keeps its own separate
  memory") pending a founder decision on the gate↔config mismatch (see below).

## Remaining high-impact issues (no product decision needed — just work)

_Reconciled 2026-07-05 after wave 5 + the workspace-limit resolve; several items
originally listed here shipped in wave 5 (F32 drawer/breadcrumb, Agents sparse-state
cards, wiki floor, workspace copy) and were removed._

1. **DB-flake real fix** — fully diagnosed (Wave 4): `MultiMindCache` LRU closes an
   in-use `MindDB` mid-turn. Needs a substrate change in `packages/hive-mind-core`
   (pin/refcount-aware eviction, or a reopen-on-closed-handle guard in `db.ts`) — a
   separate arc per the OSS-sync policy (§7.5), not a UI-sprint side quest. Also wire
   up the dead `WorkspaceSessionManager.closeIdleSessions()` while there. **Highest
   real-user impact of anything remaining** (it silently drops post-turn memory writes).
2. **Files-tab Upload** — blocked on a design step: `getWorkspaceFiles` (ingest
   registry, `files.jsonl`) and `uploadFile` (storage-provider fs) are disjoint stores,
   so an upload button would succeed yet leave the tab empty. Needs the registry↔storage
   merge first; until then the empty state is copy + "Open chat" only (shipped wave 5).
3. **W2G part C — server-side retry-dedup** — after a chat error, a local Retry can
   leave a duplicated failed user+assistant pair on reload. ~4-file server-side change
   (chat-persistence strip + retry-body handling). Cosmetic-on-reload only.
4. **F23 wiki fragment heuristic** — the conservative quality floor (name<3 / <2 sources)
   shipped, but the named junk pages ("Act Aug", "Abu Dhabi Airport") are ≥4-char,
   multi-word, all "30 sources" in the polluted dev corpus, so nothing catches them.
   A fragment heuristic (all-words-≤3-chars, standalone month tokens) is false-positive
   -prone — needs a clean corpus to tune against. Low value.
5. **Watch, not a task:** the wave-4 growing-composite dedup pass (same-title +
   content-is-a-prefix) has only been validated against the one benchmark "anchor"
   family. Watch for false negatives on other real duplicate shapes.

_Cosmetic tail: onboarding slug-collision still logs a single 409 (create path
auto-suffixes, so no user-visible break); cached workspace summaries keep old
"1 memories" text until regenerated (the generator is fixed)._

## Needs a product decision

- ~~**Workspace-limit gate ↔ config contradiction**~~ — RESOLVED (`593e6b40`). It
  turned out to be a client↔server *sync bug*, not a business decision: the server
  already enforces the canonical `tiers.ts` limit (FREE=5 / PRO=unlimited), only the
  client dialog gated off the stale `feature-gates.ts` `multi-workspace` flag and
  blocked at #2. Aligned the client to the same rule (new pure `canCreateWorkspaceAtTier`
  mirroring the server, boundary property-tested); paywall copy now truthfully quotes
  "The Free plan includes 5." **Still open (a real product decision, not this bug):**
  the legacy `feature-gates.ts` still carries the outdated 'solo'/'business' tier
  vocabulary (F31's deeper root) and the now-unreferenced `multi-workspace` entry — a
  broader migration of that whole file onto the canonical 5-tier system is worth doing.
- **Model-gate truth-gap:** the gate verifies a provider key, not the workspace
  chat's configured model (QA saw "Anthropic verified" while the chat's model 401'd).
  Should the gate probe the actual default model instead?
- **F20 marketplace:** same integration listed 3× from three catalogs with three
  verbs (Add/Connect/Enable) — needs a catalog-merge design, not a patch.
- ~~**F17/F18 safety UX**~~ — SHIPPED in wave 5 as a revertable posture change
  (Danger Zone + "Never ask" confirm). If a stronger posture is wanted (e.g. move
  Erase fully into Advanced *and* accept tier-gating it, or a higher-polish inline
  amber confirm-row instead of a native `confirm()`), that's the remaining decision.
- **F29 locale:** Serbian date fragments inside an all-English UI — localize fully
  or pin dates to UI language.
- **F26 Team tab:** dead end ("You — Online") that misses the Teams-tier upsell moment.
- **Sidebar active state on workspace Overview:** wave 1 made no spine item active
  there (previously Chat, wrongly). Design may prefer the workspace pill to carry it.

## Environment notes for the next session
- Dev recipe: sidecar `WAGGLE_SKIP_LITELLM=1 node --env-file=.env node_modules/tsx/dist/cli.mjs
  packages/server/src/local/start.ts` (RESTART after server edits — no watch);
  `npm run dev` (vite :8080); browse CLI daemon for walkthroughs.
- esbuild trap: `npm i @esbuild/win32-x64@0.28.0 --no-save` if tsx fails on version mismatch.
- Tree has heavy dev-noise workspaces (`ai-os-audit-*`) — now filtered in UI counts,
  but consider a real cleanup.
