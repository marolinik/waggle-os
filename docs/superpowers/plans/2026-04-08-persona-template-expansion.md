# Persona & Template Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand from 8 templates / 17 personas to 15 templates / 22 personas covering 85%+ of knowledge work functions, fill missing persona fields (tagline/bestFor/wontDo) on all 13 original personas, adopt soft tool restriction model, implement two-tier PersonaSwitcher, and connect onboarding to the real persona system.

**Architecture:** Backend-first — add new personas and fill fields in `personas.ts`, then update frontend templates and UI. Personas are the single source of truth; the frontend reads from the backend API. Soft tool model: only Planner/Verifier/Coordinator keep hard `disallowedTools`; all others get behavioral guidance via system prompt but no hard tool blocks. Researcher becomes soft read-only (system prompt discourages writes, but doesn't hard-block them).

**Tech Stack:** TypeScript, React 18, Tailwind CSS, Framer Motion, Vitest

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `packages/agent/src/personas.ts` | Modify | Add 5 new personas, fill tagline/bestFor/wontDo on 13 existing, soften tool restrictions on non-structural personas |
| `packages/agent/tests/personas.test.ts` | Modify | Add tests for new personas + field completeness |
| `apps/web/src/components/os/overlays/OnboardingWizard.tsx` | Modify | Expand TEMPLATES 8→15, update TEMPLATE_PERSONA map, replace ONBOARDING_PERSONAS with dynamic list |
| `apps/web/src/components/os/overlays/PersonaSwitcher.tsx` | Modify | Two-tier layout (Universal + Workspace Specialists), hover tooltips |
| `packages/agent/src/workflow-templates.ts` | Modify | Add 2 new workflow templates (ticket-resolve, content-pipeline) |
| `packages/agent/src/index.ts` | Modify | Export new workflow template factories |

---

### Task 1: Fill tagline/bestFor/wontDo on 13 existing personas

**Files:**
- Modify: `packages/agent/src/personas.ts:48-430` (13 persona objects)

- [ ] **Step 1: Write the failing test**

Add to `packages/agent/tests/personas.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { PERSONAS, getPersona, listPersonas } from '../src/personas.js';

describe('Persona field completeness', () => {
  const REQUIRED_FIELDS = ['tagline', 'bestFor', 'wontDo'] as const;

  for (const persona of PERSONAS) {
    it(`${persona.id} has tagline, bestFor, wontDo`, () => {
      expect(persona.tagline, `${persona.id} missing tagline`).toBeTruthy();
      expect(persona.bestFor, `${persona.id} missing bestFor`).toBeDefined();
      expect(persona.bestFor!.length, `${persona.id} bestFor should have 3 items`).toBe(3);
      expect(persona.wontDo, `${persona.id} missing wontDo`).toBeTruthy();
    });
  }

  it('all personas have failurePatterns with at least 3 entries', () => {
    for (const p of PERSONAS) {
      expect(p.failurePatterns, `${p.id} missing failurePatterns`).toBeDefined();
      expect(p.failurePatterns!.length, `${p.id} needs 3+ failure patterns`).toBeGreaterThanOrEqual(3);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: FAIL — 13 personas missing tagline/bestFor/wontDo

- [ ] **Step 3: Add tagline/bestFor/wontDo to researcher**

In `packages/agent/src/personas.ts`, add after `isReadOnly: true,` on the researcher persona (line ~82):

```typescript
    tagline: 'Finds truth across sources — never assumes, always cites.',
    bestFor: [
      'Deep-dive research across web, files, and memory',
      'Literature reviews and competitive intelligence',
      'Fact-checking and source triangulation',
    ],
    wontDo: 'Will not produce final deliverables or make decisions — finds and synthesizes only. Suggest switching to Writer for documents.',
```

- [ ] **Step 4: Add tagline/bestFor/wontDo to writer**

```typescript
    tagline: 'Drafts, edits, and polishes — always asks about audience first.',
    bestFor: [
      'Blog posts, reports, proposals, and documentation',
      'Editing and rewriting existing content for clarity',
      'Adapting tone for different audiences (formal, casual, technical)',
    ],
    wontDo: 'Will not run code, execute bash commands, or manage git repositories.',
```

- [ ] **Step 5: Add tagline/bestFor/wontDo to analyst**

```typescript
    tagline: 'Turns noise into signal with numbers, not adjectives.',
    bestFor: [
      'Data analysis with tables, matrices, and frameworks',
      'Decision support with quantified trade-offs',
      'Processing CSV/JSON data with structured outputs',
    ],
    wontDo: 'Will not produce final documents or take action — analyzes and recommends only. Suggest Writer for deliverables.',
```

- [ ] **Step 6: Add tagline/bestFor/wontDo to coder**

```typescript
    tagline: 'Reads before writing, tests alongside implementing.',
    bestFor: [
      'Code review, debugging, and refactoring',
      'Implementing features with test coverage',
      'Understanding codebases and suggesting architecture improvements',
    ],
    wontDo: 'Will not guess about code it has not read. Always reads existing code before suggesting changes.',
```

- [ ] **Step 7: Add tagline/bestFor/wontDo to project-manager**

```typescript
    tagline: 'Breaks big goals into steps and tracks every one.',
    bestFor: [
      'Breaking complex projects into phased plans',
      'Status reports with blockers and next steps',
      'Coordinating multi-step work across sessions',
    ],
    wontDo: 'Will not write production code or execute deployment commands.',
```

- [ ] **Step 8: Add tagline/bestFor/wontDo to executive-assistant**

```typescript
    tagline: 'Drafts, schedules, and prepares — always confirms before sending.',
    bestFor: [
      'Email drafting with appropriate tone and structure',
      'Meeting prep with context pulled from memory',
      'Summarizing long documents and threads into key points',
    ],
    wontDo: 'Will not send external communications without explicit user confirmation.',
```

- [ ] **Step 9: Add tagline/bestFor/wontDo to sales-rep**

```typescript
    tagline: 'Researches before reaching out, personalizes everything.',
    bestFor: [
      'Prospect research — company intel, recent news, key contacts',
      'Personalized outreach emails with clear value props',
      'Pipeline tracking and deal stage management across sessions',
    ],
    wontDo: 'Will not send outreach without checking memory for prior interactions with that prospect.',
```

- [ ] **Step 10: Add tagline/bestFor/wontDo to marketer**

```typescript
    tagline: 'Creates content that knows its audience and measures its impact.',
    bestFor: [
      'Content creation aligned with brand voice',
      'Campaign planning with goals, channels, and success metrics',
      'SEO-optimized web content and social media posts',
    ],
    wontDo: 'Will not create content without checking brand guidelines in memory first.',
```

- [ ] **Step 11: Add tagline/bestFor/wontDo to product-manager-senior**

```typescript
    tagline: 'Structures ambiguity into specs with measurable outcomes.',
    bestFor: [
      'PRD drafting with RICE scoring and user stories',
      'Decision tracking with rationale across sessions',
      'Roadmap planning and stakeholder communication',
    ],
    wontDo: 'Will not write production code or deploy infrastructure.',
```

- [ ] **Step 12: Add tagline/bestFor/wontDo to hr-manager**

```typescript
    tagline: 'Policy-first, compliance-aware, people-focused.',
    bestFor: [
      'Onboarding checklists and new hire documentation',
      'Policy compliance review and employee communications',
      'Job descriptions with role-specific competencies',
    ],
    wontDo: 'Will not provide binding legal advice — always flags when legal review is needed.',
```

- [ ] **Step 13: Add tagline/bestFor/wontDo to legal-professional**

```typescript
    tagline: 'Precise language, jurisdiction-aware, always flags assumptions.',
    bestFor: [
      'Contract clause analysis and risk identification',
      'Compliance checklists and regulatory research',
      'Legal correspondence drafting with appropriate caveats',
    ],
    wontDo: 'Will not provide binding legal advice or represent attorney-client privilege. Always includes assumptions and recommends lawyer review.',
```

- [ ] **Step 14: Add tagline/bestFor/wontDo to finance-owner**

```typescript
    tagline: 'Numbers with assumptions stated, projections with sensitivity.',
    bestFor: [
      'Budget analysis and cash flow projections',
      'Variance analysis with explicit assumptions',
      'Financial reporting with consistent formatting',
    ],
    wontDo: 'Will not present financial projections without stating key assumptions and sensitivity factors.',
```

- [ ] **Step 15: Add tagline/bestFor/wontDo to consultant**

```typescript
    tagline: 'Structures everything, cites everything, executive summary first.',
    bestFor: [
      'Client deliverables with structured frameworks (MECE, Porter, SWOT)',
      'Multi-source research synthesis with citation tracking',
      'Executive summaries and strategic recommendations',
    ],
    wontDo: 'Will not deliver analysis without an executive summary. Conclusions first, evidence below.',
```

- [ ] **Step 16: Run test to verify all pass**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: PASS — all 17 personas have required fields

- [ ] **Step 17: Commit**

```bash
git add packages/agent/src/personas.ts packages/agent/tests/personas.test.ts
git commit -m "feat(personas): fill tagline/bestFor/wontDo on all 13 domain personas"
```

---

### Task 2: Soften tool restrictions on non-structural personas

**Files:**
- Modify: `packages/agent/src/personas.ts` — researcher, analyst personas

The new model: only Planner, Verifier, and Coordinator keep hard `disallowedTools` (structural roles where restriction IS the feature). Researcher and Analyst become "soft read-only" — system prompt discourages writes but tools remain available.

- [ ] **Step 1: Write the failing test**

Add to `packages/agent/tests/personas.test.ts`:

```typescript
describe('Soft tool model', () => {
  const HARD_READONLY_IDS = ['planner', 'verifier', 'coordinator'];

  it('only structural personas have isReadOnly: true', () => {
    for (const p of PERSONAS) {
      if (HARD_READONLY_IDS.includes(p.id)) {
        // Planner and Verifier must be hard read-only
        if (p.id !== 'coordinator') {
          expect(p.isReadOnly, `${p.id} should be isReadOnly`).toBe(true);
        }
      } else {
        expect(p.isReadOnly, `${p.id} should NOT be hard read-only`).toBeFalsy();
      }
    }
  });

  it('researcher has write tools available (soft model)', () => {
    const researcher = getPersona('researcher');
    expect(researcher).toBeTruthy();
    expect(researcher!.disallowedTools).toBeUndefined();
  });

  it('analyst has write tools available (soft model)', () => {
    const analyst = getPersona('analyst');
    expect(analyst).toBeTruthy();
    expect(analyst!.disallowedTools).toBeUndefined();
  });

  it('planner still has hard disallowedTools', () => {
    const planner = getPersona('planner');
    expect(planner!.disallowedTools).toBeDefined();
    expect(planner!.disallowedTools).toContain('write_file');
  });

  it('verifier still has hard disallowedTools', () => {
    const verifier = getPersona('verifier');
    expect(verifier!.disallowedTools).toBeDefined();
    expect(verifier!.disallowedTools).toContain('write_file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: FAIL — researcher and analyst still have isReadOnly and disallowedTools

- [ ] **Step 3: Soften researcher persona**

In `packages/agent/src/personas.ts`, on the `researcher` persona:

1. Change `isReadOnly: true` to remove the line (or set `isReadOnly: false`)
2. Remove `disallowedTools: ['write_file', 'edit_file', 'git_commit', 'git_push']`
3. Add `write_file` and `generate_docx` to `tools[]`
4. Update systemPrompt: replace the `=== READ-ONLY PERSONA ===` block with:

```typescript
    systemPrompt: `## Persona: Researcher
You specialize in deep investigation and multi-source synthesis.
- Always cite sources when presenting findings
- Use web_search and web_fetch for external research
- Cross-reference memory for prior relevant findings
- Present findings in structured format with confidence levels
- When unsure, say so and suggest further investigation paths
- Prefer depth over breadth — thorough analysis of fewer sources beats shallow coverage of many
- Include a brief professional disclaimer ONLY when your findings cover regulatory, legal, financial, or medical topics. Do NOT add disclaimers to casual conversation, simple factual questions, or topics outside these domains.

### Working Style
Your primary job is to FIND and SYNTHESIZE information. When the user asks you to write a document or create a file, you CAN do it — but suggest that switching to Writer might give a better result for long-form content. For quick saves and summaries, go ahead and write.`,
```

- [ ] **Step 4: Soften analyst persona**

Same pattern: remove `isReadOnly: true`, remove `disallowedTools`, update systemPrompt to remove `=== ANALYSIS-ONLY PERSONA ===` block and replace with soft guidance.

- [ ] **Step 5: Run test to verify all pass**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/agent/src/personas.ts packages/agent/tests/personas.test.ts
git commit -m "feat(personas): adopt soft tool model — only structural roles keep hard restrictions"
```

---

### Task 3: Add 5 new domain personas

**Files:**
- Modify: `packages/agent/src/personas.ts` — add after the coordinator persona (line ~742)

- [ ] **Step 1: Write the failing test**

Add to `packages/agent/tests/personas.test.ts`:

```typescript
describe('New domain personas', () => {
  const NEW_IDS = ['support-agent', 'ops-manager', 'data-engineer', 'recruiter', 'creative-director'];

  for (const id of NEW_IDS) {
    it(`${id} exists and has complete fields`, () => {
      const p = getPersona(id);
      expect(p, `${id} not found`).toBeTruthy();
      expect(p!.tagline).toBeTruthy();
      expect(p!.bestFor?.length).toBe(3);
      expect(p!.wontDo).toBeTruthy();
      expect(p!.failurePatterns?.length).toBeGreaterThanOrEqual(3);
      expect(p!.systemPrompt.length).toBeGreaterThan(100);
      expect(p!.tools.length).toBeGreaterThan(3);
    });
  }

  it('total persona count is 22', () => {
    expect(PERSONAS.length).toBe(22);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: FAIL — 5 personas not found, count is 17 not 22

- [ ] **Step 3: Add support-agent persona**

Add to `packages/agent/src/personas.ts` after the coordinator persona:

```typescript
  // ── 5 new domain specialists ──────────────────────────────────────────

  {
    id: 'support-agent',
    name: 'Customer Support',
    description: 'Ticket resolution, knowledge base management, escalation handling',
    icon: '🎧',
    tagline: 'Resolves fast, escalates smart, turns tickets into KB articles.',
    bestFor: [
      'Resolving customer issues using knowledge base and memory',
      'Drafting professional support responses with empathy',
      'Creating KB articles from resolved tickets for future deflection',
    ],
    wontDo: 'Will not resolve tickets without checking existing KB and memory for prior solutions first.',
    systemPrompt: `## Persona: Customer Support
You specialize in customer issue resolution, knowledge management, and escalation handling.
- ALWAYS search memory first for similar resolved issues before drafting a response
- Draft responses that are empathetic, clear, and solution-focused
- When you resolve a novel issue, save the solution to memory as a KB article
- If you cannot resolve an issue, create an escalation package: customer context, steps tried, error details, and suggested next steps
- Track customer sentiment — flag frustrated or at-risk customers
- Use structured formats: Problem → Investigation → Solution → Follow-up`,
    modelPreference: 'claude-sonnet-4-6',
    tools: ['search_memory', 'save_memory', 'web_search', 'web_fetch', 'read_file', 'write_file', 'generate_docx', 'create_plan', 'add_plan_step', 'show_plan'],
    workspaceAffinity: ['support', 'customer-success', 'helpdesk', 'service'],
    suggestedSkills: [],
    suggestedConnectors: ['slack', 'gmail', 'hubspot'],
    suggestedMcpServers: [],
    suggestedCommands: ['/draft', '/research', '/catchup'],
    defaultWorkflow: null,
    failurePatterns: [
      'Resolving without checking KB / memory for existing solutions first.',
      'Escalating without packaging context — customer history, steps tried, error details.',
      'Generic responses when customer-specific context exists in memory.',
    ],
  },
```

- [ ] **Step 4: Add ops-manager persona**

```typescript
  {
    id: 'ops-manager',
    name: 'Operations Manager',
    description: 'Process documentation, SOP creation, vendor management, operational excellence',
    icon: '⚙️',
    tagline: 'Processes, SOPs, and vendor management — operational excellence.',
    bestFor: [
      'Creating and maintaining Standard Operating Procedures',
      'Vendor evaluation with weighted scoring criteria',
      'Process optimization and bottleneck identification',
    ],
    wontDo: 'Will not design processes without measuring the current baseline first.',
    systemPrompt: `## Persona: Operations Manager
You specialize in process design, documentation, vendor management, and operational efficiency.
- Always start with understanding the current state before proposing changes
- Create SOPs with version numbers, owners, review dates, and step-by-step procedures
- Use frameworks for vendor evaluation: weighted scoring, risk assessment, total cost of ownership
- Document processes with clear inputs, outputs, decision points, and exception handling
- Save all process documents and vendor evaluations to memory for organizational knowledge
- Use create_plan for multi-step process improvement initiatives`,
    modelPreference: 'claude-sonnet-4-6',
    tools: ['search_memory', 'save_memory', 'read_file', 'write_file', 'generate_docx', 'create_plan', 'add_plan_step', 'execute_step', 'show_plan', 'web_search'],
    workspaceAffinity: ['operations', 'process', 'procurement', 'logistics'],
    suggestedSkills: [],
    suggestedConnectors: ['notion', 'slack', 'asana', 'airtable'],
    suggestedMcpServers: [],
    suggestedCommands: ['/plan', '/draft', '/decide'],
    defaultWorkflow: 'plan-execute',
    failurePatterns: [
      'Designing processes without measuring the current baseline first.',
      'SOPs without version numbers, owners, and review dates.',
      'Vendor evaluations without weighted scoring criteria.',
    ],
  },
```

- [ ] **Step 5: Add data-engineer persona**

```typescript
  {
    id: 'data-engineer',
    name: 'Data Engineer',
    description: 'SQL queries, data pipelines, dashboard design, data quality',
    icon: '📈',
    tagline: 'SQL, pipelines, dashboards — makes data accessible and trustworthy.',
    bestFor: [
      'Writing and optimizing SQL queries across databases',
      'Data exploration, profiling, and quality assessment',
      'Dashboard design and data visualization planning',
    ],
    wontDo: 'Will not write queries without exploring the schema first — always checks table structure before SELECT.',
    systemPrompt: `## Persona: Data Engineer
You specialize in data access, SQL, pipeline design, and making data useful for decision-makers.
- ALWAYS explore the schema before writing queries — SHOW TABLES, DESCRIBE, sample rows
- Write queries that are readable: CTEs over subqueries, meaningful aliases, comments on complex logic
- When presenting data, include column explanations, data freshness, and row counts
- Save working queries to memory so they can be reused in future sessions
- For data quality issues, document: what is wrong, how many rows affected, suggested fix
- Use bash for CSV/JSON processing when appropriate (csvkit, jq, awk)`,
    modelPreference: 'claude-sonnet-4-6',
    tools: ['bash', 'read_file', 'write_file', 'edit_file', 'search_files', 'search_content', 'search_memory', 'save_memory', 'web_search', 'generate_docx'],
    workspaceAffinity: ['data', 'analytics', 'bi', 'reporting'],
    suggestedSkills: [],
    suggestedConnectors: ['postgres', 'gsheets', 'airtable'],
    suggestedMcpServers: ['sqlite', 'postgres'],
    suggestedCommands: ['/research', '/draft'],
    defaultWorkflow: null,
    failurePatterns: [
      'Writing queries without exploring the schema first — always check table structure.',
      'Presenting raw data without context — every output needs column explanations and data freshness.',
      'Not saving working queries to memory — next session starts from scratch.',
    ],
  },
```

- [ ] **Step 6: Add recruiter persona**

```typescript
  {
    id: 'recruiter',
    name: 'Recruiter',
    description: 'Talent sourcing, candidate screening, job descriptions, interview preparation',
    icon: '🤝',
    tagline: 'Sources, screens, and manages candidates through the full pipeline.',
    bestFor: [
      'Writing job descriptions with role-specific competencies',
      'Candidate sourcing and screening with structured scorecards',
      'Interview preparation with role-relevant questions and rubrics',
    ],
    wontDo: 'Will not screen candidates without a structured scorecard — every candidate assessed on the same criteria.',
    systemPrompt: `## Persona: Recruiter
You specialize in talent acquisition — sourcing, screening, job descriptions, and interview preparation.
- Write job descriptions with clear requirements, competencies, and success criteria
- Create structured screening scorecards so every candidate is assessed consistently
- Prepare interview question sets tailored to the role with evaluation rubrics
- Track candidate pipeline stages in memory — source, screen, interview, offer
- Research candidates and companies using web search before outreach
- Save candidate profiles and hiring decisions to memory for future reference`,
    modelPreference: 'claude-sonnet-4-6',
    tools: ['web_search', 'web_fetch', 'search_memory', 'save_memory', 'read_file', 'write_file', 'generate_docx', 'create_plan', 'add_plan_step', 'show_plan'],
    workspaceAffinity: ['recruiting', 'hiring', 'talent', 'hr'],
    suggestedSkills: [],
    suggestedConnectors: ['gmail', 'notion', 'slack'],
    suggestedMcpServers: [],
    suggestedCommands: ['/draft', '/research', '/plan'],
    defaultWorkflow: null,
    failurePatterns: [
      'Job descriptions without role-specific competencies and success criteria.',
      'Screening without a structured scorecard — every candidate must be assessed on same criteria.',
      'Not saving candidate context to memory — recruiter should recall prior interactions.',
    ],
  },
```

- [ ] **Step 7: Add creative-director persona**

```typescript
  {
    id: 'creative-director',
    name: 'Creative Director',
    description: 'Creative briefs, feedback synthesis, brand consistency, design direction',
    icon: '🎨',
    tagline: 'Briefs, feedback synthesis, and brand consistency guardian.',
    bestFor: [
      'Writing creative briefs with clear objectives and constraints',
      'Synthesizing feedback from multiple stakeholders by theme',
      'Brand voice and visual consistency auditing',
    ],
    wontDo: 'Will not create deliverables without checking brand guidelines in memory first.',
    systemPrompt: `## Persona: Creative Director
You specialize in creative direction — briefs, feedback management, brand consistency, and design thinking.
- Always check memory for brand guidelines, style guides, and prior creative decisions before creating
- Write creative briefs with: objective, audience, key message, tone, deliverables, timeline, constraints
- When synthesizing feedback, categorize by theme before applying — never apply contradictory feedback without flagging it
- Track creative versions — every major revision gets a version note in memory
- Use the review-pair workflow for draft → critique → revise cycles
- Reference web inspiration and competitor creative when relevant`,
    modelPreference: 'claude-sonnet-4-6',
    tools: ['search_memory', 'save_memory', 'web_search', 'web_fetch', 'read_file', 'write_file', 'generate_docx'],
    workspaceAffinity: ['design', 'creative', 'brand', 'marketing'],
    suggestedSkills: [],
    suggestedConnectors: ['notion', 'slack', 'gdrive'],
    suggestedMcpServers: [],
    suggestedCommands: ['/draft', '/review', '/research'],
    defaultWorkflow: 'review-pair',
    failurePatterns: [
      'Creating without checking brand guidelines in memory first.',
      'Feedback rounds without structured synthesis — always categorize feedback by theme before applying.',
      'Delivering without version tracking — every creative output needs a version note.',
    ],
  },
```

- [ ] **Step 8: Run test to verify all pass**

Run: `npx vitest run packages/agent/tests/personas.test.ts`
Expected: PASS — 22 personas, all with complete fields

- [ ] **Step 9: Commit**

```bash
git add packages/agent/src/personas.ts packages/agent/tests/personas.test.ts
git commit -m "feat(personas): add 5 new domain specialists — support, ops, data, recruiter, creative"
```

---

### Task 4: Expand templates 8→15 and update TEMPLATE_PERSONA map

**Files:**
- Modify: `apps/web/src/components/os/overlays/OnboardingWizard.tsx:26-47`

- [ ] **Step 1: Replace TEMPLATES array**

In `OnboardingWizard.tsx`, add these imports at the top (alongside existing Lucide imports):

```typescript
import {
  ChevronRight, Brain, Layers, Wrench, Upload,
  Target, Microscope, Laptop, Megaphone, Rocket, Scale, Building, Plus,
  PenLine, BarChart3, Code, ClipboardList, Mail,
  Key, Check, Loader2, ExternalLink, Hexagon, Sparkles, FileJson,
  Zap, Crown,
  HeadphonesIcon, Settings, Database, Users, Palette,
  DollarSign, Briefcase,
} from 'lucide-react';
```

Then replace the TEMPLATES array (lines 26-35):

```typescript
const TEMPLATES = [
  { id: 'sales-pipeline', name: 'Sales Pipeline', icon: Target, hint: 'Research the top 5 competitors in my industry', desc: 'Track deals and prospects' },
  { id: 'research-project', name: 'Research Hub', icon: Microscope, hint: 'Help me design a literature review on my topic', desc: 'Deep dive into any subject' },
  { id: 'code-review', name: 'Engineering', icon: Laptop, hint: 'Read my project and tell me what you see', desc: 'Code, review, and ship' },
  { id: 'marketing-campaign', name: 'Marketing & Content', icon: Megaphone, hint: 'Draft a campaign brief for my product launch', desc: 'Campaigns, copy, and SEO' },
  { id: 'product-launch', name: 'Product Management', icon: Rocket, hint: 'Help me write a PRD for my next feature', desc: 'Specs, roadmaps, and launches' },
  { id: 'legal-review', name: 'Legal & Compliance', icon: Scale, hint: 'Draft a standard NDA template', desc: 'Contracts, compliance, and risk' },
  { id: 'agency-consulting', name: 'Consulting', icon: Building, hint: 'Set up client workspaces for my biggest accounts', desc: 'Client delivery and strategy' },
  { id: 'customer-support', name: 'Customer Support', icon: HeadphonesIcon, hint: 'Help me draft a response to this customer issue', desc: 'Tickets, KB, and escalation' },
  { id: 'finance-accounting', name: 'Finance', icon: DollarSign, hint: 'Prepare a variance analysis for this month', desc: 'Budgets, reports, and close' },
  { id: 'hr-people', name: 'HR & People', icon: Users, hint: 'Draft a job description for a senior engineer', desc: 'Hiring, policy, and onboarding' },
  { id: 'operations-center', name: 'Operations', icon: Settings, hint: 'Create an SOP for our onboarding process', desc: 'Processes, SOPs, and vendors' },
  { id: 'data-analytics', name: 'Data & Analytics', icon: Database, hint: 'Write a SQL query to find our top customers', desc: 'SQL, dashboards, and insights' },
  { id: 'recruiting-pipeline', name: 'Recruiting', icon: Briefcase, hint: 'Write a job description and screening scorecard', desc: 'Source, screen, and hire' },
  { id: 'design-studio', name: 'Design Studio', icon: Palette, hint: 'Write a creative brief for our rebrand', desc: 'Briefs, feedback, and brand' },
  { id: 'blank', name: 'Blank Workspace', icon: Plus, hint: 'Hello! What can you help me with?', desc: 'Start from scratch' },
] as const;
```

- [ ] **Step 2: Update TEMPLATE_PERSONA map**

Replace the TEMPLATE_PERSONA object (lines 37-46):

```typescript
const TEMPLATE_PERSONA: Record<string, string> = {
  'sales-pipeline': 'sales-rep',
  'research-project': 'researcher',
  'code-review': 'coder',
  'marketing-campaign': 'marketer',
  'product-launch': 'product-manager-senior',
  'legal-review': 'legal-professional',
  'agency-consulting': 'consultant',
  'customer-support': 'support-agent',
  'finance-accounting': 'finance-owner',
  'hr-people': 'hr-manager',
  'operations-center': 'ops-manager',
  'data-analytics': 'data-engineer',
  'recruiting-pipeline': 'recruiter',
  'design-studio': 'creative-director',
  'blank': 'general-purpose',
};
```

- [ ] **Step 3: Update template grid layout**

The grid is `grid-cols-4` (line 579). With 15 templates, change to `grid-cols-5 gap-2` so it fits in 3 rows of 5:

```typescript
<div className="grid grid-cols-5 gap-2 mb-5">
```

Also update the button padding to be slightly more compact for 5 columns:

```typescript
className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center ${
```

- [ ] **Step 4: Replace ONBOARDING_PERSONAS with template-aware dynamic list**

Replace the static ONBOARDING_PERSONAS array (lines 48-57) with a dynamic function that shows personas relevant to the selected template:

```typescript
const ALL_ONBOARDING_PERSONAS = [
  // Universal (always shown first)
  { id: 'general-purpose', name: 'General Purpose', icon: Brain, desc: 'Adapts to any task', tier: 'universal' as const },
  // Knowledge workers
  { id: 'researcher', name: 'Researcher', icon: Microscope, desc: 'Deep research & synthesis', tier: 'knowledge' as const },
  { id: 'writer', name: 'Writer', icon: PenLine, desc: 'Drafting & editing', tier: 'knowledge' as const },
  { id: 'analyst', name: 'Analyst', icon: BarChart3, desc: 'Data analysis & decisions', tier: 'knowledge' as const },
  { id: 'coder', name: 'Coder', icon: Code, desc: 'Code & architecture', tier: 'knowledge' as const },
  // Domain (shown based on template)
  { id: 'project-manager', name: 'Project Manager', icon: ClipboardList, desc: 'Planning & coordination', tier: 'domain' as const },
  { id: 'executive-assistant', name: 'Exec Assistant', icon: Mail, desc: 'Email & scheduling', tier: 'domain' as const },
  { id: 'sales-rep', name: 'Sales Rep', icon: Target, desc: 'Prospecting & outreach', tier: 'domain' as const },
  { id: 'marketer', name: 'Marketer', icon: Megaphone, desc: 'Campaigns & copy', tier: 'domain' as const },
  { id: 'product-manager-senior', name: 'Senior PM', icon: Rocket, desc: 'PRDs & roadmaps', tier: 'domain' as const },
  { id: 'hr-manager', name: 'HR Manager', icon: Users, desc: 'Policy & compliance', tier: 'domain' as const },
  { id: 'legal-professional', name: 'Legal Counsel', icon: Scale, desc: 'Contracts & compliance', tier: 'domain' as const },
  { id: 'finance-owner', name: 'Business Finance', icon: DollarSign, desc: 'Budgets & reporting', tier: 'domain' as const },
  { id: 'consultant', name: 'Consultant', icon: Building, desc: 'Strategy & deliverables', tier: 'domain' as const },
  { id: 'support-agent', name: 'Support Agent', icon: HeadphonesIcon, desc: 'Tickets & KB articles', tier: 'domain' as const },
  { id: 'ops-manager', name: 'Ops Manager', icon: Settings, desc: 'SOPs & processes', tier: 'domain' as const },
  { id: 'data-engineer', name: 'Data Engineer', icon: Database, desc: 'SQL & dashboards', tier: 'domain' as const },
  { id: 'recruiter', name: 'Recruiter', icon: Briefcase, desc: 'Sourcing & hiring', tier: 'domain' as const },
  { id: 'creative-director', name: 'Creative Director', icon: Palette, desc: 'Briefs & brand', tier: 'domain' as const },
] as const;

/** Get personas relevant to the selected template — recommended first, then others */
function getPersonasForTemplate(templateId: string) {
  const recommended = TEMPLATE_PERSONA[templateId];
  const universal = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'universal');
  const knowledge = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'knowledge');
  const domain = ALL_ONBOARDING_PERSONAS.filter(p => p.tier === 'domain');
  // Put the recommended persona first, then universal, then knowledge, then rest
  const sorted = [
    ...domain.filter(p => p.id === recommended),
    ...universal,
    ...knowledge,
    ...domain.filter(p => p.id !== recommended),
  ];
  return sorted;
}
```

- [ ] **Step 5: Update persona grid rendering**

In step 5 of the wizard (line ~659), replace `ONBOARDING_PERSONAS.map` with the dynamic list:

```typescript
<div className="grid grid-cols-4 gap-2 max-h-[280px] overflow-y-auto mb-4">
  {getPersonasForTemplate(selectedTemplate).map((p) => {
    const Icon = p.icon;
    const selected = selectedPersona === p.id;
    const isRecommended = TEMPLATE_PERSONA[selectedTemplate] === p.id;
    return (
      <button
        key={p.id}
        onClick={() => { setSelectedPersona(p.id); setShowCustomPersona(false); }}
        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all relative ${
          selected
            ? 'border-primary/60 bg-primary/10'
            : 'border-border/40 bg-secondary/20 hover:border-border'
        }`}
      >
        {isRecommended && (
          <span className="absolute -top-1.5 -right-1.5 text-[8px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">
            REC
          </span>
        )}
        <Icon className={`w-5 h-5 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
        <span className={`text-[11px] font-display font-medium leading-tight ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {p.name}
        </span>
        <span className="text-[9px] text-muted-foreground/70 leading-tight">{p.desc}</span>
      </button>
    );
  })}
</div>
```

- [ ] **Step 6: Verify template grid renders at correct size**

Run the app and check that:
- 15 template cards fit in 3 rows of 5
- Persona grid shows recommended persona with "REC" badge
- Template → persona auto-mapping works for all 15 templates

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/os/overlays/OnboardingWizard.tsx
git commit -m "feat(onboarding): expand to 15 templates, connect to full 22-persona system"
```

---

### Task 5: PersonaSwitcher two-tier redesign

**Files:**
- Modify: `apps/web/src/components/os/overlays/PersonaSwitcher.tsx`

- [ ] **Step 1: Add persona tier classification**

Add at the top of PersonaSwitcher.tsx, after the imports:

```typescript
const UNIVERSAL_IDS = ['general-purpose', 'planner', 'verifier', 'coordinator'];
const KNOWLEDGE_IDS = ['researcher', 'writer', 'analyst', 'coder'];

/** Classify a persona into display tier */
function getPersonaTier(id: string): 'universal' | 'knowledge' | 'domain' {
  if (UNIVERSAL_IDS.includes(id)) return 'universal';
  if (KNOWLEDGE_IDS.includes(id)) return 'knowledge';
  return 'domain';
}
```

- [ ] **Step 2: Add workspace persona prop**

Update the PersonaSwitcherProps interface to accept the current workspace's template:

```typescript
interface PersonaSwitcherProps {
  open: boolean;
  onClose: () => void;
  currentPersona?: string;
  currentGroupId?: string;
  onSelect: (personaId: string) => void;
  onSelectGroup?: (groupId: string) => void;
  workspaceTemplate?: string;
}
```

- [ ] **Step 3: Rewrite the agents tab with two-tier layout**

Replace the agents tab content (the `grid grid-cols-2` block, lines 118-154) with:

```typescript
          ) : tab === 'agents' ? (
            <div className="max-h-[380px] overflow-y-auto scrollbar-thin space-y-4">
              {/* Section 1: Universal Modes */}
              <div>
                <h3 className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Universal Modes
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {personas
                    .filter(p => UNIVERSAL_IDS.includes(p.id))
                    .map(p => renderPersonaCard(p, isLocked(p.id)))}
                </div>
              </div>

              {/* Section 2: Knowledge Workers */}
              <div>
                <h3 className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Knowledge Workers
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {personas
                    .filter(p => KNOWLEDGE_IDS.includes(p.id))
                    .map(p => renderPersonaCard(p, isLocked(p.id)))}
                </div>
              </div>

              {/* Section 3: Domain Specialists */}
              <div>
                <h3 className="text-[10px] font-display font-bold text-muted-foreground uppercase tracking-wider mb-2 px-1">
                  Specialists
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {personas
                    .filter(p => getPersonaTier(p.id) === 'domain')
                    .map(p => renderPersonaCard(p, isLocked(p.id)))}
                </div>
              </div>

              {!allPersonasUnlocked && (
                <p className="text-[10px] text-muted-foreground text-center py-1">
                  Upgrade to Teams to unlock all personas
                </p>
              )}
            </div>
```

- [ ] **Step 4: Extract renderPersonaCard helper**

Add this inside the component, before the return:

```typescript
  const isLocked = (id: string) => !allPersonasUnlocked && !FREE_PERSONA_IDS.includes(id);

  const renderPersonaCard = (p: typeof personas[0], locked: boolean) => (
    <button
      key={p.id}
      onClick={() => { if (!locked) { onSelect(p.id); onClose(); } }}
      disabled={locked}
      className={`flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
        locked
          ? 'bg-secondary/20 border border-transparent opacity-50 cursor-not-allowed'
          : currentPersona === p.id && !currentGroupId
          ? 'bg-primary/20 border border-primary/50'
          : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
      }`}
      title={p.description}
    >
      <Avatar className="w-10 h-10 shrink-0">
        {p.avatar ? <AvatarImage src={p.avatar} /> : (
          <AvatarFallback className="text-[10px] bg-primary/20">{p.icon || p.name[0]}</AvatarFallback>
        )}
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <p className="text-xs font-display font-medium text-foreground truncate">{p.name}</p>
          {locked && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
      </div>
    </button>
  );
```

- [ ] **Step 5: Verify two-tier layout renders correctly**

Run the app and check:
- PersonaSwitcher shows 3 sections: Universal Modes, Knowledge Workers, Specialists
- Universal shows: General Purpose, Planner, Verifier, Coordinator
- Knowledge shows: Researcher, Writer, Analyst, Coder
- Specialists shows remaining 14 personas
- Current persona is highlighted

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/os/overlays/PersonaSwitcher.tsx
git commit -m "feat(persona-switcher): two-tier layout — Universal / Knowledge / Specialists"
```

---

### Task 6: Add 2 new workflow templates

**Files:**
- Modify: `packages/agent/src/workflow-templates.ts:104-114`
- Modify: `packages/agent/src/index.ts`

- [ ] **Step 1: Write the failing test**

Add to a new file `packages/agent/tests/workflow-templates-new.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { WORKFLOW_TEMPLATES, listWorkflowTemplates } from '../src/workflow-templates.js';

describe('New workflow templates', () => {
  it('ticket-resolve template exists', () => {
    expect(WORKFLOW_TEMPLATES['ticket-resolve']).toBeDefined();
    const template = WORKFLOW_TEMPLATES['ticket-resolve']('Test ticket');
    expect(template.name).toBe('ticket-resolve');
    expect(template.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('content-pipeline template exists', () => {
    expect(WORKFLOW_TEMPLATES['content-pipeline']).toBeDefined();
    const template = WORKFLOW_TEMPLATES['content-pipeline']('Test content');
    expect(template.name).toBe('content-pipeline');
    expect(template.steps.length).toBeGreaterThanOrEqual(3);
  });

  it('lists all 5 templates', () => {
    const names = listWorkflowTemplates();
    expect(names).toContain('research-team');
    expect(names).toContain('review-pair');
    expect(names).toContain('plan-execute');
    expect(names).toContain('ticket-resolve');
    expect(names).toContain('content-pipeline');
    expect(names.length).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/agent/tests/workflow-templates-new.test.ts`
Expected: FAIL — templates not found

- [ ] **Step 3: Add ticket-resolve workflow**

In `workflow-templates.ts`, add before the `WORKFLOW_TEMPLATES` registry:

```typescript
export function createTicketResolveTemplate(task: string): WorkflowTemplate {
  return {
    name: 'ticket-resolve',
    description: 'Support workflow: triage → investigate → draft response → verify',
    steps: [
      {
        name: 'Triage',
        role: 'analyst',
        task: `Analyze this customer issue and classify it by severity, category, and required expertise:\n\n${task}\n\nSearch memory for similar resolved issues. Output: severity (P1-P4), category, similar past cases, initial diagnosis.`,
        maxTurns: 10,
      },
      {
        name: 'Investigator',
        role: 'researcher',
        task: `Investigate this customer issue using all available sources (KB, memory, web):\n\n${task}\n\nFind the root cause and a proven solution. Check memory for known fixes.`,
        dependsOn: ['Triage'],
        contextFrom: ['Triage'],
        maxTurns: 20,
      },
      {
        name: 'Responder',
        role: 'writer',
        task: `Draft a professional, empathetic support response that resolves this issue:\n\n${task}\n\nInclude: acknowledgment, solution steps, verification instructions, and follow-up offer.`,
        dependsOn: ['Investigator'],
        contextFrom: ['Triage', 'Investigator'],
        maxTurns: 15,
      },
    ],
    aggregation: 'last',
  };
}
```

- [ ] **Step 4: Add content-pipeline workflow**

```typescript
export function createContentPipelineTemplate(task: string): WorkflowTemplate {
  return {
    name: 'content-pipeline',
    description: 'Content creation: research → outline → draft → edit → polish',
    steps: [
      {
        name: 'Researcher',
        role: 'researcher',
        task: `Research background, data points, and competitor content for:\n\n${task}\n\nProvide organized findings with sources, key statistics, and angles to explore.`,
        maxTurns: 20,
      },
      {
        name: 'Drafter',
        role: 'writer',
        task: `Write a comprehensive first draft incorporating the research findings:\n\n${task}\n\nFocus on completeness, accuracy, and engaging structure.`,
        dependsOn: ['Researcher'],
        contextFrom: ['Researcher'],
        maxTurns: 25,
      },
      {
        name: 'Editor',
        role: 'reviewer',
        task: `Edit this draft for clarity, flow, accuracy, and audience fit. Provide the polished final version:\n\n${task}`,
        dependsOn: ['Drafter'],
        contextFrom: ['Researcher', 'Drafter'],
        maxTurns: 15,
      },
    ],
    aggregation: 'last',
  };
}
```

- [ ] **Step 5: Register in WORKFLOW_TEMPLATES**

Update the registry object:

```typescript
export const WORKFLOW_TEMPLATES: Record<string, (task: string) => WorkflowTemplate> = {
  'research-team': createResearchTeamTemplate,
  'review-pair': createReviewPairTemplate,
  'plan-execute': createPlanExecuteTemplate,
  'ticket-resolve': createTicketResolveTemplate,
  'content-pipeline': createContentPipelineTemplate,
};
```

- [ ] **Step 6: Export new factories from index.ts**

In `packages/agent/src/index.ts`, update the workflow-templates export line:

```typescript
export { WORKFLOW_TEMPLATES, listWorkflowTemplates, createResearchTeamTemplate, createReviewPairTemplate, createPlanExecuteTemplate, createTicketResolveTemplate, createContentPipelineTemplate } from './workflow-templates.js';
```

- [ ] **Step 7: Run test to verify all pass**

Run: `npx vitest run packages/agent/tests/workflow-templates-new.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/agent/src/workflow-templates.ts packages/agent/src/index.ts packages/agent/tests/workflow-templates-new.test.ts
git commit -m "feat(workflows): add ticket-resolve and content-pipeline workflow templates"
```

---

### Task 7: Final verification

**Files:** None (verification only)

- [ ] **Step 1: TypeScript compilation**

```bash
npx tsc --noEmit --project packages/agent/tsconfig.json
npx tsc --noEmit --project packages/server/tsconfig.json
```
Expected: 0 errors for both

- [ ] **Step 2: Run all related tests**

```bash
npx vitest run packages/agent/tests/personas.test.ts packages/agent/tests/workflow-templates-new.test.ts packages/agent/tests/context-compressor.test.ts packages/agent/tests/credential-pool.test.ts packages/agent/tests/cron-delivery-router.test.ts packages/agent/tests/tool-filter.test.ts packages/agent/tests/iteration-budget.test.ts packages/agent/tests/smart-router.test.ts
```
Expected: All tests pass

- [ ] **Step 3: Final commit and push**

```bash
git push
```
