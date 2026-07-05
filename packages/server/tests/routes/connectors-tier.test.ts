/**
 * Connector tier cap (review LOW #1, founder-requested enforcement). After the
 * Solo/Team collapse EVERY tier has an unlimited connectorLimit (-1), so
 * connectorCapExceeded never caps a real tier. These tests pin that unlimited
 * contract; re-connecting an already-connected connector (token refresh) is a
 * no-op regardless.
 */
import { describe, it, expect } from 'vitest';
import { getCapabilities } from '@waggle/shared';
import { connectorCapExceeded } from '../../src/local/routes/connectors.js';

describe('connectorCapExceeded', () => {
  it('FREE (Solo) is unlimited (-1) — never capped', () => {
    expect(getCapabilities('FREE').connectorLimit).toBe(-1);
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('FREE', many, 'new-one')).toBeNull();
  });

  it('FREE re-connecting an already-connected connector → allowed (token refresh)', () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('FREE', many, 'c0')).toBeNull();
  });

  it('TEAMS is unlimited — never capped', () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('TEAMS', many, 'new-one')).toBeNull();
  });

  it('TRIAL is unlimited — never capped', () => {
    const many = Array.from({ length: 50 }, (_, i) => `c${i}`);
    expect(connectorCapExceeded('TRIAL', many, 'new-one')).toBeNull();
  });
});
