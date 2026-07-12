# Web Guidelines Line Findings - 2026-07-08

Status: analysis supplement with implementation notes.

Source rule set: Vercel Web Interface Guidelines, fetched on 2026-07-08 from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.

Scope scanned:

- `apps/web/src/components/os`
- `packages/admin-web/src`
- `apps/www/app`
- Test/spec files excluded for the count summaries.

This file supplements the main UX audit with line-level Web Interface Guidelines findings. It does not change the Phase 1 approval boundary. It strengthens T7, T8, and T10 in the correction register.

## Summary

| Area | Finding | Ticket |
|---|---:|---|
| Native browser dialogs | Historical audit found 20 high-confidence production calls in destructive/admin/export flows; current follow-up scan finds 0 after Create Workspace template delete, Approvals revoke-all, Artifact delete, Memory Center destructive-action, Wiki export, Settings telemetry/backup/restore, BackupApp restore, Automation delete, compliance template delete, and admin member-removal fixes | T7 |
| Broad animation transitions | 0 `transition-all` hits in scoped production UI after the focused transition-scoping sweep | T8/T10 |
| Focus suppression | 57 `outline-none` / `focus:outline-none` hits in the original scan; 0 current high-confidence weak/missing focus replacements remain in the reviewed list below after focused fixes | T10 |
| Raw images | 11 `<img>` hits in cockpit UI; 0 lack explicit `width`/`height` attributes after the `SuggestedAgentCards`, `AgentCenterRow`, `ReadyStep`, `BootScreen`, `StatusBar`, `LoginBriefing`, `ChatApp`, and `SpawnAgentDialog` fixes | T8/T10 |
| Form metadata | Loose JSX scan found 145 text-like controls missing `name`, 107 missing `autoComplete`, and 115 without an obvious same-tag `id`/ARIA label hook | T10 |
| Locale/date handling | 114 `new Date(...)` / `toLocale*` hits in scoped production UI; user-visible date/number output needs an `Intl.*` pass | T10/T12 |
| Paste/zoom blockers | No paste-blocking `onPaste` and no zoom-disabling viewport rules found | pass |

The form metadata scan is intentionally treated as an audit queue, not a compiler-grade count, because JSX attributes often span lines and custom `Input` components need contextual label inspection.

## T7 Native Dialogs

These should move to in-app confirmation/result patterns with clear object name, consequence, reversibility, and post-action state.

Current high-confidence production scan: no remaining browser-native `confirm`, `alert`, or `prompt` calls. Remaining broad scan hits are markdown sanitizer test payloads only.

Implementation update 2026-07-08:

- `CreateWorkspaceDialog.tsx` template delete now uses an in-app confirmation.
- `ApprovalsApp.tsx` revoke-all grants now uses the shared in-app `ApprovalModal`.
- `ArtifactCenterApp.tsx` permanent delete now uses the shared in-app `ApprovalModal`; `artifact-center-trust.test.tsx` and rendered `J3e` cover the no-native-confirm contract.
- `MemoryCenterTab.tsx` permanent delete, GDPR erase, and allow re-import now use the shared in-app `ApprovalModal`; `memory-center-trust.test.tsx` and rendered `J3f` cover the no-native-confirm contract.
- `WikiTab.tsx` Obsidian and Notion exports now use an in-app form dialog; `wiki-export-trust.test.tsx` and rendered `J3g` cover the no-native-prompt contract.
- `SettingsApp.tsx` telemetry clear and Settings backup/restore now use in-app approval/status states; `settings-trust.test.tsx` and rendered `J3h` cover the no-native-dialog contract.
- `BackupApp.tsx` restore now uses the shared in-app `ApprovalModal`; `p1b-authgate-surfaces.test.tsx` covers the no-native-confirm contract.
- `AutomationCenterApp.tsx` delete now uses the shared in-app `ApprovalModal`; `phase3b-automation-center.test.tsx` covers the no-native-confirm contract.
- `ComplianceTemplateModal.tsx` delete now uses the shared in-app `ApprovalModal`; `compliance-template-trust.test.tsx` covers the no-native-confirm contract.
- `packages/admin-web/src/pages/Members.tsx` member removal now uses an in-app confirmation panel; `admin-pages.test.ts` covers the no-native-confirm contract.

## T10 Focus Findings

These are the high-confidence focus risks from the scoped `outline-none` scan. Lines that already include a clear same-element `focus-visible:ring-*` replacement were not listed here.

Implementation update 2026-07-08 T10: `AllWorkspacesApp` search, the Settings Prompt Shape select, and `WikiTab` search now have visible focus-ring replacements and are removed from the open list below.

Implementation update 2026-07-09 T10: `WorkspaceActionsMenu` rename and delete confirmation inputs now have explicit `label`/`htmlFor` wiring, `name`, `autocomplete="off"`, and token-based `focus-visible` rings guarded by `workspace-actions-menu.test.tsx`; they are removed from the open list below.

Implementation update 2026-07-09 T10: `CommandCenter` search now has a token-based `focus-visible` ring guarded by `p7-b3-command-center.test.tsx`; it is removed from the open list below.

Implementation update 2026-07-09 T10: warm `AskBar` input now has `name`, `autocomplete="off"`, and a token-based `focus-visible` ring guarded by `warm-primitives.test.tsx`; it is removed from the open list below.

Implementation update 2026-07-09 T10: workspace `TasksTab` add-task input now has `aria-label`, `name`, `autocomplete="off"`, and a token-based `focus-visible` ring guarded by `workspace-tasks-tab.test.tsx`; it is removed from the open list below.

Implementation update 2026-07-09 T10: `TimelineApp` event-type filter select now has `aria-label`, `name`, hidden decorative icon semantics, and a token-based `focus-visible` ring guarded by `timeline-app.test.tsx`; it is removed from the open list below.

Implementation update 2026-07-09 T10: `CreateWorkspaceDialog` template creator Description and Starter Memory textareas now have associated labels, `name`, `autocomplete="off"`, and token-based `focus-visible` rings guarded by `shell-overlay-contracts.test.tsx`; they are removed from the open list below.

Implementation update 2026-07-09 T10: `WorkspaceSwitcher` focus movement, Tab trap, Escape close, and focus return are now guarded by `shell-overlay-contracts.test.tsx`; it is removed from the open list below.

Implementation update 2026-07-09 T10: `ConnectorCard` row actions and Jira credential setup fields now have stable names/autocomplete metadata, email/token semantics, disabled spellcheck, and token-based focus rings guarded by `phase4b-connector-hub.test.tsx`; the ConnectorCard credential rows are removed from the open list below.

Implementation update 2026-07-09 T10: `ExtensionCard` marketplace inline connector-token paste now has an accessible connector-specific label, stable `name`, `autocomplete="off"`, disabled spellcheck, and token focus-ring coverage guarded by `phase4b-marketplace-extend.test.tsx`.

Implementation update 2026-07-09 T10: `InstallAuditPanel` marketplace audit type filter now has stable `name`/autocomplete metadata and token-based focus rings guarded by `phase4b-marketplace-extend.test.tsx`.

Implementation update 2026-07-09 T10: `TelemetryApp` daily budget input now has stable `name` and `autocomplete="off"` metadata guarded by `TelemetryApp.test.tsx`.

Implementation update 2026-07-09 T10: `SkillEditorDrawer` markdown textarea now has stable `name`, `autocomplete="off"`, and disabled spellcheck metadata guarded by `phase3c-skill-builder.test.tsx`.

Implementation update 2026-07-09 T10: `CreateAgentForm`, `CreateGroupForm`, and `GroupDetail` template controls now have associated labels or accessible names, stable `name` values, `autocomplete="off"`, token-based focus rings, and the group execution strategy exposes `aria-pressed`; `AgentTemplateForms.test.tsx` guards the flow.

Implementation update 2026-07-09 T10: `TemplatesView` search now exposes contextual accessible names, stable `name` values, and `autocomplete="off"` for persona/group template search; `phase3b-agent-center.test.tsx` guards the persona-template path.

Implementation update 2026-07-09 T10: `GroupCard` now uses separate select/delete buttons instead of nesting a delete button inside the card button; delete is named per group, both actions have token-based focus rings, and `GroupCard.test.tsx` guards the behavior.

Implementation update 2026-07-09 T10: `AgentCard` now uses separate select/delete buttons instead of an interactive delete control inside a selectable `role="button"` card; custom-agent delete stays named, both actions have token-based focus rings, and `AgentCard.test.tsx` guards the behavior.

Current high-confidence production scan: no remaining focus findings in this reviewed list. The broad `outline-none` count above remains historical until an AST/lint rescan.

## T8/T10 Transition Findings

Guideline rule: never use `transition-all`; list properties explicitly and prefer transform/opacity for compositor-friendly animation.

Implementation update 2026-07-09 T8/T10: `CreateGroupForm` strategy buttons now use `transition-colors`, `GroupCard`/`AgentCard` select/delete controls now use explicit transition properties, and `SuggestedAgentCards` now uses explicit color/transform transition properties for the browse affordance, so the prior `CreateGroupForm.tsx:81`, `GroupCard.tsx`, `AgentCard.tsx`, and `SuggestedAgentCards.tsx:144` rows are removed.

Implementation update 2026-07-09 T8/T10: `LoginBriefing` workspace rows, `SpawnAgentDialog` workspace/persona buttons, and the `ChatApp` session sidebar now use explicit color or width transitions guarded by `wave-w-briefing-entrance.test.tsx`, `SpawnAgentDialog.test.tsx`, and `wave-u-chat-action-row.test.tsx`, so the prior `LoginBriefing.tsx:344`, `SpawnAgentDialog.tsx:215`, `SpawnAgentDialog.tsx:270`, and `ChatApp.tsx:948` rows are removed.

Implementation update 2026-07-09 T8/T10: `CreateWorkspaceDialog` chip, template, storage, persona, and agent-group controls now use explicit color/transform transitions guarded by `shell-overlay-contracts.test.tsx`, so the prior `CreateWorkspaceDialog.tsx:163`, `:631`, `:653`, `:911`, `:949`, `:967`, `:1109`, `:1198`, and `:1218` rows are removed.

Implementation update 2026-07-09 T8/T10: `WorkspaceSwitcher` rows and `PersonaSwitcher` persona/group cards now use explicit color transitions guarded by `shell-overlay-contracts.test.tsx`, so the prior `WorkspaceSwitcher.tsx:59` and `PersonaSwitcher.tsx:188`/`:320` rows are removed.

Implementation update 2026-07-09 T8/T10: `ConnectorCard` rows, `BrandTile` shadows, and `McpCatalog` distribution/category controls now use explicit color, shadow, filter, or background/color/box-shadow transitions guarded by `phase4b-connector-hub.test.tsx` and `phase4b-mcp-hub.test.tsx`, so the prior `ConnectorCard.tsx:115`, `BrandTile.tsx:50`, and `McpCatalog.tsx:146`/`:207`/`:221` rows are removed.

Implementation update 2026-07-09 T8/T10: `TelemetryApp` daily budget meter, `SurfaceToggle` knob, and workspace `TasksTab` delete action now use explicit width, left/background-color, or opacity/color transitions guarded by `TelemetryApp.test.tsx`, `power-primitives.test.tsx`, and `workspace-tasks-tab.test.tsx`, so the prior `TelemetryApp.tsx:222`, `power-primitives.tsx:89`, and `TasksTab.tsx:60` rows are removed.

Implementation update 2026-07-09 T8/T10: `ArtifactCenterApp` artifact cards, `DashboardApp` workspace tiles, `HomeCockpit` recent workspace cards, and `MarketplaceApp` shelf chips now use explicit border/transform/shadow or background/color/box-shadow transitions guarded by `artifact-center-trust.test.tsx`, `DashboardApp.test.tsx`, `p2-home-desktop.test.tsx`, and `phase4b-marketplace-extend.test.tsx`, so the prior `ArtifactCenterApp.tsx:344`, `DashboardApp.tsx:207`, `HomeCockpit.tsx:449`, and `MarketplaceApp.tsx:373` rows are removed.

```text
No remaining production `transition-all` hits in the scoped cockpit/admin/www scan.
```

## T8/T10 Image Findings

All inspected image hits have `alt` or `alt=""` and explicit `width` and `height` attributes after focused fixes. The `AppShell` wallpaper at `apps/web/src/components/os/AppShell.tsx:415` already had explicit dimensions.

Implementation update 2026-07-09 T8/T10: `SuggestedAgentCards` persona avatars and roster thumbnails now have explicit `width`/`height` attributes guarded by `SuggestedAgentCards.test.tsx`, so the prior `SuggestedAgentCards.tsx:78` and `SuggestedAgentCards.tsx:124` rows are removed.

Implementation update 2026-07-09 T8/T10: `AgentCenterRow` list avatars now have explicit `width`/`height` attributes guarded by `phase3b-agent-center.test.tsx`, so the prior `AgentCenterRow.tsx:46` row is removed.

Implementation update 2026-07-09 T8/T10: onboarding `ReadyStep` logo media now has explicit `width`/`height` attributes guarded by `ReadyStep.test.tsx`, so the prior `ReadyStep.tsx:19` row is removed.

Implementation update 2026-07-09 T8/T10: `BootScreen` and `StatusBar` logo media now have explicit `width`/`height` attributes guarded by `r20-boot-reduced-motion-glow.test.tsx` and `StatusBar.test.tsx`, so the prior `BootScreen.tsx:132` and `StatusBar.tsx:111` rows are removed.

Implementation update 2026-07-09 T8/T10: `LoginBriefing`, the `ChatApp` empty state, and `SpawnAgentDialog` persona media now have explicit `width`/`height` attributes guarded by `wave-w-briefing-entrance.test.tsx`, `wave-u-chat-action-row.test.tsx`, and `SpawnAgentDialog.test.tsx`, so the remaining `LoginBriefing.tsx:228`, `ChatApp.tsx:1070`, and `SpawnAgentDialog.tsx:276`/`:388` rows are removed.

```text
No remaining high-confidence image-dimension findings in the scoped cockpit scan.
```

## T10 Form Metadata Queue

Loose JSX scan results from the pre-fix snapshot:

- 145 text-like controls missing `name`.
- 107 controls missing `autoComplete`.
- 115 controls without an obvious same-tag `id`, `aria-label`, or `aria-labelledby`.

Implementation update 2026-07-08 T10: representative high-traffic metadata fixes landed for Settings model/trust/team/KVARK controls, Profile identity fields, Launcher refresh/prompt, Approvals refresh/revoke grant buttons, All Workspaces search, and Wiki search. The broad counts above are retained as historical scan output and should be regenerated by an AST/lint pass before the final T10 closeout.

Implementation update 2026-07-09 T10: template custom-agent, agent-group creator, and group task-runner fields now have label associations, stable metadata, focus rings, and strategy pressed state, guarded by `AgentTemplateForms.test.tsx`.

Implementation update 2026-07-09 T10: `SpawnAgentDialog` launch task/new-workspace fields, `McpCatalog` catalog search, `ArtifactCenterApp` detail editor fields, `ModelGate` cloud-key/local-pull fields, inline `CapabilityRequestCard` connector token entry, and `TelegramDigestCard` credential fields now have associated labels or accessible names plus stable `name` and `autocomplete` metadata. Focused coverage: `SpawnAgentDialog.test.tsx`, `phase4b-mcp-hub.test.tsx`, `artifact-center-trust.test.tsx`, `ModelGate.test.tsx`, `pr4-inline-capability.test.tsx`, and `TelegramDigestCard.test.tsx`.

Implementation update 2026-07-09 T10: first-run onboarding profile name/role, workspace-name, and first-task controls now expose stable `name` and `autocomplete` metadata guarded by `WhoAreYouStep.test.tsx`, `WorkspaceCreateStep.test.tsx`, and `FirstTaskStep.test.tsx`.

Implementation update 2026-07-09 T10: `EraseDataDialog` destructive confirmation now associates its label with the phrase field, adds stable `name`/`autocomplete="off"` metadata, and uses a token `focus-visible` ring guarded by `EraseDataDialog.test.tsx`.

Implementation update 2026-07-09 T10: `McpScopeDialog` target-workspace select now has stable `name`/`autocomplete="off"` metadata and a token `focus-visible` ring guarded by `phase4b-mcp-hub.test.tsx`.

Implementation update 2026-07-09 T10: `CreateWorkspaceDialog` visible setup fields, template search, template-creator AI/name fields, and folder-picker new-folder field now expose stable `name`/`autocomplete="off"` metadata and accessible labels/names guarded by `shell-overlay-contracts.test.tsx`.

Implementation update 2026-07-09 T10: `ComplianceDashboard` report template/date controls and `ComplianceTemplateModal` create/edit fields now expose associated labels, stable `name`/`autocomplete` metadata, and token focus rings guarded by `ComplianceDashboard.test.tsx` and `compliance-template-trust.test.tsx`.

Implementation update 2026-07-09 T10: `FilesApp` transient new-folder and inline rename fields now expose accessible names, stable `name`/`autocomplete="off"` metadata, disabled spellcheck for file names, and token focus rings guarded by `StorageAndFilesApp.test.tsx`.

Implementation update 2026-07-09 T10: `FilesApp` bulk Move and file Properties dialogs now name their icon-only close controls, add token focus rings, and preserve the row-level Properties context menu instead of falling through to the empty-space menu; `StorageAndFilesApp.test.tsx` guards both flows.

Implementation update 2026-07-09 T10: `AutomationCenterApp` template workspace and assist-mode controls now expose stable `name`/`autocomplete` metadata and token focus rings guarded by `phase3b-automation-center.test.tsx`.

Implementation update 2026-07-09 T10: `MemoryTrustManage` search and correction editor now expose stable `name`/`autocomplete` metadata, and the correction editor has a token `focus-visible` ring guarded by `pr35-memory-trust-manage.test.tsx`.

Implementation update 2026-07-09 T10: `TimelineTab` search, filter toggle, and minimum-importance slider now expose accessible names/label association, stable metadata, and token focus rings guarded by `p7-b5-error-threading.test.tsx`.

Implementation update 2026-07-09 T10: `EvolutionTab` proposal review note now associates its visible label with the textarea, exposes stable `name`/`autocomplete` metadata, and uses a token focus ring guarded by `EvolutionTab.test.tsx`.

Implementation update 2026-07-09 T10: `EvolutionTab` New Run modal now names the close icon, associates Target Kind, Target Name, Baseline, and Schema baseline controls with stable `id`/`name` metadata, sets select and textarea `autocomplete="off"`, and uses token focus rings guarded by `EvolutionTab.test.tsx`.

Implementation update 2026-07-09 T10: `MemoryCard` selection checkboxes now expose memory-specific accessible names plus stable `name`/`value` metadata guarded by `MemoryCard.test.tsx`.

Implementation update 2026-07-09 T10: `SettingsApp` Prompt Shape and `TimelineApp` event-type selects now set `autocomplete="off"` with focused coverage in `settings-trust.test.tsx` and `timeline-app.test.tsx`.

Implementation update 2026-07-09 T10: `WikiTab` search now has an input-level token focus ring, and Obsidian/Notion export target fields now expose target-specific `name`, `autocomplete="off"`, and token focus rings guarded by `wiki-export-trust.test.tsx`.

Implementation update 2026-07-09 T10: `UserProfileApp` Analyze Style action now has an explicit button type and token focus ring guarded by `UserProfileApp.test.tsx`.

Implementation update 2026-07-09 T10: `ComplianceDashboard` report options and `ComplianceTemplateModal` template fields now use token `focus-visible:ring-2` focus rings guarded by `ComplianceDashboard.test.tsx` and `compliance-template-trust.test.tsx`.

Implementation update 2026-07-09 T10: `MemoryTrustManage` search now pairs its stable metadata with a token focus ring guarded by `pr35-memory-trust-manage.test.tsx`.

Implementation update 2026-07-09 T10: `ChatApp` message composer now pairs its stable metadata with a token focus ring guarded by `lane-c-input-power.test.tsx`.

Implementation update 2026-07-09 T10: `ModelPilotCard` budget threshold slider now exposes an accessible name, stable `name`, and token focus ring while preserving update behavior guarded by `ModelPilotCard.test.tsx`.

Implementation update 2026-07-09 T10: `AllWorkspacesApp` search now pairs its stable metadata with an input-level token focus ring guarded by `AllWorkspacesApp.test.tsx`.

Implementation update 2026-07-09 T10: `ArtifactCenterApp` detail Kind select now pairs its stable metadata with a token focus ring guarded by `artifact-center-trust.test.tsx`.

Implementation update 2026-07-09 T10: `LauncherApp` optional launch prompt now pairs its stable metadata with a token focus ring guarded by `launcher-a11y.test.tsx`.

Representative high-traffic rows:

```text
apps/web/src/components/os/apps/VaultApp.tsx:329 - secret name input lacks name/autocomplete and explicit label hook
apps/web/src/components/os/apps/VaultApp.tsx:361 - secret type select lacks name and explicit label hook
apps/web/src/components/os/apps/VaultApp.tsx:373 - username/email input lacks name/autocomplete and should disable spellcheck
apps/web/src/components/os/apps/VaultApp.tsx:379 - secret value password lacks name/autocomplete
apps/web/src/components/os/apps/ChatApp.tsx:1589 - chat composer textarea lacks name/autocomplete
apps/web/src/components/os/apps/agents/AgentBuilder.tsx:230 - agent name input lacks name/autocomplete
apps/web/src/components/os/apps/automations/AutomationBuilder.tsx:305 - automation name input lacks name/autocomplete
apps/web/src/components/os/apps/memory/MemoryCenterTab.tsx:406 - memory search input lacks name/autocomplete and explicit label hook
packages/admin-web/src/App.tsx:76 - team slug input lacks name/autocomplete and explicit label association
```

Recommended correction pattern:

- Add `id` plus `htmlFor`, or a clear `aria-label` where visual labels are intentionally absent.
- Add stable `name` values for all real form controls.
- Add `autoComplete="off"` for non-auth/system fields and meaningful autocomplete tokens for URL, email, username, and current/new password fields.
- Use correct `type`, `inputMode`, and `spellCheck={false}` for URLs, emails, codes, tokens, and usernames.
- Keep placeholders as examples, not as the only label.

## Locale And Date Queue

Scoped scan found 114 `new Date(...)` / `toLocale*` hits. Some are internal sorting/parsing and some already use explicit locale constants, but the pass should standardize user-visible formatting through helpers backed by `Intl.DateTimeFormat` / `Intl.NumberFormat`.

High-priority examples:

```text
apps/web/src/components/os/apps/HomeCockpit.tsx:98 - user-visible date formatting is test-coupled; keep locale explicit if changed
apps/web/src/components/os/apps/TimelineApp.tsx - top scoped file by date/locale hits
apps/web/src/components/os/StatusBar.tsx - user-visible time/date area needs hydration and locale review
apps/web/src/components/os/apps/FilesApp.tsx - file dates/sizes should share one formatting helper
apps/web/src/components/os/apps/cockpit/ComplianceDashboard.tsx - compliance date filters and report dates need consistent locale semantics
```

## Commands Used

```powershell
rg -n "\b(confirm|alert|prompt)\s*\(" apps/web/src apps/www packages/admin-web/src --glob '*.ts' --glob '*.tsx'
rg -n "transition-all" apps/web/src/components/os packages/admin-web/src apps/www/app --glob '*.tsx' --glob '*.ts'
rg -n "outline-none|focus:outline-none" apps/web/src/components/os packages/admin-web/src apps/www/app --glob '*.tsx' --glob '*.ts'
rg -n -A6 "<img" apps/web/src/components/os --glob '*.tsx'
```

The form metadata counts came from a loose PowerShell JSX tag scanner over `<Input>`, `<input>`, `<textarea>`, and `<select>` and should be regenerated or replaced by an AST-based lint before implementation.
