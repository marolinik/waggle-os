import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Command Execution Route', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-cmd-test-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test');
    frames.createIFrame(s1.gop_id, 'Test memory about architecture decisions', 'normal');
    frames.createIFrame(s1.gop_id, 'Another memory about deployment', 'important');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir, workspaceDeletionTimeoutMs: 100 });
  });

  afterAll(async () => {
    await server.close();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Non-critical — OS will clean temp dir
    }
  });

  const executeCases = [
    ['plural', '/api/commands/execute'],
    ['singular', '/api/command/execute'],
  ] as const;

  function executePayload(url: string, workspaceId: string) {
    return url === '/api/commands/execute'
      ? { command: '/memory lease ordering', workspaceId }
      : { input: '/memory lease ordering', workspaceId };
  }

  function createLeasedWorkspaceSession(workspaceId: string) {
    let releaseAttempts = 0;
    const session = server.sessionManager.getOrCreate(
      workspaceId,
      () => server.mindCache.acquire(workspaceId),
      mind => server.agentState.createSessionOrchestrator(mind),
      (mind, orchestrator) => server.agentState.buildToolsForSession(orchestrator, workspaceId, workspaceId),
      'general-purpose',
      () => {
        releaseAttempts += 1;
        server.mindCache.release(workspaceId);
      },
    );
    return { session, releaseAttempts: () => releaseAttempts };
  }

  it.each(executeCases)('%s command fails closed for an unknown explicit workspace', async (_label, url) => {
    const response = await injectWithAuth(server, {
      method: 'POST',
      url,
      payload: executePayload(url, 'missing-workspace'),
    });

    expect(response.statusCode, response.body).toBe(404);
    expect(response.json()).toEqual({ error: 'Workspace not found' });
  });

  it.each([
    ['plural', '/api/commands/execute', 'paused'],
    ['singular', '/api/command/execute', 'paused'],
    ['plural', '/api/commands/execute', 'error'],
    ['singular', '/api/command/execute', 'error'],
  ] as const)('%s command at %s fails closed for a %s workspace session', async (_label, url, status) => {
    const workspace = server.workspaceManager.create({
      name: `Command ${status} session ${_label}`,
      group: 'Test',
    }).id;
    const { session } = createLeasedWorkspaceSession(workspace);
    if (status === 'paused') server.sessionManager.pause(workspace);
    else session.status = 'error';
    const directAcquire = vi.spyOn(server.mindCache, 'acquire');
    const directLeaseAcquire = vi.spyOn(server.mindCache, 'acquireLease');
    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toEqual({ error: 'Workspace session is not active' });
      expect(directAcquire).not.toHaveBeenCalled();
      expect(directLeaseAcquire).not.toHaveBeenCalled();
    } finally {
      directAcquire.mockRestore();
      directLeaseAcquire.mockRestore();
      server.sessionManager.close(workspace);
      server.mindCache.close(workspace);
      server.workspaceManager.delete(workspace);
    }
  });

  it.each(executeCases)('%s command keeps an existing session generation leased through memory recall', async (_label, url) => {
    const workspace = server.workspaceManager.create({
      name: `Command session lease ${_label}`,
      group: 'Test',
    }).id;
    const leasedSession = createLeasedWorkspaceSession(workspace);
    const { session } = leasedSession;
    let announceRecallEntered!: () => void;
    let allowRecall!: () => void;
    const recallEntered = new Promise<void>(resolve => { announceRecallEntered = resolve; });
    const recallGate = new Promise<void>(resolve => { allowRecall = resolve; });
    const recall = vi.spyOn(session.orchestrator, 'recallMemory').mockImplementation(async () => {
      announceRecallEntered();
      await recallGate;
      return { text: 'leased memory', count: 1, recalled: ['leased memory'] };
    });
    let responsePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      responsePromise = injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });
      await recallEntered;

      expect(server.sessionManager.close(workspace)).toBe(true);
      expect(leasedSession.releaseAttempts()).toBe(0);

      allowRecall();
      const response = await responsePromise;
      expect(response.statusCode, response.body).toBe(200);
      expect(response.body).toContain('leased memory');
      await vi.waitFor(() => {
        expect(leasedSession.releaseAttempts()).toBe(1);
      });
    } finally {
      allowRecall();
      if (responsePromise) await responsePromise.catch(() => undefined);
      server.sessionManager.close(workspace);
      recall.mockRestore();
    }
  });

  it.each(executeCases)('%s command cannot release a recreated session cache generation', async (_label, url) => {
    const workspace = server.workspaceManager.create({
      name: `Command session generation ${_label}`,
      group: 'Test',
    }).id;
    const leasedSession = createLeasedWorkspaceSession(workspace);
    const pressureWorkspaces: string[] = [];
    let announceRecallEntered!: () => void;
    let allowRecall!: () => void;
    const recallEntered = new Promise<void>(resolve => { announceRecallEntered = resolve; });
    const recallGate = new Promise<void>(resolve => { allowRecall = resolve; });
    const recall = vi.spyOn(leasedSession.session.orchestrator, 'recallMemory').mockImplementation(async () => {
      announceRecallEntered();
      await recallGate;
      return { text: 'retired session memory', count: 1, recalled: ['retired session memory'] };
    });
    let replacementMind: MindDB | undefined;
    let responsePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      responsePromise = injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });
      await recallEntered;

      expect(server.sessionManager.close(workspace)).toBe(true);
      expect(leasedSession.releaseAttempts()).toBe(0);
      server.mindCache.close(workspace);
      replacementMind = server.mindCache.acquire(workspace);
      expect(replacementMind).not.toBe(leasedSession.session.mind);

      allowRecall();
      const response = await responsePromise;
      expect(response.statusCode, response.body).toBe(200);
      expect(leasedSession.releaseAttempts()).toBe(1);

      for (let index = 0; index < 22; index += 1) {
        const pressureWorkspace = server.workspaceManager.create({
          name: `Command session generation pressure ${_label} ${index}`,
          group: 'Test',
        }).id;
        pressureWorkspaces.push(pressureWorkspace);
        expect(server.agentState.getWorkspaceMindDb(pressureWorkspace)).not.toBeNull();
      }
      expect(replacementMind.isOpen()).toBe(true);
    } finally {
      allowRecall();
      if (responsePromise) await responsePromise.catch(() => undefined);
      recall.mockRestore();
      if (replacementMind) server.mindCache.release(workspace);
      server.mindCache.close(workspace);
      for (const pressureWorkspace of pressureWorkspaces) {
        server.mindCache.close(pressureWorkspace);
        server.workspaceManager.delete(pressureWorkspace);
      }
      server.workspaceManager.delete(workspace);
    }
  });

  it.each([
    ['plural', '/api/commands/execute', 'session'],
    ['singular', '/api/command/execute', 'session'],
    ['plural', '/api/commands/execute', 'request-local'],
    ['singular', '/api/command/execute', 'request-local'],
  ] as const)('%s command via %s keeps workspace deletion pending for its %s mind', async (_label, url, mode) => {
    const workspace = server.workspaceManager.create({
      name: `Command delete drain ${_label} ${mode}`,
      group: 'Test',
    }).id;
    const workspaceDir = path.dirname(server.workspaceManager.getMindPath(workspace));
    let commandMind: MindDB | undefined;
    let announceRecallEntered!: () => void;
    let allowRecall!: () => void;
    const recallEntered = new Promise<void>(resolve => { announceRecallEntered = resolve; });
    const recallGate = new Promise<void>(resolve => { allowRecall = resolve; });
    let recallSpy: { mockRestore(): void } | undefined;
    let createOrchestratorSpy: { mockRestore(): void } | undefined;
    let deleteSpy: { mockRestore(): void } | undefined;
    let mindWasClosedAtDelete: boolean | undefined;

    if (mode === 'session') {
      const leasedSession = createLeasedWorkspaceSession(workspace);
      commandMind = leasedSession.session.mind;
      recallSpy = vi.spyOn(leasedSession.session.orchestrator, 'recallMemory').mockImplementation(async () => {
        announceRecallEntered();
        await recallGate;
        return { text: 'delete drain memory', count: 1, recalled: ['delete drain memory'] };
      });
    } else {
      const originalCreate = server.agentState.createSessionOrchestrator.bind(server.agentState);
      createOrchestratorSpy = vi.spyOn(server.agentState, 'createSessionOrchestrator')
        .mockImplementation((mind) => {
          commandMind = mind;
          const orchestrator = originalCreate(mind);
          recallSpy = vi.spyOn(orchestrator, 'recallMemory').mockImplementation(async () => {
            announceRecallEntered();
            await recallGate;
            return { text: 'delete drain memory', count: 1, recalled: ['delete drain memory'] };
          });
          return orchestrator;
      });
    }

    if (_label === 'plural' && mode === 'session') {
      const originalDelete = server.workspaceManager.delete.bind(server.workspaceManager);
      deleteSpy = vi.spyOn(server.workspaceManager, 'delete').mockImplementation((id: string) => {
        if (id === workspace) mindWasClosedAtDelete = commandMind?.isOpen() === false;
        originalDelete(id);
      });
    }

    let commandPromise: ReturnType<typeof injectWithAuth> | undefined;
    let deletePromise: ReturnType<typeof injectWithAuth> | undefined;
    let deleteSettled = false;
    try {
      commandPromise = injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });
      await recallEntered;
      expect(commandMind?.isOpen()).toBe(true);
      expect(fs.existsSync(workspaceDir)).toBe(true);

      deletePromise = injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      }).then((response) => {
        deleteSettled = true;
        return response;
      });
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(deleteSettled).toBe(false);
      expect(server.workspaceManager.get(workspace)).toBeDefined();
      expect(commandMind?.isOpen()).toBe(true);
      expect(fs.existsSync(workspaceDir)).toBe(true);

      allowRecall();
      const commandResponse = await commandPromise;
      expect(commandResponse.statusCode, commandResponse.body).toBe(200);
      const deleteResponse = await deletePromise;
      expect(deleteResponse.statusCode, deleteResponse.body).toBe(204);
      if (_label === 'plural' && mode === 'session') {
        expect(mindWasClosedAtDelete).toBe(true);
      }
      expect(server.workspaceManager.get(workspace)).toBeNull();
      expect(commandMind?.isOpen()).toBe(false);
      expect(fs.existsSync(workspaceDir)).toBe(false);
    } finally {
      allowRecall();
      if (commandPromise) await commandPromise.catch(() => undefined);
      if (deletePromise) await deletePromise.catch(() => undefined);
      recallSpy?.mockRestore();
      createOrchestratorSpy?.mockRestore();
      deleteSpy?.mockRestore();
      server.sessionManager.close(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
    }
  });

  it('cancels and drains durable workspace work before deletion', async () => {
    const workspace = server.workspaceManager.create({
      name: 'Durable delete drain',
      group: 'Test',
    }).id;
    const mind = server.mindCache.acquire(workspace);
    const room = server.agentRunRegistry.createRoom({
      workspaceIds: [workspace],
      source: 'fleet',
      executor: { kind: 'coordinator' },
      title: 'Delete drain room',
      task: 'Hold the workspace lease',
      capabilities: { cancel: true },
    });
    const run = server.agentRunRegistry.createWorker({
      parentRunId: room.id,
      workspaceId: workspace,
      source: 'fleet',
      executor: { kind: 'waggle_agent', personaId: 'coder', model: 'test-model' },
      title: 'Delete drain worker',
      task: 'Hold the workspace lease',
      capabilities: { cancel: true },
    });
    server.agentRunRegistry.update(run.id, { status: 'running' });
    let announceCancelStarted!: () => void;
    let allowCancellation!: () => void;
    const cancelStarted = new Promise<void>(resolve => { announceCancelStarted = resolve; });
    const cancelGate = new Promise<void>(resolve => { allowCancellation = resolve; });
    let leaseReleased = false;
    const unregister = server.agentRunRegistry.registerControls(run.id, {
      cancel: async () => {
        announceCancelStarted();
        await cancelGate;
        server.mindCache.release(workspace);
        leaseReleased = true;
      },
    });
    let deleteSettled = false;
    let deletePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      deletePromise = injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      }).then((response) => {
        deleteSettled = true;
        return response;
      });
      await cancelStarted;

      expect(deleteSettled).toBe(false);
      expect(leaseReleased).toBe(false);
      expect(mind.isOpen()).toBe(true);
      expect(server.workspaceManager.get(workspace)).not.toBeNull();

      allowCancellation();
      const response = await deletePromise;
      expect(response.statusCode, response.body).toBe(204);
      expect(leaseReleased).toBe(true);
      expect(mind.isOpen()).toBe(false);
      expect(server.workspaceManager.get(workspace)).toBeNull();
      expect(server.agentRunRegistry.get(run.id)?.status).toBe('cancelled');
    } finally {
      allowCancellation();
      if (deletePromise) await deletePromise.catch(() => undefined);
      unregister();
      if (!leaseReleased) server.mindCache.release(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
    }
  });

  it('keeps a workspace usable when durable work refuses deletion cancellation', async () => {
    const workspace = server.workspaceManager.create({
      name: 'Durable delete refusal',
      group: 'Test',
    }).id;
    const mind = server.mindCache.acquire(workspace);
    const room = server.agentRunRegistry.createRoom({
      workspaceIds: [workspace],
      source: 'fleet',
      executor: { kind: 'coordinator' },
      title: 'Delete refusal room',
      task: 'Refuse cancellation',
      capabilities: { cancel: true },
    });
    const run = server.agentRunRegistry.createWorker({
      parentRunId: room.id,
      workspaceId: workspace,
      source: 'fleet',
      executor: { kind: 'waggle_agent', personaId: 'coder', model: 'test-model' },
      title: 'Delete refusal worker',
      task: 'Refuse cancellation',
      capabilities: { cancel: true },
    });
    server.agentRunRegistry.update(run.id, { status: 'running' });
    const unregister = server.agentRunRegistry.registerControls(run.id, {
      cancel: async () => { throw new Error('synthetic cancellation refusal'); },
    });
    try {
      const response = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ error: 'workspace_busy' });
      expect(server.workspaceManager.get(workspace)).not.toBeNull();
      expect(server.agentState.getWorkspaceMindDb(workspace)).toBe(mind);
      expect(mind.isOpen()).toBe(true);
    } finally {
      unregister();
      server.agentRunRegistry.update(run.id, { status: 'interrupted' });
      server.mindCache.release(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
    }
  });

  it('times out non-cooperative cancellation without disabling the workspace', async () => {
    const workspace = server.workspaceManager.create({
      name: 'Durable delete timeout',
      group: 'Test',
    }).id;
    const previousActiveWorkspace = server.agentState.activeWorkspaceId;
    expect(server.agentState.activateWorkspaceMind(workspace)).toBe(true);
    const leasedSession = createLeasedWorkspaceSession(workspace);
    const lateLease = server.mindCache.acquireLease(workspace);
    const room = server.agentRunRegistry.createRoom({
      workspaceIds: [workspace],
      source: 'fleet',
      executor: { kind: 'coordinator' },
      title: 'Delete timeout room',
      task: 'Ignore cancellation until released',
      capabilities: { cancel: true },
    });
    const run = server.agentRunRegistry.createWorker({
      parentRunId: room.id,
      workspaceId: workspace,
      source: 'fleet',
      executor: { kind: 'waggle_agent', personaId: 'coder', model: 'test-model' },
      title: 'Delete timeout worker',
      task: 'Ignore cancellation until released',
      capabilities: { cancel: true },
    });
    server.agentRunRegistry.update(run.id, { status: 'running' });
    let announceCancelStarted!: () => void;
    let allowCancellation!: () => void;
    let announceCancellationFinished!: () => void;
    const cancelStarted = new Promise<void>(resolve => { announceCancelStarted = resolve; });
    const cancelGate = new Promise<void>(resolve => { allowCancellation = resolve; });
    const cancellationFinished = new Promise<void>(resolve => { announceCancellationFinished = resolve; });
    let cancellationEntered = false;
    let lateLeaseReleased = false;
    const unregister = server.agentRunRegistry.registerControls(run.id, {
      cancel: async () => {
        cancellationEntered = true;
        announceCancelStarted();
        await cancelGate;
        lateLease.release();
        lateLeaseReleased = true;
        announceCancellationFinished();
      },
    });
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    let deletePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      const clearIntervalCallsBeforeDelete = clearIntervalSpy.mock.calls.length;
      deletePromise = injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      });
      await cancelStarted;

      const response = await deletePromise;
      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ error: 'workspace_busy' });
      expect(response.json().message).toMatch(/timed out while cancelling active work/i);
      expect(server.workspaceManager.get(workspace)).not.toBeNull();
      expect(server.sessionManager.get(workspace)).toBe(leasedSession.session);
      expect(server.agentState.activeWorkspaceId).toBe(workspace);
      expect(clearIntervalSpy.mock.calls.length).toBe(clearIntervalCallsBeforeDelete);
      expect(server.agentState.getWorkspaceMindDb(workspace)).toBe(leasedSession.session.mind);

      const recoveredLease = server.mindCache.acquireLease(workspace);
      allowCancellation();
      await cancellationFinished;
      expect(recoveredLease.db.isOpen()).toBe(true);
      expect(server.agentState.getWorkspaceMindDb(workspace)).toBe(recoveredLease.db);
      recoveredLease.release();
    } finally {
      allowCancellation();
      if (cancellationEntered && !lateLeaseReleased) await cancellationFinished;
      if (deletePromise) await deletePromise.catch(() => undefined);
      clearIntervalSpy.mockRestore();
      unregister();
      const currentRun = server.agentRunRegistry.get(run.id);
      if (currentRun && !['completed', 'failed', 'cancelled', 'interrupted'].includes(currentRun.status)) {
        server.agentRunRegistry.update(run.id, { status: 'interrupted' });
      }
      server.sessionManager.close(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
      if (previousActiveWorkspace && server.workspaceManager.get(previousActiveWorkspace)) {
        server.agentState.activateWorkspaceMind(previousActiveWorkspace);
      }
    }
  });

  it('restores a drained-out session with the canonical managed execution root', async () => {
    const workspace = server.workspaceManager.create({
      name: 'Session drain timeout',
      group: 'Test',
    }).id;
    const leasedSession = createLeasedWorkspaceSession(workspace);
    const activity = server.sessionManager.acquireActivity(workspace);
    expect(activity).toBeDefined();
    const originalBuildTools = server.agentState.buildToolsForSession.bind(server.agentState);
    let restoredRoot: string | undefined;
    const buildToolsSpy = vi.spyOn(server.agentState, 'buildToolsForSession')
      .mockImplementation((orchestrator, workspacePath, sourceWorkspaceId) => {
        if (sourceWorkspaceId === workspace) restoredRoot = workspacePath;
        return originalBuildTools(orchestrator, workspacePath, sourceWorkspaceId);
      });
    try {
      const response = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      });

      expect(response.statusCode, response.body).toBe(409);
      expect(response.json()).toMatchObject({ error: 'workspace_busy' });
      expect(response.json().message).toMatch(/timed out while draining active work/i);
      expect(server.workspaceManager.get(workspace)).not.toBeNull();
      const replacement = server.sessionManager.get(workspace);
      expect(replacement).toBeDefined();
      expect(replacement).not.toBe(leasedSession.session);
      const expectedRoot = fs.realpathSync(path.join(tmpDir, 'workspaces', workspace, 'files'));
      expect(restoredRoot).toBe(expectedRoot);
      expect(restoredRoot).not.toBe(path.dirname(server.workspaceManager.getMindPath(workspace)));

      activity?.release();
      expect(replacement?.mind.isOpen()).toBe(true);
      expect(server.agentState.getWorkspaceMindDb(workspace)).toBe(replacement?.mind);
    } finally {
      activity?.release();
      buildToolsSpy.mockRestore();
      server.sessionManager.close(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
    }
  });

  it('rolls back a failed filesystem deletion using the configured linked root', async () => {
    const linkedRoot = fs.mkdtempSync(path.join(tmpDir, 'linked-delete-root-'));
    const workspace = server.workspaceManager.create({
      name: 'Linked delete rollback',
      group: 'Test',
      directory: linkedRoot,
    }).id;
    const previousActiveWorkspace = server.agentState.activeWorkspaceId;
    expect(server.agentState.activateWorkspaceMind(workspace)).toBe(true);
    createLeasedWorkspaceSession(workspace);
    const originalBuildTools = server.agentState.buildToolsForSession.bind(server.agentState);
    let restoredRoot: string | undefined;
    const buildToolsSpy = vi.spyOn(server.agentState, 'buildToolsForSession')
      .mockImplementation((orchestrator, workspacePath, sourceWorkspaceId) => {
        if (sourceWorkspaceId === workspace) restoredRoot = workspacePath;
        return originalBuildTools(orchestrator, workspacePath, sourceWorkspaceId);
      });
    const originalDelete = server.workspaceManager.delete.bind(server.workspaceManager);
    let injectedFailures = 0;
    const deleteSpy = vi.spyOn(server.workspaceManager, 'delete').mockImplementation((id: string) => {
      if (id === workspace && injectedFailures === 0) {
        injectedFailures += 1;
        throw Object.assign(new Error('synthetic Windows deletion refusal'), { code: 'EPERM' });
      }
      originalDelete(id);
    });
    try {
      const failed = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      });
      expect(failed.statusCode, failed.body).toBe(409);
      expect(failed.json()).toMatchObject({ error: 'workspace_busy' });
      expect(server.workspaceManager.get(workspace)).not.toBeNull();
      expect(server.agentState.activeWorkspaceId).toBe(workspace);
      expect(server.sessionManager.get(workspace)?.mind.isOpen()).toBe(true);
      expect(restoredRoot).toBe(fs.realpathSync(linkedRoot));

      const retried = await injectWithAuth(server, {
        method: 'DELETE',
        url: `/api/workspaces/${workspace}`,
      });
      expect(retried.statusCode, retried.body).toBe(204);
      expect(server.workspaceManager.get(workspace)).toBeNull();
    } finally {
      buildToolsSpy.mockRestore();
      deleteSpy.mockRestore();
      server.sessionManager.close(workspace);
      server.mindCache.close(workspace);
      if (server.workspaceManager.get(workspace)) server.workspaceManager.delete(workspace);
      fs.rmSync(linkedRoot, { recursive: true, force: true });
      if (previousActiveWorkspace && server.workspaceManager.get(previousActiveWorkspace)) {
        server.agentState.activateWorkspaceMind(previousActiveWorkspace);
      }
    }
  });

  it.each(executeCases)('%s command pins a request-local workspace mind through memory recall', async (_label, url) => {
    const workspace = server.workspaceManager.create({
      name: `Command cache pin ${_label}`,
      group: 'Test',
    }).id;
    const pressureWorkspaces: string[] = [];
    let targetMind: MindDB | undefined;
    let announceRecallEntered!: () => void;
    let allowRecall!: () => void;
    const recallEntered = new Promise<void>(resolve => { announceRecallEntered = resolve; });
    const recallGate = new Promise<void>(resolve => { allowRecall = resolve; });
    const originalCreate = server.agentState.createSessionOrchestrator.bind(server.agentState);
    const createOrchestrator = vi.spyOn(server.agentState, 'createSessionOrchestrator')
      .mockImplementation((mind) => {
        targetMind = mind;
        const orchestrator = originalCreate(mind);
        vi.spyOn(orchestrator, 'recallMemory').mockImplementation(async () => {
          announceRecallEntered();
          await recallGate;
          return { text: 'pinned memory', count: 1, recalled: ['pinned memory'] };
        });
        return orchestrator;
      });
    const originalAcquireLease = server.mindCache.acquireLease.bind(server.mindCache);
    let leaseReleaseAttempts = 0;
    const mindAcquire = vi.spyOn(server.mindCache, 'acquireLease')
      .mockImplementation((requestedWorkspace) => {
        const lease = originalAcquireLease(requestedWorkspace);
        if (requestedWorkspace !== workspace) return lease;
        return {
          db: lease.db,
          release: () => {
            leaseReleaseAttempts += 1;
            lease.release();
          },
        };
      });
    let responsePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      responsePromise = injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });
      await recallEntered;

      for (let index = 0; index < 22; index += 1) {
        const pressureWorkspace = server.workspaceManager.create({
          name: `Command cache pressure ${_label} ${index}`,
          group: 'Test',
        }).id;
        pressureWorkspaces.push(pressureWorkspace);
        expect(server.agentState.getWorkspaceMindDb(pressureWorkspace)).not.toBeNull();
      }

      expect(mindAcquire.mock.calls.filter(([id]) => id === workspace)).toHaveLength(1);
      expect(leaseReleaseAttempts).toBe(0);
      expect(targetMind?.isOpen()).toBe(true);

      allowRecall();
      const response = await responsePromise;
      expect(response.statusCode, response.body).toBe(200);
      expect(response.body).toContain('pinned memory');
      expect(leaseReleaseAttempts).toBe(1);
    } finally {
      allowRecall();
      if (responsePromise) await responsePromise.catch(() => undefined);
      createOrchestrator.mockRestore();
      mindAcquire.mockRestore();
      server.mindCache.close(workspace);
      for (const pressureWorkspace of pressureWorkspaces) {
        server.mindCache.close(pressureWorkspace);
        server.workspaceManager.delete(pressureWorkspace);
      }
      server.workspaceManager.delete(workspace);
    }
  });

  it.each(executeCases)('%s command cannot release a replacement cache generation', async (_label, url) => {
    const workspace = server.workspaceManager.create({
      name: `Command cache generation ${_label}`,
      group: 'Test',
    }).id;
    const pressureWorkspaces: string[] = [];
    let originalMind: MindDB | undefined;
    let replacementMind: MindDB | undefined;
    let announceRecallEntered!: () => void;
    let allowRecall!: () => void;
    const recallEntered = new Promise<void>(resolve => { announceRecallEntered = resolve; });
    const recallGate = new Promise<void>(resolve => { allowRecall = resolve; });
    const originalCreate = server.agentState.createSessionOrchestrator.bind(server.agentState);
    const createOrchestrator = vi.spyOn(server.agentState, 'createSessionOrchestrator')
      .mockImplementation((mind) => {
        originalMind = mind;
        const orchestrator = originalCreate(mind);
        vi.spyOn(orchestrator, 'recallMemory').mockImplementation(async () => {
          announceRecallEntered();
          await recallGate;
          return { text: 'old generation result', count: 1, recalled: ['old generation result'] };
        });
        return orchestrator;
      });
    let responsePromise: ReturnType<typeof injectWithAuth> | undefined;
    try {
      responsePromise = injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });
      await recallEntered;

      server.mindCache.close(workspace);
      expect(originalMind?.isOpen()).toBe(false);
      replacementMind = server.mindCache.acquire(workspace);
      expect(replacementMind).not.toBe(originalMind);

      allowRecall();
      const response = await responsePromise;
      expect(response.statusCode, response.body).toBe(200);

      for (let index = 0; index < 22; index += 1) {
        const pressureWorkspace = server.workspaceManager.create({
          name: `Command generation pressure ${_label} ${index}`,
          group: 'Test',
        }).id;
        pressureWorkspaces.push(pressureWorkspace);
        expect(server.agentState.getWorkspaceMindDb(pressureWorkspace)).not.toBeNull();
      }
      expect(replacementMind.isOpen()).toBe(true);
    } finally {
      allowRecall();
      if (responsePromise) await responsePromise.catch(() => undefined);
      createOrchestrator.mockRestore();
      server.mindCache.release(workspace);
      server.mindCache.close(workspace);
      for (const pressureWorkspace of pressureWorkspaces) {
        server.mindCache.close(pressureWorkspace);
        server.workspaceManager.delete(pressureWorkspace);
      }
      server.workspaceManager.delete(workspace);
    }
  });

  it.each(executeCases)('%s command releases its cache lease when orchestrator setup fails', async (_label, url) => {
    const workspace = server.workspaceManager.create({
      name: `Command setup failure ${_label}`,
      group: 'Test',
    }).id;
    const originalAcquireLease = server.mindCache.acquireLease.bind(server.mindCache);
    let releaseAttempts = 0;
    const acquireLease = vi.spyOn(server.mindCache, 'acquireLease')
      .mockImplementation((requestedWorkspace) => {
        const lease = originalAcquireLease(requestedWorkspace);
        if (requestedWorkspace !== workspace) return lease;
        return {
          db: lease.db,
          release: () => {
            releaseAttempts += 1;
            lease.release();
          },
        };
      });
    const createOrchestrator = vi.spyOn(server.agentState, 'createSessionOrchestrator')
      .mockImplementationOnce(() => { throw new Error('synthetic orchestrator setup failure'); });
    try {
      const response = await injectWithAuth(server, {
        method: 'POST',
        url,
        payload: executePayload(url, workspace),
      });

      expect(response.statusCode).toBe(500);
      expect(acquireLease.mock.calls.filter(([id]) => id === workspace)).toHaveLength(1);
      expect(releaseAttempts).toBe(1);
    } finally {
      createOrchestrator.mockRestore();
      acquireLease.mockRestore();
      server.mindCache.close(workspace);
      server.workspaceManager.delete(workspace);
    }
  });

  it('POST /api/commands/execute with /help returns markdown command list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/help' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/help');
    expect(body.result).toContain('Available Commands');
    expect(body.result).toContain('/catchup');
    expect(body.result).toContain('/memory');
    expect(body.result).toContain('/skills');
  });

  it('POST /api/commands/execute with /skills returns skill list', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/skills' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/skills');
    expect(body.result).toContain('Active Skills');
    // Server starts with loaded skills — at least the result should be well-formed
    expect(typeof body.result).toBe('string');
  });

  it('POST /api/commands/execute with /memory and query returns search results', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/memory architecture decisions' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/memory architecture decisions');
    expect(body.result).toContain('Memory Search');
    expect(body.result).toContain('architecture decisions');
  });

  it('POST /api/commands/execute with /catchup returns workspace state', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/catchup' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.command).toBe('/catchup');
    expect(body.result).toContain('Catch-Up Briefing');
  });

  it('POST /api/commands/execute with empty command returns 400', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toBe('command is required');
  });

  it('POST /api/commands/execute with /research (no runWorkflow) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/research quantum computing' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B2: Without runWorkflow, /research returns agent-loop reroute instruction
    expect(body.result).toContain('Research the following topic');
    expect(body.result).toContain('quantum computing');
  });

  it('POST /api/commands/execute with /decide (no runWorkflow) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/decide Should we use PostgreSQL or MongoDB?' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B7: Without runWorkflow, /decide returns agent-loop reroute instruction
    expect(body.result).toContain('decision');
    expect(body.result).toContain('PostgreSQL or MongoDB');
  });

  it('POST /api/commands/execute with unknown command returns error', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/nonexistent' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.result).toContain('Unknown command');
  });

  it('POST /api/commands/execute with /spawn (no spawnAgent) returns agent-loop reroute', async () => {
    const res = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/spawn researcher find papers' },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // B4: Without spawnAgent, /spawn returns agent-loop reroute instruction
    expect(body.result).toContain('specialist researcher');
  });

  it('POST /api/commands/execute persists and applies CLI allowlist changes', async () => {
    const allowRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/cli allow node' },
    });
    expect(allowRes.statusCode).toBe(200);
    expect(JSON.parse(allowRes.body).result).toContain('Allowed "node"');

    const listRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/cli' },
    });
    expect(JSON.parse(listRes.body).result).toContain('Allowed CLI tools: node');

    const denyRes = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/commands/execute',
      payload: { command: '/cli deny node' },
    });
    expect(JSON.parse(denyRes.body).result).toContain('Denied "node"');
  });
});
