import { EventEmitter } from 'events';
import type { Readable, Writable } from 'stream';
import type { ToolDefinition } from '../tools.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface McpServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  workspaceId?: string;
}

export type McpServerState = 'starting' | 'ready' | 'error' | 'stopped';

export interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** JSON-RPC 2.0 request/response types */
interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/** Minimal subset of ChildProcess for DI */
export interface McpProcess {
  stdin: Writable | null;
  stdout: Readable | null;
  stderr: Readable | null;
  pid?: number;
  kill(signal?: string): boolean;
  on(event: string, listener: (...args: unknown[]) => void): this;
  removeAllListeners(event?: string): this;
}

/** Spawn function signature for DI (testability) */
export type SpawnFn = (
  command: string,
  args: string[],
  options: { env?: Record<string, string>; stdio: string[] },
) => McpProcess;

// ── McpServerInstance ──────────────────────────────────────────────────

export class McpServerInstance extends EventEmitter {
  readonly config: McpServerConfig;
  private state: McpServerState = 'stopped';
  private process: McpProcess | null = null;
  private spawnFn: SpawnFn;
  private nextId = 1;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  private tools: McpToolInfo[] = [];
  private stdoutBuffer = '';
  private autoRestart: boolean;
  private toolCallTimeoutMs: number;

  constructor(
    config: McpServerConfig,
    options?: {
      spawn?: SpawnFn;
      autoRestart?: boolean;
      toolCallTimeoutMs?: number;
    },
  ) {
    super();
    this.config = config;
    this.spawnFn = options?.spawn ?? defaultSpawn;
    this.autoRestart = options?.autoRestart ?? false;
    this.toolCallTimeoutMs = options?.toolCallTimeoutMs ?? 30_000;
  }

  getState(): McpServerState {
    return this.state;
  }

  isHealthy(): boolean {
    return this.state === 'ready';
  }

  getTools(): McpToolInfo[] {
    return [...this.tools];
  }

  async start(): Promise<void> {
    if (this.state === 'ready' || this.state === 'starting') return;

    this.setState('starting');

    try {
      this.process = this.spawnFn(
        this.config.command,
        this.config.args ?? [],
        {
          env: this.config.env ? { ...process.env, ...this.config.env } as Record<string, string> : undefined,
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      // Wire up stdout for JSON-RPC responses
      this.process.stdout?.on('data', (chunk: Buffer | string) => {
        this.stdoutBuffer += chunk.toString();
        this.processBuffer();
      });

      // Handle process exit
      this.process.on('exit', () => {
        this.handleProcessExit();
      });

      this.process.on('error', (err: unknown) => {
        this.setState('error');
        this.rejectAllPending(new Error(`Process error: ${(err as Error).message}`));
      });

      // Send initialize request
      await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'waggle', version: '1.0.0' },
      });

      // Send initialized notification (no response expected, but we send as request for simplicity)
      this.sendNotification('notifications/initialized', {});

      // Discover tools
      const toolsResult = await this.sendRequest('tools/list', {}) as { tools?: McpToolInfo[] };
      this.tools = toolsResult?.tools ?? [];

      this.setState('ready');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this.state === 'stopped') return;

    // Prevent auto-restart during intentional stop
    const wasAutoRestart = this.autoRestart;
    this.autoRestart = false;

    this.rejectAllPending(new Error('Server stopping'));

    if (this.process) {
      this.process.stdout?.removeAllListeners('data');
      this.process.removeAllListeners('exit');
      this.process.removeAllListeners('error');
      this.process.stdin?.end();
      this.process.kill();
      this.process = null;
    }

    this.tools = [];
    this.stdoutBuffer = '';
    this.setState('stopped');
    this.autoRestart = wasAutoRestart;
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    if (this.state !== 'ready') {
      throw new Error(`Server "${this.config.name}" is not ready (state: ${this.state})`);
    }

    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args,
    });

    return result;
  }

  // ── Private helpers ────────────────────────────────────────────────

  private setState(newState: McpServerState): void {
    const old = this.state;
    this.state = newState;
    if (old !== newState) {
      this.emit('stateChange', { from: old, to: newState, server: this.config.name });
    }
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    if (!this.process?.stdin) return;
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.process.stdin.write(msg);
  }

  private sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        return reject(new Error('No process stdin'));
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for response to ${method} (id=${id})`));
      }, this.toolCallTimeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const request: JsonRpcRequest = { jsonrpc: '2.0', id, method, params };
      this.process.stdin.write(JSON.stringify(request) + '\n');
    });
  }

  private processBuffer(): void {
    const lines = this.stdoutBuffer.split('\n');
    // Keep the last incomplete line in the buffer
    this.stdoutBuffer = lines.pop()!;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let response: JsonRpcResponse;
      try {
        response = JSON.parse(trimmed);
      } catch {
        continue; // Skip non-JSON lines
      }

      if (response.id == null) continue; // Skip notifications

      const pending = this.pendingRequests.get(response.id);
      if (!pending) continue;

      this.pendingRequests.delete(response.id);
      clearTimeout(pending.timer);

      if (response.error) {
        pending.reject(new Error(`JSON-RPC error: ${response.error.message}`));
      } else {
        pending.resolve(response.result);
      }
    }
  }

  private handleProcessExit(): void {
    this.rejectAllPending(new Error('Process exited unexpectedly'));
    this.process = null;
    this.tools = [];

    if (this.state !== 'stopped') {
      this.setState('error');

      if (this.autoRestart) {
        // Schedule restart
        setTimeout(() => {
          if (this.state === 'error') {
            this.start().catch(() => {
              // auto-restart failed, stay in error state
            });
          }
        }, 2000);
      }
    }
  }

  private rejectAllPending(err: Error): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pendingRequests.clear();
  }
}

// ── McpRuntime ─────────────────────────────────────────────────────────

export class McpRuntime extends EventEmitter {
  private servers = new Map<string, McpServerInstance>();
  private configs = new Map<string, McpServerConfig>();
  private spawnFn: SpawnFn;
  private autoRestart: boolean;
  private toolCallTimeoutMs: number;

  constructor(options?: {
    spawn?: SpawnFn;
    autoRestart?: boolean;
    toolCallTimeoutMs?: number;
  }) {
    super();
    this.spawnFn = options?.spawn ?? defaultSpawn;
    this.autoRestart = options?.autoRestart ?? false;
    this.toolCallTimeoutMs = options?.toolCallTimeoutMs ?? 30_000;
  }

  addServer(config: McpServerConfig): void {
    if (this.servers.has(config.name)) {
      throw new Error(`MCP server "${config.name}" already registered`);
    }
    this.configs.set(config.name, config);
    const instance = new McpServerInstance(config, {
      spawn: this.spawnFn,
      autoRestart: this.autoRestart,
      toolCallTimeoutMs: this.toolCallTimeoutMs,
    });

    // Bubble up state change events
    instance.on('stateChange', (event) => {
      this.emit('serverStateChange', event);
    });

    this.servers.set(config.name, instance);
  }

  removeServer(name: string): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return Promise.resolve();

    this.servers.delete(name);
    this.configs.delete(name);
    return server.stop();
  }

  getServer(name: string): McpServerInstance | undefined {
    return this.servers.get(name);
  }

  async startAll(): Promise<void> {
    const names = Array.from(this.servers.keys());
    const results = await Promise.allSettled(
      Array.from(this.servers.values()).map((s) => s.start()),
    );

    // Log failures but don't throw — some servers may be optional
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        // Emit event so callers can observe which servers failed
        this.emit('serverError', { serverName: names[i], error: result.reason });
      }
    }
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.servers.values()).map((s) => s.stop()),
    );
  }

  getServerStates(): Record<string, McpServerState> {
    const states: Record<string, McpServerState> = {};
    for (const [name, server] of this.servers) {
      states[name] = server.getState();
    }
    return states;
  }

  getHealthy(): McpServerInstance[] {
    return Array.from(this.servers.values()).filter((s) => s.isHealthy());
  }

  /** Get all tools from all ready servers as ToolDefinition[], prefixed with server name */
  getAllTools(): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const [, server] of this.servers) {
      if (!server.isHealthy()) continue;
      tools.push(...this.wrapServerTools(server));
    }
    return tools;
  }

  /** Get tools only from servers enabled for a specific workspace */
  getToolsForWorkspace(workspaceId: string): ToolDefinition[] {
    const tools: ToolDefinition[] = [];
    for (const [, server] of this.servers) {
      if (!server.isHealthy()) continue;
      // Include servers with no workspace restriction OR matching workspace
      if (server.config.workspaceId && server.config.workspaceId !== workspaceId) {
        continue;
      }
      tools.push(...this.wrapServerTools(server));
    }
    return tools;
  }

  /** Check if a specific server name is healthy */
  isServerHealthy(name: string): boolean {
    const server = this.servers.get(name);
    return server?.isHealthy() ?? false;
  }

  // ── Private helpers ────────────────────────────────────────────────

  private wrapServerTools(server: McpServerInstance): ToolDefinition[] {
    const serverName = server.config.name;
    return server.getTools().map((tool) => ({
      name: `mcp_${serverName}_${tool.name}`,
      description: `[MCP: ${serverName}] ${tool.description}`,
      parameters: tool.inputSchema,
      execute: async (args: Record<string, unknown>) => {
        const result = await server.callTool(tool.name, args);
        return typeof result === 'string' ? result : JSON.stringify(result);
      },
    }));
  }
}

// ── Default spawn (uses real child_process) ────────────────────────────

function defaultSpawn(
  command: string,
  args: string[],
  options: { env?: Record<string, string>; stdio: string[] },
): McpProcess {
  // Lazy import to avoid issues in test environments
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { spawn } = require('child_process') as typeof import('child_process');
  return spawn(command, args, {
    env: options.env as NodeJS.ProcessEnv | undefined,
    stdio: options.stdio as any,
  }) as unknown as McpProcess;
}
