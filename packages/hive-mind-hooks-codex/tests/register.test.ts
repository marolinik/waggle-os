import { describe, expect, it } from 'vitest';
import {
  jsonRegister,
  jsonUnregister,
  hasHiveEntries,
  type JsonRegisterEntry,
} from '@waggle/hive-mind-hooks-core';
import {
  codexRegisterSpec,
  HIVE_MIND_MARKER,
  SESSION_START_MATCHER,
} from '../src/adapter.js';
import { hookCommandFor } from '../src/paths.js';

const HOOKS_DIR = '/abs/dist/hooks';

function entry(
  lifecycle: JsonRegisterEntry['lifecycle'],
  basename: string,
  timeout = 5,
): JsonRegisterEntry {
  return {
    lifecycle,
    // Registration-shape tests are platform-neutral; command dispatch itself
    // is covered by paths.test.ts against Codex's exact Windows Rust runner.
    command: hookCommandFor(`${HOOKS_DIR}/${basename}.js`, undefined, { platform: 'linux' }),
    timeout,
  };
}

const ALL_ENTRIES: readonly JsonRegisterEntry[] = [
  entry('session-start', 'session-start'),
  entry('user-prompt-submit', 'user-prompt-submit'),
  entry('stop', 'stop'),
  entry('pre-compact', 'pre-compact'),
];

interface CodexGroup {
  matcher?: string;
  hooks: Array<{ type: string; command: string; timeout?: number }>;
  _hiveMindShim?: string;
}

function groupsAt(config: Record<string, unknown>, eventKey: string): CodexGroup[] {
  const hooks = config['hooks'] as Record<string, unknown> | undefined;
  return (hooks?.[eventKey] as CodexGroup[] | undefined) ?? [];
}

describe('jsonRegister (codex {matcher,hooks:[...]} group shape)', () => {
  it('returns a NEW object — does not mutate input', () => {
    const original: Record<string, unknown> = { hooks: { SessionStart: [] } };
    const merged = jsonRegister(original, [entry('session-start', 'session-start')], codexRegisterSpec);
    expect(merged).not.toBe(original);
    // Input untouched (immutability contract).
    expect((original['hooks'] as Record<string, unknown>)['SessionStart']).toEqual([]);
  });

  it('registers a group under each codex native event key', () => {
    const merged = jsonRegister({}, ALL_ENTRIES, codexRegisterSpec);
    expect(groupsAt(merged, 'SessionStart')).toHaveLength(1);
    expect(groupsAt(merged, 'UserPromptSubmit')).toHaveLength(1);
    expect(groupsAt(merged, 'Stop')).toHaveLength(1);
    expect(groupsAt(merged, 'PreCompact')).toHaveLength(1);
  });

  it('builds the codex group shape: {hooks:[{type:command,command,timeout}], marker}', () => {
    const merged = jsonRegister({}, [entry('stop', 'stop', 9)], codexRegisterSpec);
    const g = groupsAt(merged, 'Stop')[0];
    expect(g._hiveMindShim).toBe(HIVE_MIND_MARKER);
    expect(g.hooks).toHaveLength(1);
    expect(g.hooks[0].type).toBe('command');
    expect(g.hooks[0].command).toContain('stop.js');
    expect(g.hooks[0].timeout).toBe(9);
  });

  it('carries the lifecycle matcher ONLY on SessionStart', () => {
    const merged = jsonRegister({}, ALL_ENTRIES, codexRegisterSpec);
    expect(groupsAt(merged, 'SessionStart')[0].matcher).toBe(SESSION_START_MATCHER);
    expect(groupsAt(merged, 'UserPromptSubmit')[0].matcher).toBeUndefined();
    expect(groupsAt(merged, 'Stop')[0].matcher).toBeUndefined();
    expect(groupsAt(merged, 'PreCompact')[0].matcher).toBeUndefined();
  });

  it('preserves existing (user) hook groups verbatim — additive merge', () => {
    const existing: Record<string, unknown> = {
      hooks: {
        SessionStart: [
          { matcher: 'startup', hooks: [{ type: 'command', command: 'node /existing/x.js' }] },
        ],
      },
    };
    const merged = jsonRegister(existing, [entry('session-start', 'session-start')], codexRegisterSpec);
    const arr = groupsAt(merged, 'SessionStart');
    expect(arr).toHaveLength(2);
    expect(arr[0].hooks[0].command).toBe('node /existing/x.js');
    expect(arr[0]._hiveMindShim).toBeUndefined();
    expect(arr[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
  });

  it('preserves unrelated top-level keys (does not touch the user TOML-adjacent config)', () => {
    const merged = jsonRegister(
      { schemaVersion: 2, hooks: {} },
      [entry('session-start', 'session-start')],
      codexRegisterSpec,
    );
    expect(merged['schemaVersion']).toBe(2);
  });

  it('replaces our own marker-tagged group on re-install (idempotent dedup by command)', () => {
    const e = entry('session-start', 'session-start', 5);
    const merged1 = jsonRegister({}, [e], codexRegisterSpec);
    const merged2 = jsonRegister(merged1, [{ ...e, timeout: 11 }], codexRegisterSpec);
    const arr = groupsAt(merged2, 'SessionStart');
    expect(arr).toHaveLength(1); // never duplicated
    expect(arr[0].hooks[0].timeout).toBe(11);
  });
});

describe('hasHiveEntries (codex)', () => {
  it('false on empty / hookless config', () => {
    expect(hasHiveEntries(undefined, codexRegisterSpec)).toBe(false);
    expect(hasHiveEntries({}, codexRegisterSpec)).toBe(false);
    expect(hasHiveEntries({ hooks: {} }, codexRegisterSpec)).toBe(false);
  });

  it('true once a marker-tagged group is present', () => {
    const merged = jsonRegister({}, [entry('stop', 'stop')], codexRegisterSpec);
    expect(hasHiveEntries(merged, codexRegisterSpec)).toBe(true);
  });

  it('false for a config holding ONLY non-hive (user) groups', () => {
    const userOnly: Record<string, unknown> = {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /user/own.js' }] }] },
    };
    expect(hasHiveEntries(userOnly, codexRegisterSpec)).toBe(false);
  });
});

describe('jsonUnregister (codex)', () => {
  it('strips exactly our marker-tagged groups, preserves user groups', () => {
    const userGroup = { hooks: [{ type: 'command', command: 'node /user/own.js' }] };
    const withUser: Record<string, unknown> = { hooks: { Stop: [userGroup] } };
    const merged = jsonRegister(withUser, [entry('stop', 'stop')], codexRegisterSpec);
    expect(groupsAt(merged, 'Stop')).toHaveLength(2);

    const stripped = jsonUnregister(merged, codexRegisterSpec);
    const arr = groupsAt(stripped, 'Stop');
    expect(arr).toHaveLength(1);
    expect(arr[0].hooks[0].command).toBe('node /user/own.js');
    expect(hasHiveEntries(stripped, codexRegisterSpec)).toBe(false);
  });
});
