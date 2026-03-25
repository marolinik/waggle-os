// LocalAdapter — HTTP/SSE/WS client for Waggle backend
import type {
  Workspace, WorkspaceContext, ChatMessage, MemoryFrame,
  AgentStep, Session, SkillPack, FleetSession, CronJob,
  Notification, AgentStatus, Persona, SystemHealth,
  Connector, Settings, StreamEvent, KGNode, KGEdge,
} from './types';

const DEFAULT_SERVER = 'http://127.0.0.1:3333';

class LocalAdapter {
  private baseUrl: string;
  private authToken: string | null = null;
  private ws: WebSocket | null = null;
  private sseConnections = new Map<string, EventSource>();
  private _connected = false;
  private _connectAttempted = false;

  constructor(serverUrl?: string) {
    this.baseUrl = serverUrl || localStorage.getItem('waggle_server_url') || DEFAULT_SERVER;
  }

  get isConnected() { return this._connected; }
  get hasAttemptedConnect() { return this._connectAttempted; }

  setServerUrl(url: string) {
    this.baseUrl = url;
    localStorage.setItem('waggle_server_url', url);
    this._connected = false;
    this._connectAttempted = false;
  }

  getServerUrl() {
    return this.baseUrl;
  }

  // --- Auth ---
  async connect(): Promise<{ wsToken: string }> {
    this._connectAttempted = true;
    try {
      const res = await this.fetch('/health');
      const data = await res.json();
      this.authToken = data.wsToken;
      this._connected = true;
      return data;
    } catch (e) {
      this._connected = false;
      throw e;
    }
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string>),
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      return await fetch(`${this.baseUrl}${path}`, { ...init, headers, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  // --- Workspaces ---
  async getWorkspaces(): Promise<Workspace[]> {
    const res = await this.fetch('/api/workspaces');
    return res.json();
  }

  async createWorkspace(data: { name: string; group: string; persona?: string; templateId?: string; shared?: boolean }): Promise<Workspace> {
    const res = await this.fetch('/api/workspaces', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async updateWorkspace(id: string, data: Partial<Workspace>): Promise<Workspace> {
    const res = await this.fetch(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async patchWorkspace(id: string, data: Partial<Pick<Workspace, 'persona' | 'templateId' | 'name' | 'group' | 'model'>>): Promise<Workspace> {
    const res = await this.fetch(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
  }

  async getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    const res = await this.fetch(`/api/workspaces/${id}/context`);
    return res.json();
  }

  async getWorkspaceFiles(workspaceId: string): Promise<unknown[]> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files`);
    return res.json();
  }

  // --- Chat ---
  async *sendMessage(workspaceId: string, message: string, sessionId?: string, persona?: string): AsyncGenerator<StreamEvent> {
    const res = await this.fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, message, sessionId, persona }),
    });

    if (!res.body) return;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            yield JSON.parse(line.slice(6));
          } catch { /* skip malformed */ }
        }
      }
    }
  }

  async abortAgent(workspaceId: string): Promise<void> {
    await this.fetch(`/api/agent/abort`, { method: 'POST', body: JSON.stringify({ workspaceId }) });
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.fetch(`/api/chat/history?session=${sessionId}`, { method: 'DELETE' });
  }

  async getHistory(workspaceId: string, sessionId: string): Promise<ChatMessage[]> {
    const res = await this.fetch(`/api/history?workspace=${workspaceId}&session=${sessionId}`);
    return res.json();
  }

  // --- Sessions ---
  async getSessions(workspaceId: string): Promise<Session[]> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/sessions`);
    return res.json();
  }

  async createSession(workspaceId: string): Promise<Session> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/sessions`, { method: 'POST' });
    return res.json();
  }

  async renameSession(workspaceId: string, sessionId: string, title: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}`, {
      method: 'PATCH', body: JSON.stringify({ title }),
    });
  }

  async deleteSession(sessionId: string, workspaceId: string): Promise<void> {
    await this.fetch(`/api/sessions/${sessionId}?workspace=${workspaceId}`, { method: 'DELETE' });
  }

  async searchSessions(workspaceId: string, query: string): Promise<Session[]> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/sessions/search?q=${encodeURIComponent(query)}`);
    return res.json();
  }

  async exportSession(workspaceId: string, sessionId: string): Promise<string> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/sessions/${sessionId}/export`);
    return res.text();
  }

  // --- Memory ---
  async getMemoryFrames(workspaceId: string, limit = 50): Promise<MemoryFrame[]> {
    const res = await this.fetch(`/api/memory/frames?limit=${limit}&workspace=${workspaceId}`);
    return res.json();
  }

  async addMemoryFrame(frame: Omit<MemoryFrame, 'id'>): Promise<MemoryFrame> {
    const res = await this.fetch('/api/memory/frames', { method: 'POST', body: JSON.stringify(frame) });
    return res.json();
  }

  async updateMemoryFrame(id: string, data: Partial<MemoryFrame>): Promise<MemoryFrame> {
    const res = await this.fetch(`/api/memory/frames/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteMemoryFrame(id: string): Promise<void> {
    await this.fetch(`/api/memory/frames/${id}`, { method: 'DELETE' });
  }

  async searchMemory(query: string, scope?: string): Promise<MemoryFrame[]> {
    const res = await this.fetch(`/api/memory/search?q=${encodeURIComponent(query)}${scope ? `&scope=${scope}` : ''}`);
    return res.json();
  }

  async getKnowledgeGraph(workspaceId: string): Promise<{ nodes: KGNode[]; edges: KGEdge[] }> {
    const res = await this.fetch(`/api/memory/graph?workspace=${workspaceId}`);
    return res.json();
  }

  // --- Events ---
  async getEvents(): Promise<AgentStep[]> {
    const res = await this.fetch('/api/events');
    return res.json();
  }

  subscribeEvents(onEvent: (step: AgentStep) => void): () => void {
    if (!this._connected) return () => {};
    return this.subscribeSSE('/api/events/stream', (data) => onEvent(data as AgentStep));
  }

  // --- Agent ---
  async getAgentStatus(): Promise<AgentStatus> {
    const res = await this.fetch('/api/agent/status');
    return res.json();
  }

  async getAgentCost(): Promise<{ totalCost: number; totalTokens: number }> {
    const res = await this.fetch('/api/agent/cost');
    return res.json();
  }

  async setModel(model: string): Promise<void> {
    await this.fetch('/api/agent/model', { method: 'PUT', body: JSON.stringify({ model }) });
  }

  async getModel(): Promise<string> {
    const res = await this.fetch('/api/agent/model');
    return res.json();
  }

  // --- Skills ---
  async getSkills(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills');
    return res.json();
  }

  async createSkill(data: { name: string; description: string }): Promise<void> {
    await this.fetch('/api/skills/create', { method: 'POST', body: JSON.stringify(data) });
  }

  async getStarterPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/starter-pack/catalog');
    return res.json();
  }

  async getCapabilityPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/capability-packs/catalog');
    return res.json();
  }

  async installPack(skillId: string): Promise<void> {
    await this.fetch(`/api/skills/starter-pack/${skillId}`, { method: 'POST' });
  }

  async getCapabilitiesStatus(): Promise<unknown> {
    const res = await this.fetch('/api/capabilities/status');
    return res.json();
  }

  // --- Marketplace ---
  async getMarketplacePacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/marketplace/packs');
    return res.json();
  }

  async installMarketplacePack(packId: string): Promise<void> {
    await this.fetch('/api/marketplace/install', { method: 'POST', body: JSON.stringify({ packId }) });
  }

  async uninstallMarketplacePack(packId: string): Promise<void> {
    await this.fetch('/api/marketplace/uninstall', { method: 'POST', body: JSON.stringify({ packId }) });
  }

  // --- Fleet ---
  async getFleet(): Promise<FleetSession[]> {
    const res = await this.fetch('/api/fleet');
    return res.json();
  }

  async fleetAction(workspaceId: string, action: 'pause' | 'resume' | 'stop'): Promise<void> {
    await this.fetch(`/api/fleet/${workspaceId}/${action}`, { method: 'POST' });
  }

  async spawnAgent(data: { task: string; persona?: string; model?: string; parentWorkspaceId?: string }): Promise<FleetSession> {
    const res = await this.fetch('/api/fleet/spawn', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  // --- Cron ---
  async getCronJobs(): Promise<CronJob[]> {
    const res = await this.fetch('/api/cron');
    return res.json();
  }

  async createCronJob(data: Omit<CronJob, 'id'>): Promise<CronJob> {
    const res = await this.fetch('/api/cron', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async updateCronJob(id: string, data: Partial<CronJob>): Promise<CronJob> {
    const res = await this.fetch(`/api/cron/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteCronJob(id: string): Promise<void> {
    await this.fetch(`/api/cron/${id}`, { method: 'DELETE' });
  }

  async triggerCronJob(id: string): Promise<void> {
    await this.fetch(`/api/cron/${id}/trigger`, { method: 'POST' });
  }

  // --- Notifications ---
  subscribeNotifications(onNotification: (n: Notification) => void): () => void {
    if (!this._connected) return () => {};
    return this.subscribeSSE('/api/notifications/stream', (data) => onNotification(data as Notification));
  }

  async getNotificationHistory(): Promise<Notification[]> {
    const res = await this.fetch('/api/notifications/history');
    return res.json();
  }

  async markNotificationRead(id: string): Promise<void> {
    await this.fetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
  }

  async markAllNotificationsRead(): Promise<void> {
    await this.fetch('/api/notifications/read-all', { method: 'POST' });
  }

  // --- Approval ---
  async getPendingApprovals(): Promise<unknown[]> {
    const res = await this.fetch('/api/approval/pending');
    return res.json();
  }

  async respondApproval(requestId: string, approved: boolean): Promise<void> {
    await this.fetch(`/api/approval/${requestId}`, { method: 'POST', body: JSON.stringify({ approved }) });
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    const res = await this.fetch('/api/settings');
    return res.json();
  }

  async saveSettings(settings: Partial<Settings>): Promise<void> {
    await this.fetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  async testApiKey(provider: string, key: string): Promise<{ valid: boolean }> {
    const res = await this.fetch('/api/settings/test-key', { method: 'POST', body: JSON.stringify({ provider, key }) });
    return res.json();
  }

  async getConfig(): Promise<unknown> {
    const res = await this.fetch('/api/config');
    return res.json();
  }

  async getModels(): Promise<string[]> {
    const res = await this.fetch('/api/litellm/models');
    return res.json();
  }

  async getLiteLLMStatus(): Promise<unknown> {
    const res = await this.fetch('/api/litellm/status');
    return res.json();
  }

  // --- Personas ---
  async getPersonas(): Promise<Persona[]> {
    const res = await this.fetch('/api/personas');
    return res.json();
  }

  // --- Health ---
  async getSystemHealth(): Promise<SystemHealth> {
    const res = await this.fetch('/health');
    return res.json();
  }

  // --- Connectors ---
  async getConnectors(): Promise<Connector[]> {
    const res = await this.fetch('/api/connectors');
    return res.json();
  }

  async getConnectorHealth(id: string): Promise<unknown> {
    const res = await this.fetch(`/api/connectors/${id}/health`);
    return res.json();
  }

  async connectConnector(id: string): Promise<void> {
    await this.fetch(`/api/connectors/${id}/connect`, { method: 'POST' });
  }

  async disconnectConnector(id: string): Promise<void> {
    await this.fetch(`/api/connectors/${id}/disconnect`, { method: 'POST' });
  }

  // --- Vault ---
  async getVault(): Promise<unknown> {
    const res = await this.fetch('/api/vault');
    return res.json();
  }

  async addVaultSecret(data: { key: string; value: string }): Promise<void> {
    await this.fetch('/api/vault', { method: 'POST', body: JSON.stringify(data) });
  }

  async deleteVaultSecret(id: string): Promise<void> {
    await this.fetch(`/api/vault/${id}`, { method: 'DELETE' });
  }

  // --- Mind ---
  async getMindIdentity(): Promise<unknown> {
    const res = await this.fetch('/api/mind/identity');
    return res.json();
  }

  async getMindAwareness(): Promise<unknown> {
    const res = await this.fetch('/api/mind/awareness');
    return res.json();
  }

  async getMindSkills(): Promise<unknown> {
    const res = await this.fetch('/api/mind/skills');
    return res.json();
  }

  // --- Team ---
  async teamConnect(serverUrl: string, token: string): Promise<void> {
    await this.fetch('/api/team/connect', { method: 'POST', body: JSON.stringify({ serverUrl, token }) });
  }

  async teamDisconnect(): Promise<void> {
    await this.fetch('/api/team/disconnect', { method: 'POST' });
  }

  async getTeamStatus(): Promise<{ connected: boolean; teamName?: string }> {
    const res = await this.fetch('/api/team/status');
    return res.json();
  }

  async getTeamMembers(): Promise<{ id: string; name: string; status: string; avatar?: string }[]> {
    const res = await this.fetch('/api/team/members');
    return res.json();
  }

  async getTeamActivity(): Promise<{ id: string; user: string; action: string; timestamp: string }[]> {
    const res = await this.fetch('/api/team/activity');
    return res.json();
  }

  async getTeamMessages(workspaceId: string): Promise<unknown[]> {
    const res = await this.fetch(`/api/team/messages?workspaceId=${workspaceId}`);
    return res.json();
  }

  // --- Costs ---
  async getCosts(): Promise<unknown> {
    const res = await this.fetch('/api/costs');
    return res.json();
  }

  async getCostByWorkspace(): Promise<unknown> {
    const res = await this.fetch('/api/cost/by-workspace');
    return res.json();
  }

  // --- Audit ---
  async getAuditInstalls(): Promise<unknown[]> {
    const res = await this.fetch('/api/audit/installs');
    return res.json();
  }

  // --- File upload ---
  async ingestFile(file: File): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${this.baseUrl}/api/ingest`, {
      method: 'POST',
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      body: formData,
    });
    return res.json();
  }

  // --- Slash commands ---
  async executeCommand(command: string, workspaceId: string): Promise<unknown> {
    const res = await this.fetch('/api/commands/execute', {
      method: 'POST', body: JSON.stringify({ command, workspaceId }),
    });
    return res.json();
  }

  // --- SSE helper ---
  private subscribeSSE(path: string, onData: (data: unknown) => void): () => void {
    const url = `${this.baseUrl}${path}`;
    if (this.sseConnections.has(path)) {
      this.sseConnections.get(path)!.close();
    }
    const es = new EventSource(url);
    this.sseConnections.set(path, es);
    es.onmessage = (e) => {
      try { onData(JSON.parse(e.data)); } catch { /* skip */ }
    };
    es.onerror = () => {
      es.close();
      this.sseConnections.delete(path);
    };
    return () => {
      es.close();
      this.sseConnections.delete(path);
    };
  }

  // --- WebSocket ---
  connectWebSocket(onMessage: (data: unknown) => void): () => void {
    const wsUrl = this.baseUrl.replace('http', 'ws') + `/ws?token=${this.authToken}`;
    this.ws = new WebSocket(wsUrl);
    this.ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { /* skip */ }
    };
    return () => {
      this.ws?.close();
      this.ws = null;
    };
  }
}

export type { LocalAdapter };
export const adapter = new LocalAdapter();
export default LocalAdapter;
