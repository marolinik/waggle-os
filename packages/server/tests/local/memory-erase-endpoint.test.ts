/**
 * POST /api/memory/erase — #7 P1 GDPR Art.17 data-subject erasure SURFACE.
 *
 * The substrate (MindErasure.eraseFrame / eraseBySourceRef) is unit-tested in
 * hive-mind-core/tests/mind/erasure.test.ts. This file covers the HTTP contract
 * added to memory-center.ts: the two request modes (frame vs subject), per-mind
 * MindDB resolution (mirroring the /source route), mind-strict isolation, and
 * the input-validation error surface. It is deliberately distinct from the A8
 * frame-only DELETE /api/memory/:id (a UI convenience) — erase runs the full
 * Art.17 sweep: raw_archive redaction + FTS/vec/chunk-vec purge + KG orphan
 * hard-delete + verbatim raw-turn / B-frame reach.
 *
 * Exercised end-to-end via Fastify inject, the established style for this route.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import {
  MindDB, FrameStore, SessionStore, RawArchive,
  writeRawTurnFrames, MIND_RAWTURN_PREFIX, rawTurnConvKey,
} from '@waggle/core';
import { memoryCenterRoutes } from '../../src/local/routes/memory-center.js';

function createTestServer(db: MindDB, wsDbs: Record<string, MindDB> = {}) {
  const server = Fastify({ logger: false });
  server.decorate('multiMind', {
    personal: db,
    getFrameStore: (label: string) => (label === 'personal' ? new FrameStore(db) : undefined),
    search: () => [],
    workspace: undefined,
    setWorkspace: () => {},
  });
  server.decorate('agentState', {
    getWorkspaceMindDb: (id: string) => wsDbs[id],
    listWorkspaces: () => [],
  });
  // localConfig intentionally absent → emitAuditEvent is a safe no-op.
  server.register(memoryCenterRoutes);
  return server;
}

interface HItem { source: string; id: string; title: string; content: string }

/** Mirror the harvest route: archive the full verbatim source, create the
 *  summary frame, stamp canonical metadata.archiveUids. Returns the frame id. */
function persistArchivedFrame(db: MindDB, item: HItem): number {
  const frames = new FrameStore(db);
  const { archiveUid } = new RawArchive(db).append({
    source: item.source, sourceRef: item.id, title: item.title, content: item.content,
  });
  const frame = frames.createIFrame('harvest', `${item.title}\n\n${item.content.slice(0, 10_000)}`, 'normal', 'import');
  frames.setMetadata(frame.id, JSON.stringify({ status: 'unreviewed', sourceId: item.id, archiveUids: [archiveUid] }));
  return frame.id;
}

/** Count raw-turn frames currently stored for a (source, sourceRef) subject. */
function rawTurnCount(db: MindDB, source: string, sourceRef: string): number {
  const convKey = rawTurnConvKey({ source, id: sourceRef });
  const row = db.getDatabase()
    .prepare("SELECT COUNT(*) c FROM memory_frames WHERE content LIKE ?")
    .get(`${MIND_RAWTURN_PREFIX} conv:${convKey} %`) as { c: number };
  return row.c;
}

describe('POST /api/memory/erase (#7 P1 Art.17 erasure surface)', () => {
  let db: MindDB;
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    db = new MindDB(':memory:');
    new SessionStore(db).ensure('harvest', 'harvest', 'test');
    server = createTestServer(db);
  });

  afterEach(async () => {
    await server.close();
    db.close();
  });

  // ── Frame mode ────────────────────────────────────────────────────
  it('frame mode: erases one frame + its provenance and reports the breakdown', async () => {
    const id = persistArchivedFrame(db, { source: 'claude', id: 'f1', title: 'T', content: 'verbatim body' });
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: id } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { erased: boolean; mind: string; result: { framesDeleted: number; archiveRedacted: number } };
    expect(body.erased).toBe(true);
    expect(body.mind).toBe('personal');
    expect(body.result.framesDeleted).toBe(1);
    expect(body.result.archiveRedacted).toBe(1);
    // Frame is physically gone from the retrieval corpus.
    expect(new FrameStore(db).getById(id)).toBeUndefined();
    // …and its verbatim source no longer resolves.
    const src = await server.inject({ method: 'GET', url: `/api/memory/${id}/source` });
    expect(src.statusCode).toBe(404);
  });

  it('frame mode: accepts a string frameId (JSON numbers vs strings)', async () => {
    const id = persistArchivedFrame(db, { source: 'claude', id: 'f-str', title: 'T', content: 'body' });
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: String(id) } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { result: { framesDeleted: number } }).result.framesDeleted).toBe(1);
  });

  it('frame mode is Art.17-COMPLETE: erasing a harvested summary also sweeps its conversation raw-turns', async () => {
    const summaryId = persistArchivedFrame(db, { source: 'claude', id: 'conv-x', title: 'C', content: 'summary body' });
    const written = writeRawTurnFrames(new FrameStore(db), 'harvest', {
      source: 'claude', id: 'conv-x', title: 'C', content: 'summary body',
      messages: [
        { role: 'user', text: 'here is my private data' },
        { role: 'assistant', text: 'stored it' },
      ],
    } as Parameters<typeof writeRawTurnFrames>[2]).written;
    expect(written).toBe(2);
    expect(rawTurnCount(db, 'claude', 'conv-x')).toBe(2);

    // Erase by the SUMMARY frame id — a single-frame primitive would report 1
    // and leave the 2 verbatim raw-turns recall-able. The complete route sweeps
    // the whole subject: summary + 2 raw-turns = 3.
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: summaryId } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { result: { framesDeleted: number } }).result.framesDeleted).toBe(3);
    expect(rawTurnCount(db, 'claude', 'conv-x')).toBe(0);
    expect(new FrameStore(db).getById(summaryId)).toBeUndefined();
  });

  it('frame mode on a manual (un-harvested) frame is a simple single-frame erase', async () => {
    const frame = new FrameStore(db).createIFrame('harvest', 'a hand-written memory', 'normal', 'user_stated');
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: frame.id } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { result: { framesDeleted: number; archiveRedacted: number } };
    expect(body.result.framesDeleted).toBe(1);
    expect(body.result.archiveRedacted).toBe(0);   // no provenance to redact
    expect(new FrameStore(db).getById(frame.id)).toBeUndefined();
  });

  // Reference-bug-class guard: a harvested summary with NO archiveUids link
  // (raw_archive.append failed, or a legacy pre-#7 frame) must STILL sweep its
  // verbatim raw-turns — recovered via metadata.sourceId + the content prefix,
  // since reconstructSource returns [] with no archive link. Both harvest content
  // prefixes are covered (they differ): server '[Harvest:<src>]', MCP '[<src>]'.
  it('frame-mode fallback: no-archiveUids summary (server "[Harvest:x]" prefix) still sweeps raw-turns', async () => {
    const frames = new FrameStore(db);
    const summary = frames.createIFrame('harvest', '[Harvest:claude] Trip\n\nsummary body', 'normal', 'import');
    frames.setMetadata(summary.id, JSON.stringify({ status: 'unreviewed', sourceId: 'conv-noarch' }));
    const written = writeRawTurnFrames(frames, 'harvest', {
      source: 'claude', id: 'conv-noarch', title: 'Trip', content: 'summary body',
      messages: [{ role: 'user', text: 'private detail A' }, { role: 'assistant', text: 'ok' }],
    } as Parameters<typeof writeRawTurnFrames>[2]).written;
    expect(written).toBe(2);
    expect(rawTurnCount(db, 'claude', 'conv-noarch')).toBe(2);

    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: summary.id } });
    expect(res.statusCode).toBe(200);
    // summary + 2 raw-turns = 3 even though reconstructSource returns [] (no link).
    expect((res.json() as { result: { framesDeleted: number } }).result.framesDeleted).toBe(3);
    expect(rawTurnCount(db, 'claude', 'conv-noarch')).toBe(0);
    expect(new FrameStore(db).getById(summary.id)).toBeUndefined();
  });

  it('frame-mode fallback: no-archiveUids summary (MCP "[x]" prefix) still sweeps raw-turns', async () => {
    const frames = new FrameStore(db);
    const summary = frames.createIFrame('harvest', '[gemini] Trip: summary body', 'normal', 'import');
    frames.setMetadata(summary.id, JSON.stringify({ status: 'unreviewed', sourceId: 'conv-mcp' }));
    const written = writeRawTurnFrames(frames, 'harvest', {
      source: 'gemini', id: 'conv-mcp', title: 'Trip', content: 'summary body',
      messages: [{ role: 'user', text: 'private detail B' }, { role: 'assistant', text: 'ok' }],
    } as Parameters<typeof writeRawTurnFrames>[2]).written;
    expect(written).toBe(2);
    expect(rawTurnCount(db, 'gemini', 'conv-mcp')).toBe(2);

    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: summary.id } });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { result: { framesDeleted: number } }).result.framesDeleted).toBe(3);
    expect(rawTurnCount(db, 'gemini', 'conv-mcp')).toBe(0);
  });

  // ── Subject mode ──────────────────────────────────────────────────
  it('subject mode: sweeps the whole subject INCLUDING verbatim raw-turns (proves eraseBySourceRef, not eraseFrame)', async () => {
    const summaryId = persistArchivedFrame(db, { source: 'claude', id: 'conv-1', title: 'C', content: 'summary body' });
    const frames = new FrameStore(db);
    const written = writeRawTurnFrames(frames, 'harvest', {
      source: 'claude', id: 'conv-1', title: 'C', content: 'summary body',
      messages: [
        { role: 'user', text: 'my private secret is 42' },
        { role: 'assistant', text: 'noted, keeping it' },
      ],
    } as Parameters<typeof writeRawTurnFrames>[2]).written;
    expect(written).toBe(2);
    expect(rawTurnCount(db, 'claude', 'conv-1')).toBe(2);

    const res = await server.inject({
      method: 'POST', url: '/api/memory/erase',
      payload: { source: 'claude', sourceRef: 'conv-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { erased: boolean; result: { framesDeleted: number; archiveRedacted: number } };
    expect(body.erased).toBe(true);
    // summary + 2 raw-turn frames = 3; a frame-only primitive would report 1.
    expect(body.result.framesDeleted).toBe(3);
    expect(body.result.archiveRedacted).toBeGreaterThanOrEqual(1);
    expect(new FrameStore(db).getById(summaryId)).toBeUndefined();
    expect(rawTurnCount(db, 'claude', 'conv-1')).toBe(0);
  });

  it('subject mode: erasing an unknown subject is an idempotent no-op success (nothing to erase)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/memory/erase',
      payload: { source: 'claude', sourceRef: 'never-existed' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { erased: boolean; result: { framesDeleted: number } };
    expect(body.erased).toBe(true);
    expect(body.result.framesDeleted).toBe(0);
  });

  // ── Input validation ──────────────────────────────────────────────
  it('400s when neither frameId nor {source, sourceRef} is provided', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: {} });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/frameId|source/i);
  });

  it('400s when BOTH frameId and source are provided (ambiguous mode)', async () => {
    const res = await server.inject({
      method: 'POST', url: '/api/memory/erase',
      payload: { frameId: 1, source: 'claude', sourceRef: 'x' },
    });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/not both/i);
  });

  it('400s on a subject with source but no sourceRef', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { source: 'claude' } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/both source and sourceRef/i);
  });

  it('400s (not a crashy 500) on a non-string source/sourceRef', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { source: {}, sourceRef: {} } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toMatch(/both source and sourceRef/i);
  });

  it('400s on a non-numeric frameId', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: 'not-a-number' } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toBe('Invalid memory id');
  });

  it('404s in frame mode for an unknown frame id', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase', payload: { frameId: 999999 } });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBe('Memory not found');
  });

  it('400s when mind is invalid', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase?mind=bogus', payload: { frameId: 1 } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toContain('mind must be');
  });

  it('400s when mind=workspace without a workspace param', async () => {
    const res = await server.inject({ method: 'POST', url: '/api/memory/erase?mind=workspace', payload: { frameId: 1 } });
    expect(res.statusCode).toBe(400);
    expect((res.json() as { error: string }).error).toContain('mind=workspace requires');
  });

  // ── Mind isolation ────────────────────────────────────────────────
  it('erases from the WORKSPACE mind and leaves the colliding personal frame intact (mind-strict)', async () => {
    const wsDb = new MindDB(':memory:');
    new SessionStore(wsDb).ensure('harvest', 'harvest', 'test');
    const wsServer = createTestServer(db, { 'ws-1': wsDb });
    try {
      const wsFrameId = persistArchivedFrame(wsDb, { source: 'gemini', id: 'ws-src', title: 'T', content: 'workspace verbatim' });
      // A personal frame with the SAME id would exist because per-mind SQLite
      // autoincrements collide — persist one to prove strictness.
      const personalId = persistArchivedFrame(db, { source: 'claude', id: 'p-src', title: 'T', content: 'personal verbatim' });
      expect(personalId).toBe(wsFrameId);

      const res = await wsServer.inject({
        method: 'POST', url: `/api/memory/erase?workspace=ws-1&mind=workspace`,
        payload: { frameId: wsFrameId },
      });
      expect(res.statusCode).toBe(200);
      expect((res.json() as { mind: string }).mind).toBe('workspace');
      expect(new FrameStore(wsDb).getById(wsFrameId)).toBeUndefined();
      // The colliding personal frame is untouched.
      expect(new FrameStore(db).getById(personalId)).toBeDefined();
    } finally {
      await wsServer.close();
      wsDb.close();
    }
  });
});
