/**
 * normalizeWorkspacePath (push-review MEDIUM, path traversal): lexical guard
 * for untrusted deep-link paths. Pure-function pinning of the traversal cases.
 */
import { describe, it, expect } from 'vitest';
import { normalizeWorkspacePath } from '@/components/os/apps/files/file-utils';

describe('normalizeWorkspacePath', () => {
  it('leaves a clean absolute path intact', () => {
    expect(normalizeWorkspacePath('/reports/q3-summary.md')).toBe('/reports/q3-summary.md');
  });

  it('adds a leading slash to a relative path', () => {
    expect(normalizeWorkspacePath('reports/q3-summary.md')).toBe('/reports/q3-summary.md');
  });

  it('strips a single ../ segment', () => {
    expect(normalizeWorkspacePath('/reports/../notes.md')).toBe('/notes.md');
  });

  it('cannot escape root with stacked ../', () => {
    expect(normalizeWorkspacePath('/reports/../../etc/passwd')).toBe('/etc/passwd');
    expect(normalizeWorkspacePath('../../../../etc/passwd')).toBe('/etc/passwd');
  });

  it('collapses . and empty segments', () => {
    expect(normalizeWorkspacePath('/a/./b//c')).toBe('/a/b/c');
  });

  it('resolves to root for empty / dot-only / over-popped inputs', () => {
    expect(normalizeWorkspacePath('')).toBe('/');
    expect(normalizeWorkspacePath('/')).toBe('/');
    expect(normalizeWorkspacePath('.')).toBe('/');
    expect(normalizeWorkspacePath('/reports/..')).toBe('/');
    expect(normalizeWorkspacePath('/..')).toBe('/');
  });

  it('never leaves a .. segment in the output', () => {
    for (const input of ['/a/../../b', '..%2f..', '/x/../../../y', 'a/b/../../../../z']) {
      expect(normalizeWorkspacePath(input).split('/')).not.toContain('..');
    }
  });
});
