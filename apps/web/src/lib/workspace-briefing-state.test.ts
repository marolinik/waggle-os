/**
 * M-23 / ENG-2 — WorkspaceBriefing per-workspace collapsed-state contract.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  workspaceBriefingStorageKey,
  readWorkspaceBriefingCollapsed,
  writeWorkspaceBriefingCollapsed,
} from './workspace-briefing-state';

describe('workspaceBriefingStorageKey', () => {
  it('prefixes with the canonical namespace', () => {
    expect(workspaceBriefingStorageKey('ws-1')).toBe('waggle:workspace-briefing-collapsed:ws-1');
  });

  it('sanitises whitespace and angle brackets', () => {
    // Input has 8 chars: [space]ws<1>[space][space]. Each flagged
    // character maps to a single underscore — 4 replacements total.
    expect(workspaceBriefingStorageKey(' ws<1>  ')).toBe('waggle:workspace-briefing-collapsed:_ws_1___');
  });

  it('produces distinct keys for distinct ids', () => {
    const a = workspaceBriefingStorageKey('ws-1');
    const b = workspaceBriefingStorageKey('ws-2');
    expect(a).not.toBe(b);
  });
});

describe('readWorkspaceBriefingCollapsed / writeWorkspaceBriefingCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to false when no value is stored', () => {
    expect(readWorkspaceBriefingCollapsed('ws-1')).toBe(false);
  });

  it('returns false for an empty workspace id instead of throwing', () => {
    expect(readWorkspaceBriefingCollapsed('')).toBe(false);
  });

  it('round-trips true', () => {
    writeWorkspaceBriefingCollapsed('ws-1', true);
    expect(readWorkspaceBriefingCollapsed('ws-1')).toBe(true);
  });

  it('round-trips false after a true', () => {
    writeWorkspaceBriefingCollapsed('ws-1', true);
    writeWorkspaceBriefingCollapsed('ws-1', false);
    expect(readWorkspaceBriefingCollapsed('ws-1')).toBe(false);
  });

  it('keeps separate state per workspace', () => {
    writeWorkspaceBriefingCollapsed('ws-a', true);
    writeWorkspaceBriefingCollapsed('ws-b', false);
    expect(readWorkspaceBriefingCollapsed('ws-a')).toBe(true);
    expect(readWorkspaceBriefingCollapsed('ws-b')).toBe(false);
  });

  it('write with empty id is a silent no-op', () => {
    writeWorkspaceBriefingCollapsed('', true);
    // Nothing added under the bare prefix either.
    expect(window.localStorage.getItem('waggle:workspace-briefing-collapsed:')).toBeNull();
  });

  it('does not leak across the colon boundary in the prefix', () => {
    writeWorkspaceBriefingCollapsed('ws-1', true);
    // A plain match on the prefix must NOT trigger for a DIFFERENT id.
    expect(readWorkspaceBriefingCollapsed('ws-11')).toBe(false);
  });
});
