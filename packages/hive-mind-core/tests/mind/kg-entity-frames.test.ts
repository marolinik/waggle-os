import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '../../src/mind/db.js';
import { KnowledgeGraph } from '../../src/mind/knowledge.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';

// W4.1: the kg_entity_frames bridge turns the 'contextual' scoring signal from a
// constant 0 into a real graph-proximity boost. These lock the new wiring.
describe('KG entity↔frame bridge (contextual scoring signal)', () => {
  let db: MindDB;
  let kg: KnowledgeGraph;
  let frames: FrameStore;
  let gop: string;

  beforeEach(() => {
    db = new MindDB(':memory:');
    kg = new KnowledgeGraph(db);
    frames = new FrameStore(db);
    gop = new SessionStore(db).create('project:test').gop_id;
  });
  afterEach(() => db.close());

  it('maps query-seeded graph distance back onto frames via the bridge', () => {
    const fAcme = frames.createIFrame(gop, 'Acme adopted Postgres in Q2');
    const fPg = frames.createIFrame(gop, 'Postgres tuning notes');
    const acme = kg.createEntity('org', 'Acme', {});
    const pg = kg.createEntity('tech', 'Postgres', {});
    kg.createRelation(acme.id, pg.id, 'uses'); // acme --1 hop--> pg
    kg.linkEntityToFrame(acme.id, fAcme.id);
    kg.linkEntityToFrame(pg.id, fPg.id);

    const dist = kg.frameDistancesFromEntities([acme.id], 3);
    expect(dist.get(fAcme.id)).toBe(0); // the seed entity's own frame
    expect(dist.get(fPg.id)).toBe(1); // one relation hop away
  });

  it('linkEntityToFrame is idempotent per (entity, frame)', () => {
    const f = frames.createIFrame(gop, 'x');
    const e = kg.createEntity('org', 'Acme', {});
    kg.linkEntityToFrame(e.id, f.id);
    kg.linkEntityToFrame(e.id, f.id);
    const count = (db.getDatabase().prepare('SELECT COUNT(*) c FROM kg_entity_frames').get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('findEntitiesInText seeds from entity names mentioned in a query', () => {
    const acme = kg.createEntity('org', 'Acme', {});
    kg.createEntity('tech', 'Postgres', {});
    const seeds = kg.findEntitiesInText('how did Acme roll things out?');
    expect(seeds).toContain(acme.id);
  });

  it('returns an empty map for no / unknown seeds (signal stays inert)', () => {
    expect(kg.frameDistancesFromEntities([]).size).toBe(0);
    expect(kg.frameDistancesFromEntities([999999]).size).toBe(0);
  });

  it('backfillKgEntityFrames links pre-existing frames to mentioned entities', () => {
    const f1 = frames.createIFrame(gop, 'Acme shipped the Q2 release');
    const f2 = frames.createIFrame(gop, 'unrelated note about the weather');
    const acme = kg.createEntity('org', 'Acme', {});
    // Bridge starts empty (these frames/entities were created without live linking).
    expect((db.getDatabase().prepare('SELECT COUNT(*) c FROM kg_entity_frames').get() as { c: number }).c).toBe(0);

    const created = db.backfillKgEntityFrames(true);
    expect(created).toBe(1); // only f1 mentions "Acme"

    const dist = kg.frameDistancesFromEntities([acme.id], 3);
    expect(dist.get(f1.id)).toBe(0);
    expect(dist.has(f2.id)).toBe(false);
  });

  it('ON DELETE CASCADE removes bridge rows when a frame is deleted', () => {
    const f = frames.createIFrame(gop, 'y');
    const e = kg.createEntity('org', 'Acme', {});
    kg.linkEntityToFrame(e.id, f.id);
    frames.delete(f.id);
    const count = (db.getDatabase().prepare('SELECT COUNT(*) c FROM kg_entity_frames').get() as { c: number }).c;
    expect(count).toBe(0);
  });
});
