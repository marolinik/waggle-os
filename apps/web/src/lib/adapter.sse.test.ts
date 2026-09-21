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

  it('FAN-OUT: concurrent same-path subscribers share ONE stream; both receive events; last-out closes', async () => {
    // Review fix: the old replace-on-resubscribe dedup let a second mount
    // (WaggleDance screen) permanently kill the first's stream (AppShell's
    // always-mounted badge).
    const a = await connectedAdapter('tok-A');
    const got1: unknown[] = [];
    const got2: unknown[] = [];
    const unsub1 = a.subscribeNotifications((n) => got1.push(n));
    const unsub2 = a.subscribeNotifications((n) => got2.push(n));
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1); // shared socket

    const es = FakeEventSource.instances[0];
    es.onmessage?.({ data: JSON.stringify({ id: '1', title: 'hi' }) } as MessageEvent);
    expect(got1).toHaveLength(1);
    expect(got2).toHaveLength(1);

    unsub1();
    expect(es.closed).toBe(false); // second subscriber keeps it alive
    es.onmessage?.({ data: JSON.stringify({ id: '2', title: 'again' }) } as MessageEvent);
    expect(got1).toHaveLength(1); // unsubscribed callback no longer fires
    expect(got2).toHaveLength(2);

    unsub2();
    expect(es.closed).toBe(true); // last-out closes

    // A fresh subscribe after full teardown opens a NEW stream.
    a.subscribeNotifications(() => {});
    await flush();
    expect(FakeEventSource.instances).toHaveLength(2);
  });

  it('NAMED EVENTS: subscribeEvents/<audit> and subscribeWaggleDance/<signal> receive named payloads, not onmessage', async () => {
    // Review fix: the server emits `event: audit` / `event: signal` — an
    // onmessage-only listener made both channels payload-dead even with
    // working auth.
    const a = await connectedAdapter('tok-A');
    const audits: unknown[] = [];
    const signals: unknown[] = [];
    a.subscribeEvents((e) => audits.push(e));
    a.subscribeWaggleDance((s) => signals.push(s));
    await flush();
    const [eventsEs, waggleEs] = FakeEventSource.instances;

    eventsEs.fireNamed('audit', { type: 'tool_call' });
    waggleEs.fireNamed('signal', { id: 's1' });
    expect(audits).toEqual([{ type: 'tool_call' }]);
    expect(signals).toEqual([{ id: 's1' }]);

    // The named `event: connected` waggle handshake is ignored by spec.
    waggleEs.fireNamed('connected', { type: 'connected' });
    expect(signals).toHaveLength(1);
  });

  it('HANDSHAKE FILTER: the unnamed {"type":"connected"} on the notifications stream never reaches the consumer', async () => {
    const a = await connectedAdapter('tok-A');
    const got: unknown[] = [];
    a.subscribeNotifications((n) => got.push(n));
    await flush();
    const es = FakeEventSource.instances[0];
    es.onmessage?.({ data: JSON.stringify({ type: 'connected' }) } as MessageEvent);
    expect(got).toHaveLength(0); // junk handshake filtered
    es.onmessage?.({ data: JSON.stringify({ id: 'n1', title: 'real' }) } as MessageEvent);
    expect(got).toHaveLength(1);
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

  it('shares one notification socket across default and subagent events without clobbering either', async () => {
    const a = await connectedAdapter('tok-A');
    const notifications: unknown[] = [];
    const subagents: unknown[] = [];
    const unsubscribeNotifications = a.subscribeNotifications((event) => notifications.push(event));
    const unsubscribeSubagents = a.subscribeSubagentStatus((event) => subagents.push(event));
    await flush();
    expect(FakeEventSource.instances).toHaveLength(1);
    const stream = FakeEventSource.instances[0];
    const firstSubagentEvent = { type: 'subagent_status', workspaceId: 'w1', agents: [] };
    stream.onmessage?.({ data: JSON.stringify({ id: 'n1', title: 'notice' }) } as MessageEvent);
    stream.fireNamed('subagent_status', firstSubagentEvent);
    expect(notifications).toEqual([{
      id: 'n1', type: 'agent', title: 'notice', body: '', read: false, timestamp: '', actionUrl: undefined,
    }]);
    expect(subagents).toEqual([firstSubagentEvent]);

    unsubscribeNotifications();
    expect(stream.closed).toBe(false);
    const secondSubagentEvent = { type: 'subagent_status', workspaceId: 'w2', agents: [] };
    stream.onmessage?.({ data: JSON.stringify({ id: 'n2', title: 'ignored' }) } as MessageEvent);
    stream.fireNamed('subagent_status', secondSubagentEvent);
    expect(notifications).toHaveLength(1);
    expect(subagents).toEqual([firstSubagentEvent, secondSubagentEvent]);
    unsubscribeSubagents();
    expect(stream.closed).toBe(true);
  });

  it('tool output stream closes permanently after exit instead of reconnecting and replaying old output', async () => {
    vi.useFakeTimers();
    const a = await connectedAdapter('tok-A');
    const lines: string[] = [];
    let exitCode: number | null | undefined;

    a.streamToolOutput(4242, {
      onLine: (line) => lines.push(line),
      onExit: (code) => { exitCode = code; },
    });
    await vi.advanceTimersByTimeAsync(0);

    const first = FakeEventSource.instances[0];
    first.fireNamed('line', { line: 'mock observed output' });
    first.fireNamed('exit', { code: 0 });
    expect(lines).toEqual(['mock observed output']);
    expect(exitCode).toBe(0);
    expect(first.closed).toBe(true);

    first.fireError();
    await vi.advanceTimersByTimeAsync(1100);
    expect(FakeEventSource.instances).toHaveLength(1);
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
