import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MindDB, FrameStore, SessionStore, type LLMCallFn } from '@waggle/core';
import { parseOpenAiTextCompletion } from '@waggle/agent';
import { runMemoryLaneExtraction } from '../../src/local/memory-lane-cron.js';

/**
 * W4.3d — memory-lane extraction cron routine (plan §5 W4.3 extraction side).
 * LLM mocked; covers the watermark contract, the min-frames skip, lane-frame
 * self-feeding exclusion, and idempotency across runs.
 */

describe('runMemoryLaneExtraction', () => {
  let db: MindDB;
  let frames: FrameStore;
  let gopId: string;

  const mockLLM: LLMCallFn = async (prompt: string) => {
    if (prompt.includes('synthesis-level memory facts')) {
      return '{"facts":[{"category":"preference","speaker":"Ana","text":"User preference: Ana prefers dark mode"}]}';
    }
    if (prompt.includes('datable events')) {
      return '{"events":[{"session_date":"2026-05-08","cue":"yesterday","event_date":"2026-05-07","text":"Ana visited the dentist"}]}';
    }
    if (prompt.includes('profile card')) {
      return '{"profiles":[{"speaker":"Ana","card":"Ana is a designer."}]}';
    }
    if (prompt.includes('Extract named entities from the FRAMES')) {
      // Same entity mentioned in two frames — exercises findEntityByName dedup.
      return [
        '{"frame_id": 1, "name": "Hive Mind", "type": "project"}',
        '{"frame_id": 2, "name": "Hive Mind", "type": "project"}',
      ].join('\n');
    }
    return '{}';
  };

  beforeEach(() => {
    db = new MindDB(':memory:');
    frames = new FrameStore(db);
    gopId = new SessionStore(db).create().gop_id;
  });

  afterEach(() => {
    db.close();
  });

  function seedSourceFrames(n: number): void {
    for (let i = 0; i < n; i++) {
      frames.createIFrame(gopId, `Conversation note ${i}: Ana said something useful about topic ${i}.`, 'normal', 'user_stated');
    }
  }

  it('skips when fewer than the minimum new frames exist', async () => {
    seedSourceFrames(2);
    const r = await runMemoryLaneExtraction(db, mockLLM);
    expect(r.skipped).toBe(true);
    expect(r.framesProcessed).toBe(0);
  });

  it('extracts lanes and advances the watermark', async () => {
    seedSourceFrames(8);
    const r = await runMemoryLaneExtraction(db, mockLLM);
    expect(r.skipped).toBe(false);
    expect(r.framesProcessed).toBe(8);
    expect(r.written).toMatchObject({ factsWritten: 1, eventsWritten: 1, profilesWritten: 1 });

    const raw = db.getDatabase();
    const event = raw.prepare(
      `SELECT created_at FROM memory_frames WHERE content LIKE '[mind-event]%'`
    ).get() as { created_at: string };
    expect(event.created_at).toBe('2026-05-07T00:00:00.000Z');
  });

  it('writes KG entities over the same window; findEntityByName dedups to one row', async () => {
    seedSourceFrames(8);
    const r = await runMemoryLaneExtraction(db, mockLLM);
    expect(r.skipped).toBe(false);
    // Two mentions of "Hive Mind": one create + one seen_count bump.
    expect(r.kgEntitiesWritten).toBe(2);
    expect(r.errors).toHaveLength(0);

    const raw = db.getDatabase();
    const rows = raw.prepare(
      `SELECT entity_type, properties FROM knowledge_entities WHERE name = 'Hive Mind'`
    ).all() as Array<{ entity_type: string; properties: string }>;
    expect(rows).toHaveLength(1); // deduped, not duplicated
    expect(rows[0].entity_type).toBe('project');
    expect(JSON.parse(rows[0].properties)).toMatchObject({ seen_count: 2, source: 'cognify-llm' });
  });

  it('second run with no new frames skips (watermark holds)', async () => {
    seedSourceFrames(8);
    await runMemoryLaneExtraction(db, mockLLM);
    const r2 = await runMemoryLaneExtraction(db, mockLLM);
    // lane frames written by run 1 are excluded (no self-feeding), and the
    // watermark has moved past the 8 source frames → nothing new.
    expect(r2.skipped).toBe(true);
  });

  it('excludes [Loop:] automation tick frames from extraction (#13)', async () => {
    seedSourceFrames(8);
    for (let i = 0; i < 3; i++) {
      frames.createIFrame(gopId, `[Loop: nightly-digest] tick ${i}: processed 4 items.`, 'normal', 'agent_inferred');
    }
    const r = await runMemoryLaneExtraction(db, mockLLM);
    expect(r.skipped).toBe(false);
    // Only the 8 real conversation frames are fed to the LLM; loop ticks stay out.
    expect(r.framesProcessed).toBe(8);
  });

  it('processes genuinely new content on a later run', async () => {
    seedSourceFrames(8);
    await runMemoryLaneExtraction(db, mockLLM);
    for (let i = 0; i < 6; i++) {
      frames.createIFrame(gopId, `Fresh note ${i}: Ana planned the spring offsite agenda item ${i}.`, 'normal', 'user_stated');
    }
    const r2 = await runMemoryLaneExtraction(db, mockLLM);
    expect(r2.skipped).toBe(false);
    expect(r2.framesProcessed).toBe(6);
  });

  it('holds the watermark and commits nothing until every completion is terminal', async () => {
    seedSourceFrames(8);
    let truncateFacts = true;
    const integrityCheckedLLM: LLMCallFn = async (prompt, model) => {
      const content = await mockLLM(prompt, model);
      return parseOpenAiTextCompletion({
        choices: [{
          finish_reason: truncateFacts && prompt.includes('synthesis-level memory facts')
            ? 'length'
            : 'stop',
          message: { content },
        }],
      }).content;
    };

    const failed = await runMemoryLaneExtraction(db, integrityCheckedLLM);
    expect(failed.skipped).toBe(false);
    expect(failed.framesProcessed).toBe(8);
    expect(failed.watermark).toBe(0);
    expect(failed.written).toBeUndefined();
    expect(failed.kgEntitiesWritten).toBe(0);
    expect(failed.errors.join(' ')).toMatch(/facts:.*finish_reason=length/i);

    const raw = db.getDatabase();
    const laneCount = raw.prepare(
      `SELECT COUNT(*) AS count FROM memory_frames WHERE content LIKE '[mind-%'`
    ).get() as { count: number };
    const entityCount = raw.prepare(
      'SELECT COUNT(*) AS count FROM knowledge_entities'
    ).get() as { count: number };
    expect(laneCount.count).toBe(0);
    expect(entityCount.count).toBe(0);

    truncateFacts = false;
    const retried = await runMemoryLaneExtraction(db, integrityCheckedLLM);
    expect(retried.framesProcessed).toBe(8);
    expect(retried.watermark).toBeGreaterThan(0);
    expect(retried.written).toMatchObject({ factsWritten: 1, eventsWritten: 1, profilesWritten: 1 });
    expect(retried.kgEntitiesWritten).toBe(2);

    const settled = await runMemoryLaneExtraction(db, integrityCheckedLLM);
    expect(settled.skipped).toBe(true);
  });
});
