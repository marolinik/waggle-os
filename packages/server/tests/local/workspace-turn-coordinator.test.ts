import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ToolDefinition } from '@waggle/agent';
import {
  BACKGROUND_COMMAND_DENIAL,
  WorkspaceTurnCoordinator,
  canonicalWorkspaceRoot,
  classifyWorkspaceTurnAccess,
} from '../../src/local/workspace-turn-coordinator.js';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('WorkspaceTurnCoordinator', () => {
  it('shares readers, queues a writer fairly, then holds later readers behind it', async () => {
    const coordinator = new WorkspaceTurnCoordinator();
    const queued: number[] = [];
    const releaseReaderA = await coordinator.acquire('repo', 'read');
    const releaseReaderB = await coordinator.acquire('repo', 'read');

    let writerAcquired = false;
    const writer = coordinator.acquire('repo', 'write', undefined, position => queued.push(position))
      .then((release) => {
        writerAcquired = true;
        return release;
      });
    let lateReaderAcquired = false;
    const lateReader = coordinator.acquire('repo', 'read', undefined, position => queued.push(position))
      .then((release) => {
        lateReaderAcquired = true;
        return release;
      });

    await Promise.resolve();
    expect(queued).toEqual([1, 2]);
    expect(writerAcquired).toBe(false);
    expect(lateReaderAcquired).toBe(false);

    releaseReaderA();
    await Promise.resolve();
    expect(writerAcquired).toBe(false);
    releaseReaderB();
    const releaseWriter = await writer;
    expect(writerAcquired).toBe(true);
    expect(lateReaderAcquired).toBe(false);

    releaseWriter();
    const releaseLateReader = await lateReader;
    expect(lateReaderAcquired).toBe(true);
    releaseLateReader();
  });

  it('removes an aborted waiter without blocking the next writer', async () => {
    const coordinator = new WorkspaceTurnCoordinator();
    const releaseFirst = await coordinator.acquire('repo', 'write');
    const controller = new AbortController();
    const cancelled = coordinator.acquire('repo', 'write', controller.signal);
    const next = coordinator.acquire('repo', 'write');

    controller.abort(new Error('cancelled while queued'));
    await expect(cancelled).rejects.toThrow('cancelled while queued');
    releaseFirst();
    const releaseNext = await next;
    releaseNext();
  });

  it('serializes mutating child tools inside one writer turn and blocks background shell jobs', async () => {
    const coordinator = new WorkspaceTurnCoordinator();
    const scope = coordinator.createScope(process.cwd());
    await scope.acquire('write');

    const firstMayFinish = deferred();
    const firstStarted = deferred();
    const starts: string[] = [];
    const mutation: ToolDefinition = {
      name: 'write_file',
      description: '',
      parameters: {},
      execute: vi.fn(async (args) => {
        const id = String(args.id);
        starts.push(id);
        if (id === 'first') {
          firstStarted.resolve();
          await firstMayFinish.promise;
        }
        return id;
      }),
    };
    const bashExecute = vi.fn(async () => 'started');
    const bash: ToolDefinition = {
      name: 'bash',
      description: '',
      parameters: {},
      execute: bashExecute,
    };
    const [wrappedMutation, wrappedBash] = scope.wrapTools([mutation, bash]);

    const first = wrappedMutation.execute({ id: 'first' });
    const second = wrappedMutation.execute({ id: 'second' });
    await firstStarted.promise;
    expect(starts).toEqual(['first']);
    firstMayFinish.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(starts).toEqual(['first', 'second']);

    await expect(wrappedBash.execute({ command: 'test', run_in_background: true }))
      .resolves.toBe(BACKGROUND_COMMAND_DENIAL);
    await expect(wrappedBash.execute({ command: 'test', run_in_background: 'false' }))
      .resolves.toBe(BACKGROUND_COMMAND_DENIAL);
    expect(bashExecute).not.toHaveBeenCalled();
    await scope.release();
  });

  it('serializes complete child checkout transactions while memory-only children stay concurrent', async () => {
    const coordinator = new WorkspaceTurnCoordinator();
    const scope = coordinator.createScope(process.cwd());
    await scope.acquire('write');

    const firstStarted = deferred();
    const firstMayFinish = deferred();
    const starts: string[] = [];
    const checkoutTools = [{ name: 'read_file' }, { name: 'edit_file' }];

    const first = scope.runChildTransaction(checkoutTools, async () => {
      starts.push('first');
      firstStarted.resolve();
      await firstMayFinish.promise;
      return 'first';
    });
    await firstStarted.promise;
    const second = scope.runChildTransaction(checkoutTools, async () => {
      starts.push('second');
      return 'second';
    });
    const memory = scope.runChildTransaction([{ name: 'search_memory' }], async () => 'memory');

    await expect(memory).resolves.toBe('memory');
    expect(starts).toEqual(['first']);
    firstMayFinish.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(starts).toEqual(['first', 'second']);
    await scope.release();
  });

  it('classifies checkout reads, writes, knowledge-only tools, and unknown tools conservatively', () => {
    expect(classifyWorkspaceTurnAccess([
      { name: 'search_memory' }, { name: 'web_fetch' }, { name: 'create_skill' },
    ])).toBe('none');
    expect(classifyWorkspaceTurnAccess([{ name: 'read_file' }, { name: 'git_status' }])).toBe('read');
    expect(classifyWorkspaceTurnAccess([{ name: 'read_file' }, { name: 'edit_file' }])).toBe('write');
    expect(classifyWorkspaceTurnAccess([{ name: 'unclassified_connector_action' }])).toBe('write');
    expect(classifyWorkspaceTurnAccess(
      [{ name: 'remote_search' }],
      new Set(['remote_search']),
    )).toBe('write');
  });

  it('canonicalizes path aliases to one physical-root key', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-turn-root-'));
    try {
      expect(canonicalWorkspaceRoot(path.join(root, '.'))).toBe(canonicalWorkspaceRoot(root));
      if (process.platform === 'win32') {
        expect(canonicalWorkspaceRoot(root.toUpperCase())).toBe(canonicalWorkspaceRoot(root));
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
