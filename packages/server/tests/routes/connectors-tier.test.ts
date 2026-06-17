/**
 * Connector tier cap (review LOW #1, founder-requested enforcement). FREE has a
 * finite connectorLimit; PRO+/TRIAL are unlimited. Re-connecting an
 * already-connected connector (token refresh) never counts against the cap.
 */
import { describe, it, expect } from 'vitest';
import { getCapabilities } from '@waggle/shared';
import { connectorCapExceeded } from '../../src/local/routes/connectors.js';

const FREE_LIMIT = getCapabilities('FREE').connectorLimit; // 5

describe('connectorCapExceeded', () => {
  it('FREE at the limit, connecting a NEW connector → exceeded', () => {
    const connected = Array.from({ length: FREE_LIMIT }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('FREE', connected, 'new-one')).toEqual({ limit: FREE_LIMIT, current: FREE_LIMIT });
  });

  it('FREE under the limit → allowed', () => {
    expect(connectorCapExceeded('FREE', ['a', 'b'], 'new-one')).toBeNull();
  });

  it('FREE at the limit, RE-connecting an already-connected connector → allowed (token refresh)', () => {
    const connected = Array.from({ length: FREE_LIMIT }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('FREE', connected, 'c0')).toBeNull();
  });

  it('PRO is unlimited (-1) — never capped', () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('PRO', many, 'new-one')).toBeNull();
  });

  it('TRIAL is unlimited — never capped', () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('TRIAL', many, 'new-one')).toBeNull();
  });
});
