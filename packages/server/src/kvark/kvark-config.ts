/**
 * KVARK Config — reads KVARK connection details from the Waggle vault.
 *
 * Credentials stored in vault as 'kvark:connection' with JSON value:
 * { "baseUrl": "http://localhost:8000", "identifier": "user@example.com", "password": "..." }
 */

import type { KvarkClientConfig } from './kvark-types.js';

/** Minimal vault interface — matches VaultStore.get() signature */
export interface VaultLike {
  get(name: string): { value: string } | null;
}

/**
 * Load KVARK client config from vault. Returns null if not configured.
 */
export function getKvarkConfig(vault: VaultLike): KvarkClientConfig | null {
  const entry = vault.get('kvark:connection');
  if (!entry) return null;

  try {
    const parsed = JSON.parse(entry.value) as Record<string, unknown>;
    const baseUrl = parsed.baseUrl;
    const identifier = parsed.identifier;
    const password = parsed.password;

    if (typeof baseUrl !== 'string' || typeof identifier !== 'string' || typeof password !== 'string') {
      return null;
    }
    if (!baseUrl || !identifier || !password) {
      return null;
    }

    return {
      baseUrl,
      identifier,
      password,
      timeoutMs: typeof parsed.timeoutMs === 'number' ? parsed.timeoutMs : undefined,
    };
  } catch {
    return null;
  }
}
