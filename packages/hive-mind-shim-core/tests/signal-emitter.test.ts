/**
 * AI-OS Phase 1D — signal emitter tests.
 *
 * Verifies: URL resolution order, request shape, fail-open semantics
 * on network errors, timeout enforcement, the maybeEmitDiscovery
 * policy helper.
 */

import { describe, it, expect } from 'vitest';
import {
  emitSignalToWaggleDance,
  maybeEmitDiscovery,
  type EmittedSignal,
} from '../src/signal-emitter.js';

/**
 * Build a fake fetch that captures the request and returns a stub
 * 201 response with a synthetic signal echo.
 */
function makeOkFetch(): typeof fetch & { calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const sig: EmittedSignal = {
      id: 'srv-' + Math.random().toString(36).slice(2),
      teamId: 'personal::test',
      senderId: 'test',
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      referenceId: null,
      routing: null,
      createdAt: new Date().toISOString(),
    };
    return new Response(JSON.stringify({ dispatched: true, message: sig }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch & { calls: typeof calls };
  impl.calls = calls;
  return impl;
}

describe('emitSignalToWaggleDance', () => {
  it('POSTs to the default sidecar URL when no override', async () => {
    const f = makeOkFetch();
    await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: { topic: 'x' },
      fetchImpl: f,
    });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toBe('http://127.0.0.1:3333/api/waggle-dance/signal');
  });

  it('honors the url option', async () => {
    const f = makeOkFetch();
    await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: f,
      url: 'http://127.0.0.1:4000',
    });
    expect(f.calls[0].url).toBe('http://127.0.0.1:4000/api/waggle-dance/signal');
  });

  it('reads WAGGLE_SIDECAR_URL env when no url option', async () => {
    const prev = process.env.WAGGLE_SIDECAR_URL;
    process.env.WAGGLE_SIDECAR_URL = 'http://127.0.0.1:9999';
    try {
      const f = makeOkFetch();
      await emitSignalToWaggleDance({
        type: 'broadcast',
        subtype: 'discovery',
        content: {},
        fetchImpl: f,
      });
      expect(f.calls[0].url).toBe('http://127.0.0.1:9999/api/waggle-dance/signal');
    } finally {
      if (prev === undefined) delete process.env.WAGGLE_SIDECAR_URL;
      else process.env.WAGGLE_SIDECAR_URL = prev;
    }
  });

  it('serializes the body with the expected shape', async () => {
    const f = makeOkFetch();
    await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: { tool: 'claude-code', topic: 'rotation' },
      senderId: 'claude-code-hook',
      fetchImpl: f,
    });
    const body = JSON.parse(f.calls[0].init?.body as string);
    expect(body).toMatchObject({
      type: 'broadcast',
      subtype: 'discovery',
      senderId: 'claude-code-hook',
      content: { tool: 'claude-code', topic: 'rotation' },
    });
  });

  it('authenticates with the narrow run token without putting it in the body', async () => {
    const f = makeOkFetch();
    const token = 'run-token-with-at-least-thirty-two-bytes-1234';
    await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: { topic: 'safe' },
      runToken: token,
      fetchImpl: f,
    });
    expect((f.calls[0].init?.headers as Record<string, string>)['x-waggle-run-token']).toBe(token);
    expect(f.calls[0].init?.body).not.toContain(token);
  });

  it('reads WAGGLE_RUN_TOKEN for installed hook processes', async () => {
    const previous = process.env.WAGGLE_RUN_TOKEN;
    const token = 'environment-run-token-with-enough-entropy-1234';
    process.env.WAGGLE_RUN_TOKEN = token;
    try {
      const f = makeOkFetch();
      await emitSignalToWaggleDance({
        type: 'broadcast', subtype: 'discovery', content: {}, fetchImpl: f,
      });
      expect((f.calls[0].init?.headers as Record<string, string>)['x-waggle-run-token']).toBe(token);
    } finally {
      if (previous === undefined) delete process.env.WAGGLE_RUN_TOKEN;
      else process.env.WAGGLE_RUN_TOKEN = previous;
    }
  });

  it('defaults senderId to "hook" when not provided', async () => {
    const f = makeOkFetch();
    await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: f,
    });
    const body = JSON.parse(f.calls[0].init?.body as string);
    expect(body.senderId).toBe('hook');
  });

  it('only includes optional fields when set', async () => {
    const f = makeOkFetch();
    await emitSignalToWaggleDance({
      type: 'response',
      subtype: 'knowledge_match',
      content: { matched: 1 },
      senderId: 'cursor',
      referenceId: 'r-1',
      fetchImpl: f,
    });
    const body = JSON.parse(f.calls[0].init?.body as string);
    expect(body.referenceId).toBe('r-1');
    expect(body).not.toHaveProperty('routing');
    expect(body).not.toHaveProperty('teamId');
  });

  it('returns the server message on 201', async () => {
    const f = makeOkFetch();
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: f,
    });
    expect(out).not.toBeNull();
    expect(out!.id).toMatch(/^srv-/);
  });

  it('returns null and warns on network errors (ECONNREFUSED simulation)', async () => {
    const warnCalls: string[] = [];
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3333');
      }) as typeof fetch,
      onWarn: (m) => warnCalls.push(m),
    });
    expect(out).toBeNull();
    expect(warnCalls).toHaveLength(1);
    expect(warnCalls[0]).toContain('ECONNREFUSED');
  });

  it('returns null and warns on non-2xx response', async () => {
    const warnCalls: string[] = [];
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: (async () => new Response('bad request', { status: 400 })) as typeof fetch,
      onWarn: (m) => warnCalls.push(m),
    });
    expect(out).toBeNull();
    expect(warnCalls[0]).toContain('400');
  });

  it('returns null and warns on malformed response body', async () => {
    const warnCalls: string[] = [];
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      fetchImpl: (async () =>
        new Response('{"no-message-field": true}', {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })) as typeof fetch,
      onWarn: (m) => warnCalls.push(m),
    });
    expect(out).toBeNull();
    expect(warnCalls[0]).toContain('malformed');
  });

  it('enforces a per-request timeout', async () => {
    const warnCalls: string[] = [];
    const out = await emitSignalToWaggleDance({
      type: 'broadcast',
      subtype: 'discovery',
      content: {},
      timeoutMs: 50,
      fetchImpl: ((_url: string, init?: RequestInit) => {
        // Return a never-resolving promise; the abort signal should trigger.
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        });
      }) as typeof fetch,
      onWarn: (m) => warnCalls.push(m),
    });
    expect(out).toBeNull();
    expect(warnCalls[0]).toContain('sidecar unreachable');
  });
});

describe('maybeEmitDiscovery', () => {
  it('emits when Stop + high importance', async () => {
    const f = makeOkFetch();
    const out = await maybeEmitDiscovery(
      'stop',
      'high',
      { topic: 'rotation' },
      { fetchImpl: f, senderId: 'cc' },
    );
    expect(out).not.toBeNull();
    expect(f.calls).toHaveLength(1);
    const body = JSON.parse(f.calls[0].init?.body as string);
    expect(body.subtype).toBe('discovery');
    expect(body.content.eventType).toBe('stop');
    expect(body.content.importance).toBe('high');
    expect(body.content.topic).toBe('rotation');
  });

  it('emits when PreCompact + critical', async () => {
    const f = makeOkFetch();
    const out = await maybeEmitDiscovery(
      'pre-compact',
      'critical',
      {},
      { fetchImpl: f },
    );
    expect(out).not.toBeNull();
  });

  it('does not emit on low importance', async () => {
    const f = makeOkFetch();
    const out = await maybeEmitDiscovery('stop', 'low', {}, { fetchImpl: f });
    expect(out).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it('does not emit on normal importance', async () => {
    const f = makeOkFetch();
    const out = await maybeEmitDiscovery('stop', 'normal', {}, { fetchImpl: f });
    expect(out).toBeNull();
    expect(f.calls).toHaveLength(0);
  });

  it('does not emit on non-stop/pre-compact events', async () => {
    const f = makeOkFetch();
    const out = await maybeEmitDiscovery(
      'user-prompt-submit',
      'high',
      {},
      { fetchImpl: f },
    );
    expect(out).toBeNull();
    expect(f.calls).toHaveLength(0);
  });
});

// Note: the end-to-end integration test against a real Waggle sidecar
// lives in packages/server/tests/signal-emitter-integration.test.ts —
// that's the correct layer to depend on @waggle/server. This module
// (shim-core) stays a leaf with no inbound deps from the server, which
// is what lets hook packages consume it without dragging the sidecar
// in.
