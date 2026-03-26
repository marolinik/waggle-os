/** Detect whether we're running inside Tauri (desktop) or plain browser (web mode). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
}

/**
 * Determine the server base URL:
 * - Tauri desktop or Vite dev server (port 1420): always localhost:3333
 * - Web production (served by Fastify): same origin as the page
 */
export function getServerBaseUrl(): string {
  const port = typeof window !== 'undefined' ? window.location?.port : '';
  if (port === '1420' || isTauri()) {
    return 'http://127.0.0.1:3333';
  }
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:3333';
}

const SERVICE_URL = getServerBaseUrl();

// ── Auth-aware fetch ─────────────────────────────────────────────────
// The server requires Bearer token auth on all routes except /health.
// We fetch the token from /health and cache it for subsequent calls.

let _cachedToken: string | null = null;

async function getAuthToken(): Promise<string | null> {
  if (_cachedToken) return _cachedToken;
  try {
    const res = await fetch(`${SERVICE_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      if (data.wsToken) {
        _cachedToken = data.wsToken;
        return _cachedToken;
      }
    }
  } catch { /* server not available */ }
  return null;
}

/**
 * Auth-aware fetch wrapper. Automatically includes the Bearer token.
 * Use this instead of raw fetch() for all server API calls.
 */
export async function authFetch(url: string | URL, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  const headers = new Headers(init?.headers);
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return fetch(url, { ...init, headers });
}

/** Reset cached token (call after server restart) */
export function resetAuthToken(): void {
  _cachedToken = null;
}

/**
 * Ensure the local agent service is running.
 * In web mode the server is already running (it's serving this page).
 * In Tauri mode, falls back to the Tauri command to start the sidecar.
 */
export async function ensureService(): Promise<string> {
  try {
    const res = await fetch(`${SERVICE_URL}/health`);
    if (res.ok) return 'Service running';
  } catch {
    // Service not running — try Tauri to start it (desktop only)
  }

  if (!isTauri()) {
    throw new Error('Service not reachable. Start the server with `npx waggle` or `npx tsx packages/server/src/local/start.ts`');
  }

  const coreModule = '@tauri-apps/' + 'api/core';
  const { invoke } = await import(/* @vite-ignore */ coreModule);
  return invoke('ensure_service');
}

/**
 * Stop the local agent service.
 * Only works in Tauri mode — in web mode the server lifecycle is external.
 */
export async function stopService(): Promise<string> {
  if (!isTauri()) return 'Web mode — server lifecycle managed externally';

  const coreModule = '@tauri-apps/' + 'api/core';
  const { invoke } = await import(/* @vite-ignore */ coreModule);
  return invoke('stop_service');
}

/**
 * Get the configured service port.
 * In web mode, inferred from the current origin.
 */
export async function getServicePort(): Promise<number> {
  if (!isTauri()) {
    const port = parseInt(window.location.port || '3333');
    return port;
  }

  const coreModule = '@tauri-apps/' + 'api/core';
  const { invoke } = await import(/* @vite-ignore */ coreModule);
  return invoke('get_service_port');
}

/**
 * Thin HTTP client for the localhost agent service.
 * All real logic lives in @waggle/ui's LocalAdapter — this is just the
 * bridge layer for legacy ipc consumers that haven't migrated yet.
 */
export const api = {
  health: async () => {
    const res = await fetch(`${SERVICE_URL}/health`);
    return res.json();
  },

  ping: async () => {
    const res = await fetch(`${SERVICE_URL}/health`);
    if (!res.ok) throw new Error('Service not reachable');
    return { status: 'ok' };
  },

  getIdentity: async (): Promise<string> => {
    const res = await fetch(`${SERVICE_URL}/api/mind/identity`);
    if (!res.ok) throw new Error('Failed to get identity');
    const data = await res.json();
    return data.identity;
  },

  getAwareness: async (): Promise<string> => {
    const res = await fetch(`${SERVICE_URL}/api/mind/awareness`);
    if (!res.ok) throw new Error('Failed to get awareness');
    const data = await res.json();
    return data.awareness;
  },

  sendMessage: async (message: string) => {
    const res = await fetch(`${SERVICE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) throw new Error('Failed to send message');
    return res.json();
  },

  getSettings: async (): Promise<Record<string, unknown>> => {
    const res = await fetch(`${SERVICE_URL}/api/settings`);
    if (!res.ok) throw new Error('Failed to get settings');
    return res.json();
  },

  setSettings: async (key: string, value: unknown) => {
    const res = await fetch(`${SERVICE_URL}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    });
    if (!res.ok) throw new Error('Failed to set settings');
    return res.json();
  },
};

/**
 * Generic RPC-style call via HTTP POST.
 * Maps legacy rpcCall(method, params) to POST /api/rpc.
 * Falls back to method-based routing if the RPC endpoint doesn't exist.
 */
export async function rpcCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const res = await fetch(`${SERVICE_URL}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
  });
  if (!res.ok) throw new Error(`RPC call '${method}' failed: ${res.statusText}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.result;
}

// Re-export for backward compatibility
export const ipc = api;
