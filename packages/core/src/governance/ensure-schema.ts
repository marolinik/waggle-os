/**
 * Applies the governance DDL and its migrations to a mind (D-1).
 *
 * Idempotent, and cheap once a mind is current: a few `sqlite_master` reads.
 * The governance stores call it from their constructors, so any mind a store
 * touches carries the tables; nothing else writes them.
 */
import type { MindDB } from '@waggle/hive-mind-core';
import {
  AI_INTERACTIONS_NO_DELETE_TRIGGER_SQL,
  AI_INTERACTIONS_NO_UPDATE_SENTINEL,
  AI_INTERACTIONS_NO_UPDATE_TRIGGER_SQL,
  AI_INTERACTIONS_TABLE_SQL,
  INSTALL_AUDIT_CHECK_LISTS,
  INSTALL_AUDIT_COLUMNS,
  INSTALL_AUDIT_TABLE_SQL,
} from './schema.js';

type RawDatabase = ReturnType<MindDB['getDatabase']>;

/** Where a pre-transactional rebuild parked the audit rows before it crashed. */
const STRANDED_AUDIT_TABLE = 'install_audit__mig_old';

export function ensureGovernanceSchema(db: MindDB): void {
  const raw = db.getDatabase();
  recoverStrandedInstallAudit(raw);
  ensureInstallAudit(raw);
  ensureAiInteractions(raw);
}

function storedTableSql(raw: RawDatabase, name: string): string | undefined {
  return (raw.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?")
    .get(name) as { sql: string } | undefined)?.sql;
}

/**
 * A rebuild from before the rebuild became one transaction could die midway,
 * leaving every audit row in `install_audit__mig_old` while `install_audit` is
 * missing or recreated empty. The next rebuild would drop them for good, so
 * they are restored before anything else touches the table.
 */
function recoverStrandedInstallAudit(raw: RawDatabase): void {
  if (storedTableSql(raw, STRANDED_AUDIT_TABLE) === undefined) return;
  raw.transaction(() => {
    if (storedTableSql(raw, 'install_audit') === undefined) {
      // Died between RENAME and recreate: rename back; ensureInstallAudit
      // then rebuilds the restored table if its CHECK lists are stale.
      raw.exec(`ALTER TABLE ${STRANDED_AUDIT_TABLE} RENAME TO install_audit`);
      return;
    }
    // Died between recreate and copy-back: copy the rows home if nothing new
    // was written since, then retire the stale table.
    const { cnt } = raw.prepare('SELECT COUNT(*) AS cnt FROM install_audit').get() as { cnt: number };
    if (cnt === 0) {
      raw.exec(`INSERT INTO install_audit (${INSTALL_AUDIT_COLUMNS})
        SELECT ${INSTALL_AUDIT_COLUMNS} FROM ${STRANDED_AUDIT_TABLE}`);
    }
    raw.exec(`DROP TABLE ${STRANDED_AUDIT_TABLE}`);
  })();
}

/**
 * Creates `install_audit`, or rebuilds it when its stored CHECK lists lag the
 * canonical ones: SQLite cannot ALTER a CHECK, and a stale list makes
 * `record()` throw on a newer value. The rebuild keeps every row and id and
 * runs in one transaction, so a crash rolls back instead of losing the trail.
 */
function ensureInstallAudit(raw: RawDatabase): void {
  const stored = storedTableSql(raw, 'install_audit');
  if (stored === undefined) {
    raw.exec(INSTALL_AUDIT_TABLE_SQL);
    return;
  }
  if (INSTALL_AUDIT_CHECK_LISTS.every((list) => stored.includes(list))) {
    raw.exec(INSTALL_AUDIT_TABLE_SQL); // indexes, if a copy lost them
    return;
  }
  raw.transaction(() => {
    raw.exec(`ALTER TABLE install_audit RENAME TO ${STRANDED_AUDIT_TABLE}`);
    // RENAME carries the indexes along under their old names, so the CREATE
    // INDEX IF NOT EXISTS below would no-op and the DROP would take them.
    raw.exec('DROP INDEX IF EXISTS idx_audit_capability');
    raw.exec('DROP INDEX IF EXISTS idx_audit_timestamp');
    raw.exec(INSTALL_AUDIT_TABLE_SQL);
    raw.exec(`INSERT INTO install_audit (${INSTALL_AUDIT_COLUMNS})
      SELECT ${INSTALL_AUDIT_COLUMNS} FROM ${STRANDED_AUDIT_TABLE}`);
    raw.exec(`DROP TABLE ${STRANDED_AUDIT_TABLE}`);
  })();
}

function hasColumn(raw: RawDatabase, table: string, column: string): boolean {
  return raw.prepare('SELECT 1 FROM pragma_table_info(?) WHERE name = ?').get(table, column) !== undefined;
}

function ensureAiInteractions(raw: RawDatabase): void {
  raw.exec(AI_INTERACTIONS_TABLE_SQL);
  // Databases from before 2026-04-15 recorded token counts only, and from
  // before D-1 had no pseudonymization marker.
  for (const column of ['input_text', 'output_text', 'pseudonymized_at']) {
    if (!hasColumn(raw, 'ai_interactions', column)) {
      raw.exec(`ALTER TABLE ai_interactions ADD COLUMN ${column} TEXT`);
    }
  }
  raw.exec(AI_INTERACTIONS_NO_DELETE_TRIGGER_SQL);
  // CREATE TRIGGER IF NOT EXISTS cannot replace the older absolute trigger, so
  // it is swapped by DROP + CREATE in one transaction: a crash or a concurrent
  // writer must never see the table with no update guard at all.
  const liveNoUpdate = (raw.prepare(
    "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='ai_interactions_no_update'",
  ).get() as { sql: string } | undefined)?.sql;
  if (!liveNoUpdate?.includes(AI_INTERACTIONS_NO_UPDATE_SENTINEL)) {
    raw.transaction(() => {
      raw.exec('DROP TRIGGER IF EXISTS ai_interactions_no_update');
      raw.exec(AI_INTERACTIONS_NO_UPDATE_TRIGGER_SQL);
    })();
  }
}
