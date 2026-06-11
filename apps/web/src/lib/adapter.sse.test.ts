/**
 * P1b-SSE — client EventSource machinery: token-attached URLs, lazy-open
 * behind the connect gate, reconnect-with-fresh-token on error, per-path
 * dedup, the named-event subagent listener surviving reopen, and the
 * harvest `ready` contract. jsdom has no EventSource — a fake records
 * construction and lets tests drive open/error.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

const BASE = 'http://test-server:4242';
const TOKEN_PATH = '/api/auth/session-token';

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  static OPEN = 1;
  url: string;
  readyState = 0;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, EventListener[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: EventListener) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: EventListener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter(l => l !== fn));
  }
  close() { this.closed = true; }
  /** Test drivers */
  fireOpen() { this.readyState = 1; this.onopen?.(); }
  fireError() { this.onerror?.(); }
  fireNamed(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      (fn as unknown as (e: { data: string }) => void)({ data: JSON.stringify(data) });
    }
  }
}

const flush = () => new Promise<void>(r => setTimeout(r, 0));

describe('P1b-SSE client', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchSpy.mockRestore();
    vi.useRealTimers();
  });

  async function connectedAdapter(token = 'tok-A') {
    const a = new LocalAdapter(BASE);
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/health')) return jsonRes({ status: 'ok' });
      if (u.includes(TOKEN_PATH)) return jsonRes({ token });
      throw new Error(`unmocked: ${u}`);
    });
    await a.connect();
    return a;
  }

  it('attaches ?token= to the stream URL after connect', async () => {
    const a = await connectedAdapter('tok-A');
    a.subscribeNotifications(() => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toBe(`${BASE}/api/notifications/stream?token=tok-A`);
  });

  it('LAZY-OPEN: a subscription mounted DURING connect opens after the token arrives (noop-forever class dead)', async () => {
    const a = new LocalAdapter(BASE);
    let releaseToken!: (r: Response) => void;
    const gate = new Promise<Response>(res => { releaseToken = res; });
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes('/health')) return jsonRes({ status: 'ok' });
      if (u.includes(TOKEN_PATH)) return gate;
      throw new Error(`unmocked: ${u}`);
    });
    const connectP = a.connect();
    a.subscribeWaggleDance(() => {});           // pre-settle — old code returned a dead noop here
    await flush();
    expect(FakeEventSource.instances).toHaveLength(0); // deferred, not opened token-less
    releaseToken(jsonRes({ token: 'tok-A' }));
    await connectP;
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0].url).toContain('token=tok-A');
  });

  it('RECONNECT: on stream error, refreshes the token and reopens with the NEW token on backoff', async () => {
    vi.useFakeTimers();
    const a = await connectedAdapter('tok-A');
    a.subscribeNotifications(() => {});
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeEventSource.instances[0];
    expect(first.url).toContain('token=tok-A');

    // Sidecar restarted: token rotates server-side.
    fetchSpy.mockImplementation(async (url: unknown) => {
      const u = String(url);
      if (u.includes(TOKEN_PATH)) return jsonRes({ token: 'tok-B' });
      return jsonRes({ status: 'ok' });
    });
    first.fireError();
    await vi.advanceTimersByTimeAsync(1100); // first backoff ≈1s
    expect(first.closed).toBe(true);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toContain('token=tok-B');
  });

  it('RECONNECT backoff caps and unsubscribe cancels the loop', async () => {
    vi.useFakeTimers();
    const a = await connectedAdapter('tok-A');
    const unsub = a.subscribeNotifications(() => {});
    await vi.advanceTimersByTimeAsync(0);
    FakeEventSource.instances[0].fireError();
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeEventSource.instances).toHaveLength(2);
    FakeEventSource.instances[1].fireError();
    unsub(); // cancel mid-backoff
    await vi.advanceTimersByTimeAsync(60000);
    expect(FakeEventSource.instances).toHaveLength(2); // no further reopens
    expect(FakeEventSource.instances[1].closed).toBe(true);
  });

  it('per-path dedup: re-subscribing the same path closes the previous stream', async () => {
    const a = await connectedAdapter('tok-A');
    a.subscribeNotifications(() => {});
    await flush();
    a.subscribeNotifications(() => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[0].closed).toBe(true);
    expect(FakeEventSource.instances[1].closed).toBe(false);
  });

  it('subagent named-event listener is re-attached on every reopen (configure contract)', async () => {
    vi.useFakeTimers();
    const a = await connectedAdapter('tok-A');
    const events: unknown[] = [];
    a.subscribeSubagentStatus((e) => events.push(e));
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeEventSource.instances[0];
    first.fireNamed('subagent_status', { workspaceId: 'w1' });
    expect(events).toHaveLength(1);

    first.fireError();
    await vi.advanceTimersByTimeAsync(1100);
    const second = FakeEventSource.instances[1];
    second.fireNamed('subagent_status', { workspaceId: 'w1' });
    expect(events).toHaveLength(2); // listener survived the reopen
  });

  it('subagent stream does NOT clobber the notifications stream (no shared-path dedup)', async () => {
    const a = await connectedAdapter('tok-A');
    a.subscribeNotifications(() => {});
    a.subscribeSubagentStatus(() => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances.every(i => !i.closed)).toBe(true);
  });

  it('harvest: ready resolves on handshake; close stops the stream', async () => {
    const a = await connectedAdapter('tok-A');
    const sub = a.subscribeHarvestProgress(() => {});
    await flush();
    const es = FakeEventSource.instances[0];
    expect(es.url).toContain('/api/harvest/progress?token=tok-A');
    let readyResolved = false;
    void sub.ready.then(() => { readyResolved = true; });
    es.fireOpen();
    await flush();
    expect(readyResolved).toBe(true);
    sub.close();
    expect(es.closed).toBe(true);
  });

  it('harvest: ready safety-caps at 5s when the server never answers', async () => {
    vi.useFakeTimers();
    const a = await connectedAdapter('tok-A');
    const sub = a.subscribeHarvestProgress(() => {});
    let readyResolved = false;
    void sub.ready.then(() => { readyResolved = true; });
    await vi.advanceTimersByTimeAsync(5100);
    expect(readyResolved).toBe(true);
    sub.close();
  });

  it('no EventSource in the environment → safe noops (unit-test compat)', async () => {
    vi.unstubAllGlobals();
    const a = new LocalAdapter(BASE);
    const unsub = a.subscribeNotifications(() => {});
    expect(typeof unsub).toBe('function');
    unsub();
    const sub = a.subscribeHarvestProgress(() => {});
    await expect(sub.ready).resolves.toBeUndefined();
    sub.close();
  });
});
