import { describe, it, expect } from 'vitest';
import { rawId, isTogglable, describeError, isTierError } from './install-store';

describe('rawId', () => {
  it('strips the namespace prefix', () => {
    expect(rawId('connector:slack')).toBe('slack');
    expect(rawId('pkg:7')).toBe('7');
    expect(rawId('mcp:postgres')).toBe('postgres');
  });
  it('returns the id unchanged when there is no prefix', () => {
    expect(rawId('slack')).toBe('slack');
  });
  it('only strips the FIRST colon (ids may contain colons)', () => {
    expect(rawId('mcp:scope:postgres')).toBe('scope:postgres');
  });
});

describe('isTogglable', () => {
  it('package kinds are togglable (marketplace skill / mcp package)', () => {
    expect(isTogglable({ type: 'skill', kind: 'package' })).toBe(true);
    expect(isTogglable({ type: 'mcp', kind: 'package' })).toBe(true);
  });
  it('packs are browse-only', () => {
    expect(isTogglable({ type: 'skill', kind: 'pack' })).toBe(false);
  });
  it('federated connectors and catalog mcps are togglable', () => {
    expect(isTogglable({ type: 'connector', kind: 'federated' })).toBe(true);
    expect(isTogglable({ type: 'mcp', kind: 'federated' })).toBe(true);
  });
  it('ambient kinds (agent/model/template) are NOT togglable', () => {
    expect(isTogglable({ type: 'agent', kind: 'federated' })).toBe(false);
    expect(isTogglable({ type: 'model', kind: 'federated' })).toBe(false);
    expect(isTogglable({ type: 'template', kind: 'federated' })).toBe(false);
  });
});

describe('describeError', () => {
  it('uses an Error message', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });
  it('falls back for non-errors', () => {
    expect(describeError('nope')).toBe('Server unreachable');
    expect(describeError(undefined)).toBe('Server unreachable');
  });
});

describe('isTierError', () => {
  it('is true for a 403 with the TIER_INSUFFICIENT marker', () => {
    expect(isTierError({ status: 403, body: { error: 'TIER_INSUFFICIENT' } })).toBe(true);
  });
  it('is false for other 403s, other statuses, and non-errors', () => {
    expect(isTierError({ status: 403, body: { error: 'blocked' } })).toBe(false);
    expect(isTierError({ status: 500, body: { error: 'TIER_INSUFFICIENT' } })).toBe(false);
    expect(isTierError(new Error('boom'))).toBe(false);
    expect(isTierError(undefined)).toBe(false);
  });
});
