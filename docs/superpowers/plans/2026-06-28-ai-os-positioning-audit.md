# AI OS Positioning Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a report-mode Playwright E2E audit that grades Waggle across five personas for AI OS positioning, addiction/return signals, competitor comparability, and prioritized improvement areas.

**Architecture:** Add one self-contained Playwright spec that probes the existing app shell and API surfaces, scores deterministic evidence, and writes Markdown plus JSON artifacts through Playwright's per-test output directory. The audit passes when report generation succeeds and records low product scores as findings, not test failures.

**Tech Stack:** TypeScript, Playwright test runner, Node `fs/promises`, existing `WAGGLE_E2E_BASE_URL`, existing local server from `playwright.config.ts` or `playwright-e2e.config.ts`.

---

## File Structure

- Create: `tests/e2e/ai-os-positioning-audit.spec.ts`
  - Owns persona definitions, endpoint probes, scoring functions, report rendering, artifact writing, and the Playwright test.
  - No app/product files change.
- No committed report artifacts.
  - Runtime output goes under `testInfo.outputPath('ai-os-positioning-audit.md')` and `testInfo.outputPath('ai-os-positioning-audit.json')`.
- Existing docs remain unchanged after this plan:
  - Spec source: `docs/superpowers/specs/2026-06-28-ai-os-positioning-audit-design.md`

---

### Task 1: RED - Add Audit Contract Spec Shell

**Files:**
- Create: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Write the failing report contract test**

Create `tests/e2e/ai-os-positioning-audit.spec.ts` with this initial content:

```typescript
import { expect, test } from '@playwright/test';

test.describe('AI OS positioning audit', () => {
  test('generates a report-mode audit with five personas and improvement areas', async ({ page }, testInfo) => {
    const audit = await runAiOsPositioningAudit(page, testInfo);

    expect(audit.personas).toHaveLength(5);
    expect(audit.overall.score).toBeGreaterThanOrEqual(0);
    expect(audit.overall.score).toBeLessThanOrEqual(100);
    expect(audit.overall.grade).toMatch(/AI OS|chat|niche|promising|plausible/i);
    expect(audit.addictionLevel).toMatch(/weak|emerging|strong|very strong/i);
    expect(audit.improvementAreas.length).toBeGreaterThan(0);
    expect(audit.artifacts.markdownPath).toMatch(/ai-os-positioning-audit\.md$/);
    expect(audit.artifacts.jsonPath).toMatch(/ai-os-positioning-audit\.json$/);
  });
});
```

- [ ] **Step 2: Run the spec to verify RED**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: FAIL before implementation, with a TypeScript/runtime error equivalent to `runAiOsPositioningAudit is not defined`.

- [ ] **Step 3: Commit nothing yet**

Do not commit the red state. Continue to Task 2.

---

### Task 2: GREEN - Add Data Model and Report Renderer

**Files:**
- Modify: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Add imports, types, personas, and constants above the test**

Replace the file contents with the contract test plus these declarations above it:

```typescript
import { expect, type APIRequestContext, type Page, test, type TestInfo } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';
const SKIP = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';

type DimensionId =
  | 'onboarding'
  | 'timeToValue'
  | 'memory'
  | 'workflowCoverage'
  | 'competitiveAdvantage'
  | 'addiction';

interface PersonaDefinition {
  id: string;
  name: string;
  role: string;
  currentDefault: string[];
  jobToBeDone: string;
  oneToolCriterion: string;
  memoryAnchor: string;
  memoryQuery: string;
  expectedPersonaIds: string[];
  expectedSkillTerms: string[];
  expectedConnectorTerms: string[];
  externalTriggerNeed: string;
  internalTriggerNeed: string;
  competitorBaseline: string;
}

interface DimensionScore {
  id: DimensionId;
  label: string;
  max: number;
  score: number;
  evidence: string[];
  gaps: string[];
}

interface PersonaScore {
  id: string;
  name: string;
  role: string;
  total: number;
  grade: string;
  positioning: string;
  currentDefault: string[];
  competitorBaseline: string;
  oneToolCriterion: string;
  dimensions: DimensionScore[];
  improvementAreas: string[];
}

interface ImprovementArea {
  priority: number;
  personaId: string;
  personaName: string;
  dimension: string;
  impact: number;
  recommendation: string;
  evidence: string[];
}

interface AuditResult {
  generatedAt: string;
  overall: {
    score: number;
    grade: string;
    positioningVerdict: string;
  };
  addictionLevel: string;
  personas: PersonaScore[];
  improvementAreas: ImprovementArea[];
  artifacts: {
    markdownPath: string;
    jsonPath: string;
  };
}

interface ProbeContext {
  shellLoaded: boolean;
  shellText: string;
  consoleErrors: string[];
  api: Record<string, { status: number; ok: boolean; ms: number; body: unknown }>;
  personaIds: string[];
  personaText: string;
  skillsText: string;
  connectorsText: string;
  marketplaceText: string;
  memory: Record<string, { saved: boolean; recalled: boolean; isolated: boolean; evidence: string[] }>;
}

const PERSONAS: PersonaDefinition[] = [
  {
    id: 'sofia-operator',
    name: 'Sofia',
    role: 'Small business operator',
    currentDefault: ['ChatGPT', 'Gmail', 'Canva'],
    jobToBeDone: 'Draft customer replies, campaign ideas, and supplier follow-ups.',
    oneToolCriterion: 'Daily communications and decisions happen in Waggle.',
    memoryAnchor: 'Sofia runs a neighborhood studio and prefers short, warm customer replies with clear next steps.',
    memoryQuery: 'short warm customer replies next steps',
    expectedPersonaIds: ['support-agent', 'marketer', 'executive-assistant'],
    expectedSkillTerms: ['email', 'marketing', 'document'],
    expectedConnectorTerms: ['gmail', 'google', 'slack'],
    externalTriggerNeed: 'daily brief or reply reminder',
    internalTriggerNeed: 'I need to answer customers without sounding generic',
    competitorBaseline: 'ChatGPT is fast for drafting but does not own her customer context or operating rhythm.',
  },
  {
    id: 'mara-writer',
    name: 'Mara',
    role: 'Marketing writer',
    currentDefault: ['ChatGPT', 'Claude', 'Notion AI'],
    jobToBeDone: 'Turn notes and research into branded copy.',
    oneToolCriterion: 'Voice, drafts, and campaign memory compound in Waggle.',
    memoryAnchor: 'Mara writes in a crisp, specific brand voice and tracks campaign decisions by launch.',
    memoryQuery: 'brand voice campaign decisions launch',
    expectedPersonaIds: ['writer', 'marketer', 'creative-director'],
    expectedSkillTerms: ['writing', 'brand', 'markdown'],
    expectedConnectorTerms: ['notion', 'google', 'slack'],
    externalTriggerNeed: 'weekly wins digest or draft reminder',
    internalTriggerNeed: 'I need the AI to remember my voice and the campaign angle',
    competitorBaseline: 'Claude is excellent at prose but does not act as a durable operating workspace.',
  },
  {
    id: 'imran-consultant',
    name: 'Imran',
    role: 'Independent consultant',
    currentDefault: ['Claude', 'ChatGPT', 'Gamma'],
    jobToBeDone: 'Convert calls and notes into frameworks, briefs, and follow-ups.',
    oneToolCriterion: 'Client context and recurring strategy work live in Waggle.',
    memoryAnchor: 'Imran uses 2x2 frameworks and wants every client decision remembered by account.',
    memoryQuery: '2x2 framework client decision account',
    expectedPersonaIds: ['consultant', 'researcher', 'analyst'],
    expectedSkillTerms: ['presentation', 'document', 'research'],
    expectedConnectorTerms: ['calendar', 'google', 'slack'],
    externalTriggerNeed: 'client follow-up reminder',
    internalTriggerNeed: 'What did we decide for this client last time?',
    competitorBaseline: 'Claude and Gamma help produce artifacts, but the client memory loop is fragmented.',
  },
  {
    id: 'daniel-finance',
    name: 'Daniel',
    role: 'Finance and operations analyst',
    currentDefault: ['Excel Copilot', 'ChatGPT', 'Looker'],
    jobToBeDone: 'Explain variance, summarize metrics, and prepare board commentary.',
    oneToolCriterion: 'Data commentary and recurring monthly memory live in Waggle.',
    memoryAnchor: 'Daniel prepares monthly board commentary and cares about variance drivers, ARR, NPS, and burn.',
    memoryQuery: 'monthly board commentary variance ARR NPS burn',
    expectedPersonaIds: ['finance-owner', 'analyst', 'ops-manager'],
    expectedSkillTerms: ['spreadsheet', 'csv', 'analysis'],
    expectedConnectorTerms: ['excel', 'google', 'microsoft'],
    externalTriggerNeed: 'monthly reporting reminder',
    internalTriggerNeed: 'I need a variance explanation I can defend',
    competitorBaseline: 'Excel Copilot is close to the data but weak as cross-month memory and agent workspace.',
  },
  {
    id: 'priya-power-user',
    name: 'Priya',
    role: 'AI power user',
    currentDefault: ['Claude Code', 'Codex', 'Hermes', 'OpenClaw'],
    jobToBeDone: 'Coordinate AI workflows, skills, connectors, and memory.',
    oneToolCriterion: 'Waggle is the front door for non-coding agent work.',
    memoryAnchor: 'Priya wants a non-coding AI command center with skills, connectors, memory, and agent coordination.',
    memoryQuery: 'non coding command center skills connectors agent coordination',
    expectedPersonaIds: ['coordinator', 'planner', 'verifier', 'coder'],
    expectedSkillTerms: ['skill', 'automation', 'agent'],
    expectedConnectorTerms: ['github', 'mcp', 'webhook'],
    externalTriggerNeed: 'OS hotkey, launcher, or scheduled automation',
    internalTriggerNeed: 'I need one control surface for all my AI work',
    competitorBaseline: 'Developer tools are powerful for code but do not give a non-coding AI OS cockpit.',
  },
];
```

- [ ] **Step 2: Add report helper functions below the constants**

Add these helpers:

```typescript
function clampScore(score: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(score)));
}

function gradeFor(score: number): string {
  if (score >= 90) return 'Strong AI OS position';
  if (score >= 75) return 'Strong niche AI OS fit';
  if (score >= 60) return 'Promising but still competitor-dependent';
  if (score >= 40) return 'Plausible positioning, weak product proof';
  return 'Likely perceived as another AI chat/tool wrapper';
}

function addictionLevelFor(score: number): string {
  if (score >= 85) return 'very strong';
  if (score >= 70) return 'strong';
  if (score >= 50) return 'emerging';
  return 'weak';
}

function textIncludesAny(haystack: string, needles: string[]): boolean {
  const lower = haystack.toLowerCase();
  return needles.some((needle) => lower.includes(needle.toLowerCase()));
}

function renderMarkdown(audit: AuditResult): string {
  const lines: string[] = [];
  lines.push('# Waggle AI OS Positioning Audit');
  lines.push('');
  lines.push(`Generated: ${audit.generatedAt}`);
  lines.push(`Overall score: ${audit.overall.score}/100`);
  lines.push(`Grade: ${audit.overall.grade}`);
  lines.push(`AI OS verdict: ${audit.overall.positioningVerdict}`);
  lines.push(`Addiction level: ${audit.addictionLevel}`);
  lines.push('');
  lines.push('## Persona Scores');
  lines.push('');
  lines.push('| Persona | Role | Score | Grade | Current default |');
  lines.push('|---|---|---:|---|---|');
  for (const persona of audit.personas) {
    lines.push(`| ${persona.name} | ${persona.role} | ${persona.total} | ${persona.grade} | ${persona.currentDefault.join(', ')} |`);
  }
  lines.push('');
  lines.push('## Improvement Areas');
  lines.push('');
  for (const item of audit.improvementAreas) {
    lines.push(`${item.priority}. **${item.personaName} - ${item.dimension}** (${item.impact} pts): ${item.recommendation}`);
    for (const evidence of item.evidence.slice(0, 2)) {
      lines.push(`   - Evidence: ${evidence}`);
    }
  }
  lines.push('');
  lines.push('## Persona Detail');
  for (const persona of audit.personas) {
    lines.push('');
    lines.push(`### ${persona.name} - ${persona.role}`);
    lines.push('');
    lines.push(`Score: ${persona.total}/100`);
    lines.push(`Positioning: ${persona.positioning}`);
    lines.push(`One-tool criterion: ${persona.oneToolCriterion}`);
    lines.push(`Competitor baseline: ${persona.competitorBaseline}`);
    lines.push('');
    lines.push('| Dimension | Score | Evidence | Gaps |');
    lines.push('|---|---:|---|---|');
    for (const dim of persona.dimensions) {
      lines.push(`| ${dim.label} | ${dim.score}/${dim.max} | ${dim.evidence.join('<br>')} | ${dim.gaps.join('<br>')} |`);
    }
  }
  lines.push('');
  return `${lines.join('\n')}\n`;
}
```

- [ ] **Step 3: Run the spec**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: still FAIL because `runAiOsPositioningAudit` is not implemented. This keeps the red loop honest while type definitions and rendering are in place.

---

### Task 3: GREEN - Add Deterministic Probes

**Files:**
- Modify: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Add endpoint and browser probe helpers below report helpers**

Add:

```typescript
async function timedGet(request: APIRequestContext, path: string) {
  const started = Date.now();
  const response = await request.get(`${BASE}${path}`).catch(() => null);
  const ms = Date.now() - started;
  if (!response) return { status: 0, ok: false, ms, body: null };
  const body = await response.json().catch(async () => response.text().catch(() => null));
  return { status: response.status(), ok: response.ok(), ms, body };
}

async function saveMemory(request: APIRequestContext, workspace: string, content: string): Promise<boolean> {
  const response = await request.post(`${BASE}/api/memory/frames`, {
    data: { content, workspace, source: 'user_stated', importance: 'normal' },
  }).catch(() => null);
  return !!response?.ok();
}

async function searchMemory(request: APIRequestContext, workspace: string, query: string): Promise<{ found: boolean; evidence: string[] }> {
  const response = await request.get(
    `${BASE}/api/memory/search?q=${encodeURIComponent(query)}&workspace=${encodeURIComponent(workspace)}&limit=5`,
  ).catch(() => null);
  if (!response) return { found: false, evidence: ['Memory search did not return a response.'] };
  if (!response.ok()) return { found: false, evidence: [`Memory search returned ${response.status()}.`] };
  const body = await response.json().catch(() => ({}));
  const raw = JSON.stringify(body);
  const results = body.results ?? body.recalled ?? [];
  return {
    found: Array.isArray(results) ? results.length > 0 || raw.toLowerCase().includes(query.split(' ')[0].toLowerCase()) : raw.length > 20,
    evidence: [`Memory search returned ${Array.isArray(results) ? results.length : 'unknown'} result(s).`],
  };
}

async function probeMemory(request: APIRequestContext, persona: PersonaDefinition) {
  const workspace = `ai-os-audit-${persona.id}-${Date.now()}`;
  const otherWorkspace = `${workspace}-other`;
  const saved = await saveMemory(request, workspace, persona.memoryAnchor);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const recall = await searchMemory(request, workspace, persona.memoryQuery);
  const isolation = await searchMemory(request, otherWorkspace, persona.memoryAnchor);
  return {
    saved,
    recalled: saved && recall.found,
    isolated: !isolation.found,
    evidence: [
      saved ? 'Persona memory anchor saved.' : 'Persona memory anchor could not be saved.',
      ...recall.evidence,
      isolation.found ? 'Potential cross-workspace memory leakage detected.' : 'No cross-workspace recall detected for the persona anchor.',
    ],
  };
}

async function collectProbeContext(page: Page): Promise<ProbeContext> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto(`${BASE}/home?${SKIP}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(600);
  const shellText = await page.locator('body').innerText().catch(() => '');
  const shellLoaded = shellText.length > 80 && !/error boundary|something went wrong/i.test(shellText);

  const endpoints = {
    health: '/health',
    personas: '/api/personas',
    skills: '/api/skills',
    connectors: '/api/connectors',
    marketplace: '/api/marketplace/search?query=&limit=10',
    workspaces: '/api/workspaces',
    hooks: '/api/hooks',
    fleet: '/api/fleet',
    events: '/api/events?limit=3',
    tier: '/api/tier',
  };

  const apiEntries = await Promise.all(
    Object.entries(endpoints).map(async ([key, path]) => [key, await timedGet(page.request, path)] as const),
  );
  const api = Object.fromEntries(apiEntries);
  const personaBody = api.personas?.body as { personas?: Array<{ id?: string; name?: string; description?: string }> } | unknown[];
  const personaRows = Array.isArray(personaBody) ? personaBody : Array.isArray(personaBody?.personas) ? personaBody.personas : [];
  const personaIds = personaRows.map((persona) => String(persona.id ?? ''));

  const memory: ProbeContext['memory'] = {};
  for (const persona of PERSONAS) {
    memory[persona.id] = await probeMemory(page.request, persona);
  }

  return {
    shellLoaded,
    shellText,
    consoleErrors,
    api,
    personaIds,
    personaText: JSON.stringify(api.personas?.body ?? ''),
    skillsText: JSON.stringify(api.skills?.body ?? ''),
    connectorsText: JSON.stringify(api.connectors?.body ?? ''),
    marketplaceText: JSON.stringify(api.marketplace?.body ?? ''),
    memory,
  };
}
```

- [ ] **Step 2: Run the spec**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: still FAIL because `runAiOsPositioningAudit` is not implemented.

---

### Task 4: GREEN - Add Scoring and Artifact Writing

**Files:**
- Modify: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Add scoring helpers below probe helpers**

Add:

```typescript
function scorePersona(persona: PersonaDefinition, context: ProbeContext): PersonaScore {
  const memory = context.memory[persona.id];
  const fastCoreApis = ['health', 'personas', 'workspaces'].filter((key) => context.api[key]?.ok && context.api[key].ms < 800);
  const relevantPersona = persona.expectedPersonaIds.some((id) => context.personaIds.includes(id));
  const relevantSkills = textIncludesAny(`${context.skillsText} ${context.marketplaceText}`, persona.expectedSkillTerms);
  const relevantConnectors = textIncludesAny(context.connectorsText, persona.expectedConnectorTerms);
  const osSurfaces = ['hooks', 'fleet', 'events', 'tier'].filter((key) => context.api[key]?.ok || [403, 404].includes(context.api[key]?.status ?? 0));

  const dimensions: DimensionScore[] = [
    {
      id: 'onboarding',
      label: 'Onboarding clarity',
      max: 15,
      score: clampScore((context.shellLoaded ? 10 : 0) + (context.consoleErrors.length === 0 ? 3 : 0) + (/Waggle|workspace|AI/i.test(context.shellText) ? 2 : 0), 15),
      evidence: [
        context.shellLoaded ? 'App shell loaded meaningful content.' : 'App shell did not load meaningful content.',
        `${context.consoleErrors.length} console error(s) captured on first load.`,
      ],
      gaps: [
        ...(context.shellLoaded ? [] : ['Make first-load shell resilient and clearly explain what Waggle is.']),
        ...(/AI OS|operating system/i.test(context.shellText) ? [] : ['AI OS positioning is not explicit in the loaded shell text.']),
      ],
    },
    {
      id: 'timeToValue',
      label: 'Time to first value',
      max: 15,
      score: clampScore(fastCoreApis.length * 4 + (context.api.marketplace?.ok ? 3 : 0), 15),
      evidence: fastCoreApis.map((key) => `${key} responded in ${context.api[key].ms}ms.`),
      gaps: fastCoreApis.length >= 3 ? [] : ['Core first-value APIs should respond quickly and consistently.'],
    },
    {
      id: 'memory',
      label: 'Memory and continuity',
      max: 20,
      score: clampScore((memory?.saved ? 7 : 0) + (memory?.recalled ? 8 : 0) + (memory?.isolated ? 5 : 0), 20),
      evidence: memory?.evidence ?? ['Memory probe did not run.'],
      gaps: [
        ...(memory?.saved ? [] : ['Memory anchor save failed.']),
        ...(memory?.recalled ? [] : ['Saved memory was not confidently recalled.']),
        ...(memory?.isolated ? [] : ['Workspace isolation needs clearer proof.']),
      ],
    },
    {
      id: 'workflowCoverage',
      label: 'Workflow coverage',
      max: 15,
      score: clampScore((relevantPersona ? 5 : 0) + (relevantSkills ? 5 : 0) + (relevantConnectors ? 5 : 0), 15),
      evidence: [
        relevantPersona ? 'Relevant persona is present.' : `Missing obvious persona match from ${persona.expectedPersonaIds.join(', ')}.`,
        relevantSkills ? 'Relevant skill or marketplace language found.' : `No clear skill match for ${persona.expectedSkillTerms.join(', ')}.`,
        relevantConnectors ? 'Relevant connector language found.' : `No clear connector match for ${persona.expectedConnectorTerms.join(', ')}.`,
      ],
      gaps: [
        ...(relevantPersona ? [] : ['Add or surface a persona that matches this workflow.']),
        ...(relevantSkills ? [] : ['Improve skill/template coverage for this workflow.']),
        ...(relevantConnectors ? [] : ['Improve connector coverage or setup guidance for this workflow.']),
      ],
    },
    {
      id: 'competitiveAdvantage',
      label: 'Competitive advantage',
      max: 15,
      score: clampScore((memory?.recalled ? 5 : 0) + (osSurfaces.length >= 3 ? 5 : 0) + (relevantPersona && relevantSkills ? 5 : 0), 15),
      evidence: [
        persona.competitorBaseline,
        `${osSurfaces.length}/4 OS-like surfaces responded or degraded gracefully.`,
      ],
      gaps: osSurfaces.length >= 3 && memory?.recalled ? [] : ['Make the advantage over the current default more visible and more provable.'],
    },
    {
      id: 'addiction',
      label: 'Addiction/return signal',
      max: 20,
      score: clampScore((memory?.recalled ? 7 : 0) + (context.api.events?.ok ? 3 : 0) + (context.api.hooks?.ok ? 4 : 0) + (context.api.workspaces?.ok ? 3 : 0) + (context.api.tier?.ok ? 3 : 0), 20),
      evidence: [
        `External trigger need: ${persona.externalTriggerNeed}.`,
        `Internal trigger need: ${persona.internalTriggerNeed}.`,
      ],
      gaps: [
        ...(context.api.hooks?.ok ? [] : ['Durable external trigger surface is weak or not reachable.']),
        ...(memory?.recalled ? [] : ['Stored value is not strong enough to create a return habit.']),
      ],
    },
  ];

  const total = dimensions.reduce((sum, dimension) => sum + dimension.score, 0);
  return {
    id: persona.id,
    name: persona.name,
    role: persona.role,
    total,
    grade: gradeFor(total),
    positioning: total >= 75 ? 'Can credibly position Waggle as an AI OS for this persona.' : 'Needs sharper proof before AI OS positioning will feel earned.',
    currentDefault: persona.currentDefault,
    competitorBaseline: persona.competitorBaseline,
    oneToolCriterion: persona.oneToolCriterion,
    dimensions,
    improvementAreas: dimensions.flatMap((dimension) => dimension.gaps.map((gap) => `${dimension.label}: ${gap}`)),
  };
}

function collectImprovementAreas(personas: PersonaScore[]): ImprovementArea[] {
  const areas: ImprovementArea[] = [];
  for (const persona of personas) {
    for (const dimension of persona.dimensions) {
      const impact = dimension.max - dimension.score;
      if (impact <= 0) continue;
      areas.push({
        priority: 0,
        personaId: persona.id,
        personaName: persona.name,
        dimension: dimension.label,
        impact,
        recommendation: dimension.gaps[0] ?? `Improve ${dimension.label.toLowerCase()} for ${persona.name}.`,
        evidence: dimension.evidence,
      });
    }
  }
  return areas
    .sort((a, b) => b.impact - a.impact || a.personaName.localeCompare(b.personaName))
    .slice(0, 12)
    .map((area, index) => ({ ...area, priority: index + 1 }));
}

function positioningVerdict(score: number): string {
  if (score >= 85) return 'Waggle can lead with AI OS positioning now, with persona-specific proof.';
  if (score >= 70) return 'Waggle has credible AI OS positioning for selected niches, but first-session proof must sharpen.';
  if (score >= 55) return 'Waggle should position as a memory-native AI workspace before claiming full AI OS broadly.';
  return 'Waggle should fix core value proof before using AI OS as the main market claim.';
}
```

- [ ] **Step 2: Add the main audit runner below scoring helpers**

Add:

```typescript
async function runAiOsPositioningAudit(page: Page, testInfo: TestInfo): Promise<AuditResult> {
  const context = await collectProbeContext(page);
  const personas = PERSONAS.map((persona) => scorePersona(persona, context));
  const overallScore = Math.round(personas.reduce((sum, persona) => sum + persona.total, 0) / personas.length);
  const generatedAt = new Date().toISOString();
  const markdownPath = testInfo.outputPath('ai-os-positioning-audit.md');
  const jsonPath = testInfo.outputPath('ai-os-positioning-audit.json');
  const audit: AuditResult = {
    generatedAt,
    overall: {
      score: overallScore,
      grade: gradeFor(overallScore),
      positioningVerdict: positioningVerdict(overallScore),
    },
    addictionLevel: addictionLevelFor(Math.round(
      personas.reduce((sum, persona) => {
        const addiction = persona.dimensions.find((dimension) => dimension.id === 'addiction');
        return sum + (addiction ? (addiction.score / addiction.max) * 100 : 0);
      }, 0) / personas.length,
    )),
    personas,
    improvementAreas: collectImprovementAreas(personas),
    artifacts: {
      markdownPath,
      jsonPath,
    },
  };

  const markdown = renderMarkdown(audit);
  await mkdir(dirname(markdownPath), { recursive: true });
  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(jsonPath, JSON.stringify(audit, null, 2), 'utf8');
  await testInfo.attach('ai-os-positioning-audit.md', { path: markdownPath, contentType: 'text/markdown' });
  await testInfo.attach('ai-os-positioning-audit.json', { path: jsonPath, contentType: 'application/json' });
  return audit;
}
```

- [ ] **Step 3: Run the spec to verify GREEN**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: PASS, with output showing one passing test and Playwright attachments for Markdown and JSON.

---

### Task 5: Refactor and Harden Audit Behavior

**Files:**
- Modify: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Add assertions that low scores do not fail the audit**

In the existing test body, keep the score range assertions but do not assert minimum product score. Ensure the only product-score assertions are:

```typescript
expect(audit.overall.score).toBeGreaterThanOrEqual(0);
expect(audit.overall.score).toBeLessThanOrEqual(100);
```

- [ ] **Step 2: Add artifact content assertions to the same test**

Add:

```typescript
const markdown = await testInfo.outputPath('ai-os-positioning-audit.md');
expect(markdown).toMatch(/ai-os-positioning-audit\.md$/);
for (const persona of ['Sofia', 'Mara', 'Imran', 'Daniel', 'Priya']) {
  expect(audit.personas.map((p) => p.name)).toContain(persona);
}
for (const area of audit.improvementAreas) {
  expect(area.impact).toBeGreaterThan(0);
  expect(area.recommendation.length).toBeGreaterThan(10);
}
```

If TypeScript flags `await` as unnecessary for `testInfo.outputPath`, remove `await` and keep the same assertions.

- [ ] **Step 3: Run the spec**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: PASS.

---

### Task 6: Verification Sweep

**Files:**
- Verify: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Run focused Playwright audit**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript syntax check via Playwright transpilation**

Run:

```bash
node node_modules/playwright/cli.js test tests/e2e/ai-os-positioning-audit.spec.ts --project=chromium --reporter=list --list
```

Expected: test is listed without TypeScript parse errors.

- [ ] **Step 3: Inspect generated report**

Open the newest Playwright output attachment or test result directory and verify the Markdown contains:

```text
# Waggle AI OS Positioning Audit
Overall score:
AI OS verdict:
Addiction level:
## Persona Scores
## Improvement Areas
Sofia
Mara
Imran
Daniel
Priya
```

- [ ] **Step 4: Check git diff**

Run:

```bash
git diff -- tests/e2e/ai-os-positioning-audit.spec.ts
git status --short
```

Expected: only `tests/e2e/ai-os-positioning-audit.spec.ts` is modified/added for implementation, plus any existing unrelated untracked files remain untouched.

---

### Task 7: Commit Implementation

**Files:**
- Stage: `tests/e2e/ai-os-positioning-audit.spec.ts`

- [ ] **Step 1: Stage only the audit spec**

Run:

```bash
git add -- tests/e2e/ai-os-positioning-audit.spec.ts
git status --short
```

Expected: the new audit spec is staged. Existing unrelated untracked files remain unstaged.

- [ ] **Step 2: Commit**

Run:

```bash
git commit -m "test: add ai os positioning audit"
```

Expected: commit succeeds.

- [ ] **Step 3: Final status**

Run:

```bash
git status --short
```

Expected: no staged changes. The pre-existing untracked brief may still appear and must not be touched.
