/**
 * Trust Model — risk classification, trust source resolution, and permission
 * summarization for installable capabilities.
 *
 * Design principles:
 * - Source trust and execution risk are orthogonal. A local_user skill that
 *   shells out to `rm -rf` is high-risk regardless of provenance.
 * - Content-based risk detection is heuristic, not authoritative. The
 *   `assessmentMode` field makes this explicit.
 * - Output is structured enough for runtime and clean enough for UI/chat.
 */

import type { CapabilitySourceType } from './capability-acquisition.js';

// ── Types ──────────────────────────────────────────────────────────────

// P7/D15 A2: the risk vocabulary is now canonical in @waggle/shared. Re-exported
// here so the `@waggle/agent` import path keeps working for existing consumers.
// RiskLevel gains 'critical', ApprovalClass gains 'blocked', TrustSource gains
// 'security-gate' — see packages/shared/src/risk.ts.
export type { RiskLevel, TrustSource, ApprovalClass, AssessmentMode } from '@waggle/shared';
import type { RiskLevel, TrustSource, ApprovalClass, AssessmentMode } from '@waggle/shared';

export type RiskFactor =
  | 'local_code_execution'
  | 'filesystem_access'
  | 'network_access'
  | 'external_service_access'
  | 'secret_access'
  | 'browser_automation'
  | 'unknown_source'
  | 'missing_metadata'
  | 'unverified_publisher';

export interface PermissionSummary {
  fileSystem: boolean;
  network: boolean;
  codeExecution: boolean;
  externalServices: boolean;
  secrets: boolean;
  browserAutomation: boolean;
}

export interface TrustAssessment {
  riskLevel: RiskLevel;
  trustSource: TrustSource;
  permissions: PermissionSummary;
  approvalClass: ApprovalClass;
  assessmentMode: AssessmentMode;
  explanation: string;
  factors: RiskFactor[];
}

// ── Trust source resolution ────────────────────────────────────────────

/**
 * Resolve the trust source from capability type and origin string.
 * Source trust is about provenance, not about what the content does.
 */
export function resolveTrustSource(
  capabilityType: CapabilitySourceType,
  source: string,
): TrustSource {
  if (capabilityType === 'native') return 'builtin';

  switch (source) {
    case 'native-tools': return 'builtin';
    case 'starter-pack': return 'starter_pack';
    case 'installed': return 'local_user'; // User installed or created
    case 'user-created': return 'local_user';
    case 'third-party-verified': return 'third_party_verified';
    case 'third-party': return 'third_party_unverified';
    default: return 'unknown';
  }
}

// ── Permission / impact detection (heuristic) ──────────────────────────

/** Patterns that suggest filesystem access */
const FS_PATTERNS = [
  /\bread_file\b/i, /\bwrite_file\b/i, /\bedit_file\b/i,
  /\bfs\b/, /\bfile\s*system/i, /\breadFileSync\b/, /\bwriteFileSync\b/,
  /\bopen\(/, /\bsave\s+to\s+file/i, /\bsearch_files\b/i,
];

/** Patterns that suggest network access */
const NET_PATTERNS = [
  /\bweb_search\b/i, /\bweb_fetch\b/i, /\bfetch\(/, /\bcurl\b/,
  /\bhttp[s]?:\/\//i, /\bapi\s+call/i, /\brest\s+api/i,
  /\bwebhook/i, /\brequest\(/, /\baxios\b/i,
];

/** Patterns that suggest code execution */
const EXEC_PATTERNS = [
  /\bbash\b/, /\bexec\(/, /\bspawn\(/, /\bchild_process/,
  /\bshell\b/i, /\bterminal\b/i, /\brun\s+command/i,
  /\bexecute\s+script/i, /\bspawn_agent\b/i,
];

/** Patterns that suggest external service interaction */
const EXT_SERVICE_PATTERNS = [
  /\bemail\b/i, /\bslack\b/i, /\bgithub\b/i, /\bjira\b/i,
  /\bsend\s+message/i, /\bpost\s+to\b/i, /\bnotif/i,
  /\bdeploy/i, /\bpublish/i, /\bupload/i,
];

/** Patterns that suggest secret/credential access */
const SECRET_PATTERNS = [
  /\bapi[_-]?key\b/i, /\bsecret\b/i, /\bpassword\b/i,
  /\bcredential/i, /\btoken\b/i, /\bauth\b/i,
  /\benv\b.*\bkey\b/i, /\b\.env\b/i,
];

/** Patterns that suggest browser automation */
const BROWSER_PATTERNS = [
  /\bbrowser\b/i, /\bplaywright\b/i, /\bpuppeteer\b/i,
  /\bselenium\b/i, /\bautomation\b/i, /\bheadless\b/i,
  /\bchrome\b/i, /\bscreenshot\b/i,
];

function testPatterns(content: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(content));
}

/**
 * Analyze capability content to detect permission/impact signals.
 * This is explicitly heuristic — it scans for keyword patterns,
 * not a formal capability declaration.
 */
export function detectPermissions(content: string): PermissionSummary {
  return {
    fileSystem: testPatterns(content, FS_PATTERNS),
    network: testPatterns(content, NET_PATTERNS),
    codeExecution: testPatterns(content, EXEC_PATTERNS),
    externalServices: testPatterns(content, EXT_SERVICE_PATTERNS),
    secrets: testPatterns(content, SECRET_PATTERNS),
    browserAutomation: testPatterns(content, BROWSER_PATTERNS),
  };
}

// ── Risk classification ────────────────────────────────────────────────

/** Base risk points by trust source (provenance risk) */
const SOURCE_RISK_POINTS: Record<TrustSource, number> = {
  builtin: 0,
  starter_pack: 0,
  local_user: 1,
  third_party_verified: 2,
  third_party_unverified: 4,
  unknown: 5,
  // A2: a capability flagged by the SecurityGate is maximally untrusted.
  'security-gate': 5,
};

/** Risk points per permission impact (execution risk) */
const PERMISSION_RISK_POINTS: Record<keyof PermissionSummary, number> = {
  fileSystem: 1,
  network: 1,
  codeExecution: 2,
  externalServices: 1,
  secrets: 2,
  browserAutomation: 1,
};

/** Map permission flags to risk factors */
const PERMISSION_TO_FACTOR: Record<keyof PermissionSummary, RiskFactor> = {
  fileSystem: 'filesystem_access',
  network: 'network_access',
  codeExecution: 'local_code_execution',
  externalServices: 'external_service_access',
  secrets: 'secret_access',
  browserAutomation: 'browser_automation',
};

/**
 * Classify risk level from total risk points.
 * Low: 0-2, Medium: 3-4, High: 5-7, Critical: 8+
 *
 * P7/D15 A2: 'critical' added for the worst items (unknown/unverified source +
 * heavy permissions). Behavior-preserving — nothing that was 'high' drops a
 * tier; only the genuinely most dangerous (8+ points) escalate to 'critical'.
 */
export function classifyRisk(points: number): RiskLevel {
  if (points <= 2) return 'low';
  if (points <= 4) return 'medium';
  if (points <= 7) return 'high';
  return 'critical';
}

/**
 * Derive approval class from risk level.
 * - standard: normal approval gate
 * - elevated: approval + permission summary
 * - critical: approval + full trust context + warning (never auto-pass)
 * - blocked:  refused outright — NOT derived from risk points; only the
 *   SecurityGate refusal path sets it, routed through here (the `blocked` flag)
 *   so 'blocked' is produced in ONE place instead of a hand-written literal.
 *
 * P7/D15 A2 (founder-ratified, behavior-preserving): a 'critical' RISK maps to
 * the 'critical' approval class (same gate 'high' got before — full warning,
 * never auto-pass), NOT to 'blocked'. Nothing is newly refused.
 */
export function deriveApprovalClass(riskLevel: RiskLevel, blocked = false): ApprovalClass {
  if (blocked) return 'blocked';
  switch (riskLevel) {
    case 'low': return 'standard';
    case 'medium': return 'elevated';
    case 'high': return 'critical';
    case 'critical': return 'critical';
  }
}

// ── Risk factor collection ─────────────────────────────────────────────

function collectRiskFactors(
  trustSource: TrustSource,
  permissions: PermissionSummary,
): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // Source-derived factors
  if (trustSource === 'unknown') factors.push('unknown_source');
  if (trustSource === 'third_party_unverified') factors.push('unverified_publisher');

  // Permission-derived factors
  for (const [key, active] of Object.entries(permissions)) {
    if (active) {
      factors.push(PERMISSION_TO_FACTOR[key as keyof PermissionSummary]);
    }
  }

  return factors;
}

// ── Explanation generation ─────────────────────────────────────────────

const TRUST_SOURCE_LABELS: Record<TrustSource, string> = {
  builtin: 'Built-in Waggle capability',
  starter_pack: 'Waggle curated starter pack',
  local_user: 'Locally created or installed',
  third_party_verified: 'Verified third-party source',
  third_party_unverified: 'Unverified third-party source',
  unknown: 'Unknown source',
  'security-gate': 'Flagged by the security scanner',
};

function generateExplanation(
  riskLevel: RiskLevel,
  trustSource: TrustSource,
  permissions: PermissionSummary,
  assessmentMode: AssessmentMode,
): string {
  const sourceLabel = TRUST_SOURCE_LABELS[trustSource];

  const activePerms = Object.entries(permissions)
    .filter(([, v]) => v)
    .map(([k]) => formatPermissionName(k));

  const modeNote = assessmentMode === 'heuristic'
    ? ' (detected heuristically from content)'
    : assessmentMode === 'mixed'
      ? ' (partially declared, partially heuristic)'
      : '';

  if (riskLevel === 'low' && activePerms.length === 0) {
    return `${sourceLabel}. No elevated permissions detected${modeNote}. Instruction-only capability.`;
  }

  if (riskLevel === 'low') {
    return `${sourceLabel}. Minor permissions: ${activePerms.join(', ')}${modeNote}.`;
  }

  if (riskLevel === 'medium') {
    return `${sourceLabel}. Moderate risk — may use: ${activePerms.join(', ')}${modeNote}. Review before approving.`;
  }

  if (riskLevel === 'high') {
    return `${sourceLabel}. Elevated risk — may use: ${activePerms.join(', ')}${modeNote}. Carefully review permissions before approving.`;
  }

  // P7/D15 Track A review #1/#2: 'critical' was added to RiskLevel in A2 but this
  // if-chain fell through to the 'high' ("Elevated risk") string, so a critical
  // capability's prose contradicted the "Critical" RiskBadge on the same card.
  // The exhaustive guard below makes a future RiskLevel widening fail tsc here
  // instead of silently mislabelling.
  if (riskLevel === 'critical') {
    return `${sourceLabel}. Critical risk — may use: ${activePerms.join(', ')}${modeNote}. Do not approve unless you fully trust this source.`;
  }

  return assertNeverRisk(riskLevel);
}

/** Compile-time exhaustiveness guard for RiskLevel branches. */
function assertNeverRisk(level: never): string {
  return `Unknown risk level: ${String(level)}`;
}

function formatPermissionName(key: string): string {
  const labels: Record<string, string> = {
    fileSystem: 'file system',
    network: 'network',
    codeExecution: 'code execution',
    externalServices: 'external services',
    secrets: 'secrets/credentials',
    browserAutomation: 'browser automation',
  };
  return labels[key] ?? key;
}

// ── Assessment mode determination ──────────────────────────────────────

/**
 * Determine how the trust assessment was produced.
 * Currently all content-based detection is heuristic.
 * When declared metadata (e.g., manifest permissions) is available,
 * the mode can be 'declared' or 'mixed'.
 */
function determineAssessmentMode(
  hasDeclaredMetadata: boolean,
  hasContentAnalysis: boolean,
): AssessmentMode {
  if (hasDeclaredMetadata && hasContentAnalysis) return 'mixed';
  if (hasDeclaredMetadata) return 'declared';
  return 'heuristic';
}

// ── Main assessment function ───────────────────────────────────────────

export interface AssessTrustInput {
  capabilityType: CapabilitySourceType;
  source: string;
  content: string;
  /** If the capability has a manifest with declared permissions */
  declaredPermissions?: Partial<PermissionSummary>;
}

/**
 * Assess the trust profile of a capability candidate.
 *
 * Source trust and execution risk are computed independently:
 * - Source trust comes from provenance (builtin, starter_pack, etc.)
 * - Execution risk comes from content analysis (what the skill might do)
 * - A local_user skill is NOT automatically low-risk
 */
export function assessTrust(input: AssessTrustInput): TrustAssessment {
  const { capabilityType, source, content, declaredPermissions } = input;

  // 1. Resolve source trust (orthogonal to execution risk)
  const trustSource = resolveTrustSource(capabilityType, source);

  // 2. Detect permissions from content (heuristic)
  const heuristicPerms = detectPermissions(content);

  // 3. Merge with declared permissions if available
  const permissions: PermissionSummary = declaredPermissions
    ? {
      fileSystem: heuristicPerms.fileSystem || (declaredPermissions.fileSystem ?? false),
      network: heuristicPerms.network || (declaredPermissions.network ?? false),
      codeExecution: heuristicPerms.codeExecution || (declaredPermissions.codeExecution ?? false),
      externalServices: heuristicPerms.externalServices || (declaredPermissions.externalServices ?? false),
      secrets: heuristicPerms.secrets || (declaredPermissions.secrets ?? false),
      browserAutomation: heuristicPerms.browserAutomation || (declaredPermissions.browserAutomation ?? false),
    }
    : heuristicPerms;

  // 4. Determine assessment mode
  const assessmentMode = determineAssessmentMode(
    !!declaredPermissions,
    content.length > 0,
  );

  // 5. Collect risk factors
  const factors = collectRiskFactors(trustSource, permissions);

  // 6. Compute risk points
  let riskPoints = SOURCE_RISK_POINTS[trustSource];
  for (const [key, active] of Object.entries(permissions)) {
    if (active) {
      riskPoints += PERMISSION_RISK_POINTS[key as keyof PermissionSummary];
    }
  }

  // No content to analyze = missing metadata factor
  if (content.length === 0 && trustSource !== 'builtin') {
    factors.push('missing_metadata');
    riskPoints += 1;
  }

  // 7. Classify
  const riskLevel = classifyRisk(riskPoints);
  const approvalClass = deriveApprovalClass(riskLevel);

  // 8. Generate explanation
  const explanation = generateExplanation(riskLevel, trustSource, permissions, assessmentMode);

  return {
    riskLevel,
    trustSource,
    permissions,
    approvalClass,
    assessmentMode,
    explanation,
    factors,
  };
}

// ── Human-readable formatting ──────────────────────────────────────────

const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/**
 * Format a trust assessment as a compact, human-readable block
 * suitable for inclusion in capability proposals.
 */
export function formatTrustSummary(assessment: TrustAssessment): string {
  const risk = RISK_LABELS[assessment.riskLevel];
  const source = TRUST_SOURCE_LABELS[assessment.trustSource];
  const mode = assessment.assessmentMode === 'heuristic'
    ? ' (heuristic)'
    : assessment.assessmentMode === 'mixed'
      ? ' (mixed)'
      : '';

  const lines: string[] = [];
  lines.push(`Risk: **${risk}**${mode} | Source: ${source} | Approval: ${capitalize(assessment.approvalClass)}`);

  const activePerms = Object.entries(assessment.permissions)
    .filter(([, v]) => v)
    .map(([k]) => formatPermissionName(k));

  if (activePerms.length > 0) {
    lines.push(`Permissions: ${activePerms.join(', ')}`);
  } else {
    lines.push('Permissions: No elevated permissions detected');
  }

  return lines.join('\n');
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
