import type { FastifyPluginAsync } from 'fastify';
import { listPersonas, getPersona, saveCustomPersona, deleteCustomPersona, type AgentPersona } from '@waggle/agent';
import { requireTier } from '../../middleware/assert-tier.js';

/**
 * Personas routes — expose agent persona catalog to the UI.
 * System prompts are intentionally omitted from GET (large + sensitive).
 * POST/DELETE manage custom (user-created) personas stored on disk.
 */
export const personaRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/personas — list all available personas (no system prompts)
  fastify.get('/api/personas', async () => {
    const personas = listPersonas().map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      icon: p.icon,
      workspaceAffinity: p.workspaceAffinity,
      suggestedCommands: p.suggestedCommands,
    }));
    return { personas };
  });

  // POST /api/personas — create custom persona (BASIC+ tier required)
  fastify.post('/api/personas', { preHandler: [requireTier('BASIC')] }, async (request, reply) => {
    const dataDir = fastify.localConfig.dataDir;
    const body = request.body as Partial<AgentPersona>;
    if (!body.name || !body.systemPrompt) {
      return reply.code(400).send({ error: 'name and systemPrompt are required' });
    }
    const id = body.id ?? body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

    // Prevent overwriting built-in personas
    if (getPersona(id)) {
      return reply.code(409).send({ error: 'A built-in persona with this ID already exists' });
    }

    const persona: AgentPersona = {
      id,
      name: body.name,
      description: body.description ?? '',
      icon: body.icon ?? '🤖',
      systemPrompt: body.systemPrompt,
      modelPreference: body.modelPreference ?? 'claude-sonnet-4-6',
      tools: body.tools ?? [],
      workspaceAffinity: body.workspaceAffinity ?? [],
      suggestedCommands: body.suggestedCommands ?? [],
      defaultWorkflow: body.defaultWorkflow ?? null,
    };
    saveCustomPersona(dataDir, persona);
    return reply.code(201).send(persona);
  });

  // PATCH /api/personas/:id — update custom persona fields
  fastify.patch<{ Params: { id: string } }>('/api/personas/:id', async (request, reply) => {
    const dataDir = fastify.localConfig.dataDir;
    const { id } = request.params;
    const updates = request.body as Partial<AgentPersona>;

    // Don't allow patching built-in personas
    const builtIn = getPersona(id);
    if (builtIn && !builtIn.id.startsWith('custom-')) {
      return reply.code(403).send({ error: 'Cannot modify built-in persona' });
    }

    // Load existing custom persona from disk
    const { loadCustomPersonas } = await import('@waggle/agent');
    const customs = loadCustomPersonas(dataDir);
    const existing = customs.find(p => p.id === id);
    if (!existing) {
      return reply.code(404).send({ error: 'Custom persona not found' });
    }

    // Merge updates
    const merged: AgentPersona = {
      ...existing,
      ...(updates.name != null && { name: updates.name }),
      ...(updates.description != null && { description: updates.description }),
      ...(updates.icon != null && { icon: updates.icon }),
      ...(updates.systemPrompt != null && { systemPrompt: updates.systemPrompt }),
      ...(updates.tools != null && { tools: updates.tools }),
      ...(updates.modelPreference != null && { modelPreference: updates.modelPreference }),
      ...(updates.workspaceAffinity != null && { workspaceAffinity: updates.workspaceAffinity }),
      ...(updates.suggestedCommands != null && { suggestedCommands: updates.suggestedCommands }),
      ...(updates.defaultWorkflow != null && { defaultWorkflow: updates.defaultWorkflow }),
    };

    saveCustomPersona(dataDir, merged);
    return merged;
  });

  // POST /api/personas/generate — AI-generate a persona from a prompt (BASIC+ tier required)
  fastify.post('/api/personas/generate', { preHandler: [requireTier('BASIC')] }, async (request, reply) => {
    const body = request.body as { prompt?: string } | undefined;
    if (!body?.prompt) {
      return reply.code(400).send({ error: 'prompt is required' });
    }

    // Check if LLM is available
    const llmStatus = fastify.agentState?.llmProvider;
    if (!llmStatus || llmStatus.health === 'unavailable') {
      return reply.code(503).send({ error: 'LLM not available — cannot generate persona' });
    }

    try {
      const metaPrompt = `You are designing an AI agent persona. Based on the following description, generate a JSON object with these fields:
- name (string): A short, memorable name for this agent
- description (string): One-sentence description of what this agent does
- icon (string): A single emoji that represents this agent
- systemPrompt (string): The detailed system prompt that defines this agent's behavior, expertise, and communication style. Be thorough — this is the core of the persona.
- tools (string[]): List of tool categories this agent should have access to. Choose from: web_search, file_read, file_write, code_execution, browser, git, document_processing, data_analysis, communication

User's description: "${body.prompt}"

Respond with ONLY valid JSON, no markdown or explanation.`;

      // Use the built-in Anthropic proxy or LiteLLM
      const chatUrl = `http://localhost:${fastify.server.address()?.toString().split(':').pop() ?? '3333'}/api/anthropic/v1/messages`;
      const res = await fetch(chatUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          messages: [{ role: 'user', content: metaPrompt }],
        }),
      });

      if (!res.ok) {
        return reply.code(502).send({ error: 'LLM request failed' });
      }

      const result = await res.json() as any;
      const text = result.content?.[0]?.text ?? '';

      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return reply.code(500).send({ error: 'LLM did not return valid JSON' });
      }

      const generated = JSON.parse(jsonMatch[0]);
      return {
        name: generated.name ?? 'Custom Agent',
        description: generated.description ?? '',
        icon: generated.icon ?? '🤖',
        systemPrompt: generated.systemPrompt ?? '',
        tools: Array.isArray(generated.tools) ? generated.tools : [],
      };
    } catch (err: any) {
      return reply.code(500).send({ error: err.message ?? 'Generation failed' });
    }
  });

  // DELETE /api/personas/:id — delete custom persona
  fastify.delete<{ Params: { id: string } }>('/api/personas/:id', async (request, reply) => {
    const dataDir = fastify.localConfig.dataDir;
    const { id } = request.params;

    // Don't allow deleting built-in personas
    if (getPersona(id)) {
      return reply.code(403).send({ error: 'Cannot delete built-in persona' });
    }

    const deleted = deleteCustomPersona(dataDir, id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Persona not found' });
    }
    return { deleted: true, id };
  });
};
