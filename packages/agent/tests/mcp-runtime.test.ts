import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import { McpServerInstance, McpRuntime, type McpServerConfig, type McpProcess, type SpawnFn } from '../src/mcp/mcp-runtime.js';

// ── Mock MCP Process Factory ───────────────────────────────────────────

function createMockMcpProcess() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();

  const mockProcess: McpProcess = {
    stdin,
    stdout,
    stderr,
    pid: 12345,
    kill: vi.fn(() => true),
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      // Store exit/error handlers for manual triggering
      (mockProcess as any)[`_${event}Handler`] = listener;
      return mockProcess;
    }),
    removeAllListeners: vi.fn(() => mockProcess),
  };

  // Auto-respond to JSON-RPC requests
  const toolList = [
    {
      name: 'read_file',
      description: 'Read a file from disk',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    },
    {
      name: 'list_files',
      description: 'List files in a directory',
      inputSchema: { type: 'object', properties: { dir: { type: 'string' } } },
    },
  ];

  stdin.on('data', (chunk: Buffer) => {
    const line = chunk.toString().trim();
    if (!line) return;

    let request: any;
    try {
      request = JSON.parse(line);
    } catch {
      return;
    }

    // Skip notifications (no id)
    if (request.id == null) return;

    let result: unknown;
    switch (request.method) {
      case 'initialize':
        result = { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock-server' } };
        break;
      case 'tools/list':
        result = { tools: toolList };
        break;
      case 'tools/call':
        if (request.params?.name === 'read_file') {
          result = { content: [{ type: 'text', text: `Contents of ${request.params.arguments?.path ?? 'unknown'}` }] };
        } else {
          result = { content: [{ type: 'text', text: 'ok' }] };
        }
        break;
      default:
        result = {};
    }

    const response = JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n';
    // Respond async to simulate real I/O
    setImmediate(() => stdout.write(response));
  });

  return { mockProcess, stdin, stdout, stderr, toolList };
}

function createMockSpawn(): { spawn: SpawnFn; lastProcess: () => ReturnType<typeof createMockMcpProcess> } {
  let last: ReturnType<typeof createMockMcpProcess> | null = null;
  const spawn: SpawnFn = () => {
    last = createMockMcpProcess();
    return last.mockProcess;
  };
  return { spawn, lastProcess: () => last! };
}

const baseConfig: McpServerConfig = {
  name: 'test-server',
  command: 'node',
  args: ['mock-mcp.js'],
};

// ── McpServerInstance Tests ────────────────────────────────────────────

describe('McpServerInstance', () => {
  it('starts and reaches ready state', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    expect(instance.getState()).toBe('stopped');
    await instance.start();
    expect(instance.getState()).toBe('ready');
    await instance.stop();
  });

  it('discovers tools from server', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    await instance.start();
    const tools = instance.getTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('read_file');
    expect(tools[1].name).toBe('list_files');
    await instance.stop();
  });

  it('forwards tool calls and returns results', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    await instance.start();
    const result = await instance.callTool('read_file', { path: '/tmp/test.txt' });
    expect(result).toEqual({
      content: [{ type: 'text', text: 'Contents of /tmp/test.txt' }],
    });
    await instance.stop();
  });

  it('handles server crash (state → error)', async () => {
    const { spawn, lastProcess } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    await instance.start();
    expect(instance.getState()).toBe('ready');

    // Simulate process exit
    const exitHandler = (lastProcess().mockProcess as any)._exitHandler;
    expect(exitHandler).toBeDefined();
    exitHandler();

    expect(instance.getState()).toBe('error');
  });

  it('handles tool call timeout', async () => {
    // Create a process that never responds to tools/call
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const silentProcess: McpProcess = {
      stdin, stdout, stderr, pid: 99,
      kill: vi.fn(() => true),
      on: vi.fn(() => silentProcess),
      removeAllListeners: vi.fn(() => silentProcess),
    };

    // Respond to initialize and tools/list, but NOT tools/call
    stdin.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (!line) return;
      let request: any;
      try { request = JSON.parse(line); } catch { return; }
      if (request.id == null) return;

      if (request.method === 'initialize' || request.method === 'tools/list') {
        const result = request.method === 'initialize'
          ? { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'slow' } }
          : { tools: [{ name: 'slow_tool', description: 'Slow', inputSchema: {} }] };
        setImmediate(() => stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n'));
      }
      // tools/call → no response (triggers timeout)
    });

    const spawnFn: SpawnFn = () => silentProcess;
    const instance = new McpServerInstance(baseConfig, { spawn: spawnFn, toolCallTimeoutMs: 100 });

    await instance.start();
    await expect(instance.callTool('slow_tool', {})).rejects.toThrow(/Timeout/);
    await instance.stop();
  });

  it('stop terminates process', async () => {
    const { spawn, lastProcess } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    await instance.start();
    await instance.stop();

    expect(lastProcess().mockProcess.kill).toHaveBeenCalled();
    expect(instance.getState()).toBe('stopped');
    expect(instance.getTools()).toHaveLength(0);
  });

  it('emits state change events', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });
    const events: Array<{ from: string; to: string }> = [];

    instance.on('stateChange', (e: { from: string; to: string }) => {
      events.push({ from: e.from, to: e.to });
    });

    await instance.start();
    await instance.stop();

    expect(events).toEqual([
      { from: 'stopped', to: 'starting' },
      { from: 'starting', to: 'ready' },
      { from: 'ready', to: 'stopped' },
    ]);
  });

  it('rejects callTool when not ready', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    await expect(instance.callTool('read_file', {})).rejects.toThrow(/not ready/);
  });

  it('isHealthy returns true only when ready', async () => {
    const { spawn } = createMockSpawn();
    const instance = new McpServerInstance(baseConfig, { spawn });

    expect(instance.isHealthy()).toBe(false);
    await instance.start();
    expect(instance.isHealthy()).toBe(true);
    await instance.stop();
    expect(instance.isHealthy()).toBe(false);
  });
});

// ── McpRuntime Tests ───────────────────────────────────────────────────

describe('McpRuntime', () => {
  let runtime: McpRuntime;
  let spawnFn: SpawnFn;

  beforeEach(() => {
    const mock = createMockSpawn();
    spawnFn = mock.spawn;
    runtime = new McpRuntime({ spawn: spawnFn });
  });

  it('registers multiple servers', () => {
    runtime.addServer({ name: 'server-a', command: 'node', args: ['a.js'] });
    runtime.addServer({ name: 'server-b', command: 'node', args: ['b.js'] });

    expect(runtime.getServer('server-a')).toBeDefined();
    expect(runtime.getServer('server-b')).toBeDefined();
    expect(runtime.getServer('server-c')).toBeUndefined();
  });

  it('throws on duplicate server name', () => {
    runtime.addServer({ name: 'dup', command: 'node' });
    expect(() => runtime.addServer({ name: 'dup', command: 'node' })).toThrow(/already registered/);
  });

  it('startAll() starts all servers', async () => {
    runtime.addServer({ name: 's1', command: 'node' });
    runtime.addServer({ name: 's2', command: 'node' });

    await runtime.startAll();

    const states = runtime.getServerStates();
    expect(states['s1']).toBe('ready');
    expect(states['s2']).toBe('ready');

    await runtime.stopAll();
  });

  it('stopAll() stops all servers', async () => {
    runtime.addServer({ name: 's1', command: 'node' });
    runtime.addServer({ name: 's2', command: 'node' });

    await runtime.startAll();
    await runtime.stopAll();

    const states = runtime.getServerStates();
    expect(states['s1']).toBe('stopped');
    expect(states['s2']).toBe('stopped');
  });

  it('getAllTools() aggregates from ready servers only', async () => {
    runtime.addServer({ name: 'ready-server', command: 'node' });
    runtime.addServer({ name: 'stopped-server', command: 'node' });

    // Only start the first server
    await runtime.getServer('ready-server')!.start();

    const tools = runtime.getAllTools();
    // ready-server has 2 tools, stopped-server has 0
    expect(tools).toHaveLength(2);
    expect(tools.every(t => t.name.startsWith('mcp_ready-server_'))).toBe(true);

    await runtime.stopAll();
  });

  it('getToolsForWorkspace() filters by workspace', async () => {
    runtime.addServer({ name: 'global', command: 'node' });
    runtime.addServer({ name: 'ws1-only', command: 'node', workspaceId: 'ws1' });
    runtime.addServer({ name: 'ws2-only', command: 'node', workspaceId: 'ws2' });

    await runtime.startAll();

    const ws1Tools = runtime.getToolsForWorkspace('ws1');
    const ws1Names = ws1Tools.map(t => t.name);
    // Should include global + ws1-only, not ws2-only
    expect(ws1Names.some(n => n.startsWith('mcp_global_'))).toBe(true);
    expect(ws1Names.some(n => n.startsWith('mcp_ws1-only_'))).toBe(true);
    expect(ws1Names.some(n => n.startsWith('mcp_ws2-only_'))).toBe(false);

    const ws2Tools = runtime.getToolsForWorkspace('ws2');
    expect(ws2Tools.some(t => t.name.startsWith('mcp_ws2-only_'))).toBe(true);
    expect(ws2Tools.some(t => t.name.startsWith('mcp_ws1-only_'))).toBe(false);

    await runtime.stopAll();
  });

  it('getServerStates() returns all states', async () => {
    runtime.addServer({ name: 'a', command: 'node' });
    runtime.addServer({ name: 'b', command: 'node' });

    const states = runtime.getServerStates();
    expect(states).toEqual({ a: 'stopped', b: 'stopped' });
  });

  it('tool names are prefixed with server name', async () => {
    runtime.addServer({ name: 'github', command: 'node' });
    await runtime.startAll();

    const tools = runtime.getAllTools();
    expect(tools[0].name).toBe('mcp_github_read_file');
    expect(tools[1].name).toBe('mcp_github_list_files');

    await runtime.stopAll();
  });

  it('tool execute forwards call to server and returns string', async () => {
    runtime.addServer({ name: 'fs', command: 'node' });
    await runtime.startAll();

    const tools = runtime.getAllTools();
    const readFileTool = tools.find(t => t.name === 'mcp_fs_read_file')!;
    expect(readFileTool).toBeDefined();

    const result = await readFileTool.execute({ path: '/etc/hosts' });
    // Result is JSON-stringified because callTool returns an object
    expect(result).toContain('Contents of /etc/hosts');

    await runtime.stopAll();
  });

  it('getHealthy() returns only ready servers', async () => {
    runtime.addServer({ name: 'up', command: 'node' });
    runtime.addServer({ name: 'down', command: 'node' });

    await runtime.getServer('up')!.start();

    const healthy = runtime.getHealthy();
    expect(healthy).toHaveLength(1);
    expect(healthy[0].config.name).toBe('up');

    await runtime.stopAll();
  });

  it('removeServer() stops and removes a server', async () => {
    runtime.addServer({ name: 'removable', command: 'node' });
    await runtime.startAll();

    expect(runtime.getServer('removable')).toBeDefined();
    await runtime.removeServer('removable');
    expect(runtime.getServer('removable')).toBeUndefined();
    expect(runtime.getServerStates()).toEqual({});
  });

  it('emits serverStateChange events', async () => {
    const events: Array<{ server: string; to: string }> = [];
    runtime.on('serverStateChange', (e: { server: string; to: string }) => {
      events.push({ server: e.server, to: e.to });
    });

    runtime.addServer({ name: 'ev', command: 'node' });
    await runtime.startAll();
    await runtime.stopAll();

    expect(events.map(e => e.to)).toEqual(['starting', 'ready', 'stopped']);
    expect(events.every(e => e.server === 'ev')).toBe(true);
  });

  it('isServerHealthy checks actual health', async () => {
    runtime.addServer({ name: 'h', command: 'node' });

    expect(runtime.isServerHealthy('h')).toBe(false);
    expect(runtime.isServerHealthy('nonexistent')).toBe(false);

    await runtime.startAll();
    expect(runtime.isServerHealthy('h')).toBe(true);

    await runtime.stopAll();
  });
});

// ── Capability Router + McpRuntime integration ─────────────────────────

describe('CapabilityRouter MCP health-awareness', () => {
  it('marks MCP route as unavailable when runtime reports unhealthy', async () => {
    // Import inline to avoid circular issues in test
    const { CapabilityRouter } = await import('../src/capability-router.js');

    const mockRuntime = { isServerHealthy: (name: string) => name === 'healthy-mcp' };

    const router = new CapabilityRouter({
      toolNames: [],
      skills: [],
      plugins: [],
      mcpServers: ['healthy-mcp', 'unhealthy-mcp'],
      subAgentRoles: [],
      mcpRuntime: mockRuntime,
    });

    const routes = router.resolve('mcp');
    const healthyRoute = routes.find(r => r.name === 'healthy-mcp');
    const unhealthyRoute = routes.find(r => r.name === 'unhealthy-mcp');

    expect(healthyRoute?.available).toBe(true);
    expect(unhealthyRoute?.available).toBe(false);
    expect(unhealthyRoute?.description).toContain('not healthy');
  });

  it('assumes available when no mcpRuntime is provided (backward compat)', async () => {
    const { CapabilityRouter } = await import('../src/capability-router.js');

    const router = new CapabilityRouter({
      toolNames: [],
      skills: [],
      plugins: [],
      mcpServers: ['some-mcp'],
      subAgentRoles: [],
      // no mcpRuntime
    });

    const routes = router.resolve('some');
    expect(routes[0]).toMatchObject({ source: 'mcp', available: true });
  });
});
