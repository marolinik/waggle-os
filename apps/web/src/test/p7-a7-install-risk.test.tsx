/**
 * P7/D15 A7 — one shared install-risk classifier (divergence #8) + audit-feed
 * risk rendering reuse (#16). classifyInstallRisk is the single scan/trust→risk
 * map every install surface delegates to; isKnownRiskLevel gates the audit panel
 * reusing the shared label/colour vocabulary.
 */
import { describe, it, expect } from 'vitest';
import { classifyInstallRisk, isKnownRiskLevel, RISK_LABELS } from '@/lib/risk-display';
import { installRiskFor } from '@/components/os/apps/MarketplaceApp';

describe('A7 — classifyInstallRisk (shared scan/trust → risk)', () => {
  it('failed scan → high', () => {
    expect(classifyInstallRisk({ scanStatus: 'failed' })).toBe('high');
  });
  it('passed scan → low', () => {
    expect(classifyInstallRisk({ scanStatus: 'passed' })).toBe('low');
  });
  it('verified trust → low', () => {
    expect(classifyInstallRisk({ trust: 'verified' })).toBe('low');
  });
  it('no signal → medium', () => {
    expect(classifyInstallRisk({})).toBe('medium');
  });
  it('MarketplaceApp.installRiskFor delegates to the shared classifier', () => {
    // Same scan/trust signal must yield the same risk as the shared fn.
    const ext = { scanStatus: 'failed' } as Parameters<typeof installRiskFor>[0];
    expect(installRiskFor(ext)).toBe(classifyInstallRisk({ scanStatus: 'failed' }));
  });
});

describe('A7 — audit-feed risk rendering (#16)', () => {
  it('isKnownRiskLevel accepts canonical levels, rejects unknown', () => {
    expect(isKnownRiskLevel('critical')).toBe(true);
    expect(isKnownRiskLevel('low')).toBe(true);
    expect(isKnownRiskLevel('unknown')).toBe(false);
    expect(isKnownRiskLevel('')).toBe(false);
  });
  it('known levels have a shared label', () => {
    expect(RISK_LABELS.high).toBe('High');
  });
});
