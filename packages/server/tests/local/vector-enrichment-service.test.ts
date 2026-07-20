import { afterEach, describe, expect, it, vi } from 'vitest';
import { MindDB, type EmbeddingProviderInstance } from '@waggle/core';
import {
  VectorEnrichmentService,
  type VectorEnrichmentRunResult,
} from '../../src/local/services/vector-enrichment-service.js';
import type { VectorBackfillResult } from '../../src/local/vector-backfill.js';

function backfillResult(overrides: Partial<VectorBackfillResult> = {}): VectorBackfillResult {
  return {
    skipped: null,
    vectorsRepaired: false,
    framesReembedded: 0,
    chunksCreated: 0,
    framesProcessed: 0,
    hasMore: false,
    errors: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

const provider = {} as EmbeddingProviderInstance;

describe('VectorEnrichmentService', () => {
  const dbs: MindDB[] = [];

  afterEach(() => {
    vi.useRealTimers();
    for (const db of dbs.splice(0)) db.close();
  });

  it('runs immediately, every five minutes, and coalesces overlapping requests', async () => {
    vi.useFakeTimers();
    const personal = new MindDB(':memory:');
    dbs.push(personal);
    const firstPass = deferred<VectorBackfillResult>();
    const runPass = vi.fn()
      .mockImplementationOnce(() => firstPass.promise)
      .mockResolvedValue(backfillResult());
    const service = new VectorEnrichmentService({
      personalMind: personal,
      embeddingProvider: provider,
      listWorkspaceIds: () => [],
      acquireWorkspaceMind: () => { throw new Error('not used'); },
      releaseWorkspaceMind: () => undefined,
      runPass,
    }, { maxPassesPerMind: 2 });

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const overlapping = service.runNow();
    expect(runPass).toHaveBeenCalledTimes(1);
    firstPass.resolve(backfillResult({ framesProcessed: 1, hasMore: true }));
    await overlapping;
    expect(runPass).toHaveBeenCalledTimes(2); // bounded second pass

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
    expect(runPass).toHaveBeenCalledTimes(3);
    await service.stop();
  });

  it('pins each workspace for all of its passes and releases it even after a failure', async () => {
    const personal = new MindDB(':memory:');
    const ws1 = new MindDB(':memory:');
    const ws2 = new MindDB(':memory:');
    dbs.push(personal, ws1, ws2);
    const acquire = vi.fn((id: string) => id === 'ws-1' ? ws1 : ws2);
    const release = vi.fn();
    const perMindCalls = new Map<MindDB, number>();
    const runPass = vi.fn(async (db: MindDB) => {
      perMindCalls.set(db, (perMindCalls.get(db) ?? 0) + 1);
      if (db === ws2) throw new Error('workspace pass failed');
      return backfillResult({ hasMore: (perMindCalls.get(db) ?? 0) === 1 });
    });
    const service = new VectorEnrichmentService({
      personalMind: personal,
      embeddingProvider: provider,
      listWorkspaceIds: () => ['ws-1', 'ws-2'],
      acquireWorkspaceMind: acquire,
      releaseWorkspaceMind: release,
      runPass,
    }, { maxPassesPerMind: 2 });

    const result = await service.runNow();

    expect(acquire.mock.calls).toEqual([['ws-1'], ['ws-2']]);
    expect(release.mock.calls).toEqual([['ws-1'], ['ws-2']]);
    expect(perMindCalls.get(ws1)).toBe(2);
    expect(result.errors).toEqual([expect.stringContaining('workspace ws-2')]);
  });

  it('waits for an in-flight pass before shutdown resolves', async () => {
    const personal = new MindDB(':memory:');
    dbs.push(personal);
    const pass = deferred<VectorBackfillResult>();
    const service = new VectorEnrichmentService({
      personalMind: personal,
      embeddingProvider: provider,
      listWorkspaceIds: () => [],
      acquireWorkspaceMind: () => { throw new Error('not used'); },
      releaseWorkspaceMind: () => undefined,
      runPass: () => pass.promise,
    });
    const run = service.runNow();
    let stopped = false;
    const stopping = service.stop().then(() => { stopped = true; });

    await Promise.resolve();
    expect(stopped).toBe(false);
    pass.resolve(backfillResult());
    await expect(stopping).resolves.toBeUndefined();
    await expect(run).resolves.toMatchObject<Partial<VectorEnrichmentRunResult>>({ mindsVisited: 1 });
  });
});
