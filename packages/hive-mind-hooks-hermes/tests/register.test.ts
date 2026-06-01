import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  HIVE_MIND_MARKER,
  HOOKS_KEY,
  hasHiveEntries,
  isHiveEntry,
  parseConfig,
  serializeConfig,
  yamlRegister,
  yamlUnregister,
  type HermesRegisterEntry,
} from '../src/yaml-merger.js';

function entry(eventKey: string, command: string, timeout = 60): HermesRegisterEntry {
  return { eventKey, command, timeout };
}

/** The four register entries hermes install builds (SessionStart is 2-key). */
const ALL_ENTRIES: readonly HermesRegisterEntry[] = [
  entry('on_session_start', 'node "/abs/dist/hooks/session-start.js"'),
  entry('pre_llm_call', 'node "/abs/dist/hooks/session-start.js"'),
  entry('pre_llm_call', 'node "/abs/dist/hooks/user-prompt-submit.js"'),
  entry('post_llm_call', 'node "/abs/dist/hooks/stop.js"'),
];

function eventArray(config: Record<string, unknown>, eventKey: string): Record<string, unknown>[] {
  const hooks = config[HOOKS_KEY] as Record<string, unknown> | undefined;
  return (hooks?.[eventKey] as Record<string, unknown>[] | undefined) ?? [];
}

describe('parseConfig (hermes YAML codec)', () => {
  it('returns {} for an empty / whitespace-only config (create-if-missing)', () => {
    expect(parseConfig('')).toEqual({});
    expect(parseConfig('   \n  ')).toEqual({});
  });

  it('parses a realistic config.yaml WITH comments + a pre-existing user hook', () => {
    const raw = [
      '# Hermes CLI config',
      'model: claude-opus',
      'hooks:',
      '  # a user-installed lint hook',
      '  pre_llm_call:',
      '    - command: node /user/own/lint.js',
      '      timeout: 30',
      'hooks_auto_accept: false',
      '',
    ].join('\n');
    const parsed = parseConfig(raw);
    expect(parsed['model']).toBe('claude-opus');
    expect(parsed['hooks_auto_accept']).toBe(false);
    const arr = eventArray(parsed, 'pre_llm_call');
    expect(arr).toHaveLength(1);
    expect(arr[0]['command']).toBe('node /user/own/lint.js');
    expect(arr[0]['timeout']).toBe(30);
  });

  it('throws on malformed YAML so the installer fails loudly', () => {
    // A block-mapping value that cannot parse (tab indentation / bad structure).
    expect(() => parseConfig('hooks:\n\t- : : :\n  bad')).toThrow(/parse/i);
  });

  it('treats a top-level scalar/array YAML doc as empty (not a crash)', () => {
    expect(parseConfig('"just a string"')).toEqual({});
    expect(parseConfig('- a\n- b\n')).toEqual({});
  });
});

describe('serializeConfig (hermes YAML codec)', () => {
  it('round-trips a merged config back to parseable YAML with a trailing newline', () => {
    const merged = yamlRegister({ model: 'x' }, [entry('post_llm_call', 'node /a/stop.js')]);
    const text = serializeConfig(merged);
    expect(text.endsWith('\n')).toBe(true);
    const reparsed = parseYaml(text) as Record<string, unknown>;
    expect(reparsed['model']).toBe('x');
    expect(eventArray(reparsed, 'post_llm_call')).toHaveLength(1);
  });
});

describe('yamlRegister (hermes flat {command,timeout,_hive_mind} entry shape)', () => {
  it('returns a NEW object — does not mutate input (immutability contract)', () => {
    const original: Record<string, unknown> = { hooks: { pre_llm_call: [] } };
    const merged = yamlRegister(original, [entry('pre_llm_call', 'node /a/x.js')]);
    expect(merged).not.toBe(original);
    // Input untouched.
    expect((original['hooks'] as Record<string, unknown>)['pre_llm_call']).toEqual([]);
  });

  it('registers a marker-tagged entry under each supplied native event key', () => {
    const merged = yamlRegister({}, ALL_ENTRIES);
    expect(eventArray(merged, 'on_session_start')).toHaveLength(1);
    // pre_llm_call carries BOTH the session-start inject hook and the user-prompt hook.
    expect(eventArray(merged, 'pre_llm_call')).toHaveLength(2);
    expect(eventArray(merged, 'post_llm_call')).toHaveLength(1);
  });

  it('builds the flat entry shape: {command, timeout, _hive_mind marker}', () => {
    const merged = yamlRegister({}, [entry('post_llm_call', 'node /a/stop.js', 9)]);
    const e = eventArray(merged, 'post_llm_call')[0];
    expect(e['command']).toBe('node /a/stop.js');
    expect(e['timeout']).toBe(9);
    expect(e['_hive_mind']).toBe(HIVE_MIND_MARKER);
    // No nested matcher/hooks wrapper — matcher is stripped-with-warning on
    // lifecycle events, so we never set it.
    expect(e['matcher']).toBeUndefined();
    expect(e['hooks']).toBeUndefined();
  });

  it('preserves existing (user) hook entries verbatim — additive merge', () => {
    const existing: Record<string, unknown> = {
      hooks: {
        pre_llm_call: [
          { command: 'node /user/own.js', timeout: 30 },
        ],
      },
    };
    const merged = yamlRegister(existing, [entry('pre_llm_call', 'node /a/session-start.js')]);
    const arr = eventArray(merged, 'pre_llm_call');
    expect(arr).toHaveLength(2);
    expect(arr[0]['command']).toBe('node /user/own.js');
    expect(arr[0]['_hive_mind']).toBeUndefined();
    expect(arr[1]['_hive_mind']).toBe(HIVE_MIND_MARKER);
  });

  it('preserves unrelated top-level (non-hooks) YAML keys', () => {
    const merged = yamlRegister(
      { model: 'claude-opus', temperature: 0.2, hooks: {} },
      [entry('pre_llm_call', 'node /a/x.js')],
    );
    expect(merged['model']).toBe('claude-opus');
    expect(merged['temperature']).toBe(0.2);
  });

  it('replaces our own marker-tagged entry on re-install (dedup by command, in place)', () => {
    const e = entry('pre_llm_call', 'node /a/session-start.js', 60);
    const merged1 = yamlRegister({}, [e]);
    const merged2 = yamlRegister(merged1, [{ ...e, timeout: 120 }]);
    const arr = eventArray(merged2, 'pre_llm_call');
    expect(arr).toHaveLength(1); // never duplicated
    expect(arr[0]['timeout']).toBe(120);
    expect(arr[0]['_hive_mind']).toBe(HIVE_MIND_MARKER);
  });

  it('re-registering the full set keeps each pre_llm_call slot at exactly 2 hive entries', () => {
    const merged1 = yamlRegister({}, ALL_ENTRIES);
    const merged2 = yamlRegister(merged1, ALL_ENTRIES);
    expect(eventArray(merged2, 'pre_llm_call')).toHaveLength(2);
    expect(eventArray(merged2, 'on_session_start')).toHaveLength(1);
    expect(eventArray(merged2, 'post_llm_call')).toHaveLength(1);
  });

  it('does not collapse two DIFFERENT hive commands sharing one event key', () => {
    // session-start inject + user-prompt both ride pre_llm_call with distinct
    // commands — they must coexist, not dedup each other.
    const merged = yamlRegister({}, [
      entry('pre_llm_call', 'node /a/session-start.js'),
      entry('pre_llm_call', 'node /a/user-prompt-submit.js'),
    ]);
    const arr = eventArray(merged, 'pre_llm_call');
    expect(arr).toHaveLength(2);
    expect(arr.map((e) => e['command']).sort()).toEqual([
      'node /a/session-start.js',
      'node /a/user-prompt-submit.js',
    ]);
  });
});

describe('isHiveEntry (hermes structural marker)', () => {
  it('true only for entries carrying the structural _hive_mind sentinel', () => {
    expect(isHiveEntry({ command: 'x', _hive_mind: HIVE_MIND_MARKER })).toBe(true);
    expect(isHiveEntry({ command: 'x' })).toBe(false);
    expect(isHiveEntry({ command: 'x', _hive_mind: 'someone-else' })).toBe(false);
    expect(isHiveEntry(undefined)).toBe(false);
    expect(isHiveEntry('not-an-object')).toBe(false);
  });
});

describe('hasHiveEntries (hermes)', () => {
  it('false on empty / hookless config', () => {
    expect(hasHiveEntries(undefined)).toBe(false);
    expect(hasHiveEntries({})).toBe(false);
    expect(hasHiveEntries({ hooks: {} })).toBe(false);
  });

  it('true once a marker-tagged entry is present', () => {
    const merged = yamlRegister({}, [entry('post_llm_call', 'node /a/stop.js')]);
    expect(hasHiveEntries(merged)).toBe(true);
  });

  it('false for a config holding ONLY non-hive (user) entries', () => {
    const userOnly: Record<string, unknown> = {
      hooks: { post_llm_call: [{ command: 'node /user/own.js', timeout: 5 }] },
    };
    expect(hasHiveEntries(userOnly)).toBe(false);
  });
});

describe('yamlUnregister (hermes — used for diagnostics / backup-less path)', () => {
  it('strips exactly our marker-tagged entries, preserves user entries', () => {
    const userEntry = { command: 'node /user/own.js', timeout: 5 };
    const withUser: Record<string, unknown> = { hooks: { post_llm_call: [userEntry] } };
    const merged = yamlRegister(withUser, [entry('post_llm_call', 'node /a/stop.js')]);
    expect(eventArray(merged, 'post_llm_call')).toHaveLength(2);

    const stripped = yamlUnregister(merged);
    const arr = eventArray(stripped, 'post_llm_call');
    expect(arr).toHaveLength(1);
    expect(arr[0]['command']).toBe('node /user/own.js');
    expect(hasHiveEntries(stripped)).toBe(false);
  });

  it('returns a NEW object and leaves the input untouched (immutability)', () => {
    const merged = yamlRegister({}, [entry('post_llm_call', 'node /a/stop.js')]);
    const stripped = yamlUnregister(merged);
    expect(stripped).not.toBe(merged);
    expect(hasHiveEntries(merged)).toBe(true); // original still has the entry
  });

  it('is a no-op (new object) when there is no hooks block', () => {
    const stripped = yamlUnregister({ model: 'x' });
    expect(stripped['model']).toBe('x');
    expect(hasHiveEntries(stripped)).toBe(false);
  });
});
