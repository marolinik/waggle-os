import { describe, it, expect } from 'vitest';
import { installTargetFor, type AgentSearchSuggestion } from './agent-search';

const sug = (install: AgentSearchSuggestion['install']): AgentSearchSuggestion => ({
  name: 'Thing', type: 'x', availability: 'installable', description: '', matchReason: 'why', matchScore: 0.5, install,
});

describe('installTargetFor', () => {
  it('builds a package target from a store-mode suggestion', () => {
    expect(installTargetFor(sug({ mode: 'store', extensionId: 'pkg:7', type: 'skill', kind: 'package', packageId: 7 })))
      .toEqual({ id: 'pkg:7', type: 'skill', kind: 'package', name: 'Thing', packageId: 7 });
  });
  it('builds a connector target (no packageId)', () => {
    expect(installTargetFor(sug({ mode: 'store', extensionId: 'connector:slack', type: 'connector', kind: 'federated', authType: 'bearer' })))
      .toEqual({ id: 'connector:slack', type: 'connector', kind: 'federated', name: 'Thing' });
  });
  it('returns null for non-store modes', () => {
    expect(installTargetFor(sug({ mode: 'starter-pack', name: 'pdf' }))).toBeNull();
    expect(installTargetFor(sug({ mode: 'open-in', appId: 'connectors' }))).toBeNull();
    expect(installTargetFor(sug({ mode: 'active' }))).toBeNull();
  });
});
