/**
 * memory-lane-cron.ts — W4.3d: scheduled extraction of the benchmark-proven
 * recall lanes (facts / events / profiles) over newly-written frames.
 *
 * Runs per mind (personal + each workspace) from the `memory_lane_extract`
 * cron action. Incremental via a frame-id watermark in the mind's `meta`
 * table; the extraction passes themselves are idempotent (content dedup for
 * facts/events, replace-on-update for profiles), so an overlapping or
 * re-run window never duplicates.
 *
 * W4-PRODUCTION-PORT-PLAN-2026-06-11.md components #5/#6/#8, extraction side.
 */

import {
  type MindDB,
  FrameStore,
  SessionStore,
  extractMemoryLanes,
  writeMemoryLaneFrames,
  type LLMCallFn,
  type WriteLaneFramesResult,
} from '@waggle/core';

const WATERMARK_KEY = 'lane_extract_last_frame_id';
/** Minimum new frames before an LLM pass is worth the cost. */
const MIN_NEW_FRAMES = 5;
/** Max frames per run (oldest-first; the rest picked up next run). */
const MAX_FRAMES_PER_RUN = 300;
/** Per-frame content cap + total input cap keep the prompt bounded. */
const PER_FRAME_CHARS = 800;
const TOTAL_INPUT_CHARS = 24_000;
/** Stable session for lane frames (frames have a FK to sessions). */
const LANE_SESSION_ID = 'memory-lanes';

export interface LaneExtractionRunResult {
  skipped: boolean;
  framesProcessed: number;
  watermark: number;
  written?: WriteLaneFramesResult;
  errors: string[];
}

function getWatermark(db: MindDB): number {
  const row = db.getDatabase()
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get(WATERMARK_KEY) as { value: string } | undefined;
  const n = row ? parseInt(row.value, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function setWatermark(db: MindDB, id: number): void {
  db.getDatabase()
    .prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(WATERMARK_KEY, String(id));
}

/**
 * Run the three lane-extraction passes over frames written since the last
 * run. Returns a summary; never throws (callers log, cron must not die).
 */
export async function runMemoryLaneExtraction(
  db: MindDB,
  llmCall: LLMCallFn,
): Promise<LaneExtractionRunResult> {
  const watermark = getWatermark(db);
  const raw = db.getDatabase();

  // New source material: everything after the watermark EXCEPT our own lane
  // frames (no self-feeding) and temporary/deprecated frames.
  const rows = raw.prepare(
    `SELECT id, content, created_at FROM memory_frames
     WHERE id > ?
       AND content NOT LIKE '[mind-%'
       AND importance NOT IN ('temporary', 'deprecated')
     ORDER BY id ASC
     LIMIT ?`
  ).all(watermark, MAX_FRAMES_PER_RUN) as Array<{ id: number; content: string; created_at: string }>;

  if (rows.length < MIN_NEW_FRAMES) {
    return { skipped: true, framesProcessed: 0, watermark, errors: [] };
  }

  // Dated passages — the events pass resolves relative cues against these.
  const parts: string[] = [];
  let total = 0;
  let lastId = watermark;
  let processed = 0;
  for (const r of rows) {
    const piece = `[${String(r.created_at ?? '').slice(0, 10)}] ${r.content.slice(0, PER_FRAME_CHARS)}`;
    if (total + piece.length > TOTAL_INPUT_CHARS) break;
    parts.push(piece);
    total += piece.length;
    lastId = r.id;
    processed++;
  }

  const extraction = await extractMemoryLanes(parts.join('\n\n'), llmCall);

  new SessionStore(db).ensure(LANE_SESSION_ID, 'system', 'Extracted memory lanes (facts/events/profiles)');
  const written = writeMemoryLaneFrames(new FrameStore(db), LANE_SESSION_ID, extraction);

  // Advance the watermark ONLY past what we actually fed to the LLM — frames
  // beyond the input cap are picked up by the next run.
  setWatermark(db, lastId);

  return { skipped: false, framesProcessed: processed, watermark: lastId, written, errors: extraction.errors };
}
