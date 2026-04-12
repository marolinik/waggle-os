# WAGGLE OS — Strategic Catchup Scope
## Consolidated Feature Roadmap from Competitive Intelligence Sprint

**Date:** March 30, 2026
**Author:** Cowork AI (Marko Markovic session)
**Status:** Ready for Claude Code implementation planning
**Sources:** Cowork system prompt analysis, community mega-prompt patterns, task-observer repo, Anthropic March 2026 releases, PAI v4 analysis, Claude skills ecosystem intel

---

## Context

In a single session we analyzed: the leaked Cowork system prompt, 25+ community mega prompts, 10 tested workflows, 67 profession-specific use cases, Anthropic's Computer Use + Dispatch launch (March 23-25), the rebelytics/one-skill-to-rule-them-all meta-skill, Daniel Miessler's PAI v4, and the Claude skills ecosystem (80,000+ community skills).

Every signal points the same direction: the market is converging on the exact product Waggle is building. The community is reverse-engineering it from markdown files. Anthropic is building it into Claude directly. The window to ship a polished, differentiated product is narrowing.

This document consolidates all findings into a single prioritized scope with implementation guidance for Claude Code.

---

## PRIORITY 0 — Ship or Die (Blockers to Production Use)
### P0-1: Offline-First View States
**Source:** Test report (March 28), Cowork comparison
**Problem:** All views except Settings show permanent spinners when backend is unreachable. No timeout, no AbortController, no fallback state. Default desktop experience is non-functional.
**Scope:**
- [ ] Create `fetchWithTimeout()` utility — 10-second timeout + retry with backoff
- [ ] Apply globally to all API calls (replace raw fetch)
- [ ] Implement three-state pattern per view: loading (with timeout) → connected → disconnected
- [ ] Extract Settings view's offline handling as the reference implementation
- [ ] Add connection status indicator to dock/status bar
**Acceptance:** Every view shows meaningful state within 10 seconds, connected or not.
**Effort:** 1 sprint | **Impact:** Existential — without this, desktop distribution is DOA

---

### P0-2: Waggle Dance Blank Overlay Fix
**Source:** Test report (March 28)
**Problem:** Waggle Dance view renders full-screen blank overlay. No content, no escape path. User trapped — must force-quit or know Escape key.
**Scope:**
- [ ] Diagnose root cause (likely missing data or rendering dependency)
- [ ] Either fix the view or hide it from dock until ready
- [ ] If hiding: remove dock icon, gate behind feature flag
- [ ] Add Escape key handler to ALL overlay/modal views as safety net
**Acceptance:** No view can trap the user. Every overlay is dismissible.
**Effort:** 0.5 sprint | **Impact:** P0 blocker — single worst UX failure in app

---

### P0-3: Auto-Context Injection Engine
**Source:** Cowork system prompt, community mega-prompts, every setup guide analyzed
**Problem:** The #1 reason Cowork is "mediocre out of the box" is missing context. Users spend 30 minutes creating markdown identity files. Waggle has My Profile + Memory but doesn't inject them into agent context automatically.
**Scope:**
- [ ] Before every agent interaction, auto-inject from My Profile: identity, writing style, brand, interests
- [ ] Include top-N relevant memory frames (by recency + importance score)
- [ ] Include active workspace context from Mission Control
- [ ] Implement as middleware in the agent request pipeline — not per-agent prompt hacking
- [ ] Configurable: admin can control what gets injected and token budget for context
- [ ] Context injection should be invisible to user — no "reading your profile" messages
**Acceptance:** A fresh agent interaction produces personalized output without the user providing any context manually.
**Effort:** 1-2 sprints | **Impact:** THE core differentiator — solves the problem the entire community is hacking around

---

### P0-4: Agent System Prompt Decontamination
**Source:** Test report (March 28)
**Problem:** Workspace-specific disclaimers (e.g., financial warnings) appended to ALL agent responses regardless of context. Trivial math questions get financial disclaimers. Destroys intelligent assistant perception.
**Scope:**
- [ ] Audit all workspace system prompts for context-inappropriate injections
- [ ] Implement context-aware prompt scoping — disclaimers only for relevant task types
- [ ] Add system prompt preview in agent configuration (admin visibility)
**Acceptance:** Agent responses contain only contextually relevant instructions.
**Effort:** 0.5 sprint | **Impact:** Quick win with outsized trust impact
---

## PRIORITY 1 — Competitive Parity (Close Gaps Before Market Notices)

### P1-1: Guided Identity Builder (Interview Mode)
**Source:** Community setup guides (Ryan Stax, The AI Corner, FindSkill.ai)
**Insight:** Self-written profiles are "LinkedIn bios — completely disconnected from how you actually operate." Claude interviewing the user produces 10x better context.
**Scope:**
- [ ] Replace passive form-filling in My Profile with agent-guided interview flow
- [ ] Interview covers: role, audience, daily decisions, quality standards, working style, tools used
- [ ] Agent asks 8-10 targeted questions, synthesizes into structured profile
- [ ] Store as structured data in graph memory (not raw markdown)
- [ ] Make this the default onboarding experience for new users
- [ ] Allow re-interview to update (not just manual edit)
**Acceptance:** New user completes onboarding interview in <10 minutes. Profile quality measurably better than manual entry.
**Effort:** 1-2 sprints | **Impact:** High — onboarding conversion + output quality

---

### P1-2: Feedback Capture → Learning Loop
**Source:** Cowork system prompt (feedback memory type), PAI analysis, Sentinel spec
**Problem:** No mechanism to capture "did this work?" after agent interactions. System cannot learn from its mistakes.
**Scope:**
- [ ] Add thumbs-up / thumbs-down + optional comment to every agent response in Chat view
- [ ] Store as `feedback` event type in Events stream
- [ ] Link feedback to: agent ID, skill ID, task type, session
- [ ] Build Dashboard widget: agent performance trends (approval rate over time)
- [ ] Feed into Sentinel daemon (Phase 2) for automated pattern detection
**Acceptance:** Every agent response has a feedback mechanism. Dashboard shows 30-day approval trends per agent.
**Effort:** 1 sprint | **Impact:** Very high — closes the loop from "tool" to "learning system"
---

### P1-3: Scheduled Agent Daemons
**Source:** Community `/schedule` patterns, PAI hooks, department mega-prompts
**Problem:** Highest-value community use cases are recurring: morning briefings, weekly reports, monthly reconciliations. Waggle has "Scheduled Jobs" on roadmap but not shipped.
**Scope:**
- [ ] Implement scheduled task execution engine (cron-like, configurable intervals)
- [ ] UI in Mission Control: create/edit/delete/pause scheduled agents
- [ ] Each schedule defines: agent, task prompt, input sources, output destination, frequency
- [ ] Execution results surface in Dashboard as cards
- [ ] History: view past runs, outputs, success/failure status
- [ ] Start with 3 built-in templates: Morning Briefing, Weekly Status Report, Memory Cleanup
**Acceptance:** User configures "Monday 8am briefing" once, gets Dashboard card every Monday.
**Effort:** 2-3 sprints | **Impact:** High — transforms Waggle from reactive tool to proactive system

---

### P1-4: Agent Permission Scopes
**Source:** Community safety rails (every mega-prompt includes constraints), PAI security posture
**Problem:** Every community prompt repeats "do NOT modify source files." This should be system-level, not per-prompt.
**Scope:**
- [ ] Define permission levels: `read-only`, `write-to-output`, `full-access`
- [ ] Assign permission scope per agent in agent configuration
- [ ] Enforce at API level — agent cannot write outside its scope regardless of prompt
- [ ] Visual indicator in agent card: permission badge (lock icon variants)
- [ ] Admin override capability for trusted agents
- [ ] Audit log: every write operation logged with agent ID + permission check result
**Acceptance:** Read-only agent physically cannot modify source files. Audit trail for all write operations.
**Effort:** 1-2 sprints | **Impact:** High — enterprise trust requirement, safety foundation

---

### P1-5: Department Agent Templates
**Source:** 25+ community mega-prompts analyzed, 67 profession-specific use cases
**Insight:** Users are writing 800-word prompts to create "departments." Waggle should ship them pre-built.
**Scope:**
- [ ] Create 6 pre-configured agent templates: Finance, Marketing, Operations, HR, Legal, Research
- [ ] Each template includes: agent persona, default skills, suggested connectors, 3-5 starter workflow recipes
- [ ] Recipes are one-click activatable from Skills & Apps view
- [ ] Template selection during onboarding (or via Mission Control → Spawn)
- [ ] Each recipe specifies: input sources, processing steps, output format, suggested schedule

**Starter recipes per department:**

Finance: monthly reconciliation, expense categorization, subscription audit
Marketing: weekly content calendar, competitive positioning update, content repurposing batch
Operations: morning briefing, project status consolidation, SOP audit
HR: onboarding package generator, job posting optimizer, interview prep kit
Legal: contract comparison with risk scoring, NDA triage, compliance checklist
Research: deep research synthesis, executive industry briefing, investment due diligence

**Acceptance:** New user selects "Marketing" during onboarding → gets configured agent with 3 ready-to-run recipes.
**Effort:** 2-3 sprints | **Impact:** Very high — "one click, not one thousand words" positioning
---

## PRIORITY 2 — Extend the Lead (Waggle's Structural Advantages)

### P2-1: Sentinel Daemon (Self-Improving Agent Observer)
**Source:** rebelytics/one-skill-to-rule-them-all, competitive intel (self-improving agent loop)
**Full spec:** See SENTINEL-DAEMON-SPEC.md in this folder
**Scope summary:**
- [ ] Phase 1: Observer — subscribe to Events, capture corrections/gaps, write to Memory graph
- [ ] Phase 2: Analyzer — scheduled pattern detection, confidence scoring, Dashboard surfacing
- [ ] Phase 3: Promoter — draft skill improvements, admin approval, post-application verification
**Effort:** 5-7 sprints total (phased) | **Impact:** Competitive moat — nobody has a visual self-improving agent loop

---

### P2-2: Connector Recipe Templates
**Source:** Composio (78 SaaS apps), community mega-prompts
**Problem:** "Connect to Slack" is plumbing. "Monitor #support for escalation keywords → create Jira ticket" is value.
**Scope:**
- [ ] For each existing connector (32), create 3-5 pre-built automation recipes
- [ ] Surface in Skills & Apps as "Starter Recipes" when connector is configured
- [ ] Recipes are one-click activate with configurable parameters
- [ ] Recipes chain connector actions into workflows (trigger → process → output)
**Effort:** 2 sprints | **Impact:** High — transforms connectors from developer plumbing to user-facing automation

---

### P2-3: Task Progress Widget
**Source:** Cowork TodoList system (rendered as widget in UI)
**Problem:** Users can't see what agents are doing during multi-step tasks. Creates anxiety and premature interruption.
**Scope:**
- [ ] Surface agent work as structured task list: pending → in_progress → completed
- [ ] Show in Chat view sidebar during active agent execution
- [ ] Also available in Dashboard as "Active Tasks" widget
- [ ] Each task shows: description, elapsed time, sub-steps if applicable
**Effort:** 1 sprint | **Impact:** Medium-high — trust mechanism, reduces user anxiety

---

### P2-4: Visual Workflow Builder
**Source:** Community mega-prompt chains (4-8 step workflows written as prose)
**Problem:** Users write 800-word prompts to describe step chains. Should be visual.
**Scope:**
- [ ] Drag-and-drop workflow editor in Mission Control
- [ ] Nodes: agent steps, skill invocations, connector actions, conditionals, outputs
- [ ] Edges: data flow between steps
- [ ] Save as reusable workflow template
- [ ] Run manually or attach to schedule
- [ ] Start simple: linear chains only, add branching in v2
**Effort:** 3-4 sprints | **Impact:** High — makes orchestration accessible to non-technical users
---

### P2-5: Output Templates & Dual-Output Standard
**Source:** Community mega-prompts (every prompt specifies exact output format)
**Scope:**
- [ ] Pre-defined output schemas per task type (status report, analysis, content calendar, etc.)
- [ ] Dual-output capability: narrative report + machine-readable checklist/CSV
- [ ] Agent auto-selects format based on task type (configurable override)
- [ ] Templates stored in Skills & Apps, editable by power users
**Effort:** 1 sprint | **Impact:** Medium — consistency and quality improvement

---

### P2-6: Confidence Scoring on Agent Outputs
**Source:** Competitive intel (multiple projects implement this), community scoring patterns
**Scope:**
- [ ] Add `confidence` field to agent response schema (high / medium / low + reasoning)
- [ ] Display as subtle indicator in Chat view (green / amber / red dot)
- [ ] Factor in: data freshness, source authority, pattern match strength, memory support
- [ ] Aggregate in Dashboard: "X% of outputs this week were high-confidence"
- [ ] Feeds into Sentinel daemon for quality signal detection
**Effort:** 1-2 sprints | **Impact:** Medium — trust layer, especially for enterprise

---

## PRIORITY 3 — Competitive Response (Anthropic March 2026 Releases)

### P3-1: Async Task Queue (Dispatch Equivalent)
**Source:** Anthropic Dispatch launch (March 23-25, 2026)
**Threat:** Users can text Claude from iPhone → Claude completes task on Mac → user returns to finished work. Asynchronous execution is killer UX.
**Scope:**
- [ ] Implement task queue: submit task → agent executes in background → result surfaces in Dashboard
- [ ] Web-based task submission endpoint (enables future mobile companion)
- [ ] Task states: queued → executing → completed → reviewed
- [ ] Desktop notification on completion
- [ ] Queue visible in Mission Control with cancel/pause/priority controls
- [ ] Phase 2: Mobile companion app (React Native) or PWA for task submission
**Effort:** 2-3 sprints (queue + web endpoint) | **Impact:** High — matches Dispatch UX

---

### P3-2: Screen Interaction Fallback (Computer Use Equivalent)
**Source:** Anthropic Computer Use launch (March 23, 2026)
**Threat:** Claude can now see/click/type on desktop when no connector exists. Connector-first, screen-control-fallback model.
**Scope:**
- [ ] Evaluate integration paths: Tauri native access, Windows-MCP, open-source computer use libraries
- [ ] Implement connector-first → screen-fallback architecture (match Anthropic's model)
- [ ] Permission gates: user approves each new app access
- [ ] Screenshot-based verification: show user what agent "sees" before acting
- [ ] Start with: browser navigation, file system operations, simple app interactions
- [ ] Sandbox: screen actions limited to approved application list
**Effort:** 4-6 sprints | **Impact:** Critical for parity — but Waggle's connector-first model is already the right architecture
**Note:** Windows-MCP is already in your MCP tool list. Evaluate immediately as a shortcut.
---

## PRIORITY 4 — Strategic Moats (Build While Others Can't)

### P4-1: TELOS Identity System
**Source:** PAI v4.0.3 analysis
**Scope:** Extend My Profile into structured identity layers: Mission, Goals, Projects, Beliefs, Strategies, Challenges, Ideas. Store as graph nodes, accessible to all agents. Guided wizard onboarding.
**Effort:** 2 sprints | **Impact:** High differentiation

### P4-2: Hook-Driven Lifecycle Automation
**Source:** PAI hooks, competitive intel, Events system
**Scope:** Make Events stream actionable. Users attach automations to lifecycle events (on_task_complete → notify, on_memory_threshold → compact, on_session_start → load context). Visual "if this, then that" in Settings.
**Effort:** 2-3 sprints | **Impact:** Transforms app into OS

### P4-3: USER/SYSTEM Data Separation
**Source:** PAI analysis
**Scope:** Clean boundary: user data (profile, memory, agent configs, connector settings) survives any system upgrade. Portable identity export as single package. Essential for desktop auto-updates.
**Effort:** 1-2 sprints | **Impact:** Critical for distribution

### P4-4: Skills Marketplace with Security Auditor
**Source:** Competitive intel (skill-security-auditor), community skills ecosystem
**Scope:** Open marketplace for community skills. Pre-install security scan: command injection, data exfiltration, prompt injection, supply chain risks. Security rating visible in Skills & Apps. Gate behind admin approval for enterprise.
**Effort:** 3-4 sprints | **Impact:** Community growth flywheel

### P4-5: Cross-Department Workflows
**Source:** Gap in community mega-prompts (nobody chains across departments)
**Scope:** Workflows that start in Research, feed Marketing, report to Operations. First mover advantage — no competitor offers this.
**Effort:** 2-3 sprints (requires P2-4 Visual Workflow Builder) | **Impact:** Enterprise differentiator

### P4-6: Portable Identity Export/Import
**Source:** PAI analysis, enterprise deployment requirements
**Scope:** Export entire Waggle profile (identity, memory frames, agent configs, connector settings, workflow templates) as single encrypted package. Import on another machine or share with team.
**Effort:** 1-2 sprints | **Impact:** Enterprise deployment enabler
---

## FRONTEND HYGIENE (Parallel Track — Run Alongside Feature Work)

These are from the test report and should be addressed continuously, not as a dedicated sprint:

- [ ] **App.tsx decomposition** — 1,348 lines, 15+ state vars. Extract into: DockManager, WindowManager, ViewRouter, KeyboardHandler, ThemeProvider
- [ ] **42 duplicate React key errors** in Skills & Apps grid — fix key generation
- [ ] **Window close button click target** — increase from ~16px to 44px minimum (WCAG touch target)
- [ ] **Silent error handling** — replace empty catch blocks with proper error logging service
- [ ] **Error boundaries** — wrap each view in React error boundary (prevent single view crash from killing app)
- [ ] **React Router v7 future flags** — address deprecation warnings before forced migration
- [ ] **Memory access count** — currently always 0, not incrementing on reads. Fix counter.
- [ ] **Memory markdown rendering** — raw markdown displayed instead of rendered. Add markdown renderer.
- [ ] **Skills marketplace tab** — currently mirrors Installed tab. Differentiate: show available vs. installed, add Install button
- [ ] **5-zone dock consolidation** — concept designed (waggle-dock-concept.html) but not implemented. Reduce 15 icons to 5 zones.
- [ ] **ARIA labels + keyboard navigation** — basic accessibility for enterprise compliance

---

## Effort Summary

| Priority | Items | Total Sprints | Timeline |
|---|---|---|---|
| **P0 — Ship or Die** | 4 items | 3-5 sprints | Immediate — next 5-10 weeks |
| **P1 — Competitive Parity** | 5 items | 7-11 sprints | Weeks 4-16 |
| **P2 — Extend Lead** | 6 items | 10-14 sprints | Weeks 8-24 |
| **P3 — Competitive Response** | 2 items | 6-9 sprints | Weeks 12-28 |
| **P4 — Strategic Moats** | 6 items | 12-17 sprints | Weeks 16-40 |
| **Frontend Hygiene** | 11 items | Continuous | Parallel track |

**Critical path:** P0 items → P1-1 (Identity Builder) + P1-2 (Feedback Loop) → P1-3 (Scheduled Daemons) → P2-1 (Sentinel)

This sequence builds each feature on the last: identity feeds context injection, feedback feeds the learning loop, scheduled daemons enable recurring value, Sentinel makes it self-improving.
---

## Competitive Positioning After This Scope

Once P0 + P1 ship, Waggle's positioning statement becomes:

> **"Your entire team, running 24/7 — no prompt engineering required."**
>
> While others spend 30 minutes configuring markdown files and writing 800-word prompts, Waggle gives you pre-built department agents, persistent memory that learns from every interaction, and scheduled automation that runs while you sleep. One click to set up. Zero prompts to maintain.

The three-tier model becomes the moat:
- **Simple users:** Select department → one-click agent → it just works
- **Power users:** Custom workflows, multiple agents, connector recipes
- **Admins/Enterprise:** Sentinel oversight, permission scopes, audit trails, air-gapped deployment

---

## Related Documents in This Folder

| Document | Content |
|---|---|
| `SENTINEL-DAEMON-SPEC.md` | Full implementation spec for self-improving observer daemon |
| `cowork-vs-waggle-strategic-analysis-2026-03-30.md` | Cowork system prompt + community comparison with Waggle |
| `cowork-department-prompts-analysis-2026-03-30.md` | 25+ mega-prompt patterns mapped to Waggle features |
| `competitive-intel-claude-skills-ecosystem-2026-03-30.md` | 7 patterns + 4 features to steal from skills ecosystem |
| `pai-strategic-analysis-2026-03-30.md` | 9 opportunities from Daniel Miessler's PAI v4 |
| `waggle-os-test-report-2026-03-28.md` | 42 QA findings (5 P0, 10 P1, 13 P2, 14 P3) |
| `WAGGLE-PRODUCTION-POLISH-PLAN.md` | Existing production readiness plan |

---

*End of scope. Hand this to Claude Code with: "Implement P0 items first, in order. Read SENTINEL-DAEMON-SPEC.md when you reach P2-1."*