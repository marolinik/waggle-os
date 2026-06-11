# P2 — Verification Record: Home Cockpit + Workspace Desktop vs Brief v2.1 (2026-06-11)

**Phase:** P2 per the ratified sequence (decision register, `deltas/open-questions.md`) — "verify + J08 alert".
**Scope verified:** PRD §12.1 (Home Cockpit) + §12.2 (Workspace Desktop) functional requirements, states,
and acceptance criteria, against main @ `4e3d65d` (post-P1a conversion, post-P1b auth gate).
**Method:** 4-lane verification workflow (Home FRs / Home states+AC / Desktop FRs / Desktop states+AC),
every claimed gap adversarially refuted by an independent agent; 2 scout lanes (J08 implementation map,
wizard onFinish live-run map). 20 agents. Then a 4-lens adversarial diff review (16 agents) over the fixes.

## Verdict

**25 of 37 verified items met or ratified-divergence; 12 confirmed gaps (1 HIGH, 5 MEDIUM, 6 LOW);
2 gap claims refuted (first-run empty state and AC-k reachability are MET).** The HIGH and all
tiny/small verified defects were fixed in this phase; feature-shaped gaps are ledgered below.

## Fixed in P2 (this phase)

| # | Sev | Item | Fix |
|---|-----|------|-----|
| G8 | HIGH | "Artifact ready" state dead — `getWorkspaceFiles` returned the `{files:[...]}` envelope; `normalizeArtifacts` silently rendered Artifacts empty forever | Envelope unwrap at the fetch layer (`adapter.ts`) + fetch-layer regression lock (`adapter.files.test.ts`) — component tests mock the adapter and were structurally blind here |
| G0 | MED | Greeting never showed the user's name (B8 backend half landed, FE never consumed `userName`); raw ISO date rendered verbatim | `personalizeGreeting()` server-side (name spliced into the first clause); `formatBriefingDate()` in `HomeCockpit` |
| G4 | MED | J08 alert absent (D6 verification item — Journey 6 step 1) | `needsReviewCount` on `GET /api/home/briefing` (personal-mind, 200-frame bound matching the Memory Center's own window) + attention banner with Review CTA + deep-link chain (below) |
| G1 | LOW | Ranking recency-only; PRD says "recency AND priority" | `applyPriorityRanking()` — bounded boost: each pending/blocked item buys up to 5×1h of effective recency |
| G10 | LOW | Header `type`/`status` hollow — context route never projected them | `/api/workspaces/:id/context` now projects `description`/`type`/`status` (FE already rendered all three) |
| G11 | LOW | Stale workspace URL claimed "server offline"; errored screen sticky | Duck-typed `AdapterHttpError` branching: 404 → "Workspace not found" + go-Home CTA, 403 → permission; Retry button + `useRevalidateOnError` (armed for the transient offline state only) |

**J08 deep-link chain (new):** Home banner → `waggle:open-app {appId:'memory', filter:'unreviewed'}` →
AppShell shim (stash + `/memory?filter=unreviewed`) → `MemoryRoute` re-stash on cold load
(AutomationsRoute pattern, so typed/refreshed URLs work) → `MemoryCenterTab` consumes (stash + live
event), validates against `STATUS_FILTERS`, seeds the status filter. Count and view share the same
bound (200) and the same mind (personal), so the number always matches what the user lands on.

**Diff review (4 lenses, adversarial):** 9 confirmed findings (0 critical/high; 2 medium — both test
gaps), 3 refuted. All 9 fixed pre-commit: MemoryRoute URL re-stash, revalidation gated to offline-only,
monotonic request guard in `MemoryCenterTab.load()` (also cures the pre-existing rapid-filter race),
`_phase1-contract.md` §2 amendment, queryString filter pin, route-level ranking inject pin,
focus-revalidation pin, needs-review comparison query corrected to `limit=200`.

## Met (verified with file:line evidence — highlights)

- Home: workspaces ranked w/ one-click Continue (real data, personal-only per A2), overnight summary
  (memories/artifacts/automations/failures), suggested next actions, quick capture (all 4 kinds wired
  to `/api/quick-capture`), Ctrl+K hint (D9 "Win+K" pill is gone), loading/first-run/normal/offline/
  overnight-failure states, P1b error+retry path (cold-load crash guard survived conversion).
- Desktop: all 8 PRD tabs present + URL-driven (founder two-seam edit), chat-as-one-widget (D1-4)
  with ChatHost keep-alive, 5/6 canvas widgets on real feeds, right panel, fixed layout, agents-running
  indicator, no-memory/active/agent-running/permission/offline states.
- Refuted as gaps (i.e. actually met): Home first-run empty (Journey 2), Desktop AC-k reachability
  (memory/artifacts/agents/skills/tasks/automations/settings all reachable from the workspace).
- Ratified divergences (PRD ≠ code is correct): D5 team/share tier-hidden; configurable widgets
  later-phase.

## Residuals — ledgered, NOT fixed in P2

| Item | Sev | Size | Owner |
|------|-----|------|-------|
| S02-FR2: Memory/Timeline/Settings/Research tabs are placeholders (capability is 1 click away via left-nav routes) | MED | M | **P3 (D2)** for the Memory tab embed; rest P7 |
| S02-FR5: status bar — automations-active + MCPs-connected chips unbuilt (feeds exist) | MED | S | P7 |
| S01-R4: `upNext` only carries cron schedules; awareness 'task' rows never aggregated; 'event' has no calendar substrate (defensible deferral) | MED | S | P7 (tasks); register note (events) |
| S01-R7: `activeModels` never populated server-side; FE tile inert | LOW | S | P7 |
| S01-R2 aggravator: priority data only computed for the recency top-8 (`MAX_RANKED_WORKSPACES` fan-out cap) — a high-pending workspace outside the top-8 can't surface | LOW | S | P7 |
| S02-FR3: research-overview widget unbuilt (Research feature wholesale later-phase) | LOW | S | P7 / register note |
| S02-state-f: sync conflict N/A until team sync (Phase 5 founder-deferred) — record in the D15 state grid | LOW | doc | P7 (D15) |
| S02-AC-j residue: `status` can never be non-active (update route doesn't accept status/type) | LOW | S | P7 |
| J08 count bound: getRecent(200) scan undercounts past 200 unreviewed frames (consistent with the Memory Center view itself; large E-11 imports could exceed it — SQL count if exactness ever matters) | LOW | S | P7 |
| AppShell shim filter passthrough has no mounted-router test (queryString + route-level stash are pinned) | LOW | S | P7 |

## Acceptance check 8 — wizard onFinish seeding (LIVE-RUN, first ever)

**Result: PASS — after fixing two real defects the run itself surfaced.** Driven via Playwright
against a fresh sidecar (3333) + Vite dev (8080) with `?forceWizard=true`, three full wizard runs.

**Defect 1 (state):** `loadState()` re-evaluated the `?forceWizard` reset on every call — including
the `waggle:onboarding-sync` reload fired by every wizard save. The moment workspace-create persisted
`{workspaceId}`, the sync reload reset onboarding to `{completed:false, step:0}` and wiped it; `onFinish`
then ran with a fallback `local-*` id and the seeding chain silently broke (run 1 ended force-completed
by the returning-user auto-complete, user stranded on `/home`). Fix: once-per-page-load latch
(`forceWizardConsumed`), pinned by `p2-onboarding-forcewizard.test.ts`.

**Defect 2 (navigation):** the wizard finishes at pathname `/`; completing onboarding (normal-priority
state) commits before `handleOnboardingFinish`'s navigate (a `v7_startTransition` update), so the shell
mounts at `/`, `IndexRedirect` fires, and its `/home` navigation queues after the wizard's and wins.
Fix: one-shot `pendingWizardLanding` handoff — `IndexRedirect` honors the wizard's landing target.
Live-verified; not unit-pinned (module-internal handoff — the live smoke is the evidence; ledgered).

**Run 3 (post-fix) assertions, all green:** lands on `/workspaces/p2-smoke-three/chat` (real server id,
not `local-*`); widget header `P2 Smoke Three · general-purpose` (wizard persona active); composer
prefilled `Hello! What can you help me with?` (QW-1 starter, NOT sent); `waggle-chat-state-v1` persisted
the persona; zero chat-completion/LLM requests in the network log. Smoke workspaces deleted after.

**Flagged for founder (production-class, NOT fixed here):** the returning-user auto-complete
(`useOnboarding.ts` "Bug #2" effect) completes the wizard whenever a `useOnboarding` instance mounts
with `completed:false`, no `forceWizard` in the URL, and ≥1 workspace on the server. Its own comment
says the boot-time `wsManager.ensureDefault` stub counts. If `ensureDefault` seeds `default-workspace`
before first FE mount on a clean install, **a truly-new production user may never see onboarding at
all** (and the Tauri filesystem first-launch flag does not gate this effect). Needs a clean-install
verification (P4/D12 binary work is the natural place); until then this is a suspected
launch-integrity defect, not a confirmed one.

## Gates at close

FE tsc 0 · server tsc 0 (after `npm run build:packages`) · FE vitest 75 files green ·
server-local green · `npm run lint` exit 0. Suite counts in the session handoff.
