import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveShellEnv,
  resolveShellEnvBestEffort,
  resolvedShellPath,
  mergePathValue,
  __resetShellEnvStateForTests,
} from '../src/shell-env.js';
import { pathLookupCommand, pathLookupEnv } from '../src/tool-detection.js';

/** Minimal ChildProcess double exposing only what shell-env consumes. */
function makeChild(): EventEmitter & { stdout: EventEmitter; kill: ReturnType<typeof vi.fn> } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

/** A spawn fake that emits an `env -0` payload then exits cleanly. */
function successSpawn(payload: string) {
  return vi.fn(() => {
    const child = makeChild();
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(payload));
      child.emit('exit', 0);
    });
    return child;
  }) as unknown as typeof spawn;
}

beforeEach(() => {
  __resetShellEnvStateForTests();
});

afterEach(() => {
  vi.useRealTimers();
  __resetShellEnvStateForTests();
});

describe('resolveShellEnv', () => {
  it('short-circuits to process env on win32 without spawning', async () => {
    const spawnFn = vi.fn() as unknown as typeof spawn;
    const result = await resolveShellEnv({ platform: 'win32', spawnFn });
    expect(result.source).toBe('process');
    expect(spawnFn).not.toHaveBeenCalled();
    // process env values are all strings (undefined filtered out).
    expect(Object.values(result.env).every((v) => typeof v === 'string')).toBe(true);
  });

  it('parses a posix env -0 payload into a login-shell result', async () => {
    const spawnFn = successSpawn('PATH=/opt/homebrew/bin:/usr/bin\0FOO=bar\0');
    const result = await resolveShellEnv({ platform: 'darwin', spawnFn });
    expect(result.source).toBe('login-shell');
    expect(result.env.PATH).toBe('/opt/homebrew/bin:/usr/bin');
    expect(result.env.FOO).toBe('bar');
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to process env and arms a cooldown on timeout', async () => {
    vi.useFakeTimers();
    // Child never exits → both interactive and login-only spawns time out.
    const spawnFn = vi.fn(() => makeChild()) as unknown as typeof spawn;
    const pending = resolveShellEnv({ platform: 'darwin', spawnFn, timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100 + 2000); // interactive: SIGTERM + SIGKILL
    await vi.advanceTimersByTimeAsync(100 + 2000); // login-only: SIGTERM + SIGKILL
    const result = await pending;
    expect(result.source).toBe('process');
    expect(spawnFn).toHaveBeenCalledTimes(2);

    // Within the 60s cooldown a subsequent resolve returns fallback without spawning.
    (spawnFn as unknown as ReturnType<typeof vi.fn>).mockClear();
    const again = await resolveShellEnv({ platform: 'darwin', spawnFn });
    expect(again.source).toBe('process');
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('is single-flight: concurrent callers share one spawn', async () => {
    const spawnFn = successSpawn('PATH=/usr/bin\0');
    const [a, b] = await Promise.all([
      resolveShellEnv({ platform: 'darwin', spawnFn }),
      resolveShellEnv({ platform: 'darwin', spawnFn }),
    ]);
    expect(a.source).toBe('login-shell');
    expect(b.source).toBe('login-shell');
    expect(spawnFn).toHaveBeenCalledTimes(1);
  });

  it('caches a successful result for the process lifetime', async () => {
    const spawnFn = successSpawn('PATH=/usr/bin\0');
    await resolveShellEnv({ platform: 'darwin', spawnFn });
    (spawnFn as unknown as ReturnType<typeof vi.fn>).mockClear();

    const second = await resolveShellEnv({ platform: 'darwin', spawnFn });
    expect(second.source).toBe('login-shell');
    expect(spawnFn).not.toHaveBeenCalled();

    // best-effort returns the cached login-shell result synchronously.
    const be = resolveShellEnvBestEffort();
    expect(be.source).toBe('login-shell');
    expect(be.env.PATH).toBe('/usr/bin');
  });
});

describe('mergePathValue', () => {
  it('unions shell PATH ahead of base PATH and de-duplicates', () => {
    expect(mergePathValue('/opt/homebrew/bin:/usr/bin', '/usr/bin:/bin')).toBe(
      '/opt/homebrew/bin:/usr/bin:/bin',
    );
  });

  it('tolerates an undefined base PATH', () => {
    expect(mergePathValue('/usr/bin', undefined)).toBe('/usr/bin');
  });
});

describe('detector PATH wiring', () => {
  it('pathLookupEnv merges the resolved login-shell PATH on posix', async () => {
    const spawnFn = successSpawn('PATH=/opt/homebrew/bin:/usr/local/bin\0');
    await resolveShellEnv({ platform: 'darwin', spawnFn });
    // Sanity: the resolver now exposes the login-shell PATH.
    expect(resolvedShellPath()).toBe('/opt/homebrew/bin:/usr/local/bin');

    const env = pathLookupEnv('darwin', { PATH: '/usr/bin' });
    expect(env).toBeDefined();
    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin');
  });

  it('pathLookupEnv sanitizes secrets and uses System32 where.exe on win32', () => {
    const env = pathLookupEnv('win32', {
      PATH: 'C:\\Tools',
      SystemRoot: 'C:\\Windows',
      OPENAI_API_KEY: 'must-not-cross',
    });
    expect(env.PATH).toBe('C:\\Tools');
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(pathLookupCommand('win32', env)).toBe('C:\\Windows\\System32\\where.exe');
  });

  it('pathLookupEnv keeps a sanitized base PATH when no login-shell PATH is resolved', () => {
    const env = pathLookupEnv('darwin', {
      PATH: '/usr/bin',
      ANTHROPIC_API_KEY: 'must-not-cross',
    });
    expect(env.PATH).toBe('/usr/bin');
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
  });
});
