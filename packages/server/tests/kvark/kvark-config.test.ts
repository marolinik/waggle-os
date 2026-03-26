/**
 * KVARK Config — vault-backed configuration tests.
 */

import { describe, it, expect } from 'vitest';
import { getKvarkConfig, type VaultLike } from '../../src/kvark/kvark-config.js';

function mockVault(entries: Record<string, string>): VaultLike {
  return {
    get(name: string) {
      const value = entries[name];
      return value !== undefined ? { value } : null;
    },
  };
}

describe('getKvarkConfig', () => {
  it('returns config from valid vault entry', () => {
    const vault = mockVault({
      'kvark:connection': JSON.stringify({
        baseUrl: 'http://kvark:8000',
        identifier: 'admin@test.com',
        password: 'secret123',
      }),
    });

    const config = getKvarkConfig(vault);
    expect(config).not.toBeNull();
    expect(config!.baseUrl).toBe('http://kvark:8000');
    expect(config!.identifier).toBe('admin@test.com');
    expect(config!.password).toBe('secret123');
  });

  it('returns null when vault has no kvark entry', () => {
    const vault = mockVault({});
    expect(getKvarkConfig(vault)).toBeNull();
  });

  it('returns null when vault entry is invalid JSON', () => {
    const vault = mockVault({ 'kvark:connection': 'not-json' });
    expect(getKvarkConfig(vault)).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    const vault = mockVault({
      'kvark:connection': JSON.stringify({ baseUrl: 'http://kvark:8000' }),
    });
    expect(getKvarkConfig(vault)).toBeNull();
  });

  it('returns null when fields are empty strings', () => {
    const vault = mockVault({
      'kvark:connection': JSON.stringify({ baseUrl: '', identifier: 'admin', password: 'pass' }),
    });
    expect(getKvarkConfig(vault)).toBeNull();
  });

  it('includes optional timeoutMs when present', () => {
    const vault = mockVault({
      'kvark:connection': JSON.stringify({
        baseUrl: 'http://kvark:8000',
        identifier: 'admin',
        password: 'pass',
        timeoutMs: 60000,
      }),
    });

    const config = getKvarkConfig(vault);
    expect(config!.timeoutMs).toBe(60000);
  });

  it('omits timeoutMs when not in vault entry', () => {
    const vault = mockVault({
      'kvark:connection': JSON.stringify({
        baseUrl: 'http://kvark:8000',
        identifier: 'admin',
        password: 'pass',
      }),
    });

    const config = getKvarkConfig(vault);
    expect(config!.timeoutMs).toBeUndefined();
  });
});
