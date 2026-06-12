/**
 * P7/D15 #17 — provenance (trustSource) is the dimension that justifies the risk.
 * It was shown on no install surface except a hand-built MarketplaceApp scope
 * line. The modal now renders it consistently from a structured field, and
 * MarketplaceApp populates it via installTrustSource.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ApprovalModal } from '@/components/ui/approval-modal';
import { installTrustSource, TRUST_SOURCE_LABELS } from '@/lib/risk-display';
import { buildInstallRequest } from '@/components/os/apps/MarketplaceApp';

afterEach(cleanup);

describe('#17 — modal renders trust source', () => {
  it('shows the labelled trust source when present', () => {
    render(
      <ApprovalModal
        request={{ action: 'Install X', scope: ['Type: skill'], riskLevel: 'low', trustSource: 'third_party_verified' }}
        onApprove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByText('Trust source:')).toBeInTheDocument();
    expect(screen.getByText(TRUST_SOURCE_LABELS.third_party_verified)).toBeInTheDocument();
  });

  it('omits the trust-source line when absent (no false provenance)', () => {
    render(
      <ApprovalModal
        request={{ action: 'Activate Y', scope: ['enable'], riskLevel: 'medium' }}
        onApprove={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.queryByText('Trust source:')).not.toBeInTheDocument();
  });
});

describe('#17 — installTrustSource maps scan/trust to canonical provenance', () => {
  it('failed scan → security-gate', () => {
    expect(installTrustSource({ scanStatus: 'failed' })).toBe('security-gate');
  });
  it('verified / passed → third_party_verified', () => {
    expect(installTrustSource({ trust: 'verified' })).toBe('third_party_verified');
    expect(installTrustSource({ scanStatus: 'passed' })).toBe('third_party_verified');
  });
  it('no signal → unknown', () => {
    expect(installTrustSource({})).toBe('unknown');
  });
  it('MarketplaceApp.buildInstallRequest carries a structured trustSource', () => {
    const req = buildInstallRequest({ name: 'pkg', type: 'skill', source: 'marketplace', scanStatus: 'failed' } as Parameters<typeof buildInstallRequest>[0]);
    expect(req.trustSource).toBe('security-gate');
    // the hand-built "Trust: …" scope string is gone (structured field instead).
    expect(req.scope.some((s) => s.startsWith('Trust:'))).toBe(false);
  });
});
