# UX Refactor State Audit — Brief v2.1 §−1

**Date:** 2026-06-10 · **Baseline:** `main @ 9dfcc75` (= `origin/main`, fast-forwarded this session from stale `ca2c083`) · **Brief:** Workspace-First UX Refactor v2.1, Launch Cut, Audit-First
**Method:** 8 parallel auditor agents (one per §−1 item) over the live tree, including a live sidecar boot + authed endpoint probes for §2.5. All claims carry file:line evidence.

---

## Executive summary

**The prior plan already shipped most of the new brief's surface area — but on a different spine.** Phases 0–4 of the prior plan (PRs #9–#12, 44 commits) are fully merged to main: all 20 in-scope blueprint screens exist (2 consciously relocated), the Command Center palette is live on Ctrl+K, the tier gate is real and centralized, install-audit underpins the Extend layer, and all four builders ship with a fail-closed ApprovalModal.

**The spine conflict is the audit's headline.** The new brief mandates *AppShell + route-based navigation* and declares the multi-window shell retired (§2.4). Repo reality: a founder-ratified gate (B1, 2026-06-09: *"in-place dock reframe, keep windowed AppId nav, NO react-router"*) shipped Phases 0–4 *into* the windowed shell. `react-router-dom` serves exactly 2 routes (`/` and 404); zero screens are URL-addressable; the planned `AppShell.tsx` was never built. The new brief reverses a founder ratification — that needs an explicit re-ratification, not silent compliance.

**Three brief expectations are factually inverted by repo reality:**
1. §2.3 expects `create_skill`/`read_skill`/`delete_skill` are *not* exposed to the chat agent — they **are**, force-allowlisted to every persona (deliberate 2026-05-31 fix to close the self-evolving skill loop). What's missing is everything *around* them: approval gating, audit entries, one-API convergence, provenance badge.
2. §2.2's "silently swallowed 403" is **already fixed**: a global interceptor maps `TIER_INSUFFICIENT` to a mounted, regression-pinned `UpgradeModal` (the brief calls for an "Upgrade Card").
3. §2.1's Marketplace boot-race is **fixed at the component level** (7 screens gate on connect-settled; the pack fetcher throws on 401) — but the gate is an opt-in convention, not the structural guarantee the brief demands, and ~6 adapter getters still parse 401 bodies as valid-empty.

**Live-verified launch risks found beyond the brief's list:** the tracked Tauri sidecar bundle (`app/src-tauri/resources/service.js`) was last refreshed **2026-04-30** — a desktop binary built today would ship a *pre-refactor* server; the documented boot recipe crashes on a clean checkout until `npm run build:packages` runs; startup logs contain neither resolved dataDir nor tier; `WAGGLE_DATA_DIR` is dead on the server boot path while the marketplace installer honors it (split-brain risk).

**Verdict:** do not rebuild Phases 0–4. After the Section 8 decisions are ratified, the actual build surface is: the shell decision's consequences, the §2.1 structural gate, the §2.3 governance retrofit, the Memory Center two-mind rework (§4), a Win+K naming sweep, dataDir observability, and the launch-integrity fixes above.

### §−1 item → section map
| Brief §−1 item | Section |
|---|---|
| 1. Branch and diff baseline | 1 |
| 2. Shell status | 2 |
| 3. Screen inventory delta | 3 |
| 4. Auth/fetch sequencing | 4 |
| 5. Tier gate behavior | 5 |
| 6. Agent tool registry | 6 |
| 7. Backend keep-list health | 7 |
| 8. Gap report | 8-A (prior-plan reconciliation) + 8-B (gap report + decision register) |

---

## Section 1 — Branch & Diff Baseline

> **Bottom line:** main @ 9dfcc75 is synced with origin/main and already contains the entire prior UX-refactor arc — Phases 0–4 delivered via merged PRs #9/#10/#11/#12 (44 commits since ca2c083, plus an interleaved 3-commit temporal-substrate merge); the working tree is clean except 9 untracked paths, one of which is the new v2.1 brief package itself.

### 1.1 Branch and working-tree state
- **Branch:** `main` @ `9dfcc75` ("Merge pull request #12 from marolinik/feature/ux-refactor-phase4", 2026-06-10 16:49 +0200). `git status -sb` shows `## main...origin/main` with no ahead/behind — fully synced.
- **Modified tracked files:** none. **Untracked (9 paths):**
  - `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/` — **the NEW v2.1 brief, NOT under version control.** Contents: `Waggle_OS_UX_Refactor_PRD.md`, `Waggle_OS_Claude_Code_Implementation_Handoff.md`, `_blueprint_extracted.txt`, `Waggle_OS_UX_Refactor_Master_Blueprint.{pdf,docx}`, `Waggle_OS_UX_Refactor_Consolidated_Master.pdf`, `Waggle_OS_UX_Refactor_Deck.pptx`, `Waggle_OS_Handoff_Assets/`
  - `docs/plans/MEMORY-SOTA-PROPOSAL-2026-06-10.md`, `.mcp.json`, `benchmarks/memori-replication/`, and 5 benchmark data files (`benchmarks/data/beam/beam-128K.jsonl`, `benchmarks/data/longmemeval/*` ×4) — all unrelated to the UX refactor.
- The PRIOR plan's docs (`docs/ux-refactor/`) are committed; the new brief is not.

### 1.2 The 44 commits `ca2c083..9dfcc75` — merge structure
`git log --first-parent` shows exactly 5 merges onto main:

| Merge | PR / source branch | Commits | Delivered |
|---|---|---|---|
| `88d3a0b` | **PR #9** `feature/ux-refactor` | 26 | Phases 0, 1, 2 (+3 `ci:` smoke-workflow repairs) |
| `bc51da4` | **PR #10** `feature/ux-refactor-phase3` | 5 | Phase 3 (gate + 3A/3B/3C + review pass) |
| `4951b84` | temporal merge (no PR #) | 3 | **Non-UX**: temporal substrate (`a6cd7ce` design spec, `60e46aa` TEMPORAL_GUIDANCE soften, `09a040d` write-time relative-date resolution in harvest) |
| `2450899` | **PR #11** `fix/ux-phase3-smoke-findings` | 2 | Phase-3 live-smoke fixes (`aa847c1` agent_task all-workspaces 400 + C26 parity) + Phase-4 gate ratification (`490b1a3`) |
| `9dfcc75` | **PR #12** `feature/ux-refactor-phase4` | 3 | Phase 4 (4A/4B + `afd1de9` MCP test-budget 15s→8s fix) |

26 + 5 + 3 + 2 + 3 + 5 merge commits = **44** ✓.

### 1.3 What each phase cluster shipped (commit-message evidence)
- **Phase 0 — IA freeze** (in PR #9): `0dfe119` shared §15.2 vocabulary + WorkspaceConfig V2 fields; `5898c6c` IA color-semantic token aliases; `4b8e634` FE type consolidation (drop AppView); `0e581ea` dock IA zones + Home launch-flip.
- **Phase 1 — Home / Desktop / palette** (PR #9): `02124a4` backend (home + command routes, workspace state/activity, quick-capture); `22a84aa` frontend (Home Cockpit, Workspace Desktop, Command Center); `e509813` review pass (all HIGH resolved); `12d4c6d` HomeCockpit cold-load defer fix.
- **Phase 2 — Memory / Artifact / Onboarding** (PR #9): `783a217` gate ratified; `1bc78d7` 2A type contract + kind-map; `d8b3d3c` 2B.1 `memory_frames.metadata` column + `FrameStore.setMetadata` (M1); `3b92e5a` 2B.2 Memory Center REST (S04, 7 routes); `8663ef6` 2B.3 harvest classification (C33/B2/B6); `afe9635`+`8112002` 2B-FE Memory Center UI; `321153c` review (HIGH XSS); `2d96392`+`98787d4`+`f1d0550` 2C Artifact Center (store + 6 routes + FE S05 + traversal guard); `68018fd`+`13d3ec3`+`195ad17` 2D onboarding rework (S12–S17, B8/C33); `fcdc127` Automations dock-label alignment.
- **Phase 3 — Intelligence** (PR #10 + #11): `552d3c4` gate (B3 + C24/C26 + 8 defaults); `0a62c39` 3A backend (agents.json store + 7 agent routes, automations alias, skills `:id` aliases, PUT→PATCH cron); `77f03a7` review (21 findings); `2a9e1cc` 3B screens (S09 Agent Center, S06 Skills Hub, S11 Automation Center); `f7ba8ce` 3C builders (S18/S19/S20 + BuilderStepper + ApprovalModal); PR #11 smoke fixes.
- **Phase 4 — Extend** (PR #12): `e601665` 4A backend (M2 critical-audit migration, mcpRuntime boot, connector sync/revoke, mcps+extend routes); `6a0b478` 4B screens (S07 Connector Hub, S08 MCP Hub, S21 Marketplace consolidation); `afd1de9` MCP test/start budget fix.
- **Phase 5 — Team/RBAC: zero commits.** Founder-deferred — consistent with the v2.1 launch cut's "defer all Team/RBAC UI".
- **Non-UX commits in the window:** the 3 temporal-substrate commits + merge `4951b84`, and 3 `ci:` cross-platform-smoke fixes inside PR #9 (`016e35c`, `db9a324`, `0733b24`).

### 1.4 Worktrees (`git worktree list`)
| Path | HEAD | Branch | Containment in main |
|---|---|---|---|
| `D:/Projects/waggle-os` | `9dfcc75` | `main` | — (primary) |
| `D:/Projects/waggle-os-ga` | `12c60e8` | `ga/phase0-gates` | **ancestor of main** (no unique commits; stale) |
| `D:/Projects/waggle-os-gaia2-wt` | `08a63ba` | `feature/gaia2-are-setup` | **NOT in main** — GAIA2 benchmark work ("F4 scale-up RETRACTS F3 lift"), unrelated to UX |
| `D:/Projects/waggle-os-ux-refactor` | `afd1de9` | `feature/ux-refactor-phase4` | **ancestor of main** (verified `git merge-base --is-ancestor`) — pre-merge tip, fully contained; worktree is now stale |

Fully-merged local branches still present: `feature/ux-refactor`, `feature/ux-refactor-phase3`, `feature/ux-refactor-phase4`, `fix/ux-phase3-smoke-findings`, `ga/phase0-gates` (all contain-able housekeeping, no decision blocker).

### 1.5 Baseline verdict
The prior plan's Phases 0–4 are **entirely on main** — nothing from that arc is stranded on branches or in the ux-refactor worktree. The diff baseline for the v2.1 Launch Cut is therefore `main @ 9dfcc75` itself; the only un-merged repo state relevant to the new brief is the untracked brief package and unrelated benchmark/scratch files.

### Conflicts flagged for human decision
1. Keybinding naming: the v2.1 Launch Cut mandates 'Ctrl+K, NEVER Win+K', but the on-disk brief package itself says 'Win+K' throughout (docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md:19,74; _blueprint_extracted.txt:19,69,71,284,499,582,679). Shipped code binds Ctrl/Cmd+K (apps/web/src/hooks/useKeyboardShortcuts.ts:32,93) but repo comments name the feature 'Win+K' (packages/shared/src/types.ts:438; packages/server/src/local/routes/command.ts:2). Human must confirm Ctrl+K as canonical and decide whether to amend the package docs and code comments.
2. The new brief package docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/ is untracked (includes ~multi-MB PDF/docx/pptx binaries). Decide whether/what to commit, and declare which doc set is authoritative going forward: committed docs/ux-refactor/ (prior plan, phases marked complete) vs the new uncommitted package — both now coexist with overlapping screen IDs (S01-S21) and differing spine naming (e.g., 'Command Center' vs 'Win+K Command Center').
3. Stale fully-merged worktrees/branches (waggle-os-ux-refactor @ afd1de9, waggle-os-ga @ 12c60e8, plus 5 merged local branches) — prune or keep is a human call; pruning the ux-refactor worktree before starting v2.1 work avoids accidental edits against a pre-merge tip.

---

## Section 2 — Shell Status (repo @ 9dfcc75)

> **Bottom line:** The legacy multi-window OS shell (Desktop + floating AppWindows + dock with the prior plan's 5 IA zones) is fully live and is the only shell — no route-based AppShell exists (react-router-dom is installed but serves exactly 2 routes: "/" and a 404). The command palette is the cmdk-based CommandCenter overlay opened by Ctrl/Cmd+K, but one user-visible "Win+K" string survives in HomeCockpit, and the new brief's own handoff package docs use "Win+K" 41 times.

### (a) Legacy multi-window/dock shell — EXISTS, fully live, IS the shell

- `apps/web/src/components/os/Desktop.tsx` (668 lines) is the entire shell: wallpaper + `StatusBar` + floating `AppWindow`s + `Dock` + ~14 overlays. Mounted via `pages/Index.tsx` (BootScreen → Desktop).
- **Window manager**: `apps/web/src/hooks/useWindowManager.ts` (461 lines). `WindowState` = `{instanceId, appId, workspaceId?, personaId?, autonomyLevel?, zIndex, minimized, cascadeOffset}` (L11-47). Z-order via `topZRef`/`nextZ()` (L122, L190); focus tracking `focusedInstanceId` + `focusWindow` (L390) + `cycleWindowFocus` on Ctrl+` (L396-426); minimize (L386); full window-list persistence to localStorage key `waggle-window-state-v1` (L7, L54-84).
- `AppWindow.tsx` (321 lines): draggable (framer-motion `useDragControls` L70, drag props L232-236) + 8-direction resize (L18-21, L73-176). `DockTray.tsx` (57 lines): zone flyout popover.
- **How apps open today**: a static registry — `appConfig` in `Desktop.tsx` L82-115 maps 26 `AppId`s (union in `lib/dock-tiers.ts` L7-18) to `{title, icon, pos, size}`; `renderAppContent` switch (Desktop L339-469) renders the app component inside an `AppWindow`. `wm.openApp` is singleton-per-appId except `chat` (multi-instance per workspace/persona, L192-268); `openWorkspaceDesktop` is single-instance retarget (L279-309). Apps are **windows, not routes**.
- Prior-plan Phase 1 screens live *inside* this windowed shell: `home` → `HomeCockpit` (Desktop L363-382), `workspace-desktop` → `WorkspaceDesktopApp` (L392-406, 960×640 window per appConfig L89).

### (b) AppShell / route-based navigation — ABSENT

- `apps/web/package.json` L64: `react-router-dom ^6.30.1` (+ `@tanstack/react-query` L45; **no** TanStack Router). `App.tsx` L22-26 defines exactly 2 routes: `/` → `Index`, `*` → `NotFound`. No per-screen routes, no `AppShell` component anywhere in `apps/web/src`.
- **Navigation surfaces that exist today**:
  1. **Dock, 5 IA zones (prior plan Phase 0 — verified)**: `lib/dock-tiers.ts` `POWER_CONFIG` L50-103 — Work flat spine (home/chat/memory/files/artifacts) + zone-parents **Intelligence** (L59-70), **Extend** (L72-81: Connector Hub, MCP Hub, Marketplace, AI Tools), **Team** (L83-88, `minBillingTier: 'TEAMS'`), **System** (L91-102). Rendered generically by `Dock.tsx` L84-143 with `DockTray` flyouts.
  2. CommandCenter overlay result navigation → `handleSearchNavigate` (Desktop L258-288) opens windows by type prefix (`workspace:`/`memory:`/`session:`/…).
  3. Keyboard: Ctrl+Shift+0-9 app shortcuts, Ctrl+K palette, Ctrl+Shift+P persona, Ctrl+Tab workspace switcher, Ctrl+` window cycle (`useKeyboardShortcuts.ts` L16-118).
  4. **Journey-16 deep links are DOM events, not URLs**: CustomEvent `waggle:open-app` with `{appId, tab?, automationId?}` + stash/consume in `lib/app-deeplink.ts` (Desktop L172-190).
  5. URL params are utility-only: `?forceWizard=true` (DEV, `useOnboarding.ts` L44-52), Stripe `session_id` (`useBilling.ts` L93-99). **Zero URL-addressable screens.**

### (c) Repo-wide "win+k" grep (case-insensitive `win\+k|winK|win-k`)

**Code — 7 hits (6 comments + 1 user-visible string):**
| Path | Line | Kind |
|---|---|---|
| `apps/web/src/components/os/apps/HomeCockpit.tsx` | 145 | **USER-VISIBLE**: header pill renders `<Command/> Win+K` |
| `apps/web/src/components/os/Desktop.tsx` | 570-571 | comment ("the Win+K palette is now the Command Center") |
| `apps/web/src/components/os/overlays/CommandCenter.tsx` | 239 | comment ("same matcher the legacy Win+K used") |
| `apps/web/src/lib/adapter.ts` | 1923 | comment ("Command Center / Win+K") |
| `apps/web/src/lib/dock-tiers.ts` | 48 | comment ("Win+K (Global) lives in the StatusBar") |
| `packages/shared/src/types.ts` | 438 | comment ("Win+K Command Center result/command shapes") |
| `packages/server/src/local/routes/command.ts` | 2 | comment ("Command Center / Win+K routes") |

**Docs — 109 occurrences / 17 files**, including the NEW brief's own package: `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md` (22, incl. §12.3 "Opens from anywhere with Win+K or Cmd+K" L461), `_blueprint_extracted.txt` (14), `Waggle_OS_Claude_Code_Implementation_Handoff.md` (5); prior plan `docs/ux-refactor/` ≈66 hits (IMPLEMENTATION-PLAN.md 19, gap-cards S00 9 / S03 7 / S01 6, deltas 16, README 2, _inventory 2). False positives excluded: `benchmarks/data/longmemeval/*` ("wink…" in conversation text) and `docs/DAY-2-BACKLOG-2026-05-01.md:140` ("wink-and-nod"). Zero hits in `tests/` and `app/` (Tauri).

### (d) Command palette today

- **Component**: `apps/web/src/components/os/overlays/CommandCenter.tsx` (498 lines, cmdk-based) — named **`CommandCenter`**, mounted in Desktop L575-581 on `ov.showGlobalSearch`. Implements the 6 PRD §12.3 verb groups: `search/launch/create/run/navigate/extend` (L25-27), backed by `/api/command/*` (`packages/server/src/local/routes/command.ts`).
- **Shortcut**: **Ctrl+K** (`e.ctrlKey || e.metaKey` + `k`, `useKeyboardShortcuts.ts` L92-97; works while inputs are focused per L30-33). No Win-key-specific binding exists. Visible labels already say Ctrl+K: `StatusBar.tsx` L136 "Search (Ctrl+K)" + L144 `<kbd>Ctrl K</kbd>`, `KeyboardShortcutsHelp.tsx` L21 "⌘ K — Global Search", `SettingsApp.tsx` L259. The single exception is the HomeCockpit pill (c, above).
- **Legacy**: `overlays/GlobalSearch.tsx` (362 lines) is dead-but-retained "for rollback" (Desktop comment L572-573); no live imports.
- **Naming collision**: dock System zone entry labeled **"Command Center"** → `appId 'cockpit'` → `CockpitApp.tsx` (`dock-tiers.ts` L96; window titled "Cockpit", Desktop L93) — a different surface than the Ctrl+K `CommandCenter` overlay.

### Team/RBAC note (launch-cut relevance)
The dock currently ships a TEAMS-gated **Team zone** (`dock-tiers.ts` L83-88) → `TeamGovernanceApp`, plus TEAMS-gated Approvals (L68); hidden below TEAMS tier via `filterByBillingTier` (L134-148), not removed.

### Conflicts flagged for human decision
1. Architecture: the brief's AppShell + route-based spine vs repo reality — a live multi-window OS shell (Desktop.tsx + useWindowManager + AppWindow) with exactly 2 router routes and zero URL-addressable screens; prior plan's Phases 0-4 built INTO the windowed shell (HomeCockpit, WorkspaceDesktopApp, CommandCenter all render as floating windows/overlays). Replace-vs-wrap needs a human decision.
2. Banned naming shipped to users: apps/web/src/components/os/apps/HomeCockpit.tsx:145 renders a visible 'Win+K' pill — violates the v2.1 'NEVER Win+K' rule (every other visible label already says Ctrl+K / ⌘K).
3. The new brief's own blueprint package contradicts the v2.1 ban: docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/ (PRD 22 hits, blueprint 14, implementation handoff 5) names the palette 'Win+K Command Center' throughout — decide whether these canonical docs get regenerated or annotated.
4. User-facing name collision: dock System-zone entry 'Command Center' opens CockpitApp (appId 'cockpit', dock-tiers.ts:96), while the brief's 'Command Center' is the Ctrl+K CommandCenter overlay — two different surfaces share the brief's canonical name.
5. Launch cut defers all Team/RBAC UI, but the dock ships a Team zone (TeamGovernanceApp) and Approvals entry that are TEAMS-tier-hidden, not removed (dock-tiers.ts:68,83-88) — confirm hide-by-tier satisfies 'defer' or whether the zone should be stripped.
6. Cross-cutting comment debt: 6 code comments + packages/shared/src/types.ts:438 still document the palette as 'Win+K' (incl. server route header command.ts:2) — harmless at runtime but will propagate the banned name to future contributors; also ~66 'Win+K' hits across the prior plan's docs/ux-refactor/.

---

## Section 3 — Screen Inventory Delta (Blueprint Screens 1-21 vs apps/web reality)

> **Bottom line:** All 20 in-scope blueprint screens exist and are dock-registered in apps/web except onboarding S14 (Tool Discovery) and S16 (Memory Review), which the prior plan deliberately relocated out of the 5-step wizard (Launcher app / Memory Center "Needs review" filter respectively). Deferred S10 shipped nothing new, but a legacy TEAMS-gated TeamGovernanceApp (Apr 2026, pre-refactor) is still live, and a user-visible "Win+K" badge ships in HomeCockpit despite the actual binding being Ctrl+K.

**Blueprint screen list source:** `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/_blueprint_extracted.txt:671-739` (Screens 1-17) and `docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_Claude_Code_Implementation_Handoff.md:162-183` (Screens 18-21: Agent Builder / Skill Builder / Automation Builder / Marketplace-Extend). Note the blueprint itself titles Screen 3 "Win+K Command Center" — the v2.1 brief's "never Win+K" rule contradicts the package's own naming.

All paths below are under `D:/Projects/waggle-os/apps/web/src/`. "Registered" = window-registry entry + render case in `components/os/Desktop.tsx`.

| # | Blueprint name | Verdict | Path(s) | Notes |
|---|---|---|---|---|
| 1 | Home Cockpit | **exists** | `components/os/apps/HomeCockpit.tsx` | Canonical `'home'` launch route (`Desktop.tsx:84-85`, render case `:363-365`; launch-flip `:193-202`). **Conflict:** user-visible badge renders literal "Win+K" (`HomeCockpit.tsx:144-146`). |
| 2 | Workspace Desktop | **exists** | `components/os/apps/WorkspaceDesktopApp.tsx` | Registered as `"workspace-desktop"` (`Desktop.tsx:89`). |
| 3 | Win+K Command Center | **exists** | `components/os/overlays/CommandCenter.tsx` | Wired at `Desktop.tsx:575-581`; binding is **Ctrl+K** (`hooks/useKeyboardShortcuts.ts:92-93`); legacy `overlays/GlobalSearch.tsx` retained on disk for rollback (`Desktop.tsx:570-574`). "Win+K" survives in comments (`Desktop.tsx:570-571`, `lib/adapter.ts:1923`, `lib/dock-tiers.ts:48`, `CommandCenter.tsx:239`) and StatusBar tooltip says "Search (Ctrl+K)" (`StatusBar.tsx:136`). |
| 4 | Memory Center | **exists** | `components/os/apps/MemoryApp.tsx` + `apps/memory/{MemoryCenterTab,HarvestTab,EvolutionTab,MemoryCard}.tsx` | S04 marker `MemoryApp.tsx:120`; "Memory Center — inspect, edit, review, merge" tab `MemoryApp.tsx:48`; registered `"memory"` (`Desktop.tsx:91`). |
| 5 | Artifact Center | **exists** | `components/os/apps/ArtifactCenterApp.tsx` | Registered `"artifacts"` titled "Artifacts" (`Desktop.tsx:98`), rendered `:435` with workspace wiring. |
| 6 | Skills Hub | **exists** | `components/os/apps/CapabilitiesApp.tsx` (+ `apps/skills/SkillBuilder.tsx`) | Explicit "Skills Hub (UX-Refactor Phase 3B, S06)" header (`CapabilitiesApp.tsx:19`, h2 at `:388`); registered under legacy key `"capabilities"` titled "Skills Hub" (`Desktop.tsx:95`). Test: `test/phase3b-skills-hub.test.tsx`. |
| 7 | Connector Hub | **exists** | `components/os/apps/ConnectorsApp.tsx` | Registered `"connectors"` titled "Connector Hub" (`Desktop.tsx:102`); Phase 4B consolidation; references `ApprovalModal` + `apps/extend/InstallAuditPanel.tsx`. |
| 8 | MCP Hub | **exists** | `components/os/apps/MCPHubApp.tsx` | Registered `"mcp-hub"` (`Desktop.tsx:104`); "standalone MCP Hub under the Extend zone" (`lib/dock-tiers.ts:17`). Test: `test/phase4b-mcp-hub.test.tsx`. |
| 9 | Agent Center | **exists** | `components/os/apps/AgentsApp.tsx` + `apps/agents/{AgentCenterRow,AgentCenterDetail,TemplatesView}.tsx`, `lib/agent-center-display.ts` | Registered `"agents"` titled "Agent Center" (`Desktop.tsx:99`). Test: `test/phase3b-agent-center.test.tsx`. |
| 10 | Team Workspace (**DEFERRED**) | **absent (new)** / legacy present | `components/os/apps/TeamGovernanceApp.tsx` | Nothing shipped for it by the refactor — file created 2026-04-12 (`2748384`), last touched 2026-04-18 (`c623084`), both pre-refactor. BUT it is still rendered (`Desktop.tsx:466`) and docked in a TEAMS-gated "Team" zone (`lib/dock-tiers.ts:82-86`). Deferral holds for new code; legacy surface remains reachable. |
| 11 | Automation Center | **exists** | `components/os/apps/AutomationCenterApp.tsx` + `apps/automations/AutomationBuilder.tsx` | Registered under legacy key `"scheduled-jobs"` titled "Automation Center" (`Desktop.tsx:105`, render `:452`); Journey-16 deep-link channel at `Desktop.tsx:172-184`. |
| 12 | First Launch | **exists** | `components/os/overlays/onboarding/WelcomeStep.tsx` via `overlays/OnboardingWizard.tsx` | `STEP_NAMES[0]='first-launch'` (`OnboardingWizard.tsx:35`). |
| 13 | Who Are You | **exists** | `overlays/onboarding/WhoAreYouStep.tsx` | `STEP_NAMES[1]='who-are-you'`. |
| 14 | Tool Discovery | **partial** | `components/os/apps/LauncherApp.tsx` (outside onboarding) | **Not an onboarding step** — absent from `STEP_NAMES` (`OnboardingWizard.tsx:35`). Tool detection/launch exists only as the AI-OS-arc Launcher dock app. |
| 15 | Memory Import | **exists** | `overlays/onboarding/ImportStep.tsx` | `STEP_NAMES[2]='memory-import'`; C33 file import → classified preview → commit-all (`OnboardingWizard.tsx:62-176`, Claude Code harvest `:191-199`). |
| 16 | Memory Review | **partial** | `apps/memory/MemoryCenterTab.tsx` (relocated) | **No onboarding review step.** C33 commit-all lands imports as `status='unreviewed'` (`OnboardingWizard.tsx:167`); review relocated to Memory Center "Needs review" filter (`MemoryCenterTab.tsx:20,27,245`). |
| 17 | Create Workspace | **exists** | `overlays/onboarding/WorkspaceCreateStep.tsx` + `overlays/CreateWorkspaceDialog.tsx` | `STEP_NAMES[3]='workspace-create'`; standalone dialog wired post-onboarding (`Desktop.tsx:582`). |
| 18 | Agent Builder | **exists** | `components/os/apps/agents/AgentBuilder.tsx` | Uses shared `BuilderStepper` (`components/ui/stepper.tsx`) + `ApprovalModal` (`components/ui/approval-modal.tsx`). Test: `test/phase3c-agent-builder.test.tsx`. |
| 19 | Skill Builder | **exists** | `components/os/apps/skills/SkillBuilder.tsx` | Same `BuilderStepper` chassis; launched from Skills Hub (`CapabilitiesApp.tsx:393` `skills-hub-create`). |
| 20 | Automation Builder | **exists** | `components/os/apps/automations/AutomationBuilder.tsx` | Same chassis. Test: `test/phase3c-automation-builder.test.tsx`. |
| 21 | Marketplace / Extend | **exists** | `components/os/apps/MarketplaceApp.tsx` | Registered `"marketplace"` (`Desktop.tsx:106`); Phase 4B Marketplace/Extend consolidation. Test: `test/phase4b-marketplace-extend.test.tsx`. |

**Onboarding shape vs blueprint:** the shipped wizard is a 5-step chain `['first-launch','who-are-you','memory-import','workspace-create','ready']` (`OnboardingWizard.tsx:35`; step components in `overlays/onboarding/` incl. a `ReadyStep.tsx` not in the blueprint numbering). The blueprint's six onboarding screens S12-S17 therefore map 4-of-6 directly; S14 and S16 were consciously cut/relocated by the prior plan (2D.2 rework, "6 orphaned steps removed").

**Window-key drift (cosmetic, noted not judged):** Automation Center lives under legacy key `scheduled-jobs`, Skills Hub under `capabilities`, Artifact Center titled "Artifacts" — names in `Desktop.tsx` window registry don't all match blueprint screen names.

### Conflicts flagged for human decision
1. Win+K naming: the keybinding is already Ctrl+K (hooks/useKeyboardShortcuts.ts:92-93) but a user-visible 'Win+K' badge ships on the Home Cockpit header (HomeCockpit.tsx:144-146), and 'Win+K' persists in code comments (Desktop.tsx:570-571, lib/adapter.ts:1923, lib/dock-tiers.ts:48, CommandCenter.tsx:239). The blueprint package itself titles Screen 3 'Win+K Command Center' (_blueprint_extracted.txt:679) — decide whether the v2.1 'never Win+K' rule triggers a UI-string + comment + doc rename pass.
2. S14 Tool Discovery + S16 Memory Review: blueprint lists both as onboarding screens, but the shipped wizard is a ratified 5-step chain without them (OnboardingWizard.tsx:35; C33 commit-all at :167) — tool discovery lives in LauncherApp.tsx, memory review in Memory Center's 'Needs review' filter (MemoryCenterTab.tsx:27). Decide whether these relocations satisfy the v2.1 launch cut or the onboarding steps must be restored.
3. S10 Team Workspace deferral scope: no new Team/RBAC UI shipped (deferral holds), but the pre-refactor legacy TeamGovernanceApp.tsx is still rendered (Desktop.tsx:466) and reachable via a TEAMS-gated 'Team' dock zone (lib/dock-tiers.ts:82-86). Decide whether 'defer all Team/RBAC UI' means hiding/removing this legacy surface for the launch cut or leaving it as-is.

---

## Section 4 — Auth/fetch sequencing (brief §2.1)

> **Bottom line:** The §2.1 Marketplace boot-race is fixed at the component level (connecting-settled gate + throw-on-401 in the pack fetcher), but the gate is an opt-in per-component convention covering 7 of ~55 adapter-importing components — the race class remains structurally present via ungated boot-path fetches (Desktop tier, LoginBriefing) and ~6 adapter getters that still parse 401 bodies as valid-empty, with no 401→refresh→retry anywhere.

### (a) Auth-ready gate: EXISTS, but per-component — not global

**Store/connection layer.** There is no zustand store (zero `useQuery`/`useMutation` too — the `QueryClient` in `apps/web/src/App.tsx:11,16` is instantiated but never used). Global connection state is a 47-line React context: `apps/web/src/providers/ServiceProvider.tsx` exposes `{ adapter, connected, connecting, error, reconnect }`; `connect()` runs once in a mount effect (line 40) and flips `connecting` false in `finally` (lines 26–38). The adapter is a module-level singleton (`apps/web/src/lib/adapter.ts`, 2,551 lines): `connect()` (lines 119–135) probes `/health` then awaits `fetchSessionToken()` (138–148) against the auth-exempt `GET /api/auth/session-token`; `fetch()` (185–216) attaches `Authorization: Bearer` only when `this.authToken` is set (200–202). Server-side, every `/api/*` route requires the bearer (`packages/server/src/local/security-middleware.ts:238` `AUTH_EXEMPT_PATHS = ['/health', '/api/auth/session-token']`; 316–339 → 401 `MISSING_TOKEN`).

**The gate is opt-in.** The pattern is "defer load() until the connect attempt has SETTLED" — gating on `connecting`, not `connected`, so a failed connect still surfaces error+Retry (comment at `HomeCockpit.tsx:440–443,481–489`; `MarketplaceApp.tsx:96–101`). Exactly 7 components adopt it:
`MarketplaceApp.tsx:101`, `HomeCockpit.tsx:443`, `CapabilitiesApp.tsx:73`, `ConnectorsApp.tsx:102`, `MCPHubApp.tsx:68`, `AgentsApp.tsx:41`, `AutomationCenterApp.tsx:42`.

**Not global.** 55 component files import the singleton `adapter` directly; `adapter.fetch()` has no pre-token queue/deferral. For a returning user (`waggle-booted` in localStorage) `Desktop` mounts on first render concurrently with `connect()` (`apps/web/src/pages/Index.tsx:20–22,34`), and ungated mount-time fetches fire on the boot path:
- `Desktop.tsx:158` `refreshTier()` → `getTier()` (`adapter.ts:2194–2197`, no `res.ok` check) — a pre-token 401 body parses, `data.tier ?? 'FREE'` silently renders the FREE tier (`Desktop.tsx:147–157`).
- `Desktop.tsx:166` `getPermissions().catch(() => {})` — swallowed.
- `LoginBriefing.tsx:83–105` (mounts at desktop start for returning users, `Desktop.tsx:627`) — `getIdentity` / `getWorkspaces` / `searchMemory(...).catch(() => [])` / `getMemoryStats().catch(() => null)`: pre-token failures render an empty briefing with no error surface.
- `MemoryCenterTab.tsx:74–77` and `ArtifactCenterApp.tsx:96–99` fetch on mount ungated, but their adapter calls throw on `!res.ok` (`adapter.ts:556,623`) → error state, not silent-empty.

### (b) Marketplace catalog path, end-to-end

`MarketplaceApp` (Phase 4B consolidated Extend surface) → `loadFacet()` fans out per B7 facet via `Promise.allSettled` (`MarketplaceApp.tsx:116–188`) → adapter → sidecar:
- skill facet: `adapter.getMarketplace({type:'skill'})` + `adapter.getMarketplacePacks()` → `GET /api/marketplace` / `GET /api/marketplace/packs` (lines 123–143).
- Effect gated on `connecting` settled (191–195); debounced query refetch (203–209).

**401-cached-as-valid:** fixed for `getMarketplacePacks()` (`adapter.ts:975–979` throws on `!res.ok`; the "BUG #7 (marketplace boot-race)" comment at 981–995 documents the original failure verbatim: raw fetch → 401 before token bootstrap → "silently caching the empty 401 body as an empty catalog"). **But `getMarketplace()` (`adapter.ts:1717–1727`) has NO `res.ok` check** — a 401 body parses and `(r.packages ?? [])` fulfils as empty. Same residual class in `getMcps` (1650–1657, `unwrapArray`), `getPersonas` (1529–1532), `getModels` (1485–1488), `getWorkspaceTemplates` (231–234). Consequence: if `connect()` settles with a null token (best-effort bootstrap, `adapter.ts:124–128,146`), the skill facet's all-rejected detection (`MarketplaceApp.tsx:130–135,177–179`) cannot fire — `getMarketplace` fulfils-empty while `getMarketplacePacks` rejects → renders "No extensions available for this facet" (`MarketplaceApp.tsx:364–371`), a healthy-looking empty catalog, not the error+Retry state (352–362). Results live only in component state (`setExtensions`) — not persisted; remount refetches.

**Refetch on tab/focus:** ABSENT. No `visibilitychange`/window-focus listener, no react-query focus refetch. Refetch happens only on facet click, query debounce, explicit Retry, or window remount (apps mount on open — `Desktop.tsx:172–177`).

**Stale-token 401 → silent refresh → retry:** ABSENT. `adapter.fetch()` special-cases only 403 `TIER_INSUFFICIENT` (`adapter.ts:204–214`); `fetchSessionToken()` is invoked solely from `connect()`; `reconnect()` (`ServiceProvider.tsx:10,43`) is manual. A sidecar restart mid-session invalidates the in-memory token and every authed call 401s until full page reload.

### (c) Verdict

**PARTIAL — fixed where patched, structurally open as a class.** The exact §2.1 Marketplace repro (catalog fetch pre-token → 401 → permanently empty) is closed by two component-level patches: the `connecting`-settled gate (7 components) and throw-on-`!ok` conversions (`getMarketplacePacks`, `getConnectors` `adapter.ts:1605–1611`, `getSkills` 843–854, `getCronJobs` 1153–1162, `listMemories`/`listArtifacts`/`listAgents`/`listAutomations`). Nothing enforces the gate structurally: the adapter dispatches pre-auth from anywhere, ungated boot-path fetchers remain (`Desktop.refreshTier` → silent FREE-tier render; `LoginBriefing` → silent empty briefing), ~6 getters still parse 401 bodies as valid-empty (including one of the two Marketplace skill-facet sources), and there is no 401 recovery path. Each new screen must remember the convention or re-introduce the bug.

### Conflicts flagged for human decision
1. Brief §2.1 implies a GLOBAL auth-ready gate; the repo implements an opt-in per-component convention (`const { connecting } = useService()` in exactly 7 of ~55 adapter-importing component files). Decision needed: retrofit a structural gate (adapter-level pre-token deferral or provider-level render gate) vs. accept and extend the per-component convention for the launch cut.
2. No stale-token recovery exists anywhere: adapter.fetch handles only 403 TIER_INSUFFICIENT; fetchSessionToken() is called only from connect(); nothing auto-invokes reconnect() on 401. On a sidecar restart (new session token) every authed call 401s until a full page reload. Decision needed: is 401→silent-refresh→retry in scope for v2.1 Launch Cut?
3. Adapter non-2xx handling is inconsistent by design-drift: ~8 getters throw on !res.ok (getMarketplacePacks, getConnectors, getSkills, getCronJobs, listMemories, listArtifacts, listAgents, listAutomations) while others parse 401 error bodies into healthy-looking values (getMarketplace→[], getMcps→[], getPersonas→[], getModels→[], getWorkspaceTemplates→[], getTier→'FREE'). Decision needed: mandate throw-on-!ok adapter-wide, or accept the residual silent-empty class on the unconverted getters.
4. Desktop.tsx and LoginBriefing.tsx fire ungated mount-time fetches on the boot path (refreshTier/getPermissions at Desktop mount; identity+workspaces+memory at LoginBriefing mount, errors swallowed to empty). A pre-token 401 renders tier=FREE and an empty briefing with no error surface. Decision needed: are these boot-path surfaces in scope for the §2.1 fix, or Marketplace-only?

---

## Section 5 — Tier gate behavior (brief §2.5 + §2.2)

> **Bottom line:** The tier gate is real, centralized, and live-verified: `requireTier()` re-reads `~/.waggle/config.json` on every request and the FE maps 403 TIER_INSUFFICIENT to a global UpgradeModal — but the resolved dataDir/tier are never logged at startup, `WAGGLE_DATA_DIR` is dead on the documented boot path, and a fresh main checkout does not even boot via the recipe until `npm run build:packages` is run (stale `shared/dist` missing `EXTENSION_TYPES`).

### (a) dataDir resolution on the `start.ts` path — EXISTS, but env override is dead and nothing is logged

- `packages/server/src/local/start.ts:10` calls `startService({ skipLiteLLM, port })` — it passes **no `dataDir`**. Port comes from `WAGGLE_PORT` (default 3333 via `DEFAULT_PORT`, `service.ts:43`).
- `packages/server/src/local/service.ts:108`: `const dataDir = options?.dataDir ?? path.join(os.homedir(), '.waggle')` — on this entry path dataDir is **always `~/.waggle`**.
- `WAGGLE_DATA_DIR` exists only at `packages/server/src/local/index.ts:302` (`config.dataDir ?? process.env.WAGGLE_DATA_DIR ?? ''`) — **dead on the start.ts path** because `startService` always passes `dataDir` into `buildLocalServer` (`service.ts:186-190`). It is honored only when `buildLocalServer` is called directly (tests, e.g. `packages/server/tests/local/mcps.test.ts:33`) and by other packages: `packages/launcher/src/cli.ts:110`, `packages/marketplace/src/installer.ts:48`, `packages/memory-mcp/src/core/setup.ts:38`. `packages/server/src/local/mcp-config.ts:45-46` falls back empty-string → `~/.waggle`.
- **Startup log does NOT include the resolved dataDir or tier.** `start.ts:15-17` logs only listen URL, LLM provider, and health URL. Live-confirmed (see d).

### (b) Tier gate — EXISTS, single middleware, re-reads config.json per request

- Gate: `packages/server/src/middleware/assert-tier.ts`. `requireTier(min)` (line 38) → 403 `{ error: 'TIER_INSUFFICIENT', message, required, actual, upgradeUrl: 'https://waggle-os.ai/upgrade' }` (lines 44-51).
- **Per-request re-read: YES.** `readTierFromRequest()` (lines 20-32) does `fs.existsSync` + `fs.readFileSync` + `JSON.parse` of `<server.localConfig.dataDir>/config.json` on **every** gated request, applying `getEffectiveTier(parsed, trialStartedAt)` (trial expiry evaluated per request). No caching. Fail-closed to `'FREE'` (note: stale comment "default to SOLO" at line 30).
- Gated routes (all via `preHandler: [requireTier(...)]`): `marketplace.ts:181` install PRO, `:764` publish PRO, `:152` enterprise-packs ENTERPRISE; `mcps.ts:189,331` PRO; `personas.ts:32,100` PRO; `team.ts:110` TEAMS, `:418` ENTERPRISE; `cost.ts:202` TEAMS; `settings.ts:447,460,482` TEAMS; `stripe/portal.ts:15` PRO. `GET /api/marketplace/packs` (`marketplace.ts:123`) is **not** tier-gated — only bearer-auth-gated.
- Compiled copies: `packages/server/dist/local/service.js` (gitignored) has 0 matches — the gate compiles to `packages/server/dist/middleware/assert-tier.js` (2 matches, exists). **`app/src-tauri/resources/service.js` (6.5 MB esbuild bundle, 1 match) is TRACKED in git, last committed 2026-04-30 (`447f5ac` "refresh sidecar bundle")** — ~6 weeks older than the merged UX-refactor Phases 0-4 (main @ 9dfcc75, 2026-06-10). Copies under `app/src-tauri/target/*/resources/service.js` are build outputs (release copy: 1 match). No `service.js` anywhere under `C:/Users/MarkoMarkovic/.waggle`.

### (c) Current tier — PRO

`C:/Users/MarkoMarkovic/.waggle/config.json` line 11: `"tier": "PRO"` (also `onboardingCompleted: true`, default/fallback model `claude-opus-4-6`). Not modified.

### (d) Live verification — DONE (with two boot-reality findings)

1. **Pre-existing instance on 3333**: before my boot, `GET /health` on 3333 answered immediately (`llm.checkedAt` 2026-06-05) — a long-running sidecar (PID 6388) already occupied the default port.
2. **Fresh main does NOT boot via the recipe.** `npx tsx --env-file=.env packages/server/src/local/start.ts` (`.env` exists; no `WAGGLE_PORT`/`WAGGLE_DATA_DIR` in it) crashed at import: `routes/extend.ts:16` — `'@waggle/shared' does not provide an export named 'EXTENSION_TYPES'`. Cause: `packages/shared/dist/types.js` was dated 2026-06-09, predating the Phase-4 merge that added `EXTENSION_TYPES` (`packages/shared/src/types.ts:375`). After `npm run build:packages`, boot succeeded on `WAGGLE_PORT=3501`.
3. **Startup log captured** (my instance): `Starting Waggle service... {"skipLiteLLM":true}` → `Marketplace DB loaded` → embedding probe → `Server listening on http://127.0.0.1:3501` → LLM provider → health URL. **No dataDir line, no tier line.** Side observation: with `CLERK_SECRET_KEY` set in `.env`, a teams-server also started at `http://127.0.0.1:3101` after logging `Build failed: Fastify instance is already listening. Cannot call "addHook"!`.
4. **Auth**: `GET /api/marketplace/packs` without token → **401 `{ "error":"Unauthorized","code":"MISSING_TOKEN" }`** (bearer auth: `security-middleware.ts:316-338`; exempt list is only `/health` + `/api/auth/session-token`, line 238). Bootstrap: `GET /api/auth/session-token` (auth-exempt, same-origin gated via `isLocalRequest`, `index.ts:1965-1970`) returned a 64-hex token — same mechanism the FE adapter uses.
5. **Authed probes**: `GET /api/tier` → `{"tier":"PRO","rawTier":"PRO",...}` (matches config.json); `GET /api/marketplace/packs` → **HTTP 200** with the pack list (`business_ops`, `consultant`, ...). Tier is PRO so **no install was attempted** per instructions; the deny path is pinned by tests instead: `packages/server/tests/tier-enforcement-matrix.test.ts:116-163` and `tests/local/mcps.test.ts:396-401` (FREE → 403 TIER_INSUFFICIENT).
6. **Cleanup**: killed only my instance (PID 44344, port 3501); verified 3333/PID 6388 untouched. Side effect of the recipe itself: my boot overwrote `~/.waggle/server.pid` (`service.ts:214`) — restored to `6388` afterwards.

### (e) §2.2 FE handling of 403 TIER_INSUFFICIENT — EXISTS, mapped (not swallowed), but it's a Modal, not a "Card"

- Central mapping: `apps/web/src/lib/adapter.ts:204-214` — every adapter `fetch()` inspects 403 bodies; `error === 'TIER_INSUFFICIENT'` dispatches `window` CustomEvent **`waggle:tier-insufficient`** with `{ required, actual, message }`.
- Consumer: `apps/web/src/components/os/overlays/UpgradeModal.tsx:52` listens for the event and renders a focus-trapped upgrade dialog with a FREE/PRO/TEAMS capability table from `TIER_CAPABILITIES` (`@waggle/shared`), with `onStartTrial`/`onUpgrade` callbacks. Mounted globally at `Desktop.tsx:642`.
- Non-adapter fetch paths dispatch the same event manually: `MCPHubApp.tsx:156-160`, `MarketplaceApp.tsx:238` (status-403-checked, line 212), `CapabilitiesApp.tsx:194`, `chat-blocks/CapabilityRequestCard.tsx:56`; `mcp/AddCustomMcpForm.tsx:63` suppresses its local error UI for TIER_INSUFFICIENT and defers to the global handler. Behavior is regression-pinned in `apps/web/src/test/phase4b-mcp-hub.test.tsx:121-135` and `phase4b-marketplace-extend.test.tsx:142-175`.
- No component named "UpgradeCard"/"Upgrade Card" exists in `apps/web/src` — the designed surface in-repo is `UpgradeModal`.

### Conflicts flagged for human decision
1. Brief §2.2 'Upgrade Card' vs repo reality: the FE maps 403 TIER_INSUFFICIENT to a global UpgradeModal (apps/web/src/components/os/overlays/UpgradeModal.tsx, mounted Desktop.tsx:642), not a card component; no UpgradeCard exists. Decide: does UpgradeModal satisfy the §2.2 design or must it be rebuilt/renamed?
2. Documented boot recipe is broken on a clean main @ 9dfcc75: `npx tsx --env-file=.env packages/server/src/local/start.ts` crashes (stale packages/shared/dist missing EXTENSION_TYPES added by Phase 4) until `npm run build:packages` is run. Decide whether the launch-cut recipe must mandate build:packages first, or the server should stop importing @waggle/shared via dist on the dev path.
3. WAGGLE_DATA_DIR is dead on the server boot path (service.ts:108 hardcodes ~/.waggle; index.ts:302 env fallback is unreachable from start.ts) while packages/marketplace/src/installer.ts:48 and packages/launcher/src/cli.ts:110 DO honor it — split-brain risk: tier gate reads ~/.waggle/config.json while the installer can write elsewhere. Decide the canonical dataDir contract.
4. Tracked compiled sidecar bundle app/src-tauri/resources/service.js (6.5 MB) was last committed 2026-04-30 (447f5ac) — the desktop binary would ship a pre-UX-refactor server (old tier gate, none of Phases 1-4) unless the bundle is refreshed; decide refresh/gitignore policy before launch.
5. Brief §2.5 implies observable tier resolution, but startup logs contain neither the resolved dataDir nor the tier (start.ts:15-17, live-confirmed); also a long-running sidecar already occupies default port 3333 on this machine (PID 6388, up since ~2026-06-05), and any second boot silently clobbers ~/.waggle/server.pid (service.ts:214 — restored to 6388 after my run).

---

## Section 6 — Agent tool registry vs brief §2.3

> **Bottom line:** create_skill/read_skill/delete_skill already EXIST and are force-allowlisted to every persona in the live chat pool (contrary to the brief's expectation), but they bypass every §2.3 control: no approval gate at any autonomy level, no install-audit entry, no shared API path, and no agent-provenance signal in the Skills Hub.

### (a) Skill tools exposed to the chat agent — EXISTS (brief's expectation is wrong)

`packages/agent/src/tools.ts` (670 LOC) defines only `ToolDefinition` + `createMindTools` — the skill tools live in **`packages/agent/src/skill-tools.ts`** (933 LOC, `createSkillTools()` at L103). Tools defined there:

| Tool | Line | Behavior |
|---|---|---|
| `list_skills` | L115 | lists `~/.waggle/skills/*.md` + plugins |
| `create_skill` | L184 | writes `<skillsDir>/<name>.md` directly via `fs.writeFileSync` (L236), after `redactSkillContent` secret/path stripping (L232); hot-reloads via `onSkillsChanged` |
| `delete_skill` | L248 | `fs.unlinkSync` (L266); traversal guard only |
| `read_skill` | L274 | reads full content |
| `search_skills` | L298 | local + marketplace search |
| `suggest_skill`, `acquire_capability` (L408), `install_capability` (L484) | — | gap-detect / curated install path |
| `promote_skill` (workspace→global, `getSkillDirForScope`) | ~L700-730 | scope promotion (locked by `packages/agent/tests/promote-skill.test.ts`) |

**Live wiring:** `packages/server/src/local/index.ts:601` builds `createSkillTools({ waggleHome, auditStore, ... })` into the default chat tool pool.

**Persona exposure:** `packages/server/src/local/persona-tool-filter.ts:26-33` — `ALWAYS_AVAILABLE_TOOLS` force-includes `'create_skill', 'read_skill', 'delete_skill'` ("Write-side skill tools — required for the self-evolving loop to close"), surviving every persona allowlist. This is the memory-flagged 54b1a c1 fix; the rationale comment (L18-24) says stripping `create_skill` half-fires the closed learning loop. Applied on the live path at `packages/server/src/local/routes/chat.ts:1020` (`applyPersonaToolFilter`, gated `!hasCustomRunner && activePersonaId`; personas declaring zero tools get everything, L62). Read-only personas (planner/verifier) lose `create_skill`/`delete_skill` but keep `read_skill` via `READ_ONLY_WRITE_TOOLS` (L39-45). No persona declares them in `persona-data.ts` — they ride the always-available set. `packages/agent/src/permissions.ts` `READONLY_TOOLS` sandbox (L4-13) includes `list_skills`/`search_skills` but none of create/read/delete.

**Approval gating on these tools: ABSENT.** `packages/agent/src/confirmation.ts` `ALWAYS_CONFIRM` (L13-19) gates `install_capability` but **not** `create_skill`/`delete_skill`/`read_skill` — they execute silently at *every* autonomy level (normal/trusted/yolo), and never appear in `isCriticalNeverAutopass` (L192-212).

**Audit on these tools: ABSENT.** `create_skill`/`delete_skill` make zero `auditStore.record` calls (skill-tools.ts L198-269). Only `acquire_capability` ('proposed', L465) and `install_capability` ('failed' L524, 'blocked' L563, 'approved' L621, 'installed' L641, all `initiator: 'agent'`) write the install-audit trail.

### (b) Human skill path — EXISTS, audit coverage inconsistent

`packages/server/src/local/routes/skills.ts` (skillsDir = `path.join(waggleHome, 'skills')`, L44 — **same directory** the agent tool writes, skill-tools.ts L105):

| Route | Line | Audit entry? |
|---|---|---|
| `POST /api/skills` (raw create) | L394 | **NO** — write + redact + hot-reload only |
| `POST /api/skills/create` (Skill Creator) | L422 | **YES** — L475-485: `source:'local-created'`, `trustSource:'local_user'`, `action:'installed'`, `initiator:'user'` |
| `POST /api/skills/starter-pack/:id` | L167 | YES — L212-222: `source:'starter-pack'`, `initiator:'user'` |
| `PUT /api/skills/:name` (update) | L506 | **NO** |
| `DELETE /api/skills/:name` | L537 | **NO** |
| Phase-3 aliases `PATCH /api/skills/:id`, `POST /api/skills/:id/test`, `POST /api/skills/:id/install` | `routes/skills-aliases.ts` L20/L42/L62 | delegate to the above |

`packages/core/src/install-audit.ts` **does** have a required `source` column (L29, `TEXT NOT NULL` L63) plus `initiator` `'agent'|'user'|'system'` (L21) and `getRecentByType` (L147) backing the shared read `GET /api/extend/audit` (`routes/extend.ts:88`, Phase 4B C18). The schema can already express "created by agent" — nothing writes it for `create_skill`.

**No provenance on the read path:** `GET /api/skills` returns only `{name, length, preview}` (skills.ts L348-356). Skill files are plain markdown with no initiator frontmatter.

### (c) Approval infrastructure — EXISTS, on two parallel surfaces

1. **`apps/web/src/components/ui/approval-modal.tsx`** (Phase 3C, PRD §17.3): reusable, renders action/scope/risk as text, fail-closed in behavior — open iff `request != null`, single close path is `onOpenChange→onCancel` with an `approvedRef` guard so dismiss ≠ approve (L53-61). Consumers: `agents/AgentBuilder.tsx:386`, `automations/AutomationBuilder.tsx:519`, `ConnectorsApp.tsx:380`, MCP Hub + Marketplace (locked by `apps/web/src/test/phase4b-mcp-hub.test.tsx:139`, `phase4b-marketplace-extend.test.tsx:125,194`).
2. **In-chat agent approval flow** (separate surface): `chat.ts:886-949` registers a per-request `pre:tool` hook → `needsConfirmationWithAutonomy` (confirmation.ts L224-248) → persistent `approvalGrantStore` check (chat.ts:921) → trust-metadata enrichment for `install_capability` (chat.ts:932-949) → SSE `approval_required` → `apps/web/src/hooks/useChat.ts:248-252` `setPendingApproval` → rendered in `ChatApp.tsx`/`ChatWindowInstance.tsx` (NOT via `ui/approval-modal.tsx`).
3. **Shared audit feed UI:** `apps/web/src/components/os/apps/extend/InstallAuditPanel.tsx` (Phase 4B C18) renders `source`/`initiator`/`action` per entry and is mounted as the Skills Hub "Audit" tab (`CapabilitiesApp.tsx:16` + tab L56).

### (d) Verdict — distance from §2.3

| §2.3 requirement | Status | Evidence |
|---|---|---|
| Agent-side create/read/delete_skill | **EXISTS** (brief assumed absent) | skill-tools.ts L184/L248/L274; force-allowlisted persona-tool-filter.ts L26-33 |
| Gated by the same approval modal as high-risk installs | **ABSENT** | not in `ALWAYS_CONFIRM` (confirmation.ts L13-19); zero gating at any autonomy level; and chat-side gating, where it exists, uses the in-chat card, not `ui/approval-modal.tsx` |
| One API | **ABSENT** | agent tool writes fs directly, bypassing HTTP; human side itself has two create endpoints (L394 vs L422) |
| One audit trail | **PARTIAL** | store + `source` + `initiator:'agent'` + shared `GET /api/extend/audit` + Skills Hub Audit tab all exist; but agent `create_skill`, raw `POST /api/skills`, `PUT`, `DELETE` write nothing to it |
| "Created by agent" provenance badge in Skills Hub | **ABSENT** | `GET /api/skills` carries no source field; the "Custom" tab classifies by name-not-in-any-catalog heuristic (`CapabilitiesApp.tsx:115-120`), conflating agent-created with user-authored; `SkillRow.tsx` badges status only |

Net: every §2.3 building block exists somewhere (tools, audit store with the right columns, modal, gate sets, secret redaction) — the gap is that the agent's skill-write path is wired *around* all of them, deliberately, to keep the self-evolving skill loop frictionless.

### Conflicts flagged for human decision
1. Brief §2.3 expects create/read/delete_skill are NOT yet exposed to the chat agent — repo reality is the opposite: all three are live AND force-allowlisted for every persona via ALWAYS_AVAILABLE_TOOLS (packages/server/src/local/persona-tool-filter.ts:26-33), a deliberate 2026-05-31 fix (54b1a c1) that keeps the self-evolving skill-distillation loop closed. Adding the brief's approval gate to create_skill would put a human prompt inside that autonomous loop — founder decision needed on loop-vs-governance.
2. 'Gated by the same approval modal as high-risk installs' is ambiguous against repo reality: there are TWO approval surfaces — the in-chat SSE approval card (chat.ts pre:tool hook -> 'approval_required' -> useChat.ts:248-252 pendingApproval) used for agent tools like install_capability, and the Phase-3C/4B ui/approval-modal.tsx used by builders/Connector Hub/MCP Hub/Marketplace. Which one is canonical for agent skill writes must be decided.
3. 'One API' conflicts with the agent runtime: create_skill/delete_skill write ~/.waggle/skills directly via fs in packages/agent/src/skill-tools.ts (never through POST/DELETE /api/skills). Routing the agent tool through the HTTP API is an architecture change, not a wiring fix.
4. Two human create endpoints exist with inconsistent audit: POST /api/skills (raw, UNaudited, skills.ts:394) vs POST /api/skills/create (Skill Creator, audited 'local-created'/'user', skills.ts:422-486). PUT and DELETE /api/skills/:name are also unaudited. The launch cut must pick which endpoint survives as 'the one API' and whether update/delete enter the audit trail.
5. Read-only personas (planner/verifier) deliberately lose create_skill/delete_skill via READ_ONLY_WRITE_TOOLS (persona-tool-filter.ts:39-45) while keeping read_skill — if §2.3 mandates all three for 'the agent', the persona read-only policy needs explicit ratification as an exception.

---

## Section 7 — Backend keep-list health

> **Bottom line:** All 10 keep-list items exist and are healthy, and the prior plan's Phases 0-4 already built routes/UI on top of 8 of them; the real divergences are path drift (workspace-manager/workspace-state live elsewhere than the brief guesses), a dormant+duplicated memory-mcp package, and Memory Center existing as a tab inside legacy MemoryApp rather than a standalone surface.

Verdict per item: **all 10 exist**; none missing. Two are path-drifted vs the brief's guesses, two are materially diverged from the brief's mental model (memory-mcp dormant/duplicated; Memory Center is a tab, not an app).

| # | Brief item | Real path | LOC | Status |
|---|---|---|---|---|
| 1 | workspace-state.ts | `packages/server/src/local/workspace-state.ts` | 385 | EXISTS, heavily consumed |
| 2 | workspace-context.ts | `packages/server/src/local/routes/workspace-context.ts` | 458 | EXISTS, healthy |
| 3 | workspace-manager.ts | `packages/hive-mind-core/src/workspace-manager.ts` | 368 | EXISTS — **moved** (2026-04-30 migration), re-exported via `@waggle/core` |
| 4 | mind/schema.ts | `packages/hive-mind-core/src/mind/schema.ts` | 270 | EXISTS (moved per migration, as brief notes) |
| 5 | install-audit.ts | `packages/core/src/install-audit.ts` | 164 | EXISTS at brief's path |
| 6 | memory-mcp/* | `packages/memory-mcp/` (12 src files) | ~2,332 | EXISTS but **dormant + duplicated** |
| 7 | WorkspaceBriefing.tsx | `apps/web/src/components/os/WorkspaceBriefing.tsx` | 283 | EXISTS — ChatApp-embedded only |
| 8 | OnboardingWizard.tsx | `apps/web/src/components/os/overlays/OnboardingWizard.tsx` | 396 | EXISTS — **already reworked** (Phase 2D.2) |
| 9 | MemoryApp.tsx | `apps/web/src/components/os/apps/MemoryApp.tsx` | 347 (+`memory/` tabs) | EXISTS — still the registered Memory app |
| 10 | types.ts | `packages/shared/src/types.ts` | 634 | EXISTS — §15.2 vocab landed (Phase 0) |

### Per-item evidence

**1. workspace-state.ts** — Structured "what's going on now" reconstruction from memory frames + session files + awareness (`buildWorkspaceState()` at `:234`; freshness model in header comment `:1-11`). Prior-plan build-on-top is extensive: Phase 1 route `GET /api/workspaces/:id/state` (`packages/server/src/local/routes/workspaces.ts:641-657`, comment literally says "UX-Refactor Phase 1 (S01/S02)"); Home briefing fan-out (`routes/home.ts:29,96,243`); chat system-prompt injection via `formatWorkspaceStatePrompt` (`routes/chat.ts:12`); referenced by `routes/command.ts:188` and `routes/memory.ts:637`.

**2. workspace-context.ts** — `WorkspaceNowBlock` + `buildWorkspaceNowBlock()` (`:191`) + `formatWorkspaceNowPrompt()` (`:408`); now a thin projection over workspace-state (`:215` calls `buildWorkspaceState`). Powers `GET /api/workspaces/:id/context` (`routes/workspaces.ts:358`) — the endpoint `WorkspaceBriefing.tsx` fetches — plus consumers in `chat.ts:270,643`, `command.ts:252`, `commands.ts:64`, `home.ts:34`.

**3. workspace-manager.ts** — NOT in `packages/core` (brief's likely guess): lives in `packages/hive-mind-core/src/workspace-manager.ts`, re-exported through `@waggle/core` (`packages/core/src/index.ts:15-81`). Role: `WorkspaceConfig` CRUD + per-workspace mind-path resolution; instantiated at sidecar boot (`packages/server/src/local/index.ts:320`). Note: config interface already includes "Team Mode fields (Phase 5)" (`workspace-manager.ts:30`) — RBAC-adjacent schema exists despite the launch cut deferring Team UI.

**4. mind/schema.ts** — `SCHEMA_SQL` for the substrate (identity/awareness/frames + `metadata TEXT DEFAULT '{}'` columns at `:29,65,118` — the Phase 2B.1 metadata column), and the `install_audit` table (`:124`). The Phase 4A "M2 critical-audit" migration machinery lives in `packages/hive-mind-core/src/mind/db.ts:95,147` (`install_audit__mig_old` rename dance; commit `e601665`).

**5. install-audit.ts** — `InstallAuditStore` over MindDB (imports `MindDB` from `@waggle/hive-mind-core`, `:11`); actions incl. `blocked`, approval classes incl. `critical` (`:15-22`). Phase 4 built on top: connector/MCP installs now write audit entries (`routes/connectors.ts:144`, `routes/mcps.ts:97`), shared read feed `GET /api/extend/audit` (C18, `routes/extend.ts:10,87`), store booted at `local/index.ts:330`.

**6. memory-mcp/*** — Standalone publishable MCP server (`waggle-memory-mcp` bin, MIT, `package.json:2-8`), 12 source files (index + core/setup + resources/memory + 9 tool modules), substrate via `@waggle/core` (`src/core/setup.ts:33`). **Zero in-repo consumers** (no refs in server/launcher/apps-web), no tests dir, last commit `803c6f6` (pre-refactor dedup fix). A parallel twin exists: `packages/hive-mind-mcp-server` (bin `hive-mind-memory-mcp`). No prior-plan phase touched it.

**7. WorkspaceBriefing.tsx** — Header: "home screen shown in ChatApp when no messages exist… fetches GET /api/workspaces/:id/context" (`:1-5`). Only consumer is `apps/web/src/components/os/apps/ChatApp.tsx`. The Phase-1 Home Cockpit (S01) is a **separate** surface on `/api/home/*` — the briefing was kept as the per-workspace chat empty state, not absorbed into Home.

**8. OnboardingWizard.tsx** — Already rebuilt by Phase 2D.2 (commit `195ad17`): 5-step `STEP_NAMES = ['first-launch','who-are-you','memory-import','workspace-create','ready']` with index-derived navigation (`:33-38`) and per-step telemetry (`:115`). Materially diverged from the "7-step wizard with hardcoded TEMPLATES" the brief (and root CLAUDE.md §6) still describe.

**9. MemoryApp.tsx** — Still the registered Memory surface (`os/Desktop.tsx:30,414`). Phase 2's Memory Center (S04) landed as a tab **inside** it (`apps/memory/MemoryCenterTab.tsx`) plus a dedicated route plugin `routes/memory-center.ts` (441 LOC; 7 routes: GET/POST `/api/memory`, GET/PATCH/DELETE `/api/memory/:id`, POST `/api/memory/:id/archive`, POST `/api/memory/merge`) sharing the XSS sanitizer exported from `routes/memory.ts:20`. There is **no standalone MemoryCenterApp** component. Sibling `ArtifactCenterApp.tsx` (Phase 2C) IS standalone — inconsistent shapes between the two Center surfaces.

**10. types.ts (shared)** — Phase 0 IA freeze landed here: "UX-Refactor vocabulary (PRD §15.2)" block at `:344+` — `WorkspaceType`, `Scope`, `Confidence`, `MemoryKind`, `ArtifactKind`, `AgentType`, `AutonomyLevel`, `AGENT_RUN_STATES` const tuple (§14.5), `EXTENSION_TYPES` (B7-ratified). Declared single source of truth for sidecar routes and apps/web; `schemas.ts` derives zod enums from the tuples.

### Flags
- **Moved vs brief:** workspace-manager.ts (hive-mind-core, not core); workspace-state.ts / workspace-context.ts (server/local layer, not core).
- **Diverged vs brief:** memory-mcp (dormant, duplicated by hive-mind-mcp-server); OnboardingWizard (already 5-step, not the legacy 7-step the docs describe); Memory Center (tab-in-MemoryApp, not first-class app).
- **Healthy + already load-bearing:** workspace-state, workspace-context, mind/schema, install-audit, shared types — all have Phase 1-4 routes/UI built on top and are safe keep-and-expose anchors.

### Conflicts flagged for human decision
1. Memory Center shape: prior plan shipped it as a TAB inside legacy MemoryApp.tsx (memory/MemoryCenterTab.tsx) with its own 7-route plugin reusing /api/memory paths (memory-center.ts) — the new brief treats Memory Center as a first-class spine surface; decide promote-to-standalone-app vs keep-as-tab before building S04 again.
2. WorkspaceBriefing.tsx survives only as ChatApp's empty-chat state (fetches /api/workspaces/:id/context); the Home Cockpit shipped in Phase 1 uses separate /api/home/* routes. If the brief's keep-list assumes the briefing powers Home, that is wrong today — decide merge-into-Home vs keep both surfaces.
3. OnboardingWizard.tsx was already rebuilt by the prior plan (Phase 2D.2, commit 195ad17) into a 5-step STEP_NAMES chain ['first-launch','who-are-you','memory-import','workspace-create','ready']. Any new-brief onboarding spec (S12-S17) must reconcile against this shipped rework, not the old 7-step wizard the brief/CLAUDE.md describe.
4. packages/memory-mcp (waggle-memory-mcp) is dormant — zero in-repo consumers, no tests, last touched pre-refactor — and is functionally duplicated by packages/hive-mind-mcp-server (OSS twin, bin hive-mind-memory-mcp). Brief says keep memory-mcp/*; decide which of the two MCP-server packages is canonical.
5. workspace-manager.ts WorkspaceConfig already carries 'Team Mode fields (Phase 5)' (workspace-manager.ts:30) while the launch cut defers all Team/RBAC UI — schema fields ship dark; confirm that is acceptable rather than stripping them.
6. Brief path corrections needed: workspace-manager.ts lives in packages/hive-mind-core/src (re-exported via @waggle/core), not packages/core; workspace-state.ts and workspace-context.ts live in packages/server/src/local{,/routes}, not in core.

---

## Section 8-A — Prior-Plan Reconciliation (input to the gap report)

> **Bottom line:** The prior plan (docs/ux-refactor/, 6 deltas + 22 gap cards + Phase 0-6 master plan) is not stale paper — Phases 0-4 are fully shipped on main @ 9dfcc75 under founder-ratified gates, using a dock+windowed-AppId shell with NO react-router and "Win+K" naming that both come from the in-repo PRD itself; the new brief's AppShell+routes / Ctrl+K spine therefore conflicts with ratified-and-built reality, not just with a plan.

The prior plan lives at `docs/ux-refactor/` (README, `IMPLEMENTATION-PLAN.md` Phase 0–6, `deltas/*` incl. `open-questions.md`, `gap-cards/S00–S21`, `_inventory/*`). It interprets the SAME package the new brief amends (`docs/Waggle_OS_UX_Refactor_Master_Handoff_Package/Waggle_OS_UX_Refactor_PRD.md`). There is no `docs/UX_REFACTOR_*` file at docs/ root.

### (a) What the prior plan RATIFIED (founder gates, `deltas/open-questions.md`)
- **Spine gate, 2026-06-09 (lines 17–27):** B1 shell topology = **in-place dock reframe, keep windowed `AppId` nav, NO react-router**, dock grouped into IA zones; A1 fixed Workspace-Desktop layout; A2 Home personal-only; B4 **alias, don't rename** `/api/*` PRD vocabulary; B8 onboarding writes profile AND seeds identity.
- **Phase-2 gate, 2026-06-09 S2 (lines 29–53):** A6 `artifacts.json` index; A8 soft-status in `metadata` + hard delete w/ confirm; B2 heuristic confidence; B6 PRD §15.2 `MemoryKind` canonical; A3 graph tab ships v1; C33 resolved middle-path (commit-as-`unreviewed`, non-blocking review).
- **Phase-3 gate, 2026-06-10 (lines 55–75):** B3 Agent entity in `{dataDir}/agents.json` ref `personaId`; C24 schedule-only triggers; C26 net-new no-persist `POST /api/automations/test`; + C13/C14/C22/C23/C25/C27/C36/C37 defaults.
- **Phase-4 gate, 2026-06-10 (lines 77–102, commit `490b1a3`):** A4 real-where-substrate-exists; A5 federate-at-read marketplace; B5 gates via `tiers.ts`, MCP/Marketplace install PRO+; B7 `ExtensionType` = `skill|agent|connector|mcp|model|template`; C15/M2 install-audit `critical` CHECK migration; C16–C21; mcpRuntime boot-population as explicit work item.
- **A7 (RBAC) was DEFERRED by the founder 2026-06-10** — left unratified BY CHOICE (line 106: "Remaining pending: A7 … + Phase-5/6 screen-local items"). Per memory `project_rbac_phase5_deferred.md`: do not re-present it as a gate. This already matches the new brief's Team/RBAC launch-cut deferral.

### (b) What it declared SHIPPED per phase (all merged to main @ `9dfcc75`)
- **Phase 0** (PR #9): `0dfe119` shared §15.2 vocabulary + WorkspaceConfig V2; `5898c6c` `--sem-*` token aliases; `4b8e634` FE type consolidation (drop `AppView`); `0e581ea` dock IA zones + Home launch-flip (`Desktop.tsx:192-202` opens `'home'` when no windows).
- **Phase 1** (PR #9): `02124a4` backend (`routes/home.ts`, `routes/command.ts`, workspace state/activity, quick-capture); `22a84aa` FE (`HomeCockpit.tsx`, WorkspaceDesktop as maximized window, `overlays/CommandCenter.tsx`); `e509813` review pass; `12d4c6d` HomeCockpit cold-load crash fix.
- **Phase 2** (PR #9, merged `88d3a0b`): 2A `1bc78d7` type contract + `lib/harvest-kind-map.ts`; 2B `d8b3d3c` **M1 `memory_frames.metadata` migration**, `3b92e5a` 7 memory-center routes (`routes/memory-center.ts`), `8663ef6` harvest classification (C33/B2/B6), `8112002` MemoryCenterTab, `321153c` XSS review pass; 2C `2d96392`/`98787d4`/`f1d0550` Artifact Center (`routes/artifacts.ts` + `artifact-index.ts` + `ArtifactCenterApp.tsx`); 2D `68018fd`/`195ad17` onboarding rework S12–S17.
- **Phase 3** (PR #10 merged `bc51da4`; smoke fixes PR #11 `2450899`): `0a62c39`/`77f03a7` agents.json store + 7 routes + `routes/automations.ts` alias + C26 test route; `2a9e1cc` S09/S06/S11 screens; `f7ba8ce` S18/S19/S20 builders + BuilderStepper + fail-closed ApprovalModal.
- **Phase 4** (PR #12 merged `9dfcc75`): `e601665` 4A backend — **M2 critical-audit migration**, mcpRuntime boot, connector sync/revoke, `routes/mcps.ts` + `routes/extend.ts`; `6a0b478` 4B screens — Connector Hub, `MCPHubApp.tsx` (new `mcp-hub` AppId, `dock-tiers.ts:18`), Marketplace consolidation; `afd1de9` MCP test-budget fix.
- **Phase 5 (Team/RBAC): DEFERRED** by founder. **Phase 6 (Hardening): NOT started** — DoD 8/11 per handoff 0610_s2.
- Route reality exceeds the plan's "5 new route files": `home/command/artifacts/artifact-index/agents/automations/mcps/extend/memory-center/harvest-classify/skills-aliases.ts` all exist and register in `packages/server/src/local/index.ts:68-127`.

### (c) Naming conventions the prior plan used (and the repo now embeds)
- **Screen numbers S00–S21** (`gap-cards/`), referenced in shipped code comments (e.g. `dock-tiers.ts:14-18`, `MemoryCenterTab.tsx:16`).
- **"Win+K"** is the PRD's OWN term (PRD lines 19, 74, 449, 461 "Opens from anywhere with Win+K or Cmd+K") and pervades the plan (~70 hits in `docs/ux-refactor/`). The **actual binding is Ctrl+K** (`useKeyboardShortcuts.ts:32,92-93`); UI is mixed: `StatusBar.tsx:136` says "Search (Ctrl+K)", `SettingsApp.tsx:259` says Ctrl+K, but `HomeCockpit.tsx:145` renders a **"Win+K"** label; comments at `Desktop.tsx:570`, `adapter.ts:1923`, `CommandCenter.tsx:239`, `dock-tiers.ts:48` say Win+K.
- **5 IA dock zones**: Work (flat spine) / Intelligence / Extend / Team / System (`dock-tiers.ts:50-103`; B1 ratification text says 4 zones, the implementation + plan Phase-0 text say 5 incl. System).
- **Route vocabulary (B4 alias-don't-rename)**: `/api/home/briefing|overnight`, `/api/command/search|recent|suggestions|execute` (alias over plural `/api/commands/execute`), `/api/memory*`, `/api/artifacts*` (+`search-related`), `/api/agents*`, `/api/automations*` (alias over `/api/cron/*`), `/api/mcps*`, `/api/extend/audit?type=`, `/api/quick-capture`, `/api/workspaces/:id/state|activity`.
- **AppIds**: `workspace-desktop` + `mcp-hub` added; legacy ids kept (`capabilities`=Skills Hub, `scheduled-jobs`=Automation Center — title aligned `fcdc127`; `connectors`=Connector Hub). **Name collision**: AppId `cockpit` is labeled "Command Center" in the System zone (`dock-tiers.ts:96`) while the Ctrl+K palette component is also `CommandCenter`.

### (d) Open questions / PM residuals left by the prior plan
- **A7 RBAC** — deferred by founder; do not re-raise (`open-questions.md:106` + memory note).
- **PRO-gate `POST /api/skills/create`?** — left ungated; tension with FREE="built-in skills only" (handoff 0610_s1:103; gap card S06:34 requires a 403→upgrade state).
- **S19 Q3** — approval gate on authoring elevated skills (create-time vs first-run): unratified, no authoring gate fires (`gap-cards/S19-skill-builder.md:227-235`).
- **S20 Q6** — which jobTypes count "risky" for ApprovalModal: currently `agent_task` only (`gap-cards/S20-automation-builder.md` §9 Q6).
- **assessTrust route** — `TrustAssessment`/`formatTrustSummary` (`packages/agent/src/trust-model.ts`, cited `deltas/rbac-security-delta.md:183`) not rendered in install modals; needs a server route exposing `assessTrust` (handoff 0610_s2:75).
- **Phase-4 v1 caveats** scheduled for P6: connector `/sync` is a health-probe stub (C16), MCP logs deferred (C2), plus the whole P6 state-grid + approval/audit-taxonomy work (GAP-D3/D4).

### (e) Where the prior plan's architecture DIFFERS from the new brief's spine
| Axis | Prior plan (ratified + SHIPPED) | New brief spine | Repo reality |
|---|---|---|---|
| Shell | B1: dock reframe, windowed `AppId` nav, **no react-router**; planned `AppShell.tsx` **never built** | **AppShell** + routes | Zero `AppShell` matches in `apps/web/src`; `Desktop.tsx` + `Dock.tsx` zone-parents are the shell |
| Palette name/key | "Win+K Command Center" (PRD's own term) | **Ctrl+K, never Win+K** | Binding already Ctrl+K; "Win+K" survives in 1 UI label + comments + all docs |
| Memory Center | One tab inside 7-tab `MemoryApp`; **personal-mind flat filtered list** (kind/status/confidence/needs-review), graph-only scope switch | (brief's structure — if two-mind Personal/Workspace split) | `MemoryApp.tsx:46-55`, `MemoryCenterTab.tsx:19` — no top-level two-mind split exists |
| Team/RBAC | Phase 5 deferred (founder) | Launch cut defers all Team/RBAC UI — **aligned** | TEAMS-gated Team zone + Approvals still in dock (`dock-tiers.ts:68,83-88`) |
| Phase order | PRD §8: Intelligence (P3) before Extend (P4) — both shipped | moot | P0–P4 all on main |

### Conflicts flagged for human decision
1. Shell topology: founder-ratified B1 (2026-06-09) locked 'in-place dock reframe, keep windowed AppId nav, NO react-router' and the planned components/os/AppShell.tsx was never built (zero grep hits in apps/web/src) — the new brief's 'AppShell + routes' spine reverses a founder ratification and contradicts what shipped in Phases 0-4. Human must decide: re-ratify B1 or rebuild the shell.
2. 'Win+K' vs 'Ctrl+K': the in-repo PRD itself uses 'Win+K' ~22 times (Waggle_OS_UX_Refactor_PRD.md:19,461,...) and docs/ux-refactor/ uses it ~70 times; the actual binding is already Ctrl+K (useKeyboardShortcuts.ts:92-93) but at least one user-visible label renders 'Win+K' (HomeCockpit.tsx:145) plus code comments (Desktop.tsx:570, adapter.ts:1923, dock-tiers.ts:48). Brief says NEVER 'Win+K' — requires a naming sweep AND amending the in-repo PRD copy the prior plan treats as source of truth.
3. 'Command Center' name collision: the dock's System zone ships AppId 'cockpit' labeled 'Command Center' (dock-tiers.ts:96, CockpitApp.tsx) while the Ctrl+K palette is also named CommandCenter (overlays/CommandCenter.tsx). If the brief reserves 'Command Center' for the palette, the cockpit app needs a rename decision.
4. Memory Center top-level structure: shipped (PR #9, reviewed + live-smoked) as a 7-tab MemoryApp (Memories/Timeline/Graph/Harvest/Weaver/Wiki/Evolution, MemoryApp.tsx:46-55) whose Memory Center tab is a personal-mind-only flat filtered list (MemoryCenterTab.tsx:19 'Personal mind by default'); only the Graph tab has a 'current|personal|all' scope switch (MemoryApp.tsx:72-73). If the new brief's spine requires a top-level two-mind (Personal vs Workspace) split, that is a rework of a just-shipped surface — needs explicit go/no-go.
5. Team/RBAC deferral scope: Phase 5 was deferred by the founder (A7 unratified BY CHOICE — do not re-raise), which ALIGNS with the brief's launch cut; but the repo still ships a TEAMS-gated Team dock zone with Team Governance (dock-tiers.ts:83-88) and a TEAMS-gated Approvals entry (dock-tiers.ts:68). Does 'defer all Team/RBAC UI' mean leaving these tier-hidden surfaces in place, or removing them from the launch build?
6. Launch-cut vs Phase 6: prior plan's only remaining buildable phase is P6 Hardening (DoD 8/11; DoD #9 approval/audit consolidation and #10 per-screen state grid are P6-owned, IMPLEMENTATION-PLAN.md:360-389). The brief must state which P6 items are launch-blocking vs post-launch — otherwise the launch cut ships with the two weakest-traced DoD items open.

---

## Section 8-B — Gap Report: repo reality vs Brief v2.1

> **Bottom line:** the brief's *features* are ~85% shipped; the brief's *spine* (AppShell + routes), *trust mechanics* (global auth gate, skill-write governance), and *Memory Center structure* (two-mind split) are not. Five decisions (D1–D5) block Phase 0; the rest can be ratified by default.

### 8.1 Phase-by-phase reconciliation (new brief's phases)

| Brief phase | Status | Evidence | First unmet criterion |
|---|---|---|---|
| **0 — Freeze the spine** | **CONFLICT** | Route groups `/home, /workspaces, …` don't exist — zero URL-addressable screens (§2); founder-ratified B1 locked "no react-router" | Shell decision **D1** must be ratified before any spine freeze |
| **1 — AppShell + Command Center** | **PARTIAL** | Command provider + search aggregator EXIST (`CommandCenter.tsx` + `/api/command/*`, 6 verb groups); global store is a 47-line ServiceProvider context; auth-ready gate is per-component (7/~55), not global (§4) | "No fetch fires pre-auth" — structurally unenforced (**D3**) |
| **2 — Home Cockpit + Workspace Desktop** | **SUBSTANTIALLY DONE** | `HomeCockpit.tsx` + `WorkspaceDesktopApp.tsx` on `/api/home/*` + `/api/workspaces/:id/state\|activity\|context` (§3, §7) | Memory-highlights mind-labels not verified; "Win+K" pill on Home header (§2c) |
| **3 — Memory Center + Artifact Center** | **PARTIAL** | Artifact Center standalone w/ relations + `search-related` ✓; Memory Center is a flat personal-mind tab inside 7-tab `MemoryApp` — **no two-mind split** (§7.9) | §4 two-mind primary structure (**D2**) |
| **4 — Extend layer** | **SUBSTANTIALLY DONE** | All 4 hubs exist on install-audit (§3); `UpgradeModal` mapped + regression-pinned (§5e); tier gate live-verified PRO→200, FREE→403 pinned by tests (§5d) | dataDir not logged at startup; "Upgrade Card" naming (**D7**, **D11**) |
| **5 — Builders** | **PARTIAL** | All 4 builders + BuilderStepper + fail-closed ApprovalModal exist (§3) | §2.3 agent skill-path governance: tools exist but ungated, unaudited, fs-direct, no provenance (**D4**) |
| **7 — Polish + dogfood** | **NOT STARTED** | = prior plan Phase 6 Hardening (DoD 8/11); per-screen state grid + approval/audit taxonomy are P6-owned | Scope decision **D15** |

### 8.2 Acceptance criteria scorecard (brief §6)

| # | Criterion | Verdict | Gap |
|---|---|---|---|
| 1 | No pre-auth fetch; errors never render valid-empty; Marketplace populates on first load + tab switches | **PARTIAL-FAIL** | Gate is opt-in convention; `getMarketplace`/`getMcps`/`getPersonas`/`getModels`/`getWorkspaceTemplates`/`getTier` parse 401 as valid-empty; no focus revalidation; no 401→refresh→retry (§4) |
| 2 | 403 TIER_INSUFFICIENT → Upgrade Card, end-to-end at FREE+PRO, single-sourced startup-logged dataDir | **PARTIAL** | UpgradeModal ✓ mapped + pinned; FREE→403 pinned by tests, PRO→200 live-verified; dataDir **not logged**, `WAGGLE_DATA_DIR` split-brain (§5a/d) |
| 3 | Agent proposes + (with approval) creates skill; Skills Hub provenance badge; install-audit entry | **FAIL** | Tools live but: no approval at any autonomy level, zero audit writes, fs-direct bypassing `POST /api/skills`, no provenance on read path (§6) |
| 4 | Memory Center primary structure = Personal/Workspace mind split; every item shows mind/source/confidence/actions | **FAIL** | Flat personal-mind filtered list; confidence (B2) + metadata exist; mind split absent (§7.9) |
| 5 | No window z-order management in shipped shell | **FAIL** (per brief's letter) | `useWindowManager.ts` z-order/focus/minimize IS the shell — founder-ratified B1 (§2a). Governed by **D1** |
| 6 | "Win+K" appears nowhere in code/routes/copy | **FAIL** (small) | 1 user-visible label (`HomeCockpit.tsx:145`) + 6 code comments + ~109 doc hits incl. the brief's own package (§2c) |
| 7 | Team/RBAC fields in schemas, no team UI ships | **PASS*** | Fields ship dark ✓ (`workspace-manager.ts:30`); legacy `TeamGovernanceApp` + Approvals remain tier-hidden in dock — strip-vs-hide is **D5** |

### 8.3 Decision register (human ratification required)

**Block Phase 0 — structural:**

- **D1 · Shell topology (the headline conflict).** Brief: AppShell + routes, window manager retired (§2.4). Repo: founder-ratified B1 shipped P0–P4 into the windowed dock shell; zero AppShell, 2 router routes. Options: **(a)** re-ratify B1 — dock zones *are* the nav, accept that §2.4's "structurally impossible" claim is unmet and §6.5 fails by letter; **(b)** adopt the brief — convert shell to AppShell + left nav + single canvas + URL routes, *reusing* the shipped screen components as route surfaces (they are window-content components; the rework is shell + navigation plumbing, not screens); **(c)** hybrid — single-canvas route-driven surfaces with windowing reserved for chat only. *Recommendation: (b) — it is the brief's mission statement; the screens survive; estimate is shell-plumbing-sized, not rebuild-sized. But this reverses B1 and must be ratified explicitly.*
- **D2 · Memory Center two-mind rework (§4).** Just-shipped, reviewed, live-smoked flat tab would be restructured into "About you / About this work" + promoted to a standalone surface (sibling `ArtifactCenterApp` shape). *Recommendation: do it — §4 is a non-negotiable product rule in the brief; reuse `MemoryCenterTab` internals as the per-mind list.*
- **D3 · §2.1 gate: structural vs convention.** Brief demands global. Scope to confirm: adapter-level pre-token deferral, throw-on-`!ok` across all ~6 silent-empty getters, error-state caching + focus revalidation, 401→silent-refresh→single-retry, and whether boot-path surfaces (`Desktop.refreshTier` silent-FREE, `LoginBriefing` silent-empty) are in scope. *Recommendation: all of it — this is the brief's bug-derived core; it is adapter-layer work, not per-screen.*
- **D4 · §2.3 governance vs the self-evolving loop.** Brief: gate `create_skill`/`delete_skill` behind the same approval surface as high-risk installs. Repo: deliberately ungated (54b1ac1) so the post-task skill-distillation loop closes without friction. A blanket gate puts a human prompt inside the autonomous loop. Sub-decisions: (i) gating policy — always / autonomy-aware (normal=ask, trusted+yolo=auto+audit) / audit-only; (ii) canonical approval surface — in-chat SSE approval card (where agent tools already gate) vs `ui/approval-modal.tsx` (builders/hubs); (iii) one-API — route agent tool through `POST /api/skills` vs keep fs-direct + shared audit; (iv) consolidate the two human create endpoints + audit PUT/DELETE. *Recommendation: autonomy-aware gating via the in-chat approval card (it IS the agent's approval surface; §2.3's "same modal" reads as same-policy, not same-component), always-audit with `initiator:'agent'`, provenance via skill frontmatter + badge.*
- **D5 · Team-zone deferral semantics.** Legacy `TeamGovernanceApp` + Approvals dock entries are TEAMS-tier-hidden, not removed. *Recommendation: keep tier-hidden — FREE/PRO users never see them, stripping risks Phase 6 re-work; note Approvals inbox is broader than team and may deserve PRO visibility.*

**Ratify-by-default — scope clarifications:**

- **D6 · Onboarding S14/S16 relocations.** Tool Discovery lives in LauncherApp, Memory Review in Memory Center "Needs review" (ratified 2D.2 rework, 5-step wizard). *Recommendation: accept as satisfying the launch cut.*
- **D7 · "Upgrade Card" vs UpgradeModal.** Functionally equivalent, designed, pinned. *Recommendation: accept the modal; optional rename.*
- **D8 · "Command Center" name collision.** Dock System-zone entry `cockpit` is labeled "Command Center" while the Ctrl+K palette component is `CommandCenter`. *Recommendation: relabel the dock entry (e.g. "Mission Control").*
- **D9 · Win+K sweep scope.** Code: 1 UI label + 6 comments — sweep now (trivial). Docs: ~109 hits incl. the in-repo PRD and the brief's own package. *Recommendation: sweep code + `docs/ux-refactor/` prose; annotate (don't regenerate) the handoff-package PDFs.*
- **D10 · Doc authority + housekeeping.** The new brief package is untracked (multi-MB binaries); `docs/ux-refactor/` (prior plan) is committed and marks phases complete; stale fully-merged worktrees (`waggle-os-ux-refactor`, `waggle-os-ga`) + 5 merged branches remain. *Recommendation: commit the package's text files (PRD/handoff/extracted txt), gitignore or LFS the binaries, declare this audit + ratified brief the authority, prune merged worktrees/branches.*

**Launch integrity — engineering fixes (confirm, low controversy):**

- **D11 · dataDir contract (§2.5).** Log resolved dataDir + tier at startup (one line); decide `WAGGLE_DATA_DIR`: dead on the server boot path but honored by marketplace installer / launcher CLI → split-brain risk. *Recommendation: honor it in `service.ts` with the same default, log it, making resolution single-sourced.*
- **D12 · Stale tracked sidecar bundle.** `app/src-tauri/resources/service.js` (6.5 MB, committed 2026-04-30) predates the entire refactor — a desktop build today ships a pre-refactor server. *Recommendation: refresh the bundle + add a CI staleness gate (or build-time generation); launch-blocking for the binary.*
- **D13 · Clean-checkout boot.** `npx tsx --env-file=.env packages/server/src/local/start.ts` crashes on stale `shared/dist` until `npm run build:packages`. *Recommendation: document in the recipe and/or alias `@waggle/shared`→src on the dev path.*
- **D14 · Skills API consolidation.** Two human create endpoints (raw `POST /api/skills` unaudited vs `POST /api/skills/create` audited); PUT/DELETE unaudited; PM residual "PRO-gate skills/create?" still open. *Recommendation: fold into the D4 one-API work.*
- **D15 · Phase 7 scope.** Which prior-plan P6 items are launch-blocking: per-screen state grid (brief rule 10), approval/audit taxonomy (GAP-D3/D4), connector `/sync` health-probe stub, MCP logs. *Recommendation: state grid + approval/audit taxonomy are launch-blocking (brief rules 7+10); the rest post-launch.*

### 8.4 What actually gets built once ratified

Assuming recommendations: **(P0)** spine freeze = D1 shell conversion plan + route map + Win+K/naming sweep + doc authority; **(P1)** adapter-level auth-ready gate + 401 hygiene + focus revalidation (D3); **(P2)** verify Home/Desktop against brief acceptance (mind-labels, "Win+K" pill); **(P3)** Memory Center two-mind rework (D2); **(P4)** dataDir logging + single-sourcing, bundle refresh, FREE→Upgrade-Card e2e re-run (D11/D12); **(P5)** §2.3 governance retrofit (D4/D14); **(P7)** state matrix + a11y + dogfood (D15). Nothing from prior Phases 0–4 is rebuilt.

