import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MindDB, SessionStore, FrameStore } from '@waggle/core';
import { buildLocalServer } from '../../src/local/index.js';
import type { FastifyInstance } from 'fastify';
import { injectWithAuth } from '../test-utils.js';

describe('Capabilities Route', () => {
  let server: FastifyInstance;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'waggle-caps-test-'));

    // Create personal.mind (required by buildLocalServer)
    const personalPath = path.join(tmpDir, 'personal.mind');
    const mind = new MindDB(personalPath);
    const sessions = new SessionStore(mind);
    const frames = new FrameStore(mind);
    const s1 = sessions.create('test');
    frames.createIFrame(s1.gop_id, 'Test content', 'normal');
    mind.close();

    server = await buildLocalServer({ dataDir: tmpDir });
  });

  afterAll(async () => {
    await server.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('GET /api/capabilities/status returns 200', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    expect(res.statusCode).toBe(200);
  });

  it('returns correct structure with empty plugins/MCP and populated commands', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty('plugins');
    expect(body).toHaveProperty('mcpServers');
    expect(body).toHaveProperty('skills');
    expect(body).toHaveProperty('tools');
    expect(body).toHaveProperty('commands');

    expect(Array.isArray(body.plugins)).toBe(true);
    expect(Array.isArray(body.mcpServers)).toBe(true);
    expect(Array.isArray(body.skills)).toBe(true);
    expect(Array.isArray(body.commands)).toBe(true);
    expect(body.plugins).toEqual([]);
    expect(body.mcpServers).toEqual([]);
    // Commands populated by registerWorkflowCommands + registerMarketplaceCommands at startup
    expect(body.commands.length).toBeGreaterThanOrEqual(13);
  });

  it('tools summary has count, native, plugin, mcp fields', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body.tools).toHaveProperty('count');
    expect(body.tools).toHaveProperty('native');
    expect(body.tools).toHaveProperty('plugin');
    expect(body.tools).toHaveProperty('mcp');
    expect(typeof body.tools.count).toBe('number');
    expect(typeof body.tools.native).toBe('number');
    expect(body.tools.plugin).toBe(0);
    expect(body.tools.mcp).toBe(0);
  });

  it('native tool count equals total when no plugins or MCP', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body.tools.native).toBe(body.tools.count);
    expect(body.tools.count).toBeGreaterThan(0); // at least some native tools exist
  });

  it('returns plugin data when pluginRuntimeManager is present', async () => {
    // Mock a pluginRuntimeManager on agentState
    const mockManager = {
      getPluginStates: () => ({ 'test-plugin': 'active', 'other-plugin': 'disabled' }),
      getAllTools: () => [
        { name: 'test-plugin:tool1' },
        { name: 'test-plugin:tool2' },
      ],
      getAllSkills: () => ['test-plugin:summarize'],
    };

    (server.agentState as Record<string, unknown>).pluginRuntimeManager = mockManager;

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body.plugins).toHaveLength(2);
    expect(body.plugins[0].name).toBe('test-plugin');
    expect(body.plugins[0].state).toBe('active');
    expect(body.plugins[0].tools).toBe(2);
    expect(body.plugins[0].skills).toBe(1);

    expect(body.plugins[1].name).toBe('other-plugin');
    expect(body.plugins[1].state).toBe('disabled');
    expect(body.plugins[1].tools).toBe(0);

    expect(body.tools.plugin).toBe(2);

    // Cleanup
    (server.agentState as Record<string, unknown>).pluginRuntimeManager = null;
  });

  it('returns MCP data when mcpRuntime is present', async () => {
    const mockMcp = {
      getServerStates: () => ({ 'fs-server': 'ready', 'db-server': 'error' }),
      getAllTools: () => [
        { name: 'fs-server:readFile' },
        { name: 'fs-server:writeFile' },
        { name: 'db-server:query' },
      ],
      getHealthy: () => [{ config: { name: 'fs-server' } }],
    };

    (server.agentState as Record<string, unknown>).mcpRuntime = mockMcp;

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body.mcpServers).toHaveLength(2);

    const fsServer = body.mcpServers.find((s: { name: string }) => s.name === 'fs-server');
    expect(fsServer).toBeDefined();
    expect(fsServer.state).toBe('ready');
    expect(fsServer.healthy).toBe(true);
    expect(fsServer.tools).toBe(2);

    const dbServer = body.mcpServers.find((s: { name: string }) => s.name === 'db-server');
    expect(dbServer).toBeDefined();
    expect(dbServer.state).toBe('error');
    expect(dbServer.healthy).toBe(false);
    expect(dbServer.tools).toBe(1);

    expect(body.tools.mcp).toBe(3);

    // Cleanup
    (server.agentState as Record<string, unknown>).mcpRuntime = null;
  });

  it('returns workflow + marketplace commands from the wired CommandRegistry', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body.commands.length).toBeGreaterThanOrEqual(13);

    // Verify all expected workflow commands are present
    const commandNames = body.commands.map((c: { name: string }) => c.name);
    expect(commandNames).toContain('catchup');
    expect(commandNames).toContain('now');
    expect(commandNames).toContain('research');
    expect(commandNames).toContain('draft');
    expect(commandNames).toContain('decide');
    expect(commandNames).toContain('review');
    expect(commandNames).toContain('spawn');
    expect(commandNames).toContain('skills');
    expect(commandNames).toContain('status');
    expect(commandNames).toContain('memory');
    expect(commandNames).toContain('plan');
    expect(commandNames).toContain('focus');
    expect(commandNames).toContain('help');

    // Each command has the expected shape
    for (const cmd of body.commands) {
      expect(cmd).toHaveProperty('name');
      expect(cmd).toHaveProperty('description');
      expect(cmd).toHaveProperty('usage');
      expect(typeof cmd.name).toBe('string');
      expect(typeof cmd.description).toBe('string');
      expect(cmd.usage).toMatch(/^\//); // usage starts with /
    }
  });

  it('returns hooks object with registered count and recentActivity array', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty('hooks');
    expect(body.hooks).toHaveProperty('registered');
    expect(body.hooks).toHaveProperty('recentActivity');
    expect(body.hooks.registered).toBe(10);
    expect(Array.isArray(body.hooks.recentActivity)).toBe(true);
  });

  it('returns workflows array with 3 built-in templates', async () => {
    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    expect(body).toHaveProperty('workflows');
    expect(Array.isArray(body.workflows)).toBe(true);
    expect(body.workflows).toHaveLength(3);

    const names = body.workflows.map((w: { name: string }) => w.name);
    expect(names).toContain('research-team');
    expect(names).toContain('review-pair');
    expect(names).toContain('plan-execute');

    for (const wf of body.workflows) {
      expect(wf).toHaveProperty('name');
      expect(wf).toHaveProperty('description');
      expect(wf).toHaveProperty('steps');
      expect(typeof wf.name).toBe('string');
      expect(typeof wf.description).toBe('string');
      expect(typeof wf.steps).toBe('number');
      expect(wf.steps).toBeGreaterThan(0);
      expect(wf.description.length).toBeGreaterThan(0);
    }
  });

  it('tool count breakdown is correct with both plugins and MCP', async () => {
    const mockManager = {
      getPluginStates: () => ({ 'p1': 'active' }),
      getAllTools: () => [{ name: 'p1:t1' }, { name: 'p1:t2' }, { name: 'p1:t3' }],
      getAllSkills: () => [],
    };

    const mockMcp = {
      getServerStates: () => ({ 's1': 'ready' }),
      getAllTools: () => [{ name: 's1:read' }, { name: 's1:write' }],
      getHealthy: () => [{ config: { name: 's1' } }],
    };

    (server.agentState as Record<string, unknown>).pluginRuntimeManager = mockManager;
    (server.agentState as Record<string, unknown>).mcpRuntime = mockMcp;

    const res = await injectWithAuth(server, { method: 'GET', url: '/api/capabilities/status' });
    const body = JSON.parse(res.body);

    const totalNative = server.agentState.allTools.length;
    const nativeCount = totalNative - 3 - 2;
    expect(body.tools.native).toBe(nativeCount);
    expect(body.tools.plugin).toBe(3);
    expect(body.tools.mcp).toBe(2);
    expect(body.tools.count).toBe(nativeCount + 3 + 2);

    // Cleanup
    (server.agentState as Record<string, unknown>).pluginRuntimeManager = null;
    (server.agentState as Record<string, unknown>).mcpRuntime = null;
  });
});
