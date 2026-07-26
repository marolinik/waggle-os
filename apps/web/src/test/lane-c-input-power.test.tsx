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
    activeSessionId: null as string | null,
    historyLoaded: false,
    initialMessage: undefined as string | undefined,
    autoSendInitial: false,
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
});
