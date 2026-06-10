# Waggle OS UX Refactor - Claude Code Implementation Handoff

## North Star
Build a workspace-first Agent Desktop. Do not build another app launcher. Do not default users into blank chat. The new UX spine is Home Cockpit + Workspace Desktop + Win+K Command Center + visible Memory + Extend layer.

## Non-negotiable product rules
- Workspace is the primary object.
- Win+K is always available.
- Memory is visible, inspectable and editable.
- Artifacts are outcomes, not attachments.
- Connectors and MCPs live in Extend, not hidden Settings.
- Agents must declare scope, model, memory, tools and autonomy.
- No import or elevated tool access without explicit user approval.
- Use existing backend foundations wherever possible.

## Implementation sequence
- 0. Create feature branch and freeze route names.
- 1. Build AppShell and navigation labels.
- 2. Build Win+K command provider and search aggregator.
- 3. Promote WorkspaceBriefing/state into HomeCockpit.
- 4. Build WorkspaceDesktop using workspace state/context APIs.
- 5. Build MemoryCenter and ArtifactCenter.
- 6. Build Extend surfaces: Skills, Connectors, MCPs, Marketplace.
- 7. Build Agent/Skill/Automation/Workspace builders.
- 8. Build Team Workspace, RBAC and audit UI.
- 9. Polish states: empty/loading/error/offline/permission denied/syncing.

## Current repo files to inspect first
- `apps/web/src/components/os/WorkspaceBriefing.tsx` - **Keep and promote** - Use as seed for Home Cockpit. Split logic into HomeCockpit widgets and reusable WorkspaceNow panels.
- `packages/server/src/local/workspace-state.ts` - **Keep and extend** - This is the best backend basis for Home/Workspace state. Add artifacts/agents/automations fields.
- `packages/server/src/local/routes/workspace-context.ts` - **Modify** - Return richer WorkspaceNow/WorkspaceHome contract for new UI.
- `packages/hive-mind-core/src/workspace-manager.ts` - **Keep** - Workspace config model already supports many target fields. Add type/description/updatedAt if needed.
- `packages/hive-mind-core/src/mind/schema.ts` - **Keep and migrate carefully** - Memory/audit/trace substrate exists. Add confidence/provenance fields via metadata or migration if needed.
- `apps/web/src/lib/types.ts` - **Modify** - Update AppView, WorkspaceContext, MemoryFrame, Agent, Skill, Connector/MCP types.
- `apps/web/src/components/os/overlays/OnboardingWizard.tsx` - **Keep shell, redesign steps** - Map existing onboarding shell to the 5-step setup flow plus workspace creation handoff.
- `apps/web/src/components/os/apps/MemoryApp.tsx` - **Rework** - Turn into Memory Center with source/confidence/evidence/edit actions.
- `apps/web/src/components/os/apps/*` - **Rename/reframe** - Apps become Work, Intelligence or Extend surfaces. Avoid app-launcher mental model.
- `packages/core/src/install-audit.ts` - **Keep and expose** - Use for extension trust trail in Connectors/MCP/Marketplace.
- `packages/agent/src/tools.ts` - **Keep and normalize** - Tool permissions should be scoped through agent/skill/MCP model.
- `packages/memory-mcp/*` - **Keep** - Treat as built-in MCP/extension and demo of memory operations.

## Screen inventory
### Screen 1 - Home Cockpit
- Purpose: Executive briefing after launch.
- Key interactions: Continue work, inspect overnight activity, act on priorities, quick capture.
- Required states: Loading; first-run empty; normal; attention required; offline/local-only; overnight failure.
- Data/API: GET /home/briefing, GET /workspaces, GET /automations/status, quick-capture API.
- Acceptance: User can understand the day in under 30 seconds and take an action without opening chat.

### Screen 2 - Workspace Desktop
- Purpose: Primary runtime for one bounded context.
- Key interactions: Ask agent, open artifact, inspect memory, start automation, run skill, manage agents.
- Required states: No memory; active work; agent running; task blocked; artifact ready; permission denied; sync conflict.
- Data/API: GET /workspaces/:id/state, /context, sessions, artifacts, agents, automations.
- Acceptance: Chat is one widget; workspace context is always visible.

### Screen 3 - Win+K Command Center
- Purpose: Universal search/launch/create/run/navigate/extend.
- Key interactions: Search, launch, create object, run command, install extension, navigate.
- Required states: Idle; query; grouped results; no results; permission prompt; command success/fail.
- Data/API: GET /command/search?q=, POST /command/execute.
- Acceptance: Every major object/action is reachable from keyboard.

### Screen 4 - Memory Center
- Purpose: Visible memory with provenance and editability.
- Key interactions: Search, filter, inspect source, edit, merge, archive, delete, add to workspace/team.
- Required states: Empty; imported; active; stale; deprecated; low confidence; conflicting; source unavailable.
- Data/API: GET /memory, GET/PATCH /memory/:id, merge/archive/delete endpoints.
- Acceptance: Every memory explains why Waggle knows it.

### Screen 5 - Artifact Center
- Purpose: Outcome layer for docs, decks, sheets, dashboards, research, code and media.
- Key interactions: Search related objects, open/share/duplicate/move, relate to memory/session/task.
- Required states: Draft; final; shared; archived; generated; external missing; permission denied.
- Data/API: GET /artifacts, POST/PATCH /artifacts, relation APIs.
- Acceptance: Search for a topic returns artifacts plus related memories/sessions/tasks/agents.

### Screen 6 - Skills Hub
- Purpose: Reusable capabilities across users, workspaces and agents.
- Key interactions: Install, create, test, assign to agent/workspace, archive.
- Required states: Installed; marketplace; custom; workspace; draft; needs approval.
- Data/API: GET/POST/PATCH /skills, POST /skills/:id/test/install.
- Acceptance: Users can understand what a skill does and where it is used.

### Screen 7 - Connector Hub
- Purpose: Connect external tools and data.
- Key interactions: Connect, sync now, refresh token, revoke, inspect health.
- Required states: Connected; disconnected; expired token; syncing; failed; recommended.
- Data/API: GET /connectors, connect/sync/revoke APIs.
- Acceptance: Users see data flow and connection health clearly.

### Screen 8 - MCP Hub
- Purpose: Power-user capability extension.
- Key interactions: Install, add custom, test, scope, inspect logs, revoke.
- Required states: Installed; available; running; stopped; error; risk approval needed.
- Data/API: GET/POST /mcps, health/test/permissions APIs.
- Acceptance: MCPs are powerful but auditable and reversible.

### Screen 9 - Agent Center
- Purpose: Manage personal, workspace, team and autonomous agents.
- Key interactions: Create, run, pause, inspect logs, assign skills/tools, change permissions.
- Required states: Idle; running; paused; failed; needs approval; archived.
- Data/API: GET/POST/PATCH /agents, run/traces APIs.
- Acceptance: Agents have clear scope, goal, model, tools and memory access.

### Screen 10 - Team Workspace
- Purpose: Shared intelligence for teams.
- Key interactions: Invite, share memory/artifact/skill/MCP, assign role, view audit/activity.
- Required states: Owner/admin/member/viewer; invite pending; private/shared; conflicting permissions.
- Data/API: Team/RBAC APIs plus shared memory/artifact endpoints.
- Acceptance: Team means shared knowledge and outcomes, not just chat.

### Screen 11 - Automation Center
- Purpose: Scheduled and event-driven work.
- Key interactions: Create, run now, pause, inspect logs, edit schedule, handle failure.
- Required states: Running; scheduled; trigger fired; paused; failed; awaiting approval.
- Data/API: GET/POST/PATCH /automations, run/logs APIs.
- Acceptance: Overnight work is visible, reviewable and stoppable.

### Screen 12 - First Launch
- Purpose: Minimal promise and privacy reassurance.
- Key interactions: Continue, change language, view privacy note.
- Required states: Fresh install; resumed setup; offline; local-only.
- Data/API: Local onboarding state.
- Acceptance: No infrastructure overload before user intent.

### Screen 13 - Who Are You
- Purpose: Capture role, industry, work type, team size and goals.
- Key interactions: Enter profile, select goals, continue/back.
- Required states: Empty; partially complete; validation; saved.
- Data/API: POST /profile or local onboarding state.
- Acceptance: Profile drives recommendations but can be edited later.

### Screen 14 - Tool Discovery
- Purpose: Ask what tools the user uses.
- Key interactions: Select tools, add other, continue/back.
- Required states: No selection; selected; recommended; unsupported tool.
- Data/API: Local onboarding state; connector catalog.
- Acceptance: User-oriented language, not infra setup.

### Screen 15 - Memory Import
- Purpose: Connect/import from AI tools, files and work tools.
- Key interactions: Connect source, import file, continue/back.
- Required states: No sources; connecting; connected; failed; skipped.
- Data/API: harvest preview/commit, connector flows.
- Acceptance: Nothing imports without consent.

### Screen 16 - Memory Review
- Purpose: Review found memories, decisions, tasks, artifacts and projects.
- Key interactions: Filter, expand, edit selection, approve import, skip.
- Required states: Empty; preview found; low confidence; source error; approved.
- Data/API: POST /harvest/preview, POST /harvest/commit.
- Acceptance: Trust gate before memory becomes active.

### Screen 17 - Workspace Creation
- Purpose: Create a workspace with suggested capabilities.
- Key interactions: Enter name/type, add suggestions, review, create.
- Required states: Empty; recommended; validation error; created.
- Data/API: POST /workspaces plus recommendation service.
- Acceptance: Workspace becomes first useful context after onboarding.

### Screen 18 - Agent Builder
- Purpose: Create an agent with goal, model, autonomy, memory, skills and permissions.
- Key interactions: Configure, test, review, create.
- Required states: Draft; validation; approval needed; created.
- Data/API: POST /agents, skills/tools/MCP catalogs.
- Acceptance: No agent has hidden memory/tool access.

### Screen 19 - Skill Builder
- Purpose: Create reusable capability.
- Key interactions: Define prompt, inputs/outputs, tools, memory access, test.
- Required states: Draft; test pass/fail; published; archived.
- Data/API: POST /skills, test endpoint.
- Acceptance: Skills are inspectable and reusable by agents/automations.

### Screen 20 - Automation Builder
- Purpose: Create scheduled or event-driven workflow.
- Key interactions: Choose trigger/condition/actions/agent/notification, test, activate.
- Required states: Draft; test fail; active; scheduled; approval needed.
- Data/API: POST /automations, run/test APIs.
- Acceptance: Autonomous work has clear trigger and rollback.

### Screen 21 - Marketplace / Extend
- Purpose: Install skills, agents, connectors, MCPs, models and templates.
- Key interactions: Search, filter, install, update, approve risk, open detail.
- Required states: Available; installed; update available; risk approval; failed install.
- Data/API: Catalog + install audit APIs.
- Acceptance: Power-user extension is discoverable and governed.

## Acceptance criteria
- A returning user can open Waggle and continue their highest-priority workspace in under 30 seconds.
- A user can open Win+K from anywhere and find workspaces, memory, artifacts, agents, skills, connectors, MCPs and commands.
- A user can inspect a memory and see source, confidence, scope and available actions.
- An agent cannot run with hidden memory/tool/MCP access.
- All connector/MCP installs and elevated capabilities are approval-gated and auditable.
- Home Cockpit and Workspace Desktop are driven by server-derived workspace state, not duplicated frontend logic.
- Every major screen has loading, empty, error, offline and permission-denied states.