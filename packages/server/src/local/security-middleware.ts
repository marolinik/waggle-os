/**
 * Security middleware for the local Waggle server.
 *
 * Provides:
 * 1. Security headers (CSP, X-Content-Type-Options, X-Frame-Options)
 * 2. Per-client, per-endpoint rate limiter (sliding window, Map-based)
 *    with stricter limits for expensive routes (chat, vault reveal, backup, restore)
 * 3. Session inactivity timeout (team mode only — when CLERK_SECRET_KEY is set)
 * 4. Bearer token authentication for local server (SEC-011)
 *
 * Only applied to the local server — team server may have different needs.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';

// ── Security Headers ────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://api.anthropic.com https://generativelanguage.googleapis.com",
    "frame-ancestors 'none'",
  ].join('; '),
};

// ── Rate Limiter ────────────────────────────────────────────────────────

interface RateLimitEntry {
  /** Timestamps of requests within the current window */
  timestamps: number[];
}

export interface RateLimiterConfig {
  /** Maximum requests per window per endpoint (default: 100) */
  maxRequests?: number;
  /** Window duration in milliseconds (default: 60_000 = 1 minute) */
  windowMs?: number;
}

/**
 * Per-endpoint rate limit overrides for expensive routes.
 * Key: route pattern (matched against routeOptions.url or URL path).
 * Value: max requests per window.
 */
export const ENDPOINT_RATE_LIMITS: Record<string, number> = {
  '/api/chat': 120,             // raised: echo mode + slash commands are free; LLM calls self-throttle via provider
  '/api/vault/*/reveal': 5,     // decrypts secrets (matched via routeOptions.url pattern)
  '/api/backup': 2,             // reads entire data dir
  '/api/restore': 2,            // writes entire data dir
};

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private defaultMaxRequests: number;
  private windowMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimiterConfig = {}) {
    this.defaultMaxRequests = config.maxRequests ?? 100;
    this.windowMs = config.windowMs ?? 60_000;

    // Periodic cleanup of stale entries (every 2 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 120_000);
    // Don't block Node.js exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /** Get the default max requests (used for X-RateLimit-Limit header fallback). */
  getDefaultMaxRequests(): number {
    return this.defaultMaxRequests;
  }

  /**
   * Resolve the effective rate limit for a given route.
   * Checks ENDPOINT_RATE_LIMITS first, then falls back to the default.
   */
  getEffectiveLimit(routeUrl: string): number {
    // Check exact match on route path (strip method prefix and query string)
    const routePath = routeUrl.split('?')[0];
    for (const [pattern, limit] of Object.entries(ENDPOINT_RATE_LIMITS)) {
      // Convert wildcard patterns like '/api/vault/*/reveal' to regex
      const regexStr = '^' + pattern.replace(/\*/g, '[^/]+') + '$';
      if (new RegExp(regexStr).test(routePath)) {
        return limit;
      }
    }
    return this.defaultMaxRequests;
  }

  /**
   * Check if a request is within the rate limit.
   * Returns { allowed: true, remaining } or { allowed: false, retryAfterMs }.
   *
   * @param key - The rate limit key (ip:method route)
   * @param maxRequests - Optional override for the max requests for this specific key
   */
  check(key: string, maxRequests?: number): { allowed: true; remaining: number } | { allowed: false; retryAfterMs: number } {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const limit = maxRequests ?? this.defaultMaxRequests;

    let entry = this.store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      this.store.set(key, entry);
    }

    // Remove timestamps outside the window (sliding window)
    entry.timestamps = entry.timestamps.filter(t => t > windowStart);

    if (entry.timestamps.length >= limit) {
      // Find when the oldest request in the window will expire
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1) };
    }

    entry.timestamps.push(now);
    return { allowed: true, remaining: limit - entry.timestamps.length };
  }

  /** Remove stale entries to prevent memory leak */
  private cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter(t => t > windowStart);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /** Reset all rate limit state (useful for tests). */
  reset(): void {
    this.store.clear();
  }

  /** Stop the cleanup interval (for graceful shutdown) */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// ── Session Timeout (Team Mode Only) ────────────────────────────────────

/** Routes exempt from session timeout (health + vault for re-auth) */
const TIMEOUT_EXEMPT_PATHS = ['/health', '/api/vault'];

/** Default session inactivity timeout: 30 minutes */
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 1_800_000

export class SessionTimeoutTracker {
  private lastActivity = new Map<string, number>();
  private timeoutMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(timeoutMs?: number) {
    this.timeoutMs = timeoutMs ?? (parseInt(process.env.WAGGLE_SESSION_TIMEOUT_MS ?? '', 10) || DEFAULT_SESSION_TIMEOUT_MS);

    // Cleanup stale entries every 2x timeout to prevent memory leak
    const cleanupPeriod = this.timeoutMs * 2;
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupPeriod);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /** Get the configured timeout duration in milliseconds. */
  getTimeoutMs(): number {
    return this.timeoutMs;
  }

  /**
   * Check if the session for the given IP is expired.
   * Returns true if expired (last activity was more than timeoutMs ago).
   * Updates last activity timestamp on every call (resets timer).
   */
  check(ip: string): boolean {
    const now = Date.now();
    const last = this.lastActivity.get(ip);

    if (last !== undefined && (now - last) > this.timeoutMs) {
      // Expired — remove the entry so re-auth starts fresh
      this.lastActivity.delete(ip);
      return true; // expired
    }

    // Reset timer on every request
    this.lastActivity.set(ip, now);
    return false; // not expired
  }

  /** Remove entries older than 2x the timeout to prevent memory leak. */
  private cleanup(): void {
    const now = Date.now();
    const maxAge = this.timeoutMs * 2;
    for (const [ip, lastTime] of this.lastActivity) {
      if (now - lastTime > maxAge) {
        this.lastActivity.delete(ip);
      }
    }
  }

  /** Stop the cleanup interval (for graceful shutdown). */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.lastActivity.clear();
  }
}

// ── Auth Token (Local Server) ────────────────────────────────────────────

/** Routes exempt from bearer token authentication */
const AUTH_EXEMPT_PATHS = ['/health'];

// ── Fastify Plugin Registration ─────────────────────────────────────────

export interface SecurityMiddlewareOpts {
  rateLimiter?: RateLimiterConfig;
  /** Session token for bearer auth. When set, all non-exempt routes require Authorization header. */
  sessionToken?: string;
}

async function securityMiddlewarePlugin(
  fastify: FastifyInstance,
  opts: SecurityMiddlewareOpts,
) {
  const limiter = new RateLimiter(opts.rateLimiter);
  const sessionToken = opts.sessionToken ?? null;

  // Expose the rate limiter on the fastify instance for test access (e.g., reset between tests)
  fastify.decorate('rateLimiter', limiter);

  // Session timeout — only enabled in team mode (when CLERK_SECRET_KEY is set)
  const isTeamMode = !!process.env.CLERK_SECRET_KEY;
  const sessionTimeout = isTeamMode ? new SessionTimeoutTracker() : null;

  // Clean up limiter and session timeout on server close
  fastify.addHook('onClose', async () => {
    limiter.destroy();
    sessionTimeout?.destroy();
  });

  // Add security headers + bearer auth + rate limiting + session timeout to every response
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // ── Security headers ──
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
      reply.header(header, value);
    }

    const requestPath = request.url.split('?')[0]; // Strip query string

    // ── Bearer token authentication (SEC-011) ──
    // Local desktop app: localhost requests are trusted (Waggle is a desktop app, not a public server).
    // External requests still require Bearer token for API access (curl, integrations).
    if (sessionToken) {
      const clientIp = request.ip || request.socket?.remoteAddress || '';
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost';
      const isAuthExempt = request.method === 'OPTIONS' ||
        AUTH_EXEMPT_PATHS.some(p => requestPath === p) ||
        isLocalhost; // Desktop app — trust localhost connections
      if (!isAuthExempt) {
        const authHeader = request.headers.authorization;
        if (!authHeader) {
          return reply.code(401).send({ error: 'Unauthorized', code: 'MISSING_TOKEN' });
        }
        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
        if (token !== sessionToken) {
          return reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
        }
      }
    }

    // ── Session timeout (team mode only) ──
    if (sessionTimeout) {
      const isExempt = TIMEOUT_EXEMPT_PATHS.some(p => requestPath.startsWith(p));

      if (!isExempt) {
        const clientIp = request.ip || '127.0.0.1';
        const expired = sessionTimeout.check(clientIp);
        if (expired) {
          return reply.code(401).send({
            error: 'Session expired',
            code: 'SESSION_TIMEOUT',
          });
        }
      }
    }

    // ── Rate limiting (CQ-008: per-client keying + per-endpoint limits) ──
    // Key: clientIP:method route (e.g., "127.0.0.1:POST /api/vault/:name/reveal")
    const clientIp = request.ip || '127.0.0.1';
    const routeUrl = request.routeOptions?.url ?? request.url;
    const key = `${clientIp}:${request.method} ${routeUrl}`;

    // Resolve per-endpoint limit (expensive routes get stricter limits)
    const effectiveLimit = limiter.getEffectiveLimit(routeUrl);
    const result = limiter.check(key, effectiveLimit);

    reply.header('X-RateLimit-Limit', String(effectiveLimit));

    if (!result.allowed) {
      reply.header('Retry-After', String(Math.ceil(result.retryAfterMs / 1000)));
      reply.header('X-RateLimit-Remaining', '0');
      return reply.code(429).send({
        error: 'Too Many Requests',
        retryAfterMs: result.retryAfterMs,
      });
    }

    reply.header('X-RateLimit-Remaining', String(result.remaining));
  });
}

// Wrap with fastify-plugin to break encapsulation — hooks apply to ALL routes
export const securityMiddleware = fp(securityMiddlewarePlugin, {
  name: 'waggle-security-middleware',
});
