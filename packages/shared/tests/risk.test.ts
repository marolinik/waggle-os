import { describe, it, expect } from 'vitest';
import {
  RISK_LEVELS, APPROVAL_CLASSES, TRUST_SOURCES, ASSESSMENT_MODES,
  AUDIT_ACTIONS, AUDIT_CAPABILITY_TYPES, AUDIT_INITIATORS,
  riskRank, riskAtLeast, sqlInList,
} from '../src/risk.js';

describe('canonical risk taxonomy (A1) — widest-set parity', () => {
  it('RiskLevel adopts the audit set (adds critical)', () => {
    expect([...RISK_LEVELS]).toEqual(['low', 'medium', 'high', 'critical']);
  });
  it('ApprovalClass adopts the audit set (adds blocked)', () => {
    expect([...APPROVAL_CLASSES]).toEqual(['standard', 'elevated', 'critical', 'blocked']);
  });
  it('TrustSource is the 7-value set incl. security-gate', () => {
    expect([...TRUST_SOURCES]).toEqual([
      'builtin', 'starter_pack', 'local_user', 'third_party_verified',
      'third_party_unverified', 'unknown', 'security-gate',
    ]);
  });
  it('AssessmentMode is declared/heuristic/mixed', () => {
    expect([...ASSESSMENT_MODES]).toEqual(['declared', 'heuristic', 'mixed']);
  });
  it('AuditAction includes uninstalled (P5/D4)', () => {
    expect([...AUDIT_ACTIONS]).toEqual([
      'proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked', 'uninstalled',
    ]);
  });
  it('AuditCapabilityType + AuditInitiator match the store', () => {
    expect([...AUDIT_CAPABILITY_TYPES]).toEqual(['native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace']);
    expect([...AUDIT_INITIATORS]).toEqual(['agent', 'user', 'system']);
  });
});

describe('risk ordering helpers', () => {
  it('riskRank orders ascending, critical highest', () => {
    expect(riskRank('low')).toBe(0);
    expect(riskRank('critical')).toBe(3);
    expect(riskRank('critical')).toBeGreaterThan(riskRank('low'));
  });
  it('riskAtLeast compares on the canonical scale (critical >= low, not below)', () => {
    expect(riskAtLeast('critical', 'low')).toBe(true);
    expect(riskAtLeast('low', 'high')).toBe(false);
    expect(riskAtLeast('high', 'high')).toBe(true);
  });
});

describe('sqlInList — CHECK-constraint single source', () => {
  it('quotes and comma-joins for a SQLite IN clause', () => {
    expect(sqlInList(AUDIT_ACTIONS)).toBe(
      "'proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked', 'uninstalled'",
    );
  });
});
