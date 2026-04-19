/**
 * M-25 / ENG-4 — LoginBriefing visibility contract regression.
 *
 * Guards the two independent reasons the briefing would be hidden
 * (E2E skip vs. permanent user dismiss) and the localStorage key
 * contract for the "Don't show again" flag.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldShowLoginBriefing,
  readLoginBriefingDismissed,
  writeLoginBriefingDismissed,
  LOGIN_BRIEFING_DISMISSED_KEY,
} from './login-briefing';

describe('shouldShowLoginBriefing', () => {
  it('shows the briefing when neither gate trips', () => {
    expect(shouldShowLoginBriefing({ skipBriefing: false, permanentlyDismissed: false })).toBe(true);
  });

  it('hides when ?skipBriefing=true (E2E escape hatch)', () => {
    expect(shouldShowLoginBriefing({ skipBriefing: true, permanentlyDismissed: false })).toBe(false);
  });

  it('hides when the user has permanently dismissed', () => {
    expect(shouldShowLoginBriefing({ skipBriefing: false, permanentlyDismissed: true })).toBe(false);
  });

  it('hides when both gates are active', () => {
    expect(shouldShowLoginBriefing({ skipBriefing: true, permanentlyDismissed: true })).toBe(false);
  });
});

describe('readLoginBriefingDismissed / writeLoginBriefingDismissed', () => {
  beforeEach(() => {
    window.localStorage.removeItem(LOGIN_BRIEFING_DISMISSED_KEY);
  });

  it('returns false when nothing is stored', () => {
    expect(readLoginBriefingDismissed()).toBe(false);
  });

  it('returns true only when the stored value is the literal "true"', () => {
    window.localStorage.setItem(LOGIN_BRIEFING_DISMISSED_KEY, 'true');
    expect(readLoginBriefingDismissed()).toBe(true);
  });

  it('returns false for any other stored literal', () => {
    for (const v of ['false', '1', 'yes', '']) {
      window.localStorage.setItem(LOGIN_BRIEFING_DISMISSED_KEY, v);
      expect(readLoginBriefingDismissed(), `stored=${JSON.stringify(v)}`).toBe(false);
    }
  });

  it('write(true) then read returns true', () => {
    writeLoginBriefingDismissed(true);
    expect(readLoginBriefingDismissed()).toBe(true);
  });

  it('write(false) then read returns false — supports "show again" reset', () => {
    writeLoginBriefingDismissed(true);
    writeLoginBriefingDismissed(false);
    expect(readLoginBriefingDismissed()).toBe(false);
  });

  it('the storage key matches the documented literal', () => {
    // Pins the key so a rename ships a migration, not a silent reset.
    expect(LOGIN_BRIEFING_DISMISSED_KEY).toBe('waggle:login-briefing-dismissed');
  });
});
