import { describe, it, expect } from 'vitest';

describe('Capability Governance Routes', () => {
  it('exports capabilityGovernanceRoutes function', async () => {
    const mod = await import('../../src/routes/capability-governance.js');
    expect(mod.capabilityGovernanceRoutes).toBeDefined();
    expect(typeof mod.capabilityGovernanceRoutes).toBe('function');
  });
});
