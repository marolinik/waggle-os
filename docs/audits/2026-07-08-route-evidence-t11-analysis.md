# T11 Route Evidence Gap Analysis

Status: route-existence ownership verified. No product code changed.

Scope: installed `apps/web` route registry, app-id route mapping, direct route/test references, command-query destinations, major overlays, and route evidence needed before five-persona scoring.

## Why This Matters

The shell can have many green component and API tests while still leaving a user-visible route unproven. T11 is the guardrail against scoring only the familiar paths. A route is not judge-ready until it has an evidence owner that proves the actual URL, expected state, viewport, and recovery behavior.

## Current Route Registry

Authoritative source: `apps/web/src/App.tsx`.

Registered production routes:

```text
/auth
/
/home
/workspaces
/workspaces/:workspaceId/:tab?
/memory/:mindScope?
/artifacts
/files
/agents
/automations
/skills
/room
/waggle-dance
/approvals
/connectors
/mcps
/marketplace
/launcher
/team
/settings
/settings/vault
/settings/profile
/settings/mission-control
/settings/timeline
/settings/events
/settings/usage
/benchmarks
/platform
/payment-success
/payment-cancelled
*
```

Notes:

- `/payment-cancelled` is a router redirect to `/settings?tab=billing`, not a full page component.
- `/benchmarks` and `/platform` are real routed AppShell children, even though they are command-palette-oriented surfaces.
- `/motion-spec` is dev-only and remains excluded from the product score unless developer visual tooling is brought into scope.
- `routeFor` covers 28 app ids, including killed/retargeted ids, but it is not the same as rendered URL evidence.

## Current Command Evidence

| Check | Result | Interpretation |
|---|---|---|
| `npm run test -- apps/web/src/test/p1a-routes.test.ts --run` | Fail, no files found | Root Vitest excludes `apps/**`; the obvious command does not run app route tests. |
| `npm run test -w apps/web -- src/test/p1a-routes.test.ts --run` | Pass, 1 file / 29 tests | Proves app-id route mapping, search result retargeting, query serialization, nav active-route matching, and dock route invariants. |
| `npm run test -w apps/web -- src/components/os/apps/BenchmarkApp.test.tsx src/components/os/apps/PlatformApp.test.tsx src/test/pr7a-billing.test.tsx --run` | Pass, 3 files / 17 tests | Proves component behavior for Benchmark, Platform, Settings billing deep-link, and PaymentSuccess states, but not direct URL rendering for `/benchmarks`, `/platform`, or `/payment-cancelled`. |
| Fresh built-app route smoke, port 3407 | Mixed | `npm run build` passed, then a one-off Playwright smoke against `http://127.0.0.1:3407` proved `/benchmarks`, `/platform`, and `/payment-cancelled` render meaningful shell content; `/payment-cancelled` redirects to `/settings?tab=billing`. All three routes still emit the existing T1 CSP/Clerk console errors, so this is route-existence evidence, not judge-ready route health. Screenshots: `output/playwright/route-smoke-3407/benchmarks.png`, `platform.png`, `payment-cancelled.png`. |
| Fresh thin-route smoke, port 3411 | Mixed | `npm run build` passed, then a one-off Playwright smoke proved `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, and `/files` return 200 and render meaningful shell content. All routes still emit T1 CSP/Clerk console errors. Additional findings: leaving Launcher while detection is in flight can log `[adapter] detectTools failed: Failed to fetch`, and `/settings/usage` emits a visible 403 resource error while showing a Team-tier gate. Screenshots: `output/playwright/thin-route-smoke-3411/*.png`. |
| Current all-route built-preview smoke, port 3457 | Mixed | `npm run build` passed, a fresh sidecar on `127.0.0.1:3333` returned healthy, and a Playwright smoke against built preview `http://127.0.0.1:3457` navigated 33 desktop routes plus 11 mobile route spot-checks. All navigations returned 200, `/payment-cancelled` redirected to `/settings?tab=billing`, and no route had document-level horizontal overflow. This remains supplemental screenshot/overflow evidence now that `J-route-coverage` owns codified route-existence regression coverage. Artifacts: `output/playwright/route-evidence-3457/all-route-smoke.json`, `all-route-smoke-summary.json`, and 44 screenshots under `output/playwright/route-evidence-3457/screenshots/`. |
| `J-route-coverage` Playwright tests, port `34200` | Pass, 2 tests | Codifies route-existence owners for `/benchmarks`, `/platform`, `/payment-cancelled`, `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, and `/files`. `/payment-cancelled` is asserted to redirect to `/settings?tab=billing` and show billing/plan recovery copy. | Proves rendered shell/content and redirect behavior, not deeper form/action/error states such as MCP install, file upload, payment provider round-trip, Launcher hook lifecycle, or Usage cost semantics. |
| Direct route-string reference count over `tests/e2e`, `tests/visual`, `tests/vision`, `apps/web/src/test` | Mixed | Confirms several zero/thin route evidence owners. Counts below are references, not proof by themselves. |

Current warnings:

- The app-local test commands emit Node `punycode` deprecation warnings.
- `pr7a-billing.test.tsx` emits React Router future-flag warnings in the Settings billing deep-link test.
- The current all-route built-preview smoke emits a Clerk development-key warning on every sampled route, even though the route exists and renders. This keeps T1 open for standard judge console health.

## Current All-Route Built-Preview Smoke

Run date: 2026-07-08.

Artifacts:

- `output/playwright/route-evidence-3457/all-route-smoke-summary.json`
- `output/playwright/route-evidence-3457/all-route-smoke.json`
- `output/playwright/route-evidence-3457/screenshots/*.png`

Scope:

- Desktop 1440 x 900: `/auth`, `/`, `/home`, `/workspaces`, `/workspaces/default-workspace/chat`, `/workspaces/default-workspace/files`, `/memory`, `/artifacts`, `/files`, `/agents`, `/automations`, `/skills`, `/room`, `/waggle-dance`, `/approvals`, `/connectors`, `/mcps`, `/marketplace`, `/launcher`, `/launcher?watch=1`, `/team`, `/settings`, `/settings/vault`, `/settings/profile`, `/settings/mission-control`, `/settings/timeline`, `/settings/events`, `/settings/usage`, `/benchmarks`, `/platform`, `/payment-success`, `/payment-cancelled`, and the catch-all route.
- Mobile 390 x 844: `/home`, `/settings`, `/settings?tab=models`, `/settings?tab=billing`, `/settings/profile`, `/memory`, `/workspaces/default-workspace/chat`, `/launcher`, `/mcps`, `/files`, and `/payment-cancelled`.

What the smoke proves:

- No sampled route failed navigation.
- All sampled routes returned 200 through the preview server.
- `/payment-cancelled` redirects to `/settings?tab=billing`.
- Every sampled route produced meaningful body text and a screenshot.
- No sampled route had document-level horizontal overflow.

What still remains outside route-existence T11:

- Route-existence ownership is now codified in `tests/e2e/user-journeys.spec.ts`; the all-route smoke remains supplemental screenshot/overflow evidence.
- Auth-enabled route health remains tied to T1/T12 rather than this accountless route-existence lane.
- `/launcher?watch=1` still logs `[adapter] detectTools failed: ... /api/tools/detect: Failed to fetch`, so Launcher watch mode needs T16 runtime evidence.
- `/settings/usage` still logs a 403 resource error while rendering the Team-tier gate, so Usage & Cost semantics remain tied to T9.
- The catch-all route intentionally renders the branded not-found page, but it currently logs the attempted bad route as a console error. The final route smoke should either demote this expected event or explicitly exclude it from critical console failure counts.
- The DOM heuristic found runtime accessible-name gaps across judge routes, including chat composer (`ChatApp.tsx:1594`), Launcher refresh/prompt (`LauncherApp.tsx:332`, `:381`), Artifacts search/create (`ArtifactCenterApp.tsx:183`, `:231`), Agents search (`AgentsApp.tsx:284`), Skills search (`CapabilitiesApp.tsx:475`), Settings daily budget (`SettingsApp.tsx:506`), Vault refresh/add-secret controls (`VaultApp.tsx:257`, `:331`, `:380`), Profile identity fields (`UserProfileApp.tsx:327` through `:353`), WaggleDance refresh (`WaggleDanceApp.tsx:55`), Approvals refresh (`ApprovalsApp.tsx:199`), and Mission Control refresh (`CockpitApp.tsx:83`). These mostly close under T10; keep them there rather than reopening T11 route ownership.

## Direct Route Reference Matrix

Counts were generated with direct fixed-string search across `tests/e2e`, `tests/visual`, `tests/vision`, and `apps/web/src/test`.

| Route | Direct refs | Current interpretation |
|---|---:|---|
| `/auth` | 7 | Covered enough for route ownership; explicit auth-enabled confidence remains tied to T1/T12. |
| `/` | 3 | Covered as shell index/redirect, but redirect flash remains judged through rendered shell evidence. |
| `/home` | 81 | Strong route evidence owner. |
| `/workspaces` | 105 | Strong references, but workspace destructive/manage flows still need state-specific proof. |
| `/workspaces/:workspaceId/:tab?` | 68 | Strong references; `Ctrl+Shift+N` and active workspace fallback still tracked in T4. |
| `/memory` | 135 | Strong references, with visual/native-dialog issues tracked elsewhere. |
| `/artifacts` | 2 | Codified `J-route-coverage` now renders the Artifact/Library shell; delete/archive/empty/error state owner still needed. |
| `/files` | 6 | Codified `J-route-coverage` now renders the storage/files shell; upload/preview/path/error states remain T12. |
| `/agents` | 11 | Mixed. Agent center/builder has component coverage; route-level form/error evidence still needed. |
| `/automations` | 4 | Codified `J-route-coverage` now renders Automation Center shell; builder, validation, pause/resume/logs need routed evidence. |
| `/skills` | 47 | Mixed. Main issue is copy/install determinism rather than route existence. |
| `/room` | 12 | Mixed. Parallel-agent empty/running/completed states need route evidence. |
| `/waggle-dance` | 1 | Codified `J-route-coverage` now renders signal-sharing shell; value clarity and live signal states still need evidence. |
| `/approvals` | 7 | Mixed. Tier-gated and revoke-all consequence evidence still needed. |
| `/connectors` | 37 | Mixed. Good references, but credential/revoke/error/no-secret states need proof. |
| `/mcps` | 4 | Codified `J-route-coverage` now renders MCP Hub installed/catalog/custom shell; MCP install/verify/scope/revoke states need routed evidence. |
| `/marketplace` | 53 | Mixed. Search/browse is known flaky because standard audit can hit live external sync. |
| `/launcher` | 1 | Codified `J-route-coverage` now renders `/launcher` and `/launcher?watch=1`; launch/prompt/hook lifecycle states still need evidence. |
| `/team` | 9 | Mixed. Team admin route exists; Solo/Team tier gating and governance states need proof. |
| `/settings` | 66 | Mixed. Mobile layout and native dialog issues remain P0/P1. |
| `/settings/vault` | 7 | Mixed. Secret save/error/no-leak keyboard states need proof. |
| `/settings/profile` | 2 | Codified `J-route-coverage` now renders profile form shell; save/error and mobile state evidence remain separate T10/T12 work. |
| `/settings/mission-control` | 10 | Mixed. Visual baseline and local model pricing semantics remain open. |
| `/settings/timeline` | 3 | Codified `J-route-coverage` now renders the timeline/activity shell; workspace timeline, filters, long-list, and date formatting states need proof. |
| `/settings/events` | 6 | Mixed. Logs route needs long-line/filter/empty visual proof. |
| `/settings/usage` | 4 | Codified `J-route-coverage` now renders usage/cost shell; unknown local model cost semantics remain open. |
| `/benchmarks` | 0 | Codified `J-route-coverage` now renders the route; discovery/value evidence is still missing. |
| `/platform` | 0 | Codified `J-route-coverage` now renders the route; judged-scope decision/discovery evidence is still missing. |
| `/payment-success` | 3 | Codified `J-route-coverage` now renders the no-checkout fallback; completed checkout-return state is not proven. |
| `/payment-cancelled` | 0 | Codified `J-route-coverage` now proves redirect to `/settings?tab=billing` plus billing recovery copy. |
| Bad route / catch-all | 1 | Thin but present through invalid-route stress coverage. |

## Correction Candidates

### T11-1: Codify route-level evidence for zero-hit routes

Routes:

- `/benchmarks`
- `/platform`
- `/payment-cancelled`

Evidence:

- `App.tsx` registers all three routes.
- Direct test reference count found zero route references for all three.
- Benchmark and Platform have component tests, but those do not prove AppShell URL rendering, command palette discoverability, route chrome, or status-bar context.
- Payment cancelled is a redirect; the original ad hoc smoke proved the redirect, and the current codified route test now proves that `/payment-cancelled` lands on Settings billing and explains the recovery action.
- 2026-07-08 ad hoc fresh built-app smoke on port 3407 proves current URL rendering: `/benchmarks` and `/platform` return 200 with meaningful shell content, while `/payment-cancelled` returns 200 and redirects to `/settings?tab=billing`.
- 2026-07-08 all-route built-preview smoke on port 3457 reproves those three routes in the same pass as the rest of the registered route table.
- 2026-07-08 codified `J-route-coverage: thin utility routes render or redirect clearly` passed again on port `34200` and owns regression evidence for `/benchmarks`, `/platform`, and `/payment-cancelled`.
- The older ad hoc smokes reproduced pre-fix T1 CSP/Clerk console errors. Current T1 console-health closure is tracked separately; this T11 route smoke proves route existence and recovery copy, not full per-route console health.

Acceptance:

- A user-journey or route-smoke test navigates to `/benchmarks`, `/platform`, and `/payment-cancelled` with skip params.
- `/benchmarks` and `/platform` render the expected route chrome and content.
- `/payment-cancelled` redirects to billing and leaves the user with clear next action copy.
- The route smoke is codified so the current ad hoc evidence is not lost between judge runs.

Status: route-existence coverage is now codified. Deeper payment provider round-trip and recovery-state screenshots remain part of Team Admin/T12 evidence.

### T11-2: Upgrade thin route owners from reference count to user-state proof

Priority thin routes:

- `/launcher`
- `/waggle-dance`
- `/artifacts`
- `/settings/profile`
- `/settings/timeline`
- `/payment-success`
- `/automations`
- `/mcps`
- `/settings/usage`

Evidence:

- These routes have 1-4 direct references, or only static/component coverage.
- Several are primary judge paths: Engineer uses Launcher/MCP/files/logs; Team admin uses payment recovery; Researcher uses timeline; Mobile executive uses profile/settings.
- 2026-07-08 ad hoc thin-route smoke on port 3411 proves the priority thin URLs render, but it also shows route health is still capped by global T1 console errors, Launcher detection race/noise, and Usage/Cost 403 resource noise.
- 2026-07-08 all-route built-preview smoke on port 3457 reproves the priority thin routes, expands the mobile route sample, and confirms no document-level horizontal overflow; it also confirms label/name gaps on Profile, Vault, Launcher, and other persona routes.
- 2026-07-08 codified `J-route-coverage: priority thin routes render meaningful shells` passed again on port `34200` and owns route-existence evidence for `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, and `/files`.

Acceptance:

- Each thin route gets an evidence owner: route smoke, visual snapshot, persona screenshot, or explicit deferral.
- Evidence states the user mode, tier, viewport, and data state.
- Thin route rows in the manifest are changed only after evidence exists.
- Launcher detection and Usage/Cost 403 noise are resolved, documented as expected, or excluded from the final judge lane.

Status: route-existence ownership is codified. Persona-critical interaction states remain open under T10/T12/T16 as applicable.

### T11-3: Separate route existence from state coverage

Evidence:

- `p1a-routes.test.ts` proves `routeFor` and nav data invariants.
- It does not mount `App.tsx`, render screens, test API-backed empty/error states, or exercise mobile layout.

Acceptance:

- The route manifest names both kinds of evidence:
  - route mapping/unit evidence; and
  - rendered route/state evidence.
- Judge scorecards cannot cite `p1a-routes.test.ts` alone for a user-visible route.

### T11-4: Fix or document the app-test command shape

Evidence:

- Root `npm run test -- apps/web/src/test/p1a-routes.test.ts --run` exits with "No test files found" because the root Vitest include/exclude pattern excludes `apps/**`.
- `npm run test -w apps/web -- src/test/p1a-routes.test.ts --run` works.

Impact:

- A future reviewer can think route tests are missing or broken when they used the root command.

Correction:

- Use app-local commands in the Phase 1 plan and T11 verification notes, or add a root script that intentionally targets app tests.

Acceptance:

- The T11 verification checklist uses commands that actually run app tests.

### T11-5: Overlay evidence must be tied to routes

Overlays:

- Command Center
- Workspace Switcher
- Persona Switcher
- Spawn Agent
- Onboarding Wizard
- Login Briefing
- Upgrade/Trial modals
- Notification Inbox
- Context Rail
- Erase Data dialog

Evidence:

- The route manifest lists these overlays, but their evidence is not consistently attached to persona journeys.
- Workspace Switcher is already a P0 because it can block route traversal.
- Command Center has component tests, but route discovery paths for command-only routes still need URL proof.

Acceptance:

- Each judge persona cites overlay evidence where that overlay is in the path.
- Route-changing overlays close predictably on selection, Escape, outside click, and route-changing nav.
- Command Center can reach command-only surfaces or those surfaces are explicitly deferred.

## Five-Persona Impact

| Persona | T11 risk |
|---|---|
| Solo founder/operator | Home/workspace evidence is strong, but first-run and accountless confidence still depends on T1/T12 console and onboarding evidence. |
| Researcher | Memory is strong; timeline, artifacts, export/delete, and Browser Companion-adjacent capture evidence are thinner. |
| Engineer/power user | Launcher, MCP Hub, files, events, bad-route recovery, command-only surfaces, and T16/T17 adjunct surfaces need stronger routed evidence. |
| Team admin/security reviewer | Payment cancelled/success, Vault, Approvals, Team governance, and Settings billing recovery need route/state proof. |
| Mobile executive | Home/settings route coverage exists, but profile, usage, timeline, and mobile state evidence are thin. |

## Approval Recommendation

T11 is now closed for route-existence ownership: the route manifest exists, zero/thin routes have codified `J-route-coverage` owners, and the focused route coverage run passed 2/2 on port `34200`. Broader per-route state bundles stay in T12/Phase 2, with Launcher runtime proof in T16 and Usage semantics in T9.
