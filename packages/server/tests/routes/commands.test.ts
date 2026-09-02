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

    server = await buildLocalServer({ dataDir: tmpDir });
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
