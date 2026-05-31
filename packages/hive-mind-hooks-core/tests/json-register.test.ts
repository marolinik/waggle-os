import { describe, expect, it } from 'vitest';
import {
  HIVE_MIND_MARKER_BASE,
  hasHiveEntries,
  jsonRegister,
  jsonUnregister,
  type JsonRegisterEntry,
  type JsonRegisterSpec,
} from '../src/json-register.js';
import type { Lifecycle } from '../src/event-adapter.js';

const MARKER = `${HIVE_MIND_MARKER_BASE}/codex-hooks`;

// A codex-style spec: each event key holds an array of
// { matcher, hooks:[{type,command,timeout}], _hiveMindShim } groups.
const codexSpec: JsonRegisterSpec = {
  hooksKey: 'hooks',
  eventName: {
    'session-start': 'SessionStart',
    'user-prompt-submit': 'UserPromptSubmit',
    stop: 'Stop',
    'pre-compact': 'PreCompact',
  },
  buildGroup(_lifecycle: Lifecycle, command: string, timeout: number): Record<string, unknown> {
    return {
      hooks: [{ type: 'command', command, timeout }],
      _hiveMindShim: MARKER,
    };
  },
  isHiveGroup(group: unknown): boolean {
    return (
      !!group &&
      typeof group === 'object' &&
      (group as Record<string, unknown>)['_hiveMindShim'] === MARKER
    );
  },
  groupCommand(group: unknown): string | undefined {
    if (!group || typeof group !== 'object') return undefined;
    const hooks = (group as Record<string, unknown>)['hooks'];
    if (!Array.isArray(hooks) || hooks.length === 0) return undefined;
    const first = hooks[0] as Record<string, unknown>;
    return typeof first['command'] === 'string' ? (first['command'] as string) : undefined;
  },
};

const ENTRIES: readonly JsonRegisterEntry[] = [
  { lifecycle: 'session-start', command: 'node /dist/hooks/session-start.js', timeout: 30 },
  { lifecycle: 'stop', command: 'node /dist/hooks/stop.js', timeout: 60 },
];

describe('jsonRegister — additive', () => {
  it('preserves existing user (non-hive) entries verbatim', () => {
    const userGroup = { hooks: [{ type: 'command', command: 'node /user/own.js' }] };
    const config = { hooks: { Stop: [userGroup] }, somethingElse: { kept: true } };

    const next = jsonRegister(config, ENTRIES, codexSpec);

    const stopArr = (next.hooks as Record<string, unknown[]>).Stop;
    // user group still present, byte-equal, and FIRST.
    expect(stopArr[0]).toEqual(userGroup);
    // top-level non-hooks keys untouched.
    expect(next.somethingElse).toEqual({ kept: true });
  });

  it('appends a hive group per entry under the mapped event key', () => {
    const next = jsonRegister({}, ENTRIES, codexSpec);
    const hooks = next.hooks as Record<string, unknown[]>;
    expect(hooks.SessionStart).toHaveLength(1);
    expect(hooks.Stop).toHaveLength(1);
    expect(codexSpec.isHiveGroup(hooks.SessionStart[0])).toBe(true);
    expect(codexSpec.groupCommand(hooks.Stop[0])).toBe('node /dist/hooks/stop.js');
  });

  it('skips lifecycles the tool has no native event for', () => {
    const spec: JsonRegisterSpec = {
      ...codexSpec,
      eventName: { ...codexSpec.eventName, 'pre-compact': undefined },
    };
    const next = jsonRegister(
      {},
      [{ lifecycle: 'pre-compact', command: 'node /dist/hooks/pre-compact.js', timeout: 30 }],
      spec,
    );
    // No event key created (the only entry maps to undefined).
    expect(Object.keys(next.hooks as Record<string, unknown>)).toHaveLength(0);
  });

  it('applies the optional skeleton seed (e.g. cursor version:1)', () => {
    const spec: JsonRegisterSpec = {
      ...codexSpec,
      ensureSkeleton: (root) => ({ version: 1, ...root }),
    };
    const next = jsonRegister(undefined, ENTRIES, spec);
    expect(next.version).toBe(1);
  });
});

describe('jsonRegister — dedup / replace-in-place on re-run', () => {
  it('replaces the same (eventKey, command) hive group in place rather than duplicating', () => {
    const once = jsonRegister({}, ENTRIES, codexSpec);
    const twice = jsonRegister(once, ENTRIES, codexSpec);

    const stopArr = (twice.hooks as Record<string, unknown[]>).Stop;
    expect(stopArr).toHaveLength(1); // not 2
    const ssArr = (twice.hooks as Record<string, unknown[]>).SessionStart;
    expect(ssArr).toHaveLength(1);
  });

  it('upgrades the timeout of an existing hive entry in place', () => {
    const once = jsonRegister({}, [{ lifecycle: 'stop', command: 'node /dist/hooks/stop.js', timeout: 60 }], codexSpec);
    const upgraded = jsonRegister(
      once,
      [{ lifecycle: 'stop', command: 'node /dist/hooks/stop.js', timeout: 120 }],
      codexSpec,
    );
    const stopArr = upgraded.hooks as Record<string, unknown[]>;
    expect(stopArr.Stop).toHaveLength(1);
    const group = stopArr.Stop[0] as { hooks: Array<{ timeout: number }> };
    expect(group.hooks[0].timeout).toBe(120);
  });

  it('keeps a different-command hive entry alongside (no false dedup)', () => {
    const a = jsonRegister({}, [{ lifecycle: 'stop', command: 'node /a.js', timeout: 30 }], codexSpec);
    const b = jsonRegister(a, [{ lifecycle: 'stop', command: 'node /b.js', timeout: 30 }], codexSpec);
    expect((b.hooks as Record<string, unknown[]>).Stop).toHaveLength(2);
  });
});

describe('jsonRegister — immutability (input never mutated)', () => {
  it('does not mutate the input config object (deep-equal to a frozen snapshot)', () => {
    const config = {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node /user/own.js' }] }] },
      version: 1,
    };
    const snapshot = structuredClone(config);
    Object.freeze(config); // any in-place mutation would throw

    const next = jsonRegister(config, ENTRIES, codexSpec);

    // Input unchanged…
    expect(config).toEqual(snapshot);
    // …and a NEW object was returned.
    expect(next).not.toBe(config);
    expect(next.hooks).not.toBe(config.hooks);
  });

  it('does not mutate the input on re-run dedup either', () => {
    const once = jsonRegister({}, ENTRIES, codexSpec);
    const snapshot = structuredClone(once);
    // Deep-freeze the nested arrays so replace-in-place can't touch the input.
    Object.freeze(once);
    Object.freeze(once.hooks);
    for (const v of Object.values(once.hooks as Record<string, unknown>)) Object.freeze(v);

    const twice = jsonRegister(once, ENTRIES, codexSpec);
    expect(once).toEqual(snapshot);
    expect(twice).not.toBe(once);
  });
});

describe('jsonUnregister', () => {
  it('strips only marker-tagged hive groups, preserving user entries', () => {
    const userGroup = { hooks: [{ type: 'command', command: 'node /user/own.js' }] };
    const registered = jsonRegister({ hooks: { Stop: [userGroup] } }, ENTRIES, codexSpec);

    const stripped = jsonUnregister(registered, codexSpec);

    const stopArr = (stripped.hooks as Record<string, unknown[]>).Stop;
    expect(stopArr).toEqual([userGroup]); // hive Stop group gone, user group kept
    // SessionStart array now empty (only our group was there).
    expect((stripped.hooks as Record<string, unknown[]>).SessionStart).toEqual([]);
  });

  it('does not mutate the input config', () => {
    const registered = jsonRegister({}, ENTRIES, codexSpec);
    const snapshot = structuredClone(registered);
    Object.freeze(registered);
    const stripped = jsonUnregister(registered, codexSpec);
    expect(registered).toEqual(snapshot);
    expect(stripped).not.toBe(registered);
  });

  it('returns the config unchanged shape when there is no hooks key', () => {
    const stripped = jsonUnregister({ other: true }, codexSpec);
    expect(stripped).toEqual({ other: true });
  });
});

describe('hasHiveEntries', () => {
  it('is false for empty / undefined / no-hive configs', () => {
    expect(hasHiveEntries(undefined, codexSpec)).toBe(false);
    expect(hasHiveEntries({}, codexSpec)).toBe(false);
    expect(
      hasHiveEntries({ hooks: { Stop: [{ hooks: [{ command: 'node /user.js' }] }] } }, codexSpec),
    ).toBe(false);
  });

  it('is true once a marker-tagged hive group is registered', () => {
    const registered = jsonRegister({}, ENTRIES, codexSpec);
    expect(hasHiveEntries(registered, codexSpec)).toBe(true);
  });

  it('is false again after unregister', () => {
    const registered = jsonRegister({}, ENTRIES, codexSpec);
    expect(hasHiveEntries(jsonUnregister(registered, codexSpec), codexSpec)).toBe(false);
  });
});
