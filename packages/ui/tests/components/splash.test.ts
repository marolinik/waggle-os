/**
 * Splash screen utility tests.
 *
 * Tests utility/logic functions and exports only — no jsdom/React Testing Library.
 * React component rendering is tested in the desktop app's E2E suite.
 */

import { describe, it, expect } from 'vitest';
import {
  STARTUP_PHASES,
  getPhaseMessage,
  getPhaseProgress,
  isStartupComplete,
  formatProgress,
  SplashScreen,
} from '../../src/index.js';
import type { StartupPhaseConfig } from '../../src/index.js';

// ── STARTUP_PHASES ─────────────────────────────────────────────────

describe('STARTUP_PHASES', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(STARTUP_PHASES)).toBe(true);
    expect(STARTUP_PHASES.length).toBeGreaterThan(0);
  });

  it('each phase has id, message, and progress', () => {
    for (const phase of STARTUP_PHASES) {
      expect(typeof phase.id).toBe('string');
      expect(typeof phase.message).toBe('string');
      expect(typeof phase.progress).toBe('number');
      expect(phase.progress).toBeGreaterThanOrEqual(0);
      expect(phase.progress).toBeLessThanOrEqual(1);
    }
  });

  it('progress values are in ascending order', () => {
    for (let i = 1; i < STARTUP_PHASES.length; i++) {
      expect(STARTUP_PHASES[i].progress).toBeGreaterThanOrEqual(STARTUP_PHASES[i - 1].progress);
    }
  });

  it('includes init and ready phases', () => {
    const ids = STARTUP_PHASES.map(p => p.id);
    expect(ids).toContain('init');
    expect(ids).toContain('ready');
  });
});

// ── getPhaseMessage ────────────────────────────────────────────────

describe('getPhaseMessage', () => {
  it('returns a message for known phases', () => {
    expect(typeof getPhaseMessage('init')).toBe('string');
    expect(getPhaseMessage('init').length).toBeGreaterThan(0);
  });

  it('returns a message for ready phase', () => {
    expect(getPhaseMessage('ready').length).toBeGreaterThan(0);
  });

  it('returns a fallback message for unknown phases', () => {
    const msg = getPhaseMessage('unknown-phase');
    expect(typeof msg).toBe('string');
    expect(msg.length).toBeGreaterThan(0);
  });
});

// ── getPhaseProgress ───────────────────────────────────────────────

describe('getPhaseProgress', () => {
  it('returns 0 or small value for init', () => {
    expect(getPhaseProgress('init')).toBeLessThanOrEqual(0.2);
  });

  it('returns 1 for ready', () => {
    expect(getPhaseProgress('ready')).toBe(1);
  });

  it('returns 0 for unknown phase', () => {
    expect(getPhaseProgress('unknown')).toBe(0);
  });
});

// ── isStartupComplete ──────────────────────────────────────────────

describe('isStartupComplete', () => {
  it('returns true for ready phase', () => {
    expect(isStartupComplete('ready')).toBe(true);
  });

  it('returns false for init phase', () => {
    expect(isStartupComplete('init')).toBe(false);
  });

  it('returns false for unknown phase', () => {
    expect(isStartupComplete('unknown')).toBe(false);
  });
});

// ── formatProgress ─────────────────────────────────────────────────

describe('formatProgress', () => {
  it('formats 0 as 0%', () => {
    expect(formatProgress(0)).toBe('0%');
  });

  it('formats 1 as 100%', () => {
    expect(formatProgress(1)).toBe('100%');
  });

  it('formats 0.75 as 75%', () => {
    expect(formatProgress(0.75)).toBe('75%');
  });

  it('formats 0.333 by rounding', () => {
    const result = formatProgress(0.333);
    expect(result).toBe('33%');
  });
});

// ── SplashScreen export ────────────────────────────────────────────

describe('SplashScreen', () => {
  it('is exported as a function (React component)', () => {
    expect(typeof SplashScreen).toBe('function');
  });
});
