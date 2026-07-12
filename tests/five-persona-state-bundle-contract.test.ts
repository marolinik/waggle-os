import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '..');
const scorecards = readFileSync(
  resolve(repoRoot, 'docs/audits/2026-07-08-five-persona-judge-scorecards.md'),
  'utf8',
);
const stateBundleSpec = readFileSync(
  resolve(repoRoot, 'tests/e2e/five-persona-state-bundles.spec.ts'),
  'utf8',
);

const personaSections = [
  'Persona 1: Solo Founder',
  'Persona 2: Researcher',
  'Persona 3: Engineer / Power User',
  'Persona 4: Team Admin / Security Reviewer',
  'Persona 5: Mobile Executive',
];

const requiredFields = [
  'Account mode:',
  'Billing tier:',
  'UI disclosure tier:',
  'Model state:',
  'Data state:',
  'Offline/error state:',
  'Viewport:',
  'Non-main gate decisions:',
];

const requiredFailureProbes = [
  { persona: 'researcher', id: 'memory-large-list' },
  { persona: 'researcher', id: 'memory-slow-list' },
  { persona: 'researcher', id: 'timeline-large-events' },
  { persona: 'engineer-power-user', id: 'agents-slow-list' },
  { persona: 'engineer-power-user', id: 'agents-large-list' },
  { persona: 'engineer-power-user', id: 'mission-control-health-degraded' },
  { persona: 'engineer-power-user', id: 'marketplace-unavailable' },
  { persona: 'engineer-power-user', id: 'files-upload-failure' },
  { persona: 'engineer-power-user', id: 'files-upload-success' },
  { persona: 'engineer-power-user', id: 'files-large-list' },
  { persona: 'engineer-power-user', id: 'marketplace-large-catalog' },
  { persona: 'team-admin-security-reviewer', id: 'billing-checkout-unavailable' },
  { persona: 'team-admin-security-reviewer', id: 'billing-team-active-state' },
  { persona: 'team-admin-security-reviewer', id: 'team-settings-unlocked-state' },
  { persona: 'team-admin-security-reviewer', id: 'billing-checkout-success-return' },
  { persona: 'team-admin-security-reviewer', id: 'billing-checkout-cancel-return' },
  { persona: 'team-admin-security-reviewer', id: 'backup-restore-failure' },
  { persona: 'team-admin-security-reviewer', id: 'approvals-revoke-all-grants' },
  { persona: 'mobile-executive', id: 'local-model-runtime-unavailable' },
];

function sectionFor(heading: string): string {
  const start = scorecards.indexOf(`## ${heading}`);
  expect(start, `${heading} section should exist`).toBeGreaterThanOrEqual(0);
  const next = scorecards.indexOf('\n## ', start + 4);
  return scorecards.slice(start, next === -1 ? scorecards.length : next);
}

function specSectionFor(slug: string): string {
  const start = stateBundleSpec.indexOf(`slug: '${slug}'`);
  expect(start, `${slug} persona should exist in the state-bundle spec`).toBeGreaterThanOrEqual(0);
  const next = stateBundleSpec.indexOf('\n  {', start + 1);
  return stateBundleSpec.slice(start, next === -1 ? stateBundleSpec.length : next);
}

describe('five-persona judge scorecards', () => {
  it('requires a concrete T12 state bundle in every persona scorecard section', () => {
    for (const heading of personaSections) {
      const section = sectionFor(heading);

      expect(section, `${heading} should have an explicit state bundle`).toContain('State bundle to capture:');
      for (const field of requiredFields) {
        expect(section, `${heading} should include ${field}`).toContain(`- ${field}`);
      }
    }
  });

  it('keeps Mobile Executive Command Center proof in the rendered state bundle', () => {
    const section = specSectionFor('mobile-executive');

    expect(section, 'Mobile Executive should capture Command Center as a mobile overlay').toContain("'command-center'");
    expect(stateBundleSpec, 'Command Center proof should check mobile fit and Escape close').toContain(
      'command center opened, described, fit, and closed with Escape',
    );
  });

  it('keeps sampled T12 failure, workflow, and scale probes in the rendered state bundle', () => {
    for (const probe of requiredFailureProbes) {
      const section = specSectionFor(probe.persona);
      expect(section, `${probe.persona} should capture ${probe.id}`).toContain(`id: '${probe.id}'`);
    }
  });
});
