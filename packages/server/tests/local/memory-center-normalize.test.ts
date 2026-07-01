import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore } from '@waggle/core';
import { normalizeToMemory } from '../../src/local/routes/memory-center.js';

/**
 * normalizeToMemory.hasOriginalSource — the gate for the #7 "View original source"
 * affordance. It must reflect ACTUAL archive availability (readArchiveUids), not the
 * presence of a sourceId: an auto-synced harvest summary carries sourceId but no
 * raw_archive link, so offering "View original" would always 404. This pins the
 * derivation so the EvidencePanel button can gate on it instead of sourceId.
 */
describe('normalizeToMemory — hasOriginalSource (Art.17 View-original gate)', () => {
  let db: MindDB;
  let frames: FrameStore;
  beforeEach(() => {
    db = new MindDB(':memory:');
    new SessionStore(db).ensure('harvest', 'harvest', 'test');
    frames = new FrameStore(db);
  });
  afterEach(() => db.close());

  function normalize(metadata: Record<string, unknown>) {
    // Unique content per case so createIFrame's content-dedup never collides.
    const f = frames.createIFrame('harvest', `[Harvest:claude-code] s\n\n${JSON.stringify(metadata)}`, 'normal', 'import');
    frames.setMetadata(f.id, JSON.stringify(metadata));
    return normalizeToMemory(frames.getById(f.id)!, 'personal');
  }

  it('is TRUE when the frame links a raw_archive row (archiveUids present)', () => {
    expect(normalize({ sourceId: 's1', archiveUids: ['u1'] }).hasOriginalSource).toBe(true);
  });

  it('tolerates the legacy scalar archiveUid', () => {
    expect(normalize({ sourceId: 's2', archiveUid: 'u2' }).hasOriginalSource).toBe(true);
  });

  it('is FALSE for a sourceId-only frame (auto-synced summary — no archive to view)', () => {
    const m = normalize({ sourceId: 'sess-abc' });
    expect(m.sourceId).toBe('sess-abc');       // provenance id still exposed (chip)
    expect(m.hasOriginalSource).toBe(false);   // but no viewable source → button hidden
  });

  it('is FALSE for a frame with no provenance metadata', () => {
    expect(normalize({ kind: 'fact' }).hasOriginalSource).toBe(false);
  });
});
