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
import type { CronSchedule } from '@waggle/core';
import { isLoopbackBind } from './net-config.js';

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
    // https://us.i.posthog.com = PostHog event ingest ONLY (capture endpoint).
    // NOT added to script-src: posthog.ts uses the no-external build +
    // advanced_disable_decide, so no remote PostHog script or config.js loads.
    "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* https://api.anthropic.com https://generativelanguage.googleapis.com https://us.i.posthog.com",
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
  '/api/browse/local/mkdir': 10, // R6-005: tight cap on filesystem mkdir (same-origin gated; not path-confined — it IS the file browser)
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

/**
 * Routes exempt from bearer token authentication.
 *
 * `/api/stripe/webhook` is a tokenless POST from Stripe's servers — it can never
 * carry our per-process session bearer, so in a hosted (0.0.0.0) deploy it would
 * 401 before the handler and subscription-lifecycle events
 * (customer.subscription.deleted/updated) would never process — cancelled subs
 * would never downgrade to FREE. It is independently authenticated by Stripe
 * *signature verification* inside the handler (stripe.webhooks.constructEvent
 * rejects any body not signed with STRIPE_WEBHOOK_SECRET before the handler
 * trusts it), so exempting it from the bearer gate does not widen the trust
 * boundary. Desktop (loopback) mode is unaffected — Stripe can't reach a
 * loopback bind. The path string matches the route registered in
 * stripe/webhook.ts (`POST /api/stripe/webhook`, no prefix).
 */
const AUTH_EXEMPT_PATHS = [
  '/health',
  '/api/auth/session-token',
  '/api/browser-ext/session-token',
  '/api/browser-ext/pair',
  '/api/stripe/webhook',
];

/**
 * P1b-SSE: EventSource cannot send an Authorization header, so these exact
 * GET stream paths accept the session token as a `?token=` query parameter —
 * the same pattern GET /ws already uses (index.ts validates `?token=` there).
 * Scope deliberately narrow: query-token auth is NOT a general alternative
 * transport — it applies only to this allowlist, only on GET, and only when
 * no Authorization header is present. (Local-log token exposure matches the
 * existing /ws posture: the token is per-process and loopback-scoped.)
 */
const SSE_QUERY_TOKEN_PATHS = new Set([
  '/api/notifications/stream', // notifications + named subagent_status events
  '/api/events/stream',
  '/api/waggle/stream',
  '/api/harvest/progress',
  '/api/tools/stream', // AI-OS #4 — observed-launch live output (named line/exit events)
]);

/** Extract `?token=` from a raw request URL (query parsing happens later in
 *  Fastify's lifecycle than our onRequest hook needs). */
function queryToken(rawUrl: string): string | null {
  const q = rawUrl.indexOf('?');
  if (q < 0) return null;
  return new URLSearchParams(rawUrl.slice(q + 1)).get('token');
}

/**
 * AV-1 / R2-004: a Host header is allowed only if present AND (after stripping the
 * port) in the allowlist. An absent/empty Host MUST fail closed — the prior
 * `if (host && !allow.has(host))` form skipped the check entirely on empty Host,
 * letting a non-browser client bypass the anti-DNS-rebind guard.
 */
export function hostHeaderAllowed(rawHost: string | undefined, allowlist: Set<string>): boolean {
  const host = (rawHost ?? '').split(':')[0];
  return host.length > 0 && allowlist.has(host);
}

// ── Fastify Plugin Registration ─────────────────────────────────────────

export interface SecurityMiddlewareOpts {
  rateLimiter?: RateLimiterConfig;
  /** Session token for bearer auth. When set, all non-exempt routes require Authorization header. */
  sessionToken?: string;
  /** Validate the persisted, scoped Browser Companion credential. */
  authenticateBrowserCompanionToken?: (token: string) => boolean;
  /** Validate a narrow per-run credential for WaggleDance and one model-completion route. */
  authenticateRunToken?: (token: string) => RunTokenAuthResult;
}

export interface AuthenticatedRunToken {
  runId?: string;
  model?: string;
}

export type RunTokenAuthResult = boolean | AuthenticatedRunToken | null | undefined;

const RUN_TOKEN_METHODS = new Map<string, string>([
  ['/api/waggle-dance/signal', 'POST'],
  ['/api/waggle-dance/signals', 'GET'],
]);

/** OpenClaw's OpenAI-compatible client can send only a Bearer credential here. */
const RUN_TOKEN_BEARER_PATHS = new Set([
  '/v1/chat/completions',
]);

const UNSAFE_WORKSPACE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * POST endpoints that project existing workspace data without changing it.
 * Keep this allowlist exact and intentionally small: new POST reads must opt in,
 * rather than silently bypassing the Team-viewer policy.
 */
const VIEWER_READ_ONLY_POST_EXEMPT_PATHS = new Set([
  '/api/export',
  '/api/compliance/export',
  '/api/compliance/export-pdf',
  '/api/automations/test',
  '/api/command/interpret',
]);

const DEFAULT_WORKSPACE_MUTATION_PATHS = new Set([
  '/api/chat',
  '/api/fleet/spawn',
  '/api/agent-groups/:id/run',
  '/api/tools/launch',
]);

const resolvedChatWorkspaceIds = new WeakMap<FastifyRequest, string | null>();
const authenticatedRunTokens = new WeakMap<FastifyRequest, AuthenticatedRunToken>();

export function getResolvedChatWorkspaceId(
  request: FastifyRequest,
): string | null | undefined {
  return resolvedChatWorkspaceIds.get(request);
}

export function getAuthenticatedRunToken(
  request: FastifyRequest,
): AuthenticatedRunToken | undefined {
  return authenticatedRunTokens.get(request);
}

const STORED_CRON_OWNER_PATHS = new Set([
  '/api/cron/:id',
  '/api/cron/:id/trigger',
  '/api/automations/:id',
  '/api/automations/:id/run',
  '/api/automations/:id/pause',
]);

const ALL_WORKSPACE_CRON_JOB_TYPES = new Set([
  'workspace_health',
]);

const FAN_OUT_MEMORY_ACTIONS = new Set([
  'index_reconcile',
  'memory_compact',
  'memory_lane_extract',
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function bearerTokenFromAuth(authHeader: string | undefined): string | undefined {
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function runTokenAuthSnapshot(result: RunTokenAuthResult): AuthenticatedRunToken | null {
  if (result === true) return {};
  if (!result || typeof result !== 'object') return null;
  return {
    ...(typeof result.runId === 'string' ? { runId: result.runId } : {}),
    ...(typeof result.model === 'string' ? { model: result.model } : {}),
  };
}

function stringFields(
  record: Record<string, unknown> | null,
  fields: readonly string[],
): string[] {
  const values: string[] = [];
  for (const field of fields) {
    const value = record?.[field];
    if (typeof value === 'string' && value.trim()) values.push(value.trim());
  }
  return values;
}

function stringArrayFields(
  record: Record<string, unknown> | null,
  fields: readonly string[],
): string[] {
  const values: string[] = [];
  for (const field of fields) {
    const candidates = record?.[field];
    if (!Array.isArray(candidates)) continue;
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) values.push(candidate.trim());
    }
  }
  return values;
}

function parsedCronJobConfig(
  jobConfig: unknown,
  serialized: boolean,
): Record<string, unknown> | null {
  let config = asRecord(jobConfig);
  if (!config && serialized && typeof jobConfig === 'string') {
    try {
      config = asRecord(JSON.parse(jobConfig));
    } catch {
      return null;
    }
  }
  return config;
}

function allWorkspaceIds(fastify: FastifyInstance): string[] {
  return fastify.workspaceManager?.list().map((workspace) => workspace.id) ?? [];
}

function cronScheduleWorkspaceIds(
  jobType: unknown,
  jobConfig: unknown,
  workspaceId: unknown,
  fastify: FastifyInstance,
  serializedJobConfig = false,
): string[] {
  const normalizedWorkspaceId = typeof workspaceId === 'string' && workspaceId.length > 0
    ? workspaceId
    : null;
  const explicitOwnerIds = normalizedWorkspaceId
    && normalizedWorkspaceId !== '*'
    ? [normalizedWorkspaceId]
    : [];

  if (typeof jobType !== 'string') return explicitOwnerIds;
  if (ALL_WORKSPACE_CRON_JOB_TYPES.has(jobType)) {
    return [...explicitOwnerIds, ...allWorkspaceIds(fastify)];
  }
  if (jobType === 'prompt_optimization') {
    const optimizedWorkspaceIds = fastify.workspaceManager?.list()
      .filter((workspace) => Boolean(workspace.optimizationEnabled))
      .map((workspace) => workspace.id) ?? [];
    return [...explicitOwnerIds, ...optimizedWorkspaceIds];
  }
  if (jobType === 'memory_consolidation') {
    const rawAction = parsedCronJobConfig(jobConfig, serializedJobConfig)?.action;
    const action = typeof rawAction === 'string' ? rawAction : undefined;
    if (action !== undefined && FAN_OUT_MEMORY_ACTIONS.has(action)) {
      return [...explicitOwnerIds, ...allWorkspaceIds(fastify)];
    }
  }
  if (
    jobType === 'agent_task'
    && normalizedWorkspaceId === '*'
  ) {
    return allWorkspaceIds(fastify);
  }
  return explicitOwnerIds;
}

/**
 * Resolve a persisted schedule through the same workspace-target rules used by
 * the HTTP authorization hook. Automatic scheduler paths do not pass through
 * Fastify, so they must re-check the current role immediately before running.
 */
export function cronScheduleHasReadOnlyViewerTarget(
  schedule: CronSchedule,
  fastify: FastifyInstance,
): boolean {
  return cronScheduleWorkspaceIds(
    schedule.job_type,
    schedule.job_config,
    schedule.workspace_id,
    fastify,
    true,
  ).some((workspaceId) => {
    const workspace = fastify.workspaceManager?.get(workspaceId);
    return Boolean(workspace?.teamId && workspace.teamRole === 'viewer');
  });
}

function storedMutationWorkspaceIds(
  request: FastifyRequest,
  fastify: FastifyInstance,
  routeUrl: string,
): string[] {
  const params = asRecord(request.params);

  if (routeUrl === '/api/approval/:requestId') {
    const requestId = stringFields(params, ['requestId'])[0];
    if (!requestId) return [];
    const held = fastify.cronStore?.getPendingAction(requestId);
    if (!held) return [];
    if (held.workspace_id === null) return [];
    if (held.workspace_id && held.workspace_id !== '*') return [held.workspace_id];
    return ['default'];
  }

  if (!STORED_CRON_OWNER_PATHS.has(routeUrl)) return [];
  const id = parseInt(stringFields(params, ['id'])[0] ?? '', 10);
  if (Number.isNaN(id)) return [];
  const schedule = fastify.cronStore?.getById(id);
  if (!schedule) return [];

  const currentWorkspaceIds = cronScheduleWorkspaceIds(
    schedule.job_type,
    schedule.job_config,
    schedule.workspace_id,
    fastify,
    true,
  );
  if (request.method === 'PATCH') {
    const body = asRecord(request.body);
    const hasNextJobConfig = body !== null && Object.hasOwn(body, 'jobConfig');
    const nextJobConfig = hasNextJobConfig
      ? body.jobConfig
      : schedule.job_config;
    const nextWorkspaceId = body && Object.hasOwn(body, 'workspaceId')
      ? body.workspaceId
      : schedule.workspace_id;
    return [
      ...currentWorkspaceIds,
      ...cronScheduleWorkspaceIds(
        schedule.job_type,
        nextJobConfig,
        nextWorkspaceId,
        fastify,
        !hasNextJobConfig,
      ),
    ];
  }
  return currentWorkspaceIds;
}

function createdCronWorkspaceIds(
  body: Record<string, unknown> | null,
  fastify: FastifyInstance,
  routeUrl: string,
): string[] {
  if (routeUrl !== '/api/cron') return [];
  return cronScheduleWorkspaceIds(
    body?.jobType,
    body?.jobConfig,
    body?.workspaceId === 'global' ? '*' : body?.workspaceId,
    fastify,
  );
}

/**
 * Resolve the workspace whose state an unsafe request targets. Route parameters
 * win for /api/workspaces/* so a body cannot redirect authorization to a more
 * privileged workspace. Other workspace-scoped routes use their established
 * body/query fields, including Fleet's parent id and multi-workspace Rooms.
 * The few routes that intentionally fall back to the active/default workspace
 * must authorize that resolved fallback too.
 */
function mutationWorkspaceIds(
  request: FastifyRequest,
  fastify: FastifyInstance,
): string[] {
  if (!UNSAFE_WORKSPACE_METHODS.has(request.method)) return [];

  const routeUrl = request.routeOptions?.url ?? request.url.split('?')[0];
  if (VIEWER_READ_ONLY_POST_EXEMPT_PATHS.has(routeUrl)) return [];

  const params = asRecord(request.params);
  if (routeUrl.startsWith('/api/workspaces/:')) {
    return stringFields(params, ['workspaceId', 'id']).slice(0, 1);
  }

  const body = asRecord(request.body);
  const query = asRecord(request.query);
  if (DEFAULT_WORKSPACE_MUTATION_PATHS.has(routeUrl)) {
    if (routeUrl === '/api/chat') {
      const explicitWorkspaceId = stringFields(
        { workspace: body?.workspace ?? body?.workspaceId },
        ['workspace'],
      )[0];
      const isLiteralDefaultWorkspace = explicitWorkspaceId === 'default'
        && !!fastify.workspaceManager?.get('default');
      const resolvedWorkspaceId = explicitWorkspaceId
        && (explicitWorkspaceId !== 'default' || isLiteralDefaultWorkspace)
        ? explicitWorkspaceId
        : fastify.agentState?.activeWorkspaceId ?? null;

      resolvedChatWorkspaceIds.set(request, resolvedWorkspaceId);
      return resolvedWorkspaceId ? [resolvedWorkspaceId] : [];
    }

    const explicitWorkspaceIds = routeUrl === '/api/fleet/spawn'
      ? stringFields(body, ['parentWorkspaceId'])
      : stringFields(body, ['workspaceId']);
    if (explicitWorkspaceIds.length > 0) return explicitWorkspaceIds;

    const fallbackWorkspaceId = routeUrl === '/api/tools/launch'
      ? fastify.agentState?.activeWorkspaceId
        ?? fastify.workspaceManager?.getDefault()
        ?? fastify.workspaceManager?.list()[0]?.id
      : fastify.workspaceManager?.getDefault()
        ?? fastify.workspaceManager?.list()[0]?.id;
    return fallbackWorkspaceId ? [fallbackWorkspaceId] : [];
  }

  const participantWorkspaceIds = Array.isArray(body?.participants)
    ? body.participants.flatMap((participant) =>
      stringArrayFields(asRecord(participant), ['workspaceIds']))
    : [];
  const bodyWorkspaceIds = stringFields(body, ['workspaceId', 'workspace', 'parentWorkspaceId']);
  const directBodyWorkspaceIds = request.method === 'POST'
    && (routeUrl === '/api/cron' || routeUrl === '/api/automations')
    ? bodyWorkspaceIds.filter((workspaceId) => workspaceId !== 'global')
    : bodyWorkspaceIds;
  const workspaceIds = [...new Set([
    ...stringFields(params, ['workspaceId']),
    ...directBodyWorkspaceIds,
    ...stringFields(query, ['workspaceId', 'workspace']),
    ...stringArrayFields(body, ['workspaceIds']),
    ...participantWorkspaceIds,
    ...storedMutationWorkspaceIds(request, fastify, routeUrl),
    ...createdCronWorkspaceIds(body, fastify, routeUrl),
  ])];
  return workspaceIds;
}

function storedAgentRunControlWorkspaceIds(
  request: FastifyRequest,
  fastify: FastifyInstance,
): string[] | null | undefined {
  const routeUrl = request.routeOptions?.url ?? request.url.split('?')[0];
  if (
    request.method !== 'POST'
    || (routeUrl !== '/api/agent-runs/:id/control' && routeUrl !== '/api/agents/:id/pause')
  ) {
    return undefined;
  }

  const id = stringFields(asRecord(request.params), ['id'])[0];
  if (!id) return null;
  if (!fastify.agentRunRegistry) {
    return routeUrl === '/api/agent-runs/:id/control' ? null : undefined;
  }

  const run = routeUrl === '/api/agent-runs/:id/control'
    ? fastify.agentRunRegistry.get(id)
    : fastify.agentRunRegistry.list({ source: 'fleet', limit: 1_000 })
      .find((candidate) => candidate.kind === 'worker' && candidate.executor.agentId === id);
  if (!run) return undefined;

  const workspaceIds = run.kind === 'room' ? run.workspaceIds : [run.workspaceId];
  if (
    workspaceIds.length === 0
    || workspaceIds.some((workspaceId) => !fastify.workspaceManager?.get(workspaceId))
  ) {
    return null;
  }

  return workspaceIds;
}

async function securityMiddlewarePlugin(
  fastify: FastifyInstance,
  opts: SecurityMiddlewareOpts,
) {
  const limiter = new RateLimiter(opts.rateLimiter);
  const sessionToken = opts.sessionToken ?? null;
  const browserCompanionRequests = new WeakSet<FastifyRequest>();

  // R2-004: when bound to loopback, reject requests whose Host header is not a
  // known-local name. This defeats DNS-rebinding, which would otherwise let a
  // malicious page resolve its domain to 127.0.0.1 and satisfy the IP-based
  // localhost-trust exemption below. Skipped when bound to 0.0.0.0 (a cloud
  // deploy sits behind its own host/proxy and sets its own Host).
  const enforceHostAllowlist = isLoopbackBind();
  // D1 escape hatch: restore the legacy "trust any loopback caller" behavior.
  // Default OFF — the desktop webview sends a bearer token (see /api/auth/session-token).
  const trustLocalhost = process.env.WAGGLE_TRUST_LOCALHOST === '1';
  const HOST_ALLOWLIST = new Set([
    '127.0.0.1', 'localhost', '::1',
    ...(process.env.WAGGLE_ALLOWED_HOSTS ?? '').split(',').map(s => s.trim()).filter(Boolean),
  ]);

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

    // ── Host-header allowlist (R2-004, anti DNS-rebind) ──
    // ── Host-header allowlist (R2-004 + AV-1, anti DNS-rebind) ──
    // Fails closed on an absent/empty Host (see hostHeaderAllowed).
    if (enforceHostAllowlist && !hostHeaderAllowed(request.headers.host, HOST_ALLOWLIST)) {
      return reply.code(403).send({ error: 'Forbidden', code: 'BAD_HOST' });
    }

    // ── Bearer token authentication (SEC-011 + D1) ──
    // D1: localhost is NO LONGER trusted by default. Waggle is a desktop app that
    // coexists with browsers/extensions/other local apps, so "any loopback caller is
    // trusted" let any of them drive the authenticated API (e.g. the PATCH /api/tier
    // free upgrade). The Tauri webview obtains the token from the auth-exempt,
    // same-origin-gated /api/auth/session-token bootstrap and sends it as a Bearer.
    // Set WAGGLE_TRUST_LOCALHOST=1 to restore legacy loopback trust (emergency escape).
    if (sessionToken) {
      const clientIp = request.ip || request.socket?.remoteAddress || '';
      const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost';
      // D1 bootstrap: non-API GETs (the SPA shell + static assets) must load
      // without a token, else the browser/webview can never fetch the app code
      // that bootstraps the bearer token (chicken-and-egg → blank 401 page).
      // These are inert reads carrying no privileged action; every /api/* route
      // (and any non-GET) stays gated. The token endpoint itself is same-origin
      // gated (isLocalRequest) so this does not widen the auth boundary.
      const isNonApiGet = request.method === 'GET' && !requestPath.startsWith('/api/');
      const isAuthExempt = request.method === 'OPTIONS' ||
        AUTH_EXEMPT_PATHS.some(p => requestPath === p) ||
        isNonApiGet ||
        (trustLocalhost && isLocalhost);
      const rawRunToken = request.headers['x-waggle-run-token'];
      const runToken = typeof rawRunToken === 'string' ? rawRunToken : undefined;
      const authHeader = request.headers.authorization;
      const bearerToken = bearerTokenFromAuth(authHeader);
      const browserCompanionCredentialValid = typeof bearerToken === 'string'
        && (opts.authenticateBrowserCompanionToken?.(bearerToken) ?? false);
      const browserCompanionEligible = browserCompanionCredentialValid
        && (
          (request.method === 'GET' && requestPath === '/api/browser-ext/health')
          || (request.method === 'POST' && requestPath === '/api/memory/frames')
        );
      if (browserCompanionEligible) {
        browserCompanionRequests.add(request);
      }
      const runTokenEligible = RUN_TOKEN_METHODS.get(requestPath) === request.method;
      const headerRunTokenSnapshot = runTokenEligible && runToken
        ? runTokenAuthSnapshot(opts.authenticateRunToken?.(runToken))
        : null;
      const bearerRunTokenSnapshot = request.method === 'POST'
          && RUN_TOKEN_BEARER_PATHS.has(requestPath)
          && bearerToken
        ? runTokenAuthSnapshot(opts.authenticateRunToken?.(bearerToken))
        : null;
      if (headerRunTokenSnapshot || bearerRunTokenSnapshot) {
        authenticatedRunTokens.set(request, headerRunTokenSnapshot ?? bearerRunTokenSnapshot!);
      }
      const headerRunTokenValid = Boolean(headerRunTokenSnapshot);
      const bearerRunTokenValid = Boolean(bearerRunTokenSnapshot);
      const runTokenValid = headerRunTokenValid || bearerRunTokenValid;
      if (!isAuthExempt && !runTokenValid && !browserCompanionEligible) {
        // P1b-SSE: header-less GETs on the SSE allowlist may authenticate via
        // `?token=` (EventSource cannot send headers). A header, when present,
        // always wins — the query path is a fallback transport, not an
        // override. Invalid/missing query tokens 401 with the same codes the
        // header path uses, so the client's refresh logic stays uniform.
        const sseEligible = !authHeader && request.method === 'GET' && SSE_QUERY_TOKEN_PATHS.has(requestPath);
        if (sseEligible) {
          const qToken = queryToken(request.url);
          if (qToken !== sessionToken) {
            return reply.code(401).send({ error: 'Unauthorized', code: qToken ? 'INVALID_TOKEN' : 'MISSING_TOKEN' });
          }
        } else {
          if (!authHeader) {
            return reply.code(401).send({
              error: 'Unauthorized',
              code: runToken ? 'INVALID_TOKEN' : 'MISSING_TOKEN',
            });
          }
          const token = bearerTokenFromAuth(authHeader) ?? null;
          if (token !== sessionToken) {
            return reply.code(401).send({ error: 'Unauthorized', code: 'INVALID_TOKEN' });
          }
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

  // Team viewers are read-only across every local workspace mutation surface,
  // not only /api/chat. Resolve the persisted workspace role after Fastify has
  // parsed params/body/query, then stop before any route handler can mutate.
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    if (browserCompanionRequests.has(request) && request.method === 'POST') {
      const body = request.body;
      const isRecord = body !== null && typeof body === 'object' && !Array.isArray(body);
      const payload = isRecord ? body as Record<string, unknown> : null;
      const targetsWorkspace = payload !== null && (
        Object.prototype.hasOwnProperty.call(payload, 'workspace')
        || Object.prototype.hasOwnProperty.call(payload, 'workspaceId')
      );
      const sourceEscalates = payload !== null
        && Object.prototype.hasOwnProperty.call(payload, 'source')
        && payload.source !== 'import';
      const importanceEscalates = payload !== null
        && Object.prototype.hasOwnProperty.call(payload, 'importance')
        && payload.importance !== 'normal'
        && payload.importance !== 'low';
      if (!payload || targetsWorkspace || sourceEscalates || importanceEscalates) {
        return reply.code(403).send({
          error: 'Browser Companion is limited to personal imported-memory capture.',
          code: 'BROWSER_COMPANION_SCOPE_VIOLATION',
        });
      }
    }

    const storedRunWorkspaceIds = storedAgentRunControlWorkspaceIds(request, fastify);
    if (storedRunWorkspaceIds === null) {
      return reply.code(403).send({
        error: 'Agent run workspace scope could not be resolved.',
        code: 'RUN_WORKSPACE_SCOPE_UNRESOLVED',
      });
    }

    const mutationTargets = new Set([
      ...mutationWorkspaceIds(request, fastify),
      ...(storedRunWorkspaceIds ?? []),
    ]);
    for (const workspaceId of mutationTargets) {
      const workspace = fastify.workspaceManager?.get(workspaceId);
      if (workspace?.teamId && workspace.teamRole === 'viewer') {
        return reply.code(403).send({
          error: 'Viewers cannot modify team workspaces. Ask a team admin to upgrade your role.',
          code: 'VIEWER_READ_ONLY',
        });
      }
    }
  });
}

// Wrap with fastify-plugin to break encapsulation — hooks apply to ALL routes
export const securityMiddleware = fp(securityMiddlewarePlugin, {
  name: 'waggle-security-middleware',
});
