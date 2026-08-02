import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AgentRunRegistry } from '../../src/local/agent-run-registry.js';
import { externalToolRunRoutes } from '../../src/local/routes/external-tool-runs.js';

const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('external tool roadmap gate', () => {
  it('rejects OpenClaw before workspace, run, or process side effects', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-roadmap-tool-'));
    tempDirs.push(dataDir);
    const registry = new AgentRunRegistry(path.join(dataDir, 'agent-runs.json'));
    const workspaceLookup = vi.fn();
    const runner = vi.fn();
    const server = Fastify({ logger: false });
    server.decorate('agentRunRegistry', registry);
    server.decorate('workspaceManager', { get: workspaceLookup } as never);
    server.decorate('externalToolDetector', async () => ({
      platform: 'win32',
      detectedAt: new Date().toISOString(),
      tools: [{
        id: 'openclaw',
        displayName: 'OpenClaw',
        releaseStatus: 'supported',
        launchable: true,
        installed: true,
        installedPath: 'C:\\tools\\openclaw.cmd',
        version: 'test',
        hooksInstalled: false,
        hookPointerPath: null,
      }],
    }));
    server.decorate('externalToolRunner', runner);
    await server.register(externalToolRunRoutes);

    const response = await server.inject({
      method: 'POST',
      url: '/api/tools/run',
      payload: { toolId: 'openclaw', workspaceIds: ['alpha'], prompt: 'Do work' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: 'tool_not_release_supported',
      toolId: 'openclaw',
    });
    expect(workspaceLookup).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(registry.snapshot().runs).toHaveLength(0);
    await server.close();
  });
});
