# Waggle OS UX State and Failure Scenario Matrix

Companion artifacts:

- `docs/audits/2026-07-08-complete-ux-usage-audit.md`
- `docs/audits/2026-07-08-ux-route-scenario-manifest.md`
- `docs/audits/2026-07-08-five-persona-judge-scorecards.md`
- `docs/audits/2026-07-08-five-persona-judge-runbook.md`
- `docs/audits/2026-07-08-ux-correction-register.md`
- `docs/audits/2026-07-08-source-inventory-consistency-audit.md`
- `docs/audits/2026-07-08-state-failure-t12-analysis.md`
- `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md`
- `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`
- `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`

Status: analysis-only. No product code is approved or changed by this file.

Purpose: route coverage proves that screens load; it does not prove the product is usable across the states real users hit. This matrix defines the state and failure combinations that must be sampled, tested, or explicitly deferred before the five-persona 9/10 judge gate.

## Source Inventory

| System axis | Source of truth inspected | UX consequence |
|---|---|---|
| Billing tiers | `packages/shared/src/tiers.ts` | Canonical tiers are `TRIAL`, `FREE` displayed as Solo, `TEAMS`, and `ENTERPRISE`; legacy `PRO` maps to `FREE`. |
| UI disclosure tiers | `apps/web/src/lib/dock-tiers.ts` | Navigation depth changes across `simple`, `professional`, `power`, and `admin`; billing tier also hides Team/Approvals entries below Teams. |
| Settings visibility | `apps/web/src/lib/settings-tier-filter.ts` | Settings tabs vary by disclosure tier; Team tab has a separate Teams billing gate. |
| Auth/account mode | `apps/web/src/lib/clerk.ts`, `apps/web/src/providers/WaggleClerkProvider.tsx` | Clerk is optional; no key or malformed key must yield honest accountless mode, not a blank shell. |
| Shell runtime state | `apps/web/src/providers/ShellContext.tsx`, `apps/web/src/components/os/AppShell.tsx` | Shell owns workspaces, tier, trial, onboarding, notifications, offline, overlays, and context rail. |
| Workspace state | `apps/web/src/hooks/useWorkspaces.ts` | Workspace selection is explicit; failed loads preserve prior data and surface errors. Create has a local fallback, while delete/patch mutate only on server success. |
| Offline state | `apps/web/src/hooks/useOfflineStatus.ts` | Offline flips after two failed health checks and rechecks on online, visible, and focus events. |
| Model readiness | `apps/web/src/hooks/useHasWorkingModel.ts`, `apps/web/src/components/os/model-gate/ModelGate.tsx`, `NoModelBanner.tsx` | A working model means at least one keyed cloud provider or detected local model; live probes distinguish verified, rejected, and unverified keys. |
| Adapter/API surface | `apps/web/src/lib/adapter.ts`, `packages/server/src/local/index.ts` | UI flows span workspaces, chat, memory, artifacts, local inference, skills, marketplace, agents, automations, notifications, approvals, settings, providers, connectors, MCP, vault, team, cost, backup, files, Stripe, harvest, wiki, identity, compliance, and local inference route families. |
| Destructive workflows | `BackupApp.tsx`, `EraseDataDialog.tsx`, `ApprovalsApp.tsx`, `ArtifactCenterApp.tsx`, `CreateWorkspaceDialog.tsx`, `MemoryCenterTab.tsx`, `WikiTab.tsx`, `SettingsApp.tsx` | Typed confirmation exists for erase data; Create Workspace template delete, Approvals revoke-all, Artifact permanent delete, Memory Center delete/erase/re-import, Wiki export destinations, and Settings telemetry/backup/restore now use in-app confirmations/forms/status; several other trust-critical flows still use native browser dialogs or thin result states. |

## State Matrix

| State axis | Variants to sample before 9/10 | Primary surfaces | Current evidence | Gap or correction owner |
|---|---|---|---|---|
| Account and auth | No Clerk key, malformed Clerk key, valid Clerk key, accountless continue, session-token bootstrap failure, Clerk network/CSP failure | `/auth`, `WaggleClerkProvider`, `AuthRoute`, full shell | Auth/component tests plus rendered console failure evidence | T1: local accountless lane must emit no Clerk/CSP errors; auth-enabled lane must remain intentional. |
| Onboarding lifecycle | Fresh install, skipped boot, incomplete wizard, completed onboarding, forced wizard, returning after absence, high-volume import detected, model ready/no-model, first task auto-send | `OnboardingWizard`, `BootScreen`, `LoginBriefing`, `/home`, workspace chat | Unit/E2E coverage exists for boot, onboarding gates, first task, briefing; focused first-run smoke completed desktop onboarding and captured mobile Welcome/Profile | T1/T2/T12: first-run clean-data lane still has Clerk/CSP console errors, mobile Profile Continue below viewport, import CTA risk, and model/auto-send polish gaps. |
| Billing tier | Trial active, trial expired, Solo, Team, Enterprise, legacy Pro subscriber, tier lookup error, Stripe unconfigured | Settings billing, `PlanCards`, `UpgradeModal`, `TrialExpiredModal`, Team/Approvals nav, `/payment-success`, `/payment-cancelled` | Tier tests and API tests exist; active UI still has Pro-copy findings | T3 plus T11/T12: current copy and payment recovery states must be judge-ready. |
| UI disclosure tier | Simple, professional, power, admin; same billing tier with different disclosure tier | Sidebar, Command Center, Settings tabs, pinned nav | Route/unit coverage exists for route table and settings filter | T12: judge evidence must include at least simple and power/admin shell screenshots so hidden vs discoverable depth is intentional. |
| Workspace list and selection | Empty list, loading, load error, many workspaces, long names, archived entries, no active workspace, stale active workspace id, active workspace deleted | Home, Workspace Switcher, `/workspaces`, `/workspaces/:id`, Chat shortcut | Hook code distinguishes errors; rendered failures cover Workspace Switcher and shortcut | T4/T11/T12: route-changing nav, `Ctrl+Shift+N`, and empty/error workspace states need current evidence. |
| Workspace content | Empty workspace, populated workspace, workspace with pending tasks, workspace files, long activity history, permission denied, not found | `WorkspaceDesktopApp`, `TasksTab`, files/storage, Home Start Here | Mixed route and unit coverage | T11/T12: each workspace tab needs either persona journey coverage or explicit deferral. |
| Model readiness | No model, cloud key saved but unverified, cloud key verified, rejected key, local Ollama present, local runtime unavailable, LiteLLM unavailable, unpriced local model | Onboarding model gate, Settings Models, Home banner, Chat, Spawn Agent, Usage & Cost | ModelGate and no-model tests exist; local model cost warning found | T9/T12: no-model and local-model lanes must be scored honestly. |
| Chat runtime | First message, streaming response, retry after failure, abort, session search, session export, artifact block, tool-use block, model switch block, missing provider | Chat, `ChatHost`, `ChatWindowInstance`, chat blocks, workspace sessions | Chat block and live-chat tests exist | Final judge evidence must include failure/retry and artifact-open-to-Files loop. |
| Agent and automation runtime | No agents, many agents, create agent, ambiguous workspace, run/pause/cancel, automation builder validation, scheduled run logs, engine unavailable | `/agents`, `/automations`, Spawn Agent, Room | Unit/E2E coverage exists, but warning noise remains | T10/T12: form validation, loading/error, and run-result states need clean verification output. |
| Memory and provenance | Empty memory, many frames, search no-results, search hit, source missing/404, trace, trust confirm, archive, delete, erase/suppression, all-minds vs workspace scope | `/memory`, Memory Center tabs, Context Rail, Erase Data | Memory route and trust tests exist; Memory Center delete/erase/re-import and Wiki export destinations now have in-app coverage | T7/T10/T12: export failure/result states and screen-reader labels need final pass. |
| Browser capture extension | Extension not loaded, connected, disconnected/CORS denied, save selection, save page, context menu save, content script unavailable, active workspace missing, resulting memory frame, provenance mismatch | `apps/browser-ext` popup/background/content, `/api/browser-ext/session-token`, `/api/browser-ext/health`, `/api/memory/frames`, Memory provenance/search | Source inventory, direct sidecar save, secure-default loaded-extension content extraction/background save, stable packaged-ID pairing, token bootstrap during save, duplicate handling, Memory frame confirmation, popup keyboard/focus/Enter save, Save page click, restricted-page disabled-state/recovery behavior, Memory search `source: import` provenance, existing chat `auto_recall`/catch-up imported provenance, and rendered Memory UI after secure popup save now exist; native toolbar bubble, native context menu, signed release-package proof if scored, and any future scored recall result shape remain unproven. | T19: verify native toolbar/context-menu UX and CORS recovery, plus future recall shapes if scored, or explicitly defer them from final scoring. |
| Files and artifacts | No workspace, workspace chosen by query, root directory, nested folder, upload, preview, download, move/copy/delete, traversal input, artifact delete/archive | `/files`, `/artifacts`, chat artifact block | Deep-link and path-normalization tests exist | T11/T12: rendered Files/Artifacts destructive and empty/error states need evidence. |
| Skills, marketplace, connectors, MCP | Local-only catalog, live marketplace sync, search empty, install success, install 403, install failure, connector connect/revoke/sync error, custom MCP invalid command, MCP permission scope | `/skills`, `/marketplace`, `/connectors`, `/mcps` | Many component/API tests; marketplace sync flake found | T6/T7/T10/T12: determinism, forms, and branded confirmation states. |
| Launcher and external tools | No tools detected, supported tools detected, launch with prompt, launch failure, process running, hook install/verify/uninstall, hook unsupported | `/launcher`, tool output pane | Component tests exist; route coverage is thin | T11/T12: clean-install runtime verification and route-level evidence. |
| Team and governance | Solo hidden state, Team visible state, Enterprise/KVARK CTA, Approvals present, Team governance empty/populated, audit trail | `/team`, `/approvals`, Settings Team/Enterprise, Cockpit compliance | Tier/API coverage exists; current high-confidence native-dialog scan is clean | T7/T12: Team admin judge must see clear gating, branded trust flows, and failure-state evidence. |
| Backup, restore, and erasure | No backup, metadata 404 empty, metadata 500 error, create success, create failure, restore file selected, restore cancel, restore success, erase phrase mismatch, erase success receipt | Settings Backup, `BackupApp`, `EraseDataDialog` | Settings backup failure/restore success and standalone `BackupApp` restore now have in-app approval/status evidence; Backup status classifier and erase modal exist | T7/T12: final judge evidence must cover typed/explicit consequence copy, restore result states, and broader backup failure variants. |
| Offline and API failure | Sidecar unavailable, `/health` failing, session token 401, route 403 tier gate, detail 404, route 500, SSE disconnect, external marketplace unavailable, Stripe unavailable | StatusBar offline pill, Home, Settings, Command Center, Marketplace, Notifications, Events | Failure-injection tests and hook logic exist | T1/T6/T12: standard audit lane needs zero critical console errors and clear offline recovery copy. |
| Responsive layout | Desktop 1440x900, tablet 1024x768, mobile 390x844, landscape mobile, modal on narrow screen, long copy, long names | All routes and overlays; especially Settings, onboarding, Memory, Marketplace, Chat, Create Workspace | Fresh 390 x 844 smoke renders Home, Settings, Profile, Memory, workspace chat, Command Center, and Workspace Switcher; Settings still fails through visible clipping/squeezing despite no document overflow; first-run mobile Profile hides Continue below the viewport; Memory/chat tab strips overflow; Create Workspace fits horizontally but the first mobile viewport is template-heavy; visual suite failed | T2/T5/T10/T12: mobile screenshots, critical element-bounds checks, overlay close checks, creation-flow hierarchy, and visual baseline decision log are mandatory. |
| Accessibility and keyboard | Sidebar tab order, Command Center keyboard, Workspace Switcher, Notification Inbox, Create Workspace, Context Rail, Settings tabs, forms, icon-only buttons, dialogs, toasts, reduced motion | Shell, overlays, forms, ModelGate, destructive dialogs, Mission Control, agent cards, Launcher, Approvals, Files, workspace chat | Mixed unit coverage and guidelines pass; static inspection found representative unlabeled controls; fresh runtime axe/DOM smoke found critical unnamed controls/selects, a serious Files keyboard-scroll issue, workspace semantics/image-alt findings, and Command Center dialog/label-fit warnings; shell overlay smoke found Notification Inbox and Create Workspace lacking semantics/Escape close and Create Workspace exposing 16 unnamed visible icon buttons | T10/T12: keyboard-only, screen-reader naming, modal focus-return, runtime axe, overlay semantics/close, named icon actions, and reduced-motion passes must be evidence-backed. |
| Scale and performance | Large memory list, large event log, 50+ marketplace items, many agents, large files, first bundle, lazy deep apps | Memory, Events, Marketplace, Agents, Files, app shell | Build warning shows large main chunk | T8/T12: performance budget and list behavior need current evidence. |

## Judge State Bundles

These bundles turn the matrix into five concrete scoring runs. A persona should not receive 9/10 if their bundle skips the state that matters to their job.

| Judge persona | Required state bundle | Minimum evidence before scoring |
|---|---|---|
| Solo founder | Accountless or Solo, simple disclosure, no or one workspace, clean-data first-run onboarding, model gate/no-model recovery, Home Start Here, workspace chat, marketplace local-only | Desktop/mobile onboarding, desktop and mobile Home, Settings Models, first chat, no critical console errors. |
| Researcher | Populated memory plus empty search, provenance/trust, wiki/timeline, source missing or archive/delete, export/error result state, Browser Companion capture if in scope | Memory screenshots, keyboard path through tabs, trust/destructive confirmation evidence, T19 extension evidence or deferral. |
| Engineer | Power/admin disclosure, Command Center, `Ctrl+Shift+N`, MCP custom invalid/valid, Launcher hook lifecycle, files artifact deep-link, events logs, extension-sidecar contract if in scope | Shortcut proof, route-level Launcher/MCP/Files evidence, console health, T19 contract evidence or deferral. |
| Team admin | Team billing tier, Team/Approvals visible, Vault, Backup, Team governance, payment success/cancelled, legacy Pro collapsed to Solo where relevant | Billing/tier screenshots, branded confirmations, backup/restore and approvals evidence. |
| Mobile executive | Mobile 390 x 844, simple disclosure, Settings/Profile/Billing, Memory glance, theme toggle, notification/overlay close | Mobile screenshots for routes and overlays, no horizontal overflow, critical visible controls in-bounds, visible focus, readable copy, and selected overlay close proof. |

## Evidence Rules

- A component unit test is not enough for a routed state unless the route shell, side effects, and viewport are irrelevant to the claim.
- A route smoke is not enough for a stateful workflow unless it exercises the state transition and observes the result.
- A failing external service can pass UX only if the user sees a clear, branded recovery state and the standard audit lane avoids avoidable live external dependency.
- Native browser dialogs do not satisfy trust-critical UX unless explicitly approved as a temporary exception.
- Any final judge score must cite the state bundle it actually exercised, not merely the route it visited.
- The exact state bundle must be recorded in the judge runbook evidence folder before the persona score is accepted.

## Corrections Implied By This Matrix

This matrix does not replace the existing tickets. It clarifies their evidence scope:

- T1 must prove accountless/auth-enabled console health, not only update CSP strings.
- T2/T5 must collect mobile/visual evidence for stateful surfaces, not only default route screenshots or document scroll-width checks.
- T6 must separate local marketplace UX from live sync UX.
- T7 must cover branded confirmations and result states for destructive flows.
- T8 must define scale/performance evidence for large lists and app payload.
- T9 must label local/unpriced model cost states honestly.
- T10 must include keyboard, labels, icon-only action names, modal focus return, inline errors, runtime axe/DOM findings, and warning hygiene.
- T11 must own route-level evidence for every registered route and embedded/retired surface classification.
- T12 should be added as the cross-state judge evidence ticket: every five-persona judge run must declare which account, tier, disclosure, model, data-volume, offline, and viewport states it exercised.
- Focused T12 supplement `docs/audits/2026-07-08-state-failure-t12-analysis.md` is the current evidence record for the state-slice command run, native dialog scan, persona bundle fields, and T12-A through T12-G correction candidates.
- Focused mobile supplement `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md` is the current evidence record for Mobile Executive 390 x 844 screenshots, Settings visible clipping, Memory/chat tab overflow, and Command Center mobile overlay risks.
- Focused shell overlay supplement `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md` is the current evidence record for Notification Inbox/Create Workspace semantics and close failures, Create Workspace mobile hierarchy, Context Rail/coach-mark semantics, and tier-modal close naming.
- Focused first-run supplement `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md` is the current evidence record for clean-data onboarding, desktop completion, mobile Profile reachability, import risk, and first-task handoff behavior.
- T19 remaining proof is native toolbar/context-menu capture, clear CORS/setup recovery screenshots if scored, signed release-package proof if scored, and any future scored recall result shape; loaded-extension UX, popup keyboard/focus basics, stable packaged-ID pairing, restricted-page disabled-state recovery, rendered Memory confirmation, consistent `/api/memory/search` provenance, and existing chat `auto_recall`/catch-up imported provenance now have evidence.
