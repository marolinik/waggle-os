import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { SCHEMA_SQL, VEC_TABLE_SQL, SCHEMA_VERSION } from './schema.js';

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
    // FIX-3 (2026-05-17): install_audit's capability_type / approval_class /
    // action CHECK lists drifted behind their TS type unions
    // (connector/marketplace/blocked). Because the CREATE below is
    // IF NOT EXISTS, an existing install_audit keeps its stale CHECK and
    // auditStore.record() crashes the moment acquire_capability proposes a
    // marketplace/connector capability. Rename the stale table aside so the
    // corrected SCHEMA_SQL DDL (single source of truth) recreates it; rows
    // are copied back below. Idempotent: keyed on whether the stored DDL
    // already lists 'marketplace'. A leftover __mig_old from a crashed prior
    // run is handled too (rename is skipped, copy/drop still completes).
    const auditTableSql = (this.db.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='install_audit'"
    ).get() as { sql: string } | undefined)?.sql;
    const auditNeedsRebuild = auditTableSql !== undefined && !auditTableSql.includes("'marketplace'");
    if (auditNeedsRebuild) {
      this.db.prepare('DROP TABLE IF EXISTS install_audit__mig_old').run();
      this.db.prepare('ALTER TABLE install_audit RENAME TO install_audit__mig_old').run();
      this.db.prepare('DROP INDEX IF EXISTS idx_audit_capability').run();
      this.db.prepare('DROP INDEX IF EXISTS idx_audit_timestamp').run();
    }
    this.db.exec(SCHEMA_SQL);

    // FIX-3 cont.: SCHEMA_SQL above just recreated install_audit with the
    // widened CHECK. Copy the legacy rows back and drop the stale table.
    if (auditNeedsRebuild) {
      this.db.prepare(
        `INSERT INTO install_audit
           (id, timestamp, capability_name, capability_type, source, version,
            risk_level, trust_source, approval_class, action, initiator, detail)
         SELECT id, timestamp, capability_name, capability_type, source, version,
                risk_level, trust_source, approval_class, action, initiator, detail
         FROM install_audit__mig_old`
      ).run();
      this.db.prepare('DROP TABLE install_audit__mig_old').run();
    }

    // W2.1: Add 'source' column to memory_frames (provenance tracking)
    const hasSourceCol = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM pragma_table_info('memory_frames') WHERE name='source'"
    ).get() as { cnt: number };
    if (hasSourceCol.cnt === 0) {
      this.db.exec(
        "ALTER TABLE memory_frames ADD COLUMN source TEXT NOT NULL DEFAULT 'user_stated'"
      );
    }

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

  getDatabase(): DatabaseType {
    return this.db;
  }

  close(): void {
    this.db.close();
  }
}
