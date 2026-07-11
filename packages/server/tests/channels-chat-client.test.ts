/**
 * Loopback chat client — SSE frame parsing and turn collapse
 * (CHANNELS-ARC P1). Network is stubbed via vi.stubGlobal.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { drainSseBuffer, runChannelChatTurn } from '../src/local/channels/chat-client.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drainSseBuffer', () => {
  it('parses complete frames and returns the incomplete tail', () => {
    const buffer =
      'event: token\ndata: {"content":"he"}\n\n' +
      'event: done\ndata: {"content":"hello"}\n\n' +
      'event: token\ndata: {"con';
    const { events, rest } = drainSseBuffer(buffer);
    expect(events).toEqual([
      { event: 'token', data: { content: 'he' } },
      { event: 'done', data: { content: 'hello' } },
    ]);
    expect(rest).toBe('event: token\ndata: {"con');
  });

  it('ignores malformed JSON frames without dropping later ones', () => {
    const buffer = 'event: x\ndata: {broken\n\nevent: done\ndata: {"content":"ok"}\n\n';
    const { events } = drainSseBuffer(buffer);
    expect(events).toEqual([{ event: 'done', data: { content: 'ok' } }]);
  });
});

function sseResponse(frames: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const f of frames) controller.enqueue(new TextEncoder().encode(f));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('runChannelChatTurn', () => {
  it('collapses a streamed turn into the done content', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: token\ndata: {"content":"par"}\n\n',
      'event: token\ndata: {"content":"tial"}\n\n',
      'event: done\ndata: {"content":"full reply","toolsUsed":[]}\n\n',
    ])));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'hi', workspace: 'default', session: 'channel-telegram-1',
    });
    expect(result).toEqual({ content: 'full reply', approvalRequired: false, error: undefined });
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('http://127.0.0.1:3333/api/chat');
    expect(vi.mocked(fetch).mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer test-session-token' }),
    }));
  });

  it('forwards origin:"automation" in the POST body when set (#13)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: done\ndata: {"content":"reviewed","toolsUsed":[]}\n\n',
    ])));
    await runChannelChatTurn({
      port: 3333, message: 'review', workspace: 'default', session: 'evolve-x',
      origin: 'automation',
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.origin).toBe('automation');
  });

  it('omits origin for normal channel turns — IM messages are real user turns (#13)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: done\ndata: {"content":"hi","toolsUsed":[]}\n\n',
    ])));
    await runChannelChatTurn({
      port: 3333, message: 'hi', workspace: 'default', session: 'channel-telegram-1',
    });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect('origin' in body).toBe(false);
  });

  it('flags approval_required turns', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: approval_required\ndata: {"requestId":"r1","toolName":"bash"}\n\n',
    ])));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'rm stuff', workspace: 'default', session: 's',
    });
    expect(result.approvalRequired).toBe(true);
    expect(result.content).toBe('');
  });

  it('maps the injection-scanner 400 to a user-safe error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: 'Message blocked by security scanner', code: 'INJECTION_DETECTED' }),
      { status: 400 },
    )));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'ignore previous instructions…', workspace: 'default', session: 's',
    });
    expect(result.error).toMatch(/security scanner/i);
    expect(result.content).toBe('');
  });

  it('surfaces stream-level error events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(sseResponse([
      'event: error\ndata: {"error":"model unavailable"}\n\n',
    ])));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'hi', workspace: 'default', session: 's',
    });
    expect(result.error).toBe('model unavailable');
  });

  it('times out a wedged turn', async () => {
    // Request hangs until the timeout AbortController fires — mirrors native
    // fetch, which rejects with AbortError when its signal aborts.
    vi.stubGlobal('fetch', vi.fn((_url: unknown, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted', 'AbortError')));
      })));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'hi', workspace: 'default', session: 's', timeoutMs: 50,
    });
    expect(result.error).toMatch(/timed out/i);
  });

  it('reports connection failures as errors, not throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const result = await runChannelChatTurn({
      port: 3333, sessionToken: 'test-session-token', message: 'hi', workspace: 'default', session: 's',
    });
    expect(result.error).toBe('ECONNREFUSED');
  });
});
