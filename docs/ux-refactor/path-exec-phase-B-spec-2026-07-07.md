# Path-to-9 execution · PHASE B — instant power feel (Pillar 2)
### Contract: docs/ux-refactor/path-to-9-2026-07-07.md v3 §Pillar 2 (5/5 panel-endorsed).
### Prereq: Phase A merged (motion tokens exist — use SPRING/DUR/STAGGER + --mo-* vars for
### ALL new motion; the text-color guard is live — new text uses tokens).

Recon facts (verified pre-spec): Home loads via `adapter.getHomeBriefing()` +
`getHomeOvernight()` in HomeCockpit L549-589, gated on `connecting` settle, NO
persistence. LoginBriefing has its own module-scope `fetchBriefingData` + prefetch
(Wave T) — a SECOND data source (the drift-bug class the contract kills). Chat send
already renders an optimistic turn (ChatApp L741 comment); briefing landing state
machine `nextBriefingLanding` lives in AppShell (Wave U); BootScreen has `ready` prop +
850ms floor (Wave U). Session caches exist for memory (memory-list-cache.ts) and the
workspace shelf (module-scope in AllWorkspacesApp).

Per-lane gate: related vitest green + eslint 0 errors + `node scripts/ux-gates/text-color-guard.mjs`
clean on touched files. NO benchmarks/**, NO packages/hive-mind-*/**. NO cross-lane files.

## Lane H — home cache-first paint + one briefing truth + double-catch-up collapse (Pillar 2.1–2.4)
Files: `apps/HomeCockpit.tsx`, `os/overlays/LoginBriefing.tsx`, `os/AppShell.tsx`,
`os/BootScreen.tsx`, NEW `lib/home-cache.ts`, NEW `lib/briefing-source.ts`, tests.
The heart of the pillar — one lane so the data-unification isn't split across owners.

1. **Disk-persisted cache-first paint** (`lib/home-cache.ts`): persist the last
   successful Home payload (briefing + overnight + the recall highlights) to
   localStorage (versioned key, schema-guarded parse, size-capped). On mount,
   HomeCockpit renders the cached payload IMMEDIATELY (before `connecting` settles,
   before the sidecar answers) marked stale-invisible (no visual difference), then
   refreshes silently. Day-0 (no cache) keeps today's skeleton path.
2. **Silent-refresh reconciliation CONTRACT** (v3 P2.3 — this is a TESTED contract):
   when fresh data lands over a cached paint — (a) NO above-the-fold layout shift:
   fixed-slot hero grammar (the Wave T card contract, applied to the hero) so text
   swaps in place; (b) material deltas (counts, new items) animate via a small
   honey delta pulse (use SPRING.micro/DUR.fast from Phase A — this is Pillar 3.3's
   pulse, born here); (c) unit-test: cached render → fresh data with changed counts →
   assert no element above the fold unmounts/remounts (key stability) and the
   changed count carries the pulse class.
3. **ONE briefing truth** (`lib/briefing-source.ts`): extract LoginBriefing's
   fetch+shape (fetchBriefingData/prefetch, highlights, workspace summaries,
   brag counts) into this module. BOTH the home hero and the modal consume IT —
   one fetch, one filter set, one count. Delete the second source. The
   number-drift bug class dies here (regression-test: hero count === modal count
   from the same mock).
4. **Double catch-up collapse** (v3 P2.4): the "I REMEMBER" recall cards render
   INSIDE the home hero as its first staggered entrance (STAGGER.brief from
   Phase A tokens); the modal fires ONLY on ≥7-day absences (N=7 per contract —
   compute from the same lastActive the greeting uses), reusing the SAME card
   component + briefing-source data. Update `nextBriefingLanding` gating in
   AppShell accordingly (armed additionally requires awayDays ≥ 7). Tests: <7d →
   no modal, cards in hero; ≥7d → modal (same data object as hero).
5. **Warm boot floor removal**: with cache-first paint, the BootScreen floor for
   warm sessions drops — boot shows only until the shell mounts (brand flash
   ≤500ms; keep the full choreography for COLD/day-0 sessions where there is
   nothing to paint). Keep Wave U's `ready` semantics for the cold path.

## Lane C — input-during-warmup + send-path budget + chat route-cache (Pillar 2.2, 2.5, 2.6-chat)
Files: `apps/ChatApp.tsx`, the chat state hook it uses (grep `useChat`/chat widget
state — verify real file), `os/WorkspaceDesktopApp.tsx` (entry interactivity only), tests.
1. **Composer accepts typing at paint**: the composer input must be enabled the
   moment it renders — never disabled behind `connecting`/history-load. If a send
   fires before the sidecar is ready: QUEUE it (one-deep queue is fine) with a
   truthful per-message "waiting for connection…" state on the optimistic turn,
   dispatch on ready, NEVER error or silently drop. Test: type+send while mocked
   adapter is pending → message queued → adapter resolves → dispatched.
2. **Composer never locks on send**: verify (and lock with a test) that after send
   the input clears and accepts the next message immediately while the previous
   streams — no disabled window. If a lock exists, remove it.
3. **No dead clicks on cached surfaces**: WorkspaceDesktopApp entry — clicking a
   tab/affordance during the entry skeleton either acts or shows a per-element
   pending affordance (aria-busy + subtle shimmer), never nothing. Audit the entry
   skeleton's click handling; fix silent swallows.
4. **Chat thread session cache**: mirror memory-list-cache — thread messages keyed
   by (workspace, session) survive tab-away/return within the session; returning
   renders instantly then refreshes silently. No re-skeleton on return.

## Lane K — keyboard-power layer (Pillar 2.7; double-yield with a11y)
Files: `os/WorkspaceActionsMenu.tsx` + `os/ContextMenu.tsx` (focus-reveal parity),
`apps/memory/MemoryTrustManage.tsx` (row-action focus parity ONLY — rest is Lane H/C
territory... verify no overlap; MemoryTrustManage is NOT touched by H/C in this phase),
`os/overlays/KeyboardShortcutsHelp.tsx`, `hooks/useKeyboardShortcuts.ts`, tests.
1. **Focus-reveal parity**: workspace-card kebab + memory-row actions (✓/✎/🗑)
   reveal on :focus-within with visible focus-ring (the Phase-A `--focus-ring`
   token), matching the chat action-row pattern (Wave T). Tab-through must reach
   every action without a mouse.
2. **Hit areas**: kebab, memory row actions, modal ×, "Fix it now" → ≥40px
   effective hit target (padding/pseudo-element expansion, no visual size change
   needed). List each touched target + before/after size in the report.
3. **≤2-keystroke paths**: global shortcuts — new chat (existing? verify in
   useKeyboardShortcuts; add if missing) and "open last workspace"; both reachable
   from anywhere, documented in KeyboardShortcutsHelp.
4. **Shortcut cheat sheet**: verify KeyboardShortcutsHelp opens on `?` (and Cmd-/);
   add the new shortcuts; ensure it lists the focus-reveal patterns ("Tab reaches
   card actions").

## Lane R — route-cache: marketplace + agents (Pillar 2.6)
Files: `apps/MarketplaceApp.tsx`, `apps/AgentsApp.tsx`, NEW `lib/surface-cache.ts`
(generalize the memory-list-cache pattern: keyed session cache + test reset), tests.
1. Extract the proven pattern into `lib/surface-cache.ts` (typed, keyed, module-
   scope, `resetForTests`). Do NOT migrate memory/workspaces onto it in this phase
   (churn without yield — note as follow-up).
2. Marketplace: extensions list + facet state seed from cache on return; silent
   refresh; no re-skeleton within a session.
3. Agents: roster + suggested cards seed from cache on return; same contract.

## Lane G2 — the hard interaction gate (v3 §3 verification)
NEW files: `scripts/ux-gates/warm-interaction-gate.mjs`, README update; root
package.json script `ux:warm-gate`. Playwright, mirrors capture-kit conventions
(seeded returning-user localStorage; disclose in output).
1. **Warm gate**: measure app-start → (a) home content visible, (b) composer
   accepts a keystroke (type into it, assert value). FAIL if content >1000ms or
   brand flash >500ms or first keystroke rejected. Print a timing table.
2. **Cold-start variant**: with the sidecar port BLOCKED (bad base URL env or
   route-abort), assert cached paint still renders content + typing queues (needs
   Lane H+C landed — the script probes, and reports which contracts hold; exits
   1 only on regressions of landed contracts, with a --strict flag for full
   enforcement once H+C merge).

## VERIFY STAGE (adversarial, after lanes)
- V1-instant: run `node scripts/ux-gates/warm-interaction-gate.mjs` against the dev
  server (servers: vite 8080; sidecar recipe in the handoff) — report the ACTUAL
  timing table; kill the sidecar and run the cold variant; try to refute Lane H/C
  claims (type during warmup, click during skeletons, tab-away/return every cached
  surface).
- V2-truth: refute the one-briefing-truth claim — grep for any remaining second
  fetch path; run the reconciliation tests; force a count change through the mock
  and check for above-fold remount; verify modal-vs-hero counts share one source.
- V3-keyboard: keyboard-only pass — Tab through home → workspaces → kebab →
  memory rows → chat send; confirm every action reachable, focus-ring visible
  (Phase-A token), no trap; report the actual traversal.

## Orchestrator after verify
tsc web + server, full apps/web vitest, ux-gates all green, browser smoke, commit.
Then: kit v6 build + R20 judge round (gate: min ≥ 8.0 per v3 §3) BEFORE Phase C.
