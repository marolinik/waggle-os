import {
  type MindDB,
  IdentityLayer,
  AwarenessLayer,
  FrameStore,
  SessionStore,
  KnowledgeGraph,
} from '@waggle/core';
import { AgentSession } from './agent-session.js';
import { McpManager, type McpServerConfig } from './mcp-manager.js';

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
  id: number | string;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
  id: number | string;
}

interface Settings {
  [key: string]: unknown;
  model: string;
  apiKey: string;
}

export class RpcHandler {
  private db: MindDB;
  private identity: IdentityLayer;
  private awareness: AwarenessLayer;
  private frames: FrameStore;
  private sessions: SessionStore;
  private knowledge: KnowledgeGraph;
  private settings: Settings;
  private agentSession: AgentSession;
  private mcpManager: McpManager;

  constructor(db: MindDB) {
    this.db = db;
    this.identity = new IdentityLayer(db);
    this.awareness = new AwarenessLayer(db);
    this.frames = new FrameStore(db);
    this.sessions = new SessionStore(db);
    this.knowledge = new KnowledgeGraph(db);
    this.settings = { model: 'claude-sonnet-4-6', apiKey: '' };
    this.agentSession = new AgentSession(db);
    this.mcpManager = new McpManager();
  }

  async handle(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      const result = await this.dispatch(request.method, request.params ?? {});
      return { jsonrpc: '2.0', result, id: request.id };
    } catch (err) {
      if (err instanceof MethodNotFoundError) {
        return {
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not found: ${request.method}` },
          id: request.id,
        };
      }
      return {
        jsonrpc: '2.0',
        error: { code: -32000, message: (err as Error).message },
        id: request.id,
      };
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'ping':
        return { status: 'ok' };

      case 'mind.getIdentity':
        return this.identity.exists() ? this.identity.toContext() : 'No identity set.';

      case 'mind.getAwareness':
        return this.awareness.toContext();

      case 'chat.send': {
        const message = params.message as string;
        if (!message) throw new Error('message is required');

        const streamEvents: unknown[] = [];
        const response = await this.agentSession.sendMessage(
          message,
          this.settings.apiKey,
          this.settings.model,
          (event) => {
            streamEvents.push(event);
          },
        );
        return { response, events: streamEvents };
      }

      case 'settings.get':
        return { ...this.settings };

      case 'settings.set': {
        const key = params.key as string;
        const value = params.value;
        if (!(key in this.settings)) {
          throw new Error(`Unknown setting: ${key}`);
        }
        (this.settings as Record<string, unknown>)[key] = value;
        return { success: true };
      }

      case 'mcp.list':
        return this.mcpManager.listServers();

      case 'mcp.add': {
        const config = params as unknown as McpServerConfig;
        this.mcpManager.addServer(config);
        return { success: true };
      }

      case 'mcp.remove':
        this.mcpManager.removeServer(params.id as string);
        return { success: true };

      default:
        throw new MethodNotFoundError(method);
    }
  }
}

class MethodNotFoundError extends Error {
  constructor(method: string) {
    super(`Method not found: ${method}`);
    this.name = 'MethodNotFoundError';
  }
}
