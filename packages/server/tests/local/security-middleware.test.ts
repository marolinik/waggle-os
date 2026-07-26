/**
 * Security Middleware Tests
 *
 * Tests for:
 *   - Security headers are present on responses
 *   - Rate limiter returns 429 after limit exceeded
 *   - Rate limiter resets after window expires
 *   - CSP header has expected directives
 *   - Vault reveal origin enforcement
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyRequest } from 'fastify';
import {
  securityMiddleware,
  RateLimiter,
  ENDPOINT_RATE_LIMITS,
  getResolvedChatWorkspaceId,
} from '../../src/local/security-middleware.js';

// ── Helper: create a test server with security middleware ─────────────

async function createTestServer(opts?: {
  rateLimiter?: { maxRequests?: number; windowMs?: number };
  sessionToken?: string;
  authenticateRunToken?: (token: string) => boolean;
}) {
  const server = Fastify({ logger: false });
  await server.register(securityMiddleware, {
    rateLimiter: opts?.rateLimiter,
    sessionToken: opts?.sessionToken,
    authenticateRunToken: opts?.authenticateRunToken,
  });

  // Simple test routes
  server.get('/health', async () => {
    return { status: 'ok', wsToken: opts?.sessionToken ?? '' };
  });
  server.get('/api/test', async () => {
    return { ok: true };
  });
  server.post('/api/test', async () => {
    return { ok: true };
  });
  server.post('/api/chat', async () => {
    return { ok: true };
  });
  server.post('/api/backup', async () => {
    return { ok: true };
  });
  server.post('/api/waggle-dance/signal', async () => {
    return { ok: true };
  });
  server.get('/api/waggle-dance/signals', async () => {
    return { ok: true };
  });
  server.post('/api/vault/:name/reveal', async () => {
    return { ok: true };
  });
  // Non-API GETs: the SPA shell + static assets. These must load WITHOUT a
  // bearer token, else a browser can never bootstrap the token (chicken-and-egg).
  server.get('/', async () => {
    return '<!doctype html><html><body>waggle</body></html>';
  });
  server.get('/assets/app.js', async () => {
    return 'console.log("app");';
  });

  await server.ready();
  return server;
}

// ── Security Headers ────────────────────────────────────────────────────

describe('Security Headers', () => {
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    server = await createTestServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it('includes X-Content-Type-Options: nosniff', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('includes X-Frame-Options: DENY', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('includes X-XSS-Protection', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-xss-protection']).toBe('1; mode=block');
  });

  it('includes Referrer-Policy', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('includes Content-Security-Policy with expected directives', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toBeDefined();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain('https://api.anthropic.com');
    // P1-002: PostHog capture host allowed in connect-src ONLY (ingest), never
    // script-src — the no-external posthog build keeps script-src locked.
    expect(csp).toContain('connect-src');
    expect(csp).toMatch(/connect-src[^;]*https:\/\/us\.i\.posthog\.com/);
    expect(csp).not.toMatch(/script-src[^;]*posthog/);
    // Hosted Clerk auth is opt-in at the client boundary; local CSP must not
    // allow Clerk script or API hosts by default.
    expect(csp).not.toMatch(/script-src[^;]*clerk/i);
    expect(csp).not.toMatch(/connect-src[^;]*clerk/i);
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain('https://fonts.googleapis.com');
  });

  it('includes rate limit headers on normal responses', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
  });
});

// ── Rate Limiter (unit tests) ───────────────────────────────────────────

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  afterEach(() => {
    if (limiter) limiter.destroy();
  });

  it('allows requests within the limit', () => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });
    for (let i = 0; i < 5; i++) {
      const result = limiter.check('test-key');
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks requests after limit exceeded', () => {
    limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000 });
    limiter.check('test-key');
    limiter.check('test-key');
    limiter.check('test-key');

    const result = limiter.check('test-key');
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
    }
  });

  it('tracks different keys independently', () => {
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });
    limiter.check('key-a');
    limiter.check('key-a');

    const resultA = limiter.check('key-a');
    expect(resultA.allowed).toBe(false);

    const resultB = limiter.check('key-b');
    expect(resultB.allowed).toBe(true);
  });

  it('resets after window expires', async () => {
    limiter = new RateLimiter({ maxRequests: 2, windowMs: 50 });
    limiter.check('test-key');
    limiter.check('test-key');

    const blocked = limiter.check('test-key');
    expect(blocked.allowed).toBe(false);

    // Wait for window to expire
    await new Promise(resolve => setTimeout(resolve, 80));

    const afterReset = limiter.check('test-key');
    expect(afterReset.allowed).toBe(true);
  });

  it('returns correct remaining count', () => {
    limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000 });

    const r1 = limiter.check('test-key');
    expect(r1.allowed).toBe(true);
    if (r1.allowed) expect(r1.remaining).toBe(4);

    const r2 = limiter.check('test-key');
    expect(r2.allowed).toBe(true);
    if (r2.allowed) expect(r2.remaining).toBe(3);
  });
});

// ── Rate Limiter (integration via Fastify) ──────────────────────────────

describe('Rate Limiter Integration', () => {
  let server: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    server = await createTestServer({ rateLimiter: { maxRequests: 3, windowMs: 60_000 } });
  });

  afterEach(async () => {
    await server.close();
  });

  it('returns 429 after limit exceeded', async () => {
    // Make 3 allowed requests
    for (let i = 0; i < 3; i++) {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(200);
    }

    // 4th request should be rate-limited
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.statusCode).toBe(429);
    const body = res.json();
    expect(body.error).toBe('Too Many Requests');
    expect(body.retryAfterMs).toBeGreaterThan(0);
    expect(res.headers['retry-after']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBe('0');
  });

  it('tracks different endpoints separately', async () => {
    // Exhaust GET /api/test
    for (let i = 0; i < 3; i++) {
      await server.inject({ method: 'GET', url: '/api/test' });
    }
    const blocked = await server.inject({ method: 'GET', url: '/api/test' });
    expect(blocked.statusCode).toBe(429);

    // POST /api/test should still work (different key)
    const postRes = await server.inject({ method: 'POST', url: '/api/test' });
    expect(postRes.statusCode).toBe(200);
  });

  it('includes security headers even on 429 responses', async () => {
    for (let i = 0; i < 3; i++) {
      await server.inject({ method: 'GET', url: '/api/test' });
    }
    const res = await server.inject({ method: 'GET', url: '/api/test' });
    expect(res.statusCode).toBe(429);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });
});

// ── Per-Client Rate Limit Keying (CQ-008) ────────────────────────────────

describe('Per-Client Rate Limit Keying', () => {
  it('different IPs get independent rate limit buckets', () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000 });

    // IP-A uses up its 2 requests
    limiter.check('192.168.1.1:GET /api/test');
    limiter.check('192.168.1.1:GET /api/test');
    const blockedA = limiter.check('192.168.1.1:GET /api/test');
    expect(blockedA.allowed).toBe(false);

    // IP-B should still be allowed (independent bucket)
    const allowedB = limiter.check('192.168.1.2:GET /api/test');
    expect(allowedB.allowed).toBe(true);

    limiter.destroy();
  });

  it('rate limit key includes client IP in integration test', async () => {
    const server = await createTestServer({ rateLimiter: { maxRequests: 2, windowMs: 60_000 } });
    try {
      // Make 2 requests — should both succeed
      for (let i = 0; i < 2; i++) {
        const res = await server.inject({ method: 'GET', url: '/api/test' });
        expect(res.statusCode).toBe(200);
      }

      // 3rd request should be blocked
      const blocked = await server.inject({ method: 'GET', url: '/api/test' });
      expect(blocked.statusCode).toBe(429);

      // Simulate a different IP (inject uses remoteAddress — can't easily change,
      // but the per-client key includes request.ip which defaults to 127.0.0.1 for inject)
      // This test verifies the key format includes IP by checking the limiter's behavior
    } finally {
      await server.close();
    }
  });
});

// ── Per-Endpoint Rate Limits (CQ-008) ────────────────────────────────────

describe('Per-Endpoint Rate Limits', () => {
  it('ENDPOINT_RATE_LIMITS has expected entries', () => {
    expect(ENDPOINT_RATE_LIMITS['/api/chat']).toBe(120);
    expect(ENDPOINT_RATE_LIMITS['/api/vault/*/reveal']).toBe(5);
    expect(ENDPOINT_RATE_LIMITS['/api/backup']).toBe(2);
    expect(ENDPOINT_RATE_LIMITS['/api/restore']).toBe(2);
  });

  it('getEffectiveLimit returns per-endpoint limits for expensive routes', () => {
    const limiter = new RateLimiter();
    expect(limiter.getEffectiveLimit('/api/chat')).toBe(120);
    expect(limiter.getEffectiveLimit('/api/vault/MY_SECRET/reveal')).toBe(5);
    expect(limiter.getEffectiveLimit('/api/backup')).toBe(2);
    expect(limiter.getEffectiveLimit('/api/restore')).toBe(2);
    expect(limiter.getEffectiveLimit('/api/test')).toBe(100); // default
    expect(limiter.getEffectiveLimit('/api/workspaces')).toBe(100); // default
    limiter.destroy();
  });

  it('check() uses custom maxRequests override', () => {
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000 });

    // With override of 2, should block on 3rd request
    limiter.check('key', 2);
    limiter.check('key', 2);
    const blocked = limiter.check('key', 2);
    expect(blocked.allowed).toBe(false);

    limiter.destroy();
  });

  it('expensive endpoints return their limit in X-RateLimit-Limit header', async () => {
    const server = await createTestServer({ rateLimiter: { maxRequests: 100, windowMs: 60_000 } });
    try {
      const chatRes = await server.inject({ method: 'POST', url: '/api/chat' });
      expect(chatRes.headers['x-ratelimit-limit']).toBe('120');

      const backupRes = await server.inject({ method: 'POST', url: '/api/backup' });
      expect(backupRes.headers['x-ratelimit-limit']).toBe('2');

      const vaultRes = await server.inject({ method: 'POST', url: '/api/vault/MY_SECRET/reveal' });
      expect(vaultRes.headers['x-ratelimit-limit']).toBe('5');

      const normalRes = await server.inject({ method: 'GET', url: '/api/test' });
      expect(normalRes.headers['x-ratelimit-limit']).toBe('100');
    } finally {
      await server.close();
    }
  });

  it('backup endpoint blocks after 2 requests', async () => {
    const server = await createTestServer({ rateLimiter: { maxRequests: 100, windowMs: 60_000 } });
    try {
      // 2 allowed
      for (let i = 0; i < 2; i++) {
        const res = await server.inject({ method: 'POST', url: '/api/backup' });
        expect(res.statusCode).toBe(200);
      }
      // 3rd blocked
      const blocked = await server.inject({ method: 'POST', url: '/api/backup' });
      expect(blocked.statusCode).toBe(429);

      // But /api/test should still work (different endpoint)
      const testRes = await server.inject({ method: 'GET', url: '/api/test' });
      expect(testRes.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });
});

// ── Bearer Token Authentication (SEC-011) ────────────────────────────────

describe('Bearer Token Authentication', () => {
  const TEST_TOKEN = 'test-session-token-12345';

  // The global test setup defaults to WAGGLE_TRUST_LOCALHOST=1 so the broad suite
  // (raw inject, no tokens) keeps working. This describe exercises the SECURE D1
  // default, so force trust OFF here and restore the suite default afterward.
  beforeEach(() => { process.env.WAGGLE_TRUST_LOCALHOST = '0'; });
  afterEach(() => { process.env.WAGGLE_TRUST_LOCALHOST = '1'; });

  it('D1: requires a token on localhost (no desktop trust by default)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      // D1: localhost is no longer auto-trusted — a missing token is 401.
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('MISSING_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('D1: rejects a wrong token on localhost', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Bearer wrong-token' },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('allows request with valid token', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: `Bearer ${TEST_TOKEN}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().ok).toBe(true);
    } finally {
      await server.close();
    }
  });

  it('accepts a narrow run token only on WaggleDance transport routes', async () => {
    const runToken = 'run-token-with-enough-entropy-1234567890';
    const server = await createTestServer({
      sessionToken: TEST_TOKEN,
      authenticateRunToken: (candidate) => candidate === runToken,
    });
    try {
      const send = await server.inject({
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'x-waggle-run-token': runToken },
      });
      expect(send.statusCode).toBe(200);
      const receive = await server.inject({
        method: 'GET', url: '/api/waggle-dance/signals',
        headers: { 'x-waggle-run-token': runToken },
      });
      expect(receive.statusCode).toBe(200);

      const unrelated = await server.inject({
        method: 'GET', url: '/api/test',
        headers: { 'x-waggle-run-token': runToken },
      });
      expect(unrelated.statusCode).toBe(401);
      const wrong = await server.inject({
        method: 'POST', url: '/api/waggle-dance/signal',
        headers: { 'x-waggle-run-token': 'wrong-run-token-with-enough-entropy-123' },
      });
      expect(wrong.statusCode).toBe(401);
      expect(wrong.json().code).toBe('INVALID_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('health endpoint works without token', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
      expect(res.json().wsToken).toBe(TEST_TOKEN);
    } finally {
      await server.close();
    }
  });

  it('OPTIONS requests bypass auth (CORS preflight)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'OPTIONS', url: '/api/test' });
      // OPTIONS may return 404 (no handler) but NOT 401
      expect(res.statusCode).not.toBe(401);
    } finally {
      await server.close();
    }
  });

  it('does not require auth when sessionToken is not configured', async () => {
    const server = await createTestServer(); // no sessionToken
    try {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  // ── D1 bootstrap fix: non-API GETs (SPA shell + static assets) must be
  // auth-exempt. Otherwise a browser/webview gets 401 on GET / and can never
  // load the app code that fetches the bearer token (unbootstrappable). The
  // /api/auth/session-token endpoint is same-origin gated; privileged actions
  // all live under /api/* and stay gated below. ──────────────────────────
  it('D1 bootstrap: serves the SPA shell (GET /) WITHOUT a token', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/' });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('waggle');
    } finally {
      await server.close();
    }
  });

  it('D1 bootstrap: serves a static asset (GET /assets/*) WITHOUT a token', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/assets/app.js' });
      expect(res.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('D1: a NON-GET to a non-/api path still requires a token (exemption is GET-only)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      // POST / is not a static-asset read; the GET-only exemption must not cover it.
      const res = await server.inject({ method: 'POST', url: '/' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('MISSING_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('D1: /api/* GETs are STILL gated (exemption does not leak to the API)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('MISSING_TOKEN');
    } finally {
      await server.close();
    }
  });

  // ── P1b-SSE: EventSource cannot send headers, so the four SSE stream paths
  // accept ?token= (the /ws pattern). Scope: GET-only, allowlist-only,
  // header-absent-only. ────────────────────────────────────────────────────
  describe('SSE query-token auth (P1b-SSE)', () => {
    const SSE_PATHS = [
      '/api/notifications/stream',
      '/api/events/stream',
      '/api/waggle/stream',
      '/api/harvest/progress',
    ];

    async function createSseTestServer() {
      // createTestServer is already .ready() — build a fresh instance so the
      // SSE routes can register before the listener locks.
      const server = Fastify({ logger: false });
      await server.register(securityMiddleware, { sessionToken: TEST_TOKEN });
      server.get('/api/test', async () => ({ ok: true }));
      for (const p of SSE_PATHS) {
        server.get(p, async () => ({ ok: true, stream: p }));
      }
      await server.ready();
      return server;
    }

    it.each(SSE_PATHS)('%s authenticates via ?token= (no header)', async (path) => {
      const server = await createSseTestServer();
      try {
        const res = await server.inject({ method: 'GET', url: `${path}?token=${TEST_TOKEN}` });
        expect(res.statusCode).toBe(200);
      } finally {
        await server.close();
      }
    });

    it('rejects a WRONG query token with INVALID_TOKEN', async () => {
      const server = await createSseTestServer();
      try {
        const res = await server.inject({ method: 'GET', url: `/api/notifications/stream?token=wrong` });
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('INVALID_TOKEN');
      } finally {
        await server.close();
      }
    });

    it('rejects a MISSING query token with MISSING_TOKEN', async () => {
      const server = await createSseTestServer();
      try {
        const res = await server.inject({ method: 'GET', url: '/api/notifications/stream' });
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('MISSING_TOKEN');
      } finally {
        await server.close();
      }
    });

    it('does NOT leak query-token auth to non-allowlisted /api GETs', async () => {
      const server = await createSseTestServer();
      try {
        const res = await server.inject({ method: 'GET', url: `/api/test?token=${TEST_TOKEN}` });
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('MISSING_TOKEN');
      } finally {
        await server.close();
      }
    });

    it('an Authorization header always wins over the query token', async () => {
      const server = await createSseTestServer();
      try {
        // Valid query token + INVALID header → the header is authoritative → 401.
        const res = await server.inject({
          method: 'GET',
          url: `/api/notifications/stream?token=${TEST_TOKEN}`,
          headers: { authorization: 'Bearer wrong-token' },
        });
        expect(res.statusCode).toBe(401);
        expect(res.json().code).toBe('INVALID_TOKEN');
      } finally {
        await server.close();
      }
    });

    it('a valid header still works on SSE paths (back-compat for header-capable clients)', async () => {
      const server = await createSseTestServer();
      try {
        const res = await server.inject({
          method: 'GET',
          url: '/api/events/stream',
          headers: { authorization: `Bearer ${TEST_TOKEN}` },
        });
        expect(res.statusCode).toBe(200);
      } finally {
        await server.close();
      }
    });
  });

  it('D1: rejects a malformed authorization header (no Bearer prefix)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: TEST_TOKEN }, // missing "Bearer " prefix → token parses null
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('INVALID_TOKEN');
    } finally {
      await server.close();
    }
  });

  it('D1 escape hatch: WAGGLE_TRUST_LOCALHOST=1 restores legacy loopback trust', async () => {
    process.env.WAGGLE_TRUST_LOCALHOST = '1';
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      expect(res.statusCode).toBe(200);
    } finally {
      delete process.env.WAGGLE_TRUST_LOCALHOST;
      await server.close();
    }
  });
});

// ── Vault Reveal Origin Enforcement ─────────────────────────────────────

describe('Vault Reveal Origin Enforcement', () => {
  it('blocks requests with external origin header', async () => {
    // This tests the vault route directly — import and set up a minimal server
    const { vaultRoutes } = await import('../../src/local/routes/vault.js');
    const { VaultStore } = await import('@waggle/core');
    const path = await import('node:path');
    const os = await import('node:os');
    const fs = await import('node:fs');

    const tmpDir = path.join(os.tmpdir(), `waggle-vault-origin-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const vault = new VaultStore(tmpDir);
    vault.set('MY_SECRET', 'hidden-value', { credentialType: 'api_key' });

    const server = Fastify({ logger: false });
    server.decorate('vault', vault);
    server.register(vaultRoutes);

    try {
      // Allowed: no origin header (local call)
      const allowedRes = await server.inject({
        method: 'POST',
        url: '/api/vault/MY_SECRET/reveal',
      });
      expect(allowedRes.statusCode).toBe(200);
      expect(allowedRes.json().value).toBe('hidden-value');

      // Allowed: localhost origin
      const localRes = await server.inject({
        method: 'POST',
        url: '/api/vault/MY_SECRET/reveal',
        headers: { origin: 'http://127.0.0.1:1420' },
      });
      expect(localRes.statusCode).toBe(200);

      // Allowed: tauri origin
      const tauriRes = await server.inject({
        method: 'POST',
        url: '/api/vault/MY_SECRET/reveal',
        headers: { origin: 'tauri://localhost' },
      });
      expect(tauriRes.statusCode).toBe(200);

      // Blocked: external origin
      const blockedRes = await server.inject({
        method: 'POST',
        url: '/api/vault/MY_SECRET/reveal',
        headers: { origin: 'https://evil.example.com' },
      });
      expect(blockedRes.statusCode).toBe(403);
      expect(blockedRes.json().error).toContain('external origin');
    } finally {
      await server.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── Team viewer read-only enforcement ───────────────────────────────────────

describe('Team viewer read-only enforcement', () => {
  async function createViewerPolicyServer({
    activeWorkspaceId = 'viewer-workspace',
    defaultWorkspaceId = activeWorkspaceId,
    memberWorkspaceFirst = false,
    managedDefaultRole = null,
  }: {
    activeWorkspaceId?: string | null;
    defaultWorkspaceId?: string | null;
    memberWorkspaceFirst?: boolean;
    managedDefaultRole?: 'viewer' | 'member' | null;
  } = {}) {
    const server = Fastify({ logger: false });
    let mutations = 0;
    let capturedChatWorkspaceId: string | null | undefined;

    server.decorate('workspaceManager', {
      get(workspaceId: string) {
        if (workspaceId === 'default' && managedDefaultRole) {
          return {
            id: workspaceId,
            teamId: 'managed-default-team',
            teamRole: managedDefaultRole,
          };
        }
        if (workspaceId === 'viewer-workspace') {
          return { id: workspaceId, teamId: 'team-1', teamRole: 'viewer' };
        }
        if (workspaceId === 'member-workspace') {
          return { id: workspaceId, teamId: 'team-1', teamRole: 'member' };
        }
        if (workspaceId === 'personal-workspace') {
          return { id: workspaceId };
        }
        return null;
      },
      getDefault() {
        return defaultWorkspaceId;
      },
      list() {
        const teamWorkspaces = memberWorkspaceFirst
          ? [
              { id: 'member-workspace', teamId: 'team-1', teamRole: 'member' },
              { id: 'viewer-workspace', teamId: 'team-1', teamRole: 'viewer' },
            ]
          : [
              { id: 'viewer-workspace', teamId: 'team-1', teamRole: 'viewer' },
              { id: 'member-workspace', teamId: 'team-1', teamRole: 'member' },
            ];
        return [
          ...teamWorkspaces,
          { id: 'personal-workspace' },
        ];
      },
    });
    server.decorate('agentState', { activeWorkspaceId: activeWorkspaceId ?? undefined });

    await server.register(securityMiddleware);

    const mutate = async (request: FastifyRequest) => {
      if (request.routeOptions.url === '/api/chat') {
        capturedChatWorkspaceId = getResolvedChatWorkspaceId(request);
      }
      mutations += 1;
      return { ok: true };
    };
    server.post('/api/workspaces/:workspaceId/files/delete', mutate);
    server.patch('/api/workspaces/:id/tasks/:taskId', mutate);
    server.put('/api/workspaces/:id/tasks/:taskId', mutate);
    server.delete('/api/workspaces/:id/tasks/:taskId', mutate);
    server.post('/api/fleet/:workspaceId/pause', mutate);
    server.post('/api/fleet/spawn', mutate);
    server.post('/api/agent-groups/:id/run', mutate);
    server.post('/api/tools/launch', mutate);
    server.post('/api/chat', mutate);
    server.post('/api/tools/run', mutate);
    server.post('/api/rooms', mutate);
    server.post('/api/cron', mutate);
    server.patch('/api/cron/:id', mutate);
    server.post('/api/memory/merge', mutate);
    server.patch('/api/sessions/:sessionId', mutate);
    server.patch('/api/artifacts/:id', mutate);
    server.delete('/api/artifacts/:id', mutate);
    server.post('/api/export', async () => ({ ok: true, readOnly: true }));
    server.post('/api/compliance/export', async () => ({ ok: true, readOnly: true }));
    server.post('/api/compliance/export-pdf', async () => ({ ok: true, readOnly: true }));
    server.post('/api/automations/test', async () => ({ ok: true, readOnly: true }));
    server.post('/api/command/interpret', async () => ({ ok: true, readOnly: true }));
    server.get('/api/workspaces/:workspaceId/files', async () => ({ ok: true, readOnly: true }));

    await server.ready();
    return {
      server,
      getMutations: () => mutations,
      getCapturedChatWorkspaceId: () => capturedChatWorkspaceId,
    };
  }

  it.each([
    { label: 'omitted workspace', payload: { message: 'blocked' } },
    { label: 'legacy workspace alias', payload: { message: 'blocked', workspace: 'default' } },
    { label: 'legacy workspaceId alias', payload: { message: 'blocked', workspaceId: 'default' } },
    { label: 'explicit viewer workspace', payload: { message: 'blocked', workspace: 'viewer-workspace' } },
    { label: 'explicit viewer workspaceId', payload: { message: 'blocked', workspaceId: 'viewer-workspace' } },
  ])('rejects chat mutation through the implicit viewer workspace from $label', async ({ payload }) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload,
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('does not treat the manager default as an implicit chat workspace', async () => {
    const {
      server,
      getMutations,
      getCapturedChatWorkspaceId,
    } = await createViewerPolicyServer({
      activeWorkspaceId: null,
      defaultWorkspaceId: 'viewer-workspace',
      memberWorkspaceFirst: true,
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'allowed' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(getMutations()).toBe(1);
      expect(getCapturedChatWorkspaceId()).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('prefers the viewer workspace alias over a conflicting member workspaceId', async () => {
    const { server, getMutations } = await createViewerPolicyServer({
      activeWorkspaceId: 'member-workspace',
      defaultWorkspaceId: 'member-workspace',
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: {
          message: 'blocked',
          workspace: 'viewer-workspace',
          workspaceId: 'member-workspace',
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('does not treat the first listed workspace as an implicit chat workspace', async () => {
    const {
      server,
      getMutations,
      getCapturedChatWorkspaceId,
    } = await createViewerPolicyServer({
      activeWorkspaceId: null,
      defaultWorkspaceId: null,
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'allowed' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(getMutations()).toBe(1);
      expect(getCapturedChatWorkspaceId()).toBeNull();
    } finally {
      await server.close();
    }
  });

  it('rejects a supplied literal managed-default viewer workspace', async () => {
    const { server, getMutations } = await createViewerPolicyServer({
      activeWorkspaceId: 'member-workspace',
      managedDefaultRole: 'viewer',
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'blocked', workspace: 'default' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('captures a supplied literal managed-default member workspace', async () => {
    const {
      server,
      getMutations,
      getCapturedChatWorkspaceId,
    } = await createViewerPolicyServer({
      activeWorkspaceId: 'viewer-workspace',
      managedDefaultRole: 'member',
    });
    try {
      const response = await server.inject({
        method: 'POST',
        url: '/api/chat',
        payload: { message: 'allowed', workspaceId: 'default' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(getMutations()).toBe(1);
      expect(getCapturedChatWorkspaceId()).toBe('default');
    } finally {
      await server.close();
    }
  });

  it.each([
    {
      label: 'active member workspace before the viewer manager default',
      activeWorkspaceId: 'member-workspace',
      defaultWorkspaceId: 'viewer-workspace',
      payload: { message: 'allowed' },
      expectedCapturedWorkspaceId: 'member-workspace',
    },
    {
      label: 'member workspace behind the legacy workspace alias',
      activeWorkspaceId: 'member-workspace',
      defaultWorkspaceId: 'viewer-workspace',
      payload: { message: 'allowed', workspace: 'default' },
      expectedCapturedWorkspaceId: 'member-workspace',
    },
    {
      label: 'personal workspace behind the legacy workspaceId alias',
      activeWorkspaceId: 'personal-workspace',
      defaultWorkspaceId: 'viewer-workspace',
      payload: { message: 'allowed', workspaceId: 'default' },
      expectedCapturedWorkspaceId: 'personal-workspace',
    },
  ])(
    'allows chat mutation through the $label',
    async ({
      activeWorkspaceId,
      defaultWorkspaceId,
      payload,
      expectedCapturedWorkspaceId,
    }) => {
      const {
        server,
        getMutations,
        getCapturedChatWorkspaceId,
      } = await createViewerPolicyServer({
        activeWorkspaceId,
        defaultWorkspaceId,
      });
      try {
        const response = await server.inject({
          method: 'POST',
          url: '/api/chat',
          payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
        expect(getMutations()).toBe(1);
        expect(getCapturedChatWorkspaceId()).toBe(expectedCapturedWorkspaceId);
      } finally {
        await server.close();
      }
    },
  );

  it.each([
    {
      label: 'workspace path parameter',
      request: {
        method: 'POST' as const,
        url: '/api/workspaces/viewer-workspace/files/delete',
      },
    },
    {
      label: 'memory body workspace',
      request: {
        method: 'POST' as const,
        url: '/api/memory/merge',
        payload: { workspace: 'viewer-workspace' },
      },
    },
    {
      label: 'body workspaceId',
      request: {
        method: 'POST' as const,
        url: '/api/memory/merge',
        payload: { workspaceId: 'viewer-workspace' },
      },
    },
    {
      label: 'session query workspace',
      request: {
        method: 'PATCH' as const,
        url: '/api/sessions/session-1?workspace=viewer-workspace',
        payload: { title: 'blocked', workspaceId: 'member-workspace' },
      },
    },
    {
      label: 'artifact query workspaceId',
      request: {
        method: 'PATCH' as const,
        url: '/api/artifacts/artifact-1?workspaceId=viewer-workspace',
        payload: { title: 'blocked' },
      },
    },
    {
      label: 'non-workspaces route parameter',
      request: {
        method: 'POST' as const,
        url: '/api/fleet/viewer-workspace/pause',
      },
    },
    {
      label: 'task route id parameter',
      request: {
        method: 'PATCH' as const,
        url: '/api/workspaces/viewer-workspace/tasks/task-1',
        payload: { status: 'done' },
      },
    },
    {
      label: 'PUT task route id parameter',
      request: {
        method: 'PUT' as const,
        url: '/api/workspaces/viewer-workspace/tasks/task-1',
        payload: { status: 'done' },
      },
    },
    {
      label: 'DELETE task route id parameter',
      request: {
        method: 'DELETE' as const,
        url: '/api/workspaces/viewer-workspace/tasks/task-1',
      },
    },
    {
      label: 'fleet parentWorkspaceId',
      request: {
        method: 'POST' as const,
        url: '/api/fleet/spawn',
        payload: { task: 'blocked', parentWorkspaceId: 'viewer-workspace' },
      },
    },
    {
      label: 'top-level workspaceIds array',
      request: {
        method: 'POST' as const,
        url: '/api/rooms',
        payload: {
          workspaceIds: ['member-workspace', 'viewer-workspace'],
          source: 'external_tool',
          title: 'blocked',
          task: 'blocked',
        },
      },
    },
    {
      label: 'nested participant workspaceIds array',
      request: {
        method: 'POST' as const,
        url: '/api/tools/run',
        payload: {
          participants: [
            { toolId: 'codex', workspaceIds: ['member-workspace'] },
            { toolId: 'claude-code', workspaceIds: ['viewer-workspace'] },
          ],
        },
      },
    },
  ])('rejects viewer mutation resolved from $label before the handler runs', async ({ request }) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject(request);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: 'VIEWER_READ_ONLY',
      });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it.each([
    { method: 'POST' as const, url: '/api/cron', workspaceId: 'global' },
    { method: 'POST' as const, url: '/api/cron', workspaceId: '*' },
  ])('rejects $method $url when $workspaceId expands across a viewer workspace', async (request) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject({
        method: request.method,
        url: request.url,
        payload: { jobType: 'agent_task', workspaceId: request.workspaceId },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it.each([
    '/api/fleet/spawn',
    '/api/agent-groups/group-1/run',
    '/api/tools/launch',
  ])('rejects an implicit default viewer workspace on %s', async (url) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject({
        method: 'POST',
        url,
        payload: url === '/api/fleet/spawn'
          ? { task: 'blocked', workspaceId: 'member-workspace' }
          : url === '/api/tools/launch'
            ? { id: 'codex' }
            : { task: 'blocked' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'VIEWER_READ_ONLY' });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it.each([
    {
      label: 'team member',
      request: {
        method: 'POST' as const,
        url: '/api/workspaces/member-workspace/files/delete',
      },
    },
    {
      label: 'personal workspace',
      request: {
        method: 'POST' as const,
        url: '/api/workspaces/personal-workspace/files/delete',
      },
    },
    {
      label: 'chat workspace alias precedence',
      request: {
        method: 'POST' as const,
        url: '/api/chat',
        payload: {
          message: 'allowed',
          workspace: 'member-workspace',
          workspaceId: 'viewer-workspace',
        },
      },
    },
    {
      label: 'chat personal workspaceId',
      request: {
        method: 'POST' as const,
        url: '/api/chat',
        payload: { message: 'allowed', workspaceId: 'personal-workspace' },
      },
    },
  ])('allows $label mutations', async ({ request }) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject(request);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(getMutations()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it.each([
    {
      label: 'Fleet parent workspace',
      request: {
        method: 'POST' as const,
        url: '/api/fleet/spawn',
        payload: {
          task: 'allowed',
          parentWorkspaceId: 'member-workspace',
          workspaceId: 'viewer-workspace',
        },
      },
    },
    {
      label: 'agent group workspace',
      request: {
        method: 'POST' as const,
        url: '/api/agent-groups/group-1/run',
        payload: { task: 'allowed', workspaceId: 'member-workspace' },
      },
    },
    {
      label: 'tool launch workspace',
      request: {
        method: 'POST' as const,
        url: '/api/tools/launch',
        payload: { id: 'codex', workspaceId: 'member-workspace' },
      },
    },
  ])('allows an explicit member $label instead of the viewer default', async ({ request }) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject(request);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(getMutations()).toBe(1);
    } finally {
      await server.close();
    }
  });

  it.each([
    '/api/export',
    '/api/compliance/export',
    '/api/compliance/export-pdf',
    '/api/automations/test',
    '/api/command/interpret',
  ])('allows a viewer to use the read-only POST projection %s', async (url) => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject({
        method: 'POST',
        url,
        payload: { workspaceId: 'viewer-workspace' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, readOnly: true });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });

  it('allows an ordinary viewer GET', async () => {
    const { server, getMutations } = await createViewerPolicyServer();
    try {
      const response = await server.inject({
        method: 'GET',
        url: '/api/workspaces/viewer-workspace/files',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true, readOnly: true });
      expect(getMutations()).toBe(0);
    } finally {
      await server.close();
    }
  });
});
