/**
 * Install Audit Store — persistent audit trail for capability install events.
 *
 * Records every install-relevant action (proposed, approved, installed, rejected,
 * failed) so there is a verifiable history of what was installed, when, why,
 * and by whom.
 *
 * Follows the same pattern as ImprovementSignalStore — operates on the .mind DB.
 */

import type { MindDB } from '@waggle/hive-mind-core';
import {
  sqlInList, RISK_LEVELS, APPROVAL_CLASSES, AUDIT_ACTIONS,
  AUDIT_CAPABILITY_TYPES, AUDIT_INITIATORS, TRUST_SOURCES,
} from '@waggle/shared';

// ── Types ──────────────────────────────────────────────────────────────

// P7/D15 A2b: the audit vocabulary is now canonical in @waggle/shared. The
// Audit*-prefixed names are kept as aliases (re-exported) so every downstream
// `import { AuditAction, ... } from '@waggle/core'` keeps working unchanged.
// All six sets were already byte-identical to the shared ones (incl. P5/D4's
// 'uninstalled'), so this is a pure structural re-point — no value change.
export type {
  AuditAction, AuditCapabilityType, AuditInitiator,
  RiskLevel as AuditRiskLevel, ApprovalClass as AuditApprovalClass, TrustSource as AuditTrustSource,
} from '@waggle/shared';
import type {
  AuditAction, AuditCapabilityType, AuditInitiator,
  RiskLevel as AuditRiskLevel, ApprovalClass as AuditApprovalClass, TrustSource as AuditTrustSource,
} from '@waggle/shared';

export interface InstallAuditEntry {
  id: number;
  timestamp: string;
  capability_name: string;
  capability_type: AuditCapabilityType;
  source: string;
  version: string | null;
  risk_level: AuditRiskLevel;
  trust_source: AuditTrustSource;
  approval_class: AuditApprovalClass;
  action: AuditAction;
  initiator: AuditInitiator;
  detail: string;
}

export interface RecordAuditInput {
  capabilityName: string;
  capabilityType: AuditCapabilityType;
  source: string;
  version?: string | null;
  riskLevel: AuditRiskLevel;
  trustSource: AuditTrustSource;
  approvalClass: AuditApprovalClass;
  action: AuditAction;
  initiator: AuditInitiator;
  detail?: string;
}

// ── Table DDL ──────────────────────────────────────────────────────────

// P7/D15 A3: the CHECK lists are generated from the canonical @waggle/shared
// arrays via sqlInList, so the SQLite constraint and the TS union can no longer
// drift (divergence #14 — the old comment admitted "drift silently crashes
// record()"). The mirror DDL in hive-mind-core/src/mind/schema.ts stays a
// standalone literal (it's the OSS substrate, §7.5) but is locked to these same
// canonical lists by the parity test in install-audit-check-parity.test.ts.
// P7/D15 #15: trust_source now also carries a CHECK (was unconstrained at the DB
// while the TS type claimed a closed set). Every historical value came from the
// typed AuditTrustSource (the pre-security-gate 6-set ⊂ the current 7-set), so
// the rebuild migration's row copy can never violate it.
export const INSTALL_AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS install_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  capability_name TEXT NOT NULL,
  capability_type TEXT NOT NULL CHECK (capability_type IN (${sqlInList(AUDIT_CAPABILITY_TYPES)})),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN (${sqlInList(RISK_LEVELS)})),
  trust_source TEXT NOT NULL CHECK (trust_source IN (${sqlInList(TRUST_SOURCES)})),
  approval_class TEXT NOT NULL CHECK (approval_class IN (${sqlInList(APPROVAL_CLASSES)})),
  action TEXT NOT NULL CHECK (action IN (${sqlInList(AUDIT_ACTIONS)})),
  initiator TEXT NOT NULL CHECK (initiator IN (${sqlInList(AUDIT_INITIATORS)})),
  detail TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_audit_capability ON install_audit (capability_name, action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON install_audit (timestamp DESC);
`;

// ── Store ──────────────────────────────────────────────────────────────

export class InstallAuditStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    this.ensureTable();
  }

  private ensureTable(): void {
    const raw = this.db.getDatabase();
    const existing = raw.prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='install_audit'",
    ).get() as { sql: string } | undefined;
    if (!existing) {
      raw.exec(INSTALL_AUDIT_TABLE_SQL);
      return;
    }
    // P5/D4 migration: pre-'uninstalled' installs carry a narrower action CHECK
    // baked into the table DDL. SQLite can't ALTER a CHECK, so rebuild the table
    // when the stored DDL lacks the new value. Idempotent — a no-op once migrated.
    // #15: also rebuild when the stored DDL has no trust_source CHECK (the column
    // was previously unconstrained). "CHECK (trust_source IN" is a safe sentinel —
    // it appears nowhere else in this DDL.
    const needsActionWiden = !existing.sql.includes("'uninstalled'");
    const needsTrustSourceCheck = !existing.sql.includes('CHECK (trust_source IN');
    if (needsActionWiden || needsTrustSourceCheck) {
      this.rebuildForWidenedActionCheck(raw);
    }
  }

  /**
   * Rebuild install_audit with the widened `action` CHECK, preserving all rows.
   * Classic SQLite 12-step table redefinition, wrapped in a transaction so a
   * crash mid-rebuild leaves the original table intact.
   */
  private rebuildForWidenedActionCheck(raw: ReturnType<MindDB['getDatabase']>): void {
    const migrate = raw.transaction(() => {
      raw.exec('ALTER TABLE install_audit RENAME TO install_audit_legacy');
      // SQLite carries indexes along with RENAME (still named idx_audit_*), so
      // INSTALL_AUDIT_TABLE_SQL's CREATE INDEX IF NOT EXISTS would no-op and the
      // DROP below would take the indexes with the legacy table. Drop them first
      // (mirrors hive-mind-core db.ts) so they get recreated on the new table.
      raw.exec('DROP INDEX IF EXISTS idx_audit_capability');
      raw.exec('DROP INDEX IF EXISTS idx_audit_timestamp');
      raw.exec(INSTALL_AUDIT_TABLE_SQL);
      raw.exec(`
        INSERT INTO install_audit (
          id, timestamp, capability_name, capability_type, source, version,
          risk_level, trust_source, approval_class, action, initiator, detail
        )
        SELECT id, timestamp, capability_name, capability_type, source, version,
               risk_level, trust_source, approval_class, action, initiator, detail
        FROM install_audit_legacy
      `);
      raw.exec('DROP TABLE install_audit_legacy');
    });
    migrate();
  }

  /** Record an install audit event. */
  record(input: RecordAuditInput): InstallAuditEntry {
    const raw = this.db.getDatabase();

    raw.prepare(`
      INSERT INTO install_audit (
        capability_name, capability_type, source, version,
        risk_level, trust_source, approval_class, action, initiator, detail
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.capabilityName,
      input.capabilityType,
      input.source,
      input.version ?? null,
      input.riskLevel,
      input.trustSource,
      input.approvalClass,
      input.action,
      input.initiator,
      input.detail ?? '',
    );

    // Return the inserted row
    return raw.prepare(
      'SELECT * FROM install_audit ORDER BY id DESC LIMIT 1',
    ).get() as InstallAuditEntry;
  }

  /** Get audit history for a specific capability. */
  getByCapability(name: string): InstallAuditEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM install_audit WHERE capability_name = ? ORDER BY id DESC',
    ).all(name) as InstallAuditEntry[];
  }

  /** Get audit history filtered by action type. */
  getByAction(action: AuditAction): InstallAuditEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM install_audit WHERE action = ? ORDER BY id DESC',
    ).all(action) as InstallAuditEntry[];
  }

  /** Get recent audit entries (most recent first). */
  getRecent(limit: number = 20): InstallAuditEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM install_audit ORDER BY id DESC LIMIT ?',
    ).all(limit) as InstallAuditEntry[];
  }

  /** Get recent entries for one capability type (most recent first) — backs
   *  the shared Extend-layer audit read (GET /api/extend/audit?type=, C18). */
  getRecentByType(type: AuditCapabilityType, limit: number = 20): InstallAuditEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM install_audit WHERE capability_type = ? ORDER BY id DESC LIMIT ?',
    ).all(type, limit) as InstallAuditEntry[];
  }

  /** Get all entries (for testing). */
  getAll(): InstallAuditEntry[] {
    return this.db.getDatabase().prepare(
      'SELECT * FROM install_audit ORDER BY id ASC',
    ).all() as InstallAuditEntry[];
  }

  /** Clear all entries (for testing). */
  clear(): void {
    this.db.getDatabase().prepare('DELETE FROM install_audit').run();
  }
}
