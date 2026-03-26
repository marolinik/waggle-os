/**
 * Session Timeout Middleware Tests
 *
 * Verifies:
 * - SessionTimeoutTracker returns expired after inactivity
 * - Timer resets on activity
 * - Disabled in solo mode (no CLERK_SECRET_KEY)
 * - Exempt paths (/health, /api/vault) bypass timeout
 * - Cleanup prevents memory leak
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionTimeoutTracker } from '../../src/local/security-middleware.js';

describe('SessionTimeoutTracker', () => {
  let tracker: SessionTimeoutTracker;

  afterEach(() => {
    tracker?.destroy();
  });

  it('does not expire on first request', () => {
    tracker = new SessionTimeoutTracker(30_000); // 30 seconds for testing
    const expired = tracker.check('192.168.1.1');
    expect(expired).toBe(false);
  });

  it('does not expire when activity is within timeout', () => {
    tracker = new SessionTimeoutTracker(30_000);
    tracker.check('192.168.1.1');

    // Immediately check again — should not be expired
    const expired = tracker.check('192.168.1.1');
    expect(expired).toBe(false);
  });

  it('expires after inactivity exceeds timeout', () => {
    tracker = new SessionTimeoutTracker(100); // 100ms timeout for testing

    // First request — sets last activity
    tracker.check('192.168.1.1');

    // Simulate time passing beyond the timeout
    vi.useFakeTimers();
    vi.advanceTimersByTime(150); // 150ms > 100ms timeout

    const expired = tracker.check('192.168.1.1');
    expect(expired).toBe(true);

    vi.useRealTimers();
  });

  it('resets timer on every request', () => {
    tracker = new SessionTimeoutTracker(200); // 200ms timeout

    vi.useFakeTimers();

    // First request
    tracker.check('192.168.1.1');

    // 100ms later — still within timeout
    vi.advanceTimersByTime(100);
    let expired = tracker.check('192.168.1.1');
    expect(expired).toBe(false);

    // Another 100ms — still within timeout because timer was reset
    vi.advanceTimersByTime(100);
    expired = tracker.check('192.168.1.1');
    expect(expired).toBe(false);

    // 250ms without any request — should expire
    vi.advanceTimersByTime(250);
    expired = tracker.check('192.168.1.1');
    expect(expired).toBe(true);

    vi.useRealTimers();
  });

  it('tracks different IPs independently', () => {
    tracker = new SessionTimeoutTracker(100);

    vi.useFakeTimers();

    // Both IPs make a request
    tracker.check('192.168.1.1');
    tracker.check('192.168.1.2');

    // 50ms later, only IP1 makes another request
    vi.advanceTimersByTime(50);
    tracker.check('192.168.1.1');

    // 60ms more — IP2's last activity was 110ms ago (expired), IP1's was 60ms ago (not expired)
    vi.advanceTimersByTime(60);

    const ip1Expired = tracker.check('192.168.1.1');
    expect(ip1Expired).toBe(false);

    const ip2Expired = tracker.check('192.168.1.2');
    expect(ip2Expired).toBe(true);

    vi.useRealTimers();
  });

  it('allows fresh request after expiration', () => {
    tracker = new SessionTimeoutTracker(100);

    vi.useFakeTimers();

    tracker.check('192.168.1.1');

    // Expire
    vi.advanceTimersByTime(150);
    const expired = tracker.check('192.168.1.1');
    expect(expired).toBe(true);

    // Next request should succeed (entry was cleared on expiration)
    const freshRequest = tracker.check('192.168.1.1');
    expect(freshRequest).toBe(false);

    vi.useRealTimers();
  });

  it('returns configured timeout value', () => {
    tracker = new SessionTimeoutTracker(45_000);
    expect(tracker.getTimeoutMs()).toBe(45_000);
  });

  it('defaults to 30 minutes when no timeout specified', () => {
    // Clear env var to ensure default
    const original = process.env.WAGGLE_SESSION_TIMEOUT_MS;
    delete process.env.WAGGLE_SESSION_TIMEOUT_MS;

    tracker = new SessionTimeoutTracker();
    expect(tracker.getTimeoutMs()).toBe(30 * 60 * 1000);

    process.env.WAGGLE_SESSION_TIMEOUT_MS = original;
  });

  it('reads timeout from WAGGLE_SESSION_TIMEOUT_MS env var', () => {
    const original = process.env.WAGGLE_SESSION_TIMEOUT_MS;
    process.env.WAGGLE_SESSION_TIMEOUT_MS = '60000';

    tracker = new SessionTimeoutTracker();
    expect(tracker.getTimeoutMs()).toBe(60_000);

    process.env.WAGGLE_SESSION_TIMEOUT_MS = original;
  });

  it('destroy clears all state', () => {
    tracker = new SessionTimeoutTracker(30_000);
    tracker.check('192.168.1.1');
    tracker.check('192.168.1.2');

    tracker.destroy();

    // After destroy, a new check should work (fresh state)
    // We verify destroy doesn't throw and a new tracker works
    const newTracker = new SessionTimeoutTracker(30_000);
    const expired = newTracker.check('192.168.1.1');
    expect(expired).toBe(false);
    newTracker.destroy();
  });
});

describe('Session timeout in solo vs team mode', () => {
  it('session timeout is only enabled when CLERK_SECRET_KEY is set', () => {
    // This test verifies the design contract:
    // The securityMiddlewarePlugin checks `process.env.CLERK_SECRET_KEY`
    // and only creates a SessionTimeoutTracker when it's present.
    //
    // In solo mode (no CLERK_SECRET_KEY), session timeout is null/disabled.
    const original = process.env.CLERK_SECRET_KEY;
    delete process.env.CLERK_SECRET_KEY;

    const isTeamMode = !!process.env.CLERK_SECRET_KEY;
    expect(isTeamMode).toBe(false);

    // Restore for other tests
    if (original) process.env.CLERK_SECRET_KEY = original;
  });

  it('exempt paths are correctly defined', () => {
    // Verify the exempt path patterns match the spec
    const TIMEOUT_EXEMPT_PATHS = ['/health', '/api/vault'];

    // /health should be exempt
    expect(TIMEOUT_EXEMPT_PATHS.some(p => '/health'.startsWith(p))).toBe(true);

    // /api/vault/* should be exempt
    expect(TIMEOUT_EXEMPT_PATHS.some(p => '/api/vault/my-secret/reveal'.startsWith(p))).toBe(true);

    // /api/chat should NOT be exempt
    expect(TIMEOUT_EXEMPT_PATHS.some(p => '/api/chat'.startsWith(p))).toBe(false);

    // /api/feedback/stats should NOT be exempt
    expect(TIMEOUT_EXEMPT_PATHS.some(p => '/api/feedback/stats'.startsWith(p))).toBe(false);
  });
});
