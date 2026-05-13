// LocalAdapter — HTTP/SSE/WS client for Waggle backend
import { fetchWithTimeout } from './fetch-utils';
import {
  isTauri,
  recallMemory as tauriRecallMemory,
  saveMemory as tauriSaveMemory,
  searchEntities as tauriSearchEntities,
  getIdentity as tauriGetIdentity,
  type FrameImportance,
  type FrameSource,
  type IdentityResponse,
} from './tauri-bindings';
import type {
  Workspace, WorkspaceContext, ChatMessage, MemoryFrame,
  AgentStep, Session, SkillPack, FleetSession, CronJob,
  Notification, AgentStatus, Persona, SystemHealth,
  Connector, Settings, StreamEvent, KGNode, KGEdge,
  ModelPricing, WaggleSignal, FileEntry, WorkspaceTemplate,
} from './types';

/**
 * CC Sesija A §2.2 — map adapter `MemoryFrame.importance` (number 1-4) to the
 * Tauri command's string enum. Inverse of IMPORTANCE_MAP.
 */
const IMPORTANCE_NUM_TO_STRING: Record<number, FrameImportance> = {
  1: 'low', 2: 'normal', 3: 'high', 4: 'critical',
};

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

/** Normalize a backend cron schedule row to the frontend CronJob shape. */
function normalizeCronJob(raw: Record<string, unknown>): CronJob {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    // Server emits `cronExpr`; legacy client contract named it `schedule`.
    schedule: (raw.schedule as string) ?? (raw.cronExpr as string) ?? '',
    workspaceId: (raw.workspaceId as string) ?? '',
    enabled: raw.enabled === true || raw.enabled === 1,
    lastRun: (raw.lastRun as string) ?? (raw.lastRunAt as string) ?? undefined,
    nextRun: (raw.nextRun as string) ?? (raw.nextRunAt as string) ?? undefined,
  };
}

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
      const data = await this.healthProbe();
      this.authToken = data.wsToken;
      this._connected = true;
      return data;
    } catch (e) {
      this._connected = false;
      throw e;
    }
  }

  /**
   * Probe `/health` against the configured baseUrl, with a single auto-discovery
   * fallback to DEFAULT_SERVER (FR #10).
   *
   * Why this exists: localStorage may carry a stale `waggle:server-url` from a
   * prior Tauri build or wrong port, or be empty after a manual clear. The
   * constructor already falls back to DEFAULT_SERVER when localStorage is empty,
   * but a stored-but-stale URL would otherwise stick until the user navigates
   * to Settings. Auto-rediscovery keeps a fresh user on the rails.
   *
   * On a successful fallback we persist DEFAULT_SERVER so the next cold start
   * begins on the right URL. On total failure we restore the original baseUrl
   * (so Settings still shows what the user had configured) and rethrow the
   * original error — the second-attempt error is less informative.
   */
  private async healthProbe(): Promise<SystemHealth> {
    try {
      const res = await this.fetch('/health');
      return await res.json();
    } catch (firstErr) {
      if (this.baseUrl === DEFAULT_SERVER) throw firstErr;
      const prevUrl = this.baseUrl;
      this.baseUrl = DEFAULT_SERVER;
      try {
        const res = await this.fetch('/health');
        const data = await res.json();
        try { localStorage.setItem('waggle:server-url', DEFAULT_SERVER); } catch { /* private mode etc. */ }
        return data;
      } catch {
        this.baseUrl = prevUrl;
        throw firstErr;
      }
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
    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, { ...init, headers });
    if (res.status === 403) {
      const clone = res.clone();
      try {
        const body = await clone.json();
        if (body.error === 'TIER_INSUFFICIENT') {
          window.dispatchEvent(new CustomEvent('waggle:tier-insufficient', {
            detail: { required: body.required, actual: body.actual, message: body.message },
          }));
        }
      } catch { /* not JSON — ignore */ }
    }
    return res;
  }

  // --- Workspaces ---
  async getWorkspaces(): Promise<Workspace[]> {
    const res = await this.fetch('/api/workspaces');
    const list = (await res.json()) as Array<Record<string, unknown>>;
    // P1 (PDF 2026-04-17): server stores the selected persona as `personaId`.
    // UI reads `ws.persona`, so normalise both here.
    return list.map(ws => ({
      ...ws,
      persona: (ws.persona as string | undefined) ?? (ws.personaId as string | undefined),
    })) as Workspace[];
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

  async createWorkspace(data: { name: string; group: string; persona?: string; agentGroupId?: string; templateId?: string; shared?: boolean; model?: string; personaId?: string }): Promise<Workspace> {
    // P1 (PDF 2026-04-17): server expects `personaId` (see packages/core/src/workspace-config.ts),
    // but onboarding + older call sites pass `persona`. Bridge both so the selected
    // persona is actually persisted on the workspace record.
    const payload = { ...data, personaId: data.personaId ?? data.persona };
    const res = await this.fetch('/api/workspaces', { method: 'POST', body: JSON.stringify(payload) });
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
  async *sendMessage(
    workspaceId: string,
    message: string,
    sessionId?: string,
    persona?: string,
    autonomy?: { level: 'normal' | 'trusted' | 'yolo'; expiresAt?: number },
  ): AsyncGenerator<StreamEvent> {
    // CC Sesija A §2.2 — thread the user-selected Faza 1 GEPA shape into the
    // chat body. Sidecar /api/chat ignores `shape` until A3.1 wires it into
    // runRetrievalAgentLoop; carrying it now means A3.1 is a one-line server
    // change with no client redeploy needed.
    const { getSelectedShape } = await import('./shape-selection');
    const shape = getSelectedShape();
    const res = await this.fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ workspaceId, message, sessionId, persona, autonomy, shape }),
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
    await this.fetch(`/api/sessions/${sessionId}?workspace=${encodeURIComponent(workspaceId)}`, {
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
    // CC Sesija A §2.2 — Tauri IPC path for desktop builds.
    if (isTauri()) {
      const importance = typeof frame.importance === 'number'
        ? IMPORTANCE_NUM_TO_STRING[frame.importance]
        : undefined;
      const raw = await tauriSaveMemory({
        content: frame.content,
        workspaceId: frame.workspaceId,
        importance,
        source: (frame.metadata?.source as FrameSource | undefined) ?? undefined,
      });
      // Sidecar shapes vary; let normalizeFrame handle either { frame } envelope or raw frame
      const frameObj = (raw.frame as Record<string, unknown>) ?? raw;
      return normalizeFrame(frameObj);
    }
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

  async incrementFrameAccess(id: string, workspaceId?: string): Promise<{ accessCount: number }> {
    const qs = workspaceId ? `?workspace=${encodeURIComponent(workspaceId)}` : '';
    const res = await this.fetch(`/api/memory/frames/${id}/access${qs}`, { method: 'PATCH' });
    const body = await res.json() as { accessCount?: number };
    return { accessCount: typeof body.accessCount === 'number' ? body.accessCount : 0 };
  }

  async searchMemory(query: string, scope?: string): Promise<MemoryFrame[]> {
    // CC Sesija A §2.2 — Tauri IPC path for desktop builds.
    if (isTauri()) {
      const resp = await tauriRecallMemory({
        query,
        scope: scope as 'all' | 'personal' | 'workspace' | 'global' | undefined,
      });
      return resp.results.map((r) => normalizeFrame(r as Record<string, any>));
    }
    const res = await this.fetch(`/api/memory/search?q=${encodeURIComponent(query)}${scope ? `&scope=${scope}` : ''}`);
    return unwrapArray(await res.json()).map(normalizeFrame);
  }

  async searchTeamMemory(query: string, limit = 20): Promise<Array<{ id: string; content: string; authorId: string; authorName: string; importance: string; timestamp: string }>> {
    try {
      const res = await this.fetch(`/api/team/memory/search?q=${encodeURIComponent(query)}&limit=${limit}`);
      const data = await res.json();
      return data.results ?? [];
    } catch {
      return [];
    }
  }

  async getLocalInferenceHardware(): Promise<{ hardware: Record<string, unknown>; source: string }> {
    const res = await this.fetch('/api/local-inference/hardware');
    return res.json();
  }

  async getLocalInferenceModels(useCase?: string): Promise<{ models: Array<Record<string, unknown>>; source: string }> {
    const url = useCase ? `/api/local-inference/models?useCase=${encodeURIComponent(useCase)}` : '/api/local-inference/models';
    const res = await this.fetch(url);
    return res.json();
  }

  async getLocalInferenceStatus(): Promise<{ servers: Array<Record<string, unknown>>; ollamaInstalled: boolean; totalLocalModels: number }> {
    const res = await this.fetch('/api/local-inference/status');
    return res.json();
  }

  async pullLocalModel(model: string): Promise<{ ok: boolean }> {
    const res = await this.fetch('/api/local-inference/pull', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model }) });
    return res.json();
  }

  async getKnowledgeGraph(workspaceId: string, scope?: 'current' | 'personal' | 'all'): Promise<{ nodes: KGNode[]; edges: KGEdge[] }> {
    // CC Sesija A §2.2 — Tauri IPC path for desktop builds.
    if (isTauri()) {
      const args: { workspaceId?: string; scope?: 'all' | 'personal' | 'workspace' | 'global' } = {};
      if (scope === 'all') {
        args.scope = 'all';
      } else if (scope === 'personal') {
        args.scope = 'personal';
      } else {
        args.workspaceId = workspaceId;
      }
      const data = await tauriSearchEntities(args);
      return {
        nodes: ((data as { nodes?: unknown; entities?: unknown }).nodes ?? (data as { entities?: unknown }).entities ?? []) as KGNode[],
        edges: ((data as { edges?: unknown; relations?: unknown }).edges ?? (data as { relations?: unknown }).relations ?? []) as KGEdge[],
      };
    }
    const params = new URLSearchParams();
    if (scope === 'all') {
      params.set('scope', 'all');
    } else if (scope === 'personal') {
      params.set('scope', 'personal');
    } else {
      params.set('workspace', workspaceId);
    }
    const res = await this.fetch(`/api/memory/graph?${params}`);
    const data = await res.json();
    return {
      nodes: data.nodes ?? data.entities ?? [],
      edges: data.edges ?? data.relations ?? [],
    };
  }

  /**
   * CC Sesija A §2.2 + A1.1 — get the current user identity record.
   * Backed end-to-end by /api/identity sidecar route (A1.1, 2026-04-30):
   * returns either a configured identity (configured: true + IdentityLayer
   * fields) or a placeholder (configured: false + null fields + _note).
   * Tauri path uses IPC; web path uses HTTP fetch. 404/error fallbacks
   * remain as defense-in-depth for sidecar outages.
   */
  async getIdentity(): Promise<IdentityResponse> {
    if (isTauri()) {
      return tauriGetIdentity();
    }
    try {
      const res = await this.fetch('/api/identity');
      if (res.status === 404) {
        return { configured: false, name: null, _note: 'sidecar route 404 (unexpected post-A1.1)' };
      }
      return res.json();
    } catch {
      return { configured: false, name: null, _note: 'identity fetch failed' };
    }
  }

  // --- Events ---
  async getEvents(workspaceId?: string): Promise<AgentStep[]> {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    const res = await this.fetch(`/api/events${qs}`);
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

  async getTimeline(workspaceId: string, since?: string, limit = 200): Promise<TimelineEvent[]> {
    const params = new URLSearchParams({ workspaceId, limit: String(limit) });
    if (since) params.set('from', since);
    const res = await this.fetch(`/api/events?${params}`);
    const json = await res.json();
    const events = Array.isArray(json) ? json : json.events ?? [];
    return events.map((e: Record<string, unknown>) => ({
      id: e.id as number,
      eventType: (e.event_type ?? e.eventType ?? 'unknown') as string,
      toolName: (e.tool_name ?? e.toolName) as string | undefined,
      input: e.input as string | undefined,
      output: e.output as string | undefined,
      model: e.model as string | undefined,
      tokensUsed: e.tokens_used as number | undefined,
      cost: e.cost as number | undefined,
      sessionId: (e.session_id ?? e.sessionId) as string | undefined,
      approved: e.approved as boolean | undefined,
      timestamp: (e.timestamp ?? '') as string,
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
    const data = await res.json();
    // Server returns { model: "..." }; the declared contract is a plain string.
    // Defensively accept either shape so older callers and future raw-string
    // server responses both keep working.
    if (typeof data === 'string') return data;
    return data?.model ?? '';
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
    // Server emits { skills: [{ id, name, description, family, familyLabel, state, isWorkflow }], families }.
    // SkillPack contract uses { category, trust, installed } — map server shape so
    // CapabilitiesApp renders category badges + trust icons correctly.
    const items = unwrapArray<Record<string, unknown>>(await res.json());
    return items.map((s) => ({
      id: String(s.id ?? s.name ?? ''),
      name: String(s.name ?? s.id ?? ''),
      description: String(s.description ?? ''),
      category: String(s.family ?? s.category ?? 'other'),
      trust: 'verified',
      installed: s.state === 'active' || s.state === 'installed',
      skills: Array.isArray(s.skills) ? (s.skills as string[]) : [],
    }));
  }

  async getCapabilityPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/capability-packs/catalog');
    // Server emits { packs: [{ id, name, description, skills:[ids], skillStates, packState, installedCount, totalCount }] }.
    const items = unwrapArray<Record<string, unknown>>(await res.json());
    return items.map((p) => ({
      id: String(p.id ?? p.name ?? ''),
      name: String(p.name ?? p.id ?? ''),
      description: String(p.description ?? ''),
      category: String(p.category ?? 'pack'),
      trust: 'verified',
      installed: p.packState === 'complete',
      skills: Array.isArray(p.skills) ? (p.skills as string[]) : [],
    }));
  }

  async installPack(skillId: string): Promise<void> {
    const res = await this.fetch(`/api/skills/starter-pack/${skillId}`, { method: 'POST', body: '{}' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const err = new Error((body as { error?: string }).error ?? `Install failed (${res.status})`) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      err.body = body;
      throw err;
    }
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
    const res = await this.fetch('/api/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({ packageId: packId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const err = new Error(
        (body as { error?: string; message?: string }).error
          ?? (body as { message?: string }).message
          ?? `Install failed (${res.status})`,
      ) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      err.body = body;
      throw err;
    }
  }

  async uninstallMarketplacePack(packId: string): Promise<void> {
    const res = await this.fetch('/api/marketplace/uninstall', {
      method: 'POST',
      body: JSON.stringify({ packageId: packId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      throw new Error((body as { error?: string }).error ?? `Uninstall failed (${res.status})`);
    }
  }

  // --- Fleet ---
  async getFleet(): Promise<FleetSession[]> {
    const res = await this.fetch('/api/fleet');
    const list = unwrapArray<Record<string, unknown>>(await res.json());
    // Server (packages/server/src/local/routes/fleet.ts) emits
    // { durationMs, tokensUsed, ... } but the frontend FleetSession contract
    // declares { duration, tokenUsage, ... }. MissionControlApp renders
    // s.tokenUsage.toLocaleString() inline — undefined → crash. Normalise
    // here. Accept either shape so the server can converge later.
    return list.map((s) => ({
      workspaceId: String(s.workspaceId ?? ''),
      workspaceName: String(s.workspaceName ?? s.workspaceId ?? ''),
      status: (s.status as FleetSession['status']) ?? 'idle',
      duration: Number(s.duration ?? s.durationMs ?? 0),
      toolCount: Number(s.toolCount ?? 0),
      model: String(s.model ?? 'default'),
      tokenUsage: Number(s.tokenUsage ?? s.tokensUsed ?? 0),
    }));
  }

  async fleetAction(workspaceId: string, action: 'pause' | 'resume' | 'stop'): Promise<void> {
    const serverAction = action === 'stop' ? 'kill' : action;
    await this.fetch(`/api/fleet/${workspaceId}/${serverAction}`, { method: 'POST' });
  }

  async spawnAgent(data: { task: string; persona?: string; model?: string; parentWorkspaceId?: string }): Promise<FleetSession> {
    const res = await this.fetch('/api/fleet/spawn', { method: 'POST', body: JSON.stringify(data) });
    if (!res.ok) {
      // FR #15 Phase A: surface backend errors instead of returning the
      // error body as if it were a successful FleetSession (which is what
      // produced the "silent no-op" symptom in PM friction report #15).
      let detail: string | undefined;
      try {
        const body = await res.clone().json();
        detail = (body?.message as string) ?? (body?.error as string);
      } catch { /* not JSON */ }
      throw new Error(`Spawn failed (${res.status}): ${detail ?? res.statusText}`);
    }
    return res.json();
  }

  // --- Cron ---
  // Server emits { cronExpr, lastRunAt, nextRunAt, jobType, ... } but the
  // UI reads legacy field names (`schedule`, `lastRun`, `nextRun`). Keep
  // the client contract stable by remapping on read.
  async getCronJobs(): Promise<CronJob[]> {
    const res = await this.fetch('/api/cron');
    const rows = unwrapArray(await res.json()) as Array<Record<string, unknown>>;
    return rows.map(normalizeCronJob);
  }

  async createCronJob(input: {
    name: string;
    cronExpr: string;
    jobType: import('./cron-presets').CronJobType;
    jobConfig?: Record<string, unknown>;
    workspaceId?: string;
    enabled?: boolean;
  }): Promise<CronJob> {
    // M-44 / P26 fix: the POST /api/cron endpoint requires `cronExpr` +
    // `jobType`. The previous signature forwarded `{ schedule, ... }`
    // from Omit<CronJob, 'id'>, which the server rejected with 400.
    const res = await this.fetch('/api/cron', { method: 'POST', body: JSON.stringify(input) });
    return normalizeCronJob(await res.json() as Record<string, unknown>);
  }

  async updateCronJob(id: string, data: Partial<CronJob>): Promise<CronJob> {
    const res = await this.fetch(`/api/cron/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteCronJob(id: string): Promise<void> {
    await this.fetch(`/api/cron/${id}`, { method: 'DELETE' });
  }

  async triggerCronJob(id: string): Promise<{ triggered: boolean; autoEnabled?: boolean; schedule?: CronJob }> {
    // Server auto-enables a disabled job on trigger (M-43 / P25). The
    // response carries the post-trigger `schedule` so callers can sync
    // local state without a round-trip refetch.
    const res = await this.fetch(`/api/cron/${id}/trigger`, { method: 'POST' });
    return res.json();
  }

  // --- Notifications ---
  subscribeNotifications(onNotification: (n: Notification) => void): () => void {
    if (!this._connected) return () => {};
    return this.subscribeSSE('/api/notifications/stream', (data) => onNotification(data as Notification));
  }

  /**
   * Phase A.3: subscribe to sub-agent status events on the notifications stream.
   *
   * The server emits these as NAMED SSE events (`event: subagent_status`), so
   * the default `onmessage` used by subscribeNotifications doesn't catch them.
   * We open a dedicated EventSource with `addEventListener('subagent_status')`.
   */
  subscribeSubagentStatus(
    onEvent: (event: {
      type: 'subagent_status';
      workspaceId: string;
      agents: Array<{
        id: string;
        name: string;
        role: string;
        status: 'pending' | 'running' | 'done' | 'failed';
        task: string;
        toolsUsed: string[];
        startedAt?: number;
        completedAt?: number;
      }>;
      timestamp: string;
    }) => void,
  ): () => void {
    if (!this._connected) return () => {};
    const url = `${this.baseUrl}/api/notifications/stream`;
    const es = new EventSource(url);
    const handler = (e: MessageEvent) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* skip malformed */ }
    };
    es.addEventListener('subagent_status', handler as EventListener);
    es.onerror = () => { es.close(); };
    return () => {
      es.removeEventListener('subagent_status', handler as EventListener);
      es.close();
    };
  }

  /**
   * M-07: subscribe to live harvest progress events.
   *
   * Server emits `data: {phase, current, total, source}` (un-named SSE) on
   * `GET /api/harvest/progress` for every step of `harvest/commit`. The
   * `ready` promise resolves when the SSE handshake completes (or after 1s
   * safety timeout) so the caller can defer the POST until the listener is
   * registered server-side. Otherwise early events would fire before any
   * client is subscribed.
   */
  subscribeHarvestProgress(
    onEvent: (data: { phase: string; current: number; total: number; source: string }) => void,
  ): { ready: Promise<void>; close: () => void } {
    if (!this._connected) {
      return { ready: Promise.resolve(), close: () => {} };
    }
    const url = `${this.baseUrl}/api/harvest/progress`;
    const es = new EventSource(url);

    let resolved = false;
    const ready = new Promise<void>((resolve) => {
      const finish = () => { if (!resolved) { resolved = true; resolve(); } };
      if (es.readyState === EventSource.OPEN) return finish();
      es.addEventListener('open', finish, { once: true });
      // Safety: if the handshake stalls, proceed anyway after 1s so a
      // flaky SSE doesn't block the actual import indefinitely.
      setTimeout(finish, 1000);
    });

    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* skip malformed */ }
    };
    es.onerror = () => { /* keep open — server may reconnect; close handled by caller */ };

    return { ready, close: () => es.close() };
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
  async getPendingApprovals(): Promise<{ pending: Array<{ requestId: string; toolName: string; input: Record<string, unknown>; timestamp: number }>; count: number }> {
    const res = await this.fetch('/api/approval/pending');
    return res.json();
  }

  async respondApproval(
    requestId: string,
    approved: boolean,
    opts: { always?: boolean; sourceWorkspaceId?: string | null } = {},
  ): Promise<void> {
    await this.fetch(`/api/approval/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({
        approved,
        always: opts.always === true,
        sourceWorkspaceId: opts.sourceWorkspaceId ?? null,
      }),
    });
  }

  async getApprovalGrants(): Promise<{
    grants: Array<{
      id: string;
      toolName: string;
      targetKey: string;
      sourceWorkspaceId: string | null;
      description: string;
      grantedAt: string;
      expiresAt: string | null;
    }>;
    count: number;
  }> {
    const res = await this.fetch('/api/approval/grants');
    return res.json();
  }

  async revokeApprovalGrant(id: string): Promise<void> {
    await this.fetch(`/api/approval/grants/${id}`, { method: 'DELETE' });
  }

  async clearApprovalGrants(): Promise<void> {
    await this.fetch('/api/approval/grants/clear', { method: 'POST' });
  }

  // --- Settings ---
  async getSettings(): Promise<Settings> {
    const res = await this.fetch('/api/settings');
    return res.json();
  }

  async saveSettings(settings: Partial<Settings>): Promise<void> {
    await this.fetch('/api/settings', { method: 'PUT', body: JSON.stringify(settings) });
  }

  // P4 — Permissions: defaultAutonomy + externalGates + workspaceOverrides.
  // Separate from /api/settings because the permissions surface has its own
  // lifecycle (YOLO/trusted is a safety concern, not a preference).
  async getPermissions(): Promise<{
    defaultAutonomy: 'normal' | 'trusted' | 'yolo';
    externalGates: string[];
    workspaceOverrides: Record<string, string[]>;
  }> {
    const res = await this.fetch('/api/settings/permissions');
    return res.json();
  }

  async savePermissions(data: Partial<{
    defaultAutonomy: 'normal' | 'trusted' | 'yolo';
    externalGates: string[];
    workspaceOverrides: Record<string, string[]>;
  }>): Promise<void> {
    await this.fetch('/api/settings/permissions', { method: 'PUT', body: JSON.stringify(data) });
  }

  async testApiKey(provider: string, key: string): Promise<{ valid: boolean }> {
    const res = await this.fetch('/api/settings/test-key', { method: 'POST', body: JSON.stringify({ provider, apiKey: key }) });
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
    const raw = await res.json();
    // Server (packages/server/src/local/routes/litellm.ts) emits
    // { inputPer1k, outputPer1k } but the frontend ModelPricing contract
    // declares { inputCostPer1k, outputCostPer1k }. Normalise here so callers
    // (currently only SpawnAgentDialog) can rely on the declared shape and
    // the .toFixed() formatting in the confirm step does not throw on
    // undefined. Accept either shape so the server can converge later
    // without breaking older frontends.
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.pricing) ? raw.pricing : [];
    return list.map((p: Record<string, unknown>) => ({
      model: String(p.model ?? ''),
      inputCostPer1k: Number(p.inputCostPer1k ?? p.inputPer1k ?? 0),
      outputCostPer1k: Number(p.outputCostPer1k ?? p.outputPer1k ?? 0),
      estimatedTokens: p.estimatedTokens as ModelPricing['estimatedTokens'],
      estimatedCost: p.estimatedCost as ModelPricing['estimatedCost'],
    }));
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
    // Use the same auto-discovery fallback as connect() so the offline pill
    // converges on the working URL even if useOfflineStatus polls before
    // ServiceProvider's connect() effect runs (FR #10).
    return this.healthProbe();
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

  async getCostSummary(): Promise<{ totalTokens: number; estimatedCost: number; dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>; budgetLimit?: number }> {
    try {
      const res = await this.fetch('/api/cost/summary');
      return res.json();
    } catch { return { totalTokens: 0, estimatedCost: 0 }; }
  }

  // --- Memory Stats ---
  async getMemoryStats(): Promise<{ personal: { frames: number; entities: number; relations: number }; workspace: { frames: number; entities: number; relations: number }; total: { frames: number; entities: number; relations: number } }> {
    const zero = { frames: 0, entities: 0, relations: 0 };
    // Server emits snake-case {frameCount, entityCount, relationCount} and
    // can return `workspace: null` when no workspace filter is provided.
    // Normalise both shape and nullability here so callers (useMemory,
    // DashboardApp, Brain Health metric) can rely on the typed fields.
    const normalize = (b: unknown): { frames: number; entities: number; relations: number } => {
      if (!b || typeof b !== 'object') return { ...zero };
      const r = b as Record<string, unknown>;
      return {
        frames: typeof r.frameCount === 'number' ? r.frameCount : (typeof r.frames === 'number' ? r.frames : 0),
        entities: typeof r.entityCount === 'number' ? r.entityCount : (typeof r.entities === 'number' ? r.entities : 0),
        relations: typeof r.relationCount === 'number' ? r.relationCount : (typeof r.relations === 'number' ? r.relations : 0),
      };
    };
    try {
      const res = await this.fetch('/api/memory/stats');
      const raw = (await res.json()) as { personal?: unknown; workspace?: unknown; total?: unknown };
      return {
        personal: normalize(raw.personal),
        workspace: normalize(raw.workspace),
        total: normalize(raw.total),
      };
    } catch {
      return { personal: { ...zero }, workspace: { ...zero }, total: { ...zero } };
    }
  }

  // --- Event Stats ---
  async getEventStats(): Promise<{ byType: Record<string, number>; total: number; dailyBreakdown?: Array<{ date: string; count: number }> }> {
    try {
      const res = await this.fetch('/api/events/stats');
      return res.json();
    } catch { return { byType: {}, total: 0 }; }
  }

  // --- Weaver ---
  async getWeaverStatus(): Promise<{ lastConsolidation?: string; status: string }> {
    try {
      const res = await this.fetch('/api/weaver/status');
      return res.json();
    } catch { return { status: 'unknown' }; }
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

  // --- Pins ---
  async getPins(workspaceId: string): Promise<{ id: string; messageContent: string; messageRole: string; pinnedAt: string; label?: string; status?: string }[]> {
    try {
      const res = await this.fetch(`/api/workspaces/${workspaceId}/pins`);
      const data = await res.json();
      return data.pins ?? [];
    } catch { return []; }
  }

  async addPin(workspaceId: string, data: { messageContent: string; messageRole: 'assistant' | 'user'; label?: string }): Promise<unknown> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/pins`, { method: 'POST', body: JSON.stringify(data) });
    return res.json();
  }

  async removePin(workspaceId: string, pinId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${workspaceId}/pins/${pinId}`, { method: 'DELETE' });
  }

  // --- Documents (version tracking) ---
  async getDocuments(workspaceId: string): Promise<{ name: string; versions: { version: number; path: string; createdAt: string; sizeBytes: number }[] }[]> {
    try {
      const res = await this.fetch(`/api/workspaces/${workspaceId}/documents`);
      const data = await res.json();
      return data.documents ?? [];
    } catch { return []; }
  }

  async getDocumentVersions(workspaceId: string, name: string): Promise<{ version: number; path: string; createdAt: string; sizeBytes: number }[]> {
    try {
      const res = await this.fetch(`/api/workspaces/${workspaceId}/documents/${encodeURIComponent(name)}/versions`);
      const data = await res.json();
      return data.versions ?? [];
    } catch { return []; }
  }

  // --- Feedback ---
  async submitFeedback(data: { sessionId: string; messageIndex: number; rating: 'up' | 'down'; reason?: string; detail?: string }): Promise<void> {
    this.fetch('/api/feedback', { method: 'POST', body: JSON.stringify(data) }).catch(() => {});
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

  // --- Telemetry ---
  async getTelemetryStatus(): Promise<{ enabled: boolean; totalEvents: number }> {
    try {
      const res = await this.fetch('/api/telemetry/status');
      return res.json();
    } catch { return { enabled: false, totalEvents: 0 }; }
  }

  async toggleTelemetry(enabled: boolean): Promise<void> {
    await this.fetch('/api/telemetry/toggle', { method: 'POST', body: JSON.stringify({ enabled }) });
  }

  async clearTelemetry(): Promise<{ deleted: number }> {
    const res = await this.fetch('/api/telemetry/events', { method: 'DELETE' });
    return res.json();
  }

  async trackTelemetry(event: string, properties?: Record<string, unknown>): Promise<void> {
    this.fetch('/api/telemetry/track', { method: 'POST', body: JSON.stringify({ event, properties }) }).catch(() => {});
  }

  // --- Stripe Billing ---
  async syncStripeCheckout(sessionId: string): Promise<{ tier: string; customerId: string | null }> {
    const res = await this.fetch('/api/stripe/sync', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
    return res.json();
  }

  async createCheckoutSession(tier: 'PRO' | 'TEAMS'): Promise<{ url: string }> {
    const res = await this.fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify({ tier }),
    });
    return res.json();
  }

  async createPortalSession(): Promise<{ url: string }> {
    const res = await this.fetch('/api/stripe/create-portal-session', {
      method: 'POST',
    });
    return res.json();
  }

  async getTier(): Promise<{ tier: string; trialDaysRemaining?: number; trialExpired?: boolean; capabilities: Record<string, unknown>; usage: Record<string, unknown> }> {
    const res = await this.fetch('/api/tier');
    return res.json();
  }

  /**
   * Schedule a complete erasure of this install's data dir (GDPR Art. 17).
   *
   * Per `docs/pilot/data-handling-policy.md` § 4 + the route at
   * `packages/server/src/local/routes/data-erase.ts`, this is the marker-file
   * pattern: the route validates + writes `<dataDir>/.erase-pending.json`,
   * the actual destructive wipe runs at next service startup BEFORE any DB
   * opens. Caller must surface the receipt + 'quit and relaunch' instruction.
   *
   * Confirmation is mandatory:
   *   - X-Confirm-Erase: yes (header)
   *   - body { confirmation: 'I UNDERSTAND THIS IS PERMANENT' } (exact phrase)
   *
   * Both are case-sensitive — accidental erasure is unrecoverable, so the
   * gate is intentional friction. Throws on 400 (confirmation missing/wrong)
   * or 500 (marker write failed) so the calling UI can surface the error
   * to the user instead of pretending the request succeeded.
   */
  async eraseData(confirmationPhrase: string): Promise<{
    requestedAt: string;
    markerPath: string;
    dataDirSnapshot: { fileCount: number; totalBytes: number; topLevelEntries: Array<{ name: string; isDirectory: boolean; bytes: number }> };
    instruction: string;
  }> {
    const res = await this.fetch('/api/data/erase', {
      method: 'POST',
      headers: { 'X-Confirm-Erase': 'yes' },
      body: JSON.stringify({ confirmation: confirmationPhrase }),
    });
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const body = await res.clone().json();
        detail = (body?.message as string) ?? (body?.error as string);
      } catch { /* not JSON */ }
      throw new Error(`Erase failed (${res.status}): ${detail ?? res.statusText}`);
    }
    return res.json();
  }

  /**
   * Start the 15-day trial atomically. Server writes
   * `{ tier: 'TRIAL', trialStartedAt: now() }` in a single config.json
   * mutation. Throws on 409 (trial already started) — call sites can
   * .catch() and either ignore (idempotent UX, e.g. onboarding-complete) or
   * surface to the user (e.g. "Start trial" button after expiry).
   *
   * Replaces the previous broken path where Desktop.tsx called
   * `adapter.updateSettings({ tier: 'TRIAL', trialStartedAt: ... } as any)`
   * — `updateSettings` did not exist on the adapter (silently swallowed by
   * `.catch(() => {})`), and even if it had, `PATCH /api/tier` ignores
   * `trialStartedAt`, so the trial never actually started.
   */
  async startTrial(): Promise<{
    tier: string;
    rawTier: string;
    trialStartedAt: string;
    trialDaysRemaining: number;
    trialExpired: boolean;
    capabilities: Record<string, unknown>;
  }> {
    const res = await this.fetch('/api/tier/start-trial', { method: 'POST' });
    if (!res.ok) {
      let detail: string | undefined;
      try {
        const body = await res.clone().json();
        detail = (body?.message as string) ?? (body?.error as string);
      } catch { /* not JSON */ }
      throw new Error(`Start trial failed (${res.status}): ${detail ?? res.statusText}`);
    }
    return res.json();
  }

  // --- Import ---
  async importPreview(data: unknown, source: string): Promise<{ knowledgeExtracted: unknown[] }> {
    const res = await this.fetch('/api/import/preview', { method: 'POST', body: JSON.stringify({ data, source }) });
    return res.json();
  }

  async importCommit(data: unknown, source: string): Promise<void> {
    await this.fetch('/api/import/commit', { method: 'POST', body: JSON.stringify({ data, source }) });
  }

  // --- Harvest ---
  async harvestPreview(data: unknown, source: string): Promise<any> {
    const res = await this.fetch('/api/harvest/preview', { method: 'POST', body: JSON.stringify({ data, source }) });
    return res.json();
  }

  async harvestCommit(data: unknown, source: string): Promise<any> {
    const res = await this.fetch('/api/harvest/commit', { method: 'POST', body: JSON.stringify({ data, source }) });
    return res.json();
  }

  async getHarvestSources(): Promise<{ sources: any[] }> {
    const res = await this.fetch('/api/harvest/sources');
    return res.json();
  }

  async scanClaudeCode(): Promise<any> {
    const res = await this.fetch('/api/harvest/scan-claude-code', { method: 'POST' });
    return res.json();
  }

  /**
   * M-09: Trigger LLM extraction of structured identity fields (name, role,
   * company, industry, bio) from recent harvest frames. Persists as pending
   * profile.identitySuggestions. Accept/dismiss reuses updateProfile with
   * the filtered suggestion array.
   */
  async extractHarvestIdentity(): Promise<{
    suggestions: Array<{
      field: 'name' | 'role' | 'company' | 'industry' | 'bio';
      value: string;
      confidence: number;
      sourceHint: string;
      extractedAt: string;
    }>;
    note?: string;
  }> {
    const res = await this.fetch('/api/harvest/extract-identity', { method: 'POST' });
    return res.json();
  }

  /**
   * M-08: fetch the latest interrupted harvest run (null if none). UI uses
   * this on HarvestTab mount to decide whether to render the Resume banner.
   */
  async getLatestInterruptedHarvestRun(): Promise<{
    run: {
      id: number;
      source: string;
      status: 'running' | 'failed';
      totalItems: number;
      itemsSaved: number;
      startedAt: string;
      updatedAt: string;
      errorMessage: string | null;
    } | null;
  }> {
    const res = await this.fetch('/api/harvest/runs/latest-interrupted');
    return res.json();
  }

  /**
   * M-08: resume an interrupted harvest run. Hits /api/harvest/commit with
   * `resumeFromRun: runId`; the server replays the cached input payload.
   * FrameStore dedup makes already-saved frames no-ops.
   */
  async resumeHarvestRun(runId: number): Promise<any> {
    const res = await this.fetch('/api/harvest/commit', {
      method: 'POST',
      body: JSON.stringify({ resumeFromRun: runId }),
    });
    return res.json();
  }

  /** M-08: discard an interrupted run — marks abandoned + deletes cached input. */
  async abandonHarvestRun(runId: number): Promise<void> {
    await this.fetch(`/api/harvest/runs/${runId}/abandon`, { method: 'POST' });
  }

  async removeHarvestSource(source: string): Promise<void> {
    await this.fetch(`/api/harvest/sources/${encodeURIComponent(source)}`, { method: 'DELETE' });
  }

  async toggleHarvestAutoSync(source: string, autoSync: boolean): Promise<any> {
    const res = await this.fetch(`/api/harvest/sources/${encodeURIComponent(source)}`, {
      method: 'PATCH', body: JSON.stringify({ autoSync }),
    });
    return res.json();
  }

  // --- Wiki ---
  async getWikiPages(): Promise<any[]> {
    const res = await this.fetch('/api/wiki/pages');
    return res.json();
  }

  async getWikiPage(slug: string): Promise<any> {
    const res = await this.fetch(`/api/wiki/pages/${encodeURIComponent(slug)}`);
    return res.json();
  }

  async getWikiPageContent(slug: string): Promise<{ slug: string; markdown: string }> {
    const res = await this.fetch(`/api/wiki/pages/${encodeURIComponent(slug)}/content`);
    return res.json();
  }

  async compileWiki(mode: 'incremental' | 'full' = 'incremental', concepts?: string[]): Promise<any> {
    const res = await this.fetch('/api/wiki/compile', {
      method: 'POST',
      body: JSON.stringify({ mode, ...(concepts && { concepts }) }),
    });
    return res.json();
  }

  async getWikiHealth(): Promise<any> {
    const res = await this.fetch('/api/wiki/health');
    return res.json();
  }

  async getWikiWatermark(): Promise<any> {
    const res = await this.fetch('/api/wiki/watermark');
    return res.json();
  }

  /**
   * M-12: export all compiled wiki pages to an Obsidian-shaped directory.
   * `outDir` must be an absolute path. Writes `_index.md` at the root and
   * `{type}/{slug}.md` per page. Existing files are overwritten.
   */
  async exportWikiToObsidian(outDir: string): Promise<{
    outDir: string;
    filesWritten: number;
    indexPath: string;
    byType: Record<string, number>;
  }> {
    const res = await this.fetch('/api/wiki/export/obsidian', {
      method: 'POST',
      body: JSON.stringify({ outDir }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Export failed (${res.status})`);
    }
    return res.json();
  }

  /**
   * M-13: export all compiled wiki pages as child pages under a Notion
   * root page. Requires `notion-wiki-token` in Vault (paste from
   * notion.so/my-integrations) and a root page URL that has been shared
   * with the integration. Delta-aware — unchanged pages skip API calls.
   */
  async exportWikiToNotion(rootPageUrl: string): Promise<{
    pagesCreated: number;
    pagesUpdated: number;
    pagesUnchanged: number;
    pagesFailed: number;
    byType: Record<string, number>;
    errors: { slug: string; message: string }[];
  }> {
    const res = await this.fetch('/api/wiki/export/notion', {
      method: 'POST',
      body: JSON.stringify({ rootPageUrl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Notion export failed (${res.status})`);
    }
    return res.json();
  }

  // --- Compliance ---
  async getComplianceStatus(workspaceId?: string): Promise<any> {
    const url = workspaceId ? `/api/compliance/status?workspaceId=${workspaceId}` : '/api/compliance/status';
    const res = await this.fetch(url);
    return res.json();
  }

  /**
   * M-02: download an AI-Act-compliance PDF. Accepts the same request
   * shape as exportComplianceReport. Returns a Blob so the caller can
   * trigger a browser download via URL.createObjectURL.
   */
  async exportComplianceReportPdf(request: any): Promise<Blob> {
    const res = await this.fetch('/api/compliance/export-pdf', {
      method: 'POST', body: JSON.stringify(request),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `PDF export failed (${res.status})`);
    }
    return res.blob();
  }

  async exportComplianceReport(request: any): Promise<any> {
    const res = await this.fetch('/api/compliance/export', { method: 'POST', body: JSON.stringify(request) });
    return res.json();
  }

  async getComplianceInteractions(limit?: number): Promise<any> {
    const res = await this.fetch(`/api/compliance/interactions?limit=${limit ?? 20}`);
    return res.json();
  }

  async getComplianceModels(): Promise<any> {
    const res = await this.fetch('/api/compliance/models');
    return res.json();
  }

  // --- Compliance templates (M-03) ---
  async listComplianceTemplates(): Promise<{ templates: any[] }> {
    const res = await this.fetch('/api/compliance/templates');
    return res.json();
  }

  async createComplianceTemplate(input: any): Promise<{ template: any }> {
    const res = await this.fetch('/api/compliance/templates', {
      method: 'POST', body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Create template failed (${res.status})`);
    }
    return res.json();
  }

  async updateComplianceTemplate(id: number, patch: any): Promise<{ template: any }> {
    const res = await this.fetch(`/api/compliance/templates/${id}`, {
      method: 'PATCH', body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Update template failed (${res.status})`);
    }
    return res.json();
  }

  async deleteComplianceTemplate(id: number): Promise<void> {
    const res = await this.fetch(`/api/compliance/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error ?? `Delete template failed (${res.status})`);
    }
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
