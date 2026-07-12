# Waggle OS UX Route and Scenario Manifest

Companion artifact for `docs/audits/2026-07-08-complete-ux-usage-audit.md`.

Five-persona scoring packet: `docs/audits/2026-07-08-five-persona-judge-scorecards.md`.

Five-persona execution runbook: `docs/audits/2026-07-08-five-persona-judge-runbook.md`.

Master correction register: `docs/audits/2026-07-08-ux-correction-register.md`.

State and failure matrix: `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`.

Focused T11 route evidence supplement: `docs/audits/2026-07-08-route-evidence-t11-analysis.md` (now includes a current all-route built-preview smoke on port 3457 and codified `J-route-coverage` evidence on port `34200`).

Focused Mobile Executive T2/T12 supplement: `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md`.

Focused runtime accessibility T10 supplement: `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`.

Focused first-run onboarding T1/T2/T12 supplement: `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`.

Focused shell overlay T10/T12 supplement: `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md`.

Non-main surface scope: `docs/audits/2026-07-08-ux-non-main-surface-scope.md`.

Source inventory consistency audit: `docs/audits/2026-07-08-source-inventory-consistency-audit.md`.

Phase 1 implementation plan and verification log: `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`.

Purpose: make the final 9/10 UX claim auditable. Every registered route, major overlay, and cross-cutting scenario needs an evidence owner before the five-persona judge gate is run.

Current Phase 1 evidence update: the approved Phase 1 corrections are implemented and the full combined browser gate passed 156/156 on port `34150`. This includes accountless console health, mobile Settings, mobile first-run onboarding, `Ctrl+Shift+N`, Workspace Switcher open/close behavior, thin route smokes, and visual snapshots. Phase 2 has also begun: Notification Inbox and Create Workspace overlay contracts passed component and rendered journey evidence on ports `34151`/`34152`; the next overlay slice adds component evidence for Context Rail, Onboarding Tooltips, and tier close labels plus rendered `J3c` tier-modal evidence on port `34153`, with the earlier expanded full user-journey suite passing 18/18 on port `34155`. The Create Workspace mobile hierarchy slice adds component evidence, focused 390 x 844 rendered evidence on port `34157`, and expanded full user-journey evidence passing 19/19 on port `34158`. Rows below keep `Mixed` where deeper workflow, destructive-dialog, accessibility, mobile-overlay, or non-main-surface evidence is still required before the final 9/10 judge pass.

Status key:

- `Strong`: current tests or rendered inspection exercise the route and at least one primary interaction.
- `Mixed`: route has coverage, but known failures, flakes, visual drift, or thin interaction depth remain.
- `Thin`: route is registered and has only shallow/static/string evidence.
- `Missing`: route has no direct route-string coverage in `tests/` or `apps/web/src/test`.

Global route acceptance checks:

1. Route loads a meaningful surface, not a blank shell.
2. No framework overlay or critical console error.
3. Primary visible control works and produces an observable state change.
4. Empty, loading, error, and permission states are understandable.
5. Keyboard focus is visible and ordered through primary controls.
6. Runtime axe/DOM findings on judge routes have no critical or serious unapproved violations.
7. Mobile 390 px layout has no horizontal overflow or clipped critical controls; critical visible element bounds must be checked because document scroll width alone can miss clipping.
8. First-run onboarding is checked on a clean data dir without skip flags for console health, mobile primary-action reachability, and terminal first-task handoff.
9. User-facing copy matches current Solo, Teams, Enterprise strategy.
10. Destructive or trust-critical actions use in-app confirmation and result states.
11. URL state is stable enough for reload/back/forward on tabs, filters, and route context.
12. Route has an evidence owner in the final judge packet.

## Route Manifest

| Area | Route | Primary component | User job | Current evidence | Status | Must prove before 9/10 |
|---|---|---|---|---|---|---|
| Auth | `/auth` | `AuthRoute`, `WaggleClerkProvider` | Sign in or continue accountless | 9 route-string hits; Phase 1 console health passes with Clerk disabled by default unless `VITE_WAGGLE_ENABLE_CLERK=1` | Mixed | Auth mode still needs an intentional-Clerk enabled lane; accountless local mode is clean in the standard audit lane. |
| Shell index | `/` -> `/home` | `IndexRedirect`, `AppShell` | Land in the product | Covered by shell/user journeys | Strong | Redirect is stable and does not flash invalid shell state. |
| Home | `/home` | `HomeCockpit` | Continue work, Start Here, create/open workspace | 81 route-string hits; rendered desktop/mobile inspection | Strong | Preserve Home as the continuity anchor; no new surface for existing Home jobs. |
| Workspaces | `/workspaces` | `AllWorkspacesApp` | Browse, create, manage workspaces | 115 route-string hits | Mixed | Workspace creation/deletion/manage flows have in-app confirmations and mobile fit. |
| Workspace | `/workspaces/:workspaceId/:tab?` | `WorkspaceDesktopApp`, `ChatApp`, `TasksTab` | Chat, files, tasks, workspace memory | 41 nested route hits; chat tests; Phase 1 `Ctrl+Shift+N` and active-workspace fallback pass in combined browser gate | Mixed | Mobile workspace tabs are in-bounds or intentionally scrollable; deeper files/tasks/memory states remain evidence work. |
| Memory | `/memory/:mindScope?` | `MemoryCenterApp` | Search, trust, provenance, wiki, timeline | 138 route-string hits; T5 visual failure classified mostly as stale-baseline drift; fresh 390 x 844 smoke shows mobile tab-strip overflow; rendered `J3f` delete/erase/re-import confirmations pass on port `34164`; rendered `J3g` Wiki export forms pass on port `34167`; latest expanded user journeys pass 24/24 on port `34173` | Mixed | Memory Center destructive trust flow and Wiki export destinations use in-app consequence/form modals; mobile tab-strip behavior, visual baseline, failure states, and broader persona states still need final evidence. |
| Artifacts | `/artifacts` | `ArtifactCenterApp` | Review, archive, delete produced artifacts | Codified `J-route-coverage: priority thin routes` renders Artifact/Library shell; rendered `J3e` permanent-delete confirmation passes on port `34161`; latest expanded user journeys pass 24/24 on port `34173` | Mixed | Permanent delete uses in-app consequence modal; archive, empty/error, and broader artifact persona states still need final evidence. |
| Files | `/files` | `StorageAndFilesApp` | Browse, upload, preview, download files | Codified `J-route-coverage: priority thin routes` renders storage/files shell; passed 2026-07-08 on port `34200` | Mixed | Upload, preview, empty/error states and keyboard navigation are covered. |
| Agents | `/agents` | `AgentsApp` | Create/manage agents and groups | 12 route-string hits | Mixed | Agent creation forms have labels, errors, and no noisy `act` warnings. |
| Automations | `/automations` | `AutomationCenterApp` | Build and manage scheduled jobs | Codified `J-route-coverage: priority thin routes` renders Automation Center shell; delete confirmation has focused component evidence in `phase3b-automation-center.test.tsx` | Mixed | Builder validation, logs, pause/resume, failure, and broader persona states remain. |
| Skills | `/skills` | `CapabilitiesApp` | Inspect/install skills | 50 route-string hits; T5 visual failure classified mostly as stale-baseline drift with T10 row/action follow-up | Mixed | Pro copy removed; install/update/error states are deterministic; approved visual baseline passes. |
| Room | `/room` | `RoomApp` | Observe parallel agent work | 12 route-string hits | Mixed | Empty/running/completed states and explanatory affordances are covered. |
| WaggleDance | `/waggle-dance` | `WaggleDanceApp` | Understand signal sharing/swarm behavior | Codified `J-route-coverage: priority thin routes` renders signal-sharing shell; passed 2026-07-08 on port `34200` | Mixed | Value clarity and live signal states are added. |
| Approvals | `/approvals` | `ApprovalsApp` | Review grants/actions and revoke permissions | Rendered `J3d` revoke-all in-app confirmation path passes on port `34159`; latest expanded user journeys pass 24/24 on port `34173` | Mixed | Revoke-all uses in-app consequence modal and result state; approve/deny and individual revoke states still need final persona-bundle evidence. |
| Connectors | `/connectors` | `ConnectorsApp` | Connect external systems | 35 route-string hits | Mixed | Credential setup, revoke, error recovery, and no-secrets display are tested. |
| MCP Hub | `/mcps` | `MCPHubApp` | Manage MCP servers | Codified `J-route-coverage: priority thin routes` renders MCP Hub installed/catalog/custom shell; passed 2026-07-08 on port `34200` | Mixed | Solo/Team copy, custom MCP form labels, scope dialog, install/verify states covered. |
| Marketplace | `/marketplace` | `MarketplaceApp` | Browse/install extensions | 53 route-string hits; one flake | Mixed | Standard audit does not hit live external sync; search/browse are stable. |
| Launcher | `/launcher` | `LauncherApp` | Launch AI tools and manage hooks | Codified `J-route-coverage: priority thin routes` renders `/launcher` and `/launcher?watch=1`; passed 2026-07-08 on port `34200` | Mixed | Clean-install runtime verification, launch-with-prompt, hook install/verify/uninstall covered. |
| Team | `/team` | `TeamGovernanceApp` | Manage team governance | 20 route-string hits | Mixed | Tier gating, permissions, audit trail, and empty Solo state are understandable. |
| Settings | `/settings` | `SettingsApp` | Configure models, billing, general, backup | 66 route-string hits; Phase 1 390 px tests pass for general, models, billing, and profile with visible-control bounds checks; rendered `J3h` Settings backup/restore trust path passes on port `34171`; latest expanded user journeys pass 24/24 on port `34173` | Mixed | Settings telemetry clear and backup/restore now use in-app approval/status states; form labels, deeper mobile overlay paths, and broader persona-state evidence remain. |
| Vault | `/settings/vault` | `VaultApp` | Store API keys and secrets | 7 route-string hits | Mixed | Success/error states do not leak secrets and are keyboard accessible. |
| Profile | `/settings/profile` | `UserProfileApp` | Manage identity and preferences | Codified `J-route-coverage: priority thin routes` renders profile form shell; passed 2026-07-08 on port `34200` | Mixed | Form labels, save/error states, and mobile layout covered. |
| Mission Control | `/settings/mission-control` | `CockpitApp` | Inspect health/cost/activity | 10 route-string hits; T5 visual failure classified as low-risk drift with connector-list scroll/affordance review | Mixed | Visual baseline, connector-list fit, and local model cost semantics fixed or explicitly deferred. |
| Timeline | `/settings/timeline` | `TimelineApp` | Review activity history | Codified `J-route-coverage: priority thin routes` renders timeline/activity shell; passed 2026-07-08 on port `34200` | Mixed | Empty, filtered, long-list, and date formatting states covered. |
| Events | `/settings/events` | `EventsApp` | Inspect logs/events | 6 route-string hits; T5 visual failure classified as low-risk drift | Mixed | Filters, empty state, long log lines, and approved visual baseline covered. |
| Usage | `/settings/usage` | `TelemetryApp` | Understand spend/tokens | Codified `J-route-coverage: priority thin routes` renders usage/cost shell; passed 2026-07-08 on port `34200` | Mixed | Unknown local model pricing is explicit; cost tables use tabular numbers and Intl formatting. |
| Benchmarks | `/benchmarks` | `BenchmarkApp` | Inspect benchmark capability | Component tests plus codified `J-route-coverage: thin utility routes` render the route; passed 2026-07-08 on port `34200` | Mixed | Discovery path and benchmark interpretation are clear. |
| Platform | `/platform` | `PlatformApp` | Understand platform/roadmap | Component tests plus codified `J-route-coverage: thin utility routes` render the route; passed 2026-07-08 on port `34200` | Mixed | Decide if this command-palette surface is included in judged app scope. |
| Payment success | `/payment-success` | `PaymentSuccessApp` | Recover from successful checkout | Codified `J-route-coverage: priority thin routes` renders checkout/no-confirmation fallback; passed 2026-07-08 on port `34200` | Mixed | Legacy Pro copy is constrained to historical billing state; Teams success path is clear. |
| Payment cancelled | `/payment-cancelled` | `Navigate` to billing settings | Recover from cancelled checkout | Codified `J-route-coverage: thin utility routes` proves redirect to `/settings?tab=billing` and billing recovery copy; passed 2026-07-08 on port `34200` | Mixed | Billing explains the recovery action and checkout retry path. |
| Not found | `*` | `NotFound` | Recover from bad route | Existing stress coverage | Mixed | Recovery link is visible and returns to Home without overlay traps. |

## Embedded and Retired Surface Inventory

This table prevents the final "complete UX" claim from silently ignoring app files that are not top-level routes.

| Surface/file | Current state from source inventory | UX audit consequence |
|---|---|---|
| `DashboardApp.tsx` | Present in `apps/web/src/components/os/apps`, but not imported by a route; `dashboard` app id retargets to `/home`. | Treat Home as the judged dashboard/continuity surface. Do not add DashboardApp evidence unless the surface is resurrected. |
| `VoiceApp.tsx` | Present as a "Coming Soon" component; `voice` app id retargets to `/home`. | If voice becomes reachable, it needs a route, copy, and judge scenario. Current final packet may exclude it as retired/unrouted. |
| `MissionControlApp.tsx` | Present but route comments mark the legacy app id as killed; `/settings/mission-control` renders `CockpitApp`. | Judge Mission Control through `CockpitApp`; stale comments/import references should not confuse future scoring. |
| `BackupApp.tsx` | No top-level route; backup lives inside Settings and now has focused Settings plus standalone component coverage. | Judge backup primarily through `/settings?tab=backup`; standalone `BackupApp.tsx` restore also uses in-app approval if this embedded component is surfaced again. |
| `StorageApp.tsx`, `FilesAppTabs.tsx`, `FilesApp.tsx` | Embedded under `StorageAndFilesApp`, which is routed at `/files`. | Judge the unified `/files` A/B storage/files surface, including workspace query state. |
| `BenchmarkApp.tsx`, `PlatformApp.tsx` | Top-level routes exist; component tests and codified `J-route-coverage` prove they render. | Route existence is closed under T11; discovery/value clarity remains a scenario-depth item. |

## Command-Query Destination Inventory

Source inventory found two active command destinations whose base routes are covered, but whose query-state UX still needs explicit evidence:

| Destination | Source | UX audit consequence |
|---|---|---|
| `/launcher?watch=1` | Command Center action: Watch a coding agent live | Cover as a T11/T16 Launcher watch-mode state, not as a new top-level route. |
| `/settings?tab=billing` | Command Center action: Upgrade to Team | Cover as a T3/T11/T13 billing deep-link and checkout-recovery state, not as a new top-level route. |
| `/motion-spec` | Development-only motion specification route | Exclude from production score unless developer visual tooling is explicitly brought into scope. |

## Overlay Manifest

| Overlay | Entry | User job | Current concern | Must prove before 9/10 |
|---|---|---|---|---|
| Command Center | `Ctrl+K`, sidebar Search | Find routes/actions quickly | Pro wording in pinned group; action labels need consistency; fresh mobile smoke found long-label overflow, missing dialog description warning, and Escape close not proven | Search, select, gated action prompt, long-label fit, accessible dialog naming, and keyboard/touch close all pass. |
| Workspace Switcher | Sidebar workspace, fallback shortcut | Switch/create workspace | Phase 1 route contract passes: switcher opens/closes and no longer blocks route-changing traversal; focused create-workspace mobile hierarchy now passes at 390 x 844 | Selection, Escape, outside-click, route-changing nav, and broader create-workspace states all need final judge evidence. |
| Persona Switcher | `Ctrl+Shift+P` | Change active persona | Focus/labels need review | Current persona, available modes, custom persona creation, and close behavior covered. |
| Spawn Agent | Sidebar/New Agent | Start an agent run | Model fallback clarity and form labels | Create, cancel, missing model, and workspace selection covered. |
| Onboarding Wizard | First run or forced wizard | First launch setup | Phase 1 clean first-run console smoke passes and mobile Profile primary action remains reachable at 390 px | Model gate ready copy, memory import consequence clarity, template, first task, and post-completion chat handoff still need final judge screenshots. |
| Login Briefing | Post-auth/local briefing | Explain next steps | Pro/Teams copy mismatch | Copy aligns with Solo/Teams/Enterprise and Home Start Here. |
| Upgrade/Trial modals | Tier gates | Explain access boundaries | Strategy copy must match tier model | No Pro upgrade copy in active flows. |
| Notification Inbox | Status/sidebar entry | Review alerts | Phase 2 partial fix: named dialog, Escape close, focus trap, named mark-all/close actions, rendered `J3b` journey passes | Notification content states and mobile screenshot refresh still need final judge evidence. |
| Create Workspace | Workspace Switcher New workspace | Start a new workspace | Phase 2 partial fix: named primary/subdialog contracts, Escape close, focus trap, named sampled template/share actions, in-app custom-template delete confirmation, and focused 390 x 844 hierarchy with templates behind progressive disclosure | Full mobile screenshot proof, keyboard-only create path, and broader create-workspace state coverage remain. |
| Context Rail | Chat/context action | Inspect selected context | Phase 2 partial fix: source/component evidence now gives the side rail a labelled complementary landmark, named close action, and expandable item state | Route-specific rendered open/close, loading, empty, long content, and focus order evidence remain. |
| Onboarding Tooltips | Post-onboarding coach mark | Dismiss or advance first-run tips | Phase 2 partial fix: named non-modal dialog with Escape dismissal and stored dismissed state has component coverage | Rendered first-run/mobile state evidence and proof of suppression around other overlays remain. |
| Upgrade / Trial tier modals | Tier-gated actions and expired trial state | Recover from paywall interruption | Phase 2 partial fix: tier modal close labels have component coverage; event-driven Upgrade modal has rendered `J3c` evidence | Full billing, checkout, expired-trial account state, and mobile evidence remain. |
| Erase Data dialog | Settings/system | Delete local data safely | High-risk destructive flow | Exact consequence copy, typed confirmation if needed, result state covered. |

## Usage Scenario Catalog

### First-run and account scenarios

- First launch with no account, no local model, and no imported memory.
- First launch with a valid Clerk key intentionally enabled.
- Continue accountless from `/auth`.
- Start trial and then fall back to Solo behavior.
- Return after onboarding with remembered Home Start Here state.
- Accountless mode with network disabled.

### Workspace scenarios

- Create first workspace from Home.
- Create workspace from All Workspaces.
- Switch workspace from sidebar switcher.
- Open workspace chat from Home Start Here.
- Open workspace chat through `Ctrl+Shift+N`.
- Delete/archive workspace template or workspace-adjacent artifact with consequence copy.
- Long workspace names and empty workspace lists.

### Chat and agent scenarios

- Send first chat message with real local model.
- Send first chat message with model unavailable.
- Retry a failed assistant response.
- Tool-use block renders, expands, and does not leak broken JSON.
- Model switch block explains fallback.
- Spawn Agent with a workspace and model available.
- Spawn Agent when no model is configured.
- Agent group creation, detail view, execution view, and cancellation.

### Memory scenarios

- Empty Memory Center.
- Memory list with many records and long titles.
- Search memory.
- Inspect memory provenance/trust.
- Archive/delete memory with in-app confirmation.
- Wiki export to local path without native prompt.
- Import reminder banner dismissed.
- Timeline and evolution tabs empty, loading, error, and populated.

### Extend and integration scenarios

- Marketplace browse/search with local catalog only.
- Marketplace sync live-integration lane, separate from standard UX audit.
- Skill install/update/error.
- MCP server install/verify/uninstall.
- Custom MCP form with invalid command, missing fields, and scope selection.
- Connector connect/revoke/error without secret exposure.
- Launcher tool detect, launch with prompt, hook install/verify/uninstall.
- Browser Companion extension connected/disconnected popup, save selection, save page, CORS-denied recovery, and memory-frame result.

### Trust, admin, and billing scenarios

- Billing settings in Solo, Trial, Teams, Enterprise, and legacy Pro subscriber state.
- Payment success for Teams.
- Payment cancelled redirect to billing.
- Approvals review, approve, deny, revoke all.
- Vault create/update/delete API key without exposing value.
- Backup create, restore, server unreachable, restore success.
- Team governance visible/hidden according to tier.
- Compliance template create/edit/delete.

### Responsive and accessibility scenarios

- Desktop 1440 x 900 for every route.
- Mobile 390 x 844 for Home, Settings general/models/billing/profile, Memory, Chat, Marketplace, Billing, Profile, Command Center, Workspace Switcher, and the sampled Create Workspace path.
- Critical visible control bounds at 390 x 844, not only document-level overflow.
- Narrow viewport for every modal/overlay that can open from mobile.
- Keyboard-only pass through sidebar, Command Center, Workspace Switcher, Settings tabs, Chat composer, and destructive dialogs.
- Screen reader naming pass for icon-only buttons, form controls, tabs, dialogs, and toasts.
- Reduced-motion pass for boot, route transitions, Home cards, and onboarding.

### Error, offline, and performance scenarios

- Sidecar unavailable.
- Marketplace external source unavailable.
- LLM provider unavailable.
- File upload failure.
- API returns 401/403/404/500.
- Large memory list and large event log.
- Main chunk and route-level lazy loading after performance fixes.
- Console error budget: zero critical app/auth/CSP errors in the standard audit lane.

### Public launch funnel scenarios

- Current evidence update: focused T13 supplement confirms local production route/API smoke must use `--hostname localhost` on Windows for this Next middleware setup. Corrected-host smoke renders the homepage, legal pages, auth pages, `/docs/methodology`, unauthenticated account redirect, and signed-out GET checkout redirect; it still exposes `/pricing?checkout=cancelled` 404, signed-out POST/pricing checkout dead-end copy, legal placeholders, download target with no GitHub releases, and deploy mismatch. Treat these as T13/P0-L1 until fixed or explicitly deferred.
- Homepage desktop and mobile first viewport.
- Mobile menu open, navigate, and close.
- Download CTA resolves to the intended release/download target.
- Signed-out Team checkout guides to sign-in/sign-up and then checkout recovery.
- Checkout cancel returns to a real pricing/billing recovery state.
- Account route redirects unauthenticated users to sign-in.
- `/docs/methodology` is the canonical methodology route; public links should not point users at missing `/methodology`.
- Legal/privacy/cookies/EU AI Act pages contain no launch placeholders and no active Pro copy.
- Deployment target serves the actual Next app shape or is explicitly replaced/deferred.

### Desktop wrapper and release scenarios

- Packaged Tauri app launches to Home or a clear service-recovery state.
- Sidecar healthy, degraded, unavailable, and port-conflict states surface in user language.
- Tray Open, Settings, and Quit actions are verified in a packaged smoke; About and Pause Agents remain hidden until implemented.
- Close-to-tray and global shortcut behavior are verified on the target OS lane.
- Update event is either wired to visible update UX or disabled/hidden until supported.
- Installer/signing warning expectations match the release channel.

Current T14 source evidence update:

- Tray Open/focus, close-to-tray, `Ctrl+Shift+W`, and Quit are source-wired in Rust, while Settings routes through a tested `/settings` desktop bridge; none of these is yet proved through a packaged app smoke.
- Remaining unconsumed native event families are update/service status: `waggle://update-available`, `waggle://service-status`, and `waggle://service-restart-needed`.
- About and Pause Agents tray actions are hidden until there is real product behavior behind them.

### Admin web and CLI/MCP utility scenarios

- Admin web connects with team slug + token, then renders Dashboard, Analytics, Members, Capabilities, Jobs, Audit Log, and Team Settings.
- Admin web empty, loading, API failure, invalid token, long team/user names, mobile width, keyboard navigation, and focus states are verified or explicitly deferred.
- `npx waggle --help`, default startup, `--port`, invalid port, port conflict, `--skip-litellm`, `--no-open`, first-run setup, and service failure copy are verified or explicitly deferred.
- Waggle CLI command parsing, auth failure, normal chat/repl entry, `/help`, `/model`, `/clear`, `/identity`, and graceful exit are verified or explicitly deferred.
- Marketplace CLI help, search/list/info/install/audit/scan, invalid package, dangerous `--force-insecure`, and JSON/human output states are verified or explicitly deferred.
- Memory MCP and hive-mind MCP stdio startup, scope enforcement, erase, missing data dir, invalid JSON args, and host integration errors are verified or explicitly deferred.
- Hive-mind CLI help, init/status/recall/save/harvest/maintenance, missing env, invalid path, `--json`, and Windows shim/postinstall path are verified or explicitly deferred.
- Root verification either discovers hive-mind CLI colocated tests or cites the separate command that owns them.

### AI-tool hook lifecycle scenarios

- Launcher shows all 7 launchable AI tools and exposes hook install/verify/uninstall only for the 6 hook-capable tools.
- Claude Desktop is launchable but clearly marked as not hook-capable.
- Codex Desktop shares Codex hook state and copy makes that understandable.
- Hook install, verify, uninstall, already-installed, not-detected, missing CLI, corrupt config, backup restore, and sidecar-unreachable fail-open states are verified or explicitly deferred.
- Hook logs are quiet enough for standard audit output, or expected fail-open warnings are documented and filtered from failure triage.
- Real-tool or hermetic config evidence proves that hook install does not corrupt existing settings and uninstall is byte-identical or removes only Waggle-managed files.

### Developer API, background worker, and substrate scenarios

- SDK skill/plugin validation, install, runtime, invalid package, and bad metadata states are verified or explicitly deferred.
- Server route suite passes deterministically as a standard audit command, or performance assertions are moved to an isolated documented lane.
- Worker job processing, failed handler, retry/recovery, and dispatch states have command or UI evidence.
- WaggleDance protocol dispatch, invalid signal, and unavailable peer/server states have evidence.
- Hive-mind core, shim core, wiki compiler, optimizer, shared, and compiler package tests are discoverable through documented root or package-local commands.
- Package-local `npm test` scripts either pass or clearly delegate to root/project-reference commands.
- Standard package verification output is quiet enough that real failures stand out, or expected warnings are documented.

### Ops, deployment, CI, benchmark, and judging scenarios

- GitHub Actions CI, release, Tauri PR, public-site deploy, and hive-mind CLI workflows parse and have explicit blocking/advisory semantics.
- Dockerfile, Compose, Render, and LiteLLM config parse and have secret-safe validation evidence.
- Compose validation uses non-interpolated or sanitized output when evidence may be copied into docs, issues, or PRs.
- Render deployment target is explicitly local-sidecar demo or team Postgres server; provisioned services match that decision.
- Infra-dependent tests have a Docker/migration lane, and missing CI coverage is explicitly accepted or fixed.
- Benchmark harness typecheck and tests are runnable through documented commands.
- Historical `judging/` rounds are treated as reference material only; final scorecards are generated from current post-fix source.

## Five-Persona Coverage Map

| Persona | Journey | Required route/overlay coverage |
|---|---|---|
| Solo founder | First run -> accountless -> Home Start Here -> workspace -> chat -> return later | `/auth`, onboarding, `/home`, `/workspaces`, workspace chat, Settings model gate. |
| Researcher | Memory search -> provenance -> wiki/timeline -> export/delete trust flow -> optional Browser Companion capture | `/memory`, memory tabs, `/settings/timeline`, native prompt replacements, T19 extension evidence if capture is in scope. |
| Engineer | Command Center -> shortcuts -> Launcher/MCP -> files -> logs -> CLI utility, hook smoke, and developer verification | Command Center, `/launcher`, `/mcps`, `/files`, `/settings/events`, `Ctrl+Shift+N`, selected T15 CLI/MCP, T16 hook, T17 developer/substrate evidence, and T19 extension sidecar contract evidence if not deferred. |
| Team admin | Billing -> Vault -> Approvals -> Backup -> Team governance -> admin web | `/settings`, `/settings/vault`, `/approvals`, backup section, `/team`, payment success/cancelled, selected T15 admin-web evidence if not deferred. |
| Mobile executive | Narrow Home -> Settings -> billing/profile -> memory glance -> theme | Mobile `/home`, `/settings`, `/settings/profile`, `/memory`, theme controls. |

## Final Judge Evidence Packet

Before claiming the goal is achieved, collect or generate:

- Current route manifest with every row marked Strong or explicitly deferred.
- Standard verification command output.
- Rendered desktop screenshots for all primary routes.
- Mobile screenshots for core mobile routes and every overlay used on mobile.
- Overlay evidence includes Notification Inbox, Create Workspace, Context Rail, Onboarding Tooltips, and tier modals, not only Command Center/Workspace Switcher. Current update: the core contract and sampled Create Workspace mobile hierarchy have focused coverage, but less common states still need rendered/mobile owners.
- Console error summary from the standard browser lane.
- Visual baseline decision log: updated baseline versus fixed UI.
- Five persona scorecards with scores and notes for all six dimensions in the main audit.
- State/failure bundle coverage for each of the five judge personas.
- T13 public launch funnel evidence or approved deferral.
- T14 desktop wrapper/release evidence or approved deferral.
- T15 admin web and CLI/MCP utility evidence or approved deferral.
- T16 AI-tool hook lifecycle evidence or approved deferral.
- T17 developer API/background/substrate verification evidence or approved deferral.
- T18 ops/deployment/CI/benchmark/judging evidence or approved deferral.
- Completed `docs/audits/2026-07-08-five-persona-judge-scorecards.md` table with evidence and score caps applied.
- Completed `docs/audits/2026-07-08-five-persona-judge-runbook.md` evidence folders or equivalent current evidence links.
- Deferral list, if any, approved before scoring.

Current T11 evidence note: app-local route-table tests pass 29/29 and Benchmark/Platform/Payment component tests pass 17/17. Fresh built-app route smokes on ports 3407 and 3411 proved the previous zero/thin route set renders/redirects as URLs. A current all-route built-preview smoke on port 3457 proves 33 desktop route navigations plus 11 mobile route spot-checks return 200, produce meaningful screenshots, and have no document-level horizontal overflow; `/payment-cancelled` redirects to `/settings?tab=billing`. Codified `J-route-coverage` tests now pass 2/2 on port `34200`, so route-existence ownership is closed. Remaining issues such as Launcher detect noise, Usage 403 semantics, expected catch-all logging, and accessible-name gaps stay in T9/T10/T12/T16 rather than T11 route ownership.
