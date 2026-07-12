# Complete UX and Usage Audit - 2026-07-08

Status: Phase 1 implementation completed and verified on 2026-07-08. Follow-up UX trust corrections and verification refreshed on 2026-07-11. The original analysis below is retained as the baseline finding packet; the evidence sections record the current post-fix state.

Objective from the goal: analyze the complete UX and usage scenarios, define everything that should be corrected, then wait for approval before implementation. Target acceptance is five different judge personas scoring the product at least 9/10.

Packet index: `docs/audits/2026-07-08-ux-packet-index.md`.

Approval brief: `docs/audits/2026-07-08-ux-approval-brief.md`.

Analysis completion audit: `docs/audits/2026-07-08-analysis-completion-audit.md`.

Companion execution checklist: `docs/audits/2026-07-08-ux-route-scenario-manifest.md`.

State and failure matrix: `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`.

Non-main surface scope: `docs/audits/2026-07-08-ux-non-main-surface-scope.md`.

Five-persona scoring packet: `docs/audits/2026-07-08-five-persona-judge-scorecards.md`.

Five-persona judge runbook: `docs/audits/2026-07-08-five-persona-judge-runbook.md`.

Master correction register: `docs/audits/2026-07-08-ux-correction-register.md`.

Web Guidelines line findings: `docs/audits/2026-07-08-web-guidelines-line-findings.md`.

Source inventory consistency audit: `docs/audits/2026-07-08-source-inventory-consistency-audit.md`.

Browser Companion T19 analysis: `docs/audits/2026-07-08-browser-companion-t19-analysis.md`.

Desktop wrapper T14 analysis: `docs/audits/2026-07-08-desktop-wrapper-t14-analysis.md`.

Admin/CLI utility T15 analysis: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`.

AI-tool hook lifecycle T16 analysis: `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`.

Developer/substrate T17 analysis: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`.

Ops/deployment/CI/judging T18 analysis: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`.

First-run onboarding T1/T2/T12 analysis: `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`.

Shell overlay T10/T12 analysis: `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md`.

Phase 1 implementation plan and verification log: `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`.

## Phase 1 Implementation Evidence

Phase 1 closed the main P0 blockers that were approved for immediate implementation: local accountless Clerk/CSP console health, mobile Settings and first-run onboarding reachability, active Solo/Teams/Enterprise copy, `Ctrl+Shift+N` plus Workspace Switcher route behavior, visual baseline drift, and codified route evidence for thin Phase 1 judge paths.

Current post-fix verification:

| Check | Result | Notes |
|---|---:|---|
| `npm run typecheck:web` | Pass | Web TypeScript gate. |
| `npx tsc --noEmit --project packages/server/tsconfig.json` | Pass | Server-side type gate after local rate-limit harness config. |
| `npm run ux:contrast` | Pass | 60 enforced token/surface pairs. |
| `npm run ux:color-guard` | Pass | 96 off-token offenses, all frozen in the existing baseline; no new raw-color violations. |
| Full `apps/web` Vitest | Pass | Fresh 2026-07-11 run: 207 files, 1726 tests, zero failing tests. |
| Cache-first return lane | Pass | 8 focused files / 71 tests cover instant return repaint plus silent refresh for Home cache, Marketplace, Agents, Connectors, MCP Hub, Artifacts, Approvals, Launcher, and the shared Home cache contract. |
| Model setup recovery lane | Pass | Shared onboarding + Settings `ModelGate` shows an actionable provider-catalog failure and Retry path instead of an empty key grid; focused ModelGate/onboarding coverage passes 27/27 and web typecheck passes. |
| API-key rendered setup lane | Pass | Fresh port `34382` Playwright coverage passes 2/2: onboarding and Settings both select a provider, focus the key field, validate, submit the Vault-bound provider payload, show saved feedback, and leave onboarding Continue enabled. |
| Live provider model catalog lane | Pass | Model inventories are fetched from configured provider APIs, exposed as stable `provider/model` ids, merged into Chat/Spawn, and never filled from a baked-in model list. Claude/Gemini pagination, stale-catalog recovery, app-focus refresh, managed-router hot loading, default/model/fleet resolution, and exact-id completion are deterministic regression gates. One paid live credential request remains external release verification. |
| Create Workspace mobile disclosure lane | Pass | Focused shell-overlay contracts pass 15/15; the rendered `J-mobile` journey passes 1/1 on fresh port `34380`, proving agent assignment is collapsed by default at 390 x 844, expands on demand, and remains reachable without displacing primary setup. |
| `npm run build` | Pass | Build succeeds. The prior Tailwind motion-token ambiguity warnings, `shape-selection.ts` dynamic/static import warning, and Vite large-chunk warning are fixed. Latest build is 423.61 kB minified / 114.63 kB gzip for the startup JS chunk; PostHog is lazy-loaded as a separate chunk. |
| Focused Phase 1 browser lane | Pass | 10/10 on port `34146`: console health, wiring, first-run onboarding, mobile onboarding, and cockpit visuals. |
| `tests/e2e/user-journeys.spec.ts` | Pass | Latest expanded trust-flow run: 24/24 on port `34177`, including mobile Settings, mobile first-run onboarding, Workspace Switcher, route evidence tests, Approvals `J3d`, Artifact `J3e`, Memory Center `J3f`, Wiki export `J3g`, and Settings backup/restore `J3h`. Focused re-checks also passed: mobile first-run Profile reachability 1/1 on port `34194`, mobile Settings 1/1 on port `34195`. |
| Full combined browser gate | Pass | 156/156 on port `34150`: full-product, full-wiring, phase-ab, power-user stress, user journeys, and visual snapshots. |
| Runtime accessibility axe gate | Pass | 2/2 on port `34333`: 41 routes across desktop and 390px mobile have zero axe violations in `tests/e2e/runtime-a11y.spec.ts`; the matrix now includes Settings tabs, Memory tabs, workspaces/tasks, automations, skills, room, channels-adjacent surfaces, marketplace, team, benchmarks, and platform. |
| T4 shortcut/switcher route contract | Pass | `Ctrl+Shift+N` route contracts passed 2/2 on port `34197`; Workspace Switcher/sidebar traversal guard passed 1/1 on port `34198`. |
| T5 visual snapshot lane | Pass | `tests/visual/views.spec.ts` passed 14/14 on port `34199` for the seven tracked desktop dark/light views. |
| T6 marketplace local/audit lane | Pass | Manual sync disable regression passed in Vitest, the manual/background sync slice passed 3/3, `packages/server` typecheck passed, and the focused marketplace Playwright slice passed 4/4 on port `34203`. |
| Coverage Compass browser integration state | Pass | Browser AI extensions now honestly render as `partial` with popup/capture coverage and native toolbar/context-menu work called out as pending; focused component guard passes 1/1. |

Remaining blockers to the final five-persona 9/10 claim are outside the completed Phase 1 scope unless explicitly deferred: broader unsampled accessibility metadata/focus-return cleanup, deeper workflow-state evidence for non-main surfaces, public launch funnel, desktop wrapper/package release evidence, registry/deploy evidence for utility packages, AI-tool packaged desktop hook-status proof, developer/substrate command hygiene, ops/deploy/CI/judge evidence, and Browser Companion native-toolbar/context-menu/rendered-memory/package proof.

## Executive Verdict

Waggle OS is broadly functional in the tested built app. The main shell, Home, Chat, Memory, Agents, Library, Settings, workspace routes, and the deeper zone apps are not blank or fundamentally broken. The app has a coherent desktop direction and strong Home continuity.

It is not ready for an honest 9/10 UX judgment yet. The blockers are mostly trust, consistency, responsive layout, and verification quality rather than missing core functionality:

1. Accountless local Clerk/CSP console health is now verified fixed for sampled first-run and initial-load paths; explicit Clerk-enabled auth still needs its own state evidence.
2. The original mobile Settings and first-run Profile reachability blockers are now verified fixed, but broader mobile polish evidence still needs ownership for Memory/workspace chat tab strips and the selected overlay path.
3. Main cockpit pricing/gating copy now uses Solo/Team/Enterprise; remaining active Pro language is limited to explicit legacy billing contexts, while public legal-page Pro copy remains in launch-funnel T13.
4. The visual regression suite now passes for the seven tracked desktop views in both dark and light modes; it still does not prove full-surface visual quality by itself.
5. Several destructive and recovery flows use native confirm/alert/prompt dialogs instead of in-app, accessible, branded flows.

Current estimated judge readiness after Phase 1 is materially higher for the main installed cockpit lane, but the final 9/10 claim is still not made. The remaining caps are mostly trust-critical dialogs, accessibility semantics, non-main surface proof, and packaged/release evidence rather than the Phase 1 console, responsive, copy, shortcut, visual, or route-evidence blockers.

The main judge gate is scoped to the installed cockpit experience, but the final "complete UX" claim must also handle public launch/download/checkout/legal, desktop wrapper, installer/update, active sidecar-startup, utility, hook lifecycle, Browser Companion extension capture, developer API/background/substrate, and ops/deployment/CI/benchmark/judging gates. Those non-main surfaces are now mapped in `docs/audits/2026-07-08-ux-non-main-surface-scope.md` as T13/T14/T15/T16/T17/T18/T19 and must be fixed or explicitly deferred before final completion.

## Evidence Collected

Environment:

- Repo: `D:\Projects\waggle-os`
- Date: 2026-07-08
- Built app server: `http://127.0.0.1:3377`
- Test data dir: temporary `WAGGLE_DATA_DIR`
- Render mode: built Vite app served by local sidecar, LiteLLM skipped, mock embeddings.
- Design standard checked against: Vercel Web Interface Guidelines, https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md

Commands and results:

| Check | Result | Notes |
|---|---:|---|
| `npm run typecheck:web` | Pass | No TypeScript errors for the web app. |
| `npm run ux:contrast` | Pass | 60 enforced token/surface pairs passed. Some info-only dim text pairs remain below 4.5. |
| `npm run ux:color-guard` | Pass | No new off-token text colors beyond the frozen baseline. |
| Targeted `apps/web` Vitest set | Pass | 12 files, 145 tests. |
| Full `apps/web` Vitest | Pass | 174 files, 1575 tests. Warnings are noisy. |
| `npm run build` | Pass | Build succeeds but main chunk is very large. |
| Rendered Playwright audit subset | Mixed | 51 passed, 15 failed. |
| Broader non-visual Playwright sweep | Mixed | 247 passed, 4 failed, 1 flaky, 1 skipped across 253 tests. |
| Browser/mobile rendered inspection | Mixed | Home is usable on mobile; Settings is not. |
| `npm run test -w apps/www` | Pass | Current public-site suite passes 7 files / 19 tests: persona card, Pricing checkout links/recovery, Stripe checkout route cancel URL, layout hydration contract, legal launch-copy guard, controlled download path, mobile/desktop download label detection, and public-site deployment workflow guard. |
| `npm run build:www` | Pass | Next build succeeds and includes the dynamic public routes. The public-site workflow now uses Vercel prebuilt deployment instead of GitHub Pages/static `apps/www/dist`. |
| Public-site env-shape check | Mixed | `apps/www/.env.local` has Clerk test keys different from the root Clerk pair and a live-shaped Stripe secret; values were not printed. |
| Public-site local prod route/API smoke | Improved | Binding `next start` to `127.0.0.1` caused Next middleware proxy failures to `localhost:<port>`. Current post-fix `next start --hostname localhost --port 34205` returned 200 for `/`, `/?checkout=cancelled`, and `/docs/methodology`; signed-out `GET /api/stripe/checkout?tier=teams&billing=monthly` returned 303 to sign-in. |
| Public-site Playwright interaction smoke | Historical mixed | Earlier regular Playwright against `http://localhost:3416` showed annual toggle and mobile nav worked, while signed-out `Get Team` showed inline `Sign in required`, `/docs/methodology` passed, and `/methodology` plus `/pricing?checkout=cancelled` 404ed. Current Browser/unit evidence supersedes the checkout dead-end and cancel-route findings. |
| Public-site Browser interaction refresh | Improved | Fresh in-app Browser loaded `http://localhost:34204/?checkout=cancelled#pricing`. Pricing rendered, cancelled-checkout recovery notice appeared, monthly Team CTA and retry link used `/api/stripe/checkout?tier=teams&billing=monthly`, annual toggle updated both links to annual, the Next dev issue badge disappeared after the layout fix, and console warnings/errors were empty. Browser `domSnapshot()` still failed with the known `incrementalAriaSnapshot` plugin mismatch, so evidence used targeted DOM probes plus screenshots. |
| `npx tsc --noEmit --project app/tsconfig.json` | Pass | Desktop wrapper scripts/config typecheck. |
| Targeted `app/` Vitest set | Pass | 4 files, 85 tests for updater, installer, signing, and runtime bundling helpers. |
| Local Tauri installer bundle | Pass locally | `npm run tauri:build:local --prefix app` produced fresh MSI and NSIS artifacts on 2026-07-10. Both local artifacts are unsigned debug builds; installed UX, signed release trust, and public availability remain open. |
| Static Tauri config/update tests | Pass | `npx vitest run packages/server/tests/tauri-config.test.ts app/tests/auto-update.test.ts` passed historically, and the focused `tauri-config.test.ts` refresh now passes 1 file / 19 tests including the release package-before-sidecar guard. |
| `node scripts/check-sidecar-resources.mjs` | Pass | Staged Node runtime, native deps, and sidecar `node_modules` are present. |
| Targeted app service E2E set | Pass | 3 files, 11 tests for startup, settings, chat SSE, workspace/session, and memory-scope API flows. |
| Utility/admin surface Vitest slice | Improved mixed | Admin-web package/root tests, launcher package-local tests, root-directed CLI, `@waggle/cli` package-local tests, memory MCP package-local tests, hive-mind MCP package-local tests, marketplace targeted tests, and hive-mind CLI package-local tests pass. Admin-web now owns a package-local test command and its focused suite no longer emits React `act(...)` warnings. Remaining mixed status is from broader rendered/auth/error/publish gaps, not this test lane. |
| Utility/admin TypeScript and builds | Mixed | `admin-web`, `cli`, `marketplace`, `memory-mcp`, `hive-mind-mcp-server`, and `hive-mind-cli` pass `tsc --noEmit`; all inspected package build scripts pass; `packages/launcher` has no `tsconfig.json` and is built via `tsup`. |
| Utility CLI help/runtime smoke | Mixed | Source help for launcher, CLI, hive-mind CLI, and marketplace works. Built and clean installed marketplace help/invalid-command paths pass with no DB side effect; built `@waggle/cli` help plus the bin wrapper pass with no `.waggle` side effect; local package-closure installed `npx waggle --help` passes; local package-closure installed `npx waggle --local` starts the REPL, renders the local prompt, runs `/help`, `/mode`, `/whoami`, `/models`, `/cost`, and `/clear`, creates `default.mind`, exits via `/exit`, and completes a streamed chat turn through a mock LiteLLM-compatible endpoint while verifying auth/model/stream payload shape; built and clean installed launcher help/startup-recovery paths no longer print service banners before help or create `.waggle`; and local package-closure installed `hive-mind-cli status --help` passes without `personal.mind` creation. |
| MCP protocol smoke | Improved mixed | Built `@waggle/hive-mind-mcp-server` and built legacy `waggle-memory-mcp` both complete official MCP client handshakes and write-scope save/recall roundtrips from temp data dirs. Both MCP packages now also have clean local package-closure installed read-only startup proof. Registry-only proof remains open. |
| Hive-mind CLI and marketplace negative/package paths | Improved mixed | Hive-mind CLI sampled subcommand help now prints focused help and does not create `personal.mind` from source, built, and local package-closure installed paths. Marketplace unknown commands now print help, exit 1, avoid DB creation, and its package manifest points at emitted files included by `npm pack --dry-run`; installed packed-CLI help and invalid-command paths are guarded. Every-subcommand sampling and registry-only proof remain open. |
| Admin-web rendered package smoke | Pass | `npm run test:rendered --workspace @waggle/admin-web` builds the package and runs Playwright against the built preview. It covers all seven admin pages at desktop and 390px mobile widths with typed authenticated mock API data, real local bearer-auth middleware wrong-token/valid-token behavior through protected Fastify routes, hash URL state, `aria-current`, document scroll width, labelled table scroll regions, overflow checks, labelled controls, clean app console/pageerror collection, mobile shell keyboard navigation, page-level keyboard traversal from connection fields into dashboard, members, capabilities, jobs, audit, and settings controls/table regions, full-page desktop/mobile visual snapshots, browser back/forward hash traversal, capability governance edit/add/decision forms, malformed analytics response recovery, all-page initial API-failure recovery with accessible alerts, and rendered mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save. Live deployed auth remains a launch/deploy evidence item, not an admin-web package-local blocker. |
| AI-tool hook route/contract tests | Pass with warning noise | Shared/agent/server T16 slice plus package runtime proof passed 7 files / 96 tests, with an additional registry-aware adapter launch slice passing 5 files / 108 tests. It covers manifests, third-party manifest loader, hook-capable cohort, launcher, backend tool routes, process paths, launchable third-party adapters, prompt template application, and packed package `npx` install/verify/uninstall lifecycle for all six hook-capable packages. Server setup emits expected mock embedding warnings. |
| Launcher hook UI, prompt, and adapter tests | Pass with deprecation warning | `npm run test -w apps/web -- src/components/os/apps/LauncherApp.test.tsx src/lib/launcher-prompt-args.test.ts src/lib/adapter.launcher.test.ts --reporter=dot` passed 3 files / 28 tests and emitted Node `punycode` warnings. |
| Launcher rendered hook state smoke | Pass, codified plus Browser partial | Fresh `npm run build` passed, then the in-app Browser loaded `/launcher?watch=1&skipOnboarding=true&skipBoot=true&skipBriefing=true` against a mock local API on port 54147. It rendered installed/not-installed/hooks-active/running/Phase 4 states, prompt summary, install success, verify failure, and live output with no current-port console errors. Artifacts: `output/playwright/launcher-t16-54147/`. Browser DOM snapshot failed with `TypeError: o.incrementalAriaSnapshot is not a function`, so evidence used targeted DOM evaluation plus screenshots. Codified Playwright rendered coverage now also proves all six hook-capable cards through install, verify, uninstall, and refreshed hooks-active transitions. |
| AI-tool hook/shim package tests | Pass with warning noise | Root-run hook/shim tests passed 60 files / 573 tests with 1 skipped. Output includes expected fail-open warnings, sidecar-unreachable signal drops, package logs, and hook verify negative-path logs. |
| AI-tool hook/shim typechecks, bin smokes, and package-local tests | Pass with warning noise | Official package typechecks pass 8/8, Claude Desktop stub build passes, 6/6 compiled hook-bin help smokes pass, local package-pack `npx --yes @waggle/hive-mind-hooks-<id> install/verify/uninstall` lifecycle passes for all six hook-capable packages, and hook/shim package-local `npm run test --workspace ...` scripts pass. The shim package-local integration lane also verified the CLI ESM resolver fix for the MCP server entry. Registry-only proof after actual package publication remains external launch/deploy evidence. |
| First-run onboarding smoke | Mixed | `npm run build` passed and a clean-data sidecar on port 3431 completed desktop onboarding through first-task auto-send into workspace chat; the original mobile pass found Profile Continue below the 390 x 844 viewport and T1 Clerk/CSP console errors. Current focused checks are green: mobile Profile reachability passed 1/1 on port `34194`, sampled accountless console health passed 3/3 on port `34196`, high-volume import CTA coverage passed 2/2, model-ready copy passed 5/5, and first-task composer handoff passed in the 12/12 chat input suite. |

Rendered Playwright details:

- Passed: API health checks, desktop shell, Home, Chat, Room, Agents, Files, Approvals, Settings, Vault, Mission Control, Timeline, Usage, Events, Team Governance, Skills Hub, Connector Hub, MCP Hub, Marketplace, and user journey checks J1-J12.
- Historical failure now rechecked: `tests/e2e/full-product-audit.spec.ts` "no critical console errors on load" passed in the focused 3/3 console-health bundle on port `34196`.
- Historical failure now rechecked: all 14 visual snapshots in `tests/visual/views.spec.ts` originally failed for the 7 tracked views across dark and light; the current visual suite passes 14/14 on port `34199`.
- Visual suite scope remains 7 views only (`chat`, `memory`, `events`, `skills/capabilities`, `home`, `mission-control`, `settings`). The route registry exposes roughly 30 app routes/route wrappers, so the green visual suite does not by itself prove full-surface visual quality.

Broader Playwright sweep details:

- Command: `node node_modules/playwright/cli.js test tests/e2e/full-wiring-audit.spec.ts tests/e2e/waggle-complete.spec.ts tests/e2e/user-behavior.spec.ts tests/e2e/power-user-stress.spec.ts tests/e2e/phase-ab-verification.spec.ts tests/e2e/polish-verification.spec.ts tests/e2e/light-mode-polish.spec.ts tests/e2e/boot-screen-skip.spec.ts --project=chromium --reporter=list`
- Environment: fresh built server on `http://127.0.0.1:3388`, `WAGGLE_E2E_SKIP_LITELLM=1`, mock embeddings, temporary data dir.
- Result: 247 passed, 4 failed, 1 flaky, 1 skipped.
- Historical failures now rechecked:
  - `tests/e2e/full-wiring-audit.spec.ts:553`: original workspace-switcher traversal interception now passes in `traverse all sidebar views - zero critical JS errors` on port `34198`.
  - `tests/e2e/phase-ab-verification.spec.ts:132` and `tests/e2e/power-user-stress.spec.ts:215`: original `Ctrl+Shift+N` route failures now pass 2/2 on port `34197`.
  - `tests/e2e/phase-ab-verification.spec.ts:271`: original inline-script CSP console error now passes in the focused 3/3 console-health bundle on port `34196`.
- Flaky:
  - `tests/e2e/full-wiring-audit.spec.ts:501`: marketplace search API returned non-OK once, then passed on retry.
- Important harness notes:
  - Historical result: the run triggered a live marketplace sync via `POST /api/marketplace/sync`; that path took 34.4s and logged external-source errors despite the harness disabling background marketplace sync.
  - Current recheck: manual `/api/marketplace/sync` now respects `WAGGLE_DISABLE_MARKETPLACE_SYNC=1`, and the focused marketplace Playwright slice passed 4/4 on port `34203`.
  - A "without LLM" graceful-degradation test still used the local Ollama provider because it was healthy.
  - Cost tracking warned that `ollama/minimax-m2.7:cloud` has no pricing entry and was estimated with Sonnet pricing.
  - The test server was stopped after the run; no listener remained on port `3388`.

Route/test coverage notes:

- `apps/web/src/App.tsx` registers the app shell plus `/auth`, `/home`, `/workspaces`, `/workspaces/:workspaceId/:tab?`, `/memory/:mindScope?`, `/artifacts`, `/files`, `/agents`, `/automations`, `/skills`, `/room`, `/waggle-dance`, `/approvals`, `/connectors`, `/mcps`, `/marketplace`, `/launcher`, `/team`, `/settings`, `/settings/vault`, `/settings/profile`, `/settings/mission-control`, `/settings/timeline`, `/settings/events`, `/settings/usage`, `/benchmarks`, `/platform`, `/payment-success`, `/payment-cancelled`, and catch-all.
- Simple route-string search in `tests/` plus `apps/web/src/test` shows heavy coverage for `/home`, `/workspaces`, `/memory`, `/marketplace`, `/settings`, and `/skills`.
- Thin route-level coverage is now codified for the priority gaps: `/payment-cancelled`, `/benchmarks`, `/platform`, `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, and `/files` have `J-route-coverage` owners, with the focused route coverage run passing 2/2 on port `34200`. Deeper workflow/state owners remain tracked separately under T10/T12/T16.
- Source inventory also found app files that are embedded or retired rather than top-level routes: `DashboardApp.tsx` and `VoiceApp.tsx` are unrouted/retargeted, `MissionControlApp.tsx` is superseded by `CockpitApp`, and `BackupApp.tsx` plus the files/storage subapps are judged through Settings or `/files`.
- Existing five-persona harness: `tests/vision/personas.spec.ts` verifies live persona chat workspaces, persistence, screenshots, and no cross-persona leakage, but it does not score every routed surface or the requested 9/10 UX rubric.
- Companion manifest: `docs/audits/2026-07-08-ux-route-scenario-manifest.md` converts these coverage gaps into a route-by-route and scenario-by-scenario evidence checklist.
- State/failure matrix: `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md` converts account, tier, disclosure, model, data, offline, destructive, responsive, accessibility, and performance state combinations into judge evidence requirements.
- Judge scorecards: `docs/audits/2026-07-08-five-persona-judge-scorecards.md` defines the scoring caps, required screenshots, route evidence, and correction mapping for the five-persona 9/10 gate.
- Judge runbook: `docs/audits/2026-07-08-five-persona-judge-runbook.md` turns the scorecards into an executable evidence protocol with state bundles, route sequences, required screenshots, score caps, deferral records, and an evidence folder shape.
- Source inventory consistency audit: `docs/audits/2026-07-08-source-inventory-consistency-audit.md` rechecks current route, command, app, package, public-site, and Browser Companion extension inventory against source.
- Route evidence T11 analysis: `docs/audits/2026-07-08-route-evidence-t11-analysis.md` adds the AppShell route registry, direct route-reference matrix, route-table command evidence, component evidence for command-only routes, current all-route built-preview smoke evidence, and zero/thin route correction candidates.
- Mobile Executive T2/T12 analysis: `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md` adds 390 x 844 screenshots for Home, Settings general/models/billing/profile, Memory, workspace chat, Command Center, and Workspace Switcher. The original pass proved critical visible controls can clip even when document-level horizontal overflow is clean; current focused Settings verification passes 1/1 on port `34195`.
- First-run onboarding T1/T2/T12 analysis: `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md` adds clean-data desktop and mobile onboarding evidence without skip flags. It confirms the desktop path is functionally complete; sampled T1 console health, mobile Profile reachability, high-volume import CTA risk, model-ready copy, and first-task composer handoff are now focused fixed.
- Shell overlay T10/T12 analysis: `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md` adds fresh desktop/mobile overlay smoke evidence for Keyboard Shortcuts, Persona Switcher, Spawn Agent, Workspace Switcher, Notification Inbox, Create Workspace, and Upgrade Modal, plus source-only findings for Context Rail, Onboarding Tooltips, and Trial Expired Modal.
- Browser Companion T19 analysis: `docs/audits/2026-07-08-browser-companion-t19-analysis.md` adds extension syntax/manifest/server typecheck evidence, disconnected/connected popup screenshots, direct sidecar save evidence, current toolbar/extraction probes, Memory UI confirmation, CORS/auth findings, and line-level T19 findings.
- Desktop wrapper T14 analysis: `docs/audits/2026-07-08-desktop-wrapper-t14-analysis.md` adds refreshed Rust `cargo check`, resource/runtime evidence, app TypeScript evidence, web-side Tauri test command evidence, app service E2E evidence, and a native event consumer matrix.
- Public launch funnel T13 analysis: `docs/audits/2026-07-08-launch-funnel-t13-analysis.md` adds www test/typecheck/build evidence, fresh localhost route/API smoke, rendered Browser checkout-recovery evidence, live canonical-domain DNS failure evidence, GitHub Releases download-target evidence, local checkout fixes, and line-level launch-funnel correction candidates.

Non-main surface scope notes:

- Public site `apps/www` is a real user-facing launch funnel, not just marketing decoration. It has a coherent homepage, skip link, mobile menu semantics, Solo/Team/Enterprise pricing, GET-based Team checkout CTA, cancelled-checkout recovery notice, guarded legal placeholder copy, OS-aware download CTA, historical Lighthouse evidence, and focused component/route tests.
- Public site command evidence now shows 7-file component/route/legal/download/deployment tests, direct TypeScript, and `npm run build:www` passing. The download guard includes mobile/desktop OS-label detection so iOS/Android visitors are not promised desktop installers. The prior GitHub Pages/static artifact mismatch is fixed locally: `deploy-www.yml` now uses Vercel production pull/build/deploy for the dynamic Next app.
- Public site local production route smoke is host-sensitive: `--hostname 127.0.0.1` caused Next middleware proxy failures to `localhost:<port>` on Windows, while `--hostname localhost` rendered the homepage, legal pages, auth pages, `/download`, `/docs/methodology`, and unauthenticated checkout/account redirects. The fresh Browser refresh on `localhost:34204` had 0 console warnings/errors for the fixed pricing recovery state. Real issues remain: canonical DNS failure, missing signed installer/release artifacts, missing deployed Vercel/DNS smoke, formal legal sign-off, and missing deployed Clerk/Stripe checkout evidence.
- Public site gaps found by source inspection and current smoke: the canonical `waggle-os.ai` domain does not currently resolve from the audit environment; a controlled local `/download` status page has replaced the empty GitHub Releases dead end, but real signed installer artifacts are not published; deployment target and real deployed checkout coverage are still thin; formal legal sign-off is not proved. Locally fixed: signed-out Team checkout now uses GET auth continuation, checkout cancel recovery points to `/?checkout=cancelled#pricing` with a retry notice, legal Day-0/stale Pro placeholder copy is guarded, the public Download CTA no longer points to `releases/latest`, mobile/tablet visitors keep a generic Download label instead of a false desktop OS label, and the intentional `html.js` hydration mismatch no longer raises a Next dev issue badge.
- Desktop wrapper `app/` has strong build-resource preflights, static tests, TypeScript checks, Rust `cargo check`, web-side Tauri binding tests, passing service-level startup/chat/workspace E2E, a release workflow guard that builds packages before sidecar packaging, a focused tray-source guard, and a fresh local debug bundle that produced both MSI and NSIS artifacts. Native source directly handles tray Open/focus, close-to-tray, `Ctrl+Shift+W` window visibility, and tray Quit; Settings is bridged to `/settings`; unsupported Pause/About tray actions are hidden. Installed-app UX evidence, signed release trust, published artifact availability, and packaged tray/service/update interaction proof remain open.
- Source search now leaves `waggle://update-available`, `waggle://service-status`, and `waggle://service-restart-needed` as the remaining unconsumed native event families. Tray `waggle://navigate` has a web bridge for `/settings`; `waggle://pause-agents`, `waggle://quit`, and `/about` tray emissions were removed or replaced with native handling.
- The active installed sidecar path is `packages/server/src/local/service.ts` bundled by `scripts/build-sidecar.mjs`, staged into `app/src-tauri/resources/service.js`, and launched by `app/src-tauri/src/service.rs`. The top-level `sidecar/` JSON-RPC code should not be treated as the primary installed desktop runtime unless a current launch path imports it.
- Admin web and CLI/MCP utility surfaces are real user-facing/admin paths: `packages/admin-web`, `packages/cli`, `packages/launcher`, `packages/marketplace`, `packages/memory-mcp`, `packages/hive-mind-mcp-server`, and `packages/hive-mind-cli`. T15 now has its own supplement: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`.
- Utility evidence is no longer merely shallow: marketplace CLI built/installed help/invalid-command behavior plus package manifest/packed-file alignment, launcher built help/invalid-port/occupied-port recovery plus packed first-command, clean installed occupied-port startup recovery, and clean installed long-running `/health` startup, built, packed, and local package-closure installed `@waggle/cli` `npx` help plus installed local REPL startup/slash-command/exit and streamed chat/provider plumbing, sampled hive-mind CLI source/built/installed subcommand help, legacy memory MCP read/write startup plus installed read-only startup, hive-mind MCP write-scope roundtrip plus installed read-only startup, and admin-web unit plus rendered package coverage with local bearer-auth behavior are now locally fixed and guarded. Registry-only proof after internal package publication remains open.
- AI-tool hook packages are real user-facing integration surfaces through Launcher hook install/verify/uninstall. Current package and manifest tests are strong, local packed-package `npx` lifecycle now proves install/verify/uninstall for all six hook-capable packages, focused rendered Launcher smoke covers mixed hook states, a codified rendered Playwright spec covers every hook-capable tool's install/verify/uninstall UI transitions, a gated real-tool Playwright smoke proves OpenClaw rendered detection plus observed launch/output/exit/process cleanup, and a gated route Playwright smoke proves real `/api/tools/hooks` install/verify/uninstall for all six hook-capable tools against an isolated profile with cleanup. The packet still has not proved packaged desktop integration for hook status transitions. `claude-desktop` is intentionally the only non-hook-capable built-in; `packages/hive-mind-hooks-claude-desktop` is a stub/no-bin package, while `codex-desktop` is a thin re-export of the Codex hook package.
- Developer API/background/substrate now has its own supplement: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`. Current evidence is broad and mostly green, including 13/13 direct no-emit typechecks, agent/core/optimizer/weaver package tests, root-run substrate/SDK/shared/WaggleDance/worker/compiler tests, a dedicated server performance lane passing 13/13, a named server release lane passing 185 files / 2128 tests with one worker, hermetic marketplace-sync coverage, and a fixed Playwright `webServer` startup path. T17 remains open for warning hygiene and developer recovery journeys that are not fully sampled.
- Ops/deployment/CI/benchmark/judging now has its own supplement: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`. Config syntax, secret tracking, safe Compose scans, benchmark TypeScript, package-local benchmark tests (29/325), production Compose fail-closed credential guards, explicit Render sidecar-mode guards, root-run benchmark tests, the public-site Vercel workflow guard, and a new blocking five-journey browser smoke pass; deployed Vercel/DNS proof, no live infra lane, LiteLLM live routing, and stale judge artifacts keep T18 open.
- Browser Companion extension `apps/browser-ext` is a real capture surface: a Chrome MV3 popup/content/background flow that saves current page or selection into memory through the local sidecar and `GET /api/browser-ext/health`. Current July evidence now proves syntax, manifest shape, server typecheck, direct sidecar frame creation, content-script extraction from a normal page, secure-default extension token bootstrap during save, background save through `chrome.runtime.sendMessage`, `/api/memory/frames` imported-frame confirmation, direct popup Save selection/Save page button-click saves, context-menu handler behavior, Memory search provenance consistency for imported captures, and rendered Memory UI confirmation after secure popup saves. T19 still does not prove native toolbar-bubble exposure, native context-menu click behavior, packaged pairing, or any separate global-recall provenance shape if it enters scoring.
- These findings are tracked as T13, T14, T15, T16, T17, T18, and T19 in the correction register. They are not Phase 1 unless a Phase 1 verification command directly forces a small supporting fix, but they do block the final "complete UX" claim unless the user explicitly defers them from the score.

Build warnings:

- Fixed 2026-07-09: Tailwind ambiguous motion-token classes `duration-[var(--mo-base)]`, `duration-[var(--mo-fast)]`, and `ease-[var(--mo-ease)]` were replaced with named motion utilities and guarded by `motion-class-hygiene.test.ts`.
- Fixed 2026-07-09: `shape-selection.ts` is no longer dynamically imported by the adapter while also being statically imported by Settings; `build-warning-hygiene.test.ts` guards this boundary.
- Fixed 2026-07-09: route surfaces, closed shell overlays, ChatHost, and PostHog analytics are lazy-loaded. The startup JS chunk dropped from `index-BtS0I3SX.js` at 1,847.38 kB minified / 495.99 kB gzip to `index-D-wAFouW.js` at 421.96 kB minified / 114.08 kB gzip, and the Vite large-chunk warning no longer appears.
- Several persona image assets are roughly 395 to 653 kB each.

Static Web Interface Guidelines scan:

- Line-level supplement: `docs/audits/2026-07-08-web-guidelines-line-findings.md`.
- Native browser dialogs in trust-critical UI: current follow-up scan finds 0 high-confidence production `confirm`/`alert`/`prompt` calls after excluding comments, sanitizer tests, and local callbacks named `confirm`.
- Scoped production UI scan found: 34 `transition-all` hits, 57 `outline-none`/`focus:outline-none` hits, 15 `autoFocus` hits, 11 raw `<img>` hits in cockpit UI, and 114 `new Date(...)` / `toLocale*` hits needing user-visible locale review.
- `transition-all` appears 34 times in scoped cockpit/admin/public UI. Animation polish should replace broad transitions in touched user-facing surfaces with explicit properties.
- `outline-none` appears 57 times in the original scoped scan; many have focus-ring replacements, and the supplement now lists 0 current high-confidence weak or missing visible focus replacements in the reviewed list after focused fixes.
- No `user-scalable=no`, `maximum-scale=1`, or paste-blocking `onPaste` hits were found.
- Static `<img>` search found all inspected hits have `alt`, but image elements commonly rely on CSS sizing instead of explicit `width`/`height`; above-fold and repeated persona/logo images should be included in the performance/CLS pass.
- Loose form metadata scan found 145 text-like controls missing `name`, 107 missing `autoComplete`, and 115 without an obvious same-tag `id`/ARIA label hook. Treat these as a historical T10 audit queue, because custom `Input` components and wrapping labels require contextual inspection; regenerate the counts after the focused fixes before final closeout.
- Implementation update 2026-07-08 T10: Settings model/trust/team/KVARK controls, Profile identity/preferences/brand fields, Chat composer, Vault add-secret controls/actions, Launcher refresh/prompt, Approvals refresh/revoke, Cockpit refresh, WaggleDance refresh, ComplianceDashboard report actions, AgentCard custom delete, All Workspaces search, Wiki search, and Files storage/browser scroll regions now have focused accessible-name/metadata/focus fixes and tests.
- Implementation update 2026-07-09 T10: WorkspaceActionsMenu rename/delete confirmation inputs now have explicit accessible labels, `name`, `autocomplete="off"`, and visible focus rings guarded by `workspace-actions-menu.test.tsx`; the focused menu test now passes 13/13 without React `act(...)` warnings.
- Implementation update 2026-07-09 T10: Command Center search now has a visible token focus ring guarded by `p7-b3-command-center.test.tsx`; the focused Command Center test passes 6/6.
- Implementation update 2026-07-09 T10: warm AskBar input now has `name`, `autocomplete="off"`, and a visible token focus ring guarded by `warm-primitives.test.tsx`; the focused warm primitive test passes 13/13.
- Implementation update 2026-07-09 T10: workspace TasksTab add-task input now has `aria-label`, `name`, `autocomplete="off"`, and a visible token focus ring guarded by `workspace-tasks-tab.test.tsx`; the focused TasksTab test passes 5/5.
- Implementation update 2026-07-09 T10: Timeline event-type filter now has `aria-label`, `name`, hidden decorative icon semantics, and a visible token focus ring guarded by `timeline-app.test.tsx`; the focused Timeline test passes 1/1.
- Implementation update 2026-07-09 T10: Create Workspace template creator Description and Starter Memory textareas now have associated labels, `name`, `autocomplete="off"`, and visible token focus rings guarded by `shell-overlay-contracts.test.tsx`; the focused shell overlay contract passes 10/10.
- Implementation update 2026-07-09 T10: Workspace Switcher focus movement, Tab trap, Escape close, and focus return are now guarded by `shell-overlay-contracts.test.tsx`; the focused shell overlay contract passes 10/10.
- Implementation update 2026-07-09 T10: `MissionControlApp` refresh/pause/resume/stop icon-only controls now have accessible action names and visible token focus rings guarded by `mission-control-a11y.test.tsx`; the focused Mission Control test passes 1/1.

Runtime accessibility smoke:

- Focused supplement: `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`.
- Fresh built-app axe/DOM smoke on port 3423 rendered `/home`, `/settings`, `/settings/profile`, `/memory`, `/workspaces/default-workspace/chat`, `/launcher`, `/mcps`, `/files`, `/approvals`, and Command Center in desktop and 390 x 844 mobile contexts with the standard E2E skip harness.
- Runtime findings from the pre-fix smoke: Settings had critical `button-name` and `select-name` axe findings; Profile had critical `select-name`; Launcher and Approvals had critical unnamed icon buttons; Files had a serious keyboard-inaccessible scroll region; workspace chat had tabpanel semantics and image/preview accessible-text findings; Command Center opened/focused/closed with `Control+k`/Escape but logged a dialog-description warning and overflowed long subtitles on mobile. These sampled findings are now fixed in source and focused tests, and the expanded runtime axe gate is green across 41 desktop/mobile routes.
- The first axe attempt without skip parameters is retained only as a harness caveat because desktop routes can render first-run/auth state instead of the intended app surface.

## Judge Personas

The five judges should test the product as distinct users, not as abstract reviewers. Each judge scores 10 points, with no category below 8 allowed for a pass.

| Judge | Primary scenario | Current estimate | Why not 9 yet |
|---|---|---:|---|
| Solo founder/operator | First run, accountless mode, model setup, Home Start Here, create workspace, first chat | 8.6 | Core flow works, sampled accountless console health is green, and first-run import/model/first-task handoff polish is focused fixed; remaining caps are legacy pricing-copy/state evidence and broader unsampled failure-state proof. |
| Power developer/agent wrangler | Command center, agents, launcher, skills, connectors, MCPs, files, keyboard workflows | 8.1 | Core routes and keyboard contract now pass; remaining caps are marketplace/search determinism, broader keyboard/focus proof, and non-main integration evidence. |
| Team admin/security reviewer | Billing, Team, Approvals, Vault, governance, audit/compliance, restore/backup | 7.8 | Known production native dialogs, sampled console health, and active cockpit pricing copy are fixed; remaining caps are explicit auth-enabled evidence, launch/legal copy, and governance failure-state depth. |
| Memory-heavy researcher | Home continuity, Memory Center, search, frames, wiki, provenance, timeline | 8.5 | Functional and well covered; Artifact permanent delete, Memory Center delete/erase/allow re-import, Wiki export destinations, and seven-view visual snapshots are green. Remaining caps are broader persona-bundle coverage and deeper Memory/chat mobile-state proof. |
| Mobile/tablet executive | Review Home, settings, billing/profile, light/dark, touch/narrow viewport | 7.4 | Home renders, Settings is now green in the focused 390px route check, first-run Profile Continue reachability is green, and Command Center has a described, non-overflowing 390px keyboard path. Remaining cap: Memory/chat tab-strip ownership plus broader touch-state evidence. |

Target pass condition:

- All five judges score at least 9/10.
- No P0 findings remain.
- Full web Vitest, build, rendered audit, and visual snapshots are green or have explicitly approved baseline updates.
- Manual desktop and mobile screenshots show no text clipping, incoherent overlap, or unusable navigation.
- Five-persona live judge gate runs and produces at least 9/10 for every persona. Existing candidate harness: `tests/vision/personas.spec.ts`, which drives five persona workspaces against a real local LLM and writes persona artifacts under `tests/vision/artifacts/personas`.

## Route and Surface Coverage Matrix

This matrix is the current route/app inventory used for coverage. "Evidence" means at least one current test or manual rendered inspection touched the surface in this audit pass; it does not mean the surface is 9/10.

| Surface | Route | Primary component | Main user job | Evidence | Correction focus |
|---|---|---|---|---|---|
| Auth/accountless | `/auth` | `AuthRoute` + Clerk/accountless screens | Sign in or continue local-first | Focused accountless console-health checks pass 3/3 on port `34196`; auth component tests cover no-key and explicit-enabled key shape | Explicit Clerk-enabled rendered state evidence. |
| Home | `/home` | `HomeCockpit` | Daily briefing, Start Here, recent work | Rendered desktop/mobile + tests | Preserve as anchor surface. |
| All workspaces | `/workspaces` | `AllWorkspacesApp` | Browse/create/manage workspaces | Route inventory + passing tests | Modal/native confirm polish. |
| Workspace | `/workspaces/:workspaceId/:tab?` | `WorkspaceDesktopApp` + `ChatSlot` | Chat, files, memory, tasks per workspace | Passing journey/API tests | Shortcut contract, workspace context clarity. |
| Memory | `/memory/:mindScope?` | `MemoryCenterApp` | Search, trust, wiki, provenance, evolution | Passing tests, rendered `J3f` delete/erase/re-import confirmations on port `34164`, rendered `J3g` Wiki export forms on port `34167`, and expanded user journeys pass 24/24 on port `34177` | Visual baseline, form/a11y pass, failure states, and broader persona-bundle evidence. |
| Artifacts | `/artifacts` | `ArtifactCenterApp` | Agent-produced documents/files | Passing smoke plus rendered `J3e` permanent-delete confirmation on port `34161`; latest expanded user journeys pass 24/24 on port `34177` | Archive/empty/error states and broader persona-bundle evidence. |
| Files | `/files` | `StorageAndFilesApp` | Browse workspace files/storage | Passing smoke/stress; cross-workspace file copy now passes API and drag-interaction regression tests | Folder cross-workspace copy is explicitly constrained to files; file action confirmations and empty states remain in the broader judge lane. |
| Agents | `/agents` | `AgentsApp` | Create/manage agents/groups/templates | Passing smoke/stress | Form labels, async test warnings. |
| Automations | `/automations` | `AutomationCenterApp` | Scheduled jobs | Passing unit/route tests; delete confirmation now has focused component evidence | Builder form semantics and broader automation states. |
| Skills | `/skills` | `CapabilitiesApp` | Installed skills and skill marketplace | Passing smoke; marketplace flake | Pricing copy, marketplace loading determinism. |
| Room | `/room` | `RoomApp` | Watch agents work together | Passing smoke | Empty/running state polish. |
| WaggleDance | `/waggle-dance` | `WaggleDanceApp` | Shared signal/swarm view | Route/API coverage | Clarify discoverability and value copy. |
| Approvals | `/approvals` | `ApprovalsApp` | Review agent actions/grants | Passing smoke plus rendered `J3d` revoke-all confirmation on port `34159`; latest expanded user journeys pass 24/24 on port `34177`; refresh and per-grant revoke icon buttons have focused accessible-name coverage | Approve/deny and individual revoke states still need final persona-bundle evidence. |
| Connectors | `/connectors` | `ConnectorsApp` | Connect external apps/accounts | Passing smoke/API | Credential setup clarity, error state polish. |
| MCP Hub | `/mcps` | `MCPHubApp` | Manage MCP servers | Passing smoke | Pro/Solo/Team copy, custom MCP form labels. |
| Marketplace | `/marketplace` | `MarketplaceApp` | Browse/install extensions | Passing smoke; one API flake | Pro copy, live sync determinism. |
| Launcher | `/launcher` | `LauncherApp` | Launch linked AI tools/hooks | Current all-route smoke renders `/launcher` and `/launcher?watch=1`; focused T16 Browser smoke renders mixed hook states against a mock local API; Playwright rendered coverage proves standard install changed-file/pointer/backup/recovery labels, all six hook-capable install/verify/uninstall transitions, sidecar-offline Retry, long-stderr summarization, non-built-in adapter launch-only/prompt behavior, and real OpenClaw observed launch/output/exit/process cleanup; refresh and optional prompt controls have focused accessible-name/metadata coverage; packed-package `npx` lifecycle is proven for all six hook-capable packages; gated route evidence proves real `/api/tools/hooks` install/verify/uninstall for all six hook-capable tools against an isolated profile | Packaged app hook-status integration remains. |
| Team | `/team` | `TeamGovernanceApp` | Team rules/permissions | Passing smoke/API | Gating copy, admin trust states. |
| Settings | `/settings` | `SettingsApp` | General/model/billing/backup/system settings | Passing desktop/mobile focused checks plus rendered `J3h` backup/restore trust path on port `34171`; latest expanded user journeys pass 24/24 on port `34177`; Prompt Shape, telemetry, daily budget, mutation gate, team, and KVARK controls have focused accessibility metadata coverage | Deeper mobile overlay paths, remaining settings tabs/states, and persona-state evidence. |
| Vault | `/settings/vault` | `VaultApp` | Store API keys/secrets | Passing smoke/API | Error/success states, labels. |
| Profile | `/settings/profile` | `UserProfileApp` | Identity/profile preferences | Runtime axe gate and focused tests cover identity, preference, brand, writing-style, and language controls | Broader profile-state edge cases. |
| Mission Control | `/settings/mission-control` | `CockpitApp` | Health/cost/activity cockpit | Runtime axe gate covers route; Cockpit refresh and ComplianceDashboard actions are named | Visual baseline and responsive fit. |
| Timeline | `/settings/timeline` | `TimelineApp` | Activity history | Passing smoke | Empty/loading state polish. |
| Events | `/settings/events` | `EventsApp` | Live logs/events | Passing smoke; visual failure | Filter ergonomics and visual baseline. |
| Usage & Cost | `/settings/usage` | `TelemetryApp` | Spend/token visibility | Current all-route smoke renders Team-tier gate but logs a 403 resource error | Unknown local model pricing entry and expected-vs-error resource semantics. |
| Benchmarks | `/benchmarks` | `BenchmarkApp` | Capability/memory benchmark view | Component tests plus codified `J-route-coverage` route smoke passing on port `34200` | Non-sidebar discoverability and benchmark interpretation depth. |
| Platform | `/platform` | `PlatformApp` | Platform/roadmap info | Component tests plus codified `J-route-coverage` route smoke passing on port `34200` | Non-sidebar discoverability and judged-scope/value clarity. |
| Payment success | `/payment-success` | `PaymentSuccessApp` | Checkout return state | Current all-route smoke renders no-checkout fallback | Legacy Pro display context and completed Teams checkout-return state. |
| Payment cancelled | `/payment-cancelled` | redirect to Settings billing | Recover from cancelled checkout | Codified `J-route-coverage` proves redirect to `/settings?tab=billing` and billing recovery copy on port `34200` | Completed checkout-cancel recovery state depth. |
| Not found | `*` | `NotFound` | Recovery from bad route | Current all-route smoke renders branded recovery but logs the expected bad route as a console error | Keep recovery link visible and classify expected 404 logging outside critical console failures. |
| Command Center | `Ctrl+K` overlay | `CommandCenter` | Search/routes/actions | Passing journey/stress plus described/no-overflow 390px mobile proof | Pro wording in pinned group. |
| Workspace Switcher | Sidebar/Ctrl+Tab overlay | `WorkspaceSwitcher` | Pick/create workspace | T4 traversal guard passes 1/1 on port `34198`; mobile open/close evidence exists | Broader less-common overlay states and focus-return evidence. |
| Persona Switcher | `Ctrl+Shift+P` overlay | `PersonaSwitcher` | Switch active persona/group | Fresh shell overlay smoke passes desktop open/Escape close | Keep current labelled/focus-trapped behavior covered. |
| Spawn Agent | New Agent overlay | `SpawnAgentDialog` | Start an agent run | Fresh shell overlay smoke passes desktop/mobile open and desktop Escape close | Form labels and model fallback clarity. |
| Notification Inbox | Status/sidebar entry | `NotificationInbox` | Review alerts | Fresh shell overlay smoke fails Escape close and semantics | Add labelled panel/dialog semantics, named icon actions, and keyboard close proof. |
| Create Workspace | Workspace Switcher/New workspace | `CreateWorkspaceDialog` | Create a workspace | Fresh shell overlay smoke fails Escape close/semantics; mobile first viewport is template-heavy | Add modal semantics/focus handling, named icon actions, and mobile-first creation hierarchy. |
| Context Rail | Chat/context action | `ContextRail` | Inspect selected context | Source-only overlay finding | Add labelled landmark, named close action, and keyboard/open-close evidence. |
| Onboarding Tooltips | Post-onboarding coach marks | `OnboardingTooltips` | Explain first actions | Source-only overlay finding | Decide modal vs non-modal semantics and prove it never blocks task flow. |
| Onboarding Wizard | `forceWizard`/first run | `OnboardingWizard` | First launch setup | Passing tests plus clean-data smoke on port 3431; focused T1/mobile checks pass on ports `34196`/`34194`; high-volume import CTA coverage passes 2/2; model/first-task handoff tests pass 17/17 | Desktop completion works; remaining first-run risk is broader state/recovery evidence, not the sampled CTA/copy/handoff polish. |

## Usage Scenarios Covered

### First Run and Account

Covered surfaces:

- Boot/briefing skip paths
- Accountless app behavior
- Optional Clerk wrapper
- Onboarding Wizard
- Model gate
- Memory import
- Template selection
- First task setup

Risk:

- The optional Clerk wrapper is conceptually right: no key means accountless, key means Clerk. The original built local app picked up a real publishable key and then hit CSP/script loading errors; current sampled accountless console-health checks pass 3/3 on port `34196`.

Correction:

- Make deterministic local/accountless audit mode impossible to accidentally override with `apps/web/.env.local`.
- Either permit Clerk's configured frontend API in CSP when Clerk is intended, or keep Clerk fully disabled in desktop/local/offline accountless mode.
- Re-run the console-error audit until it passes.

### Home and Daily Continuity

Covered surfaces:

- Home route
- Start Here
- While you slept
- Recent workspace
- Mobile Home

Result:

- Home is one of the strongest parts of the product. Desktop and mobile screenshots were coherent and usable. This should remain the anchor surface for first daily use rather than creating a new surface for continuity work.

Correction:

- Preserve Home as the default daily cockpit.
- Do not introduce a separate "dashboard" unless a specific missing workflow proves Home cannot own it.

### Workspace, Chat, Files, and Artifacts

Covered surfaces:

- Workspace route
- Chat textarea and model/persona visibility
- File manager smoke
- Artifact center smoke
- Workspace management overlays

Result:

- Automated journey tests pass. The shell opens the primary working surfaces reliably.

Risks:

- Some creation/edit flows rely on dense modal content and keyboard-only handlers.
- The current production native-dialog scan is clean; sampled Artifact permanent-delete, Memory Center delete/erase/re-import, Settings telemetry/backup/restore, Wiki export, Automation delete, compliance template delete, admin member removal, BackupApp restore, and Create Workspace custom-template delete paths now use in-app confirmations/forms/status.

Correction:

- Standardize destructive workspace/file/artifact actions on the in-app confirmation pattern with focus management and clear consequences.

### Memory, Wiki, Trust, and Provenance

Covered surfaces:

- Memory route
- Empty/non-empty memory states
- Memory Center
- Wiki export forms
- Trust management references
- Evolution tab references

Result:

- The memory app is functional in tests and appears integrated with the main navigation.

Risks:

- Memory Center delete, GDPR erase, allow re-import, and Wiki Obsidian/Notion export destinations now use in-app confirmations/forms.

Correction:

- Replace remaining prompt/confirm flows with in-app modals or dedicated inline forms.
- Keep destructive actions on the branded confirmation pattern and allow safe cancel/undo where possible.

### Agents, Personas, and Automations

Covered surfaces:

- Agents route
- Spawn Agent dialog
- Persona Switcher
- Automation Center
- Agent groups/builders

Result:

- Tests cover and pass important agent/automation surfaces.

Risks:

- Test output includes React `act(...)` warnings in several app surfaces, including workspace, model gate, settings, automation, and templates.
- Some form labels are visually present but not consistently associated with inputs.

Correction:

- Fix test async warnings so regressions are easier to see.
- Run a focused accessibility pass over forms, labels, and keyboard flows.

### Skills, Connectors, MCP, Marketplace, and Launcher

Covered surfaces:

- Skills Hub
- Connector Hub
- MCP Hub
- Marketplace
- Launcher
- Command catalog

Result:

- Deep app smoke tests pass. The high-level IA is understandable: the sidebar stays simple and command center exposes hidden depth.

Risks:

- Original source scans found user-facing Pro gate copy in cockpit Marketplace/MCP/Skills/Settings surfaces where current strategy says Solo/Team.
- Current source search finds remaining cockpit `Pro` references only in explicit legacy billing compatibility, tests/comments, or model names. Public legal Pro copy remains tracked under launch-funnel T13.

Correction:

- Audit all rendered billing/gating text and normalize it to Solo/Team/Enterprise.
- Keep "legacy Pro" only where the user is already a legacy Pro subscriber and the context is explicitly billing history.

### Team, Approvals, Billing, Vault, Backup, and Compliance

Covered surfaces:

- Team Governance
- Approvals
- Settings billing
- Settings vault
- Backup/restore
- Compliance dashboard/template flows

Result:

- Smoke tests pass, but trust-critical flows need UX cleanup.

Risks:

- The sampled Approvals revoke-all, Settings backup/restore, standalone BackupApp restore, Automation delete, compliance template delete, and admin-web member removal paths now use in-app confirmation/status patterns.
- Settings and standalone BackupApp backup/restore success and failure now use inline status/approval patterns for the sampled paths.

Correction:

- Move trust-critical feedback into the app UI.
- For backup/restore, show stateful progress, failure details, and next required action in the page, not a browser alert.

### Settings and Narrow Viewports

Covered surfaces:

- Settings route
- Settings tabs
- Model/provider settings
- Billing/profile/vault/system settings
- Mobile Settings at 390 x 844

Result:

- Desktop Settings is generally coherent.
- Mobile Settings was a major original blocker: the tab rail and content panel stayed side by side, leaving a narrow content column. Current focused Settings verification is green on port `34195`; broader mobile polish still needs Memory/workspace-chat tab ownership.

Correction:

- Add a responsive Settings layout:
  - On narrow widths, tabs should become a top segmented control, horizontal scroll tab bar, or drawer.
  - Content should use the full width.
  - Provider/model cards should stack to one column.
  - No inner horizontal scrollbar should be required for core settings.

## Findings and Correction Backlog

### P0-1: Accountless Clerk/CSP console health (verified fixed)

Evidence:

- `tests/e2e/full-product-audit.spec.ts:360` asserts no critical console errors.
- The built app failed this check.
- Console errors included CSP inline script blocking, Clerk script blocking, and Clerk load timeouts.
- `apps/web/src/lib/clerk.ts:41` reads `VITE_CLERK_PUBLISHABLE_KEY`.
- `apps/web/src/providers/WaggleClerkProvider.tsx:21` mounts `ClerkProvider` when a key is present.
- Current verification update: `clean first-run onboarding loads without Clerk, CSP, or page errors`, `no console errors on initial load`, and `no critical console errors on load` passed 3/3 on port `34196`.

Why it matters:

- Trust and first-run stability are part of the UX. A product can look usable and still fail a buyer/admin judge if it emits auth/security errors at boot.
- The sampled accountless path no longer carries this cap; explicit Clerk-enabled rendered auth still needs state evidence.

Correction:

- Define one deterministic local/offline/accountless mode for desktop and test harnesses.
- Prevent local `.env.local` from accidentally enabling Clerk during accountless verification.
- If Clerk is enabled, align CSP with the configured Clerk frontend API and remove inline script violations.
- Re-run the full-product audit until "no critical console errors on load" passes.

Acceptance:

- No critical console errors on initial load.
- Auth/accountless behavior is visible and intentional.
- No app blanking if Clerk is unavailable.
- Current focused accountless evidence passes this acceptance on port `34196`.

### P0-2: Mobile Settings structural usability (verified fixed)

Evidence:

- `apps/web/src/components/os/apps/SettingsApp.tsx:221` renders Settings as `flex h-full`.
- `apps/web/src/components/os/apps/SettingsApp.tsx:225` keeps a fixed `w-36` tab sidebar.
- `apps/web/src/components/os/apps/SettingsApp.tsx:259` renders content in the remaining width.
- At 390 x 844, the content panel was squeezed to roughly half the screen and provider cards clipped.
- Fresh mobile smoke on port 3419 captured `output/playwright/mobile-executive-3419/settings.png`, `settings-tab-models.png`, `settings-tab-billing.png`, and `settings-profile.png`. It found no document-level overflow, but Settings header disclosure controls, model controls, and billing controls still visibly overflowed or became unreadably narrow.
- Current verification update: `J-mobile: Settings is usable at 390px width` passed 1/1 on port `34195`; the test checks `/settings`, `/settings?tab=models`, `/settings?tab=billing`, and `/settings/profile` for document-level overflow and visible control bounds.

Why it matters:

- A mobile/tablet judge cannot score this 9/10 even if desktop is polished.

Correction:

- At small breakpoints, convert Settings to a single-column layout.
- Move Settings tabs to a top tab strip, drawer, or select-style control.
- Stack provider/model cards and remove internal horizontal scrolling for primary content.

Acceptance:

- Mobile Settings has no document-level or main-panel horizontal overflow and no critical visible element overflow. Current focused evidence passes this acceptance on port `34195`.
- Labels, provider names, badges, and action buttons are readable at 390 px width.
- Desktop layout remains unchanged except for intentional polish.

### P0-3: Cockpit pricing copy uses Solo/Team/Enterprise (verified fixed)

Original evidence:

- `apps/web/src/components/os/apps/MarketplaceApp.tsx:65`: marketplace MCP note says "Pro".
- `apps/web/src/components/os/apps/mcp/AddCustomMcpForm.tsx:79`: custom MCP form originally said legacy Pro was required.
- `apps/web/src/lib/command-catalog.ts:113`: command group heading originally used legacy Pro wording.
- `apps/web/src/components/os/overlays/LoginBriefing.tsx:351` and `:358`: account/team copy originally mixed legacy Pro with Teams/Enterprise.
- `apps/web/src/components/os/apps/skills/SkillRow.tsx:55`: verified badge title says "PRO".
- `apps/web/src/components/os/apps/SettingsApp.tsx:335`: local-first reassurance originally mixed legacy Pro with Teams.
- Current verification update: source search over the named cockpit files and `apps/web/src` finds remaining `Pro` references only in explicit legacy billing contexts (`Legacy Pro`, `Pro (legacy)`), tests/comments, or model/provider names. Public legal Pro copy is tracked separately under T13.

Why it matters:

- The current strategic model is Solo/Team/Enterprise, with legacy Pro mapped to Solo. Mixed copy harms comprehension and buyer confidence.

Correction:

- Replace user-facing Pro copy with Solo/Team/Enterprise language.
- Keep "legacy Pro" only in billing contexts where a legacy subscriber is being serviced.
- Add/extend tests for rendered plan copy in Marketplace, MCP, LoginBriefing, Settings, command catalog, and skill rows.

Acceptance:

- A text search for user-visible Pro copy returns only explicit legacy billing contexts and comments/tests.
- Solo users understand what is free.
- Team upgrade triggers are clear and consistent.
- Current cockpit evidence passes this acceptance; public launch/legal copy remains separate.

### P0-4: Visual regression suite for tracked views (verified fixed)

Evidence:

- `tests/visual/views.spec.ts:12` tracks chat, memory, events, capabilities, cockpit, mission-control, and settings.
- `tests/visual/views.spec.ts:139` asserts screenshots for both dark and light.
- All 14 snapshots failed in the original rendered run, then passed in the current T5 verification run: 14/14 on port `34199`.
- Fresh T5 rerun on port 3463 preserved artifacts under `output/playwright/visual-t5-3463/test-results/`; exact classification lives in `docs/audits/2026-07-08-visual-t5-classification.md`.
- Actual screenshots were coherent in desktop dark and light mode. The original failures were classified mostly as stale-baseline drift after intentional surface changes, not a broad UI break.
- `tests/visual/baselines/` also contains duplicate historical baseline families; the active runner uses the ASCII-hyphen `Visual-Regression---...` folders, and the duplicate-family finding is documented in the T5 classification note.

Why it matters:

- The goal explicitly requires polished, well-designed UX. A failing visual suite removes objective evidence that the app stayed polished.

Correction:

- Keep current intentional surfaces instead of rolling UI back to old snapshots.
- Preserve the stabilization-only masking in `tests/visual/views.spec.ts` so visual snapshots compare layout and presentation, not volatile Home copy.
- Keep the duplicate baseline-family note in `docs/audits/2026-07-08-visual-t5-classification.md` until the historical folders are intentionally archived or removed.

Acceptance:

- Visual suite passes in dark and light; current focused evidence is 14/14 on port `34199`.
- Baseline updates and volatile-field masking are intentional and documented.
- The active baseline family is documented; duplicate historical folders are not used by the current runner.

### P0-5: `Ctrl+Shift+N` route contract (verified fixed)

Evidence:

- `tests/e2e/phase-ab-verification.spec.ts:132` expects `Ctrl+Shift+N` to navigate to `/workspaces/:id/chat` when any workspace exists.
- `tests/e2e/power-user-stress.spec.ts:215` expects the same shortcut to open the active workspace chat route and reveal the chat input.
- Both tests failed on initial run and retry, then passed in the focused T4 re-check: 2/2 on port `34197`.
- `apps/web/src/hooks/useKeyboardShortcuts.ts:75` calls `onNewChatWindow` for `Ctrl+Shift+N`.
- `apps/web/src/components/os/AppShell.tsx:140` routes to chat only when `effectiveActiveWorkspaceId` exists; otherwise it opens the Workspace Switcher.

Why it matters:

- Power users rely on keyboard promises. A shortcut that sometimes opens a modal instead of the expected work surface feels broken, even when the fallback is intentional.

Correction:

- Product contract now follows Option A: `Ctrl+Shift+N` opens the active or first available workspace chat rather than leaving the user in an ambiguous chooser state when a workspace exists.
- Keep code, tests, keyboard help, and command-center copy aligned to that contract.

Acceptance:

- Both E2E shortcut tests pass against the approved contract.
- No modal remains open after a successful shortcut route.
- The chat input is visible after the shortcut when a workspace is available.

### P0-6: Workspace Switcher route traversal (verified fixed)

Evidence:

- `tests/e2e/full-wiring-audit.spec.ts:553` originally timed out while traversing sidebar views.
- Error context shows the `Switch Workspace` dialog remained open and its backdrop intercepted clicks on the `Memory` sidebar item.
- Screenshot artifact: `test-results/e2e-full-wiring-audit-Full-adf22-s-—-zero-critical-JS-errors-chromium/test-failed-1.png`.
- Current verification: `traverse all sidebar views - zero critical JS errors` passed 1/1 on port `34198`.

Why it matters:

- This is a real UI state, not just a test artifact. A modal that persists across expected navigation blocks the primary shell and creates a "why won't the app move?" moment.

Correction:

- Ensure route-changing sidebar actions close or supersede workspace-selection overlays when appropriate.
- If the switcher opens because Chat has no explicit workspace, make its next step unambiguous and focus-safe.
- Add regression coverage for "open workspace switcher -> click Memory/Home/Settings -> modal closes or navigation is intentionally blocked with clear reason."

Acceptance:

- Full console traversal can visit key sidebar routes without pointer interception; current focused evidence passes on port `34198`.
- Users always have a visible close path and the shell never feels frozen behind the overlay.

### P0-7: Mobile first-run onboarding primary action reachability (verified fixed)

Evidence:

- Fresh clean-data onboarding smoke on port 3431 captured `output/playwright/first-run-onboarding-3431/mobile-00-welcome.png` and `mobile-01-profile-empty.png`.
- Mobile Welcome fits and communicates the product promise clearly.
- Mobile Profile is taller than the initial 390 x 844 viewport; the primary Continue button starts below the visible area.
- Trace evidence records the Continue button bottom at `880` in an `844` px viewport.
- The same smoke completed the desktop first-run path through `/workspaces/research-hub/chat`, so this is a responsive onboarding issue, not a general onboarding dead end.
- Current verification update: `J-mobile: first-run onboarding keeps primary actions reachable at 390px width` passed 1/1 on port `34194`; the test asserts the Profile Continue button is within the 844 px viewport, checks visible overflow, and guards Clerk/CSP/page errors.

Why it matters:

- First-run setup is a primary Solo Founder and Mobile Executive route. The hidden-primary-action cap and sampled T1 console-health cap are currently closed for the Profile/accountless path, but remaining handoff polish can still cap the journey.

Correction:

- Make the Profile step mobile-first: reduce vertical density, split optional details, or use a sticky action row inside the wizard.
- Keep progress/title context and primary action visible or clearly reachable at 390 x 844.
- Add visible-bounds evidence for first-run onboarding, not only skipped-shell routes.

Acceptance:

- 390 x 844 clean-data onboarding Profile has no clipped critical controls and the primary Continue action is visible, sticky, or deliberately signposted. Current focused evidence passes this acceptance on port `34194`.
- Desktop first-run completion still reaches the chosen workspace chat and auto-sends the first task.

### P1-1: Native browser dialogs interrupt branded workflows

Evidence:

- `packages/admin-web/src/pages/Members.tsx:72`
- Historical fixed: `apps/web/src/components/os/apps/BackupApp.tsx:79`
- Historical fixed: `apps/web/src/components/os/apps/AutomationCenterApp.tsx:184`
- Historical fixed: `apps/web/src/components/os/apps/cockpit/ComplianceTemplateModal.tsx:155`
- Historical fixed: `apps/web/src/components/os/apps/SettingsApp.tsx:399`, `:893`, `:901`, `:911`, `:921`, `:922`, `:925`

Implementation update 2026-07-08:

- Create Workspace custom-template delete now uses an in-app confirmation.
- Approvals revoke-all grants now uses the shared in-app `ApprovalModal`, with focused component coverage, rendered `/approvals` `J3d` evidence on port `34159`, and latest expanded user-journey evidence passing 22/22 on port `34165`.
- Artifact permanent delete now uses the shared in-app `ApprovalModal`, with focused component coverage, rendered `/artifacts` `J3e` evidence on port `34161`, and latest expanded user-journey evidence passing 22/22 on port `34165`.
- Memory Center permanent delete, GDPR erase, and allow re-import now use the shared in-app `ApprovalModal`, with focused component coverage, rendered `/memory?tab=memories` `J3f` evidence on port `34164`, and latest expanded user-journey evidence passing 22/22 on port `34165`.
- Wiki Obsidian and Notion exports now use in-app form dialogs, with focused component coverage, rendered `/memory?tab=wiki` `J3g` evidence on port `34167`, and the path remains included in latest expanded user-journey evidence passing 24/24 on port `34177`.
- Settings telemetry clear, backup failure, and restore success now use in-app approval/status states, with focused component coverage, rendered `/settings?tab=backup` `J3h` evidence on port `34171`, and latest expanded user-journey evidence passing 24/24 on port `34177`.
- Standalone `BackupApp` restore now uses the shared in-app approval modal, with focused component coverage in `p1b-authgate-surfaces.test.tsx`.
- Automation delete now uses the shared in-app approval modal, with focused component coverage in `phase3b-automation-center.test.tsx`.
- Compliance template delete now uses the shared in-app approval modal, with focused component coverage in `compliance-template-trust.test.tsx`.
- Admin-web member removal now uses an in-app confirmation panel, with focused coverage in `admin-pages.test.ts`.

Why it matters:

- Native dialogs feel outside the product, block focus in unpredictable ways, and are weakest exactly where the product needs trust: delete, restore, revoke, export.

Correction:

- Use a shared in-app confirm/result dialog for destructive and recovery flows.
- Use inline fields or modal forms instead of `prompt()`.
- Use toasts or inline status blocks for backup/restore results.

Acceptance:

- No native confirm/alert/prompt remains in shipped UX-critical paths.
- Keyboard and screen reader behavior is deliberate.

### P1-2: Test output is too noisy

Evidence:

- Full Vitest passes but emits repeated React `act(...)` warnings.
- Node emits repeated `[DEP0040] punycode` warnings.
- Some tests intentionally log expected adapter/server errors.

Why it matters:

- Noisy green tests train reviewers to ignore output. That lowers confidence during a UX polish arc.

Implementation update 2026-07-10:

- The E2E harness removes inherited `FORCE_COLOR`/`NO_COLOR` conflicts for both the Playwright worker and web-server child, suppresses the expected mock-embedding banner only in the harness, and keeps local Ollama cost tracking explicitly free. A fresh built-app J1 smoke passed 1/1 on port `34315` with no color, embedding, or pricing warnings. Both the web and public `apps/www` Vitest configs now propagate the narrow Node `DEP0040` suppression to worker processes; the public full local suite passes 8 files / 21 tests without punycode warnings, and the new Files drag lane passes 2/2 cleanly.

- Files workspace-rail dead end closed: `POST /api/workspaces/:targetWorkspaceId/files/copy` accepts a validated `sourceWorkspaceId` for file-only cross-workspace copies, preserves source data, indexes the target as usual, and returns an actionable 400 for folder drops. The existing API suite passes 33/33; the Files interaction suite passes 2/2 with success and folder-recovery coverage.

- Fresh post-fix browser evidence: five-persona state bundles pass 5/5 on port `34316`; runtime axe passes 2/2 on port `34317` across the desktop and 390px mobile route set. The changed build completed before both runs.

- Fresh broad browser refresh with the test base URL aligned to each fresh server: `full-product-audit.spec.ts` passes 40/40; `full-wiring-audit.spec.ts`, `user-behavior.spec.ts`, and `power-user-stress.spec.ts` pass 133/133; visual dark/light, boot, light-mode, and polish coverage passes 32/32 with one intentional skip. The earlier 3 desktop-shell failures were harness-only wrong-port navigations, not product failures.

- Model setup UX correction: the shared `ModelGate` now scrolls and focuses the selected provider's key field after a tile click, so the same onboarding and Settings path remains actionable on compact/mobile layouts instead of leaving the field below a long provider grid. ModelGate + onboarding coverage passes 28/28; rebuilt-app five-persona and axe checks pass 5/5 and 2/2 on port `34323`.

- API-key persistence correction: the Settings save path is now Vault-only for secrets, with provider models/base URLs retained as non-secret metadata; startup migration moves legacy config keys to Vault and scrubs their plaintext values. Settings API coverage passes 44/44, provider/migration coverage passes 18/18, and the server package typecheck passes.

- Channels integration evidence from the committed `main` integration worktree: Telegram, Discord, Slack, WhatsApp, pairing, manager, and loopback chat suites pass 7 files / 79 tests; `ChannelsSettings.test.tsx` passes 7/7; server typecheck passes. Real bot-token delivery, WhatsApp device pairing, and live NAT/transport behavior remain external verification items.

- Expanded accessibility correction: the 41-route desktop/mobile axe matrix is green 2/2 on fresh port `34333` after fixing workspace-card semantics and nested actions, contrast in workspace/platform/billing/usage states, heading order, and keyboard-focusable scroll regions. The harness waits for lazy content and the shell entrance transition before sampling so transient dialog animation does not create false contrast findings; each viewport test has a bounded 150-second budget.

- Current five-persona state-bundle rerun: `tests/e2e/five-persona-state-bundles.spec.ts` passes 5/5 on fresh port `34334` for Solo Founder, Researcher, Engineer / Power User, Team Admin / Security Reviewer, and Mobile Executive. The run keeps the declared account/tier/model/data/offline state fields and the sampled failure, recovery, scale, billing, backup, approvals, launcher, memory, and mobile probes green; it is technical evidence, not subjective 9/10 judge sign-off.

- Files workspace-switch correction (2026-07-10): Files freshness is now keyed by the complete `workspaceId + directory` route, so the workspace rail cannot present the previous workspace's rows as current while a switch is loading. Per-route session cache also preserves resolved empty directories and optimistic file operations for warm remounts. The focused Files/cross-workspace/deep-link/storage slice passes 25/25, including an explicit stale-workspace regression; web typecheck passes.

- Remaining judge-nit correction (2026-07-10): the Platform surface's small uppercase top label now uses the established muted eyebrow tier in light mode instead of the dim tier. Platform coverage passes 4/4, and the full web gate after the correction passes 206 files / 1,718 tests.

- Motion verification correction (2026-07-10): Home's cache delta pulse used a three-keyframe scale array with a spring transition, which produced an asynchronous Framer Motion exception under jsdom. It now uses the shared timed easing token for keyframes. Home motion/cache coverage passes 13/13; the complete web gate passes 207 files / 1,724 tests with zero unhandled errors. Known React `act()` and Router future-flag warnings remain test-hygiene debt, not product failures.

- Browser Companion honesty correction (2026-07-10): Settings no longer labels Browser AI extensions as fully covered while native toolbar/context-menu evidence is open. The Coverage Compass now marks that row `partial` with explicit popup/capture coverage and pending native entry points; its focused regression passes 1/1.

- Follow-up UX correction (2026-07-10): opacity-diluted uppercase labels in Home, Agents, Marketplace, Artifact Center, Launcher, Login Briefing, Persona Switcher, WaggleDance, and MCP cards now use the guaranteed `--honey-text`/`--text-tertiary`/status tokens. The semantic color guard passes with no new offenses, and the affected focused lanes plus the full web suite are green.

- Cache-first return correction (2026-07-10): Connectors, MCP Hub, Artifact Center, Approvals, and Launcher now retain resolved session data while their route remounts and silently revalidates. Artifact cache keys include workspace, search, kind, and status, preventing cross-view stale rows; focused cache-return coverage passes 8 files / 71 tests.

- Onboarding affordance correction (2026-07-10): inactive Who Are You chips now use a visible line-affordance border, guaranteed tertiary text, and focus-visible ring target instead of relying on color alone. The focused onboarding lane passes 14/14 and the full web gate passes 207 files / 1725 tests.

- Model setup recovery correction (2026-07-11): the shared onboarding/Settings `ModelGate` now surfaces provider-catalog failures with service-aware copy and a Retry action. This closes the first-run dead-end where a failed `/api/providers` request left users with an empty grid and no way to add a key. Focused ModelGate + onboarding coverage passes 27/27; web typecheck passes. The desktop service/update event bridge was re-audited in the same pass and is already wired and covered by binding tests.

- API-key setup rendered verification (2026-07-11): fresh-port Playwright coverage now exercises the actual onboarding and Settings surfaces, not only mocked component behavior. Both paths select Anthropic, focus the password field, submit a format-valid test key through `test-key`, record the provider payload sent to the canonical `/api/settings` Vault path, show saved feedback, and confirm onboarding Continue becomes enabled. The lane passes 2/2 on port `34382`; live provider acceptance with a real credential remains an external verification concern.

- Provider model catalog correction (2026-07-11): the provider route and browser-side registry no longer contain a built-in model inventory. Configured provider APIs are queried for their complete returned model list; new entries are normalized to stable `provider/model` ids, merged into `/api/litellm/models`, and retained as an explicitly labelled stale catalog during outages. Provider and Chat catalogs refresh when Waggle regains focus. Selecting or saving an id missing from the running managed config regenerates the catalog and restarts the router once before Chat, scheduled work, or fleet execution receives it; existing ids do not restart. The latest incremental hot-model lane passes 27/27 backend tests and 3/3 web tests, alongside the existing ModelGate/onboarding lane. Real provider credentials plus one paid live completion remain external release evidence only.

- Create Workspace mobile disclosure correction (2026-07-11): optional agent assignment is now collapsed by default so workspace name, storage, and creation remain the primary path at 390 x 844. The existing selected template/persona still appears in the summary, and the full picker expands with an explicit control; closing and reopening resets the optional disclosures. Focused shell-overlay contracts pass 15/15, the full web gate passes 207 files / 1726 tests, web typecheck passes, and the rendered `J-mobile` journey passes 1/1 on fresh port `34380`. Broader modal-state screenshots and focus-return coverage remain open.

Correction:

- Fix async state updates in affected tests/components.
- Suppress only explicitly expected logs inside tests that assert error handling.
- Track dependency source of `punycode` warning or filter it in test setup with a comment if upstream-only.

Acceptance:

- Full web test run is green with minimal expected warning noise.

### P1-3: Marketplace and local-first test determinism need tightening

Evidence:

- `tests/e2e/full-wiring-audit.spec.ts:501` failed once because marketplace search returned non-OK, then passed on retry.
- `tests/e2e/waggle-complete.spec.ts:388` triggered `POST /api/marketplace/sync`, which performed live external sync and took 34.4s.
- The sync logged multiple external source errors even though the harness had `WAGGLE_DISABLE_MARKETPLACE_SYNC=1`.
- Current server fix: `POST /api/marketplace/sync` now respects `WAGGLE_DISABLE_MARKETPLACE_SYNC=1` and returns a no-network skipped response. The focused red/green regression passed, and the combined manual/background sync Vitest slice passed 3/3.
- Current E2E status: focused marketplace Playwright verification passed 4/4 on port `34203` after pinning the repo's direct `tsx` dependency to a matching `esbuild` generation.

Why it matters:

- Waggle's local-first story should not depend on external registries during core verification. Network-heavy sync also makes UX evidence slow and flaky.

Correction:

- Separate "local browse/search works" from "explicit external sync works."
- In test/audit mode, marketplace sync is explicitly skipped when `WAGGLE_DISABLE_MARKETPLACE_SYNC=1`.
- Surface external sync partial failures in-app with clear source-level status rather than noisy logs only.

Acceptance:

- Core marketplace browse/search tests pass without network access in the audit lane.
- External sync has its own opt-in test lane and user-visible partial-failure reporting.

### P1-4: Initial app payload is too heavy for a seamless desktop feel

Evidence:

- Fixed 2026-07-09: current startup JS chunk is 421.96 kB minified / 114.08 kB gzip, down from the original 1,822.76-1,847.38 kB range.
- Vite no longer warns that JS chunks exceed 500 kB after minification.
- Several persona images are 395 to 653 kB.
- `shape-selection.ts` dynamic/static import warning is fixed; route/app surfaces, closed shell overlays, ChatHost, and cloud analytics are guarded by `build-warning-hygiene.test.ts` so they stay out of the startup bundle.

Why it matters:

- Waggle is a desktop app, but users still judge startup responsiveness. A heavy first payload weakens first impression and can worsen perceived polish on lower-end machines.

Correction:

- Lazy-load deep apps and settings subsections that are not needed for first paint.
- Fix mixed static/dynamic imports that defeat splitting.
- Compress or resize large persona assets.

Acceptance:

- Startup JS chunk stays below the Vite 500 kB warning threshold.
- Home and core shell render before deep app, overlay, chat, and analytics code is loaded.
- Persona/logo media assets are optimized or explicitly accepted in a separate visual/CLS pass.

### P1-5: Form, focus, and icon-button accessibility need a focused pass

Evidence:

- Static search found many visually labeled inputs without explicit `htmlFor`/`id` association, especially in Settings, profile, workspace creation, agent builders, compliance templates, and onboarding.
- Some labels wrap controls, which can be valid, but the pattern is inconsistent enough to merit a focused pass.
- Representative icon-only controls without accessible names still need a broader unsampled sweep; the sampled Cockpit, WaggleDance, ComplianceDashboard, custom AgentCard, and source-level Mission Control actions now have focused fixes and green coverage.
- Modal and confirmation inputs use `autoFocus` in several places, which can be good when deliberate, but the judge pass should prove focus lands on the intended field and returns to the triggering control when the modal closes.
- Runtime axe/DOM smoke found critical unnamed controls/selects on Settings, Profile, Launcher, and Approvals; a serious Files keyboard-scroll issue; workspace semantic/image-alt findings; and Command Center dialog/label-fit warnings.
- Shell overlay smoke found Notification Inbox and Create Workspace missing dialog/landmark semantics and Escape close behavior; Create Workspace had 16 visible unnamed icon buttons; Context Rail, Onboarding Tooltips, and tier modal close icons need naming/semantic cleanup.
- Current T10 implementation slice fixes Settings Prompt Shape/model/trust/team/KVARK metadata, Profile identity/preferences/brand labels, Chat composer metadata, Vault add-secret/action metadata, Launcher refresh/prompt naming, Approvals refresh/revoke names, Cockpit/WaggleDance/ComplianceDashboard/AgentCard sampled action names, Mission Control source action names/focus rings, All Workspaces/Wiki search metadata/focus affordances, WorkspaceActionsMenu rename/delete confirmation labels and focus rings, warm AskBar metadata/focus ring, workspace TasksTab add-task metadata/focus ring, Timeline event-filter metadata/focus ring, Create Workspace template textarea metadata/focus rings, Workspace Switcher focus-trap/return evidence, Files storage/browser scroll-region keyboard access, and Command Center description/mobile row fit plus search focus ring.

Why it matters:

- A seamless UX includes keyboard, screen reader, icon-button naming, and form error ergonomics. Form-heavy admin/productivity software loses quality quickly when labels, focus return, and action names are inconsistent.

Correction:

- Audit actual form semantics, not just text appearance.
- Add explicit `id` and `htmlFor` where labels do not wrap controls.
- Verify error messages use `aria-describedby` or clear adjacent status text.
- Add accessible names for icon-only action buttons, especially refresh, pause/resume/stop, delete, close, and retry controls.
- Verify modal initial focus, Escape behavior, and focus return for high-traffic dialogs.
- Keep `tests/e2e/runtime-a11y.spec.ts` green after focused source fixes rather than closing T10 from component tests alone.

Acceptance:

- Core forms pass label/name checks.
- Keyboard focus order is predictable in Settings, onboarding, workspace creation, and agent creation.
- Icon-only buttons in high-traffic surfaces have accessible names.
- Post-fix runtime axe results confirm the sampled Settings/Profile/Vault/Mission Control/Chat/Agents/WaggleDance/Launcher/Approvals named-control and semantic failures are gone.
- Runtime axe has no critical or serious findings on the final judge route set, or each remaining finding is explicitly deferred with a score cap.
- Modal focus behavior is deliberate and covered by a keyboard path.

### P1-6: Local model pricing and graceful-degradation harness are inconsistent

Evidence:

- During the broader sweep, a test named "First chat message accepted without LLM" used the local Ollama provider because it was healthy.
- Server log: unknown model `ollama/minimax-m2.7:cloud`; cost tracker estimated with Sonnet pricing.

Implementation update 2026-07-10:

- `CostTracker` now recognizes any `ollama/*` model as local/free when it has no explicit catalog entry, reports zero estimated provider cost, and does not emit a misleading cloud-pricing warning. The behavior is covered by `packages/agent/tests/cost-tracker.test.ts`.

Why it matters:

- Usage & Cost is a trust surface. Unknown local model pricing should be explicit to users, and tests that claim no-LLM degradation should not silently use a real model.

Correction:

- Add a pricing entry or explicit "local/free/unpriced" behavior for `ollama/minimax-m2.7:cloud`.
- Make no-LLM degradation tests force provider unavailability or rename them to reflect real-provider behavior.

Acceptance:

- No unknown-model cost warning in the standard UX audit run.
- Tests accurately describe the provider mode they exercise.

### P1-7: Route coverage ownership for the full shell (verified fixed)

Evidence:

- `App.tsx` registers roughly 30 app routes/route wrappers plus catch-all recovery.
- The visual suite captures only 7 views across dark/light.
- Original route-string coverage search found no direct test mentions for `/payment-cancelled`; `/benchmarks` and `/platform` had component tests but no direct route/E2E route-string hits; `/launcher`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, and `/settings/usage` only had 1-4 direct mentions.
- Focused T11 command evidence: root `npm run test -- apps/web/src/test/p1a-routes.test.ts --run` finds no files because root Vitest excludes `apps/**`; app-local `npm run test -w apps/web -- src/test/p1a-routes.test.ts --run` passes 29/29; app-local Benchmark/Platform/Payment component tests pass 17/17.
- Historical continuation evidence: `npm run build` passed and an ad hoc Playwright smoke against port 3407 proved `/benchmarks` and `/platform` render meaningful shell content and `/payment-cancelled` redirects to `/settings?tab=billing`; those historical route artifacts emitted the old T1 CSP/Clerk console errors. Current sampled accountless console-health checks pass 3/3 on port `34196`. Screenshots are under `output/playwright/route-smoke-3407/`.
- Historical thin-route continuation evidence: a second `npm run build` passed and an ad hoc Playwright smoke against port 3411 proved `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, and `/files` render meaningful shell content. Those historical route artifacts emitted the old T1 CSP/Clerk console errors; current sampled accountless console-health checks pass 3/3 on port `34196`. Launcher can still log a detect-in-flight adapter fetch error, and Usage & Cost logs a 403 resource error. Screenshots are under `output/playwright/thin-route-smoke-3411/`.
- Current route evidence: `npm run build` passed again, a fresh sidecar on `127.0.0.1:3333` returned healthy, and the all-route built-preview smoke on port 3457 proved 33 desktop route navigations plus 11 mobile route spot-checks return 200, produce screenshots, and have no document-level horizontal overflow. It also confirms `/payment-cancelled` redirects to `/settings?tab=billing`. Artifacts are under `output/playwright/route-evidence-3457/`.
- Current codified route evidence: `J-route-coverage: thin utility routes render or redirect clearly` and `J-route-coverage: priority thin routes render meaningful shells` passed 2/2 on port `34200`.
- Remaining route-adjacent health blockers are no longer P1-7 route-ownership gaps: Launcher watch-mode runtime noise belongs to T16, Usage & Cost semantics belong to T9, broader accessible-name/focus evidence belongs to T10, and workflow/failure-state depth belongs to T12.
- Source inventory found embedded or retired app files that the final judge packet must classify rather than ignore: `DashboardApp.tsx`, `VoiceApp.tsx`, `MissionControlApp.tsx`, `BackupApp.tsx`, `StorageApp.tsx`, `FilesAppTabs.tsx`, and `FilesApp.tsx`.
- Existing `tests/vision/personas.spec.ts` is valuable, but it focuses on five live persona chat journeys rather than full routed-surface grading.

Why it matters:

- The requested goal is whole-system UX, not only the major sidebar routes. Thinly covered surfaces can remain confusing or broken while the core smoke suite stays mostly green.

Correction:

- Keep the route coverage manifest as the final judge packet owner.
- Keep `J-route-coverage` in the standard route-existence regression lane.
- Expand deeper judge dry runs under T12 so every route's important state is either exercised by a persona journey, a visual capture, or a deliberate deferral.

Acceptance:

- Final judge packet maps every registered route/overlay to at least one current evidence source.
- `/payment-cancelled`, `/launcher`, `/launcher?watch=1`, `/waggle-dance`, `/artifacts`, `/settings/profile`, `/settings/timeline`, `/payment-success`, `/automations`, `/mcps`, `/settings/usage`, `/files`, `/benchmarks`, and `/platform` have codified smoke or visual coverage before the 9/10 gate.
- Remaining untested surfaces have written deferral rationale.

### P1-8: State and failure-mode coverage is not explicit enough for judge scoring

Evidence:

- `packages/shared/src/tiers.ts` defines four canonical billing tiers plus legacy tier mapping; state coverage must include Trial, Solo, Team, Enterprise, and legacy Pro collapse where relevant.
- `apps/web/src/lib/dock-tiers.ts` defines UI disclosure tiers separate from billing tier; a route can be accessible while navigation depth differs materially.
- `apps/web/src/providers/ShellContext.tsx`, `useWorkspaces.ts`, `useOfflineStatus.ts`, and `useHasWorkingModel.ts` show that shell UX depends on account, tier, workspace, offline, and model readiness state, not only route path.
- `apps/web/src/lib/adapter.ts` spans many API families; a single green route smoke cannot prove empty, error, 403, 404, SSE, or external-service states.
- The route manifest names usage scenarios, but the final judge packet also needs to declare which state combination each persona exercised.
- Focused continuation evidence: `docs/audits/2026-07-08-state-failure-t12-analysis.md` records a passing focused state slice (9 files / 79 tests), existing chat SSE network-drop/retry source coverage, native browser dialog line evidence, warning-noise risks, five-persona state-bundle fields, and T12-A through T12-G correction candidates.

Why it matters:

- A judge can see a clean default route while still missing the hard UX states: no model, trial expired, no workspace, workspace load error, local marketplace fallback, destructive restore, or unsampled mobile edge states.
- Whole-system UX means the right thing happens under realistic conditions, not only that the happy path renders.

Correction:

- Add the state/failure matrix as a first-class evidence artifact.
- Add T12 as the cross-state judge evidence ticket.
- Require every judge scorecard to record account mode, billing tier, disclosure tier, model state, data-volume state, offline/error state, and viewport.
- Use the focused T12 supplement as the closure checklist for state-bundle docs, browser state-bundle smoke, failure-state expansion, native dialog deferrals/fixes, warning hygiene, non-main gate decisions, and scale/performance evidence.

Acceptance:

- Five judge scorecards cite the state bundle they exercised.
- Any skipped state is explicitly deferred before scoring.
- No persona receives 9/10 from default-route screenshots alone.

### P0-L1: Public launch funnel has release-blocking smoke and recovery gaps

Evidence:

- `apps/www` contains the public homepage, sign-in/sign-up/account pages, Stripe checkout route, Stripe webhook, legal pages, methodology page, and download CTAs.
- `npm run start -w apps/www -- --hostname 127.0.0.1 --port 3413` starts, but is an invalid Windows smoke host for this middleware setup: Next logs `Failed to proxy http://localhost:<port>/...` and route requests time out or 500.
- `npm run start -w apps/www -- --hostname localhost --port 3416` is the valid local production smoke host. With that host, `/`, `/#pricing`, `/privacy`, `/terms`, `/cookies`, `/eu-ai-act`, `/sign-in`, `/sign-up`, `/docs/methodology`, and unauthenticated `/account` redirect render.
- Browser/server evidence still logs Clerk development-key and session-loop warnings under the active env.
- Focused continuation evidence: `npm run test -w apps/www -- --reporter=dot`, `npx tsc --noEmit --project apps/www/tsconfig.json`, and `npm run build:www` pass; fresh `localhost:3426` route/API smoke confirms the core route shape and signed-out GET checkout redirect.
- Playwright interaction evidence against `http://localhost:3416` captured `desktop-home.png`, `desktop-pricing.png`, `desktop-checkout-error.png`, `mobile-home.png`, and `mobile-nav-open.png` under `%TEMP%\waggle-www-ux-localhost-20260708`.
- Fresh Browser interaction evidence against `http://localhost:3491` captured `www-t13-home-desktop.png`, `www-t13-pricing-checkout-error-desktop.png`, `www-t13-home-mobile.png`, `www-t13-mobile-menu-open.png`, and `www-t13-rendered-summary.json` under `output/playwright/www-t13-3491/`.
- Fresh Browser sampled states had 0 current-page console warnings/errors, but Browser DOM snapshot failed with the known `incrementalAriaSnapshot` plugin mismatch.
- Pricing annual toggle and mobile nav open both worked in rendered browser evidence.
- Signed-out `Get Team` rendered a small inline `Sign in required` error instead of using the returned `signInUrl` to guide the buyer into auth and checkout recovery.
- `/pricing?checkout=cancelled` returns 404.
- `/methodology` returns 404; the real shipped route is `/docs/methodology`.
- Signed-out Team checkout through `Pricing.tsx` calls `POST /api/stripe/checkout`; the route returns a `signInUrl` on 401 but the component only displays "Sign in required."
- Checkout cancel uses `/pricing?checkout=cancelled`, but pricing is a section on `/`, not a registered Next route.
- Historical deployment blocker now locally fixed: `deploy-www.yml` previously uploaded `apps/www/dist` even though `next.config.mjs` has no static export output and the app includes dynamic auth/API routes. The workflow now targets Vercel prebuilt deployment; deployed smoke remains open.
- `DownloadCTA` targets GitHub Releases latest, and GitHub currently reports no releases for the repository.
- Fresh external refresh also confirms both `waggle-os.ai` and `www.waggle-os.ai` fail DNS resolution from this environment.
- OS detection can label iPhone/iPad as macOS and unsupported desktops as Linux, while public platform copy says Windows and macOS.
- Legal pages still include Day-0 placeholders, launch-date/address placeholders, and stale "Pro or Teams" privacy copy.

Why it matters:

- Download, checkout, legal trust, and deployment are part of real user UX before they ever reach the desktop cockpit.
- A five-persona in-app judge score can be honest only if the launch funnel is either verified separately or deliberately scoped out.

Correction:

- Track this as T13.
- Use `docs/audits/2026-07-08-launch-funnel-t13-analysis.md` as the focused correction artifact.
- Publish a real download/release path or replace it with a controlled availability/status page before launch.
- Document and use the stable `localhost` smoke host, then isolate/validate Clerk env so public routes render without auth-loop spam.
- Verify or fix download, mobile nav, sign-in/sign-up/account, Team checkout, checkout cancel recovery, legal trust pages, and deployment target.
- If the final judge gate is intentionally installed-app-only, get explicit user approval to defer this launch-funnel gate.

Acceptance:

- Launch funnel evidence is attached, or T13 has an approved deferral.
- Download CTA leads to valid Windows/macOS artifacts or a deliberate download/status page; mobile and unsupported OS labels are honest.
- Local production route smoke uses the correct host binding and has no 500s, timeouts, unexpected 404s, or Clerk redirect-loop spam.
- No public legal/trust page contains placeholder launch text or active Pro copy.
- Checkout recovery paths do not dead-end.

### P1-10: Desktop wrapper, installer, tray, update, and sidecar-startup UX lack installed-app evidence

Evidence:

- Tauri config and tests cover build/resource shape, but this packet did not run a packaged app, installer, tray menu, close-to-tray behavior, global shortcut, or update flow.
- `cargo check --manifest-path app/src-tauri/Cargo.toml` passes; `app/src-tauri/resources/node.exe --version` returns `v20.18.1`; `node scripts/check-sidecar-resources.mjs` passes with staged Node runtime, native deps, and sidecar `node_modules`.
- Web-side Tauri binding tests pass from `apps/web` (focused binding 15/15 and prior binding/adapter bundle 19/19), but the same files are not discoverable from the root Vitest command because root config excludes `apps/**`.
- Native source directly handles tray Open/focus, close-to-tray, `Ctrl+Shift+W` window visibility, and tray Quit; Settings routes through a tested `/settings` desktop bridge. This is source evidence only; it has not been proved in a packaged build on a target OS lane.
- Rust service events (`waggle://service-status`, `waggle://service-restart-needed`) now have current `apps/web/src` consumers through `TauriDesktopEventBridge`; `waggle://update-available` remains mapped for future use while native updater emission stays disabled until signed updater artifacts exist. The prior Pause/About/Quit/Settings tray false-affordance issue is narrowed: Pause and About are hidden, Quit is native, and Settings has a web bridge.
- The updater plugin config is intentionally disabled for v1 while Rust still contains update-check emission for future consumers.
- `packages/server/src/local/service.ts` has port-conflict and health/degraded paths, but no current packet evidence shows the user-facing recovery UI for those states.

Why it matters:

- Installed desktop UX includes launch, tray, service recovery, and update expectations, not only the React routes after the app is healthy.
- A first-run failure in the wrapper can make the whole product feel broken even when `apps/web` tests pass.

Correction:

- Track this as T14.
- Verify or fix packaged launch, service readiness/failure recovery, tray actions, close-to-tray, global shortcut, installer/signing expectations, and update visibility.
- Split desktop acceptance between source-wired and packaged-proof lanes: Open, Settings, Quit, close-to-tray, and `Ctrl+Shift+W` need packaged proof; update and watchdog events need visible UI, native handling, or explicit deferral.
- Treat the active installed sidecar path as `packages/server/src/local/service.ts` bundled by `scripts/build-sidecar.mjs`, not the legacy top-level `sidecar/` JSON-RPC path.

Acceptance:

- Desktop wrapper evidence is attached, or T14 has an approved deferral.
- Tray/update/service events are either consumed by UI, natively handled, or hidden until supported; any emitted route target exists. Remaining T14 proof is packaged watchdog/update presentation, not a missing web consumer in the current source.
- Quit actually exits through a tested native or cleanup bridge, or the menu stops presenting it as a supported command.
- Sidecar failure/port conflict has a user-facing recovery path.

### P1-11: Admin web, CLI launcher, marketplace CLI, and memory MCP utility UX have broken built-entry and shallow UX evidence

Evidence:

- `packages/admin-web` is a separate Vite/React surface with its own sidebar, token/slug connection UX, dashboard, analytics, members, capabilities, jobs, audit, and team settings pages. Component tests now pass through both root and package-local commands without React `act(...)` warnings. The original built-render smoke covers all 7 desktop pages and all 7 mobile pages under `output/playwright/admin-web-t15-57795/`; it rendered typed happy paths with no current-port console errors. A package-owned rendered Playwright gate now builds the package and passes 14 tests across all seven pages at 1200 x 800 and 390 x 844, checking hash state, active navigation semantics, browser back/forward traversal, viewport overflow, labelled table scroll regions, rendered control labels, clean app console/pageerror collection, mobile shell keyboard navigation, page-level keyboard traversal from connection fields into dashboard, members, capabilities, jobs, audit, and settings controls/table regions, full-page desktop/mobile visual snapshots, capability governance forms, malformed analytics response recovery, all-page initial API-failure recovery, mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save, plus real local bearer-auth middleware wrong-token/valid-token behavior through protected Fastify routes.
- `packages/launcher` is the public `npx waggle` acquisition path. Source and built help smokes pass without service banners or `.waggle` creation. The launcher package gate now owns the real parser/core helpers, invalid-port validation before service setup, occupied-port recovery copy, and `--no-open` success copy. This packet still has no long-running clean startup/package invocation, browser-open fallback integration, or service-failure copy smoke beyond occupied-port startup failure; no `packages/launcher/tsconfig.json` exists for a no-emit TypeScript check.
- Built `@waggle/cli` help is now locally fixed: help runs before the REPL dependency graph loads, and clean-home smokes pass for `dist/index.js --help`, `bin/waggle.js --help`, extracted packed-bin help, local package-closure installed `npx waggle --help`, and local package-closure installed `npx waggle --local` REPL startup/prompt/slash-command/`/exit` with `default.mind` creation.
- Built marketplace CLI previously failed before help because emitted ESM imports were extensionless; this is now locally fixed with NodeNext emitted imports and a built-help runtime guard. The marketplace package manifest also now points at emitted `dist` entrypoints included by the packed package.
- Built legacy `waggle-memory-mcp` now completes official read-only and write-scope MCP client smokes; write scope saves and recalls a unique memory. A clean local package-closure install also launches the installed server and lists read-only tools; that proof caught and fixed the missing `glob` runtime dependency declaration in `@waggle/core`.
- Built `@waggle/hive-mind-mcp-server` now completes official registration/scope and write-scope MCP client smokes; write scope saves and recalls a unique memory.
- `packages/hive-mind-cli` has colocated tests under `src/`; root Vitest does not discover that lane, but the package now owns it through `npm run test --workspace @waggle/hive-mind-cli -- --reporter=dot`.
- Hive-mind CLI sampled subcommand help is now side-effect free: source `init --help` and built `status --help` print focused command help and do not create `personal.mind`.
- Marketplace invalid commands now print `Unknown command`, show help, exit 1, and do not construct a clean-home marketplace DB.
- Package-local test command shapes are now fixed for launcher, `@waggle/cli`, `waggle-memory-mcp`, and hive-mind CLI in the T15 lane.

Why it matters:

- "Complete UX" includes acquisition, admin, and recovery paths, not only the main desktop cockpit after everything is healthy.
- Team admins and engineers are likely to touch these surfaces when installing, debugging, governing, or integrating Waggle.
- A source-mode dev command can pass while the command a real user installs or runs via `npx` is unusable.

Correction:

- Track this as T15.
- Decide whether admin/CLI/MCP utilities are inside the five-persona scoring scope or explicitly deferred.
- If included, keep the admin-web rendered package gate green with its local bearer-auth coverage, and attach focused command evidence for launcher, marketplace CLI, memory MCP, hive-mind MCP, Waggle CLI, and hive-mind CLI happy/error paths.
- Keep the legacy `waggle-memory-mcp` runtime fixed or explicitly deprecate it; marketplace CLI manifest/pack/install shape, launcher packed/installed first-command recovery, packed and local package-closure installed `@waggle/cli` help plus installed local REPL startup/slash-command/exit and streamed chat/provider plumbing, local package-closure installed `hive-mind-cli` help, built/installed hive-mind MCP protocol runtime, and legacy memory MCP built/installed protocol runtime are locally fixed, but the utility lane still needs registry-only proof after internal package publication.
- Fix or document the remaining package-local test command gaps.
- Keep safe help and invalid-command semantics before mutating setup paths; hive-mind CLI and marketplace now have focused guards, while broader utility paths still need sampling.

Acceptance:

- Admin web and supported utility CLIs have evidence for help/first-run, invalid input, missing configuration, and common success paths, or T15 has an approved deferral.
- Built CLI/MCP entries run from a clean environment, or deprecated surfaces are removed from the judged product scope.
- Root/package verification either runs the tests that exist or documents the separate command that owns them.
- T15 deep-dive evidence: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`.

### P1-12: AI-tool hook install/verify/uninstall UX has strong route/rendered evidence but lacks packaged desktop proof

Evidence:

- T16 route/contract/package-runtime tests pass: 7 shared/agent/server files / 96 tests cover manifests, third-party loader, hook-capable cohort, launcher, backend tool routes, and local packed-package `npx` lifecycle for all six hook-capable packages; a focused registry-aware adapter slice passes 5 files / 108 tests for launchable third-party adapter launch and prompt-template routing.
- Launcher hook UI, prompt, and adapter tests pass: 3 web files / 28 tests.
- Root-run hook/shim package tests pass: 60 files / 573 tests with 1 skipped.
- Official hook/shim package typechecks pass for 8 packages; the Claude Desktop stub build passes; 6 compiled hook-bin help smokes pass.
- `BUILTIN_TOOL_MANIFESTS` marks `claude-desktop` as the only non-hook-capable built-in. `packages/hive-mind-hooks-claude-desktop/src/index.ts` is explicitly a stub with no bin; `packages/hive-mind-hooks-codex-desktop` ships a bin and re-exports Codex hook behavior.
- Hook test output is intentionally noisy: fail-open hook warnings, sidecar-unreachable signal drops, package logs, and negative verify logs appear during passing tests.
- Focused in-app Browser smoke renders Launcher mixed states with no current-port console errors: installed, not installed, hooks active, running, Phase 4/unsupported, prompt summary after typing, install success, verify failure, and live output. Evidence lives under `output/playwright/launcher-t16-54147/`.
- The rendered smoke originally proved these UX gaps: install success hid stdout backup-path details, verify failure dropped the actionable stderr path, Claude Desktop lacked explicit launch-only/no-hooks copy, and the prompt textarea lacked name/id/ARIA/autocomplete metadata. Current focused tests protect stdout/stderr result detail visibility, summarize covered install output with `Backup` and `Recovery` labels instead of raw `stdout:`, preserve structured hook failures instead of masking them as generic `HTTP 400`, show retry/uninstall/reinstall recovery guidance for empty-output Verify failures, summarize Verify `[FAIL]` output as `Check failed` with the manual approval detail and no raw `[FAIL]`, label uninstall restore/cleanup rows without implying install state, cap long hook output behind `More output`, fix observed-output duplicate replay after exit, fix prompt textarea metadata, and label installed Claude Desktop as launch-only with no hook actions. A fresh real Browser route smoke on `/launcher` renders `verify failed (exit 1)` plus empty-output recovery guidance instead of `HTTP 400`; Browser-rendered mocks confirmed the Claude Desktop launch-only layout, the Codex Verify manual-approval panel, and the Codex Uninstall cleanup panel; and codified Playwright coverage confirms standard install changed-file/pointer/backup/recovery labels, all six hook-capable install/verify/uninstall rendered transitions, sidecar-offline Retry, long-output summarization, and non-built-in adapter launch-only/prompt behavior. Packaged desktop lifecycle states remain open.
- Hook/shim package-local `npm run test --workspace ...` scripts now pass for hook core, all six hook-capable packages, and shim core; the scoped non-hook package-local command-shape gaps tracked under T17 are now fixed, with warning hygiene and developer-journey evidence remaining.
- Detection can include third-party adapter manifests; launchable adapters now launch through the runtime registry and can receive prompt-template routing. Hook management remains built-in-only until a safe third-party hook policy exists.

Why it matters:

- The hook install flow edits real user AI-tool configuration files. A green unit test is not enough for a 9/10 UX claim unless the user can install, verify, understand, and remove hooks safely.
- Launcher promises install/verify/uninstall actions; users need clear status, failure copy, and reversibility confidence.

Correction:

- Track this as T16.
- Decide whether hook-management scenarios are inside the five-persona score or explicitly deferred.
- If included, keep the codified rendered Launcher evidence green for all-tool hook-management lifecycle, unsupported `claude-desktop`, sidecar-offline, long-stderr, and error states.
- Keep the hermetic package-pack `npx` install/verify/uninstall command evidence green for all six supported hook packages, keep the isolated all-six route lifecycle green, and add packaged desktop hook-status evidence or an approved deferral before scoring T16 as complete.
- Ensure hook verification output noise does not hide real failures in the standard audit lane.
- Keep Launcher hook result copy guarded for Backup/Recovery, Check-failed/manual-approval, uninstall-cleanup, More-output, and rendered lifecycle guidance.

Acceptance:

- Hook-management evidence is attached for UI and command paths, or T16 has an approved deferral.
- `claude-desktop` is consistently shown as launchable but not hook-capable; six hook-capable tools expose clear actions and results.
- Observed live output does not duplicate terminal replay after process exit; focused Launcher/web regression evidence passes 5 files / 72 tests and includes hook result stdout/stderr, Backup/Recovery result labels for covered install output, Check-failed/manual-approval rows for Verify output, uninstall cleanup labels, More-output summarization, structured failure detail coverage, empty-output recovery copy, Claude Desktop launch-only copy, and detected third-party adapter Launch/prompt routing.
- Hook install/uninstall remains reversible and understandable in user-facing copy.
- T16 supplement remains linked: `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`.

### P1-13: Developer API, background worker, and substrate verification UX has command-shape and suite-stability gaps

Detailed supplement: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`.

Evidence:

- A remaining-package inventory covered `agent`, `core`, `hive-mind-core`, `hive-mind-shim-core`, `hive-mind-wiki-compiler`, `optimizer`, `sdk`, `server`, `shared`, `waggle-dance`, `weaver`, `wiki-compiler`, and `worker`.
- Direct no-emit TypeScript passes for all 13 remaining workspaces.
- `npm run test -w @waggle/agent` passes 195 files / 3097 tests.
- Package-script tests pass for `@waggle/core` (19 files / 296 tests), `@waggle/optimizer` (1 file / 21 tests), and `@waggle/weaver` (3 files / 31 tests).
- Root-run substrate/compiler tests pass: `hive-mind-core`, `hive-mind-shim-core`, and `wiki-compiler` together pass 71 files / 875 tests.
- Root-run SDK tests pass 5 files / 89 tests, including the filesystem-safe plugin-id regression.
- Package-local shared, WaggleDance, worker, and hive-mind wiki compiler scripts now pass 15 files / 154 tests in total (40 + 42 + 46 + 26), with the colocated wiki tests explicitly included in root discovery.
- The named `@waggle/server` release lane passes 185 files, 1 skipped; 2,128 tests, 1 skipped, with one worker. The default wall-clock performance suite is isolated and passes 13/13.
- Earlier packet evidence saw one full-suite performance-budget failure (`Workspace Listing with 50 workspaces` took 841ms against a 500ms budget), while the same server performance benchmark passes in isolation (13 tests). Treat this as a release-lane stability and command-shape risk, not a consistently broken endpoint.
- Package-local `npm test` fails for `hive-mind-core` and `wiki-compiler` because Vitest looks for `vitest.setup.ts` relative to the package cwd; root-run commands pass. `hive-mind-shim-core` is fixed and passes through its package-local script.
- Package-local `npm test` fails for `@waggle/sdk` because workspace-local Vitest resolves into `packages/sdk/node_modules` and cannot find `convert-source-map`; root-run SDK tests pass.
- Standard server verification also exercises marketplace sync paths with many source-sync logs; this overlaps T6/T15 and should not be part of a quiet deterministic release lane.

Why it matters:

- Engineers, admins, and release reviewers experience command failures and noisy logs as product quality signals.
- "Every part tested" is not credible if package scripts fail by command shape, root runs miss or special-case package tests, or the full server route suite needs reruns to pass.
- Server, worker, SDK, WaggleDance, and memory substrate behavior underpins visible UX: chat, workspace listing, marketplace, hooks, background jobs, and memory recall.

Correction:

- Track this as T17.
- Decide whether developer API/background/substrate evidence is inside the five-persona score or explicitly deferred.
- Fix or document package-local test command shape for packages whose tests only pass from the root runner.
- Stabilize the server route/performance gate: either make the full suite deterministic under normal audit load or move benchmark assertions to an isolated perf lane with a clear release threshold.
- Reduce or document noisy passing output so real failures stand out.

Acceptance:

- Developer API/background/substrate evidence is attached, or T17 has an approved deferral from the final score.
- Package-local and root verification commands are deterministic and discover the intended tests, or their separate lanes are explicitly documented.
- Server route suite and performance benchmark expectations are stable enough to support a final "all tested" claim.

### P1-14: Ops, deployment, CI, benchmark, and judging evidence is incomplete for a complete-system claim

Detailed supplement: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`.

Evidence:

- YAML parse passes for `docker-compose.yml`, `docker-compose.production.yml`, `render.yaml`, `litellm-config.yaml`, and all 7 workflow files under `.github/workflows`.
- Docker CLI is installed locally, and both development and production Compose files pass `docker compose config`, but the Docker Desktop Linux engine is not reachable in this environment, so live Compose services and `npm run test:infra` were not run.
- Raw Compose expansion reads ignored local env values and can print secret values; non-interpolated Compose config is safer for shareable evidence.
- Tracking/ignore checks show only `.env.example` files are tracked among the checked env/key files; local `.env`, `env.local`, `apps/www/.env.local`, and `AI API KEYS.txt` are ignored.
- Current `render.yaml` is explicitly the hosted local-sidecar path: it keeps `/data` persistence and Stripe sidecar routes and no longer provisions unused Postgres/Redis services. The Postgres/Redis-backed team server remains the Dockerfile/production Compose path.
- `ci.yml` keeps the broad Playwright E2E job advisory with `continue-on-error: true`, but now has a separate blocking five-journey smoke job; no workflow currently runs the 19 infra-dependent Postgres/Redis suites from `vitest.infra-suites.ts`; this packet also could not run them locally because the Docker engine is unavailable.
- `docker-compose.production.yml` now fails closed for Postgres and MinIO credentials with required interpolation; deployment tests pass 12/12 and the non-interpolated Compose review preserves placeholders without exposing local secrets.
- Benchmark harness TypeScript passes: `npx tsc --noEmit --project benchmarks/harness/tsconfig.json`.
- Benchmark harness package-local tests now pass 29 files / 325 tests through a root-config delegation script.
- The focused T18 supplement records the now-fixed local `apps/www` GitHub Pages artifact mismatch and Render ambiguity, the still-open deployed Vercel/DNS proof gap, and the narrowed LiteLLM evidence boundary: dynamic provider discovery through exact-model completion is hermetically proven, while one paid external-provider smoke remains release evidence.
- `judging/` contains historical June 2026 artifacts, not current post-fix five-persona scoring evidence.

Why it matters:

- A complete UX claim includes the experience of shipping, operating, validating, and judging the system.
- Green app tests do not prove that deploy manifests, infra lanes, benchmark harnesses, or judge artifacts are current and trustworthy.
- Secret-safe validation matters because ops logs are often copied into issues, PRs, and handoffs.

Correction:

- Track this as T18.
- Decide whether ops/deploy/CI/benchmark/judging evidence is inside the final score or explicitly deferred.
- Document secret-safe Compose validation commands and avoid raw secret-expanded config logs in shareable evidence.
- Decide Render's target: hosted local-sidecar demo or team Postgres server, then align provisioned services, env vars, and entrypoint.
- Add or explicitly defer blocking smoke/infra CI lanes.
- Fix or document benchmark harness package-local test command shape.
- Generate fresh five-persona judging artifacts only after approved fixes land.

Acceptance:

- Ops/deployment/CI/benchmark/judging evidence is attached, or T18 has an approved deferral from the final score.
- Shareable ops validation output is secret-safe.
- Current judge artifacts, not historical screenshots, are used for the 9/10 decision.

### P1-15: Browser Companion extension UX is a real capture surface with incomplete end-to-end UX evidence

Evidence:

- `apps/browser-ext/README.md` describes a Chrome Manifest V3 Browser Companion that captures the current page or selected text into Waggle memory.
- `apps/browser-ext` contains root-level popup, background, content, manifest, and README files for the extension surface.
- `packages/server/src/local/routes/browser-ext.ts` exposes `GET /api/browser-ext/health`; `packages/server/src/local/cors-config.ts` gates extension origins with `WAGGLE_BROWSER_EXT_IDS` or `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1`.
- The July audit packet had no extension-loaded smoke, popup screenshots, CORS-denied recovery evidence, or memory-frame result verification before the source-inventory supplement.
- The T19 continuation added extension JS syntax checks, manifest parsing, `packages/server` typecheck, a failed-port connectivity check for `127.0.0.1:3333`, and a Playwright disconnected-state screenshot at `output/playwright/browser-companion-disconnected-state.png`.
- A live sidecar save-flow run on `127.0.0.1:3333` proved direct `POST /api/memory/frames?extract=false` saves selection-shaped and page-shaped frames, duplicate detection works, and Memory UI renders imported Browser Companion frames.
- A real unpacked Chromium extension run originally proved the background `save-memory` message failed by default with generic `HTTP 500` when the extension origin was not allowlisted; the post-fix extension now bootstraps a token first and maps setup denial to branded recovery copy.
- The current secure-default live smoke loaded the extension, selected text in a normal HTTP page, confirmed Chromium MV3 service-worker fetches omit `Origin` and send `sec-fetch-site: none`, cleared any stored token, saved through `chrome.runtime.sendMessage({ type: 'save-memory' })`, stored the token during save, and confirmed `/api/memory/frames` contains the imported frame.
- Focused CORS tests now cover `WAGGLE_DEV_ALLOW_ANY_EXTENSION=1` and concrete `chrome-extension://<id>` origins; the live smoke used the production-shaped `WAGGLE_BROWSER_EXT_IDS=<extension id>` path.
- Historical issue: `/api/memory/frames` reported the allowlisted extension frame as `source: "import"`, while `/api/memory/search` returned the same frame as `source: "user_stated"`. Current route coverage and popup-click smoke now confirm imported Browser Companion captures return as `source: "import"` in Memory search.

Why it matters:

- Browser capture is part of the memory/Harvest promise. If it is confusing, disconnected, blocked by CORS, or silently fails, Researcher and Solo-founder trust drops even when the main cockpit works.

Correction:

- Track this as T19.
- Decide whether the Browser Companion extension is inside the final five-persona score or explicitly deferred.
- If included, verify native toolbar-bubble behavior against a normal web page, native context-menu save or an explicit deferral, packaged pairing, and any separately scored global-recall provenance shape in the cockpit; popup keyboard/focus behavior now has live evidence.

Acceptance:

- Browser Companion extension save-flow evidence is attached, or T19 has an approved deferral from the final score.
- The toolbar popup and context-menu flows produce observable memory results or branded recoverable failures.
- CORS-denied, missing-token, and unpaired-extension states provide a clear setup path instead of a generic `HTTP 500` or raw `MISSING_TOKEN`; focused code coverage exists, with live screenshot evidence still optional for judging.
- Memory source/provenance labels remain consistent between frame lists, search results, cockpit UI, and any separately scored global-recall result shape.
- Popup keyboard/focus basics have live evidence; popup copy and screen-reader announcement behavior are inspected or deferred for the final judge packet.

### P2-1: Stale developer comments and legacy terminology can mislead future work

Evidence:

- Several comments still refer to Pro gates even when current user-facing strategy changed.
- Some route comments are stale relative to implementation.

Why it matters:

- This is not directly user-facing, but it increases the chance of reintroducing incorrect UX copy.

Correction:

- After user-facing fixes land, clean stale comments in touched files only.

Acceptance:

- Comments in touched files describe current behavior.

### P2-2: Browser plugin DOM snapshot failed, although screenshot/evaluate worked

Evidence:

- Browser setup succeeded.
- `domSnapshot()` failed with `TypeError: o.incrementalAriaSnapshot is not a function`.
- Fallback browser screenshot/evaluate and standalone Playwright testing worked.

Why it matters:

- This is a tooling issue, not a product UX issue, but it reduces inspection ergonomics.

Correction:

- Continue using Playwright CLI for audit evidence until the Browser plugin version mismatch is fixed.

Acceptance:

- UX audit can be repeated without relying on the failing Browser DOM snapshot path.

## Proposed Implementation Phases After Approval

Phase 1: Trust and coherence blockers

- Keep Clerk/CSP/accountless local mode in regression; sampled accountless console health is currently verified fixed.
- Remove/normalize user-facing Pro copy.
- Keep mobile Settings layout and first-run onboarding Profile action reachability in regression; both are currently verified fixed in focused 390px journeys.
- Keep the verified `Ctrl+Shift+N` route contract in regression.
- Keep Workspace Switcher route traversal in regression.
- Keep the verified visual snapshot lane in regression.
- Verify: typecheck, full web Vitest, build, full-product audit, visual suite, desktop/mobile screenshots.

Phase 2: Flow polish and accessibility

- Replace native confirm/alert/prompt usage in critical flows.
- Add in-app result states for backup/restore/export/delete/revoke.
- Make marketplace browse/search hermetic in core verification and move live external sync to an explicit lane.
- Focused form label and keyboard audit.
- Add route coverage manifest and smoke/visual coverage for thin routes.
- Add state/failure bundle evidence for the five-persona judge runs.
- Verify: targeted tests for destructive flows, accessibility assertions where practical, mobile screenshots.

Phase 3: Performance and polish

- Route-level lazy loading for deep apps.
- Fix ineffective dynamic imports.
- Optimize persona/media assets.
- Add/clarify local model pricing semantics for Usage & Cost.
- Reduce test warning noise.
- Verify: build chunk report, smoke tests, full app tests.

## Approval Packet

These tickets are the proposed correction scope. Approval should mean "implement these in order, without creating new product surfaces."

### T1: Local auth, Clerk, and CSP console health

Files to inspect/edit:

- `packages/server/src/local/security-middleware.ts`
- `packages/server/tests/local/security-middleware.test.ts`
- `apps/web/src/lib/clerk.ts`
- `apps/web/src/providers/WaggleClerkProvider.tsx`
- E2E harness env setup for local/accountless runs, if needed.

Decision needed:

- Preferred product behavior is accountless local-first desktop/web by default. In that mode, the app should not mount Clerk or emit Clerk network/CSP errors.
- If Clerk is intentionally enabled for a run, CSP must explicitly support the exact Clerk script/connect/frame requirements and the inline startup script must use a nonce/hash-compatible path.

Acceptance:

- `full-product-audit` and `phase-ab-verification` focused console-health checks have zero critical console errors caused by auth/CSP in the sampled accountless lane; expand the same proof to any final full-run bundle before scoring.
- Accountless local mode has no Clerk load, 429, telemetry, or CSP console noise.
- Auth still works when a valid Clerk key is intentionally enabled.

### T2: Mobile Settings and first-run onboarding responsive layout

Files to inspect/edit:

- `apps/web/src/components/os/apps/SettingsApp.tsx`
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx`
- `apps/web/src/components/os/overlays/onboarding/WhoAreYouStep.tsx`
- Existing Settings tests, including `apps/web/src/test/pr5-settings-reskin.test.tsx`
- Add or extend one mobile Playwright assertion for 390px width.

Correction:

- Replace the fixed left tab rail at narrow widths with a mobile-appropriate tab selector or wrapped segmented rail.
- Prevent provider cards and form rows from creating internal horizontal scroll.
- Preserve desktop density.
- Keep first-run onboarding Profile primary actions visible, sticky, or clearly signposted at 390 x 844; current focused evidence passes this requirement on port `34194`.

Acceptance:

- At 390 x 844, Settings is fully usable with no horizontal page overflow, no clipped provider/model/billing/profile controls, and no squeezed two-rail content column; current focused evidence passes this requirement on port `34195`.
- At 390 x 844, clean-data onboarding Profile keeps Continue visible or clearly reachable without a hidden dead-end feeling; current focused evidence passes this requirement on port `34194`.
- Keyboard focus remains visible and ordered.
- Desktop Settings does not regress.

### T3: Pricing and gating copy: Solo/Team/Enterprise only

Files to inspect/edit:

- `apps/web/src/components/os/apps/MarketplaceApp.tsx`
- `apps/web/src/components/os/apps/mcp/AddCustomMcpForm.tsx`
- `apps/web/src/lib/command-catalog.ts`
- `apps/web/src/components/os/overlays/LoginBriefing.tsx`
- `apps/web/src/components/os/apps/skills/SkillRow.tsx`
- `apps/web/src/components/os/apps/SettingsApp.tsx`
- `apps/web/src/components/os/apps/PaymentSuccessApp.tsx`, only for legacy billing clarity.

Correction:

- Remove user-facing Pro gating from active product flows.
- Use Solo, Teams, and Enterprise language that matches `packages/shared/src/tiers.ts` and AGENTS.md.
- Keep legacy Pro references only where they are explicitly servicing historical billing state.

Acceptance:

- `rg -n "Pro|PRO|pro_" apps/web/src` has no active user-facing Pro upgrade copy outside approved legacy billing handling.
- Marketplace, MCP, Settings, skills, command palette, login briefing, and payment success are mutually consistent.

### T4: `Ctrl+Shift+N` and Workspace Switcher route contract

Files to inspect/edit:

- `apps/web/src/hooks/useKeyboardShortcuts.ts`
- `apps/web/src/components/os/AppShell.tsx`
- `apps/web/src/components/os/overlays/WorkspaceSwitcher.tsx`
- `tests/e2e/phase-ab-verification.spec.ts`
- `tests/e2e/power-user-stress.spec.ts`
- `tests/e2e/full-wiring-audit.spec.ts`

Recommended decision:

- Make `Ctrl+Shift+N` complete the user's likely action: open chat in the active workspace, else the Home "Start Here" workspace, else the newest workspace. If no workspace exists, then open the Workspace Switcher or creation path.

Correction:

- Resolve the mismatch between tests and product behavior.
- Ensure route-changing nav closes blocking overlays or makes overlays non-blocking where appropriate.
- Preserve focus trap behavior while a modal is intentionally open.

Acceptance:

- The two formerly failing `Ctrl+Shift+N` tests pass; current focused evidence is 2/2 on port `34197`.
- The full console audit can navigate from Home to Memory without a lingering Workspace Switcher backdrop intercepting clicks; current focused evidence is 1/1 on port `34198`.
- Modal close and selection behavior is predictable with mouse and keyboard.

### T5: Visual baseline triage

Files to inspect/edit:

- `tests/visual/views.spec.ts`
- Existing screenshot baseline directories referenced by the visual test runner.
- Any directly implicated app view only if the actual screenshot shows a real regression.

Correction:

- Classification complete in `docs/audits/2026-07-08-visual-t5-classification.md`: most original failures were intentional drift; the current baseline/spec worktree passes 14/14 on port `34199`.
- Preserve the current canonical ASCII-hyphen baseline family used by the runner.
- Keep duplicate historical baseline families documented until a separate test-readiness cleanup removes or archives them.

Acceptance:

- Visual suite passes after approved baseline updates or real UI fixes; current evidence is 14/14 on port `34199`.
- A short note records which snapshots were updated versus fixed.
- The active baseline family is unambiguous for the current runner.

### T6: Marketplace determinism and local-first test lane

Files to inspect/edit:

- `packages/server/src/local/routes/marketplace.ts`
- `packages/server/src/local/marketplace-background-sync.ts`
- `packages/server/tests/local/marketplace-background-sync.test.ts`
- E2E tests that call `/api/marketplace/sync`.

Correction:

- Keep `WAGGLE_DISABLE_MARKETPLACE_SYNC=1` respected by explicit sync routes in test/local verification, and route live external sync into a separately named live-integration lane.
- Keep browse/search useful with local catalog data.

Acceptance:

- Standard UX audit does not hit external marketplace sources when the sync-disable env is set; server-side evidence passes.
- Marketplace search/sync evidence is stable in the focused browser slice: 4/4 passed on port `34203`.

### T7: Trust-critical dialogs

Files to inspect/edit:

- `apps/web/src/components/os/apps/BackupApp.tsx`
- `apps/web/src/components/os/apps/AutomationCenterApp.tsx`
- `apps/web/src/components/os/apps/SettingsApp.tsx`
- `packages/admin-web/src/pages/Members.tsx`

Correction:

- Replace native `confirm`, `alert`, and `prompt` in destructive or trust-critical flows with existing app modal/toast patterns.
- Show what will happen, require explicit confirmation, and show result state after the action.

Acceptance:

- No native browser dialogs in backup, restore, export, revoke, delete, or destructive workspace/memory/wiki flows.
- Result state is visible in-app.

### T8: Performance and payload polish

Files to inspect/edit:

- Route/app composition in `apps/web/src/components/os/` and `apps/web/src/components/os/apps/`
- `apps/web/src/lib/shape-selection.ts`
- Asset import sites for persona and logo media.

Correction:

- Lazy load deep admin/productivity apps where that fits the existing shell.
- Fix the dynamic import defeated by static import.
- Reduce initial payload from large persona/logo assets.

Acceptance:

- Startup JS chunk is materially smaller and below the Vite warning threshold.
- Home and core shell render before deep Settings/Marketplace/admin/chat/overlay/analytics code is needed.
- Build warnings for defeated dynamic imports and oversized JS chunks stay resolved or explicitly accepted with rationale.

### T9: Local model pricing semantics

Files to inspect/edit:

- `packages/agent/src/cost-tracker.ts`
- `packages/agent/tests/cost-tracker.test.ts`
- Any UI that labels unknown local model cost estimates.

Correction:

- Add explicit behavior for local/unknown Ollama models: either known pricing, free/local label, or "unpriced estimate unavailable."
- Make no-LLM tests force provider unavailability if they are testing graceful degradation.

Acceptance:

- Standard audit logs do not warn about `ollama/minimax-m2.7:cloud`.
- Cost UI does not imply precise paid-provider cost for an unpriced local model.

### T10: Test warning and accessibility hygiene

Files to inspect/edit:

- Tests emitting repeated `act(...)` warnings.
- Core form components in Settings, onboarding, workspace creation, agent/persona creation, compliance templates.

Correction:

- Remove warning noise where it masks real UX failures.
- Add focused label/name checks for high-traffic forms.
- Apply the shared overlay contract to shell panels/dialogs: semantics, accessible names, Escape or explicit close, focus behavior, and named icon-only actions.
- Keep focused component tests for fixed controls and keep the runtime axe gate green before final judge scoring. Current sampled gate: `tests/e2e/runtime-a11y.spec.ts`, 2/2 on port `34193`.

Acceptance:

- Standard verification output is short enough that real failures are visible.
- Core forms have accessible names, associated labels, and predictable focus order.
- Sampled shell overlays/routes have accessible names/landmarks, close predictably, expose zero unnamed visible icon-only controls, and pass the desktop/mobile runtime axe gate.

### T11: Route coverage and final judge harness

Files to inspect/edit:

- `docs/audits/2026-07-08-ux-route-scenario-manifest.md`
- `apps/web/src/App.tsx`
- `tests/e2e/user-journeys.spec.ts`
- `tests/e2e/full-product-audit.spec.ts`
- `tests/visual/views.spec.ts`
- `tests/vision/personas.spec.ts`
- `tests/vision/README.md`
- `docs/audits/2026-07-08-route-evidence-t11-analysis.md`

Correction:

- Maintain the route coverage manifest that maps every registered route and major overlay to a smoke, visual, or persona-journey check.
- Keep the codified route owners for `/benchmarks`, `/platform`, `/payment-cancelled`, Launcher watch mode, Usage & Cost, and selected thin judge routes in `tests/e2e/user-journeys.spec.ts`.
- Use the app-local test command shape for app tests: `npm run test -w apps/web -- ...`; the root Vitest command excludes `apps/**`.
- Extend the final judge process so the five persona scores are backed by route evidence, not only chat transcript quality.

Acceptance:

- Every registered route has an evidence owner before final judge scoring; current focused evidence is `J-route-coverage` 2/2 on port `34200`.
- The five-persona judge packet includes screenshots, console status, route coverage, and 10-point scorecard results.
- No route is silently excluded from the final 9/10 claim.

### T12: State and failure bundle evidence

Files to inspect/edit:

- `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`
- `tests/e2e/user-journeys.spec.ts`
- `tests/vision/personas.spec.ts`
- New focused failure-injection tests if needed.

Correction:

- Record the account mode, billing tier, UI disclosure tier, model state, data state, offline/error state, and viewport for each judge run.
- Do not award 9/10 from default-state screenshots alone.
- Include first-run onboarding states: fresh clean data, incomplete wizard, high-volume import detected, model ready/no-model, first-task auto-send, mobile Profile, and post-completion reopen.
- Track any remaining first-run work as broader state/recovery evidence. The focused polish items from `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md` are fixed for high-volume import deliberate review, non-contradictory model-ready copy, and immediate first-task composer clear/disable.
- Include shell overlay states from `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md`: Notification Inbox empty/unread, Create Workspace desktop/mobile, Context Rail loading/empty/expanded, Onboarding Tooltips suppressed/visible, and tier modal close paths.

Acceptance:

- Every judge scorecard cites its state bundle.
- Any skipped state bundle has an approved deferral.

### T13: Launch funnel UX gate

Files to inspect/edit:

- `apps/www`
- `apps/www/app/_components/Pricing.tsx`
- `apps/www/app/api/stripe/checkout/route.ts`
- `apps/www/app/(legal)/**`
- `.github/workflows/deploy-www.yml`

Correction:

- Verify or fix download, mobile nav, sign-in/sign-up/account, real deployed Team checkout, legal trust pages, and deploy target.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: focused T13 supplement records passing www test/typecheck/build, fresh localhost route/API smoke, rendered Browser checkout-recovery evidence, and local checkout/legal/download/deploy-workflow fixes. The canonical domain still does not resolve, real signed installer/release artifacts are not published, deployed Vercel/DNS smoke is missing, deployed Clerk/Stripe success/cancel evidence is missing, and formal legal sign-off is not proved.

Acceptance:

- Launch funnel evidence is attached, or T13 has an approved deferral from the final score.

### T14: Desktop wrapper and release UX gate

Files to inspect/edit:

- `app/src-tauri/**`
- `app/tests/**`
- `app/scripts/**`
- `.github/workflows/release.yml`
- `packages/server/src/local/service.ts`
- `scripts/build-sidecar.mjs`

Correction:

- Verify or fix packaged startup, sidecar readiness/recovery, tray actions, close-to-tray, global shortcut, installer/signing expectations, and update visibility.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: desktop TypeScript, static app helper tests, static Tauri config/update/tray tests, sidecar resource preflight, Rust `cargo check`, web-side Tauri binding tests from `apps/web`, web typecheck, release workflow ordering, and service-level startup/chat/workspace E2E pass. Native source directly handles tray Open/focus, close-to-tray, `Ctrl+Shift+W`, and Quit; Settings routes through a tested `/settings` bridge; Pause and About are hidden. Packaged Tauri interaction evidence and visible update/service recovery UX remain missing.
- T14 deep-dive evidence: `docs/audits/2026-07-08-desktop-wrapper-t14-analysis.md`.

Acceptance:

- Desktop wrapper evidence is attached, or T14 has an approved deferral from the final score.

### T15: Admin and CLI utility UX gate

Files to inspect/edit:

- `packages/admin-web/**`
- `packages/cli/**`
- `packages/launcher/**`
- `packages/marketplace/**`
- `packages/memory-mcp/**`
- `packages/hive-mind-mcp-server/**`
- `packages/hive-mind-cli/**`
- `vitest.config.ts`

Correction:

- Keep admin-web UX beyond the rendered package proof green as states evolve; verify or fix launcher browser-open fallback and service-crash recovery, marketplace CLI help/error/JSON states, memory MCP/hive-mind MCP stdio and missing-config behavior, Waggle CLI command/auth flows, and hive-mind CLI broader package/publish behavior.
- Keep the built legacy `waggle-memory-mcp` read/write entry guarded or explicitly deprecate it; marketplace package manifest/pack/install shape, launcher packed/installed first-command recovery, `@waggle/cli` built/packed/local package-closure installed `npx` help plus local REPL startup/slash-command/exit and streamed chat/provider plumbing, local package-closure installed `hive-mind-cli` help, installed legacy memory MCP read-only startup, and installed hive-mind MCP read-only startup are locally fixed but still need registry-only proof after internal package publication.
- Maintain the safe help/invalid-command behavior now guarded for hive-mind CLI and marketplace CLI; expand evidence to clean package/publish runs.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md` records passing targeted source tests, no-emit TypeScript, builds, focused marketplace/launcher/`@waggle/cli`/hive-mind CLI fixes, focused legacy memory MCP read/write protocol proof plus installed read-only startup, passing built hive-mind MCP write-scope proof plus installed read-only startup, and admin-web evidence proving package-local tests, warning cleanup, 390px shell layout, hash navigation, active semantics, browser back/forward traversal, labelled table scroll regions, rendered control labels, mobile shell keyboard reachability, page-level keyboard traversal from connection fields into the covered admin pages, desktop/mobile visual snapshots, capability governance form coverage, malformed analytics response recovery, all-page initial API-failure recovery, rendered mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save, plus real local bearer-auth middleware wrong-token/valid-token behavior. Launcher evidence now covers invalid-port validation before service setup, occupied-port recovery copy, `--no-open` success copy, packed first-command help, clean installed occupied-port startup recovery, and clean installed long-running `/health` startup; marketplace evidence now covers package manifest/packed-file alignment plus installed help/invalid-command; `@waggle/cli` evidence now covers packed bin help plus local package-closure installed `npx` help, installed local REPL startup/slash-command/exit, and installed streamed chat/provider plumbing against a mock LiteLLM-compatible endpoint; hive-mind CLI evidence now covers local package-closure installed help and a fixed missing `@waggle/shared` runtime dependency; legacy memory MCP evidence now covers a fixed missing `glob` runtime dependency in `@waggle/core`. Remaining utility evidence is registry-only proof after internal package publication.

Acceptance:

- Utility/admin evidence is attached, broken built entries are fixed/deprecated, or T15 has an approved deferral from the final score.

### T16: AI-tool hook lifecycle UX gate

Files to inspect/edit:

- `apps/web/src/components/os/apps/LauncherApp.tsx`
- `packages/shared/src/tool-detection.ts`
- `packages/shared/tests/tool-manifests.test.ts`
- `packages/agent/src/tool-launcher.ts`
- `packages/agent/tests/tool-launcher.test.ts`
- `packages/agent/tests/phase4-hooks-cohort.test.ts`
- `packages/hive-mind-hooks-*/**`

Correction:

- Verify or fix hook install/verify/uninstall UX for `claude-code`, `codex`, `codex-desktop`, `cursor`, `hermes`, and `openclaw`; verify unsupported-but-launchable copy for `claude-desktop`.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: shared/agent/server T16 route-contract plus package-runtime tests pass 7 files / 96 tests; the package-runtime lane builds and packs the local hook package closure, installs it into a clean temp project, then runs `npx --yes @waggle/hive-mind-hooks-<id> install/verify/uninstall` for all six hook-capable packages; the focused registry-aware adapter launch slice passes 5 files / 108 tests; Launcher/prompt/adapter regressions pass 5 files / 72 tests; root-run hook/shim package tests pass 60 files / 573 tests with 1 skipped; hook/shim package-local scripts pass; official package typechecks pass 8/8; Claude Desktop stub build passes; compiled hook-bin help smokes pass 6/6; focused no-reconnect observed-output and hook-result stdout/stderr/Backup-Recovery/Check-failed/uninstall-cleanup/More-output/structured-failure/empty-output/launch-only/third-party-launch coverage passes; focused rendered Launcher Browser smoke artifacts live under `output/playwright/launcher-t16-54147/`; a fresh real Browser route smoke rendered `/launcher` and Verify now shows `verify failed (exit 1)` plus retry/uninstall/reinstall guidance instead of `HTTP 400`; Browser-rendered mocks now show Claude Desktop launch-only copy, Codex Verify manual-approval rows without raw `[FAIL]`, and Codex Uninstall cleanup labels without `Install pointer`; Playwright rendered coverage proves standard install changed-file/pointer/backup/recovery labels, all six hook-capable install/verify/uninstall transitions, sidecar-offline Retry, long-stderr summarization, non-built-in adapter launch-only/prompt behavior, and real OpenClaw observed launch/output/exit/process cleanup; gated route coverage proves real `/api/tools/hooks` install/verify/uninstall for all six hook-capable tools against an isolated profile after fixing Windows hook `npx` resolution; Windows npm shims now resolve to Node module targets when possible, with a quoted fallback for unknown `.cmd`/`.bat` files; Tailwind motion-token ambiguity warnings and the `shape-selection.ts` dynamic/static import warning are fixed and guarded. Packaged desktop hook-status evidence and remaining warning-noise gaps remain. Focused supplement: `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`.
- 2026-07-09 T16 update: Codex WindowsApps launchability/recovery is now fixed at the UX contract layer. The restricted WindowsApps alias is detected as installed but not launchable, and Launcher shows recovery copy instead of a Launch button. T16 remains open for packaged desktop hook-status evidence and warning hygiene.

Acceptance:

- Hook lifecycle evidence is attached, or T16 has an approved deferral from the final score.

### T17: Developer API, background worker, and substrate verification UX gate

Detailed supplement: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`.

Files to inspect/edit:

- `packages/sdk/**`
- `packages/server/**`
- `packages/worker/**`
- `packages/waggle-dance/**`
- `packages/hive-mind-core/**`
- `packages/hive-mind-shim-core/**`
- `packages/hive-mind-wiki-compiler/**`
- `packages/wiki-compiler/**`
- `packages/*/package.json`
- `vitest.config.ts`

Correction:

- Verify or fix SDK, server, worker, WaggleDance, substrate, wiki compiler, optimizer, shared, and agent package verification lanes.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: all 13 remaining workspaces pass no-emit TypeScript; agent tests pass 195 files / 3097 tests; root-run package suites pass for SDK/substrate/shared/worker/WaggleDance/compiler lanes; the dedicated server performance lane passes 13/13; the named server release lane passes 185 files / 2128 tests with one worker; package-local SDK/substrate test scripts pass; Playwright `webServer` startup is fixed by pinning `tsx@4.21.0`, and the focused marketplace browser slice now passes 4/4 on port `34203`.

Acceptance:

- Developer API/background/substrate verification evidence is attached, or T17 has an approved deferral from the final score. The previously identified agent-group dead-end is now corrected: local group runs execute through the sidecar job store with worker progress/cancel/status, and cloud group runs queue the worker-supported `group` job type; focused route/orchestrator coverage passes 19/19.

### T18: Ops, deployment, CI, benchmark, and judging evidence gate

Detailed supplement: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`.

Files to inspect/edit:

- `.github/workflows/**`
- `Dockerfile`
- `docker-compose.yml`
- `docker-compose.production.yml`
- `render.yaml`
- `litellm-config.yaml`
- `ops/**`
- `benchmarks/**`
- `judging/**`
- `vitest.infra.config.ts`
- `vitest.infra-suites.ts`

Correction:

- Verify or fix Docker/Compose, Render, LiteLLM, CI, infra-test, benchmark, and judging evidence lanes.
- Keep this out of Phase 1 unless directly required by a Phase 1 verification failure.
- Current evidence: YAML parse passes, Compose config validates, env/key files checked here are ignored except examples, benchmark harness TypeScript passes, package-local and root-run benchmark tests pass 29 files / 325 tests, the five-journey CI browser smoke is blocking while the broad E2E job remains advisory, no CI infra lane exists, local Docker engine is unavailable for `npm run test:infra`, Render sidecar mode is explicit, and current `judging/` artifacts are historical.

Acceptance:

- Ops/deployment/CI/benchmark/judging evidence is attached, or T18 has an approved deferral from the final score.

## Five-Persona Judge Gate

Existing useful harness:

- `tests/vision/personas.spec.ts` already exercises five persona-style journeys with real local LLM state, screenshots, and artifact output.
- That harness is useful, but it is not yet a complete 9/10 scoring judge. It should be used as a base and extended with explicit scorecards or a separate review pass.
- The detailed scorecard packet lives in `docs/audits/2026-07-08-five-persona-judge-scorecards.md`.

Judge personas:

1. Solo founder: first run, accountless mode, Home Start Here, workspace creation, first chat, return later to a remembered next move.
2. Researcher/analyst: import or browse memory, search, provenance, wiki/timeline, verify no cross-workspace leakage.
3. Engineer/power user: command palette, `Ctrl+Shift+N`, Launcher/MCP, file/tool actions, logs, keyboard-heavy navigation.
4. Nontechnical team admin: Settings, billing language, vault, backup, approvals, workspace/team management, clear recovery from errors.
5. Mobile executive: Home, Settings, account/billing, memory glance, theme/profile controls at 390px width.

Scorecard, 10 points total:

- Functional completion: 2 points.
- Flow, information architecture, and discoverability: 2 points.
- Trust, error handling, and recovery: 2 points.
- Visual quality, accessibility, and responsive behavior: 2 points.
- Performance and polish: 1 point.
- Memory, personalization, and domain fit: 1 point.

Pass condition:

- Each of the five personas scores at least 9/10.
- No persona has any scorecard dimension below 8/10 when normalized.
- No open P0 findings remain.
- Any P1 findings left open have explicit deferral rationale and do not affect the judged journey.
- T13/T14/T15/T16/T17/T18/T19 are fixed or explicitly deferred before claiming complete product UX.

## Verification Gate For Phase 1

Run after the approved Phase 1 fixes:

```powershell
npm run typecheck:web
npm run ux:contrast
npm run ux:color-guard
cd apps/web
npx vitest run
cd ../..
npm run build
```

Then run the focused browser lane on a fresh port:

```powershell
$env:WAGGLE_E2E_PORT='3391'
$env:WAGGLE_E2E_BASE_URL='http://127.0.0.1:3391'
$env:WAGGLE_E2E_SKIP_LITELLM='1'
node node_modules/playwright/cli.js test tests/e2e/full-product-audit.spec.ts tests/e2e/full-wiring-audit.spec.ts tests/e2e/phase-ab-verification.spec.ts tests/e2e/power-user-stress.spec.ts tests/e2e/user-behavior.spec.ts tests/visual/views.spec.ts --project=chromium --reporter=list
```

Manual/visual checks:

- Mobile Home, Settings general/models/billing/profile, Memory, workspace chat, Command Center, and Workspace Switcher at 390 x 844.
- Desktop Home, Settings, Marketplace/MCP, Memory, Chat, Launcher.
- Route coverage manifest updated with evidence owner for every registered route.
- Five-persona judge dry run before asking for final 9/10 approval.
- Judge runbook evidence folders filled or linked before accepting final scores.

## Recommended Approval Decision

Approve Phase 1 first. It has the smallest scope that can move the product from "mostly functional" to "credible enough to judge." Phase 1 should be capped to the directly implicated files and should not become a broad redesign.

Decision brief: `docs/audits/2026-07-08-ux-approval-brief.md`.

Implementation plan for that approval: `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`.

Track closure in: `docs/audits/2026-07-08-ux-correction-register.md`.

Do not start new surfaces. Improve the existing Home, Settings, Marketplace/MCP, auth/accountless, and verification surfaces first.
