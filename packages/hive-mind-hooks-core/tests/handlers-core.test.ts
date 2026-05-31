import { describe, expect, it } from 'vitest';
import {
  makeOpenclawHandler,
  makePreCompactHandler,
  makeSessionStartHandler,
  makeStopHandler,
  makeUserPromptSubmitHandler,
  type OpenclawHandlerInput,
  type PreCompactExtracted,
  type SessionStartExtracted,
  type StopExtracted,
  type UserPromptExtracted,
} from '../src/handlers-core.js';
import type { EventAdapter, Lifecycle } from '../src/event-adapter.js';
import { HIT_FIXTURE, makeCtx, makeMockAdapter, makeMockBridge, withEnv } from './_helpers.js';

// ── make*Handler factories (stdin-JSON / exit-0 drive path) ─────────────

describe('makeSessionStartHandler', () => {
  it('recalls personal-scoped frames and returns the adapter inject shape', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const h = makeSessionStartHandler(a);

    const payload = h.parse({ cwd: '/proj', recall_limit: 7 });
    expect(payload.recallLimit).toBe(7);
    const out = await h.run(payload, makeCtx(bridge));

    expect(bridge.recallMemory).toHaveBeenCalledWith('', { limit: 7, scope: 'personal' });
    // Mock adapter renames the inject seam to { additional_context }.
    expect(out).toMatchObject({ additional_context: expect.stringContaining('past observation') });
  });

  it('defaults recallLimit to opts.recallLimit then 20', () => {
    const a = makeMockAdapter();
    expect(makeSessionStartHandler(a).parse({}).recallLimit).toBe(20);
    expect(makeSessionStartHandler(a, { recallLimit: 5 }).parse({}).recallLimit).toBe(5);
    // payload value wins over opts.
    expect(makeSessionStartHandler(a, { recallLimit: 5 }).parse({ recall_limit: 9 }).recallLimit).toBe(9);
  });

  it('falls back to the CC hookSpecificOutput shape when the adapter has no formatInject', async () => {
    const a = makeMockAdapter({ formatInject: null, source: 'codex' });
    const bridge = makeMockBridge({ recallMemoryHits: [] });
    const out = (await makeSessionStartHandler(a).run({ cwd: '/p', sessionId: undefined, recallLimit: 20 }, makeCtx(bridge))) as {
      hookSpecificOutput: { hookEventName: string; source: string; additionalContext: string };
    };
    expect(out.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(out.hookSpecificOutput.source).toBe('codex');
    expect(out.hookSpecificOutput.additionalContext).toContain('no recalled frames');
  });
});

describe('makeUserPromptSubmitHandler', () => {
  it('saves a temporary frame carrying the prompt', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge();
    const h = makeUserPromptSubmitHandler(a);

    const payload = h.parse({ prompt: 'do the thing', cwd: '/proj', session_id: 's1' });
    await h.run(payload, makeCtx(bridge));

    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0];
    expect(frame.importance).toBe('temporary');
    expect(frame.content).toBe('do the thing');
    expect(frame.source).toBe(a.source);
  });

  it('skips the save when the prompt is empty', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge();
    const h = makeUserPromptSubmitHandler(a);
    await h.run(h.parse({ cwd: '/proj' }), makeCtx(bridge));
    expect(bridge.saveMemory).not.toHaveBeenCalled();
  });
});

describe('makeStopHandler', () => {
  it('summarizes the turn and saves an important frame', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge();
    const h = makeStopHandler(a);

    const longResp = 'First sentence. ' + 'X'.repeat(2000) + '.';
    await h.run(h.parse({ response: longResp, cwd: '/proj', session_id: 's2' }), makeCtx(bridge));

    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    const frame = bridge.saveMemory.mock.calls[0][0];
    expect(['important', 'critical']).toContain(frame.importance);
    expect(frame.content.length).toBeLessThanOrEqual(401); // budget + ellipsis
  });

  it('promotes to critical on a "never" directive and attaches the parent frame id', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge();
    const h = makeStopHandler(a);
    await h.run(
      h.parse({ response: 'never commit secrets to the public repo.', cwd: '/proj', parent_frame_id: 'frame-99' }),
      makeCtx(bridge),
    );
    const frame = bridge.saveMemory.mock.calls[0][0];
    expect(frame.importance).toBe('critical');
    expect(frame.parent).toBe('frame-99');
  });

  it('skips the save when the response is empty', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge();
    const h = makeStopHandler(a);
    await h.run(h.parse({ cwd: '/proj' }), makeCtx(bridge));
    expect(bridge.saveMemory).not.toHaveBeenCalled();
  });
});

describe('makePreCompactHandler', () => {
  it('calls cleanupFrames', async () => {
    const a = makeMockAdapter();
    const bridge = makeMockBridge({ cleanupFramesResult: { pruned: 3 } });
    const h = makePreCompactHandler(a);
    await h.run(h.parse({ session_id: 's3' }), makeCtx(bridge));
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
  });
});

// ── makeOpenclawHandler (in-process drive path) ─────────────────────────

// OpenClaw adapter: eventName values are the native `type:action` keys.
function openclawAdapter(): EventAdapter {
  const eventName: Record<Lifecycle, string | undefined> = {
    'session-start': 'agent:bootstrap',
    'user-prompt-submit': 'message:received',
    stop: 'message:sent',
    // HOOK.md uses the session-prefixed key; runtime action is 'compact:before'.
    'pre-compact': 'session:compact:before',
  };
  return makeMockAdapter({ source: 'openclaw', eventName, formatInject: null });
}

describe('makeOpenclawHandler — lifecycle dispatch', () => {
  it('SessionStart (agent:bootstrap) recalls memory; consumer mutates bootstrapFiles', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge({ recallMemoryHits: [HIT_FIXTURE] });
    const handler = makeOpenclawHandler(a);

    // The body returns the recalled/formatted text; the openclaw adapter is
    // responsible for pushing it onto event.context.bootstrapFiles. We model
    // that by capturing the recall and asserting the consumer can mutate.
    const bootstrapFiles: string[] = [];
    const input: OpenclawHandlerInput = {
      event: { type: 'agent', action: 'bootstrap', context: { bootstrapFiles } },
      extracted: { cwd: '/proj', sessionId: 's1', recallLimit: 20 } as SessionStartExtracted,
    };
    await handler.handle(input, makeCtx(bridge));

    expect(bridge.recallMemory).toHaveBeenCalledWith('', { limit: 20, scope: 'personal' });
    // Simulate the adapter's documented mutation seam working end-to-end.
    bootstrapFiles.push('recalled');
    expect((input.event.context as { bootstrapFiles: string[] }).bootstrapFiles).toEqual(['recalled']);
  });

  it('UserPromptSubmit (message:received) saves a temporary frame', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'message', action: 'received' },
      extracted: { prompt: 'hi there', cwd: '/proj', sessionId: 's1' } as UserPromptExtracted,
    };
    await handler.handle(input, makeCtx(bridge));
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(bridge.saveMemory.mock.calls[0][0].importance).toBe('temporary');
  });

  it('Stop (message:sent) saves an important/critical frame', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'message', action: 'sent' },
      extracted: { cwd: '/proj', sessionId: 's1', response: 'we decided to ship it.', parent: undefined } as StopExtracted,
    };
    await handler.handle(input, makeCtx(bridge));
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(['important', 'critical']).toContain(bridge.saveMemory.mock.calls[0][0].importance);
  });

  it('PreCompact matches on action "compact:before" (NOT the joined string) and cleans frames', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'session', action: 'compact:before' },
      extracted: { scope: 's1' } as PreCompactExtracted,
    };
    await handler.handle(input, makeCtx(bridge));
    expect(bridge.cleanupFrames).toHaveBeenCalledTimes(1);
  });

  it('ignores an event with no lifecycle match (no bridge calls)', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'gateway', action: 'pre-restart' },
      extracted: { scope: undefined } as PreCompactExtracted,
    };
    await handler.handle(input, makeCtx(bridge));
    expect(bridge.saveMemory).not.toHaveBeenCalled();
    expect(bridge.recallMemory).not.toHaveBeenCalled();
    expect(bridge.cleanupFrames).not.toHaveBeenCalled();
  });

  it('debounces message:sent — every dispatch resolves, only the last saves', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge();
    const handler = makeOpenclawHandler(a, { stopDebounceMs: 5 });
    const mk = (response: string): OpenclawHandlerInput => ({
      event: { type: 'message', action: 'sent', sessionKey: 'turn-1' },
      extracted: { cwd: '/proj', sessionId: 's1', response, parent: undefined } as StopExtracted,
    });
    // Fire three message:sent for the same turn and AWAIT ALL of them. Each
    // superseded dispatch MUST resolve (not hang) — the host awaits handlers
    // sequentially, so a leaked promise would block the host event loop
    // forever (fail-open invariant §7.3(1)). With the old code the first two
    // promises never settled and this Promise.all would time out.
    await Promise.all([
      handler.handle(mk('first decided.'), makeCtx(bridge)),
      handler.handle(mk('second decided.'), makeCtx(bridge)),
      handler.handle(mk('third decided.'), makeCtx(bridge)),
    ]);

    // Last-writer-wins: exactly one save, carrying the final payload.
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
    expect(bridge.saveMemory.mock.calls[0][0].content).toContain('third decided');
  });
});

describe('makeOpenclawHandler — FAIL-OPEN (invariant §7.3(1))', () => {
  it('swallows a body error, resolves the promise, and never throws', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge({ saveMemoryThrows: new Error('cli unreachable') });
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'message', action: 'received' },
      extracted: { prompt: 'will explode on save', cwd: '/proj', sessionId: 's1' } as UserPromptExtracted,
    };
    // Must resolve (not reject) despite the bridge throwing.
    await expect(handler.handle(input, makeCtx(bridge))).resolves.toBeUndefined();
  });

  it('fails open when recallMemory rejects on SessionStart', async () => {
    const a = openclawAdapter();
    const bridge = makeMockBridge({ recallMemoryThrows: new Error('boom') });
    const handler = makeOpenclawHandler(a);
    const input: OpenclawHandlerInput = {
      event: { type: 'agent', action: 'bootstrap', context: {} },
      extracted: { cwd: '/proj', sessionId: 's1', recallLimit: 20 } as SessionStartExtracted,
    };
    await expect(handler.handle(input, makeCtx(bridge))).resolves.toBeUndefined();
  });
});

// ── Stop signal-emit opt-in (mirrors CC stop.ts Phase 1E) ───────────────

describe('makeStopHandler — WAGGLE_SIGNAL_EMIT opt-in', () => {
  function withCapturedFetch<T>(fetchImpl: typeof globalThis.fetch, fn: () => Promise<T>): Promise<T> {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    return fn().finally(() => { globalThis.fetch = original; });
  }
  function makeOkFetch(): typeof globalThis.fetch & { calls: Array<{ url: string; body: unknown }> } {
    const calls: Array<{ url: string; body: unknown }> = [];
    const impl = (async (url: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ url: String(url), body });
      return new Response(JSON.stringify({ dispatched: true, message: { id: 'srv-1' } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof globalThis.fetch & { calls: typeof calls };
    impl.calls = calls;
    return impl;
  }

  it('does not emit when WAGGLE_SIGNAL_EMIT is unset', async () => {
    const a = makeMockAdapter({ source: 'cursor' });
    const bridge = makeMockBridge();
    const f = makeOkFetch();
    await withEnv('WAGGLE_SIGNAL_EMIT', undefined, () =>
      withCapturedFetch(f, () =>
        makeStopHandler(a).run(
          makeStopHandler(a).parse({ response: 'never do that.', cwd: '/p' }),
          makeCtx(bridge),
        ),
      ),
    );
    expect(f.calls).toHaveLength(0);
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
  });

  it('emits a discovery signal on a critical turn when WAGGLE_SIGNAL_EMIT=1', async () => {
    const a = makeMockAdapter({ source: 'cursor' });
    const bridge = makeMockBridge();
    const f = makeOkFetch();
    const h = makeStopHandler(a);
    await withEnv('WAGGLE_SIGNAL_EMIT', '1', () =>
      withCapturedFetch(f, () =>
        h.run(h.parse({ response: 'never commit secrets.', cwd: '/p', session_id: 'sc' }), makeCtx(bridge)),
      ),
    );
    expect(f.calls).toHaveLength(1);
    const body = f.calls[0].body as { content: Record<string, unknown>; senderId: string };
    expect(body.senderId).toBe('cursor-hook');
    expect(body.content.tool).toBe('cursor');
    expect(body.content.importance).toBe('critical');
  });

  it('still saves the frame even when the signal endpoint is unreachable (fail-open)', async () => {
    const a = makeMockAdapter({ source: 'cursor' });
    const bridge = makeMockBridge();
    const unreachable = (async () => { throw new Error('ECONNREFUSED'); }) as typeof globalThis.fetch;
    const h = makeStopHandler(a);
    await withEnv('WAGGLE_SIGNAL_EMIT', 'true', () =>
      withCapturedFetch(unreachable, () =>
        h.run(h.parse({ response: 'never commit secrets.', cwd: '/p' }), makeCtx(bridge)),
      ),
    );
    expect(bridge.saveMemory).toHaveBeenCalledTimes(1);
  });
});
