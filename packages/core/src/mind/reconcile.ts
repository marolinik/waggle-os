/**
 * Index Reconciliation — repairs FTS5 and vector indexes for memory frames.
 *
 * If the process crashes between frame creation and FTS5/vector indexing,
 * frames exist but aren't searchable. This function finds orphaned frames
 * and re-indexes them. Designed to run as a periodic maintenance cron job.
 *
 * Idempotent: safe to run multiple times without side effects.
 */

import type { MindDB } from './db.js';
import type { Embedder } from './embeddings.js';

export interface ReconcileResult {
  ftsFixed: number;
  vecFixed: number;
}

/**
 * Find frames missing from FTS5 and re-index them.
 * Does NOT require an embedder — operates only on the FTS5 table.
 */
export function reconcileFtsIndex(db: MindDB): number {
  const raw = db.getDatabase();

  // Find frames that have no corresponding FTS5 entry.
  // memory_frames_fts uses content_rowid='id', so rowid matches memory_frames.id.
  const missingFts = raw.prepare(`
    SELECT f.id, f.content FROM memory_frames f
    WHERE f.id NOT IN (SELECT rowid FROM memory_frames_fts)
  `).all() as { id: number; content: string }[];

  if (missingFts.length === 0) return 0;

  const insertFts = raw.prepare(
    'INSERT INTO memory_frames_fts (rowid, content) VALUES (?, ?)',
  );

  const insertAll = raw.transaction(() => {
    for (const row of missingFts) {
      insertFts.run(row.id, row.content);
    }
  });
  insertAll();

  return missingFts.length;
}

/**
 * Find frames missing from the vector index and re-index them.
 * Requires an embedder to compute embeddings for the missing frames.
 * Returns 0 if the vec table doesn't exist.
 */
export async function reconcileVecIndex(db: MindDB, embedder: Embedder): Promise<number> {
  const raw = db.getDatabase();

  // Check if vec table exists
  const vecExists = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_frames_vec'",
  ).get();
  if (!vecExists) return 0;

  const missingVec = raw.prepare(`
    SELECT f.id, f.content FROM memory_frames f
    WHERE f.id NOT IN (SELECT rowid FROM memory_frames_vec)
  `).all() as { id: number; content: string }[];

  if (missingVec.length === 0) return 0;

  // Embed in batches to avoid memory pressure
  const BATCH_SIZE = 50;
  for (let i = 0; i < missingVec.length; i += BATCH_SIZE) {
    const batch = missingVec.slice(i, i + BATCH_SIZE);
    const contents = batch.map(r => r.content);
    const embeddings = await embedder.embedBatch(contents);

    const insertBatch = raw.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const id = Math.trunc(batch[j].id);
        const blob = new Uint8Array(
          embeddings[j].buffer,
          embeddings[j].byteOffset,
          embeddings[j].byteLength,
        );
        raw.prepare(
          `INSERT INTO memory_frames_vec (rowid, embedding) VALUES (${id}, ?)`,
        ).run(blob);
      }
    });
    insertBatch();
  }

  return missingVec.length;
}

/**
 * Full reconciliation: repairs both FTS5 and vector indexes.
 * If no embedder is provided, only FTS5 is reconciled.
 */
export async function reconcileIndexes(
  db: MindDB,
  embedder?: Embedder,
): Promise<ReconcileResult> {
  const ftsFixed = reconcileFtsIndex(db);
  const vecFixed = embedder ? await reconcileVecIndex(db, embedder) : 0;
  return { ftsFixed, vecFixed };
}
