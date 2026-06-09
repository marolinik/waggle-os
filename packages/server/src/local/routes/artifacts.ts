import type { FastifyPluginAsync } from 'fastify';
import type {
  Artifact, ArtifactKind, ArtifactStatus, Memory, RelatedRef, RelatedSearchResult,
} from '@waggle/shared';
import { FrameStore, SessionStore } from '@waggle/core';
import {
  readArtifactIndex, addArtifact, getArtifactInWorkspace,
  patchArtifactInWorkspace, deleteArtifactFromWorkspace, type NewArtifactInput,
} from './artifact-index.js';
import { normalizeToMemory } from './memory-center.js';
import { readTasks } from './tasks.js';
import { emitAuditEvent } from './events.js';
import { assertSafeSegment } from './validate.js';

/**
 * UX-Refactor Phase 2C — Artifact Center REST surface (S05, PRD §16.6).
 *
 * Artifacts are first-class produced OUTCOMES (decks/docs/sheets/dashboards/
 * research), not raw file attachments. Per the Phase-2 gate ratification (A6) the
 * backing store is a per-workspace `artifacts.json` index (`artifact-index.ts`) —
 * NO `.mind` migration. This plugin exposes the 6 routes the Artifact Center needs:
 *   GET    /api/artifacts                 list + facet-filter, cross-workspace
 *   POST   /api/artifacts                 record a produced output
 *   GET    /api/artifacts/:id             one artifact (resolves owning workspace)
 *   PATCH  /api/artifacts/:id             edit title/status/tags/relations (Archive = status:'archived', A8)
 *   DELETE /api/artifacts/:id             hard delete the index entry (A8)
 *   GET    /api/artifacts/search-related  the headline federated search (PRD line 532)
 *
 * Gate ratifications honoured: A6 (artifacts.json index), A8 (Archive = reversible
 * status via PATCH; Delete = hard delete), C12 (previews are FE icon + on-click,
 * no server thumbnails — no preview generation here). `POST /:id/share` is deferred
 * to the Team phase (gap card §7) — gated behind TEAMS there, not in this cut.
 */

const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'document', 'presentation', 'spreadsheet', 'dashboard',
  'research', 'code', 'media', 'design', 'other',
];
const ARTIFACT_STATUSES: readonly ArtifactStatus[] = [
  'draft', 'ready', 'in_review', 'final', 'archived',
];

// Defense-in-depth caps on free-form fields (mirrors memory-center.ts).
const MAX_TITLE_LEN = 500;
const MAX_TAGS = 30;
const MAX_TAG_LEN = 80;
const MAX_RELATED = 200;
const MAX_REL_ID_LEN = 200;
const MAX_PATH_LEN = 2000;
// Cross-workspace fan-out / federation guards.
const MAX_LIST = 200;
const MAX_WORKSPACE_FANOUT = 24;
const PER_SOURCE_CAP = 10;
const MEMORY_SCAN = 100;
const SESSION_SCAN = 50;

const asKind = (v: unknown): ArtifactKind | undefined =>
  ARTIFACT_KINDS.includes(v as ArtifactKind) ? (v as ArtifactKind) : undefined;
const asStatus = (v: unknown): ArtifactStatus | undefined =>
  ARTIFACT_STATUSES.includes(v as ArtifactStatus) ? (v as ArtifactStatus) : undefined;

const clampStr = (s: unknown, max: number): string => String(s ?? '').slice(0, max);
const clampStrArray = (a: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(a) ? a.slice(0, maxItems).map((x) => clampStr(x, maxLen)) : [];

/** Case-insensitive substring match over an artifact's title + tags. */
function artifactMatches(a: Artifact, ql: string): boolean {
  if (a.title.toLowerCase().includes(ql)) return true;
  return (a.tags ?? []).some((t) => t.toLowerCase().includes(ql));
}

export const artifactRoutes: FastifyPluginAsync = async (server) => {
  const dataDir = server.localConfig.dataDir;

  /** Workspace ids to scan: the single requested one, else every workspace
   *  (bounded). Never throws — a failed workspace list degrades to []. */
  function workspaceIds(only?: string): string[] {
    if (only) return [only];
    try {
      return server.workspaceManager.list().slice(0, MAX_WORKSPACE_FANOUT).map((w) => w.id);
    } catch {
      return [];
    }
  }

  /** Read every requested workspace's artifact index, tagging read failures as
   *  skipped rather than failing the whole request. */
  function collectArtifacts(only?: string): Artifact[] {
    const out: Artifact[] = [];
    for (const wsId of workspaceIds(only)) {
      try {
        out.push(...readArtifactIndex(dataDir, wsId));
      } catch {
        // Skip an unreadable workspace index — partial data beats a 500.
      }
    }
    return out;
  }

  /** Resolve the workspace that owns an artifact id (scan when not given). */
  function resolveOwner(id: string, only?: string): { workspaceId: string; artifact: Artifact } | undefined {
    for (const wsId of workspaceIds(only)) {
      const found = getArtifactInWorkspace(dataDir, wsId, id);
      if (found) return { workspaceId: wsId, artifact: found };
    }
    return undefined;
  }

  // GET /api/artifacts — cross-workspace list with facet filters (PRD §12.5).
  server.get<{
    Querystring: {
      workspaceId?: string; kind?: string; status?: string; tag?: string; q?: string; limit?: string;
    };
  }>('/api/artifacts', async (request) => {
    const { workspaceId, kind, status, tag, q, limit } = request.query;
    const max = Math.min(limit ? parseInt(limit, 10) || MAX_LIST : MAX_LIST, MAX_LIST);

    let results = collectArtifacts(workspaceId);
    if (kind) results = results.filter((a) => a.kind === kind);
    if (status) results = results.filter((a) => a.status === status);
    if (tag) {
      const tl = tag.toLowerCase();
      results = results.filter((a) => (a.tags ?? []).some((t) => t.toLowerCase() === tl));
    }
    if (q) {
      const ql = q.toLowerCase();
      results = results.filter((a) => artifactMatches(a, ql));
    }
    results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const page = results.slice(0, max);
    return { results: page, count: page.length };
  });

  // GET /api/artifacts/search-related — the headline federated endpoint (PRD line
  // 532): a query returns matching artifacts PLUS related memories/sessions/tasks/
  // agents. Each source is bounded + independently guarded so one failing group
  // never breaks the response. NOTE: `agents` is intentionally empty in v1 — the
  // Agent entity is a Phase-3 surface (S09, gate B3) that does not exist yet.
  // Registered before `/:id` so the literal path is not shadowed by the param route.
  server.get<{
    Querystring: { q?: string; workspaceId?: string };
  }>('/api/artifacts/search-related', async (request, reply) => {
    const q = (request.query.q ?? '').trim();
    if (!q) return reply.status(400).send({ error: 'q is required' });
    const ql = q.toLowerCase();
    const only = request.query.workspaceId;

    // artifacts
    const artifacts = collectArtifacts(only)
      .filter((a) => artifactMatches(a, ql))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, PER_SOURCE_CAP);

    // memories — personal + (scoped|all) workspace minds, via the shared normalizer.
    const memories: Memory[] = [];
    try {
      const scan = (db: import('@waggle/core').MindDB | null | undefined, mind: string, wsId?: string) => {
        if (!db || memories.length >= PER_SOURCE_CAP) return;
        for (const f of new FrameStore(db).getRecent(MEMORY_SCAN)) {
          const m = normalizeToMemory(f, mind, wsId);
          if (m.content.toLowerCase().includes(ql) || m.title.toLowerCase().includes(ql)) {
            memories.push(m);
            if (memories.length >= PER_SOURCE_CAP) break;
          }
        }
      };
      scan(server.multiMind.personal, 'personal');
      for (const wsId of workspaceIds(only)) {
        if (memories.length >= PER_SOURCE_CAP) break;
        scan(server.agentState.getWorkspaceMindDb(wsId), 'workspace', wsId);
      }
    } catch {
      // degrade to whatever was collected
    }

    // tasks — cross-workspace JSONL board, title match.
    const tasks: RelatedRef[] = [];
    try {
      for (const wsId of workspaceIds(only)) {
        if (tasks.length >= PER_SOURCE_CAP) break;
        for (const t of readTasks(server.localConfig.dataDir, wsId)) {
          if (t.title.toLowerCase().includes(ql)) {
            tasks.push({ id: t.id, title: t.title, workspaceId: wsId, kind: t.status });
            if (tasks.length >= PER_SOURCE_CAP) break;
          }
        }
      }
    } catch {
      // skip
    }

    // sessions — bounded best-effort: recent active sessions whose summary matches.
    // (Full closed-session search lives on the dedicated /sessions/search route.)
    const sessions: RelatedRef[] = [];
    try {
      const scanSessions = (db: import('@waggle/core').MindDB | null | undefined, wsId?: string) => {
        if (!db || sessions.length >= PER_SOURCE_CAP) return;
        for (const s of new SessionStore(db).getActive().slice(0, SESSION_SCAN)) {
          const hay = `${s.summary ?? ''} ${s.gop_id}`.toLowerCase();
          if (hay.includes(ql)) {
            sessions.push({
              id: s.gop_id,
              title: s.summary?.slice(0, 120) || s.gop_id,
              workspaceId: wsId,
              kind: s.status,
            });
            if (sessions.length >= PER_SOURCE_CAP) break;
          }
        }
      };
      scanSessions(server.multiMind.personal);
      for (const wsId of workspaceIds(only)) {
        if (sessions.length >= PER_SOURCE_CAP) break;
        scanSessions(server.agentState.getWorkspaceMindDb(wsId), wsId);
      }
    } catch {
      // skip
    }

    const result: RelatedSearchResult = { artifacts, memories, sessions, tasks, agents: [] };
    return result;
  });

  // POST /api/artifacts — record a produced output in a workspace index.
  server.post<{
    Body: {
      title?: string; kind?: string; workspaceId?: string; source?: string;
      createdBy?: string; teamId?: string | null; status?: string; mimeType?: string;
      storagePath?: string; previewUrl?: string; tags?: string[];
      relatedMemoryIds?: string[]; relatedSessionIds?: string[];
      relatedTaskIds?: string[]; relatedAgentIds?: string[];
    };
  }>('/api/artifacts', async (request, reply) => {
    const b = request.body ?? {};
    if (!b.title || !b.title.trim()) {
      return reply.status(400).send({ error: 'title is required' });
    }
    if (!b.workspaceId) {
      return reply.status(400).send({ error: 'workspaceId is required' });
    }
    assertSafeSegment(b.workspaceId, 'workspaceId');
    const kind = asKind(b.kind);
    if (!kind) {
      return reply.status(400).send({ error: `kind must be one of: ${ARTIFACT_KINDS.join(', ')}` });
    }
    if (b.status !== undefined && !asStatus(b.status)) {
      return reply.status(400).send({ error: `Invalid status "${b.status}"` });
    }

    const input: NewArtifactInput = {
      title: clampStr(b.title, MAX_TITLE_LEN),
      kind,
      source: clampStr(b.source ?? 'user', 80),
      createdBy: clampStr(b.createdBy ?? 'user', 200),
      status: asStatus(b.status) ?? 'draft',
      ...(b.teamId !== undefined ? { teamId: b.teamId } : {}),
      ...(b.mimeType ? { mimeType: clampStr(b.mimeType, 200) } : {}),
      ...(b.storagePath ? { storagePath: clampStr(b.storagePath, MAX_PATH_LEN) } : {}),
      ...(b.previewUrl ? { previewUrl: clampStr(b.previewUrl, MAX_PATH_LEN) } : {}),
      ...(Array.isArray(b.tags) ? { tags: clampStrArray(b.tags, MAX_TAGS, MAX_TAG_LEN) } : {}),
      ...(Array.isArray(b.relatedMemoryIds) ? { relatedMemoryIds: clampStrArray(b.relatedMemoryIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(Array.isArray(b.relatedSessionIds) ? { relatedSessionIds: clampStrArray(b.relatedSessionIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(Array.isArray(b.relatedTaskIds) ? { relatedTaskIds: clampStrArray(b.relatedTaskIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(Array.isArray(b.relatedAgentIds) ? { relatedAgentIds: clampStrArray(b.relatedAgentIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
    };
    const artifact = addArtifact(dataDir, b.workspaceId, input);

    emitAuditEvent(server, {
      workspaceId: b.workspaceId,
      eventType: 'artifact_write',
      input: JSON.stringify({ action: 'create', title: input.title.slice(0, 200), kind }),
      output: JSON.stringify({ artifactId: artifact.id }),
    });
    return reply.status(201).send(artifact);
  });

  // GET /api/artifacts/:id — one artifact (resolves owning workspace if not given).
  server.get<{
    Params: { id: string };
    Querystring: { workspaceId?: string };
  }>('/api/artifacts/:id', async (request, reply) => {
    const owner = resolveOwner(request.params.id, request.query.workspaceId);
    if (!owner) return reply.status(404).send({ error: 'Artifact not found' });
    return owner.artifact;
  });

  // PATCH /api/artifacts/:id — edit metadata/relations. Archive = status:'archived'
  // (A8 reversible — there is no separate archive route; un-archive is the inverse PATCH).
  server.patch<{
    Params: { id: string };
    Querystring: { workspaceId?: string };
    Body: {
      title?: string; kind?: string; status?: string; mimeType?: string;
      storagePath?: string; previewUrl?: string; source?: string; teamId?: string | null;
      tags?: string[]; relatedMemoryIds?: string[]; relatedSessionIds?: string[];
      relatedTaskIds?: string[]; relatedAgentIds?: string[];
    };
  }>('/api/artifacts/:id', async (request, reply) => {
    const b = request.body ?? {};
    if (b.kind !== undefined && !asKind(b.kind)) {
      return reply.status(400).send({ error: `Invalid kind "${b.kind}"` });
    }
    if (b.status !== undefined && !asStatus(b.status)) {
      return reply.status(400).send({ error: `Invalid status "${b.status}"` });
    }
    const owner = resolveOwner(request.params.id, request.query.workspaceId);
    if (!owner) return reply.status(404).send({ error: 'Artifact not found' });

    const patch: Partial<Artifact> = {
      ...(b.title !== undefined ? { title: clampStr(b.title, MAX_TITLE_LEN) } : {}),
      ...(b.kind !== undefined ? { kind: b.kind as ArtifactKind } : {}),
      ...(b.status !== undefined ? { status: b.status as ArtifactStatus } : {}),
      ...(b.mimeType !== undefined ? { mimeType: clampStr(b.mimeType, 200) } : {}),
      ...(b.storagePath !== undefined ? { storagePath: clampStr(b.storagePath, MAX_PATH_LEN) } : {}),
      ...(b.previewUrl !== undefined ? { previewUrl: clampStr(b.previewUrl, MAX_PATH_LEN) } : {}),
      ...(b.source !== undefined ? { source: clampStr(b.source, 80) } : {}),
      ...(b.teamId !== undefined ? { teamId: b.teamId } : {}),
      ...(b.tags !== undefined ? { tags: clampStrArray(b.tags, MAX_TAGS, MAX_TAG_LEN) } : {}),
      ...(b.relatedMemoryIds !== undefined ? { relatedMemoryIds: clampStrArray(b.relatedMemoryIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(b.relatedSessionIds !== undefined ? { relatedSessionIds: clampStrArray(b.relatedSessionIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(b.relatedTaskIds !== undefined ? { relatedTaskIds: clampStrArray(b.relatedTaskIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
      ...(b.relatedAgentIds !== undefined ? { relatedAgentIds: clampStrArray(b.relatedAgentIds, MAX_RELATED, MAX_REL_ID_LEN) } : {}),
    };
    const updated = patchArtifactInWorkspace(dataDir, owner.workspaceId, request.params.id, patch);
    if (!updated) return reply.status(404).send({ error: 'Artifact not found' });

    emitAuditEvent(server, {
      workspaceId: owner.workspaceId,
      eventType: 'artifact_write',
      input: JSON.stringify({ action: 'patch', id: request.params.id }),
      output: JSON.stringify({ artifactId: updated.id, status: updated.status }),
    });
    return updated;
  });

  // DELETE /api/artifacts/:id — hard delete the index entry (A8, no tombstone).
  // v1 removes the artifact record only; the backing storage file (if any) is left
  // in place — it may be referenced elsewhere, and storage-level deletion belongs to
  // the storage routes. The FE gates this behind a scope-and-consequence confirm (J20).
  server.delete<{
    Params: { id: string };
    Querystring: { workspaceId?: string };
  }>('/api/artifacts/:id', async (request, reply) => {
    const owner = resolveOwner(request.params.id, request.query.workspaceId);
    if (!owner) return reply.status(404).send({ error: 'Artifact not found' });

    const removed = deleteArtifactFromWorkspace(dataDir, owner.workspaceId, request.params.id);
    if (!removed) return reply.status(404).send({ error: 'Artifact not found' });

    emitAuditEvent(server, {
      workspaceId: owner.workspaceId,
      eventType: 'artifact_delete',
      input: JSON.stringify({ id: request.params.id, workspaceId: owner.workspaceId }),
    });
    return reply.status(200).send({ deleted: true, id: request.params.id });
  });
};
