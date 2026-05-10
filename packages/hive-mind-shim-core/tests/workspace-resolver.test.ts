import { describe, expect, it } from 'vitest';
import { isAbsoluteWorkspacePath, resolveWorkspace } from '../src/workspace-resolver.js';
import { join, resolve } from 'node:path';

// Resolve path fixtures against the current platform so tests work on
// both POSIX (e.g. /fake/home) and Windows (D:\fake\home). The resolver
// internally calls path.resolve on its cwd input — fixtures must match.
const FAKE_HOME = resolve('/fake/home');

function makeExists(present: readonly string[]): (p: string) => Promise<boolean> {
  const set = new Set(present);
  return async (p: string) => set.has(p);
}

describe('resolveWorkspace', () => {
  it('falls back to global mode when no project marker exists', async () => {
    const ws = await resolveWorkspace(resolve('/some/random/cwd'), {
      home: FAKE_HOME,
      exists: makeExists([]),
      walkUp: false,
    });
    expect(ws.mode).toBe('global');
    expect(ws.path).toBe(join(FAKE_HOME, '.hive-mind', 'global.mind'));
  });

  it('returns per-project mode when marker exists at cwd', async () => {
    const cwd = resolve('/proj/foo');
    const marker = join(cwd, '.hive-mind', 'workspace.mind');
    const ws = await resolveWorkspace(cwd, {
      home: FAKE_HOME,
      exists: makeExists([marker]),
      walkUp: false,
    });
    expect(ws.mode).toBe('per-project');
    expect(ws.path).toBe(marker);
    expect(ws.cwd).toBe(cwd);
  });

  it('walks up to a parent project marker', async () => {
    const projectRoot = resolve('/proj/foo');
    const cwd = join(projectRoot, 'src', 'deep', 'nested');
    const marker = join(projectRoot, '.hive-mind', 'workspace.mind');
    const ws = await resolveWorkspace(cwd, {
      home: FAKE_HOME,
      exists: makeExists([marker]),
      walkUp: true,
    });
    expect(ws.mode).toBe('per-project');
    expect(ws.path).toBe(marker);
  });

  it('skips the walk when walkUp is false', async () => {
    const projectRoot = resolve('/proj/foo');
    const cwd = join(projectRoot, 'src', 'deep');
    const ancestorMarker = join(projectRoot, '.hive-mind', 'workspace.mind');
    const ws = await resolveWorkspace(cwd, {
      home: FAKE_HOME,
      exists: makeExists([ancestorMarker]),
      walkUp: false,
    });
    expect(ws.mode).toBe('global');
  });

  it('records the original cwd even when resolving to global', async () => {
    const cwd = resolve('/proj/foo');
    const ws = await resolveWorkspace(cwd, {
      home: FAKE_HOME,
      exists: makeExists([]),
      walkUp: true,
    });
    expect(ws.cwd).toBe(cwd);
    expect(ws.mode).toBe('global');
  });

  it('uses provided home override for the global fallback', async () => {
    const customHome = resolve('/custom/home');
    const ws = await resolveWorkspace(resolve('/proj/x'), {
      home: customHome,
      exists: makeExists([]),
      walkUp: false,
    });
    expect(ws.path).toBe(join(customHome, '.hive-mind', 'global.mind'));
  });
});

describe('isAbsoluteWorkspacePath', () => {
  it('detects absolute paths on the current platform', () => {
    expect(isAbsoluteWorkspacePath(resolve('/etc/foo'))).toBe(true);
    expect(isAbsoluteWorkspacePath('relative/path')).toBe(false);
  });
});
