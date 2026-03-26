import type { FastifyPluginAsync } from 'fastify';

/**
 * Mind routes — expose identity, awareness, and skills.
 * These mirror what the CLI accesses directly via Orchestrator.
 */
export const mindRoutes: FastifyPluginAsync = async (server) => {
  const { orchestrator, skills } = server.agentState;

  // GET /api/mind/identity — agent identity context
  server.get('/api/mind/identity', async () => {
    const identity = orchestrator.getIdentity();
    return { identity: identity.toContext() };
  });

  // GET /api/mind/awareness — current awareness state
  server.get('/api/mind/awareness', async () => {
    const awareness = orchestrator.getAwareness();
    return { awareness: awareness.toContext() };
  });

  // GET /api/mind/skills — list loaded skills
  server.get('/api/mind/skills', async () => {
    return {
      skills: skills.map(s => ({ name: s.name, length: s.content.length })),
      count: skills.length,
    };
  });
};
