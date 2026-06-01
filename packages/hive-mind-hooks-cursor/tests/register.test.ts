import { describe, expect, it } from 'vitest';
import {
  jsonRegister,
  jsonUnregister,
  hasHiveEntries,
  type JsonRegisterEntry,
} from '@waggle/hive-mind-hooks-core';
import {
  cursorRegisterSpec,
  HIVE_MIND_MARKER,
  CURSOR_EVENT_NAME,
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
    command: hookCommandFor(`${HOOKS_DIR}/${basename}.js`),
    timeout,
  };
}

const ALL_ENTRIES: readonly JsonRegisterEntry[] = [
  entry('session-start', 'session-start'),
  entry('user-prompt-submit', 'user-prompt-submit'),
  entry('stop', 'stop'),
  entry('pre-compact', 'pre-compact'),
];

interface CursorGroup {
  command: string;
  type: string;
  timeout: number;
  _hiveMindShim?: string;
}

function groupsAt(config: Record<string, unknown>, eventKey: string): CursorGroup[] {
  const hooks = config['hooks'] as Record<string, unknown> | undefined;
  return (hooks?.[eventKey] as CursorGroup[] | undefined) ?? [];
}

describe('CURSOR_EVENT_NAME (field renames)', () => {
  it('renames the four lifecycle events to cursor native keys', () => {
    expect(CURSOR_EVENT_NAME).toEqual({
      'session-start': 'sessionStart',
      'user-prompt-submit': 'beforeSubmitPrompt',
      'stop': 'stop',
      'pre-compact': 'preCompact',
    });
  });
});

describe('jsonRegister (cursor FLAT {command,type,timeout} group shape)', () => {
  it('returns a NEW object — does not mutate input (immutability contract)', () => {
    const original: Record<string, unknown> = { version: 1, hooks: { sessionStart: [] } };
    const merged = jsonRegister(original, [entry('session-start', 'session-start')], cursorRegisterSpec);
    expect(merged).not.toBe(original);
    // Input untouched.
    expect((original['hooks'] as Record<string, unknown>)['sessionStart']).toEqual([]);
  });

  it('registers a group under each renamed cursor event key', () => {
    const merged = jsonRegister({}, ALL_ENTRIES, cursorRegisterSpec);
    expect(groupsAt(merged, 'sessionStart')).toHaveLength(1);
    expect(groupsAt(merged, 'beforeSubmitPrompt')).toHaveLength(1);
    expect(groupsAt(merged, 'stop')).toHaveLength(1);
    expect(groupsAt(merged, 'preCompact')).toHaveLength(1);
  });

  it('builds the FLAT cursor group shape: {command,type:command,timeout,marker} — NO {matcher,hooks:[]} wrapper', () => {
    const merged = jsonRegister({}, [entry('stop', 'stop', 9)], cursorRegisterSpec);
    const g = groupsAt(merged, 'stop')[0];
    expect(g._hiveMindShim).toBe(HIVE_MIND_MARKER);
    expect(g.type).toBe('command');
    expect(g.command).toContain('stop.js');
    expect(g.timeout).toBe(9);
    // FLAT shape — there is no nested `hooks` array like codex.
    expect((g as unknown as Record<string, unknown>)['hooks']).toBeUndefined();
    expect((g as unknown as Record<string, unknown>)['matcher']).toBeUndefined();
  });

  it('seeds version:1 on a fresh config (ensureSkeleton)', () => {
    const merged = jsonRegister({}, [entry('stop', 'stop')], cursorRegisterSpec);
    expect(merged['version']).toBe(1);
  });

  it('never clobbers a user-set version', () => {
    const merged = jsonRegister({ version: 3 }, [entry('stop', 'stop')], cursorRegisterSpec);
    expect(merged['version']).toBe(3);
  });

  it('preserves existing (user) hook groups verbatim — additive merge', () => {
    const existing: Record<string, unknown> = {
      version: 1,
      hooks: {
        sessionStart: [
          { command: 'node /existing/x.js', type: 'command', timeout: 10 },
        ],
      },
    };
    const merged = jsonRegister(existing, [entry('session-start', 'session-start')], cursorRegisterSpec);
    const arr = groupsAt(merged, 'sessionStart');
    expect(arr).toHaveLength(2);
    expect(arr[0].command).toBe('node /existing/x.js');
    expect(arr[0]._hiveMindShim).toBeUndefined();
    expect(arr[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
  });

  it('preserves unrelated top-level keys', () => {
    const merged = jsonRegister(
      { version: 1, settingsUnrelated: { foo: 'bar' }, hooks: {} },
      [entry('session-start', 'session-start')],
      cursorRegisterSpec,
    );
    expect(merged['settingsUnrelated']).toEqual({ foo: 'bar' });
  });

  it('replaces our own marker-tagged group on re-install (idempotent dedup by command)', () => {
    const e = entry('session-start', 'session-start', 5);
    const merged1 = jsonRegister({}, [e], cursorRegisterSpec);
    const merged2 = jsonRegister(merged1, [{ ...e, timeout: 11 }], cursorRegisterSpec);
    const arr = groupsAt(merged2, 'sessionStart');
    expect(arr).toHaveLength(1); // never duplicated
    expect(arr[0].timeout).toBe(11);
  });
});

describe('hasHiveEntries (cursor)', () => {
  it('false on empty / hookless config', () => {
    expect(hasHiveEntries(undefined, cursorRegisterSpec)).toBe(false);
    expect(hasHiveEntries({}, cursorRegisterSpec)).toBe(false);
    expect(hasHiveEntries({ version: 1, hooks: {} }, cursorRegisterSpec)).toBe(false);
  });

  it('true once a marker-tagged group is present', () => {
    const merged = jsonRegister({}, [entry('stop', 'stop')], cursorRegisterSpec);
    expect(hasHiveEntries(merged, cursorRegisterSpec)).toBe(true);
  });

  it('false for a config holding ONLY non-hive (user) groups', () => {
    const userOnly: Record<string, unknown> = {
      version: 1,
      hooks: { stop: [{ command: 'node /user/own.js', type: 'command', timeout: 5 }] },
    };
    expect(hasHiveEntries(userOnly, cursorRegisterSpec)).toBe(false);
  });
});

describe('jsonUnregister (cursor)', () => {
  it('strips exactly our marker-tagged groups, preserves user groups', () => {
    const userGroup = { command: 'node /user/own.js', type: 'command', timeout: 5 };
    const withUser: Record<string, unknown> = { version: 1, hooks: { stop: [userGroup] } };
    const merged = jsonRegister(withUser, [entry('stop', 'stop')], cursorRegisterSpec);
    expect(groupsAt(merged, 'stop')).toHaveLength(2);

    const stripped = jsonUnregister(merged, cursorRegisterSpec);
    const arr = groupsAt(stripped, 'stop');
    expect(arr).toHaveLength(1);
    expect(arr[0].command).toBe('node /user/own.js');
    expect(hasHiveEntries(stripped, cursorRegisterSpec)).toBe(false);
  });
});
