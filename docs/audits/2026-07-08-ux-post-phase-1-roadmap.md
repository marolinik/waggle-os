# UX Post-Phase-1 Roadmap

Status: analysis artifact. This roadmap sequences the remaining correction work after Phase 1. It is not approved for implementation yet.

## Purpose

Phase 1 removes the P0 blockers that currently cap the judge score. This roadmap keeps the remaining P1/P2 work visible so the product can move from "credible enough to judge" toward the requested 9/10 across five personas.

## Phase 2: Trust, Determinism, and Accessibility

Goal: remove P1 items that directly affect trust, recovery, or high-frequency workflows.

### R2-1: Trust-critical dialogs

Source finding: P1-1 / T7.

Line evidence: `docs/audits/2026-07-08-web-guidelines-line-findings.md` historically listed 20 high-confidence native browser dialog calls; the current follow-up scan finds 0 after the Create Workspace, Approvals, Artifact, Memory Center, Wiki export, Settings telemetry/backup/restore, BackupApp restore, Automation delete, compliance template delete, and admin member-removal fixes.

Current evidence update:

- Create Workspace custom-template delete is fixed with an in-app confirmation and focused component coverage.
- Approvals revoke-all is fixed with the shared in-app `ApprovalModal`; `p7-b1-approvals-error.test.tsx` covers the no-native-confirm contract, `J3d` passes a rendered `/approvals` route path on port `34159`, and the expanded user-journey suite passed 20/20 on port `34160` before the Artifact `J3e` addition.
- Artifact permanent delete is fixed with the shared in-app `ApprovalModal`; `artifact-center-trust.test.tsx` covers the no-native-confirm contract, `J3e` passes a rendered `/artifacts` route path on port `34161`, and the expanded user-journey suite passes 21/21 on port `34162`.
- Memory Center permanent delete, GDPR erase, and allow re-import are fixed with the shared in-app `ApprovalModal`; `memory-center-trust.test.tsx` covers the no-native-confirm contract, `J3f` passes a rendered `/memory?tab=memories` route path on port `34164`, and the expanded user-journey suite passes 22/22 on port `34165`.
- Wiki Obsidian and Notion exports are fixed with in-app form dialogs; `wiki-export-trust.test.tsx` covers the no-native-prompt contract, `J3g` passes a rendered `/memory?tab=wiki` route path on port `34167`, and the path remains included in the latest 24/24 user-journey suite on port `34173`.
- Settings telemetry clear and Settings backup/restore are fixed with in-app approval/status states; `settings-trust.test.tsx` covers the no-native-dialog contract, `J3h` passes a rendered `/settings?tab=backup` route path on port `34171`, and the expanded user-journey suite passes 24/24 on port `34173`.
- Standalone `BackupApp.tsx` restore is fixed with the shared in-app `ApprovalModal`; `p1b-authgate-surfaces.test.tsx` covers the no-native-confirm contract.
- Automation delete is fixed with the shared in-app `ApprovalModal`; `phase3b-automation-center.test.tsx` covers the no-native-confirm contract.
- Compliance template delete is fixed with the shared in-app `ApprovalModal`; `compliance-template-trust.test.tsx` covers the no-native-confirm contract.
- Admin-web member removal is fixed with an in-app confirmation panel; `admin-pages.test.ts` covers the no-native-confirm contract.

Surfaces:

- No current high-confidence production native dialogs remain; broader T7 work should now focus on persona-state evidence, error states, and keyboard/screen-reader polish for the fixed flows.
- Remaining workspace/template destructive actions, if any, outside the fixed custom-template delete path.

Acceptance:

- No native `confirm`, `alert`, or `prompt` in trust-critical flows.
- In-app modal or inline confirmation names the object, consequence, reversibility, and next step.
- Result state appears in-app after completion or failure.

Judge impact:

- Team admin.
- Researcher.
- Mobile executive where destructive flows are reachable.

### R2-2: Marketplace/local-first determinism

Source finding: P1-3 / T6.

Surfaces:

- Marketplace browse/search.
- `/api/marketplace/sync`.
- Marketplace background sync.

Acceptance:

- Standard UX audit does not call live external marketplace sources.
- Live sync is moved to a named live-integration lane or guarded by explicit environment behavior.
- Marketplace search and browse pass without retry flakes.

Judge impact:

- Engineer.
- Solo founder.

### R2-3: Form, focus, and icon-button accessibility

Source finding: P1-5 / T10.

Line evidence: `docs/audits/2026-07-08-web-guidelines-line-findings.md` lists high-confidence focus misses, image-dimension misses, and a form metadata audit queue.

Surfaces:

- Settings.
- Profile.
- Workspace creation.
- Workspace actions dialogs.
- Agent/persona creation.
- Mission Control and agent cards.
- Compliance templates.
- Onboarding forms.

Acceptance:

- High-traffic forms have accessible names, associated labels, and inline errors.
- Focus order is predictable.
- First invalid field receives focus on submit where practical.
- Icon-only controls have accessible names.
- Modal initial focus and focus return are covered for high-traffic dialogs.

Judge impact:

- Mobile executive.
- Team admin.
- Engineer.
- Solo founder.

### R2-4: Test warning hygiene

Source finding: P1-2 / T10.

Surfaces:

- Component tests emitting repeated `act(...)` warnings outside the now-quiet focused admin-web lane.
- Standard verification lane output.

Acceptance:

- Warnings that mask real failures are eliminated, scoped, or documented.
- Standard verification output remains readable enough for reviewers.

Judge impact:

- Indirect, all personas.

### R2-5: Route evidence completion

Source finding: P1-7 / T11.

Current evidence:

- `docs/audits/2026-07-08-route-evidence-t11-analysis.md` now includes a current all-route built-preview smoke on port 3457.
- Artifacts live under `output/playwright/route-evidence-3457/`.
- The smoke proves 33 desktop route navigations plus 11 mobile route spot-checks return 200, produce screenshots, and have no document-level horizontal overflow.
- `/payment-cancelled` redirects to `/settings?tab=billing`.
- T11 remains open because this evidence is ad hoc, every sampled route logs the Clerk development-key warning, `/launcher?watch=1` logs detectTools network noise, `/settings/usage` logs a 403 resource error, the catch-all route logs its expected 404 as a console error, and several judge-route controls still lack accessible names/labels.

Surfaces:

- Any route still marked Thin or Missing after Phase 1.
- Major overlays not exercised by Phase 1.

Acceptance:

- Every route and major overlay has a smoke, visual, or persona evidence owner.
- Deferrals are explicit and approved.

Judge impact:

- All personas.

### R2-6: Shell overlay semantics and create-workspace hierarchy

Source findings: P1-19 / T10/T12 and P1-20 / T10/T12/T7.

Focused supplement: `docs/audits/2026-07-08-shell-overlays-t10-t12-analysis.md`.

Surfaces:

- Notification Inbox.
- Create Workspace.
- Context Rail.
- Onboarding Tooltips.
- Upgrade and Trial Expired modals.

Current evidence update:

- Fresh desktop/mobile overlay smoke passes the high-level open/close path for Keyboard Shortcuts, Persona Switcher, Workspace Switcher, Spawn Agent, and Upgrade Modal.
- Notification Inbox now has a named dialog contract, focus trap, Escape close, and named mark-all/close actions.
- Create Workspace now has named primary/subdialog contracts, focus traps, Escape close, named sampled template/share actions, in-app custom-template delete confirmation, and focused 390 x 844 rendered evidence that required setup precedes optional templates.
- Context Rail now has a labelled complementary contract and named close action at component level; route-specific rendered states still need evidence.
- Onboarding Tooltips now has an explicit non-modal dialog contract and Escape dismissal at component level; rendered first-run/mobile evidence still needs refresh.
- Upgrade and Trial Expired close icons now have accessible names; the event-driven Upgrade modal close path has rendered `J3c` evidence.
- Browser-plugin spot check for this slice failed on the in-app Browser DOM snapshot path (`incrementalAriaSnapshot is not a function`), so Playwright remains the reliable rendered evidence lane until P2-2 is fixed.

Acceptance:

- Modal overlays share dialog semantics, focus behavior, Escape close, focus return, and named close/icon actions.
- Non-modal panels use labelled landmarks and predictable keyboard reachability.
- Create Workspace prioritizes required name/storage/create controls on the sampled mobile path, with templates progressive or summarized.
- Template destructive actions use in-app confirmation and result states.
- Desktop and 390 x 844 overlay screenshots plus DOM/keyboard evidence are attached; current gap is refreshed screenshot/state coverage beyond the focused Create Workspace path.

Judge impact:

- Mobile executive.
- Engineer.
- Solo founder.
- Team admin when workspace/template management is in scope.

### R2-7: Admin web and CLI/MCP utility evidence

Source finding: P1-11 / T15.

Surfaces:

- `packages/admin-web`.
- `packages/launcher` / `npx waggle`.
- `packages/cli`.
- `packages/marketplace` CLI.
- `packages/memory-mcp` and `packages/hive-mind-mcp-server`.
- `packages/hive-mind-cli`.

Current evidence update:

- T15 deep-dive: `docs/audits/2026-07-08-admin-cli-utility-t15-analysis.md`.
- Targeted source tests, no-emit TypeScript checks, and package builds pass for the inspected admin/CLI/MCP utility surfaces.
- Admin-web built-render smoke covers all 7 desktop pages and all 7 mobile pages under `output/playwright/admin-web-t15-57795/`; typed happy paths render with no current-port console errors. A newer package-owned rendered Playwright gate builds the admin web and passes all seven pages across desktop/mobile widths, hash deep links, browser back/forward traversal, `aria-current`, labelled table scroll regions, rendered control labels, mobile shell keyboard reachability, page-level keyboard traversal from connection fields into the covered admin pages, desktop/mobile visual snapshots, capability governance forms, malformed analytics response recovery, all-page initial API-failure recovery, rendered mutation/destructive-failure recovery for capability policy save, capability override create/remove, capability request decision, member invite, member role change, member removal, and team settings save, local bearer-auth wrong-token/valid-token behavior, and React warning cleanup.
- Built legacy `waggle-memory-mcp` read-only/write-scope protocol startup plus installed read-only startup, built hive-mind MCP read-only/write-scope protocol startup plus installed read-only startup, built/packed/local package-closure installed `@waggle/cli` `npx` help plus installed local REPL startup/slash-command/exit and streamed chat/provider plumbing, launcher built help/invalid-port/occupied-port recovery plus packed first-command, clean installed occupied-port startup recovery, and clean installed long-running `/health` startup, built/installed marketplace CLI help/invalid-command behavior plus package manifest/packed-file alignment, and local package-closure installed `hive-mind-cli` help are locally fixed, but still need registry-only proof after internal package publication.
- Built hive-mind MCP passes official MCP client read-only registration and write-scope save/recall roundtrips with 9 tools and 4 resources.
- Package-local test commands remain inconsistent outside the now-documented hive-mind CLI and hook/shim lanes. Root Vitest does not discover hive-mind CLI colocated tests under `src/`, but `npm run test --workspace @waggle/hive-mind-cli -- --reporter=dot` now owns that lane. Marketplace invalid-command behavior and sampled hive-mind CLI subcommand help are now locally fixed and guarded.

Acceptance:

- Admin-web rendered desktop/mobile happy-path, browser-history, page-level keyboard, visual snapshot, malformed analytics recovery, initial API-failure, mutation/destructive-failure, and local bearer-auth states stay green in the package-owned gate.
- Built utility entries run from a clean environment, are explicitly deprecated, or are deferred.
- Utility CLIs have happy-path and error-path command evidence, or are deferred.
- Hive-mind CLI package-local test discovery remains in the documented verification lane; the remaining package-local script gaps are fixed or have documented separate verification lanes.

Judge impact:

- Team admin.
- Engineer.
- Solo founder setup path.

### R2-8: AI-tool hook lifecycle evidence

Source finding: P1-12 / T16.

Surfaces:

- Launcher hook install/verify/uninstall UI.
- `packages/hive-mind-hooks-claude-code`.
- `packages/hive-mind-hooks-codex`.
- `packages/hive-mind-hooks-codex-desktop`.
- `packages/hive-mind-hooks-cursor`.
- `packages/hive-mind-hooks-hermes`.
- `packages/hive-mind-hooks-openclaw`.
- `packages/hive-mind-hooks-claude-desktop` unsupported/stub copy.

Current evidence update:

- Shared/agent/server T16 route-contract plus package-runtime tests pass 7 files / 96 tests, and the focused registry-aware adapter launch slice passes 5 files / 108 tests.
- Packed-package `npx --yes @waggle/hive-mind-hooks-<id> install/verify/uninstall` lifecycle passes for all six hook-capable packages from a clean temp project with the local package closure installed.
- Launcher/prompt/adapter tests pass 3 files / 28 tests.
- Root-run hook/shim package tests pass 60 files / 573 tests with 1 skipped.
- Hook/shim package-local `npm run test --workspace ...` scripts now pass for hook core, all six hook-capable packages, and shim core; the shim lane also verifies the CLI ESM resolver fix for the MCP server entry.
- Official hook/shim package typechecks pass 8/8, the Claude Desktop stub build passes, and compiled hook-bin help smokes pass 6/6.
- Focused rendered Launcher Browser smoke artifacts live under `output/playwright/launcher-t16-54147/`; they prove mixed hook states, prompt summary, install success, verify failure, and running output against a mock local API, while exposing the original generic/dropped-detail result copy, missing Claude Desktop launch-only copy, and prompt metadata gaps. Duplicate live-output replay after exit, hook stdout/stderr detail visibility, Backup/Recovery labels for covered install output, Check-failed/manual-approval rows for Verify output, uninstall restore/cleanup labels, More-output summarization, structured hook failure preservation, empty-output Verify recovery copy, and Claude Desktop launch-only copy are now covered by focused web regressions; a fresh real `/launcher` Browser smoke now renders `verify failed (exit 1)` with retry/uninstall/reinstall guidance instead of `HTTP 400`, Browser-rendered mocked states now cover Claude Desktop launch-only copy, Codex Verify manual approval, and Codex Uninstall cleanup, a codified rendered Playwright spec covers standard install changed-file/pointer/backup/recovery labels, all six hook-capable install/verify/uninstall transitions, sidecar-offline Retry, long-stderr summarization, and non-built-in adapter launch-only/prompt behavior, a gated real-tool Playwright spec covers OpenClaw rendered detection plus observed launch/output/exit/process cleanup, and a gated route Playwright spec covers real `/api/tools/hooks` install/verify/uninstall for all six hook-capable tools against an isolated profile. Packaged desktop hook-status transitions remain open rather than a generic status leak.
- Tailwind motion-token warning hygiene is partially fixed: ambiguous `duration-[var(--mo-*)]` / `ease-[var(--mo-ease)]` classes are replaced by named utilities and guarded by `motion-class-hygiene.test.ts`; the `shape-selection.ts` dynamic/static import warning is also fixed and guarded by `build-warning-hygiene.test.ts`; the Vite large-chunk warning is fixed by lazy-loading routes, closed shell overlays, ChatHost, and PostHog analytics. Remaining warning hygiene still includes color-env, embedding, and hook negative-path noise.
- Focused evidence and open gaps are recorded in `docs/audits/2026-07-08-ai-tool-hook-t16-analysis.md`.

Acceptance:

- Rendered Launcher evidence covers detected/not-detected, standard install changed-file/pointer labels, verify, uninstall, all six hook-capable install/verify/uninstall transitions, sidecar offline, long-stderr, error, unsupported Claude Desktop states, and at least one real observed CLI launch; packaged desktop hook-status evidence is still required for T16 closure.
- Command lifecycle evidence covers six hook-capable packages through the production-like package-name invocation path; route lifecycle evidence covers all six hook-capable tools through safe isolated install/verify/uninstall smokes.
- Registry-only proof is captured after actual hook package publication.
- Observed live output does not duplicate replay after terminal exit, hook result stdout/stderr/Backup-Recovery/Check-failed/structured-failure/empty-output recovery details are preserved, and Claude Desktop launch-only copy is explicit; current focused evidence passes in the Launcher/web suite.
- Third-party adapter detection/launch behavior is fixed or explicitly out of scope.
- Expected fail-open/log noise is quiet enough or explicitly documented.

Judge impact:

- Engineer.
- Solo founder.
- Team admin.

### R2-9: Developer API, background worker, and substrate verification evidence

Source finding: P1-13 / T17.

Dedicated supplement: `docs/audits/2026-07-08-developer-substrate-t17-analysis.md`.

Surfaces:

- `packages/sdk`.
- `packages/server`.
- `packages/worker`.
- `packages/waggle-dance`.
- `packages/agent`, `packages/core`, and `packages/shared`.
- `packages/hive-mind-core`, `packages/hive-mind-shim-core`, `packages/hive-mind-wiki-compiler`, and `packages/wiki-compiler`.
- Package-local test scripts and root Vitest discovery.

Current evidence update:

- Direct no-emit TypeScript passes for 13 remaining backend/developer/substrate workspaces.
- Agent tests pass 194 files / 3079 tests.
- Core, optimizer, and weaver tests pass through package scripts.
- Root-run SDK, substrate, shared, worker, WaggleDance, and compiler tests pass.
- Current full server route suite passes, but it is slow/noisy; earlier packet evidence saw one workspace-listing perf budget failure under full-suite load while the same benchmark passed in isolation.
- Several non-hook package-local `npm test` scripts fail by command shape even though root-run tests pass.
- Marketplace sync behavior leaks into the normal server verification lane and should be made hermetic or moved to a named live-integration lane.

Acceptance:

- Package-local scripts either pass or clearly delegate to the correct root/project-reference lane.
- Full server suite is deterministic, or perf assertions are separated into an explicit perf lane with a stable threshold.
- SDK/server/worker/WaggleDance/substrate package verification is discoverable and quiet enough for release review.
- Developer API/background/substrate evidence is attached or explicitly deferred from the five-persona score.

Judge impact:

- Engineer.
- Team admin.
- Release confidence for all personas.

### R2-10: Ops, deployment, CI, benchmark, and judging evidence

Source finding: P1-14 / T18.

Dedicated supplement: `docs/audits/2026-07-08-ops-deploy-ci-judging-t18-analysis.md`.

Surfaces:

- `.github/workflows`.
- `Dockerfile`.
- `docker-compose.yml` and `docker-compose.production.yml`.
- `render.yaml`.
- `litellm-config.yaml` and `ops/litellm`.
- `vitest.infra.config.ts` and `vitest.infra-suites.ts`.
- `benchmarks/harness`.
- `judging`.

Current evidence update:

- YAML parse passes for Compose, Render, LiteLLM, and all workflow files.
- Docker CLI is available and Compose config expansion succeeds for development and production files, but the Docker Desktop engine is unavailable in this environment, so live infra tests were not run.
- Raw Compose config can print local ignored env secrets; use non-interpolated or sanitized output for shareable evidence.
- Only `.env.example` files are tracked among the checked env/key files; local secret-bearing files are ignored.
- Render currently provisions Postgres/Redis but starts the local sidecar path.
- CI E2E is advisory, and no CI lane runs the 19 infra-dependent suites.
- Benchmark harness TypeScript passes; root-run benchmark tests pass 29 files / 325 tests; package-local benchmark tests fail by command shape.
- Current `judging/` artifacts are historical, not the final July five-persona score evidence.
- The focused T18 supplement also records the `apps/www` GitHub Pages artifact mismatch, production Compose default credentials, and LiteLLM live-routing gap.

Acceptance:

- Secret-safe ops validation commands are documented and used.
- Docker/Render target and entrypoint choices are coherent with the product mode being claimed.
- CI blocking/advisory semantics are explicit; infra lane is run, added, or deferred with Docker-engine availability noted.
- Benchmark harness commands are fixed or documented.
- Current five-persona judging artifacts are regenerated after approved fixes land.

Judge impact:

- Engineer.
- Team admin.
- Release confidence for all personas.

### R2-11: Browser Companion extension evidence

Source finding: P1-15 / T19.

Surfaces:

- `apps/browser-ext/manifest.json`.
- `apps/browser-ext/popup.html`.
- `apps/browser-ext/popup.js`.
- `apps/browser-ext/background.js`.
- `apps/browser-ext/content.js`.
- `packages/server/src/local/routes/browser-ext.ts`.
- `packages/server/src/local/cors-config.ts`.

Current evidence update:

- Source inventory confirms `apps/browser-ext` is a Chrome MV3 extension surface, not an npm workspace.
- Server exposes `/api/browser-ext/health` and CORS env gates for extension origins.
- Direct sidecar save evidence proves selection-shaped and page-shaped Browser Companion frames can be created, duplicate detection works, and Memory UI renders the saved imported frame.
- A real unpacked Chromium extension run originally proved background save failed by default with generic `HTTP 500` when the extension origin was not allowlisted. The current secure-default live smoke now proves content-script extraction from a normal page, MV3 no-Origin header handling, token bootstrap during save, background save through `chrome.runtime.sendMessage`, and `/api/memory/frames` imported-frame confirmation under `WAGGLE_BROWSER_EXT_IDS=<extension id>`.
- The direct popup keyboard/click live smoke now proves popup Tab order, visible Save selection focus, Enter-to-save selection, Save page click, saved feedback, Memory frame creation through the secure sidecar path, and `/api/memory/search` `source: import` when supplied the active target tab that the native toolbar popup would receive from Chrome. Context-menu registration/handler behavior is regression-covered.
- Native toolbar-bubble exposure, native context-menu clicks, packaged pairing, and any separately scored global-recall provenance shape are still unproven.
- Historical `/api/memory/frames` versus `/api/memory/search` source/provenance disagreement is fixed for imported Browser Companion captures.

Acceptance:

- Connected/disconnected popup states are screenshot or test evidenced.
- Save selection and save page create Memory frames from popup keyboard/click interactions or have an approved deferral; native toolbar-bubble proof can be manual if automation cannot expose it.
- Native context-menu save creates a Memory frame or has an approved deferral.
- CORS/auth-denied/unpaired-extension state gives a clear setup path instead of a generic `HTTP 500` or raw `MISSING_TOKEN`; focused coverage exists, with live screenshot evidence still optional for the judge packet.
- Memory provenance remains consistent between frame list, search result, UI, and any separate global-recall result shape included in scoring.
- Popup keyboard/focus basics have live evidence; status announcement behavior is separately checked or deferred if scored.
- Browser Companion is either evidenced or explicitly deferred from the five-persona score.

Judge impact:

- Researcher.
- Solo founder.
- Mobile executive where browser capture is part of the scenario.

### R2-12: State and failure bundle evidence

Source finding: P1-8 / T12.

Surfaces:

- `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`.
- Five-persona scorecards.
- Routes and overlays exercised under account, tier, disclosure, model, data, offline, and viewport variants.

Acceptance:

- Each judge scorecard declares the exact state bundle it exercised.
- Account mode, billing tier, disclosure tier, model state, data state, offline/error state, and viewport are present in the evidence.
- Skipped state bundles have explicit deferral rationale before scoring.

Judge impact:

- All personas.

### R2-13: Public launch funnel repair and evidence

Source finding: P0-L1 / T13.

Focused supplement: `docs/audits/2026-07-08-launch-funnel-t13-analysis.md`.

Surfaces:

- `apps/www` homepage.
- Canonical `waggle-os.ai` DNS/deployment.
- Download CTA.
- GitHub Releases or replacement download/status page.
- Sign-in, sign-up, account.
- Team checkout and checkout cancel recovery.
- Legal/privacy/cookies/EU AI Act pages.
- `deploy-www.yml` or replacement deployment target.

Acceptance:

- Download CTA leads to valid Windows/macOS artifacts or a controlled availability/status page; mobile and unsupported OS labels are honest.
- `https://waggle-os.ai/` and `https://www.waggle-os.ai/` resolve and serve the selected public deployment or redirect coherently.
- Local production route/API smoke uses the correct host binding and serves the public launch, legal, auth, account, methodology, and checkout routes without 500s, timeouts, unexpected 404s, or Clerk redirect-loop spam.
- Launch funnel is verified with desktop/mobile route evidence, or explicitly deferred from the five-persona score.
- Signed-out Team checkout guides the user into auth/checkout recovery instead of a JSON-shaped error.
- Checkout cancel returns to a real pricing recovery state.
- Public legal/trust pages contain no placeholder launch text and no active Pro copy.
- Deployment target matches the app shape.

Current evidence:

- www tests, direct TypeScript, and Next build pass.
- Current external refresh cannot resolve `waggle-os.ai` or `www.waggle-os.ai` from the audit environment; DNS reports non-existent domain/no A or CNAME.
- Fresh localhost route/API smoke serves core routes, but `/pricing?checkout=cancelled` still 404s.
- Fresh rendered Browser smoke under `output/playwright/www-t13-3491/` captures desktop/mobile homepage, mobile menu, signed-out pricing error, route/API probes, and clean sampled console logs; it still reproduces broken Download and signed-out checkout recovery.
- Public download currently points to GitHub Releases, where the repo has no releases.
- Current workflow uploads `apps/www/dist` while the app builds `.next`.

Judge impact:

- Solo founder.
- Team admin.
- Mobile executive.

### R2-14: Desktop wrapper and release UX evidence

Source finding: P1-10 / T14.

Surfaces:

- Packaged Tauri launch.
- Sidecar readiness and failure recovery.
- Tray menu actions.
- Close-to-tray and global shortcut.
- Installer/signing expectations.
- Update notification or deliberate hidden/disabled update state.

Current evidence update:

- Static Tauri config/update/tray tests, app TypeScript, web typecheck, Rust `cargo check`, sidecar resource preflight, app service E2E, release workflow ordering, and web-side Tauri binding tests now pass; Rust source directly handles tray Open/focus, close-to-tray, `Ctrl+Shift+W`, and Quit.
- Settings routes through a tested `/settings` desktop bridge; Pause Agents and About Waggle are hidden; remaining unconsumed native events are update/service status and still need visible UX or deferral.
- This remains Phase 2/launch work unless a Phase 1 verification command directly needs a small supporting fix.

Acceptance:

- Installed app launch and service recovery are verified, or explicitly deferred from the five-persona score.
- Tray/update/service events are either consumed by UI, handled natively, or hidden until supported; Quit actually exits or is not shown as a supported command.
- Release channel expectations are clear for signed/trusted install.

Judge impact:

- All personas.

## Phase 3: Performance, Cost Semantics, and Polish

Goal: improve speed, clarity, and polish after core trust/flow issues are under control.

### R3-1: Initial payload and route loading

Source finding: P1-4 / T8.

Surfaces:

- App shell.
- Deep Settings/Marketplace/admin surfaces.
- Keep `shape-selection.ts` import hygiene guarded while reducing the remaining initial payload.
- Large persona/logo assets.

Acceptance:

- Startup JS stays below the Vite 500 kB warning threshold.
- Deep apps, closed overlays, chat, and analytics load after core shell where feasible.
- Defeated dynamic import and oversized-JS warnings remain resolved or explicitly justified.
- Large persona/logo assets are optimized or deferred.

Judge impact:

- Mobile executive.
- Engineer.
- Solo founder first impression.

### R3-2: Local model pricing semantics

Source finding: P1-6 / T9.

Surfaces:

- `packages/agent/src/cost-tracker.ts`.
- Usage & Cost UI.
- No-LLM/degraded-mode tests.

Acceptance:

- Local/unpriced models are labeled honestly.
- No standard audit warning estimates local model cost as paid-provider cost without explanation.
- Tests that claim no-LLM behavior actually force provider unavailability or are renamed.

Judge impact:

- Engineer.
- Team admin.

### R3-3: Stale comments and legacy terminology

Source finding: P2-1.

Surfaces:

- Touched billing/tier files.
- Touched route/shortcut files.
- Touched Marketplace/MCP/skills copy files.

Acceptance:

- Comments in touched files reflect current Solo/Teams/Enterprise and route behavior.
- No unrelated cleanup outside touched files.

Judge impact:

- Indirect.

### R3-4: Browser plugin DOM snapshot tooling

Source finding: P2-2.

Surfaces:

- Audit tooling, not product.

Acceptance:

- Keep Playwright CLI as the reliable audit path until Browser `domSnapshot()` mismatch is fixed.
- If Browser tooling is fixed, update the audit process and evidence packet.

Judge impact:

- Audit ergonomics only.

## Re-Scoring Sequence

1. Finish Phase 1 and update the correction register.
2. Attach route, state/failure, launch-funnel, Browser Companion, desktop-wrapper, utility/admin, hook lifecycle, developer/substrate, and ops/deployment/judging evidence owners to the five scorecards.
3. Run a dry five-persona scorecard pass.
4. If any persona is capped by a Phase 2 item, execute only the relevant Phase 2 lane.
5. Repeat scorecard pass.
6. Execute Phase 3 only after trust, routing, accessibility, route evidence, state-bundle evidence, and any non-deferred launch/extension/desktop/utility/hook/developer/ops gates stop capping scores.

## Approval Boundary

This roadmap is not a request to implement Phase 2/3 now. It exists so the remaining correction work is sequenced after Phase 1 and no P1/P2 item is lost.
