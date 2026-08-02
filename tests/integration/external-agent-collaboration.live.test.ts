import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { detectInstalledTools, getToolRegistry, runExternalTool } from '@waggle/agent';
import { FrameStore } from '@waggle/core';
import { AgentRunRegistry } from '../../packages/server/src/local/agent-run-registry.js';
import { buildLocalServer } from '../../packages/server/src/local/index.js';
import { injectWithAuth } from '../../packages/server/tests/test-utils.js';

const LIVE = process.env.WAGGLE_LIVE_EXTERNAL_AGENTS === '1';
const describeLive = LIVE ? describe : describe.skip;
const REQUIRED_TOOLS = ['claude-code', 'codex', 'hermes'] as const;

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
  message: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(message);
}

describeLive('live external-agent collaboration', () => {
  let server: FastifyInstance;
  let dataDir: string;
  let sourceWorkspaceDir: string;
  let sourceWorkspaceId: string;
  let synthesisWorkspaceDir: string;
  let synthesisWorkspaceId: string;
  let expectedCanaryLine: string;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-live-collab-'));
    sourceWorkspaceDir = path.join(dataDir, 'source-workspace');
    synthesisWorkspaceDir = path.join(dataDir, 'synthesis-workspace');
    fs.mkdirSync(sourceWorkspaceDir, { recursive: true });
    fs.mkdirSync(synthesisWorkspaceDir, { recursive: true });
    expectedCanaryLine = `CANARY=${randomBytes(24).toString('hex')}`;
    fs.writeFileSync(path.join(sourceWorkspaceDir, 'CANARY.txt'), `${expectedCanaryLine}\n`, 'utf8');
    fs.writeFileSync(path.join(synthesisWorkspaceDir, 'SENTINEL.txt'), 'workspace must remain unchanged\n', 'utf8');
    server = await buildLocalServer({ dataDir });
    const hermesProvider = process.env.WAGGLE_LIVE_HERMES_PROVIDER?.trim();
    const hermesModel = process.env.WAGGLE_LIVE_HERMES_MODEL?.trim();
    if (Boolean(hermesProvider) !== Boolean(hermesModel)) {
      throw new Error('Set both WAGGLE_LIVE_HERMES_PROVIDER and WAGGLE_LIVE_HERMES_MODEL');
    }
    server.decorate('externalToolRunner', (request) => {
      const task = request.manifest.task;
      if (request.manifest.id !== 'hermes' || !task || !hermesProvider || !hermesModel) {
        return runExternalTool(request);
      }
      const override = ['--provider', hermesProvider, '-m', hermesModel];
      return runExternalTool({
        ...request,
        manifest: {
          ...request.manifest,
          task: {
            ...task,
            argvTemplate: [...task.argvTemplate, ...override],
            ...(task.resumeArgvTemplate
              ? { resumeArgvTemplate: [...task.resumeArgvTemplate, ...override] }
              : {}),
          },
        },
      });
    });
    const sourceWorkspace = server.workspaceManager.create({
      name: 'Live Collaboration Source',
      group: 'live-test',
      directory: sourceWorkspaceDir,
    });
    const synthesisWorkspace = server.workspaceManager.create({
      name: 'Live Collaboration Synthesis',
      group: 'live-test',
      directory: synthesisWorkspaceDir,
    });
    sourceWorkspaceId = sourceWorkspace.id;
    synthesisWorkspaceId = synthesisWorkspace.id;
    await server.listen({ host: '127.0.0.1', port: 0 });
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (dataDir) {
      let lastError: unknown;
      let removed = false;
      for (let attempt = 0; attempt < 10; attempt++) {
        try {
          fs.rmSync(dataDir, { recursive: true, force: true });
          removed = true;
          break;
        } catch (err) {
          lastError = err;
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }
      if (!removed) throw lastError;
    }
  }, 90_000);

  it('runs the authenticated supported-agent cohort and delivers peer evidence through WaggleDance', async () => {
    const detection = await detectInstalledTools();
    const manifests = new Map(getToolRegistry().map((manifest) => [manifest.id, manifest]));
    const unavailable = REQUIRED_TOOLS.filter((id) => !detection.tools.some(
      (tool) => tool.id === id && tool.installed && tool.installedPath,
    ) || manifests.get(id)?.capabilities?.headlessTask !== true);
    expect(unavailable, `Missing authenticated headless tools: ${unavailable.join(', ')}`).toEqual([]);
    expect(server.workspaceManager.get(sourceWorkspaceId)?.directory).toBe(sourceWorkspaceDir);
    expect(server.workspaceManager.get(synthesisWorkspaceId)?.directory).toBe(synthesisWorkspaceDir);
    const sourceDigestBefore = workspaceDigest(sourceWorkspaceDir);
    const synthesisDigestBefore = workspaceDigest(synthesisWorkspaceDir);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/run',
      payload: {
        prompt: [
          'This is a read-only acceptance test. Do not modify any file.',
          'Look only in the assigned workspace for ./CANARY.txt.',
          'If it exists, copy its entire single line verbatim, including the literal CANARY= prefix, and do not add commentary.',
          'A source-file answer must start with the literal CANARY= prefix followed by exactly 48 lowercase hexadecimal characters.',
          'If it does not exist, return exactly NO_LOCAL_CANARY and never guess its content.',
          'If peer findings are supplied in a later collaboration round, copy the complete matching CANARY= line from those findings verbatim as the source of truth.',
        ].join(' '),
        participants: [
          { toolId: 'claude-code', workspaceIds: [sourceWorkspaceId], access: 'read-only' },
          { toolId: 'codex', workspaceIds: [sourceWorkspaceId], access: 'read-only' },
          { toolId: 'hermes', workspaceIds: [sourceWorkspaceId], access: 'native' },
          { toolId: 'hermes', workspaceIds: [synthesisWorkspaceId], access: 'native' },
        ],
        timeoutMs: 300_000,
      },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json() as {
      roomId: string;
      runs: Array<{ runId: string; toolId: string; workspaceId: string }>;
    };
    expect(body.runs).toHaveLength(5);

    await waitFor(
      () => {
        return [body.roomId, ...body.runs.map(({ runId }) => runId)].every((id) =>
          ['completed', 'failed', 'cancelled', 'interrupted'].includes(
            server.agentRunRegistry.get(id)?.status ?? '',
          ));
      },
      390_000,
      'live external-agent Room did not settle',
    );
    const terminalRoom = server.agentRunRegistry.get(body.roomId);
    const terminalRuns = body.runs.map(({ runId }) => server.agentRunRegistry.get(runId)!);
    if (terminalRoom?.status === 'completed' && terminalRuns.every((run) => run.status === 'completed')) {
      await waitFor(
        () => [body.roomId, ...body.runs.map(({ runId }) => runId)].every((id) =>
          server.agentRunRegistry.get(id)?.memoryRefs.status === 'complete'),
        30_000,
        'live external-agent memory receipts did not settle',
      );
    }

    const room = server.agentRunRegistry.get(body.roomId);
    const runs = body.runs.map(({ runId }) => server.agentRunRegistry.get(runId)!);
    const diagnostic = JSON.stringify({
      room: { status: room?.status, memoryStatus: room?.memoryRefs.status },
      versions: Object.fromEntries(detection.tools
        .filter((tool) => REQUIRED_TOOLS.includes(tool.id as typeof REQUIRED_TOOLS[number]))
        .map((tool) => [tool.id, tool.version ?? null])),
      runs: runs.map((run) => ({
        tool: run.executor.toolId, status: run.status, exitCode: run.result?.exitCode,
        memoryStatus: run.memoryRefs.status,
        error: run.result?.error,
        summary: run.result?.summary.slice(0, 500),
        summaryHash: hashText(run.result?.summary ?? ''),
      })),
    });
    expect(room?.status, diagnostic).toBe('completed');
    expect(room?.memoryRefs.status, diagnostic).toBe('complete');
    for (const run of runs) {
      expect(run.status, diagnostic).toBe('completed');
      expect(run.result?.exitCode, diagnostic).toBe(0);
      expect(run.memoryRefs.status, diagnostic).toBe('complete');
      expect(run.memoryRefs.personalFrameIds?.length).toBeGreaterThan(0);
      expect(run.kind).toBe('worker');
      if (run.kind === 'worker') {
        expect(run.memoryRefs.workspaceFrameIds?.[run.workspaceId]?.length).toBeGreaterThan(0);
      }
    }
    const claude = runs.find((run) => run.executor.toolId === 'claude-code');
    const codex = runs.find((run) => run.executor.toolId === 'codex');
    const hermes = runs.find((run) => run.executor.toolId === 'hermes'
      && run.workspaceId === sourceWorkspaceId
      && !run.title.startsWith('WaggleDance synthesis'));
    const hermesNoCanary = runs.find((run) => run.executor.toolId === 'hermes'
      && run.workspaceId === synthesisWorkspaceId
      && !run.title.startsWith('WaggleDance synthesis'));
    const synthesis = runs.find((run) => run.title.startsWith('WaggleDance synthesis'));
    for (const run of [claude, codex, hermes]) {
      expect(run?.result?.summary.trim(), diagnostic).toBe(expectedCanaryLine);
    }
    expect(hermesNoCanary?.result?.summary.trim(), diagnostic).toBe('NO_LOCAL_CANARY');
    expect(synthesis?.kind).toBe('worker');
    expect(synthesis?.executor.toolId).toBe('hermes');
    if (synthesis?.kind === 'worker') expect(synthesis.workspaceId).toBe(synthesisWorkspaceId);
    expect(synthesis?.result?.summary.trim(), diagnostic).toBe(expectedCanaryLine);

    expect(workspaceDigest(sourceWorkspaceDir)).toBe(sourceDigestBefore);
    expect(workspaceDigest(synthesisWorkspaceDir)).toBe(synthesisDigestBefore);

    const durableRegistry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    for (const id of [body.roomId, ...body.runs.map(({ runId }) => runId)]) {
      const durable = durableRegistry.get(id);
      expect(durable?.status, diagnostic).toBe('completed');
      expect(durable?.memoryRefs.status, diagnostic).toBe('complete');
      expect(durable?.memoryRefs, diagnostic).toEqual(server.agentRunRegistry.get(id)?.memoryRefs);
    }

    const personalFrames = new FrameStore(server.multiMind.personal);
    for (const run of runs) {
      const workspaceId = run.kind === 'worker' ? run.workspaceId : undefined;
      expect(Object.keys(run.memoryRefs.workspaceFrameIds), diagnostic).toEqual([workspaceId]);
      const personal = run.memoryRefs.personalFrameIds.map((id) => personalFrames.getById(id));
      let workspace = [] as ReturnType<FrameStore['getById']>[];
      if (workspaceId) {
        const workspaceMind = server.mindCache.acquire(workspaceId);
        try {
          const frames = new FrameStore(workspaceMind);
          workspace = run.memoryRefs.workspaceFrameIds[workspaceId].map((id) => frames.getById(id));
        } finally {
          server.mindCache.release(workspaceId);
        }
      }
      expect(personal.length, diagnostic).toBeGreaterThan(0);
      expect(workspace.length, diagnostic).toBeGreaterThan(0);
      for (const frame of [...personal, ...workspace]) {
        expect(frame, diagnostic).toBeDefined();
        const metadata = JSON.parse(frame?.metadata ?? '{}') as Record<string, unknown>;
        expect(metadata).toMatchObject({
          runId: run.id,
          roomId: run.roomId,
          workspaceId: run.kind === 'worker' ? run.workspaceId : undefined,
          toolId: run.executor.toolId,
        });
        expect(frame?.content.includes(run.id), diagnostic).toBe(true);
        for (const forbiddenPath of [dataDir, sourceWorkspaceDir, synthesisWorkspaceDir]) {
          expect(frame?.content.includes(forbiddenPath), diagnostic).toBe(false);
          expect(JSON.stringify(metadata).includes(forbiddenPath), diagnostic).toBe(false);
        }
      }
      const expectedSummary = run.result?.summary.trim() ?? '';
      expect(personal.some((frame) => frame?.content.includes(expectedSummary)), diagnostic).toBe(true);
      expect(workspace.some((frame) => frame?.content.includes(expectedSummary)), diagnostic).toBe(true);
    }
    expect(new Set(room?.memoryRefs.personalFrameIds)).toEqual(
      new Set(runs.flatMap((run) => run.memoryRefs.personalFrameIds)),
    );
    expect(room?.memoryRefs.workspaceFrameIds).toEqual(Object.fromEntries(
      [...new Set(runs.map((run) => run.workspaceId))].map((workspaceId) => [
        workspaceId,
        [...new Set(runs.flatMap((run) => run.memoryRefs.workspaceFrameIds[workspaceId] ?? []))],
      ]),
    ));

    const roomSignals = server.signalBus?.query({ teamId: `room::${body.roomId}`, limit: 1_000 }) ?? [];
    const subtypes = roomSignals.map((message) => message.subtype);
    expect(subtypes).toEqual(expect.arrayContaining(['task_delegation', 'task_claim', 'routed_share', 'knowledge_match']));
    for (const run of runs) {
      const delegation = roomSignals.find((message) =>
        message.subtype === 'task_delegation' && message.content.runId === run.id);
      const claim = roomSignals.find((message) =>
        message.subtype === 'task_claim' && message.content.runId === run.id);
      const share = roomSignals.find((message) =>
        message.subtype === 'routed_share' && message.content.runId === run.id
          && message.content.phase === 'completed');
      expect(delegation, diagnostic).toBeDefined();
      expect(claim?.referenceId, diagnostic).toBe(delegation?.id);
      expect(share?.referenceId, diagnostic).toBe(delegation?.id);
    }
    const synthesisDelegation = roomSignals.find((message) =>
      message.subtype === 'task_delegation' && message.content.runId === synthesis?.id);
    const peerDelivery = roomSignals.find((message) =>
      message.subtype === 'knowledge_match' && message.content.runId === synthesis?.id);
    expect(peerDelivery?.referenceId, diagnostic).toBe(synthesisDelegation?.id);
    expect(peerDelivery?.content.tool, diagnostic).toBe('hermes');
    expect(peerDelivery?.content.peerFindings).toEqual(expect.arrayContaining([
      expect.stringContaining(expectedCanaryLine),
      expect.stringContaining('NO_LOCAL_CANARY'),
    ]));
    const initialRunIds = new Set(runs.filter((run) => run.id !== synthesis?.id).map((run) => run.id));
    const expectedSourceMessageIds = new Set(roomSignals.filter((message) =>
      message.subtype === 'routed_share'
        && initialRunIds.has(String(message.content.runId))
        && message.content.phase === 'completed').map((message) => message.id));
    expect(new Set(peerDelivery?.content.sourceMessageIds as string[] | undefined)).toEqual(expectedSourceMessageIds);
    expect(new Set(synthesisDelegation?.content.sourceRunIds as string[] | undefined)).toEqual(initialRunIds);
    const peerFindings = peerDelivery?.content.peerFindings as string[] | undefined;
    expect(peerFindings, diagnostic).toHaveLength(initialRunIds.size);
    for (const runId of initialRunIds) {
      expect(peerFindings?.filter((finding) => finding.includes(`· run ${runId}]`)), diagnostic).toHaveLength(1);
    }
    expect(new Set(roomSignals.map((message) => message.content.runId))).toEqual(
      new Set(body.runs.map((run) => run.runId)),
    );
  }, 600_000);
});

function hashText(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function workspaceDigest(root: string): string {
  const hash = createHash('sha256');
  const visit = (directory: string, relativeDirectory: string): void => {
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relative = path.join(relativeDirectory, entry.name).replaceAll('\\', '/');
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        hash.update(`D\0${relative}\0`);
        visit(absolute, relative);
      } else if (entry.isFile()) {
        hash.update(`F\0${relative}\0`);
        hash.update(fs.readFileSync(absolute));
        hash.update('\0');
      } else if (entry.isSymbolicLink()) {
        hash.update(`L\0${relative}\0${fs.readlinkSync(absolute)}\0`);
      } else {
        hash.update(`X\0${relative}\0`);
      }
    }
  };
  visit(root, '');
  return hash.digest('hex');
}
