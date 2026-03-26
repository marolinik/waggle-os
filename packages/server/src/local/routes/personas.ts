import type { FastifyPluginAsync } from 'fastify';
import { listPersonas, getPersona, saveCustomPersona, deleteCustomPersona, type AgentPersona } from '@waggle/agent';

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

  // POST /api/personas — create custom persona
  fastify.post('/api/personas', async (request, reply) => {
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
