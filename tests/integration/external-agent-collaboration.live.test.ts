import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { detectInstalledTools, runExternalTool } from '@waggle/agent';
import type { ToolManifest } from '@waggle/shared';
import { buildLocalServer } from '../../packages/server/src/local/index.js';
import { injectWithAuth } from '../../packages/server/tests/test-utils.js';

const LIVE = process.env.WAGGLE_LIVE_EXTERNAL_AGENTS === '1';
const describeLive = LIVE ? describe : describe.skip;

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
  let openClawBinary: string | undefined;

  beforeAll(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-live-collab-'));
    sourceWorkspaceDir = path.join(dataDir, 'source-workspace');
    synthesisWorkspaceDir = path.join(dataDir, 'synthesis-workspace');
    fs.mkdirSync(sourceWorkspaceDir, { recursive: true });
    fs.mkdirSync(synthesisWorkspaceDir, { recursive: true });
    fs.writeFileSync(
      path.join(sourceWorkspaceDir, 'FACTS.md'),
      '# Collaboration fixture\n\nAlpha code: HONEY-17\nBeta code: WAGGLE-42\n',
      'utf8',
    );
    server = await buildLocalServer({ dataDir });
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
    let cleanupError: unknown;
    if (openClawBinary && synthesisWorkspaceDir && synthesisWorkspaceId && fs.existsSync(synthesisWorkspaceDir)) {
      try {
        const agentId = openClawAgentId(synthesisWorkspaceId, fs.realpathSync(synthesisWorkspaceDir));
        const cleanupManifest: ToolManifest = {
          id: 'openclaw-cleanup', displayName: 'OpenClaw cleanup', launchable: false,
          hookCapable: false, hookPointer: '.openclaw/test-cleanup',
          detect: { kind: 'path', binaryName: 'openclaw' },
          capabilities: { interactiveLaunch: false, headlessTask: true, structuredProgress: true, resumable: false, liveWaggleDance: false },
          task: {
            argvTemplate: ['agents', 'delete', agentId, '--force', '--json'],
            accessArgs: { native: [] }, promptTransport: 'stdin', outputDialect: 'json',
            workspaceBinding: 'cwd', permissionModes: ['native'], resumable: false,
          },
        };
        const cleanup = await runExternalTool({
          manifest: cleanupManifest, binary: openClawBinary,
          workspaceId: synthesisWorkspaceId, workspacePath: synthesisWorkspaceDir,
          runId: 'live-cleanup', roomId: 'live-cleanup', prompt: '', access: 'native', timeoutMs: 30_000,
        });
        if (cleanup.status !== 'completed') {
          cleanupError = new Error(`OpenClaw live-test cleanup failed: ${cleanup.stderrTail || cleanup.summary}`);
        }
      } catch (err) {
        cleanupError = err;
      }
    }
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
    if (cleanupError) throw cleanupError;
  }, 30_000);

  it('delivers an asymmetric Hermes finding to OpenClaw through WaggleDance', async (context) => {
    const detection = await detectInstalledTools();
    const required = ['hermes', 'openclaw'];
    const unavailable = required.filter((id) => !detection.tools.some(
      (tool) => tool.id === id && tool.installed && tool.installedPath,
    ));
    if (unavailable.length > 0) {
      context.skip(`Missing live tools: ${unavailable.join(', ')}`);
      return;
    }
    openClawBinary = detection.tools.find((tool) => tool.id === 'openclaw')?.installedPath ?? undefined;
    expect(server.workspaceManager.get(sourceWorkspaceId)?.directory).toBe(sourceWorkspaceDir);
    expect(server.workspaceManager.get(synthesisWorkspaceId)?.directory).toBe(synthesisWorkspaceDir);

    const response = await injectWithAuth(server, {
      method: 'POST',
      url: '/api/tools/run',
      payload: {
        prompt: [
          'This is a read-only acceptance test. Do not modify any file.',
          'Look only in the assigned workspace for FACTS.md.',
          'If it exists, return one line: ALPHA=<alpha code> BETA=<beta code>.',
          'If it does not exist, return exactly NO_LOCAL_FACTS and never guess the codes.',
          'If peer findings are supplied in a later collaboration round, use those findings as the source of truth.',
        ].join(' '),
        participants: [
          { toolId: 'hermes', workspaceIds: [sourceWorkspaceId], access: 'native' },
          { toolId: 'openclaw', workspaceIds: [synthesisWorkspaceId], access: 'native' },
        ],
        timeoutMs: 180_000,
      },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json() as {
      roomId: string;
      runs: Array<{ runId: string; toolId: string; workspaceId: string }>;
    };
    expect(body.runs).toHaveLength(3);

    await waitFor(
      () => ['completed', 'failed', 'cancelled', 'interrupted'].includes(
        server.agentRunRegistry.get(body.roomId)?.status ?? '',
      ),
      210_000,
      'live external-agent Room did not settle',
    );

    const room = server.agentRunRegistry.get(body.roomId);
    const runs = body.runs.map(({ runId }) => server.agentRunRegistry.get(runId)!);
    const diagnostic = JSON.stringify({
      room: { status: room?.status, result: room?.result },
      runs: runs.map((run) => ({
        id: run.id, tool: run.executor.toolId, status: run.status,
        result: run.result, progress: run.progress, memoryRefs: run.memoryRefs,
      })),
    });
    expect(room?.status, diagnostic).toBe('completed');
    for (const run of runs) {
      expect(run.status, diagnostic).toBe('completed');
      expect(run.memoryRefs.status, diagnostic).toBe('complete');
      expect(run.memoryRefs.personalFrameIds?.length).toBeGreaterThan(0);
      expect(run.kind).toBe('worker');
      if (run.kind === 'worker') {
        expect(run.memoryRefs.workspaceFrameIds?.[run.workspaceId]?.length).toBeGreaterThan(0);
      }
    }
    const hermes = runs.find((run) => run.executor.toolId === 'hermes');
    const openClawFirstWave = runs.find((run) => run.executor.toolId === 'openclaw'
      && !run.title.startsWith('WaggleDance synthesis'));
    const synthesis = runs.find((run) => run.title.startsWith('WaggleDance synthesis'));
    expect(hermes?.result?.summary, diagnostic).toContain('ALPHA=HONEY-17 BETA=WAGGLE-42');
    expect(openClawFirstWave?.result?.summary, diagnostic).toContain('NO_LOCAL_FACTS');
    expect(openClawFirstWave?.result?.summary, diagnostic).not.toContain('HONEY-17');
    expect(synthesis?.kind).toBe('worker');
    if (synthesis?.kind === 'worker') expect(synthesis.workspaceId).toBe(synthesisWorkspaceId);
    expect(synthesis?.result?.summary, diagnostic).toContain('ALPHA=HONEY-17 BETA=WAGGLE-42');

    const roomSignals = server.signalBus?.query({ teamId: `room::${body.roomId}`, limit: 1_000 }) ?? [];
    const subtypes = roomSignals.map((message) => message.subtype);
    expect(subtypes).toEqual(expect.arrayContaining(['task_delegation', 'task_claim', 'routed_share', 'knowledge_match']));
    const peerDelivery = roomSignals.find((message) => message.subtype === 'knowledge_match');
    expect(peerDelivery?.content.peerFindings).toEqual(expect.arrayContaining([
      expect.stringContaining('ALPHA=HONEY-17 BETA=WAGGLE-42'),
    ]));
    expect(new Set(roomSignals.map((message) => message.content.runId))).toEqual(
      new Set(body.runs.map((run) => run.runId)),
    );
  }, 360_000);
});

function openClawAgentId(workspaceId: string, cwd: string): string {
  const digest = createHash('sha256').update(`${workspaceId}\0${cwd}`).digest('hex').slice(0, 8);
  const base = workspaceId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '').slice(0, 32) || 'workspace';
  return `waggle-${base}-${digest}`;
}
