/**
 * Canonical risk / approval / audit taxonomy (P7/D15 Track A, binding A1).
 *
 * Before this module the vocabulary was redeclared in five places that had
 * drifted apart — trust-model.ts (RiskLevel without 'critical'), confirmation.ts
 * (a hardcoded ApprovalClass mapper), install-audit.ts (the widest set, plus a
 * hand-duplicated SQLite CHECK in hive-mind-core/schema.ts), and
 * team-capability-governance.ts (a 4th set keyed on 'none'). A producer narrower
 * than its store meant a `critical` risk could only ever be hand-written, and the
 * FE modal couldn't represent the `critical`/`blocked` levels the audit recorded.
 *
 * This is the SINGLE SOURCE. Each enum is the WIDEST of the prior sets so no
 * producer/store mismatch remains. Every other module imports from here.
 *
 * Two axes, one rule:
 *   - `RiskLevel`     = how dangerous the action is (severity → display colour).
 *   - `ApprovalClass` = how strongly to gate it (standard < elevated < critical < blocked).
 * They are NOT the same axis; surfaces that collapsed them must keep them distinct.
 *
 * Each type is derived from a runtime `const` array so the array can also drive
 * the SQLite CHECK constraints (A3) and parity tests, with zero chance of the
 * type and the value list drifting.
 */

/** Severity of an action. Widest prior set = install-audit's (adds 'critical'). */
export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

/** Gating strength. Widest prior set = install-audit's (adds 'blocked'). */
export const APPROVAL_CLASSES = ['standard', 'elevated', 'critical', 'blocked'] as const;
export type ApprovalClass = (typeof APPROVAL_CLASSES)[number];

/** Provenance of a capability. Widest prior set = install-audit's (adds 'security-gate'). */
export const TRUST_SOURCES = [
  'builtin', // First-party, ships with Waggle
  'starter_pack', // Curated starter skills
  'local_user', // User-created via create_skill
  'third_party_verified', // Verified registry
  'third_party_unverified', // Unknown registry source
  'unknown', // No provenance information
  'security-gate', // Set by the SecurityGate scan (blocked/flagged)
] as const;
export type TrustSource = (typeof TRUST_SOURCES)[number];

/** How a risk assessment was derived. */
export const ASSESSMENT_MODES = ['declared', 'heuristic', 'mixed'] as const;
export type AssessmentMode = (typeof ASSESSMENT_MODES)[number];

/** Lifecycle action recorded in install_audit. Includes 'uninstalled' (P5/D4). */
export const AUDIT_ACTIONS = [
  'proposed', 'approved', 'installed', 'rejected', 'failed', 'blocked', 'uninstalled',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/** Kind of capability an audit row concerns. */
export const AUDIT_CAPABILITY_TYPES = [
  'native', 'skill', 'plugin', 'mcp', 'connector', 'marketplace',
] as const;
export type AuditCapabilityType = (typeof AUDIT_CAPABILITY_TYPES)[number];

/** Who initiated an audited action. */
export const AUDIT_INITIATORS = ['agent', 'user', 'system'] as const;
export type AuditInitiator = (typeof AUDIT_INITIATORS)[number];

/** Ascending severity order — index = rank. Used to compare/sort risk levels so a
 *  `critical` always outranks `low` (the team-governance bug was a `?? 0` that
 *  sorted `critical` BELOW `low`). */
export function riskRank(level: RiskLevel): number {
  return RISK_LEVELS.indexOf(level);
}

/** True when `level` meets or exceeds `threshold` on the canonical severity scale. */
export function riskAtLeast(level: RiskLevel, threshold: RiskLevel): boolean {
  return riskRank(level) >= riskRank(threshold);
}

/** Build a SQLite `CHECK (col IN (...))` clause body from a const value list, so
 *  the DDL constraint and the TS union can never drift (A3 single-sources both
 *  install-audit.ts and hive-mind-core/schema.ts from these arrays). */
export function sqlInList(values: readonly string[]): string {
  return values.map((v) => `'${v}'`).join(', ');
}
