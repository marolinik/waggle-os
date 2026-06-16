/**
 * Barrel test — the firewall index exposes the full public surface.
 */
import { describe, expect, it } from 'vitest';
import * as firewall from '../../src/firewall/index.js';

describe('firewall barrel', () => {
  it('re-exports every public function', () => {
    expect(typeof firewall.normalizeForMatch).toBe('function');
    expect(typeof firewall.collectArtifactTexts).toBe('function');
    expect(typeof firewall.assertNoGoldSubstring).toBe('function');
    expect(typeof firewall.cosineSimilarity).toBe('function');
    expect(typeof firewall.maxEmbeddingSimilarity).toBe('function');
    expect(typeof firewall.assertEmbeddingGate).toBe('function');
    expect(typeof firewall.hashMind).toBe('function');
    expect(typeof firewall.emitFirewallAssertion).toBe('function');
  });

  it('re-exports the constant tables', () => {
    expect(firewall.ARTIFACT_KINDS).toContain('skill_body');
    expect(firewall.FIREWALL_ASSERTIONS).toContain('gold_substring');
  });
});
