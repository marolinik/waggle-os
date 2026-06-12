/**
 * P7/D15 A5 — D4(ii): the in-chat approval card renders the risk taxonomy the
 * server already sends. Before, the FE ApprovalRequest type dropped riskLevel /
 * trustSource / explanation, so the highest-risk approval showed the least info.
 * The card and the shared modal must now read the SAME risk vocabulary.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RiskBadge, RISK_LABELS, canAlwaysAllow } from '@/lib/risk-display';

afterEach(cleanup);

describe('A5 — shared risk-display vocabulary', () => {
  it('RISK_LABELS covers all four canonical levels incl. critical', () => {
    expect(RISK_LABELS.low).toBe('Low');
    expect(RISK_LABELS.critical).toBe('Critical');
  });

  it('RiskBadge renders the level label', () => {
    render(<RiskBadge level="high" />);
    expect(screen.getByText(/high risk/i)).toBeInTheDocument();
  });

  it('RiskBadge can render critical (the level the old modal could not)', () => {
    render(<RiskBadge level="critical" />);
    expect(screen.getByText(/critical risk/i)).toBeInTheDocument();
  });

  // A6 policy helper — Always-allow gating (verified again in the A6 card test).
  it('canAlwaysAllow blocks permanent grants on critical/blocked only', () => {
    expect(canAlwaysAllow('standard')).toBe(true);
    expect(canAlwaysAllow('elevated')).toBe(true);
    expect(canAlwaysAllow('critical')).toBe(false);
    expect(canAlwaysAllow('blocked')).toBe(false);
    expect(canAlwaysAllow(undefined)).toBe(true);
  });
});
