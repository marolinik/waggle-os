# UX Audit — Browser Walkthrough 2026-07-04 · Part 2 (remaining surfaces)

Method: same real browser session as part 1 (headless Chromium, 1440×900, dev build
sidecar :3333 + vite :8080), continuing after `ux-audit-2026-07-04.md` (F1–F12).
Surfaces: Settings (all tabs + light mode), Marketplace, workspace tabs
(Files/Team/Memory/Artifacts), workspace switcher + grid, notifications, Memory
Center sub-tabs, New Agent flow, 900×700 resize. Screenshots `ux2-01`..`ux2-28`
in session scratchpad. Findings numbered F13+ to continue part 1.

Environment notes (not product findings):
- The tree carries heavy test-data pollution (≈50 `ai-os-audit-*` workspaces,
  BENCHMARK memories). The *data* is dev noise, but every failure to cope with
  it (sorting, dedup, counts, truncation) is real product signal — flagged as such.
- One transient blank-page/Vite 500 (`@/lib/coach-marks-gate` unresolved) occurred
  while wave-1 fixes were being edited live in the same tree; recovered on reload.
- Verified in-session: the trial-expired modal did NOT re-fire across ~10
  navigations — the F1 fix works. Escape-to-close works on Switch Workspace and
  New Agent modals (good), but not on the briefing modal (F27).

## The story of part 2: the app contradicts itself

The deep surfaces are feature-rich and often well-designed in isolation, but they
disagree with each other about basic facts: which workspace you're in (F13), how
many workspaces exist (F14), which model you're on (F15), and whether your memory
graph has 9,420 relations or none at all (F16). Apple-benchmark polish is mostly
a consistency problem here, not a component-quality problem.

## Findings

| # | Sev | Finding | Evidence |
|---|-----|---------|----------|
| F13 | P1 | Workspace context is unstable: merely visiting `/` (Home) or `/workspaces` silently switches the active workspace — sidebar switcher + breadcrumb flip to `ai-os-audit-daniel-finance-…` while the Home "START HERE" card simultaneously says Research Hub is your most recent workspace. Context must never change without user action | ux2-12, ux2-22 |
| F14 | P1 | Workspace count/name chaos: Home says "**4** workspaces waiting for you", switcher lists ~14, grid says "All **55**", a notification says "across **54** workspaces". Three workspaces are all named "Research Hub" with no disambiguation; switcher has no current-workspace indicator, no search, and truncates long names at the exact point they become identical | ux2-20, ux2-21, ux2-12 |
| F15 | P1 | No single truth for "what model am I on": top-bar chip says `claude-sonnet-4-6`, Settings Model Pilot says Claude Opus 4.6 (and Fallback = Primary = Opus 4.6, a pointless failover default), New Agent modal offers only raw `ollama/minimax-m2.7:cloud`-style IDs with one preselected | ux2-01, ux2-28 |
| F16 | P1 | Memory numbers contradict across adjacent tabs: Timeline header "617 entities · 9420 relations" while Graph tab says "No knowledge graph data"; top-bar brain count 543 vs Trust page "452 memories in this hive"; Trust page headline sells trust directly above a "**0** high confidence & fresh" chip while individual rows are labeled "fresh" | ux2-25-Timeline, ux2-25-Graph, ux2-24 |
| F17 | P2 | "Erase All Data" (red, one click to schedule a full wipe) sits on the DEFAULT Essential→General settings tab as the 4th item a new user sees, directly under the theme picker. Belongs in Advanced behind a danger-zone pattern | ux2-02 |
| F18 | P2 | Permissions "Never ask" (yolo: auto-pass everything) is selectable with zero friction — no confirmation, no red/danger styling when active; renders exactly like the safe options. (Verified: shipped default is `normal`; this is about the switch UX, not the default) | ux2-05 |
| F19 | P2 | Files vs Artifacts tabs are indistinguishable: both empty states say "files/documents created in this workspace appear here". Files empty state offers no upload/create action (dead end); Artifacts' "Browse … in Library" pointer is plain text, not a link | ux2-16, ux2-19 |
| F20 | P2 | Marketplace lists the same integration 3× from three catalogs — `airtable` (mcp · marketplace · "Not scanned"), `Airtable` (connector · local registry), `Airtable` (mcp · MCP catalog) — with three different verbs (Add / Connect / Enable), inconsistent casing, and no guidance which to choose. "Not scanned" warning chip has no explanation | ux2-27 |
| F21 | P2 | Workspaces grid: category filters Virtual/Local/Team all show 0 while All=55 (filters that can never match); every card's metadata row renders as "—" placeholders; disabled "Table — soon" roadmap chip leaks unfinished scope into the UI | ux2-21 |
| F22 | P2 | Memory dedup failures are user-visible: the same BENCHMARK memory appears 3× as separate cards in Memories tab; login briefing "I REMEMBER" shows the same Imran fact twice (differing only by audit-run id) | ux2-25-Memories, ux2-11 |
| F23 | P2 | Wiki tab auto-compiles 220 entity pages with no quality floor — junk entities ("Act Aug", "Act Art", "Acquired March", "Abu Dhabi Airport") become first-class pages, and every page claims identical "30 sources · compiled 10d ago" metadata, which reads as broken | ux2-26-Wiki |
| F24 | P2 | Weaver tab is 3 stats + a "Run Now" button with zero explanation of what the Weaver does or what running it will change; "LAST DECAY: Never" is unexplained internal jargon. Compare Evolution tab, which explains itself well | ux2-26-Weaver |
| F25 | P2 | Notifications: badge says 9+ but panel shows 4 items, all batch-stamped the same second; copy is system-jargon ("Capability suggestion completed — Scheduled task ran successfully" — which suggestion? where?); "Connect your external tools" advice has no CTA/link to Connectors; timestamps are machine-format with seconds ("4. 7. 2026. 10:20:53") | ux2-22 |
| F26 | P2 | Team tab: a single row "You — Online" with avatar initials "YO" (literal initials of the word "You"), no invite affordance, no Teams-tier explainer — a dead end that also misses the natural upgrade moment | ux2-17 |
| F27 | P2 | Login-briefing modal: cannot be dismissed with Escape (other modals can), close ✕ has no accessible name, "Start Working" CTA is shown while content is still loading, and its "Good afternoon, Marko" heading duplicates the identical greeting on the Home page visible behind it | ux2-10, ux2-11 |
| F28 | P3 | At 900×700 the top OS bar breaks: "Waggle AI" wraps to two lines, breadcrumb truncates to "Ch…", Trial-expired chip collides with search. Sidebar never collapses (250px of 900px). Content areas themselves reflow acceptably | ux2-14, ux2-15 |
| F29 | P3 | Locale fragments: Serbian dates inside an all-English UI ("СУБОТА, 4. ЈУЛ", "Last active: 28. 6. 2026.", "суб 4. јул" in top bar) — either localize the whole product or pin the date locale to the UI language | ux2-12, ux2-13 |
| F30 | P3 | Copy/data nits: "1 memories"; memory card whose title duplicates its body verbatim; "GDPR Art.17 — kept from re-import" jargon in Memory tab corner; Harvest interrupted-banner says "saved 1 of 1 items" yet offers Resume (nothing left to resume); Timeline "50 of 50 frames" cap unexplained | ux2-13, ux2-18, ux2-26-Harvest |
| F31 | P3 | Tier naming drift: General tab + profile chip say FREE, Plan page's current-plan card is named "Solo" | ux2-02, ux2-03 |
| F32 | P3 | Stale state on fresh navigation: `/memory` reopens a leftover memory-detail drawer over the page; top OS-bar breadcrumb stays "Chat" while on Files/Team/Artifacts tabs | ux2-23, ux2-16 |

## What's already good (don't regress)

- Settings "Show: Essential / Standard / Everything" progressive disclosure —
  genuinely Apple-like; plus the "Local-first" plain-language explainer.
- Plan page "What Waggle replaces" honest scorecard (✓/○/✗ with "only items that
  genuinely don't need another tool open are marked covered").
- Backup tab: export/import + AES-256-GCM encrypted backup, clear copy.
- Permissions copy quality ("Auto-pass writes/edits; still gate git push,
  install, cross-workspace") — precise and honest.
- Trust page concept and reassurance banner ("Nothing is remembered behind your
  back…"), pencil/trash per-memory affordances, "Why did you do that?" view.
- Harvest tab: interrupted-harvest Resume/Discard banner, "data stays on this
  device" trust strip, 16 platform chips + drop-zone, detected-tool re-harvest.
- Evolution tab empty state explains the propose→review→accept loop in 3 lines.
- New Agent modal: Existing/+New workspace toggle, collapsed persona override,
  two-step "Review & Launch", clean Cancel.
- Light theme holds up on Settings/Home/Chat — no broken contrast or unstyled
  tokens found (only pre-existing layout issues carry over).
- Switch Workspace modal: Escape works, "Ctrl+Tab to toggle" hint, one-line
  purpose copy ("One workspace per project or area — each remembers its own work").
- F1 fix verified live: trial modal stayed dismissed across ~10 navigations.

## Suggested wave assignment

- Wave 1 (trust-critical consistency): F13, F14, F15, F16, F27 (Escape/a11y part).
- Wave 2 (safety + IA): F17, F18, F19, F20, F21, F25, F26.
- Wave 3 (polish): F22, F23, F24, F28–F32.
