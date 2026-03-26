/**
 * Shared test utilities for e2e tests.
 * Provides authenticated inject helper for local server tests (SEC-011).
 */

import type { FastifyInstance, InjectOptions } from 'fastify';

/**
 * Shorthand: inject with auth token from the server's agentState.
 * Returns the same result as server.inject().
 */
export function injectWithAuth(server: FastifyInstance, opts: InjectOptions) {
  const token = server.agentState.wsSessionToken;
  const existingHeaders = (opts.headers ?? {}) as Record<string, string>;
  return server.inject({
    ...opts,
    headers: {
      ...existingHeaders,
      authorization: `Bearer ${token}`,
    },
  });
}
