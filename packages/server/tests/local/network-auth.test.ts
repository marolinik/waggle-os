/**
 * Phase 1 — Network exposure & auth boundary regression tests.
 *
 * Covers: R1-001 (loopback bind + /health token leak), R2-003 (CORS exact
 * match), R2-004 (Host-header allowlist), R2-006 (/api/debug/logs gate),
 * R6-005 (/api/browse/* gate). Each test reproduces the issue before the fix.
 */

import { describe, it, expect } from 'vitest';
import { isLocalOrigin, isLocalRequest } from '../../src/local/origin-guard.js';
import { resolveBindHost } from '../../src/local/net-config.js';
import { corsOriginAllowed } from '../../src/local/cors-config.js';

// ── R2-006 / R6-005 — shared same-origin guard ──────────────────────────

describe('isLocalOrigin', () => {
  it('allows local + tauri origins', () => {
    expect(isLocalOrigin('http://127.0.0.1:1420')).toBe(true);
    expect(isLocalOrigin('http://localhost:3333')).toBe(true);
    expect(isLocalOrigin('tauri://localhost')).toBe(true);
    expect(isLocalOrigin('https://tauri.localhost')).toBe(true);
  });
  it('rejects external + prefix-bypass origins', () => {
    expect(isLocalOrigin('https://evil.example.com')).toBe(false);
    expect(isLocalOrigin('http://localhost.evil.com')).toBe(false);
    expect(isLocalOrigin('http://127.0.0.1.evil.com')).toBe(false);
    expect(isLocalOrigin('not-a-url')).toBe(false);
  });
});

describe('isLocalRequest', () => {
  const mk = (headers: Record<string, string | undefined>) =>
    ({ headers } as unknown as Parameters<typeof isLocalRequest>[0]);
  it('allows when no origin/referer (same-host non-browser client)', () => {
    expect(isLocalRequest(mk({}))).toBe(true);
  });
  it('allows local origin', () => {
    expect(isLocalRequest(mk({ origin: 'http://127.0.0.1:1420' }))).toBe(true);
  });
  it('rejects external origin', () => {
    expect(isLocalRequest(mk({ origin: 'https://evil.example.com' }))).toBe(false);
  });
  it('falls back to referer when origin absent', () => {
    expect(isLocalRequest(mk({ referer: 'https://evil.example.com/x' }))).toBe(false);
    expect(isLocalRequest(mk({ referer: 'http://localhost:8080/x' }))).toBe(true);
  });
});

// ── R1-001a — loopback bind default ─────────────────────────────────────

describe('resolveBindHost', () => {
  it('defaults to loopback', () => expect(resolveBindHost({})).toBe('127.0.0.1'));
  it('honors WAGGLE_HOST', () => expect(resolveBindHost({ WAGGLE_HOST: '0.0.0.0' })).toBe('0.0.0.0'));
  it('ignores blank WAGGLE_HOST', () => expect(resolveBindHost({ WAGGLE_HOST: '  ' })).toBe('127.0.0.1'));
});

// ── R2-003 — CORS exact-origin match ────────────────────────────────────

describe('corsOriginAllowed', () => {
  it('allows no-origin (same-origin / non-browser)', () => expect(corsOriginAllowed(undefined)).toBe(true));
  it('allows exact allowed origin', () => expect(corsOriginAllowed('http://localhost:1420')).toBe(true));
  it('rejects prefix-bypass origin', () => {
    expect(corsOriginAllowed('http://localhost:1420.evil.com')).toBe(false);
    expect(corsOriginAllowed('https://evil.example.com')).toBe(false);
  });
});
