import type { FastifyPluginAsync } from 'fastify';
import type { Importance, MemoryFrame } from '@waggle/core';
import { FrameStore, SessionStore } from '@waggle/core';
import type { Memory, MemoryKind, MemoryStatus, Scope } from '@waggle/shared';
import { emitAuditEvent } from './events.js';
import { sanitizeFrameContent } from './memory.js';

/**
 * UX-Refactor Phase 2B — Memory Center REST surface (S04, PRD §16.4).
 *
 * Distinct from `memory.ts` (the legacy frame ops: search/frames/stats and the
 * `/api/memory/frames` write path). This plugin serves the NEW shared `Memory`
 * entity contract (PRD §15.4) — bare `/api/memory[/:id]` routes that read/write
 * the `memory_frames.metadata` JSON blob (kind/confidence/scope/status/tags/
 * evidence/related*) added in Phase 2B.1, and normalise rows into the shared
 * `Memory` shape. Split into its own file to keep `memory.ts` under the 800-line
 * ceiling and to keep the entity contract cohesive.
 *
 * Gate ratifications honoured here: A8 (Archive = reversible status, Delete =
 * hard delete), B2 (confidence read from metadata), B6 (`MemoryKind` canonical),
 * C11 (merge = concatenate v1 + archive originals, not hard delete).
 */

const MEMORY_KINDS: readonly MemoryKind[] = [
  'fact', 'decision', 'task', 'preference', 'strategy', 'learning', 'goal', 'entity',
];
const MEMORY_STATUSES: readonly MemoryStatus[] = [
  'active', 'unreviewed', 'low_confidence', 'conflict', 'deprecated', 'archived',
];
const SCOPES: readonly Scope[] = ['personal', 'workspace', 'team', 'organization'];
const VALID_IMPORTANCE: readonly Importance[] = [
  'critical', 'important', 'normal', 'temporary', 'deprecated',
];

// Defense-in-depth caps on free-form metadata (S04 review LOW). The 1 MiB Fastify
// body limit already bounds the request, but capping here keeps the metadata blob
// small and coerces non-string array members to strings (matching read-back).
const MAX_TITLE_LEN = 500;
const MAX_TAGS = 30;
const MAX_TAG_LEN = 80;
const MAX_EVIDENCE_ITEMS = 20;
const MAX_EVIDENCE_ITEM_LEN = 2000;
const clampStr = (s: unknown, max: number): string => String(s ?? '').slice(0, max);
const clampStrArray = (a: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(a) ? a.slice(0, maxItems).map((x) => clampStr(x, maxLen)) : [];

const asKind = (v: unknown): MemoryKind | undefined =>
  MEMORY_KINDS.includes(v as MemoryKind) ? (v as MemoryKind) : undefined;
const asStatus = (v: unknown): MemoryStatus | undefined =>
  MEMORY_STATUSES.includes(v as MemoryStatus) ? (v as MemoryStatus) : undefined;
const asScope = (v: unknown): Scope | undefined =>
  SCOPES.includes(v as Scope) ? (v as Scope) : undefined;
const asImportance = (v: unknown): Importance | undefined =>
  VALID_IMPORTANCE.includes(v as Importance) ? (v as Importance) : undefined;

/** Parse the `memory_frames.metadata` TEXT blob defensively. Never throws —
 *  malformed JSON or a non-object payload yields an empty object. */
function parseFrameMetadata(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Derive a one-line title from frame content when metadata has none. */
function deriveTitle(content: string): string {
  const firstLine = content.split('\n').find((l) => l.trim().length > 0)?.trim() ?? content.trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 79)}…` : firstLine;
}

const stringArray = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined;

/** Project a DB frame row + its metadata blob into the shared `Memory` shape.
 *  Exported so the federated artifact `search-related` route (2C) can reuse the
 *  single normalization path rather than fork a second projection. */
export function normalizeToMemory(frame: MemoryFrame, mind: string, workspaceId?: string): Memory {
  const meta = parseFrameMetadata(frame.metadata);
  const content = frame.content ?? '';
  const importance: Memory['importance'] = frame.importance ?? 'normal';
  const status: MemoryStatus =
    asStatus(meta.status) ?? (importance === 'deprecated' ? 'deprecated' : 'active');
  const scope: Scope = asScope(meta.scope) ?? (mind === 'workspace' ? 'workspace' : 'personal');
  const title =
    typeof meta.title === 'string' && meta.title.trim() ? meta.title : deriveTitle(content);

  return {
    id: String(frame.id),
    kind: asKind(meta.kind) ?? 'fact',
    title,
    content,
    scope,
    workspaceId,
    source: frame.source ?? 'user_stated',
    sourceId: typeof meta.sourceId === 'string' ? meta.sourceId : null,
    sourceUrl: typeof meta.sourceUrl === 'string' ? meta.sourceUrl : null,
    confidence: typeof meta.confidence === 'number' ? meta.confidence : undefined,
    importance,
    evidence: stringArray(meta.evidence),
    tags: stringArray(meta.tags),
    relatedMemoryIds: Array.isArray(meta.relatedMemoryIds)
      ? meta.relatedMemoryIds.map(String)
      : undefined,
    relatedArtifactIds: Array.isArray(meta.relatedArtifactIds)
      ? meta.relatedArtifactIds.map(String)
      : undefined,
    status,
    createdAt: frame.created_at ?? new Date().toISOString(),
    updatedAt: typeof meta.updatedAt === 'string' ? meta.updatedAt : undefined,
    lastAccessedAt: frame.last_accessed,
  };
}

export const memoryCenterRoutes: FastifyPluginAsync = async (server) => {
  /** FrameStores to consult for a given workspace, workspace-first then personal
   *  — mirrors the resolution pattern in `memory.ts`.
   *
   *  P3/D2 mind-strictness: frame ids COLLIDE across the per-mind SQLite DBs
   *  (separate autoincrements), so the legacy fall-through is a destructive
   *  cross-mind hazard for mutations — a stale workspace row whose id has since
   *  vanished from the workspace store would resolve to (and hard-delete/patch)
   *  an unrelated PERSONAL frame. When the caller declares `mind`, resolution is
   *  strict: exactly that store, no fallback. Omitting mind keeps the legacy
   *  ordered fall-through for back-compat. */
  function candidateStores(
    workspace?: string,
    mind?: 'personal' | 'workspace',
  ): Array<{ store: FrameStore; mind: string }> {
    const stores: Array<{ store: FrameStore; mind: string }> = [];
    if (workspace && mind !== 'personal') {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) stores.push({ store: new FrameStore(wsDb), mind: 'workspace' });
    }
    if (mind !== 'workspace') {
      stores.push({ store: new FrameStore(server.multiMind.personal), mind: 'personal' });
    }
    return stores;
  }

  /** Validate an optional `mind` value shared by the routes below. Returns the
   *  narrowed value, or an Error message when invalid (caller 400s). A typo must
   *  fail loudly, not silently widen back to the fall-through. */
  function parseMind(
    mind: string | undefined,
    workspace: string | undefined,
  ): { ok: true; mind?: 'personal' | 'workspace' } | { ok: false; error: string } {
    if (mind === undefined) return { ok: true };
    if (mind !== 'personal' && mind !== 'workspace') {
      return { ok: false, error: "mind must be 'personal' or 'workspace'" };
    }
    if (mind === 'workspace' && !workspace) {
      return { ok: false, error: 'mind=workspace requires a workspace parameter' };
    }
    return { ok: true, mind };
  }

  // GET /api/memory — list memories as the shared Memory shape, with optional
  // in-memory filters (PRD §12.4: filter by kind/status/scope/confidence/text).
  // P3/D2: `mind=personal|workspace` selects a single store (the two-mind split
  // reads exactly one mind per view); omitting it keeps the legacy merge, where
  // `workspaceId` presence on a result is the mind discriminator. The merge view
  // can surface colliding frame ids across minds (separate SQLite autoincrements)
  // — single-mind reads are how the new UI avoids that ambiguity.
  server.get<{
    Querystring: {
      workspace?: string; workspaceId?: string; limit?: string; mind?: string;
      kind?: string; status?: string; scope?: string; q?: string; minConfidence?: string;
    };
  }>('/api/memory', async (request, reply) => {
    const { workspace: ws, workspaceId: wsId, limit, kind, status, scope, q, minConfidence } = request.query;
    const workspace = ws ?? wsId;
    const max = limit ? parseInt(limit, 10) : 100;

    const parsed = parseMind(request.query.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });
    const mind = parsed.mind;

    const out: Memory[] = [];
    if (mind !== 'workspace') {
      for (const f of new FrameStore(server.multiMind.personal).getRecent(max)) {
        out.push(normalizeToMemory(f, 'personal'));
      }
    }
    if (workspace && mind !== 'personal') {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) {
        for (const f of new FrameStore(wsDb).getRecent(max)) {
          out.push(normalizeToMemory(f, 'workspace', workspace));
        }
      }
    }

    let results = out;
    if (kind) results = results.filter((m) => m.kind === kind);
    if (status) results = results.filter((m) => m.status === status);
    if (scope) results = results.filter((m) => m.scope === scope);
    if (q) {
      const ql = q.toLowerCase();
      results = results.filter(
        (m) => m.content.toLowerCase().includes(ql) || m.title.toLowerCase().includes(ql),
      );
    }
    if (minConfidence) {
      const mc = parseInt(minConfidence, 10);
      if (!isNaN(mc)) results = results.filter((m) => (m.confidence ?? 0) >= mc);
    }
    results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { results: results.slice(0, max), count: Math.min(results.length, max) };
  });

  // GET /api/memory/:id — one memory in the shared shape.
  server.get<{
    Params: { id: string };
    Querystring: { workspace?: string; workspaceId?: string; mind?: string };
  }>('/api/memory/:id', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) return reply.status(400).send({ error: 'Invalid memory id' });
    const workspace = request.query.workspace ?? request.query.workspaceId;
    const parsed = parseMind(request.query.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });
    for (const c of candidateStores(workspace, parsed.mind)) {
      const frame = c.store.getById(frameId);
      if (frame) {
        return normalizeToMemory(frame, c.mind, c.mind === 'workspace' ? workspace : undefined);
      }
    }
    return reply.status(404).send({ error: 'Memory not found' });
  });

  // POST /api/memory — create a single curated memory (content + kind/scope/tags).
  // Bulk/pipeline writes + entity extraction stay on POST /api/memory/frames.
  server.post<{
    Body: {
      content?: string; title?: string; kind?: string; scope?: string;
      tags?: string[]; importance?: string; confidence?: number;
      workspace?: string; workspaceId?: string;
    };
  }>('/api/memory', async (request, reply) => {
    const b = request.body ?? {};
    if (!b.content || !b.content.trim()) {
      return reply.status(400).send({ error: 'content is required' });
    }
    const content = sanitizeFrameContent(b.content.trim());
    const workspace = b.workspace ?? b.workspaceId;

    let targetDb = workspace ? server.agentState.getWorkspaceMindDb(workspace) : undefined;
    let mind = targetDb ? 'workspace' : 'personal';
    if (!targetDb) {
      targetDb = server.multiMind.personal;
      mind = 'personal';
    }

    const frames = new FrameStore(targetDb);
    const sessions = new SessionStore(targetDb);
    const active = sessions.getActive();
    const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;
    const imp = asImportance(b.importance) ?? 'normal';

    const dup = frames.findDuplicate(content);
    const latestI = frames.getLatestIFrame(gopId);
    const frame =
      dup ??
      (latestI
        ? frames.createPFrame(gopId, content, latestI.id, imp, 'user_stated')
        : frames.createIFrame(gopId, content, imp, 'user_stated'));

    const meta: Record<string, unknown> = {
      kind: asKind(b.kind) ?? 'fact',
      scope: asScope(b.scope) ?? (mind === 'workspace' ? 'workspace' : 'personal'),
      status: 'active' satisfies MemoryStatus,
      ...(b.title ? { title: clampStr(b.title, MAX_TITLE_LEN) } : {}),
      ...(Array.isArray(b.tags) ? { tags: clampStrArray(b.tags, MAX_TAGS, MAX_TAG_LEN) } : {}),
      ...(typeof b.confidence === 'number' ? { confidence: b.confidence } : {}),
    };
    frames.setMetadata(frame.id, JSON.stringify(meta));

    emitAuditEvent(server, {
      // Attribute to the RESOLVED mind — an unknown workspace falls back to the
      // personal store above, and the audit row must say so (review finding).
      workspaceId: mind === 'workspace' && workspace ? workspace : 'personal',
      eventType: 'memory_write',
      input: JSON.stringify({ content: content.slice(0, 500), kind: meta.kind, source: 'memory-create' }),
      output: JSON.stringify({ frameId: frame.id, mind }),
    });

    const saved = frames.getById(frame.id);
    return saved
      ? normalizeToMemory(saved, mind, mind === 'workspace' ? workspace : undefined)
      : reply.status(500).send({ error: 'Failed to read back created memory' });
  });

  // PATCH /api/memory/:id — edit content/importance and/or metadata classification.
  server.patch<{
    Params: { id: string };
    Body: {
      content?: string; importance?: string; kind?: string; scope?: string;
      tags?: string[]; status?: string; title?: string; evidence?: string[];
    };
    Querystring: { workspace?: string; workspaceId?: string; mind?: string };
  }>('/api/memory/:id', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) return reply.status(400).send({ error: 'Invalid memory id' });
    const b = request.body ?? {};
    if (b.importance !== undefined && !asImportance(b.importance)) {
      return reply.status(400).send({ error: `Invalid importance "${b.importance}"` });
    }
    if (b.status !== undefined && !asStatus(b.status)) {
      return reply.status(400).send({ error: `Invalid status "${b.status}"` });
    }
    if (b.kind !== undefined && !asKind(b.kind)) {
      return reply.status(400).send({ error: `Invalid kind "${b.kind}"` });
    }
    const workspace = request.query.workspace ?? request.query.workspaceId;
    const parsed = parseMind(request.query.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });

    for (const c of candidateStores(workspace, parsed.mind)) {
      const existing = c.store.getById(frameId);
      if (!existing) continue;

      if (b.content !== undefined || b.importance !== undefined) {
        const content = b.content !== undefined ? sanitizeFrameContent(b.content) : existing.content;
        c.store.update(frameId, content, asImportance(b.importance));
      }

      const merged = parseFrameMetadata(c.store.getById(frameId)?.metadata);
      if (b.kind !== undefined) merged.kind = b.kind;
      if (b.scope !== undefined) merged.scope = b.scope;
      if (b.tags !== undefined) merged.tags = clampStrArray(b.tags, MAX_TAGS, MAX_TAG_LEN);
      if (b.status !== undefined) merged.status = b.status;
      if (b.title !== undefined) merged.title = clampStr(b.title, MAX_TITLE_LEN);
      if (b.evidence !== undefined) merged.evidence = clampStrArray(b.evidence, MAX_EVIDENCE_ITEMS, MAX_EVIDENCE_ITEM_LEN);
      merged.updatedAt = new Date().toISOString();
      c.store.setMetadata(frameId, JSON.stringify(merged));

      emitAuditEvent(server, {
        workspaceId: c.mind === 'workspace' && workspace ? workspace : 'personal',
        eventType: 'memory_write',
        input: JSON.stringify({ frameId, action: 'patch' }),
        output: JSON.stringify({ frameId, mind: c.mind }),
      });

      const updated = c.store.getById(frameId);
      return updated
        ? normalizeToMemory(updated, c.mind, c.mind === 'workspace' ? workspace : undefined)
        : reply.status(500).send({ error: 'Failed to read back memory' });
    }
    return reply.status(404).send({ error: 'Memory not found' });
  });

  // POST /api/memory/:id/archive — reversible Archive (A8). Sets status=archived.
  server.post<{
    Params: { id: string };
    Querystring: { workspace?: string; workspaceId?: string; mind?: string };
  }>('/api/memory/:id/archive', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) return reply.status(400).send({ error: 'Invalid memory id' });
    const workspace = request.query.workspace ?? request.query.workspaceId;
    const parsed = parseMind(request.query.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });

    for (const c of candidateStores(workspace, parsed.mind)) {
      const existing = c.store.getById(frameId);
      if (!existing) continue;
      const merged = parseFrameMetadata(existing.metadata);
      merged.status = 'archived' satisfies MemoryStatus;
      merged.updatedAt = new Date().toISOString();
      c.store.setMetadata(frameId, JSON.stringify(merged));

      emitAuditEvent(server, {
        workspaceId: c.mind === 'workspace' && workspace ? workspace : 'personal',
        eventType: 'memory_write',
        input: JSON.stringify({ frameId, action: 'archive' }),
        output: JSON.stringify({ frameId, mind: c.mind, status: 'archived' }),
      });

      const updated = c.store.getById(frameId);
      return updated
        ? normalizeToMemory(updated, c.mind, c.mind === 'workspace' ? workspace : undefined)
        : reply.status(500).send({ error: 'Failed to read back memory' });
    }
    return reply.status(404).send({ error: 'Memory not found' });
  });

  // DELETE /api/memory/:id — hard delete (A8 — no tombstone). Alias of the
  // legacy DELETE /api/memory/frames/:id, on the bare-id contract.
  server.delete<{
    Params: { id: string };
    Querystring: { workspace?: string; workspaceId?: string; mind?: string };
  }>('/api/memory/:id', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) return reply.status(400).send({ error: 'Invalid memory id' });
    const workspace = request.query.workspace ?? request.query.workspaceId;
    const parsed = parseMind(request.query.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });

    for (const c of candidateStores(workspace, parsed.mind)) {
      if (c.store.delete(frameId)) {
        emitAuditEvent(server, {
          workspaceId: c.mind === 'workspace' && workspace ? workspace : 'personal',
          eventType: 'memory_delete',
          input: JSON.stringify({ frameId, mind: c.mind }),
        });
        return reply.status(200).send({ deleted: true, id: String(frameId) });
      }
    }
    return reply.status(404).send({ error: 'Memory not found' });
  });

  // POST /api/memory/merge — merge >= 2 memories into one (C11: concatenate v1,
  // archive originals rather than hard-delete; LLM-synthesis deferred). All ids
  // must resolve within a single mind.
  server.post<{
    Body: { ids?: Array<string | number>; workspace?: string; workspaceId?: string; title?: string; mind?: string };
  }>('/api/memory/merge', async (request, reply) => {
    const b = request.body ?? {};
    const ids = (b.ids ?? []).map((x) => parseInt(String(x), 10)).filter((n) => !isNaN(n));
    if (ids.length < 2) {
      return reply.status(400).send({ error: 'merge requires at least 2 memory ids' });
    }
    const workspace = b.workspace ?? b.workspaceId;
    const parsed = parseMind(b.mind, workspace);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });

    // Find the store that holds ALL ids (single-mind merge for v1). Mind-strict
    // when declared: stale workspace ids must 404, never resolve as a complete
    // set in the PERSONAL store and merge+archive unrelated personal frames.
    let chosen: { store: FrameStore; mind: string } | undefined;
    let frames: MemoryFrame[] = [];
    for (const c of candidateStores(workspace, parsed.mind)) {
      const found = ids.map((id) => c.store.getById(id)).filter((f): f is MemoryFrame => !!f);
      if (found.length === ids.length) {
        chosen = c;
        frames = found;
        break;
      }
    }
    if (!chosen) {
      return reply.status(404).send({ error: 'All memory ids must exist within a single mind to merge' });
    }

    const mergedContent = sanitizeFrameContent(frames.map((f) => f.content).join('\n\n---\n\n'));
    const targetDb =
      chosen.mind === 'workspace' && workspace
        ? server.agentState.getWorkspaceMindDb(workspace)
        : server.multiMind.personal;
    if (!targetDb) return reply.status(500).send({ error: 'Target mind unavailable' });

    const sessions = new SessionStore(targetDb);
    const active = sessions.getActive();
    const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;

    // Highest importance among sources wins; the merged record is agent_inferred.
    const order: Importance[] = ['deprecated', 'temporary', 'normal', 'important', 'critical'];
    const importance = frames
      .map((f) => f.importance ?? 'normal')
      .reduce((a, c) => (order.indexOf(c) > order.indexOf(a) ? c : a), 'normal' as Importance);

    const newFrame = chosen.store.createIFrame(gopId, mergedContent, importance, 'agent_inferred');

    // Carry kind/scope from the first source; relate back to the originals.
    const firstMeta = parseFrameMetadata(frames[0].metadata);
    const mergedMeta: Record<string, unknown> = {
      kind: asKind(firstMeta.kind) ?? 'fact',
      scope: asScope(firstMeta.scope) ?? (chosen.mind === 'workspace' ? 'workspace' : 'personal'),
      status: 'active' satisfies MemoryStatus,
      relatedMemoryIds: ids.map(String),
      ...(b.title ? { title: b.title } : {}),
    };
    chosen.store.setMetadata(newFrame.id, JSON.stringify(mergedMeta));

    // Archive (not delete) the originals — reversible per C11/A8.
    for (const f of frames) {
      const m = parseFrameMetadata(f.metadata);
      m.status = 'archived' satisfies MemoryStatus;
      m.updatedAt = new Date().toISOString();
      m.mergedIntoId = String(newFrame.id);
      chosen.store.setMetadata(f.id, JSON.stringify(m));
    }

    emitAuditEvent(server, {
      workspaceId: chosen.mind === 'workspace' && workspace ? workspace : 'personal',
      eventType: 'memory_write',
      input: JSON.stringify({ action: 'merge', ids, mind: chosen.mind }),
      output: JSON.stringify({ mergedFrameId: newFrame.id }),
    });

    const saved = chosen.store.getById(newFrame.id);
    return saved
      ? normalizeToMemory(saved, chosen.mind, chosen.mind === 'workspace' ? workspace : undefined)
      : reply.status(500).send({ error: 'Failed to read back merged memory' });
  });
};
