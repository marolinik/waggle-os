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

describe('CognifyPipeline with linking', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let knowledge: KnowledgeGraph;
  let search: HybridSearch;

  beforeEach(() => {
    db = new MindDB(':memory:');
    const embedder = new MockEmbedder();
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    knowledge = new KnowledgeGraph(db);
    search = new HybridSearch(db, embedder);
  });

  afterEach(() => {
    db.close();
  });

  it('returns relatedFrames when enableLinking is true', async () => {
    // First, index an existing frame so there's something to link to
    const pipeline1 = new CognifyPipeline({
      db,
      embedder: new MockEmbedder(),
      frames,
      sessions,
      knowledge,
      search,
    });
    await pipeline1.cognify('PostgreSQL database migration strategies and best practices');

    // Now create a pipeline with linking enabled
    const pipeline2 = new CognifyPipeline({
      db,
      embedder: new MockEmbedder(),
      frames,
      sessions,
      knowledge,
      search,
      enableLinking: true,
    });

    const result = await pipeline2.cognify(
      'Working on the PostgreSQL database migration for the backend service'
    );

    expect(result.frameId).toBeGreaterThan(0);
    expect(result.relatedFrames).toBeDefined();
    expect(Array.isArray(result.relatedFrames)).toBe(true);

    // Should find the previously indexed frame as related
    if (result.relatedFrames && result.relatedFrames.length > 0) {
      expect(result.relatedFrames[0]).toHaveProperty('frameId');
      expect(result.relatedFrames[0]).toHaveProperty('content');
      expect(result.relatedFrames[0]).toHaveProperty('score');
    }
  });

  it('does not return relatedFrames when enableLinking is false', async () => {
    const pipeline = new CognifyPipeline({
      db,
      embedder: new MockEmbedder(),
      frames,
      sessions,
      knowledge,
      search,
    });

    const result = await pipeline.cognify('Some content about TypeScript');

    expect(result.relatedFrames).toBeUndefined();
  });
});
