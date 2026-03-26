/**
 * LocalAdapter — implements WaggleService by talking to the local
 * agent service at localhost:3333 via HTTP + WebSocket.
 */

import type {
  WaggleService,
  StreamEvent,
  Message,
  Workspace,
  WorkspaceContext,
  Session,
  SessionSearchResult,
  Frame,
  AgentStatus,
  WaggleConfig,
  TeamConnection,
  StarterCatalogResponse,
  SkillState,
} from './types.js';

export interface LocalAdapterOptions {
  baseUrl?: string;
  wsUrl?: string;
}

export class LocalAdapter implements WaggleService {
  private readonly baseUrl: string;
  private readonly wsUrl: string;
  private connected = false;
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  /** Bearer token obtained from /health — used to authenticate all API requests (SEC-011) */
  private authToken: string | null = null;

  constructor(options: LocalAdapterOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'http://127.0.0.1:3333';
    this.wsUrl = options.wsUrl ?? 'ws://127.0.0.1:3333/ws';
  }

  /**
   * Build headers for authenticated requests.
   * Merges the Authorization header with any additional headers provided.
   */
  private authHeaders(extra?: Record<string, string>): Record<string, string> {
    const headers: Record<string, string> = { ...extra };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  // ── Connection lifecycle ───────────────────────────────────────────

  async connect(): Promise<void> {
    // Health check (unauthenticated — discovers the session token)
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health check failed: ${res.status}`);
    }

    // Extract the session token from the health response (SEC-011)
    try {
      const healthData = await res.json() as { wsToken?: string };
      if (healthData.wsToken) {
        this.authToken = healthData.wsToken;
      }
    } catch {
      // If parsing fails, continue without token (backward compat)
    }

    // Open WebSocket for push events (best-effort, non-blocking)
    // Pass token as query param (same as existing WS auth — 11A-6)
    try {
      const wsUrlWithToken = this.authToken
        ? `${this.wsUrl}?token=${this.authToken}`
        : this.wsUrl;
      this.ws = new WebSocket(wsUrlWithToken);
      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(String(event.data));
          const eventType = parsed.type ?? 'message';
          this.emit(eventType, parsed);
        } catch {
          // Ignore malformed messages
        }
      };
      this.ws.onerror = () => {
        // WebSocket is optional — service works without it
      };
    } catch {
      // WebSocket unavailable — that's fine
    }

    this.connected = true;
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.listeners.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  // ── Chat ───────────────────────────────────────────────────────────

  async *sendMessage(
    workspace: string,
    message: string,
    session?: string,
    model?: string,
    workspacePath?: string,
  ): AsyncGenerator<StreamEvent> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ message, workspace, session, model, workspacePath }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      yield { type: 'error', content: (err as Record<string, string>).error ?? 'Request failed' };
      return;
    }

    // Parse SSE from response body
    yield* this.parseSSE(res);
  }

  async getHistory(workspace: string, session?: string): Promise<Message[]> {
    const params = new URLSearchParams({ workspace });
    if (session) params.set('session', session);
    const res = await fetch(`${this.baseUrl}/api/history?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    return res.json() as Promise<Message[]>;
  }

  // ── Workspaces ─────────────────────────────────────────────────────

  async listWorkspaces(): Promise<Workspace[]> {
    const res = await fetch(`${this.baseUrl}/api/workspaces`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to list workspaces: ${res.status}`);
    return res.json() as Promise<Workspace[]>;
  }

  async createWorkspace(config: Partial<Workspace>): Promise<Workspace> {
    const res = await fetch(`${this.baseUrl}/api/workspaces`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error ?? `Failed to create workspace: ${res.status}`);
    }
    return res.json() as Promise<Workspace>;
  }

  async updateWorkspace(id: string, config: Partial<Workspace>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${id}`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error ?? `Failed to update workspace: ${res.status}`);
    }
  }

  async getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${id}/context`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get workspace context: ${res.status}`);
    return res.json() as Promise<WorkspaceContext>;
  }

  async deleteWorkspace(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${id}`, {
      method: 'DELETE',
      headers: this.authHeaders(),
    });
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete workspace: ${res.status}`);
    }
  }

  // ── Memory ─────────────────────────────────────────────────────────

  async searchMemory(
    query: string,
    scope: 'personal' | 'workspace' | 'all',
    workspace?: string,
  ): Promise<Frame[]> {
    const params = new URLSearchParams({ q: query, scope });
    if (workspace) params.set('workspace', workspace);
    const res = await fetch(`${this.baseUrl}/api/memory/search?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results: Frame[]; count: number };
    return data.results;
  }

  async listFrames(workspace?: string, limit = 50): Promise<Frame[]> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (workspace) params.set('workspace', workspace);
    const res = await fetch(`${this.baseUrl}/api/memory/frames?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { results: Frame[]; count: number };
    return data.results;
  }

  async getKnowledgeGraph(
    workspace: string,
  ): Promise<{ entities: unknown[]; relations: unknown[] }> {
    const params = new URLSearchParams({ workspace });
    const res = await fetch(`${this.baseUrl}/api/memory/graph?${params}`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return { entities: [], relations: [] };
    return res.json() as Promise<{ entities: unknown[]; relations: unknown[] }>;
  }

  // ── Sessions ───────────────────────────────────────────────────────

  async listSessions(workspace: string): Promise<Session[]> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${workspace}/sessions`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) return [];
    return res.json() as Promise<Session[]>;
  }

  async createSession(workspace: string, title?: string): Promise<Session> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${workspace}/sessions`,
      {
        method: 'POST',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title }),
      },
    );
    if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
    return res.json() as Promise<Session>;
  }

  async renameSession(sessionId: string, workspace: string, title: string): Promise<void> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${workspace}/sessions/${sessionId}`,
      {
        method: 'PATCH',
        headers: this.authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title }),
      },
    );
    if (!res.ok) throw new Error(`Failed to rename session: ${res.status}`);
  }

  async deleteSession(sessionId: string, workspace: string): Promise<void> {
    const params = new URLSearchParams({ workspace });
    const res = await fetch(
      `${this.baseUrl}/api/sessions/${sessionId}?${params}`,
      { method: 'DELETE', headers: this.authHeaders() },
    );
    if (!res.ok && res.status !== 204) {
      throw new Error(`Failed to delete session: ${res.status}`);
    }
  }

  async searchSessions(workspace: string, query: string): Promise<SessionSearchResult[]> {
    const params = new URLSearchParams({ q: query });
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${workspace}/sessions/search?${params}`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) return [];
    return res.json() as Promise<SessionSearchResult[]>;
  }

  async exportSession(workspace: string, sessionId: string): Promise<string> {
    const res = await fetch(
      `${this.baseUrl}/api/workspaces/${workspace}/sessions/${sessionId}/export`,
      { headers: this.authHeaders() },
    );
    if (!res.ok) throw new Error('Export failed');
    return res.text();
  }

  async listFiles(workspace: string): Promise<import('./types.js').FileRegistryEntry[]> {
    const res = await fetch(`${this.baseUrl}/api/workspaces/${workspace}/files`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { files: import('./types.js').FileRegistryEntry[] };
    return data.files;
  }

  // ── Approval gates ─────────────────────────────────────────────────

  approveAction(requestId: string): void {
    fetch(`${this.baseUrl}/api/approval/${requestId}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approved: true }),
    }).catch(() => {});
  }

  denyAction(requestId: string, reason?: string): void {
    fetch(`${this.baseUrl}/api/approval/${requestId}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ approved: false, reason }),
    }).catch(() => {});
  }

  // ── Agent ──────────────────────────────────────────────────────────

  async getAgentStatus(): Promise<AgentStatus> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agent/status`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) {
        return { running: false, model: 'unknown', tokensUsed: 0, estimatedCost: 0 };
      }
      return res.json() as Promise<AgentStatus>;
    } catch {
      return { running: false, model: 'unknown', tokensUsed: 0, estimatedCost: 0 };
    }
  }

  // ── Model management ────────────────────────────────────────────────

  async getModel(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agent/model`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return 'claude-sonnet-4-6';
      const data = await res.json() as { model: string };
      return data.model;
    } catch {
      return 'claude-sonnet-4-6';
    }
  }

  async setModel(model: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/agent/model`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ model }),
    });
  }

  // ── Cost tracking ───────────────────────────────────────────────────

  async getCost(): Promise<{ summary: string; totalInputTokens: number; totalOutputTokens: number; estimatedCost: number; turns: number }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/agent/cost`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return { summary: 'No data', totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0, turns: 0 };
      return res.json() as Promise<{ summary: string; totalInputTokens: number; totalOutputTokens: number; estimatedCost: number; turns: number }>;
    } catch {
      return { summary: 'No data', totalInputTokens: 0, totalOutputTokens: 0, estimatedCost: 0, turns: 0 };
    }
  }

  // ── Mind ─────────────────────────────────────────────────────────────

  async getIdentity(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/mind/identity`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return '';
      const data = await res.json() as { identity: string };
      return data.identity;
    } catch {
      return '';
    }
  }

  async getAwareness(): Promise<string> {
    try {
      const res = await fetch(`${this.baseUrl}/api/mind/awareness`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return '';
      const data = await res.json() as { awareness: string };
      return data.awareness;
    } catch {
      return '';
    }
  }

  // ── Skills ──────────────────────────────────────────────────────────

  async getSkills(): Promise<Array<{ name: string; length: number }>> {
    try {
      const res = await fetch(`${this.baseUrl}/api/mind/skills`, {
        headers: this.authHeaders(),
      });
      if (!res.ok) return [];
      const data = await res.json() as { skills: Array<{ name: string; length: number }> };
      return data.skills;
    } catch {
      return [];
    }
  }

  // ── Install Center ──────────────────────────────────────────────────

  async getStarterCatalog(): Promise<StarterCatalogResponse> {
    const res = await fetch(`${this.baseUrl}/api/skills/starter-pack/catalog`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get starter catalog: ${res.status}`);
    return res.json() as Promise<StarterCatalogResponse>;
  }

  async installStarterSkill(skillId: string): Promise<{ ok: boolean; skill: { id: string; name: string; state: SkillState } }> {
    const res = await fetch(`${this.baseUrl}/api/skills/starter-pack/${encodeURIComponent(skillId)}`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Install failed' }));
      throw new Error((err as Record<string, string>).error ?? `Install failed: ${res.status}`);
    }
    return res.json() as Promise<{ ok: boolean; skill: { id: string; name: string; state: SkillState } }>;
  }

  // ── Settings ───────────────────────────────────────────────────────

  async getConfig(): Promise<WaggleConfig> {
    const res = await fetch(`${this.baseUrl}/api/settings`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to get config: ${res.status}`);
    return res.json() as Promise<WaggleConfig>;
  }

  async updateConfig(config: Partial<WaggleConfig>): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/settings`, {
      method: 'PUT',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`Failed to update config: ${res.status}`);
  }

  async testApiKey(
    provider: string,
    key: string,
  ): Promise<{ valid: boolean; error?: string }> {
    const res = await fetch(`${this.baseUrl}/api/settings/test-key`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ provider, apiKey: key }),
    });
    if (!res.ok) return { valid: false, error: `Request failed: ${res.status}` };
    return res.json() as Promise<{ valid: boolean; error?: string }>;
  }

  // ── Team ───────────────────────────────────────────────────────────

  async connectTeam(serverUrl: string, token: string): Promise<TeamConnection> {
    const res = await fetch(`${this.baseUrl}/api/team/connect`, {
      method: 'POST',
      headers: this.authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ serverUrl, token }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as Record<string, string>).error ?? `Connection failed: ${res.status}`);
    }
    return res.json() as Promise<TeamConnection>;
  }

  async disconnectTeam(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/team/disconnect`, {
      method: 'POST',
      headers: this.authHeaders(),
    });
    if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
  }

  async getTeamStatus(): Promise<TeamConnection | null> {
    const res = await fetch(`${this.baseUrl}/api/team/status`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json() as { connected: boolean; serverUrl?: string; userId?: string; displayName?: string };
    if (!data.connected) return null;
    return {
      serverUrl: data.serverUrl ?? '',
      token: '', // never returned by server
      userId: data.userId ?? '',
      displayName: data.displayName ?? '',
    };
  }

  async listTeams(): Promise<Array<{ id: string; name: string; slug: string; role: string }>> {
    const res = await fetch(`${this.baseUrl}/api/team/teams`, {
      headers: this.authHeaders(),
    });
    if (!res.ok) return [];
    return res.json() as Promise<Array<{ id: string; name: string; slug: string; role: string }>>;
  }

  // ── Events ─────────────────────────────────────────────────────────

  on(event: string, cb: (data: unknown) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => {
      this.listeners.get(event)?.delete(cb);
    };
  }

  // ── Internal helpers ───────────────────────────────────────────────

  private emit(event: string, data: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      for (const cb of cbs) cb(data);
    }
  }

  /**
   * Parse an SSE response body into StreamEvent values.
   * Works with both browser ReadableStream and Node.js response bodies.
   */
  private async *parseSSE(response: Response): AsyncGenerator<StreamEvent> {
    const body = response.body;

    if (!body) {
      yield { type: 'error', content: 'Empty response body' };
      return;
    }

    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on double-newline (SSE event boundary)
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const event = this.parseSSEBlock(part);
          if (event) yield event;
        }
      }

      // Process remaining buffer
      if (buffer.trim()) {
        const event = this.parseSSEBlock(buffer);
        if (event) yield event;
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Parse a single SSE block like:
   *   event: token
   *   data: {"content":"Hello"}
   */
  private parseSSEBlock(block: string): StreamEvent | null {
    let eventType = 'message';
    let data = '';

    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        data = line.slice(6);
      }
    }

    if (!data) return null;

    try {
      const parsed = JSON.parse(data);
      return { type: eventType as StreamEvent['type'], ...parsed };
    } catch {
      return null;
    }
  }
}
