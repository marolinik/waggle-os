# Five-Persona UX Judge Scorecards

Companion artifacts:

- `docs/audits/2026-07-08-complete-ux-usage-audit.md`
- `docs/audits/2026-07-08-ux-route-scenario-manifest.md`
- `docs/audits/2026-07-08-ux-state-failure-scenario-matrix.md`
- `docs/audits/2026-07-08-ux-non-main-surface-scope.md`
- `docs/audits/2026-07-08-ux-correction-register.md`
- `docs/audits/2026-07-08-five-persona-judge-runbook.md`
- `docs/audits/2026-07-08-source-inventory-consistency-audit.md`
- `docs/audits/2026-07-08-state-failure-t12-analysis.md`
- `docs/audits/2026-07-08-mobile-executive-t2-t12-analysis.md`
- `docs/audits/2026-07-08-runtime-a11y-t10-analysis.md`
- `docs/audits/2026-07-08-first-run-onboarding-t1-t2-t12-analysis.md`
- `docs/superpowers/plans/2026-07-08-ux-phase-1-corrections.md`

Purpose: define the final judge gate before any claim that Waggle OS is 9/10 across five personas. These scorecards extend the existing `tests/vision/personas.spec.ts` harness. That harness proves live persona chat, persistence, screenshots, and no cross-persona prompt leakage; it does not yet score the full route/UX rubric.

Execution protocol: use `docs/audits/2026-07-08-five-persona-judge-runbook.md` after the blocking tickets are fixed or explicitly deferred. The runbook is the authoritative checklist for state bundles, screenshots, score caps, and deferral records.

Phase 1 status update: the approved Phase 1 implementation is complete and verified. The standard cockpit lane now has clean accountless Clerk/CSP behavior, passing mobile Settings and mobile first-run onboarding checks, active Solo/Teams/Enterprise copy cleanup, passing `Ctrl+Shift+N` and Workspace Switcher route behavior, updated visual baselines, and codified thin-route evidence. The full combined browser gate passed 156/156 on port `34150`. Phase 2 has started with partial overlay fixes: Notification Inbox and Create Workspace primary/subdialog contracts now have named dialog/close coverage, custom-template delete uses an in-app confirmation, the sampled 390 x 844 Create Workspace hierarchy prioritizes required setup before optional templates, Context Rail has a labelled complementary contract, Onboarding Tooltips has an explicit non-modal Escape-dismiss contract, and tier-modal close labels are named. These remove some overlay caps, but the final 9/10 gate is still blocked by remaining trust-critical dialogs, screenshot/state refresh, broader runtime accessibility, and T13-T19 non-main evidence unless those are fixed or explicitly deferred.

## Non-Negotiable Gate

Do not run the final scoring pass until all are true:

1. No open P0 findings in the main audit.
2. Phase 1 verification lane passes or has explicitly approved visual baseline updates. Current status: passed 156/156 in the combined browser gate on 2026-07-08.
3. Route manifest has an evidence owner for every registered route and major overlay.
4. State/failure matrix has an evidence owner or approved deferral for each persona's required state bundle.
5. Standard browser lane has zero critical app/auth/CSP console errors.
6. Mobile Settings, first-run onboarding Profile, billing/profile, Home, Memory, Chat, and the selected overlay path have current 390 px screenshots plus visible element-bounds checks; focused Create Workspace bounds now pass, but document-level overflow alone is not enough.
7. No active user-facing Pro upgrade copy remains outside explicit legacy billing servicing.
8. Trust-critical destructive flows use in-app confirmation/result states.
9. Runtime T10 axe/DOM findings and shell-overlay semantics/close findings on judge routes are fixed or explicitly capped/deferred.
10. Public launch funnel, desktop wrapper, utility, hook, Browser Companion extension, developer/substrate, ops/deployment, CI, benchmark, and judging gates have evidence, or the user explicitly defers T13/T14/T15/T16/T17/T18/T19 from the five-persona score.

If any item fails, judges can still provide feedback, but their score is advisory and cannot satisfy the goal.

## Scoring Model

Each persona scores 10 points:

| Dimension | Points | Judge asks |
|---|---:|---|
| Functional completion | 2 | Did the route/flow complete without broken state, dead end, or hidden dependency? |
| Flow, IA, and discoverability | 2 | Did the next action feel obvious without reading docs? Was the route in the right place? |
| Trust, error handling, and recovery | 2 | Were permissions, data consequences, pricing, model state, and recovery clear? |
| Visual, accessibility, and responsive quality | 2 | Did it feel designed, readable, keyboardable, and usable on required viewport(s)? |
| Performance and polish | 1 | Did it load and respond with no distracting lag, flicker, warnings, or noisy states? |
| Memory, personalization, and domain fit | 1 | Did Waggle remember/use context in a way that made the experience meaningfully better? |

Pass rules:

- Every persona must score at least 9/10.
- No dimension may score below 8/10 when normalized to a 10-point scale.
- Any critical console error caps the affected persona at 7/10.
- Any blocked primary route caps the affected persona at 6/10.
- Any severe mobile clipping/overflow in a required mobile journey caps the affected persona at 7/10.
- Any selected overlay that opens but cannot close in the required persona path caps the affected persona at 7/10.
- Any selected overlay with no accessible name/landmark or unnamed primary icon-only actions caps the affected persona at 8/10 unless explicitly deferred.
- Native browser dialog in a trust-critical step caps that persona at 8/10.
- Critical axe finding in a persona primary route caps that persona at 8/10; serious keyboard access findings cap at 8/10 unless explicitly deferred from that persona's route.

Evidence required for every scorecard:

- Route list covered.
- State bundle covered: account mode, billing tier, disclosure tier, model state, data state, offline/error state, and viewport.
- T12 focused supplement checked for current state-slice evidence, native-dialog caps, and persona bundle corrections.
- First-run onboarding supplement checked for clean-data console health, mobile Profile bounds, import consequence clarity, and first-task handoff behavior.
- Non-main gate decision: T13/T14/T15/T16/T17/T18/T19 evidence attached or explicitly deferred.
- Evidence folder from the judge runbook.
- Screenshots inspected.
- Console status.
- Failing or flaky tests relevant to the persona.
- Score per dimension.
- Free-text verdict: pass, advisory pass, fail.
- Top 3 remaining corrections, if any.

## Persona 1: Solo Founder

Profile:

- Maya, solo founder, pre-revenue, 4 months runway.
- Wants one clear next move and hates re-explaining context.
- Low patience for setup friction.

State bundle to capture:

- Account mode: accountless local.
- Billing tier: Solo / `FREE`.
- UI disclosure tier: `simple` first; `power` only for route evidence if needed.
- Model state: no-model recovery plus working-model or skipped-LLM explanation.
- Data state: fresh install, no workspace first, then one created workspace.
- Offline/error state: accountless Clerk/CSP lane.
- Viewport: desktop 1440 x 900 plus mobile Home/Profile spot-check.
- Non-main gate decisions: T13/T14 deferred or evidenced if launch/desktop flows enter this score.

Primary journey:

1. Start from `/auth` in accountless local-first mode.
2. Complete or bypass first-run onboarding.
3. Land on `/home`.
4. Use Home Start Here to open or create a workspace.
5. Send first chat asking for this week's one focus.
6. Add runway constraint and verify Waggle can reuse that context.
7. Return to Home and see a logical next action.

Required routes and overlays:

- `/auth`
- Onboarding Wizard
- `/home`
- `/workspaces`
- `/workspaces/:workspaceId/chat`
- Settings model gate or model setup affordance
- Workspace Switcher if no workspace exists

Evidence to collect:

- Desktop screenshots: auth/accountless, clean-data onboarding steps, Home, workspace chat, returned Home.
- Mobile screenshots: first-run Welcome and Profile at 390 x 844, with primary action bounds checked.
- Console summary: no Clerk/CSP errors in accountless mode.
- Transcript artifact showing context persistence or clear explanation of memory behavior.
- Route manifest rows for Auth, Home, Workspaces, Workspace.

Automatic fail triggers:

- Accountless local mode shows Clerk load errors.
- First-run onboarding emits Clerk/CSP console errors.
- Mobile onboarding hides the primary action in the first-run Profile step when mobile is in scope.
- First useful action is unclear from Home.
- Chat cannot accept first message or silently depends on unavailable LLM.
- Pro copy appears in the journey.

Corrections that must land before this judge can pass:

- T1 local auth/CSP/accountless health is closed for the standard accountless lane.
- T2 first-run mobile onboarding primary-action reachability is closed for the codified 390 px check.
- T3 Solo/Teams/Enterprise copy cleanup is closed for active Phase 1 surfaces.
- T4 shortcut/workspace context is closed for the codified `Ctrl+Shift+N` lane.
- T11 route evidence owner is closed for the Phase 1 thin-route shell smoke; deeper state evidence remains.

Expected 9/10 behavior:

- Maya understands what to do within 10 seconds of landing on Home.
- The app helps her move from broad anxiety to one concrete workspace/chat action.
- Memory behavior is honest and useful, not vague marketing copy.

## Persona 2: Researcher

Profile:

- Chen, meticulous researcher validating persistent memory and provenance.
- Wants evidence, not vibes.
- Tolerates density if the information architecture is trustworthy.

State bundle to capture:

- Account mode: accountless or authenticated, but declared.
- Billing tier: Solo unless Teams memory/governance is intentionally tested.
- UI disclosure tier: `power`.
- Model state: working or skipped-LLM with memory UI focus.
- Data state: populated memory plus empty/no-result state, including sampled slow Memory, large Memory, and Timeline/Event states.
- Offline/error state: missing source, failed export, or trust/destructive recovery path.
- Viewport: desktop 1440 x 900; mobile Memory spot-check if scored.
- Non-main gate decisions: T19 evidenced or explicitly deferred if browser capture enters this score.

Primary journey:

1. Open `/memory`.
2. Search memory or inspect available memory records.
3. Open memory trust/provenance detail.
4. Visit wiki/timeline/evolution-related views.
5. Attempt export or delete/archive trust flow.
6. Return to chat and ask whether memory is durable versus long context.

Required routes and overlays:

- `/memory/:mindScope?`
- Memory trust/manage overlays
- Wiki tab
- Timeline/evolution tabs or `/settings/timeline`
- Workspace chat
- Native prompt replacements for wiki/export/delete

Evidence to collect:

- Screenshots: Memory overview, search result, trust/provenance detail, wiki/timeline state, confirmation modal.
- Console summary.
- Transcript or UI text explaining memory mechanism honestly.
- Route manifest rows for Memory and Timeline.
- Current partial evidence: Artifact permanent delete, Memory Center delete/GDPR erase/allow re-import, and Wiki Obsidian/Notion exports now have component coverage and rendered `J3e`/`J3f`/`J3g` evidence for in-app confirmations/forms. The five-persona bundle also covers `memory-slow-list` with a delayed Memory API and loading status, `memory-large-list` with 200 mocked memories, `timeline-large-events` with 360 mocked events, and `wiki-export-obsidian-failure` with branded `Export Failed` copy after a mocked `500`.

Automatic fail triggers:

- Broader Notion/export variants remain open; Artifact permanent delete, Memory Center delete/erase/re-import, Wiki export destinations, and one rendered Wiki export-failure path are fixed for the sampled paths.
- Search/provenance route shows blank or unexplained empty state.
- Long memory titles break layout.
- App implies memory is magic without explaining limits.

Corrections that must land before this judge can pass:

- T5 approved baseline update for Memory after the fresh classification note.
- T7 trust-critical dialogs.
- T10 form/accessibility hygiene where memory forms are touched.
- T11 route evidence owner.

Expected 9/10 behavior:

- Chen can understand what is stored, why it is trusted, where it came from, and how to correct/remove it.
- Empty states and provenance states are credible, not decorative.

## Persona 3: Engineer / Power User

Profile:

- Sam, senior engineer and agent wrangler.
- Wants keyboard speed, tool clarity, logs, and proof the product is not a chatbot wrapper.
- Low tolerance for flaky tests or hidden network dependency.

State bundle to capture:

- Account mode: accountless local.
- Billing tier: Solo, with Teams-only surfaces evidenced or deferred.
- UI disclosure tier: `power` or `admin`.
- Model state: local/no-LLM plus working-provider lane if chat is scored.
- Data state: one workspace, detected or undetected tools, MCP catalog present.
- Offline/error state: marketplace local-only, delayed/large Agents roster, and tool/hook unavailable states.
- Viewport: desktop 1440 x 900 plus keyboard-only path.
- Non-main gate decisions: T15/T16/T17/T18 evidenced or explicitly deferred for utility, hook, developer, and ops surfaces.

Primary journey:

1. Start on `/home`.
2. Open Command Center with `Ctrl+K` and navigate to an app.
3. Use `Ctrl+Shift+N` to open active workspace chat.
4. Open `/launcher` and verify tool/hook state.
5. Open `/mcps`, inspect installed/custom MCP server flows.
6. Open `/files` and inspect file actions.
7. Open `/settings/events` for logs.

Required routes and overlays:

- Command Center
- `/workspaces/:workspaceId/chat`
- `/launcher`
- `/mcps`
- `/files`
- `/settings/events`
- Workspace Switcher

Evidence to collect:

- Screenshots: Command Center search, chat after shortcut, Launcher, MCP Hub, Files, Events.
- Keyboard interaction log for `Ctrl+K`, `Ctrl+Shift+N`, Escape close.
- Console summary.
- Route manifest rows for Launcher, MCP Hub, Files, Events.
- Codified route smoke evidence: `J-route-coverage: priority thin routes render meaningful shells` passed for `/launcher`, `/launcher?watch=1`, `/mcps`, and `/files` on 2026-07-08.

Automatic fail triggers:

- `Ctrl+Shift+N` does not open the expected chat route.
- Workspace Switcher blocks unrelated navigation.
- Marketplace/MCP/Launcher depends on live external sync in the standard audit lane.
- Tool output renders broken JSON or unexplained fallback.

Corrections that must land before this judge can pass:

- T4 shortcut and Workspace Switcher route contract is closed for the standard browser lane.
- T6 marketplace determinism.
- T8 performance and payload polish if startup feels heavy.
- T11 route coverage for Launcher/MCP/files has shell-level smoke coverage; keep deeper hook/MCP/file interaction states in Sam's evidence bundle.
- T16 hook lifecycle if Launcher/tool management is included in Sam's final score.

Current partial evidence: the five-persona bundle covers `agents-slow-list` with a delayed `/api/agents` response, aria-busy `Loading agents` status, and final `40 agents` plus `Bulk Agent 000` roster proof; it also covers `agents-large-list` with 180 mocked agents and 0 visible overflow. These are accountless/no-LLM sampled state proofs, not substitutes for packaged hook lifecycle or authenticated Team evidence.

Expected 9/10 behavior:

- Sam can operate primarily by keyboard, sees real tool/hook state, and trusts logs/error states.
- The product feels like an agent OS, not a pile of screens.

## Persona 4: Team Admin / Security Reviewer

Profile:

- Priya, nontechnical but accountable team/product admin.
- Needs plain language, billing confidence, governance, vault, backup, approvals.
- Cares about not breaking data or exposing secrets.

State bundle to capture:

- Account mode: authenticated, or accountless with mocked Teams-tier billing/admin state and limitations declared.
- Billing tier: Teams for team/admin surfaces, Solo for gating comparison, legacy Pro collapsed to Solo where relevant; real Team server membership must be evidenced or deferred separately.
- UI disclosure tier: `professional` and `admin`.
- Model state: not central unless Settings model copy is inspected.
- Data state: vault item, approval grant, backup metadata, team governance state, and unlocked Team settings state.
- Offline/error state: backup failure, restore failure, and checkout recovery copy.
- Viewport: desktop 1440 x 900 plus mobile Settings/Profile spot-check.
- Non-main gate decisions: T13/T14/T15 evidenced or explicitly deferred for launch, desktop, and admin/utility paths.

Primary journey:

1. Open `/settings` billing/general/model sections.
2. Visit `/settings/vault`.
3. Add or inspect a secret without revealing value.
4. Visit `/approvals` and review/revoke grants.
5. Use backup create/restore flow.
6. Visit `/team` governance.
7. Exercise payment success and payment cancelled recovery.

Required routes and overlays:

- `/settings`
- `/settings/vault`
- `/approvals`
- Backup section in Settings or Backup app surface
- `/team`
- `/payment-success`
- `/payment-cancelled`
- Erase Data dialog if destructive data flow is inspected

Evidence to collect:

- Screenshots: billing copy, active Team billing state, unlocked Team settings state, vault, approval list, backup flow, team governance, payment success/cancelled recovery.
- Console summary.
- Copy scan: no active Pro upgrade language except explicit legacy billing state.
- Confirmation/result-state screenshots for restore/revoke/delete.
- Current partial evidence: Approvals revoke-all now has component coverage, rendered `/approvals` `J3d` evidence for an in-app confirmation, and five-persona Team Admin bundle evidence via `approvals-revoke-all-grants`; Artifact permanent delete also has rendered `J3e` evidence; Settings telemetry clear/backup failure/restore success have `settings-trust.test.tsx` and rendered `J3h` evidence; standalone `BackupApp` restore, Automation delete, compliance template delete, and admin-web member removal have focused component evidence. The five-persona Team Admin bundle now covers `approvals-revoke-all-grants`, `billing-team-active-state` with mocked `TEAMS` tier and visible `Waggle Team` / `$49/mo per seat` / `Manage subscription` copy, `team-settings-unlocked-state` with visible Team Server URL/Auth Token/trust-warning copy, `billing-checkout-success-return` with a mocked Team checkout sync, `billing-checkout-cancel-return` with visible `Checkout was cancelled` / `No charge was made` recovery copy, `billing-checkout-unavailable`, `backup-create-failure`, and `backup-restore-failure`, with 0 critical console/page/network failures and 0 visible overflow. Current high-confidence production native-dialog scan is clean.
- Codified route smoke evidence: `J-route-coverage` passed for `/payment-success` and `/payment-cancelled`, including redirect to `/settings?tab=billing`, on 2026-07-08; the refreshed route smoke on 2026-07-09 still passes after adding the `checkout=cancelled` marker.

Automatic fail triggers:

- Billing copy says Pro as an active tier.
- Secret values are exposed unintentionally.
- Current known production native dialog scan is clean; remaining risk is uncodified less-common destructive paths, failure-state depth, and focus/keyboard proof rather than known browser-native alert/confirm calls.
- Payment cancelled lacks visible no-charge recovery copy.

Corrections that must land before this judge can pass:

- T3 pricing/gating copy.
- T7 trust-critical dialogs.
- T10 form/accessibility hygiene.
- T11 route coverage and the five-persona Team Admin bundle now cover payment cancelled, payment success return, mocked active Team billing, and unlocked Team settings states; real authenticated Team server/admin states still need persona screenshots or deferral.

Expected 9/10 behavior:

- Priya can tell what plan she is on, what actions are risky, and what happened after each admin action.
- The interface feels safe, not scary.

## Persona 5: Mobile Executive

Profile:

- Mobile or tablet user checking status between meetings.
- Does not want to configure everything, but needs Home, Settings, Memory, billing/profile, and theme to work.
- Sensitive to clipping, tiny targets, and scroll traps.

State bundle to capture:

- Account mode: accountless local.
- Billing tier: Solo unless Team account view is intentionally sampled.
- UI disclosure tier: `simple`, with `power` only as a route-discovery comparison.
- Model state: no-model or verified-model banner must fit.
- Data state: at least one workspace and some memory.
- Offline/error state: overlay close plus readable empty/error state.
- Viewport: 390 x 844 primary; optional tablet 1024 x 768.
- Non-main gate decisions: T13/T14/T19 deferred or evidenced if launch, desktop, or browser-capture flows enter this mobile score.

Primary journey:

1. Set viewport to 390 x 844.
2. Open `/home`.
3. Open `/settings`.
4. Inspect billing/general/model/profile areas.
5. Open `/settings/profile`.
6. Open `/memory`.
7. Open workspace chat and send or type a short message.
8. Open Command Center or Workspace Switcher and close it with keyboard/touch equivalent.

Required routes and overlays:

- Mobile `/home`
- Mobile `/settings`
- Mobile `/settings/profile`
- Mobile `/memory`
- Mobile workspace chat
- Command Center or Workspace Switcher
- Billing/profile/theme controls

Evidence to collect:

- Mobile screenshots for every route above.
- Mobile first-run onboarding Welcome/Profile screenshots if the persona starts from a clean install.
- Horizontal overflow check.
- Critical visible control bounds check, because the fresh mobile smoke found clipped controls without document-level overflow.
- Focus/keyboard/touch target notes.
- Console summary.

Automatic fail triggers:

- Settings remains squeezed two-pane layout at 390 px.
- First-run onboarding hides the primary Continue action on the Profile step.
- Any primary billing/profile/model control is clipped or unreachable.
- Overlay traps scroll/focus.
- Selected overlay cannot close by keyboard/touch path.
- Selected overlay lacks an accessible name/landmark or leaves primary icon-only controls unnamed. Current update: Notification Inbox, Create Workspace primary/subdialog contracts, Context Rail, Onboarding Tooltips, and tier close controls have focused contract coverage; less common rendered states still need evidence.
- Create Workspace returns to a template-first mobile hierarchy in any judged path not covered by the focused 390 x 844 evidence.
- Text overlaps or becomes unreadable.

Corrections that must land before this judge can pass:

- T2 mobile Settings responsive layout is closed for general, models, billing, and profile in the codified 390 px check.
- T2 first-run onboarding responsive layout is closed for the codified mobile Profile reachability check.
- T3 pricing/gating copy is closed for active Phase 1 surfaces.
- T10 form/accessibility hygiene. Current update: core shell overlay semantics and sampled Create Workspace mobile hierarchy are partially fixed; broader T10 remains open.
- T11 mobile route evidence.
- T12 mobile state bundle, including selected overlay close evidence.

Expected 9/10 behavior:

- The app feels intentionally responsive, not merely shrunken.
- Mobile user can inspect and make small changes without fighting layout.

## Judge Run Protocol

Preparation:

1. Build the app from current source.
2. Start a fresh-port local server with clean data unless testing return-state memory.
3. Run standard verification from the main audit.
4. Run or update route manifest evidence.
5. Capture required screenshots per persona.
6. Run `tests/vision/personas.spec.ts` only in a real-LLM lane, because it is not a no-LLM smoke test.

Scoring:

1. Fill the score table for one persona at a time.
2. Record exact blockers and route evidence.
3. Apply score caps before subjective scoring.
4. If a persona scores below 9, create a correction item or map it to an existing T-ticket.
5. Do not average away failures; all five must pass.

Suggested output table:

| Persona | Functional /2 | Flow /2 | Trust /2 | Visual+A11y /2 | Perf /1 | Memory fit /1 | Total | Verdict | Blockers |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Solo founder | Not Run | Not Run | Blocked | Not Run | Not Run | Not Run | Not Run | Pre-fix blocked | P0-1, P0-3 |
| Researcher | Not Run | Not Run | Blocked | Blocked | Not Run | Not Run | Not Run | Pre-fix blocked | P0-4, P1-1 |
| Engineer | Blocked | Blocked | Not Run | Not Run | Not Run | Not Run | Not Run | Pre-fix blocked | P0-5, P0-6 |
| Team admin | Not Run | Not Run | Blocked | Not Run | Not Run | Not Run | Not Run | Pre-fix blocked | P0-1, P0-3, P1-1 |
| Mobile executive | Not Run | Not Run | Not Run | Blocked | Not Run | Not Run | Not Run | Pre-fix blocked | P0-2, P0-7 |

## Implementation Backlog Mapping

| Scorecard blocker | Main ticket |
|---|---|
| Accountless Clerk/CSP console errors | T1 |
| Mobile Settings squeezed/clipped | T2 |
| Mobile first-run onboarding primary action hidden | T2/T12 |
| Pro copy in active flows | T3 |
| `Ctrl+Shift+N` mismatch and overlay trap | T4 |
| Visual baselines classified as stale but not approved/updated | T5 |
| Marketplace live sync and flaky search | T6 |
| Native confirm/alert/prompt | T7 |
| Heavy initial payload or delayed first meaningful UI | T8 |
| Unknown local model cost semantics | T9 |
| Labels/focus/icon-only buttons/noisy warnings | T10 |
| Thin route coverage and judge harness gaps | T11 |
| Missing state/failure bundle declaration | T12 |
| Shell overlay semantics, close behavior, and Create Workspace mobile hierarchy | T10/T12 |
| Canonical launch domains do not resolve; download has no releases; checkout, legal, and deploy gates remain open despite fresh localhost rendered evidence | T13 |
| Desktop wrapper tray source is narrowed, but packaged tray, installer, update, and sidecar startup evidence is still missing | T14 |
| Admin web, CLI launcher, Waggle CLI, legacy memory MCP, and hive-mind CLI still have blocking rendered/admin and built-entry issues; marketplace CLI first-command path is locally fixed | T15 |
| AI-tool hook lifecycle has partial rendered Launcher evidence but still lacks real-tool/package invocation proof and clear result/unsupported-output UX | T16 |
| Developer API, background worker, and substrate verification evidence missing | T17 |
| Ops, deployment, CI, benchmark, and judging evidence missing | T18 |
| Browser Companion auth/background save, popup keyboard/focus/Enter save, direct Save page click, restricted-page disabled-state recovery, stable packaged-ID pairing, Memory search provenance, existing chat `auto_recall`/catch-up provenance, and rendered Memory UI after secure save are live-proven, but native toolbar-bubble/native context-menu proof remains incomplete; future recall result shapes need evidence if scored | T19 |
