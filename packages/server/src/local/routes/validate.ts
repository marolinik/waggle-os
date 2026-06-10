/**
 * Validate that a route parameter is a safe path segment.
 * Rejects values containing path traversal characters.
 */
export function isSafeSegment(s: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(s);
}

export function assertSafeSegment(s: string, name: string): void {
  if (!isSafeSegment(s)) {
    throw Object.assign(
      new Error(`Invalid ${name}: contains illegal characters`),
      { statusCode: 400 },
    );
  }
}

/** Forward the caller's bearer token on internal delegation injects so the
 *  global securityMiddleware sees an authenticated request. Shared by the
 *  Phase-3 alias routes (agents / automations / skills aliases). */
export function authHeaders(
  request: { headers: { authorization?: string } },
): Record<string, string> {
  const auth = request.headers.authorization;
  return auth ? { authorization: auth } : {};
}

/** Defense-in-depth length clamp on free-form string fields. */
export const clampStr = (s: unknown, max: number): string => String(s ?? '').slice(0, max);

/** Clamp an id/string array on both item count and item length. */
export const clampStrArray = (a: unknown, maxItems: number, maxLen: number): string[] =>
  Array.isArray(a) ? a.slice(0, maxItems).map((x) => clampStr(x, maxLen)) : [];
