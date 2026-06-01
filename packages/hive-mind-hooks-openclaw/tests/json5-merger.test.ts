import { describe, expect, it } from 'vitest';
import JSON5 from 'json5';
import {
  HIVE_ENTRY_KEY,
  HOOKS_KEY,
  hasHiveEntries,
  jsonRegister,
  jsonUnregister,
  parseConfig,
  serializeConfig,
} from '../src/json5-merger.js';

function internal(config: Record<string, unknown>): Record<string, unknown> {
  const hooks = config[HOOKS_KEY] as Record<string, unknown> | undefined;
  return (hooks?.['internal'] as Record<string, unknown> | undefined) ?? {};
}

function entries(config: Record<string, unknown>): Record<string, unknown> {
  return (internal(config)['entries'] as Record<string, unknown> | undefined) ?? {};
}

describe('parseConfig (openclaw JSON5 codec — strict JSON first, JSON5 fallback)', () => {
  it('returns {} for an empty / whitespace-only config (create-if-missing)', () => {
    expect(parseConfig('')).toEqual({});
    expect(parseConfig('   \n  ')).toEqual({});
  });

  it('parses strict JSON (the fast path)', () => {
    const parsed = parseConfig('{"model":"opus","hooks":{}}');
    expect(parsed['model']).toBe('opus');
  });

  it('parses a COMMENTED openclaw.json with trailing commas via the JSON5 fallback', () => {
    const raw = [
      '{',
      '  // OpenClaw gateway config — hand-edited, comments matter',
      '  model: "claude-opus", /* the good one */',
      '  hooks: {',
      '    internal: {',
      '      enabled: false,',
      '      entries: {',
      "        'user-own': { enabled: true }, // trailing comma below",
      '      },',
      '    },',
      '  },',
      '}',
    ].join('\n');
    const parsed = parseConfig(raw);
    expect(parsed['model']).toBe('claude-opus');
    const userEntry = entries(parsed)['user-own'] as Record<string, unknown>;
    expect(userEntry['enabled']).toBe(true);
  });

  it('throws when BOTH strict JSON and JSON5 fail (installer fails loudly, never clobbers)', () => {
    expect(() => parseConfig('{ this : : : is not valid }')).toThrow(/parse/i);
  });

  it('treats a top-level scalar/array JSON5 doc as empty (not a crash)', () => {
    expect(parseConfig('"just a string"')).toEqual({});
    expect(parseConfig('[1, 2, 3]')).toEqual({});
  });
});

describe('serializeConfig (openclaw — strict JSON, valid for OpenClaw JSON5 reader)', () => {
  it('serializes to 2-space JSON with a trailing newline that re-parses', () => {
    const text = serializeConfig(jsonRegister({ model: 'x' }));
    expect(text.endsWith('\n')).toBe(true);
    const reparsed = JSON5.parse(text) as Record<string, unknown>;
    expect(reparsed['model']).toBe('x');
    expect(hasHiveEntries(reparsed)).toBe(true);
  });
});

describe('jsonRegister (openclaw minimal-touch — flip enabled + add hive entry)', () => {
  it('returns a NEW object — does not mutate input (immutability contract)', () => {
    const original: Record<string, unknown> = { hooks: { internal: { enabled: false } } };
    const merged = jsonRegister(original);
    expect(merged).not.toBe(original);
    // Input untouched — enabled is still false on the original.
    expect((original['hooks'] as Record<string, Record<string, unknown>>)['internal']['enabled']).toBe(false);
  });

  it('flips hooks.internal.enabled=true and adds entries["hive-mind"]={enabled:true}', () => {
    const merged = jsonRegister({});
    expect(internal(merged)['enabled']).toBe(true);
    const hive = entries(merged)[HIVE_ENTRY_KEY] as Record<string, unknown>;
    expect(hive).toEqual({ enabled: true });
  });

  it('attaches env to the hive entry when supplied', () => {
    const merged = jsonRegister({}, { env: { WAGGLE_HIVE_MIND_CLI: '/abs/cli.js', WAGGLE_WORKSPACE_ID: 'ws1' } });
    const hive = entries(merged)[HIVE_ENTRY_KEY] as Record<string, unknown>;
    expect(hive['env']).toEqual({ WAGGLE_HIVE_MIND_CLI: '/abs/cli.js', WAGGLE_WORKSPACE_ID: 'ws1' });
  });

  it('does NOT clobber other internal entries or other internal keys (minimal-touch)', () => {
    const existing: Record<string, unknown> = {
      model: 'opus',
      hooks: {
        internal: {
          enabled: false,
          throttleMs: 250,
          entries: { 'user-own': { enabled: true, foo: 'bar' } },
        },
        external: { whatever: 1 },
      },
    };
    const merged = jsonRegister(existing);
    // user entry preserved verbatim.
    expect(entries(merged)['user-own']).toEqual({ enabled: true, foo: 'bar' });
    // sibling internal key preserved.
    expect(internal(merged)['throttleMs']).toBe(250);
    // sibling hooks subtree preserved.
    expect((merged['hooks'] as Record<string, unknown>)['external']).toEqual({ whatever: 1 });
    // unrelated top-level key preserved.
    expect(merged['model']).toBe('opus');
    // and our entry was added + subsystem turned on.
    expect(internal(merged)['enabled']).toBe(true);
    expect(hasHiveEntries(merged)).toBe(true);
  });

  it('replaces OUR entry in place on re-install (idempotent — never duplicated)', () => {
    const merged1 = jsonRegister({}, { env: { A: '1' } });
    const merged2 = jsonRegister(merged1, { env: { A: '2' } });
    const hive = entries(merged2)[HIVE_ENTRY_KEY] as Record<string, unknown>;
    expect(hive['env']).toEqual({ A: '2' });
    // Exactly one hive-mind entry key.
    expect(Object.keys(entries(merged2)).filter((k) => k === HIVE_ENTRY_KEY)).toHaveLength(1);
  });
});

describe('jsonUnregister (openclaw — diagnostics / backup-less path)', () => {
  it('strips our hive-mind entry but preserves other entries + leaves enabled as-is', () => {
    const withUser: Record<string, unknown> = {
      hooks: { internal: { enabled: true, entries: { 'user-own': { enabled: true } } } },
    };
    const merged = jsonRegister(withUser);
    expect(hasHiveEntries(merged)).toBe(true);

    const stripped = jsonUnregister(merged);
    expect(hasHiveEntries(stripped)).toBe(false);
    // User entry survives.
    expect(entries(stripped)['user-own']).toEqual({ enabled: true });
    // Minimal-touch: we do NOT flip enabled back off (other hooks may rely on it).
    expect(internal(stripped)['enabled']).toBe(true);
  });

  it('returns a NEW object and leaves the input untouched (immutability)', () => {
    const merged = jsonRegister({});
    const stripped = jsonUnregister(merged);
    expect(stripped).not.toBe(merged);
    expect(hasHiveEntries(merged)).toBe(true); // original still has the entry
  });

  it('is a no-op (new object) when there is no hooks/internal block', () => {
    const stripped = jsonUnregister({ model: 'x' });
    expect(stripped['model']).toBe('x');
    expect(hasHiveEntries(stripped)).toBe(false);
  });
});

describe('hasHiveEntries (openclaw structural marker)', () => {
  it('false on empty / hookless / hive-less configs', () => {
    expect(hasHiveEntries(undefined)).toBe(false);
    expect(hasHiveEntries({})).toBe(false);
    expect(hasHiveEntries({ hooks: {} })).toBe(false);
    expect(hasHiveEntries({ hooks: { internal: { enabled: true, entries: {} } } })).toBe(false);
    expect(hasHiveEntries({ hooks: { internal: { entries: { 'user-own': {} } } } })).toBe(false);
  });

  it('true once our hive-mind entry is present', () => {
    expect(hasHiveEntries(jsonRegister({}))).toBe(true);
  });
});
