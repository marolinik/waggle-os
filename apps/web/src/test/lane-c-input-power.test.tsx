/**
 * Lane C — input-during-warmup + send-path budget + chat route-cache
 * (Path-to-9 Phase B · Pillar 2.2 / 2.5 / 2.6-chat).
 *
 * Contracts as TESTS (spec §Lane C):
 *   1. Composer accepts typing at paint; a send fired before the reply is ready
 *      is QUEUED (one optimistic `queued` turn), then dispatched on ready —
 *      never errors, never drops.
 *   2. Composer never locks on send: a send while the previous streams is
 *      accepted immediately (send enabled, no concurrent stream) and dispatches
 *      when the current reply finishes.
 *   4. Chat thread session cache: (workspace, session) messages seed instantly
 *      on remount then refresh silently; a transient refresh failure keeps the
 *      cached paint (no re-skeleton, no wipe).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MemoryRouter } from 'react-router-dom';
import type { ChatMessage } from '@/lib/types';
import {
  chatThreadCacheKey,
  readChatThreadCache,
  writeChatThreadCache,
  clearChatThreadCache,
} from '@/hooks/chat-thread-cache';

// jsdom lacks ResizeObserver (ChatApp's agent strip observes its own width).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const mocks = vi.hoisted(() => ({
  adapter: {
    getHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    respondApproval: vi.fn().mockResolvedValue(undefined),
    // ChatApp mount side-effects
    getPins: vi.fn().mockResolvedValue([]),
    searchMemory: vi.fn().mockResolvedValue([]),
    getWorkspaceContext: vi.fn().mockResolvedValue(null),
    submitFeedback: vi.fn(),
    ingestFile: vi.fn(),
    addPin: vi.fn(),
    removePin: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

function deferred<T = unknown>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getHistory.mockResolvedValue([]);
  mocks.adapter.getWorkspaceContext.mockResolvedValue(null);
  clearChatThreadCache();
});
afterEach(() => { cleanup(); });

// ── chat-thread-cache (the module, mirrors memory-list-cache) ───────────────

describe('chat-thread-cache module', () => {
  it('keys by (workspace, session) and round-trips a list; clear resets', () => {
    const key = chatThreadCacheKey('ws-1', 'sess-1');
    expect(key).toBe('ws-1|sess-1');
    expect(readChatThreadCache(key)).toBeUndefined();
    const msgs: ChatMessage[] = [{ id: 'a', role: 'user', content: 'hi', timestamp: 'now' }];
    writeChatThreadCache(key, msgs);
    expect(readChatThreadCache(key)).toBe(msgs);
    // Distinct session → distinct slot.
    expect(readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-2'))).toBeUndefined();
    clearChatThreadCache();
    expect(readChatThreadCache(key)).toBeUndefined();
  });
});

// ── useChat send queue (contracts 1 + 2) ────────────────────────────────────

describe('useChat — send queue (never locks, never drops)', () => {
  async function mountChat(sessionId = 'sess-1') {
    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId }));
    // Let the mount-time history fetch settle to [].
    await act(async () => { await Promise.resolve(); });
    return hook;
  }

  it('fails closed without a resolved session and never creates an optimistic turn', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: null }));

    let accepted: boolean | undefined;
    await act(async () => {
      accepted = await result.current.sendMessage('Do not send into a null session');
    });

    expect(accepted).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('signals admission exactly once for an immediate and an in-flight queued send', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        await gate.promise;
        yield { type: 'done', data: { content: 'first reply' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'second reply' } };
      });
    const { result } = await mountChat('sess-admission');
    const firstAccepted = vi.fn();
    const secondAccepted = vi.fn();
    let firstPromise!: Promise<boolean>;

    await act(async () => {
      firstPromise = result.current.sendMessage('first', { onAccepted: firstAccepted });
      await Promise.resolve();
      await result.current.sendMessage('second', { onAccepted: secondAccepted });
    });

    expect(firstAccepted).toHaveBeenCalledOnce();
    expect(secondAccepted).toHaveBeenCalledOnce();
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
    await act(async () => {
      gate.resolve();
      await firstPromise;
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);
    expect(firstAccepted).toHaveBeenCalledOnce();
    expect(secondAccepted).toHaveBeenCalledOnce();
  });

  it('a send fired while the reply streams is QUEUED, then dispatched on ready', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        await gate.promise;              // hold the first reply open
        yield { type: 'done', data: { content: 'A-reply' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'B-reply' } };
      });

    const { result } = await mountChat();

    // Start the first send but DO NOT await its completion (gated open).
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = result.current.sendMessage('first');
      await Promise.resolve();
    });
    // The first reply is in flight (one stream opened, still streaming).
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    // Send a SECOND while the first still streams → queued, NOT a 2nd stream.
    await act(async () => { await result.current.sendMessage('second'); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
    const queued = result.current.messages.find(m => m.content === 'second');
    expect(queued?.queued).toBe(true);       // truthful "waiting" marker on the optimistic turn

    // Release the first reply → its completion flushes the queue → second dispatches.
    await act(async () => {
      gate.resolve();
      await firstPromise;
      await new Promise(r => setTimeout(r, 0));
    });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);
    const secondNow = result.current.messages.find(m => m.content === 'second');
    expect(secondNow?.queued).toBeFalsy();   // promoted, no longer "waiting"
    // Both replies landed, in order, none dropped.
    const texts = result.current.messages.filter(m => m.role === 'assistant').map(m => m.content);
    expect(texts).toContain('A-reply');
    expect(texts).toContain('B-reply');
    const users = result.current.messages.filter(m => m.role === 'user').map(m => m.content);
    expect(users).toEqual(['first', 'second']);
  });

  it('does NOT spawn a concurrent stream — the queued send waits for the in-flight one', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () { await gate.promise; yield { type: 'done', data: { content: 'A' } }; })
      .mockImplementationOnce(async function* () { yield { type: 'done', data: { content: 'B' } }; });

    const { result } = await mountChat('sess-concurrent');
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => { firstPromise = result.current.sendMessage('one'); await Promise.resolve(); });
    // Two more sends while streaming — both queued behind the one in-flight stream.
    await act(async () => { await result.current.sendMessage('two'); });
    await act(async () => { await result.current.sendMessage('three'); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1); // still ONE stream

    await act(async () => {
      gate.resolve();
      await firstPromise;
      await new Promise(r => setTimeout(r, 0));
    });
    // FIFO flush dispatched the two queued sends after the first finished.
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(3);
    const users = result.current.messages.filter(m => m.role === 'user').map(m => m.content);
    expect(users).toEqual(['one', 'two', 'three']);
  });

  it('stamps the authoring persona on the assistant turn', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'Research answer' } };
    });
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-persona',
      persona: 'researcher',
    }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.sendMessage('Investigate this'); });

    const assistant = result.current.messages.find((message) => message.role === 'assistant');
    expect(assistant?.persona).toBe('researcher');
  });

  it('keeps a queued turn bound to its authoring persona and autonomy', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        await gate.promise;
        yield { type: 'done', data: { content: 'first answer' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'queued answer' } };
      });

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({
        activePersona,
        autonomy,
      }: {
        activePersona: string;
        autonomy: { level: 'normal' | 'yolo'; expiresAt: number | null };
      }) => useChat({
        workspaceId: 'ws-1',
        sessionId: 'sess-queued-persona',
        persona: activePersona,
        autonomy,
      }),
      { initialProps: {
        activePersona: 'planner',
        autonomy: { level: 'normal' as const, expiresAt: null },
      } },
    );
    await act(async () => { await Promise.resolve(); });

    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = hook.result.current.sendMessage('first');
      await Promise.resolve();
      await hook.result.current.sendMessage('queued as planner');
    });
    hook.rerender({ activePersona: 'coder', autonomy: { level: 'yolo', expiresAt: null } });

    await act(async () => {
      gate.resolve();
      await firstPromise;
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(mocks.adapter.sendMessage).toHaveBeenNthCalledWith(
      2,
      'ws-1',
      'queued as planner',
      'sess-queued-persona',
      'planner',
      undefined,
      undefined,
    );
    const queuedAssistant = hook.result.current.messages.find(
      message => message.role === 'assistant' && message.content === 'queued answer',
    );
    expect(queuedAssistant?.persona).toBe('planner');
  });
});

// ── useChat thread cache (contract 4) ───────────────────────────────────────

describe('useChat — thread session cache (2.6-chat)', () => {
  it('seeds instantly from cache before history resolves (no re-skeleton on return)', async () => {
    const key = chatThreadCacheKey('ws-1', 'sess-seed');
    const cachedMsg: ChatMessage = { id: 'c1', role: 'user', content: 'from cache', timestamp: 'now' };
    writeChatThreadCache(key, [cachedMsg]);

    const gate = deferred<ChatMessage[]>();
    mocks.adapter.getHistory.mockReturnValueOnce(gate.promise);

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-seed' }));
    await act(async () => { await Promise.resolve(); });

    // Painted from cache WHILE history is still in flight.
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('from cache');

    // Silent refresh replaces with the server truth.
    await act(async () => { gate.resolve([]); await Promise.resolve(); });
    expect(result.current.messages).toHaveLength(0);
  });

  it('keeps the cached paint when the history refresh fails (no wipe)', async () => {
    const key = chatThreadCacheKey('ws-1', 'sess-fail');
    writeChatThreadCache(key, [{ id: 'c1', role: 'user', content: 'cached', timestamp: 'now' }]);
    mocks.adapter.getHistory.mockRejectedValueOnce(new Error('offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-fail' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('cached');
    expect(result.current.historyLoaded).toBe(true);
    expect(result.current.historyReady).toBe(true);
  });

  it('never lets delayed history from the previous session overwrite the active session', async () => {
    const historyA = deferred<ChatMessage[]>();
    const historyB = deferred<ChatMessage[]>();
    mocks.adapter.getHistory
      .mockReturnValueOnce(historyA.promise)
      .mockReturnValueOnce(historyB.promise);

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    await act(async () => { await Promise.resolve(); });
    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await Promise.resolve();
    });
    expect(hook.result.current.historyReady).toBe(false);

    await act(async () => {
      historyB.resolve([{ id: 'b', role: 'assistant', content: 'session B', timestamp: 'now' }]);
      await Promise.resolve();
    });
    expect(hook.result.current.messages.map(message => message.content)).toEqual(['session B']);
    expect(hook.result.current.historyLoaded).toBe(true);
    expect(hook.result.current.historyReady).toBe(true);

    await act(async () => {
      historyA.resolve([{ id: 'a', role: 'assistant', content: 'stale session A', timestamp: 'now' }]);
      await Promise.resolve();
    });
    expect(hook.result.current.messages.map(message => message.content)).toEqual(['session B']);
    expect(hook.result.current.historyLoaded).toBe(true);
    expect(hook.result.current.historyReady).toBe(true);
  });

  it('clears an uncached session immediately without displaying or caching the previous session', async () => {
    const historyB = deferred<ChatMessage[]>();
    mocks.adapter.getHistory
      .mockResolvedValueOnce([{ id: 'a', role: 'assistant', content: 'session A', timestamp: 'now' }])
      .mockReturnValueOnce(historyB.promise);

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    await act(async () => { await Promise.resolve(); });
    expect(hook.result.current.messages.map(message => message.content)).toEqual(['session A']);

    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await Promise.resolve();
    });

    expect(hook.result.current.messages).toEqual([]);
    expect(readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-b'))).toBeUndefined();

    historyB.resolve([]);
    await act(async () => { await Promise.resolve(); });
  });

  it('never lets a delayed same-session history refresh erase a turn that already started', async () => {
    const history = deferred<ChatMessage[]>();
    const streamGate = deferred<void>();
    mocks.adapter.getHistory.mockReturnValueOnce(history.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'draft answer' } };
      await streamGate.promise;
      yield { type: 'done', data: { content: 'canonical answer' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-history-race',
    }));
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await Promise.resolve();
    });

    await act(async () => {
      history.resolve([
        { id: 'old-u', role: 'user', content: 'older question', timestamp: 'old' },
        { id: 'old-a', role: 'assistant', content: 'older answer', timestamp: 'old' },
      ]);
      await Promise.resolve();
    });
    const keptHistory = result.current.messages.some(message => message.content === 'older answer');
    const keptUser = result.current.messages.some(message => message.role === 'user');
    const keptDraft = result.current.messages.some(message => message.draft?.content === 'draft answer');

    streamGate.resolve();
    await act(async () => { await sendPromise; });
    const keptFinal = result.current.messages.some(message => message.content === 'canonical answer');

    expect(keptHistory).toBe(true);
    expect(keptUser).toBe(true);
    expect(keptDraft).toBe(true);
    expect(keptFinal).toBe(true);
  });

  it('keeps the active turn when its pending history refresh fails', async () => {
    const history = deferred<ChatMessage[]>();
    const streamGate = deferred<void>();
    mocks.adapter.getHistory.mockReturnValueOnce(history.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'draft answer' } };
      await streamGate.promise;
      yield { type: 'done', data: { content: 'canonical answer' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-history-error-race',
    }));
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await Promise.resolve();
    });

    await act(async () => {
      history.reject(new Error('offline'));
      await Promise.resolve();
    });
    const keptDuringFailure = result.current.messages.some(message =>
      message.role === 'user' || message.draft?.content === 'draft answer'
    );

    streamGate.resolve();
    await act(async () => { await sendPromise; });
    const keptFinal = result.current.messages.some(message => message.content === 'canonical answer');

    expect(keptDuringFailure).toBe(true);
    expect(keptFinal).toBe(true);
  });

  it('does not restore a persisted failed pair while its retry waits for history', async () => {
    const cacheKey = chatThreadCacheKey('ws-1', 'sess-pending-retry');
    const failedPair: ChatMessage[] = [
      { id: 'hist-user', role: 'user', content: 'retry me', timestamp: 'old' },
      {
        id: 'hist-assistant',
        role: 'assistant',
        content: 'Generation failed: original failure',
        timestamp: 'old',
      },
    ];
    writeChatThreadCache(cacheKey, failedPair);
    const history = deferred<ChatMessage[]>();
    mocks.adapter.getHistory.mockReturnValueOnce(history.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'recovered answer' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-pending-retry',
    }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages.map(message => message.id))
      .toEqual(['hist-user', 'hist-assistant']);

    act(() => { result.current.retryLastFailed(); });
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();

    history.resolve(failedPair);
    await waitFor(() => expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'retry me'],
      ['assistant', 'recovered answer'],
    ]);
  });

  it('waits for initial history before dispatch and preserves a legitimate repeated exchange', async () => {
    const history = deferred<ChatMessage[]>();
    mocks.adapter.getHistory.mockReturnValueOnce(history.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'canonical answer' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-1',
      sessionId: 'sess-history-overlap',
    }));
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await Promise.resolve();
    });

    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();

    await act(async () => {
      history.resolve([
        { id: 'hist-0', role: 'user', content: 'question', timestamp: 'server-user' },
        { id: 'hist-1', role: 'assistant', content: 'canonical answer', timestamp: 'server-assistant' },
      ]);
      await sendPromise;
    });

    expect(result.current.messages.map(message => [message.role, message.content])).toEqual([
      ['user', 'question'],
      ['assistant', 'canonical answer'],
      ['user', 'question'],
      ['assistant', 'canonical answer'],
    ]);
    expect(
      readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-history-overlap'))
        ?.map(message => [message.role, message.content]),
    ).toEqual([
      ['user', 'question'],
      ['assistant', 'canonical answer'],
      ['user', 'question'],
      ['assistant', 'canonical answer'],
    ]);
  });

  it('writes the settled thread to cache after a clean send', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'answer' } };
    });
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId: 'sess-write' }));
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await result.current.sendMessage('question'); });

    const cached = readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-write'));
    expect(cached).toBeDefined();
    expect(cached!.some(m => m.role === 'user' && m.content === 'question')).toBe(true);
    expect(cached!.some(m => m.role === 'assistant' && m.content === 'answer')).toBe(true);
    // Settled thread has no `queued` turns.
    expect(cached!.some(m => m.queued)).toBe(false);
  });

  it('clears server history for the current workspace', async () => {
    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-clear',
      sessionId: 'sess-clear',
    }));
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.clearHistory();
    });

    expect(mocks.adapter.clearHistory).toHaveBeenCalledWith(
      'ws-clear',
      'sess-clear',
    );
  });

  it('invalidates the exact thread cache and ignores history that resolves after clear', async () => {
    const key = chatThreadCacheKey('ws-clear-race', 'sess-clear-race');
    const oldMessage: ChatMessage = {
      id: 'old',
      role: 'assistant',
      content: 'must stay cleared',
      timestamp: 'now',
    };
    writeChatThreadCache(key, [oldMessage]);
    const history = deferred<ChatMessage[]>();
    mocks.adapter.getHistory.mockReturnValueOnce(history.promise);

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-clear-race',
      sessionId: 'sess-clear-race',
    }));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.messages.map(message => message.content)).toEqual(['must stay cleared']);

    await act(async () => { await result.current.clearHistory(); });
    const messagesAfterClear = result.current.messages;
    const cacheAfterClear = readChatThreadCache(key);

    await act(async () => {
      history.resolve([oldMessage]);
      await Promise.resolve();
    });
    expect(messagesAfterClear).toEqual([]);
    expect(cacheAfterClear).toEqual([]);
    expect(result.current.messages).toEqual([]);
    expect(readChatThreadCache(key)).toEqual([]);
  });

  it('does not resurrect a cleared thread after switching away and back during clear', async () => {
    const oldMessage: ChatMessage = {
      id: 'old-a',
      role: 'assistant',
      content: 'must remain cleared',
      timestamp: 'old',
    };
    const returningHistory = deferred<ChatMessage[]>();
    const clearGate = deferred<void>();
    mocks.adapter.getHistory
      .mockResolvedValueOnce([oldMessage])
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(returningHistory.promise);
    mocks.adapter.clearHistory.mockReturnValueOnce(clearGate.promise);

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-clear-switch',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    await act(async () => { await Promise.resolve(); });

    let clearPromise: Promise<void> | undefined;
    await act(async () => {
      clearPromise = hook.result.current.clearHistory();
      await Promise.resolve();
    });
    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await Promise.resolve();
    });
    await act(async () => {
      hook.rerender({ activeSession: 'sess-a' });
      await Promise.resolve();
    });

    clearGate.resolve();
    await act(async () => { await clearPromise; });
    returningHistory.resolve([oldMessage]);
    await act(async () => { await Promise.resolve(); });

    expect(hook.result.current.messages).toEqual([]);
    expect(hook.result.current.historyLoaded).toBe(true);
    expect(
      readChatThreadCache(chatThreadCacheKey('ws-clear-switch', 'sess-a')),
    ).toEqual([]);
  });

  it('refetches an uncached pending history snapshot when clear fails', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const serverMessage: ChatMessage = {
      id: 'server-old',
      role: 'assistant',
      content: 'still exists on server',
      timestamp: 'old',
    };
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockResolvedValueOnce([serverMessage]);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-clear-failed-history',
      sessionId: 'sess-clear-failed-history',
    }));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { await result.current.clearHistory(); });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      expect(result.current.messages.map(message => message.content))
        .toEqual(['still exists on server']);
    });
    expect(result.current.historyLoaded).toBe(true);
  });

  it('recovers pending server history and the canceled local turn after clear fails', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const serverMessage: ChatMessage = {
      id: 'server-before-send',
      role: 'assistant',
      content: 'older server history',
      timestamp: 'old',
    };
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockResolvedValueOnce([serverMessage]);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-clear-active-history',
      sessionId: 'sess-clear-active-history',
    }));
    await act(async () => { await Promise.resolve(); });

    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('local turn');
      await Promise.resolve();
    });
    await act(async () => { await result.current.clearHistory(); });
    await act(async () => { await sendPromise; });

    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(2));
    await waitFor(() => {
      const contents = result.current.messages.map(message => message.content);
      expect(contents).toContain('older server history');
      expect(contents).toContain('local turn');
    });
  });

  it('blocks a send until failed-clear history recovery is installed', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const recoveryHistory = deferred<ChatMessage[]>();
    const streamGate = deferred<void>();
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockReturnValueOnce(recoveryHistory.promise);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('offline'));
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'must not start' } };
      await streamGate.promise;
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-clear-recovery-admission',
      sessionId: 'sess-clear-recovery-admission',
    }));
    await act(async () => { await Promise.resolve(); });

    let sendPromise: Promise<boolean> | undefined;
    const onAccepted = vi.fn();
    await act(async () => {
      await result.current.clearHistory();
      sendPromise = result.current.sendMessage('wait for recovery', { onAccepted });
      await Promise.resolve();
    });

    expect(await sendPromise).toBe(false);
    expect(onAccepted).not.toHaveBeenCalled();
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages.some(message => message.content === 'wait for recovery')).toBe(false);

    recoveryHistory.resolve([]);
    streamGate.resolve();
    await act(async () => { await Promise.resolve(); });
  });

  it('keeps recovery ownership when clear fails again during the recovery fetch', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const firstRecovery = deferred<ChatMessage[]>();
    const secondRecovery = deferred<ChatMessage[]>();
    const serverMessage: ChatMessage = {
      id: 'server-before-recovery',
      role: 'assistant',
      content: 'server history survives',
      timestamp: 'old',
    };
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockReturnValueOnce(firstRecovery.promise)
      .mockReturnValueOnce(secondRecovery.promise);
    mocks.adapter.clearHistory
      .mockRejectedValueOnce(new Error('first clear offline'))
      .mockRejectedValueOnce(new Error('second clear offline'));
    mocks.adapter.sendMessage.mockImplementation(async function* () {
      yield { type: 'done', data: { content: 'must not run' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-reentrant-clear',
      sessionId: 'sess-reentrant-clear',
    }));
    await act(async () => { await Promise.resolve(); });

    let localSend: Promise<boolean> | undefined;
    await act(async () => {
      localSend = result.current.sendMessage('local canceled turn');
      await Promise.resolve();
    });
    await act(async () => { await result.current.clearHistory(); });
    await act(async () => { await localSend; });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(2));

    await act(async () => { await result.current.clearHistory(); });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(3));

    let blockedSend: Promise<boolean> | undefined;
    await act(async () => {
      blockedSend = result.current.sendMessage('must remain blocked');
      await Promise.resolve();
    });
    expect(result.current.messages.some(message => message.content === 'must remain blocked')).toBe(false);

    secondRecovery.resolve([serverMessage]);
    firstRecovery.resolve([]);
    await act(async () => { await Promise.resolve(); });
    expect(await blockedSend).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages.map(message => message.content)).toContain('server history survives');
    expect(result.current.messages.map(message => message.content)).toContain('local canceled turn');
  });

  it('keeps recovery ownership when clear fails again before recovery installs', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const recoveryHistory = deferred<ChatMessage[]>();
    const serverMessage: ChatMessage = {
      id: 'server-before-install',
      role: 'assistant',
      content: 'server history before install',
      timestamp: 'old',
    };
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockReturnValueOnce(recoveryHistory.promise);
    mocks.adapter.clearHistory
      .mockRejectedValueOnce(new Error('first clear offline'))
      .mockRejectedValueOnce(new Error('second clear offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-preinstall-clear',
      sessionId: 'sess-preinstall-clear',
    }));
    await act(async () => { await Promise.resolve(); });

    let localSend: Promise<boolean> | undefined;
    await act(async () => {
      localSend = result.current.sendMessage('local preinstall turn');
      await Promise.resolve();
    });
    await act(async () => {
      await result.current.clearHistory();
      await result.current.clearHistory();
    });
    await act(async () => { await localSend; });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(2));

    let blockedSend: Promise<boolean> | undefined;
    await act(async () => {
      blockedSend = result.current.sendMessage('must remain blocked preinstall');
      await Promise.resolve();
    });
    expect(result.current.messages.some(
      message => message.content === 'must remain blocked preinstall'
    )).toBe(false);

    recoveryHistory.resolve([serverMessage]);
    await act(async () => { await Promise.resolve(); });
    expect(await blockedSend).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages.map(message => message.content)).toContain('server history before install');
    expect(result.current.messages.map(message => message.content)).toContain('local preinstall turn');
  });

  it('retries recovery once and stays fail-closed when history remains offline', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const terminalRecovery = deferred<ChatMessage[]>();
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockRejectedValueOnce(new Error('recovery offline'))
      .mockReturnValueOnce(terminalRecovery.promise);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('clear offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-recovery-offline',
      sessionId: 'sess-recovery-offline',
    }));
    await act(async () => { await Promise.resolve(); });

    let localSend: Promise<boolean> | undefined;
    await act(async () => {
      localSend = result.current.sendMessage('local offline turn');
      await Promise.resolve();
    });
    await act(async () => { await result.current.clearHistory(); });
    await act(async () => { await localSend; });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(3));

    let blockedDuringRetry: Promise<boolean> | undefined;
    await act(async () => {
      blockedDuringRetry = result.current.sendMessage('blocked during recovery retry');
      await Promise.resolve();
    });
    expect(await blockedDuringRetry).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();

    terminalRecovery.reject(new Error('still offline'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    let blockedAfterRetry: Promise<boolean> | undefined;
    await act(async () => {
      blockedAfterRetry = result.current.sendMessage('blocked after recovery retry');
    });
    expect(await blockedAfterRetry).toBe(false);
    expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(3);
    expect(result.current.historyLoaded).toBe(false);
    expect(result.current.messages.map(message => message.content)).toContain('local offline turn');
  });

  it('treats malformed resolved recovery history as failed and stays fail-closed', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const recoveryRetry = deferred<ChatMessage[]>();
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockResolvedValueOnce([null] as unknown as ChatMessage[])
      .mockReturnValueOnce(recoveryRetry.promise);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('clear offline'));

    const { useChat } = await import('@/hooks/useChat');
    const { result } = renderHook(() => useChat({
      workspaceId: 'ws-malformed-recovery',
      sessionId: 'sess-malformed-recovery',
    }));
    await act(async () => { await Promise.resolve(); });

    let localSend: Promise<boolean> | undefined;
    await act(async () => {
      localSend = result.current.sendMessage('local malformed turn');
      await Promise.resolve();
    });
    await act(async () => { await result.current.clearHistory(); });
    await act(async () => { await localSend; });

    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(3));
    expect(result.current.historyLoaded).toBe(false);

    let blockedSend: Promise<boolean> | undefined;
    await act(async () => {
      blockedSend = result.current.sendMessage('blocked after malformed history');
    });
    expect(await blockedSend).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();

    recoveryRetry.resolve([]);
    await act(async () => { await Promise.resolve(); });
    expect(result.current.historyLoaded).toBe(true);
    expect(result.current.messages.map(message => message.content)).toContain('local malformed turn');
  });

  it('preserves a canceled local turn across navigation during failed-clear recovery', async () => {
    const abandonedHistory = deferred<ChatMessage[]>();
    const staleRecovery = deferred<ChatMessage[]>();
    const serverMessage: ChatMessage = {
      id: 'server-after-return',
      role: 'assistant',
      content: 'authoritative history after return',
      timestamp: 'old',
    };
    mocks.adapter.getHistory
      .mockReturnValueOnce(abandonedHistory.promise)
      .mockReturnValueOnce(staleRecovery.promise)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([serverMessage]);
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('offline'));

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-recovery-navigation',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    await act(async () => { await Promise.resolve(); });

    let localSend: Promise<boolean> | undefined;
    await act(async () => {
      localSend = hook.result.current.sendMessage('local canceled turn');
      await Promise.resolve();
    });
    await act(async () => { await hook.result.current.clearHistory(); });
    await act(async () => { await localSend; });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(2));

    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await Promise.resolve();
    });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(3));
    await act(async () => {
      hook.rerender({ activeSession: 'sess-a' });
      await Promise.resolve();
    });
    await waitFor(() => expect(mocks.adapter.getHistory).toHaveBeenCalledTimes(4));
    await waitFor(() => {
      const contents = hook.result.current.messages.map(message => message.content);
      expect(contents).toContain('authoritative history after return');
      expect(contents).toContain('local canceled turn');
    });

    staleRecovery.resolve([]);
    await act(async () => { await Promise.resolve(); });
  });
});

// ── ChatApp composer surface (contracts 1a + 2 + queued paint) ──────────────

describe('ChatApp — composer input primacy', () => {
  const noop = () => {};
  const baseProps = {
    messages: [] as ChatMessage[],
    isLoading: false,
    onSendMessage: noop,
    onClearHistory: noop,
    pendingApproval: null,
    onApprove: noop,
    workspaceId: null as string | null,
    availableModels: [] as string[],
    activeSessionId: null as string | null,
    sessionCreating: false,
    sessionLoading: false,
    sessionReady: true,
    sessionError: null as string | null,
    historyLoaded: false,
    initialMessage: undefined as string | undefined,
    autoSendInitial: false,
    onRetry: undefined as (() => void) | undefined,
  };
  const renderChat = (props: Partial<typeof baseProps> & { messages: ChatMessage[] }) =>
    render(<TooltipProvider><ChatAppEl {...baseProps} {...props} /></TooltipProvider>);

  // Late import so the adapter mock is installed first.
  let ChatAppEl: typeof import('@/components/os/apps/ChatApp').default;
  beforeEach(async () => { ChatAppEl = (await import('@/components/os/apps/ChatApp')).default; });

  const assistantMsg: ChatMessage = { id: 'm1', role: 'assistant', content: 'Answer.', timestamp: 'now' };

  it('the composer textarea is ENABLED at paint (not gated behind loading)', () => {
    renderChat({ messages: [] });
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('names the composer textarea for assistive tech and browser metadata', () => {
    renderChat({ messages: [] });
    const composer = screen.getByRole('textbox', { name: /message composer/i });
    expect(composer).toHaveAttribute('name', 'message');
    expect(composer).toHaveAttribute('autocomplete', 'off');
    expect(composer.className).toContain('focus-visible:ring-2');
    expect(composer.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('the textarea stays enabled even while a reply streams (isLoading)', () => {
    renderChat({ messages: [assistantMsg], isLoading: true });
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('send is NOT locked while a reply streams — text present + isLoading enables send', () => {
    renderChat({ messages: [assistantMsg], isLoading: true });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'next message' } });
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it.each([
    {
      label: 'a new session is being created',
      props: { activeSessionId: 'session-old', sessionCreating: true },
      status: /creating a new session/i,
    },
    {
      label: 'the session list is still loading',
      props: { activeSessionId: null, sessionLoading: true, sessionReady: false },
      status: /loading sessions/i,
    },
    {
      label: 'no usable session was loaded',
      props: { activeSessionId: null, sessionReady: false, sessionError: 'Could not load sessions' },
      status: /could not load sessions/i,
    },
  ])('keeps the draft and blocks Send plus Enter while $label', ({ props, status }) => {
    const onSendMessage = vi.fn();
    renderChat({ messages: [], onSendMessage, ...props });
    const composer = screen.getByRole('textbox', { name: /message composer/i });
    fireEvent.change(composer, { target: { value: 'Keep this in the right session' } });
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.click(send);
    fireEvent.keyDown(composer, { key: 'Enter' });

    expect(send).toBeDisabled();
    expect(composer).toHaveValue('Keep this in the right session');
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByText(status)).toBeInTheDocument();
  });

  it('hides every retry path while a session transition is pending', () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <TooltipProvider>
          <ChatAppEl
            {...baseProps}
            messages={[{
              ...assistantMsg,
              blocks: [{ type: 'error', blockId: 'e1', message: 'Provider failed' }],
            }]}
            activeSessionId="session-old"
            sessionCreating
            onRetry={onRetry}
          />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('renders the truthful "waiting to send" state on a queued optimistic turn', () => {
    const queuedMsg: ChatMessage = { id: 'q1', role: 'user', content: 'queued one', timestamp: 'now', queued: true };
    renderChat({ messages: [assistantMsg, queuedMsg] });
    const badge = screen.getByTestId('chat-msg-queued');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('Waiting to send');
  });

  it('clears an auto-sent first task before the send promise resolves', async () => {
    const gate = deferred<boolean | void>();
    const onSendMessage = vi.fn(() => gate.promise);

    renderChat({
      messages: [],
      activeSessionId: 'sess-first-task',
      historyLoaded: true,
      initialMessage: 'Draft my launch checklist',
      autoSendInitial: true,
      onSendMessage,
    });

    await waitFor(() => expect(onSendMessage).toHaveBeenCalledWith('Draft my launch checklist'));
    expect(screen.getByRole('textbox', { name: /message composer/i })).toHaveValue('');

    gate.resolve(true);
  });

  it('restores the composer text when an asynchronous send is rejected', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(false);
    renderChat({ messages: [], onSendMessage });

    const composer = screen.getByRole('textbox', { name: /message composer/i });
    fireEvent.change(composer, { target: { value: 'keep this message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(composer).toHaveValue('keep this message'));
    expect(onSendMessage).toHaveBeenCalledWith('keep this message');
  });

  it('never restores an older rejected send after a newer send was accepted', async () => {
    const firstSend = deferred<boolean | void>();
    const onSendMessage = vi.fn()
      .mockReturnValueOnce(firstSend.promise)
      .mockResolvedValueOnce(true);
    renderChat({ messages: [], onSendMessage });

    const composer = screen.getByRole('textbox', { name: /message composer/i });
    fireEvent.change(composer, { target: { value: 'older message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.change(composer, { target: { value: 'newer message' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await act(async () => { await Promise.resolve(); });

    firstSend.resolve(false);
    await act(async () => { await Promise.resolve(); });

    expect(composer).toHaveValue('');
    expect(onSendMessage).toHaveBeenNthCalledWith(1, 'older message');
    expect(onSendMessage).toHaveBeenNthCalledWith(2, 'newer message');
  });

  it('never restores a rejected send into a different session', async () => {
    const firstSend = deferred<boolean | void>();
    const onSendMessage = vi.fn(() => firstSend.promise);
    const view = renderChat({
      messages: [assistantMsg],
      workspaceId: 'ws-composer-owner',
      activeSessionId: 'sess-a',
      onSendMessage,
    });

    const composer = screen.getByRole('textbox', { name: /message composer/i });
    fireEvent.change(composer, { target: { value: 'session A draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    view.rerender(
      <TooltipProvider>
        <ChatAppEl
          {...baseProps}
          messages={[assistantMsg]}
          workspaceId="ws-composer-owner"
          activeSessionId="sess-b"
          onSendMessage={onSendMessage}
        />
      </TooltipProvider>,
    );

    firstSend.resolve(false);
    await act(async () => { await Promise.resolve(); });

    expect(composer).toHaveValue('');
  });

  it.each(['/cost', '/models'])(
    'restores the %s command when its asynchronous send is rejected',
    async (command) => {
      const onSendMessage = vi.fn().mockResolvedValue(false);
      renderChat({
        messages: [],
        onSendMessage,
        availableModels: ['local/model-a'],
      });

      const composer = screen.getByRole('textbox', { name: /message composer/i });
      fireEvent.change(composer, { target: { value: command } });
      fireEvent.click(screen.getByRole('button', { name: 'Send' }));

      await waitFor(() => expect(composer).toHaveValue(command));
    },
  );

  it('restores a rejected WorkspaceBriefing starter prompt', async () => {
    vi.useFakeTimers();
    try {
      mocks.adapter.getWorkspaceContext.mockResolvedValueOnce({
        greeting: 'Welcome',
        suggestedPrompts: ['Inspect this workspace'],
      });
      const onSendMessage = vi.fn().mockResolvedValue(false);
      renderChat({
        messages: [],
        workspaceId: 'ws-starter',
        activeSessionId: 'sess-starter',
        onSendMessage,
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Inspect this workspace' }));
      const composer = screen.getByRole('textbox', { name: /message composer/i });
      expect(composer).toHaveValue('Inspect this workspace');
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(onSendMessage).toHaveBeenCalledWith('Inspect this workspace');
      expect(composer).toHaveValue('Inspect this workspace');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a delayed WorkspaceBriefing starter after a session switch', async () => {
    vi.useFakeTimers();
    try {
      mocks.adapter.getWorkspaceContext.mockResolvedValue({
        greeting: 'Welcome',
        suggestedPrompts: ['Inspect this workspace'],
      });
      const onSendMessage = vi.fn().mockResolvedValue(true);
      const view = renderChat({
        messages: [],
        workspaceId: 'ws-starter-owner',
        activeSessionId: 'sess-a',
        onSendMessage,
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Inspect this workspace' }));

      view.rerender(
        <TooltipProvider>
          <ChatAppEl
            {...baseProps}
            messages={[]}
            workspaceId="ws-starter-owner"
            activeSessionId="sess-b"
            onSendMessage={onSendMessage}
          />
        </TooltipProvider>,
      );
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(onSendMessage).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a delayed WorkspaceBriefing starter as a draft when session creation begins', async () => {
    vi.useFakeTimers();
    try {
      mocks.adapter.getWorkspaceContext.mockResolvedValue({
        greeting: 'Welcome',
        suggestedPrompts: ['Inspect this workspace'],
      });
      const onSendMessage = vi.fn().mockResolvedValue(true);
      const view = renderChat({
        messages: [],
        workspaceId: 'ws-starter-transition',
        activeSessionId: 'session-old',
        onSendMessage,
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Inspect this workspace' }));

      view.rerender(
        <TooltipProvider>
          <ChatAppEl
            {...baseProps}
            messages={[]}
            workspaceId="ws-starter-transition"
            activeSessionId="session-old"
            sessionCreating
            onSendMessage={onSendMessage}
          />
        </TooltipProvider>,
      );
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(screen.getByRole('textbox', { name: /message composer/i }))
        .toHaveValue('Inspect this workspace');
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels a delayed WorkspaceBriefing starter after edit then revert', async () => {
    vi.useFakeTimers();
    try {
      mocks.adapter.getWorkspaceContext.mockResolvedValueOnce({
        greeting: 'Welcome',
        suggestedPrompts: ['Inspect this workspace'],
      });
      const onSendMessage = vi.fn().mockResolvedValue(true);
      renderChat({
        messages: [],
        workspaceId: 'ws-starter-edit',
        activeSessionId: 'sess-starter-edit',
        onSendMessage,
      });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      fireEvent.click(screen.getByRole('button', { name: 'Inspect this workspace' }));

      const composer = screen.getByRole('textbox', { name: /message composer/i });
      fireEvent.change(composer, { target: { value: 'edited' } });
      fireEvent.change(composer, { target: { value: 'Inspect this workspace' } });
      await act(async () => {
        vi.advanceTimersByTime(1000);
        await Promise.resolve();
      });

      expect(onSendMessage).not.toHaveBeenCalled();
      expect(composer).toHaveValue('Inspect this workspace');
    } finally {
      vi.useRealTimers();
    }
  });
});
