/**
 * M-18 / UX-1 — skip-setup defaults contract.
 *
 * Guards the user-facing promise: picking "Skip and set me up" on the
 * onboarding WhyWaggle step must produce a workable desktop with
 * sensible defaults (blank template, general-purpose persona). A
 * silent change to either value would surface only via user-reported
 * "why is my agent suddenly acting like a sales rep" noise.
 */
import { describe, it, expect } from 'vitest';
import { SKIP_SETUP_DEFAULTS } from './onboarding-skip';

describe('SKIP_SETUP_DEFAULTS', () => {
  it('uses the blank template (no domain scoping)', () => {
    expect(SKIP_SETUP_DEFAULTS.templateId).toBe('blank');
  });

  it('uses the general-purpose persona (no role bias)', () => {
    expect(SKIP_SETUP_DEFAULTS.personaId).toBe('general-purpose');
  });

  it('names the workspace "Default Workspace"', () => {
    expect(SKIP_SETUP_DEFAULTS.workspaceName).toBe('Default Workspace');
    expect(SKIP_SETUP_DEFAULTS.workspaceName.length).toBeGreaterThan(0);
  });

  it('places the workspace in the Personal group', () => {
    expect(SKIP_SETUP_DEFAULTS.group).toBe('Personal');
  });

  it('every field is populated (no silent empty strings)', () => {
    for (const [key, value] of Object.entries(SKIP_SETUP_DEFAULTS)) {
      expect(typeof value, `${key} type`).toBe('string');
      expect((value as string).length, `${key} length`).toBeGreaterThan(0);
    }
  });
});
