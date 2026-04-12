# Cowork "Department in a Prompt" Analysis — What Waggle Should Steal
## Community Mega-Prompt Patterns Mapped to Waggle OS Feature Gaps

**Date:** March 30, 2026
**Author:** Cowork AI (Marko Markovic session)
**Classification:** Internal — Product Strategy

---

## Executive Summary

The Cowork community has converged on a pattern they call "mega prompts" — single prompts that turn Claude into an entire department function (Finance, Marketing, HR, Legal, Operations). These are not simple Q&A prompts. They are structured workflow definitions that chain multiple steps, reference local files, produce formatted deliverables, and in some cases run on recurring schedules.

I analyzed 25+ documented prompts across 5 sources, 10 tested workflows, and 67 profession-specific use cases. The pattern is clear: **users are building mini operating systems inside prompts** because they lack an actual operating system. Every mega prompt is compensating for missing infrastructure that Waggle already provides — or should provide.

Below: the seven reusable patterns the community has validated, what they mean for Waggle, and the specific features to build or prioritize.

---

## Part 1: The Seven Patterns Behind Every Mega Prompt
### Pattern 1: Context File Injection

Every effective mega prompt starts by referencing local files — `brand-voice.md`, `about-me.md`, project folders, previous reports. The prompt tells Claude "read this first, then work." Without this, outputs are generic.

**Waggle implication:** This is the auto-context injection engine from the previous analysis. Waggle's My Profile + Memory graph should inject this context automatically before every agent interaction. Users should never have to write "read my brand voice file" in a prompt — the system should know.

**Steal priority:** P0 — already identified. This analysis reinforces it.

---

### Pattern 2: Multi-Step Workflow Chaining

The "department" effect comes from chaining 4-8 discrete steps into a single prompt: research → analyze → format → output → schedule. Example: the "Content Calendar Builder" prompt researches competitors, analyzes what worked, generates 30 days of content, formats as CSV with hooks/CTAs/talking points, and schedules weekly updates.

**Waggle implication:** This is what Waggle's agent orchestration should do natively. Instead of a user writing an 800-word prompt describing the chain, they should configure a workflow visually in Mission Control: trigger → agent steps → output → schedule. Each step maps to an agent or skill.

**Steal priority:** P1 — Waggle has the orchestration engine; what's missing is a visual workflow builder and pre-built templates.

---

### Pattern 3: Structured Output Specification

Every mega prompt specifies the exact deliverable format: "Save as CSV with columns X, Y, Z" or "Create a markdown report with these 8 sections" or "Generate an Excel spreadsheet with formulas." The prompt IS the output schema.

**Waggle implication:** Waggle should offer output templates — predefined deliverable formats for common tasks (status reports, competitive analyses, content calendars, financial reconciliations). When a user selects a task type, the output format is pre-configured. The agent knows what to produce without the user specifying it.

**Steal priority:** P2 — enhances quality and consistency. Maps to the "Connector Recipe Templates" recommendation.

---

### Pattern 4: Safety Rails and Scope Boundaries

Effective prompts include explicit constraints: "Do NOT modify source files," "Flag but don't delete duplicates," "Ask before reorganizing." These prevent the AI from overstepping.

**Waggle implication:** This should be a system-level configuration, not per-prompt boilerplate. Waggle's agent configuration should include permission scopes: read-only agents, write-to-output-only agents, full-access agents. The three-tier user model already supports this conceptually — implement it as agent-level permission masks.

**Steal priority:** P1 — directly feeds the security posture from the PAI analysis. Essential for enterprise trust.
---

### Pattern 5: Recurring Schedule Integration

The most sophisticated prompts use Cowork's `/schedule` command to run automatically — "Every Monday at 8am, generate my weekly briefing from project files." This transforms a one-shot prompt into a persistent background service.

**Waggle implication:** This IS the daemon model Waggle is building. Scheduled Jobs are on the roadmap. The community is validating that recurring automated workflows are the highest-value use case. Combine this with the Sentinel daemon concept: scheduled agents that run analysis, generate reports, monitor systems, and surface results to Dashboard.

**Steal priority:** P1 — Scheduled Jobs should be elevated on the roadmap. Every department prompt the community loves can become a scheduled Waggle agent.

---

### Pattern 6: Scoring and Flagging Systems

Prompts don't just produce output — they evaluate. "Score each page 1-10," "Flag items over $50 for review," "Rank by strategic impact." The AI becomes an analyst, not just a generator.

**Waggle implication:** This maps directly to the confidence scoring system from the competitive intel analysis. Every agent output should include quality/relevance/risk scores. The Dashboard should aggregate these into trends. Simple users see "3 items need your attention." Power users see the full scoring matrix.

**Steal priority:** P2 — enhances the trust layer. Combines with Sentinel's observation scoring.

---

### Pattern 7: Reference File Architecture

The community has converged on a standard set of reference files that mega prompts consume: `about-me.md` (identity), `brand-voice.md` (writing style), `working-preferences.md` (behavioral rules), plus domain-specific files per project. This is essentially a user profile fragmented across markdown files.

**Waggle implication:** This IS Waggle's My Profile module — Identity, Writing Style, Brand, Interests tabs. The community is building My Profile from scratch in every workspace because Cowork doesn't have it as a first-class feature. Waggle does. The gap: Waggle's My Profile needs to be auto-injected into agent context (Pattern 1) and enriched via the guided identity builder.

**Steal priority:** P0 — Waggle already has the infrastructure. Wire it up and this becomes the single biggest differentiator vs. Cowork's manual file approach.
---

## Part 2: Department-by-Department — What the Community Automates vs. What Waggle Should Offer

### Finance Department

**Community mega prompts:** Monthly reconciliation (bank statements → categorized Excel), expense auditing (receipt scanning → tax-ready spreadsheet), subscription auditing (find forgotten charges → cancellation recommendations).

**Waggle mapping:** These are perfect candidates for scheduled agent workflows. A "Finance Agent" with access to the Files connector and Excel skill could run monthly: ingest bank CSV → match against invoices → flag discrepancies → output reconciliation spreadsheet to Dashboard. The community reports this eliminates "a full afternoon of monthly work."

**What to build:** Pre-built Finance Agent template with 3 starter recipes: monthly reconciliation, expense categorization, subscription audit. Connects to Vault for secure credential storage.

---

### Marketing Department

**Community mega prompts:** Content calendar builder (30-day plan with hooks/CTAs), brand voice writer (generates platform-specific posts from guidelines), content repurposing (1 article → 60 social posts), competitive analysis (reverse-engineer competitor positioning).

**Waggle mapping:** The Marketing Agent should consume My Profile → Brand tab and produce platform-specific content. The content calendar is a scheduled workflow: weekly, generate next week's content plan from brand guidelines + recent performance data. The repurposing workflow chains: article → extract key points → generate per-platform variants → format as CSV with publish dates.

**What to build:** Marketing Agent template with starter recipes: weekly content calendar, competitive positioning update, content repurposing batch. Integrates with social connectors (when available).

---

### Operations Department

**Community mega prompts:** Morning briefing (daily from project files), project status report (consolidate multi-project status), SOP auditor (find outdated procedures), weekly report generator (pre-fill from activity).

**Waggle mapping:** Operations is where Waggle's daemon model shines. The morning briefing IS a scheduled agent that runs at 7am, reads Mission Control activity, Memory recent frames, and calendar data, then surfaces a Dashboard widget. The project status report is Mission Control's Fleet tab — it just needs a "generate report" action. SOP auditing is a Sentinel use case — the observer notices when documented procedures diverge from actual agent behavior.

**What to build:** Operations Agent template. Morning briefing as first scheduled daemon (flagship demo). Status report export from Mission Control. SOP auditor as Sentinel extension.

---

### HR Department

**Community mega prompts:** Onboarding checklist (new hire → milestones + checklist), job application strategist (resume → tailored cover letter + gap analysis + interview prep).

**Waggle mapping:** HR workflows are template-heavy and high-value for enterprise customers. An HR Agent with access to document templates and the DOCX skill produces onboarding packages automatically. The key insight: HR mega prompts always produce DUAL outputs — a human-readable guide AND a machine-readable checklist (CSV/markdown with checkboxes).

**What to build:** HR Agent template with onboarding package recipe. Dual-output pattern (narrative + checklist) as a standard agent capability.

---

### Legal Department

**Community mega prompts:** Contract comparer (side-by-side diff with risk flagging), NDA review, compliance document generator.

**Waggle mapping:** Legal workflows require the highest safety rails — agents must be read-only on source documents, output to separate folder, and flag (never auto-resolve) discrepancies. This is where agent permission scopes become critical. The contract comparer maps to a Legal Agent + PDF/DOCX skills + Vault for confidential document handling.

**What to build:** Legal Agent template with strict read-only scope. Contract comparison recipe with risk scoring. Integrates with Vault for document-level encryption.

---

### Research & Analysis

**Community mega prompts:** Deep research report (10+ sources → themed synthesis), investment due diligence (10-section financial analysis), executive briefing (30-day industry digest).

**Waggle mapping:** Research is Waggle's sweet spot — it chains web search, document analysis, memory retrieval, and structured output. The executive briefing is the highest-value scheduled daemon for CxO users: weekly, synthesize industry developments → rank by business impact → produce CEO-ready brief → surface in Dashboard.

**What to build:** Research Agent template. Executive briefing as premium scheduled daemon. Investment due diligence as a complex workflow template (demonstrates multi-step orchestration to prospects).
---

## Part 3: The Steal List — Concrete Features Validated by Community Adoption

### Tier 1 — Build Now (Community Has Proven Demand)

| # | Feature | Source Pattern | Waggle Component | Effort |
|---|---|---|---|---|
| 1 | **Department Agent Templates** | Every mega prompt is a department-in-a-prompt | Pre-built agent configs for Finance, Marketing, Ops, HR, Legal, Research | Medium |
| 2 | **Starter Workflow Recipes** | Mega prompts chain 4-8 steps with specific outputs | 3-5 pre-built workflows per department agent | Medium |
| 3 | **Scheduled Agent Daemons** | `/schedule` for recurring briefings and reports | Scheduled Jobs with Dashboard surfacing | Medium-High |
| 4 | **Output Templates** | Every prompt specifies exact deliverable format | Pre-configured output schemas per task type | Low |
| 5 | **Agent Permission Scopes** | Safety rails repeated in every prompt | Read-only / write-to-output / full-access per agent | Medium |

### Tier 2 — Build Next (Extends the Lead)

| # | Feature | Source Pattern | Waggle Component | Effort |
|---|---|---|---|---|
| 6 | **Visual Workflow Builder** | Users write 800-word prompts to describe chains | Drag-and-drop workflow editor in Mission Control | High |
| 7 | **Dual-Output Standard** | HR/Ops prompts always produce narrative + checklist | Agent output mode: report + actionable items | Low |
| 8 | **Scoring/Flagging Framework** | Prompts add 1-10 scores, risk flags, priority ranks | Standard confidence + priority fields on agent outputs | Medium |
| 9 | **Batch Processing Mode** | Content repurposing: 1 article → 60 posts | Parallel sub-agent execution for batch tasks | Medium |
| 10 | **Department Onboarding Wizard** | Users choose role → get right plugins/connectors | Role selection during onboarding → auto-configure agents | Medium |

### Tier 3 — Strategic Moats

| # | Feature | Source Pattern | Waggle Component | Effort |
|---|---|---|---|---|
| 11 | **Cross-Department Workflows** | No community prompt chains across departments | Workflow that starts in Research, feeds Marketing, reports to Ops | High |
| 12 | **Workflow Marketplace** | Community shares mega prompts informally | Waggle workflow templates shared/sold in marketplace | High |
| 13 | **Performance Analytics on Workflows** | No measurement in community prompts | Track workflow execution time, quality scores, cost per run | Medium |
---

## Part 4: The Strategic Synthesis

The community is doing something remarkable: they are building an operating system from prompts. Every mega prompt is a compensating mechanism for missing infrastructure:

| What the user writes in a prompt | What Waggle should provide as infrastructure |
|---|---|
| "Read my brand-voice.md first" | Auto-context injection from My Profile |
| "Step 1: research. Step 2: analyze. Step 3: format." | Visual workflow builder with step chaining |
| "Save as CSV with columns A, B, C" | Output templates per task type |
| "Do NOT modify source files" | Agent permission scopes |
| "Run this every Monday at 8am" | Scheduled daemon agents |
| "Score each item 1-10 and flag high-risk" | Confidence scoring framework |
| "I'm a marketing director who..." | Guided identity builder → persistent profile |

**The meta-insight is identical to the previous Cowork analysis:** the community is reverse-engineering Waggle OS feature by feature. They just don't know it yet.

The difference between a mega prompt and an operating system is persistence, composability, and visual management. The mega prompt dies when the session ends. Waggle's agents, workflows, and memory persist across sessions, compose into larger systems, and are managed through a visual interface rather than a text editor.

**The competitive play:** Ship department agent templates with starter recipes. Market them as "Your entire [Finance/Marketing/HR/Ops] department, running 24/7, no prompt engineering required." Position against the community's 800-word mega prompts as "one click, not one thousand words."

---

## Appendix: Sources Analyzed

- [25 Claude Cowork Prompts That Actually Work](https://www.masteringai.io/guides/25-claude-cowork-prompts) — MasteringAI
- [10 Claude Cowork Workflows That Actually Work](https://www.the-ai-corner.com/p/10-claude-cowork-workflows-that-actually) — The AI Corner
- [Claude Cowork: 10 Use Cases + 67 by Profession](https://aiblewmymind.substack.com/p/claude-cowork-use-cases-guide) — Aible w/ My Mind
- [Claude Cowork 101 Advanced: 100+ Power User Prompts](https://sidsaladi.substack.com/p/claude-cowork-101-advanced-master) — Sid Saladi
- [Claude Cowork Guide 2026](https://findskill.ai/blog/claude-cowork-guide/) — FindSkill.ai
- Previous Waggle OS analyses: competitive-intel, pai-strategic-analysis, cowork-vs-waggle comparison