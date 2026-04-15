/**
 * Skills 2.0 gap K — write-path conflict detection.
 *
 * When save_memory writes a new frame that contradicts an existing frame
 * (detectContradiction), the save still succeeds but:
 *   - the return string carries a [flag: contradicts_existing …] marker
 *   - a correction-category improvement signal is recorded
 *
 * Previously detectContradiction existed but was never called on the write
 * path — write-path conflicts silently overwrote reality, degrading the
 * evolution-signal loop.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  MindDB,
  IdentityLayer,
  AwarenessLayer,
  FrameStore,
  SessionStore,
  KnowledgeGraph,
  HybridSearch,
  ImprovementSignalStore,
} from '@waggle/core';
import { createMindTools } from '../src/tools.js';
import type { ToolDefinition } from '../src/tools.js';
import { MockEmbedder } from '../../core/tests/mind/helpers/mock-embedder.js';

describe('save_memory — gap K (write-path conflict detection)', () => {
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let tools: ToolDefinition[];
  let improvementSignals: ImprovementSignalStore;

  function getSaveMemory(): ToolDefinition {
    const tool = tools.find(t => t.name === 'save_memory');
    if (!tool) throw new Error('save_memory tool not found');
    return tool;
  }

  beforeEach(() => {
    db = new MindDB(':memory:');
    const embedder = new MockEmbedder();
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    const knowledge = new KnowledgeGraph(db);
    const search = new HybridSearch(db, embedder);
    improvementSignals = new ImprovementSignalStore(db);

    tools = createMindTools({
      db,
      identity: new IdentityLayer(db),
      awareness: new AwarenessLayer(db),
      frames,
      sessions,
      search,
      knowledge,
      improvementSignals,
      // Intentionally NO cognify → exercises the raw-frame fallback path
      // (no LLM-dependent entity extraction in unit tests).
    });
  });

  afterEach(() => {
    db.close();
  });

  it('flags contradictions and records a correction signal', async () => {
    const save = getSaveMemory();

    // Prime with an affirmative decision frame.
    // Using "enable/disable feature flag rollout users" — the existing
    // detectContradiction algorithm needs asymmetric sentiment to fire;
    // inputs with "will" in both sides add positive noise that can mask
    // the polarity swing. Keep inputs tight and unambiguous.
    const first = await save.execute({
      content: 'Decision: enable feature flag rollout for users; proceed and confirmed.',
      importance: 'important',
      target: 'personal',
      source: 'user_stated',
    });
    expect(first).toContain('Memory saved');
    expect(first).not.toContain('contradicts_existing');

    // Contradicting decision — disable/reject/cancel instead of enable/approve
    const second = await save.execute({
      content: 'Decision: disable feature flag rollout for users; cancel and reject.',
      importance: 'important',
      target: 'personal',
      source: 'user_stated',
    });

    // Save still succeeded — conflict is a flag, not an abort
    expect(second).toContain('Memory saved');
    // But the return message is annotated
    expect(second).toContain('[flag: contradicts_existing');

    // And a correction signal is recorded
    const top = improvementSignals.getByCategory('correction');
    expect(top.length).toBeGreaterThan(0);
    const writeConflict = top.find(s => s.pattern_key.startsWith('write-conflict:'));
    expect(writeConflict).toBeDefined();
    expect(writeConflict!.detail).toMatch(/contradicts existing frame/i);
    expect(writeConflict!.category).toBe('correction');
  });

  it('non-contradicting saves do not flag or emit a signal', async () => {
    const save = getSaveMemory();
    await save.execute({
      content: 'Decision: we chose PostgreSQL for analytics; approved and confirmed.',
      target: 'personal',
      source: 'user_stated',
    });
    const result = await save.execute({
      content: 'Meeting notes from standup — discussed roadmap for Q2 and sprint planning.',
      target: 'personal',
      source: 'user_stated',
    });
    expect(result).not.toContain('contradicts_existing');

    const top = improvementSignals.getByCategory('correction');
    expect(top.find(s => s.pattern_key.startsWith('write-conflict:'))).toBeUndefined();
  });

  it('works without improvementSignals dep (backwards-compatible)', async () => {
    // Rebuild tools without signals dep
    const db2 = new MindDB(':memory:');
    const embedder = new MockEmbedder();
    const frames2 = new FrameStore(db2);
    const sessions2 = new SessionStore(db2);
    const knowledge2 = new KnowledgeGraph(db2);
    const search2 = new HybridSearch(db2, embedder);
    const tools2 = createMindTools({
      db: db2,
      identity: new IdentityLayer(db2),
      awareness: new AwarenessLayer(db2),
      frames: frames2,
      sessions: sessions2,
      search: search2,
      knowledge: knowledge2,
      // No improvementSignals — should not throw
    });
    const save = tools2.find(t => t.name === 'save_memory')!;
    await save.execute({ content: 'Decision: enable feature flag rollout for users; proceed.', target: 'personal' });
    const result = await save.execute({ content: 'Decision: disable feature flag rollout for users; cancel.', target: 'personal' });
    // Flag still appears (detectContradiction doesn't need the signal store)
    expect(result).toContain('contradicts_existing');
    db2.close();
  });
});
