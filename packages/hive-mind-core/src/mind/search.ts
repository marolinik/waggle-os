import type { MindDB } from './db.js';
import type { Embedder } from './embeddings.js';
import type { MemoryFrame, Importance } from './frames.js';
import type { Reranker } from './inprocess-reranker.js';
import { chunkText, type ChunkOptions } from './chunker.js';
import { createCoreLogger } from '../logger.js';
import {
  computeRelevance,
  SCORING_PROFILES,
  type ScoringProfile,
  type ScoringContext,
  type ScoredResult,
} from './scoring.js';
import { KnowledgeGraph } from './knowledge.js';

export interface SearchOptions {
  limit?: number;
  gopId?: string; // scope to a specific session
  profile?: ScoringProfile;
  context?: ScoringContext;
  /** F20: Only include frames created on or after this ISO date string. */
  since?: string;
  /** F20: Only include frames created on or before this ISO date string. */
  until?: string;
  /**
   * W4.2: cross-encoder reranker invoked AFTER RRF on the top-`rerankPoolSize`
   * candidates. When provided, results are sorted by reranker score
   * (jointly attentive over query+doc). RRF still selects the candidate
   * pool; the reranker only re-orders the survivors. Soft-fails to RRF
   * ordering on any reranker error.
   */
  reranker?: Reranker;
  /** How many candidates to send to the reranker (default 30). */
  rerankPoolSize?: number;
  /**
   * Hard-exclude frames with importance='deprecated' from results. Default OFF
   * for back-compat: deprecated frames still surface, merely down-weighted 0.3×
   * by the scoring layer. Turn ON where a superseded value must NEVER leak into
   * the read context — e.g. after supersession consolidation (see supersede.ts),
   * where a 0.3× multiplier still let stale values surface via the focus lane.
   */
  excludeDeprecated?: boolean;
}

export interface SearchResult {
  frame: MemoryFrame;
  rrfScore: number;
  relevanceScore: number;
  finalScore: number;
}

const RRF_K = 60;

const log = createCoreLogger('hybrid-search');

// Reverse-ported from OSS hive-mind chunker (oss-drift triage D1, 2026-06-11).
/**
 * Chunk-level retrieval flag — DEFAULT ON since the 2026-06-12 long-frame
 * needle probe (benchmarks/chunk-probe/): on a copy of the real production
 * personal mind, paired hit@5 = chunk 46/52 vs whole-frame 17/52 (discordant
 * pairs 30-vs-1, McNemar p≈2e-8); chunk led even within the embed cap
 * (17/20 vs 13/20) and dominated beyond it (29/32 vs 4/32 — content past the
 * embedder's true token context is structurally invisible to whole-frame
 * vectors). LoCoMo was rejected as the ruler: its frames sit below the
 * 2000-char chunk threshold, so an A/B there measures noise by construction.
 * Kill switch: WAGGLE_CHUNK_RETRIEVAL=0. Gates BOTH the write side
 * (indexFrame / indexFramesBatch also chunk-index the frame) and the read
 * side (search() queries memory_frame_chunks_vec, falling back to whole-frame
 * vectors while the chunk index is empty). `indexChunksForFrame` /
 * `rechunkAllFrames` stay callable regardless of the flag (backfill + eval).
 */
export function chunkRetrievalEnabled(): boolean {
  return process.env.WAGGLE_CHUNK_RETRIEVAL !== '0';
}

function f32ToBlob(f32: Float32Array): Uint8Array {
  return new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength);
}

/**
 * Escape LIKE metacharacters (`%`, `_`) and the escape char itself (`\`) so the
 * keyword-fallback term is matched literally. Pair with `ESCAPE '\'` on the LIKE.
 */
function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, ch => `\\${ch}`);
}

export class HybridSearch {
  private db: MindDB;
  private embedder: Embedder;
  private fingerprintChecked = false;

  constructor(db: MindDB, embedder: Embedder) {
    this.db = db;
    this.embedder = embedder;
  }

  // Reverse-ported from OSS hive-mind (oss-drift triage R7, 2026-06-11).
  /**
   * Guard the .mind's embedding fingerprint before vector reads/writes. Throws
   * EmbeddingDimMismatchError if the active embedder's dim differs from what
   * the .mind's vectors were written at; warns (but allows) on a same-dim model
   * change. Memoized on success so it costs one meta read per instance lifetime.
   * Must be called BEFORE any try/catch that would swallow the error.
   */
  private ensureFingerprint(): void {
    if (this.fingerprintChecked) return;
    const e = this.embedder as Embedder & {
      getActiveProvider?(): string;
      getStatus?(): { modelName?: string };
    };
    const provider = e.getActiveProvider?.() ?? 'unknown';
    const model = e.getStatus?.().modelName ?? 'unknown';
    const result = this.db.ensureEmbeddingFingerprint({ provider, model, dim: this.embedder.dimensions });
    // Only memoize after a non-throwing check (a dim mismatch must keep throwing).
    this.fingerprintChecked = true;
    if (result.status === 'model-changed') {
      log.warn(
        `Embedding model changed for this .mind (${result.storedProvider}/${result.storedModel} → ` +
          `${provider}/${model}, same ${this.embedder.dimensions}-dim). Existing vectors stay searchable, ` +
          `but cross-model similarity is degraded — consider re-embedding all frames.`
      );
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 20, gopId, profile = 'balanced', context = {}, since, until, reranker, rerankPoolSize } = options;
    const weights = SCORING_PROFILES[profile];

    // Run keyword and vector searches in parallel.
    // W4.1b slot-consumption fix: the since/until filter applies AFTER the
    // lanes run (as a WHERE over candidate ids), so out-of-window candidates
    // would otherwise consume lane slots and shrink results below `limit`
    // even when in-window frames exist deeper in the lanes. Over-fetch the
    // lanes when a temporal window is active so the post-filter has depth.
    const laneFetch = (since || until) ? limit * 10 : limit * 2;

    // D1 chunk lane (flag-gated, default OFF): prefer chunk-level vector
    // search when WAGGLE_CHUNK_RETRIEVAL=1 AND chunks_vec is populated —
    // chunk embeddings discriminate better on domain-homogeneous corpora
    // than whole-frame embeddings. vectorSearchChunks returns null when no
    // chunks exist, signalling clean fallback to the whole-frame path. Both
    // paths return frame IDs so the RRF + scoring pipeline is unchanged.
    // Flag off → chunkResults is null without touching the chunk tables,
    // so the lane below is byte-identical to pre-D1.
    const chunkResults = chunkRetrievalEnabled()
      ? await this.vectorSearchChunks(query, laneFetch, gopId)
      : null;
    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordSearch(query, laneFetch, gopId),
      chunkResults !== null
        ? Promise.resolve(chunkResults)
        : this.vectorSearch(query, laneFetch, gopId),
    ]);

    // RRF fusion
    const rrfScores = new Map<number, number>();

    keywordResults.forEach((id, rank) => {
      rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (RRF_K + rank));
    });

    vectorResults.forEach((id, rank) => {
      rrfScores.set(id, (rrfScores.get(id) ?? 0) + 1 / (RRF_K + rank));
    });

    // Get all unique frame IDs
    const frameIds = [...rrfScores.keys()];
    if (frameIds.length === 0) return [];

    // F20: Fetch frames with optional temporal filtering
    const raw = this.db.getDatabase();
    const placeholders = frameIds.map(() => '?').join(',');
    const temporalConditions: string[] = [];
    const temporalParams: unknown[] = [...frameIds];

    // W4.1b fencepost fix: `created_at` carries mixed formats across write
    // paths — `datetime('now')` ("YYYY-MM-DD HH:MM:SS") vs harvest ISO
    // ("YYYY-MM-DDT…Z"). A date-only `until` string-compares BELOW any
    // same-day timestamp ("2026-03-21T10:00" > "2026-03-21"), silently
    // excluding the whole final day. Compare date-only bounds on the
    // 10-char date prefix instead — format-agnostic and inclusive.
    if (since) {
      if (since.length === 10) {
        temporalConditions.push('substr(created_at, 1, 10) >= ?');
      } else {
        temporalConditions.push('created_at >= ?');
      }
      temporalParams.push(since);
    }
    if (until) {
      if (until.length === 10) {
        temporalConditions.push('substr(created_at, 1, 10) <= ?');
      } else {
        temporalConditions.push('created_at <= ?');
      }
      temporalParams.push(until);
    }

    const whereExtra = temporalConditions.length > 0
      ? ` AND ${temporalConditions.join(' AND ')}`
      : '';
    // Hard-exclude deprecated frames when requested (no param needed — literal
    // condition). Dropping them from `frames` removes them from frameMap, so
    // they never enter the result set OR the reranker pool.
    const deprecatedExtra = options.excludeDeprecated ? " AND importance != 'deprecated'" : '';

    const frames = raw.prepare(
      `SELECT * FROM memory_frames WHERE id IN (${placeholders})${whereExtra}${deprecatedExtra}`
    ).all(...temporalParams) as MemoryFrame[];

    const frameMap = new Map(frames.map(f => [f.id, f]));

    // W4.1: turn on the 'contextual' scoring signal. Seed graph distance from
    // entities the caller flagged (context.recentEntityIds) plus entities named
    // in the query, BFS the KG, and map to frames via the kg_entity_frames bridge.
    // Best-effort: a graph hiccup must never fail the search.
    let scoringContext = context;
    if (!scoringContext.graphDistances) {
      try {
        const kg = new KnowledgeGraph(this.db);
        const seeds = new Set<number>(scoringContext.recentEntityIds ?? []);
        for (const id of kg.findEntitiesInText(query)) seeds.add(id);
        if (seeds.size > 0) {
          const graphDistances = kg.frameDistancesFromEntities([...seeds], 3);
          if (graphDistances.size > 0) scoringContext = { ...scoringContext, graphDistances };
        }
      } catch { /* contextual signal is optional */ }
    }

    // Compute final scores
    const results: SearchResult[] = [];
    for (const [frameId, rrfScore] of rrfScores) {
      const frame = frameMap.get(frameId);
      if (!frame) continue;

      const relevanceScore = computeRelevance(
        {
          id: frame.id,
          // W4.2 bug #3: temporal decay anchors on write time, not access time.
          created_at: frame.created_at,
          last_accessed: frame.last_accessed,
          access_count: frame.access_count,
          importance: frame.importance as Importance,
        },
        weights,
        scoringContext
      );

      results.push({
        frame,
        rrfScore,
        relevanceScore,
        finalScore: rrfScore * relevanceScore,
      });
    }

    results.sort((a, b) => b.finalScore - a.finalScore);

    // W4.2: optional cross-encoder reranking on the top pool (reverse-ported
    // from the OSS benchmark-proven stack). Reranker scoring is jointly
    // attentive over (query, doc), so it discriminates much better than
    // vector dot products on densely-homogeneous corpora. RRF still selects
    // the candidate pool; the reranker only re-orders the survivors.
    if (reranker) {
      const poolSize = Math.min(rerankPoolSize ?? 30, results.length);
      const pool = results.slice(0, poolSize);
      try {
        const docs = pool.map((r) => r.frame.content);
        const scores = await reranker.scoreBatch(query, docs);
        // Pair (result, rerank score), sort desc, replace finalScore so the
        // shape stays the same for downstream consumers.
        const reranked = pool.map((r, i) => ({ ...r, finalScore: scores[i] }));
        reranked.sort((a, b) => b.finalScore - a.finalScore);
        // Append any pool tail items beyond rerankPoolSize so a small limit
        // doesn't suddenly contract the result set.
        return reranked.concat(results.slice(poolSize)).slice(0, limit);
      } catch {
        // Reranker failure (model load, OOM, dim mismatch) — fall back to
        // RRF ordering. Soft-fail so a misconfigured reranker doesn't
        // kill recall entirely.
      }
    }

    return results.slice(0, limit);
  }

  async keywordSearch(query: string, limit: number, gopId?: string): Promise<number[]> {
    const raw = this.db.getDatabase();

    // W3.6: Sanitize query for FTS5 with OR-based matching for better recall.
    // Old: implicit AND (all terms required) → fails on "hiring decisions this month"
    // New: OR between terms (any term matches) → FTS5 rank orders by relevance
    const FTS_STOP_WORDS = new Set([
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'about', 'this',
      'that', 'these', 'those', 'it', 'its', 'my', 'your', 'our', 'their',
      'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why', 'all',
      'each', 'every', 'both', 'some', 'any', 'no', 'not', 'and', 'or', 'but',
    ]);
    const safeQuery = query.includes('"')
      ? query // already quoted by caller
      : query
          .split(/\s+/)
          .map(w => w.replace(/[^\w]/g, '')) // strip punctuation
          .filter(w => w.length > 2 && !FTS_STOP_WORDS.has(w.toLowerCase()))
          .map(w => `"${w.replace(/"/g, '')}"`)
          .join(' OR ');

    if (!safeQuery) return [];

    let sql: string;
    let params: unknown[];

    if (gopId) {
      sql = `
        SELECT mf.id FROM memory_frames_fts fts
        JOIN memory_frames mf ON mf.id = fts.rowid
        WHERE fts.content MATCH ? AND mf.gop_id = ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [safeQuery, gopId, limit];
    } else {
      sql = `
        SELECT rowid as id FROM memory_frames_fts
        WHERE content MATCH ?
        ORDER BY rank
        LIMIT ?
      `;
      params = [safeQuery, limit];
    }

    try {
      const rows = raw.prepare(sql).all(...params) as { id: number }[];
      return rows.map(r => r.id);
    } catch {
      // FTS5 parse error (e.g. user query with FTS5-special chars that survived
      // sanitization) — fall back to a LIKE keyword scan over the same column so
      // we return best-effort matches instead of a false "no memory found".
      return this.likeFallbackSearch(query, limit, gopId);
    }
  }

  /**
   * LIKE-based keyword fallback over memory_frames.content. Used when the FTS5
   * MATCH query throws a parse error (e.g. an unbalanced quote or other FTS5
   * operator the user typed literally). The raw query is split into word tokens
   * — stripping the punctuation that caused the FTS5 error, mirroring the
   * primary sanitizer — and matched with OR-ed LIKE clauses for best-effort
   * recall. Bound parameters only (the term is never interpolated) and LIKE
   * metachars (`%`, `_`, `\`) are escaped with an ESCAPE clause so each token
   * matches literally. If no usable token survives, a single literal LIKE over
   * the whole escaped query is used.
   */
  private likeFallbackSearch(query: string, limit: number, gopId?: string): number[] {
    const raw = this.db.getDatabase();

    const tokens = query
      .split(/\s+/)
      .map(w => w.replace(/[^\w]/g, '')) // strip punctuation (incl. FTS5 operators)
      .filter(w => w.length > 0);
    const terms = (tokens.length > 0 ? tokens : [query]).map(t => `%${escapeLikeTerm(t)}%`);

    const likeClause = terms.map(() => `content LIKE ? ESCAPE '\\'`).join(' OR ');

    try {
      if (gopId) {
        const rows = raw.prepare(
          `SELECT id FROM memory_frames
           WHERE (${likeClause}) AND gop_id = ?
           ORDER BY created_at DESC LIMIT ?`
        ).all(...terms, gopId, limit) as { id: number }[];
        return rows.map(r => r.id);
      }
      const rows = raw.prepare(
        `SELECT id FROM memory_frames
         WHERE (${likeClause})
         ORDER BY created_at DESC LIMIT ?`
      ).all(...terms, limit) as { id: number }[];
      return rows.map(r => r.id);
    } catch {
      return [];
    }
  }

  async vectorSearch(query: string, limit: number, gopId?: string): Promise<number[]> {
    this.ensureFingerprint();
    const embedding = await this.embedder.embed(query);
    const blob = f32ToBlob(embedding);
    const raw = this.db.getDatabase();

    if (gopId) {
      // Two-step: get candidates from vec, then filter by GOP
      try {
        const rows = raw.prepare(`
          SELECT v.rowid as id FROM memory_frames_vec v
          WHERE v.embedding MATCH ? AND k = ?
          ORDER BY distance
        `).all(blob, limit * 3) as { id: number }[];

        // Filter by GOP
        if (rows.length === 0) return [];
        const placeholders = rows.map(() => '?').join(',');
        const filtered = raw.prepare(`
          SELECT id FROM memory_frames WHERE id IN (${placeholders}) AND gop_id = ?
        `).all(...rows.map(r => r.id), gopId) as { id: number }[];

        return filtered.map(r => r.id).slice(0, limit);
      } catch {
        return [];
      }
    } else {
      try {
        const rows = raw.prepare(`
          SELECT rowid as id FROM memory_frames_vec
          WHERE embedding MATCH ? AND k = ?
          ORDER BY distance
        `).all(blob, limit) as { id: number }[];
        return rows.map(r => r.id);
      } catch {
        return [];
      }
    }
  }

  async indexFrame(frameId: number, content: string): Promise<void> {
    this.ensureFingerprint();
    if (!Number.isFinite(frameId)) {
      throw new Error('Invalid frame ID for vector indexing');
    }
    const embedding = await this.embedder.embed(content);
    const raw = this.db.getDatabase();
    // sqlite-vec vec0 requires rowid as SQL literal (parameterized rowid not supported)
    const id = Math.trunc(frameId);
    raw.prepare(
      `INSERT INTO memory_frames_vec (rowid, embedding) VALUES (${id}, ?)`
    ).run(f32ToBlob(embedding));

    // D1 (flag-gated, default OFF): keep the chunk index in lockstep with
    // live frame writes. Soft-fail — a chunk-indexing error must never break
    // the primary whole-frame write (mirrors the reranker soft-fail stance).
    if (chunkRetrievalEnabled()) {
      try {
        await this.indexChunksForFrame(frameId, content);
      } catch (err) {
        log.warn(
          `chunk indexing failed for frame ${id} (whole-frame vector written): ` +
            `${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  async indexFramesBatch(frames: { id: number; content: string }[]): Promise<void> {
    if (frames.length === 0) return;
    this.ensureFingerprint();
    for (const f of frames) {
      if (!Number.isFinite(f.id)) {
        throw new Error('Invalid frame ID for vector indexing');
      }
    }
    const contents = frames.map(f => f.content);
    const embeddings = await this.embedder.embedBatch(contents);
    const raw = this.db.getDatabase();
    // sqlite-vec vec0 requires rowid as SQL literal (parameterized rowid not supported)
    const insertAll = raw.transaction(() => {
      for (let i = 0; i < frames.length; i++) {
        const id = Math.trunc(frames[i].id);
        raw.prepare(
          `INSERT INTO memory_frames_vec (rowid, embedding) VALUES (${id}, ?)`
        ).run(f32ToBlob(embeddings[i]));
      }
    });
    insertAll();

    // D1 (flag-gated, default OFF): chunk-index batch writes too, so frames
    // ingested via the batch path (harvest) aren't invisible to the chunk
    // lane. Soft-fail per frame — see indexFrame.
    if (chunkRetrievalEnabled()) {
      for (const f of frames) {
        try {
          await this.indexChunksForFrame(f.id, f.content);
        } catch (err) {
          log.warn(
            `chunk indexing failed for frame ${Math.trunc(f.id)} (whole-frame vector written): ` +
              `${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  // ── Chunk-level indexing (oss-drift triage D1, 2026-06-11) ─────────────
  // Reverse-ported from OSS hive-mind "Phase 3b-3 chunking". Whole-frame
  // embeddings cluster too tightly on a domain-homogeneous corpus (every
  // frame is "about the same project"), so retrieval can't discriminate.
  // Chunking decomposes a frame into ~500-token paragraph-level pieces,
  // each with its own embedding — search returns the chunk, we map back to
  // the parent frame for the final result.
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Replace all chunks for a frame: clears existing chunks/vec rows for the
   * frame, re-chunks the content, embeds each chunk, inserts both rows.
   * Idempotent — safe to call repeatedly. Used by rechunkAllFrames and by
   * the flag-gated indexFrame path. NOT itself gated on
   * WAGGLE_CHUNK_RETRIEVAL (backfill + eval call it directly).
   */
  async indexChunksForFrame(
    frameId: number,
    content: string,
    opts: ChunkOptions = {},
  ): Promise<number> {
    if (!Number.isFinite(frameId) || frameId <= 0) {
      throw new Error('Invalid frame ID for chunk indexing');
    }
    this.ensureFingerprint();
    const raw = this.db.getDatabase();
    const id = Math.trunc(frameId);

    const chunks = chunkText(content, opts);
    if (chunks.length === 0) return 0;

    // Embed all chunks. embedBatch amortises HTTP overhead on Ollama/API providers.
    const texts = chunks.map((c) => c.text);
    const embeddings = await this.embedder.embedBatch(texts);

    // Single tx so partial failure leaves the frame's chunks empty
    // (next rechunk pass will re-fill from scratch — same end state).
    const tx = raw.transaction(() => {
      // Find existing chunk_ids for this frame so we can drop their vec rows.
      // Foreign-key cascade handles memory_frame_chunks deletion when the
      // parent frame is deleted, but for re-indexing we're keeping the
      // frame and just replacing its chunks.
      const existing = raw
        .prepare('SELECT id FROM memory_frame_chunks WHERE frame_id = ?')
        .all(id) as Array<{ id: number }>;
      for (const row of existing) {
        // sqlite-vec rowid must be SQL literal.
        raw.prepare(`DELETE FROM memory_frame_chunks_vec WHERE rowid = ${Math.trunc(row.id)}`).run();
      }
      raw.prepare('DELETE FROM memory_frame_chunks WHERE frame_id = ?').run(id);

      const insertChunk = raw.prepare(
        'INSERT INTO memory_frame_chunks (frame_id, chunk_idx, content, char_start, char_end) VALUES (?, ?, ?, ?, ?)'
      );
      for (let i = 0; i < chunks.length; i++) {
        const c = chunks[i];
        const result = insertChunk.run(id, i, c.text, c.charStart, c.charEnd);
        const chunkId = Math.trunc(Number(result.lastInsertRowid));
        raw
          .prepare(`INSERT INTO memory_frame_chunks_vec (rowid, embedding) VALUES (${chunkId}, ?)`)
          .run(f32ToBlob(embeddings[i]));
      }
    });
    tx();
    return chunks.length;
  }

  /**
   * Vector search over chunks. Returns parent frame IDs deduped (best-chunk-
   * per-frame wins — first-seen order under ORDER BY distance). When the
   * chunk index is empty (or the tables are missing), returns null so callers
   * can cleanly fall back to the whole-frame vectorSearch path.
   */
  async vectorSearchChunks(query: string, limit: number, gopId?: string): Promise<number[] | null> {
    this.ensureFingerprint();
    const raw = this.db.getDatabase();
    // Cheap probe — avoid embedding the query when chunks aren't populated.
    let chunkCount: number;
    try {
      const row = raw.prepare('SELECT COUNT(*) AS n FROM memory_frame_chunks').get() as
        | { n: number }
        | undefined;
      chunkCount = row?.n ?? 0;
    } catch {
      return null;
    }
    if (chunkCount === 0) return null;

    const embedding = await this.embedder.embed(query);
    const blob = f32ToBlob(embedding);

    // Over-fetch chunks (limit * 5) so dedup-to-frame still leaves enough
    // candidates after collapsing multiple chunks of the same frame.
    try {
      const chunkRows = raw
        .prepare(
          `SELECT v.rowid AS chunk_id, c.frame_id
             FROM memory_frame_chunks_vec v
             JOIN memory_frame_chunks c ON c.id = v.rowid
            WHERE v.embedding MATCH ? AND k = ?
            ORDER BY distance`
        )
        .all(blob, Math.max(limit * 5, 25)) as Array<{ chunk_id: number; frame_id: number }>;

      if (chunkRows.length === 0) return [];

      // Dedup by frame_id, preserving first-seen order (best-distance chunk).
      const seen = new Set<number>();
      const frameIds: number[] = [];
      for (const r of chunkRows) {
        if (seen.has(r.frame_id)) continue;
        seen.add(r.frame_id);
        frameIds.push(r.frame_id);
        if (frameIds.length >= limit) break;
      }

      if (gopId) {
        const placeholders = frameIds.map(() => '?').join(',');
        const filtered = raw
          .prepare(
            `SELECT id FROM memory_frames WHERE id IN (${placeholders}) AND gop_id = ?`
          )
          .all(...frameIds, gopId) as { id: number }[];
        return filtered.map((r) => r.id).slice(0, limit);
      }
      return frameIds;
    } catch {
      return null;
    }
  }
}

// Reverse-ported from OSS hive-mind chunker (oss-drift triage D1, 2026-06-11);
// follows the OSS `maintenance --rechunk-all` per-mind logic.
export interface RechunkResult {
  framesProcessed: number;
  chunksCreated: number;
  framesFailed: number;
}

/**
 * (Re)chunk + chunk-index every non-deprecated frame in the .mind. Idempotent
 * per-frame — indexChunksForFrame deletes a frame's existing chunks before
 * re-inserting. One bad frame doesn't abort the batch (logged + counted).
 * Backfill/eval helper only — no CLI/route wiring yet, and NOT gated on
 * WAGGLE_CHUNK_RETRIEVAL (it must be runnable before any flag flip).
 */
export async function rechunkAllFrames(db: MindDB, search: HybridSearch): Promise<RechunkResult> {
  const raw = db.getDatabase();
  const frames = raw
    .prepare("SELECT id, content FROM memory_frames WHERE importance != 'deprecated' ORDER BY id ASC")
    .all() as Array<{ id: number; content: string }>;

  let framesProcessed = 0;
  let chunksCreated = 0;
  let framesFailed = 0;

  for (const f of frames) {
    try {
      const n = await search.indexChunksForFrame(f.id, f.content);
      framesProcessed++;
      chunksCreated += n;
    } catch (err) {
      framesFailed++;
      log.warn(
        `rechunkAllFrames: frame ${f.id} failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return { framesProcessed, chunksCreated, framesFailed };
}
