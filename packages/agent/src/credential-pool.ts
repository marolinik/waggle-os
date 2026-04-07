/**
 * CredentialPool — round-robin API key rotation with automatic cooldown.
 *
 * Manages multiple API keys per provider, rotating between them to maximize
 * throughput and handle rate limits gracefully.
 *
 * Cooldown policy:
 *   - 429 (rate limit)     → 1 hour cooldown, auto-recovers
 *   - 402 (payment required) → 24 hour cooldown, auto-recovers
 *   - 401 (unauthorized)    → permanently disabled
 *
 * Vault convention: keys named `provider`, `provider-2`, `provider-3`, etc.
 */

// ── Types ────────────────────────────────────────────────────────────────

export interface CredentialEntry {
  /** Vault key name (e.g., "anthropic", "anthropic-2") */
  name: string;
  /** The decrypted API key value */
  key: string;
  /** Current status */
  status: 'active' | 'cooldown' | 'disabled';
  /** When cooldown expires (null if active or permanently disabled) */
  cooldownUntil: number | null;
  /** Error that caused the current state */
  lastError: string | null;
  /** Total number of successful uses */
  successCount: number;
  /** Total number of errors */
  errorCount: number;
}

export interface CredentialPoolConfig {
  /** Provider name (e.g., "anthropic", "openai") */
  provider: string;
  /** Cooldown duration for 429 errors in ms (default: 1 hour) */
  rateLimitCooldownMs: number;
  /** Cooldown duration for 402 errors in ms (default: 24 hours) */
  paymentCooldownMs: number;
}

export interface PoolStatus {
  provider: string;
  totalKeys: number;
  activeKeys: number;
  cooldownKeys: number;
  disabledKeys: number;
  entries: ReadonlyArray<Readonly<Pick<CredentialEntry, 'name' | 'status' | 'cooldownUntil' | 'lastError' | 'successCount' | 'errorCount'>>>;
}

// ── Constants ────────────────────────────────────────────────────────────

const ONE_HOUR_MS = 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

// ── CredentialPool ───────────────────────────────────────────────────────

export class CredentialPool {
  private readonly entries: CredentialEntry[] = [];
  private readonly config: CredentialPoolConfig;
  private roundRobinIndex = 0;
  private readonly nowFn: () => number;

  constructor(
    config: Partial<CredentialPoolConfig> & Pick<CredentialPoolConfig, 'provider'>,
    /** Injectable clock for testing */
    nowFn: () => number = Date.now,
  ) {
    this.config = {
      rateLimitCooldownMs: ONE_HOUR_MS,
      paymentCooldownMs: TWENTY_FOUR_HOURS_MS,
      ...config,
    };
    this.nowFn = nowFn;
  }

  /**
   * Add a credential to the pool.
   * Typically called during initialization from vault entries.
   */
  addCredential(name: string, key: string): void {
    // Prevent duplicates
    if (this.entries.some(e => e.name === name)) return;
    this.entries.push({
      name,
      key,
      status: 'active',
      cooldownUntil: null,
      lastError: null,
      successCount: 0,
      errorCount: 0,
    });
  }

  /**
   * Get the next available API key using round-robin.
   * Automatically recovers cooled-down keys whose time has elapsed.
   * Returns null if no keys are available.
   */
  getKey(): string | null {
    if (this.entries.length === 0) return null;

    const now = this.nowFn();

    // First pass: recover any keys whose cooldown has expired
    for (const entry of this.entries) {
      if (entry.status === 'cooldown' && entry.cooldownUntil !== null && now >= entry.cooldownUntil) {
        entry.status = 'active';
        entry.cooldownUntil = null;
        entry.lastError = null;
      }
    }

    // Second pass: find the next active key using round-robin
    const startIndex = this.roundRobinIndex;
    for (let attempt = 0; attempt < this.entries.length; attempt++) {
      const idx = (startIndex + attempt) % this.entries.length;
      const entry = this.entries[idx];
      if (entry.status === 'active') {
        this.roundRobinIndex = (idx + 1) % this.entries.length;
        return entry.key;
      }
    }

    return null; // All keys are in cooldown or disabled
  }

  /**
   * Get the name of the credential that corresponds to the given key.
   * Useful for logging which key was used.
   */
  getNameForKey(key: string): string | null {
    return this.entries.find(e => e.key === key)?.name ?? null;
  }

  /**
   * Report a successful API call for the given key.
   */
  reportSuccess(key: string): void {
    const entry = this.entries.find(e => e.key === key);
    if (entry) {
      entry.successCount++;
    }
  }

  /**
   * Report an API error. Applies the appropriate cooldown policy:
   *   - 429 → rateLimitCooldownMs (default 1 hour)
   *   - 402 → paymentCooldownMs (default 24 hours)
   *   - 401 → permanently disabled
   *
   * @returns true if there are other keys available to retry with
   */
  reportError(key: string, statusCode: number, errorMessage?: string): boolean {
    const entry = this.entries.find(e => e.key === key);
    if (!entry) return this.hasAvailableKeys();

    entry.errorCount++;
    entry.lastError = errorMessage ?? `HTTP ${statusCode}`;

    const now = this.nowFn();

    switch (statusCode) {
      case 401:
        // Permanently disabled — invalid or revoked key
        entry.status = 'disabled';
        entry.cooldownUntil = null;
        break;

      case 402:
        // Payment required — long cooldown
        entry.status = 'cooldown';
        entry.cooldownUntil = now + this.config.paymentCooldownMs;
        break;

      case 429:
        // Rate limited — short cooldown
        entry.status = 'cooldown';
        entry.cooldownUntil = now + this.config.rateLimitCooldownMs;
        break;

      default:
        // Other errors (500, 503, etc.) — brief cooldown (5 minutes)
        entry.status = 'cooldown';
        entry.cooldownUntil = now + 5 * 60 * 1000;
        break;
    }

    return this.hasAvailableKeys();
  }

  /**
   * Check if at least one key is active (or about to recover from cooldown).
   */
  hasAvailableKeys(): boolean {
    const now = this.nowFn();
    return this.entries.some(e =>
      e.status === 'active' ||
      (e.status === 'cooldown' && e.cooldownUntil !== null && now >= e.cooldownUntil)
    );
  }

  /**
   * Get the pool status for monitoring and debugging.
   */
  getStatus(): PoolStatus {
    const now = this.nowFn();

    // Recover expired cooldowns before reporting
    for (const entry of this.entries) {
      if (entry.status === 'cooldown' && entry.cooldownUntil !== null && now >= entry.cooldownUntil) {
        entry.status = 'active';
        entry.cooldownUntil = null;
        entry.lastError = null;
      }
    }

    return {
      provider: this.config.provider,
      totalKeys: this.entries.length,
      activeKeys: this.entries.filter(e => e.status === 'active').length,
      cooldownKeys: this.entries.filter(e => e.status === 'cooldown').length,
      disabledKeys: this.entries.filter(e => e.status === 'disabled').length,
      entries: this.entries.map(e => ({
        name: e.name,
        status: e.status,
        cooldownUntil: e.cooldownUntil,
        lastError: e.lastError,
        successCount: e.successCount,
        errorCount: e.errorCount,
      })),
    };
  }

  /** Total number of keys in the pool */
  get size(): number {
    return this.entries.length;
  }
}

// ── Vault Loader ─────────────────────────────────────────────────────────

/**
 * Minimal vault interface — just enough to load keys.
 * Matches @waggle/core VaultStore.get() and VaultStore.has().
 */
export interface VaultLike {
  get(name: string): { value: string } | null;
  has(name: string): boolean;
}

/**
 * Load all API keys for a provider from the vault.
 * Follows the convention: `provider`, `provider-2`, `provider-3`, ...
 *
 * @param vault  Vault instance
 * @param provider  Provider name (e.g., "anthropic", "openai")
 * @param maxKeys  Maximum number of keys to look for (default: 10)
 * @returns A populated CredentialPool
 */
export function loadCredentialPool(
  vault: VaultLike,
  provider: string,
  maxKeys = 10,
): CredentialPool {
  const pool = new CredentialPool({ provider });

  // Primary key: just the provider name
  const primary = vault.get(provider);
  if (primary) {
    pool.addCredential(provider, primary.value);
  }

  // Additional keys: provider-2, provider-3, ...
  for (let i = 2; i <= maxKeys; i++) {
    const name = `${provider}-${i}`;
    if (!vault.has(name)) break; // Stop at first gap
    const entry = vault.get(name);
    if (entry) {
      pool.addCredential(name, entry.value);
    }
  }

  return pool;
}

/**
 * Extract the HTTP status code from a caught error.
 * Works with standard Error objects that have a status property,
 * or error messages containing status codes.
 */
export function extractStatusCode(err: unknown): number | null {
  // Check for .status property (axios, fetch response errors)
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') return status;

  // Check for .statusCode property
  const statusCode = (err as { statusCode?: number })?.statusCode;
  if (typeof statusCode === 'number') return statusCode;

  // Extract from error message
  if (err instanceof Error) {
    const match = err.message.match(/\b(401|402|429|500|502|503)\b/);
    if (match) return parseInt(match[1], 10);
  }

  return null;
}
