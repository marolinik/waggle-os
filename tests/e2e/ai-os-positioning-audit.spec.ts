import { expect, type APIRequestContext, type Page, test, type TestInfo } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = process.env.WAGGLE_E2E_BASE_URL ?? 'http://127.0.0.1:3333';
const SKIP = 'skipOnboarding=true&skipBoot=true&tier=power&skipBriefing=true';
const API_PROBE_TIMEOUT_MS = 1_000;
const MEMORY_POLL_TIMEOUT_MS = 1_500;
const MEMORY_POLL_INTERVAL_MS = 250;

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
  authEvidence?: string[];
  api: Record<string, { status: number; ok: boolean; ms: number; body: unknown; error?: string }>;
  personaIds: string[];
  personaText: string;
  skillsText: string;
  connectorsText: string;
  marketplaceText: string;
  memory: Record<string, { saved: boolean; recalled: boolean; isolated: boolean; evidence: string[] }>;
}

interface ProbeAuth {
  headers: Record<string, string>;
  evidence: string[];
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

function requestErrorSummary(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrapProbeAuth(request: APIRequestContext): Promise<ProbeAuth> {
  const response = await request.get(`${BASE}/api/auth/session-token`, { timeout: API_PROBE_TIMEOUT_MS }).catch((error: unknown) => {
    return { error: requestErrorSummary(error) };
  });
  if ('error' in response) {
    return {
      headers: {},
      evidence: [`Session-token bootstrap failed within ${API_PROBE_TIMEOUT_MS}ms: ${response.error}.`],
    };
  }

  const body = await readResponseBody(response);
  const token = typeof asRecord(body).token === 'string' ? String(asRecord(body).token) : '';
  if (response.ok() && token) {
    return {
      headers: { Authorization: `Bearer ${token}` },
      evidence: [`Session-token bootstrap returned ${response.status()} and protected probes used bearer auth.`],
    };
  }

  return {
    headers: {},
    evidence: [`Session-token bootstrap returned ${response.status()} with ${bodySummary(body)}; protected probes continued without bearer auth.`],
  };
}

async function timedGet(request: APIRequestContext, path: string, auth?: ProbeAuth) {
  const started = Date.now();
  const response = await request.get(`${BASE}${path}`, { timeout: API_PROBE_TIMEOUT_MS, headers: auth?.headers }).catch((error: unknown) => {
    return { error: requestErrorSummary(error) };
  });
  const ms = Date.now() - started;
  if ('error' in response) {
    return { status: 0, ok: false, ms, body: { error: response.error }, error: response.error };
  }
  const body = await response.json().catch(async () => response.text().catch(() => null));
  return { status: response.status(), ok: response.ok(), ms, body };
}

function bodySummary(body: unknown): string {
  if (body === null || body === undefined) return 'empty body';
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function isValidFrameId(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function hasSavedFrameReference(record: Record<string, unknown>): boolean {
  const frame = asRecord(record.frame);
  const memory = asRecord(record.memory);
  const data = asRecord(record.data);
  return [
    record.frameId,
    record.id,
    frame.frameId,
    frame.id,
    memory.frameId,
    memory.id,
    data.frameId,
    data.id,
  ].some(isValidFrameId);
}

function meaningfulTerms(...texts: string[]): string[] {
  const stopWords = new Set([
    'about',
    'across',
    'agent',
    'center',
    'clear',
    'coding',
    'context',
    'memory',
    'normal',
    'persona',
    'personal',
    'result',
    'results',
    'source',
    'their',
    'there',
    'wants',
    'workspace',
    'workspaces',
  ]);
  const terms = texts
    .join(' ')
    .toLowerCase()
    .match(/[a-z0-9]+/g) ?? [];
  return [...new Set(terms.filter((term) => term.length >= 3 && !stopWords.has(term)))];
}

async function readResponseBody(response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<unknown> {
  return response.json().catch(async () => response.text().catch(() => null));
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureProbeWorkspace(request: APIRequestContext, workspaceName: string, auth?: ProbeAuth): Promise<{ available: boolean; id: string; evidence: string[] }> {
  const evidence: string[] = [];
  const response = await request.post(`${BASE}/api/workspaces`, {
    timeout: API_PROBE_TIMEOUT_MS,
    headers: auth?.headers,
    data: {
      name: workspaceName,
      group: 'AI OS Audit',
      icon: 'sparkles',
      storageType: 'virtual',
    },
  }).catch((error: unknown) => {
    evidence.push(`Workspace create failed within ${API_PROBE_TIMEOUT_MS}ms: ${requestErrorSummary(error)}.`);
    return null;
  });

  if (response) {
    const body = await readResponseBody(response);
    const record = asRecord(body);
    const id = typeof record.id === 'string' ? record.id : '';
    evidence.push(`Workspace create returned ${response.status()} with ${bodySummary(body)}.`);
    if (response.ok() && id) {
      return { available: true, id, evidence };
    }
  } else {
    evidence.push('Workspace create did not return a response.');
  }

  const listResponse = await request.get(`${BASE}/api/workspaces`, { timeout: API_PROBE_TIMEOUT_MS, headers: auth?.headers }).catch((error: unknown) => {
    evidence.push(`Workspace confirmation list failed within ${API_PROBE_TIMEOUT_MS}ms: ${requestErrorSummary(error)}.`);
    return null;
  });
  if (!listResponse) {
    evidence.push('Workspace confirmation list did not return a response.');
    return { available: false, id: workspaceName, evidence };
  }

  const listBody = await readResponseBody(listResponse);
  evidence.push(`Workspace confirmation list returned ${listResponse.status()} with ${bodySummary(listBody)}.`);
  if (!listResponse.ok()) {
    return { available: false, id: workspaceName, evidence };
  }

  const workspaces = Array.isArray(listBody) ? listBody : [];
  const match = workspaces
    .map(asRecord)
    .find((workspace) => workspace.id === workspaceName || workspace.name === workspaceName);
  const id = typeof match?.id === 'string' ? match.id : '';
  if (!id) {
    evidence.push('Probe workspace was not found in the workspace list.');
    return { available: false, id: workspaceName, evidence };
  }

  evidence.push(`Probe workspace confirmed as ${id}.`);
  return { available: true, id, evidence };
}

async function saveMemory(request: APIRequestContext, workspace: string, content: string, auth?: ProbeAuth): Promise<{ saved: boolean; evidence: string[] }> {
  const response = await request.post(`${BASE}/api/memory/frames`, {
    timeout: API_PROBE_TIMEOUT_MS,
    headers: auth?.headers,
    data: { content, workspace, source: 'user_stated', importance: 'normal' },
  }).catch((error: unknown) => {
    return { error: requestErrorSummary(error) };
  });
  if (response && 'error' in response) {
    return { saved: false, evidence: [`Memory save failed within ${API_PROBE_TIMEOUT_MS}ms: ${response.error}.`] };
  }
  if (!response) {
    return { saved: false, evidence: ['Memory save did not return a response.'] };
  }

  const body = await readResponseBody(response);
  const record = asRecord(body);
  const acceptedBody = record.saved === true || record.duplicate === true || hasSavedFrameReference(record);
  return {
    saved: response.ok() && acceptedBody,
    evidence: [`Memory save returned ${response.status()} with ${bodySummary(body)}.`],
  };
}

async function searchMemory(request: APIRequestContext, workspace: string, query: string, expectedContent = query, auth?: ProbeAuth): Promise<{ found: boolean; checked: boolean; evidence: string[] }> {
  const response = await request.get(
    `${BASE}/api/memory/search?q=${encodeURIComponent(query)}&workspace=${encodeURIComponent(workspace)}&scope=workspace&limit=5`,
    { timeout: API_PROBE_TIMEOUT_MS, headers: auth?.headers },
  ).catch((error: unknown) => {
    return { error: requestErrorSummary(error) };
  });
  if (response && 'error' in response) {
    return { found: false, checked: false, evidence: [`Memory search failed within ${API_PROBE_TIMEOUT_MS}ms: ${response.error}.`] };
  }
  if (!response) return { found: false, checked: false, evidence: ['Memory search did not return a response.'] };
  const body = await readResponseBody(response);
  if (!response.ok()) return { found: false, checked: false, evidence: [`Memory search returned ${response.status()} with ${bodySummary(body)}.`] };
  const raw = JSON.stringify(body);
  const record = asRecord(body);
  const results = Array.isArray(body)
    ? body
    : Array.isArray(record.results)
      ? record.results
      : Array.isArray(record.recalled)
        ? record.recalled
        : [];
  const expectedTerms = meaningfulTerms(query, expectedContent);
  const matchedTerms = expectedTerms.filter((term) => raw.toLowerCase().includes(term));
  const requiredMatches = Math.max(1, Math.min(3, Math.ceil(expectedTerms.length * 0.4)));
  const found = results.length > 0 && matchedTerms.length >= requiredMatches;
  return {
    found,
    checked: true,
    evidence: [
      `Memory search returned ${response.status()} with ${results.length} result(s); matched ${matchedTerms.length}/${expectedTerms.length} expected term(s): ${matchedTerms.slice(0, 6).join(', ') || 'none'}.`,
      `Memory search body: ${bodySummary(body)}.`,
    ],
  };
}

async function pollMemorySearch(
  request: APIRequestContext,
  workspace: string,
  query: string,
  expectedContent: string,
  label: string,
  auth?: ProbeAuth,
): Promise<{ found: boolean; checked: boolean; evidence: string[] }> {
  const started = Date.now();
  let attempts = 0;
  let lastResult: { found: boolean; checked: boolean; evidence: string[] } = {
    found: false,
    checked: false,
    evidence: [`${label} memory search has not run yet.`],
  };

  while (Date.now() - started <= MEMORY_POLL_TIMEOUT_MS) {
    attempts += 1;
    lastResult = await searchMemory(request, workspace, query, expectedContent, auth);
    if (lastResult.found) {
      return {
        found: true,
        checked: true,
        evidence: [`${label} memory search matched after ${attempts} attempt(s).`, ...lastResult.evidence],
      };
    }

    const remaining = MEMORY_POLL_TIMEOUT_MS - (Date.now() - started);
    if (remaining <= 0) break;
    await wait(Math.min(MEMORY_POLL_INTERVAL_MS, remaining));
  }

  return {
    found: false,
    checked: lastResult.checked,
    evidence: [`${label} memory search did not match within ${MEMORY_POLL_TIMEOUT_MS}ms after ${attempts} attempt(s).`, ...lastResult.evidence],
  };
}

async function probeMemory(request: APIRequestContext, persona: PersonaDefinition, auth?: ProbeAuth) {
  const workspace = `ai-os-audit-${persona.id}-${Date.now()}`;
  const otherWorkspace = `${workspace}-isolation`;
  const primary = await ensureProbeWorkspace(request, workspace, auth);

  if (!primary.available) {
    return {
      saved: false,
      recalled: false,
      isolated: false,
      evidence: [
        ...primary.evidence,
        'Primary probe workspace was unavailable, so memory save/recall/isolation were not claimed.',
      ],
    };
  }

  const comparison = await ensureProbeWorkspace(request, otherWorkspace, auth);
  const save = await saveMemory(request, primary.id, persona.memoryAnchor, auth);
  const recall = save.saved
    ? await pollMemorySearch(request, primary.id, persona.memoryQuery, persona.memoryAnchor, 'Recall', auth)
    : { found: false, checked: false, evidence: ['Memory recall skipped because the memory save did not succeed.'] };
  const isolation = comparison.available
    ? await pollMemorySearch(request, comparison.id, persona.memoryAnchor, persona.memoryAnchor, 'Isolation', auth)
    : { found: false, checked: false, evidence: ['Isolation search skipped because the comparison workspace was unavailable.'] };
  const isolationProven = comparison.available && isolation.checked && !isolation.found;
  return {
    saved: save.saved,
    recalled: save.saved && recall.found,
    isolated: isolationProven,
    evidence: [
      ...primary.evidence,
      ...comparison.evidence,
      ...save.evidence,
      save.saved ? 'Persona memory anchor saved.' : 'Persona memory anchor could not be saved.',
      ...recall.evidence,
      ...isolation.evidence,
      comparison.available && isolation.found
        ? 'Potential cross-workspace memory leakage detected.'
        : isolationProven
          ? 'No cross-workspace recall detected for the persona anchor within the bounded polling window.'
          : 'Cross-workspace isolation was not proven by the bounded isolation search.',
    ],
  };
}

async function collectProbeContext(page: Page): Promise<ProbeContext> {
  const consoleErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  let shellText = '';
  let shellLoaded = false;
  const shellResponse = await page.goto(`${BASE}/home?${SKIP}`, { waitUntil: 'domcontentloaded' }).catch((error: unknown) => {
    shellText = `Shell navigation failed: ${error instanceof Error ? error.message : String(error)}`;
    return null;
  });
  if (shellResponse) {
    if (!shellResponse.ok()) {
      shellText = `Shell navigation returned ${shellResponse.status()} ${shellResponse.statusText()}.`;
    }
    await page.waitForSelector('.waggle-sidebar, [role="navigation"], main', { timeout: 15_000 }).catch(() => {});
    await page.waitForTimeout(600);
    const bodyText = await page.locator('body').innerText().catch(() => '');
    shellText = bodyText || shellText;
    shellLoaded = shellResponse.ok() && shellText.length > 80 && !/error boundary|something went wrong/i.test(shellText);
  }

  const auth = await bootstrapProbeAuth(page.request);
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
    Object.entries(endpoints).map(async ([key, path]) => [key, await timedGet(page.request, path, auth)] as const),
  );
  const api = Object.fromEntries(apiEntries);
  const personaBody = api.personas?.body as { personas?: Array<{ id?: string; name?: string; description?: string }> } | Array<{ id?: string }>;
  const personaRows = Array.isArray(personaBody) ? personaBody : Array.isArray(personaBody?.personas) ? personaBody.personas : [];
  const personaIds = personaRows.map((persona) => String(persona.id ?? ''));

  const memory: ProbeContext['memory'] = {};
  const memoryResults = await Promise.allSettled(
    PERSONAS.map(async (persona) => ({
      persona,
      result: await probeMemory(page.request, persona, auth),
    })),
  );
  for (let index = 0; index < memoryResults.length; index += 1) {
    const result = memoryResults[index];
    const persona = PERSONAS[index];
    if (result.status === 'fulfilled') {
      memory[result.value.persona.id] = result.value.result;
    } else {
      memory[persona.id] = {
        saved: false,
        recalled: false,
        isolated: false,
        evidence: [`Memory probe failed for ${persona.name}: ${requestErrorSummary(result.reason)}.`],
      };
    }
  }

  return {
    shellLoaded,
    shellText,
    consoleErrors,
    authEvidence: auth.evidence,
    api,
    personaIds,
    personaText: JSON.stringify(api.personas?.body ?? ''),
    skillsText: JSON.stringify(api.skills?.body ?? ''),
    connectorsText: JSON.stringify(api.connectors?.body ?? ''),
    marketplaceText: JSON.stringify(api.marketplace?.body ?? ''),
    memory,
  };
}

function scorePersona(persona: PersonaDefinition, context: ProbeContext): PersonaScore {
  const memory = context.memory[persona.id];
  const coreApiKeys = ['health', 'personas', 'workspaces'];
  const fastCoreApis = coreApiKeys.filter((key) => context.api[key]?.ok && context.api[key].ms < 800);
  const coreApiEvidence = coreApiKeys.map((key) => {
    const result = context.api[key];
    if (!result) return `${key} was not probed.`;
    if (result.ok && result.ms < 800) return `${key} responded in ${result.ms}ms.`;
    if (result.ok) return `${key} responded in ${result.ms}ms, slower than the 800ms target.`;
    return `${key} returned ${result.status || 'no status'} in ${result.ms}ms with ${bodySummary(result.body)}.`;
  });
  const relevantPersona = persona.expectedPersonaIds.some((id) => context.personaIds.includes(id));
  const relevantSkills = textIncludesAny(`${context.skillsText} ${context.marketplaceText}`, persona.expectedSkillTerms);
  const relevantConnectors = textIncludesAny(context.connectorsText, persona.expectedConnectorTerms);
  const osSurfaces = ['hooks', 'fleet', 'events', 'tier'].filter((key) => context.api[key]?.ok || [403, 404].includes(context.api[key]?.status ?? 0));
  const hasBasicShellPositioning = /Waggle|workspace|AI/i.test(context.shellText);
  const hasExplicitAiOsPositioning = /AI OS|operating system/i.test(context.shellText);

  const dimensions: DimensionScore[] = [
    {
      id: 'onboarding',
      label: 'Onboarding clarity',
      max: 15,
      score: clampScore(
        (context.shellLoaded ? 10 : 0)
        + (context.consoleErrors.length === 0 ? 3 : 0)
        + (hasBasicShellPositioning ? 1 : 0)
        + (hasExplicitAiOsPositioning ? 1 : 0),
        15,
      ),
      evidence: [
        context.shellLoaded ? 'App shell loaded meaningful content.' : 'App shell did not load meaningful content.',
        `${context.consoleErrors.length} console error(s) captured on first load.`,
        hasExplicitAiOsPositioning ? 'Loaded shell explicitly mentions AI OS or operating-system positioning.' : 'Loaded shell does not explicitly mention AI OS or operating-system positioning.',
      ],
      gaps: [
        ...(context.shellLoaded ? [] : ['Make first-load shell resilient and clearly explain what Waggle is.']),
        ...(hasExplicitAiOsPositioning ? [] : ['AI OS positioning is not explicit in the loaded shell text.']),
      ],
    },
    {
      id: 'timeToValue',
      label: 'Time to first value',
      max: 15,
      score: clampScore(fastCoreApis.length * 4 + (context.api.marketplace?.ok ? 3 : 0), 15),
      evidence: [...(context.authEvidence ?? []), ...coreApiEvidence],
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
        ...(memory?.isolated ? [] : ['Workspace isolation was not proven by this audit.']),
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
  const sorted = areas.sort((a, b) => b.impact - a.impact || a.dimension.localeCompare(b.dimension) || a.personaName.localeCompare(b.personaName));
  const buckets = new Map<number, ImprovementArea[]>();
  for (const area of sorted) {
    buckets.set(area.impact, [...(buckets.get(area.impact) ?? []), area]);
  }

  const selected: ImprovementArea[] = [];
  const selectedKeys = new Set<string>();
  const addArea = (area: ImprovementArea) => {
    const key = `${area.personaId}:${area.dimension}`;
    if (selectedKeys.has(key) || selected.length >= 12) return;
    selected.push(area);
    selectedKeys.add(key);
  };

  for (const impact of [...buckets.keys()].sort((a, b) => b - a)) {
    const remaining = [...(buckets.get(impact) ?? [])];
    const seenDimensions = new Set<string>();
    while (remaining.length > 0 && selected.length < 12) {
      let nextIndex = remaining.findIndex((area) => !seenDimensions.has(area.dimension));
      if (nextIndex === -1) {
        seenDimensions.clear();
        nextIndex = 0;
      }
      const [area] = remaining.splice(nextIndex, 1);
      seenDimensions.add(area.dimension);
      addArea(area);
    }
  }

  return selected.map((area, index) => ({ ...area, priority: index + 1 }));
}

function hasPersonaDimensionBelowMax(personas: PersonaScore[]): boolean {
  return personas.some((persona) => persona.dimensions.some((dimension) => dimension.score < dimension.max));
}

function positioningVerdict(score: number): string {
  if (score >= 85) return 'Waggle can lead with AI OS positioning now, with persona-specific proof.';
  if (score >= 70) return 'Waggle has credible AI OS positioning for selected niches, but first-session proof must sharpen.';
  if (score >= 55) return 'Waggle should position as a memory-native AI workspace before claiming full AI OS broadly.';
  return 'Waggle should fix core value proof before using AI OS as the main market claim.';
}

async function runAiOsPositioningAudit(page: Page, testInfo: TestInfo): Promise<AuditResult> {
  const context = await collectProbeContext(page);
  const personas = PERSONAS.map((persona) => scorePersona(persona, context));
  const overallScore = Math.round(personas.reduce((sum, persona) => sum + persona.total, 0) / personas.length);
  const generatedAt = new Date().toISOString();
  const markdownPath = testInfo.outputPath('ai-os-positioning-audit.md');
  const jsonPath = testInfo.outputPath('ai-os-positioning-audit.json');
  const addictionScore = Math.round(
    personas.reduce((sum, persona) => {
      const addiction = persona.dimensions.find((dimension) => dimension.id === 'addiction');
      return sum + (addiction ? (addiction.score / addiction.max) * 100 : 0);
    }, 0) / personas.length,
  );
  const audit: AuditResult = {
    generatedAt,
    overall: {
      score: overallScore,
      grade: gradeFor(overallScore),
      positioningVerdict: positioningVerdict(overallScore),
    },
    addictionLevel: addictionLevelFor(addictionScore),
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

test.describe('AI OS positioning audit', () => {
  test('keeps scoring evidence internally consistent and diverse', () => {
    const persona = PERSONAS[0];
    const context: ProbeContext = {
      shellLoaded: true,
      shellText: 'Waggle workspace AI for customer follow-ups.',
      consoleErrors: [],
      api: {
        health: { status: 200, ok: true, ms: 100, body: {} },
        personas: { status: 200, ok: true, ms: 950, body: {} },
        workspaces: { status: 503, ok: false, ms: 120, body: { error: 'down' } },
        marketplace: { status: 200, ok: true, ms: 100, body: {} },
        hooks: { status: 200, ok: true, ms: 100, body: {} },
        fleet: { status: 200, ok: true, ms: 100, body: {} },
        events: { status: 200, ok: true, ms: 100, body: {} },
        tier: { status: 200, ok: true, ms: 100, body: {} },
      },
      personaIds: persona.expectedPersonaIds,
      personaText: '',
      skillsText: persona.expectedSkillTerms.join(' '),
      connectorsText: persona.expectedConnectorTerms.join(' '),
      marketplaceText: '',
      memory: {
        [persona.id]: { saved: true, recalled: true, isolated: true, evidence: ['Memory proof exists.'] },
      },
    };

    const score = scorePersona(persona, context);
    const onboarding = score.dimensions.find((dimension) => dimension.id === 'onboarding');
    const timeToValue = score.dimensions.find((dimension) => dimension.id === 'timeToValue');

    expect(onboarding?.gaps).toContain('AI OS positioning is not explicit in the loaded shell text.');
    expect(onboarding?.score).toBeLessThan(onboarding?.max ?? 0);
    expect(timeToValue?.evidence.join('\n')).toContain('personas responded in 950ms');
    expect(timeToValue?.evidence.join('\n')).toContain('workspaces returned 503');

    const crowdedPersonas: PersonaScore[] = PERSONAS.map((definition) => ({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      total: 0,
      grade: 'test',
      positioning: 'test',
      currentDefault: definition.currentDefault,
      competitorBaseline: definition.competitorBaseline,
      oneToolCriterion: definition.oneToolCriterion,
      improvementAreas: [],
      dimensions: [
        { id: 'memory', label: 'Memory and continuity', max: 20, score: 0, evidence: [`${definition.name} memory`], gaps: ['Memory gap.'] },
        { id: 'addiction', label: 'Addiction/return signal', max: 20, score: 0, evidence: [`${definition.name} addiction`], gaps: ['Addiction gap.'] },
        { id: 'timeToValue', label: 'Time to first value', max: 15, score: 5, evidence: [`${definition.name} time`], gaps: ['Time gap.'] },
        { id: 'onboarding', label: 'Onboarding clarity', max: 15, score: 14, evidence: [`${definition.name} onboarding`], gaps: ['Small onboarding gap.'] },
      ],
    }));

    const orderedAreas = collectImprovementAreas(crowdedPersonas);
    for (let index = 1; index < orderedAreas.length; index += 1) {
      expect(orderedAreas[index - 1].impact).toBeGreaterThanOrEqual(orderedAreas[index].impact);
    }
    const topFiveDimensions = new Set(orderedAreas.slice(0, 5).map((area) => area.dimension));
    expect(topFiveDimensions.size).toBeGreaterThan(1);
  });

  test('allows perfect-score audits to report zero improvement areas', () => {
    const perfectDimensions: DimensionScore[] = [
      { id: 'onboarding', label: 'Onboarding clarity', max: 15, score: 15, evidence: ['Perfect onboarding.'], gaps: [] },
      { id: 'timeToValue', label: 'Time to first value', max: 15, score: 15, evidence: ['Perfect time to value.'], gaps: [] },
      { id: 'memory', label: 'Memory and continuity', max: 20, score: 20, evidence: ['Perfect memory.'], gaps: [] },
      { id: 'workflowCoverage', label: 'Workflow coverage', max: 15, score: 15, evidence: ['Perfect workflow coverage.'], gaps: [] },
      { id: 'competitiveAdvantage', label: 'Competitive advantage', max: 15, score: 15, evidence: ['Perfect advantage.'], gaps: [] },
      { id: 'addiction', label: 'Addiction/return signal', max: 20, score: 20, evidence: ['Perfect return signal.'], gaps: [] },
    ];
    const perfectPersonas: PersonaScore[] = PERSONAS.map((definition) => ({
      id: definition.id,
      name: definition.name,
      role: definition.role,
      total: 100,
      grade: gradeFor(100),
      positioning: 'Can credibly position Waggle as an AI OS for this persona.',
      currentDefault: definition.currentDefault,
      competitorBaseline: definition.competitorBaseline,
      oneToolCriterion: definition.oneToolCriterion,
      dimensions: perfectDimensions.map((dimension) => ({ ...dimension })),
      improvementAreas: [],
    }));
    const improvementAreas = collectImprovementAreas(perfectPersonas);
    const audit: AuditResult = {
      generatedAt: '2026-06-28T00:00:00.000Z',
      overall: {
        score: 100,
        grade: gradeFor(100),
        positioningVerdict: positioningVerdict(100),
      },
      addictionLevel: addictionLevelFor(100),
      personas: perfectPersonas,
      improvementAreas,
      artifacts: {
        markdownPath: 'ai-os-positioning-audit.md',
        jsonPath: 'ai-os-positioning-audit.json',
      },
    };

    expect(hasPersonaDimensionBelowMax(perfectPersonas)).toBe(false);
    expect(improvementAreas).toHaveLength(0);
    expect(renderMarkdown(audit)).toContain('## Improvement Areas');
  });

  test('bounds probe requests and polls delayed memory recall', async () => {
    const calls: Array<{ method: 'get' | 'post'; url: string; options?: { timeout?: number; data?: Record<string, unknown> } }> = [];
    const response = (status: number, body: unknown) => ({
      ok: () => status >= 200 && status < 300,
      status: () => status,
      statusText: () => String(status),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    const timeoutRequest = {
      get: async (url: string, options?: { timeout?: number }) => {
        calls.push({ method: 'get', url, options });
        return response(200, { results: [{ content: 'query content' }] });
      },
      post: async (url: string, options?: { timeout?: number; data?: Record<string, unknown> }) => {
        calls.push({ method: 'post', url, options });
        return response(200, { id: options?.data?.name ?? 'workspace', saved: true, frameId: 'frame-1' });
      },
    } as unknown as APIRequestContext;

    await timedGet(timeoutRequest, '/health');
    await ensureProbeWorkspace(timeoutRequest, 'workspace');
    await saveMemory(timeoutRequest, 'workspace', 'content');
    await searchMemory(timeoutRequest, 'workspace', 'query', 'query content');

    expect(calls.every((call) => typeof call.options?.timeout === 'number' && call.options.timeout > 0)).toBe(true);

    const memorySaveResult = async (body: unknown) => saveMemory({
      post: async () => response(200, body),
    } as unknown as APIRequestContext, 'workspace', 'content');
    await expect(memorySaveResult({})).resolves.toMatchObject({ saved: false });
    await expect(memorySaveResult({ saved: false })).resolves.toMatchObject({ saved: false });
    await expect(memorySaveResult({ saved: true })).resolves.toMatchObject({ saved: true });
    await expect(memorySaveResult({ duplicate: true })).resolves.toMatchObject({ saved: true });
    await expect(memorySaveResult({ frameId: 42 })).resolves.toMatchObject({ saved: true });
    await expect(memorySaveResult({ frame: { id: 'frame-42' } })).resolves.toMatchObject({ saved: true });

    let recallSearches = 0;
    const persona = PERSONAS[0];
    const pollingRequest = {
      post: async (url: string, options?: { timeout?: number; data?: Record<string, unknown> }) => {
        calls.push({ method: 'post', url, options });
        if (url.includes('/api/workspaces')) return response(200, { id: options?.data?.name });
        return response(200, { saved: true, frameId: 'frame-1' });
      },
      get: async (url: string, options?: { timeout?: number }) => {
        calls.push({ method: 'get', url, options });
        const decodedUrl = decodeURIComponent(url);
        if (decodedUrl.includes('-isolation')) return response(200, { results: [] });
        recallSearches += 1;
        if (recallSearches === 1) return response(200, { results: [] });
        return response(200, { results: [{ content: persona.memoryAnchor }] });
      },
    } as unknown as APIRequestContext;

    const memory = await probeMemory(pollingRequest, persona);
    expect(recallSearches).toBeGreaterThan(1);
    expect(memory.recalled).toBe(true);
  });

  test('collects persona memory probes concurrently and records per-persona failures as evidence', async () => {
    const response = (status: number, body: unknown) => ({
      ok: () => status >= 200 && status < 300,
      status: () => status,
      statusText: () => String(status),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    let activeSaves = 0;
    let maxActiveSaves = 0;
    const request = {
      get: async (url: string) => {
        if (url.includes('/api/personas')) {
          return response(200, { personas: [...new Set(PERSONAS.flatMap((persona) => persona.expectedPersonaIds))].map((id) => ({ id })) });
        }
        if (url.includes('/api/memory/search')) {
          const parsed = new URL(url);
          const workspace = parsed.searchParams.get('workspace') ?? '';
          const persona = PERSONAS.find((definition) => workspace.includes(definition.id));
          return response(200, { results: persona ? [{ content: persona.memoryAnchor }] : [] });
        }
        return response(200, {});
      },
      post: (url: string, options?: { timeout?: number; data?: Record<string, unknown> }) => {
        if (url.includes('/api/workspaces')) {
          const workspaceName = String(options?.data?.name ?? '');
          if (workspaceName.endsWith('-isolation')) return Promise.resolve(response(500, { error: 'comparison unavailable' }));
          return Promise.resolve(response(200, { id: workspaceName }));
        }
        if (url.includes('/api/memory/frames')) {
          const workspace = String(options?.data?.workspace ?? '');
          if (workspace.includes(PERSONAS[0].id)) {
            throw new Error('sync memory probe failure');
          }
          activeSaves += 1;
          maxActiveSaves = Math.max(maxActiveSaves, activeSaves);
          return new Promise<ReturnType<typeof response>>((resolve) => {
            setTimeout(() => {
              activeSaves -= 1;
              resolve(response(200, { saved: true, frameId: `frame-${workspace}` }));
            }, 25);
          });
        }
        return Promise.resolve(response(200, {}));
      },
    } as unknown as APIRequestContext;
    const page = {
      on: () => undefined,
      goto: async () => response(200, {}),
      waitForSelector: async () => undefined,
      waitForTimeout: async () => undefined,
      locator: () => ({
        innerText: async () => 'Waggle AI OS workspace with meaningful app shell content for the audit.',
      }),
      request,
    } as unknown as Page;

    const context = await collectProbeContext(page);
    const failedProbe = context.memory[PERSONAS[0].id];

    expect(Object.keys(context.memory)).toHaveLength(PERSONAS.length);
    expect(failedProbe.saved).toBe(false);
    expect(failedProbe.evidence.join('\n')).toContain('sync memory probe failure');
    expect(maxActiveSaves).toBeGreaterThan(1);
  });

  test('bootstraps session token before probing protected product APIs', async () => {
    const response = (status: number, body: unknown) => ({
      ok: () => status >= 200 && status < 300,
      status: () => status,
      statusText: () => String(status),
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    const hasAuth = (options?: { headers?: Record<string, string> }) => options?.headers?.Authorization === 'Bearer audit-token';
    let tokenCalls = 0;
    const protectedProbeUrls: string[] = [];
    const request = {
      get: async (url: string, options?: { timeout?: number; headers?: Record<string, string> }) => {
        if (url.includes('/api/auth/session-token')) {
          tokenCalls += 1;
          return response(200, { token: 'audit-token' });
        }
        if (url.includes('/health')) return response(200, { status: 'ok' });
        if (url.includes('/api/memory/search')) {
          protectedProbeUrls.push(url);
          if (!hasAuth(options)) return response(401, { error: 'Unauthorized', code: 'MISSING_TOKEN' });
          const parsed = new URL(url);
          const workspace = parsed.searchParams.get('workspace') ?? '';
          const persona = PERSONAS.find((definition) => workspace.includes(definition.id));
          return response(200, { results: workspace.includes('-isolation') || !persona ? [] : [{ content: persona.memoryAnchor }] });
        }
        if (url.includes('/api/personas')) {
          protectedProbeUrls.push(url);
          return hasAuth(options)
            ? response(200, { personas: PERSONAS.flatMap((persona) => persona.expectedPersonaIds).map((id) => ({ id })) })
            : response(401, { error: 'Unauthorized', code: 'MISSING_TOKEN' });
        }
        if (url.includes('/api/')) {
          protectedProbeUrls.push(url);
          return hasAuth(options) ? response(200, {}) : response(401, { error: 'Unauthorized', code: 'MISSING_TOKEN' });
        }
        return response(200, {});
      },
      post: async (url: string, options?: { timeout?: number; headers?: Record<string, string>; data?: Record<string, unknown> }) => {
        if (url.includes('/api/')) protectedProbeUrls.push(url);
        if (!hasAuth(options)) return response(401, { error: 'Unauthorized', code: 'MISSING_TOKEN' });
        if (url.includes('/api/workspaces')) return response(200, { id: options?.data?.name ?? 'workspace' });
        if (url.includes('/api/memory/frames')) return response(200, { saved: true, frameId: 'frame-1' });
        return response(200, {});
      },
    } as unknown as APIRequestContext;
    const page = {
      on: () => undefined,
      goto: async () => response(200, {}),
      waitForSelector: async () => undefined,
      waitForTimeout: async () => undefined,
      locator: () => ({
        innerText: async () => 'Waggle AI OS workspace with meaningful app shell content for the audit.',
      }),
      request,
    } as unknown as Page;

    const context = await collectProbeContext(page);

    expect(tokenCalls).toBe(1);
    expect(context.api.personas.ok).toBe(true);
    expect(context.api.workspaces.ok).toBe(true);
    expect(context.memory[PERSONAS[0].id].saved).toBe(true);
    expect(protectedProbeUrls.length).toBeGreaterThan(0);
  });

  test('generates a report-mode audit with five personas and score-aware improvement areas', async ({ page }, testInfo) => {
    const audit = await runAiOsPositioningAudit(page, testInfo);
    const expectedPersonaNames = ['Sofia', 'Mara', 'Imran', 'Daniel', 'Priya'];

    expect(audit.personas).toHaveLength(5);
    expect(audit.personas.map((persona) => persona.name)).toEqual(expect.arrayContaining(expectedPersonaNames));
    expect(audit.overall.score).toBeGreaterThanOrEqual(0);
    expect(audit.overall.score).toBeLessThanOrEqual(100);
    expect(audit.overall.grade).toMatch(/AI OS|chat|niche|promising|plausible/i);
    expect(audit.addictionLevel).toMatch(/weak|emerging|strong|very strong/i);
    if (hasPersonaDimensionBelowMax(audit.personas)) {
      expect(audit.improvementAreas.length).toBeGreaterThan(0);
    } else {
      expect(audit.improvementAreas).toHaveLength(0);
    }
    for (const area of audit.improvementAreas) {
      expect(area.impact).toBeGreaterThan(0);
      expect(area.recommendation.trim().length).toBeGreaterThan(10);
    }
    expect(audit.artifacts.markdownPath).toMatch(/ai-os-positioning-audit\.md$/);
    expect(audit.artifacts.jsonPath).toMatch(/ai-os-positioning-audit\.json$/);

    const markdown = await readFile(audit.artifacts.markdownPath, 'utf8');
    expect(markdown).toContain('# Waggle AI OS Positioning Audit');
    expect(markdown).toContain('Overall score:');
    expect(markdown).toContain('AI OS verdict:');
    expect(markdown).toContain('Addiction level:');
    expect(markdown).toContain('## Persona Scores');
    expect(markdown).toContain('## Improvement Areas');
    for (const name of expectedPersonaNames) {
      expect(markdown).toContain(name);
    }
  });
});
