import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MindDB,
  FrameStore,
  SessionStore,
  KnowledgeGraph,
  HybridSearch,
} from '@waggle/core';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';
import { CognifyPipeline } from '../src/cognify.js';

describe('CognifyPipeline', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let knowledge: KnowledgeGraph;
  let search: HybridSearch;
  let pipeline: CognifyPipeline;

  beforeEach(() => {
    db = new MindDB(':memory:');
    const embedder = new MockEmbedder();
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    knowledge = new KnowledgeGraph(db);
    search = new HybridSearch(db, embedder);
    pipeline = new CognifyPipeline({
      db,
      embedder,
      frames,
      sessions,
      knowledge,
      search,
    });
  });

  afterEach(() => {
    db.close();
  });

  it('saves memory and extracts entities into knowledge graph', async () => {
    const result = await pipeline.cognify(
      'Had a meeting with Alice Johnson about migrating from PostgreSQL to SQLite for the waggle project.'
    );

    // Should have created a frame
    expect(result.frameId).toBeGreaterThan(0);

    // Should have extracted entities
    expect(result.entitiesExtracted).toBeGreaterThanOrEqual(2);

    // Should have created co-occurrence relations
    expect(result.relationsCreated).toBeGreaterThanOrEqual(1);

    // Verify entities are in the knowledge graph
    const people = knowledge.getEntitiesByType('person');
    const techs = knowledge.getEntitiesByType('technology');
    expect(people.length + techs.length).toBeGreaterThanOrEqual(2);
  });

  it('indexes the frame for vector search', async () => {
    const result = await pipeline.cognify(
      'Working on the PostgreSQL database migration for the backend service.'
    );

    expect(result.frameId).toBeGreaterThan(0);

    // Should be searchable via hybrid search
    const searchResults = await search.search('database migration');
    expect(searchResults.length).toBeGreaterThanOrEqual(1);
    expect(searchResults[0].frame.id).toBe(result.frameId);
  });

  it('creates P-frame when I-frame already exists for the session', async () => {
    // First cognify creates an I-frame
    const first = await pipeline.cognify('Initial memory about TypeScript.');
    const firstFrame = frames.getById(first.frameId);
    expect(firstFrame?.frame_type).toBe('I');

    // Second cognify in same session creates a P-frame
    const second = await pipeline.cognify('Follow-up about React integration.');
    const secondFrame = frames.getById(second.frameId);
    expect(secondFrame?.frame_type).toBe('P');
  });

  it('respects importance parameter', async () => {
    const result = await pipeline.cognify(
      'Critical finding about security vulnerability in the API.',
      'critical'
    );
    const frame = frames.getById(result.frameId);
    expect(frame?.importance).toBe('critical');
  });

  it('uses provided gopId when given', async () => {
    const session = sessions.create();
    const result = await pipeline.cognify(
      'Memory tied to a specific session with Docker.',
      'normal',
      session.gop_id
    );
    const frame = frames.getById(result.frameId);
    expect(frame?.gop_id).toBe(session.gop_id);
  });

  it('does not create duplicate entities for repeated mentions', async () => {
    await pipeline.cognify('Learning about PostgreSQL and PostgreSQL performance tuning.');
    const techs = knowledge.getEntitiesByType('technology');
    const pgEntities = techs.filter(e => e.name.toLowerCase().includes('postgresql'));
    expect(pgEntities).toHaveLength(1);
  });
});
