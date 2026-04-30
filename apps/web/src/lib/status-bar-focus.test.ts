/**
 * P39 — status-bar-focus vitest.
 */
import { describe, it, expect } from 'vitest';
import { buildStatusBarFocus, DEFAULT_MAX_LENGTH } from './status-bar-focus';

describe('buildStatusBarFocus', () => {
  it('returns null when there is no focused window', () => {
    expect(buildStatusBarFocus({ focused: null })).toBeNull();
    expect(buildStatusBarFocus({ focused: undefined })).toBeNull();
  });

  it('returns null for minimized windows', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Chat', minimized: true },
    })).toBeNull();
  });

  it('returns the title when focused and visible', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Research · Claude' },
    })).toBe('Research · Claude');
  });

  it('trims surrounding whitespace in the title', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: '  Files  ' },
    })).toBe('Files');
  });

  it('strips the workspace prefix when present to avoid duplication', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Marketing · Chat · Researcher' },
      workspaceName: 'Marketing',
    })).toBe('Chat · Researcher');
  });

  it('does not strip when the workspace name only partially matches', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Marketing Hub · Chat' },
      workspaceName: 'Marketing',
    })).toBe('Marketing Hub · Chat');
  });

  it('returns null when the title equals the workspace name after stripping', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Marketing · ' },
      workspaceName: 'Marketing',
    })).toBeNull();
  });

  it('returns null for empty or whitespace-only titles', () => {
    expect(buildStatusBarFocus({ focused: { appId: 'chat', title: '' } })).toBeNull();
    expect(buildStatusBarFocus({ focused: { appId: 'chat', title: '   ' } })).toBeNull();
  });

  it('clips titles longer than maxLength with an ellipsis', () => {
    const long = 'x'.repeat(DEFAULT_MAX_LENGTH + 20);
    const label = buildStatusBarFocus({ focused: { appId: 'files', title: long } });
    expect(label).toMatch(/…$/);
    expect(label!.length).toBeLessThanOrEqual(DEFAULT_MAX_LENGTH);
  });

  it('honors a custom maxLength', () => {
    const label = buildStatusBarFocus({
      focused: { appId: 'files', title: 'Some Long Title Here' },
      maxLength: 10,
    });
    expect(label!.length).toBeLessThanOrEqual(10);
    expect(label!.endsWith('…')).toBe(true);
  });

  it('treats minimized===false as visible', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Chat', minimized: false },
    })).toBe('Chat');
  });

  it('FR #12: returns null when the title equals the workspace name (default-persona chat)', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Default Workspace' },
      workspaceName: 'Default Workspace',
    })).toBeNull();
  });

  it('FR #12: case-insensitive workspace-name equality check', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'default workspace' },
      workspaceName: 'Default Workspace',
    })).toBeNull();
  });

  it('FR #12: still keeps a label that contains the workspace name as a substring', () => {
    expect(buildStatusBarFocus({
      focused: { appId: 'chat', title: 'Default Workspace · Researcher' },
      workspaceName: 'Default Workspace',
    })).toBe('Researcher');
  });
});
