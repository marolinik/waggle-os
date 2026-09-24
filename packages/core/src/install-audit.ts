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
import { ensureGovernanceSchema } from './governance/ensure-schema.js';

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

// The DDL and its migrations live in the governance context (D-1); the
// constant is re-exported so `import { INSTALL_AUDIT_TABLE_SQL } from
// '@waggle/core'` keeps working.
export { INSTALL_AUDIT_TABLE_SQL } from './governance/schema.js';

// ── Store ──────────────────────────────────────────────────────────────

export class InstallAuditStore {
  private db: MindDB;

  constructor(db: MindDB) {
    this.db = db;
    ensureGovernanceSchema(db);
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
