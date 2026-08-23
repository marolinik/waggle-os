import { EventEmitter } from 'node:events';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const processMocks = vi.hoisted(() => ({
  existsSync: vi.fn(() => false),
  openSync: vi.fn(() => 19),
  spawnSidecarOwnedProcess: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('@waggle/agent', () => ({
  spawnSidecarOwnedProcess: processMocks.spawnSidecarOwnedProcess,
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawnSync: processMocks.spawnSync,
}));

vi.mock('node:fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs')>()),
  existsSync: processMocks.existsSync,
  openSync: processMocks.openSync,
}));

import { startLiteLLM, stopLiteLLM } from '../../src/local/lifecycle.js';

const TEST_CONFIG_PATH = path.resolve('waggle-test', 'litellm.runtime.json');
const TEST_CONFIG_DIR = path.dirname(TEST_CONFIG_PATH);

function exitedChild(): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.defineProperty(child, 'exitCode', {
    configurable: true,
    value: 1,
    writable: true,
  });
  Object.defineProperty(child, 'signalCode', { configurable: true, value: null });
  child.kill = vi.fn(() => true);
  return child;
}

function runningChild(exitCodeOnShutdown = 0): ChildProcess {
  const child = new EventEmitter() as ChildProcess;
  Object.defineProperty(child, 'connected', { configurable: true, value: true });
  Object.defineProperty(child, 'exitCode', {
    configurable: true,
    value: null,
    writable: true,
  });
  Object.defineProperty(child, 'signalCode', { configurable: true, value: null });
  child.kill = vi.fn(() => true);
  child.send = vi.fn((_message, callback) => {
    callback?.(null);
    queueMicrotask(() => {
      Object.defineProperty(child, 'exitCode', {
        configurable: true,
        value: exitCodeOnShutdown,
        writable: true,
      });
      child.emit('exit', exitCodeOnShutdown, null);
    });
    return true;
  }) as ChildProcess['send'];
  return child;
}

describe('managed LiteLLM process ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('offline');
    }));
    processMocks.spawnSync.mockImplementation((_command, args) => {
      if (Array.isArray(args) && args[0] === '-c') {
        return { error: undefined, status: 0 };
      }
      return {
        error: undefined,
        status: 0,
        stdout: 'C:\\Python\\python.exe\r\n',
      };
    });
    processMocks.spawnSidecarOwnedProcess.mockReturnValue(exitedChild());
  });

  afterEach(async () => {
    await stopLiteLLM();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('starts LiteLLM through the sidecar-owned process boundary', async () => {
    const child = exitedChild();
    processMocks.spawnSidecarOwnedProcess.mockReturnValue(child);
    const start = startLiteLLM(43111, TEST_CONFIG_PATH);
    await Promise.resolve();
    await Promise.resolve();

    await vi.advanceTimersByTimeAsync(1_000);
    await expect(start).resolves.toMatchObject({
      error: 'LiteLLM exited with code 1',
      port: 43111,
      status: 'error',
    });
    expect(processMocks.spawnSidecarOwnedProcess).toHaveBeenCalledWith(
      'C:\\Python\\python.exe',
      [
        '-m',
        'litellm.proxy.proxy_cli',
        '--config',
        TEST_CONFIG_PATH,
        '--port',
        '43111',
      ],
      expect.objectContaining({
        cwd: TEST_CONFIG_DIR,
        windowsHide: true,
      }),
    );
    await stopLiteLLM();
  });

  it('stops LiteLLM through supervisor IPC and waits for confirmed cleanup', async () => {
    const child = runningChild();
    processMocks.spawnSidecarOwnedProcess.mockReturnValue(child);
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ok: true } as Response);

    const start = startLiteLLM(43112, TEST_CONFIG_PATH);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(start).resolves.toMatchObject({ status: 'started' });

    await stopLiteLLM();

    expect(child.send).toHaveBeenCalledWith('shutdown', expect.any(Function));
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('retains a failed supervisor handle when process-tree cleanup is unconfirmed', async () => {
    const child = runningChild(1);
    processMocks.spawnSidecarOwnedProcess.mockReturnValue(child);
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValueOnce({ ok: true } as Response);

    const start = startLiteLLM(43113, TEST_CONFIG_PATH);
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(start).resolves.toMatchObject({ status: 'started' });

    await expect(stopLiteLLM()).rejects.toThrow(
      'Sidecar-owned LiteLLM supervisor did not confirm cleanup (code=1, signal=null)',
    );
    expect(child.kill).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    await expect(startLiteLLM(43113)).resolves.toMatchObject({
      error: 'Previous LiteLLM process-tree cleanup is not confirmed',
      status: 'error',
    });
    expect(processMocks.spawnSidecarOwnedProcess).toHaveBeenCalledTimes(1);

    Object.defineProperty(child, 'exitCode', {
      configurable: true,
      value: 0,
      writable: true,
    });
    await stopLiteLLM();
  });
});
