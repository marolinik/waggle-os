import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MindDB } from '../../src/mind/db.js';
import { FrameStore } from '../../src/mind/frames.js';
import { SessionStore } from '../../src/mind/sessions.js';
import { KnowledgeGraph } from '../../src/mind/knowledge.js';
import { ImprovementSignalStore } from '../../src/mind/improvement-signals.js';
import { hashFrameContent } from '../../src/mind/content-hash.js';

/**
 * R-6 — soak the substrate against a large aged `.mind`.
 *
 * `docs/RELIABILITY.md` asks for the desktop-shaped replacement for "load test
 * to 3x peak": nothing exercises what happens when a mind has years of frames
 * in it rather than the few dozen every other test writes.
 *
 * This is deliberately NOT in the default gate — it writes a real database to
 * disk and takes minutes. `npm run test:soak` runs it; `WAGGLE_SOAK_FRAMES`
 * overrides the size.
 *
 * What it is for: R-3 lists 64 unbounded `SELECT ... .all()` reads in the
 * substrate. Most are full-scan BY CONTRACT — an erasure that stops at a LIMIT
 * is a compliance bug, and so is a half-swept reconcile. The open question is
 * which of the remainder actually degrade, and that is an empirical question
 * this answers rather than guesses at.
 *
 * The assertions are therefore about SHAPE, not wall clock. A row count that
 * grows with the database is the finding; a millisecond number on a laptop that
 * is also running a dev server is noise. Timings are recorded and printed so a
 * human can read them, and only gross ceilings are asserted.
 */

/** Default keeps a local run near a minute; CI-sized runs pass the env var. */
const FRAMES = Number(process.env.WAGGLE_SOAK_FRAMES ?? 20_000);
const ENTITIES = Math.floor(FRAMES / 20);
const SESSIONS = Math.floor(FRAMES / 200);

interface Measurement {
  label: string;
  ms: number;
  rows: number;
}

const measurements: Measurement[] = [];

function measure<T>(label: string, fn: () => T, rowsOf: (result: T) => number): T {
  const started = performance.now();
  const result = fn();
  measurements.push({ label, ms: performance.now() - started, rows: rowsOf(result) });
  return result;
}

describe('R-6 soak — a large aged mind', () => {
  let dir: string;
  let db: MindDB;
  let frames: FrameStore;
  let sessions: SessionStore;
  let knowledge: KnowledgeGraph;
  let signals: ImprovementSignalStore;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-soak-'));
    db = new MindDB(path.join(dir, 'soak.mind'));
    frames = new FrameStore(db);
    sessions = new SessionStore(db);
    knowledge = new KnowledgeGraph(db);
    signals = new ImprovementSignalStore(db);

    const gopIds: string[] = [];
    for (let i = 0; i < SESSIONS; i++) gopIds.push(sessions.create(`project-${i % 7}`).gop_id);

    // Setup bulk-inserts rather than calling createIFrame 100k times. That is
    // deliberate and it is not a shortcut around the code under test: the
    // subject here is the READ path, and the public write path costs five
    // statements per frame (dedup probe, next-t probe, insert, read-back, FTS
    // insert), which made a 100k build exceed a ten-minute hook. The last test
    // in this file proves a bulk row is indistinguishable from an API row.
    const raw = db.getDatabase();
    const insertFrame = raw.prepare(`
      INSERT INTO memory_frames (frame_type, gop_id, t, base_frame_id, content, importance, source, content_hash)
      VALUES ('I', ?, ?, NULL, ?, ?, 'user_stated', ?)
    `);
    const insertFts = raw.prepare('INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)');
    const nextT = new Map<string, number>();

    raw.transaction(() => {
      for (let i = 0; i < FRAMES; i++) {
        const gopId = gopIds[i % gopIds.length];
        const t = nextT.get(gopId) ?? 0;
        nextT.set(gopId, t + 1);
        // Content must be unique: the write path dedups on content hash, so
        // repeated text would silently collapse the corpus.
        const content = `soak frame ${i} — decision ${i % 97} about invoice batch ${i % 31}`;
        const row = insertFrame.run(
          gopId, t, content, i % 11 === 0 ? 'important' : 'normal', hashFrameContent(content),
        );
        insertFts.run(row.lastInsertRowid, content);
      }
    })();

    raw.transaction(() => {
      for (let i = 0; i < ENTITIES; i++) {
        knowledge.createEntity(i % 3 === 0 ? 'person' : 'concept', `Entity ${i}`, { seq: i });
      }
    })();

    for (let i = 0; i < 40; i++) signals.record('correction', `pattern-${i % 9}`, `detail ${i}`);
  });

  afterAll(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const widest = Math.max(...measurements.map((m) => m.label.length));
    const report = measurements
      .map((m) => `  ${m.label.padEnd(widest)}  ${m.ms.toFixed(1).padStart(9)} ms  ${String(m.rows).padStart(8)} rows`)
      .join('\n');
    console.log(`\nR-6 soak — ${FRAMES} frames / ${ENTITIES} entities / ${SESSIONS} sessions\n${report}\n`);
  });

  it('built the corpus it claims to have built', () => {
    const stats = measure('frames.getStats', () => frames.getStats(), () => 1);
    expect(stats.total).toBe(FRAMES);
  });

  it('a bounded read stays bounded no matter how large the mind is', () => {
    const recent = measure('frames.getRecent(50)', () => frames.getRecent(50), (r) => r.length);
    expect(recent).toHaveLength(50);
  });

  it('a key-bounded read returns one session, not the corpus', () => {
    const active = sessions.getActive();
    const gopId = active[0].gop_id;
    const gopFrames = measure('frames.getGopFrames(1)', () => frames.getGopFrames(gopId), (r) => r.length);

    // Frames are round-robined across sessions, so one session holds
    // FRAMES/SESSIONS of them — the point is that it does not scale with the
    // corpus the way an unbounded read would.
    expect(gopFrames.length).toBeLessThanOrEqual(Math.ceil(FRAMES / SESSIONS));
    expect(gopFrames.length).toBeLessThan(FRAMES);
    expect(gopFrames.every((f) => f.gop_id === gopId)).toBe(true);
  });

  it('records what the unbounded list reads actually return at this size', () => {
    const entities = measure('knowledge.getEntities()', () => knowledge.getEntities(), (r) => r.length);
    const actionable = measure('signals.getActionable()', () => signals.getActionable(), (r) => r.length);
    const active = measure('sessions.getActive()', () => sessions.getActive(), (r) => r.length);

    // getEntities carries its own default cap; getActionable and getActive do
    // not, and their row counts here are the evidence R-3 needs. These are
    // characterizations of today's behavior, not targets.
    expect(entities.length).toBeLessThanOrEqual(200);
    expect(actionable.length).toBeLessThanOrEqual(40);
    expect(active.length).toBe(SESSIONS);
  });

  it('a full-table sweep is linear and completes — it is not allowed to be bounded', () => {
    // frames.compact() is one of the reads R-3 flags. It must see every row:
    // a LIMIT here would leave the tail of an aged mind permanently uncompacted.
    const result = measure('frames.compact()', () => frames.compact(), () => 1);

    expect(result).toBeDefined();
    expect(frames.getStats().total).toBeLessThanOrEqual(FRAMES);
  });

  it('a bulk-inserted row is indistinguishable from one the write path produced', () => {
    const gopId = sessions.getActive()[0].gop_id;
    const viaApi = frames.createIFrame(gopId, 'written through the public path');
    const viaBulk = frames.getRecent(2).find((f) => f.id !== viaApi.id)!;

    // Same columns populated, same shapes — the setup shortcut does not create
    // a corpus the read paths would treat differently.
    expect(Object.keys(viaBulk).sort()).toEqual(Object.keys(viaApi).sort());
    expect(viaBulk.content_hash).toBeTruthy();
    expect(viaBulk.frame_type).toBe('I');
    expect(viaBulk.source).toBe('user_stated');

    // And the FTS index really has the bulk rows in it.
    const hits = db
      .getDatabase()
      .prepare('SELECT COUNT(*) AS n FROM memory_frames_fts WHERE memory_frames_fts MATCH ?')
      .get('invoice') as { n: number };
    expect(hits.n).toBeGreaterThan(FRAMES / 2);
  });

  it('the trigger-maintained counters replace three table scans per turn', () => {
    // This is the pair that matters for R-3. `getMemoryStats()` used to run
    // exactly these three COUNT(*) queries per mind on every user turn;
    // `memoryCounts()` reads the trigger-maintained table instead. Both are
    // measured here so the comparison is like-for-like on one machine.
    const raw = db.getDatabase();
    const scanned = measure(
      'three COUNT(*) scans',
      () => ({
        frameCount: (raw.prepare('SELECT COUNT(*) as cnt FROM memory_frames').get() as { cnt: number }).cnt,
        sessionCount: (raw.prepare('SELECT COUNT(*) as cnt FROM sessions').get() as { cnt: number }).cnt,
        entityCount: (raw.prepare('SELECT COUNT(*) as cnt FROM knowledge_entities').get() as { cnt: number }).cnt,
      }),
      () => 3,
    );
    const counted = measure('db.memoryCounts()', () => db.memoryCounts(), () => 3);

    // Agreement is the safety property; the timings above are the payoff.
    expect(counted).toEqual(scanned);
  });

  it('shows WHY getStats scales: every count is a full table scan', () => {
    // The timing above is real but environment-sensitive. This is the same
    // finding stated deterministically: `getMemoryStats` runs six COUNT(*)
    // queries per user turn, and SQLite has no O(1) row count, so each one
    // walks the table. `orchestrator.ts` predicted this ("negligible below
    // ~100k frames ... fix via a write-counter in MindDB, not a time-based
    // cache"); the soak is what turned the prediction into a measurement.
    const plan = db
      .getDatabase()
      .prepare('EXPLAIN QUERY PLAN SELECT COUNT(*) FROM memory_frames')
      .all() as Array<{ detail: string }>;

    expect(plan.map((r) => r.detail).join(' ')).toMatch(/SCAN/i);
  });

  it('keeps every read under a gross ceiling', () => {
    // Deliberately loose. This catches an accidental O(n^2), not a slow laptop.
    const worst = measurements.reduce((a, b) => (a.ms > b.ms ? a : b));
    expect(worst.ms, `slowest read was ${worst.label}`).toBeLessThan(30_000);
  });
});
