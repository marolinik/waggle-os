/**
 * Shared same-origin guard for sensitive local-only endpoints
 * (vault reveal, debug logs, filesystem browse).
 *
 * Origins are URL-parsed (not prefix-matched) so http://localhost.evil.com
 * cannot impersonate the local app. The Tauri desktop webview presents either
 * `tauri://localhost` or a `tauri.localhost` webview origin.
 */

import type { FastifyRequest } from 'fastify';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** True if the Origin/Referer string denotes the local Waggle app. */
export function isLocalOrigin(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol === 'tauri:') return true;
    if (u.protocol === 'http:' && u.hostname === 'tauri.localhost') return true;
    if (u.protocol === 'https:' && u.hostname === 'tauri.localhost') return true;
    if ((u.protocol === 'http:' || u.protocol === 'https:') && LOCAL_HOSTS.has(u.hostname)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Same-origin gate. Returns true if the request is from the local app; the
 * caller should 403 when it returns false. A request with no Origin and no
 * Referer is treated as local (same-host curl / server inject) — the loopback
 * bind is the primary control and this is defense in depth.
 */
export function isLocalRequest(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (origin) return isLocalOrigin(origin);
  const referer = request.headers.referer;
  if (referer) return isLocalOrigin(referer);
  return true;
}
