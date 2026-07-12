/**
 * Phase 1 — Network exposure & auth boundary regression tests.
 *
 * Covers: R1-001 (loopback bind + /health token leak), R2-003 (CORS exact
 * match), R2-004 (Host-header allowlist), R2-006 (/api/debug/logs gate),
 * R6-005 (/api/browse/* gate). Each test reproduces the issue before the fix.
 */

import { describe, it, expect, afterEach } from 'vitest';
import Fastify from 'fastify';
import { isLocalOrigin, isLocalRequest } from '../../src/local/origin-guard.js';
import { resolveBindHost, isLoopbackBind } from '../../src/local/net-config.js';
import { corsOriginAllowed } from '../../src/local/cors-config.js';
import { browseRoutes } from '../../src/local/routes/browse.js';
import { securityMiddleware, hostHeaderAllowed } from '../../src/local/security-middleware.js';

// ── R2-006 / R6-005 — shared same-origin guard ──────────────────────────

describe('isLocalOrigin', () => {
  it('allows local + tauri origins', () => {
    expect(isLocalOrigin('http://127.0.0.1:1420')).toBe(true);
    expect(isLocalOrigin('http://localhost:3333')).toBe(true);
    expect(isLocalOrigin('tauri://localhost')).toBe(true);
    expect(isLocalOrigin('http://tauri.localhost')).toBe(true);
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

// ── AV-5 — loopback recognised for all loopback host forms ──────────────
// Regression: isLoopbackBind() compared only to '127.0.0.1', so localhost / ::1
// disabled the Host allowlist while still binding locally.
describe('isLoopbackBind (AV-5)', () => {
  it('true for the loopback default', () => expect(isLoopbackBind({})).toBe(true));
  it('true for WAGGLE_HOST=localhost', () => expect(isLoopbackBind({ WAGGLE_HOST: 'localhost' })).toBe(true));
  it('true for WAGGLE_HOST=::1 (IPv6 loopback)', () => expect(isLoopbackBind({ WAGGLE_HOST: '::1' })).toBe(true));
  it('true for WAGGLE_HOST=::ffff:127.0.0.1', () => expect(isLoopbackBind({ WAGGLE_HOST: '::ffff:127.0.0.1' })).toBe(true));
  it('false for a public 0.0.0.0 bind', () => expect(isLoopbackBind({ WAGGLE_HOST: '0.0.0.0' })).toBe(false));
});

// ── R2-003 — CORS exact-origin match ────────────────────────────────────

describe('corsOriginAllowed', () => {
  const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
  const EXTENSION_ORIGIN = `chrome-extension://${EXTENSION_ID}`;
  const OTHER_EXTENSION_ORIGIN = 'chrome-extension://ponmlkjihgfedcbaponmlkjihgfedcba';
  const originalExtIds = process.env.WAGGLE_BROWSER_EXT_IDS;
  const originalDevAllow = process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;

  afterEach(() => {
    if (originalExtIds === undefined) delete process.env.WAGGLE_BROWSER_EXT_IDS;
    else process.env.WAGGLE_BROWSER_EXT_IDS = originalExtIds;
    if (originalDevAllow === undefined) delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;
    else process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION = originalDevAllow;
  });

  it('allows no-origin (same-origin / non-browser)', () => expect(corsOriginAllowed(undefined)).toBe(true));
  it('allows exact allowed origin', () => expect(corsOriginAllowed('http://localhost:1420')).toBe(true));
  it('allows Tauri webview localhost origins', () => {
    expect(corsOriginAllowed('tauri://localhost')).toBe(true);
    expect(corsOriginAllowed('http://tauri.localhost')).toBe(true);
    expect(corsOriginAllowed('https://tauri.localhost')).toBe(true);
  });
  it('allows loopback origins on arbitrary local dev/e2e ports', () => {
    expect(corsOriginAllowed('http://127.0.0.1:8081')).toBe(true);
    expect(corsOriginAllowed('http://127.0.0.1:8082')).toBe(true);
    expect(corsOriginAllowed('http://127.0.0.1:3344')).toBe(true);
    expect(corsOriginAllowed('http://localhost:3344')).toBe(true);
  });
  it('rejects prefix-bypass origin', () => {
    expect(corsOriginAllowed('http://localhost:1420.evil.com')).toBe(false);
    expect(corsOriginAllowed('http://127.0.0.1.evil.com:3344')).toBe(false);
    expect(corsOriginAllowed('https://evil.example.com')).toBe(false);
    expect(corsOriginAllowed('https://localhost:3344')).toBe(false);
  });
  it('allows only configured Browser Companion extension ids', () => {
    process.env.WAGGLE_BROWSER_EXT_IDS = EXTENSION_ID;
    delete process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION;

    expect(corsOriginAllowed(EXTENSION_ORIGIN)).toBe(true);
    expect(corsOriginAllowed(OTHER_EXTENSION_ORIGIN)).toBe(false);
  });
  it('allows concrete Browser Companion extension origins in explicit dev mode', () => {
    delete process.env.WAGGLE_BROWSER_EXT_IDS;
    process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION = '1';

    expect(corsOriginAllowed(EXTENSION_ORIGIN)).toBe(true);
    expect(corsOriginAllowed(OTHER_EXTENSION_ORIGIN)).toBe(true);
  });
});

// ── R6-005 — /api/browse/* same-origin gate (integration) ───────────────

describe('browse routes same-origin gate (R6-005)', () => {
  let server: ReturnType<typeof Fastify>;
  afterEach(async () => { if (server) await server.close(); });

  it('rejects directory listing from an external origin', async () => {
    server = Fastify({ logger: false });
    await server.register(browseRoutes);
    await server.ready();
    const res = await server.inject({
      method: 'GET', url: '/api/browse/local?path=/',
      headers: { origin: 'https://evil.example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('rejects mkdir from an external origin', async () => {
    server = Fastify({ logger: false });
    await server.register(browseRoutes);
    await server.ready();
    const res = await server.inject({
      method: 'POST', url: '/api/browse/local/mkdir',
      headers: { origin: 'https://evil.example.com' },
      payload: { path: '/tmp/waggle-should-not-create' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('allows directory listing with no origin (same-host)', async () => {
    server = Fastify({ logger: false });
    await server.register(browseRoutes);
    await server.ready();
    const res = await server.inject({ method: 'GET', url: '/api/browse/local?path=/' });
    expect(res.statusCode).not.toBe(403);
  });
});

// ── R2-004 — Host-header allowlist (integration) ────────────────────────

describe('Host-header allowlist (R2-004)', () => {
  let server: ReturnType<typeof Fastify>;
  afterEach(async () => { if (server) await server.close(); });

  async function mk() {
    const s = Fastify({ logger: false });
    await s.register(securityMiddleware, { sessionToken: 'tok' });
    s.get('/api/test', async () => ({ ok: true }));
    await s.ready();
    return s;
  }

  it('rejects a foreign Host header (DNS-rebind) when loopback-bound', async () => {
    server = await mk();
    const res = await server.inject({ method: 'GET', url: '/api/test', headers: { host: 'evil.example.com' } });
    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe('BAD_HOST');
  });

  it('allows a localhost Host header', async () => {
    server = await mk();
    // D1: localhost now requires a token, so present it to isolate the Host check.
    const res = await server.inject({ method: 'GET', url: '/api/test', headers: { host: '127.0.0.1:3333', authorization: 'Bearer tok' } });
    expect(res.statusCode).toBe(200);
  });
});

// ── AV-1 — Host allowlist fails closed on absent/empty Host ──────────────
// fastify.inject() always supplies a default authority, so the truly-absent-Host
// case is verified at the unit level on the extracted pure policy function.
describe('hostHeaderAllowed (AV-1)', () => {
  const allow = new Set(['127.0.0.1', 'localhost', '::1']);
  it('rejects an absent Host', () => expect(hostHeaderAllowed(undefined, allow)).toBe(false));
  it('rejects an empty Host', () => expect(hostHeaderAllowed('', allow)).toBe(false));
  it('strips the port and allows a known host', () => expect(hostHeaderAllowed('127.0.0.1:3333', allow)).toBe(true));
  it('rejects an unknown host', () => expect(hostHeaderAllowed('evil.example.com', allow)).toBe(false));
});
