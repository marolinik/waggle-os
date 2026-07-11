import { describe, expect, it } from 'vitest';
import { runStop, stopHandler } from '../../src/hooks/stop.js';
import { makeHookCaptures, makeMockBridge } from './_test-helpers.js';

describe('stop handler', () => {
  it('extracts response from payload.response or payload.assistant_message', () => {
    expect(stopHandler.parse({ response: 'r' }).response).toBe('r');
    expect(stopHandler.parse({ assistant_message: 'a' }).response).toBe('a');
    expect(stopHandler.parse({}).response).toBe('');
  });

  it('summarizes long responses and saves an important frame', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const longResp = 'First sentence. ' + 'X'.repeat(2000) + '.';
    await runStop({
      readStdin: async () => JSON.stringify({
        response: longResp,
        cwd: '/proj',
        session_id: 'sess-2',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(['important', 'critical']).toContain(arg.importance);
    expect(typeof arg.content).toBe('string');
    expect(arg.content.length).toBeLessThanOrEqual(401); // budget + ellipsis
    expect(cap.exits).toEqual([0]);
  });

  it('promotes to critical when response contains a "never" directive', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        response: 'never commit secrets to the public repo.',
        cwd: '/proj',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(arg.importance).toBe('critical');
  });

  it('attaches parent frame id when supplied', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => JSON.stringify({
        response: 'something happened.',
        parent_frame_id: 'frame-99',
      }),
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    const arg = bridge.saveMemory.mock.calls[0][0];
    expect(arg.parent).toBe('frame-99');
  });

  it('skips save when response is empty', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    await runStop({
      readStdin: async () => '{}',
      writeStdout: cap.writeStdout,
      exit: cap.exit,
      bridge,
    });
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(cap.exits).toEqual([0]);
  });
});

// ── AI-OS Phase 1E — opt-in v2 signal emission ─────────────────────

describe('stop handler — WAGGLE_SIGNAL_EMIT (Phase 1E)', () => {
  // Capture the global fetch so we can assert on the emitter call.
  // maybeEmitDiscovery uses globalThis.fetch when no fetchImpl is
  // passed — the production hook does not pass one.
  function withCapturedFetch<T>(
    fetchImpl: typeof globalThis.fetch,
    fn: () => Promise<T>,
  ): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    return fn().finally(() => {
      globalThis.fetch = original;
    });
  }

  function makeOkFetch(): typeof globalThis.fetch & {
    calls: Array<{ url: string; body: unknown }>;
  } {
    const calls: Array<{ url: string; body: unknown }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), body });
      return new Response(
        JSON.stringify({
          dispatched: true,
          message: {
            id: 'srv-1',
            teamId: 'personal::claude-code-hook',
            senderId: 'claude-code-hook',
            type: 'broadcast',
            subtype: 'discovery',
            content: body?.content ?? {},
            referenceId: null,
            routing: null,
            createdAt: new Date().toISOString(),
          },
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof globalThis.fetch & { calls: typeof calls };
    impl.calls = calls;
    return impl;
  }

  function withEnv<T>(
    key: string,
    value: string | undefined,
    fn: () => Promise<T>,
  ): Promise<T> {
    const prev = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    return fn().finally(() => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    });
  }

  it('does not emit when WAGGLE_SIGNAL_EMIT is unset', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const f = makeOkFetch();
    await withEnv('WAGGLE_SIGNAL_EMIT', undefined, () =>
      withCapturedFetch(f, () =>
        runStop({
          readStdin: async () => JSON.stringify({
            response: 'never commit secrets to the public repo.',
            cwd: '/proj',
          }),
          writeStdout: cap.writeStdout,
          exit: cap.exit,
          bridge,
        }),
      ),
    );
    expect(f.calls).toHaveLength(0);
  });

  it('does not emit when WAGGLE_SIGNAL_EMIT=0', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const f = makeOkFetch();
    await withEnv('WAGGLE_SIGNAL_EMIT', '0', () =>
      withCapturedFetch(f, () =>
        runStop({
          readStdin: async () => JSON.stringify({
            response: 'never commit secrets to the public repo.',
            cwd: '/proj',
          }),
          writeStdout: cap.writeStdout,
          exit: cap.exit,
          bridge,
        }),
      ),
    );
    expect(f.calls).toHaveLength(0);
  });

  it('emits on critical importance when WAGGLE_SIGNAL_EMIT=1', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const f = makeOkFetch();
    await withEnv('WAGGLE_SIGNAL_EMIT', '1', () =>
      withCapturedFetch(f, () =>
        runStop({
          readStdin: async () => JSON.stringify({
            response: 'never commit secrets to the public repo.',
            cwd: '/proj',
            session_id: 'sess-cc',
          }),
          writeStdout: cap.writeStdout,
          exit: cap.exit,
          bridge,
        }),
      ),
    );
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0].url).toContain('/api/waggle-dance/signal');
    const body = f.calls[0].body as Record<string, unknown>;
    expect(body.type).toBe('broadcast');
    expect(body.subtype).toBe('discovery');
    expect(body.senderId).toBe('claude-code-hook');
    const content = body.content as Record<string, unknown>;
    expect(content.tool).toBe('claude-code');
    expect(content.eventType).toBe('stop');
    // Critical "never" sentence → critical importance → high-or-critical
    // emission per the Importance→emit mapping (critical → critical).
    expect(content.importance).toBe('critical');
    expect(content.sessionId).toBe('sess-cc');
    expect(content.frameId).toBe('frame-1');
    expect(content.memoryWorkspace).toBe('personal');
    expect(content.summary).toContain('never commit secrets');
  });

  it('does not emit on a normal-importance turn (emission policy floor)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const f = makeOkFetch();
    // A short benign response → classifyImportance returns 'normal',
    // which our mapping bumps to 'normal' (not high/critical) → the
    // maybeEmitDiscovery policy skips emission.
    await withEnv('WAGGLE_SIGNAL_EMIT', '1', () =>
      withCapturedFetch(f, () =>
        runStop({
          readStdin: async () => JSON.stringify({
            response: 'Hello.',
            cwd: '/proj',
          }),
          writeStdout: cap.writeStdout,
          exit: cap.exit,
          bridge,
        }),
      ),
    );
    expect(f.calls).toHaveLength(0);
  });

  it('saves frame even when the signal endpoint is unreachable (fail-open)', async () => {
    const bridge = makeMockBridge();
    const cap = makeHookCaptures();
    const unreachable = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof globalThis.fetch;
    await withEnv('WAGGLE_SIGNAL_EMIT', 'true', () =>
      withCapturedFetch(unreachable, () =>
        runStop({
          readStdin: async () => JSON.stringify({
            response: 'never commit secrets to the public repo.',
            cwd: '/proj',
          }),
          writeStdout: cap.writeStdout,
          exit: cap.exit,
          bridge,
        }),
      ),
    );
    // Frame save still happened — emitter failure does not block.
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(cap.exits).toEqual([0]);
  });
});
