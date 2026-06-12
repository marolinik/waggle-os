/**
 * vector-backfill.ts — one-time per-mind vector repair + chunk backfill
 * (D1 follow-up, 2026-06-12).
 *
 * Two problems this fixes for EXISTING minds:
 *  1. Mock-fingerprinted vectors: minds whose frames were indexed while only
 *     the mock embedder was available carry NOISE vectors that look indexed
 *     (the boot reconcile only fixes COUNT mismatches, not content) — the
 *     D1 probe found the real personal mind in exactly this state. When a
 *     real embedder is active, recreate the vec tables and re-embed.
 *  2. Chunk backfill: chunk-level retrieval (default-ON since the D1 probe:
 *     hit@5 46/52 vs 17/52) only helps frames that HAVE chunks. New frames
 *     chunk-index on write; pre-existing frames need this one-time
 *     `rechunkAllFrames` pass. Un-backfilled minds degrade gracefully
 *     (whole-frame fallback) until this runs.
 *
 * Idempotent via a `meta` flag; never throws (callers are boot/cron paths).
 * Skips entirely while the embedder is mock — the flag stays unset so the
 * next run (daily cron) retries once a real provider activates.
 */

import {
  HybridSearch,
  rechunkAllFrames,
  type MindDB,
  type EmbeddingProviderInstance,
} from '@waggle/core';

const FLAG_KEY = 'vector_backfill_v1';
const REEMBED_BATCH = 16;

export interface VectorBackfillResult {
  /** Reason the run was a no-op, or null when work was done. */
  skipped: 'already_done' | 'no_real_embedder' | 'empty_mind' | null;
  /** True when mock-fingerprinted vectors were wiped + re-embedded. */
  vectorsRepaired: boolean;
  framesReembedded: number;
  chunksCreated: number;
  errors: string[];
}

export async function runVectorBackfill(
  db: MindDB,
  embedder: EmbeddingProviderInstance | undefined,
): Promise<VectorBackfillResult> {
  const result: VectorBackfillResult = {
    skipped: null, vectorsRepaired: false, framesReembedded: 0, chunksCreated: 0, errors: [],
  };
  try {
    const raw = db.getDatabase();
    const flag = raw.prepare('SELECT value FROM meta WHERE key = ?').get(FLAG_KEY) as
      | { value: string } | undefined;
    if (flag) {
      result.skipped = 'already_done';
      return result;
    }
    if (!embedder || embedder.getActiveProvider() === 'mock') {
      // Flag deliberately NOT set — retry on the next run once keys/Ollama exist.
      result.skipped = 'no_real_embedder';
      return result;
    }
    const frameCount = (raw.prepare('SELECT COUNT(*) AS cnt FROM memory_frames').get() as { cnt: number }).cnt;
    if (frameCount === 0) {
      // Nothing to repair or chunk; mark done so the daily cron stops checking.
      raw.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
        .run(FLAG_KEY, new Date().toISOString());
      result.skipped = 'empty_mind';
      return result;
    }

    const search = new HybridSearch(db, embedder);

    // 1. Mock-fingerprint repair: wipe noise vectors, re-embed everything real.
    const fp = raw.prepare("SELECT value FROM meta WHERE key = 'embedding_provider'").get() as
      | { value: string } | undefined;
    if (fp?.value === 'mock') {
      db.recreateVecTables(embedder.dimensions);
      const frames = raw.prepare(
        `SELECT id, content FROM memory_frames WHERE importance != 'deprecated' ORDER BY id`
      ).all() as Array<{ id: number; content: string }>;
      for (let i = 0; i < frames.length; i += REEMBED_BATCH) {
        // Content capping happens inside the provider (R5 capEmbedText); a
        // batch failure degrades per-text, never aborts the backfill.
        await search.indexFramesBatch(frames.slice(i, i + REEMBED_BATCH));
      }
      result.vectorsRepaired = true;
      result.framesReembedded = frames.length;
    }

    // 2. Chunk backfill (idempotent replace-per-frame; flag-independent helper).
    const rechunk = await rechunkAllFrames(db, search);
    result.chunksCreated = rechunk.chunksCreated;
    if (rechunk.framesFailed > 0) {
      result.errors.push(`rechunk: ${rechunk.framesFailed} frames failed`);
    }

    raw.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
      .run(FLAG_KEY, new Date().toISOString());
    return result;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    return result;
  }
}
