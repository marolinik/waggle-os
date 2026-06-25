import type { FastifyPluginAsync } from 'fastify';
import { KnowledgeGraph } from '@waggle/core';
import type { MindDB } from '@waggle/core';
import { assertSafeSegment } from './validate.js';

interface KGRow {
  id: number;
  name?: string;
  type?: string;
  entity_type?: string;
  source_id?: number;
  target_id?: number;
  relation_type?: string;
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

// The FE knowledge-graph contract (KGNode {id,label,type} / KGEdge
// {source,target,relationship}) differs from the raw SQLite columns
// (entity_type/name, source_id/target_id/relation_type). The route used to
// return raw rows, so every node read as type "Unknown" and no edge resolved
// (FE filtered on undefined .source/.target). Project to the contract as the
// FINAL step on every return path — AFTER the scope==='all' numeric-id merge,
// so the id-offset math (which reads numeric ids) still runs on raw rows.
interface ProjectedNode { id: string; label: string; type: string }
interface ProjectedEdge { source: string; target: string; relationship: string }

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

function projectKG(kg: { entities: KGRow[]; relations: KGRow[] }): {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
} {
  const nodes: ProjectedNode[] = kg.entities.map((e) => ({
    id: String(e.id),
    label: asStr(e.name) ?? String(e.id),
    type: asStr(e.entity_type) ?? asStr(e.type) ?? 'unknown',
  }));
  const edges: ProjectedEdge[] = kg.relations
    .filter((r) => r.source_id != null && r.target_id != null)
    .map((r) => ({
      source: String(r.source_id),
      target: String(r.target_id),
      relationship: asStr(r.relation_type) ?? asStr(r.relationship) ?? 'related',
    }));
  return { nodes, edges };
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

      return projectKG(merged);
    }

    if (scope === 'personal' || (!workspaceId && !scope)) {
      return projectKG(extractKGFromMind(server.multiMind.personal));
    }

    // Current/specific workspace
    if (workspaceId) {
      assertSafeSegment(workspaceId, 'workspace');
      const wsDb = server.agentState.getWorkspaceMindDb(workspaceId);
      if (!wsDb) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      return projectKG(extractKGFromMind(wsDb));
    }

    return { nodes: [], edges: [] };
  });
};
