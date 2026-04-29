import { describe, expect, it } from 'vitest';
import {
  HIVE_MIND_MARKER,
  HOOK_EVENT_BY_BASENAME,
  defaultHookEntries,
  hasHiveHooks,
  mergeHiveHooks,
  type ClaudeCodeSettings,
  type HookEntrySpec,
} from '../src/settings-merger.js';
import { hookCommandFor } from '../src/paths.js';

const HOOKS_DIR = '/abs/dist/hooks';

function makeEntry(basename: 'session-start' | 'user-prompt-submit' | 'stop' | 'pre-compact'): HookEntrySpec {
  return {
    basename,
    command: hookCommandFor(HOOKS_DIR, basename),
    timeout: 5,
  };
}

describe('mergeHiveHooks', () => {
  it('returns a new object — does not mutate input', () => {
    const original: ClaudeCodeSettings = { hooks: { SessionStart: [] } };
    const merged = mergeHiveHooks(original, [makeEntry('session-start')]);
    expect(merged).not.toBe(original);
    expect(original.hooks?.SessionStart).toEqual([]);
  });

  it('appends a hive group to each requested event array', () => {
    const merged = mergeHiveHooks({}, [
      makeEntry('session-start'),
      makeEntry('user-prompt-submit'),
      makeEntry('stop'),
      makeEntry('pre-compact'),
    ]);
    expect(merged.hooks?.SessionStart).toHaveLength(1);
    expect(merged.hooks?.UserPromptSubmit).toHaveLength(1);
    expect(merged.hooks?.Stop).toHaveLength(1);
    expect(merged.hooks?.PreCompact).toHaveLength(1);
  });

  it('preserves existing hook entries verbatim', () => {
    const existing: ClaudeCodeSettings = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: 'node /existing/gsd-context.js', timeout: 10 }] },
        ],
      },
    };
    const merged = mergeHiveHooks(existing, [makeEntry('session-start')]);
    const arr = merged.hooks?.SessionStart;
    expect(arr).toHaveLength(2);
    expect(arr?.[0].hooks[0].command).toBe('node /existing/gsd-context.js');
    expect(arr?.[1]._hiveMindShim).toBe(HIVE_MIND_MARKER);
  });

  it('replaces an existing hive entry when the same command is re-installed (idempotent)', () => {
    const cmd = hookCommandFor(HOOKS_DIR, 'session-start');
    const merged1 = mergeHiveHooks({}, [{ basename: 'session-start', command: cmd, timeout: 5 }]);
    const merged2 = mergeHiveHooks(merged1, [{ basename: 'session-start', command: cmd, timeout: 7 }]);
    expect(merged2.hooks?.SessionStart).toHaveLength(1);
    expect(merged2.hooks?.SessionStart?.[0].hooks[0].timeout).toBe(7);
  });

  it('preserves unrelated top-level fields', () => {
    const merged = mergeHiveHooks(
      { env: { SOMETHING: '1' }, statusLine: { type: 'command', command: 'foo' }, hooks: {} } as ClaudeCodeSettings,
      [makeEntry('session-start')],
    );
    expect(merged['env']).toEqual({ SOMETHING: '1' });
    expect(merged['statusLine']).toEqual({ type: 'command', command: 'foo' });
  });
});

describe('hasHiveHooks', () => {
  it('returns false on empty settings', () => {
    expect(hasHiveHooks(undefined)).toBe(false);
    expect(hasHiveHooks({})).toBe(false);
    expect(hasHiveHooks({ hooks: {} })).toBe(false);
  });

  it('returns true when at least one event array has the marker', () => {
    const merged = mergeHiveHooks({}, [makeEntry('stop')]);
    expect(hasHiveHooks(merged)).toBe(true);
  });
});

describe('defaultHookEntries', () => {
  it('builds 4 entries — one per canonical hook', () => {
    const entries = defaultHookEntries(HOOKS_DIR, 5, hookCommandFor);
    expect(entries).toHaveLength(4);
    const events = entries.map((e) => HOOK_EVENT_BY_BASENAME[e.basename]);
    expect([...events].sort()).toEqual(['PreCompact', 'SessionStart', 'Stop', 'UserPromptSubmit']);
  });

  it('every entry carries the requested timeout', () => {
    const entries = defaultHookEntries(HOOKS_DIR, 9, hookCommandFor);
    expect(entries.every((e) => e.timeout === 9)).toBe(true);
  });

  it('threads cliPath into every generated hook command', () => {
    const cliPath = '/abs/cli.js';
    const entries = defaultHookEntries(HOOKS_DIR, 5, hookCommandFor, cliPath);
    expect(entries.every((e) => e.command.includes(`--cli-path "${cliPath}"`))).toBe(true);
  });

  it('omits --cli-path entirely when none supplied', () => {
    const entries = defaultHookEntries(HOOKS_DIR, 5, hookCommandFor);
    expect(entries.every((e) => !e.command.includes('--cli-path'))).toBe(true);
  });
});
