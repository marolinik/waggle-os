import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';
import { MindErasure, SuppressionStore } from '@waggle/core';

/**
 * #7 sticky erasure — GDPR Art.17 must survive re-import. After a subject is erased,
 * re-exporting/re-syncing the same source must NOT re-materialize it (the documented
 * gap: erase rotates archive_uid, freeing append()'s dedup key). This drives the REAL
 * server harvest-commit loop guard end-to-end. A re-import of the IDENTICAL set is
 * skipped upstream by the set-hash short-circuit, so we re-import a CHANGED set (the
 * erased thread + a new one) — the real "conversation grew, re-exported" scenario that
 * actually reaches the per-item loop.
 */

function chatgptThread(title: string, createTime: number, text: string): unknown {
  return {
    title,
    create_time: createTime,
    mapping: {
      n1: { message: { author: { role: 'user' }, content: { parts: [text] }, create_time: createTime } },
    },
  };
}

describe('#7 sticky erasure — erased subject does not re-materialize on re-import', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-sticky-erasure-'));
    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-import skips an erased conversation, still imports new ones, and re-consent restores it', async () => {
    const T1 = chatgptThread('SunsetGalleryPrivate', 1700000000, 'my private secret about the sunset');
    const commit = (data: unknown[]): Promise<{ statusCode: number; body: { skippedSuppressed?: number } }> =>
      injectWithAuth(server, { method: 'POST', url: '/api/harvest/commit', payload: { data, source: 'chatgpt' } })
        .then(r => ({ statusCode: r.statusCode, body: r.json() as { skippedSuppressed?: number } }));

    const personalDb = server.multiMind!.personal;
    const findT1Summary = (): number[] =>
      (personalDb.getDatabase().prepare(
        "SELECT id FROM memory_frames WHERE content LIKE '[Harvest:chatgpt]%SunsetGalleryPrivate%'"
      ).all() as Array<{ id: number }>).map(r => r.id);

    // 1. Initial import → the T1 summary frame exists.
    const r1 = await commit([T1]);
    expect(r1.statusCode).toBe(200);
    const t1Frames = findT1Summary();
    expect(t1Frames).toHaveLength(1);

    // 2. Erase T1 (frame mode) → the summary is gone AND the subject is recorded
    //    on the suppression list (capture inside MindErasure.eraseBySourceRef).
    new MindErasure(personalDb).eraseFrameComplete(t1Frames[0], 'gdpr-art17');
    expect(findT1Summary()).toHaveLength(0);
    const suppressed = new SuppressionStore(personalDb).list();
    expect(suppressed).toHaveLength(1);
    expect(suppressed[0].source).toBe('chatgpt');

    // 3. Re-import a CHANGED set (T1 unchanged + a new T2). The loop runs; T1 is
    //    skipped (suppressed), T2 imports normally.
    const T2 = chatgptThread('UnrelatedOtherTopic', 1700500000, 'completely unrelated content');
    const r3 = await commit([T1, T2]);
    expect(r3.statusCode).toBe(200);
    expect(r3.body.skippedSuppressed).toBe(1);
    expect(findT1Summary()).toHaveLength(0); // T1 stayed erased
    const t2Count = (personalDb.getDatabase().prepare(
      "SELECT COUNT(*) c FROM memory_frames WHERE content LIKE '[Harvest:chatgpt]%UnrelatedOtherTopic%'"
    ).get() as { c: number }).c;
    expect(t2Count).toBeGreaterThan(0); // the non-erased subject still imports

    // 4. Re-consent: unsuppress T1, then re-import a changed set again → T1 returns.
    new SuppressionStore(personalDb).unsuppress(suppressed[0].source, suppressed[0].sourceRef);
    const T3 = chatgptThread('ThirdDistinctThread', 1700900000, 'more new content');
    const r4 = await commit([T1, T2, T3]);
    expect(r4.statusCode).toBe(200);
    expect(r4.body.skippedSuppressed).toBe(0);
    expect(findT1Summary()).toHaveLength(1); // re-materialized after re-consent
  });
});
