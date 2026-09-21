import type { FastifyPluginAsync } from 'fastify';
import type { SearchScope, Importance, FrameSource, MemoryFrame } from '@waggle/core';
import {
  AwarenessLayer,
  evaluateExternalMemoryIngress,
  FrameStore,
  KnowledgeGraph,
  SessionStore,
} from '@waggle/core';
import { extractEntities } from '@waggle/agent';
import { emitAuditEvent } from './events.js';

// ── UX-Refactor Phase 1 (S01) quick-capture kinds ─────────────────────────
type QuickCaptureKind = 'note' | 'task' | 'link' | 'file';
const QUICK_CAPTURE_KINDS: readonly QuickCaptureKind[] = ['note', 'task', 'link', 'file'];

/**
 * M4: Sanitize memory frame content to prevent stored XSS.
 * Removes script blocks and retains only a small formatting-tag allowlist,
 * without attributes. Unknown tags are escaped as text.
 * Preserves normal text and markdown formatting.
 *
 * Exported so the Memory-Center route plugin (`memory-center.ts`) reuses the
 * SAME filter — duplicating a security primitive across two files is a drift
 * risk (a fix to one would silently miss the other).
 */
const SAFE_MEMORY_HTML_TAGS = new Set([
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'hr', 'i', 'li', 'ol', 'p', 'pre', 's', 'span', 'strong',
  'sub', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul',
]);

function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/g, char => char.toLowerCase());
}

function findMarkupEnd(value: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let index = start; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote) quote = undefined;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
  }
  return -1;
}

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function findClosingScript(value: string, folded: string, start: number): number {
  let cursor = start;
  while (cursor < value.length) {
    const close = folded.indexOf('</script', cursor);
    if (close === -1) return -1;
    let nameEnd = close + 8;
    while (/[a-z0-9:_-]/.test(folded[nameEnd] ?? '')) nameEnd++;
    if (nameEnd !== close + 8) {
      cursor = nameEnd;
      continue;
    }
    return findMarkupEnd(value, nameEnd);
  }
  return -1;
}

export function sanitizeFrameContent(content: string): string {
  // Scan monotonically. Regexes that search for a closing delimiter from every
  // possible opening tag become quadratic on near-limit malformed input.
  const folded = foldAsciiCase(content);
  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < content.length) {
    const open = content.indexOf('<', cursor);
    if (open === -1) {
      chunks.push(content.slice(cursor));
      break;
    }
    chunks.push(content.slice(cursor, open));

    if (folded.startsWith('<!--', open)) {
      const commentEnd = folded.indexOf('-->', open + 4);
      if (commentEnd === -1) break;
      cursor = commentEnd + 3;
      continue;
    }

    let nameStart = open + 1;
    let closing = false;
    if (folded[nameStart] === '/') {
      closing = true;
      nameStart++;
    }
    if (!/[a-z]/.test(folded[nameStart] ?? '')) {
      const specialEnd = (folded[nameStart] === '!' || folded[nameStart] === '?')
        ? findMarkupEnd(content, nameStart + 1)
        : -1;
      if (specialEnd >= 0) {
        chunks.push(escapeMarkup(content.slice(open, specialEnd + 1)));
        cursor = specialEnd + 1;
      } else {
        chunks.push('&lt;');
        cursor = open + 1;
      }
      continue;
    }

    let nameEnd = nameStart;
    while (/[a-z0-9:_-]/.test(folded[nameEnd] ?? '')) nameEnd++;
    const tagName = folded.slice(nameStart, nameEnd);
    const tagEnd = findMarkupEnd(content, nameEnd);
    if (tagEnd === -1) {
      if (!closing && tagName === 'script') break;
      chunks.push(escapeMarkup(content.slice(open)));
      break;
    }

    if (!closing && tagName === 'script') {
      const closeEnd = findClosingScript(content, folded, tagEnd + 1);
      if (closeEnd === -1) break;
      cursor = closeEnd + 1;
      continue;
    }

    if (SAFE_MEMORY_HTML_TAGS.has(tagName)) {
      chunks.push(closing ? `</${tagName}>` : `<${tagName}>`);
    } else {
      chunks.push(escapeMarkup(content.slice(open, tagEnd + 1)));
    }
    cursor = tagEnd + 1;
  }
  return chunks.join('');
}

/** Normalize SQLite snake_case MemoryFrame fields to camelCase UI Frame shape. */
function normalizeFrame(raw: Record<string, unknown>): Record<string, unknown> {
  // F24: Determine source_mind. For search results from MultiMind, `_mind` is set
  // explicitly. For MultiMindSearchResult, the `source` field is 'personal' | 'workspace'
  // which would overwrite the frame's provenance source. We detect this and split correctly.
  const mindSource = raw._mind as string | undefined;
  const rawSource = raw.source as string | undefined;
  // If source is 'personal' or 'workspace', it's the MultiMindSearchResult mind label,
  // not the frame's provenance source. Use it for source_mind, fall back to DB provenance.
  const isMindLabel = rawSource === 'personal' || rawSource === 'workspace';
  const sourceMind = mindSource ?? (isMindLabel ? rawSource : 'personal');
  const provenance = isMindLabel ? (raw._provenance_source as string ?? 'user_stated') : (rawSource ?? 'user_stated');

  return {
    id: raw.id,
    content: raw.content,
    // F7: Preserve provenance source from DB
    source: provenance,
    // F24: Which mind this frame came from — UI can show badge/icon
    source_mind: sourceMind,
    // Legacy alias for backward compat
    mind: sourceMind,
    frameType: raw.frame_type ?? raw.frameType ?? 'I',
    importance: raw.importance ?? 'normal',
    timestamp: raw.created_at ?? raw.timestamp ?? new Date().toISOString(),
    score: raw.score,
    gop: raw.gop_id ?? raw.gop,
    accessCount: raw.access_count,
    // I3: Team attribution (present for synced frames)
    ...(raw.author_id || raw.authorId ? { authorId: raw.author_id ?? raw.authorId } : {}),
    ...(raw.author_name || raw.authorName ? { authorName: raw.author_name ?? raw.authorName } : {}),
    // Global search: which workspace this frame belongs to
    ...(raw._workspace_name ? { workspaceName: raw._workspace_name } : {}),
  };
}

export const memoryRoutes: FastifyPluginAsync = async (server) => {
  function parseOptionalWorkspaceId(
    workspace: unknown,
    workspaceId: unknown,
  ): { ok: true; value?: string } | { ok: false } {
    const supplied = [workspace, workspaceId].filter((value) => value !== undefined);
    if (supplied.length === 0) return { ok: true };
    if (supplied.some((value) => typeof value !== 'string' || value.trim().length === 0)) {
      return { ok: false };
    }
    if (supplied.length === 2 && supplied[0] !== supplied[1]) return { ok: false };
    return { ok: true, value: supplied[0] as string };
  }

  /**
   * Ensure multiMind has the correct workspace mind loaded before searching.
   * Uses the server's workspace mind cache to avoid closing/reopening DBs.
   */
  function ensureWorkspaceMind(workspaceId: string): boolean {
    const wsDb = server.agentState.getWorkspaceMindDb(workspaceId);
    if (!wsDb) return false;
    // Use setWorkspace (not switchWorkspace) to avoid opening duplicate connections.
    // The cache owns DB lifecycle — multiMind just borrows the reference.
    if (server.multiMind.workspace !== wsDb) {
      server.multiMind.setWorkspace(wsDb);
    }
    return true;
  }

  function searchAllWorkspaces(srv: typeof server, query: string, limit: number): Array<Omit<MemoryFrame, 'source'> & { source?: string; _mind?: string; _workspace_name?: string }> {
    const results: Array<Omit<MemoryFrame, 'source'> & { source?: string; _mind?: string; _workspace_name?: string }> = [];

    // Search personal mind
    const personalResults = srv.multiMind.search(query, 'personal', limit);
    for (const r of personalResults) {
      results.push({ ...r, _mind: 'personal' });
    }

    // Search each workspace mind via the cache
    const workspaces = srv.agentState.listWorkspaces?.() ?? [];
    for (const ws of workspaces) {
      const wsDb = srv.agentState.getWorkspaceMindDb(ws.id);
      if (!wsDb) continue;
      try {
        const db = wsDb.getDatabase();
        const FTS_STOP_WORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'this', 'that', 'it', 'its', 'and', 'or', 'but', 'not']);
        const safeQuery = query
          .split(/\s+/)
          .map(w => w.replace(/[^\w]/g, ''))
          .filter(w => w.length > 2 && !FTS_STOP_WORDS.has(w.toLowerCase()))
          .map(w => `"${w.replace(/"/g, '')}"`)
          .join(' OR ');
        if (!safeQuery) continue;

        const rows = db.prepare(`
          SELECT mf.* FROM memory_frames_fts fts
          JOIN memory_frames mf ON mf.id = fts.rowid
          WHERE fts.content MATCH ?
          ORDER BY rank LIMIT ?
        `).all(safeQuery, Math.ceil(limit / 2)) as MemoryFrame[];

        for (const r of rows) {
          results.push({ ...r, _mind: 'workspace', _workspace_name: ws.name });
        }
      } catch { /* skip inaccessible workspace */ }
    }

    results.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    return results.slice(0, limit);
  }

  function recoverSearchProvenance(mind: unknown, frameId: unknown): string | undefined {
    if (mind !== 'personal' && mind !== 'workspace') return undefined;
    const id = typeof frameId === 'number' ? frameId : Number(frameId);
    if (!Number.isFinite(id)) return undefined;
    try {
      const frame = server.multiMind.getFrameStore(mind)?.getById(id);
      return frame?.source;
    } catch {
      return undefined;
    }
  }

  // GET /api/memory/search?q=query&scope=all|global&workspace=wsId&since=ISO&until=ISO
  server.get<{
    Querystring: { q?: string; scope?: string; limit?: string; workspace?: string; workspaceId?: string; since?: string; until?: string };
  }>('/api/memory/search', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId'
    const { q, scope, limit, workspace: ws, workspaceId: wsId, since, until } = request.query;
    const parsedWorkspace = parseOptionalWorkspaceId(ws, wsId);
    if (!parsedWorkspace.ok) {
      return reply.status(400).send({ error: 'workspace must be a non-empty string' });
    }
    const workspace = parsedWorkspace.value;
    if (!q) {
      return reply.status(400).send({ error: 'q (query) parameter is required' });
    }

    const searchScope = (scope === 'personal' || scope === 'workspace' || scope === 'all' || scope === 'global')
      ? scope
      : 'all';

    // Ensure workspace mind is loaded for workspace/all scope searches
    if (workspace && (searchScope === 'workspace' || searchScope === 'all')) {
      if (!ensureWorkspaceMind(workspace)) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
    }

    const maxResults = limit ? parseInt(limit, 10) : 20;

    // `source` here may be the MultiMind mind label ('personal'/'workspace'), which
    // is NOT a FrameSource — so omit the frame's source and re-add it as a plain
    // string (see the mind-label handling below).
    let rawResults: Array<Omit<MemoryFrame, 'source'> & { source?: string }>;

    if (searchScope === 'global') {
      rawResults = searchAllWorkspaces(server, q, maxResults);
    } else {
      rawResults = server.multiMind.search(q, searchScope as SearchScope, maxResults);
    }

    // F20: Temporal filtering — filter by since/until ISO date strings
    if (since || until) {
      rawResults = rawResults.filter(r => {
        const ts = r.created_at;
        if (!ts) return true;
        if (since && ts < since) return false;
        if (until && ts > until) return false;
        return true;
      });
    }

    // F24: MultiMindSearchResult.source is the mind label ('personal'/'workspace'),
    // which overwrites the frame's original provenance source. Preserve both.
    const results = rawResults.map(r => {
      const obj = r as unknown as Record<string, unknown>;
      // The frame's DB source column was overwritten by MultiMind search.
      // Stash it so normalizeFrame can recover both values.
      // We can detect: if source is 'personal'/'workspace', it's the mind label.
      // The original frame source can be recovered from the DB if needed, but
      // for the common case we mark _mind from the MultiMindSearchResult.source.
      if (obj.source === 'personal' || obj.source === 'workspace') {
        obj._mind = obj.source;
        // D7: Recover original provenance from the frame's DB row if available.
        // The HybridSearch result includes the full frame — check for _original_source
        // or fall back to the frame object's nested source field.
        const frameObj = (r as { frame?: { source?: string } }).frame;
        const dbSource = frameObj?.source ?? recoverSearchProvenance(obj.source, obj.id);
        if (dbSource && dbSource !== 'personal' && dbSource !== 'workspace') {
          obj._provenance_source = dbSource;
        }
      }
      return normalizeFrame(obj);
    });

    return { results, count: results.length };
  });

  // GET /api/memory/frames?workspace=wsId&limit=50&since=ISO&until=ISO
  // Returns recent frames without requiring a search query — used by Memory tab initial load.
  server.get<{
    Querystring: { workspace?: string; workspaceId?: string; limit?: string; since?: string; until?: string };
  }>('/api/memory/frames', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId'
    const { workspace: ws, workspaceId: wsId, limit, since, until } = request.query;
    const workspace = ws ?? wsId;
    const maxResults = limit ? parseInt(limit, 10) : 50;

    const raw: Array<Record<string, unknown>> = [];

    // Personal mind frames
    const personalStore = server.multiMind.getFrameStore('personal');
    if (personalStore) {
      const pFrames = personalStore.getRecent(maxResults);
      raw.push(...pFrames.map(f => ({ ...(f as unknown as Record<string, unknown>), _mind: 'personal' })));
    }

    // Workspace mind frames (use cached MindDB directly — no switchWorkspace needed)
    if (workspace) {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) {
        const wsStore = new FrameStore(wsDb);
        const wFrames = wsStore.getRecent(maxResults);
        raw.push(...wFrames.map(f => ({ ...(f as unknown as Record<string, unknown>), _mind: 'workspace' })));
      }
    }

    // Sort by created_at descending and limit
    raw.sort((a, b) =>
      String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')),
    );

    // F20: Temporal filtering — filter by since/until ISO date strings
    let filtered = raw;
    if (since || until) {
      filtered = raw.filter(r => {
        const ts = String(r.created_at ?? '');
        if (!ts) return true;
        if (since && ts < since) return false;
        if (until && ts > until) return false;
        return true;
      });
    }

    const results = filtered.slice(0, maxResults).map(normalizeFrame);
    return { results, count: results.length };
  });

  // W5.9: POST /api/memory/frames — direct memory write API
  // For bulk loading, pipeline output, testing. Bypasses agent loop.
  // F13: Optional entity extraction via ?extract=true (default: true)
  server.post<{
    Body: {
      content: string;
      workspace?: string;
      workspaceId?: string;
      importance?: string;
      source?: string;
    };
    Querystring: {
      extract?: string;
    };
  }>('/api/memory/frames', async (request, reply) => {
    // P0-4: Accept both 'workspace' and 'workspaceId'
    const { content: rawContent, workspace: ws, workspaceId: wsId, importance, source } = request.body ?? {};
    const parsedWorkspace = parseOptionalWorkspaceId(ws, wsId);
    if (!parsedWorkspace.ok) {
      return reply.status(400).send({ error: 'workspace must be a non-empty string' });
    }
    const workspace = parsedWorkspace.value;
    if (typeof rawContent !== 'string' || !rawContent) {
      return reply.status(400).send({ error: 'content is required' });
    }
    // M4: Sanitize content to prevent stored XSS
    const content = sanitizeFrameContent(rawContent);
    // This is the exact full projection that can reach FrameStore, FTS, entity
    // extraction, and audit persistence. Reject it before any of those stores
    // (including the otherwise-created active session) can be mutated.
    const ingressDecision = evaluateExternalMemoryIngress({ content });
    if (ingressDecision.action !== 'allow') {
      return reply.status(400).send({ error: 'Memory content could not be saved.' });
    }

    const VALID_IMPORTANCE: readonly Importance[] = ['critical', 'important', 'normal', 'temporary', 'deprecated'];
    const imp: Importance = VALID_IMPORTANCE.includes(importance as Importance)
      ? (importance as Importance)
      : 'normal';
    // D6: Validate source to prevent raw SQLite CHECK constraint errors
    const VALID_SOURCES: readonly FrameSource[] = ['user_stated', 'tool_verified', 'agent_inferred', 'import', 'system'];
    const src: FrameSource = (source ?? 'import') as FrameSource;
    if (!VALID_SOURCES.includes(src)) {
      return reply.status(400).send({
        error: `Invalid source "${src}". Valid values: ${VALID_SOURCES.join(', ')}`,
      });
    }

    // F13: determine whether to run entity extraction (default: true)
    const extractParam = request.query?.extract;
    const shouldExtract = extractParam !== 'false' && extractParam !== '0';

    // Determine target mind
    let targetDb;
    let mindLabel: string = 'personal';
    if (workspace) {
      targetDb = server.agentState.getWorkspaceMindDb(workspace);
      if (!targetDb) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      mindLabel = 'workspace';
    }
    if (!targetDb) {
      targetDb = server.multiMind.personal;
      mindLabel = 'personal';
    }

    const frames = new FrameStore(targetDb);
    const sessions = new SessionStore(targetDb);

    // Get or create active session
    const active = sessions.getActive();
    let gopId: string;
    if (active.length === 0) {
      const session = sessions.create();
      gopId = session.gop_id;
    } else {
      gopId = active[0].gop_id;
    }

    // BUG-R1-01: Dedup check at route level — catches both I-Frames and P-Frames
    const existingDup = frames.findDuplicate(content);
    if (existingDup) {
      return {
        saved: false,
        duplicate: true,
        frameId: existingDup.id,
        mind: mindLabel,
        message: 'Identical content already exists. Access count updated.',
      };
    }

    // Create frame
    const latestI = frames.getLatestIFrame(gopId);
    let frame;
    if (latestI) {
      frame = frames.createPFrame(gopId, content, latestI.id, imp, src);
    } else {
      frame = frames.createIFrame(gopId, content, imp, src);
    }

    // F13: Run entity extraction and KG enrichment after storing the frame
    let extraction: { entitiesExtracted: number; relationsCreated: number } | undefined;
    if (shouldExtract) {
      try {
        const extracted = extractEntities(content);
        if (extracted.length > 0) {
          const knowledge = new KnowledgeGraph(targetDb);
          const entityIds: number[] = [];

          // Upsert entities: skip if same type+name already exists
          for (const e of extracted) {
            const existing = knowledge.getEntitiesByType(e.type)
              .find(ent => ent.name.toLowerCase() === e.name.toLowerCase());
            if (existing) {
              entityIds.push(existing.id);
            } else {
              const created = knowledge.createEntity(e.type, e.name, {
                confidence: e.confidence,
                source: 'bulk-import',
              });
              entityIds.push(created.id);
            }
          }

          // Create co-occurrence relations between entities found in same text
          let relCount = 0;
          for (let i = 0; i < entityIds.length; i++) {
            for (let j = i + 1; j < entityIds.length; j++) {
              const existingRels = knowledge.getRelationsFrom(entityIds[i], 'co_occurs_with');
              const alreadyExists = existingRels.some(r => r.target_id === entityIds[j]);
              if (!alreadyExists) {
                knowledge.createRelation(entityIds[i], entityIds[j], 'co_occurs_with', 0.8, {
                  source: 'bulk-import',
                });
                relCount++;
              }
            }
          }

          extraction = {
            entitiesExtracted: entityIds.length,
            relationsCreated: relCount,
          };
        }
      } catch {
        // Entity extraction failure is non-blocking — frame is already saved
      }
    }

    // F2: Audit trail — memory write
    emitAuditEvent(server, {
      workspaceId: workspace ?? 'personal',
      eventType: 'memory_write',
      input: JSON.stringify({ content: content.slice(0, 500), importance: imp, source: src }),
      output: JSON.stringify({ frameId: frame.id, mind: mindLabel }),
    });

    return {
      saved: true,
      frameId: frame.id,
      mind: mindLabel,
      importance: imp,
      source: src,
      ...(extraction ? { extraction } : {}),
    };
  });

  // F1: GET /api/memory/stats — dedicated memory statistics endpoint
  server.get<{
    Querystring: { workspace?: string; workspaceId?: string; scope?: string };
  }>('/api/memory/stats', async (request) => {
    // P0-4: Accept both 'workspace' and 'workspaceId'
    const workspaceId = request.query.workspace ?? request.query.workspaceId;
    const personalDb = server.multiMind.personal;
    const personalFrames = new FrameStore(personalDb);
    const personalCount = personalFrames.list({ limit: 100000 }).length;

    let workspaceCount = 0;
    let workspaceEntities = 0;
    let workspaceRelations = 0;

    // W2D: count entities/relations directly instead of listing them. The old
    // path used getEntitiesByType('') → getEntities(limit 500), capping the
    // entity count at 500/mind, then ran an N+1 getRelationsFrom loop over only
    // those ≤500 alphabetical entities — so the displayed totals were undercounts.
    const countRelations = (wsDb: NonNullable<ReturnType<typeof server.agentState.getWorkspaceMindDb>>): number => {
      const row = wsDb.getDatabase().prepare(
        'SELECT COUNT(*) as cnt FROM knowledge_relations WHERE valid_to IS NULL',
      ).get() as { cnt: number };
      return row.cnt;
    };

    const countMind = (wsDb: ReturnType<typeof server.agentState.getWorkspaceMindDb>) => {
      if (!wsDb) return;
      const wsFrames = new FrameStore(wsDb);
      workspaceCount += wsFrames.list({ limit: 100000 }).length;
      const wsKg = new KnowledgeGraph(wsDb);
      workspaceEntities += wsKg.getEntityCount();
      workspaceRelations += countRelations(wsDb);
    };

    if (workspaceId) {
      countMind(server.agentState.getWorkspaceMindDb(workspaceId));
    } else if (request.query.scope === 'all-minds') {
      // === MIND ISOLATION (founder directive 2026-06-12) ===
      // Workspace minds are SEPARATE stores; no memory may leak between
      // users. This branch aggregates COUNTS ONLY (never content), is
      // explicit opt-in via ?scope=all-minds, and is valid ONLY on this
      // single-user loopback sidecar where every listed workspace belongs
      // to the local user. Do NOT port this aggregation to the multi-user
      // cloud server — there, totals must be scoped to the caller's ACL.
      try {
        for (const ws of server.workspaceManager.list()) {
          countMind(server.agentState.getWorkspaceMindDb(ws.id));
        }
      } catch { /* workspace enumeration unavailable — personal-only total */ }
    }

    const personalKg = new KnowledgeGraph(personalDb);
    const personalEntityCount = personalKg.getEntityCount();
    const personalRelations = countRelations(personalDb);

    return {
      personal: {
        frameCount: personalCount,
        entityCount: personalEntityCount,
        relationCount: personalRelations,
      },
      workspace: workspaceId ? {
        frameCount: workspaceCount,
        entityCount: workspaceEntities,
        relationCount: workspaceRelations,
      } : null,
      total: {
        frameCount: personalCount + workspaceCount,
        entityCount: personalEntityCount + workspaceEntities,
        relationCount: personalRelations + workspaceRelations,
      },
    };
  });

  // Q22: PUT /api/memory/frames/:id — edit a memory frame's content and/or importance
  server.put<{
    Params: { id: string };
    Body: { content: string; importance?: string };
    Querystring: { workspace?: string; workspaceId?: string };
  }>('/api/memory/frames/:id', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) {
      return reply.status(400).send({ error: 'Invalid frame ID' });
    }

    const { content: rawContent, importance } = request.body ?? {};
    if (typeof rawContent !== 'string' || !rawContent) {
      return reply.status(400).send({ error: 'content is required' });
    }

    // M4: Sanitize content to prevent stored XSS
    const content = sanitizeFrameContent(rawContent);
    if (evaluateExternalMemoryIngress({ content }).action !== 'allow') {
      return reply.status(400).send({ error: 'Memory content could not be saved.' });
    }

    // D6: Validate importance if provided
    const VALID_IMPORTANCE: readonly Importance[] = ['critical', 'important', 'normal', 'temporary', 'deprecated'];
    if (importance && !VALID_IMPORTANCE.includes(importance as Importance)) {
      return reply.status(400).send({
        error: `Invalid importance "${importance}". Valid values: ${VALID_IMPORTANCE.join(', ')}`,
      });
    }
    // After validation, `importance` is either undefined or a valid Importance.
    const imp: Importance | undefined = importance as Importance | undefined;

    const workspace = request.query.workspace ?? request.query.workspaceId;

    // Try workspace mind first, then personal
    let updated: Record<string, unknown> | undefined;
    let mindLabel = 'personal';
    if (workspace) {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) {
        const wsFrames = new FrameStore(wsDb);
        const result = wsFrames.update(frameId, content, imp);
        if (result) {
          updated = result as unknown as Record<string, unknown>;
          mindLabel = 'workspace';
        }
      }
    }
    if (!updated) {
      const personalFrames = new FrameStore(server.multiMind.personal);
      const result = personalFrames.update(frameId, content, imp);
      if (result) {
        updated = result as unknown as Record<string, unknown>;
        mindLabel = 'personal';
      }
    }

    if (!updated) {
      return reply.status(404).send({ error: 'Frame not found' });
    }

    // F2: Audit trail — memory edit
    emitAuditEvent(server, {
      workspaceId: workspace ?? 'personal',
      eventType: 'memory_write',
      input: JSON.stringify({ frameId, content: content.slice(0, 500), importance }),
      output: JSON.stringify({ frameId, mind: mindLabel, action: 'edit' }),
    });

    return { ...normalizeFrame({ ...updated, _mind: mindLabel }), updated: true };
  });

  // C5: PATCH /api/memory/frames/:id/access — atomic access_count increment.
  // Replaces the previous PUT-with-local-count read-modify-write dance, which
  // had a race under concurrent access. SQL `access_count = access_count + 1`
  // is serialized by SQLite.
  server.patch<{
    Params: { id: string };
    Querystring: { workspace?: string; workspaceId?: string };
  }>('/api/memory/frames/:id/access', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) {
      return reply.status(400).send({ error: 'Invalid frame ID' });
    }

    const workspace = request.query.workspace ?? request.query.workspaceId;

    let newCount: number | undefined;
    let mindLabel = 'personal';
    if (workspace) {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) {
        newCount = new FrameStore(wsDb).touch(frameId);
        if (newCount !== undefined) mindLabel = 'workspace';
      }
    }
    if (newCount === undefined) {
      newCount = new FrameStore(server.multiMind.personal).touch(frameId);
    }

    if (newCount === undefined) {
      return reply.status(404).send({ error: 'Frame not found' });
    }

    return { frameId, accessed: true, accessCount: newCount, mind: mindLabel };
  });

  // L2: DELETE /api/memory/frames/:id — delete a memory frame by ID
  server.delete<{
    Params: { id: string };
    Querystring: { workspace?: string; workspaceId?: string };
  }>('/api/memory/frames/:id', async (request, reply) => {
    const frameId = parseInt(request.params.id, 10);
    if (isNaN(frameId)) {
      return reply.status(400).send({ error: 'Invalid frame ID' });
    }

    // BUG-R1-02: Accept both 'workspace' and 'workspaceId' for workspace-specific deletion
    const workspace = request.query.workspace ?? request.query.workspaceId;

    // Try workspace mind first, then personal
    let deleted = false;
    if (workspace) {
      const wsDb = server.agentState.getWorkspaceMindDb(workspace);
      if (wsDb) {
        const wsFrames = new FrameStore(wsDb);
        deleted = wsFrames.delete(frameId);
      }
    }
    if (!deleted) {
      const personalFrames = new FrameStore(server.multiMind.personal);
      deleted = personalFrames.delete(frameId);
    }

    if (!deleted) {
      return reply.status(404).send({ error: 'Frame not found' });
    }
    // F2: Audit trail — memory delete
    emitAuditEvent(server, {
      workspaceId: workspace ?? 'personal',
      eventType: 'memory_delete',
      input: JSON.stringify({ frameId }),
    });
    return reply.status(200).send({ deleted: true, frameId });
  });

  // UX-Refactor Phase 1 (S01): POST /api/quick-capture — Home Cockpit quick
  // capture. Writes a memory frame (the durable record) and, for task-type
  // captures, an awareness `task` row so the capture surfaces in the workspace
  // state's active/pending lanes. Returns `{ frameId }` per `_phase1-contract.md`
  // §3. Reuses the FrameStore/SessionStore frame-write path above (no new store).
  server.post<{
    Body: { kind?: string; content?: string; workspaceId?: string };
  }>('/api/quick-capture', async (request, reply) => {
    const { kind: rawKind, content: rawContent, workspaceId } = request.body ?? {};
    const parsedWorkspace = parseOptionalWorkspaceId(undefined, workspaceId);
    if (!parsedWorkspace.ok) {
      return reply.status(400).send({ error: 'workspace must be a non-empty string' });
    }
    const workspace = parsedWorkspace.value;
    if (typeof rawContent !== 'string' || !rawContent.trim()) {
      return reply.status(400).send({ error: 'content is required' });
    }
    const kind: QuickCaptureKind = QUICK_CAPTURE_KINDS.includes(rawKind as QuickCaptureKind)
      ? (rawKind as QuickCaptureKind)
      : 'note';

    // M4: Sanitize content to prevent stored XSS (same path as /memory/frames).
    const content = sanitizeFrameContent(rawContent.trim());
    if (evaluateExternalMemoryIngress({ content }).action !== 'allow') {
      return reply.status(400).send({ error: 'Memory content could not be saved.' });
    }

    // Resolve the target mind — an explicit workspace must exist; omission is personal.
    let targetDb;
    let mindLabel: string = 'personal';
    if (workspace) {
      targetDb = server.agentState.getWorkspaceMindDb(workspace);
      if (!targetDb) {
        return reply.status(404).send({ error: 'Workspace not found' });
      }
      mindLabel = 'workspace';
    }
    if (!targetDb) {
      targetDb = server.multiMind.personal;
      mindLabel = 'personal';
    }

    const frames = new FrameStore(targetDb);
    const sessions = new SessionStore(targetDb);
    const active = sessions.getActive();
    const gopId = active.length > 0 ? active[0].gop_id : sessions.create().gop_id;

    // Provenance is user_stated — quick capture is the user speaking directly.
    const latestI = frames.getLatestIFrame(gopId);
    const frame = latestI
      ? frames.createPFrame(gopId, content, latestI.id, 'normal', 'user_stated')
      : frames.createIFrame(gopId, content, 'normal', 'user_stated');

    // Task captures additionally seed an awareness `task` row so they appear in
    // the workspace-state active/pending lanes (read by S01/S02 builders).
    let awarenessId: number | undefined;
    if (kind === 'task') {
      try {
        awarenessId = new AwarenessLayer(targetDb).add('task', content, 0, undefined, {
          context: 'quick-capture',
          status: 'open',
        }).id;
      } catch {
        // Non-blocking — the frame is already saved; awareness is best-effort.
      }
    }

    emitAuditEvent(server, {
      workspaceId: workspace ?? 'personal',
      eventType: 'memory_write',
      input: JSON.stringify({ kind, content: content.slice(0, 500), source: 'quick-capture' }),
      output: JSON.stringify({ frameId: frame.id, mind: mindLabel }),
    });

    return {
      frameId: String(frame.id),
      mind: mindLabel,
      kind,
      ...(awarenessId !== undefined ? { awarenessId } : {}),
    };
  });
};
