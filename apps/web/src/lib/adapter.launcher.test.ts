/**
 * AI-OS #4 — adapter launcher tests: observe flows into the launch body, and
 * streamToolOutput is a safe no-op without EventSource (jsdom).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import LocalAdapter from './adapter';

const BASE = 'http://test-server:4242';
const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const HEALTH = { status: 'ok', mode: 'local' };
const TOKEN_PATH = '/api/auth/session-token';

function routeMock(
  spy: ReturnType<typeof vi.spyOn>,
  routes: Array<[string, () => Response]>,
) {
  spy.mockImplementation(async (url: unknown) => {
    const u = String(url);
    for (const [needle, handler] of routes) {
      if (u.includes(needle)) return handler();
    }
    throw new Error(`unmocked fetch: ${u}`);
  });
}

describe('adapter launcher #4', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    localStorage.clear();
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('forwards observe:true in the POST body', async () => {
    const a = new LocalAdapter(BASE);
    routeMock(fetchSpy, [
      ['/health', () => jsonRes(HEALTH)],
      [TOKEN_PATH, () => jsonRes({ token: 'tok' })],
      ['/api/tools/launch', () => jsonRes({ ok: true, pid: 5 }, 202)],
    ]);
    await a.connect();

    const res = await a.launchTool({ id: 'claude-code', installedPath: '/x', observe: true });
    expect(res.ok).toBe(true);

    const launchCall = fetchSpy.mock.calls.find((c) =>
      String(c[0]).includes('/api/tools/launch'),
    ) as unknown as [string, RequestInit] | undefined;
    const body = JSON.parse(String(launchCall?.[1]?.body));
    expect(body.observe).toBe(true);
  });

  it('streamToolOutput returns a no-op unsubscribe without EventSource (jsdom)', () => {
    const a = new LocalAdapter(BASE);
    const off = a.streamToolOutput(5, { onLine: () => {}, onExit: () => {} });
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });
});
