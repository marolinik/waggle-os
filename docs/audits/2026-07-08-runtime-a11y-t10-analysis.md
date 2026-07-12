# Focused Runtime Accessibility T10 Analysis

Status: original runtime analysis plus follow-up implementation notes. The axe table below records the pre-fix built-app smoke; the 2026-07-08 T10 update records the focused controls now covered by regression tests, plus the new zero-violation runtime axe gate for the sampled core routes.

Purpose: add rendered accessibility evidence for high-traffic routed surfaces. The earlier Web Guidelines supplement is a static source scan; this file records what axe-core and DOM heuristics found when the built app actually rendered under the standard E2E skip harness.

Guideline source refreshed during this pass: Vercel Web Interface Guidelines, `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`. The rules most relevant here are named icon buttons, named form controls, keyboard-reachable scroll regions, semantic headings/landmarks, visible focus, and long label handling.

## Runtime Evidence

Environment:

```powershell
$env:WAGGLE_PORT='3423'
$env:WAGGLE_TRUST_LOCALHOST='1'
$env:WAGGLE_DISABLE_MARKETPLACE_SYNC='1'
$env:WAGGLE_DATA_DIR="$env:TEMP\waggle-a11y-smoke-3423"
$env:EMBEDDING_PROVIDER='mock'
$env:VITE_CLERK_PUBLISHABLE_KEY=''
$env:CLERK_SECRET_KEY=''
npm run build
npx tsx packages/server/src/local/start.ts --skip-litellm
```

Rendered URL shape:

```text
?skipOnboarding=true&skipBoot=true&skipBriefing=true&tier=power
```

Evidence artifacts:

```text
output/playwright/a11y-runtime-3423/runtime-a11y-summary-skip.json
output/playwright/a11y-runtime-3423/runtime-a11y-summary.json
output/playwright/route-evidence-3457/all-route-smoke-summary.json
output/playwright/route-evidence-3457/all-route-smoke.json
```

`runtime-a11y-summary.json` is retained as a harness caveat: without the skip parameters, desktop direct routes can render first-run/auth state rather than the intended app surface. `runtime-a11y-summary-skip.json` is the authoritative route-content evidence from this pass.

Implementation note: axe was injected with Playwright `bypassCSP: true`. A normal `page.addScriptTag()` was correctly blocked by the app CSP, which is consistent with the known T1 lane. This bypass was used only to inspect accessibility; it is not product behavior.

Color contrast was disabled in the axe run because Waggle already has dedicated `npm run ux:contrast` and `npm run ux:color-guard` gates.

## Post-Fix Runtime Gate

The ad hoc audit is now codified as `tests/e2e/runtime-a11y.spec.ts`.

Latest evidence:

```powershell
$env:WAGGLE_E2E_PORT='34193'
$env:WAGGLE_E2E_BASE_URL='http://localhost:34193'
npx playwright test tests/e2e/runtime-a11y.spec.ts --project=chromium --reporter=line
```

Result: pass, 2/2. The gate runs axe-core against Home, Settings, Profile, Vault, Mission Control, Memory, workspace chat, Agents, Waggle Dance, Launcher, MCP Hub, Files, and Approvals at desktop 1440 x 900 and mobile 390 x 844. It currently expects zero axe violations for this sampled route set.

## Routes Sampled

Each route below returned HTTP 200 and matched expected route text in both desktop 1440 x 900 and mobile 390 x 844 contexts when loaded with the skip harness.

| Route | Desktop axe result | Mobile axe result | Runtime concern |
|---|---|---|---|
| `/home` | `region` moderate | `region` moderate | Some status/topbar content is outside landmarks; ask input is named but lacks form metadata. |
| `/settings` | `button-name` critical, `select-name` critical, `region` moderate | Same | A tooltip/icon button lacks a discernible name; Prompt Shape select lacks an associated accessible name; Settings form metadata remains weak. |
| `/settings/profile` | `select-name` critical, `region` moderate | Same | Profile selects lack associated accessible names; several profile fields lack `name`/`autocomplete` metadata. |
| `/settings/vault` | Not in original axe sample | Not in original axe sample | Added to the codified post-fix gate after the Vault metadata slice. |
| `/settings/mission-control` | Not in original axe sample | Not in original axe sample | Added to the codified post-fix gate; expansion exposed ComplianceDashboard unnamed action buttons and heading order, now fixed. |
| `/memory` | `region` moderate | Same | Original concern: Memory search/list controls had weak metadata and top/status content outside landmarks repeated. Post-fix Memory Center metadata/focus coverage is recorded below. |
| `/workspaces/default-workspace/chat` | `image-alt` critical, `aria-allowed-role` minor, `region` moderate | Same | Workspace tab panel semantics and file/preview/icon imagery need source-level verification; chat composer lacks form metadata. |
| `/agents` | Not in original axe sample | Not in original axe sample | Added to the codified post-fix gate after the agent-card control slice. |
| `/waggle-dance` | Not in original axe sample | Not in original axe sample | Added to the codified post-fix gate after the WaggleDance refresh-control slice. |
| `/launcher` | `button-name` critical, `region` moderate | Same | Refresh icon button lacks a name; prompt textarea lacks form metadata. |
| `/mcps` | `region` moderate | Same | No named-control violations in this smoke; landmark issue repeats. |
| `/files` | `scrollable-region-focusable` serious, `heading-order` moderate, `region` moderate | Same | Files has a keyboard-inaccessible scroll region and heading order issue. |
| `/approvals` | `button-name` critical, `region` moderate | Same | Refresh/revoke icon buttons lack accessible names. |

Implementation update 2026-07-08 T10:

- Settings now names the telemetry toggle, associates the Prompt Shape select and high-traffic model/team/KVARK fields, and adds form metadata for daily budget, mutation gate, URLs, and tokens.
- Profile identity, writing-style, brand, and language controls now have explicit labels, stable `name` values, and autocomplete metadata; the Analyze Style action now has a token focus ring.
- Launcher now names the refresh icon button and the optional launch prompt textarea.
- Approvals now names refresh and per-grant revoke icon buttons.
- Cockpit, WaggleDance, ComplianceDashboard, and custom AgentCard delete controls now expose accessible names; AgentCard now separates selection and delete into distinct labelled buttons instead of nesting the delete action inside a selectable card.
- ComplianceDashboard report template/date controls and ComplianceTemplateModal create/edit fields now expose associated labels, stable name/autocomplete metadata, and token `focus-visible:ring-2` focus rings.
- All Workspaces and Wiki search inputs now have stable names/autocomplete metadata and visible focus-ring replacements.
- Files storage overview and file-browser scroll panes now expose named, keyboard-focusable regions with visible focus rings.
- Files new-folder and inline rename fields now expose accessible names, stable name/autocomplete metadata, disabled spellcheck for file names, and token focus rings.
- Files bulk Move and file Properties dialogs now expose named icon-only close controls with token focus rings, and the file row context menu preserves the file-specific Properties action.
- Chat composer and Vault add-secret controls now have accessible names plus stable `name`/autocomplete metadata; the Chat composer also has a token focus ring, and Vault refresh/edit/reveal/delete controls are named.
- Memory Center list/detail controls now expose stable search/select/editor metadata, focus rings for chips and actions, and named re-import/detail-editor paths.
- MemoryCard selection checkboxes now expose memory-specific accessible names plus stable name/value metadata.
- Memory Trust Manage search and correction editor now expose stable metadata and token focus rings.
- TimelineTab sidebar search, filter toggle, and minimum-importance slider now expose accessible names/label association, stable metadata, and token focus rings.
- TimelineApp event-type filtering now pairs its stable metadata with `autocomplete="off"`.
- EvolutionTab proposal review note now associates its label with the textarea, exposes stable metadata, and uses a token focus ring.
- EvolutionTab New Run modal now names the close icon and exposes associated labels, stable metadata, select/textarea autocomplete, and token focus rings for target, baseline, and schema controls.
- ConnectorCard row actions and Jira credential setup now expose stable email/token metadata, correct email/password semantics, disabled spellcheck, and visible focus rings.
- ExtensionCard marketplace inline connector-token paste now exposes connector-specific labels, stable name/autocomplete metadata, disabled spellcheck, and focus-ring coverage.
- InstallAuditPanel marketplace audit type filter now exposes stable name/autocomplete metadata and a token focus ring.
- ModelPilotCard budget threshold slider now exposes an accessible name, stable name, and token focus ring while preserving update behavior.
- TelemetryApp daily budget input now exposes stable name/autocomplete metadata.
- SkillEditorDrawer markdown textarea now exposes stable name/autocomplete metadata with spellcheck disabled.
- Agent template custom-agent, group-builder, and group-detail task-runner controls now expose stable labels/names/autocomplete metadata, visible focus rings, and `aria-pressed` strategy state.
- Agent Center templates search now exposes contextual accessible names plus stable name/autocomplete metadata for persona/group search.
- Automation Center template workspace and assist-mode controls now expose stable name/autocomplete metadata and token focus rings.
- AgentCard and GroupCard now separate selection and delete into distinct labelled buttons, remove invalid nested interactive structures, and replace broad transitions with explicit transition properties.
- SuggestedAgentCards now gives persona media explicit dimensions and replaces the browse affordance's broad transition with explicit color/transform transitions.
- CreateWorkspaceDialog now scopes chip, template, storage, persona, and agent-group transitions to explicit color/transform properties.
- WorkspaceSwitcher and PersonaSwitcher now scope switcher row/card transitions to explicit color properties.
- ConnectorCard, BrandTile, and McpCatalog now scope connector row, brand tile, distribution, and category-filter transitions to explicit properties.
- TelemetryApp, SurfaceToggle, and workspace TasksTab now scope meter, switch-knob, and delete-action transitions to explicit properties.
- ArtifactCenterApp, DashboardApp, HomeCockpit, and MarketplaceApp now close the remaining broad-transition backlog with explicit card/chip transition properties.
- SpawnAgentDialog launch task/new-workspace fields, McpCatalog catalog search, ArtifactCenterApp detail editor controls, ModelGate cloud-key/local-pull controls, inline CapabilityRequestCard connector-token entry, and TelegramDigestCard credential fields now expose associated labels or accessible names plus stable `name`/autocomplete metadata.
- AgentCenterRow now gives list-row persona media explicit dimensions in the rendered Agent Center route coverage.
- ReadyStep now gives the onboarding completion logo explicit dimensions.
- BootScreen and StatusBar now give persistent brand/logo media explicit dimensions.
- LoginBriefing, the ChatApp empty state, and SpawnAgentDialog persona picker/review media now give mascot/persona images explicit dimensions.
- First-run onboarding profile name/role, workspace-name, and first-task controls now expose stable name/autocomplete metadata.
- EraseDataDialog now associates the destructive confirmation label with the phrase field, adds stable name/autocomplete metadata, and exposes a token focus-visible ring.
- McpScopeDialog target-workspace select now exposes stable name/autocomplete metadata and a token focus-visible ring.
- CreateWorkspaceDialog visible setup fields, template search, template-creator AI/name fields, and folder-picker new-folder field now expose stable name/autocomplete metadata and accessible labels/names.
- AllWorkspacesApp search now pairs its stable metadata with an input-level token focus ring.
- WikiTab search now pairs stable metadata with an input-level token focus ring, and the Obsidian/Notion export target fields expose target-specific metadata and token focus rings.
- ArtifactCenterApp detail Kind select now pairs its stable metadata with a token focus ring.
- LauncherApp optional launch prompt now pairs its stable metadata with a token focus ring.
- The sampled runtime axe defects are closed: Model Pilot info is named and expanded-state aware, shared avatars default to decorative `alt=""` unless callers provide text, workspace tab panels use an allowed role host, file preview placeholders expose image labels, storage headings preserve order, toast close controls are named, and the persistent status bar is a labeled header landmark.
- Focused regression coverage: `settings-trust.test.tsx`, `timeline-app.test.tsx`, `wiki-export-trust.test.tsx`, `UserProfileApp.test.tsx`, `VaultApp.test.tsx`, `lane-c-input-power.test.tsx`, `launcher-a11y.test.tsx`, `p7-b1-approvals-error.test.tsx`, `p7-b5-error-threading.test.tsx`, `memory-center-trust.test.tsx`, `pr35-memory-trust-manage.test.tsx`, `CockpitApp.test.tsx`, `ComplianceDashboard.test.tsx`, `compliance-template-trust.test.tsx`, `AgentCard.test.tsx`, `GroupCard.test.tsx`, `SuggestedAgentCards.test.tsx`, `phase3b-agent-center.test.tsx`, `phase3c-agent-builder.test.tsx`, `phase3c-skill-builder.test.tsx`, `phase3c-automation-builder.test.tsx`, `phase3b-automation-center.test.tsx`, `AgentTemplateForms.test.tsx`, `phase4b-mcp-hub.test.tsx`, `phase4b-connector-hub.test.tsx`, `phase4b-marketplace-extend.test.tsx`, `StorageAndFilesApp.test.tsx`, `KnowledgeGraphViewer.test.tsx`, `HarvestTab.test.tsx`, `wave-w-briefing-entrance.test.tsx`, `wave-u-chat-action-row.test.tsx`, `SpawnAgentDialog.test.tsx`, `ModelGate.test.tsx`, `artifact-center-trust.test.tsx`, `pr4-inline-capability.test.tsx`, `TelegramDigestCard.test.tsx`, `WhoAreYouStep.test.tsx`, `WorkspaceCreateStep.test.tsx`, `FirstTaskStep.test.tsx`, `EraseDataDialog.test.tsx`, `shell-overlay-contracts.test.tsx`, the `/files` and Command Center branches of `tests/e2e/user-journeys.spec.ts`, and `tests/e2e/runtime-a11y.spec.ts`.

## Command Center Runtime Result

Using the exact existing E2E shortcut shape, `Control+k`:

- Desktop: Command Center opens, focus lands in the search input, Escape closes it, no visible element overflow.
- Mobile 390 x 844: Command Center opens and Escape closes it, but long subtitles overflow the dialog width.
- Both desktop and mobile log: `Warning: Missing Description or aria-describedby={undefined} for {DialogContent}.`
- The dialog text still includes active `Pinned - Pro` copy, which is already covered by T3.

Implementation update 2026-07-08 T10/T12: Command Center now includes a hidden dialog description, catalog subtitles render as their own truncating line, and `J-mobile: Command Center is described and fits at 390px` proves description, Escape close, and zero visible row overflow on a fresh production build.

This refines the earlier mobile smoke: the failed close result came from an ad hoc uppercase shortcut path. The close path passes with the current E2E shortcut shape. The focused label-fit/dialog-description contract is now fixed, and the expanded route axe gate is green.

## Source Owners To Verify During Implementation

These are likely owners from source inspection; implementation must re-read the files immediately before editing.

| Runtime finding | Likely source owner |
|---|---|
| Settings unnamed tooltip/icon button and unnamed Prompt Shape select | Fixed for the sampled route gate: telemetry toggle and Prompt Shape are named, and runtime axe is green. |
| Profile unnamed select and weak form metadata | Focused update landed for identity, writing-style, brand, and language controls; runtime axe includes `/settings/profile` and is green. |
| Launcher unnamed refresh icon button | Fixed for the sampled route gate: refresh and optional prompt controls are named, and runtime axe is green. |
| Approvals unnamed refresh/revoke icon buttons | Fixed for the sampled route gate: refresh and per-grant revoke controls are named, and runtime axe is green. |
| All-route smoke: additional placeholder-only or unassociated visible fields | Chat composer metadata/focus, Vault add-secret, Profile preference/brand controls and Analyze Style focus, Agent/Skill/Automation Builder fields, SkillEditorDrawer markdown editor, Automation Center template controls, Agent template custom-agent/group-builder/group-detail controls, Agent Center templates search, ExtensionCard inline connector-token paste, InstallAuditPanel audit filter, ModelPilotCard budget-threshold slider, TelemetryApp daily budget, Spawn Agent launch controls, Artifact Center search/create/detail controls, Agent Center search, Skills Hub search, ConnectorCard credential controls, Memory Center search/detail controls, MemoryCard selection checkbox labels/metadata, Memory Trust search/correction controls and focus rings, TimelineTab search/filter controls, TimelineApp event-type select metadata, EvolutionTab proposal review note and New Run modal controls, Knowledge Graph search/scope controls, Harvest import controls, Custom MCP form controls, MCP catalog search and scope select, ModelGate key/pull controls, inline capability connector-token entry, Telegram digest credentials, first-run onboarding profile/workspace/first-task controls, EraseDataDialog destructive confirmation, Create Workspace visible setup/template/folder-picker fields, Compliance Dashboard report options, Compliance Template form fields, Wiki search/export target controls, and Files new-folder/rename fields are fixed. Remaining representative owners are other less-traveled form surfaces outside the sampled route gate. |
| All-route smoke: additional unnamed icon-only controls | Vault refresh/edit/reveal/delete, WaggleDance refresh, Cockpit refresh, ComplianceDashboard report actions, AgentCard custom-delete/separate selection, GroupCard custom-delete/separate selection, Skill Builder reorder/remove controls, Files toolbar actions and move/properties dialog close controls, Mission Control refresh/pause/resume/stop controls, ConnectorCard row actions, Knowledge Graph toolbar/legend controls, and Harvest refresh/source actions are fixed. Remaining representative owners include broader modal controls outside the current gate. |
| Workspace `role="tabpanel"` axe warning | Fixed in `WorkspaceDesktopApp.tsx`; the tab panel now sits on a `section` instead of `main`, and the runtime axe gate is green. |
| Workspace/chat image or preview alt warning | Fixed through shared `AvatarImage` default alt text and file preview placeholder labeling; the runtime axe gate is green. |
| Files scrollable region and heading order | Fixed for sampled `/files` route: Storage and Files scroll panes are named/focusable, storage card headings preserve order, and runtime axe is green. |
| Command Center missing dialog description and mobile subtitle overflow | Focused update landed in `apps/web/src/components/os/overlays/CommandCenter.tsx`; unit coverage and `J-mobile: Command Center is described and fits at 390px` prove the dialog description and mobile row-fit contract. |
| Landmark `region` warning across many routes | Fixed in `StatusBar.tsx`; the persistent top chrome is now a labeled `header` landmark, and runtime axe is green. |

## Correction Candidates

| ID | Correction | Phase recommendation | Closure evidence |
|---|---|---|---|
| T10-H | Codify a small runtime a11y smoke using axe-core for the five-persona route set. | Fixed 2026-07-08 for sampled routes | `tests/e2e/runtime-a11y.spec.ts` covers Home, Settings, Profile, Vault, Mission Control, Memory, Chat, Agents, Waggle Dance, Launcher, MCP, Files, and Approvals in desktop/mobile and passes 2/2 on port `34193`. |
| T10-I | Add accessible names to icon-only buttons found at runtime. | Partially implemented 2026-07-08; Mission Control, ConnectorCard, Knowledge Graph, Harvest source controls, GroupCard delete, TimelineTab filter toggle, and Files dialog close controls fixed 2026-07-09 | Focused tests cover Settings telemetry, Launcher refresh, Approvals refresh/revoke, Vault actions, WaggleDance refresh, Cockpit refresh, ComplianceDashboard report actions, AgentCard custom-delete controls, GroupCard custom-delete controls, Files toolbar actions and move/properties dialog close controls, Mission Control refresh/pause/resume/stop controls, ConnectorCard row actions, Knowledge Graph toolbar/legend controls, Harvest refresh/source actions, and TimelineTab filter toggle; runtime axe confirms sampled `button-name` closure. Continue with remaining unsampled icon-only controls. |
| T10-J | Associate labels with native selects and add form metadata to high-traffic fields. | Partially implemented 2026-07-08; builder, route-search, ConnectorCard, ExtensionCard inline token paste, ModelPilotCard budget slider, AllWorkspaces search focus, Artifact Center detail Kind focus, Launcher prompt focus, TelemetryApp daily budget, SkillEditorDrawer markdown editor, Memory Center, MemoryCard selection checkbox labels/metadata, Memory Trust Manage, TimelineTab, EvolutionTab review note/New Run modal select/textarea metadata, Knowledge Graph, Harvest, Custom MCP, MCP scope select, agent template, Automation Center template controls, Agent Center templates search, InstallAuditPanel audit filter, Spawn Agent, ModelGate, Telegram, inline capability, first-run onboarding, EraseDataDialog, Create Workspace, compliance report/template, Chat composer focus, and Files inline-field/action metadata fixed 2026-07-09 | Focused tests cover Settings, Profile identity/preferences/brand and Analyze Style focus, Launcher prompt controls/focus, Chat composer metadata/focus, Vault add-secret controls, Agent/Skill/Automation Builder controls, SkillEditorDrawer markdown editor, Automation Center template controls, Agent template creator/detail controls, Agent Center templates search, ExtensionCard inline connector-token paste, InstallAuditPanel audit filter, ModelPilotCard budget-threshold slider, AllWorkspaces search focus, TelemetryApp daily budget, Spawn Agent launch controls, Artifact Center search/create/detail controls and detail Kind focus, Agent Center search, Skills Hub search, ConnectorCard credential controls, Memory Center search/detail controls, MemoryCard selection checkbox labels/metadata, Memory Trust search/correction controls and focus rings, TimelineTab search/filter controls, EvolutionTab proposal review note/New Run modal select/textarea controls, Knowledge Graph search/scope controls, Harvest import controls, Custom MCP form controls, MCP catalog search/scope controls, ModelGate key/pull controls, inline capability connector-token entry, Telegram digest credential controls, first-run onboarding profile/workspace/first-task controls, EraseDataDialog destructive confirmation, Create Workspace visible setup/template/folder-picker controls, Compliance Dashboard report options, Compliance Template form controls, and Files new-folder/rename fields; runtime axe is green for the sampled route set. Continue with remaining less-traveled forms. |
| T10-K | Fix keyboard access for scrollable route regions. | Fixed 2026-07-08 for sampled Files route | Focused tests cover the Storage overview and Files browser scroll panes as named `tabIndex=0` regions; runtime axe confirms sampled `scrollable-region-focusable` closure. |
| T10-L | Resolve workspace tab panel semantics and preview/image accessible text. | Fixed 2026-07-08 for sampled workspace route | Workspace/chat axe `aria-allowed-role` and `image-alt` findings are gone in `tests/e2e/runtime-a11y.spec.ts`. |
| T10-M | Add or correct Command Center dialog description and mobile long-label handling. | Focused fixed 2026-07-08 | Unit tests cover `DialogDescription` and truncating catalog subtitles; the mobile E2E route proves the dialog is described, closes with Escape, and has no visible row overflow at 390 x 844. |
| T10-N | Decide shell landmark strategy for StatusBar/top chrome. | Fixed 2026-07-08 | `StatusBar` is now a labeled `header` landmark; repeated axe `region` warnings are gone in the runtime gate. |

## Current Recommendation

Keep Phase 1 unchanged except for Settings controls touched by T2. The first T10 follow-up slices now include a repeatable runtime axe gate with zero sampled desktop/mobile violations across 13 routes, plus focused fixes for the highest-noise named-control findings, Files scroll-region keyboard access, toolbar controls, and inline new-folder/rename fields, workspace semantics/image text, shell landmarks, Chat/Profile/Vault metadata/action focus, Agent/Skill/Automation Builder metadata, SkillEditorDrawer markdown-editor metadata, Automation Center template metadata/focus, Agent template creator/detail metadata/focus, Agent Center templates search metadata, ExtensionCard inline connector-token metadata, InstallAuditPanel audit-filter metadata, TelemetryApp daily-budget metadata, Spawn Agent launch metadata, Artifact/Agent/Skills route search and detail metadata, ConnectorCard setup metadata/actions, Memory Center search/detail metadata, MemoryCard selection checkbox labels/metadata, Memory Trust search/correction metadata, TimelineTab search/filter metadata, EvolutionTab review-note/New Run modal metadata, Knowledge Graph toolbar/search/scope controls, Harvest import/source controls, Custom MCP form and catalog-search/scope metadata, ModelGate key/pull metadata, inline capability connector-token metadata, Telegram digest credential metadata, first-run onboarding profile/workspace/first-task metadata, EraseDataDialog destructive confirmation metadata/focus, Create Workspace visible setup/template/folder-picker metadata, Compliance Dashboard report-option metadata, Compliance Template form metadata/focus, Mission Control/Agents/WaggleDance icon controls, scoped production transition-all closure, AgentCenterRow media stability, ReadyStep media stability, BootScreen/StatusBar media stability, LoginBriefing/Chat/SpawnAgentDialog media stability, and Command Center description/mobile fit. Final judge scoring still needs any remaining unsampled form metadata outside the covered surfaces, remaining unsampled icon-only controls, and modal focus-return evidence.
