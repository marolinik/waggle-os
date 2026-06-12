/**
 * P7/D15 A6 — the shared modal can represent 'critical', and "Always allow" is
 * gated by approvalClass (a critical/blocked action can't be permanently granted
 * in one click — founder-ratified, mirrors MCPHub's CRITICAL rule).
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ApprovalModal } from '@/components/ui/approval-modal';
import { canAlwaysAllow } from '@/lib/risk-display';

afterEach(cleanup);

describe('A6 — modal represents critical', () => {
  it('renders a critical risk level (was impossible with the old 3-value type)', () => {
    render(
      <ApprovalModal
        request={{ action: 'Install dangerous MCP', scope: ['network', 'secrets'], riskLevel: 'critical' }}
        onApprove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Install dangerous MCP')).toBeInTheDocument();
  });
});

// The card's "Always allow" is wired as
//   {canAlwaysAllow(request.approvalClass) && <button>Always allow</button>}
// so the permanent grant disappears for critical/blocked approvals.
describe('A6 — Always-allow gating policy', () => {
  it('hides the permanent grant for critical/blocked, offers it below', () => {
    expect(canAlwaysAllow('critical')).toBe(false);
    expect(canAlwaysAllow('blocked')).toBe(false);
    expect(canAlwaysAllow('elevated')).toBe(true);
    expect(canAlwaysAllow('standard')).toBe(true);
  });
});
