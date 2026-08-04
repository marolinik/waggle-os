/**
 * P1b D3 — structural auth gate: deferral, throw-on-!ok, 401-refresh-retry.
 *
 * Pins the four-state ensureReady() contract (never-attempted passthrough /
 * in-flight deferral / settled-success passthrough / settled-failure re-arm),
 * the connect watchdog, the setServerUrl epoch guard, AdapterHttpError's
 * message-first precedence, the 403 dispatch-then-throw ordering, the
 * token-versioned single-flight 401 retry, and the fetchRaw body-envelope
 * contract for the getters whose ERROR bodies are load-bearing (installMcp's
 * ApprovalModal security envelope et al). These are the regression locks the
 * existing component tests cannot provide — they mock the adapter methods
 * themselves and are structurally blind to the fetch-layer semantics.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter, {
  AdapterHttpError,
  adapter as singletonAdapter,
  resolveDefaultServerUrl,
} from './adapter';
import { fetchWithTimeout } from './fetch-utils';

const BASE = 'http://test-server:4242';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const HEALTH = { status: 'ok', mode: 'local' };
const TOKEN_PATH = '/api/auth/session-token';
const DESKTOP_A = { port: 49151, instanceId: 'desktop-instance-a' };
const DESKTOP_B = { port: 49152, instanceId: 'desktop-instance-b' };

const desktopHealth = (endpoint = DESKTOP_A) => ({
  ...HEALTH,
  port: endpoint.port,
  instanceId: endpoint.instanceId,
});

const enableTauri = () => {
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {};
};

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly url: string;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(): void { /* listeners are irrelevant to the identity gate */ }
  close(): void { this.closed = true; }
  fireError(): void { this.onerror?.(); }
}

/** Route-style fetch mock: dispatch on URL substring, in registration order. */
function routeMock(fetchSpy: ReturnType<typeof vi.spyOn>, routes: Array<[string, () => Response | Promise<Response>]>) {
  fetchSpy.mockImplementation(async (url: unknown) => {
    const u = String(url);
    for (const [needle, handler] of routes) {
      if (u.includes(needle)) return handler();
    }
    throw new Error(`unmocked fetch: ${u}`);
  });
}

const callsTo = (fetchSpy: ReturnType<typeof vi.spyOn>, needle: string) =>
  fetchSpy.mock.calls.filter(([u]) => String(u).includes(needle)) as unknown as Array<[string, RequestInit]>;

describe('P1b auth gate', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorage.clear();
  });

  afterEach(() => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.unstubAllGlobals();
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  it('fresh local web sessions default to the current HTTP origin', () => {
    expect(resolveDefaultServerUrl({
      protocol: 'http:',
      hostname: '127.0.0.1',
      port: '3344',
      origin: 'http://127.0.0.1:3344',
    } as Location)).toBe('http://127.0.0.1:3344');
    expect(resolveDefaultServerUrl({
      protocol: 'http:',
      hostname: 'localhost',
      port: '8081',
      origin: 'http://localhost:8081',
    } as Location)).toBe('http://localhost:8081');
  });

  it('non-local or non-HTTP browser origins keep the sidecar fallback', () => {
    expect(resolveDefaultServerUrl({
      protocol: 'https:',
      hostname: 'localhost',
      port: '3344',
      origin: 'https://localhost:3344',
    } as Location)).toBe('http://127.0.0.1:3333');
    expect(resolveDefaultServerUrl({
      protocol: 'tauri:',
      hostname: 'localhost',
      port: '',
      origin: 'tauri://localhost',
    } as Location)).toBe('http://127.0.0.1:3333');
    expect(resolveDefaultServerUrl({
      protocol: 'http:',
      hostname: 'localhost.evil.com',
      port: '3344',
      origin: 'http://localhost.evil.com:3344',
    } as Location)).toBe('http://127.0.0.1:3333');
  });

  /** Standard happy-path connect: /health ok + token ok. */
  async function connectedAdapter(token = 'tok-A') {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token })],
    ]);
    await a.connect();
    return a;
  }

  // ── Gate states ──────────────────────────────────────────────────────────

  it('zero network on construction (kickoff lives in boot-connect.ts, not the adapter)', () => {
    void new LocalAdapter(BASE);
    expect(singletonAdapter).toBeDefined(); // module import already happened — and made no calls
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never-attempted: requests pass through ungated, no token fetch (unit-test compat)', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/workspaces', () => jsonRes([])]]);
    await a.getWorkspaces();
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('in-flight: a request fired during connect defers until the token is attached', async () => {
    const a = new LocalAdapter(BASE);
    let releaseToken!: (r: Response) => void;
    const tokenGate = new Promise<Response>(res => { releaseToken = res; });
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => tokenGate],
      ['/api/workspaces', () => jsonRes([])],
    ]);
    const connectP = a.connect();
    const wsP = a.getWorkspaces(); // must NOT fire token-less
    await new Promise(r => setTimeout(r, 10));
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(0); // still gated
    releaseToken(jsonRes({ token: 'tok-A' }));
    await connectP;
    await wsP;
    const ws = callsTo(fetchSpy, '/api/workspaces');
    expect(ws).toHaveLength(1);
    expect((ws[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-A');
  });

  it('settled-success: memo retained — a second connect() makes no new requests', async () => {
    const a = await connectedAdapter();
    const callsAfterFirst = fetchSpy.mock.calls.length;
    await a.connect();
    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('same-tick connect() calls share one probe (StrictMode / boot+provider dedup)', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token: 'tok-A' })],
    ]);
    await Promise.all([a.connect(), a.connect()]);
    expect(callsTo(fetchSpy, '/health')).toHaveLength(1);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
  });

  it('settled-failure: gate re-arms — the next request kicks a fresh connect and goes out authed', async () => {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockRejectedValue(new TypeError('ECONNREFUSED'));
    await expect(a.connect()).rejects.toThrow();
    // Sidecar comes up:
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token: 'tok-A' })],
      ['/api/workspaces', () => jsonRes([])],
    ]);
    await a.getWorkspaces();
    const ws = callsTo(fetchSpy, '/api/workspaces');
    expect(ws).toHaveLength(1);
    expect((ws[0][1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-A');
    expect(callsTo(fetchSpy, '/health').length).toBeGreaterThanOrEqual(1);
  });

  it('a failed connect releases the gate — the request fails with its own cause, no hang', async () => {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockRejectedValue(new TypeError('ECONNREFUSED'));
    await expect(a.connect()).rejects.toThrow();
    await expect(a.getWorkspaces()).rejects.toThrow(/Network error/);
  });

  it('watchdog: connect settles even when a probe body read hangs forever', async () => {
    vi.useFakeTimers();
    const a = new LocalAdapter(BASE);
    const hanging = {
      ok: true, status: 200, statusText: 'OK',
      json: () => new Promise(() => { /* never */ }),
      clone() { return this; },
    } as unknown as Response;
    fetchSpy.mockResolvedValue(hanging);
    const p = a.connect();
    const assertion = expect(p).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16000);
    await assertion;
    expect(a.isConnected).toBe(false);
  });

  it('exempt paths bypass the gate: getSystemHealth works on a fresh adapter with zero token traffic', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/health', () => jsonRes(HEALTH)]]);
    const h = await a.getSystemHealth();
    expect(h.status).toBe('ok');
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(0);
  });

  // ── Rust-owned desktop endpoint gate ─────────────────────────────────────

  it('managed desktop stays network-cold and hides default/stored URLs until Rust binds an endpoint', async () => {
    enableTauri();
    localStorage.setItem('waggle:server-url', 'http://stale-or-hostile:9999');
    const a = new LocalAdapter('http://constructor-override:8888');
    const gateId = a.armDesktopServiceGate();
    const request = a.getWorkspaces();
    const healthRequest = a.getSystemHealth();
    const rejected = expect(request).rejects.toThrow('desktop boot stopped');
    const healthRejected = expect(healthRequest).rejects.toThrow('desktop boot stopped');

    await Promise.resolve();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(() => a.getServerUrl()).toThrow(/not ready/);

    a.failDesktopServiceGate(new Error('desktop boot stopped'), gateId);
    await Promise.all([rejected, healthRejected]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.getItem('waggle:server-url')).toBe('http://stale-or-hostile:9999');
  });

  it('managed desktop uses only the matching Rust-owned endpoint and never persists it', async () => {
    enableTauri();
    localStorage.setItem('waggle:server-url', 'http://stale-or-hostile:9999');
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_A))],
      [TOKEN_PATH, () => jsonRes({ token: 'desktop-token-a' })],
      ['/api/workspaces', () => jsonRes([])],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    await a.getWorkspaces();

    expect(a.getServerUrl()).toBe(`http://127.0.0.1:${DESKTOP_A.port}`);
    expect(localStorage.getItem('waggle:server-url')).toBe('http://stale-or-hostile:9999');
    expect(callsTo(fetchSpy, '/health')).toHaveLength(2);
    const [workspaceUrl, workspaceInit] = callsTo(fetchSpy, '/api/workspaces')[0];
    expect(workspaceUrl).toBe(`http://127.0.0.1:${DESKTOP_A.port}/api/workspaces`);
    expect((workspaceInit.headers as Record<string, string>).Authorization)
      .toBe('Bearer desktop-token-a');
  });

  it('managed 401 recovery revalidates identity before retrying on the same port', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    let health = desktopHealth(DESKTOP_A);
    let token = 'desktop-token-a';
    let workspaceCalls = 0;
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(health)],
      [TOKEN_PATH, () => jsonRes({ token })],
      ['/api/workspaces', () => {
        workspaceCalls++;
        return jsonRes({ error: 'Unauthorized' }, 401);
      }],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    health = { ...desktopHealth(DESKTOP_B), port: DESKTOP_A.port };
    token = 'desktop-token-b';

    await expect(a.getWorkspaces()).rejects.toThrow(/identity/);
    expect(workspaceCalls).toBe(1);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(2);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('a post-ready managed health failure closes the verified desktop gate', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_A))],
      [TOKEN_PATH, () => jsonRes({ token: 'desktop-token-a' })],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    fetchSpy.mockRejectedValue(new TypeError('managed sidecar disappeared'));

    await expect(a.getSystemHealth()).rejects.toThrow();
    expect(a.isConnected).toBe(false);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('wrong desktop identity rejects the binding, shared connect, and queued request without token leakage', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_B))],
      [TOKEN_PATH, () => jsonRes({ token: 'must-not-be-fetched' })],
      ['/api/workspaces', () => jsonRes([])],
    ]);

    const gateId = a.armDesktopServiceGate();
    const binding = a.connectDesktopService(DESKTOP_A, gateId);
    const sharedConnect = a.connect();
    const queuedRequest = a.getWorkspaces();

    await Promise.all([
      expect(binding).rejects.toThrow(/identity/),
      expect(sharedConnect).rejects.toThrow(/identity/),
      expect(queuedRequest).rejects.toThrow(/identity/),
    ]);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(0);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(0);
    expect(a.isConnected).toBe(false);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('failing the desktop gate while token bootstrap is pending cannot be reopened by its late completion', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    let releaseToken!: (response: Response) => void;
    const tokenGate = new Promise<Response>(resolve => { releaseToken = resolve; });
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_A))],
      [TOKEN_PATH, () => tokenGate],
      ['/api/workspaces', () => jsonRes([])],
    ]);

    const gateId = a.armDesktopServiceGate();
    const binding = a.connectDesktopService(DESKTOP_A, gateId);
    const sharedConnect = a.connect();
    const queuedRequest = a.getWorkspaces();
    await vi.waitFor(() => expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1));

    const bindingRejected = expect(binding).rejects.toThrow(/shell stopped|generation changed/);
    const sharedRejected = expect(sharedConnect).rejects.toThrow(/superseded|generation changed/);
    const queuedRejected = expect(queuedRequest).rejects.toThrow('shell stopped');
    a.failDesktopServiceGate(new Error('shell stopped'), gateId);
    releaseToken(jsonRes({ token: 'late-token' }));

    await Promise.all([bindingRejected, sharedRejected, queuedRejected]);
    expect(a.isConnected).toBe(false);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(0);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('superseding a token-pending launch rejects stale consumers and releases work only on the newer endpoint', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    let releaseOldToken!: (response: Response) => void;
    const oldTokenGate = new Promise<Response>(resolve => { releaseOldToken = resolve; });
    fetchSpy.mockImplementation(async (url: unknown) => {
      const value = String(url);
      if (value === `http://127.0.0.1:${DESKTOP_A.port}/health`) {
        return jsonRes(desktopHealth(DESKTOP_A));
      }
      if (value === `http://127.0.0.1:${DESKTOP_A.port}${TOKEN_PATH}`) return oldTokenGate;
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/health`) {
        return jsonRes(desktopHealth(DESKTOP_B));
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}${TOKEN_PATH}`) {
        return jsonRes({ token: 'desktop-token-b' });
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/api/workspaces`) return jsonRes([]);
      throw new Error(`unmocked fetch: ${value}`);
    });

    const firstGate = a.armDesktopServiceGate();
    const staleBinding = a.connectDesktopService(DESKTOP_A, firstGate);
    const staleConsumer = a.connect();
    await vi.waitFor(() => expect(
      callsTo(fetchSpy, `:${DESKTOP_A.port}${TOKEN_PATH}`),
    ).toHaveLength(1));

    const staleBindingRejected = expect(staleBinding).rejects.toThrow(/superseded|changed/);
    const staleConsumerRejected = expect(staleConsumer).rejects.toThrow(/superseded|changed/);
    const secondGate = a.armDesktopServiceGate();
    const queuedRequest = a.getWorkspaces();
    await a.connectDesktopService(DESKTOP_B, secondGate);
    await queuedRequest;
    releaseOldToken(jsonRes({ token: 'stale-token-a' }));
    await Promise.all([staleBindingRejected, staleConsumerRejected]);

    expect(a.getServerUrl()).toBe(`http://127.0.0.1:${DESKTOP_B.port}`);
    expect(a.isConnected).toBe(true);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(1);
  });

  it('same-gate competing bindings let only the newest endpoint commit or fail the gate', async () => {
    enableTauri();
    const a = new LocalAdapter(BASE);
    let releaseOldHealth!: (response: Response) => void;
    const oldHealthGate = new Promise<Response>(resolve => { releaseOldHealth = resolve; });
    fetchSpy.mockImplementation(async (url: unknown) => {
      const value = String(url);
      if (value === `http://127.0.0.1:${DESKTOP_A.port}/health`) return oldHealthGate;
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/health`) {
        return jsonRes(desktopHealth(DESKTOP_B));
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}${TOKEN_PATH}`) {
        return jsonRes({ token: 'desktop-token-b' });
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/api/workspaces`) return jsonRes([]);
      throw new Error(`unmocked fetch: ${value}`);
    });

    const gateId = a.armDesktopServiceGate();
    const staleBinding = a.connectDesktopService(DESKTOP_A, gateId);
    const staleRejected = expect(staleBinding).rejects.toThrow(/identity|superseded|changed/);
    await vi.waitFor(() => expect(callsTo(fetchSpy, `:${DESKTOP_A.port}/health`)).toHaveLength(1));

    await a.connectDesktopService(DESKTOP_B, gateId);
    await a.getWorkspaces();
    releaseOldHealth(jsonRes(desktopHealth(DESKTOP_A)));
    await staleRejected;

    expect(a.getServerUrl()).toBe(`http://127.0.0.1:${DESKTOP_B.port}`);
    expect(a.isConnected).toBe(true);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(1);
  });

  it('a current managed health deadline fails closed instead of releasing queued work', async () => {
    vi.useFakeTimers();
    enableTauri();
    const a = new LocalAdapter(BASE);
    fetchSpy.mockImplementation(() => new Promise<Response>(() => { /* never */ }));

    const gateId = a.armDesktopServiceGate();
    const binding = a.connectDesktopService(DESKTOP_A, gateId);
    const queuedRequest = a.getWorkspaces();
    const bindingRejected = expect(binding).rejects.toThrow(/timed out/);
    const queuedRejected = expect(queuedRequest).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16000);
    await Promise.all([bindingRejected, queuedRejected]);

    expect(a.isConnected).toBe(false);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('the outer connect watchdog fails closed when token bootstrap body stalls after healthy identity', async () => {
    vi.useFakeTimers();
    enableTauri();
    const a = new LocalAdapter(BASE);
    const hangingTokenBody = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => new Promise(() => { /* never */ }),
      clone() { return this; },
    } as unknown as Response;
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_A))],
      [TOKEN_PATH, () => hangingTokenBody],
    ]);

    const gateId = a.armDesktopServiceGate();
    const binding = a.connectDesktopService(DESKTOP_A, gateId);
    const queuedRequest = a.getWorkspaces();
    const bindingRejected = expect(binding).rejects.toThrow(/timed out/);
    const queuedRejected = expect(queuedRequest).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16000);
    await Promise.all([bindingRejected, queuedRejected]);

    expect(callsTo(fetchSpy, '/health')).toHaveLength(1);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
    expect(a.isConnected).toBe(false);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('managed 401 token-body timeout rejects once and closes the verified gate', async () => {
    vi.useFakeTimers();
    enableTauri();
    const a = new LocalAdapter(BASE);
    let tokenCalls = 0;
    let workspaceCalls = 0;
    const hangingTokenBody = {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => new Promise(() => { /* never */ }),
      clone() { return this; },
    } as unknown as Response;
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(desktopHealth(DESKTOP_A))],
      [TOKEN_PATH, () => (++tokenCalls === 1
        ? jsonRes({ token: 'desktop-token-a' })
        : hangingTokenBody)],
      ['/api/workspaces', () => {
        workspaceCalls++;
        return jsonRes({ error: 'Unauthorized' }, 401);
      }],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    const request = a.getWorkspaces();
    const rejected = expect(request).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16000);
    await rejected;

    expect(tokenCalls).toBe(2);
    expect(workspaceCalls).toBe(1);
    expect(a.isConnected).toBe(false);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
  });

  it('a stale managed deadline cannot poison a newer verified generation', async () => {
    vi.useFakeTimers();
    enableTauri();
    const a = new LocalAdapter(BASE);
    fetchSpy.mockImplementation(async (url: unknown) => {
      const value = String(url);
      if (value === `http://127.0.0.1:${DESKTOP_A.port}/health`) {
        return new Promise<Response>(() => { /* never */ });
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/health`) {
        return jsonRes(desktopHealth(DESKTOP_B));
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}${TOKEN_PATH}`) {
        return jsonRes({ token: 'desktop-token-b' });
      }
      if (value === `http://127.0.0.1:${DESKTOP_B.port}/api/workspaces`) return jsonRes([]);
      throw new Error(`unmocked fetch: ${value}`);
    });

    const firstGate = a.armDesktopServiceGate();
    const staleBinding = a.connectDesktopService(DESKTOP_A, firstGate);
    const staleRejected = expect(staleBinding).rejects.toThrow(/timed out/);
    await Promise.resolve();
    expect(callsTo(fetchSpy, `:${DESKTOP_A.port}/health`)).toHaveLength(1);

    const secondGate = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_B, secondGate);
    await a.getWorkspaces();
    await vi.advanceTimersByTimeAsync(16000);
    await staleRejected;

    expect(a.getServerUrl()).toBe(`http://127.0.0.1:${DESKTOP_B.port}`);
    expect(a.isConnected).toBe(true);
  });

  it('desktop gate APIs are inert in the browser and cannot change browser routing', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/workspaces', () => jsonRes([])]]);

    expect(a.armDesktopServiceGate()).toBe(0);
    a.failDesktopServiceGate(new Error('ignored'), 0);
    await a.getWorkspaces();
    await expect(a.connectDesktopService(DESKTOP_A, 0)).rejects.toThrow(/only available inside Tauri/);

    expect(a.getServerUrl()).toBe(BASE);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(1);
  });

  it('managed SSE initial open revalidates identity and never opens on a same-port replacement', async () => {
    enableTauri();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    const a = new LocalAdapter(BASE);
    let health = desktopHealth(DESKTOP_A);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(health)],
      [TOKEN_PATH, () => jsonRes({ token: 'desktop-token-a' })],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    health = { ...desktopHealth(DESKTOP_B), port: DESKTOP_A.port };
    const unsubscribe = a.subscribeNotifications(() => {});
    await flush();

    expect(FakeEventSource.instances).toHaveLength(0);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
    unsubscribe();
  });

  it('managed SSE retry revalidates identity after token refresh and refuses an unverified replacement', async () => {
    vi.useFakeTimers();
    enableTauri();
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    const a = new LocalAdapter(BASE);
    let health = desktopHealth(DESKTOP_A);
    let token = 'desktop-token-a';
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(health)],
      [TOKEN_PATH, () => jsonRes({ token })],
    ]);

    const gateId = a.armDesktopServiceGate();
    await a.connectDesktopService(DESKTOP_A, gateId);
    const unsubscribe = a.subscribeNotifications(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeEventSource.instances).toHaveLength(1);

    health = { ...desktopHealth(DESKTOP_B), port: DESKTOP_A.port };
    token = 'desktop-token-b';
    FakeEventSource.instances[0].fireError();
    await vi.advanceTimersByTimeAsync(1100);

    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(() => a.getServerUrl()).toThrow(/not ready/);
    unsubscribe();
  });

  // ── setServerUrl epoch guard ─────────────────────────────────────────────

  it('setServerUrl mid-flight: the stale connect cannot set connected state or the token', async () => {
    const a = new LocalAdapter(BASE);
    let releaseHealth!: (r: Response) => void;
    const healthGate = new Promise<Response>(res => { releaseHealth = res; });
    routeMock(fetchSpy, [
      ['/health', () => healthGate],
      [TOKEN_PATH, () => jsonRes({ token: 'stale-token' })],
    ]);
    const p = a.connect();
    a.setServerUrl('http://user-chose-this:9999');
    releaseHealth(jsonRes(HEALTH));
    await p.catch(() => { /* either outcome — state must not leak */ });
    expect(a.isConnected).toBe(false);
    expect(a.getServerUrl()).toBe('http://user-chose-this:9999');
    expect(localStorage.getItem('waggle:server-url')).toBe('http://user-chose-this:9999');
  });

  // ── Throw-on-!ok chokepoint ──────────────────────────────────────────────

  it('AdapterHttpError: message-first precedence (body.message ?? body.error ?? HTTP n) + status/body fields', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/tier', () => jsonRes({ error: 'E_CODE', message: 'Human reason' }, 500)]]);
    const err = await a.getTier().catch((e: unknown) => e) as AdapterHttpError;
    expect(err).toBeInstanceOf(AdapterHttpError);
    expect(err.message).toBe('Human reason');
    expect(err.status).toBe(500);
    expect((err.body as { error: string }).error).toBe('E_CODE');

    routeMock(fetchSpy, [['/api/tier', () => jsonRes({ error: 'only-error' }, 404)]]);
    const err2 = await a.getTier().catch((e: unknown) => e) as AdapterHttpError;
    expect(err2.message).toBe('only-error');

    routeMock(fetchSpy, [['/api/tier', () => new Response('plain text', { status: 502 })]]);
    const err3 = await a.getTier().catch((e: unknown) => e) as AdapterHttpError;
    expect(err3.message).toBe('HTTP 502');
  });

  it('the six ruling-named getters reject on HTTP failure instead of returning silent-empty', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/', () => jsonRes({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, 500)]]);
    await expect(a.getMarketplace()).rejects.toThrow(AdapterHttpError);
    await expect(a.getMcps()).rejects.toThrow(AdapterHttpError);
    await expect(a.getPersonas()).rejects.toThrow(AdapterHttpError);
    await expect(a.getModels()).rejects.toThrow(AdapterHttpError);
    await expect(a.getWorkspaceTemplates()).rejects.toThrow(AdapterHttpError);
    await expect(a.getTier()).rejects.toThrow(AdapterHttpError);
  });

  it('403 TIER_INSUFFICIENT: dispatch-then-throw on the throwing path, dispatch-and-return on fetchRaw', async () => {
    const a = new LocalAdapter(BASE);
    const events: unknown[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('waggle:tier-insufficient', listener);
    try {
      const tierBody = { error: 'TIER_INSUFFICIENT', message: 'Needs TEAMS', required: 'TEAMS', actual: 'FREE' };
      routeMock(fetchSpy, [['/api/personas', () => jsonRes(tierBody, 403)]]);
      await expect(a.getPersonas()).rejects.toThrow('Needs TEAMS');
      expect(events).toHaveLength(1);

      routeMock(fetchSpy, [['/api/mcps/install', () => jsonRes({ installed: false, ...tierBody }, 403)]]);
      const envelope = await a.installMcp('exa');
      expect((envelope as { error?: string }).error).toBe('TIER_INSUFFICIENT');
      expect(events).toHaveLength(2);
    } finally {
      window.removeEventListener('waggle:tier-insufficient', listener);
    }
  });

  it('sendMessage: an HTTP error now throws into the consumer instead of yielding nothing', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: 'tok-A' })],
      ['/api/chat', () => jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)],
    ]);
    const consume = async () => {
      const events = [];
      for await (const ev of a.sendMessage('ws1', 'hi')) events.push(ev);
      return events;
    };
    await expect(consume()).rejects.toThrow(AdapterHttpError);
  });

  it('fetchWithTimeout preserves fresh and pre-aborted caller cancellation without AbortSignal.any', async () => {
    const anyDescriptor = Object.getOwnPropertyDescriptor(AbortSignal, 'any');
    Object.defineProperty(AbortSignal, 'any', { configurable: true, value: undefined });
    vi.useFakeTimers();
    const caller = new AbortController();
    fetchSpy.mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = (init as RequestInit | undefined)?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error('missing request signal');
      if (signal.aborted) {
        reject(new DOMException('The operation was aborted', 'AbortError'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted', 'AbortError')),
        { once: true },
      );
    }));

    try {
      const request = fetchWithTimeout(`${BASE}/slow`, { signal: caller.signal });
      caller.abort();
      await expect(request).rejects.toMatchObject({ name: 'AbortError' });

      const preAborted = new AbortController();
      preAborted.abort();
      await expect(fetchWithTimeout(`${BASE}/already-stopped`, {
        signal: preAborted.signal,
      })).rejects.toMatchObject({ name: 'AbortError' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      if (anyDescriptor) Object.defineProperty(AbortSignal, 'any', anyDescriptor);
      else Reflect.deleteProperty(AbortSignal, 'any');
    }
  });

  it('abortAgent cancels only the requested chat session', async () => {
    const a = new LocalAdapter(BASE);
    const requestSignals: AbortSignal[] = [];
    fetchSpy.mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = (init as RequestInit | undefined)?.signal;
      if (!(signal instanceof AbortSignal)) throw new Error('missing request signal');
      requestSignals.push(signal);
      signal.addEventListener(
        'abort',
        () => reject(new DOMException('The operation was aborted', 'AbortError')),
        { once: true },
      );
    }));

    const sessionA = a.sendMessage('ws1', 'first', 'session-a');
    const sessionB = a.sendMessage('ws1', 'second', 'session-b');
    const resultA = sessionA.next().catch((error: unknown) => error);
    const resultB = sessionB.next().catch((error: unknown) => error);

    await vi.waitFor(() => expect(requestSignals).toHaveLength(2));
    await a.abortAgent('ws1', 'session-a');
    expect(requestSignals[0].aborted).toBe(true);
    expect(requestSignals[1].aborted).toBe(false);
    await expect(resultA).resolves.toMatchObject({ name: 'AbortError' });

    await a.abortAgent('ws1');
    expect(requestSignals[1].aborted).toBe(true);
    await expect(resultB).resolves.toMatchObject({ name: 'AbortError' });
  });

  // ── Body-envelope getters (fetchRaw contract — ApprovalModal flow et al) ──

  it('installMcp resolves the 422 SecurityGate envelope (requiresApproval) instead of throwing', async () => {
    const a = new LocalAdapter(BASE);
    const envelope = { installed: false, requiresApproval: true, blocked: true, severity: 'HIGH', scanResult: { findings: 2 } };
    routeMock(fetchSpy, [['/api/mcps/install', () => jsonRes(envelope, 422)]]);
    await expect(a.installMcp('shady-mcp')).resolves.toMatchObject({ installed: false, requiresApproval: true });
  });

  it.each([
    ['addCustomMcp', (a: InstanceType<typeof LocalAdapter>) => a.addCustomMcp({ name: 'x', command: 'y' }), '/api/mcps'],
    ['testMcp', (a: InstanceType<typeof LocalAdapter>) => a.testMcp('m1'), '/api/mcps/m1/test'],
    ['startMcp', (a: InstanceType<typeof LocalAdapter>) => a.startMcp('m1'), '/api/mcps/m1/start'],
    ['stopMcp', (a: InstanceType<typeof LocalAdapter>) => a.stopMcp('m1'), '/api/mcps/m1/stop'],
    ['revokeMcp', (a: InstanceType<typeof LocalAdapter>) => a.revokeMcp('m1'), '/api/mcps/m1/revoke'],
    ['updateMcpPermissions', (a: InstanceType<typeof LocalAdapter>) => a.updateMcpPermissions('m1', { scope: 'personal' }), '/api/mcps/m1/permissions'],
    ['revokeConnector', (a: InstanceType<typeof LocalAdapter>) => a.revokeConnector('c1'), '/api/connectors/c1/revoke'],
  ])('%s resolves its error envelope as data (body-envelope contract)', async (_name, call, path) => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [[path, () => jsonRes({ error: 'spawn timed out after 10000ms' }, 502)]]);
    await expect(call(a)).resolves.toMatchObject({ error: 'spawn timed out after 10000ms' });
  });

  it('installMarketplacePackage stays raw (status readable); uninstall now throws on failure', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/marketplace/install', () => jsonRes({ error: 'TIER_INSUFFICIENT' }, 403)]]);
    const res = await a.installMarketplacePackage(7);
    expect(res.status).toBe(403);

    routeMock(fetchSpy, [['/api/marketplace/uninstall', () => jsonRes({ error: 'boom' }, 500)]]);
    await expect(a.uninstallMarketplacePackage(7)).rejects.toThrow(AdapterHttpError);
  });

  // ── 401 → refresh → single retry ─────────────────────────────────────────

  it('401: refreshes the token once and retries with the new bearer', async () => {
    const a = await connectedAdapter('tok-A');
    let wsCalls = 0;
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: 'tok-B' })],
      ['/api/workspaces', () => (++wsCalls === 1
        ? jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)
        : jsonRes([]))],
    ]);
    await a.getWorkspaces();
    const ws = callsTo(fetchSpy, '/api/workspaces');
    expect(ws).toHaveLength(2);
    expect((ws[1][1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-B');
  });

  it('still-401 after the retry surfaces as AdapterHttpError — exactly one refresh, one retry', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: 'tok-B' })],
      ['/api/workspaces', () => jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)],
    ]);
    await expect(a.getWorkspaces()).rejects.toThrow(AdapterHttpError);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(2);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
  });

  it('straggler 401 burst: concurrent failures share ONE single-flight refresh', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    let wsCalls = 0;
    let sesCalls = 0;
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: `tok-B` })],
      ['/api/workspaces', () => (++wsCalls <= 2
        ? jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)
        : jsonRes([]))],
      ['/api/sessions-x', () => (++sesCalls <= 1 ? jsonRes({ error: 'Unauthorized' }, 401) : jsonRes([]))],
    ]);
    await Promise.all([a.getWorkspaces(), a.getWorkspaces()]);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
  });

  it('token-versioned: a straggler whose 401 lands after the token rotated retries WITHOUT a new refresh', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    let release401!: (r: Response) => void;
    const gate401 = new Promise<Response>(res => { release401 = res; });
    let tierCalls = 0;
    let wsCalls = 0;
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: 'tok-B' })],
      ['/api/tier', () => (++tierCalls === 1 ? gate401 : jsonRes({ tier: 'TEAMS', capabilities: {}, usage: {} }))],
      ['/api/workspaces', () => (++wsCalls === 1
        ? jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)
        : jsonRes([]))],
    ]);
    const tierP = a.getTier();                       // in flight with tok-A, response held
    await a.getWorkspaces();                         // 401 → refresh → tok-B
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
    release401(jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)); // straggler lands post-rotation
    await tierP;
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1); // no second refresh
    const tier = callsTo(fetchSpy, '/api/tier');
    expect((tier[1][1]!.headers as Record<string, string>).Authorization).toBe('Bearer tok-B');
  });

  it('refresh failure is LOUD: the original call rejects with the refresh cause, no token-less retry', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => { throw new TypeError('ECONNREFUSED'); }],
      ['/api/workspaces', () => jsonRes({ error: 'Unauthorized' }, 401)],
    ]);
    await expect(a.getWorkspaces()).rejects.toThrow(/Network error/);
    expect(callsTo(fetchSpy, '/api/workspaces')).toHaveLength(1); // no blind retry
  });

  it('loop guard: a 401 from the token endpoint itself cannot recurse', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ error: 'Forbidden: external origin' }, 403)],
      ['/api/workspaces', () => jsonRes({ error: 'Unauthorized' }, 401)],
    ]);
    await expect(a.getWorkspaces()).rejects.toThrow(AdapterHttpError);
    expect(callsTo(fetchSpy, TOKEN_PATH)).toHaveLength(1);
  });

  // ── Multipart through the shared core ────────────────────────────────────

  it('uploadFile: FormData body gets the bearer but NOT the JSON content-type default', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    routeMock(fetchSpy, [['/files/upload', () => jsonRes({ name: 'f.txt' })]]);
    await a.uploadFile('ws1', '/', new File(['x'], 'f.txt'));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer tok-A');
    expect(Object.keys(headers).find(h => h.toLowerCase() === 'content-type')).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('uploadFile: 401 → refresh → retried multipart succeeds; 413 surfaces the server reason', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    let calls = 0;
    routeMock(fetchSpy, [
      [TOKEN_PATH, () => jsonRes({ token: 'tok-B' })],
      ['/files/upload', () => (++calls === 1
        ? jsonRes({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401)
        : jsonRes({ name: 'f.txt' }))],
    ]);
    await expect(a.uploadFile('ws1', '/', new File(['x'], 'f.txt'))).resolves.toMatchObject({ name: 'f.txt' });
    const ups = callsTo(fetchSpy, '/files/upload');
    expect(ups).toHaveLength(2);
    expect((ups[1][1].headers as Record<string, string>).Authorization).toBe('Bearer tok-B');

    routeMock(fetchSpy, [['/api/ingest', () => jsonRes({ error: 'backup too large', message: 'File exceeds 50MB' }, 413)]]);
    const err = await a.ingestFile(new File(['x'], 'big.bin')).catch((e: unknown) => e) as AdapterHttpError;
    expect(err).toBeInstanceOf(AdapterHttpError);
    expect(err.status).toBe(413);
    expect(err.message).toBe('File exceeds 50MB');
  });

  // ── 404→null contracts + envelope stragglers (review fixes) ──────────────

  it.each([
    ['getMemory', (a: InstanceType<typeof LocalAdapter>) => a.getMemory('m1'), '/api/memory/m1'],
    ['getArtifact', (a: InstanceType<typeof LocalAdapter>) => a.getArtifact('a1'), '/api/artifacts/a1'],
    ['getAgent', (a: InstanceType<typeof LocalAdapter>) => a.getAgent('ag1'), '/api/agents/ag1'],
  ])('%s preserves the documented 404→null contract and throws on other failures', async (_n, call, path) => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [[path, () => jsonRes({ error: 'not found' }, 404)]]);
    await expect(call(a)).resolves.toBeNull();
    routeMock(fetchSpy, [[path, () => jsonRes({ error: 'boom' }, 500)]]);
    await expect(call(a)).rejects.toThrow(AdapterHttpError);
  });

  it('manageHooks maps a non-2xx body into the { ok:false, stderr, code } envelope (not a throw)', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/tools/hooks', () => jsonRes({ ok: false, action: 'install', stdout: '', stderr: 'permission denied', code: 1, error: 'install failed' }, 500)]]);
    await expect(a.manageHooks({ id: 'claude-code', action: 'install' })).resolves.toMatchObject({
      ok: false, stderr: 'permission denied', code: 1, error: 'install failed',
    });
  });

  it('manageHooks preserves a structured hook failure without replacing it with HTTP status text', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [['/api/tools/hooks', () => jsonRes({
      ok: false,
      action: 'verify',
      packageName: '@waggle/hive-mind-hooks-claude-code',
      stdout: '',
      stderr: '',
      code: 1,
    }, 400)]]);

    await expect(a.manageHooks({ id: 'claude-code', action: 'verify' })).resolves.toMatchObject({
      ok: false,
      action: 'verify',
      stdout: '',
      stderr: '',
      code: 1,
      error: undefined,
    });
  });

  // ── Watchdog recovery + setServerUrl memo hygiene (review fixes) ─────────

  it('after a hung-body timeout, the NEXT connect probes fresh (memo does not wedge re-arms)', async () => {
    vi.useFakeTimers();
    const a = new LocalAdapter(BASE);
    const hanging = {
      ok: true, status: 200, statusText: 'OK',
      json: () => new Promise(() => { /* never */ }),
      clone() { return this; },
    } as unknown as Response;
    fetchSpy.mockResolvedValue(hanging);
    const p1 = a.connect();
    const assertion1 = expect(p1).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(16000);
    await assertion1;
    vi.useRealTimers();
    // Sidecar healthy now — a fresh connect must succeed, not dedup onto the hung probe.
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token: 'tok-A' })],
    ]);
    await expect(a.connect()).resolves.toMatchObject({ status: 'ok' });
  });

  it('setServerUrl clears the probe memo — a follow-up connect probes the NEW url', async () => {
    const a = new LocalAdapter(BASE);
    let releaseOld!: (r: Response) => void;
    const oldGate = new Promise<Response>(res => { releaseOld = res; });
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.startsWith(BASE)) return oldGate; // old-server probe hangs
      if (u.includes('/health')) return jsonRes(HEALTH);
      if (u.includes(TOKEN_PATH)) return jsonRes({ token: 'tok-NEW' });
      throw new Error(`unmocked: ${u}`);
    });
    const p1 = a.connect();
    a.setServerUrl('http://new-server:5555');
    const p2 = a.connect();
    await expect(p2).resolves.toMatchObject({ status: 'ok' });
    expect(fetchSpy.mock.calls.some(([u]) => String(u).startsWith('http://new-server:5555/health'))).toBe(true);
    releaseOld(jsonRes(HEALTH));
    await p1.catch(() => { /* stale attempt — outcome irrelevant */ });
  });

  it('forceReconnect bypasses the settled-success memo and re-probes', async () => {
    const a = await connectedAdapter('tok-A');
    fetchSpy.mockClear();
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token: 'tok-B' })],
    ]);
    await a.forceReconnect();
    expect(callsTo(fetchSpy, '/health')).toHaveLength(1); // a plain connect() would have made zero calls
  });
});
