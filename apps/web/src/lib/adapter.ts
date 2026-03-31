// LocalAdapter — HTTP/SSE/WS client for Waggle backend
import { fetchWithTimeout } from './fetch-utils';
import type {
  Workspace, WorkspaceContext, ChatMessage, MemoryFrame,
  AgentStep, Session, SkillPack, FleetSession, CronJob,
  Notification, AgentStatus, Persona, SystemHealth,
  Connector, Settings, StreamEvent, KGNode, KGEdge,
  ModelPricing, WaggleSignal, FileEntry, WorkspaceTemplate,
} from './types';

const DEFAULT_SERVER = 'http://127.0.0.1:3333';

/** Unwrap API responses that return { results: [...] } or { key: [...] } instead of raw arrays */
function unwrapArray<T>(data: any): T[] {
  if (Array.isArray(data)) return data;
  // Find the first array value in the response object
  for (const v of Object.values(data)) {
    if (Array.isArray(v)) return v as T[];
  }
  return [];
}

/** Map backend frameType codes to frontend type names */
const FRAME_TYPE_MAP: Record<string, string> = {
  I: 'insight', F: 'fact', E: 'event', D: 'decision', T: 'task', N: 'entity',
  insight: 'insight', fact: 'fact', event: 'event', decision: 'decision', task: 'task', entity: 'entity',
};
const IMPORTANCE_MAP: Record<string, number> = {
  low: 1, normal: 2, high: 3, critical: 4,
};

/** Normalize a backend memory frame to the frontend MemoryFrame shape */
function normalizeFrame(raw: any): MemoryFrame {
  const content = raw.content ?? '';
  return {
    id: String(raw.id),
    type: (FRAME_TYPE_MAP[raw.frameType] ?? FRAME_TYPE_MAP[raw.type] ?? 'fact') as MemoryFrame['type'],
    title: content.split('\n')[0].slice(0, 80),
    content,
    importance: typeof raw.importance === 'number' ? raw.importance : (IMPORTANCE_MAP[raw.importance] ?? 2),
    timestamp: raw.timestamp ?? raw.created_at ?? '',
    workspaceId: raw.mind ?? raw.workspaceId ?? '',
    metadata: { source: raw.source, gop: raw.gop, accessCount: raw.accessCount },
  };
}

class LocalAdapter {
  private baseUrl: string;
  private authToken: string | null = null;
  private ws: WebSocket | null = null;
  private sseConnections = new Map<string, EventSource>();
  private _connected = false;
  private _connectAttempted = false;

  constructor(serverUrl?: string) {
    this.baseUrl = serverUrl || localStorage.getItem('waggle:server-url') || DEFAULT_SERVER;
  }

  get isConnected() { return this._connected; }
  get hasAttemptedConnect() { return this._connectAttempted; }

  setServerUrl(url: string) {
    this.baseUrl = url;
    localStorage.setItem('waggle:server-url', url);
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
    return fetchWithTimeout(`${this.baseUrl}${path}`, { ...init, headers });
  }

  // --- Workspaces ---
  async getWorkspaces(): Promise<Workspace[]> {
    const res = await this.fetch('/api/workspaces');
    return res.json();
  }

  // --- Workspace Templates ---
  async getWorkspaceTemplates(): Promise<{ templates: WorkspaceTemplate[]; count: number }> {
    const res = await this.fetch('/api/workspace-templates');
    return res.json();
  }

  async createWorkspaceTemplate(data: Omit<WorkspaceTemplate, 'id' | 'builtIn'>): Promise<WorkspaceTemplate> {
    const res = await this.fetch('/api/workspace-templates', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async generateTemplateFromPrompt(
    prompt: string,
    context: { availableConnectors: string[]; availableCommands: string[]; availablePersonas: string[] },
  ): Promise<Omit<WorkspaceTemplate, 'id' | 'builtIn'>> {
    const res = await this.fetch('/api/workspace-templates/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt, ...context }),
    });
    return res.json();
  }

  async updateWorkspaceTemplate(id: string, data: Omit<WorkspaceTemplate, 'id' | 'builtIn'>): Promise<WorkspaceTemplate> {
    const res = await this.fetch(`/api/workspace-templates/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteWorkspaceTemplate(id: string): Promise<void> {
    await this.fetch(`/api/workspace-templates/${id}`, { method: 'DELETE' });
  }

  async createWorkspace(data: { name: string; group: string; persona?: string; agentGroupId?: string; templateId?: string; shared?: boolean }): Promise<Workspace> {
    const res = await this.fetch('/api/workspaces', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async updateWorkspace(id: string, data: Partial<Workspace>): Promise<Workspace> {
    const res = await this.fetch(`/api/workspaces/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async patchWorkspace(id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'templateId' | 'name' | 'group' | 'model'>>): Promise<Workspace> {
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

  // --- Browse (system-level, not workspace-scoped) ---
  async browseLocal(dirPath = '/'): Promise<{ entries: { name: string; path: string; type: string }[]; current: string }> {
    const res = await this.fetch(`/api/browse/local?path=${encodeURIComponent(dirPath)}`);
    return res.json();
  }

  async browseLocalMkdir(dirPath: string): Promise<{ name: string; path: string; type: string }> {
    const res = await this.fetch('/api/browse/local/mkdir', { method: 'POST', body: JSON.stringify({ path: dirPath }) });
    return res.json();
  }

  // --- File Management ---
  async listFiles(workspaceId: string, path = '/'): Promise<FileEntry[]> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/list?path=${encodeURIComponent(path)}`);
    return res.json();
  }

  async uploadFile(workspaceId: string, dirPath: string, file: File): Promise<FileEntry> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', dirPath);
    const res = await fetchWithTimeout(`${this.baseUrl}/api/workspaces/${workspaceId}/files/upload`, {
      method: 'POST',
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      body: formData,
    }, 30000);
    return res.json();
  }

  async downloadFile(workspaceId: string, filePath: string): Promise<Blob> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/download?path=${encodeURIComponent(filePath)}`);
    return res.blob();
  }

  async createDirectory(workspaceId: string, path: string): Promise<FileEntry> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/mkdir`, { method: 'POST', body: JSON.stringify({ path }) });
    return res.json();
  }

  async deleteFile(workspaceId: string, path: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/files/delete`, { method: 'POST', body: JSON.stringify({ path }) });
  }

  async moveFile(workspaceId: string, from: string, to: string): Promise<FileEntry> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/move`, { method: 'POST', body: JSON.stringify({ from, to }) });
    return res.json();
  }

  async copyFile(workspaceId: string, from: string, to: string): Promise<FileEntry> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/copy`, { method: 'POST', body: JSON.stringify({ from, to }) });
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
    let currentEventType = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            // Map SSE event types to StreamEvent types expected by useChat
            let type = currentEventType;
            if (type === 'token') type = 'token';
            else if (type === 'tool') type = 'tool_start';
            else if (type === 'tool_result') type = 'tool_end';
            else if (type === 'done') type = 'done';
            else if (type === 'error') type = 'error';
            else if (type === 'step') type = 'step';
            else if (type === 'approval_request') type = 'approval_request';

            yield { type, data } as StreamEvent;
            currentEventType = '';
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
    return unwrapArray(await res.json());
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
    return unwrapArray(await res.json()).map(normalizeFrame);
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
    return unwrapArray(await res.json()).map(normalizeFrame);
  }

  async getKnowledgeGraph(workspaceId: string): Promise<{ nodes: KGNode[]; edges: KGEdge[] }> {
    const res = await this.fetch(`/api/memory/graph?workspace=${workspaceId}`);
    const data = await res.json();
    // Backend returns {entities, relations} — map to {nodes, edges}
    return {
      nodes: data.nodes ?? data.entities ?? [],
      edges: data.edges ?? data.relations ?? [],
    };
  }

  // --- Events ---
  async getEvents(): Promise<AgentStep[]> {
    const res = await this.fetch('/api/events');
    return unwrapArray(await res.json()).map((e: any) => ({
      id: String(e.id),
      type: e.type ?? e.eventType ?? 'response',
      description: e.description ?? e.output?.slice(0, 100) ?? e.toolName ?? '',
      status: e.status ?? 'complete',
      duration: e.duration,
      timestamp: e.timestamp ?? '',
      details: e.details ?? (e.output ? { output: e.output } : undefined),
    }));
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
    return unwrapArray(await res.json()).map((s: any) => ({
      ...s,
      id: s.id || s.name || s.slug,
      installed: true, // Skills from GET /api/skills are always installed
    }));
  }

  async createSkill(data: { name: string; description: string }): Promise<void> {
    await this.fetch('/api/skills/create', { method: 'POST', body: JSON.stringify(data) });
  }

  async getStarterPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/starter-pack/catalog');
    return unwrapArray(await res.json());
  }

  async getCapabilityPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/capability-packs/catalog');
    return unwrapArray(await res.json());
  }

  async installPack(skillId: string): Promise<void> {
    await this.fetch(`/api/skills/starter-pack/${skillId}`, { method: 'POST', body: '{}' });
  }

  async getCapabilitiesStatus(): Promise<unknown> {
    const res = await this.fetch('/api/capabilities/status');
    return res.json();
  }

  // --- Marketplace ---
  async getMarketplacePacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/marketplace/packs');
    return unwrapArray(await res.json());
  }

  async installMarketplacePack(packId: string): Promise<void> {
    await this.fetch('/api/marketplace/install', { method: 'POST', body: JSON.stringify({ packageId: packId }) });
  }

  async uninstallMarketplacePack(packId: string): Promise<void> {
    await this.fetch('/api/marketplace/uninstall', { method: 'POST', body: JSON.stringify({ packageId: packId }) });
  }

  // --- Fleet ---
  async getFleet(): Promise<FleetSession[]> {
    const res = await this.fetch('/api/fleet');
    return unwrapArray(await res.json());
  }

  async fleetAction(workspaceId: string, action: 'pause' | 'resume' | 'stop'): Promise<void> {
    const serverAction = action === 'stop' ? 'kill' : action;
    await this.fetch(`/api/fleet/${workspaceId}/${serverAction}`, { method: 'POST' });
  }

  async spawnAgent(data: { task: string; persona?: string; model?: string; parentWorkspaceId?: string }): Promise<FleetSession> {
    const res = await this.fetch('/api/fleet/spawn', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  // --- Cron ---
  async getCronJobs(): Promise<CronJob[]> {
    const res = await this.fetch('/api/cron');
    return unwrapArray(await res.json());
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
    return unwrapArray(await res.json()).map((n: any) => ({
      ...n,
      id: String(n.id),
      type: n.category ?? n.type ?? 'agent',
      read: !!n.read,
      timestamp: n.timestamp ?? n.created_at ?? '',
    }));
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
    const res = await this.fetch('/api/settings/test-key', { method: 'POST', body: JSON.stringify({ provider, apiKey: key }) });
    return res.json();
  }

  async getConfig(): Promise<unknown> {
    const res = await this.fetch('/api/config');
    return res.json();
  }

  async getModels(): Promise<string[]> {
    const res = await this.fetch('/api/litellm/models');
    return unwrapArray(await res.json());
  }

  async getProviders(): Promise<{
    providers: Array<{
      id: string; name: string; hasKey: boolean; badge: string | null;
      keyUrl: string | null; requiresKey: boolean;
      models: Array<{ id: string; name: string; cost: string; speed: string }>;
    }>;
    search: Array<{ id: string; name: string; hasKey: boolean; priority: number }>;
    activeSearch: string;
  }> {
    const res = await this.fetch('/api/providers');
    return res.json();
  }

  async getLiteLLMStatus(): Promise<unknown> {
    const res = await this.fetch('/api/litellm/status');
    return res.json();
  }

  async getModelPricing(): Promise<ModelPricing[]> {
    const res = await this.fetch('/api/litellm/pricing');
    return res.json();
  }

  // --- Personas ---
  async getPersonas(): Promise<Persona[]> {
    const res = await this.fetch('/api/personas');
    return unwrapArray(await res.json());
  }

  async createPersona(data: { name: string; description: string; icon?: string; systemPrompt: string; tools?: string[] }): Promise<Persona> {
    const res = await this.fetch('/api/personas', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async deletePersona(id: string): Promise<void> {
    await this.fetch(`/api/personas/${id}`, { method: 'DELETE' });
  }

  async updatePersona(id: string, data: { name?: string; description?: string; icon?: string; systemPrompt?: string; tools?: string[] }): Promise<unknown> {
    const res = await this.fetch(`/api/personas/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }

  async generatePersona(prompt: string): Promise<{ name: string; description: string; systemPrompt: string; tools: string[] }> {
    const res = await this.fetch('/api/personas/generate', { method: 'POST', body: JSON.stringify({ prompt }) });
    return res.json();
  }

  async getCapabilityStatus(): Promise<unknown> {
    const res = await this.fetch('/api/capabilities/status');
    return res.json();
  }

  // --- Agent Groups ---
  async getAgentGroups(): Promise<unknown[]> {
    const res = await this.fetch('/api/agent-groups');
    return unwrapArray(await res.json());
  }

  async createAgentGroup(data: { name: string; description: string; strategy: string; members: { agentId: string; roleInGroup: string; executionOrder: number }[] }): Promise<unknown> {
    const res = await this.fetch('/api/agent-groups', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteAgentGroup(id: string): Promise<void> {
    await this.fetch(`/api/agent-groups/${id}`, { method: 'DELETE' });
  }

  async updateAgentGroup(id: string, data: { name?: string; description?: string; strategy?: string; members?: { agentId: string; roleInGroup: string; executionOrder: number }[] }): Promise<unknown> {
    const res = await this.fetch(`/api/agent-groups/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }

  async runAgentGroup(groupId: string, task: string): Promise<unknown> {
    const res = await this.fetch(`/api/agent-groups/${groupId}/run`, { method: 'POST', body: JSON.stringify({ task, teamId: 'default' }) });
    return res.json();
  }

  async getJobStatus(jobId: string): Promise<{ status: string; startedAt?: string; completedAt?: string; output?: unknown } | null> {
    try {
      const res = await this.fetch(`/api/jobs/${jobId}`);
      return res.json();
    } catch (err) { console.error('[adapter] getJobStatus failed:', err); return null; }
  }

  async cancelJob(jobId: string): Promise<void> {
    await this.fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
  }

  // --- Health ---
  async getSystemHealth(): Promise<SystemHealth> {
    const res = await this.fetch('/health');
    return res.json();
  }

  // --- Connectors ---
  async getConnectors(): Promise<Connector[]> {
    const res = await this.fetch('/api/connectors');
    return unwrapArray(await res.json());
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

  // --- Profile ---
  async getProfile(): Promise<any> {
    const res = await this.fetch('/api/profile');
    return res.json();
  }

  async updateProfile(data: Record<string, unknown>): Promise<any> {
    const res = await this.fetch('/api/profile', { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async analyzeWritingStyle(text: string): Promise<any> {
    const res = await this.fetch('/api/profile/analyze-style', { method: 'POST', body: JSON.stringify({ text }) });
    return res.json();
  }

  async analyzeBrand(description: string): Promise<any> {
    const res = await this.fetch('/api/profile/analyze-brand', { method: 'POST', body: JSON.stringify({ description }) });
    return res.json();
  }

  async researchProfile(): Promise<any> {
    const res = await this.fetch('/api/profile/research', { method: 'POST', body: JSON.stringify({}) });
    return res.json();
  }

  async addVaultSecret(data: { key: string; value: string; type?: string }): Promise<void> {
    await this.fetch('/api/vault', { method: 'POST', body: JSON.stringify({ name: data.key, value: data.value, type: data.type }) });
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
    try {
      const res = await this.fetch('/api/team/members');
      if (!res.ok) return [];
      return unwrapArray(await res.json());
    } catch (err) { console.error('[adapter] getTeamMembers failed:', err); return []; }
  }

  async getTeamActivity(): Promise<{ id: string; user: string; action: string; timestamp: string }[]> {
    try {
      const res = await this.fetch('/api/team/activity');
      if (!res.ok) return [];
      return unwrapArray(await res.json());
    } catch (err) { console.error('[adapter] getTeamActivity failed:', err); return []; }
  }

  async getTeamMessages(workspaceId: string): Promise<unknown[]> {
    try {
      const res = await this.fetch(`/api/team/messages?workspaceId=${workspaceId}`);
      if (!res.ok) return [];
      return unwrapArray(await res.json());
    } catch (err) { console.error('[adapter] getTeamMessages failed:', err); return []; }
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
    return unwrapArray(await res.json());
  }

  // --- File upload ---
  async ingestFile(file: File): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetchWithTimeout(`${this.baseUrl}/api/ingest`, {
      method: 'POST',
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
      body: formData,
    }, 30000);
    return res.json();
  }

  // --- Slash commands ---
  async executeCommand(command: string, workspaceId: string): Promise<unknown> {
    const res = await this.fetch('/api/commands/execute', {
      method: 'POST', body: JSON.stringify({ command, workspaceId }),
    });
    return res.json();
  }

  // --- Waggle Dance ---
  async getWaggleSignals(): Promise<WaggleSignal[]> {
    try {
      const res = await this.fetch('/api/waggle/signals');
      if (!res.ok) return [];
      return unwrapArray(await res.json());
    } catch (err) { console.error('[adapter] getWaggleSignals failed:', err); return []; }
  }

  async publishWaggleSignal(data: Omit<WaggleSignal, 'id' | 'timestamp'>): Promise<WaggleSignal> {
    const res = await this.fetch('/api/waggle/signals', { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async acknowledgeWaggleSignal(id: string): Promise<void> {
    await this.fetch(`/api/waggle/signals/${id}/ack`, { method: 'PATCH' });
  }

  subscribeWaggleDance(onSignal: (signal: WaggleSignal) => void): () => void {
    if (!this._connected) return () => {};
    return this.subscribeSSE('/api/waggle/stream', (data) => onSignal(data as WaggleSignal));
  }

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
