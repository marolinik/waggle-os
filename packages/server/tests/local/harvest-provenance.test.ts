import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, RawArchive, readArchiveUids, withArchiveUid } from '@waggle/core';

interface HItem { source: string; id: string; title: string; content: string }

// Faithfully mirrors the harvest route's per-item persistence: archive the full
// verbatim (best-effort try/catch), create the (truncated) summary frame, then
// stamp metadata.archiveUids — with the dedup/backfill else-if from the route.
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
    frames.setMetadata(frame.id, JSON.stringify({ status: 'unreviewed', sourceId: item.id, ...(archiveUid ? { archiveUids: [archiveUid] } : {}) }));
  } else if (archiveUid) {
    const meta = JSON.parse(frame.metadata) as Record<string, unknown>;
    if (!readArchiveUids(meta).includes(archiveUid)) {
      frames.setMetadata(frame.id, JSON.stringify(withArchiveUid(meta, archiveUid)));
    }
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
    const rows = archive.reconstructSource(frame.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].content.length).toBe(25_000);    // full source survived (frame is capped at 10K)
    expect(frame.content.length).toBeLessThanOrEqual(10_000 + 4);
    // canonical link shape is the archiveUids array (no legacy scalar)
    const meta = JSON.parse(frame.metadata ?? '{}') as { archiveUids?: string[]; archiveUid?: string };
    expect(meta.archiveUids).toHaveLength(1);
    expect(meta.archiveUid).toBeUndefined();
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
    expect(meta.archiveUids).toBeUndefined();
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
    expect(meta.archiveUids).toHaveLength(1);
    expect(typeof meta.archiveUids[0]).toBe('string');
    expect(meta.sourceId).toBe('c4');
    const rows = working.reconstructSource(frame.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('recoverable');
  });

  it('accumulates both uids on one frame when identical content arrives from two sourceRefs', () => {
    // Same source + same content (→ content-dedup to ONE frame) but different
    // sourceRef → two distinct per-source archive rows. Both uids must end up on
    // the single frame's archiveUids array (backfill grows the set).
    const archive = new RawArchive(db);
    const { frame: f1 } = persistHarvestItem(db, { source: 'claude', id: 'ref-a', title: 'T', content: 'shared body' }, archive);
    const { frame: f2 } = persistHarvestItem(db, { source: 'claude', id: 'ref-b', title: 'T', content: 'shared body' }, archive);

    expect(f2.id).toBe(f1.id);                       // content-dedup → one frame
    expect(archive.count()).toBe(2);                 // two per-source archive rows

    const meta = JSON.parse(f2.metadata ?? '{}') as { archiveUids?: string[]; archiveUid?: string };
    expect(meta.archiveUids).toHaveLength(2);
    expect(new Set(meta.archiveUids)).toHaveProperty('size', 2);
    expect(meta.archiveUid).toBeUndefined();         // no legacy scalar lingering

    const rows = archive.reconstructSource(f2.id);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(r => r.source_ref))).toEqual(new Set(['ref-a', 'ref-b']));
  });

  // (e) pins the `.includes(archiveUid)` grow-check skip-path: re-importing an
  // IDENTICAL item must not duplicate the archive row NOR grow archiveUids beyond
  // length 1. The existing "does not duplicate the archive row" test only asserts
  // the row count; this test additionally pins uid-array cardinality and
  // reconstructSource resolution.
  it('idempotent backfill: re-importing the same item does not grow archiveUids or the archive row count', () => {
    const archive = new RawArchive(db);
    const item = { source: 'claude', id: 'idem-1', title: 'T', content: 'idem content' };

    // First import: creates archive row + frame, stamps archiveUids: [uid].
    const { frame: f1 } = persistHarvestItem(db, item, archive);
    // Second import of the IDENTICAL item: archive.append is a no-op (INSERT OR IGNORE);
    // createIFrame deduplicates; the grow-check skips setMetadata because the uid is
    // already in archiveUids.
    const { frame: f2 } = persistHarvestItem(db, item, archive);

    expect(f2.id).toBe(f1.id);                      // same frame (content dedup)
    expect(archive.count()).toBe(1);                 // archive row NOT duplicated
    const meta = JSON.parse(f2.metadata ?? '{}') as { archiveUids?: string[] };
    expect(meta.archiveUids).toHaveLength(1);        // uid-array NOT grown by the skip-path
    expect(archive.reconstructSource(f2.id)).toHaveLength(1); // resolves exactly one row
  });
});
