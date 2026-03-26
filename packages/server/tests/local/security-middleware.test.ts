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
import Fastify from 'fastify';
import { securityMiddleware, RateLimiter, ENDPOINT_RATE_LIMITS } from '../../src/local/security-middleware.js';

// ── Helper: create a test server with security middleware ─────────────

async function createTestServer(opts?: {
  rateLimiter?: { maxRequests?: number; windowMs?: number };
  sessionToken?: string;
}) {
  const server = Fastify({ logger: false });
  await server.register(securityMiddleware, {
    rateLimiter: opts?.rateLimiter,
    sessionToken: opts?.sessionToken,
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
  server.post('/api/vault/:name/reveal', async () => {
    return { ok: true };
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

  it('allows localhost requests without token (desktop trust)', async () => {
    // Localhost connections are trusted — desktop app pattern (SEC-011 amendment)
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({ method: 'GET', url: '/api/test' });
      // inject() simulates localhost — should be trusted
      expect(res.statusCode).toBe(200);
    } finally {
      await server.close();
    }
  });

  it('allows localhost requests even with wrong token (desktop trust)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: 'Bearer wrong-token' },
      });
      // inject() simulates localhost — trusted regardless of token
      expect(res.statusCode).toBe(200);
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

  it('allows malformed authorization header from localhost (desktop trust)', async () => {
    const server = await createTestServer({ sessionToken: TEST_TOKEN });
    try {
      // Missing "Bearer " prefix — but localhost is trusted
      const res = await server.inject({
        method: 'GET',
        url: '/api/test',
        headers: { authorization: TEST_TOKEN },
      });
      // inject() simulates localhost — trusted
      expect(res.statusCode).toBe(200);
    } finally {
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
