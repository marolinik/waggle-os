import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, RawArchive } from '@waggle/core';

// Mirrors the harvest route's per-item persistence: archive the full verbatim,
// create the (truncated) summary frame, stamp metadata.archiveUid alongside sourceId.
function persistHarvestItem(
  db: MindDB,
  item: { source: string; id: string; title: string; content: string },
) {
  const archive = new RawArchive(db);
  const frames = new FrameStore(db);
  const { archiveUid } = archive.append({
    source: item.source, sourceRef: item.id, title: item.title, content: item.content,
  });
  const frame = frames.createIFrame('harvest', `${item.title}\n\n${item.content.slice(0, 10_000)}`, 'normal', 'import');
  frames.setMetadata(frame.id, JSON.stringify({ status: 'unreviewed', sourceId: item.id, archiveUid }));
  return { archive, frame };
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
});
