import type { FastifyPluginAsync } from 'fastify';
import { KnowledgeGraph, MindDB } from '@waggle/core';
import { assertSafeSegment } from './validate.js';

export const knowledgeRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/memory/graph?workspace=:id — get knowledge graph entities and relations
  server.get<{
    Querystring: { workspace?: string; workspaceId?: string };
  }>('/api/memory/graph', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId'
    const workspaceId = request.query.workspace ?? request.query.workspaceId;

    // Determine which MindDB to use
    let mindDb: MindDB;

    if (workspaceId) {
      assertSafeSegment(workspaceId, 'workspace');
      // Use workspace mind
      const ws = server.workspaceManager.get(workspaceId);
      if (!ws) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }

      const mindPath = server.workspaceManager.getMindPath(workspaceId);
      try {
        mindDb = new MindDB(mindPath);
      } catch {
        return { entities: [], relations: [] };
      }
    } else {
      // Use personal mind from multiMind
      mindDb = server.multiMind.personal;
    }

    try {
      const kg = new KnowledgeGraph(mindDb);
      const raw = mindDb.getDatabase();

      // Get all active entities
      const entities = raw.prepare(
        'SELECT * FROM knowledge_entities WHERE valid_to IS NULL ORDER BY name'
      ).all();

      // Get all active relations
      const relations = raw.prepare(
        'SELECT * FROM knowledge_relations WHERE valid_to IS NULL ORDER BY id'
      ).all();

      return { entities, relations };
    } catch {
      // Table might not exist if mind is empty/fresh
      return { entities: [], relations: [] };
    } finally {
      // Close the workspace mind if we opened one (don't close personal mind)
      if (workspaceId && mindDb !== server.multiMind.personal) {
        try { mindDb.close(); } catch { /* already closed */ }
      }
    }
  });
};
