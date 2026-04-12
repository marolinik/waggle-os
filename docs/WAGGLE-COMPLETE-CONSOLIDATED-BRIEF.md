# Waggle OS — Complete Consolidated Strategic Brief
## Every Item From Every Document — Nothing Omitted
**Date:** April 2026 | **Sources:** 8 documents synthesized
**Purpose:** Full context for continued M2+ execution in a new chat

---

## DOCUMENT INVENTORY

| # | Document | Items Extracted |
|---|----------|----------------|
| 1 | SENTINEL-DAEMON-SPEC.md | Sentinel daemon (3 phases, 12 API endpoints, config, tier access, privacy firewall) |
| 2 | cowork-vs-waggle-strategic-analysis | 12 strategic recommendations + Cowork system prompt architecture |
| 3 | competitive-intel-claude-skills-ecosystem | 10 patterns/features to steal + 4 anti-patterns to avoid |
| 4 | pai-strategic-analysis (Miessler PAI v4) | 10 concepts + CLI connector layer (comprehensive 3-tier design) |
| 5 | WAGGLE-OS-CATCHUP-SCOPE | 4 P0s, 5 P1s, 6 P2s, 2 P3s, 6 P4s + frontend hygiene (11 items) |
| 6 | cowork-department-prompts-analysis | 7 patterns + 6 department templates + 13 concrete features |
| 7 | waggle-os-user-evaluation (4 perspectives) | 11 bugs (B1-B11) + 15 improvements (I1-I15) |
| 8 | waggle-os-test-report (42 findings) | 5 P0s, 10 P1s, 13 P2s, 14 P3s |

---

## PART 1: WHAT'S DONE (M1 Sprint — 10 Sessions)

Everything marked ✅ is fully resolved. Do not re-implement.

### Bugs Fixed
| ID | Finding | Session |
|----|---------|---------|
| B1/P0-1 | Waggle Dance crashes app to black screen | ✅ S1 (ErrorBoundary + useWaggleDance guard) |
| B2/P0-1 | Window close button non-functional | ✅ S1 (was already wired; hit area 12→24px) |
| B3 | Escape key doesn't close windows | ✅ S1 (isFocused prop + keydown listener) |
| B4 | Profile icon produces no window | ✅ S2 (fetchWithTimeout fixed hanging fetch) |
| B5 | Vault icon produces no window | ✅ S2 (same root cause) |
| B7 | Agent detail panel shows TOOLS (0) | Checked — may need reverification post-Session 5 |
| B8 | Memory content shows raw markdown | ✅ S6 (renderSimpleMarkdown) |
| B9 | HTML entities not decoded in Events | ✅ S6 (decodeHtmlEntities) |
| B10 | Connectors panel semi-transparent | ✅ S6 (bg-background) |
| B11 | Token count disappears intermittently | Checked — may need reverification |
| P0-2 | API requests hang indefinitely (no timeout) | ✅ S2 (fetchWithTimeout + TypedErrors) |
| P0-3 | Silent error handling throughout codebase | ✅ S2 (11 hooks + adapter fixed) |
| P0-4 | Chat stuck on "Loading workspace..." offline | ✅ S2 (offline states in 4 views) |
| P0-5 | Connectors infinite spinner offline | ✅ S2 (offline state + retry) |
| P1-1 | App.tsx god component | ✅ S10 (Desktop.tsx 599→280, NOT App.tsx which was 31 lines) |
| P1-2 | No error boundaries | ✅ S1 (AppErrorBoundary wraps every app) |
| P1-3 | React Router v7 deprecation warnings | ✅ S6 (future flags) |
| P1-8 | Agent system prompt contamination (disclaimers) | ✅ S3 (4-layer decontamination) |
| P1-9 | 42 React duplicate key errors | ✅ S6 (composite keys) |
| P1-10 | Close button unreliable click target | ✅ S1 (24px hit area) |

### Improvements Implemented
| ID | Improvement | Session |
|----|-------------|---------|
| I1 | Frontend tier-gating (hide/lock features per tier) | ✅ S8 (feature-gates + LockedFeature + persona/workspace/settings gating) |
| I2 | Reduce dock to curated icons + overflow | ✅ S5 (tier-based dock: Simple 5, Professional 7, Power full + zone trays) |
| I3 | Window management (minimize, window list, focus) | ✅ S4 (minimize/restore, Ctrl+W, Ctrl+Shift+M, z-index management) |
| I4 | Keyboard shortcuts (Cmd+K, Ctrl+W, etc.) | ✅ S4+S5 (Ctrl+W close, Ctrl+Shift+M minimize, Ctrl+` cycle, Ctrl+K palette expanded to 12 commands) |
| I11 | Add explanation to "Degraded" health status | ✅ S6 (service-level breakdown) |
| I15 | Persist window positions per app | ✅ S4 (localStorage persistence on drag/resize) |

### Infrastructure Fixed
| Item | Session |
|------|---------|
| 77 TypeScript errors → 0 across monorepo | ✅ S2.5 |
| Build chain: shared → core → agent → server | ✅ S2.5 (build:packages + build:all scripts) |
| ARIA labels on dock, window controls, status bar | ✅ S10 |
| Desktop.tsx decomposition (useWindowManager + useOverlayState) | ✅ S10 |
| localStorage namespace audit (2 bare keys fixed) | ✅ S10 |
| Production Vite build passes (4.35s) | ✅ S10 |
| Behavioral spec extracted to versioned file (v2.0) | ✅ S7 |
| System prompt token monitoring (console log + 12K warning) | ✅ S7 |
| SubagentOrchestrator parent context injection | ✅ S7 |
| autoSaveFromExchange false positive guards | ✅ S7 |
| Notification inbox improved empty state | ✅ S9 |
| ContextMenu component (reusable, keyboard-navigable) | ✅ S9 |
| MemoryApp right-click context menu | ✅ S9 |
| Memory accessCount increment on view | ✅ S6 |
| Onboarding tier selection step (Simple/Professional/Power) | ✅ S5 |
| DockTray popover for zone-parents | ✅ S5 |
| 3 placeholder apps (ScheduledJobs, Marketplace, Voice) | ✅ S5 |
| Settings Dock Experience dropdown | ✅ S5 |

---

## PART 2: M2 CONFIRMED PLAN (Weeks 1-4)

These items have confirmed decisions. Ready for execution.

| # | Item | Decision | Timeline |
|---|------|----------|----------|
| M2-1 | Real embedding provider | Both: Ollama default + API fallback | Week 1-2 |
| M2-2 | Stripe subscription + license activation | Stripe Checkout + Webhooks + Customer Portal | Week 1-3 |
| M2-3 | Tauri desktop builds | Both Windows (.exe NSIS) + macOS (.dmg) | Week 1-2 |
| M2-4 | Landing page + pricing | Solo free / Teams $29 / Business $79 | Week 1 |
| M2-5 | Onboarding first-5-minutes polish | Guided first conversation + template-seeded workspaces | Week 2 |
| M2-6 | Keyboard power user flow | Cmd+K fuzzy search across workspaces/memories/files, slash command autocomplete | Week 3 |
| M2-7 | Basic telemetry | Local SQLite, privacy-first, opt-in metrics | Week 2 |
| M2-8 | Beta program | 10→50 users, free Teams for 30 days, structured feedback | Week 2-4 |

---

## PART 3: EVERY NET-NEW ITEM FROM ALL 6 DOCUMENTS

Organized by document source, with cross-references where multiple documents identify the same item. Items are numbered globally (N1-N55) for unique reference.

### From SENTINEL-DAEMON-SPEC.md

**N1. Sentinel Daemon — Phase 1: Observer**
- Register as system agent in agent registry
- Subscribe to Events stream (agent.response, agent.error, user.message, user.feedback, skill.invocation, skill.failure, connector.request, session.start, session.end)
- Detect: user corrections (highest signal), coverage gaps (medium), quality signals (cumulative), positive signals (validate what works)
- 12 signal types: USER_EDIT, USER_REDIRECT, USER_RETRY, MANUAL_WORKAROUND, SKILL_NOT_FOUND, CONNECTOR_MISSING, LOW_CONFIDENCE, AGENT_FAILURE, REPEATED_INSTRUCTIONS, USER_APPROVAL, FIRST_ATTEMPT_SUCCESS, SKILL_REUSE
- Write observations to Memory graph as `sentinel_observation` frames with full schema (id, signalType, severity, context, issue, suggestedImprovement, principle, recurrenceCount, status, classification, confidenceScore)
- Detection heuristics: negation language, semantic similarity >0.85 for retries, multi-step manual workflows, external tool references
- Add "Sentinel" filter to Memory view
- Add observation count widget to Dashboard
- Zero prompt overhead (background process)
- Effort: 3-4 sessions | Priority: M3

**N2. Sentinel Daemon — Phase 2: Analyzer**
- Scheduled review cycles: micro (4h), daily (02:00), weekly (Monday 06:00), threshold trigger (10+ observations in single session)
- Pattern detection algorithm: same skill/same issue → merge; same skill/different issues → group; different skills/same principle → cross-cutting; 3+ recurring gaps → new skill candidate
- Confidence scoring: recurrence×0.4 + severity×0.3 + crossAgentConfirmation×0.2 + recency×0.1; promotion threshold ≥0.7
- Cross-cutting principles: when same principle appears in 3+ skills, extract and inject into ALL agent contexts at workspace level
- "System Intelligence" Dashboard widget with proposal cards (observation count, confidence, first/last seen, estimated impact)
- Sentinel tab in Mission Control with observation timeline, approve/dismiss/defer actions
- Sentinel health metrics in Cockpit (uptime, queue depth, analysis duration, approval rate)
- Effort: 3-4 sessions | Priority: M3

**N3. Sentinel Daemon — Phase 3: Promoter**
- Promotion pipeline: Observation → Pattern → Proposal → Approved → Applied → Verified
- Proposal card schema: title, type (skill_improvement/new_skill/cross_cutting_principle/agent_config), before/after diff preview, estimated impact, affected agents
- Skill modification engine: auto-apply approved proposals to skill definitions
- Post-application verification: track if improvement actually reduced corrections within 2 weeks
- Self-observation: Sentinel tracks its own approval rate as objective quality metric
- Privacy firewall: 4-layer PII stripping (observation-level, pre-creation, post-draft, structural principle)
- Effort: 2-3 sessions | Priority: M3+

**N4. Sentinel API Endpoints (12 routes)**
- GET /api/sentinel/status, /observations, /observations/:id, /proposals, /proposals/:id, /principles, /metrics
- POST /proposals/:id/approve, /dismiss, /defer
- POST /config, /trigger-review

**N5. Sentinel Configuration UI**
- Settings section: enabled, observationSensitivity (conservative/balanced/aggressive), microReviewInterval, daily/weekly review enabled, confidenceThreshold, autoApplyApproved, notifications (new proposal, weekly report), allowOpenSourceClassification, piiStrictMode
- Tier access: Simple users → enable/disable only; Power → view proposals + export; Admin → approve/dismiss + configure + sensitivity

### From cowork-vs-waggle-strategic-analysis

**N6. Auto-Context Injection Engine** *(also in CATCHUP-SCOPE P0-3, Dept Prompts Pattern 1+7)*
- Before every agent interaction: inject My Profile (identity, writing style, brand, interests), top-N relevant memory frames (by importance + recency), active workspace context from Mission Control
- Implement as middleware in agent request pipeline (not per-agent prompt hacking)
- Configurable: admin controls what gets injected and token budget
- Invisible to user — no "reading your profile" messages
- THE #1 community-validated pattern. What Cowork users spend 30 min configuring manually.
- Priority: M2 extension (Week 5-6) | Depends on: real embeddings

**N7. Guided Identity Builder (Interview Mode)** *(also in CATCHUP-SCOPE P1-1, PAI #1)*
- Replace passive form-filling in My Profile with AI-guided interview
- Agent asks 8-10 targeted questions: role, audience, daily decisions, quality standards, working style, tools used
- Synthesizes answers into structured profile stored as graph memory (not raw markdown)
- Default onboarding experience for new users
- Allow re-interview to update (not just manual edit)
- Community insight: self-written profiles are "LinkedIn bios" — AI interviews produce 10x better context
- Priority: M2 extension (Week 6-7)

**N8. Feedback Capture → Learning Loop** *(also in CATCHUP-SCOPE P1-2, PAI #2, Sentinel spec)*
- Thumbs-up/thumbs-down + optional comment on every agent response in Chat
- Store as `feedback` event type in Events stream
- Link to: agent ID, skill ID, task type, session
- Dashboard widget: agent performance trends (approval rate over time, by persona)
- Feed into Sentinel Phase 2 for automated pattern detection
- Priority: M2 extension (Week 5)

**N9. Read-Before-Execute Skill Pattern** *(from Cowork system prompt)*
- When agent is about to perform a task (create doc, analyze data, generate report), first consult relevant skill definitions
- "Read the manual before you work" pattern — improves output quality
- System reads SKILL.md before any file creation or code execution
- Priority: M3

**N10. Task Progress Widget** *(also in CATCHUP-SCOPE P2-3)*
- Surface agent work as structured task list: pending → in_progress → completed
- Show in Chat view sidebar during active agent execution
- Also available in Dashboard as "Active Tasks" widget
- Each task: description, elapsed time, sub-steps if applicable
- Trust mechanism — users who see what agent is doing trust it more and interrupt less
- Priority: M3

**N11. Connector Recipe Templates** *(also in CATCHUP-SCOPE P2-2, Competitive Intel #3)*
- For each connector (32), ship 3-5 pre-built automation recipes
- "Connect to Slack" becomes "Monitor #support for keywords → create Jira ticket"
- Surface in Skills & Apps as "Starter Recipes" when connector is configured
- Recipes chain connector actions into workflows (trigger → process → output)
- One-click activate with configurable parameters
- Priority: M3

**N12. Role-Based Plugin Bundles**
- Package skills and connectors into role-specific starter kits
- Executive, Sales, Marketing, Engineering, Legal, Finance
- Each bundle pre-configures agents, connectors, ground rules for that role
- One-click selection during onboarding
- Priority: M2 extension (part of Department Templates)

**N13. Self-Improving Agent Loop (Memory → Skill Promotion)** *(covered by Sentinel)*
- Memory frames that recur → promoted to skills automatically
- Nobody else has a UI for this
- Covered by Sentinel Phase 2+3

**N14. Progressive Context Refinement for Spawned Agents** *(also in Competitive Intel #2)*
- Sub-agents start lean, pull context on-demand from memory graph
- Instead of inheriting full parent context (token-expensive), retrieve as needed
- Session 7 added parent context injection (~100 tokens); this extends to on-demand retrieval
- Depends on real embeddings for semantic context retrieval
- Priority: M3+

**N15. Portable Identity Export**
- Export entire Waggle profile (identity, memory, agent configs, connector settings) as single encrypted package
- Import on another machine or share with team
- Essential for enterprise deployment and machine migration
- Priority: M3

### From competitive-intel-claude-skills-ecosystem

**N16. Skill Security Auditor**
- Scan community-submitted skills for: command injection, arbitrary code execution, data exfiltration, prompt injection, supply chain risks
- Security rating visible in Skills & Apps view
- Gate behind admin approval for enterprise
- Essential before opening community skill marketplace
- Priority: M3 (before marketplace opens)

**N17. Tapestry-Style Knowledge Networks (Memory Explorer)**
- Auto-interlink related documents/memories into navigable knowledge graph
- Visual graph where users see how knowledge connects and discover non-obvious relationships
- "Memory Explorer" view — visual graph UI
- Waggle already has graph database backing; this adds the visualization and auto-linking layer
- Priority: M3+

**N18. Confidence Scoring on Agent Outputs** *(also in CATCHUP-SCOPE P2-6)*
- Add `confidence` field to agent response schema (high/medium/low + reasoning)
- Display as subtle indicator in Chat view (green/amber/red dot)
- Factor in: data freshness, source authority, pattern match strength, memory support
- Aggregate in Dashboard: "X% of outputs this week were high-confidence"
- Feeds into Sentinel for quality signal detection
- Priority: M3

**N19. n8n Workflow Integration** *(Watch only)*
- Skills that let agents understand and operate n8n workflows
- Potentially relevant if Waggle builds visual workflow builder
- Not urgent — watch for now

**N20. Obsidian/Notion Interoperability** *(Watch only)*
- Bridge agent memory with existing knowledge management tools
- Relevant for power user tier
- Not urgent — watch for now

### Anti-Patterns to Avoid (from Competitive Intel)
- **No CLI-only configuration** — Waggle's advantage is GUI
- **No monolithic skill files** — modular, individually installable
- **No unsandboxed tool execution** — sandbox every skill
- **Memory with forgetting** — implement decay/archive for old unaccessed memories

### From PAI Strategic Analysis (Miessler PAI v4)

**N21. TELOS Identity System** *(extends N7 Guided Identity Builder)*
- 10 structured identity layers: MISSION, GOALS, PROJECTS, BELIEFS, MODELS, STRATEGIES, NARRATIVES, LEARNED, CHALLENGES, IDEAS
- Every agent interaction reads this context
- Dual-mode: Personal TELOS (who am I) + Project TELOS (what is this project about)
- Automatic timestamped backups before any identity modification
- Extend My Profile into full structured identity system
- Priority: M3 (strategic moat)

**N22. Hook-Driven Lifecycle Automation** *(also in CATCHUP-SCOPE P4-2, Competitive Intel #5)*
- Make Events stream actionable with user-configurable hooks
- Taxonomy: on_session_start, on_task_complete, on_agent_spawn, on_error, on_schedule_trigger
- Users attach automations: "When task completes → notify", "When memory threshold → compact"
- Visual "if this, then that" in Settings
- Start with 5 built-in hooks, expose custom later
- Scheduled Jobs are a special case (hook triggered by time)
- Priority: M3

**N23. USER/SYSTEM Data Separation** *(also in CATCHUP-SCOPE P4-3)*
- Clean boundary: user data (profile, memory, configs) survives any system upgrade
- Portable identity export as single package
- Essential for Tauri desktop auto-updates
- Define app-data directory that updater never touches; system code in app bundle
- Session 10 namespaced localStorage keys (partial); full boundary not yet formalized
- Priority: M2 (architecture decision needed before shipping Tauri builds)

**N24. Security-by-Default (Agent Sandboxing)** *(extends N30 Agent Permission Scopes)*
- Default-on security: validate commands before execution, SSRF protection, input sanitization
- Agent sandboxing: define what each agent CAN access (files, connectors, APIs) and enforce
- Pre-commit-style validation for sensitive data before stored/transmitted
- Elevate existing Approval Gates (useApprovalGates.ts) to first-class security feature
- Vault as central secret store with audit logging
- Security events surfaced in Events stream
- Priority: M3 (enterprise gate)

**N25. Packs System / Marketplace Architecture** *(extends CATCHUP-SCOPE P4-4)*
- Standardized pack manifest: what it does, what it needs (connectors, permissions, models), how to verify
- AI-assisted installation: agent reads install guide → asks for API keys → configures → verifies
- Post-install verification step (VERIFY.md equivalent): confirms pack actually works
- "App Store" view that reads manifests, handles installation, shows verification status
- Community-contributed packs as adoption flywheel
- Priority: M3+

**N26. Task Classification Hierarchy ("Goal → Code → CLI → Prompts → Agents")**
- Not everything needs an agent. Deterministic tasks → direct tool execution. Complex tasks → full agent reasoning.
- Agent self-routing: rename a file → tool call, not reasoning chain
- Surface in Cockpit: "efficiency metrics" — deterministic vs full-agent task split
- Reduces token costs, improves speed, increases reliability
- Priority: M3

**N27. Voice Integration** *(VoiceApp placeholder exists from Session 5)*
- TTS service (ElevenLabs or local for air-gapped)
- Duration-aware routing: short notifications → voice, long content → text
- Voice toggle in Settings
- Wire to hook system (agent completion → spoken notification)
- Consistent voice identity for non-technical users
- Priority: M3+

**N28. McKinsey-Style Report Generation**
- "Generate Report" action in Cockpit
- Professional reports from system data: agent performance, event summaries, memory insights, feedback trends
- Template-based HTML generation → export to PDF
- Weekly executive summary for CxO users
- Justifies AI ROI to leadership
- Priority: M3

**N29. CLI Connector Layer (Comprehensive 3-Tier Design)**
- **Discovery Engine:** Background scan detecting available CLI tools on host machine (gh, docker, aws, kubectl, terraform, vercel, stripe, etc.)
- **Execution Runtime:** Standard interface for agents to request CLI execution through controlled pipeline
- **Permission/Sandboxing:** Allowlist, approval gates for destructive commands, argument sanitization
- **Simple Users:** Never see it — agent silently invokes CLI, result surfaces as Event card
- **Power Users:** "CLI Tools" panel in Settings — enable/disable tools, authentication config, CLI recipes (chained commands → reusable Skills), execution logs in Events
- **Admins (Mission Control):** Allowlist/blocklist management, real-time CLI activity monitoring, security audit trail, anomaly detection, per-agent permission scoping
- **Fabric integration:** 242+ AI patterns available as Skills out of the box
- **Strategic value:** Universal adapter for any tool on the machine. Critical for air-gapped enterprise where outbound API calls are restricted.
- This is Waggle's **fourth connector type** alongside native API, MCP, and webhook connectors
- Priority: M3 (medium-high effort, very high impact)

### From WAGGLE-OS-CATCHUP-SCOPE

**N30. Agent Permission Scopes** *(also in PAI #5, Dept Prompts Pattern 4)*
- Permission levels: `read-only`, `write-to-output`, `full-access`
- Assign per agent in agent configuration
- Enforce at API level (agent physically cannot write outside scope)
- Visual badge on agent cards (lock icon variants)
- Admin override for trusted agents
- Audit log: every write operation logged with agent ID + permission check result
- Priority: M3

**N31. Department Agent Templates + Starter Recipes** *(also in Dept Prompts Part 2)*
- 6 pre-configured templates: Finance, Marketing, Operations, HR, Legal, Research
- Each includes: agent persona, default skills, suggested connectors, 3-5 starter recipes
- Specific recipes per department:
  - Finance: monthly reconciliation, expense categorization, subscription audit
  - Marketing: weekly content calendar, competitive positioning update, content repurposing batch
  - Operations: morning briefing, project status consolidation, SOP audit
  - HR: onboarding package generator, job posting optimizer, interview prep kit
  - Legal: contract comparison with risk scoring, NDA triage, compliance checklist
  - Research: deep research synthesis, executive industry briefing, investment due diligence
- Template selection during onboarding or via Mission Control → Spawn
- Priority: M2 extension (Week 7-8)

**N32. Scheduled Agent Daemons** *(also in Dept Prompts Pattern 5)*
- Cron-like scheduled task execution engine
- UI in ScheduledJobsApp (placeholder exists from Session 5)
- Create/edit/delete/pause scheduled agents
- Each schedule: agent + task prompt + input sources + output destination + frequency
- Execution results in Dashboard as cards + history (past runs, outputs, success/failure)
- 3 built-in templates: Morning Briefing, Weekly Status Report, Memory Cleanup
- Server already has cron infrastructure in packages/server/src/scheduler/
- Priority: M3

**N33. Connector Recipe Templates** *(same as N11)*

**N34. Task Progress Widget** *(same as N10)*

**N35. Visual Workflow Builder**
- Drag-and-drop workflow editor in Mission Control
- Nodes: agent steps, skill invocations, connector actions, conditionals, outputs
- Edges: data flow between steps
- Save as reusable template, run manually or attach to schedule
- Start simple (linear chains), add branching in v2
- Priority: M3+

**N36. Output Templates & Dual-Output Standard**
- Pre-defined output schemas per task type (status report, analysis, content calendar, etc.)
- Dual-output: narrative report + machine-readable checklist/CSV
- Agent auto-selects format based on task type (configurable override)
- Templates stored in Skills & Apps, editable by power users
- Priority: M3

**N37. Confidence Scoring** *(same as N18)*

**N38. Async Task Queue (Dispatch Equivalent)**
- Submit task → agent executes in background → result surfaces in Dashboard
- Web-based task submission endpoint (enables future mobile companion)
- Task states: queued → executing → completed → reviewed
- Desktop notification on completion
- Queue visible in Mission Control with cancel/pause/priority
- Phase 2: Mobile companion (React Native or PWA)
- Competitive response to Anthropic Dispatch (March 2026)
- Priority: M3

**N39. Screen Interaction Fallback (Computer Use Equivalent)**
- Connector-first → screen-control-fallback for apps without connectors
- Evaluate: Tauri native access, Windows-MCP (already in MCP tool list), open-source computer use libraries
- Permission gates: user approves each new app access
- Screenshot-based verification: show user what agent "sees" before acting
- Sandbox: screen actions limited to approved application list
- Competitive response to Anthropic Computer Use (March 2026)
- Priority: M3+

**N40. TELOS Identity System** *(same as N21)*

**N41. Hook-Driven Lifecycle Automation** *(same as N22)*

**N42. USER/SYSTEM Data Separation** *(same as N23)*

**N43. Skills Marketplace with Security Auditor** *(same as N16 + N25)*

**N44. Cross-Department Workflows**
- Workflows that start in Research, feed Marketing, report to Operations
- First-mover advantage — no competitor offers this
- Depends on: Visual Workflow Builder + Department Templates
- Priority: M3+

**N45. Portable Identity Export/Import** *(same as N15)*

### From cowork-department-prompts-analysis

**N46. Seven Validated Patterns (from 25+ mega-prompts analyzed)**
1. Context File Injection → Auto-context engine (N6)
2. Multi-Step Workflow Chaining → Visual workflow builder (N35)
3. Structured Output Specification → Output templates (N36)
4. Safety Rails and Scope Boundaries → Permission scopes (N30)
5. Recurring Schedule Integration → Scheduled daemons (N32)
6. Scoring and Flagging Systems → Confidence scoring (N18) + Sentinel
7. Reference File Architecture → My Profile + auto-injection (N6)

**N47. Department Onboarding Wizard**
- During onboarding: user selects their department/role
- System auto-configures: appropriate agent persona, skill bundles, connector suggestions, ground rules
- "One click, not one thousand words"
- Priority: M2 extension (part of N31)

**N48. Batch Processing Mode**
- Content repurposing: 1 article → 60 social posts
- Parallel sub-agent execution for batch tasks
- Priority: M3

**N49. Workflow Marketplace**
- Community shares/sells workflow templates (not just skills)
- Waggle workflow templates as installable packages
- Priority: M3+

**N50. Performance Analytics on Workflows**
- Track workflow execution time, quality scores, cost per run
- "This workflow costs $0.12 per run and completes in 45 seconds"
- Priority: M3

### From Test Report — REMAINING Items Not Yet Fixed

**N51. P1-4: Hardcoded backend URL (127.0.0.1:3333)**
- ServiceProvider.tsx hardcodes localhost in error messages
- Make all URLs configurable, show actual configured URL in errors
- Priority: Low (cleanup)

**N52. P1-5: Polling intervals inconsistent and hardcoded**
- useAgentStatus: 30s, useOfflineStatus: 15s, useTeamState: 30s, CockpitView: 30s
- Create POLLING_CONSTANTS config. Consider adaptive polling (faster when active, slower when idle)
- Priority: Low (cleanup)

**N53. P1-6: Unsafe TypeScript patterns**
- `(window as any).__TAURI_INTERNALS__` and `as Record<string, unknown>` casts
- Create proper TypeScript interfaces for Tauri APIs
- Priority: Low (cleanup)

**N54. P1-7: useKeyboardShortcuts has 14+ dependencies**
- Re-registers event listeners on every dependency change
- Use refs for callbacks, add isInputFocused() guard, detect shortcut conflicts
- Priority: Medium (performance)

### From Test Report — P2 Items Not Yet Fixed

**N55. P2-1: Window stacking UX — no window list/switcher**
- Ctrl+` cycling exists (Session 4). No visual window list/switcher (like Cmd+Tab overlay)
- Consider Expose/Mission Control-style all-windows view
- Priority: Low (nice-to-have)

**N56. P2-4: No responsive layout / mobile support**
- No @media queries. Requires 1200px+ minimum width. Unusable on tablets/phones
- Priority: Low for M2 (desktop-first), but relevant for future mobile companion

**N57. P2-6: Color-only status indicators**
- Cockpit health, dashboard dots, dock activity rely on color alone
- WCAG 2.1 AA violation for colorblind users
- Add shape/icon indicators alongside color
- Priority: Medium (accessibility)

**N58. P2-7: Light theme "Coming Soon"**
- No prefers-color-scheme detection. Dark-only experience.
- Priority: Low (deferred to M3)

**N59. P2-8: Memory count tracking O(n*m)**
- Iterates messages × toolUse items on every state change
- Move to server-side count or cache result
- Priority: Low (performance at scale)

**N60. P2-9: Session ID fallback chain**
- `activeSessionId ?? activeWorkspace?.id ?? 'default'` — no validation that 'default' exists
- Could cause silent data loss
- Priority: Medium

**N61. P2-10: setInterval cleanup risk in CockpitView**
- Multiple intervals could accumulate on rapid mount/unmount
- Session 2's fetchWithTimeout may have partially mitigated this
- Priority: Low

**N62. P2-11: Marketplace shows only installed items** *(partially addressed Session 6 — TODO comment added)*
- Needs backend differentiation: available vs installed
- Priority: Medium (when marketplace ships)

**N63. P2-12: Memory count discrepancy (welcome modal vs Memory view)**
- Different counts from different sources. Need unified counting logic.
- Priority: Low

### From Test Report — P3 Items Not Yet Fixed

**N64. P3-1: Command palette filter doesn't hide group headers**
**N65. P3-3: Inconsistent tier naming ("Professional" vs "Pro" vs "Solo")**
**N66. P3-4: Toast ID uses Date.now() + Math.random() — collision risk**
**N67. P3-5: useOnboarding localStorage — no schema versioning**
**N68. P3-6: ESLint dependency warnings suppressed without justification**
**N69. P3-7: No focus trap in modal dialogs (Tab key escapes modals)**
**N70. P3-8: Keyboard shortcuts not documented in-app (only in help dialog)**
**N71. P3-9: Marketing copy in functional UI (welcome modal footer)**
**N72. P3-10: Dock tooltip may be cut off on smaller screens**
**N73. P3-12: innerHTML usage in dock concept (XSS risk)**
**N74. P3-14: Memory frame accessCount always 0** *(✅ Fixed Session 6)*

### From User Evaluation — Remaining Improvements Not Yet Implemented

**N75. I5: Right-click context menus in Files and Memory** *(✅ Memory done S9, Files already existed)*
**N76. I6: Replace mock embedder with real semantic search** → M2-1 (confirmed)
**N77. I7: Consolidate disclaimer to single injection** → ✅ S3
**N78. I8: Audit trail UI for compliance** → M3 (enterprise)
**N79. I9: RBAC (role matrix in Permissions settings)** → M3 (enterprise)
**N80. I10: SSO/SAML integration** → M3+ (enterprise)
**N81. I12: Make connector list filterable/collapsible** → Not yet done. Low effort.
**N82. I13: Scheduled routine management (enable/disable/configure in Cockpit)** → Part of N32
**N83. I14: Notification center for badge resolution** → ✅ S9 (NotificationInbox exists)

---

## PART 4: UNIFIED PRIORITY MATRIX

### Critical Path (Blocking Revenue)
```
M2 Week 1-4: Embeddings → Stripe → Tauri Builds → Landing Page → Beta
```

### High-ROI Extension (M2 Weeks 5-8)
```
N6:  Auto-Context Injection (depends on embeddings) — THE #1 differentiator
N8:  Feedback Capture (thumbs up/down in Chat) — closes learning loop
N7:  Guided Identity Builder (interview mode) — onboarding conversion
N31: Department Agent Templates + Recipes — "one click, not 1000 words"
N47: Department Onboarding Wizard — role → auto-configure
```

### Differentiation Layer (M3 Weeks 9-16)
```
N1:  Sentinel Phase 1 (observer)
N32: Scheduled Agent Daemons (wire existing scheduler to UI)
N30: Agent Permission Scopes (read-only/write-to-output/full-access)
N22: Hook-Driven Lifecycle Automation
N23: USER/SYSTEM Data Separation (critical for auto-updates)
N10: Task Progress Widget (trust mechanism)
N11: Connector Recipe Templates (3-5 per connector)
N18: Confidence Scoring on Agent Outputs
N28: McKinsey-Style Report Generation
```

### Strategic Moats (M3+ Weeks 16+)
```
N2+N3: Sentinel Phase 2+3 (analyzer + promoter + self-improvement)
N29:   CLI Connector Layer (universal integration backbone)
N35:   Visual Workflow Builder
N44:   Cross-Department Workflows
N21:   TELOS Identity System (full 10-layer)
N16:   Skill Security Auditor
N25:   Packs System / Marketplace Architecture
N38:   Async Task Queue (Dispatch equivalent)
N39:   Screen Interaction Fallback (Computer Use equivalent)
N15:   Portable Identity Export/Import
N14:   Progressive Context Refinement
N17:   Tapestry Knowledge Networks (Memory Explorer)
N27:   Voice Integration
N26:   Task Classification Hierarchy
N48:   Batch Processing Mode
N49:   Workflow Marketplace
N50:   Performance Analytics on Workflows
```

### Cleanup Backlog (Continuous)
```
N51-N73: Remaining P1-P3 test report items (hardcoded URLs, polling
         constants, TypeScript patterns, focus traps, tier naming,
         schema versioning, responsive layout, color-only indicators,
         light theme, memory count optimization, etc.)
N81:     Connector list filterable/collapsible
N57:     Color-only status indicators (accessibility)
```

---

## PART 5: COMPETITIVE POSITIONING SUMMARY

### vs Cowork
Waggle does automatically what Cowork users manually configure. Auto-context injection (N6) eliminates the 30-minute setup. 6 department templates (N31) replace 800-word mega prompts. Sentinel (N1-3) makes the system self-improving — Cowork is static.

### vs OpenClaw/NanoClaw
Enterprise security: permission scopes (N30), approval gates, vault, audit trail. Waggle delivers what the open-source community can't: governance.

### vs Genspark Claw
Desktop-native, zero cloud dependency. .mind files are user-owned. No $250/month subscription. Sovereign by architecture.

### vs Paperclip
Waggle models workspaces, not companies. Simpler mental model, broader audience. Sentinel provides organizational intelligence at workspace level.

### KVARK
On-premise deployment with LM TEK hardware, open-weight models (Qwen/Mistral), zero data leakage. The sovereign AI tier no competitor replicates.

---

## PART 6: SPECS READY FOR IMPLEMENTATION

| Document | Location | Status |
|---|---|---|
| SENTINEL-DAEMON-SPEC.md | D:\Projects\waggle-os\ | Full 3-phase spec, 536 lines, ready for Claude Code |
| DOCK-REFACTOR-SPEC.md | D:\Projects\waggle-os\docs\ | ✅ Implemented in Session 5 |
| M2 Roadmap | Generated from this sprint | Confirmed decisions |
| Sprint Completion Report | Generated from this sprint | 10 sessions documented |
| All 6 strategic documents | D:\Projects\waggle-os\ | Analysis complete, items extracted |

---

## INSTRUCTIONS FOR NEW CHAT

Start the new Claude chat with:

1. Upload this document (WAGGLE-COMPLETE-CONSOLIDATED-BRIEF.md)
2. Upload SENTINEL-DAEMON-SPEC.md (for when Sentinel work begins)
3. Say: "This is the complete strategic brief for Waggle OS. The M1 sprint (10 sessions) is done — everything in Part 1 is resolved. M2 Weeks 1-4 are confirmed. I want to start M2 Week 1: real embedding provider (Ollama default + API fallback). The repo is at D:\Projects\waggle-os. Build me the Claude Code prompts."
4. For subsequent sessions, reference items by their N-number (e.g., "Let's work on N6 auto-context injection" or "Start N1 Sentinel Phase 1")

---

*Complete brief — 83 unique items catalogued across 8 source documents. April 2026.*
