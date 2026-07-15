import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ExternalRunEvent, ExternalToolRunResult } from '@waggle/agent';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { SignalBus } from '../../src/local/signal-bus.js';
import { externalToolRunRoutes } from '../../src/local/routes/external-tool-runs.js';
import { resolveWorkspaceExecutionRoot } from '../../src/local/workspace-execution-root.js';

const tempDirs: string[] = [];
const collaborationRuntime = {
  nodePath: 'C:\\Waggle Runtime\\node.exe',
  cliEntry: 'C:\\Waggle Runtime\\node_modules\\@waggle\\hive-mind-cli\\dist\\index.js',
};

function tempDir(name = 'waggle-external-runs-'): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), name));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

async function waitFor(
  predicate: () => boolean,
  message: string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(message);
}

describe('resolveWorkspaceExecutionRoot', () => {
  it('uses a configured trusted directory and creates the managed fallback', () => {
    const dataDir = tempDir();
    const linked = path.join(dataDir, 'linked');
    fs.mkdirSync(linked);
    expect(resolveWorkspaceExecutionRoot(dataDir, {
      id: 'linked-workspace', name: 'Linked', group: 'test', created: new Date().toISOString(), directory: linked,
    })).toBe(fs.realpathSync(linked));

    const managed = resolveWorkspaceExecutionRoot(dataDir, {
      id: 'managed-workspace', name: 'Managed', group: 'test', created: new Date().toISOString(),
    });
    expect(managed).toBe(fs.realpathSync(path.join(dataDir, 'workspaces', 'managed-workspace', 'files')));
    expect(fs.statSync(managed).isDirectory()).toBe(true);
  });

  it('fails closed when a configured workspace root is missing', () => {
    const dataDir = tempDir();
    expect(() => resolveWorkspaceExecutionRoot(dataDir, {
      id: 'broken', name: 'Broken', group: 'test', created: new Date().toISOString(),
      directory: path.join(dataDir, 'does-not-exist'),
    })).toThrow(/does not exist/);
  });
});

describe('external tool run routes', () => {
  it('fans out into isolated workspace runs and delivers results to Room, Dance, and memory', async () => {
    const dataDir = tempDir();
    const alphaDir = path.join(dataDir, 'alpha-files');
    const betaDir = path.join(dataDir, 'beta-files');
    fs.mkdirSync(alphaDir);
    fs.mkdirSync(betaDir);
    const registryPath = path.join(dataDir, 'agent-runs.json');
    const registry = new AgentRunRegistry(registryPath);
    const bus = new SignalBus();
    const attribution = {
      routeDecisionId: '6b7df0df-e082-4c99-bd11-55d5ac4ba403',
      briefHash: 'a'.repeat(64),
    };
    const calls: Array<{
      workspaceId: string;
      workspacePath: string;
      binary: string;
      prompt: string;
      danceUrl?: string;
      runToken?: string;
      nodePath?: string;
      cliEntry?: string;
      dataDir?: string;
      credentialWasActive: boolean;
    }> = [];
    const memoryRuns: Array<{ id: string; attribution?: typeof attribution }> = [];
    const healthyExecutorIds: string[] = [];
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('workspaceManager', {
      get: (id: string) => ({
        alpha: { id: 'alpha', name: 'Alpha', group: 'test', created: new Date().toISOString(), directory: alphaDir },
        beta: { id: 'beta', name: 'Beta', group: 'test', created: new Date().toISOString(), directory: betaDir },
      } as Record<string, unknown>)[id],
    } as never);
    server.decorate('agentRunRegistry', registry);
    server.decorate('signalBus', bus);
    server.decorate('externalCollaborationRuntime', collaborationRuntime);
    server.decorate('executorRegistry', {
      snapshot: async () => [],
      noteHealthy: (executorId: string) => healthyExecutorIds.push(executorId),
      noteRateLimit: () => undefined,
    } as never);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32', detectedAt: new Date().toISOString(),
      tools: [{ id: 'codex', displayName: 'Codex CLI', installed: true, installedPath: 'C:\\trusted\\codex.cmd', version: 'test', hooksInstalled: true, hookPointerPath: null }],
    }));
    server.decorate('externalToolRunner', async (request) => {
      calls.push({
        workspaceId: request.workspaceId,
        workspacePath: request.workspacePath,
        binary: request.binary,
        prompt: request.prompt,
        danceUrl: request.dance?.url,
        runToken: request.dance?.token,
        nodePath: request.dance?.nodePath,
        cliEntry: request.dance?.cliEntry,
        dataDir: request.dataDir,
        credentialWasActive: Boolean(
          request.dance?.token && registry.authenticateCredential(request.dance.token)?.id === request.runId,
        ),
      });
      request.onEvent?.({
        runId: request.runId, roomId: request.roomId, workspaceId: request.workspaceId,
        toolId: request.manifest.id, seq: 1, type: 'started', timestamp: new Date().toISOString(), pid: calls.length + 100,
      });
      request.onEvent?.({
        runId: request.runId, roomId: request.roomId, workspaceId: request.workspaceId,
        toolId: request.manifest.id, seq: 2, type: 'progress', timestamp: new Date().toISOString(), text: `Working in ${request.workspaceId}`,
      });
      return {
        status: 'completed', exitCode: 0, summary: `Result for ${request.workspaceId}`,
        sessionId: `session-${request.workspaceId}`, stdoutTail: '', stderrTail: '', durationMs: 10,
      };
    });
    server.decorate('externalResultRecorder', async ({ run }) => {
      memoryRuns.push({ id: run.id, attribution: run.attribution });
      return { status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] } };
    });
    await server.register(externalToolRunRoutes);

    const response = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: {
        toolId: 'codex', workspaceIds: ['alpha', 'beta'], prompt: 'Inspect both workspaces',
        access: 'read-only', installedPath: 'C:\\attacker\\fake.exe', cwd: 'C:\\attacker',
        attribution,
      },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json() as { roomId: string; runs: Array<{ runId: string; workspaceId: string }> };
    await waitFor(
      () => body.runs.every(({ runId }) => registry.get(runId)?.memoryRefs.status === 'complete'),
      'external runs did not finish',
    );

    expect(calls).toHaveLength(2);
    expect(new Set(calls.map((call) => call.workspacePath))).toEqual(new Set([fs.realpathSync(alphaDir), fs.realpathSync(betaDir)]));
    expect(calls.every((call) => call.binary === 'C:\\trusted\\codex.cmd')).toBe(true);
    expect(calls.every((call) => call.credentialWasActive)).toBe(true);
    expect(calls.every((call) => call.danceUrl?.startsWith('http://127.0.0.1:'))).toBe(true);
    expect(calls.every((call) => call.nodePath === collaborationRuntime.nodePath)).toBe(true);
    expect(calls.every((call) => call.cliEntry === collaborationRuntime.cliEntry)).toBe(true);
    expect(calls.every((call) => call.dataDir === dataDir)).toBe(true);
    expect(calls.every((call) => call.prompt.includes('Inspect both workspaces'))).toBe(true);
    expect(calls.every((call) => call.prompt.includes(JSON.stringify(call.workspacePath)))).toBe(true);
    expect(calls.every((call) => call.prompt.includes('Resolve every relative task path from that root'))).toBe(true);
    expect(calls.every((call) => call.prompt.includes('host-managed relays'))).toBe(true);
    expect(calls.every((call) => call.prompt.includes('Do not inspect WAGGLE_* variables'))).toBe(true);
    expect(calls.every((call) => !call.prompt.includes("'dance' 'receive' '--json'"))).toBe(true);
    expect(calls.every((call) => !registry.authenticateCredential(call.runToken ?? ''))).toBe(true);
    expect(memoryRuns).toHaveLength(2);
    expect(memoryRuns).toEqual(expect.arrayContaining(
      body.runs.map(({ runId }) => ({ id: runId, attribution })),
    ));
    expect(healthyExecutorIds).toEqual(['codex', 'codex']);
    const durableRegistry = new AgentRunRegistry(registryPath);
    expect(durableRegistry.get(body.roomId)).toMatchObject({ status: 'completed', attribution });
    for (const { runId, workspaceId } of body.runs) {
      expect(durableRegistry.get(runId)).toMatchObject({
        kind: 'worker', workspaceId, status: 'completed',
        attribution,
        result: { summary: `Result for ${workspaceId}`, sessionId: `session-${workspaceId}` },
        memoryRefs: { status: 'complete' },
      });
    }
    const subtypes = bus.query().map((message) => message.subtype);
    expect(subtypes).toEqual(expect.arrayContaining(['task_delegation', 'task_claim', 'discovery', 'routed_share']));
    await server.close();
  });

  it('launches different external tools as peers in one canonical Room', async () => {
    const dataDir = tempDir();
    const workspaceDir = path.join(dataDir, 'shared-files');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const calls: Array<{ toolId: string; runId: string; roomId: string; token?: string; prompt: string }> = [];
    const bus = new SignalBus();
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('workspaceManager', {
      get: (id: string) => id === 'shared'
        ? { id, name: 'Shared', group: 'test', created: new Date().toISOString(), directory: workspaceDir }
        : undefined,
    } as never);
    server.decorate('agentRunRegistry', registry);
    server.decorate('signalBus', bus);
    server.decorate('externalCollaborationRuntime', collaborationRuntime);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32', detectedAt: new Date().toISOString(),
      tools: [
        { id: 'claude-code', displayName: 'Claude Code', installed: true, installedPath: 'claude.exe', version: 'test', hooksInstalled: true, hookPointerPath: null },
        { id: 'codex', displayName: 'Codex CLI', installed: true, installedPath: 'codex.exe', version: 'test', hooksInstalled: true, hookPointerPath: null },
      ],
    }));
    server.decorate('externalToolRunner', async (request) => {
      calls.push({
        toolId: request.manifest.id,
        runId: request.runId,
        roomId: request.roomId,
        token: request.dance?.token,
        prompt: request.prompt,
      });
      request.onEvent?.({
        runId: request.runId, roomId: request.roomId, workspaceId: request.workspaceId,
        toolId: request.manifest.id, seq: 1, type: 'started', timestamp: new Date().toISOString(),
      });
      if (request.manifest.id === 'codex') {
        return {
          status: 'failed', exitCode: 1, summary: 'Provider quota exhausted',
          stdoutTail: '', stderrTail: '', durationMs: 5,
        };
      }
      if (request.prompt.includes('Peer findings delivered through WaggleDance')) {
        return {
          status: 'completed', exitCode: 0, summary: 'Synthesis used HONEY-17',
          stdoutTail: '', stderrTail: '', durationMs: 5,
        };
      }
      return {
        status: 'completed', exitCode: 0, summary: `${request.manifest.displayName} found HONEY-17`,
        stdoutTail: '', stderrTail: '', durationMs: 5,
      };
    });
    server.decorate('externalResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [1], workspaceFrameIds: { [run.workspaceId]: [2] },
    }));
    await server.register(externalToolRunRoutes);

    const response = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: {
        workspaceIds: ['shared'],
        prompt: 'Review together and exchange findings',
        participants: [
          { toolId: 'claude-code', access: 'read-only' },
          { toolId: 'codex', access: 'workspace-write' },
        ],
      },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json() as {
      roomId: string;
      runs: Array<{ runId: string; toolId: string; workspaceId: string }>;
    };
    await waitFor(
      () => body.runs.every(({ runId }) => registry.get(runId)?.memoryRefs.status === 'complete'),
      'multi-tool Room did not finish',
    );

    expect(body.runs).toHaveLength(3);
    expect(new Set(body.runs.map((run) => run.toolId))).toEqual(new Set(['claude-code', 'codex']));
    expect(new Set(calls.map((call) => call.roomId))).toEqual(new Set([body.roomId]));
    expect(registry.get(body.roomId)).toMatchObject({
      kind: 'room', status: 'completed', workspaceIds: ['shared'],
      result: { summary: 'Synthesis used HONEY-17' },
      memoryRefs: { status: 'complete' },
    });
    const codexRun = body.runs.find((run) => run.toolId === 'codex');
    expect(registry.get(codexRun!.runId)).toMatchObject({
      status: 'failed',
      result: { summary: 'Provider quota exhausted', error: 'Provider quota exhausted' },
    });
    const synthesisCall = calls.find((call) => call.prompt.includes('Peer findings delivered through WaggleDance'));
    expect(synthesisCall?.prompt).toContain('Claude Code found HONEY-17');
    const subtypes = bus.query({ teamId: `room::${body.roomId}` }).map((message) => message.subtype);
    expect(subtypes).toEqual(expect.arrayContaining(['routed_share', 'knowledge_match']));
    expect(calls.every((call) => !registry.authenticateCredential(call.token ?? ''))).toBe(true);
    await server.close();
  });

  it('feeds parsed external rate limits into the executor registry', async () => {
    const nowMs = Date.UTC(2026, 6, 15, 12, 0, 0);
    vi.spyOn(Date, 'now').mockReturnValue(nowMs);
    const dataDir = tempDir();
    const workspaceDir = path.join(dataDir, 'alpha-files');
    fs.mkdirSync(workspaceDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const rateLimitCalls: Array<{ executorId: string; resumeAtMs: number | null }> = [];
    const healthyExecutorIds: string[] = [];
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('workspaceManager', {
      get: (id: string) => id === 'alpha'
        ? { id, name: 'Alpha', group: 'test', created: new Date().toISOString(), directory: workspaceDir }
        : undefined,
    } as never);
    server.decorate('agentRunRegistry', registry);
    server.decorate('externalCollaborationRuntime', collaborationRuntime);
    server.decorate('executorRegistry', {
      snapshot: async () => [],
      noteHealthy: (executorId: string) => healthyExecutorIds.push(executorId),
      noteRateLimit: (executorId: string, resumeAtMs: number | null) => {
        rateLimitCalls.push({ executorId, resumeAtMs });
      },
    } as never);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32', detectedAt: new Date().toISOString(),
      tools: [{ id: 'codex', displayName: 'Codex CLI', installed: true, installedPath: 'codex.cmd', version: 'test', hooksInstalled: false, hookPointerPath: null }],
    }));
    server.decorate('externalToolRunner', async () => ({
      status: 'failed', exitCode: 1, summary: 'Request failed', stdoutTail: '',
      stderrTail: '429 rate limit exceeded\nRetry-After: 120', durationMs: 5,
    }));
    server.decorate('externalResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [], workspaceFrameIds: { [run.workspaceId]: [] },
    }));
    await server.register(externalToolRunRoutes);

    const response = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: { toolId: 'codex', workspaceIds: ['alpha'], prompt: 'Try the provider' },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json() as { runs: Array<{ runId: string }> };
    await waitFor(
      () => registry.get(body.runs[0].runId)?.memoryRefs.status === 'complete',
      'failed external run did not finish',
    );

    expect(registry.get(body.runs[0].runId)?.status).toBe('failed');
    expect(rateLimitCalls).toEqual([{ executorId: 'codex', resumeAtMs: nowMs + 120_000 }]);
    expect(healthyExecutorIds).toEqual([]);
    await server.close();
  });

  it('tracks stall recovery while cancelling one live run without aborting its sibling', async () => {
    const dataDir = tempDir();
    for (const id of ['alpha', 'beta']) fs.mkdirSync(path.join(dataDir, id));
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const pending = new Map<string, (result: ExternalToolRunResult) => void>();
    const emitEvents = new Map<string, (event: ExternalRunEvent) => void>();
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('workspaceManager', {
      get: (id: string) => ['alpha', 'beta'].includes(id)
        ? { id, name: id, group: 'test', created: new Date().toISOString(), directory: path.join(dataDir, id) }
        : undefined,
    } as never);
    server.decorate('agentRunRegistry', registry);
    server.decorate('externalCollaborationRuntime', collaborationRuntime);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32', detectedAt: new Date().toISOString(),
      tools: [{ id: 'codex', displayName: 'Codex CLI', installed: true, installedPath: 'codex.cmd', version: 'test', hooksInstalled: false, hookPointerPath: null }],
    }));
    server.decorate('externalToolRunner', (request) => new Promise<ExternalToolRunResult>((resolve) => {
      request.onEvent?.({
        runId: request.runId, roomId: request.roomId, workspaceId: request.workspaceId,
        toolId: 'codex', seq: 1, type: 'started', timestamp: new Date().toISOString(), pid: 200,
      });
      if (request.onEvent) emitEvents.set(request.workspaceId, request.onEvent);
      pending.set(request.workspaceId, resolve);
      request.signal?.addEventListener('abort', () => resolve({
        status: 'cancelled', exitCode: null, summary: 'Cancelled', stdoutTail: '', stderrTail: '', durationMs: 1,
      }), { once: true });
    }));
    server.decorate('externalResultRecorder', async ({ run }) => ({
      status: 'complete', personalFrameIds: [], workspaceFrameIds: { [run.workspaceId]: [] },
    }));
    await server.register(externalToolRunRoutes);

    const response = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: { toolId: 'codex', workspaceIds: ['alpha', 'beta'], prompt: 'Wait', access: 'read-only' },
    });
    const body = response.json() as { roomId: string; runs: Array<{ runId: string; workspaceId: string }> };
    await waitFor(() => pending.size === 2, 'workers did not start concurrently');
    const alpha = body.runs.find((run) => run.workspaceId === 'alpha')!;
    const beta = body.runs.find((run) => run.workspaceId === 'beta')!;

    const event = {
      runId: beta.runId, roomId: body.roomId, workspaceId: 'beta', toolId: 'codex',
      type: 'progress' as const, timestamp: new Date().toISOString(),
    };
    emitEvents.get('beta')!({ ...event, seq: 2, text: '[stalled] no output for 120s', stalled: true });
    expect(registry.get(beta.runId)).toMatchObject({
      status: 'running', progress: { message: '[stalled] no output for 120s', phase: 'stalled' },
    });
    emitEvents.get('beta')!({ ...event, seq: 3, text: '[recovered] output resumed', stalled: false });
    expect(registry.get(beta.runId)).toMatchObject({
      status: 'running', progress: { message: '[recovered] output resumed', phase: 'running' },
    });

    await registry.control(alpha.runId, 'cancel');
    expect(registry.get(alpha.runId)?.status).toBe('cancelled');
    expect(registry.get(beta.runId)?.status).toBe('running');
    pending.get('beta')!({
      status: 'completed', exitCode: 0, summary: 'Beta done', stdoutTail: '', stderrTail: '', durationMs: 2,
    });
    await waitFor(() => registry.get(beta.runId)?.status === 'completed', 'beta did not complete');
    expect(registry.get(beta.runId)?.result?.summary).toBe('Beta done');
    await server.close();
  });

  it('returns explicit errors for unknown workspaces and broken configured roots', async () => {
    const dataDir = tempDir();
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const server = Fastify({ logger: false });
    server.decorate('localConfig', { dataDir, port: 0, host: '127.0.0.1', litellmUrl: '' });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', {
      get: (id: string) => id === 'broken'
        ? {
            id, name: 'Broken', group: 'test', created: new Date().toISOString(),
            directory: path.join(dataDir, 'missing-root'),
          }
        : undefined,
    } as never);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32', detectedAt: new Date().toISOString(),
      tools: [{
        id: 'codex', displayName: 'Codex CLI', installed: true, installedPath: 'codex.cmd',
        version: 'test', hooksInstalled: false, hookPointerPath: null,
      }],
    }));
    server.decorate('externalToolRunner', async () => {
      throw new Error('runner must not start for an invalid workspace');
    });
    await server.register(externalToolRunRoutes);

    const missing = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: { toolId: 'codex', workspaceIds: ['unknown'], prompt: 'Do work' },
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: 'workspace_not_found' });

    const broken = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: { toolId: 'codex', workspaceIds: ['broken'], prompt: 'Do work' },
    });
    expect(broken.statusCode).toBe(409);
    expect(broken.json()).toMatchObject({ error: 'workspace_root_invalid', workspaceId: 'broken' });
    expect(registry.snapshot().runs).toHaveLength(0);
    await server.close();
  });

  it('rejects GUI-only tools with an explicit task-capability error', async () => {
    const dataDir = tempDir();
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const server = Fastify({ logger: false });
    server.decorate('agentRunRegistry', registry);
    await server.register(externalToolRunRoutes);
    const response = await server.inject({
      method: 'POST', url: '/api/tools/run',
      payload: { toolId: 'cursor', workspaceIds: ['alpha'], prompt: 'Do work' },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('TOOL_NOT_HEADLESS');
    await server.close();
  });
});
