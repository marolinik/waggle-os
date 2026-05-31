import { describe, expect, it } from 'vitest';
import {
  parseHookArgs,
  pickStringField,
  pickStringFromObject,
  runHook,
  safeJsonParse,
  type HookContext,
  type HookHandler,
} from '../src/hook-shared.js';
import { makeMockBridge, makeMockLogger } from './_helpers.js';

// A capture rig for stdout/exit (mirrors the CC _test-helpers shape).
function makeCaptures(): {
  stdout: string[];
  exits: number[];
  writeStdout: (s: string) => void;
  exit: (code: number) => void;
} {
  const stdout: string[] = [];
  const exits: number[] = [];
  return { stdout, exits, writeStdout: (s) => stdout.push(s), exit: (c) => exits.push(c) };
}

describe('safeJsonParse', () => {
  it('returns {} for empty / whitespace input', () => {
    expect(safeJsonParse('')).toEqual({});
    expect(safeJsonParse('   ')).toEqual({});
  });

  it('returns parsed JSON when valid', () => {
    expect(safeJsonParse('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns {} when JSON is malformed (garbage)', () => {
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

  it('handles the flag in the middle of argv', () => {
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

  it('pickStringFromObject only treats non-empty strings as hits', () => {
    expect(pickStringFromObject({ a: 1 } as Record<string, unknown>, 'a')).toBeUndefined();
    expect(pickStringFromObject({ a: 'ok' }, 'a')).toBe('ok');
    expect(pickStringFromObject({ a: '' }, 'a')).toBeUndefined();
  });
});

describe('runHook — happy path', () => {
  it('parses stdin, runs the handler, writes stdout JSON, and exits 0', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    const handler: HookHandler<{ value: string }, { echoed: string }> = {
      parse(raw): { value: string } {
        return { value: (raw as Record<string, unknown>).value as string };
      },
      async run(payload): Promise<{ echoed: string }> {
        return { echoed: payload.value };
      },
    };
    await runHook(handler, {
      name: 'demo',
      readStdin: async () => JSON.stringify({ value: 'hi' }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      logger: makeMockLogger(),
    });
    expect(cap.exits).toEqual([0]);
    expect(JSON.parse(cap.stdout[0])).toEqual({ echoed: 'hi' });
  });

  it('threads --cli-path through to the handler context via the bridge override path', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    let sawCtx: HookContext | undefined;
    const handler: HookHandler<unknown, undefined> = {
      parse: (raw) => raw,
      async run(_payload, ctx): Promise<undefined> {
        sawCtx = ctx;
        return undefined;
      },
    };
    await runHook(handler, {
      name: 'demo',
      argv: ['--cli-path', '/abs/cli/dist/index.js'],
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      logger: makeMockLogger(),
    });
    // No stdout emitted when run returns undefined.
    expect(cap.stdout).toHaveLength(0);
    expect(cap.exits).toEqual([0]);
    expect(sawCtx?.bridge).toBe(bridge);
  });
});

describe('runHook — FAIL-OPEN (invariant §7.3(1))', () => {
  it('exits 0 when the handler body throws (injected bridge error)', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    const handler: HookHandler<unknown, undefined> = {
      parse: (raw) => raw,
      async run(): Promise<undefined> {
        throw new Error('cli unreachable');
      },
    };
    await runHook(handler, {
      name: 'demo',
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      logger: makeMockLogger(),
    });
    expect(cap.exits).toEqual([0]);
  });

  it('exits 0 when parse throws on malformed stdin (safeJsonParse yields {}, parse explodes)', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    const handler: HookHandler<unknown, undefined> = {
      parse(): unknown {
        throw new Error('bad shape');
      },
      async run(): Promise<undefined> {
        return undefined;
      },
    };
    await runHook(handler, {
      name: 'demo',
      readStdin: async () => 'not json at all',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      logger: makeMockLogger(),
    });
    expect(cap.exits).toEqual([0]);
  });

  it('exits 0 when the stdin reader itself rejects', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    const handler: HookHandler<unknown, undefined> = {
      parse: (raw) => raw,
      async run(): Promise<undefined> {
        return undefined;
      },
    };
    await runHook(handler, {
      name: 'demo',
      readStdin: async () => { throw new Error('stdin broke'); },
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
      logger: makeMockLogger(),
    });
    expect(cap.exits).toEqual([0]);
  });

  it('never throws to the caller even on a thrown body (promise resolves)', async () => {
    const cap = makeCaptures();
    const bridge = makeMockBridge();
    const handler: HookHandler<unknown, undefined> = {
      parse: (raw) => raw,
      async run(): Promise<undefined> { throw new Error('boom'); },
    };
    await expect(
      runHook(handler, {
        name: 'demo',
        readStdin: async () => '{}',
        writeStdout: cap.writeStdout,
        exit: cap.exit,
        bridge,
        logger: makeMockLogger(),
      }),
    ).resolves.toBeUndefined();
  });
});
