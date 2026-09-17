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

/**
 * Splits an SSE body into its `event:`/`data:` pairs, `data` left as the raw
 * string (TD-TEST-5). Eight suites carried this verbatim, so "how the chat
 * route frames an SSE turn" is knowledge the suite now holds once. Copied
 * byte-for-byte from the copies it replaces, so no suite changes behavior.
 */
export function parseSSE(raw: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  for (const block of raw.split(/\n\n/).filter(Boolean)) {
    let event = '';
    let data = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7);
      else if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event || data) events.push({ event, data });
  }
  return events;
}

/**
 * The same split with `data` parsed as JSON, defaulting to `{}` when a block
 * carries no `data:` line. A separate export rather than an option, because the
 * return type genuinely differs and two suites depend on the parsed shape.
 */
export function parseSseJson(raw: string): Array<{ event: string; data: Record<string, unknown> }> {
  return raw.split(/\n\n/)
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const event = lines.find(line => line.startsWith('event: '))?.slice(7) ?? '';
      const data = lines.find(line => line.startsWith('data: '))?.slice(6) ?? '{}';
      return { event, data: JSON.parse(data) as Record<string, unknown> };
    });
}
