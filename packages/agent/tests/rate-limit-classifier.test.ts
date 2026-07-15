import { describe, expect, it } from 'vitest';
import {
  classifyRateLimitError,
  planRateLimitResume,
  type RateLimitAssessment,
} from '../src/rate-limit-classifier.js';

const NOW_MS = Date.UTC(2026, 6, 15, 10, 0, 0);
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

describe('classifyRateLimitError', () => {
  it.each([
    'HTTP 429 Too Many Requests',
    'Anthropic error: rate_limit_error',
    'OpenAI: Rate limit reached for this model',
    'Your quota exceeded',
  ])('detects a status-only rate-limit error: %s', (text) => {
    expect(classifyRateLimitError(text, NOW_MS)).toEqual({
      isRateLimit: true,
      resetAtMs: null,
      source: 'status-only',
    });
  });

  it('parses Retry-After delta-seconds', () => {
    expect(classifyRateLimitError('Retry-After: 120', NOW_MS)).toEqual({
      isRateLimit: true,
      resetAtMs: NOW_MS + 2 * MINUTE_MS,
      source: 'retry-after',
    });
  });

  it('parses Retry-After HTTP-dates with the caller-provided clock', () => {
    expect(
      classifyRateLimitError('Retry-After: Wed, 15 Jul 2026 10:05:00 GMT', NOW_MS),
    ).toEqual({
      isRateLimit: true,
      resetAtMs: NOW_MS + 5 * MINUTE_MS,
      source: 'retry-after',
    });
  });

  it.each([
    ['30s', 30_000],
    ['2m', 2 * MINUTE_MS],
    ['1h', HOUR_MS],
  ])('parses try-again duration %s', (duration, delayMs) => {
    expect(classifyRateLimitError(`Rate limited; try again in ${duration}`, NOW_MS)).toEqual({
      isRateLimit: true,
      resetAtMs: NOW_MS + delayMs,
      source: 'reset-phrase',
    });
  });

  it('parses an ISO reset timestamp', () => {
    expect(
      classifyRateLimitError('Rate limit reached; resets at 2026-07-15T10:45:00Z', NOW_MS),
    ).toEqual({
      isRateLimit: true,
      resetAtMs: NOW_MS + 45 * MINUTE_MS,
      source: 'reset-phrase',
    });
  });

  it('parses an HH:MM reset as the next UTC clock occurrence', () => {
    expect(classifyRateLimitError('Rate limit resets at 10:30', NOW_MS)).toEqual({
      isRateLimit: true,
      resetAtMs: NOW_MS + 30 * MINUTE_MS,
      source: 'reset-phrase',
    });
  });

  it('clamps reset times to at least 30 seconds from now', () => {
    expect(classifyRateLimitError('try again in 1s', NOW_MS).resetAtMs).toBe(NOW_MS + 30_000);
  });

  it('clamps reset times to no more than 12 hours from now', () => {
    expect(classifyRateLimitError('try again in 24h', NOW_MS).resetAtMs).toBe(
      NOW_MS + 12 * HOUR_MS,
    );
  });

  it('returns none for unrelated errors', () => {
    expect(classifyRateLimitError('ECONNREFUSED while contacting model', NOW_MS)).toEqual({
      isRateLimit: false,
      resetAtMs: null,
      source: 'none',
    });
  });
});

describe('planRateLimitResume', () => {
  it('adds a 30-second buffer to a parsed reset time', () => {
    const assessment: RateLimitAssessment = {
      isRateLimit: true,
      resetAtMs: NOW_MS + 5 * MINUTE_MS,
      source: 'reset-phrase',
    };
    expect(planRateLimitResume(assessment, NOW_MS)).toEqual({
      kind: 'scheduled',
      fireAtMs: NOW_MS + 5 * MINUTE_MS + 30_000,
    });
  });

  it('uses a conservative 15-minute default without a reset time', () => {
    expect(
      planRateLimitResume(
        { isRateLimit: true, resetAtMs: null, source: 'status-only' },
        NOW_MS,
      ),
    ).toEqual({ kind: 'scheduled', fireAtMs: NOW_MS + 15 * MINUTE_MS });
  });

  it('caps a scheduled resume at 12 hours', () => {
    expect(
      planRateLimitResume(
        { isRateLimit: true, resetAtMs: NOW_MS + 12 * HOUR_MS, source: 'reset-phrase' },
        NOW_MS,
      ),
    ).toEqual({ kind: 'scheduled', fireAtMs: NOW_MS + 12 * HOUR_MS });
  });

  it('requires manual handling for non-rate-limit errors', () => {
    expect(
      planRateLimitResume(
        { isRateLimit: false, resetAtMs: null, source: 'none' },
        NOW_MS,
      ),
    ).toEqual({ kind: 'manual', reason: 'not_rate_limited' });
  });
});
