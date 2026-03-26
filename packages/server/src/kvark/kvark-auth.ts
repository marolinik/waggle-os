/**
 * KVARK Auth — login, token caching, auto-refresh on 401.
 *
 * Manages the JWT lifecycle for KVARK API access:
 * - Calls POST /api/auth/login to obtain a Bearer token
 * - Caches the token in memory (re-login on server restart is fine)
 * - Re-authenticates automatically on 401 responses
 */

import type { KvarkLoginResponse } from './kvark-types.js';
import { KvarkAuthError, KvarkUnavailableError } from './kvark-types.js';

export interface KvarkAuthConfig {
  baseUrl: string;
  identifier: string;
  password: string;
  timeoutMs?: number;
}

export class KvarkAuth {
  private token: string | null = null;
  private tokenObtainedAt: number = 0;
  private readonly config: KvarkAuthConfig;
  private readonly timeoutMs: number;

  /** Injectable fetch for testing */
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(config: KvarkAuthConfig, fetchFn?: typeof globalThis.fetch) {
    this.config = config;
    this.timeoutMs = config.timeoutMs ?? 30_000;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  /**
   * Get a valid Bearer token. Logs in if no token cached.
   * Throws KvarkAuthError on auth failure, KvarkUnavailableError on network error.
   */
  async getToken(): Promise<string> {
    if (this.token) return this.token;
    return this.login();
  }

  /**
   * Force a fresh login (used after 401 responses).
   */
  async login(): Promise<string> {
    this.token = null;

    let res: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      res = await this.fetchFn(`${this.config.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: this.config.identifier,
          password: this.config.password,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new KvarkUnavailableError('KVARK login timed out');
      }
      throw new KvarkUnavailableError(`KVARK unreachable: ${err instanceof Error ? err.message : String(err)}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => 'Unknown error');
      throw new KvarkAuthError(`KVARK login failed (${res.status}): ${detail}`);
    }

    const body = await res.json() as KvarkLoginResponse;

    if (!body.success || !body.access_token) {
      throw new KvarkAuthError(body.error ?? 'KVARK login returned no token');
    }

    this.token = body.access_token;
    this.tokenObtainedAt = Date.now();
    return this.token;
  }

  /**
   * Clear cached token (called when a 401 is received, before retry).
   */
  invalidate(): void {
    this.token = null;
  }

  /** Whether a token is currently cached. */
  get hasToken(): boolean {
    return this.token !== null;
  }

  /** Milliseconds since token was obtained (0 if no token). */
  get tokenAgeMs(): number {
    if (!this.token) return 0;
    return Date.now() - this.tokenObtainedAt;
  }
}
