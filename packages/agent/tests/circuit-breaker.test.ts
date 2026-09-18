/**
 * Circuit breaker (Phase 7, R-2).
 *
 * These are specification tests, not characterization tests: the module is new,
 * so they state what it must do rather than pinning what it happened to do.
 * The clock is injected, so nothing here sleeps.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  CircuitBreaker,
  countsAsBreakerFailure,
  breakerEndpointKey,
  wrapFetchWithBreaker,
} from '../src/circuit-breaker.js';

const ENDPOINT = 'https://api.anthropic.com';

function fixedClock(start = 1_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('CircuitBreaker', () => {
  it('stays closed and allows calls until the threshold is reached', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure(ENDPOINT);
    breaker.recordFailure(ENDPOINT);
    expect(breaker.stateOf(ENDPOINT)).toBe('closed');
    expect(breaker.allows(ENDPOINT)).toBe(true);
  });

  it('opens on the threshold-th consecutive failure and then fails fast', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    for (let i = 0; i < 3; i += 1) breaker.recordFailure(ENDPOINT);
    expect(breaker.stateOf(ENDPOINT)).toBe('open');
    expect(breaker.allows(ENDPOINT)).toBe(false);
  });

  it('forgets the failure history on any success', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3 });
    breaker.recordFailure(ENDPOINT);
    breaker.recordFailure(ENDPOINT);
    breaker.recordSuccess(ENDPOINT);
    breaker.recordFailure(ENDPOINT);
    breaker.recordFailure(ENDPOINT);
    // Two since the success, not four in total.
    expect(breaker.stateOf(ENDPOINT)).toBe('closed');
  });

  it('allows exactly one probe after the cooldown, not a flood', () => {
    const clock = fixedClock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 30_000, now: clock.now });
    breaker.recordFailure(ENDPOINT);
    expect(breaker.allows(ENDPOINT)).toBe(false);

    clock.advance(29_999);
    expect(breaker.allows(ENDPOINT)).toBe(false);

    clock.advance(2);
    expect(breaker.allows(ENDPOINT)).toBe(true);       // the probe
    expect(breaker.stateOf(ENDPOINT)).toBe('half-open');
    expect(breaker.allows(ENDPOINT)).toBe(false);      // no second caller slips through
  });

  it('closes when the probe succeeds', () => {
    const clock = fixedClock();
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 10, now: clock.now });
    breaker.recordFailure(ENDPOINT);
    clock.advance(11);
    breaker.allows(ENDPOINT);
    breaker.recordSuccess(ENDPOINT);
    expect(breaker.stateOf(ENDPOINT)).toBe('closed');
    expect(breaker.allows(ENDPOINT)).toBe(true);
  });

  it('re-opens immediately when the probe fails, without spending the threshold again', () => {
    const clock = fixedClock();
    const breaker = new CircuitBreaker({ failureThreshold: 5, openMs: 10, now: clock.now });
    for (let i = 0; i < 5; i += 1) breaker.recordFailure(ENDPOINT);
    clock.advance(11);
    expect(breaker.allows(ENDPOINT)).toBe(true);
    breaker.recordFailure(ENDPOINT);
    expect(breaker.stateOf(ENDPOINT)).toBe('open');
    expect(breaker.allows(ENDPOINT)).toBe(false);
  });

  it('keeps one endpoint failing from stopping another', () => {
    // The bulkhead property: a wedged local Ollama must not break Anthropic.
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    breaker.recordFailure('http://127.0.0.1:11434');
    breaker.recordFailure('http://127.0.0.1:11434');
    expect(breaker.allows('http://127.0.0.1:11434')).toBe(false);
    expect(breaker.allows(ENDPOINT)).toBe(true);
  });

  it('reports every transition once', () => {
    const clock = fixedClock();
    const onStateChange = vi.fn();
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 10, now: clock.now, onStateChange });
    breaker.recordFailure(ENDPOINT);
    clock.advance(11);
    breaker.allows(ENDPOINT);
    breaker.recordSuccess(ENDPOINT);
    expect(onStateChange.mock.calls.map(c => `${c[1]}->${c[2]}`))
      .toEqual(['closed->open', 'open->half-open', 'half-open->closed']);
  });
});

describe('countsAsBreakerFailure', () => {
  it('counts 429 and 5xx', () => {
    expect(countsAsBreakerFailure(429)).toBe(true);
    expect(countsAsBreakerFailure(500)).toBe(true);
    expect(countsAsBreakerFailure(503)).toBe(true);
  });

  it('does NOT count other 4xx — an expired key must keep saying so', () => {
    // Fast-failing a 401 behind a generic "temporarily unavailable" would hide
    // the one error the user can act on, and waiting would not fix it either.
    expect(countsAsBreakerFailure(400)).toBe(false);
    expect(countsAsBreakerFailure(401)).toBe(false);
    expect(countsAsBreakerFailure(403)).toBe(false);
    expect(countsAsBreakerFailure(404)).toBe(false);
  });

  it('does not count success', () => {
    expect(countsAsBreakerFailure(200)).toBe(false);
  });
});

describe('breakerEndpointKey', () => {
  it('keys on origin, so every path to one provider shares a circuit', () => {
    expect(breakerEndpointKey('https://api.anthropic.com/v1/messages')).toBe(ENDPOINT);
    expect(breakerEndpointKey(new URL('https://api.anthropic.com/v1/complete'))).toBe(ENDPOINT);
  });

  it('falls back to the raw input rather than throwing on a non-URL', () => {
    expect(breakerEndpointKey('not a url')).toBe('not a url');
  });
});

describe('wrapFetchWithBreaker', () => {
  const ok = () => new Response('{}', { status: 200 });
  const fail = () => new Response('{}', { status: 503 });

  it('passes calls through while the breaker is closed', async () => {
    const inner = vi.fn(async () => ok());
    const wrapped = wrapFetchWithBreaker(new CircuitBreaker(), inner as unknown as typeof fetch);
    const res = await wrapped(`${ENDPOINT}/v1/messages`);
    expect(res.status).toBe(200);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it('returns a synthetic 503 WITHOUT calling through once open', async () => {
    // A 503 rather than a throw, so every existing non-ok path keeps working.
    const inner = vi.fn(async () => fail());
    const wrapped = wrapFetchWithBreaker(
      new CircuitBreaker({ failureThreshold: 2 }),
      inner as unknown as typeof fetch,
    );
    await wrapped(`${ENDPOINT}/v1/messages`);
    await wrapped(`${ENDPOINT}/v1/messages`);
    expect(inner).toHaveBeenCalledTimes(2);

    const res = await wrapped(`${ENDPOINT}/v1/messages`);
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(await res.json()).toMatchObject({ error: { type: 'circuit_open' } });
    expect(inner).toHaveBeenCalledTimes(2); // never dialled again
  });

  it('counts a thrown network error or timeout, and still rethrows it', async () => {
    const boom = new Error('fetch failed');
    const inner = vi.fn(async () => { throw boom; });
    const breaker = new CircuitBreaker({ failureThreshold: 1 });
    const wrapped = wrapFetchWithBreaker(breaker, inner as unknown as typeof fetch);
    await expect(wrapped(`${ENDPOINT}/v1/messages`)).rejects.toThrow('fetch failed');
    expect(breaker.stateOf(ENDPOINT)).toBe('open');
  });

  it('does not open on a 401, however many times it repeats', async () => {
    const inner = vi.fn(async () => new Response('{}', { status: 401 }));
    const breaker = new CircuitBreaker({ failureThreshold: 2 });
    const wrapped = wrapFetchWithBreaker(breaker, inner as unknown as typeof fetch);
    for (let i = 0; i < 5; i += 1) await wrapped(`${ENDPOINT}/v1/messages`);
    expect(breaker.stateOf(ENDPOINT)).toBe('closed');
    expect(inner).toHaveBeenCalledTimes(5);
  });
});
