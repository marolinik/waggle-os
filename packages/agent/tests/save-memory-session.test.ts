/**
 * Which session a save_memory frame joins on the raw-frame path (no cognify)
 * (R-3): the most recent active session, or a new one when none is active.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  AwarenessLayer,
  FrameStore,
  HybridSearch,
  IdentityLayer,
  KnowledgeGraph,
  MindDB,
  SessionStore,
} from '@waggle/core';
import { createMindTools } from '../src/tools.js';
import type { ToolDefinition } from '../src/tools.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

describe('save_memory session choice (raw-frame path)', () => {
  let db: MindDB;
  let sessions: SessionStore;
  let saveMemory: ToolDefinition;

  beforeEach(() => {
    db = new MindDB(':memory:');
    sessions = new SessionStore(db);
    const tools = createMindTools({
      db,
      identity: new IdentityLayer(db),
      awareness: new AwarenessLayer(db),
      frames: new FrameStore(db),
      sessions,
      search: new HybridSearch(db, new MockEmbedder()),
      knowledge: new KnowledgeGraph(db),
      // No cognify: exercises the raw-frame fallback.
    });
    const tool = tools.find(t => t.name === 'save_memory');
    if (!tool) throw new Error('save_memory tool not found');
    saveMemory = tool;
  });

  afterEach(() => {
    db.close();
  });

  const latestFrameGop = (): string => (db.getDatabase().prepare(
    'SELECT gop_id FROM memory_frames ORDER BY id DESC LIMIT 1',
  ).get() as { gop_id: string }).gop_id;

  const save = (content: string) => saveMemory.execute({
    content, importance: 'normal', target: 'personal', source: 'user_stated',
  });

  it('joins the most recent active session, not a newer closed one', async () => {
    const insert = db.getDatabase().prepare(
      'INSERT INTO sessions (gop_id, status, started_at) VALUES (?, ?, ?)',
    );
    insert.run('session:older', 'active', '2026-01-01 09:00:00');
    insert.run('session:newer', 'active', '2026-03-01 09:00:00');
    insert.run('session:closed', 'closed', '2026-06-01 09:00:00');

    expect(await save('The quarterly review is on the fourth.')).toContain('Memory saved');
    expect(latestFrameGop()).toBe('session:newer');
  });

  it('opens exactly one session when none is active', async () => {
    expect(await save('The printer on floor two is out of toner.')).toContain('Memory saved');
    const active = sessions.getActive();
    expect(active).toHaveLength(1);
    expect(latestFrameGop()).toBe(active[0].gop_id);
  });
});
