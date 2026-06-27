/**
 * Shared CORS configuration for the local Waggle server.
 * Used by both the Fastify CORS plugin and SSE endpoints that bypass it via reply.hijack().
 */

const BASE_ORIGINS = [
  'http://localhost:1420',
  'http://127.0.0.1:1420',
  'tauri://localhost',
  'https://tauri.localhost',
  'http://localhost:3333',  // web mode (self)
  'http://127.0.0.1:3333',
  'http://localhost:8080',  // waggle-os web frontend (Vite dev)
  'http://127.0.0.1:8080',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

// FR-1 · Browser Companion (apps/browser-ext) — chrome-extension origins.
//
// Security model: the previous iteration added a bare `'chrome-extension://'`
// prefix that, combined with the startsWith check in the CORS callback,
// would have let ANY installed Chromium extension hit the sidecar (flagged
// HIGH by the 2026-05-28 automated security review). The correct pattern:
//
//   - Production: empty by default. Add specific extension IDs once we
//     have a published store ID via WAGGLE_BROWSER_EXT_IDS (comma-list).
//   - Dev: explicit env-flag escape hatch (WAGGLE_DEV_ALLOW_ANY_EXTENSION=1)
//     while loading unpacked dev builds whose IDs aren't pinned yet.
//
// In dev-escape mode we still keep the `chrome-extension://` prefix entry,
// but it's now ONLY added when the developer explicitly opts in, so a
// production build with no env vars set rejects every extension origin.
const extensionOrigins: string[] = [];
const extIds = (process.env.WAGGLE_BROWSER_EXT_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
for (const id of extIds) {
  // Exact-string origin, no path. Belt-and-braces vs startsWith abuse.
  extensionOrigins.push(`chrome-extension://${id}`);
}
if (process.env.WAGGLE_DEV_ALLOW_ANY_EXTENSION === '1') {
  extensionOrigins.push('chrome-extension://');
}

export const ALLOWED_ORIGINS = [...BASE_ORIGINS, ...extensionOrigins];

const LOOPBACK_HTTP_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function isLoopbackHttpOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && LOOPBACK_HTTP_HOSTS.has(url.hostname) && url.port !== '';
  } catch {
    return false;
  }
}

/**
 * Exact-match CORS origin check for the Fastify CORS plugin.
 * A missing origin (same-origin request or non-browser client) is allowed.
 * Exact match (not startsWith) so an attacker host like
 * `http://localhost:1420.evil.com` cannot pass by prefixing an allowed origin.
 */
export function corsOriginAllowed(origin: string | undefined): boolean {
  return !origin || ALLOWED_ORIGINS.includes(origin) || isLoopbackHttpOrigin(origin);
}

/**
 * Validate and return the origin for SSE responses.
 * Returns the origin if allowed, otherwise returns the first allowed origin.
 * SSE endpoints that use reply.hijack() bypass Fastify's CORS plugin,
 * so they must validate origins themselves.
 */
export function validateOrigin(requestOrigin: string | undefined): string {
  if (!requestOrigin) return ALLOWED_ORIGINS[0];
  if (ALLOWED_ORIGINS.includes(requestOrigin) || isLoopbackHttpOrigin(requestOrigin)) return requestOrigin;
  return ALLOWED_ORIGINS[0];
}
