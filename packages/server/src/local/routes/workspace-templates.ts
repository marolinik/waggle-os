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

export type TemplateCategory = 'sales' | 'research' | 'engineering' | 'marketing' | 'operations' | 'legal' | 'custom';

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

/** The 6 built-in workspace templates. */
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
        .filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text)
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
