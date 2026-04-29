/**
 * Task 2.5 Stage 1 — ephemeral substrate factory.
 *
 * Composes the three @waggle/core primitives the retrieval + agentic cells
 * need into a single lifecycle object:
 *
 *   MindDB(dbPath)   — SQLite + sqlite-vec handle. Default `:memory:`.
 *   FrameStore(db)   — I/P/B-frame CRUD + FTS5 auto-index.
 *   HybridSearch(db, embedder) — RRF-fused FTS5 + vec0 search.
 *
 * `close()` releases the DB handle; for `:memory:` paths this also frees the
 * FTS5 + vec0 indices that live inside the same process-local handle.
 *
 * Embedder defaults to `createOllamaEmbedder()` (baseUrl http://localhost:11434,
 * model `nomic-embed-text`, 1024 dims — matches VEC_TABLE_SQL). Callers can
 * override to inject a deterministic fake (unit tests) or swap to
 * LiteLLM / API embedders later without touching substrate internals.
 *
 * No network I/O at construction time if the caller supplies an embedder.
 * When the default ollama-embedder is used, HybridSearch will only hit the
 * Ollama server during `search()` / `indexFramesBatch()` calls — construction
 * itself stays cheap.
 */

import {
  FrameStore,
  HybridSearch,
  MindDB,
  SessionStore,
  createOllamaEmbedder,
  type Embedder,
} from '@waggle/core';

export interface SubstrateOptions {
  /** SQLite path. Defaults to `:memory:` for benchmark-ephemeral use. */
  dbPath?: string;
  /** Pre-built embedder. When omitted, a fresh ollama-embedder is created. */
  embedder?: Embedder;
}

export interface Substrate {
  db: MindDB;
  frames: FrameStore;
  /** Sessions keyed by gop_id — required by the `memory_frames.gop_id ->
   *  sessions.gop_id` FK constraint. Callers that insert frames directly
   *  must first `substrate.sessions.ensure(gopId, ...)` for each new gop. */
  sessions: SessionStore;
  search: HybridSearch;
  embedder: Embedder;
  /** Release the DB handle. Safe to call multiple times. */
  close(): void;
}

/**
 * Build a fresh substrate. Caller owns lifecycle — MUST call `close()` when
 * done (typically in a `try/finally`).
 */
export function createSubstrate(opts: SubstrateOptions = {}): Substrate {
  const dbPath = opts.dbPath ?? ':memory:';
  const embedder = opts.embedder ?? createOllamaEmbedder();
  const db = new MindDB(dbPath);
  const frames = new FrameStore(db);
  const sessions = new SessionStore(db);
  const search = new HybridSearch(db, embedder);

  let closed = false;
  return {
    db,
    frames,
    sessions,
    search,
    embedder,
    close(): void {
      if (closed) return;
      closed = true;
      db.close();
    },
  };
}
