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
const REQUIRED_TOOLS = ['claude-code', 'codex', 'hermes', 'openclaw'] as const;

interface FileSnapshot {
  exists: boolean;
  bytes?: Buffer;
  mtimeMs?: number;
}

interface DirectorySnapshot {
  exists: boolean;
  digest?: string;
  mtimeMs?: number;
}

interface OpenClawProfileEvidence {
  root: string;
  marker: {
    profileName: string;
    runId: string;
    workspaceId: string;
    workspacePath: string;
  };
  config: Record<string, unknown>;
}

interface OpenClawRequestEvidence {
  model: string | null;
  messageCount: number;
  toolNames: string[];
  hasPeerFindings: boolean;
  hasLaterRoundCondition: boolean;
  hasCanaryEvidence: boolean;
}

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
  let openClawHome: string;
  let openClawDefaultFilesBefore = new Map<string, FileSnapshot>();
  let openClawDefaultAgentsBefore: DirectorySnapshot;
  let openClawInvocationArtifactsBefore: string[] = [];
  let openClawProfilesBefore: string[] = [];
  let observedOpenClawModels: string[] = [];
  let observedOpenClawRequests: OpenClawRequestEvidence[] = [];
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
    observedOpenClawModels = [];
    observedOpenClawRequests = [];
    server.addHook('preHandler', async (request) => {
      if (request.method !== 'POST' || request.url !== '/v1/chat/completions') return;
      const body = request.body as { model?: unknown; messages?: unknown; tools?: unknown } | undefined;
      const model = body?.model;
      if (typeof model === 'string') observedOpenClawModels.push(model);
      const messages = Array.isArray(body?.messages) ? body.messages : [];
      const tools = Array.isArray(body?.tools) ? body.tools : [];
      const toolNames = tools.flatMap((tool) => {
        if (!tool || typeof tool !== 'object') return [];
        const definition = (tool as { function?: unknown }).function;
        if (!definition || typeof definition !== 'object') return [];
        const name = (definition as { name?: unknown }).name;
        return typeof name === 'string' ? [name] : [];
      });
      const serializedMessages = JSON.stringify(messages);
      observedOpenClawRequests.push({
        model: typeof model === 'string' ? model : null,
        messageCount: messages.length,
        toolNames,
        hasPeerFindings: serializedMessages.includes('Peer findings delivered through WaggleDance'),
        hasLaterRoundCondition: serializedMessages.includes('later-round condition is active'),
        hasCanaryEvidence: serializedMessages.includes(expectedCanaryLine),
      });
    });
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
    openClawHome = requireOpenClawHome();
    openClawDefaultFilesBefore = snapshotOpenClawDefaultFiles(openClawHome);
    openClawDefaultAgentsBefore = snapshotDirectory(path.join(openClawHome, '.openclaw', 'agents'));
    openClawInvocationArtifactsBefore = openClawInvocationArtifacts(openClawHome);
    openClawProfilesBefore = openClawProfileRoots(openClawHome);
  }, 120_000);

  afterAll(async () => {
    if (server) await server.close();
    if (openClawHome) {
      expect(snapshotOpenClawDefaultFiles(openClawHome)).toEqual(openClawDefaultFilesBefore);
      expect(snapshotDirectory(path.join(openClawHome, '.openclaw', 'agents'))).toEqual(openClawDefaultAgentsBefore);
      expect(openClawInvocationArtifacts(openClawHome)).toEqual(openClawInvocationArtifactsBefore);
      expect(openClawProfileRoots(openClawHome)).toEqual(openClawProfilesBefore);
    }
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

  it('runs the authenticated four-tool cohort and delivers peer evidence through WaggleDance', async () => {
    const detection = await detectInstalledTools();
    const manifests = new Map(getToolRegistry().map((manifest) => [manifest.id, manifest]));
    const unavailable = REQUIRED_TOOLS.filter((id) => !detection.tools.some(
      (tool) => tool.id === id && tool.installed && tool.installedPath,
    ) || manifests.get(id)?.capabilities?.headlessTask !== true);
    expect(unavailable, `Missing authenticated headless tools: ${unavailable.join(', ')}`).toEqual([]);
    expect(server.workspaceManager.get(sourceWorkspaceId)?.directory).toBe(sourceWorkspaceDir);
    expect(server.workspaceManager.get(synthesisWorkspaceId)?.directory).toBe(synthesisWorkspaceDir);
    const observedOpenClawProfiles = new Map<string, OpenClawProfileEvidence>();
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
          { toolId: 'openclaw', workspaceIds: [synthesisWorkspaceId], access: 'native' },
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
        captureOpenClawProfiles(openClawHome, observedOpenClawProfiles, openClawProfilesBefore);
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
    captureOpenClawProfiles(openClawHome, observedOpenClawProfiles, openClawProfilesBefore);
    const diagnostic = JSON.stringify({
      room: { status: room?.status, memoryStatus: room?.memoryRefs.status },
      versions: Object.fromEntries(detection.tools
        .filter((tool) => REQUIRED_TOOLS.includes(tool.id as typeof REQUIRED_TOOLS[number]))
        .map((tool) => [tool.id, tool.version ?? null])),
      observedOpenClawProfiles: [...observedOpenClawProfiles.keys()],
      observedOpenClawModels,
      observedOpenClawRequests,
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
    const hermes = runs.find((run) => run.executor.toolId === 'hermes');
    const openClawFirstWave = runs.find((run) => run.executor.toolId === 'openclaw'
      && !run.title.startsWith('WaggleDance synthesis'));
    const synthesis = runs.find((run) => run.title.startsWith('WaggleDance synthesis'));
    for (const run of [claude, codex, hermes]) {
      expect(run?.result?.summary.trim(), diagnostic).toBe(expectedCanaryLine);
    }
    expect(openClawFirstWave?.result?.summary.trim(), diagnostic).toBe('NO_LOCAL_CANARY');
    expect(synthesis?.kind).toBe('worker');
    expect(synthesis?.executor.toolId).toBe('openclaw');
    if (synthesis?.kind === 'worker') expect(synthesis.workspaceId).toBe(synthesisWorkspaceId);
    expect(synthesis?.result?.summary.trim(), diagnostic).toBe(expectedCanaryLine);
    const firstWaveRequests = observedOpenClawRequests.filter((evidence) => !evidence.hasPeerFindings);
    const synthesisRequests = observedOpenClawRequests.filter((evidence) => evidence.hasPeerFindings);
    expect(firstWaveRequests.length, diagnostic).toBeGreaterThan(0);
    expect(firstWaveRequests.every((evidence) => !evidence.hasLaterRoundCondition), diagnostic).toBe(true);
    expect(synthesisRequests.length, diagnostic).toBeGreaterThan(0);
    expect(synthesisRequests.every((evidence) =>
      evidence.hasLaterRoundCondition && evidence.hasCanaryEvidence), diagnostic).toBe(true);
    expect([...new Set(synthesisRequests.flatMap((evidence) => evidence.toolNames))], diagnostic)
      .toEqual(['session_status']);

    const expectedOpenClawRunIds = new Set(
      [openClawFirstWave?.id, synthesis?.id].filter((id): id is string => typeof id === 'string'),
    );
    expect(observedOpenClawProfiles.size, diagnostic).toBe(2);
    expect(new Set([...observedOpenClawProfiles.values()].map((evidence) => evidence.marker.runId)), diagnostic)
      .toEqual(expectedOpenClawRunIds);
    const address = server.server.address();
    expect(address && typeof address === 'object', diagnostic).toBe(true);
    const port = address && typeof address === 'object' ? address.port : server.localConfig.port;
    for (const evidence of observedOpenClawProfiles.values()) {
      assertOpenClawProfileEvidence(evidence, {
        expectedBaseUrl: `http://127.0.0.1:${port}/v1`,
        expectedWorkspaceId: synthesisWorkspaceId,
        expectedWorkspacePath: fs.realpathSync(synthesisWorkspaceDir),
        expectedToolProfile: evidence.marker.runId === synthesis?.id ? 'minimal' : 'coding',
      });
    }

    expect(workspaceDigest(sourceWorkspaceDir)).toBe(sourceDigestBefore);
    expect(workspaceDigest(synthesisWorkspaceDir)).toBe(synthesisDigestBefore);
    expect(snapshotOpenClawDefaultFiles(openClawHome)).toEqual(openClawDefaultFilesBefore);
    expect(snapshotDirectory(path.join(openClawHome, '.openclaw', 'agents'))).toEqual(openClawDefaultAgentsBefore);
    expect(openClawInvocationArtifacts(openClawHome)).toEqual(openClawInvocationArtifactsBefore);
    expect(openClawProfileRoots(openClawHome)).toEqual(openClawProfilesBefore);

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
    expect(peerDelivery?.content.tool, diagnostic).toBe('openclaw');
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

function canonicalPath(value: string): string {
  const normalized = path.resolve(value).replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function requireOpenClawHome(): string {
  const home = process.env.HOME?.trim() || process.env.USERPROFILE?.trim() || os.homedir();
  const resolved = fs.realpathSync(path.resolve(home));
  const stat = fs.lstatSync(resolved);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`OpenClaw home is not a regular directory: ${resolved}`);
  }
  return resolved;
}

function snapshotOpenClawDefaultFiles(home: string): Map<string, FileSnapshot> {
  const snapshots = new Map<string, FileSnapshot>();
  for (const stateName of ['.openclaw', '.clawdbot', '.moltbot', '.moldbot']) {
    for (const configName of ['openclaw.json', 'clawdbot.json']) {
      const filePath = path.join(home, stateName, configName);
      if (!fs.existsSync(filePath)) {
        snapshots.set(filePath, { exists: false });
        continue;
      }
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error(`Unsafe OpenClaw default config candidate: ${filePath}`);
      }
      snapshots.set(filePath, { exists: true, bytes: fs.readFileSync(filePath), mtimeMs: stat.mtimeMs });
    }
  }
  return snapshots;
}

function snapshotDirectory(directory: string): DirectorySnapshot {
  if (!fs.existsSync(directory)) return { exists: false };
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`Unsafe OpenClaw default state directory: ${directory}`);
  }
  return { exists: true, digest: workspaceDigest(directory), mtimeMs: stat.mtimeMs };
}

function openClawInvocationArtifacts(home: string): string[] {
  return ['.openclaw', '.clawdbot', '.moltbot', '.moldbot'].flatMap((stateName) => {
    const root = path.join(home, stateName);
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
      .filter((name) => name.startsWith('.waggle-openclaw-'))
      .map((name) => `${stateName}/${name}`);
  }).sort();
}

function openClawProfileRoots(home: string): string[] {
  return fs.readdirSync(home)
    .filter((name) => name.startsWith('.openclaw-waggle-'))
    .sort();
}

function captureOpenClawProfiles(
  home: string,
  evidenceByProfile: Map<string, OpenClawProfileEvidence>,
  preExisting: string[],
): void {
  for (const name of openClawProfileRoots(home)) {
    if (preExisting.includes(name) || evidenceByProfile.has(name)) continue;
    const root = path.join(home, name);
    const rootStat = fs.lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()
      || canonicalPath(path.dirname(fs.realpathSync(root))) !== canonicalPath(home)) {
      throw new Error(`Unsafe transient OpenClaw profile root: ${root}`);
    }
    const markerPath = path.join(root, '.waggle-profile-owner.json');
    const configPath = path.join(root, 'openclaw.json');
    if (!fs.existsSync(markerPath) || !fs.existsSync(configPath)) continue;
    for (const filePath of [markerPath, configPath]) {
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
        throw new Error(`Unsafe transient OpenClaw profile file: ${filePath}`);
      }
    }
    try {
      const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')) as OpenClawProfileEvidence['marker'];
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
      evidenceByProfile.set(name, { root, marker, config });
    } catch {
      // A poll can land between an exclusive create and the final synchronous write.
    }
  }
}

function assertOpenClawProfileEvidence(
  evidence: OpenClawProfileEvidence,
  expected: {
    expectedBaseUrl: string;
    expectedWorkspaceId: string;
    expectedWorkspacePath: string;
    expectedToolProfile: 'coding' | 'minimal';
  },
): void {
  const config = evidence.config as {
    $include?: unknown;
    env?: { shellEnv?: { enabled?: unknown } };
    secrets?: { providers?: { default?: unknown } };
    models?: {
      mode?: unknown;
      pricing?: { enabled?: unknown };
      providers?: Record<string, unknown>;
    };
    agents?: {
      defaults?: { skipBootstrap?: unknown; workspace?: unknown; model?: unknown };
      list?: Array<{
        id?: unknown;
        workspace?: unknown;
        agentDir?: unknown;
        model?: unknown;
        tools?: { profile?: unknown };
      }>;
    };
  };
  const profileName = path.basename(evidence.root).slice('.openclaw-'.length);
  expect(profileName).toMatch(/^waggle-[a-f0-9]{32}$/);
  expect(evidence.marker).toMatchObject({
    profileName,
    workspaceId: expected.expectedWorkspaceId,
    workspacePath: expected.expectedWorkspacePath,
  });
  expect(config.$include).toBeUndefined();
  expect(config.env?.shellEnv?.enabled).toBe(false);
  expect(config.secrets?.providers?.default).toEqual({ source: 'env', allowlist: ['WAGGLE_RUN_TOKEN'] });
  expect(config.models?.mode).toBe('replace');
  expect(config.models?.pricing?.enabled).toBe(false);
  const provider = config.models?.providers?.['waggle-router'] as {
    baseUrl?: unknown; api?: unknown; auth?: unknown; authHeader?: unknown;
    apiKey?: unknown; models?: Array<{ id?: unknown; name?: unknown }>;
  } | undefined;
  expect(provider).toMatchObject({
    baseUrl: expected.expectedBaseUrl,
    api: 'openai-completions',
    auth: 'api-key',
    authHeader: true,
    apiKey: { source: 'env', provider: 'default', id: 'WAGGLE_RUN_TOKEN' },
    models: [{ name: 'Waggle routed model' }],
  });
  const routedModel = provider?.models?.[0]?.id;
  expect(typeof routedModel).toBe('string');
  expect(String(routedModel).trim()).not.toBe('');
  const expectedModelRef = `waggle-router/${String(routedModel)}`;
  expect(config.agents?.defaults).toMatchObject({
    skipBootstrap: true,
    workspace: expected.expectedWorkspacePath,
    model: { primary: expectedModelRef, fallbacks: [] },
  });
  expect(config.agents?.list).toHaveLength(1);
  const agent = config.agents?.list?.[0];
  expect(agent).toMatchObject({
    id: profileName,
    workspace: expected.expectedWorkspacePath,
    model: { primary: expectedModelRef, fallbacks: [] },
    tools: { profile: expected.expectedToolProfile },
  });
  expect(typeof agent?.agentDir).toBe('string');
  const relativeAgentDir = path.relative(evidence.root, String(agent?.agentDir));
  expect(relativeAgentDir).not.toMatch(/^\.\.(?:[\\/]|$)/);
  expect(path.isAbsolute(relativeAgentDir)).toBe(false);
}
