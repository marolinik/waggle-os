/**
 * Workspace Templates Routes — pre-configured workspace setups.
 *
 * Endpoints:
 *   GET  /api/workspace-templates  — list all templates (built-in + user-created)
 *   POST /api/workspace-templates  — create a custom template
 *
 * Built-in templates are hardcoded. User-created templates are persisted
 * as JSON in {dataDir}/workspace-templates.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';

export type TemplateCategory = 'sales' | 'research' | 'engineering' | 'marketing' | 'operations' | 'legal' | 'design' | 'custom';

/** Shape of a workspace template. */
export interface WorkspaceTemplate {
  id: string;
  name: string;
  description: string;
  persona: string;
  connectors: string[];
  suggestedCommands: string[];
  starterMemory: string[];
  /** Whether this template is built-in (true) or user-created (false). */
  builtIn: boolean;
  category?: TemplateCategory;
}

/** The 15 built-in workspace templates. */
export const BUILT_IN_TEMPLATES: WorkspaceTemplate[] = [
  {
    id: 'sales-pipeline',
    name: 'Sales Pipeline',
    description: 'Track leads, research prospects, draft outreach, and manage your sales pipeline.',
    persona: 'sales-rep',
    connectors: ['github', 'email', 'slack'],
    suggestedCommands: ['/research', '/draft', '/catchup', '/status'],
    starterMemory: [
      'This workspace tracks the sales pipeline and prospect outreach.',
      'Key workflow: research prospect -> draft personalized outreach -> track follow-ups.',
      'Use /research to investigate companies, /draft to create outreach emails.',
    ],
    builtIn: true,
    category: 'sales',
  },
  {
    id: 'research-project',
    name: 'Research Project',
    description: 'Deep investigation with multi-source synthesis, citation tracking, and structured findings.',
    persona: 'researcher',
    connectors: ['github'],
    suggestedCommands: ['/research', '/catchup', '/memory', '/draft'],
    starterMemory: [
      'This workspace is dedicated to research and investigation.',
      'Key workflow: define question -> gather sources -> synthesize findings -> write report.',
      'Always cite sources and cross-reference with saved memory for prior findings.',
    ],
    builtIn: true,
  },
  {
    id: 'code-review',
    name: 'Code Review',
    description: 'Review pull requests, analyze code quality, track technical debt, and suggest improvements.',
    persona: 'coder',
    connectors: ['github', 'jira'],
    suggestedCommands: ['/review', '/plan', '/status', '/catchup'],
    starterMemory: [
      'This workspace handles code review and technical quality tracking.',
      'Key workflow: pull latest changes -> review diffs -> note issues -> suggest fixes.',
      'Use /review for structured code analysis, /plan for multi-step refactoring.',
    ],
    builtIn: true,
    category: 'engineering',
  },
  {
    id: 'marketing-campaign',
    name: 'Marketing Campaign',
    description: 'Plan campaigns, create content, track performance, and manage brand voice.',
    persona: 'marketer',
    connectors: ['slack', 'email'],
    suggestedCommands: ['/draft', '/research', '/plan', '/catchup'],
    starterMemory: [
      'This workspace manages marketing campaigns and content creation.',
      'Key workflow: define campaign goals -> research audience -> create content -> review metrics.',
      'Use /draft for content creation, /research for competitor and audience analysis.',
    ],
    builtIn: true,
    category: 'marketing',
  },
  {
    id: 'product-launch',
    name: 'Product Launch',
    description: 'Coordinate launch activities, track milestones, manage stakeholder communication.',
    persona: 'project-manager',
    connectors: ['github', 'jira', 'slack'],
    suggestedCommands: ['/plan', '/status', '/catchup', '/spawn'],
    starterMemory: [
      'This workspace coordinates a product launch across teams.',
      'Key workflow: define milestones -> assign tasks -> track progress -> communicate status.',
      'Use /plan for launch checklists, /status for progress reports, /spawn for parallel work.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'legal-review',
    name: 'Legal Review',
    description: 'Analyze contracts, track compliance items, draft legal correspondence.',
    persona: 'analyst',
    connectors: ['email'],
    suggestedCommands: ['/review', '/research', '/draft', '/memory'],
    starterMemory: [
      'This workspace handles legal document review and compliance tracking.',
      'Key workflow: ingest document -> identify key clauses -> flag risks -> draft responses.',
      'Use /review for document analysis, /research for legal precedent, /memory for prior findings.',
    ],
    builtIn: true,
    category: 'legal',
  },
  {
    id: 'agency-consulting',
    name: 'Agency / Consulting',
    description: 'Multi-client workspace for agencies and consultants. Track deliverables, costs, and client context separately.',
    persona: 'project-manager',
    connectors: ['github', 'slack', 'email', 'google-docs'],
    suggestedCommands: ['/status', '/draft', '/catchup', '/plan'],
    starterMemory: [
      'This workspace manages a client engagement. Key fields: client name, budget, timeline, deliverables, stakeholders.',
      'Use separate workspaces per client to maintain confidentiality. Memory is isolated between workspaces.',
      'Use /status for project metrics, /draft for deliverables, /catchup for quick briefings.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'customer-support',
    name: 'Customer Support',
    description: 'Triage tickets, draft responses, build knowledge base articles, and manage escalations.',
    persona: 'support-agent',
    connectors: ['slack', 'email'],
    suggestedCommands: ['/draft', '/research', '/catchup', '/memory'],
    starterMemory: [
      'This workspace handles customer support tickets and knowledge management.',
      'Key workflow: triage incoming ticket -> research issue -> draft response -> update KB.',
      'Use /draft for response templates, /research for troubleshooting guides, /memory for past resolutions.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'finance-accounting',
    name: 'Finance & Accounting',
    description: 'Budgets, variance analysis, financial reporting, and close management.',
    persona: 'finance-owner',
    connectors: ['email'],
    suggestedCommands: ['/draft', '/research', '/plan', '/memory'],
    starterMemory: [
      'This workspace manages financial reporting and analysis.',
      'Key workflow: gather data -> run variance analysis -> draft reports -> track close items.',
      'Use /draft for financial memos, /research for benchmarking, /plan for close checklists.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'hr-people',
    name: 'HR & People',
    description: 'Job descriptions, policy drafting, onboarding plans, and compensation analysis.',
    persona: 'hr-manager',
    connectors: ['email', 'slack'],
    suggestedCommands: ['/draft', '/research', '/plan', '/catchup'],
    starterMemory: [
      'This workspace handles HR and people operations.',
      'Key workflow: identify need -> research best practices -> draft policy/JD -> review and publish.',
      'Use /draft for job descriptions, /research for compensation benchmarks, /plan for onboarding.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'operations-center',
    name: 'Operations Center',
    description: 'SOPs, process documentation, vendor management, and operational workflows.',
    persona: 'ops-manager',
    connectors: ['slack', 'email'],
    suggestedCommands: ['/plan', '/draft', '/status', '/catchup'],
    starterMemory: [
      'This workspace manages operational processes and documentation.',
      'Key workflow: identify process -> document SOP -> assign owners -> track compliance.',
      'Use /plan for process design, /draft for SOPs, /status for operational metrics.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'data-analytics',
    name: 'Data & Analytics',
    description: 'SQL queries, dashboard design, data exploration, and statistical analysis.',
    persona: 'data-engineer',
    connectors: ['github'],
    suggestedCommands: ['/research', '/draft', '/plan', '/memory'],
    starterMemory: [
      'This workspace handles data analysis and insights generation.',
      'Key workflow: define question -> write query -> analyze results -> build dashboard.',
      'Use /research for data exploration, /draft for analysis reports, /memory for schema knowledge.',
    ],
    builtIn: true,
    category: 'engineering',
  },
  {
    id: 'recruiting-pipeline',
    name: 'Recruiting Pipeline',
    description: 'Source candidates, write job descriptions, build screening scorecards, and track pipeline.',
    persona: 'recruiter',
    connectors: ['email', 'slack'],
    suggestedCommands: ['/draft', '/research', '/plan', '/catchup'],
    starterMemory: [
      'This workspace manages recruiting and talent acquisition.',
      'Key workflow: define role -> source candidates -> screen -> interview -> offer.',
      'Use /draft for JDs and scorecards, /research for talent market data, /plan for interview loops.',
    ],
    builtIn: true,
    category: 'operations',
  },
  {
    id: 'design-studio',
    name: 'Design Studio',
    description: 'Creative briefs, design feedback, brand guidelines, and asset management.',
    persona: 'creative-director',
    connectors: ['slack'],
    suggestedCommands: ['/draft', '/research', '/review', '/memory'],
    starterMemory: [
      'This workspace manages design projects and brand assets.',
      'Key workflow: define brief -> research references -> create -> review feedback -> finalize.',
      'Use /draft for creative briefs, /research for inspiration, /review for design critique.',
    ],
    builtIn: true,
    category: 'marketing',
  },
  {
    id: 'blank',
    name: 'Blank Workspace',
    description: 'Start from scratch with a general-purpose agent. No preset configuration.',
    persona: 'general-purpose',
    connectors: [],
    suggestedCommands: ['/research', '/draft', '/plan', '/memory'],
    starterMemory: [],
    builtIn: true,
  },
];

/** Read user-created templates from disk. */
function readUserTemplates(dataDir: string): WorkspaceTemplate[] {
  const filePath = path.join(dataDir, 'workspace-templates.json');
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed as WorkspaceTemplate[];
  } catch {
    return [];
  }
}

/** Write user-created templates to disk. */
function writeUserTemplates(dataDir: string, templates: WorkspaceTemplate[]): void {
  const filePath = path.join(dataDir, 'workspace-templates.json');
  fs.writeFileSync(filePath, JSON.stringify(templates, null, 2), 'utf-8');
}

/** Validate that a POST body has all required template fields. */
function validateTemplateBody(body: Record<string, unknown>): string | null {
  if (!body.name || typeof body.name !== 'string') return 'name is required (string)';
  if (!body.description || typeof body.description !== 'string') return 'description is required (string)';
  if (!body.persona || typeof body.persona !== 'string') return 'persona is required (string)';
  if (!Array.isArray(body.connectors)) return 'connectors is required (string[])';
  if (!Array.isArray(body.suggestedCommands)) return 'suggestedCommands is required (string[])';
  if (!Array.isArray(body.starterMemory)) return 'starterMemory is required (string[])';
  return null;
}

export const workspaceTemplateRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/workspace-templates — list all templates (built-in + user-created)
  server.get('/api/workspace-templates', async () => {
    const userTemplates = readUserTemplates(server.localConfig.dataDir);
    const allTemplates = [...BUILT_IN_TEMPLATES, ...userTemplates];
    return { templates: allTemplates, count: allTemplates.length };
  });

  // POST /api/workspace-templates — create a custom template
  server.post<{
    Body: {
      name: string;
      description: string;
      persona: string;
      connectors: string[];
      suggestedCommands: string[];
      starterMemory: string[];
    };
  }>('/api/workspace-templates', async (request, reply) => {
    const body = (request.body ?? {}) as Record<string, unknown>;
    const validationError = validateTemplateBody(body);
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const template: WorkspaceTemplate = {
      id,
      name: body.name as string,
      description: body.description as string,
      persona: body.persona as string,
      connectors: body.connectors as string[],
      suggestedCommands: body.suggestedCommands as string[],
      starterMemory: body.starterMemory as string[],
      builtIn: false,
    };

    const existing = readUserTemplates(server.localConfig.dataDir);
    existing.push(template);
    writeUserTemplates(server.localConfig.dataDir, existing);

    return template;
  });

  // PUT /api/workspace-templates/:id — update a custom template
  server.put<{
    Params: { id: string };
    Body: {
      name: string; description: string; persona: string;
      connectors: string[]; suggestedCommands: string[]; starterMemory: string[];
    };
  }>('/api/workspace-templates/:id', async (request, reply) => {
    const { id } = request.params;
    const body = (request.body ?? {}) as Record<string, unknown>;
    const validationError = validateTemplateBody(body);
    if (validationError) return reply.status(400).send({ error: validationError });

    // Cannot edit built-in templates
    if (BUILT_IN_TEMPLATES.some(t => t.id === id)) {
      return reply.status(403).send({ error: 'Cannot edit built-in templates' });
    }

    const existing = readUserTemplates(server.localConfig.dataDir);
    const idx = existing.findIndex(t => t.id === id);
    if (idx < 0) return reply.status(404).send({ error: 'Template not found' });

    existing[idx] = {
      ...existing[idx],
      name: body.name as string,
      description: body.description as string,
      persona: body.persona as string,
      connectors: body.connectors as string[],
      suggestedCommands: body.suggestedCommands as string[],
      starterMemory: body.starterMemory as string[],
    };
    writeUserTemplates(server.localConfig.dataDir, existing);
    return existing[idx];
  });

  // DELETE /api/workspace-templates/:id — delete a custom template
  server.delete<{ Params: { id: string } }>('/api/workspace-templates/:id', async (request, reply) => {
    const { id } = request.params;

    if (BUILT_IN_TEMPLATES.some(t => t.id === id)) {
      return reply.status(403).send({ error: 'Cannot delete built-in templates' });
    }

    const existing = readUserTemplates(server.localConfig.dataDir);
    const idx = existing.findIndex(t => t.id === id);
    if (idx < 0) return reply.status(404).send({ error: 'Template not found' });

    existing.splice(idx, 1);
    writeUserTemplates(server.localConfig.dataDir, existing);
    return { ok: true };
  });

  // POST /api/workspace-templates/generate — AI-powered template generation
  server.post<{
    Body: {
      prompt: string;
      availableConnectors: string[];
      availableCommands: string[];
      availablePersonas: string[];
    };
  }>('/api/workspace-templates/generate', async (request, reply) => {
    const { prompt, availableConnectors, availableCommands, availablePersonas } = request.body as {
      prompt: string;
      availableConnectors: string[];
      availableCommands: string[];
      availablePersonas: string[];
    };

    if (!prompt?.trim()) {
      return reply.status(400).send({ error: 'prompt is required' });
    }

    // Check for API key in server settings
    const settingsPath = path.join(server.localConfig.dataDir, 'settings.json');
    let apiKey = '';
    let model = 'claude-sonnet-4-20250514';
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      apiKey = settings.apiKey || '';
      model = settings.model || model;
    } catch { /* use defaults */ }

    if (!apiKey) {
      return reply.status(400).send({ error: 'API key not configured. Set it in Settings first.' });
    }

    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey });

      const systemPrompt = `You are a workspace template generator. Given a user's description of their use case, generate a workspace template configuration.

Available personas: ${availablePersonas.join(', ')}
Available connectors: ${availableConnectors.join(', ')}
Available commands: ${availableCommands.join(', ')}

Return a JSON object with these fields:
- name: short template name (2-4 words)
- description: one-sentence description of the template's purpose
- persona: one of the available personas that best fits
- connectors: array of relevant connectors from the available list
- suggestedCommands: array of relevant commands from the available list
- starterMemory: array of 2-4 sentences that seed the agent's memory with domain context and key workflows

Only use values from the available lists for persona, connectors, and commands. Return ONLY valid JSON, no markdown.`;

      const response = await client.messages.create({
        model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content
        .filter((b): b is Extract<(typeof response.content)[number], { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('');

      // Parse JSON from response (strip markdown fences if present)
      const jsonStr = text.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
      const generated = JSON.parse(jsonStr);

      return {
        name: generated.name || '',
        description: generated.description || '',
        persona: generated.persona || 'analyst',
        connectors: Array.isArray(generated.connectors) ? generated.connectors : [],
        suggestedCommands: Array.isArray(generated.suggestedCommands) ? generated.suggestedCommands : [],
        starterMemory: Array.isArray(generated.starterMemory) ? generated.starterMemory : [],
      };
    } catch (err) {
      const msg = (err as Error).message;
      return reply.status(500).send({ error: `AI generation failed: ${msg}` });
    }
  });
};
