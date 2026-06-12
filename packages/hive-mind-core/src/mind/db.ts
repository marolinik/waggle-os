import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import {
  SCHEMA_SQL, VEC_TABLE_SQL, CHUNKS_VEC_TABLE_SQL, SCHEMA_VERSION,
  vecTableSqlForDim, chunksVecTableSqlForDim,
} from './schema.js';
import { hashFrameContent } from './content-hash.js';

// Reverse-ported from OSS hive-mind (oss-drift triage R7, 2026-06-11).
/** A persisted embedding fingerprint: which provider/model produced this .mind's
 *  vectors, and at what dimension. Recorded in `meta` on the first vector use. */
export interface EmbeddingFingerprint {
  provider: string;
  model: string;
  dim: number;
}

export type FingerprintCheck =
  | { status: 'recorded' }
  | { status: 'match' }
  | { status: 'model-changed'; storedModel: string; storedProvider: string };

/** Thrown when the active embedder's dimension differs from the dimension this
 *  .mind's vectors were written at. Mixing dims returns noise and corrupts the
 *  index, so we refuse loudly and point at the re-embed remediation. */
export class EmbeddingDimMismatchError extends Error {
  constructor(
    readonly storedDim: number,
    readonly runtimeDim: number,
  ) {
    super(
      `Embedding dimension mismatch: this .mind stores ${storedDim}-dim vectors but the active ` +
        `embedder produces ${runtimeDim}-dim vectors. Vector search would return noise and writes ` +
        `would corrupt the index. Call MindDB.recreateVecTables(${runtimeDim}) and re-embed all ` +
        `frames at the new dimension, or switch back to a ${storedDim}-dim model.`,
    );
    this.name = 'EmbeddingDimMismatchError';
  }
}

export class MindDB {
  private db: DatabaseType;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    // Load sqlite-vec extension — support bundled path override for desktop builds
    const vecPath = process.env.WAGGLE_SQLITE_VEC_PATH;
    if (vecPath) {
      this.db.loadExtension(vecPath);
    } else {
      sqliteVec.load(this.db);
    }

    this.initSchema();
  }

  private initSchema(): void {
    const existing = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meta'"
    ).get() as { name: string } | undefined;

    if (!existing) {
      this.db.exec(SCHEMA_SQL);
      this.db.exec(VEC_TABLE_SQL);
      this.db.exec(CHUNKS_VEC_TABLE_SQL);
      this.db.prepare(
        "INSERT INTO meta (key, value) VALUES ('schema_version', ?)"
      ).run(SCHEMA_VERSION);
      // 2026-04-15: Track first-run so Art. 19 retention checker can distinguish
      // 'new system, no logs yet' from 'old system, logs pruned'.
      this.db.prepare(
        "INSERT INTO meta (key, value) VALUES ('first_run_at', ?)"
      ).run(new Date().toISOString());
    } else {
      this.runMigrations();
      // Backfill first_run_at for pre-existing DBs. Best-effort: we don't know when
      // they were actually created so we approximate with 'now' — this means retroactive
      // retention checks can't be perfect, but forward-looking checks will be correct
      // within 180 days.
      const hasFirstRun = this.db.prepare(
        "SELECT value FROM meta WHERE key = 'first_run_at'"
      ).get() as { value: string } | undefined;
      if (!hasFirstRun) {
        this.db.prepare(
          "INSERT INTO meta (key, value) VALUES ('first_run_at', ?)"
        ).run(new Date().toISOString());
      }
    }
  }

  /** Read the first-run timestamp for this database (ISO 8601). Returns null if missing. */
  getFirstRunAt(): string | null {
    try {
      const row = this.db.prepare(
        "SELECT value FROM meta WHERE key = 'first_run_at'"
      ).get() as { value: string } | undefined;
      return row?.value ?? null;
    } catch {
      return null;
    }
  }

  /** Run incremental schema migrations for existing .mind databases */
  private runMigrations(): void {
    // 2026-04-16: Ensure all tables from SCHEMA_SQL exist. Old .mind databases
    // may predate tables added during sprint work (ai_interactions, execution_traces,
    // evolution_runs, harvest_sources, procedures, improvement_signals, install_audit).
    // SCHEMA_SQL uses CREATE TABLE/INDEX IF NOT EXISTS throughout, so re-running it
    // is safe and idempotent — it only creates what's missing.
    //
    // CRASH RECOVERY (must run before the rebuild below): a pre-transactional
    // build of the FIX-3/M2 rebuild could die mid-sequence, stranding every
    // audit row in install_audit__mig_old while install_audit is missing or
    // freshly recreated empty — and the next rebuild's DROP would then destroy
    // them permanently. Restore before anything else touches the table.
    const migOldExists = !!this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='install_audit__mig_old'"
    ).get();
    if (migOldExists) {
      const auditExists = !!this.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='install_audit'"
      ).get();
      if (!auditExists) {
        // Crash landed between RENAME and recreate — rename back wholesale;
        // the sentinel check below re-runs the (now transactional) rebuild.
        this.db.prepare('ALTER TABLE install_audit__mig_old RENAME TO install_audit').run();
      } else {
        // Crash landed between recreate and copy-back: copy the stranded rows
        // home if nothing new was written, then retire the stale table.
        const cnt = (this.db.prepare('SELECT COUNT(*) AS cnt FROM install_audit')
          .get() as { cnt: number }).cnt;
        if (cnt === 0) {
          this.db.prepare(
            `INSERT INTO install_audit
               (id, timestamp, capability_name, capability_type, source, version,
                risk_level, trust_source, approval_class, action, initiator, detail)
             SELECT id, timestamp, capability_name, capability_type, source, version,
                    risk_level, trust_source, approval_class, action, initiator, detail
             FROM install_audit__mig_old`
          ).run();
        }
        this.db.prepare('DROP TABLE install_audit__mig_old').run();
      }
    }

    // FIX-3 (2026-05-17): install_audit's capability_type / approval_class /
    // action CHECK lists drifted behind their TS type unions
    // (connector/marketplace/blocked). Because the CREATE below is
    // IF NOT EXISTS, an existing install_audit keeps its stale CHECK and
    // auditStore.record() crashes the moment acquire_capability proposes a
    // marketplace/connector capability. Rename the stale table aside so the
    // corrected SCHEMA_SQL DDL (single source of truth) recreates it; rows
    // are copied back below. Idempotent: keyed on whether the stored DDL
    // already lists 'marketplace'.
    //
    // M2 (UX-Refactor Phase 4, 2026-06-10): risk_level's CHECK drifted the same
    // way — TS AuditRiskLevel gained 'critical' but the DDL allowed only
    // low/medium/high, so marketplace.ts's CRITICAL-block audit write was
    // silently rejected. Same rebuild mechanism, keyed on the widened
    // risk_level list literal ("'low', 'medium', 'high', 'critical'" — note
    // 'critical' alone is NOT a safe sentinel: it already appears in the
    // approval_class CHECK).
    //
    // The whole rename→recreate→copy-back→drop sequence runs in ONE
    // transaction: a process death mid-rebuild rolls back to the pre-rebuild
    // state instead of silently orphaning the audit trail (this is the EU AI
    // Act compliance table — partial loss here is not acceptable).
    const auditTableSql = (this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='install_audit'"
    ).get() as { sql: string } | undefined)?.sql;
    // P5/D4 (2026-06-12): AuditAction gained 'uninstalled' so skill/capability
    // removal is auditable. Same rebuild mechanism, keyed on whether the stored
    // action CHECK already lists 'uninstalled' ('uninstalled' is a safe sentinel —
    // it appears in no other CHECK on this table).
    const auditNeedsRebuild = auditTableSql !== undefined && (
      !auditTableSql.includes("'marketplace'")
      || !auditTableSql.includes("'low', 'medium', 'high', 'critical'")
      || !auditTableSql.includes("'uninstalled'")
    );
    if (auditNeedsRebuild) {
      this.db.transaction(() => {
        this.db.prepare('DROP TABLE IF EXISTS install_audit__mig_old').run();
        this.db.prepare('ALTER TABLE install_audit RENAME TO install_audit__mig_old').run();
        this.db.prepare('DROP INDEX IF EXISTS idx_audit_capability').run();
        this.db.prepare('DROP INDEX IF EXISTS idx_audit_timestamp').run();
        // SCHEMA_SQL recreates install_audit with the widened CHECK (and is
        // idempotent for every other table — see the comment block above).
        this.db.exec(SCHEMA_SQL);
        this.db.prepare(
          `INSERT INTO install_audit
             (id, timestamp, capability_name, capability_type, source, version,
              risk_level, trust_source, approval_class, action, initiator, detail)
           SELECT id, timestamp, capability_name, capability_type, source, version,
                  risk_level, trust_source, approval_class, action, initiator, detail
           FROM install_audit__mig_old`
        ).run();
        this.db.prepare('DROP TABLE install_audit__mig_old').run();
      })();
    } else {
      this.db.exec(SCHEMA_SQL);
    }

    // oss-drift D1 (2026-06-11): chunk-level retrieval. SCHEMA_SQL above creates
    // memory_frame_chunks (IF NOT EXISTS); the vec0 virtual table needs its own
    // idempotent exec because vec tables live outside SCHEMA_SQL (they require
    // the sqlite-vec extension, loaded in the constructor). Databases that
    // predate D1 gain an EMPTY chunk index here — vectorSearchChunks returns
    // null on an empty index, so recall falls back to whole-frame vectors until
    // rechunkAllFrames (or flag-gated indexFrame chunking) populates it.
    this.db.exec(CHUNKS_VEC_TABLE_SQL);

    // W2.1: Add 'source' column to memory_frames (provenance tracking)
    const hasSourceCol = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('memory_frames') WHERE name='source'"
    ).get() as { cnt: number };
    if (hasSourceCol.cnt === 0) {
      this.db.exec(
        "ALTER TABLE memory_frames ADD COLUMN source TEXT NOT NULL DEFAULT 'user_stated'"
      );
    }

    // UX-Refactor Phase 2B: Add 'metadata' column to memory_frames. JSON blob
    // backing the Memory Center (kind/confidence/scope/status/sourceId/tags/
    // evidence/related*; PRD §15.4). Required by the Phase-2 gate ratifications
    // A8 (reversible Archive status) + C33 (persisted 'unreviewed' status) +
    // B2 (heuristic confidence) — all need per-frame state that survives a
    // restart. Idempotent ADD COLUMN, same pattern as 'source' above; existing
    // rows default to '{}'.
    const hasMetadataCol = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('memory_frames') WHERE name='metadata'"
    ).get() as { cnt: number };
    if (hasMetadataCol.cnt === 0) {
      this.db.exec(
        "ALTER TABLE memory_frames ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'"
      );
    }

    // oss-drift D3 (2026-06-11): indexed content_hash for O(1) frame dedup —
    // FrameStore.findDuplicate previously scanned only the last 500 frames
    // (silently missed older duplicates). Hash semantics are MONO's
    // (stripHmPrefix + trim, mind/content-hash.ts), so the backfill must use
    // hashFrameContent, never a SQL-side hash. Idempotent: ADD COLUMN guarded
    // by pragma check; backfill targets only NULL rows (no-op when current).
    const hasContentHashCol = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('memory_frames') WHERE name='content_hash'"
    ).get() as { cnt: number };
    if (hasContentHashCol.cnt === 0) {
      this.db.exec('ALTER TABLE memory_frames ADD COLUMN content_hash TEXT');
    }
    this.db.exec(
      'CREATE INDEX IF NOT EXISTS idx_frames_content_hash ON memory_frames (content_hash)'
    );
    this.backfillContentHash();

    // 2026-04-15: EU AI Act Art. 12.1(a) — record inputs and outputs, not just
    // token counts (review Critical #3 from cowork/Code-Review_Compliance).
    const hasInputText = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('ai_interactions') WHERE name='input_text'"
    ).get() as { cnt: number };
    if (hasInputText.cnt === 0) {
      this.db.exec("ALTER TABLE ai_interactions ADD COLUMN input_text TEXT");
    }
    const hasOutputText = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('ai_interactions') WHERE name='output_text'"
    ).get() as { cnt: number };
    if (hasOutputText.cnt === 0) {
      this.db.exec("ALTER TABLE ai_interactions ADD COLUMN output_text TEXT");
    }

    // 2026-04-15: Append-only triggers for audit log (review Critical #1). Idempotent.
    this.db.exec(
      "CREATE TRIGGER IF NOT EXISTS ai_interactions_no_delete BEFORE DELETE ON ai_interactions BEGIN SELECT RAISE(ABORT, 'ai_interactions is append-only (EU AI Act Art. 12 audit log)'); END"
    );
    this.db.exec(
      "CREATE TRIGGER IF NOT EXISTS ai_interactions_no_update BEFORE UPDATE ON ai_interactions BEGIN SELECT RAISE(ABORT, 'ai_interactions is append-only (EU AI Act Art. 12 audit log)'); END"
    );
  }

  /** Backfill memory_frames.content_hash for rows inserted before the column
   *  existed (oss-drift D3). Transactional; only NULL rows touched. */
  private backfillContentHash(): void {
    const rows = this.db
      .prepare('SELECT id, content FROM memory_frames WHERE content_hash IS NULL')
      .all() as { id: number; content: string }[];
    if (rows.length === 0) return;
    const update = this.db.prepare('UPDATE memory_frames SET content_hash = ? WHERE id = ?');
    const tx = this.db.transaction((items: { id: number; content: string }[]) => {
      for (const r of items) update.run(hashFrameContent(r.content), r.id);
    });
    tx(rows);
  }

  // Reverse-ported from OSS hive-mind (oss-drift triage R7, 2026-06-11).
  /** Read a single `meta` value, or null if absent. */
  private getMeta(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  /** Upsert a single `meta` key/value (meta.key is the PRIMARY KEY). */
  private setMeta(key: string, value: string): void {
    this.db
      .prepare(
        'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
      )
      .run(key, value);
  }

  /**
   * Guard this .mind's embedding fingerprint. Call before the first vector
   * write/read of a session (HybridSearch is the natural seam — it holds both
   * the db and the embedder). Returns the check result; throws only on a hard
   * dimension mismatch:
   *   - no fingerprint yet → record {provider, model, dim}, return 'recorded'
   *   - same dim + same model → 'match' (no-op)
   *   - same dim, different model/provider → update + 'model-changed' (caller
   *     should warn: vectors stay numerically valid but cross-model comparison
   *     is semantically degraded)
   *   - different dim → throw EmbeddingDimMismatchError (only safe path is re-embed)
   */
  ensureEmbeddingFingerprint(fp: EmbeddingFingerprint): FingerprintCheck {
    const storedDimRaw = this.getMeta('embedding_dim');
    if (storedDimRaw === null) {
      this.setMeta('embedding_provider', fp.provider);
      this.setMeta('embedding_model', fp.model);
      this.setMeta('embedding_dim', String(fp.dim));
      return { status: 'recorded' };
    }
    const storedDim = Number(storedDimRaw);
    if (storedDim !== fp.dim) {
      throw new EmbeddingDimMismatchError(storedDim, fp.dim);
    }
    const storedModel = this.getMeta('embedding_model') ?? '';
    const storedProvider = this.getMeta('embedding_provider') ?? '';
    if (storedModel !== fp.model || storedProvider !== fp.provider) {
      this.setMeta('embedding_provider', fp.provider);
      this.setMeta('embedding_model', fp.model);
      return { status: 'model-changed', storedModel, storedProvider };
    }
    return { status: 'match' };
  }

  /** Force-write the embedding fingerprint. Used after a re-embed so the guard
   *  matches the embedder that produced the new vectors. */
  setEmbeddingFingerprint(fp: EmbeddingFingerprint): void {
    this.setMeta('embedding_provider', fp.provider);
    this.setMeta('embedding_model', fp.model);
    this.setMeta('embedding_dim', String(fp.dim));
  }

  /** Read the recorded embedding fingerprint, or null if none recorded yet. */
  getEmbeddingFingerprint(): EmbeddingFingerprint | null {
    const dimRaw = this.getMeta('embedding_dim');
    if (dimRaw === null) return null;
    return {
      provider: this.getMeta('embedding_provider') ?? 'unknown',
      model: this.getMeta('embedding_model') ?? 'unknown',
      dim: Number(dimRaw),
    };
  }

  /**
   * DROP + CREATE both vec tables (memory_frames_vec + memory_frame_chunks_vec)
   * at `dim` (vec0 columns can't be ALTERed) and update the stored dim.
   * DESTRUCTIVE — existing vectors are discarded; the caller re-embeds
   * afterward (e.g. reconcileVecIndex over all frames + rechunkAllFrames for
   * chunks). This is the remediation for an EmbeddingDimMismatchError.
   *
   * memory_frame_chunks CONTENT rows deliberately survive (OSS behavior):
   * they're derived text, not vectors — re-deriving them is rechunkAllFrames'
   * job, and an empty chunks_vec makes vectorSearchChunks return no rows so
   * stale chunk rows are inert until re-embedded.
   */
  recreateVecTables(dim: number): void {
    const d = Math.trunc(dim);
    const tx = this.db.transaction(() => {
      this.db.exec(
        'DROP TABLE IF EXISTS memory_frames_vec; DROP TABLE IF EXISTS memory_frame_chunks_vec;'
      );
      this.db.exec(vecTableSqlForDim(d));
      this.db.exec(chunksVecTableSqlForDim(d));
      this.setMeta('embedding_dim', String(d));
    });
    tx();
  }

  getDatabase(): DatabaseType {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
