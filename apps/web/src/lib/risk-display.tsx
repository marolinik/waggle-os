/**
 * Shared risk-display vocabulary (P7/D15 A5/A6 — D4(ii) "same taxonomy, not same
 * component"). The in-chat approval card and the ui/approval-modal must render
 * an identical risk level identically — same label, same colour. Both import
 * from here instead of each defining their own (the modal's old map only covered
 * low/medium/high; the card had none). Keyed on the canonical @waggle/shared
 * RiskLevel so 'critical' is representable everywhere.
 */
import type { RiskLevel, ApprovalClass } from '@waggle/shared';

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

/** Text colour per risk level. critical is distinguished from high by weight. */
export const RISK_TEXT_CLASSES: Record<RiskLevel, string> = {
  low: 'text-emerald-400',
  medium: 'text-amber-400',
  high: 'text-destructive',
  critical: 'text-destructive font-semibold',
};

/** Chip/badge classes (bg + border + text) per risk level. */
export const RISK_BADGE_CLASSES: Record<RiskLevel, string> = {
  low: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  high: 'bg-destructive/15 text-destructive border-destructive/30',
  critical: 'bg-destructive/25 text-destructive border-destructive/50 font-semibold',
};

/**
 * approvalClass policy helper (A6): 'Always allow' must NOT be offered for the
 * riskiest approvals — a critical/blocked action can never be permanently granted
 * in one click (founder-ratified; mirrors MCPHub's CRITICAL-non-overridable rule).
 */
export function canAlwaysAllow(approvalClass?: ApprovalClass): boolean {
  return approvalClass !== 'critical' && approvalClass !== 'blocked';
}

/**
 * Canonical scan/trust → RiskLevel classifier for installs (P7/D15 A7,
 * divergence #8). The single place that maps a security-scan / trust signal to a
 * risk level, so the same conceptual install yields the same risk on every
 * surface. (A fuller TrustAssessment FE feed — per-surface policy-engine risk —
 * does not exist yet; the per-surface default literals + trustSource surfacing
 * are ledgered post-launch.)
 */
export function classifyInstallRisk(signal: { scanStatus?: string; trust?: string }): RiskLevel {
  if (signal.scanStatus === 'failed') return 'high';
  if (signal.scanStatus === 'passed') return 'low';
  if (signal.trust === 'verified') return 'low';
  return 'medium';
}

/**
 * Render a raw audit-feed risk string with the shared label + colour when it is a
 * known canonical level; otherwise pass the raw string through (the feed can
 * carry 'unknown'). Used by InstallAuditPanel so the audit trail and the approval
 * surfaces speak one visual language (divergence #16).
 */
export function isKnownRiskLevel(v: string): v is RiskLevel {
  return v === 'low' || v === 'medium' || v === 'high' || v === 'critical';
}

/**
 * Canonical per-action-kind risk (P7/D15 #8). The non-install approval surfaces
 * (agent elevation, automation activation, connector/MCP revoke, MCP scan
 * override) used to inline scattered `riskLevel: 'medium'`/`'high'` literals, so
 * the same conceptual action could be labelled differently in two places. This
 * is the SINGLE source for those action-kind defaults. (Capability *installs* with
 * a scan/trust signal go through classifyInstallRisk instead — that's a real
 * signal, not an action-kind default. A policy-engine TrustAssessment feed for
 * these non-install actions does not exist; an action-kind default is the honest
 * model until it does.)
 */
export type ActionRiskKind =
  | 'connector-revoke'
  | 'agent-elevation'
  | 'automation-activation'
  | 'mcp-install-override'
  | 'mcp-revoke'
  | 'install-remove';

const ACTION_RISK: Record<ActionRiskKind, RiskLevel> = {
  // Recoverable state changes (re-auth / re-enable / re-install possible) → medium.
  'connector-revoke': 'medium',
  'agent-elevation': 'medium',
  'automation-activation': 'medium',
  'mcp-revoke': 'medium',
  'install-remove': 'medium',
  // Overriding a security-scan finding to install anyway is genuinely high.
  'mcp-install-override': 'high',
};

export function actionRisk(kind: ActionRiskKind): RiskLevel {
  return ACTION_RISK[kind];
}

interface RiskBadgeProps {
  level: RiskLevel;
  className?: string;
}

/** Small risk chip used by both approval surfaces. */
export function RiskBadge({ level, className = '' }: RiskBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-display uppercase tracking-wide ${RISK_BADGE_CLASSES[level]} ${className}`}
    >
      {RISK_LABELS[level]} risk
    </span>
  );
}
