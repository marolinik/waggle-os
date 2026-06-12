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

// ── Types ──────────────────────────────────────────────────────────────

// 'uninstalled' added in P5/D4 — skill/capability removal is now auditable
// (previously no removal of any capability could be recorded). Widening the
// CHECK is additive; existing rows all satisfy the wider constraint.
export type AuditAction = 'proposed' | 'approved' | 'installed' | 'rejected' | 'failed' | 'blocked' | 'uninstalled';
export type AuditRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type AuditTrustSource =
  | 'builtin' | 'starter_pack' | 'local_user'
  | 'third_party_verified' | 'third_party_unverified' | 'unknown' | 'security-gate';
export type AuditApprovalClass = 'standard' | 'elevated' | 'critical' | 'blocked';
export type AuditInitiator = 'agent' | 'user' | 'system';
export type AuditCapabilityType = 'native' | 'skill' | 'plugin' | 'mcp' | 'connector' | 'marketplace';

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

export const INSTALL_AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS install_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  capability_name TEXT NOT NULL,
  -- CHECK lists MUST stay in sync with AuditCapabilityType / AuditApprovalClass
  -- / AuditAction above (and with hive-mind-core/src/mind/schema.ts, which also
  -- declares this table). Drift here silently crashes auditStore.record().
  capability_type TEXT NOT NULL CHECK (capability_type IN ('native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace')),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  trust_source TEXT NOT NULL,
  approval_class TEXT NOT NULL CHECK (approval_class IN ('standard', 'elevated', 'critical', 'blocked')),
  action TEXT NOT NULL CHECK (action IN ('proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked', 'uninstalled')),
  initiator TEXT NOT NULL CHECK (initiator IN ('agent', 'user', 'system')),
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
    if (!existing.sql.includes("'uninstalled'")) {
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
