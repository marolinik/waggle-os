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
