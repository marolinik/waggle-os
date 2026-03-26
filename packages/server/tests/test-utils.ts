/**
 * Shared test utilities for server tests.
 *
 * Provides helpers for authenticated inject calls after SEC-011
 * (local server bearer token authentication).
 */

import type { FastifyInstance, InjectOptions } from 'fastify';

/**
 * Get the auth token from a server built with buildLocalServer.
 */
export function getAuthToken(server: FastifyInstance): string {
  return server.agentState.wsSessionToken;
}

/**
 * Create an authenticated inject options object.
 * Merges the Authorization: Bearer header into the provided inject options.
 */
export function authInject(server: FastifyInstance, opts: InjectOptions): InjectOptions {
  const token = getAuthToken(server);
  const existingHeaders = (opts.headers ?? {}) as Record<string, string>;
  return {
    ...opts,
    headers: {
      ...existingHeaders,
      authorization: `Bearer ${token}`,
    },
  };
}

/**
 * Shorthand: inject with auth token. Returns the same result as server.inject().
 */
export function injectWithAuth(server: FastifyInstance, opts: InjectOptions) {
  return server.inject(authInject(server, opts));
}

/**
 * Reset the rate limiter state on the server.
 * Call this in beforeEach() to prevent rate limit interference between tests.
 */
export function resetRateLimiter(server: FastifyInstance): void {
  if (server.rateLimiter) {
    server.rateLimiter.reset();
  }
}
