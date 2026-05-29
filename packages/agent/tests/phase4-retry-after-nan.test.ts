import { describe, it, expect } from 'vitest';
import { handleNonOkResponse, initialRetryState } from '../src/retry-policy.js';

// R3-003: A 429 response can carry Retry-After as an HTTP-date
// (RFC 7231 §7.1.3) instead of delta-seconds. `parseInt` on the date string
// yields NaN, which propagates to waitMs (NaN * 1000 = NaN, Math.min(NaN, cap)
// = NaN). The agent loop then calls `setTimeout(r, NaN)`, which fires
// immediately — hammering the endpoint and burning the retry budget.

function rateLimitedResponse(retryAfter: string | null): Response {
  const headers = new Headers();
  if (retryAfter !== null) headers.set('retry-after', retryAfter);
  return new Response('rate limited', { status: 429, headers });
}

describe('handleNonOkResponse — 429 Retry-After parsing (R3-003)', () => {
  it('does not produce a NaN wait when Retry-After is an HTTP-date', async () => {
    // A future HTTP-date should resolve to a finite, positive wait
    // (seconds until that date), capped at MAX_RATE_LIMIT_WAIT_MS (60s).
    const futureDate = new Date(Date.now() + 30_000).toUTCString();
    const action = await handleNonOkResponse(
      rateLimitedResponse(futureDate),
      initialRetryState(),
    );

    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') throw new Error('expected retry');

    // The core bug: waitMs must be a finite number, never NaN.
    expect(Number.isFinite(action.waitMs)).toBe(true);
    // ~30s out, allowing a little slack for clock/rounding.
    expect(action.waitMs).toBeGreaterThan(25_000);
    expect(action.waitMs).toBeLessThanOrEqual(60_000);
    // And the human-readable notice must not say "waiting NaNs".
    expect(action.notice).not.toContain('NaN');
  });

  it('clamps a past HTTP-date to a finite non-negative wait', async () => {
    const action = await handleNonOkResponse(
      rateLimitedResponse('Wed, 21 Oct 2020 07:28:00 GMT'),
      initialRetryState(),
    );

    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') throw new Error('expected retry');
    // Past date → retry now (0ms), but crucially finite — not NaN.
    expect(Number.isFinite(action.waitMs)).toBe(true);
    expect(action.waitMs).toBeGreaterThanOrEqual(0);
    expect(action.notice).not.toContain('NaN');
  });

  it('falls back to the sane default for a non-numeric Retry-After', async () => {
    const action = await handleNonOkResponse(
      rateLimitedResponse('garbage'),
      initialRetryState(),
    );

    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') throw new Error('expected retry');

    // Default backoff is 5s.
    expect(action.waitMs).toBe(5_000);
  });

  it('still honours a plain numeric (delta-seconds) Retry-After', async () => {
    const action = await handleNonOkResponse(
      rateLimitedResponse('12'),
      initialRetryState(),
    );

    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') throw new Error('expected retry');
    expect(action.waitMs).toBe(12_000);
  });

  it('still uses the default when Retry-After is absent', async () => {
    const action = await handleNonOkResponse(
      rateLimitedResponse(null),
      initialRetryState(),
    );

    expect(action.kind).toBe('retry');
    if (action.kind !== 'retry') throw new Error('expected retry');
    expect(action.waitMs).toBe(5_000);
  });
});
