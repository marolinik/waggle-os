import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, MindErasure, type UniversalImportItem } from '@waggle/core';
import { writeAutoSyncSummaryFrame, AUTOSYNC_PREVIEW_CAP } from '../../src/local/harvest-autosync-frame.js';

function fakeItem(over: Partial<UniversalImportItem> = {}): UniversalImportItem {
  return {
    id: 'sess-abc',
    source: 'claude-code',
    type: 'conversation',
    title: 'My session',
    content: 'verbatim PII content',
    timestamp: '2026-06-30T12:00:00Z',
    metadata: {},
    ...over,
  };
}

describe('writeAutoSyncSummaryFrame — Art.17 subject reachability', () => {
  let db: MindDB;
  let frames: FrameStore;
  let erasure: MindErasure;
  beforeEach(() => {
    db = new MindDB(':memory:');
    new SessionStore(db).ensure('harvest', 'harvest', 'test');
    frames = new FrameStore(db);
    erasure = new MindErasure(db);
  });
  afterEach(() => db.close());

  it('stamps metadata.sourceId so a subject-mode DSAR reaches the auto-synced summary', () => {
    const written = writeAutoSyncSummaryFrame(frames, fakeItem());
    const f = frames.getById(written.id)!;
    expect(JSON.parse(f.metadata!).sourceId).toBe('sess-abc');       // the subject key
    expect(f.content.startsWith('[Harvest:claude-code] My session')).toBe(true);

    // End-to-end: the subject-mode sweep now erases it (was recall-able before).
    const res = erasure.eraseBySourceRef('claude-code', 'sess-abc', 'dsar');
    expect(res.framesDeleted).toBe(1);
    expect(frames.getById(written.id)).toBeUndefined();
  });

  it("does not clobber a user-set review status on a re-synced (dedup'd) frame", () => {
    const item = fakeItem();
    const first = writeAutoSyncSummaryFrame(frames, item);
    // User reviews it in the Memory Center.
    frames.setMetadata(first.id, JSON.stringify({ sourceId: 'sess-abc', status: 'reviewed' }));
    // Next auto-sync tick re-scans the unchanged item → createIFrame dedups.
    const again = writeAutoSyncSummaryFrame(frames, item);
    expect(again.id).toBe(first.id);                                  // deduped to the same frame
    const meta = JSON.parse(frames.getById(first.id)!.metadata!) as Record<string, unknown>;
    expect(meta.status).toBe('reviewed');                            // status preserved (guard held)
    expect(meta.sourceId).toBe('sess-abc');
  });

  it('caps the preview content at AUTOSYNC_PREVIEW_CAP', () => {
    const big = 'x'.repeat(AUTOSYNC_PREVIEW_CAP + 500);
    const written = writeAutoSyncSummaryFrame(frames, fakeItem({ id: 'big', content: big }));
    const body = frames.getById(written.id)!.content.split('\n\n')[1] ?? '';
    expect(body.length).toBe(AUTOSYNC_PREVIEW_CAP);
  });
});
