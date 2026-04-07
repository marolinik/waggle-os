import { describe, it, expect } from 'vitest';
import {
  CredentialPool,
  loadCredentialPool,
  extractStatusCode,
  type VaultLike,
} from '../src/credential-pool.js';

// ── Helpers ──────────────────────────────────────────────────────────────

function createPool(keyCount = 3, nowFn?: () => number): CredentialPool {
  const pool = new CredentialPool({ provider: 'anthropic' }, nowFn);
  for (let i = 0; i < keyCount; i++) {
    pool.addCredential(`key-${i}`, `sk-${i}`);
  }
  return pool;
}

function mockVault(keys: Record<string, string>): VaultLike {
  return {
    get(name: string) {
      return name in keys ? { value: keys[name] } : null;
    },
    has(name: string) {
      return name in keys;
    },
  };
}

// ── Basic Operations ─────────────────────────────────────────────────────

describe('CredentialPool', () => {
  it('starts empty', () => {
    const pool = new CredentialPool({ provider: 'test' });
    expect(pool.size).toBe(0);
    expect(pool.getKey()).toBeNull();
  });

  it('returns added keys', () => {
    const pool = createPool(2);
    const key = pool.getKey();
    expect(key).toBe('sk-0');
  });

  it('prevents duplicate additions', () => {
    const pool = new CredentialPool({ provider: 'test' });
    pool.addCredential('k1', 'val1');
    pool.addCredential('k1', 'val2');
    expect(pool.size).toBe(1);
  });

  it('getNameForKey returns the credential name', () => {
    const pool = createPool(2);
    expect(pool.getNameForKey('sk-0')).toBe('key-0');
    expect(pool.getNameForKey('sk-1')).toBe('key-1');
    expect(pool.getNameForKey('unknown')).toBeNull();
  });
});

// ── Round-Robin ──────────────────────────────────────────────────────────

describe('round-robin', () => {
  it('rotates through keys in order', () => {
    const pool = createPool(3);
    expect(pool.getKey()).toBe('sk-0');
    expect(pool.getKey()).toBe('sk-1');
    expect(pool.getKey()).toBe('sk-2');
    expect(pool.getKey()).toBe('sk-0'); // wraps around
  });

  it('skips keys in cooldown', () => {
    const pool = createPool(3);
    pool.reportError('sk-1', 429);
    expect(pool.getKey()).toBe('sk-0');
    expect(pool.getKey()).toBe('sk-2'); // sk-1 skipped
    expect(pool.getKey()).toBe('sk-0');
  });

  it('skips disabled keys', () => {
    const pool = createPool(3);
    pool.reportError('sk-1', 401);
    expect(pool.getKey()).toBe('sk-0');
    expect(pool.getKey()).toBe('sk-2');
    expect(pool.getKey()).toBe('sk-0');
  });
});

// ── Cooldown: 429 (Rate Limit) ───────────────────────────────────────────

describe('429 cooldown', () => {
  it('puts key in 1-hour cooldown on 429', () => {
    let now = 1000000;
    const pool = createPool(2, () => now);

    pool.reportError('sk-0', 429, 'Rate limit exceeded');
    expect(pool.getKey()).toBe('sk-1'); // sk-0 is in cooldown

    const status = pool.getStatus();
    const k0 = status.entries.find(e => e.name === 'key-0');
    expect(k0?.status).toBe('cooldown');
    expect(k0?.lastError).toBe('Rate limit exceeded');
  });

  it('auto-recovers after cooldown expires', () => {
    let now = 1000000;
    const pool = createPool(2, () => now);

    pool.reportError('sk-0', 429);
    expect(pool.getKey()).toBe('sk-1');

    // Fast-forward past the 1-hour cooldown
    now += 60 * 60 * 1000 + 1;

    // sk-0 should be available again
    const key = pool.getKey();
    // After recovery, round-robin continues — could be sk-0 or sk-1
    expect(['sk-0', 'sk-1']).toContain(key);

    const status = pool.getStatus();
    const k0 = status.entries.find(e => e.name === 'key-0');
    expect(k0?.status).toBe('active');
  });

  it('does NOT recover before cooldown expires', () => {
    let now = 1000000;
    const pool = createPool(1, () => now);

    pool.reportError('sk-0', 429);
    expect(pool.getKey()).toBeNull(); // only key is in cooldown

    // Advance 30 minutes — not enough
    now += 30 * 60 * 1000;
    expect(pool.getKey()).toBeNull();
  });
});

// ── Cooldown: 402 (Payment Required) ─────────────────────────────────────

describe('402 cooldown', () => {
  it('puts key in 24-hour cooldown on 402', () => {
    let now = 1000000;
    const pool = createPool(2, () => now);

    pool.reportError('sk-0', 402, 'Insufficient funds');

    const status = pool.getStatus();
    const k0 = status.entries.find(e => e.name === 'key-0');
    expect(k0?.status).toBe('cooldown');
    expect(k0?.cooldownUntil).toBe(now + 24 * 60 * 60 * 1000);
  });

  it('recovers after 24 hours', () => {
    let now = 1000000;
    const pool = createPool(1, () => now);

    pool.reportError('sk-0', 402);
    expect(pool.getKey()).toBeNull();

    // Fast-forward 24 hours
    now += 24 * 60 * 60 * 1000 + 1;
    expect(pool.getKey()).toBe('sk-0');
  });
});

// ── Permanent Disable: 401 ───────────────────────────────────────────────

describe('401 permanent disable', () => {
  it('permanently disables key on 401', () => {
    const pool = createPool(2);
    pool.reportError('sk-0', 401, 'Invalid API key');

    const status = pool.getStatus();
    const k0 = status.entries.find(e => e.name === 'key-0');
    expect(k0?.status).toBe('disabled');
    expect(k0?.cooldownUntil).toBeNull();
  });

  it('never recovers a disabled key', () => {
    let now = 1000000;
    const pool = createPool(1, () => now);

    pool.reportError('sk-0', 401);
    expect(pool.getKey()).toBeNull();

    // Even after 100 hours
    now += 100 * 60 * 60 * 1000;
    expect(pool.getKey()).toBeNull();
  });
});

// ── Other Errors ─────────────────────────────────────────────────────────

describe('other errors', () => {
  it('puts key in 5-minute cooldown for 500/503', () => {
    let now = 1000000;
    const pool = createPool(2, () => now);

    pool.reportError('sk-0', 500);

    const status = pool.getStatus();
    const k0 = status.entries.find(e => e.name === 'key-0');
    expect(k0?.status).toBe('cooldown');
    expect(k0?.cooldownUntil).toBe(now + 5 * 60 * 1000);
  });
});

// ── Success Tracking ─────────────────────────────────────────────────────

describe('success tracking', () => {
  it('increments success count', () => {
    const pool = createPool(1);
    pool.reportSuccess('sk-0');
    pool.reportSuccess('sk-0');

    const status = pool.getStatus();
    expect(status.entries[0].successCount).toBe(2);
  });

  it('tracks errors separately', () => {
    const pool = createPool(1);
    pool.reportSuccess('sk-0');
    pool.reportError('sk-0', 429);

    const status = pool.getStatus();
    expect(status.entries[0].successCount).toBe(1);
    expect(status.entries[0].errorCount).toBe(1);
  });
});

// ── hasAvailableKeys ─────────────────────────────────────────────────────

describe('hasAvailableKeys', () => {
  it('returns true when active keys exist', () => {
    const pool = createPool(2);
    expect(pool.hasAvailableKeys()).toBe(true);
  });

  it('returns false when all keys are disabled', () => {
    const pool = createPool(2);
    pool.reportError('sk-0', 401);
    pool.reportError('sk-1', 401);
    expect(pool.hasAvailableKeys()).toBe(false);
  });

  it('returns true when a cooldown is about to expire', () => {
    let now = 1000000;
    const pool = createPool(1, () => now);
    pool.reportError('sk-0', 429);

    // Still in cooldown
    expect(pool.hasAvailableKeys()).toBe(false);

    // Past cooldown
    now += 60 * 60 * 1000 + 1;
    expect(pool.hasAvailableKeys()).toBe(true);
  });

  it('reportError returns whether other keys are available', () => {
    const pool = createPool(3);
    expect(pool.reportError('sk-0', 429)).toBe(true);  // sk-1 and sk-2 still active
    expect(pool.reportError('sk-1', 429)).toBe(true);  // sk-2 still active
    expect(pool.reportError('sk-2', 429)).toBe(false); // all in cooldown
  });
});

// ── Pool Status ──────────────────────────────────────────────────────────

describe('getStatus', () => {
  it('returns correct counts', () => {
    const pool = createPool(4);
    pool.reportError('sk-0', 401);  // disabled
    pool.reportError('sk-1', 429);  // cooldown

    const status = pool.getStatus();
    expect(status.provider).toBe('anthropic');
    expect(status.totalKeys).toBe(4);
    expect(status.activeKeys).toBe(2);
    expect(status.cooldownKeys).toBe(1);
    expect(status.disabledKeys).toBe(1);
  });

  it('recovers expired cooldowns in status', () => {
    let now = 1000000;
    const pool = createPool(1, () => now);
    pool.reportError('sk-0', 429);

    now += 60 * 60 * 1000 + 1;
    const status = pool.getStatus();
    expect(status.activeKeys).toBe(1);
    expect(status.cooldownKeys).toBe(0);
  });
});

// ── Vault Loader ─────────────────────────────────────────────────────────

describe('loadCredentialPool', () => {
  it('loads single key', () => {
    const vault = mockVault({ 'anthropic': 'sk-ant-primary' });
    const pool = loadCredentialPool(vault, 'anthropic');
    expect(pool.size).toBe(1);
    expect(pool.getKey()).toBe('sk-ant-primary');
  });

  it('loads multiple keys following convention', () => {
    const vault = mockVault({
      'anthropic': 'sk-ant-1',
      'anthropic-2': 'sk-ant-2',
      'anthropic-3': 'sk-ant-3',
    });
    const pool = loadCredentialPool(vault, 'anthropic');
    expect(pool.size).toBe(3);
    expect(pool.getKey()).toBe('sk-ant-1');
    expect(pool.getKey()).toBe('sk-ant-2');
    expect(pool.getKey()).toBe('sk-ant-3');
  });

  it('stops at first gap in numbering', () => {
    const vault = mockVault({
      'openai': 'sk-1',
      'openai-2': 'sk-2',
      // openai-3 missing
      'openai-4': 'sk-4',
    });
    const pool = loadCredentialPool(vault, 'openai');
    expect(pool.size).toBe(2); // only primary + -2
  });

  it('returns empty pool when no keys exist', () => {
    const vault = mockVault({});
    const pool = loadCredentialPool(vault, 'anthropic');
    expect(pool.size).toBe(0);
    expect(pool.getKey()).toBeNull();
  });

  it('respects maxKeys limit', () => {
    const keys: Record<string, string> = { 'test': 'k0' };
    for (let i = 2; i <= 20; i++) keys[`test-${i}`] = `k${i}`;

    const vault = mockVault(keys);
    const pool = loadCredentialPool(vault, 'test', 5);
    expect(pool.size).toBe(5); // primary + 2,3,4,5
  });
});

// ── extractStatusCode ────────────────────────────────────────────────────

describe('extractStatusCode', () => {
  it('extracts from .status property', () => {
    expect(extractStatusCode({ status: 429 })).toBe(429);
  });

  it('extracts from .statusCode property', () => {
    expect(extractStatusCode({ statusCode: 402 })).toBe(402);
  });

  it('extracts from error message', () => {
    expect(extractStatusCode(new Error('Server returned 401 Unauthorized'))).toBe(401);
  });

  it('extracts rate limit 429 from message', () => {
    expect(extractStatusCode(new Error('HTTP 429 Too Many Requests'))).toBe(429);
  });

  it('returns null for unknown errors', () => {
    expect(extractStatusCode(new Error('Network timeout'))).toBeNull();
    expect(extractStatusCode('string error')).toBeNull();
    expect(extractStatusCode(null)).toBeNull();
  });
});
