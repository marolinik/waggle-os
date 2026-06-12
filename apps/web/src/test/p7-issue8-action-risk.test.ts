/**
 * P7/D15 #8 — one shared source for non-install approval risk. The builder/install
 * surfaces used to inline scattered riskLevel literals, so the same conceptual
 * action could read differently in two places. actionRisk(kind) is now the single
 * source; this pins the action-kind → risk contract.
 */
import { describe, it, expect } from 'vitest';
import { actionRisk } from '@/lib/risk-display';

describe('#8 — actionRisk shared classifier', () => {
  it('recoverable state changes are medium', () => {
    expect(actionRisk('connector-revoke')).toBe('medium');
    expect(actionRisk('agent-elevation')).toBe('medium');
    expect(actionRisk('automation-activation')).toBe('medium');
    expect(actionRisk('mcp-revoke')).toBe('medium');
    expect(actionRisk('install-remove')).toBe('medium');
  });
  it('overriding a security-scan finding is high', () => {
    expect(actionRisk('mcp-install-override')).toBe('high');
  });
});
