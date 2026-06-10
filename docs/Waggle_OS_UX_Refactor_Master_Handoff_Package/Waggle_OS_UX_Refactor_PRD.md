# Waggle OS UX Refactor PRD

**Document type:** Product Requirements Document  
**Status:** Implementation-ready draft  
**Audience:** Founder, product, design, frontend, backend, Claude Code  
**Primary repo:** `marolinik/waggle-os`  
**Product direction:** Workspace-first Agent Desktop, visible memory, always-available command layer, extensible skills/connectors/MCPs.

---

## 1. Executive Summary

Waggle OS should be refactored from an app-centric AI workspace into a **Work Intelligence OS**: a desktop-like environment that remembers work across tools, organizes it into workspaces, helps users continue the right work, and lets agents act with clear context, permissions, memory, and tools.

The new UX spine is:

1. **Home Cockpit** - the daily executive briefing and launch surface.
2. **Workspace Desktop** - the primary runtime for each bounded work context.
3. **Win+K Command Center** - universal search, launch, create, run, navigate, and extend.
4. **Visible Memory** - memory is inspectable, sourced, editable, scoped, and confidence-aware.
5. **Extend Layer** - skills, connectors, MCPs, models, and external tools are first-class, not buried in settings.
6. **Team Intelligence** - shared workspaces, shared memory, shared artifacts, shared skills, shared MCPs, and RBAC.

The core product promise:

> Waggle remembers your work, connects your tools, and helps you and your agents get the right work done.

This PRD defines the requirements, states, journeys, object models, API contracts, refactor map, and acceptance criteria needed for Claude Code and the team to implement the new UX with minimal ambiguity.

---

## 2. Product Thesis

Current AI tools are fragmented. Users work across Claude, Claude Code, Cursor, Codex, Hermes, Gmail, Calendar, Slack, GitHub, Notion, Drive, files, and internal systems. The state of work is scattered across conversations, tabs, files, repos, messages, and half-remembered decisions.

Waggle OS wins by becoming the **memory and action layer across work**:

- It captures signals from tools.
- It consolidates them into useful memory.
- It organizes them inside bounded workspaces.
- It exposes what it knows and why.
- It lets agents act safely using memory, skills, connectors, MCPs, and automations.
- It produces artifacts, not just chat replies.
- It compounds intelligence at personal, workspace, team, and organization levels.

Waggle should not feel like another chat app. Chat is one widget inside a larger work operating system.

---

## 3. Problem Statement

### 3.1 User problems

Users currently struggle with:

- Reconstructing what they were working on.
- Finding decisions made in old conversations.
- Knowing what changed while they were away.
- Moving work across AI tools without losing context.
- Keeping memory accurate and trustworthy.
- Turning conversations into durable artifacts.
- Reusing skills and tools across projects.
- Letting agents operate without giving them unsafe hidden powers.
- Working as a team without duplicating context in Slack/docs/chats.

### 3.2 Product problems

The existing product direction has powerful primitives, but the UX risks exposing too many concepts as separate apps. The current UI concepts are broad: memory, workspaces, tools, events, capabilities, mission control, settings. The target UX should collapse these into a simpler mental model:

- **Work:** Home, Workspaces, Memory, Artifacts.
- **Intelligence:** Agents, Skills, Automations.
- **Extend:** Connectors, MCPs, Models, External Tools.
- **Team:** Shared knowledge and governance.
- **Global:** Win+K.

### 3.3 Implementation risk

Without a precise PRD, the development team could interpret the designs as:

- a dashboard product,
- an app launcher,
- a chat app with sidebars,
- a marketplace product,
- a memory product,
- or an agent operations console.

The correct implementation is **workspace-first Agent Desktop with visible memory and global command access**.

---

## 4. Goals and Non-Goals

### 4.1 Product goals

1. Make Home Cockpit the daily starting point.
2. Make Workspace Desktop the primary work runtime.
3. Make Win+K available everywhere.
4. Make memory visible, editable, sourced, and confidence-aware.
5. Make artifacts first-class outcomes.
6. Make skills, connectors, MCPs, models, and external tools first-class extensions.
7. Make agents explicit about scope, memory, model, skills, tools, and autonomy.
8. Make automations visible, inspectable, pausable, and auditable.
9. Make team intelligence a shared-knowledge system, not just team chat.
10. Reuse existing backend foundations where practical.

### 4.2 UX goals

- A returning user understands what matters in under 30 seconds.
- A user can continue their most relevant workspace in one click.
- A user can find or create anything via Win+K.
- A user can inspect any memory and understand why Waggle knows it.
- A power user can extend Waggle without leaving the product.
- A team admin can see shared knowledge, permissions, and audit trails.

### 4.3 Technical goals

- Use current workspace manager and `.mind` storage foundation where possible.
- Extend current workspace state/context APIs instead of duplicating frontend logic.
- Preserve auditability for AI interactions, tools, MCPs, connectors, and agents.
- Keep local-first behavior as default where supported by current architecture.
- Avoid large backend rewrites unless required for UX correctness.

### 4.4 Non-goals for first implementation phase

- Full public marketplace billing.
- Enterprise SSO implementation from scratch.
- Full organization-wide policy engine.
- Multiplayer real-time editing of documents.
- Native mobile UX.
- Replacing Claude/Cursor/Hermes as external tools.
- Building every connector/MCP; initial catalog can be mocked or seeded.

---

## 5. Users and Personas

### 5.1 Solo founder / operator

Needs a reliable second brain across deals, fundraising, sales, product, and research. Wants morning briefing, next actions, workspace continuity, artifact generation, and memory import from AI tools.

### 5.2 Consultant / client operator

Works across multiple clients and needs hard boundaries between workspaces. Wants client-specific memory, artifacts, reports, decisions, and auditability.

### 5.3 Team lead

Needs shared context, shared artifacts, shared memory, agent delegation, and team activity visibility.

### 5.4 Power user / developer

Needs MCPs, custom skills, custom agents, external tools, local-first control, shell/code/data access, and explicit permissions.

### 5.5 Admin / security owner

Needs RBAC, audit logs, connector/MCP governance, data retention, workspace isolation, and visibility into agent/tool actions.

---

## 6. Product Principles

1. **Workspace first.** Everything important happens inside or across workspaces.
2. **Memory is visible.** Users must be able to inspect, edit, merge, archive, and delete memory.
3. **Win+K is always available.** Search, launch, run, create, navigate, and extend from anywhere.
4. **Artifacts are outcomes.** Documents, decks, spreadsheets, dashboards, research, code, media, and reports are first-class.
5. **Agents are explicit.** Every agent declares goal, scope, model, memory, tools, skills, permissions, and autonomy.
6. **Extensions are governed.** Skills, connectors, MCPs, and marketplace installs require visible trust and approval flows.
7. **Local-first by default.** Users own their data and choose what to sync/share.
8. **Team means shared intelligence.** Team mode compounds memory, artifacts, skills, MCPs, and decisions.
9. **Automation with trust.** Overnight and scheduled work is visible, explainable, stoppable, and reviewable.
10. **No hidden context.** If Waggle uses information to answer or act, the user can inspect the source.

---

## 7. North Star Metrics

### 7.1 Activation metrics

- % of new users who complete onboarding.
- % who import at least one memory source.
- % who approve memory review.
- % who create or open a workspace after onboarding.
- Time from first launch to first useful workspace.

### 7.2 Engagement metrics

- Daily active workspaces per user.
- Home Cockpit continuation rate.
- Win+K usage per active day.
- Memory searches per active day.
- Artifacts opened/created per workspace.
- Agent runs per workspace.
- Skills invoked per workspace.

### 7.3 Trust metrics

- % of memories with source/provenance.
- % of low-confidence memories reviewed.
- User edits/deletions of memory.
- Agent permission prompts accepted/denied.
- Connector/MCP install approval completion.

### 7.4 Productivity metrics

- Automations completed.
- Hours saved estimate.
- Artifacts generated.
- Tasks closed.
- Returning-user time to first action.

---

## 8. Release Scope

### Phase 0 - Architecture alignment

- Freeze IA and route names.
- Create AppShell and global navigation labels.
- Define shared frontend types.
- Map current components to new surfaces.

### Phase 1 - Core runtime

- Home Cockpit.
- Workspace Desktop.
- Win+K Command Center.
- Workspace context/state API extension.

### Phase 2 - Work layer

- Memory Center.
- Artifact Center.
- Workspace Creation.
- Onboarding flow: Welcome, Profile, Tool Discovery, Memory Import, Memory Review.

### Phase 3 - Intelligence layer

- Agent Center and Agent Builder.
- Skills Hub and Skill Builder.
- Automation Center and Automation Builder.

### Phase 4 - Extend layer

- Connector Hub.
- MCP Hub.
- Marketplace / Extend Waggle.
- Install audit and approval UX.

### Phase 5 - Team intelligence

- Team Workspace.
- Shared memory/artifacts/skills/MCPs.
- RBAC UI.
- Audit views.

---

## 9. Core Mental Model

### 9.1 System loop

```text
Capture -> Understand -> Remember -> Act -> Produce -> Learn
```

- **Capture:** Signals come from conversations, tools, files, code, email, calendar, Slack, GitHub, browser, and manual input.
- **Understand:** Waggle classifies, extracts, deduplicates, links, and scores confidence.
- **Remember:** Memory is stored as personal, workspace, team, or organization memory.
- **Act:** Agents use memory, skills, tools, connectors, MCPs, and automations.
- **Produce:** Work results become artifacts, decisions, tasks, reports, code, decks, and dashboards.
- **Learn:** Outcomes, feedback, corrections, and traces improve future context.

### 9.2 Primary object hierarchy

```text
User
  -> Home
  -> Workspaces
      -> Memory
      -> Sessions
      -> Artifacts
      -> Agents
      -> Skills
      -> Automations
      -> Connectors/MCPs
  -> Team
      -> Shared Workspaces
      -> Shared Memory
      -> Shared Artifacts
      -> Shared Skills
      -> Shared MCPs
```

---

## 10. Information Architecture

### 10.1 Global layer

- Win+K Command Center.
- Global search.
- Quick capture.
- Notifications.
- Recent/favorites.
- Global settings.

### 10.2 Work layer

- Home Cockpit.
- Workspaces.
- Memory.
- Artifacts.
- Sessions.

### 10.3 Intelligence layer

- Agents.
- Skills.
- Automations.
- Decisions / traces / evaluations where needed.

### 10.4 Extend layer

- Connectors.
- MCPs.
- Models.
- External tools.
- Marketplace.

### 10.5 Team layer

- Team workspace.
- Members.
- Roles and permissions.
- Shared memory.
- Shared artifacts.
- Shared skills.
- Shared MCPs.
- Activity and audit.

### 10.6 System layer

- Profile.
- Preferences.
- Security.
- Storage.
- Billing/plan.
- Audit logs.
- Data export/deletion.

---

## 11. Product Object Glossary

| Object | Definition | User-visible? | Notes |
|---|---|---:|---|
| Workspace | Bounded context for a project/client/research/personal area | Yes | Primary product object |
| Memory | Durable knowledge item with source, confidence, scope, and actions | Yes | Must be inspectable |
| Awareness item | Active short-term item: task/action/pending/flag | Indirect | Drives Home/Workspace state |
| Session | Conversation/work session log | Yes | Should be navigable and related to memory/artifacts |
| Artifact | Outcome: doc/deck/sheet/dashboard/research/code/media | Yes | First-class result layer |
| Agent | AI teammate with goal, model, memory, tools, skills, autonomy | Yes | Must be explicit and governed |
| Skill | Reusable capability: prompt + tools + inputs/outputs + memory access | Yes | Used by user, agents, automations |
| Connector | External data/tool integration | Yes | Gmail, Slack, GitHub, Drive, etc. |
| MCP | Model Context Protocol capability server | Yes | Power-user extension layer |
| Automation | Scheduled/event-driven workflow using triggers/actions/agents | Yes | Must be visible/stoppable |
| Team | Shared knowledge and governance boundary | Yes | Includes members, roles, shared objects |
| Command | Win+K action/search/create/run/navigate/extend item | Yes | Global interaction primitive |

---

## 12. Detailed Product Requirements

### 12.1 Home Cockpit

**Purpose:** Give the user a useful daily briefing and immediate next actions.

**User stories**

- As a returning user, I want to see what I was working on so I can continue quickly.
- As a user, I want to know what happened overnight so I can trust automations.
- As a user, I want suggested next actions based on memory, sessions, tasks, and schedules.
- As a user, I want quick capture from the home screen without opening a workspace.

**Functional requirements**

- Display greeting with user name and date/time.
- Show active/recent workspaces ranked by recency and priority.
- Show overnight summary: memories consolidated, artifacts created, automations completed, failures.
- Show upcoming meetings/events/tasks.
- Show suggested next actions.
- Show quick capture input for note/task/link/file.
- Show active models and current mode only if relevant; do not clutter.
- Provide access to Win+K hint.

**States**

- Loading.
- First-run empty.
- Normal populated.
- Attention required.
- Offline/local-only.
- Overnight failure.
- Permission denied for shared/team data.

**Acceptance criteria**

- User can understand the day in under 30 seconds.
- User can continue a workspace in one click.
- User can open Win+K from the keyboard.
- User can capture a note/task/link/file from Home.

### 12.2 Workspace Desktop

**Purpose:** Primary runtime for a bounded work context.

**User stories**

- As a user, I want all relevant context for a workspace on one screen.
- As a user, I want chat/agent interaction without losing memory/artifact/task visibility.
- As a user, I want to open artifacts, inspect memory, run skills, start automations, and manage agents.
- As a team member, I want to see who is active and what changed.

**Functional requirements**

- Header: workspace name, type, status, team/avatar stack, share controls.
- Tabs: Overview, Chat, Research/Notes, Artifacts, Memory, Tasks, Timeline, Settings.
- Main canvas widgets: AI workspace/chat, key artifacts, tasks, memory highlights, research overview, recent activity.
- Right panel: workspace info, members, last activity, quick actions.
- Bottom/status bar: agents running, automations active, MCPs connected, new widget.
- Configurable widgets in later phase; fixed default layout in initial release.

**States**

- No memory.
- Active work.
- Agent running.
- Artifact ready.
- Task blocked.
- Sync conflict.
- Permission denied.
- Offline.

**Acceptance criteria**

- Chat is one widget, not the whole product.
- Workspace state is always visible.
- User can reach memory, artifacts, agents, skills, tasks, automations, and settings from the workspace.

### 12.3 Win+K Command Center

**Purpose:** Universal command layer for search, launch, create, run, navigate, and extend.

**User stories**

- As a keyboard-first user, I want to reach any object or action instantly.
- As a new user, I want a single place to ask “what can I do?”
- As a power user, I want to install/connect/run actions without browsing settings.

**Functional requirements**

- Opens from anywhere with Win+K or Cmd+K.
- Search across workspaces, memory, artifacts, sessions, people, agents, skills, commands, connectors, MCPs.
- Category sections: Search, Launch, Create, Run, Navigate, Extend.
- Supports natural language command input.
- Displays recent and suggested actions.
- Permission-gated actions show approval prompt before execution.
- Should be accessible from mouse and keyboard.

**States**

- Idle.
- Query active.
- Grouped results.
- No results.
- Permission prompt.
- Command success.
- Command failure.

**Acceptance criteria**

- Every major object and action is reachable.
- No user needs to know where a feature lives to use it.

### 12.4 Memory Center

**Purpose:** Make memory visible, trustworthy, searchable, and editable.

**User stories**

- As a user, I want to know what Waggle remembers.
- As a user, I want to know why Waggle knows something.
- As a user, I want to edit, merge, archive, or delete memory.
- As a user, I want low-confidence or conflicting memories surfaced for review.

**Functional requirements**

- Search memory globally and within workspace/team.
- Tabs: Active, Workspace, Team, Sources, Graph, Trash.
- Filter by type, source, confidence, importance, workspace, tag, date.
- Memory detail view with content, type, source, evidence, confidence, relevance, last used, tags, timeline, connected graph.
- Actions: edit, merge, archive, delete, share, add to workspace/team.
- Show related memories and source evidence.

**States**

- Empty memory.
- Importing.
- Consolidating.
- Active.
- Low confidence.
- Conflict.
- Deprecated.
- Source unavailable.

**Acceptance criteria**

- Every memory answers: what do I know, why do I know it, where did it come from, how confident am I, can I edit it?

### 12.5 Artifact Center

**Purpose:** Organize outcomes, not just attachments.

**Functional requirements**

- Artifact categories: documents, presentations, spreadsheets, dashboards, research, code, media, designs, other.
- Search for a topic returns artifacts plus related memories, sessions, tasks, agents, and people.
- Artifact detail panel includes preview, metadata, workspace, creator, updated time, access, status, tags, related items, actions.
- Actions: open, share, duplicate, move, delete, relate to workspace/memory/session/task.

**Acceptance criteria**

- Search “Germany GTM” returns all relevant outcome objects, not just files.

### 12.6 Skills Hub and Skill Builder

**Purpose:** Make reusable capabilities explicit and composable.

**Functional requirements**

- Skills Hub tabs: My Skills, Marketplace, Custom Skills, Workspace Skills.
- Skill object fields: name, description, category, instructions, inputs, outputs, tools/data, memory access, owner, status, usage, last used.
- Skill Builder steps: Basic Info, Instructions, Inputs & Outputs, Tools & Data, Review & Create.
- Support test run before publishing.
- Skills can be assigned to agents, workspaces, automations, or used directly.

**Acceptance criteria**

- A user can understand what a skill does, where it is used, and what access it has.

### 12.7 Connector Hub

**Purpose:** Connect external tools and data.

**Functional requirements**

- Show connected connectors with status and last sync.
- Show available connectors by category.
- Show health, recent sync activity, token expiry, and errors.
- Actions: connect, sync now, manage, revoke, reconnect.
- Recommended connectors based on onboarding and workspace needs.

**Acceptance criteria**

- Users see exactly what tools are connected and whether data is flowing.

### 12.8 MCP Hub

**Purpose:** Enable power-user extension through Model Context Protocol servers.

**Functional requirements**

- Tabs: Installed, Available, Marketplace, Custom, Remote Registry.
- MCP object fields: name, description, version, status, connected to, last used, locality, risk, permissions, logs.
- Actions: install, start/stop, test, scope, view logs, revoke, add custom MCP.
- Risky MCPs require approval and audit trail.

**Acceptance criteria**

- MCPs are powerful but always visible, scoped, auditable, and reversible.

### 12.9 Agent Center and Agent Builder

**Purpose:** Manage agents as explicit work actors.

**Functional requirements**

- Agent categories: Personal, Workspace, Team, Autonomous, Templates, Archive.
- Agent card/list shows goal, status, owner, workspace, capabilities, model, success rate, last run.
- Agent Builder steps: Basic Info, Capabilities, Memory & Tools, Permissions, Review & Create.
- Agent fields: name, goal, description, persona/avatar, model, autonomy, type, memory scope, skills, connectors, MCPs, permissions, status.
- Agent safety: no hidden tool/memory access; all elevated access is reviewed.

**Acceptance criteria**

- User can explain what an agent can see and do before enabling it.

### 12.10 Automation Center and Automation Builder

**Purpose:** Manage scheduled and event-driven work.

**Functional requirements**

- Tabs: Overview, Running, Scheduled, Triggers, History, Logs.
- Automation Builder steps: Trigger, Condition, Actions, Review & Activate.
- Automation fields: name, trigger, condition, actions, agent, notification, schedule, workspace, status.
- Actions: run now, pause, edit, view logs, retry, disable.
- Failed or risky automations surface in Home Cockpit attention required.

**Acceptance criteria**

- Overnight work is visible, reviewable, and stoppable.

### 12.11 Team Workspace

**Purpose:** Shared intelligence for teams.

**Functional requirements**

- Tabs: Overview, Shared Memory, Shared Artifacts, Skills, Agents, MCPs, Automations, Settings.
- Show team spaces, metrics, members, activity, pinned items, team goals, upcoming events, team intelligence summary.
- Allow sharing memory/artifact/skill/MCP/automation into team scope subject to role.
- Support invite/member management and RBAC.

**Acceptance criteria**

- Team mode feels like shared knowledge and shared outcomes, not only members/chat.

### 12.12 Onboarding Flow

**Purpose:** Setup without overwhelming users.

**Steps**

1. First Launch - promise and privacy.
2. Who Are You - role, industry, work type, team size, goals.
3. Tool Discovery - ask which tools are used.
4. Memory Import - connect/import from AI tools, files, and work tools.
5. Memory Review - approve before importing.
6. Workspace Creation - create first useful context.
7. Home Cockpit - land with useful state.

**Acceptance criteria**

- Onboarding asks user questions, not infrastructure questions.
- Connectors/MCPs/skills are recommended from user selections.
- Nothing imports without explicit review/approval.

### 12.13 Marketplace / Extend Waggle

**Purpose:** Central extension surface.

**Functional requirements**

- Categories: Skills, Agents, Connectors, MCPs, Models, Templates.
- Search/filter/sort by category, trust, popularity, source, risk.
- Show installed, update available, risk approval, install failed.
- Install actions write to install audit.
- Support workspace/team scoping.

**Acceptance criteria**

- Power users can extend Waggle without hunting through settings.

---

## 13. User Journeys

### Journey 1 - First-time setup

1. User launches Waggle.
2. Sees First Launch promise and privacy note.
3. Clicks Continue.
4. Enters profile.
5. Selects tools used.
6. Connects/imports memory sources.
7. Reviews found memory.
8. Approves import.
9. Creates first workspace.
10. Lands in Home Cockpit with useful next action.

### Journey 2 - Skip import

1. User completes profile and tool discovery.
2. Declines import.
3. Creates workspace manually.
4. Lands in Home Cockpit empty state with suggested first actions.

### Journey 3 - Returning daily user

1. User opens Waggle.
2. Home Cockpit shows active work, overnight summary, and next actions.
3. User clicks Continue Germany GTM.
4. Workspace Desktop opens.
5. User reviews memory highlights and artifacts.
6. User runs a skill or asks the workspace agent.

### Journey 4 - Find something with Win+K

1. User presses Win+K.
2. Types “Germany pricing.”
3. Results show memories, artifacts, sessions, tasks, and agents.
4. User opens pricing model artifact.

### Journey 5 - Create memory manually

1. User opens quick capture or Memory Center.
2. Adds note/task/link/file.
3. Selects workspace and scope.
4. Memory appears as awareness/working memory.
5. Consolidation later promotes if relevant.

### Journey 6 - Review low-confidence memory

1. Home Cockpit flags low-confidence imported memory.
2. User opens Memory Center.
3. Reviews evidence and source.
4. Edits or archives memory.
5. Confidence/status updates.

### Journey 7 - Generate artifact from workspace

1. User opens Workspace Desktop.
2. Runs “Board Presentation” skill.
3. Agent uses workspace memory and artifacts.
4. Artifact is generated.
5. Artifact is linked back to memory/session/tasks.

### Journey 8 - Install connector

1. User opens Connector Hub or Marketplace.
2. Selects Gmail.
3. Reviews permissions.
4. Connects account.
5. Sync status and recent activity appear.

### Journey 9 - Install MCP

1. Power user opens MCP Hub.
2. Selects Postgres MCP.
3. Reviews risk and scope.
4. Approves installation.
5. MCP becomes available to selected workspace/agent.
6. Install audit is recorded.

### Journey 10 - Create agent

1. User opens Agent Builder.
2. Enters goal.
3. Selects model and autonomy.
4. Assigns skills, memory scope, connectors, and MCPs.
5. Reviews permissions.
6. Creates agent.
7. Agent appears in Agent Center and target workspace.

### Journey 11 - Create skill

1. User opens Skill Builder.
2. Defines purpose and instructions.
3. Defines inputs/outputs.
4. Selects tools/data/memory access.
5. Tests skill.
6. Publishes to personal/workspace/team scope.

### Journey 12 - Create automation

1. User opens Automation Builder.
2. Chooses trigger.
3. Adds condition.
4. Adds actions and agent.
5. Tests automation.
6. Activates.
7. Runs appear in Automation Center and Home overnight summary.

### Journey 13 - Invite team member

1. Owner opens Team Workspace.
2. Invites member.
3. Selects role.
4. New member sees shared workspaces/memory/artifacts based on permission.
5. Audit records invitation and access changes.

### Journey 14 - Share memory to team

1. User opens Memory Center.
2. Selects memory.
3. Chooses Share to Team.
4. Reviews scope and sensitivity.
5. Memory becomes shared team memory if allowed.

### Journey 15 - Agent needs approval

1. Agent attempts elevated action.
2. Permission prompt appears.
3. User approves/denies/modifies.
4. Decision is logged.
5. Agent continues or stops.

### Journey 16 - Automation failure

1. Scheduled automation fails overnight.
2. Home Cockpit shows attention required.
3. User opens logs.
4. User retries, pauses, or edits automation.

### Journey 17 - Search across everything

1. User opens Win+K.
2. Types natural language query.
3. Results grouped by object type.
4. User selects action/object.

### Journey 18 - Workspace creation after import

1. Memory Review finds projects.
2. User chooses Germany GTM.
3. Workspace creation screen pre-fills name/type/suggested capabilities.
4. User creates workspace.

### Journey 19 - Archive workspace

1. User opens workspace settings.
2. Chooses Archive.
3. Reviews effect on memory/artifacts/automations.
4. Workspace becomes archived, searchable but inactive.

### Journey 20 - Delete memory

1. User opens memory detail.
2. Chooses Delete.
3. Confirmation explains scope and consequences.
4. Memory is deleted or tombstoned per policy.

---

## 14. State Model

### 14.1 Global states

Every major screen must implement:

- Loading.
- Empty.
- Populated.
- Error.
- Offline/local-only.
- Syncing.
- Permission denied.
- Partial data.
- Approval required.

### 14.2 Home states

- First-run empty.
- Normal daily briefing.
- Attention required.
- Overnight failure.
- No workspaces.
- Offline.

### 14.3 Workspace states

- Empty workspace.
- Active workspace.
- Agent running.
- Task blocked.
- Artifact ready.
- Sync conflict.
- Permission denied.
- Archived.

### 14.4 Memory states

- Raw.
- Imported.
- Working.
- Consolidated.
- Active.
- Low confidence.
- Conflicting.
- Deprecated.
- Archived.
- Deleted/tombstoned.

### 14.5 Agent states

- Draft.
- Idle.
- Running.
- Paused.
- Failed.
- Waiting for approval.
- Completed.
- Archived.

### 14.6 Automation states

- Draft.
- Scheduled.
- Running.
- Success.
- Failed.
- Paused.
- Awaiting approval.
- Disabled.

### 14.7 Extension states

- Available.
- Installed.
- Update available.
- Installing.
- Failed install.
- Risk approval required.
- Disabled/revoked.

---

## 15. Data Model Requirements

### 15.1 Existing repo-aligned entities

The repo already includes or implies these data foundations:

- `identity`
- `awareness`
- `sessions`
- `memory_frames`
- `memory_frames_fts`
- `knowledge_entities`
- `knowledge_relations`
- `improvement_signals`
- `install_audit`
- `procedures`
- `ai_interactions`
- `execution_traces`
- `evolution_runs`
- `harvest_sources`
- `workspace.json`
- `workspace.mind`
- `sessions/` JSONL logs

### 15.2 Target frontend objects

```ts
type WorkspaceType = 'project' | 'client' | 'research' | 'personal' | 'team' | 'organization';
type Scope = 'personal' | 'workspace' | 'team' | 'organization';
type Confidence = number; // 0-100

type MemoryKind = 'fact' | 'decision' | 'task' | 'preference' | 'strategy' | 'learning' | 'goal' | 'entity';
type ArtifactKind = 'document' | 'presentation' | 'spreadsheet' | 'dashboard' | 'research' | 'code' | 'media' | 'design' | 'other';
type AgentType = 'personal' | 'workspace' | 'team' | 'autonomous';
type AutonomyLevel = 'manual' | 'guided' | 'medium' | 'high';
type ExtensionType = 'skill' | 'connector' | 'mcp' | 'model' | 'template' | 'external_tool';
```

### 15.3 Proposed workspace schema additions

Add if not already present:

```ts
interface WorkspaceConfigV2 {
  id: string;
  name: string;
  description?: string;
  type: WorkspaceType;
  group: string;
  icon?: string;
  status: 'active' | 'paused' | 'archived';
  model?: string;
  personaId?: string;
  templateId?: string;
  tools?: string[];
  skills?: string[];
  agentIds?: string[];
  connectorIds?: string[];
  mcpIds?: string[];
  storageType?: 'virtual' | 'local' | 'team';
  storagePath?: string;
  teamId?: string;
  teamRole?: 'owner' | 'admin' | 'member' | 'viewer';
  riskLevel?: 'minimal' | 'limited' | 'high-risk' | 'unacceptable';
  created: string;
  updatedAt: string;
  lastActiveAt?: string;
}
```

### 15.4 Proposed memory fields

Memory should expose:

- `id`
- `kind`
- `title`
- `content`
- `scope`
- `workspaceId`
- `teamId`
- `source`
- `sourceId`
- `sourceUrl/path`
- `confidence`
- `importance`
- `evidence[]`
- `tags[]`
- `relatedMemoryIds[]`
- `relatedArtifactIds[]`
- `createdAt`
- `updatedAt`
- `lastAccessedAt`
- `status`

Use `metadata` initially if schema migration is too heavy, but PRD recommends explicit fields for confidence/provenance eventually.

### 15.5 Proposed agent fields

- `id`
- `name`
- `type`
- `goal`
- `description`
- `personaId`
- `model`
- `autonomyLevel`
- `workspaceIds`
- `teamId`
- `memoryScopes`
- `skillIds`
- `connectorIds`
- `mcpIds`
- `permissions`
- `status`
- `createdBy`
- `lastRunAt`
- `successRate`

### 15.6 Proposed artifact fields

- `id`
- `title`
- `kind`
- `workspaceId`
- `teamId`
- `createdBy`
- `source`
- `status`
- `mimeType`
- `storagePath`
- `previewUrl`
- `tags[]`
- `relatedMemoryIds[]`
- `relatedSessionIds[]`
- `relatedTaskIds[]`
- `relatedAgentIds[]`
- `createdAt`
- `updatedAt`

---

## 16. API Requirements

### 16.1 Home

- `GET /api/home/briefing`
- `POST /api/quick-capture`
- `GET /api/home/overnight`

### 16.2 Workspaces

- `GET /api/workspaces`
- `POST /api/workspaces`
- `GET /api/workspaces/:id`
- `PATCH /api/workspaces/:id`
- `GET /api/workspaces/:id/state`
- `GET /api/workspaces/:id/context`
- `GET /api/workspaces/:id/activity`

### 16.3 Command Center

- `GET /api/command/search?q=`
- `POST /api/command/execute`
- `GET /api/command/recent`
- `GET /api/command/suggestions`

### 16.4 Memory

- `GET /api/memory`
- `GET /api/memory/:id`
- `POST /api/memory`
- `PATCH /api/memory/:id`
- `POST /api/memory/:id/archive`
- `DELETE /api/memory/:id`
- `POST /api/memory/merge`
- `GET /api/memory/graph`

### 16.5 Harvest

- `POST /api/harvest/preview`
- `POST /api/harvest/commit`
- `GET /api/harvest/sources`
- `POST /api/harvest/sources/:id/sync`

### 16.6 Artifacts

- `GET /api/artifacts`
- `POST /api/artifacts`
- `GET /api/artifacts/:id`
- `PATCH /api/artifacts/:id`
- `DELETE /api/artifacts/:id`
- `GET /api/artifacts/search-related?q=`

### 16.7 Agents

- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:id`
- `PATCH /api/agents/:id`
- `POST /api/agents/:id/run`
- `POST /api/agents/:id/pause`
- `GET /api/agents/:id/traces`

### 16.8 Skills

- `GET /api/skills`
- `POST /api/skills`
- `PATCH /api/skills/:id`
- `POST /api/skills/:id/test`
- `POST /api/skills/:id/install`

### 16.9 Connectors/MCPs/Marketplace

- `GET /api/connectors`
- `POST /api/connectors/:id/connect`
- `POST /api/connectors/:id/sync`
- `POST /api/connectors/:id/revoke`
- `GET /api/mcps`
- `POST /api/mcps/install`
- `POST /api/mcps/:id/test`
- `POST /api/mcps/:id/revoke`
- `GET /api/marketplace`
- `POST /api/marketplace/install`

### 16.10 Automations

- `GET /api/automations`
- `POST /api/automations`
- `PATCH /api/automations/:id`
- `POST /api/automations/:id/run`
- `POST /api/automations/:id/pause`
- `GET /api/automations/:id/logs`

### 16.11 Team/RBAC

- `GET /api/teams/:id`
- `POST /api/teams/:id/invite`
- `PATCH /api/teams/:id/members/:memberId`
- `GET /api/teams/:id/audit`
- `POST /api/share`

---

## 17. RBAC and Permissions

### 17.1 Scopes

- Personal.
- Workspace.
- Team.
- Organization.

### 17.2 Roles

| Role | Can view | Can create | Can share | Can manage people | Can install extensions | Can manage security |
|---|---|---|---|---|---|---|
| Owner | All | Yes | Yes | Yes | Yes | Yes |
| Admin | Most | Yes | Yes | Yes | Yes, with policy | Limited |
| Contributor | Assigned | Yes | With approval | No | No or approval | No |
| Viewer | Assigned | No | No | No | No | No |

### 17.3 Permission principles

- Agents inherit the minimum permissions required by assigned scope.
- MCPs require explicit scope: personal/workspace/team.
- Connectors require consent and revocation path.
- Automations can only run actions allowed by the user/team role.
- Shared memories/artifacts must display scope and access.
- Elevated actions require human approval.

---

## 18. Security, Privacy, and Compliance Requirements

### 18.1 Security requirements

- Local-first storage default where supported.
- User-controlled sync and sharing.
- Workspace-level isolation.
- Team RBAC.
- Connector/MCP install audit.
- Agent permission declarations.
- Append-only audit for AI interactions and sensitive actions.
- Approval class for elevated/critical capabilities.
- Clear revoke/delete/export actions.

### 18.2 Privacy requirements

- No memory import without review/approval.
- No connector sync without consent.
- No agent hidden access.
- Memory source and scope must be visible.
- Team sharing requires explicit scope.
- User must be able to archive/delete memory.

### 18.3 Compliance requirements

- AI interactions should record provider/model, input/output, tools, human action, risk context, workspace/session/persona.
- High-risk workspaces should surface risk level and stronger approvals.
- Audit logs should be immutable or append-only where feasible.

---

## 19. Design System Requirements

### 19.1 Core components

- AppShell.
- Primary navigation.
- Workspace switcher.
- Command Center modal.
- Cards: workspace, memory, artifact, agent, skill, connector, MCP, automation.
- Status badges.
- Confidence badges.
- Source/evidence chips.
- Timeline.
- Activity feed.
- Detail drawer.
- Builder stepper.
- Approval prompt.
- Empty state.
- Error state.
- Skeleton loader.
- Table/list/grid view toggle.

### 19.2 Interaction patterns

- All primary screens support search.
- All primary objects support detail view.
- Risky actions show confirmation/approval.
- Create flows use stepper patterns.
- Power features are accessible but not forced during onboarding.
- Win+K is available everywhere.

### 19.3 Accessibility

- Full keyboard support.
- Visible focus states.
- ARIA labels for command palette and builders.
- Sufficient contrast for dark theme.
- Non-color indicators for status.
- Screen reader friendly tables/lists.

---

## 20. Technical Refactor Map

### 20.1 Keep and promote

- `WorkspaceBriefing.tsx` -> seed for Home Cockpit widgets.
- `workspace-state.ts` -> extend as backend state builder.
- `workspace-context.ts` -> expand contract for Home/Workspace screens.
- `WorkspaceManager` -> keep; add fields only as needed.
- `.mind` schema -> keep; migrate carefully for explicit confidence/provenance if needed.

### 20.2 Rework

- `MemoryApp.tsx` -> Memory Center.
- App surfaces -> Work/Intelligence/Extend categories.
- Onboarding wizard -> simplify to user-oriented 5-step setup plus workspace creation.
- Types -> update AppView, WorkspaceContext, MemoryFrame, Agent, Skill, Connector, MCP.

### 20.3 Create

- `HomeCockpit`.
- `WorkspaceDesktop`.
- `CommandCenter`.
- `ArtifactCenter`.
- `SkillBuilder`.
- `AgentBuilder`.
- `AutomationBuilder`.
- `MarketplaceExtend`.
- `TeamWorkspace`.
- `RBAC/Audit` components.

### 20.4 Avoid

- Do not add more top-level apps without fitting IA.
- Do not duplicate backend state calculation in frontend.
- Do not hide connectors/MCPs in Settings.
- Do not default to blank chat on launch.
- Do not allow agents or automations to gain hidden access.

---

## 21. Implementation Roadmap

### Sprint 1 - Shell and IA

- AppShell navigation.
- Route map.
- Shared types.
- Command provider skeleton.
- Feature flags if needed.

### Sprint 2 - Home and workspace state

- Extend workspace context/state API.
- Home Cockpit.
- Workspace Desktop overview.
- Quick capture.

### Sprint 3 - Command Center

- Indexed search provider.
- Result groups.
- Command execution.
- Recent/suggested commands.

### Sprint 4 - Memory and artifacts

- Memory Center.
- Artifact Center.
- Related object search.
- Detail drawers.

### Sprint 5 - Onboarding and workspace creation

- First Launch.
- Who Are You.
- Tool Discovery.
- Memory Import.
- Memory Review.
- Workspace Creation.

### Sprint 6 - Intelligence layer

- Agent Center.
- Agent Builder.
- Skills Hub.
- Skill Builder.
- Automation Center.
- Automation Builder.

### Sprint 7 - Extend layer

- Connector Hub.
- MCP Hub.
- Marketplace / Extend.
- Install audit UI.

### Sprint 8 - Team and governance

- Team Workspace.
- RBAC.
- Shared objects.
- Audit/activity views.

### Sprint 9 - Hardening

- Empty/error/offline states.
- Permissions.
- Accessibility.
- Tests.
- Performance.
- Visual polish.

---

## 22. Testing and Acceptance

### 22.1 Product acceptance

- User can complete onboarding without understanding MCPs/connectors/skills jargon.
- User can land in Home Cockpit and continue useful work.
- User can use Win+K to find and run all major actions.
- User can inspect and edit memory.
- User can create a workspace, agent, skill, and automation.
- User can install/revoke connector/MCP with audit trail.
- Team user can share memory/artifact with role-appropriate permissions.

### 22.2 Technical acceptance

- No major screen depends only on mocked data when backend support exists.
- New components have loading/empty/error/offline/permission states.
- Sensitive actions are approval-gated.
- State derivation is centralized in backend where practical.
- Frontend types are consistent with API contracts.
- Existing memory/workspace foundations are reused.

### 22.3 QA scenarios

- Fresh install, no memory.
- Fresh install, import skipped.
- Fresh install, import approved.
- Returning user with active workspaces.
- Returning user with overnight failures.
- Offline mode.
- Permission denied team workspace.
- Agent approval required.
- MCP install risk approval.
- Low-confidence memory review.

---

## 23. Open Questions

1. Should the first release support true widget customization in Workspace Desktop, or fixed layout only?
2. Should Home Cockpit be personal-only or also support team/global views?
3. Should Memory Center expose graph view in v1 or only later?
4. Which connectors/MCPs are real in v1 vs seeded/mock catalog entries?
5. How much of marketplace is local catalog vs remote registry initially?
6. Should artifacts be stored in current workspace filesystem, virtual store, or external references first?
7. What is the minimum viable RBAC implementation for team mode?
8. What exact retention/delete/tombstone behavior is required for memory?

---

## 24. Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| UX becomes too complex | High | Keep Home/Workspace/Win+K as spine; hide power features until needed |
| Backend not ready for all screens | Medium | Use existing foundations, thin adapters, mock catalog entries only where safe |
| Memory trust issues | High | Source, confidence, evidence, review, edit/delete flows |
| Agent safety concerns | High | Explicit permissions, approval prompts, audit logs |
| Marketplace scope creep | Medium | Start with catalog + install audit, postpone billing/public marketplace |
| Team RBAC complexity | Medium | Implement simple role model first |
| Performance of global search | Medium | Start with local indexed providers and async result groups |
| Visual mocks overfit implementation | Medium | Use PRD acceptance criteria over pixel perfection |

---

## 25. Claude Code Implementation Prompt

Use this prompt when starting implementation:

```text
You are implementing the Waggle OS UX refactor. The product must become a workspace-first Agent Desktop, not an app launcher and not a chat-first product. The new UX spine is Home Cockpit, Workspace Desktop, Win+K Command Center, visible Memory, Artifacts, Agents, Skills, Automations, and an Extend layer for Connectors/MCPs/Marketplace.

First inspect these files:
- apps/web/src/components/os/WorkspaceBriefing.tsx
- packages/server/src/local/workspace-state.ts
- packages/server/src/local/routes/workspace-context.ts
- packages/hive-mind-core/src/workspace-manager.ts
- packages/hive-mind-core/src/mind/schema.ts
- apps/web/src/lib/types.ts
- apps/web/src/components/os/overlays/OnboardingWizard.tsx
- apps/web/src/components/os/apps/MemoryApp.tsx
- packages/core/src/install-audit.ts
- packages/agent/src/tools.ts
- packages/memory-mcp

Implement in this order:
1. AppShell and route IA.
2. Command Center provider and UI.
3. Home Cockpit from WorkspaceBriefing/workspace-state foundations.
4. Workspace Desktop from workspace context/state.
5. Memory Center and Artifact Center.
6. Onboarding and Workspace Creation.
7. Agent/Skill/Automation builders.
8. Connector/MCP/Marketplace surfaces.
9. Team/RBAC/audit surfaces.
10. Empty/loading/error/offline/permission states.

Rules:
- Workspace is the primary object.
- Win+K must be global.
- Memory must show source/confidence/scope/actions.
- Agents must declare memory/tools/skills/model/autonomy.
- Connectors and MCPs require visible trust and approval flows.
- Do not duplicate backend state logic in frontend if workspace-state can be extended.
```

---

## 26. Definition of Done

The UX refactor is done when:

1. Home Cockpit replaces blank-chat launch behavior.
2. Workspace Desktop is the default runtime for workspace work.
3. Win+K can search, launch, create, run, navigate, and extend.
4. Memory Center exposes source, confidence, evidence, scope, and edit/delete actions.
5. Artifact Center supports outcome search and related objects.
6. Onboarding leads from profile/tool discovery/import/review to first workspace.
7. Agents, skills, automations, connectors, MCPs, and marketplace have coherent IA.
8. Team workspace supports shared intelligence and roles.
9. Sensitive actions are approval-gated and audited.
10. All screens have required states.
11. Claude Code can continue implementation from this PRD without needing product interpretation.
