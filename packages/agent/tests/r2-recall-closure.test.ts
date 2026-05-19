/**
 * R5 / R2 closure — the memory-loop sign gate must be closed *end to end*.
 *
 * R2 (commit 5592727) wired `isSelfIncapacityAssertion()` into the autoSave
 * `save()` chokepoint so DEFECT-2 poison is coerced to `temporary` importance.
 * Its stated contract (orchestrator.ts:751-757, memory-sign-gate.ts:14-18) is
 * that `temporary` frames are *recall-excluded* — "the recall path already
 * excludes `temporary` (see getRecentFrames)".
 *
 * That is only true for the narrow `fetchRecentFrames` SQL path (catch-up /
 * workspace-recent). The dominant prompt recall path is `recallMemory()`'s
 * normal branch → `HybridSearch.search()`, which fetches frames with only
 * optional *temporal* filtering and applies `importance` as a scoring weight,
 * never an exclusion. So a sign-gated poison frame is still semantically
 * retrievable and re-enters the prompt — the loop the unit test never proved
 * closed because it only tested the classifier, not the round trip.
 *
 * This is the live, behavioral proof of the closed loop (TDD: RED on the
 * pre-fix code, GREEN after recallMemory excludes non-authoritative
 * importance).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB } from '@waggle/core';
import { Orchestrator } from '../src/orchestrator.js';
import { MockEmbedder } from '../../hive-mind-core/tests/mind/helpers/mock-embedder.js';

describe('R2 sign-gate is closed end-to-end (temporary excluded from semantic recall)', () => {
  let db: MindDB;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    db = new MindDB(':memory:');
    orchestrator = new Orchestrator({ db, embedder: new MockEmbedder() });
  });

  afterEach(() => {
    db.close();
  });

  it('does not surface a sign-gated (temporary) DEFECT-2 frame via recallMemory, but still recalls the authoritative decision', async () => {
    // A self-incapacity assertion — the R2 save-side gate coerces this exact
    // class to `temporary` (orchestrator.ts:757). Seed it at the importance the
    // gate produces.
    await orchestrator.executeTool('save_memory', {
      content:
        "run npm install -g @modelcontextprotocol/server-filesystem yourself and restart the session before I can use it",
      importance: 'temporary',
    });
    // The authoritative truth on the same topic — the control. Recall MUST
    // still surface this; the exclusion has to be specific to `temporary`.
    await orchestrator.executeTool('save_memory', {
      content:
        'Decision: the MCP filesystem connector is installed and wired for this workspace',
      importance: 'important',
    });

    // Precondition: seeds landed at the intended importances (fences off the
    // save_memory dramatic-claim downgrade / dedup confounds — if either fired
    // this fails here with a clear signal rather than passing vacuously).
    const rows = db
      .getDatabase()
      .prepare('SELECT content, importance FROM memory_frames ORDER BY id')
      .all() as Array<{ content: string; importance: string }>;
    const poison = rows.find(r => r.content.includes('npm install -g @modelcontextprotocol'));
    const decision = rows.find(r => r.content.includes('connector is installed and wired'));
    expect(poison?.importance, 'poison frame must be stored as temporary').toBe('temporary');
    expect(decision?.importance, 'decision frame must be stored as important').toBe('important');

    const result = await orchestrator.recallMemory(
      'how do I install the mcp filesystem connector',
    );

    // The closed-loop invariant: a sign-gated frame must NOT re-enter the
    // prompt as authoritative recall…
    expect(result.text).not.toContain('run npm install -g @modelcontextprotocol');
    // …while legitimate, authoritative memory on the same query still surfaces.
    expect(result.text).toContain('connector is installed and wired');
  });
});
