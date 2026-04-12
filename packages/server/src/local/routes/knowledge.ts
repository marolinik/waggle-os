import type { FastifyPluginAsync } from 'fastify';
import { KnowledgeGraph } from '@waggle/core';
import type { MindDB } from '@waggle/core';
import { assertSafeSegment } from './validate.js';

interface KGRow {
  id: number;
  name?: string;
  type?: string;
  source_id?: number;
  target_id?: number;
  [key: string]: unknown;
}

function extractKGFromMind(mindDb: MindDB): { entities: KGRow[]; relations: KGRow[] } {
  try {
    const raw = mindDb.getDatabase();
    const entities = raw.prepare(
      'SELECT * FROM knowledge_entities WHERE valid_to IS NULL ORDER BY name'
    ).all() as KGRow[];
    const relations = raw.prepare(
      'SELECT * FROM knowledge_relations WHERE valid_to IS NULL ORDER BY id'
    ).all() as KGRow[];
    return { entities, relations };
  } catch {
    return { entities: [], relations: [] };
  }
}

export const knowledgeRoutes: FastifyPluginAsync = async (server) => {
  // GET /api/memory/graph?workspace=:id&scope=all|personal|current
  server.get<{
    Querystring: { workspace?: string; workspaceId?: string; scope?: string };
  }>('/api/memory/graph', async (request, reply) => {
    const workspaceId = request.query.workspace ?? request.query.workspaceId;
    const scope = request.query.scope;

    if (scope === 'all') {
      const merged = { entities: [] as KGRow[], relations: [] as KGRow[] };
      let idOffset = 0;

      // Personal mind
      const personal = extractKGFromMind(server.multiMind.personal);
      for (const e of personal.entities) {
        merged.entities.push({ ...e, _source: 'personal' });
      }
      for (const r of personal.relations) {
        merged.relations.push({ ...r, _source: 'personal' });
      }
      idOffset = Math.max(
        ...merged.entities.map(e => e.id ?? 0),
        ...merged.relations.map(r => r.id ?? 0),
        0
      ) + 1000;

      // Each workspace
      const workspaces = server.agentState.listWorkspaces();
      for (const ws of workspaces) {
        const wsDb = server.agentState.getWorkspaceMindDb(ws.id);
        if (!wsDb) continue;
        const wsKG = extractKGFromMind(wsDb);

        for (const e of wsKG.entities) {
          merged.entities.push({
            ...e,
            id: (e.id ?? 0) + idOffset,
            _source: ws.name,
          });
        }
        for (const r of wsKG.relations) {
          merged.relations.push({
            ...r,
            id: (r.id ?? 0) + idOffset,
            source_id: (r.source_id ?? 0) + idOffset,
            target_id: (r.target_id ?? 0) + idOffset,
            _source: ws.name,
          });
        }
        idOffset += 100000;
      }

      return merged;
    }

    if (scope === 'personal' || (!workspaceId && !scope)) {
      return extractKGFromMind(server.multiMind.personal);
    }

    // Current/specific workspace
    if (workspaceId) {
      assertSafeSegment(workspaceId, 'workspace');
      const wsDb = server.agentState.getWorkspaceMindDb(workspaceId);
      if (!wsDb) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      return extractKGFromMind(wsDb);
    }

    return { entities: [], relations: [] };
  });
};
