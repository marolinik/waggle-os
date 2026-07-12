# UX Audit Packet Index

Status: analysis packet is approval-ready. Full goal remains open until approved fixes and five-persona judge scoring are complete.

## Start Here

1. `docs/audits/2026-07-08-ux-approval-brief.md` - shortest decision doc; approve Phase 1 from here.
2. `docs/audits/2026-07-08-analysis-completion-audit.md` - proves what the analysis phase covers and what remains unfinished.
3. `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md` - implementation plan to execute after approval.

## Evidence Files

| File | Purpose |
|---|---|
| `docs/audits/2026-07-08-complete-ux-usage-audit.md` | Full evidence, findings, phases, tickets, and verification results. |
| `docs/audits/2026-07-08-ux-route-scenario-manifest.md` | Registered routes, overlays, scenarios, and evidence owner requirements. |
| `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md` | Account, tier, model, data, offline, mobile, and failure-state combinations that judge runs must sample. |
| `docs/audits/2026-07-08-ux-non-main-surface-scope.md` | Public landing/download/checkout/legal, desktop wrapper, installer/update, sidecar-startup, utility, hook, developer/substrate, ops/deployment, CI, benchmark, and judging scope decisions. |
| `docs/audits/2026-07-08-five-persona-judge-scorecards.md` | Five judge personas, scoring model, score caps, and required screenshots/evidence. |
| `docs/audits/2026-07-08-five-persona-judge-runbook.md` | Executable judge protocol: state bundles, route sequences, required screenshots, score caps, deferral rules, and evidence folder shape. |
| `docs/audits/2026-07-08-ux-correction-register.md` | Master row-by-row tracker mapping findings to tickets, phases, files, judges, and closure evidence. |
| `docs/audits/2026-07-08-ux-approval-brief.md` | Concise approval decision and Phase 1 scope boundaries. |
| `docs/audits/2026-07-08-analysis-completion-audit.md` | Requirement trace from the original goal to current evidence and remaining blockers. |
| `docs/audits/2026-07-08-ux-post-phase-1-roadmap.md` | Sequencing for Phase 2/3 work after Phase 1; not approved for implementation yet. |
| `docs/audits/2026-07-08-web-guidelines-line-findings.md` | Line-level Web Interface Guidelines supplement for native dialogs, focus, forms, animation, images, and locale formatting. |
| `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md` | Focused runtime axe/DOM accessibility smoke for core desktop/mobile routes and Command Center; adds rendered T10 evidence for unnamed controls, select labels, scroll regions, workspace semantics, and mobile command-label overflow. |
| `docs/audits/2026-07-08-visual-t5-classification.md` | Fresh visual-regression rerun and 14-snapshot classification: current screenshots are coherent, active baselines are stale, duplicate baseline families need cleanup, and baseline updates must wait for approval. |
| `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md` | Focused clean-data first-run onboarding smoke with desktop completion, mobile 390 x 844 profile evidence, Clerk/CSP console reproduction, import-risk findings, and T1/T2/T12 closure updates. |
| `docs/audits/2026-07-08-source-inventory-consistency-audit.md` | Current-source route/app/package inventory check; adds Browser Companion T19 and command-query evidence notes. |
| `docs/audits/2026-07-08-browser-companion-t19-analysis.md` | Focused Browser Companion extension analysis with manifest/syntax/typecheck evidence, disconnected/connected popup screenshots, direct sidecar save evidence, current toolbar/extraction probes, Memory UI confirmation, CORS/auth-pairing findings, and T19 line-level findings. |
| `docs/audits/2026-07-08-desktop-wrapper-t14-analysis.md` | Focused Tauri desktop wrapper analysis with Rust/app/server checks, native event consumer matrix, release/tray source hardening, and T14 line-level findings. |
| `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md` | Focused admin web, CLI, marketplace, memory MCP, hive-mind MCP, and hive-mind CLI analysis with package test/build/help and MCP protocol smoke evidence. |
| `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md` | Focused AI-tool hook lifecycle analysis with Launcher/source evidence, rendered Browser smoke artifacts, hook package/root-run tests, package typechecks, compiled bin help smokes, and T16 correction candidates. |
| `docs/audits/2026-07-08-developer-substrate-t17-analysis.md` | Focused developer API, server, worker, WaggleDance, SDK, and substrate verification analysis with package/root command evidence and T17 correction candidates. |
| `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md` | Focused ops, deployment, CI, benchmark, and judging analysis with YAML/Compose/secret-safe checks, benchmark evidence, and T18 correction candidates. |
| `docs/audits/2026-07-08-launch-funnel-t13-analysis.md` | Focused public launch funnel analysis with www test/build/typecheck/route smoke evidence, rendered Browser checkout-recovery evidence, live apex/www DNS failure, download/release check, local checkout/auth recovery fixes, controlled download status page, legal placeholder guard, and remaining T13 correction candidates. |
| `docs/audits/2026-07-08-route-evidence-t11-analysis.md` | Focused installed-app route evidence analysis with route registry, direct test-reference matrix, app-test command evidence, zero-hit route findings, current all-route built-preview smoke evidence, and T11 correction candidates. |
| `docs/audits/2026-07-08-state-failure-t12-analysis.md` | Focused T12 analysis with state-slice test evidence, native dialog source evidence, five-persona state-bundle contract, and T12 correction candidates. |
| `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md` | Fresh 390 x 844 Mobile Executive smoke evidence showing Settings visible clipping despite clean document scroll width, Memory/chat tab overflow, Command Center mobile close/label risks, and stronger T2/T12 acceptance criteria. |
| `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md` | Focused shell-overlay smoke/source evidence for Notification Inbox, Create Workspace, Spawn Agent, Workspace Switcher, Persona Switcher, Keyboard Shortcuts, Context Rail, Onboarding Tooltips, Upgrade Modal, and Trial Expired Modal. |
| `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md` | Bite-sized test-first implementation plan for Phase 1. |

## Current Decision

Approve Phase 1 before coding.

Recommended execution mode: Subagent-Driven.

Phase 1 includes only:

- Local auth/Clerk/CSP console health.
- Mobile Settings and first-run onboarding responsive layout.
- Solo/Teams/Enterprise copy cleanup.
- `Ctrl+Shift+N` and Workspace Switcher route contract.
- Visual snapshot triage.
- Route evidence for thin judge paths.

## Not Ready To Claim

Do not mark the goal complete until:

- P0 findings are closed.
- Phase 1 and any judge-blocking P1 items are verified.
- Mobile evidence proves critical visible controls stay in-bounds, not merely that document-level horizontal overflow is absent.
- First-run onboarding evidence proves accountless clean-data setup has no Clerk/CSP console errors and mobile Profile primary action is visible or clearly reachable.
- Every registered route and major overlay has an evidence owner.
- State and failure-mode bundles are declared for each judge run.
- The five-persona judge runbook is filled with current evidence, not merely referenced.
- Launch funnel and desktop wrapper gates are fixed or explicitly deferred from the final score.
- Admin web, CLI launcher, marketplace CLI, and memory/MCP utility gates are fixed or explicitly deferred from the final score. Current admin-web rendered artifacts: `output/playwright/admin-web-t15-57795/`.
- AI-tool hook lifecycle gates are fixed or explicitly deferred from the final score.
- Developer API, background worker, and substrate verification gates are fixed or explicitly deferred from the final score.
- Ops, deployment, CI, benchmark, and judging gates are fixed or explicitly deferred from the final score.
- Web Guidelines line findings are fixed or explicitly assigned to T7/T8/T10/T12 deferrals.
- Runtime T10 axe/DOM findings are fixed or explicitly assigned to judge-route deferrals.
- T5 visual baseline decisions are approved after the fresh classification note; stale baselines are updated only after Phase 1 UI fixes land.
- Command Center mobile close/label-fit evidence is fixed or explicitly deferred from the Mobile Executive and Engineer score paths.
- Shell overlay T10/T12 findings are fixed or explicitly deferred, especially Notification Inbox Escape/semantics, Create Workspace semantics/mobile hierarchy, Context Rail landmarking, coach-mark semantics, and named close/icon controls.
- Source-inventory supplement findings, including Browser Companion T19, are fixed or explicitly deferred.
- Five persona scorecards are filled from current evidence.
- All five personas score at least 9/10.
