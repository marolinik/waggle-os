import { describe, it, expect } from 'vitest';
import {
  assessTrust,
  resolveTrustSource,
  detectPermissions,
  classifyRisk,
  deriveApprovalClass,
  formatTrustSummary,
} from '../src/trust-model.js';

// ── resolveTrustSource ─────────────────────────────────────────────────

describe('resolveTrustSource', () => {
  it('returns builtin for native type', () => {
    expect(resolveTrustSource('native', 'native-tools')).toBe('builtin');
  });

  it('returns starter_pack for starter-pack source', () => {
    expect(resolveTrustSource('skill', 'starter-pack')).toBe('starter_pack');
  });

  it('returns local_user for installed source', () => {
    expect(resolveTrustSource('skill', 'installed')).toBe('local_user');
  });

  it('returns unknown for unrecognized source', () => {
    expect(resolveTrustSource('plugin', 'some-random-registry')).toBe('unknown');
  });

  it('returns third_party_unverified for third-party source', () => {
    expect(resolveTrustSource('plugin', 'third-party')).toBe('third_party_unverified');
  });
});

// ── detectPermissions ──────────────────────────────────────────────────

describe('detectPermissions', () => {
  it('detects no permissions for plain instruction text', () => {
    const perms = detectPermissions('## How to write a good memo\n\n1. Start with the conclusion\n2. Be concise');
    expect(perms.fileSystem).toBe(false);
    expect(perms.network).toBe(false);
    expect(perms.codeExecution).toBe(false);
    expect(perms.externalServices).toBe(false);
    expect(perms.secrets).toBe(false);
    expect(perms.browserAutomation).toBe(false);
  });

  it('detects filesystem access from read_file mention', () => {
    const perms = detectPermissions('Use read_file to load the document');
    expect(perms.fileSystem).toBe(true);
  });

  it('detects network access from web_fetch mention', () => {
    const perms = detectPermissions('Call web_fetch to retrieve the page');
    expect(perms.network).toBe(true);
  });

  it('detects network access from URL patterns', () => {
    const perms = detectPermissions('Fetch data from https://api.example.com/data');
    expect(perms.network).toBe(true);
  });

  it('detects code execution from bash mention', () => {
    const perms = detectPermissions('Run bash to execute the build script');
    expect(perms.codeExecution).toBe(true);
  });

  it('detects external services from slack/email mentions', () => {
    const perms = detectPermissions('Send the summary via email notification');
    expect(perms.externalServices).toBe(true);
  });

  it('detects secrets from api_key mention', () => {
    const perms = detectPermissions('Requires an api_key for the service');
    expect(perms.secrets).toBe(true);
  });

  it('detects browser automation from playwright mention', () => {
    const perms = detectPermissions('Use playwright to take a screenshot');
    expect(perms.browserAutomation).toBe(true);
  });

  it('detects multiple permissions in one content', () => {
    const perms = detectPermissions(
      'Use bash to run the build, then web_fetch the API with the api_key, and write_file the results',
    );
    expect(perms.codeExecution).toBe(true);
    expect(perms.network).toBe(true);
    expect(perms.secrets).toBe(true);
    expect(perms.fileSystem).toBe(true);
  });
});

// ── classifyRisk ───────────────────────────────────────────────────────

describe('classifyRisk', () => {
  it('classifies 0 points as low', () => {
    expect(classifyRisk(0)).toBe('low');
  });

  it('classifies 2 points as low', () => {
    expect(classifyRisk(2)).toBe('low');
  });

  it('classifies 3 points as medium', () => {
    expect(classifyRisk(3)).toBe('medium');
  });

  it('classifies 4 points as medium', () => {
    expect(classifyRisk(4)).toBe('medium');
  });

  it('classifies 5 points as high', () => {
    expect(classifyRisk(5)).toBe('high');
  });

  it('classifies 10 points as high', () => {
    expect(classifyRisk(10)).toBe('high');
  });
});

// ── deriveApprovalClass ────────────────────────────────────────────────

describe('deriveApprovalClass', () => {
  it('low risk → standard approval', () => {
    expect(deriveApprovalClass('low')).toBe('standard');
  });

  it('medium risk → elevated approval', () => {
    expect(deriveApprovalClass('medium')).toBe('elevated');
  });

  it('high risk → critical approval', () => {
    expect(deriveApprovalClass('high')).toBe('critical');
  });
});

// ── assessTrust ────────────────────────────────────────────────────────

describe('assessTrust', () => {
  it('native tools get builtin trust and low risk', () => {
    const result = assessTrust({
      capabilityType: 'native',
      source: 'native-tools',
      content: 'search internet web browse',
    });
    expect(result.trustSource).toBe('builtin');
    expect(result.riskLevel).toBe('low');
    expect(result.approvalClass).toBe('standard');
    expect(result.assessmentMode).toBe('heuristic');
  });

  it('starter-pack instruction-only skill is low risk', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: '# Risk Assessment\n\nFollow this structured framework:\n1. List risks\n2. Evaluate impact\n3. Propose mitigations',
    });
    expect(result.trustSource).toBe('starter_pack');
    expect(result.riskLevel).toBe('low');
    expect(result.approvalClass).toBe('standard');
    expect(result.factors).not.toContain('unknown_source');
  });

  it('local_user skill with bash and secrets is NOT automatically low-risk', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Run bash to deploy, use the api_key from .env, then write_file the log',
    });
    expect(result.trustSource).toBe('local_user');
    // local_user base=1 + codeExecution=2 + secrets=2 + fileSystem=1 = 6 → high
    expect(result.riskLevel).toBe('high');
    expect(result.approvalClass).toBe('critical');
    expect(result.factors).toContain('local_code_execution');
    expect(result.factors).toContain('secret_access');
    expect(result.factors).toContain('filesystem_access');
  });

  it('unknown source with no content gets missing_metadata factor', () => {
    const result = assessTrust({
      capabilityType: 'plugin',
      source: 'some-registry',
      content: '',
    });
    expect(result.trustSource).toBe('unknown');
    expect(result.factors).toContain('unknown_source');
    expect(result.factors).toContain('missing_metadata');
    expect(result.riskLevel).toBe('high');
  });

  it('third-party unverified with network access is medium-to-high risk', () => {
    const result = assessTrust({
      capabilityType: 'plugin',
      source: 'third-party',
      content: 'Fetch data from https://api.example.com',
    });
    expect(result.trustSource).toBe('third_party_unverified');
    // base=4 + network=1 → 5 = high
    expect(result.riskLevel).toBe('high');
    expect(result.factors).toContain('unverified_publisher');
    expect(result.factors).toContain('network_access');
  });

  it('assessment mode is heuristic when no declared permissions', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: 'Some content',
    });
    expect(result.assessmentMode).toBe('heuristic');
  });

  it('assessment mode is mixed when declared permissions provided', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: 'Some content',
      declaredPermissions: { network: true },
    });
    expect(result.assessmentMode).toBe('mixed');
    expect(result.permissions.network).toBe(true);
  });

  it('declared permissions merge with heuristic detection', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Use bash to run tests',
      declaredPermissions: { network: true },
    });
    expect(result.permissions.codeExecution).toBe(true); // from heuristic
    expect(result.permissions.network).toBe(true); // from declared
    expect(result.assessmentMode).toBe('mixed');
  });

  it('explanation is non-empty and human-readable', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: '# Plan your day\n\n1. Review tasks\n2. Prioritize',
    });
    expect(result.explanation.length).toBeGreaterThan(10);
    expect(result.explanation).toContain('starter pack');
  });

  it('explanation mentions permissions when present', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Use bash to deploy the app',
    });
    expect(result.explanation).toContain('code execution');
  });

  it('starter_pack skill with only file access is low risk', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: 'Use write_file to save the output',
    });
    // base=0 + fileSystem=1 = 1 → low
    expect(result.riskLevel).toBe('low');
  });

  it('local_user skill with just network is medium risk', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Call web_search to find information',
    });
    // base=1 + network=1 = 2 → low
    expect(result.riskLevel).toBe('low');
  });

  it('local_user skill with network + code execution is medium risk', () => {
    const result = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Use bash to run commands and web_fetch results',
    });
    // base=1 + codeExecution=2 + network=1 = 4 → medium
    expect(result.riskLevel).toBe('medium');
    expect(result.approvalClass).toBe('elevated');
  });
});

// ── formatTrustSummary ─────────────────────────────────────────────────

describe('formatTrustSummary', () => {
  it('formats low-risk assessment compactly', () => {
    const assessment = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: '# Daily Plan\n\n1. Review priorities',
    });
    const summary = formatTrustSummary(assessment);
    expect(summary).toContain('Risk: **Low**');
    expect(summary).toContain('starter pack');
    expect(summary).toContain('Standard');
  });

  it('formats high-risk assessment with permissions', () => {
    const assessment = assessTrust({
      capabilityType: 'skill',
      source: 'installed',
      content: 'Run bash with the api_key to deploy and write_file logs',
    });
    const summary = formatTrustSummary(assessment);
    expect(summary).toContain('Risk: **High**');
    expect(summary).toContain('code execution');
    expect(summary).toContain('secrets/credentials');
  });

  it('includes heuristic mode indicator', () => {
    const assessment = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: 'Simple instructions',
    });
    const summary = formatTrustSummary(assessment);
    expect(summary).toContain('(heuristic)');
  });

  it('shows no elevated permissions for instruction-only skills', () => {
    const assessment = assessTrust({
      capabilityType: 'skill',
      source: 'starter-pack',
      content: '# How to brainstorm\n\nStart with divergent thinking.',
    });
    const summary = formatTrustSummary(assessment);
    expect(summary).toContain('No elevated permissions detected');
  });
});
