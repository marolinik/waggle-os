import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildLocalServer } from '../../src/local/index.js';
import { HarvestAutoSyncService } from '../../src/local/services/harvest-autosync-service.js';

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

describe('HarvestAutoSyncService', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('coalesces overlapping work, closes admission, and drains before stop resolves', async () => {
    vi.useFakeTimers();
    const pass = deferred();
    const runSync = vi.fn(() => pass.promise);
    const service = new HarvestAutoSyncService({ runSync, intervalMs: 10 });

    service.start();
    await vi.advanceTimersByTimeAsync(10);
    const overlapping = service.runNow();
    expect(runSync).toHaveBeenCalledTimes(1);

    let stopped = false;
    const stopping = service.stop().then(() => { stopped = true; });
    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(vi.getTimerCount()).toBe(0);

    await vi.advanceTimersByTimeAsync(100);
    await service.runNow();
    expect(runSync).toHaveBeenCalledTimes(1);

    pass.resolve();
    await expect(overlapping).resolves.toBeUndefined();
    await expect(stopping).resolves.toBeUndefined();
  });

  it('keeps the personal mind open until the server drains Harvest autosync', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-harvest-close-'));
    tempDirs.push(dataDir);
    const stopEntered = deferred();
    const releaseStop = deferred();
    const originalStop = HarvestAutoSyncService.prototype.stop;
    const stopSpy = vi
      .spyOn(HarvestAutoSyncService.prototype, 'stop')
      .mockImplementation(async function (this: HarvestAutoSyncService) {
        const draining = originalStop.call(this);
        stopEntered.resolve();
        await releaseStop.promise;
        await draining;
      });
    const server = await buildLocalServer({ dataDir, port: 0 });
    const personalDb = server.multiMind.personal.getDatabase();

    let closed = false;
    const closing = server.close().then(() => { closed = true; });
    await stopEntered.promise;
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(closed).toBe(false);
    expect(personalDb.prepare('SELECT 1 AS value').get()).toEqual({ value: 1 });

    releaseStop.resolve();
    await expect(closing).resolves.toBeUndefined();
    expect(closed).toBe(true);
  });
});
