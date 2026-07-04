import { describe, it, expect } from 'vitest';
import { resolveActiveWorkspaceId } from './workspace-selection';

describe('resolveActiveWorkspaceId (W2A — explicit-only selection)', () => {
  it('keeps null when nothing is selected (no auto-select of data[0])', () => {
    expect(resolveActiveWorkspaceId(null, ['ws-a', 'ws-b'])).toBeNull();
  });

  it('keeps a still-present selection', () => {
    expect(resolveActiveWorkspaceId('ws-b', ['ws-a', 'ws-b'])).toBe('ws-b');
  });

  it('drops a persisted-but-deleted id to null (not data[0])', () => {
    expect(resolveActiveWorkspaceId('ws-gone', ['ws-a', 'ws-b'])).toBeNull();
  });

  it('preserves offline local-* fallback ids the server list cannot vouch for', () => {
    expect(resolveActiveWorkspaceId('local-123', ['ws-a'])).toBe('local-123');
  });

  it('keeps null against an empty list', () => {
    expect(resolveActiveWorkspaceId(null, [])).toBeNull();
  });
});
