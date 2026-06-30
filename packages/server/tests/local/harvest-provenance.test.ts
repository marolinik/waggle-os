import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, RawArchive } from '@waggle/core';

interface HItem { source: string; id: string; title: string; content: string }

// Faithfully mirrors the harvest route's per-item persistence: archive the full
// verbatim (best-effort try/catch), create the (truncated) summary frame, then
// stamp metadata.archiveUid — with the dedup/backfill else-if from the route.
function persistHarvestItem(db: MindDB, item: HItem, archive: RawArchive = new RawArchive(db)) {
  const frames = new FrameStore(db);
  let archiveUid: string | undefined;
  try {
    archiveUid = archive.append({
      source: item.source, sourceRef: item.id, title: item.title, content: item.content,
    }).archiveUid;
  } catch { /* best-effort — frame still persists without the link */ }
  const frame = frames.createIFrame('harvest', `${item.title}\n\n${item.content.slice(0, 10_000)}`, 'normal', 'import');
  if (!frame.metadata || frame.metadata === '{}') {
    frames.setMetadata(frame.id, JSON.stringify({ status: 'unreviewed', sourceId: item.id, ...(archiveUid ? { archiveUid } : {}) }));
  } else if (archiveUid) {
    const meta = JSON.parse(frame.metadata) as Record<string, unknown>;
    if (!meta.archiveUid) frames.setMetadata(frame.id, JSON.stringify({ ...meta, archiveUid }));
  }
  return { archive, frame: frames.getById(frame.id)! };
}

describe('harvest provenance archive', () => {
  let db: MindDB;
  beforeEach(() => {
    db = new MindDB(':memory:');
    new SessionStore(db).ensure('harvest', 'harvest', 'test');
  });
  afterEach(() => { db.close(); });

  it('a harvested frame links to its full immutable raw_archive row', () => {
    const big = 'A'.repeat(25_000);
    const { archive, frame } = persistHarvestItem(db, { source: 'claude', id: 'c1', title: 'T', content: big });
    const src = archive.reconstructSource(frame.id);
    expect(src?.content.length).toBe(25_000);       // full source survived (frame is capped at 10K)
    expect(frame.content.length).toBeLessThanOrEqual(10_000 + 4);
  });

  it('re-importing the same item does not duplicate the archive row', () => {
    const item = { source: 'claude', id: 'c2', title: 'T', content: 'same content' };
    const { archive } = persistHarvestItem(db, item);
    persistHarvestItem(db, item);
    expect(archive.count()).toBe(1);
  });

  it('a failed archive append still persists the frame, without an archiveUid link', () => {
    const archive = new RawArchive(db);
    archive.append = () => { throw new Error('boom'); };
    const { frame } = persistHarvestItem(db, { source: 'claude', id: 'c3', title: 'T', content: 'body' }, archive);
    expect(frame.id).toBeGreaterThan(0);
    const meta = JSON.parse(frame.metadata ?? '{}');
    expect(meta.archiveUid).toBeUndefined();
    expect(meta.sourceId).toBe('c3');
  });

  it('backfills archiveUid on a re-import after a prior append failure', () => {
    // First import: archive append throws → frame persists without a link.
    const failing = new RawArchive(db);
    failing.append = () => { throw new Error('boom'); };
    persistHarvestItem(db, { source: 'claude', id: 'c4', title: 'T', content: 'recoverable' }, failing);

    // Second import (working archive): createIFrame dedups → same frame; the
    // else-if backfill adds archiveUid without clobbering the existing sourceId.
    const working = new RawArchive(db);
    const { frame } = persistHarvestItem(db, { source: 'claude', id: 'c4', title: 'T', content: 'recoverable' }, working);
    const meta = JSON.parse(frame.metadata ?? '{}');
    expect(typeof meta.archiveUid).toBe('string');
    expect(meta.sourceId).toBe('c4');
    expect(working.reconstructSource(frame.id)?.content).toBe('recoverable');
  });
});
