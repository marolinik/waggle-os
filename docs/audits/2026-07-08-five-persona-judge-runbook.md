# Five-Persona Judge Runbook - 2026-07-08

Status: analysis artifact. This is not an implementation plan and does not approve product-code changes.

Purpose: make the final "five judges score 9/10" gate executable. The existing `tests/vision/personas.spec.ts` is useful evidence for live chat, persistence, screenshots, and cross-persona isolation, but it does not cover the full product UX. This runbook defines the current-source evidence packet required after Phase 1 and any judge-blocking Phase 2/3 items land.

Companion artifacts:

- `docs/audits/2026-07-08-five-persona-judge-scorecards.md`
- `docs/audits/2026-07-08-ux-route-scenario-manifest.md`
- `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`
- `docs/audits/2026-07-08-ux-correction-register.md`
- `docs/audits/2026-07-08-web-guidelines-line-findings.md`
- `docs/audits/2026-07-08-source-inventory-consistency-audit.md`
- `docs/audits/2026-07-08-state-failure-t12-analysis.md`
- `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md`
- `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`
- `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`

## Hard Preconditions

Do not treat a judge run as final unless all are true:

1. T1, T2, T3, T4, T5, and T11 are closed or explicitly reclassified with evidence.
2. T7 trust-critical dialog work is closed for every persona route, or the affected persona is capped below pass.
3. T10 accessibility/form/focus findings that touch judge routes are closed or explicitly deferred with score impact, including shell overlay semantics and close behavior.
4. T12 state bundles are declared for every persona and cross-checked against the focused T12 supplement.
5. Mobile evidence includes visible element-bounds checks for critical controls, first-run onboarding Profile, and selected overlay close proof; document-level overflow alone is insufficient.
6. T13/T14/T15/T16/T17/T18/T19 are either evidenced or explicitly deferred by the user from the five-persona score.
7. The final app run is built from current source on a fresh port and clean data dir unless a return-state scenario intentionally reuses data.
8. Console status is captured from navigation start, not after the page settles.

## Existing Harness Boundary

`tests/vision/personas.spec.ts`:

- Creates five isolated workspaces.
- Sends two chat turns per persona.
- Saves screenshots and JSON under `tests/vision/artifacts/personas`.
- Checks substantive assistant history and no cross-persona prompt leakage.

It does not prove:

- Auth/accountless boot quality.
- Home Start Here first-action quality.
- Settings/billing/profile UX.
- Mobile 390 px behavior.
- Command Center, shortcuts, Launcher, MCP, Files, Events.
- Vault, Approvals, backup/restore, Team governance.
- Public launch, desktop wrapper, admin/CLI/MCP utility, hook lifecycle, Browser Companion extension, developer/substrate, or ops gates.

Conclusion: use `tests/vision/personas.spec.ts` as one evidence source, not as the final judge.

## Standard Evidence Commands

Use a fresh port to avoid stale-server evidence:

```powershell
$env:WAGGLE_E2E_PORT='3397'
$env:WAGGLE_E2E_BASE_URL='http://127.0.0.1:3397'
$env:WAGGLE_E2E_SKIP_LITELLM='1'
$env:WAGGLE_E2E_DATA_DIR="$env:TEMP\\waggle-ux-judge-3397"
$env:WAGGLE_DISABLE_MARKETPLACE_SYNC='1'
$env:EMBEDDING_PROVIDER='mock'
$env:VITE_CLERK_PUBLISHABLE_KEY=''
$env:CLERK_SECRET_KEY=''
```

Core verification before screenshots:

```powershell
npm run typecheck:web
npm run ux:contrast
npm run ux:color-guard
npm run build
node node_modules/playwright/cli.js test tests/e2e/full-product-audit.spec.ts tests/e2e/full-wiring-audit.spec.ts tests/e2e/phase-ab-verification.spec.ts tests/e2e/power-user-stress.spec.ts tests/e2e/user-journeys.spec.ts tests/visual/views.spec.ts --project=chromium --reporter=list
```

Optional live-LLM persona evidence:

```powershell
$env:WAGGLE_E2E_SKIP_LITELLM='0'
node node_modules/playwright/cli.js test tests/vision/personas.spec.ts --project=chromium --reporter=list
```

Important: query parameter `?tier=power` controls the UI disclosure tier (`simple`, `professional`, `power`, `admin`) through onboarding state. It is not the billing tier (`FREE`/Solo, `TRIAL`, `TEAMS`, `ENTERPRISE`). Judge evidence must name both separately.

## Evidence Directory

Use a timestamped evidence root:

```text
docs/audits/evidence/2026-07-08-five-persona-judge/<run-id>/
```

Required files:

```text
00-command-log.md
00-console-summary.json
00-route-coverage.md
00-deferrals.md
persona-1-solo-founder/
persona-2-researcher/
persona-3-engineer/
persona-4-team-admin/
persona-5-mobile-executive/
score-summary.md
```

Each persona folder must contain:

```text
state-bundle.md
steps.md
screenshots/
console.json
network.json
route-evidence.md
scorecard.md
blockers.md
```

## Score Caps

Apply caps before subjective scoring:

| Condition | Cap |
|---|---:|
| Critical console error in persona route | 7/10 |
| Primary route blocked or blank | 6/10 |
| Severe mobile clipping/overflow in mobile persona path | 7/10 |
| First-run onboarding primary action hidden in required mobile path | 7/10 |
| Required overlay opens but cannot close in persona path | 7/10 |
| Required overlay has no accessible name/landmark or unnamed primary icon-only actions | 8/10 |
| Native browser dialog in a trust-critical persona step | 8/10 |
| Critical axe finding in a persona primary route | 8/10 |
| Serious keyboard access finding in a persona primary route | 8/10 |
| Active Pro copy in pricing/billing/gating path | 8/10 |
| Missing route evidence owner for a primary route | 8/10 |
| Missing required state bundle evidence | 8/10 |
| Missing non-main gate decision for relevant T13-T19 path | 8/10 |

The final goal requires every persona to score at least 9/10, so any active cap below 9 is a blocker.

## Persona 1: Solo Founder

State bundle:

- Account mode: accountless local.
- Billing tier: Solo / `FREE`.
- UI disclosure tier: `simple` first, then `power` only for route evidence if needed.
- Model state: no model recovery and one working-model or skipped-LLM explanation.
- Data state: fresh install, no workspace first, then one created workspace.
- Offline/error state: accountless Clerk/CSP lane.
- Viewports: desktop 1440 x 900 and mobile Home spot-check.

Route sequence:

1. `/auth`
2. first-run onboarding or approved skip path
3. `/home`
4. `/workspaces`
5. `/workspaces/:workspaceId/chat`
6. return to `/home`

Required screenshots:

- `auth-accountless.png`
- `onboarding-welcome.png`
- `onboarding-profile.png`
- `onboarding-model-gate.png`
- `onboarding-first-task.png`
- `home-start-here.png`
- `workspace-create-or-list.png`
- `first-chat.png`
- `home-return-next-action.png`
- `mobile-home.png`

Must prove:

- Home gives a clear next move within 10 seconds.
- No Clerk/CSP console noise in accountless mode.
- Clean-data first-run onboarding reaches the wizard without Clerk/CSP console errors.
- Mobile first-run Profile keeps the primary Continue action visible or clearly reachable if mobile first-run is scored.
- No active Pro copy in the path.
- Memory behavior is honest: no unsupported promise that context will be remembered without evidence.

Current blockers from the packet:

- T1, T3, T11.
- T2 if mobile Home/Settings or mobile first-run onboarding are used in the score.

## Persona 2: Researcher

State bundle:

- Account mode: accountless or authenticated, but declared.
- Billing tier: Solo unless Teams feature is intentionally tested.
- UI disclosure tier: `power`.
- Model state: working or skipped-LLM with memory UI focus.
- Data state: populated memory plus empty/no-result state.
- Offline/error state: missing source or failed export path.
- Viewports: desktop 1440 x 900; mobile Memory spot-check if scored.

Route sequence:

1. `/memory`
2. memory search/no-results
3. memory provenance/trust detail
4. wiki/timeline/evolution view
5. archive/delete/export confirmation flow
6. `/workspaces/:workspaceId/chat`

Required screenshots:

- `memory-overview.png`
- `memory-search-result.png`
- `memory-empty-or-no-results.png`
- `trust-provenance.png`
- `wiki-or-timeline.png`
- `memory-confirmation-modal.png`
- `memory-chat-explanation.png`

Must prove:

- Researcher can tell what is stored, where it came from, and how to correct/remove it.
- Delete/export flows do not use native `confirm`/`prompt`.
- Long memory text/titles do not break layout.
- The product does not overclaim memory persistence.

Current blockers:

- T5, T7, T10, T11, T12.
- T19 if browser capture is included in the Researcher journey.

## Persona 3: Engineer / Power User

State bundle:

- Account mode: accountless local.
- Billing tier: Solo, plus explicit deferral/evidence for Teams-only surfaces.
- UI disclosure tier: `power` or `admin`.
- Model state: local/no-LLM and one working-provider lane if using chat.
- Data state: at least one workspace, detected or undetected tools, MCP catalog present.
- Offline/error state: marketplace local-only and tool/hook unavailable states.
- Viewports: desktop 1440 x 900; keyboard-only path.

Route sequence:

1. `/home`
2. Command Center via `Ctrl+K`
3. `Ctrl+Shift+N` to active workspace chat
4. `/launcher`
5. `/mcps`
6. `/files`
7. `/settings/events`
8. representative CLI/MCP utility evidence if T15 not deferred

Required screenshots:

- `command-center.png`
- `shortcut-chat-result.png`
- `launcher-tool-state.png`
- `launcher-hook-state.png`
- `mcp-hub.png`
- `files.png`
- `events-logs.png`
- `keyboard-focus-path.png`

Must prove:

- `Ctrl+Shift+N` opens the intended chat route.
- Workspace Switcher does not block unrelated navigation.
- Standard audit avoids live external marketplace dependency.
- Tool and MCP states are explained without broken JSON or secret leakage.

Current blockers:

- T4, T6, T10, T11, T15, T16, T17, T18 unless deferred.

## Persona 4: Team Admin / Security Reviewer

State bundle:

- Account mode: authenticated or accountless with billing/admin limitations declared.
- Billing tier: Teams for team/admin surfaces, Solo for gating comparison, legacy Pro collapsed to Solo where relevant.
- UI disclosure tier: `professional` and `admin`.
- Model state: not central unless settings model copy is inspected.
- Data state: vault item, approval grant, backup metadata, team governance state.
- Offline/error state: backup failure or restore failure copy.
- Viewports: desktop 1440 x 900; mobile Settings/Profile spot-check.

Route sequence:

1. `/settings`
2. `/settings/vault`
3. `/approvals`
4. backup/restore section
5. `/team`
6. `/payment-success`
7. `/payment-cancelled`
8. admin web evidence if T15 not deferred

Required screenshots:

- `settings-billing.png`
- `vault-secret-hidden.png`
- `approvals-list.png`
- `approval-revoke-confirmation.png`
- `backup-create.png`
- `restore-confirmation-result.png`
- `team-governance.png`
- `payment-success.png`
- `payment-cancelled.png`

Must prove:

- Active billing copy is Solo/Teams/Enterprise.
- Secret values are not exposed unintentionally.
- Restore/revoke/delete use in-app confirmation and visible result states.
- Checkout success/cancel recovery has a clear next action.

Current blockers:

- T3, T7, T10, T11, T13, T14, T15 unless deferred.

## Persona 5: Mobile Executive

State bundle:

- Account mode: accountless local.
- Billing tier: Solo unless Team account view is intentionally sampled.
- UI disclosure tier: `simple`, with `power` as route-discovery comparison only.
- Model state: no-model or verified-model banner must fit.
- Data state: at least one workspace and some memory.
- Offline/error state: overlay close and readable empty/error state.
- Viewport: 390 x 844 primary; optional tablet 1024 x 768.

Route sequence:

1. mobile `/home`
2. mobile `/settings`
3. mobile `/settings/profile`
4. mobile `/memory`
5. mobile workspace chat
6. Command Center, Workspace Switcher, Notification Inbox, or Create Workspace open/close, depending on the selected mobile path
7. theme/profile/billing controls

Required screenshots:

- `mobile-home.png`
- `mobile-onboarding-welcome.png`
- `mobile-onboarding-profile.png`
- `mobile-settings-general.png`
- `mobile-settings-billing.png`
- `mobile-settings-models.png`
- `mobile-profile.png`
- `mobile-memory.png`
- `mobile-chat.png`
- `mobile-overlay-open.png`
- `mobile-overlay-closed.png`

Must prove:

- No horizontal overflow.
- No clipped primary controls.
- First-run Profile primary Continue is visible, sticky, or clearly reachable.
- Critical visible controls stay in-bounds even when document-level scroll width is clean.
- Touch targets and focus states are visible.
- Overlay does not trap scroll/focus after close.
- Required overlays expose an accessible name or landmark and named primary icon-only actions.

Current blockers:

- T2, T3, T10, T11, T12, including first-run onboarding evidence.

## Deferral Rules

Deferrals are allowed during analysis, but a final 9/10 claim needs the user to explicitly approve them.

Each deferral must include:

```text
Ticket:
Surface:
Persona affected:
Reason deferred:
Why it does not affect this score:
Evidence still collected:
Expiry / revisit trigger:
```

No implicit deferrals. If a persona journey touches T13-T19 and the gate is not fixed/evidenced, the score remains capped until the user scopes it out.

## Scorecard Template

```text
Persona:
Run id:
Date:
Current commit:
Evidence folder:

State bundle:
- Account mode:
- Billing tier:
- UI disclosure tier:
- Model state:
- Data state:
- Offline/error state:
- Viewport:
- Non-main gate decisions:

Routes covered:

Console status:

Screenshots inspected:

Score:
- Functional completion /2:
- Flow, IA, discoverability /2:
- Trust, error handling, recovery /2:
- Visual, accessibility, responsive quality /2:
- Performance and polish /1:
- Memory, personalization, domain fit /1:
- Total /10:

Caps applied:

Verdict:

Top corrections:
```

## Final Pass Criteria

The goal is still incomplete until:

- Five scorecards are filled from current post-fix evidence.
- Every persona total is at least 9/10.
- No score cap below 9 remains active.
- Route manifest rows for judged routes are Strong or explicitly deferred.
- State bundles are attached for all five personas.
- T13/T14/T15/T16/T17/T18/T19 are evidenced or explicitly deferred.
- The correction register has no open P0 and no unapproved judge-blocking P1.
