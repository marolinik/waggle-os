/**
 * Install Audit Store — persistent audit trail for capability install events.
 *
 * Records every install-relevant action (proposed, approved, installed, rejected,
 * failed) so there is a verifiable history of what was installed, when, why,
 * and by whom.
 *
 * Follows the same pattern as ImprovementSignalStore — operates on the .mind DB.
 */

import type { MindDB } from './mind/db.js';

// ── Types ──────────────────────────────────────────────────────────────

export type AuditAction = 'proposed' | 'approved' | 'installed' | 'rejected' | 'failed' | 'blocked';
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
  capability_type TEXT NOT NULL CHECK (capability_type IN ('native', 'skill', 'plugin', 'mcp')),
  source TEXT NOT NULL,
  version TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  trust_source TEXT NOT NULL,
  approval_class TEXT NOT NULL CHECK (approval_class IN ('standard', 'elevated', 'critical')),
  action TEXT NOT NULL CHECK (action IN ('proposed', 'approved', 'installed', 'rejected', 'failed')),
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
    const exists = raw.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='install_audit'",
    ).get();
    if (!exists) {
      raw.exec(INSTALL_AUDIT_TABLE_SQL);
    }
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
