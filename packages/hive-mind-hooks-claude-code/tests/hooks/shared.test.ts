import { describe, expect, it } from 'vitest';
import {
  parseHookArgs,
  pickStringField,
  pickStringFromObject,
  safeJsonParse,
} from '../../src/hooks/_shared.js';

describe('safeJsonParse', () => {
  it('returns {} for empty / whitespace input', () => {
    expect(safeJsonParse('')).toEqual({});
    expect(safeJsonParse('   ')).toEqual({});
  });

  it('returns parsed JSON when valid', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns {} when JSON is malformed', () => {
    expect(safeJsonParse('not json')).toEqual({});
    expect(safeJsonParse('{')).toEqual({});
  });
});

describe('parseHookArgs', () => {
  it('extracts --cli-path value when present', () => {
    expect(parseHookArgs(['--cli-path', '/abs/cli.js'])).toEqual({ cliPath: '/abs/cli.js' });
  });

  it('returns {} when --cli-path is absent', () => {
    expect(parseHookArgs([])).toEqual({});
    expect(parseHookArgs(['--other-flag', 'value'])).toEqual({});
  });

  it('returns {} when --cli-path has no following value', () => {
    expect(parseHookArgs(['--cli-path'])).toEqual({});
  });

  it('rejects empty-string value as missing', () => {
    expect(parseHookArgs(['--cli-path', ''])).toEqual({});
  });

  it('handles flag in the middle of argv', () => {
    expect(parseHookArgs(['--foo', 'bar', '--cli-path', '/x.js', '--baz'])).toEqual({ cliPath: '/x.js' });
  });
});

describe('pickStringField / pickStringFromObject', () => {
  it('returns the first non-empty string match', () => {
    expect(pickStringField({ a: 'x', b: 'y' }, 'a', 'b')).toBe('x');
    expect(pickStringField({ a: '', b: 'y' }, 'a', 'b')).toBe('y');
  });

  it('returns undefined when no key resolves', () => {
    expect(pickStringField({}, 'a')).toBeUndefined();
    expect(pickStringField(null, 'a')).toBeUndefined();
    expect(pickStringField(undefined, 'a')).toBeUndefined();
  });

  it('pickStringFromObject only treats strings as hits', () => {
    expect(pickStringFromObject({ a: 1 } as Record<string, unknown>, 'a')).toBeUndefined();
    expect(pickStringFromObject({ a: 'ok' }, 'a')).toBe('ok');
    expect(pickStringFromObject({ a: '' }, 'a')).toBeUndefined();
  });
});
