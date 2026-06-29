import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MindDB, AwarenessLayer, type Embedder } from '@waggle/core';
import {
  runLoopTick,
  parseLoopSpec,
  parseProposal,
  buildMakerPrompt,
  LOOP_MIN_INTERVAL_MS,
  type LoopSchedule,
  type LoopLogger,
} from '../../src/local/loop-executor.js';

// A chat stub that answers the judge prompt with valid rubric JSON and any
// other (maker) prompt with a plain report. buildPrompt() appends
// "Return the JSON now." to the judge call, which is our discriminator.
function makeChat(report = 'Report: nothing materially new since the last run.') {
  return vi.fn(async (prompt: string) => {
    if (prompt.includes('Return the JSON now')) {
      return '{"correctness": 8, "procedure": 7, "conciseness": 9, "feedback": "ok"}';
    }
    return report;
  });
}

// Minimal embedder stub. Recall is best-effort in runLoopTick (wrapped in
// try/catch), so even if the vector path rejects, the tick proceeds.
const embedder = {
  dimensions: 384,
  embed: async () => new Float32Array(384),
  embedBatch: async (texts: string[]) => texts.map(() => new Float32Array(384)),
  getActiveProvider: () => 'stub',
  getStatus: () => ({ modelName: 'stub' }),
} as unknown as Embedder;

const silentLog: LoopLogger = { info: () => {}, warn: () => {} };

function framesIn(db: MindDB, gop: string): Array<{ content: string; source: string }> {
  return db.getDatabase()
    .prepare('SELECT content, source FROM memory_frames WHERE gop_id = ?')
    .all(gop) as Array<{ content: string; source: string }>;
}

/** Seed a prior-tick awareness row so the cost floor has a lastTickAt to read. */
function seedPriorTick(db: MindDB, scheduleId: number, lastTickAt: string) {
  new AwarenessLayer(db).add('pending', `Loop ${scheduleId}`, 0, undefined, {
    status: `loop:${scheduleId}`, result: 'previous report', lastTickAt,
  });
}

describe('runLoopTick (Loop v0 — L1 report-only)', () => {
  let tmpDir: string;
  let db: MindDB;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-loop-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function schedule(overrides?: Partial<LoopSchedule>): LoopSchedule {
    return {
      id: 1,
      name: 'Test Loop',
      job_config: JSON.stringify({ prompt: 'Observe the pipeline.' }),
      last_run_at: null,
      ...overrides,
    };
  }

  it('writes a report frame to the loop gop with source agent_inferred', async () => {
    const chat = makeChat();
    const res = await runLoopTick({ schedule: schedule(), mindDb: db, embedder, chat, log: silentLog });

    expect(res.skipped).toBeFalsy();
    expect(res.wrote).toBe(true);
    const frames = framesIn(db, 'loop');
    expect(frames).toHaveLength(1);
    expect(frames[0].source).toBe('agent_inferred');
    expect(frames[0].content).toContain('Report: nothing materially new');
  });

  it('records the judge score and surfaces it in the result', async () => {
    const res = await runLoopTick({ schedule: schedule(), mindDb: db, embedder, chat: makeChat(), log: silentLog });
    // weighted 0.8*0.5 + 0.7*0.3 + 0.9*0.2 = 0.79 (length penalty 1 for a short report)
    expect(res.score).toBeCloseTo(0.79, 2);
  });

  it('persists cross-tick state and feeds the prior report into the next maker prompt', async () => {
    // Disable the cost floor so the back-to-back ticks both run (the first stamps
    // lastTickAt = now, which would otherwise throttle the second).
    const noFloor = JSON.stringify({ prompt: 'Observe the pipeline.', minIntervalMs: 0 });
    const chat1 = makeChat('First run: 3 deals at risk.');
    await runLoopTick({ schedule: schedule({ job_config: noFloor }), mindDb: db, embedder, chat: chat1, log: silentLog });

    // Prior state lives under the namespaced status key.
    const items = new AwarenessLayer(db).getByStatus('loop:1');
    expect(items).toHaveLength(1);
    expect(new AwarenessLayer(db).parseMetadata(items[0]).result).toContain('First run: 3 deals at risk');

    // Second tick: the maker prompt must carry the prior report.
    const chat2 = makeChat('Second run: 1 new at-risk deal.');
    await runLoopTick({ schedule: schedule({ job_config: noFloor }), mindDb: db, embedder, chat: chat2, log: silentLog });
    const makerCall = chat2.mock.calls.find(c => !String(c[0]).includes('Return the JSON now'));
    expect(makerCall?.[0]).toContain('First run: 3 deals at risk');

    // State merged in place (still a single awareness item), result advanced.
    const after = new AwarenessLayer(db).getByStatus('loop:1');
    expect(after).toHaveLength(1);
    expect(new AwarenessLayer(db).parseMetadata(after[0]).result).toContain('Second run');
  });

  it('still reports when the judge output is unparseable (score undefined, no throw)', async () => {
    // Judge returns junk → LLMJudge yields parsed:false, score stays undefined.
    const chat = vi.fn(async () => 'not json at all');
    const res = await runLoopTick({ schedule: schedule(), mindDb: db, embedder, chat, log: silentLog });
    expect(res.skipped).toBeFalsy();
    expect(res.score).toBeUndefined();
    expect(framesIn(db, 'loop')).toHaveLength(1); // the report itself is "not json at all" — still written
  });

  it('throttles a tick whose last real run (awareness lastTickAt) is within the cost floor', async () => {
    const chat = makeChat();
    seedPriorTick(db, 1, new Date(Date.now() - 60_000).toISOString()); // ran 1 min ago
    const res = await runLoopTick({ schedule: schedule(), mindDb: db, embedder, chat, log: silentLog });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('within min interval');
    expect(chat).not.toHaveBeenCalled();
    expect(framesIn(db, 'loop')).toHaveLength(0);
  });

  it('runs when the last real run is older than the cost floor', async () => {
    const chat = makeChat();
    seedPriorTick(db, 1, new Date(Date.now() - (LOOP_MIN_INTERVAL_MS + 60_000)).toISOString());
    const res = await runLoopTick({ schedule: schedule(), mindDb: db, embedder, chat, log: silentLog });
    expect(res.skipped).toBeFalsy();
    expect(chat).toHaveBeenCalled();
  });

  it('does NOT throttle on schedule.last_run_at — only on awareness lastTickAt (TZ-safe regression)', async () => {
    // The scheduler rewrites last_run_at via markRun on every tick (incl. skips)
    // in SQLite's space format, which V8 parses as local time — so it must never
    // drive the floor. With no prior awareness lastTickAt, the loop runs even
    // when last_run_at looks "just now".
    const chat = makeChat();
    const justNowSqlite = new Date().toISOString().slice(0, 19).replace('T', ' '); // 'YYYY-MM-DD HH:MM:SS'
    const res = await runLoopTick({ schedule: schedule({ last_run_at: justNowSqlite }), mindDb: db, embedder, chat, log: silentLog });
    expect(res.skipped).toBeFalsy();
    expect(chat).toHaveBeenCalled();
  });

  it('skips a loop with no prompt', async () => {
    const chat = makeChat();
    const res = await runLoopTick({
      schedule: schedule({ job_config: '{}' }),
      mindDb: db, embedder, chat, log: silentLog,
    });
    expect(res.skipped).toBe(true);
    expect(res.reason).toBe('no prompt');
    expect(chat).not.toHaveBeenCalled();
  });

  it('does not write to memory when writeToMemory is false', async () => {
    const chat = makeChat();
    const res = await runLoopTick({
      schedule: schedule({ job_config: JSON.stringify({ prompt: 'observe', writeToMemory: false }) }),
      mindDb: db, embedder, chat, log: silentLog,
    });
    expect(res.skipped).toBeFalsy();
    expect(res.wrote).toBeFalsy();
    expect(framesIn(db, 'loop')).toHaveLength(0);
  });
});

describe('parseLoopSpec', () => {
  it('returns null on missing/blank prompt', () => {
    expect(parseLoopSpec('{}')).toBeNull();
    expect(parseLoopSpec('{"prompt":"   "}')).toBeNull();
    expect(parseLoopSpec('not json')).toBeNull();
  });

  it('defaults query to prompt and writeToMemory to true', () => {
    const spec = parseLoopSpec('{"prompt":"do X"}');
    expect(spec).toMatchObject({ prompt: 'do X', query: 'do X', writeToMemory: true, minIntervalMs: LOOP_MIN_INTERVAL_MS });
  });

  it('honors explicit query, rubric, writeToMemory and minIntervalMs', () => {
    const spec = parseLoopSpec('{"prompt":"p","query":"q","rubric":"r","writeToMemory":false,"minIntervalMs":1000}');
    expect(spec).toMatchObject({ prompt: 'p', query: 'q', rubric: 'r', writeToMemory: false, minIntervalMs: 1000 });
  });
});

describe('buildMakerPrompt', () => {
  it('omits prior/recalled sections when empty and includes the report-only instruction', () => {
    const p = buildMakerPrompt({ name: 'L', prompt: 'task', priorResult: '', recalled: '' });
    expect(p).toContain('task');
    expect(p).not.toContain('previous run:');
    expect(p).toContain('do not take any action');
  });

  it('includes prior result and recalled context when present', () => {
    const p = buildMakerPrompt({ name: 'L', prompt: 'task', priorResult: 'PRIOR', recalled: 'RECALL' });
    expect(p).toContain('PRIOR');
    expect(p).toContain('RECALL');
  });

  it('assist mode swaps the report-only line for a proposal instruction', () => {
    const p = buildMakerPrompt({ name: 'L', prompt: 'task', priorResult: '', recalled: '', assist: true });
    expect(p).toContain('propose exactly ONE action');
    expect(p).toContain('a human reviews');
    expect(p).not.toContain('do not take any action');
  });
});

describe('parseProposal', () => {
  it('extracts the last json fence as a proposed action', () => {
    const out = 'Report text.\n```json\n{"tool":"send_email","args":{"to":"a@b.c"},"summary":"follow up"}\n```';
    expect(parseProposal(out)).toEqual({ tool: 'send_email', args: { to: 'a@b.c' }, summary: 'follow up' });
  });
  it('returns null for no fence, {none:true}, malformed JSON, or a missing tool', () => {
    expect(parseProposal('no fence here')).toBeNull();
    expect(parseProposal('```json\n{"none":true}\n```')).toBeNull();
    expect(parseProposal('```json\n{not json}\n```')).toBeNull();
    expect(parseProposal('```json\n{"args":{}}\n```')).toBeNull();
  });
  it('defaults args to {} and summary to "" when omitted', () => {
    expect(parseProposal('```json\n{"tool":"write_file"}\n```')).toEqual({ tool: 'write_file', args: {}, summary: '' });
  });
});

describe('runLoopTick — assist mode (L2 proposals)', () => {
  let tmpDir: string;
  let db: MindDB;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-loop-a-'));
    db = new MindDB(path.join(tmpDir, 'test.mind'));
  });
  afterEach(() => { db.close(); fs.rmSync(tmpDir, { recursive: true, force: true }); });

  function assistChat(report: string, fence: string) {
    return vi.fn(async (prompt: string) => {
      if (prompt.includes('Return the JSON now')) {
        return '{"correctness": 8, "procedure": 7, "conciseness": 9, "feedback": "ok"}';
      }
      return `${report}\n\n\`\`\`json\n${fence}\n\`\`\``;
    });
  }
  const sched = (cfg: Record<string, unknown>): LoopSchedule => ({ id: 1, name: 'Assist Loop', job_config: JSON.stringify(cfg), last_run_at: null });

  it('report mode never proposes an action', async () => {
    const chat = vi.fn(async () => 'A plain report, no fence.');
    const res = await runLoopTick({ schedule: sched({ prompt: 'sweep' }), mindDb: db, embedder, chat, log: silentLog });
    expect(res.proposedAction).toBeUndefined();
  });

  it('assist mode returns the proposed action and strips the fence from the report + memory', async () => {
    const chat = assistChat('Three deals went quiet.', '{"tool":"send_email","args":{"to":"x@y.z"},"summary":"nudge them"}');
    const res = await runLoopTick({
      schedule: sched({ prompt: 'sweep', mode: 'assist' }),
      mindDb: db, embedder, chat, log: silentLog,
    });
    expect(res.proposedAction).toEqual({ tool: 'send_email', args: { to: 'x@y.z' }, summary: 'nudge them' });
    expect(res.summary).toContain('Three deals went quiet');
    expect(res.summary).not.toContain('```json');
    // The frame written to memory must be the clean report, not the JSON fence.
    const frames = db.getDatabase().prepare("SELECT content FROM memory_frames WHERE gop_id='loop'").all() as Array<{ content: string }>;
    expect(frames).toHaveLength(1);
    expect(frames[0].content).not.toContain('```json');
  });

  it('assist mode with a {none:true} proposal yields no action', async () => {
    const chat = assistChat('Nothing actionable today.', '{"none":true}');
    const res = await runLoopTick({ schedule: sched({ prompt: 'sweep', mode: 'assist' }), mindDb: db, embedder, chat, log: silentLog });
    expect(res.proposedAction).toBeUndefined();
    expect(res.summary).toContain('Nothing actionable');
  });
});
