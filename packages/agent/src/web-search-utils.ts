/**
 * Web search hardening utilities: caching and rate limiting.
 */

export class SearchCache {
  private cache = new Map<string, { data: string; expires: number }>();
  private ttl: number;

  constructor(ttlMs: number = 300_000) { // 5 min default
    this.ttl = ttlMs;
  }

  get(query: string): string | null {
    const entry = this.cache.get(query.toLowerCase());
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(query.toLowerCase());
      return null;
    }
    return entry.data;
  }

  set(query: string, data: string): void {
    this.cache.set(query.toLowerCase(), { data, expires: Date.now() + this.ttl });
  }
}

export class RateLimiter {
  private timestamps: number[] = [];
  private maxCalls: number;
  private windowMs: number;

  constructor(maxCalls: number, windowMs: number) {
    this.maxCalls = maxCalls;
    this.windowMs = windowMs;
  }

  canProceed(): boolean {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxCalls) return false;
    this.timestamps.push(now);
    return true;
  }
}
