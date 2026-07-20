/**
 * Bounded vector + chunk reconciliation for frames written by fast hook paths.
 *
 * The legacy `vector_backfill_v1` marker records only the destructive
 * mock-fingerprint rebuild. It never suppresses incremental reconciliation:
 * hook writes intentionally persist frame/FTS data first and this pass repairs
 * missing semantic indexes shortly afterwards.
 */

import {
  HybridSearch,
  type Embedder,
  type EmbeddingProviderInstance,
  type EmbeddingProviderStatus,
  type EmbeddingProviderType,
  type MindDB,
} from '@waggle/core';

const LEGACY_FLAG_KEY = 'vector_backfill_v1';
const CURSOR_KEY = 'vector_enrichment_cursor_v1';
const DEFAULT_MAX_FRAMES = 32;
const DEFAULT_BATCH_SIZE = 8;

export interface VectorBackfillOptions {
  /** Maximum incomplete frames considered by one pass. */
  maxFrames?: number;
  /** Maximum missing whole-frame vectors embedded in one provider batch. */
  batchSize?: number;
}

export interface VectorBackfillResult {
  skipped: 'no_real_embedder' | 'provider_degraded' | 'fingerprint_mismatch' | 'empty_mind' | null;
  /** True when untrusted mock/unknown vector tables were rebuilt. */
  vectorsRepaired: boolean;
  framesReembedded: number;
  chunksCreated: number;
  framesProcessed: number;
  /** More incomplete frames remain for a later bounded pass. */
  hasMore: boolean;
  errors: string[];
}

interface RepairCandidate {
  id: number;
  content: string;
  whole_missing: 0 | 1;
}

interface ProviderFingerprint {
  provider: EmbeddingProviderType;
  model: string;
  dim: number;
}

function emptyResult(): VectorBackfillResult {
  return {
    skipped: null,
    vectorsRepaired: false,
    framesReembedded: 0,
    chunksCreated: 0,
    framesProcessed: 0,
    hasMore: false,
    errors: [],
  };
}

function clampInteger(value: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(value as number)));
}

function activeFingerprint(embedder: EmbeddingProviderInstance): ProviderFingerprint {
  const status = embedder.getStatus();
  return {
    provider: status.activeProvider,
    model: status.modelName,
    dim: embedder.dimensions,
  };
}

function fingerprintLabel(fingerprint: ProviderFingerprint): string {
  return `${fingerprint.provider}/${fingerprint.model}/${fingerprint.dim}`;
}

function providerProblem(
  embedder: EmbeddingProviderInstance,
  expected?: ProviderFingerprint,
): string | null {
  const status = embedder.getStatus();
  const current = activeFingerprint(embedder);
  if (embedder.getActiveProvider() === 'mock' || status.activeProvider === 'mock') {
    return 'no real embedding provider is active';
  }
  if (status.lastError) return `embedding provider degraded: ${status.lastError}`;
  if (
    expected
    && (
      current.provider !== expected.provider
      || current.model !== expected.model
      || current.dim !== expected.dim
    )
  ) {
    return `embedding provider changed during enrichment: expected=${fingerprintLabel(expected)}, ` +
      `active=${fingerprintLabel(current)}`;
  }
  return null;
}

async function prepareProvider(
  embedder: EmbeddingProviderInstance,
  expected?: ProviderFingerprint,
): Promise<string | null> {
  let problem = providerProblem(embedder, expected);
  if (!problem) return null;
  try {
    await embedder.reprobe();
  } catch (err) {
    return `embedding provider reprobe failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  problem = providerProblem(embedder, expected);
  return problem;
}

/**
 * EmbeddingProvider deliberately returns deterministic mock vectors on a live
 * provider failure. HybridSearch cannot distinguish those values by itself,
 * so this adapter checks provider status and the captured fingerprint before
 * and after every await, then exposes only that captured fingerprint to
 * HybridSearch. A concurrent reprobe therefore cannot silently mix spaces.
 */
function strictEmbedder(
  embedder: EmbeddingProviderInstance,
  expected: ProviderFingerprint,
): Embedder {
  const capturedStatus: EmbeddingProviderStatus = {
    ...embedder.getStatus(),
    activeProvider: expected.provider,
    dimensions: expected.dim,
    modelName: expected.model,
    lastError: undefined,
  };
  const assertHealthy = (): void => {
    const problem = providerProblem(embedder, expected);
    if (problem) throw new Error(problem);
  };
  return {
    dimensions: expected.dim,
    getActiveProvider: () => expected.provider,
    getStatus: () => capturedStatus,
    async embed(text: string): Promise<Float32Array> {
      assertHealthy();
      const value = await embedder.embed(text);
      assertHealthy();
      return value;
    },
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      assertHealthy();
      const values = await embedder.embedBatch(texts);
      assertHealthy();
      return values;
    },
  } as Embedder;
}

const SELECT_REPAIR_CANDIDATES_SQL = `
  SELECT
    f.id,
    f.content,
    CASE WHEN f.id IN (SELECT rowid FROM memory_frames_vec) THEN 0 ELSE 1 END AS whole_missing
  FROM memory_frames f
  WHERE f.importance != 'deprecated'
    AND (
      f.id NOT IN (SELECT rowid FROM memory_frames_vec)
      OR (
        length(f.content) > 0
        AND (
          f.id NOT IN (SELECT DISTINCT frame_id FROM memory_frame_chunks)
          OR f.id IN (
            SELECT c.frame_id
            FROM memory_frame_chunks c
            LEFT JOIN memory_frame_chunks_vec cv ON cv.rowid = c.id
            WHERE cv.rowid IS NULL
          )
        )
      )
    )
    AND f.id > ?
  ORDER BY f.id
  LIMIT ?
`;

const HAS_PENDING_CANDIDATES_SQL = `
  SELECT 1 AS pending
  FROM memory_frames f
  WHERE f.importance != 'deprecated'
    AND (
      f.id NOT IN (SELECT rowid FROM memory_frames_vec)
      OR (
        length(f.content) > 0
        AND (
          f.id NOT IN (SELECT DISTINCT frame_id FROM memory_frame_chunks)
          OR f.id IN (
            SELECT c.frame_id
            FROM memory_frame_chunks c
            LEFT JOIN memory_frame_chunks_vec cv ON cv.rowid = c.id
            WHERE cv.rowid IS NULL
          )
        )
      )
    )
  LIMIT 1
`;

function selectCandidates(db: MindDB, limit: number, afterId: number): RepairCandidate[] {
  return db.getDatabase().prepare(SELECT_REPAIR_CANDIDATES_SQL)
    .all(afterId, limit) as RepairCandidate[];
}

function hasPendingCandidates(db: MindDB): boolean {
  return Boolean(db.getDatabase().prepare(HAS_PENDING_CANDIDATES_SQL).get());
}

function readCursor(db: MindDB): number {
  const row = db.getDatabase().prepare('SELECT value FROM meta WHERE key = ?').get(CURSOR_KEY) as
    | { value: string }
    | undefined;
  const parsed = Number(row?.value ?? 0);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function writeCursor(db: MindDB, frameId: number): void {
  db.getDatabase().prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
    .run(CURSOR_KEY, String(Math.max(0, Math.trunc(frameId))));
}

function chunkVectorCountForFrames(db: MindDB, frameIds: readonly number[]): number {
  if (frameIds.length === 0) return 0;
  const placeholders = frameIds.map(() => '?').join(', ');
  const row = db.getDatabase().prepare(`
    SELECT COUNT(*) AS n
    FROM memory_frame_chunks c
    JOIN memory_frame_chunks_vec cv ON cv.rowid = c.id
    WHERE c.frame_id IN (${placeholders})
  `).get(...frameIds) as { n: number };
  return row.n;
}

function frameNeedsChunkRepair(db: MindDB, frame: RepairCandidate): boolean {
  if (frame.content.length === 0) return false;
  return Boolean(db.getDatabase().prepare(`
    SELECT 1
    WHERE NOT EXISTS (
      SELECT 1 FROM memory_frame_chunks WHERE frame_id = ?
    ) OR EXISTS (
      SELECT 1
      FROM memory_frame_chunks c
      LEFT JOIN memory_frame_chunks_vec cv ON cv.rowid = c.id
      WHERE c.frame_id = ? AND cv.rowid IS NULL
    )
  `).get(frame.id, frame.id));
}

function hasWholeVector(db: MindDB, frameId: number): boolean {
  return Boolean(db.getDatabase().prepare(
    'SELECT 1 FROM memory_frames_vec WHERE rowid = ?',
  ).get(Math.trunc(frameId)));
}

function existingVectorCount(db: MindDB): number {
  const raw = db.getDatabase();
  const whole = (raw.prepare('SELECT COUNT(*) AS n FROM memory_frames_vec').get() as { n: number }).n;
  const chunks = (raw.prepare('SELECT COUNT(*) AS n FROM memory_frame_chunks_vec').get() as { n: number }).n;
  return whole + chunks;
}

/** Run one bounded incremental repair pass. Never throws. */
export async function runVectorBackfill(
  db: MindDB,
  embedder: EmbeddingProviderInstance | undefined,
  options: VectorBackfillOptions = {},
): Promise<VectorBackfillResult> {
  const result = emptyResult();
  const maxFrames = clampInteger(options.maxFrames, DEFAULT_MAX_FRAMES, 256);
  const batchSize = clampInteger(options.batchSize, DEFAULT_BATCH_SIZE, maxFrames);

  try {
    if (!embedder) {
      result.skipped = 'no_real_embedder';
      return result;
    }
    const preparationProblem = await prepareProvider(embedder);
    if (preparationProblem) {
      result.skipped = embedder.getActiveProvider() === 'mock'
        ? 'no_real_embedder'
        : 'provider_degraded';
      if (result.skipped === 'provider_degraded') result.errors.push(preparationProblem);
      return result;
    }

    const raw = db.getDatabase();
    const activeFrameCount = (raw.prepare(
      "SELECT COUNT(*) AS n FROM memory_frames WHERE importance != 'deprecated'",
    ).get() as { n: number }).n;
    if (activeFrameCount === 0) {
      result.skipped = 'empty_mind';
      return result;
    }

    const wantedFingerprint = activeFingerprint(embedder);
    const storedFingerprint = db.getEmbeddingFingerprint();
    if (storedFingerprint?.provider === 'mock') {
      // The legacy marker is written only for a known mock-fingerprint rebuild.
      db.recreateVecTables(embedder.dimensions);
      db.setEmbeddingFingerprint(wantedFingerprint);
      raw.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)')
        .run(LEGACY_FLAG_KEY, new Date().toISOString());
      result.vectorsRepaired = true;
    } else if (!storedFingerprint && existingVectorCount(db) > 0) {
      // Pre-fingerprint databases may contain a complete-looking index whose
      // model provenance is unknowable. Never relabel or mix it: discard only
      // the vector tables and refill them incrementally with verified vectors.
      db.recreateVecTables(embedder.dimensions);
      db.setEmbeddingFingerprint(wantedFingerprint);
      result.vectorsRepaired = true;
    } else if (
      storedFingerprint
      && (
        storedFingerprint.dim !== wantedFingerprint.dim
        || storedFingerprint.provider !== wantedFingerprint.provider
        || storedFingerprint.model !== wantedFingerprint.model
      )
    ) {
      result.skipped = 'fingerprint_mismatch';
      result.errors.push(
        `embedding fingerprint mismatch: stored=${storedFingerprint.provider}/${storedFingerprint.model}/` +
        `${storedFingerprint.dim}, active=${fingerprintLabel(wantedFingerprint)}`,
      );
      return result;
    }

    const cursor = readCursor(db);
    let candidates = selectCandidates(db, maxFrames, cursor);
    if (candidates.length === 0 && cursor > 0 && hasPendingCandidates(db)) {
      candidates = selectCandidates(db, maxFrames, 0);
    }
    if (candidates.length === 0) {
      writeCursor(db, 0);
      return result;
    }
    // Advance even when a deterministic poison frame fails. The next pass
    // starts after this bounded window, preventing permanent oldest-first
    // starvation while a later wrap still retries failures.
    writeCursor(db, candidates[candidates.length - 1].id);

    const search = new HybridSearch(db, strictEmbedder(embedder, wantedFingerprint));
    const missingWhole = candidates.filter(candidate => candidate.whole_missing === 1);
    const chunkOnly = candidates.filter(candidate => candidate.whole_missing === 0);

    const recordProviderProblem = (problem: string, frameId?: number): void => {
      const prefix = frameId === undefined ? '' : `frame ${frameId}: `;
      result.errors.push(`${prefix}${problem}`);
    };

    const recoverProvider = async (frameId?: number): Promise<boolean> => {
      const problem = await prepareProvider(embedder, wantedFingerprint);
      if (!problem) return true;
      recordProviderProblem(problem, frameId);
      return false;
    };

    const repairChunks = async (frame: RepairCandidate): Promise<void> => {
      if (!frameNeedsChunkRepair(db, frame)) return;
      if (!await recoverProvider(frame.id)) return;
      const before = chunkVectorCountForFrames(db, [frame.id]);
      try {
        await search.indexChunksForFrame(frame.id, frame.content);
        const after = chunkVectorCountForFrames(db, [frame.id]);
        result.chunksCreated += Math.max(0, after - before);
      } catch (err) {
        recordProviderProblem(err instanceof Error ? err.message : String(err), frame.id);
      }
    };

    const repairSingleWhole = async (frame: RepairCandidate): Promise<void> => {
      if (!await recoverProvider(frame.id)) return;
      const chunksBefore = chunkVectorCountForFrames(db, [frame.id]);
      try {
        await search.indexFramesBatch([frame]);
      } catch (err) {
        recordProviderProblem(err instanceof Error ? err.message : String(err), frame.id);
        return;
      }
      if (!hasWholeVector(db, frame.id)) return;
      result.framesReembedded += 1;
      result.framesProcessed += 1;
      const chunksAfter = chunkVectorCountForFrames(db, [frame.id]);
      result.chunksCreated += Math.max(0, chunksAfter - chunksBefore);
      const postProblem = providerProblem(embedder, wantedFingerprint);
      if (postProblem) recordProviderProblem(postProblem, frame.id);
      await repairChunks(frame);
    };

    for (let offset = 0; offset < missingWhole.length; offset += batchSize) {
      const batch = missingWhole.slice(offset, offset + batchSize);
      if (!await recoverProvider()) break;
      const ids = batch.map(frame => frame.id);
      const chunksBefore = chunkVectorCountForFrames(db, ids);
      try {
        await search.indexFramesBatch(batch);
      } catch (err) {
        recordProviderProblem(err instanceof Error ? err.message : String(err));
        // A failed provider batch is atomic for whole vectors. Retry its
        // members independently so one poison input cannot block valid peers.
        for (const frame of batch) await repairSingleWhole(frame);
        continue;
      }

      result.framesReembedded += batch.length;
      result.framesProcessed += batch.length;
      const chunksAfter = chunkVectorCountForFrames(db, ids);
      result.chunksCreated += Math.max(0, chunksAfter - chunksBefore);
      const postProblem = providerProblem(embedder, wantedFingerprint);
      if (postProblem) recordProviderProblem(postProblem);
      for (const frame of batch) await repairChunks(frame);
    }

    for (const frame of chunkOnly) {
      if (!await recoverProvider(frame.id)) continue;
      const chunksBefore = chunkVectorCountForFrames(db, [frame.id]);
      try {
        await search.indexChunksForFrame(frame.id, frame.content);
        result.framesProcessed += 1;
        const chunksAfter = chunkVectorCountForFrames(db, [frame.id]);
        result.chunksCreated += Math.max(0, chunksAfter - chunksBefore);
      } catch (err) {
        recordProviderProblem(err instanceof Error ? err.message : String(err), frame.id);
      }
    }

    result.hasMore = hasPendingCandidates(db);
    if (!result.hasMore) writeCursor(db, 0);
    return result;
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
    result.hasMore = true;
    return result;
  }
}
