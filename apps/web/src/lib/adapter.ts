// LocalAdapter — HTTP/SSE/WS client for Waggle backend
import { fetchWithTimeout, TimeoutError } from './fetch-utils';
import type { AgentSearchResponse } from './agent-search';
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
  Workspace, WorkspaceContext, ChatMessage, MemoryFrame, Memory,
  AgentStep, Session, SkillPack, FleetSession, CronJob,
  Notification, AgentStatus, Persona, SystemHealth,
  Settings, StreamEvent, KGNode, KGEdge,
  ModelPricing, WaggleSignal, FileEntry, WorkspaceTemplate,
  TimelineEvent,
  HomeBriefing, OvernightSummary, QuickCaptureInput,
  WorkspaceStateView, WorkspaceActivityEvent, WorkspaceTask,
  Artifact, RelatedSearchResult,
  Agent, AgentTrace, Automation, AutomationLog, EngineStatus, PendingApprovalItem,
  MemoryTrace,
} from './types';
import type {
  Command, CommandResult, WorkspaceType,
  ConnectorDefinition, ConnectorHealth, McpInstance, ExtensionType,
  InterpretResult, ResolvedAction,
} from '@waggle/shared';

/**
 * CC Sesija A §2.2 — map adapter `MemoryFrame.importance` (number 1-4) to the
 * Tauri command's string enum. Inverse of IMPORTANCE_MAP.
 */
const IMPORTANCE_NUM_TO_STRING: Record<number, FrameImportance> = {
  1: 'low', 2: 'normal', 3: 'high', 4: 'critical',
};

const DEFAULT_SERVER = 'http://127.0.0.1:3333';
const LOCAL_HTTP_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function resolveDefaultServerUrl(
  locationLike: Pick<Location, 'protocol' | 'hostname' | 'port' | 'origin'> | undefined =
    typeof window !== 'undefined' ? window.location : undefined,
): string {
  if (
    locationLike?.protocol === 'http:' &&
    locationLike.port &&
    LOCAL_HTTP_HOSTS.has(locationLike.hostname)
  ) {
    return locationLike.origin;
  }
  return DEFAULT_SERVER;
}

/**
 * P1b D3 — client mirror of the server's AUTH_EXEMPT_PATHS
 * (packages/server/src/local/security-middleware.ts:238, exact-path match).
 * These two paths must bypass the ensureReady() deferral gate (connect()
 * itself fetches them — gating them would self-deadlock) and the 401-refresh
 * leg (refreshing the token endpoint with itself would loop).
 */
const AUTH_EXEMPT_PATHS = new Set(['/health', '/api/auth/session-token']);

/**
 * P1b D3 — end-to-end deadline for a connect() attempt. fetchWithTimeout only
 * bounds time-to-headers; the probe/token body reads are otherwise unbounded,
 * and a connect that never settles would wedge the deferral gate (and with it
 * every non-exempt request in the app). The race guarantees settlement.
 */
const CONNECT_DEADLINE_MS = 15000;

/**
 * P1b D3 — settle a promise within `ms` or reject with TimeoutError. Used to
 * bound the single-flight probe/refresh memos: fetchWithTimeout only bounds
 * time-to-headers, so an unbounded body read would otherwise occupy a memo
 * forever and wedge every future caller that dedups onto it. (The underlying
 * fetch is not aborted — its eventual settle is epoch-guarded and harmless.)
 */
function deadlined<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([p, deadline]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * P1b D3 — thrown by `adapter.fetch()` on any non-2xx response (the
 * chokepoint conversion of ~145 silent-empty getters). Message precedence is
 * MESSAGE-FIRST (`body.message ?? body.error ?? HTTP <status>`) — matches the
 * incumbent eraseData/startTrial convention and surfaces the human-readable
 * reason for `{ error: 'TIER_INSUFFICIENT', message: '…' }`-shaped bodies.
 * `.status`/`.body` are field-compatible with the pre-existing rich errors
 * thrown by installSkill/installPack (consumers: CapabilitiesApp
 * handleInstallError, SkillBuilder onTierError).
 */
export class AdapterHttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;
  readonly code?: string;

  constructor(status: number, statusText: string, body: unknown) {
    const b = body as { message?: unknown; error?: unknown; code?: unknown } | undefined;
    const detail = b?.message ?? b?.error;
    super(detail != null ? String(detail) : `HTTP ${status}`);
    this.name = 'AdapterHttpError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    if (typeof b?.code === 'string') this.code = b.code;
  }
}

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
    // Phase 3: keep jobType/jobConfig so the Automation Builder can round-trip
    // edits (previously dropped here, which made PATCH-based editing lossy).
    jobType: (raw.jobType as string) ?? undefined,
    jobConfig: (raw.jobConfig as Record<string, unknown>) ?? undefined,
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
    metadata: {
      source: raw.source,
      gop: raw.gop,
      accessCount: raw.accessCount,
      // Lifecycle status — consumers (e.g. briefing highlights) must keep
      // deprecated/archived frames off hero surfaces.
      status: raw.status ?? raw.metadata?.status,
    },
  };
}

class LocalAdapter {
  private baseUrl: string;
  private authToken: string | null = null;
  private ws: WebSocket | null = null;
  /** P1b-SSE: one ref-counted reconnecting stream per (path, eventName). */
  private sseStreams = new Map<string, { close: () => void; listeners: Set<(data: unknown) => void> }>();
  private _connected = false;
  private _connectAttempted = false;
  // P1b D3 gate state. _connectPromise doubles as the deferral gate: kept
  // after a SUCCESSFUL settle (late connect() callers dedup onto it), cleared
  // on failure (so ensureReady can re-arm with a fresh attempt) and by
  // setServerUrl(). _epoch invalidates stale connect/probe continuations
  // after a mid-flight setServerUrl (they must not clobber baseUrl,
  // localStorage, authToken or _connected).
  private _connectPromise: Promise<SystemHealth> | null = null;
  private _healthProbePromise: Promise<SystemHealth> | null = null;
  private _refreshPromise: Promise<void> | null = null;
  private _epoch = 0;

  constructor(serverUrl?: string) {
    this.baseUrl = serverUrl || localStorage.getItem('waggle:server-url') || resolveDefaultServerUrl();
  }

  get isConnected() { return this._connected; }
  get hasAttemptedConnect() { return this._connectAttempted; }

  setServerUrl(url: string) {
    this._epoch++;
    this.baseUrl = url;
    localStorage.setItem('waggle:server-url', url);
    this.authToken = null;
    this._connected = false;
    this._connectAttempted = false;
    // Review fix: clear ALL in-flight memos, not just the connect one — a
    // post-setServerUrl connect must never dedup onto a probe/refresh of the
    // OLD url (their stale settles are epoch-no-op'd, but reusing them would
    // derive the NEW connection's outcome from the old server).
    this._connectPromise = null;
    this._healthProbePromise = null;
    this._refreshPromise = null;
  }

  getServerUrl() {
    return this.baseUrl;
  }

  /**
   * P1b D3: explicit re-probe that bypasses the retained settled-success
   * memo. `connect()` deliberately dedups onto a successful attempt (the
   * deferral gate's fast path) — so a user-initiated "reconnect" after a
   * sidecar death must clear the memo first or it would no-op.
   */
  forceReconnect(): Promise<SystemHealth> {
    this._connectPromise = null;
    this._healthProbePromise = null;
    return this.connect();
  }

  // --- Auth ---
  /**
   * P1b D3: memoized, watchdog-bounded connect. The memo is assigned
   * SYNCHRONOUSLY so two same-tick callers (boot-connect kickoff,
   * ServiceProvider's effect, OnboardingWizard's fire-and-forget) share one
   * probe. A settled-success memo is retained — late callers resolve
   * instantly; a settled-failure memo self-clears so the next connect() (or a
   * gated request via ensureReady's re-arm) starts a fresh attempt.
   */
  connect(): Promise<SystemHealth> {
    if (this._connectPromise) return this._connectPromise;
    const p = this.doConnect(this._epoch);
    this._connectPromise = p;
    p.catch(() => {
      if (this._connectPromise === p) this._connectPromise = null;
    });
    return p;
  }

  private async doConnect(epoch: number): Promise<SystemHealth> {
    this._connectAttempted = true;
    // Watchdog: fetchWithTimeout bounds time-to-headers only; the probe/token
    // body reads are unbounded, and an unsettled connect would wedge the
    // deferral gate app-wide. The race guarantees settlement.
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
      watchdog = setTimeout(
        () => reject(new TimeoutError(`${this.baseUrl} (connect)`, CONNECT_DEADLINE_MS)),
        CONNECT_DEADLINE_MS,
      );
    });
    try {
      const data = await Promise.race([
        (async () => {
          const health = await this.healthProbe(epoch);
          // D1: the sidecar requires a bearer token even on loopback. Fetch it
          // from the auth-exempt, same-origin-gated bootstrap. (R1-001: it is
          // NOT served by the unauthenticated /health.) Best-effort — if the
          // bootstrap is unreachable we proceed token-less; the 401-refresh
          // retry leg recovers as soon as the endpoint is reachable.
          await this.fetchSessionToken(epoch);
          return health;
        })(),
        deadline,
      ]);
      if (epoch === this._epoch) this._connected = true;
      return data;
    } catch (e) {
      if (epoch === this._epoch) this._connected = false;
      throw e;
    } finally {
      clearTimeout(watchdog);
    }
  }

  /**
   * P1b D3: the deferral gate awaited by every non-exempt request.
   * Four states:
   *  - never attempted  → pass through (keeps the adapter unit-test files,
   *    which construct LocalAdapter and call methods directly, gate-free;
   *    production arms the gate via boot-connect.ts, main.tsx's first import)
   *  - in flight        → await settlement
   *  - settled success  → pass through (memo retained, resolves instantly)
   *  - settled failure  → re-arm: kick ONE fresh memoized connect() and defer
   *    onto it. This makes the gate self-healing on the default desktop path
   *    (webview up before the sidecar listens: the boot kickoff fails fast
   *    with ECONNREFUSED and must not permanently disarm the gate).
   * A FAILED attempt always releases the gate — the request proceeds and
   * fails loudly with its own cause rather than hanging.
   */
  private async ensureReady(): Promise<void> {
    if (!this._connectAttempted) return;
    const gate = this._connectPromise ?? this.connect();
    try { await gate; } catch { /* released — request fails with its own cause */ }
  }

  /** D1: obtain the sidecar session token from the same-origin bootstrap
   *  endpoint. Best-effort (connect-path semantics): failure leaves authToken
   *  null. The 401-refresh leg (refreshSessionToken) is the LOUD variant. */
  private async fetchSessionToken(epoch: number): Promise<void> {
    try {
      const res = await this.request('/api/auth/session-token');
      if (res.ok) {
        const body = (await res.json()) as { token?: string };
        if (epoch === this._epoch) this.authToken = body.token ?? null;
      }
    } catch {
      /* leave authToken null; the refresh-retry leg recovers on first 401 */
    }
  }

  /**
   * P1b D3-3: single-flight token refresh for the 401→retry leg. Unlike
   * fetchSessionToken this THROWS on failure so the retry path fails fast
   * with the true cause (refresh endpoint unreachable) instead of silently
   * retrying token-less into a guaranteed second 401.
   */
  private refreshSessionToken(): Promise<void> {
    if (this._refreshPromise) return this._refreshPromise;
    const epoch = this._epoch;
    // Review fix: deadline INSIDE the memoized promise — fetchWithTimeout
    // bounds headers only; an unbounded body read would otherwise occupy the
    // single-flight memo forever and wedge every future 401 recovery.
    const p = deadlined((async () => {
      const res = await this.request('/api/auth/session-token');
      if (!res.ok) {
        const body = await res.clone().json().catch(() => undefined);
        throw new AdapterHttpError(res.status, res.statusText, body);
      }
      const body = (await res.json()) as { token?: string };
      if (!body.token) throw new Error('Session token refresh returned no token');
      if (epoch === this._epoch) this.authToken = body.token;
    })(), CONNECT_DEADLINE_MS, 'session-token refresh');
    this._refreshPromise = p;
    p.finally(() => {
      if (this._refreshPromise === p) this._refreshPromise = null;
    }).catch(() => { /* settled via callers */ });
    return p;
  }

  /**
   * Probe `/health` against the configured baseUrl, with a single auto-discovery
   * fallback to the current local web origin or DEFAULT_SERVER (FR #10).
   *
   * Why this exists: localStorage may carry a stale `waggle:server-url` from a
   * prior Tauri build or wrong port, or be empty after a manual clear. The
   * constructor already falls back to the current local web origin (or
   * DEFAULT_SERVER outside local web mode) when localStorage is empty, but a
   * stored-but-stale URL would otherwise stick until the user navigates to
   * Settings. Auto-rediscovery keeps a fresh user on the rails.
   *
   * P1b D3 hardening: single-flighted (useOfflineStatus's exempt /health
   * probes race connect()'s probe), and the fallback runs against a LOCAL
   * url — `this.baseUrl` and localStorage are committed only on fallback
   * success AND an epoch match, so a stale settle can never clobber a URL the
   * user just configured. On total failure the original error is rethrown —
   * the second-attempt error is less informative.
   */
  private healthProbe(epoch = this._epoch): Promise<SystemHealth> {
    // Review fix: the memo is epoch-checked at creation (setServerUrl clears
    // it, so a live memo always belongs to the current epoch) and DEADLINED —
    // a server that sends headers then stalls the body must not occupy the
    // single-flight slot forever (it would wedge every re-armed connect).
    if (this._healthProbePromise) return this._healthProbePromise;
    const p = deadlined(this.doHealthProbe(epoch), CONNECT_DEADLINE_MS, 'health probe');
    this._healthProbePromise = p;
    p.finally(() => {
      if (this._healthProbePromise === p) this._healthProbePromise = null;
    }).catch(() => { /* settled via callers */ });
    return p;
  }

  private async doHealthProbe(epoch: number): Promise<SystemHealth> {
    try {
      const res = await this.request('/health');
      if (!res.ok) throw new AdapterHttpError(res.status, res.statusText, await res.clone().json().catch(() => undefined));
      return await res.json();
    } catch (firstErr) {
      const fallbackServer = resolveDefaultServerUrl();
      if (this.baseUrl === fallbackServer) throw firstErr;
      try {
        const res = await fetchWithTimeout(`${fallbackServer}/health`);
        if (!res.ok) throw firstErr;
        const data = await res.json();
        if (epoch === this._epoch) {
          this.baseUrl = fallbackServer;
          try { localStorage.setItem('waggle:server-url', fallbackServer); } catch { /* private mode etc. */ }
        }
        return data;
      } catch {
        throw firstErr;
      }
    }
  }

  /**
   * P1b D3-2: the THROWING request path — rejects with AdapterHttpError on any
   * non-2xx response (after the 403 tier dispatch). This is the chokepoint
   * conversion of the failure-as-data class: ~145 getters that previously
   * parsed error bodies as data now surface failures to their callers.
   * Callers that need raw status/body semantics use `fetchRaw()`.
   */
  async fetch(path: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    const res = await this.request(path, init, timeoutMs);
    if (!res.ok) {
      const body = await res.clone().json().catch(() => undefined);
      throw new AdapterHttpError(res.status, res.statusText, body);
    }
    return res;
  }

  /**
   * P1b D3: today's pre-conversion semantics — never throws on HTTP status
   * (still defers on the gate, attaches the token, runs the 401-refresh-retry
   * and dispatches the 403 tier event). For the two caller classes whose
   * error-path payload is load-bearing: raw-Response consumers
   * (installMarketplacePackage) and body-envelope getters (installMcp et al,
   * whose 403/422 bodies drive the ApprovalModal security flow).
   */
  async fetchRaw(path: string, init?: RequestInit, timeoutMs?: number): Promise<Response> {
    return this.request(path, init, timeoutMs);
  }

  /** Shared request core: deferral gate → headers/token → fetch → 403 tier
   *  dispatch → 401 refresh-retry (token-versioned, once per request). */
  private async request(path: string, init?: RequestInit, timeoutMs?: number, isRetry = false): Promise<Response> {
    const purePath = path.split('?')[0];
    const exempt = AUTH_EXEMPT_PATHS.has(purePath);
    if (!exempt) await this.ensureReady();

    const issuedToken = this.authToken;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string>),
    };
    // P1-003: only declare a JSON content-type when we actually send a body.
    // A bodyless POST (e.g. /api/harvest/scan-claude-code, fired on boot)
    // carrying Content-Type: application/json makes Fastify's JSON parser
    // 400 the empty body before the route handler runs. Any caller-supplied
    // Content-Type (any casing) is preserved as-is. FormData bodies must NOT
    // get the JSON default either — the browser sets the multipart boundary.
    const hasContentType = Object.keys(headers).some(
      h => h.toLowerCase() === 'content-type',
    );
    const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData;
    if (init?.body != null && !isFormData && !hasContentType) {
      headers['Content-Type'] = 'application/json';
    }
    if (issuedToken) {
      headers['Authorization'] = `Bearer ${issuedToken}`;
    }
    const res = await fetchWithTimeout(`${this.baseUrl}${path}`, { ...init, headers }, timeoutMs);
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
    // P1b D3-3: the session token is per-sidecar-process — it rotates on every
    // restart. One silent refresh + single retry per request recovers without
    // a page reload. Token-versioned: if another request's refresh already
    // rotated the token while we were in flight, skip the redundant refresh
    // and retry immediately with the current token (stops a post-restart
    // straggler burst from chaining N sequential refreshes).
    if (res.status === 401 && !exempt && !isRetry) {
      if (this.authToken === issuedToken) {
        await this.refreshSessionToken();
      }
      return this.request(path, init, timeoutMs, true);
    }
    return res;
  }

  // --- Onboarding status (P4 — server-authoritative) ---
  // The returning-user signal. Workspace count is NOT usable for this: the
  // boot-time wsManager.ensureDefault() stub means a clean install always has
  // ≥1 workspace, which silently skipped the wizard for brand-new users.

  async getOnboardingStatus(): Promise<{ completed: boolean; source?: string }> {
    const res = await this.fetch('/api/onboarding/status');
    if (!res.ok) throw new Error(`getOnboardingStatus failed: ${res.status}`);
    return res.json();
  }

  /** Idempotent completion stamp (`<dataDir>/first-launch.flag`). */
  async markOnboardingComplete(): Promise<void> {
    await this.fetch('/api/onboarding/complete', { method: 'POST' });
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
      // W2B: server stamps `lastActiveAt`; the FE reads `lastActive`. Map it so
      // card footers / switcher recency / duplicate-name subtitles have a value
      // wherever the server does stamp activity (inert until stamping lands).
      lastActive: (ws.lastActive as string | undefined) ?? (ws.lastActiveAt as string | undefined),
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

  async createWorkspace(data: { name: string; group: string; persona?: string; agentGroupId?: string; templateId?: string; shared?: boolean; model?: string; personaId?: string; description?: string; type?: WorkspaceType; connectorIds?: string[]; mcpIds?: string[] }): Promise<Workspace> {
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

  async patchWorkspace(id: string, data: Partial<Pick<Workspace, 'persona' | 'agentGroupId' | 'templateId' | 'name' | 'group' | 'model' | 'status' | 'description'>>): Promise<Workspace> {
    const res = await this.fetch(`/api/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteWorkspace(id: string): Promise<void> {
    await this.fetch(`/api/workspaces/${id}`, { method: 'DELETE' });
  }

  /** Markdown briefing export (GET /export?format=briefing) for download. */
  async exportWorkspaceBriefing(id: string): Promise<Blob> {
    const res = await this.fetch(`/api/workspaces/${id}/export?format=briefing`);
    return res.blob();
  }

  // ── Workspace task board (routes/tasks.ts) — adapter methods were missing
  //    entirely, leaving the server-side CRUD unreachable from the UI. ──
  async getWorkspaceTasks(id: string): Promise<WorkspaceTask[]> {
    const res = await this.fetch(`/api/workspaces/${id}/tasks`);
    const data = await res.json();
    return data.tasks ?? [];
  }

  async createWorkspaceTask(id: string, title: string): Promise<WorkspaceTask> {
    const res = await this.fetch(`/api/workspaces/${id}/tasks`, { method: 'POST', body: JSON.stringify({ title }) });
    return res.json();
  }

  async patchWorkspaceTask(id: string, taskId: string, data: Partial<Pick<WorkspaceTask, 'title' | 'status'>>): Promise<WorkspaceTask> {
    const res = await this.fetch(`/api/workspaces/${id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) });
    return res.json();
  }

  async deleteWorkspaceTask(id: string, taskId: string): Promise<void> {
    await this.fetch(`/api/workspaces/${id}/tasks/${taskId}`, { method: 'DELETE' });
  }

  async getWorkspaceContext(id: string): Promise<WorkspaceContext> {
    const res = await this.fetch(`/api/workspaces/${id}/context`);
    return res.json();
  }

  async getWorkspaceFiles(workspaceId: string): Promise<unknown[]> {
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files`);
    // The route returns a `{ files: [...] }` envelope (workspaces.ts F2) —
    // unwrap it so consumers get the array either way (P2 fix: the envelope
    // object reached normalizeArtifacts() as-is and rendered Artifacts empty).
    const body: unknown = await res.json();
    if (Array.isArray(body)) return body;
    const files = (body as { files?: unknown[] } | null)?.files;
    return Array.isArray(files) ? files : [];
  }

  // --- Workspace Desktop (UX-Refactor Phase 1, S02) ---
  // Thin typed wrappers over the new sidecar routes. The routes do not exist
  // yet (built by S02's backend leaf); these compile as fetch wrappers.
  async getWorkspaceState(id: string): Promise<WorkspaceStateView> {
    const res = await this.fetch(`/api/workspaces/${id}/state`);
    return res.json();
  }

  async getWorkspaceActivity(id: string, limit = 50): Promise<{ events: WorkspaceActivityEvent[] }> {
    const res = await this.fetch(`/api/workspaces/${id}/activity?limit=${limit}`);
    return res.json();
  }

  // --- Home Cockpit (UX-Refactor Phase 1, S01) ---
  async getHomeBriefing(): Promise<HomeBriefing> {
    const res = await this.fetch('/api/home/briefing');
    return res.json();
  }

  async getHomeOvernight(since?: string): Promise<OvernightSummary> {
    const qs = since ? `?since=${encodeURIComponent(since)}` : '';
    const res = await this.fetch(`/api/home/overnight${qs}`);
    return res.json();
  }

  async quickCapture(input: QuickCaptureInput): Promise<{ frameId: string }> {
    const res = await this.fetch('/api/quick-capture', {
      method: 'POST', body: JSON.stringify(input),
    });
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
    // P1b D3: through the shared core (was a raw fetchWithTimeout that bypassed
    // the deferral gate, the 401-refresh retry AND the !ok throw — a failed
    // upload's error body parsed as the FileEntry).
    const res = await this.fetch(`/api/workspaces/${workspaceId}/files/upload`, {
      method: 'POST',
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

  // --- Memory Center (UX-Refactor Phase 2 — shared Memory entity, S04) ---
  // These hit the new bare /api/memory* routes (memory-center.ts) and return the
  // shared `Memory` shape (kind/confidence/scope/status/evidence/...), distinct
  // from the legacy frame methods above. HTTP path works in web + desktop (the
  // sidecar is bundled), so no Tauri IPC branch is needed.

  async listMemories(opts: {
    workspaceId?: string; kind?: string; status?: string; scope?: string;
    q?: string; minConfidence?: number; limit?: number;
    /** P3/D2 two-mind split — select a single mind; omit for the legacy merge. */
    mind?: 'personal' | 'workspace';
  } = {}): Promise<Memory[]> {
    const p = new URLSearchParams();
    if (opts.mind) p.set('mind', opts.mind);
    if (opts.workspaceId) p.set('workspace', opts.workspaceId);
    if (opts.kind) p.set('kind', opts.kind);
    if (opts.status) p.set('status', opts.status);
    if (opts.scope) p.set('scope', opts.scope);
    if (opts.q) p.set('q', opts.q);
    if (typeof opts.minConfidence === 'number') p.set('minConfidence', String(opts.minConfidence));
    if (typeof opts.limit === 'number') p.set('limit', String(opts.limit));
    const qs = p.toString();
    const res = await this.fetch(`/api/memory${qs ? `?${qs}` : ''}`);
    // Surface HTTP errors to the caller's catch (MemoryCenterTab.load) instead
    // of masking a backend failure as a clean empty list — this.fetch does not
    // throw on non-2xx (S04 review MED).
    if (!res.ok) throw new Error(`listMemories failed: ${res.status}`);
    const body = await res.json() as { results?: Memory[]; count?: number };
    return body.results ?? [];
  }

  /** Query string for the single-memory routes. `mind` makes server-side store
   *  resolution STRICT (P3/D2): frame ids collide across the per-mind SQLite
   *  DBs, so a workspace-scoped mutation must never fall through to (and
   *  destroy) a colliding personal frame. Callers that know the mind — the
   *  Memory Center always does — should pass it. */
  private memoryScopeQs(workspaceId?: string, mind?: 'personal' | 'workspace'): string {
    const p = new URLSearchParams();
    if (workspaceId) p.set('workspace', workspaceId);
    if (mind) p.set('mind', mind);
    const s = p.toString();
    return s ? `?${s}` : '';
  }

  async getMemory(id: string, workspaceId?: string, mind?: 'personal' | 'workspace'): Promise<Memory | null> {
    // P1b D3: fetchRaw preserves the documented 404→null contract (the
    // throwing fetch would reject before the status check).
    const res = await this.fetchRaw(`/api/memory/${encodeURIComponent(id)}${this.memoryScopeQs(workspaceId, mind)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new AdapterHttpError(res.status, res.statusText, await res.clone().json().catch(() => undefined));
    return res.json();
  }

  async createMemory(input: {
    content: string; kind?: string; scope?: string; tags?: string[];
    importance?: string; title?: string; confidence?: number; workspaceId?: string;
  }): Promise<Memory> {
    const res = await this.fetch('/api/memory', { method: 'POST', body: JSON.stringify(input) });
    return res.json();
  }

  async patchMemory(
    id: string,
    patch: { content?: string; importance?: string; kind?: string; scope?: string; tags?: string[]; status?: string; title?: string; evidence?: string[] },
    workspaceId?: string,
    mind?: 'personal' | 'workspace',
  ): Promise<Memory> {
    const res = await this.fetch(`/api/memory/${encodeURIComponent(id)}${this.memoryScopeQs(workspaceId, mind)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    return res.json();
  }

  async archiveMemory(id: string, workspaceId?: string, mind?: 'personal' | 'workspace'): Promise<Memory> {
    const res = await this.fetch(`/api/memory/${encodeURIComponent(id)}/archive${this.memoryScopeQs(workspaceId, mind)}`, { method: 'POST' });
    return res.json();
  }

  /** Hard delete (A8) via the bare-id route — distinct from deleteMemoryFrame. */
  async deleteMemoryById(id: string, workspaceId?: string, mind?: 'personal' | 'workspace'): Promise<void> {
    await this.fetch(`/api/memory/${encodeURIComponent(id)}${this.memoryScopeQs(workspaceId, mind)}`, { method: 'DELETE' });
  }

  /** PR3.5 Memory-Trust: clear the 'unreviewed' lifecycle state (status→active). */
  async confirmMemory(id: string, workspaceId?: string, mind?: 'personal' | 'workspace'): Promise<Memory> {
    const res = await this.fetch(`/api/memory/${encodeURIComponent(id)}/confirm${this.memoryScopeQs(workspaceId, mind)}`, { method: 'POST' });
    return res.json();
  }

  /** PR3.5 "Why did you do that?": resolve the execution trace that wrote a
   *  memory (via the metadata.trace_id backlink). Returns { trace: null } when
   *  the frame has no linked trace — the caller shows an honest empty state. */
  async getMemoryTrace(id: string, workspaceId?: string, mind?: 'personal' | 'workspace'): Promise<{ trace: MemoryTrace | null }> {
    const res = await this.fetch(`/api/memory/${encodeURIComponent(id)}/trace${this.memoryScopeQs(workspaceId, mind)}`);
    return res.json();
  }

  /** #7 "View original source": resolve the immutable verbatim raw_archive row(s)
   *  a memory was distilled from (via metadata.archiveUids — one frame can link
   *  several sources). 404 = no linked source (manual / pre-archive frames) →
   *  { archiveRows: [] } for a friendly empty state, mirroring getMemory's
   *  documented 404→null contract rather than the throwing fetch. */
  async getMemoryOriginalSource(
    id: string,
    workspaceId?: string,
    mind?: 'personal' | 'workspace',
  ): Promise<{ archiveRows: Array<{ content: string; source: string; sourceRef: string | null; injectionFlagged: boolean; injectionFlags: string }> }> {
    const res = await this.fetchRaw(`/api/memory/${encodeURIComponent(id)}/source${this.memoryScopeQs(workspaceId, mind)}`);
    if (res.status === 404) return { archiveRows: [] };
    if (!res.ok) throw new AdapterHttpError(res.status, res.statusText, await res.clone().json().catch(() => undefined));
    const body = await res.json();
    return { archiveRows: Array.isArray(body?.archiveRows) ? body.archiveRows : [] };
  }

  /** #7 P1 GDPR Art.17 per-subject erasure — runs the FULL sweep (raw_archive
   *  provenance redaction + frame delete from every retrieval store + orphaned-KG
   *  hard-delete +, in subject mode, verbatim raw-turn / B-frame reach). Distinct
   *  from the A8 frame-only deleteMemoryById AND from eraseData (whole-datadir
   *  account wipe). Frame mode by default; pass {source, sourceRef} to sweep an
   *  entire harvested source. Returns the erasure breakdown for the UI receipt. */
  async eraseMemory(
    target: { frameId: string } | { source: string; sourceRef: string },
    opts: { reason?: string; workspaceId?: string; mind?: 'personal' | 'workspace' } = {},
  ): Promise<{
    erased: boolean;
    mind: string;
    result: { framesDeleted: number; archiveRedacted: number; chunkVectorsPurged: number; entitiesErased: number; relationsErased: number };
  }> {
    const res = await this.fetch(`/api/memory/erase${this.memoryScopeQs(opts.workspaceId, opts.mind)}`, {
      method: 'POST',
      body: JSON.stringify({ ...target, reason: opts.reason }),
    });
    return res.json();
  }

  /** #7 sticky erasure — list the (source, sourceRef) subjects on the erased-subject
   *  suppression list. A re-import of any of these is skipped, so an Art.17 erasure
   *  survives a later re-export/re-sync. The re-consent UI lists + clears them. */
  async listSuppression(
    opts: { workspaceId?: string; mind?: 'personal' | 'workspace' } = {},
  ): Promise<{ mind: string; suppressed: Array<{ source: string; sourceRef: string; erasedAt: string; reason: string | null }> }> {
    const res = await this.fetchRaw(`/api/memory/suppression${this.memoryScopeQs(opts.workspaceId, opts.mind)}`);
    if (!res.ok) return { mind: opts.mind ?? 'personal', suppressed: [] };
    const body = await res.json();
    return { mind: body?.mind ?? 'personal', suppressed: Array.isArray(body?.suppressed) ? body.suppressed : [] };
  }

  /** #7 sticky erasure — re-consent: lift the suppression on a subject so it may be
   *  re-imported again. Idempotent (removed:false if it wasn't suppressed). */
  async allowReimport(
    subject: { source: string; sourceRef: string },
    opts: { workspaceId?: string; mind?: 'personal' | 'workspace' } = {},
  ): Promise<{ removed: boolean; mind: string }> {
    const res = await this.fetch(`/api/memory/suppression/allow${this.memoryScopeQs(opts.workspaceId, opts.mind)}`, {
      method: 'POST',
      body: JSON.stringify(subject),
    });
    return res.json();
  }

  async mergeMemories(ids: string[], opts: { workspaceId?: string; title?: string; mind?: 'personal' | 'workspace' } = {}): Promise<Memory> {
    const res = await this.fetch('/api/memory/merge', {
      method: 'POST',
      body: JSON.stringify({ ids, workspaceId: opts.workspaceId, title: opts.title, mind: opts.mind }),
    });
    return res.json();
  }

  // --- Artifact Center (UX-Refactor Phase 2C — shared Artifact entity, S05) ---
  // Hit the new /api/artifacts* routes (artifacts.ts). Artifacts are produced
  // OUTCOMES (decks/docs/sheets/...), backed by the per-workspace artifacts.json
  // index (A6). HTTP path works in web + desktop (the sidecar is bundled).

  async listArtifacts(opts: {
    workspaceId?: string; kind?: string; status?: string; tag?: string; q?: string; limit?: number;
  } = {}): Promise<Artifact[]> {
    const p = new URLSearchParams();
    if (opts.workspaceId) p.set('workspaceId', opts.workspaceId);
    if (opts.kind) p.set('kind', opts.kind);
    if (opts.status) p.set('status', opts.status);
    if (opts.tag) p.set('tag', opts.tag);
    if (opts.q) p.set('q', opts.q);
    if (typeof opts.limit === 'number') p.set('limit', String(opts.limit));
    const qs = p.toString();
    const res = await this.fetch(`/api/artifacts${qs ? `?${qs}` : ''}`);
    if (!res.ok) throw new Error(`listArtifacts failed: ${res.status}`);
    const body = await res.json() as { results?: Artifact[]; count?: number };
    return body.results ?? [];
  }

  async getArtifact(id: string, workspaceId?: string): Promise<Artifact | null> {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    // P1b D3: fetchRaw preserves the documented 404→null contract.
    const res = await this.fetchRaw(`/api/artifacts/${encodeURIComponent(id)}${qs}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new AdapterHttpError(res.status, res.statusText, await res.clone().json().catch(() => undefined));
    return res.json();
  }

  async createArtifact(input: {
    title: string; kind: string; workspaceId: string; source?: string; status?: string;
    mimeType?: string; storagePath?: string; previewUrl?: string; tags?: string[];
    relatedMemoryIds?: string[]; relatedSessionIds?: string[];
    relatedTaskIds?: string[]; relatedAgentIds?: string[];
  }): Promise<Artifact> {
    const res = await this.fetch('/api/artifacts', { method: 'POST', body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`createArtifact failed: ${res.status}`);
    return res.json();
  }

  async patchArtifact(
    id: string,
    patch: Partial<Pick<Artifact,
      'title' | 'kind' | 'status' | 'mimeType' | 'storagePath' | 'previewUrl' | 'source' |
      'tags' | 'relatedMemoryIds' | 'relatedSessionIds' | 'relatedTaskIds' | 'relatedAgentIds'>>,
    workspaceId?: string,
  ): Promise<Artifact> {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    const res = await this.fetch(`/api/artifacts/${encodeURIComponent(id)}${qs}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(`patchArtifact failed: ${res.status}`);
    return res.json();
  }

  /** Reversible Archive (A8) — status:'archived' via PATCH (no separate route). */
  async archiveArtifact(id: string, workspaceId?: string): Promise<Artifact> {
    return this.patchArtifact(id, { status: 'archived' }, workspaceId);
  }

  /** Hard delete (A8 — no tombstone). Removes the index entry. */
  async deleteArtifact(id: string, workspaceId?: string): Promise<void> {
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    await this.fetch(`/api/artifacts/${encodeURIComponent(id)}${qs}`, { method: 'DELETE' });
  }

  async searchRelatedArtifacts(q: string, workspaceId?: string): Promise<RelatedSearchResult> {
    const p = new URLSearchParams({ q });
    if (workspaceId) p.set('workspaceId', workspaceId);
    const res = await this.fetch(`/api/artifacts/search-related?${p.toString()}`);
    if (!res.ok) throw new Error(`searchRelatedArtifacts failed: ${res.status}`);
    return res.json();
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
    // Normalize to the FE contract (KGNode {id,label,type} / KGEdge
    // {source,target,relationship}) regardless of backend shape. The HTTP route
    // now projects server-side, but the Tauri IPC path may still return raw
    // SQLite columns (entity_type/name, source_id/target_id/relation_type) —
    // map them here too so desktop + web both render. Idempotent on projected data.
    const asArr = (v: unknown): Record<string, unknown>[] =>
      Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
    const str = (v: unknown): string | undefined =>
      typeof v === 'string' && v.length > 0 ? v : undefined;
    const toNodes = (raw: unknown): KGNode[] =>
      asArr(raw).map((r) => ({
        ...r,
        id: String(r.id),
        label: str(r.label) ?? str(r.name) ?? String(r.id),
        type: str(r.type) ?? str(r.entity_type) ?? 'unknown',
      })) as KGNode[];
    const toEdges = (raw: unknown): KGEdge[] =>
      asArr(raw).map((r) => ({
        ...r,
        source: String(r.source ?? r.source_id),
        target: String(r.target ?? r.target_id),
        relationship: str(r.relationship) ?? str(r.relation_type) ?? 'related',
      })) as KGEdge[];

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
      const data = (await tauriSearchEntities(args)) as {
        nodes?: unknown; entities?: unknown; edges?: unknown; relations?: unknown;
      };
      return {
        nodes: toNodes(data.nodes ?? data.entities),
        edges: toEdges(data.edges ?? data.relations),
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
      nodes: toNodes(data.nodes ?? data.entities),
      edges: toEdges(data.edges ?? data.relations),
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

  /** Upsert the per-mind identity record (B8) — onboarding seeds this so the Home
   *  cockpit greets the user by name. POST /api/identity is a single-row upsert. */
  async setIdentity(body: {
    name?: string; role?: string; department?: string;
    personality?: string; capabilities?: string; system_prompt?: string;
    workspace?: string;
  }): Promise<IdentityResponse> {
    const res = await this.fetch('/api/identity', { method: 'POST', body: JSON.stringify(body) });
    return res.json();
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
    // Server emits NAMED `event: audit` events (events.ts:325); the unnamed
    // handshake never reaches this listener by SSE spec.
    return this.subscribeSSE('/api/events/stream', (data) => onEvent(data as AgentStep), 'audit');
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
    // Phase-3B review: an HTTP error body (401 boot-race, 500) piped through
    // unwrapArray comes back as [] — a silent empty Skills Hub. Throw so the
    // caller's allSettled/error paths see the failure.
    if (!res.ok) throw new Error(`getSkills failed: ${res.status}`);
    return unwrapArray(await res.json()).map((s: any) => ({
      ...s,
      id: s.id || s.name || s.slug,
      installed: true, // Skills from GET /api/skills are always installed
    }));
  }

  async createSkill(data: {
    name: string;
    description: string;
    /** Required by the server — POST /api/skills/create 400s on an empty array. */
    steps: string[];
    tools?: string[];
    category?: string;
  }): Promise<void> {
    // Phase-3 fix: this used to send only { name, description }, which the
    // route rejects (steps is mandatory) — the call could never succeed.
    // P1b D3: the chokepoint AdapterHttpError carries the same .status/.body
    // fields the bespoke rich error did (SkillBuilder routes a 403 to the
    // UpgradeModal tier event via onTierError) — the local !ok block is gone.
    await this.fetch('/api/skills/create', { method: 'POST', body: JSON.stringify(data) });
  }

  /** Update a skill's markdown body. The skill NAME is its id. */
  async updateSkill(id: string, content: string): Promise<void> {
    const res = await this.fetch(`/api/skills/${encodeURIComponent(id)}`, {
      method: 'PATCH', body: JSON.stringify({ content }),
    });
    if (!res.ok) throw new Error(`updateSkill failed: ${res.status}`);
  }

  /**
   * §D2: run the run-and-grade skill-audit loop (PRO) to mint the "verified"
   * badge. Pass a names[] to scope the run to specific skills (keeps each POST
   * to a few LLM calls). A 403 (FREE/expired tier) throws AdapterHttpError and
   * is routed to the UpgradeModal by the fetch chokepoint, like createSkill.
   */
  async auditSkills(names?: string[]): Promise<{
    ok: boolean;
    report: { verified: string[]; failed: string[]; flagged: string[]; inconclusive: string[]; demoted: string[]; skipped: string[] };
  }> {
    const res = await this.fetch('/api/skills/audit', {
      method: 'POST',
      body: JSON.stringify(names && names.length ? { names } : {}),
    });
    return res.json();
  }

  /** C37 preview-only test: injected-prompt + parsed metadata, no LLM call. */
  async testSkill(id: string, testInput?: string): Promise<{
    skill: Record<string, unknown>;
    wouldInject: string;
    wouldInjectLength: number;
    testPreview?: { input: string; combinedContext: string; note: string };
  }> {
    const res = await this.fetch(`/api/skills/${encodeURIComponent(id)}/test`, {
      method: 'POST', body: JSON.stringify({ testInput }),
    });
    if (!res.ok) throw new Error(`testSkill failed: ${res.status}`);
    return res.json();
  }

  /** Thin install dispatcher — resolves to the starter/pack/marketplace
   *  installer. The `id` means a DIFFERENT thing per source: 'starter' = a
   *  starter-skill id; 'pack' = a CAPABILITY-PACK id (installs the pack's
   *  skills, not a skill named `id`); 'marketplace' IGNORES `id` — the numeric
   *  `packageId` rules. A pack install with per-skill failures throws with
   *  status 422 and `body.result` carrying installed/skipped/errors. */
  async installSkill(
    id: string,
    source: 'starter' | 'pack' | 'marketplace',
    packageId?: number,
  ): Promise<{ installed: boolean; source: string; result: unknown }> {
    const res = await this.fetch(`/api/skills/${encodeURIComponent(id)}/install`, {
      method: 'POST', body: JSON.stringify({ source, ...(packageId !== undefined ? { packageId } : {}) }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      const err = new Error((body as { error?: string }).error ?? `installSkill failed (${res.status})`) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      err.body = body;
      throw err;
    }
    return res.json();
  }

  async getStarterPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/starter-pack/catalog');
    if (!res.ok) throw new Error(`getStarterPacks failed: ${res.status}`);
    // Server emits { skills: [{ id, name, description, family, familyLabel, state, isWorkflow }], families }.
    // SkillPack contract uses { category, trust, installed } — map server shape so
    // CapabilitiesApp renders category badges + trust icons correctly.
    const items = unwrapArray<Record<string, unknown>>(await res.json());
    return items.map((s) => ({
      id: String(s.id ?? s.name ?? ''),
      name: String(s.name ?? s.id ?? ''),
      description: String(s.description ?? ''),
      category: String(s.family ?? s.category ?? 'other') as SkillPack['category'],
      trust: 'verified',
      installed: s.state === 'active' || s.state === 'installed',
      skills: Array.isArray(s.skills) ? (s.skills as string[]) : [],
    }));
  }

  async getCapabilityPacks(): Promise<SkillPack[]> {
    const res = await this.fetch('/api/skills/capability-packs/catalog');
    if (!res.ok) throw new Error(`getCapabilityPacks failed: ${res.status}`);
    // Server emits { packs: [{ id, name, description, skills:[ids], skillStates, packState, installedCount, totalCount }] }.
    const items = unwrapArray<Record<string, unknown>>(await res.json());
    return items.map((p) => ({
      id: String(p.id ?? p.name ?? ''),
      name: String(p.name ?? p.id ?? ''),
      description: String(p.description ?? ''),
      category: String(p.category ?? 'pack') as SkillPack['category'],
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
    if (!res.ok) throw new Error(`getMarketplacePacks failed: ${res.status}`);
    return unwrapArray(await res.json());
  }

  /**
   * BUG #7 (marketplace boot-race): these endpoints back the S21 Marketplace
   * install/uninstall actions and the chat CapabilityRequestCard search. They
   * MUST go through the authenticated `this.fetch()` (which attaches the
   * bearer token) — a raw fetch() returns 401 before the session token has
   * bootstrapped, and the UI was silently caching the empty 401 body as an
   * empty catalog. The INSTALL variant returns the raw Response (fetchRaw) so
   * the caller keeps its status-aware handling (403 → UpgradeModal, scan-
   * blocked toasts). P1b D3: uninstall moved to the THROWING fetch — its only
   * consumer ignored the Response and toasted success unconditionally, so a
   * failed uninstall rendered as success; throwing routes it to the catch.
   * search also throws now: its consumers parse the body with no ok check, so
   * an HTTP error previously rendered as "no results".
   *
   * NOTE: there is deliberately NO installMarketplacePack — POST
   * /api/marketplace/install resolves PACKAGE ids only; posting a pack id
   * installs an unrelated entity (or 404s). Packs render browse-only in S21
   * until a real install-pack route exists.
   */
  async searchMarketplace(query: string, limit = 20): Promise<Response> {
    return this.fetch(`/api/marketplace/search?query=${encodeURIComponent(query)}&limit=${limit}`);
  }

  async installMarketplacePackage(packageId: number): Promise<Response> {
    return this.fetchRaw('/api/marketplace/install', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
  }

  /** PR4 agent-pick (screen 09): natural-language need → ranked suggestions
   *  across connector/skill/tool, each with a "why" + install descriptor. */
  async agentSearch(need: string): Promise<AgentSearchResponse> {
    const res = await this.fetch('/api/marketplace/agent-search', {
      method: 'POST',
      body: JSON.stringify({ need }),
    });
    return res.json();
  }

  async uninstallMarketplacePackage(packageId: number): Promise<Response> {
    return this.fetch('/api/marketplace/uninstall', {
      method: 'POST',
      body: JSON.stringify({ packageId }),
    });
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

  // --- Agent entity (UX-Refactor Phase 3 — S09/S18, B3 agents.json store) ---
  // Distinct from the legacy persona/fleet surfaces: these hit the new
  // /api/agents CRUD on the sidecar. `status/lastRunAt/successRate` on the
  // returned Agent are derived server-side at read (B3).

  async listAgents(): Promise<Agent[]> {
    const res = await this.fetch('/api/agents');
    if (!res.ok) throw new Error(`listAgents failed: ${res.status}`);
    const body = await res.json() as { agents?: Agent[] };
    return body.agents ?? [];
  }

  async createAgent(input: {
    name: string; goal: string; model: string;
    autonomyLevel: 'manual' | 'guided' | 'medium' | 'high';
    memoryScopes: Array<'personal' | 'workspace' | 'team' | 'organization'>;
    type?: 'personal' | 'workspace' | 'team' | 'autonomous';
    description?: string; personaId?: string; avatar?: string;
    workspaceIds?: string[]; teamId?: string;
    skillIds?: string[]; connectorIds?: string[]; mcpIds?: string[];
    permissions?: Record<string, unknown>;
  }): Promise<Agent> {
    const res = await this.fetch('/api/agents', { method: 'POST', body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`createAgent failed: ${res.status}`);
    const body = await res.json() as { agent: Agent };
    return body.agent;
  }

  async getAgent(id: string): Promise<Agent | null> {
    // P1b D3: fetchRaw preserves the documented 404→null contract.
    const res = await this.fetchRaw(`/api/agents/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new AdapterHttpError(res.status, res.statusText, await res.clone().json().catch(() => undefined));
    const body = await res.json() as { agent: Agent };
    return body.agent;
  }

  async patchAgent(id: string, patch: Partial<Omit<Agent, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'successRate'>>): Promise<Agent> {
    const res = await this.fetch(`/api/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(`patchAgent failed: ${res.status}`);
    const body = await res.json() as { agent: Agent };
    return body.agent;
  }

  /** C23: one-shot fleet-spawn into a chosen workspace. The server 400s with
   *  `error: 'workspace_ambiguous'` (+ workspaceIds) when the agent has several
   *  workspaces and none was picked — the FE shows a picker then retries. */
  async runAgent(id: string, opts: { input?: string; workspaceId?: string } = {}): Promise<{
    sessionId: string; workspaceId: string; status: string; task: string;
  }> {
    const res = await this.fetch(`/api/agents/${encodeURIComponent(id)}/run`, {
      method: 'POST', body: JSON.stringify(opts),
    });
    if (!res.ok) {
      let detail: string | undefined;
      let errBody: unknown;
      try {
        errBody = await res.clone().json();
        const eb = errBody as { message?: string; error?: string };
        detail = eb.message ?? eb.error;
      } catch { /* not JSON */ }
      const err = new Error(`runAgent failed (${res.status}): ${detail ?? res.statusText}`) as Error & { status?: number; body?: unknown };
      err.status = res.status;
      err.body = errBody;
      throw err;
    }
    return res.json();
  }

  /** NOTE: fleet pause ABORTS the in-flight one-shot run (stop, not suspend). */
  async pauseAgent(id: string): Promise<{ ok: boolean; paused: number }> {
    const res = await this.fetch(`/api/agents/${encodeURIComponent(id)}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error(`pauseAgent failed: ${res.status}`);
    return res.json();
  }

  async getAgentTraces(id: string, limit?: number): Promise<AgentTrace[]> {
    const qs = typeof limit === 'number' ? `?limit=${limit}` : '';
    const res = await this.fetch(`/api/agents/${encodeURIComponent(id)}/traces${qs}`);
    if (!res.ok) throw new Error(`getAgentTraces failed: ${res.status}`);
    const body = await res.json() as { traces?: AgentTrace[] };
    return body.traces ?? [];
  }

  // --- Cron ---
  // Server emits { cronExpr, lastRunAt, nextRunAt, jobType, ... } but the
  // UI reads legacy field names (`schedule`, `lastRun`, `nextRun`). Keep
  // the client contract stable by remapping on read.
  async getCronJobs(): Promise<CronJob[]> {
    const res = await this.fetch('/api/cron');
    // Phase-3C review: an HTTP error body (401 boot-race, 500) piped through
    // unwrapArray comes back as [] — the AutomationBuilder edit-mode read
    // would silently degrade into "configuration unavailable". Throw so
    // callers see the failure (mirrors the getSkills fix from the 3B review).
    if (!res.ok) throw new Error(`getCronJobs failed: ${res.status}`);
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
    // Phase-3 bug fix: the server registers only PATCH /api/cron/:id — the
    // previous PUT 404'd, which silently broke the enable/disable toggle in
    // ScheduledJobsApp.handleToggle. Map the legacy `schedule` field name back
    // to the server's `cronExpr` while we're at it.
    const { schedule, ...rest } = data;
    const payload = { ...rest, ...(schedule !== undefined ? { cronExpr: schedule } : {}) };
    const res = await this.fetch(`/api/cron/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (!res.ok) throw new Error(`updateCronJob failed: ${res.status}`);
    return normalizeCronJob(await res.json() as Record<string, unknown>);
  }

  async deleteCronJob(id: string): Promise<void> {
    // Phase-3B review: this was the one cron mutation with no res.ok check —
    // a 404/500 resolved normally and the Automation Center toasted a false
    // "Automation deleted" while the row survived the refresh.
    const res = await this.fetch(`/api/cron/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`deleteCronJob failed: ${res.status}`);
  }

  async triggerCronJob(id: string): Promise<{ triggered: boolean; autoEnabled?: boolean; schedule?: CronJob }> {
    // Server auto-enables a disabled job on trigger (M-43 / P25). The
    // response carries the post-trigger `schedule` so callers can sync
    // local state without a round-trip refetch.
    const res = await this.fetch(`/api/cron/${id}/trigger`, { method: 'POST' });
    return res.json();
  }

  // --- Automations (UX-Refactor Phase 3 — PRD-vocabulary alias over cron, S11/S20) ---
  // (Use pauseAutomation / getAutomationLogs below — the PRD vocabulary; the
  // duplicate pauseCronJob/getCronHistory pair was removed in the 3A review.)

  async listAutomations(): Promise<Automation[]> {
    const res = await this.fetch('/api/automations');
    if (!res.ok) throw new Error(`listAutomations failed: ${res.status}`);
    const body = await res.json() as { automations?: Automation[] };
    return body.automations ?? [];
  }

  /**
   * Loops engine liveness for the sovereignty status pill. Resolves null on any
   * error (offline server / not yet connected) so the pill degrades to a calm
   * "checking…" rather than throwing into the Automation Center's error panel.
   */
  async getEngineStatus(): Promise<EngineStatus | null> {
    try {
      const res = await this.fetch('/api/automations/engine');
      if (!res.ok) return null;
      const body = await res.json() as { engine?: EngineStatus };
      return body.engine ?? null;
    } catch {
      return null;
    }
  }

  async createAutomation(input: {
    name: string;
    trigger?: { type: 'schedule' | 'manual'; cron?: string };
    schedule?: string;
    condition?: string;
    actions?: string[];
    agentId?: string;
    notify?: boolean;
    jobType?: string;
    jobConfig?: Record<string, unknown>;
    workspaceId?: string;
    enabled?: boolean;
  }): Promise<Automation> {
    const res = await this.fetch('/api/automations', { method: 'POST', body: JSON.stringify(input) });
    if (!res.ok) throw new Error(`createAutomation failed: ${res.status}`);
    const body = await res.json() as { automation: Automation };
    return body.automation;
  }

  async updateAutomation(
    id: string,
    patch: {
      name?: string; schedule?: string; condition?: string; actions?: string[];
      agentId?: string; notify?: boolean; workspaceId?: string; enabled?: boolean;
      jobConfig?: Record<string, unknown>;
      /** C24 trigger patch (schedule ↔ manual); server maps manual → disabled. */
      trigger?: { type: 'schedule' | 'manual'; cron?: string };
    },
  ): Promise<Automation> {
    const res = await this.fetch(`/api/automations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!res.ok) throw new Error(`updateAutomation failed: ${res.status}`);
    const body = await res.json() as { automation: Automation };
    return body.automation;
  }

  /** Explicit "Run now" — inherits trigger semantics (auto-enables a disabled job). */
  async runAutomation(id: string): Promise<{ runId: string; triggered: boolean; autoEnabled?: boolean }> {
    const res = await this.fetch(`/api/automations/${encodeURIComponent(id)}/run`, { method: 'POST' });
    if (!res.ok) throw new Error(`runAutomation failed: ${res.status}`);
    return res.json();
  }

  async pauseAutomation(id: string): Promise<void> {
    const res = await this.fetch(`/api/automations/${encodeURIComponent(id)}/pause`, { method: 'POST' });
    if (!res.ok) throw new Error(`pauseAutomation failed: ${res.status}`);
  }

  async getAutomationLogs(id: string, limit?: number): Promise<AutomationLog[]> {
    const qs = typeof limit === 'number' ? `?limit=${limit}` : '';
    const res = await this.fetch(`/api/automations/${encodeURIComponent(id)}/logs${qs}`);
    if (!res.ok) throw new Error(`getAutomationLogs failed: ${res.status}`);
    const body = await res.json() as { logs?: AutomationLog[] };
    return body.logs ?? [];
  }

  /** C26 VALIDATION-ONLY preview of a DRAFT automation (Builder test-run).
   *  The server never calls the executor — it statically checks the trigger
   *  (schedule needs a parseable cron), jobType, config completeness
   *  (agent_task needs jobConfig.prompt) and workspaceId, and echoes
   *  `condition` as advisory (C25). `executed` is always false; nothing is
   *  persisted, enabled, recorded or notified. */
  async testAutomation(draft: {
    /** Edit-mode (C26): the stored row's id — the server merges the draft
     *  over the stored jobType/jobConfig so the preview judges the REAL job
     *  instead of the agent_task fallback. */
    id?: string;
    name?: string;
    trigger?: { type: 'schedule' | 'manual'; cron?: string };
    actions?: string[];
    condition?: string;
    jobType?: string;
    jobConfig?: Record<string, unknown>;
    workspaceId?: string;
  }): Promise<{ previewResult: {
    ok: boolean;
    jobType: string;
    triggerType: string;
    issues: string[];
    executed: false;
    wouldRun: string;
    condition?: string;
  } }> {
    const res = await this.fetch('/api/automations/test', { method: 'POST', body: JSON.stringify(draft) });
    if (!res.ok) throw new Error(`testAutomation failed: ${res.status}`);
    return res.json();
  }

  // --- Notifications ---
  subscribeNotifications(onNotification: (n: Notification) => void): () => void {
    return this.subscribeSSE('/api/notifications/stream', (data) => {
      // The route writes an UNNAMED `data: {"type":"connected"}` handshake on
      // every accept (notifications.ts:96) — with the reconnect loop that
      // would mint a junk unread Notification per connect/reopen. Filter it
      // at the adapter boundary.
      if ((data as { type?: string } | null)?.type === 'connected') return;
      onNotification(data as Notification);
    });
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
    // P1b-SSE: dedicated reconnecting EventSource (NOT subscribeSSE — that
    // dedups by path, and this shares /api/notifications/stream with
    // subscribeNotifications). configure re-attaches the named listener on
    // every reopen.
    const handler = (e: MessageEvent) => {
      try { onEvent(JSON.parse(e.data)); } catch { /* skip malformed */ }
    };
    return this.openSSE('/api/notifications/stream', (es) => {
      es.addEventListener('subagent_status', handler as EventListener);
    });
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
    if (typeof EventSource === 'undefined') {
      return { ready: Promise.resolve(), close: () => {} };
    }
    // P1b-SSE: token-attached lazy-open via openSSE. `ready` resolves on the
    // first successful handshake so the caller defers the import POST until
    // the listener is registered server-side — with a 5s overall safety cap
    // (deferral + handshake) so a down server can't block the import flow
    // indefinitely (the POST surfaces its own error).
    let resolved = false;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => {
      finish = () => { if (!resolved) { resolved = true; resolve(); } };
    });
    const safety = setTimeout(() => finish(), 5000);

    const close = this.openSSE('/api/harvest/progress', (es) => {
      es.onmessage = (e) => {
        try { onEvent(JSON.parse(e.data)); } catch { /* skip malformed */ }
      };
    }, /* onOpen */ () => finish());

    return {
      ready: ready.finally(() => clearTimeout(safety)),
      close: () => { clearTimeout(safety); finish(); close(); },
    };
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
  async getPendingApprovals(): Promise<{ pending: PendingApprovalItem[]; count: number }> {
    const res = await this.fetch('/api/approval/pending');
    return res.json();
  }

  async respondApproval(
    requestId: string,
    approved: boolean,
    opts: { always?: boolean; sourceWorkspaceId?: string | null } = {},
  ): Promise<{ ok: boolean; approved?: boolean; status?: string; error?: string }> {
    // Return the body so callers can distinguish a held action that was approved
    // but REFUSED/FAILED at execute (the route replies 200 {ok:false}) from a
    // genuine success — otherwise the UI falsely reports "approved & run".
    const res = await this.fetch(`/api/approval/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({
        approved,
        always: opts.always === true,
        sourceWorkspaceId: opts.sourceWorkspaceId ?? null,
      }),
    });
    try {
      return await res.json();
    } catch {
      return { ok: res.ok };
    }
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

  async testApiKey(
    provider: string,
    key: string,
    opts: { live?: boolean } = {},
  ): Promise<{ valid: boolean; verified?: boolean; error?: string }> {
    const res = await this.fetch('/api/settings/test-key', {
      method: 'POST',
      body: JSON.stringify({ provider, apiKey: key, live: opts.live }),
    });
    return res.json();
  }

  /**
   * F3: live-probe a STORED provider key (resolved server-side from the Vault /
   * config by provider id — no raw key crosses the wire). Powers the ModelGate
   * readiness banner's "verified" state. Returns booleans only.
   */
  async probeProvider(
    provider: string,
  ): Promise<{ configured: boolean; valid: boolean; verified: boolean; error?: string }> {
    const res = await this.fetch('/api/settings/probe-provider', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
    return res.json();
  }

  /**
   * Write a provider API key to the Vault via PUT /api/settings (keyed by provider id —
   * the same name GET /api/providers reads `hasKey` from — which also invalidates the
   * server's key-validation cache). This is the canonical key→vault path; do NOT use the
   * generic POST /api/vault for provider keys (it skips the cache invalidation).
   */
  async setProviderKey(providerId: string, apiKey: string, models?: string[]): Promise<void> {
    await this.fetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ providers: { [providerId]: { apiKey, ...(models ? { models } : {}) } } }),
    });
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
    } catch (err) {
      // 404 = job unknown (in-memory store; lost on sidecar restart). Callers
      // poll on a tight interval — don't console-spam the expected case.
      if (!(err instanceof AdapterHttpError && err.status === 404)) {
        console.error('[adapter] getJobStatus failed:', err);
      }
      return null;
    }
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
  /** §8a consumption switch: the shared ConnectorDefinition (incl. the C16
   *  lastSyncAt enrichment) replaces the deleted thin FE `Connector` type. */
  async getConnectors(): Promise<ConnectorDefinition[]> {
    const res = await this.fetch('/api/connectors');
    // Throw on auth/server errors instead of unwrapping the error body to []
    // (the 401 boot-race → silent "0 of 0 connected" hub failure mode).
    if (!res.ok) throw new Error(`getConnectors failed: ${res.status}`);
    return unwrapArray(await res.json());
  }

  async getConnectorHealth(id: string): Promise<ConnectorHealth> {
    const res = await this.fetch(`/api/connectors/${id}/health`);
    return res.json();
  }

  async connectConnector(id: string, credentials?: {
    token?: string; apiKey?: string; refreshToken?: string;
    expiresAt?: string; scopes?: string[]; email?: string;
  }): Promise<void> {
    await this.fetch(`/api/connectors/${id}/connect`, {
      method: 'POST',
      body: JSON.stringify(credentials ?? {}),
    });
  }

  async disconnectConnector(id: string): Promise<void> {
    await this.fetch(`/api/connectors/${id}/disconnect`, { method: 'POST' });
  }

  /** C16: sync-now = health re-probe + lastSyncAt stamp (no data re-pull v1). */
  async syncConnector(id: string): Promise<{ ok: boolean; connectorId: string; lastSyncAt?: string; status?: string }> {
    const res = await this.fetch(`/api/connectors/${id}/sync`, { method: 'POST' });
    return res.json();
  }

  /** C17: the strong disconnect — purges OAuth tokens + writes a revoke audit
   *  entry. 404/503 error bodies resolve as data (`ok` absent, `error` set) —
   *  callers MUST branch on `ok` before claiming success. */
  async revokeConnector(id: string): Promise<{
    ok?: boolean; connectorId?: string; revoked?: boolean;
    cleanedKeys?: number; oauthPurged?: number; error?: string;
  }> {
    // P1b D3: fetchRaw preserves the documented branch-on-`ok` contract above.
    const res = await this.fetchRaw(`/api/connectors/${id}/revoke`, { method: 'POST' });
    return res.json();
  }

  // --- MCP Hub (Phase 4, S08) ---
  async getMcps(): Promise<Array<Partial<McpInstance> & {
    id: string; name: string; description: string; category: string;
    official: boolean; installCmd: string; source: 'catalog' | 'custom';
    installed: boolean; tools: string[];
  }>> {
    const res = await this.fetch('/api/mcps');
    return unwrapArray(await res.json());
  }

  /** PRO+ (B5); delegates to the marketplace installer (SecurityGate + audit).
   *  `force` = reinstall over an existing install; `forceInsecure` = the
   *  audited override for an installer-level HIGH scan block (the block that
   *  actually fires — `force` alone does NOT override it). */
  async installMcp(mcpId: string, opts?: { settings?: Record<string, string>; force?: boolean; forceInsecure?: boolean }): Promise<{
    installed: boolean; server?: string; status?: string; requiresApproval?: boolean;
  }> {
    // P1b D3: fetchRaw — the 403/422 ERROR body is load-bearing: it carries
    // { error: 'TIER_INSUFFICIENT' } AND the SecurityGate envelope
    // { requiresApproval, blocked, severity, scanResult } that drives
    // MCPHubApp's ApprovalModal HIGH-override / CRITICAL-non-overridable flow.
    const res = await this.fetchRaw('/api/mcps/install', {
      method: 'POST',
      body: JSON.stringify({ mcpId, ...opts }),
    });
    return res.json();
  }

  async addCustomMcp(config: {
    name: string; command: string; args?: string[];
    env?: Record<string, string>; workspaceId?: string;
  }): Promise<{ id: string; registered: boolean }> {
    // P1b D3: fetchRaw — body-envelope getter; AddCustomMcpForm branches on
    // res.error (incl. the deliberate TIER_INSUFFICIENT inline-suppression)
    // and renders 400-validation / injection-scan / 409-duplicate reasons.
    const res = await this.fetchRaw('/api/mcps', { method: 'POST', body: JSON.stringify(config) });
    return res.json();
  }

  /** C21: mode 'live' = real spawn + handshake; 'static' = manifest validation.
   *  P1b D3: fetchRaw — error envelopes (502 { status, error }) resolve as
   *  data; InstalledMcpList renders the server's reason from `error`. */
  async testMcp(id: string): Promise<{ ok: boolean; mode: 'live' | 'static'; tools: string[]; error?: string }> {
    const res = await this.fetchRaw(`/api/mcps/${id}/test`, { method: 'POST' });
    return res.json();
  }

  async startMcp(id: string): Promise<{ status: string; error?: string }> {
    const res = await this.fetchRaw(`/api/mcps/${id}/start`, { method: 'POST' });
    return res.json();
  }

  async stopMcp(id: string): Promise<{ status: string; error?: string }> {
    const res = await this.fetchRaw(`/api/mcps/${id}/stop`, { method: 'POST' });
    return res.json();
  }

  async revokeMcp(id: string): Promise<{ ok: boolean; stoppedInstance: boolean; removedConfig: boolean }> {
    // P1b D3: fetchRaw — MCPHubApp.handleRevoke branches res.ok/res.error.
    const res = await this.fetchRaw(`/api/mcps/${id}/revoke`, { method: 'POST' });
    return res.json();
  }

  /** C19: single-workspace scoping v1 — pass workspaceId, or scope:'personal'
   *  to clear. 400/404 error bodies resolve as data (`ok` absent, `error`
   *  set) — callers MUST branch on `ok`. */
  async updateMcpPermissions(id: string, body: { scope?: 'personal' | 'workspace'; workspaceId?: string }): Promise<{
    ok?: boolean; scope?: string; workspaceId?: string; error?: string;
  }> {
    // P1b D3: fetchRaw preserves the documented never-throws contract above.
    const res = await this.fetchRaw(`/api/mcps/${id}/permissions`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // --- Extend layer (Phase 4, S21) ---
  /** Bare marketplace read; `type` takes the six-domain ExtensionType facet (B7/A5). */
  async getMarketplace(params?: { query?: string; type?: ExtensionType; limit?: number }): Promise<{
    packages: unknown[]; total: number; federated?: boolean;
  }> {
    const qs = new URLSearchParams();
    if (params?.query) qs.set('query', params.query);
    if (params?.type) qs.set('type', params.type);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    const res = await this.fetch(`/api/marketplace${s ? `?${s}` : ''}`);
    return res.json();
  }

  /** C18: ONE shared install-audit feed for S06/S07/S08/S21. */
  async getExtendAudit(params?: { type?: 'skill' | 'plugin' | 'mcp' | 'connector' | 'marketplace' | 'native'; capability?: string; limit?: number }): Promise<unknown[]> {
    const qs = new URLSearchParams();
    if (params?.type) qs.set('type', params.type);
    if (params?.capability) qs.set('capability', params.capability);
    if (params?.limit) qs.set('limit', String(params.limit));
    const s = qs.toString();
    const res = await this.fetch(`/api/extend/audit${s ? `?${s}` : ''}`);
    return unwrapArray(await res.json());
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
  // W2D: `workspaceId` (optional) scopes the `workspace` bucket to one workspace
  // so a surface can show workspace-scoped counts that agree with the KG tab's
  // 'current' scope. No arg keeps the all-minds default (StatusBar/LoginBriefing/
  // DashboardApp/brain-health) unchanged.
  async getMemoryStats(workspaceId?: string): Promise<{ personal: { frames: number; entities: number; relations: number }; workspace: { frames: number; entities: number; relations: number }; total: { frames: number; entities: number; relations: number } }> {
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
      // scope=all-minds: counts-only cross-mind total for the briefing brag.
      // Single-user local sidecar only — workspace minds stay separate stores;
      // the server never mixes their CONTENT (founder mind-isolation directive).
      const url = workspaceId
        ? `/api/memory/stats?scope=all-minds&workspace=${encodeURIComponent(workspaceId)}`
        : '/api/memory/stats?scope=all-minds';
      const res = await this.fetch(url);
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
  // Mirrors GET /api/weaver/status (packages/server/src/local/routes/weaver.ts):
  // the domain shape consumers (WeaverPanel, CockpitApp) read directly. On error
  // we return a valid-but-empty object of the SAME shape rather than a fake
  // success status, so callers never crash dereferencing missing fields.
  async getWeaverStatus(): Promise<{
    personalMind: { lastConsolidation: string | null; lastDecay: string | null; timerActive: boolean };
    workspaces: Array<{ id: string; lastConsolidation: string | null; timerActive: boolean }>;
    checkedAt: string;
  }> {
    try {
      const res = await this.fetch('/api/weaver/status');
      return res.json();
    } catch {
      return {
        personalMind: { lastConsolidation: null, lastDecay: null, timerActive: false },
        workspaces: [],
        checkedAt: new Date().toISOString(),
      };
    }
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
    // P1b D3: through the shared core (see uploadFile).
    const res = await this.fetch('/api/ingest', {
      method: 'POST',
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

  // --- Command Center (Ctrl+K) (UX-Refactor Phase 1, S03) ---
  // `/api/command/*` (singular) is net-new and federates over existing
  // substrate. `commandExecute` posts to the singular execute alias (B4:
  // alias onto the existing handler — the plural /api/commands/execute is
  // NOT renamed). Routes built by S03's backend leaf; thin wrappers here.
  async commandSearch(q: string, scope?: string): Promise<{ results: CommandResult[] }> {
    const qs = scope ? `?q=${encodeURIComponent(q)}&scope=${encodeURIComponent(scope)}` : `?q=${encodeURIComponent(q)}`;
    const res = await this.fetch(`/api/command/search${qs}`);
    return res.json();
  }

  async commandRecent(): Promise<{ recent: CommandResult[] }> {
    const res = await this.fetch('/api/command/recent');
    return res.json();
  }

  async commandSuggestions(): Promise<{ suggestions: CommandResult[] }> {
    const res = await this.fetch('/api/command/suggestions');
    return res.json();
  }

  async commandExecute(payload: Command): Promise<{ ok: boolean; result?: unknown }> {
    const res = await this.fetch('/api/command/execute', {
      method: 'POST', body: JSON.stringify(payload),
    });
    return res.json();
  }

  /**
   * Tier 1 NL intent resolver. Maps a plain-language request onto the closed
   * action registry server-side. Never throws — a network/parse failure
   * resolves to a Tier-0 fallback so the palette stays usable.
   */
  async commandInterpret(
    text: string,
    workspaceId?: string,
    context?: Record<string, unknown>,
  ): Promise<InterpretResult> {
    try {
      const res = await this.fetch('/api/command/interpret', {
        method: 'POST', body: JSON.stringify({ text, workspaceId, context }),
      });
      if (!res.ok) {
        return { kind: 'none', fallback: true, message: "Couldn't interpret that." };
      }
      return res.json();
    } catch {
      return { kind: 'none', fallback: true, message: "Couldn't interpret that." };
    }
  }

  /**
   * Execute a server-derived ResolvedAction's endpoint (create / side-effect).
   * The endpoint + body are produced by the closed registry — the client only
   * dispatches what the server already validated. A 403 still flows through the
   * global tier handler in `fetch`.
   */
  async commandDispatchAction(action: ResolvedAction): Promise<{ ok: boolean; status: number; result?: unknown }> {
    if (!action.endpoint) return { ok: false, status: 0 };
    const { method, path, body } = action.endpoint;
    const res = await this.fetch(path, { method, body: body ? JSON.stringify(body) : undefined });
    let result: unknown;
    try { result = await res.json(); } catch { /* empty / non-JSON body */ }
    return { ok: res.ok, status: res.status, result };
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

  // --- AI-OS launcher (Phase 2B) ---
  // detectTools/launchTool/manageHooks each surface the matching
  // sidecar route. All are loopback-only and report only the user's
  // own machine — no remote calls.

  async detectTools(): Promise<{
    platform: string;
    detectedAt: string;
    tools: Array<{
      id: string;
      displayName: string;
      installed: boolean;
      installedPath: string | null;
      version: string | null;
      hooksInstalled: boolean;
      hookPointerPath: string | null;
      diagnostic?: string;
    }>;
  } | null> {
    try {
      const res = await this.fetch('/api/tools/detect');
      if (!res.ok) return null;
      return await res.json();
    } catch (err) {
      console.error('[adapter] detectTools failed:', err);
      return null;
    }
  }

  async launchTool(payload: {
    id: string;
    installedPath: string;
    workspaceId?: string;
    /** Phase 4 — optional CLI args (e.g. ['--print', 'prompt text']). */
    args?: string[];
    /** Optional cwd override; defaults to the binary's directory. */
    cwd?: string;
    /**
     * AI-OS #4 — opt-in observed (piped-stdio) launch so the agent's live
     * output can be streamed via streamToolOutput. Default (omitted) is the
     * detached, survives-restart launch.
     */
    observe?: boolean;
    /**
     * AI-OS #5 — raw prompt for a third-party adapter with a declarative
     * promptArgTemplate (the server turns it into CLI args). Built-in tools
     * send pre-computed `args` instead; this is the third-party fallback.
     */
    prompt?: string;
  }): Promise<{ ok: boolean; pid: number | null; error?: string }> {
    // P1b D3: fetchRaw — non-2xx body maps into the { ok:false, error } envelope.
    const res = await this.fetchRaw('/api/tools/launch', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return {
      ok: res.ok && body.ok === true,
      pid: body.pid ?? null,
      error: body.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
    };
  }

  async getToolProcesses(): Promise<{
    processes: Array<{
      pid: number;
      toolId: string;
      startedAt: string;
      workspaceId?: string;
      /** AI-OS #4 — true for observed (piped) launches with live output. */
      observed?: boolean;
    }>;
    total: number;
  }> {
    try {
      const res = await this.fetch('/api/tools/processes');
      if (!res.ok) return { processes: [], total: 0 };
      return await res.json();
    } catch (err) {
      console.error('[adapter] getToolProcesses failed:', err);
      return { processes: [], total: 0 };
    }
  }

  /**
   * AI-OS #4 — subscribe to an observed launch's live output. Opens a dedicated
   * EventSource on /api/tools/stream?pid= (two named events: `line` and `exit`)
   * via the shared, token-attached, reconnecting openSSE lifecycle. Returns an
   * unsubscribe handle. No-ops in jsdom (no EventSource) — unit tests drive the
   * pane through the callbacks directly.
   */
  streamToolOutput(
    pid: number,
    handlers: { onLine: (line: string) => void; onExit: (code: number | null) => void },
  ): () => void {
    return this.openSSE(`/api/tools/stream?pid=${pid}`, (es) => {
      es.addEventListener('line', (e) => {
        try {
          handlers.onLine(JSON.parse((e as MessageEvent).data).line);
        } catch {
          /* skip malformed frame */
        }
      });
      es.addEventListener('exit', (e) => {
        try {
          handlers.onExit(JSON.parse((e as MessageEvent).data).code ?? null);
        } catch {
          /* skip malformed frame */
        }
      });
    });
  }

  async killTool(pid: number): Promise<{
    ok: boolean;
    pid: number;
    reason: string;
    error?: string;
  }> {
    const res = await this.fetchRaw('/api/tools/kill', {
      method: 'POST',
      body: JSON.stringify({ pid }),
    });
    const body = await res.json().catch(() => ({}));
    return {
      ok: res.ok && body.ok === true,
      pid: body.pid ?? pid,
      reason: body.reason ?? 'unknown',
      error: body.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
    };
  }

  async manageHooks(payload: {
    id: string;
    action: 'install' | 'verify' | 'uninstall';
    cliPath?: string;
  }): Promise<{
    ok: boolean;
    action: string;
    stdout: string;
    stderr: string;
    code: number;
    error?: string;
  }> {
    // P1b D3: fetchRaw — hook-failure diagnostics (stderr/exit code) ride the error body.
    const res = await this.fetchRaw('/api/tools/hooks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    return {
      ok: res.ok && body.ok === true,
      action: body.action ?? payload.action,
      stdout: body.stdout ?? '',
      stderr: body.stderr ?? '',
      code: body.code ?? -1,
      error: body.error ?? (res.ok ? undefined : `HTTP ${res.status}`),
    };
  }

  subscribeWaggleDance(onSignal: (signal: WaggleSignal) => void): () => void {
    // Server emits NAMED `event: signal` events (waggle-signals.ts:103); its
    // `event: connected` handshake is equally named and equally ignored here.
    return this.subscribeSSE('/api/waggle/stream', (data) => onSignal(data as WaggleSignal), 'signal');
  }

  /**
   * P1b-SSE: shared EventSource lifecycle — token-attached, lazy-open,
   * reconnecting. Fixes the three defects that made every stream dead in
   * default config:
   *  1. AUTH — EventSource cannot send headers; the server now accepts
   *     `?token=` on the SSE allowlist (security-middleware SSE_QUERY_TOKEN_PATHS,
   *     the /ws pattern), so the URL carries the session token.
   *  2. LAZY-OPEN — the old `if (!this._connected) return () => {}` guards
   *     turned any subscription mounted before connect settled into a
   *     session-long noop. The handle returns synchronously; the EventSource
   *     opens once `ensureReady()` settles (token available).
   *  3. RECONNECT — the old onerror closed permanently, and EventSource's
   *     native retry can't help anyway once the token rotates (it's baked
   *     into the URL). On error: close, refresh the token (single-flight,
   *     loud-on-failure variant — the rotation case), reopen on capped
   *     exponential backoff (1s → 30s).
   * `configure` attaches the caller's listeners to each (re)opened instance.
   * No-ops in environments without EventSource (jsdom unit tests).
   */
  private openSSE(
    path: string,
    configure: (es: EventSource) => void,
    onOpen?: () => void,
  ): () => void {
    if (typeof EventSource === 'undefined') return () => {};
    let es: EventSource | null = null;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const open = () => {
      if (cancelled) return;
      const sep = path.includes('?') ? '&' : '?';
      const url = `${this.baseUrl}${path}${this.authToken ? `${sep}token=${encodeURIComponent(this.authToken)}` : ''}`;
      es = new EventSource(url);
      configure(es);
      es.onopen = () => { attempt = 0; onOpen?.(); };
      es.onerror = () => {
        es?.close();
        if (cancelled) return;
        const delay = Math.min(30000, 1000 * 2 ** attempt++);
        retryTimer = setTimeout(() => {
          // Sidecar restart rotates the token; the URL-baked one is then
          // permanently stale. Best-effort refresh before each reopen —
          // single-flighted, and a failure just means the next backoff round.
          void this.refreshSessionToken().catch(() => { /* server still down */ })
            .then(() => { if (!cancelled) open(); });
        }, delay);
      };
    };

    // Lazy-open: wait for the connect attempt to settle so the token exists.
    // Never-attempted (unit tests) passes through immediately; a FAILED
    // connect also releases — the stream 401s and enters the retry loop,
    // which doubles as the recovery path.
    void this.ensureReady().then(() => { if (!cancelled) open(); });

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      es?.close();
    };
  }

  /**
   * P1b-SSE review fix: FAN-OUT, not replace. One ref-counted stream per
   * (path, eventName); concurrent subscribers share it (AppShell's
   * always-mounted waggle badge + the WaggleDance screen both consume
   * /api/waggle/stream — the old replace-on-resubscribe dedup let the second
   * mount permanently kill the first's stream). The socket closes only when
   * the last subscriber leaves.
   *
   * `eventName` selects NAMED SSE events (review fix: the events/waggle
   * routes emit `event: audit` / `event: signal`, which `onmessage` never
   * receives per the SSE spec — both channels were payload-dead even with
   * working auth).
   */
  private subscribeSSE(path: string, onData: (data: unknown) => void, eventName?: string): () => void {
    const key = `${path}#${eventName ?? 'message'}`;
    let stream = this.sseStreams.get(key);
    if (!stream) {
      const listeners = new Set<(data: unknown) => void>();
      const dispatch = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          for (const l of listeners) l(data);
        } catch { /* skip malformed */ }
      };
      const close = this.openSSE(path, (es) => {
        if (eventName) es.addEventListener(eventName, dispatch as EventListener);
        else es.onmessage = dispatch;
      });
      stream = { close, listeners };
      this.sseStreams.set(key, stream);
    }
    const entry = stream;
    entry.listeners.add(onData);
    return () => {
      entry.listeners.delete(onData);
      if (entry.listeners.size === 0) {
        entry.close();
        if (this.sseStreams.get(key) === entry) this.sseStreams.delete(key);
      }
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

  async createCheckoutSession(
    tier: 'PRO' | 'TEAMS',
    billingPeriod?: 'monthly' | 'annual',
  ): Promise<{ url: string }> {
    // PR7a/D8: thread billingPeriod so the annual toggle resolves the real annual
    // Stripe price (priceIdForTier). Omitted → backend defaults to monthly.
    const res = await this.fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      body: JSON.stringify(billingPeriod ? { tier, billingPeriod } : { tier }),
    });
    return res.json();
  }

  async createPortalSession(): Promise<{ url: string }> {
    const res = await this.fetch('/api/stripe/create-portal-session', {
      method: 'POST',
    });
    return res.json();
  }

  /** PR7a/F8: secret-free probe of whether Stripe checkout is wired, so the
   *  billing UI can render the honest disabled state before a click (not a 503 after). */
  async getStripeStatus(): Promise<{ configured: boolean }> {
    const res = await this.fetch('/api/stripe/status');
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
    // P1b D3: the chokepoint now throws AdapterHttpError before the legacy
    // !ok block could run — rethrow in the test-pinned legacy format.
    try {
      const res = await this.fetch('/api/data/erase', {
        method: 'POST',
        headers: { 'X-Confirm-Erase': 'yes' },
        body: JSON.stringify({ confirmation: confirmationPhrase }),
      });
      return res.json();
    } catch (e) {
      if (e instanceof AdapterHttpError) {
        const b = e.body as { message?: string; error?: string } | undefined;
        throw new Error(`Erase failed (${e.status}): ${b?.message ?? b?.error ?? e.statusText}`);
      }
      throw e;
    }
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
    // P1b D3: chokepoint throws first — rethrow in the test-pinned legacy format.
    try {
      const res = await this.fetch('/api/tier/start-trial', { method: 'POST' });
      return res.json();
    } catch (e) {
      if (e instanceof AdapterHttpError) {
        const b = e.body as { message?: string; error?: string } | undefined;
        throw new Error(`Start trial failed (${e.status}): ${b?.message ?? b?.error ?? e.statusText}`);
      }
      throw e;
    }
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

  async harvestCommit(
    data: unknown,
    source: string,
    opts?: { selectedIds?: Array<string | number>; resumeFromRun?: number },
  ): Promise<any> {
    const res = await this.fetch('/api/harvest/commit', {
      method: 'POST',
      body: JSON.stringify({ data, source, ...(opts ?? {}) }),
    });
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
