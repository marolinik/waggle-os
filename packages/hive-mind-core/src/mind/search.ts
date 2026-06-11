import type { MindDB } from './db.js';
import type { Embedder } from './embeddings.js';
import type { MemoryFrame, Importance } from './frames.js';
import type { Reranker } from './inprocess-reranker.js';
import { createCoreLogger } from '../logger.js';
import {
  computeRelevance,
  SCORING_PROFILES,
  type ScoringProfile,
  type ScoringContext,
  type ScoredResult,
} from './scoring.js';

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
}

export interface SearchResult {
  frame: MemoryFrame;
  rrfScore: number;
  relevanceScore: number;
  finalScore: number;
}

const RRF_K = 60;

const log = createCoreLogger('hybrid-search');

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
    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordSearch(query, laneFetch, gopId),
      this.vectorSearch(query, laneFetch, gopId),
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

    const frames = raw.prepare(
      `SELECT * FROM memory_frames WHERE id IN (${placeholders})${whereExtra}`
    ).all(...temporalParams) as MemoryFrame[];

    const frameMap = new Map(frames.map(f => [f.id, f]));

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
        context
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
  }
}
