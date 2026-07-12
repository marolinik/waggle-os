# UX Phase 1 Approval Brief

Status: analysis complete enough to request Phase 1 implementation approval. No product code has been changed by this analysis packet.

Packet index: `docs/audits/2026-07-08-ux-packet-index.md`.

## Decision Requested

Approve Phase 1 implementation from `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`.

Recommended execution mode: Subagent-Driven, with one focused worker per task and review after each task.

Fallback execution mode: Inline Execution in this session, with checkpoints after each task.

## Why Phase 1 First

The current built app is broadly functional, but seven P0 issues prevent an honest five-persona 9/10 score:

1. Local auth/CSP/Clerk console errors.
2. Mobile Settings layout failure.
3. Mobile first-run onboarding hides the primary Continue action.
4. Active user-facing Pro copy after the Solo/Team collapse.
5. Visual snapshots failing every tracked view.
6. `Ctrl+Shift+N` shortcut contract failure.
7. Workspace Switcher overlay blocking route traversal.

Phase 1 also includes the minimum route-evidence work needed to stop thin routes from being skipped in the final judge gate.

## Approved Scope If User Says "Approve Phase 1"

- T1 local auth, Clerk, and CSP console health.
- T2 mobile Settings and first-run onboarding responsive layout.
- T3 Solo/Teams/Enterprise copy cleanup.
- T4 `Ctrl+Shift+N` and Workspace Switcher route contract.
- T5 visual snapshot triage.
- T11 route evidence for thin judge paths.
- Update the audit/register/scorecards with actual verification evidence.

## Explicitly Out Of Scope For Phase 1

- Broad redesigns or new product surfaces.
- Full native-dialog replacement across the entire app.
- Performance chunk-splitting beyond direct Phase 1 test blockers.
- Local model pricing semantics unless a Phase 1 verification run forces a tiny supporting fix.
- Marketplace live-sync architecture changes beyond documenting current flake and keeping standard audit deterministic.
- Public launch site, download, checkout, legal, GitHub Pages deployment, installer, tray, update, signing, sidecar-startup, admin web, CLI launcher, marketplace CLI, memory/MCP utility gates, AI-tool hook lifecycle gates, Browser Companion extension gates, developer API/background/substrate verification gates, and ops/deployment/CI/benchmark/judging gates, except where T1 auth/CSP overlap directly blocks Phase 1 verification.

## Evidence Packet

- Analysis completion audit: `docs/audits/2026-07-08-analysis-completion-audit.md`
- Full audit and findings: `docs/audits/2026-07-08-complete-ux-usage-audit.md`
- Route/scenario manifest: `docs/audits/2026-07-08-ux-route-scenario-manifest.md`
- Route evidence T11 analysis: `docs/audits/2026-07-08-route-evidence-t11-analysis.md`
- State/failure scenario matrix: `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`
- Focused T12 state/failure analysis: `docs/audits/2026-07-08-state-failure-t12-analysis.md`
- Focused Mobile Executive T2/T12 analysis: `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md`
- Focused visual T5 classification: `docs/audits/2026-07-08-visual-t5-classification.md`
- Focused first-run onboarding T1/T2/T12 analysis: `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`
- Non-main surface scope: `docs/audits/2026-07-08-ux-non-main-surface-scope.md`
- Five-persona scorecards: `docs/audits/2026-07-08-five-persona-judge-scorecards.md`
- Correction register: `docs/audits/2026-07-08-ux-correction-register.md`
- Desktop wrapper T14 analysis: `docs/audits/2026-07-08-desktop-wrapper-t14-analysis.md`
- Admin/CLI utility T15 analysis: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`
- AI-tool hook lifecycle T16 analysis: `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`
- Developer/substrate T17 analysis: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`
- Ops/deployment/CI/judging T18 analysis: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`
- Public launch funnel T13 analysis: `docs/audits/2026-07-08-launch-funnel-t13-analysis.md`
- Browser Companion T19 analysis: `docs/audits/2026-07-08-browser-companion-t19-analysis.md`
- Runtime accessibility T10 analysis: `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`
- Shell overlay T10/T12 analysis: `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md`
- Phase 1 implementation plan: `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`

## Phase 1 Completion Gate

Phase 1 is not complete until:

- The Phase 1 verification commands in the plan pass, or visual baseline decisions are explicitly reviewed and recorded.
- T5 uses the fresh visual classification as its starting point: current desktop actuals are coherent, baselines are stale, and `--update-snapshots` waits until Phase 1 UI changes are approved and landed.
- Required desktop/mobile screenshots are captured or inspected.
- Mobile checks prove critical visible controls stay within the viewport on `/settings`, `/settings?tab=models`, `/settings?tab=billing`, `/settings/profile`, `/memory`, and workspace chat; document-level scroll width alone is not sufficient.
- First-run onboarding checks prove a clean accountless data dir can reach the wizard without Clerk/CSP console errors and the 390 x 844 Profile step keeps its primary Continue action visible or clearly reachable.
- The selected Mobile Executive overlay path opens and closes without trapping focus or scroll. The fresh mobile smoke showed Workspace Switcher closing with Escape but Command Center still visible after Escape, so Command Center cannot be treated as passing until fixed or deferred.
- The correction register rows for T1, T2, T3, T4, T5, and T11 are updated with current evidence.
- The current all-route route-smoke evidence is codified into a repeatable route owner or explicitly deferred; `/benchmarks`, `/platform`, `/payment-cancelled`, Launcher watch mode, Usage & Cost, and the catch-all route have route-health assertions that distinguish expected states from console failures.
- No P0 remains open.

## After Phase 1

Run a judge dry run. If no installed-app P0 remains and the scorecards are no longer capped by Phase 1 blockers, proceed to Phase 2/launch readiness: trust-critical dialogs, marketplace determinism, form accessibility, runtime axe/DOM accessibility findings, warning hygiene, T12 state/failure bundle evidence, mobile Memory/chat tab behavior, first-run import/model/auto-send polish, Command Center mobile close/label fit if selected for scoring, shell overlay semantics/close/hierarchy fixes, T13 launch-funnel repair/evidence, T14 desktop-wrapper evidence, T15 admin/CLI/MCP utility evidence, T16 AI-tool hook lifecycle evidence, T17 developer API/background/substrate verification evidence, T18 ops/deployment/CI/benchmark/judging evidence, T19 Browser Companion extension evidence, and other P1 items.

T12 now has focused supplements: a passing state-slice unit run is good signal; the mobile smoke proves screenshot and critical-element bounds are required because clean document scroll width can still hide clipped controls; the first-run smoke proves skip-onboarding harnesses do not cover accountless setup, high-volume import decisions, or mobile Profile primary-action reachability; and the shell-overlay smoke proves Notification Inbox and Create Workspace still fail basic close/semantics expectations. T10 now also has runtime evidence: axe/DOM smoke found critical unnamed controls/selects, a Files scroll-region keyboard issue, workspace semantics/image-alt issues, Command Center dialog/label-fit warnings, and shell-overlay unnamed icon/landmark gaps. Final scoring still needs state bundles that tie account mode, billing tier, UI disclosure, model state, data state, offline/error state, viewport, route screenshots, and console status to each persona.

T13 now includes a launch-scoped P0: www tests/typecheck/build pass and corrected-host public-site smoke renders core routes locally, but the canonical `waggle-os.ai` domain does not resolve from the audit environment, real signed installer artifacts are not published, deployed Vercel/DNS proof is still missing, and deployed Clerk/Stripe/legal sign-off evidence remains open. T14 records strong static/Rust/service evidence plus release/tray source hardening: Settings is bridged, Quit is native, and Pause/About are hidden, but packaged tray/close/shortcut evidence, update/service UX, installer/signing proof, package-local web Tauri command shape, and absent packaged interaction evidence keep T14 open. T15 now records focused marketplace built help/invalid-command plus package manifest/packed-file alignment and clean installed packed-CLI `npx` help/invalid recovery, launcher help/invalid-port/occupied-port recovery plus packed first-command, clean installed occupied-port startup recovery, and clean installed long-running `/health` startup, `@waggle/cli` built/packed/local package-closure installed `npx` help plus installed local REPL startup/slash-command/exit and streamed chat/provider plumbing, memory MCP read/write plus local package-closure installed read-only startup, hive-mind MCP read/write plus local package-closure installed read-only startup, hive-mind CLI local package-closure installed `npx` help, and admin-web unit plus rendered package coverage across all seven pages at desktop/mobile widths, including browser back/forward traversal, page-level keyboard traversal, desktop/mobile visual snapshots, malformed analytics response recovery, all-page initial API-failure recovery, rendered mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save, plus real local bearer-auth wrong-token/valid-token behavior. Registry-only proof after internal package publication still keeps the utility lane open.

T16 now records strong route/contract, hook package, hook/shim package-local scripts, typecheck, compiled-bin, packed-package `npx` install/verify/uninstall lifecycle, focused no-reconnect observed-output coverage, hook stdout/stderr/Backup-Recovery/Check-failed/uninstall-cleanup/More-output/structured-failure/empty-output/Claude Desktop launch-only detail coverage, focused registry-aware third-party adapter launch coverage, partial rendered Launcher Browser evidence, codified Playwright standard install changed-file/pointer/backup/recovery labels, all six hook-capable install/verify/uninstall rendered transitions, sidecar-offline Retry, long-stderr summarization, and non-built-in adapter launch-only/prompt proof, Browser smokes where real Verify renders `verify failed (exit 1)` with retry/uninstall/reinstall guidance instead of `HTTP 400`, mocked Codex Verify renders manual-approval rows without raw `[FAIL]`, and mocked Codex Uninstall renders restore/cleanup rows without `Install pointer`, plus a gated real-tool Playwright smoke where OpenClaw renders as a real detected CLI and launches through the sidecar with observed output, exit 0, and process cleanup. A broadened gated route smoke proves `/api/tools/hooks` can run real install, verify, and uninstall for `claude-code`, `codex`, `codex-desktop`, `cursor`, `hermes`, and `openclaw` against an isolated profile and clean up afterward; the earlier red run exposed Windows `execFile('npx')` shim resolution, now fixed by resolving the Node-installed `npx.cmd` and using the shared `.cmd` resolver. Windows npm shims now resolve to Node module targets when possible, with a quoted fallback for unknown `.cmd`/`.bat` files, Codex found only through the restricted WindowsApps alias is now installed-but-not-launchable with recovery copy, Tailwind motion-token ambiguity warnings are removed, and the `shape-selection.ts` dynamic/static import warning is removed. T16 still needs packaged desktop hook-status evidence and remaining warning hygiene. T17 records remaining non-hook package-local test command failures and a full server-suite perf flake. T18 records secret-safe ops logging, Render target, CI/infra, benchmark command-shape, and current judging-artifact gaps. T19 now records direct sidecar save success, content-script extraction from a normal page, legacy-trust extension save success, secure-default session-token bootstrap, MV3 service-worker no-Origin handling, background save auth, sticky setup errors, restricted-page recovery copy, disabled-state styling, honest memory-destination copy, loaded-extension save/frame confirmation, popup keyboard/focus/Enter save proof, direct popup Save page click evidence, rendered Memory UI confirmation after secure popup saves, context-menu handler coverage, stable packaged-ID pairing proof, Memory search provenance consistency for imported captures, and existing chat `auto_recall`/catch-up imported provenance. It still needs native toolbar-bubble evidence or manual release proof, native context-menu click evidence or explicit deferral, signed Web Store/installer-distributed extension proof if release packaging is scored, and separate proof for any future recall result shape if scored.
