/**
 * #12: persistCompactionSummary — the dual-use half of the compaction
 * summarizer call (summary re-injected into context AND persisted as a
 * memory frame at zero extra LLM cost).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

describe('persistCompactionSummary (#12)', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
  });

  afterEach(() => {
    db.close();
  });

  it('persists a new frame with source "system" and the session marker', async () => {
    const frameId = await orchestrator.persistCompactionSummary(
      'Key decisions: switched billing to Stripe. Pending: annual prices.',
      'session-abc',
    );
    expect(frameId).not.toBeNull();
    const frame = new FrameStore(db).getById(frameId!);
    expect(frame).toBeDefined();
    expect(frame!.source).toBe('system');
    expect(frame!.importance).toBe('normal');
    expect(frame!.content).toContain('[Session summary — session-abc]');
    expect(frame!.content).toContain('switched billing to Stripe');
  });

  it('updates the same frame in place on a later compaction pass', async () => {
    const first = await orchestrator.persistCompactionSummary('First pass summary.', 's1');
    const second = await orchestrator.persistCompactionSummary(
      'First pass summary. Plus later work.', 's1', first,
    );
    expect(second).toBe(first);
    const frames = new FrameStore(db);
    expect(frames.getById(first!)!.content).toContain('Plus later work');
    // no second frame stacked
    const count = db.getDatabase().prepare(
      "SELECT COUNT(*) AS n FROM memory_frames WHERE content LIKE '[Session summary%'",
    ).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('falls back to a fresh frame when the prior frame id is gone', async () => {
    const frameId = await orchestrator.persistCompactionSummary('Summary.', 's2', 99999);
    expect(frameId).not.toBeNull();
    expect(frameId).not.toBe(99999);
  });

  it('no sign-gate downgrade: aggregate summaries stay normal even with incapacity lines', async () => {
    const frameId = await orchestrator.persistCompactionSummary(
      "Work completed: shipped billing. Pending: you'll need to run npm install after pulling.", 's3',
    );
    expect(frameId).not.toBeNull();
    expect(new FrameStore(db).getById(frameId!)!.importance).toBe('normal');
  });

  it('never overwrites an unrelated frame when the prior id points at foreign content (cross-mind guard)', async () => {
    // Simulate the cross-mind rowid collision: priorFrameId exists in the
    // active mind but holds USER memory, not this session's summary.
    const frames = new FrameStore(db);
    const gopId = orchestrator.getSessions().create().gop_id;
    const userFrame = frames.createIFrame(gopId, 'Precious user memory about Q3 strategy.', 'critical');

    const frameId = await orchestrator.persistCompactionSummary('Summary text.', 's-x', userFrame.id);

    expect(frameId).not.toBeNull();
    expect(frameId).not.toBe(userFrame.id);
    expect(frames.getById(userFrame.id)!.content).toBe('Precious user memory about Q3 strategy.');
    expect(frames.getById(userFrame.id)!.importance).toBe('critical');
  });

  it('blank summary persists nothing', async () => {
    expect(await orchestrator.persistCompactionSummary('   ', 's4')).toBeNull();
  });

  it('routes to the workspace mind when one is active', async () => {
    const wsDb = new MindDB(':memory:');
    try {
      orchestrator.setWorkspaceMind(wsDb);
      const frameId = await orchestrator.persistCompactionSummary('Workspace summary.', 's5');
      expect(frameId).not.toBeNull();
      expect(new FrameStore(wsDb).getById(frameId!)).toBeDefined();
      expect(new FrameStore(db).getById(frameId!)?.content ?? '').not.toContain('Workspace summary');
    } finally {
      wsDb.close();
    }
  });
});
