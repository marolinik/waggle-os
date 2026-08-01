/**
 * Lane S2 — streaming interaction contract
 * (Path-to-9 Phase C · Pillar 3.1: input-primacy applied to the stream).
 *
 * Contracts as TESTS (spec §Lane S2):
 *   1. Auto-follow pins the viewport to the newest content while streaming; a
 *      user scroll-up breaks auto-follow INSTANTLY and surfaces a "Jump to
 *      latest" affordance; clicking it re-pins.
 *   2. A visible Stop control halts the in-flight reply immediately: the
 *      useChat abort/cancel path fires, the partial answer stays, and the
 *      composer returns to send (Stop only shows while streaming).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/lib/types';
import {
  chatThreadCacheKey,
  clearChatThreadCache,
  readChatThreadCache,
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
    abortAgent: vi.fn().mockResolvedValue(undefined),
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

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.sendMessage.mockReset();
  mocks.adapter.clearHistory.mockReset().mockResolvedValue(undefined);
  mocks.adapter.respondApproval.mockReset().mockResolvedValue(undefined);
  clearChatThreadCache();
  mocks.adapter.getHistory.mockResolvedValue([]);
  mocks.adapter.abortAgent.mockResolvedValue(undefined);
  mocks.adapter.getPins.mockResolvedValue([]);
  mocks.adapter.searchMemory.mockResolvedValue([]);
});
afterEach(() => { cleanup(); });

// ── useChat.stopStreaming (contract 2, the hook side) ───────────────────────

describe('useChat — stopStreaming (halt in-flight, keep partial, re-enable send)', () => {
  async function mountChat(sessionId = 'sess-1') {
    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(() => useChat({ workspaceId: 'ws-1', sessionId }));
    await act(async () => { await Promise.resolve(); });
    return hook;
  }

  it('replaces provisional token text with the authoritative done content', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'discarded draft' } };
      yield { type: 'done', data: { content: 'canonical final' } };
    });

    const { result } = await mountChat('sess-canonical');
    await act(async () => { await result.current.sendMessage('question'); });

    const assistant = result.current.messages.find(m => m.role === 'assistant');
    expect(assistant?.content).toBe('canonical final');
    expect(
      assistant?.blocks
        ?.filter(block => block.type === 'text')
        .map(block => block.content),
    ).toEqual(['canonical final']);
  });

  it('keeps only the newest revisioned draft ephemeral until done commits canonical text', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'draft_update', data: { turnId: 'turn-1', revision: 1, content: 'first draft' } };
      yield { type: 'draft_update', data: { turnId: 'turn-1', revision: 1, content: 'stale duplicate' } };
      yield { type: 'draft_update', data: { turnId: 'turn-1', revision: 2, content: 'newest draft' } };
      await gate.promise;
      yield { type: 'done', data: { content: 'canonical final' } };
    });

    const { result } = await mountChat('sess-revisions');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });

    const streaming = result.current.messages.find(message => message.role === 'assistant');
    expect(streaming?.content).toBe('');
    expect(streaming?.draft).toEqual({
      turnId: 'turn-1',
      revision: 2,
      content: 'newest draft',
      status: 'streaming',
    });
    expect(
      readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-revisions'))
        ?.some(message => message.draft || message.role === 'assistant'),
    ).toBe(false);

    gate.resolve();
    await act(async () => { await sendPromise; });
    const settled = result.current.messages.find(message => message.role === 'assistant');
    expect(settled?.content).toBe('canonical final');
    expect(settled?.draft).toBeUndefined();
  });

  it('fails visibly when the stream ends without a terminal event and never commits its draft', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'unsafe partial' } };
    });

    const { result } = await mountChat('sess-truncated');
    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.sendMessage('question');
    });

    expect(succeeded).toBe(false);
    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.content).toBe('The response ended before completion. Please retry.');
    expect(assistant?.content).not.toContain('unsafe partial');
    expect(assistant?.draft).toBeUndefined();
    expect(assistant?.blocks?.some(block => block.type === 'error')).toBe(true);
  });

  it('stops consuming immediately after done even when the producer would stay open', async () => {
    const never = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'complete' } };
      await never.promise;
    });

    const { result } = await mountChat('sess-terminal');
    let outcome: boolean | 'pending' = 'pending';
    let sendPromise: Promise<void> | undefined;
    try {
      await act(async () => {
        sendPromise = result.current.sendMessage('question').then(value => { outcome = value; });
        await flush();
      });
      expect(outcome).toBe(true);
      expect(result.current.isLoading).toBe(false);
    } finally {
      never.resolve();
      await act(async () => { await sendPromise; });
    }
  });

  it('returns failure for a terminal SSE error', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'error', data: { message: 'provider failed' } };
    });

    const { result } = await mountChat('sess-error');
    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.sendMessage('question');
    });

    expect(succeeded).toBe(false);
    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.blocks?.some(block => block.type === 'error')).toBe(true);
  });

  it('treats an adapter AbortError as a failed transport unless the local controller was stopped', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'unsafe partial' } };
      const error = new Error('The transport was aborted');
      error.name = 'AbortError';
      throw error;
    });

    const { result } = await mountChat('sess-transport-abort');
    let succeeded = true;
    await act(async () => {
      succeeded = await result.current.sendMessage('question');
    });

    expect(succeeded).toBe(false);
    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.draft).toBeUndefined();
    expect(assistant?.blocks?.some(block => block.type === 'error')).toBe(true);
  });

  it('does not resurrect an older draft revision after tool_start clears the preview', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'draft_update', data: { turnId: 'turn-watermark', revision: 2, content: 'newest' } };
      yield { type: 'tool_start', data: { name: 'read_file', input: { path: 'README.md' } } };
      yield { type: 'draft_update', data: { turnId: 'turn-watermark', revision: 1, content: 'stale' } };
      await gate.promise;
      yield { type: 'done', data: { content: 'canonical' } };
    });

    const { result } = await mountChat('sess-watermark');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });

    const assistant = result.current.messages.find(message => message.role === 'assistant');
    gate.resolve();
    await act(async () => { await sendPromise; });

    expect(assistant?.draft?.content ?? '').toBe('');
    expect(assistant?.draft?.revision).toBe(2);
  });

  it('allows a revisioned stream to replace legacy token revisions from the same migration turn', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'legacy ' } };
      yield { type: 'token', data: { content: 'preview' } };
      yield { type: 'draft_update', data: { turnId: 'turn-modern', revision: 1, content: 'modern preview' } };
      await gate.promise;
      yield { type: 'done', data: { content: 'canonical' } };
    });

    const { result } = await mountChat('sess-mixed-stream');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });
    const assistant = result.current.messages.find(message => message.role === 'assistant');

    gate.resolve();
    await act(async () => { await sendPromise; });

    expect(assistant?.draft).toMatchObject({
      turnId: 'turn-modern',
      revision: 1,
      content: 'modern preview',
    });
  });

  it('keeps legacy token content when done omits canonical content', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'legacy answer' } };
      yield { type: 'done', data: { model: 'legacy/model' } };
    });

    const { result } = await mountChat('sess-legacy');
    await act(async () => { await result.current.sendMessage('question'); });

    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.content).toBe('legacy answer');
    expect(assistant?.draft).toBeUndefined();
    expect(assistant?.model).toBe('legacy/model');
  });

  it('keeps all legacy token content across tool activity when done omits content', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'Before tool. ' } };
      yield { type: 'tool_start', data: { name: 'read_file', input: {} } };
      yield { type: 'tool_end', data: { name: 'read_file', result: 'ok' } };
      yield { type: 'token', data: { content: 'After tool.' } };
      yield { type: 'done', data: { model: 'legacy/model' } };
    });

    const { result } = await mountChat('sess-legacy-tool');
    await act(async () => { await result.current.sendMessage('question'); });

    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.content).toBe('Before tool. After tool.');
    expect(assistant?.draft).toBeUndefined();
  });

  it.each([
    { label: 'before the first token', emitToolStart: false },
    { label: 'after tool_start clears provisional text', emitToolStart: true },
  ])('never caches an uncommitted assistant when stopped $label', async ({ emitToolStart }) => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      if (emitToolStart) {
        yield { type: 'tool_start', data: { name: 'read_file', input: { path: 'README.md' } } };
      }
      await gate.promise;
    });

    const sessionId = emitToolStart ? 'sess-stop-tool' : 'sess-stop-empty';
    const { result } = await mountChat(sessionId);
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });
    await act(async () => {
      result.current.stopStreaming();
      await flush();
    });

    const cached = readChatThreadCache(chatThreadCacheKey('ws-1', sessionId));
    expect(cached?.some(message => message.role === 'assistant')).toBe(false);

    gate.resolve();
    await act(async () => { await sendPromise; });
  });

  it('invalidates a pending approval and terminalizes running activity when stopped', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'step', data: { content: 'Inspecting workspace' } };
      yield { type: 'tool_start', data: { name: 'read_file', input: { path: 'README.md' } } };
      yield {
        type: 'approval_required',
        data: { requestId: 'approval-stale', toolName: 'read_file', sourceWorkspaceId: 'ws-1' },
      };
      await gate.promise;
    });

    const { result } = await mountChat('sess-stale-approval');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });
    expect(result.current.pendingApproval?.requestId).toBe('approval-stale');

    await act(async () => {
      result.current.stopStreaming();
      await flush();
    });

    const assistant = result.current.messages.find(message => message.role === 'assistant');
    const hasRunningActivity =
      assistant?.blocks?.some(block =>
        (block.type === 'step' || block.type === 'tool_use') && block.status === 'running'
      ) ?? false;
    const pendingApprovalAfterStop = result.current.pendingApproval;

    gate.resolve();
    await act(async () => { await sendPromise; });

    expect(pendingApprovalAfterStop).toBeNull();
    expect(hasRunningActivity).toBe(false);
  });

  it('drops queued work and aborts the active turn before clearing history', async () => {
    const gate = deferred<void>();
    const activeTurn = Object.assign(new Error('turn still settling'), {
      name: 'AdapterHttpError',
      status: 409,
      body: { code: 'SESSION_TURN_IN_PROGRESS' },
    });
    mocks.adapter.clearHistory
      .mockRejectedValueOnce(activeTurn)
      .mockResolvedValueOnce(undefined);
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'partial' } };
        await gate.promise;
        yield { type: 'done', data: { content: 'must not return' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'queued work must not run' } };
      });

    const { result } = await mountChat('sess-clear-active');
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = result.current.sendMessage('first');
      await flush();
      await result.current.sendMessage('queued second');
    });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => { await result.current.clearHistory(); });
    const callsImmediatelyAfterClear = mocks.adapter.sendMessage.mock.calls.length;
    const loadingAfterClear = result.current.isLoading;

    gate.resolve();
    await act(async () => { await firstPromise; await flush(); });

    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1', 'sess-clear-active');
    expect(mocks.adapter.clearHistory).toHaveBeenCalledTimes(2);
    expect(callsImmediatelyAfterClear).toBe(1);
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(loadingAfterClear).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-clear-active'))).toEqual([]);
  });

  it('removes canceled queued bubbles when clearing history fails', async () => {
    const streamGate = deferred<void>();
    mocks.adapter.clearHistory.mockRejectedValueOnce(new Error('offline'));
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'partial' } };
        await streamGate.promise;
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'must not run' } };
      });

    const { result } = await mountChat('sess-clear-failure');
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = result.current.sendMessage('first');
      await flush();
      await result.current.sendMessage('queued second');
    });
    expect(result.current.messages.some(message => message.queued)).toBe(true);

    await act(async () => { await result.current.clearHistory(); });
    const messagesAfterFailure = result.current.messages;

    streamGate.resolve();
    await act(async () => { await firstPromise; });

    expect(messagesAfterFailure.some(message => message.queued)).toBe(false);
    expect(messagesAfterFailure.some(message => message.content === 'queued second')).toBe(false);
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('keeps the failed pair when retry is attempted during a clear that fails', async () => {
    const clearGate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'error', data: { message: 'original failure' } };
    });
    mocks.adapter.clearHistory.mockReturnValueOnce(clearGate.promise);

    const { result } = await mountChat('sess-clear-retry');
    await act(async () => { await result.current.sendMessage('retry me'); });
    const beforeRetry = result.current.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }));

    let clearPromise: Promise<void> | undefined;
    await act(async () => {
      clearPromise = result.current.clearHistory();
      await flush();
    });
    act(() => { result.current.retryLastFailed(); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    clearGate.reject(new Error('offline'));
    await act(async () => { await clearPromise; });

    expect(result.current.messages.map(message => ({
      id: message.id,
      role: message.role,
      content: message.content,
    }))).toEqual(beforeRetry);
  });

  it('does not start a new turn while the clear transaction is still pending', async () => {
    const clearGate = deferred<void>();
    mocks.adapter.clearHistory.mockReturnValueOnce(clearGate.promise);

    const { result } = await mountChat('sess-clear-pending');
    let clearPromise: Promise<void> | undefined;
    await act(async () => {
      clearPromise = result.current.clearHistory();
      await flush();
    });

    let accepted = true;
    await act(async () => {
      accepted = await result.current.sendMessage('must wait for clear');
    });

    clearGate.resolve();
    await act(async () => { await clearPromise; });

    expect(accepted).toBe(false);
    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();
    expect(result.current.messages).toEqual([]);
  });

  it('keeps the thread blocked until every overlapping clear has settled', async () => {
    const firstClear = deferred<void>();
    const secondClear = deferred<void>();
    mocks.adapter.clearHistory
      .mockReturnValueOnce(firstClear.promise)
      .mockReturnValueOnce(secondClear.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'must not run' } };
    });

    const { result } = await mountChat('sess-overlapping-clear');
    let firstPromise: Promise<void> | undefined;
    let secondPromise: Promise<void> | undefined;
    await act(async () => {
      firstPromise = result.current.clearHistory();
      await flush();
    });
    await act(async () => {
      secondPromise = result.current.clearHistory();
      await flush();
    });

    firstClear.resolve();
    await act(async () => { await firstPromise; });
    await act(async () => {
      await result.current.sendMessage('must stay blocked');
    });

    expect(mocks.adapter.sendMessage).not.toHaveBeenCalled();

    secondClear.resolve();
    await act(async () => { await secondPromise; });
  });

  it('tracks pending clears independently across session switches', async () => {
    const clearA = deferred<void>();
    const clearB = deferred<void>();
    mocks.adapter.clearHistory
      .mockReturnValueOnce(clearA.promise)
      .mockReturnValueOnce(clearB.promise);
    mocks.adapter.sendMessage.mockImplementation(async function* () {
      yield { type: 'done', data: { content: 'accepted' } };
    });

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    await act(async () => { await Promise.resolve(); });

    let clearAPromise: Promise<void> | undefined;
    await act(async () => {
      clearAPromise = hook.result.current.clearHistory();
      await flush();
    });
    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await flush();
    });
    await act(async () => { await hook.result.current.sendMessage('allowed in B'); });

    let clearBPromise: Promise<void> | undefined;
    await act(async () => {
      clearBPromise = hook.result.current.clearHistory();
      await flush();
    });
    clearB.resolve();
    await act(async () => { await clearBPromise; });
    await act(async () => {
      hook.rerender({ activeSession: 'sess-a' });
      await flush();
    });

    let acceptedInA = true;
    await act(async () => {
      acceptedInA = await hook.result.current.sendMessage('must wait in A');
    });

    expect(acceptedInA).toBe(false);
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    clearA.resolve();
    await act(async () => { await clearAPromise; });
  });

  it.each(['done', 'error', 'throw'] as const)(
    'invalidates a pending approval when the stream terminates via %s',
    async (terminal) => {
      mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
        yield {
          type: 'approval_required',
          data: { requestId: `approval-${terminal}`, toolName: 'read_file', sourceWorkspaceId: 'ws-1' },
        };
        if (terminal === 'done') {
          yield { type: 'done', data: { content: 'completed' } };
        } else if (terminal === 'error') {
          yield { type: 'error', data: { message: 'failed' } };
        } else {
          throw new Error('transport failed');
        }
      });

      const { result } = await mountChat(`sess-approval-${terminal}`);
      await act(async () => { await result.current.sendMessage('question'); });

      expect(result.current.pendingApproval).toBeNull();
    },
  );

  it('keeps the approval actionable when submitting the decision fails', async () => {
    const streamGate = deferred<void>();
    mocks.adapter.respondApproval.mockRejectedValueOnce(new Error('offline'));
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield {
        type: 'approval_required',
        data: { requestId: 'approval-retry', toolName: 'write_file', sourceWorkspaceId: 'ws-1' },
      };
      await streamGate.promise;
    });

    const { result } = await mountChat('sess-approval-retry');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });

    await act(async () => {
      await result.current.approveAction('approval-retry', true);
    });
    const pendingAfterFailure = result.current.pendingApproval?.requestId;

    await act(async () => {
      result.current.stopStreaming();
      streamGate.resolve();
      await sendPromise;
    });

    expect(pendingAfterFailure).toBe('approval-retry');
  });

  it('does not let an older approval response clear a newer approval gate', async () => {
    const submitGate = deferred<void>();
    const secondApprovalGate = deferred<void>();
    const streamGate = deferred<void>();
    mocks.adapter.respondApproval.mockReturnValueOnce(submitGate.promise);
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield {
        type: 'approval_required',
        data: { requestId: 'approval-a', toolName: 'read_file', sourceWorkspaceId: 'ws-1' },
      };
      await secondApprovalGate.promise;
      yield {
        type: 'approval_required',
        data: { requestId: 'approval-b', toolName: 'write_file', sourceWorkspaceId: 'ws-1' },
      };
      await streamGate.promise;
    });

    const { result } = await mountChat('sess-approval-order');
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });

    let approvalPromise: Promise<void> | undefined;
    await act(async () => {
      approvalPromise = result.current.approveAction('approval-a', true);
      await Promise.resolve();
    });
    await act(async () => {
      secondApprovalGate.resolve();
      await flush();
    });
    expect(result.current.pendingApproval?.requestId).toBe('approval-b');

    await act(async () => {
      submitGate.resolve();
      await approvalPromise;
    });
    const pendingAfterOlderResponse = result.current.pendingApproval?.requestId;

    await act(async () => {
      result.current.stopStreaming();
      streamGate.resolve();
      await sendPromise;
    });

    expect(pendingAfterOlderResponse).toBe('approval-b');
  });

  it('terminalizes running tool and step blocks on a stream error', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'step', data: { content: 'Inspecting workspace' } };
      yield { type: 'tool_start', data: { name: 'read_file', input: { path: 'README.md' } } };
      yield { type: 'error', data: { message: 'provider failed' } };
    });

    const { result } = await mountChat('sess-running-error');
    await act(async () => { await result.current.sendMessage('question'); });

    const assistant = result.current.messages.find(message => message.role === 'assistant');
    expect(
      assistant?.blocks?.some(block =>
        (block.type === 'step' || block.type === 'tool_use') && block.status === 'running'
      ),
    ).toBe(false);
  });

  it('aborts the stream, keeps the partial answer, flips isLoading off, and calls the server cancel', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'partial answer' } };
      await gate.promise;
      yield { type: 'done', data: {} };
    });

    const { result } = await mountChat();

    // Start the send; let the first token land, then leave the stream in-flight.
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = result.current.sendMessage('question');
      await flush();
    });
    expect(result.current.isLoading).toBe(true);
    const streaming = result.current.messages.find(m => m.role === 'assistant');
    expect(streaming?.content).toBe('');
    expect(streaming?.draft).toMatchObject({ content: 'partial answer', status: 'streaming' });

    // Stop.
    await act(async () => { result.current.stopStreaming(); await flush(); });

    // Composer returns to send (isLoading off) and the partial answer stays.
    expect(result.current.isLoading).toBe(false);
    const afterStop = result.current.messages.find(m => m.role === 'assistant');
    expect(afterStop?.content).toBe('');
    expect(afterStop?.draft).toMatchObject({ content: 'partial answer', status: 'stopped' });
    expect(
      readChatThreadCache(chatThreadCacheKey('ws-1', 'sess-1'))
        ?.some(message => message.role === 'assistant'),
    ).toBe(false);
    // The adapter targets only this exact workspace/session stream.
    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1', 'sess-1');

    // Send is re-enabled: a fresh send dispatches a new stream (not queued).
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'second' } };
    });
    await act(async () => { await result.current.sendMessage('again'); await flush(); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);

    gate.resolve(); // let the abandoned first generator settle
    await act(async () => { await firstPromise?.catch(() => {}); });
  });

  it('does not report a user-aborted stream as a backend outage', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'partial answer' } };
      await gate.promise;
    });
    mocks.adapter.abortAgent.mockImplementationOnce(async () => {
      gate.reject(new DOMException('The operation was aborted', 'AbortError'));
    });

    const { result } = await mountChat();
    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = result.current.sendMessage('question');
      await flush();
    });

    await act(async () => {
      result.current.stopStreaming();
      await sendPromise;
      await flush();
    });

    const assistant = result.current.messages.find(m => m.role === 'assistant');
    expect(assistant?.content).toBe('');
    expect(assistant?.draft).toMatchObject({ content: 'partial answer', status: 'stopped' });
    expect(assistant?.blocks?.some(block => block.type === 'error')).toBe(false);
  });

  it('preserves queued FIFO when a stopped stream is replaced and settles late', async () => {
    const firstGate = deferred<void>();
    const secondGate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'first partial' } };
        await firstGate.promise;
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'second partial' } };
        await secondGate.promise;
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'third' } };
      });

    const { result } = await mountChat();
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = result.current.sendMessage('first');
      await flush();
      await result.current.sendMessage('second');
      await flush();
    });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.stopStreaming();
      await flush();
    });
    expect(result.current.isLoading).toBe(true);
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);
    expect(mocks.adapter.sendMessage.mock.calls[1]?.[1]).toBe('second');

    await act(async () => { await result.current.sendMessage('third'); await flush(); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);

    firstGate.resolve();
    await act(async () => { await firstPromise; await flush(); });
    expect(result.current.isLoading).toBe(true);
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);

    secondGate.resolve();
    await act(async () => { await flush(); });
    await vi.waitFor(() => expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(3));
    expect(mocks.adapter.sendMessage.mock.calls[2]?.[1]).toBe('third');
  });

  it('stops the originating session after the hook switches to another session', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'session A partial' } };
      await gate.promise;
    });
    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );

    let sendPromise: Promise<boolean> | undefined;
    await act(async () => {
      sendPromise = hook.result.current.sendMessage('question');
      await flush();
    });
    await act(async () => { hook.rerender({ activeSession: 'sess-b' }); await flush(); });
    await act(async () => { hook.result.current.stopStreaming(); await flush(); });

    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1', 'sess-a');
    gate.resolve();
    await act(async () => { await sendPromise; });
  });

  it('aborts an approval-paused turn when switching sessions so the destination can send immediately', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield {
          type: 'approval_required',
          data: { requestId: 'approval-a', toolName: 'write_file', sourceWorkspaceId: 'ws-1' },
        };
        await gate.promise;
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'session B answer' } };
      });

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: activeSession,
      }),
      { initialProps: { activeSession: 'sess-a' } },
    );
    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = hook.result.current.sendMessage('session A question');
      await flush();
    });
    expect(hook.result.current.pendingApproval?.requestId).toBe('approval-a');

    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await flush();
    });
    const loadingAfterSwitch = hook.result.current.isLoading;
    await act(async () => { await hook.result.current.sendMessage('session B question'); });
    const callsBeforeOldTurnSettles = mocks.adapter.sendMessage.mock.calls.length;

    gate.resolve();
    await act(async () => { await firstPromise; });

    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1', 'sess-a');
    expect(loadingAfterSwitch).toBe(false);
    expect(callsBeforeOldTurnSettles).toBe(2);
    expect(hook.result.current.messages.some(message => message.content === 'session B answer')).toBe(true);
  });

  it('never flushes a queued turn into a newly rendered session before passive cancellation', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'session A partial' } };
        await gate.promise;
        yield { type: 'done', data: { content: 'session A answer' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'must not run in session B' } };
      });

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ activeSession }: { activeSession: string }) => {
        useLayoutEffect(() => {
          if (activeSession === 'sess-b') gate.resolve();
        }, [activeSession]);
        return useChat({ workspaceId: 'ws-1', sessionId: activeSession });
      },
      { initialProps: { activeSession: 'sess-a' } },
    );

    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = hook.result.current.sendMessage('session A first');
      await flush();
      await hook.result.current.sendMessage('session A queued');
    });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);

    await act(async () => {
      hook.rerender({ activeSession: 'sess-b' });
      await flush();
    });
    await act(async () => { await firstPromise; });

    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(
      hook.result.current.messages.some(message => message.content === 'must not run in session B'),
    ).toBe(false);
  });

  it('is a no-op when nothing is streaming', async () => {
    const { result } = await mountChat('sess-idle');
    await act(async () => { result.current.stopStreaming(); await flush(); });
    expect(mocks.adapter.abortAgent).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useChat — immutable per-turn model selection', () => {
  it('snapshots queued models and records the model resolved by the server', async () => {
    const firstGate = deferred<void>();
    mocks.adapter.sendMessage
      .mockImplementationOnce(async function* () {
        yield { type: 'token', data: { content: 'first' } };
        await firstGate.promise;
        yield { type: 'done', data: { model: 'openai/resolved-a' } };
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'done', data: { content: 'second', model: 'anthropic/resolved-b' } };
      });

    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(
      ({ model }: { model: string }) => useChat({
        workspaceId: 'ws-1',
        sessionId: 'sess-1',
        model,
      }),
      { initialProps: { model: 'openai/request-a' } },
    );
    await act(async () => { await Promise.resolve(); });

    let firstPromise: Promise<boolean> | undefined;
    await act(async () => {
      firstPromise = hook.result.current.sendMessage('first question');
      await flush();
    });
    await act(async () => { hook.rerender({ model: 'anthropic/request-b' }); });
    await act(async () => {
      await hook.result.current.sendMessage('second question');
      await flush();
    });

    expect(mocks.adapter.sendMessage.mock.calls[0]?.[6]).toBe('openai/request-a');
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(1);
    expect(hook.result.current.messages.find(message => message.role === 'assistant')?.model).toBeUndefined();

    firstGate.resolve();
    await act(async () => { await firstPromise; await flush(); });
    await vi.waitFor(() => expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2));
    expect(mocks.adapter.sendMessage.mock.calls[1]?.[6]).toBe('anthropic/request-b');

    await vi.waitFor(() => {
      const assistants = hook.result.current.messages.filter(message => message.role === 'assistant');
      expect(assistants.map(message => message.model)).toEqual([
        'openai/resolved-a',
        'anthropic/resolved-b',
      ]);
    });
  });
});

// ── ChatApp streaming interaction surface (contracts 1 + 2, the UI side) ────

describe('ChatApp — streaming interaction contract', () => {
  const noop = () => {};
  const baseProps = {
    messages: [] as ChatMessage[],
    isLoading: false,
    onSendMessage: noop,
    onClearHistory: noop,
    pendingApproval: null,
    onApprove: noop,
    workspaceId: 'ws-1',
    activeSessionId: null as string | null,
    onStopStreaming: noop as () => void,
  };

  let ChatAppEl: typeof import('@/components/os/apps/ChatApp').default;
  beforeEach(async () => { ChatAppEl = (await import('@/components/os/apps/ChatApp')).default; });

  // Render, then settle ChatApp's async mount effect (getPins → setPins) so its
  // resolution doesn't land outside act after the test body.
  const renderChat = async (props: Partial<typeof baseProps> & { messages: ChatMessage[] }) => {
    const utils = render(<TooltipProvider><ChatAppEl {...baseProps} {...props} /></TooltipProvider>);
    await act(async () => { await flush(); });
    return utils;
  };

  const a1: ChatMessage = { id: 'a1', role: 'assistant', content: 'first line.', timestamp: 'now' };
  const a2: ChatMessage = { id: 'a2', role: 'assistant', content: 'second line.', timestamp: 'now' };

  /** Give a jsdom element measurable, mutable scroll geometry. */
  function mockScrollGeometry(el: HTMLElement, opts: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
    let top = opts.scrollTop;
    Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => opts.scrollHeight });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => opts.clientHeight });
    Object.defineProperty(el, 'scrollTop', { configurable: true, get: () => top, set: (v: number) => { top = v; } });
    return { getTop: () => top };
  }

  it('renders a draft visibly while keeping canonical message actions disabled', async () => {
    const draftMessage: ChatMessage = {
      id: 'draft-1',
      role: 'assistant',
      content: '',
      timestamp: 'now',
      draft: {
        turnId: 'turn-1',
        revision: 2,
        content: 'Visible provisional answer',
        status: 'stopped',
      },
    };
    await renderChat({ messages: [draftMessage], isLoading: false });

    expect(screen.getByText('Visible provisional answer')).toBeInTheDocument();
    expect(screen.getByTestId('chat-draft-status')).toHaveTextContent('Stopped draft · not saved');
    expect(screen.queryByLabelText('Pin message')).toBeNull();
  });

  it('renders capability markers in drafts inertly without exposing install actions', async () => {
    const marker = '<!--waggle:capability_request {"name":"unsafe","source":"marketplace","kind":"marketplace"}-->';
    const draftMessage: ChatMessage = {
      id: 'draft-capability',
      role: 'assistant',
      content: '',
      timestamp: 'now',
      draft: {
        turnId: 'turn-capability',
        revision: 1,
        content: marker,
        status: 'stopped',
      },
    };
    await renderChat({ messages: [draftMessage], isLoading: false });

    expect(screen.queryByTestId('capability-request-install')).toBeNull();
    expect(screen.getByText(marker)).toBeInTheDocument();
  });

  it('submits feedback using the persisted index when a stopped draft remains visible', async () => {
    const messages: ChatMessage[] = [
      { id: 'u1', role: 'user', content: 'stopped question', timestamp: 'now' },
      {
        id: 'draft-1',
        role: 'assistant',
        content: '',
        timestamp: 'now',
        draft: {
          turnId: 'turn-stopped',
          revision: 1,
          content: 'stopped partial',
          status: 'stopped',
        },
      },
      { id: 'u2', role: 'user', content: 'completed question', timestamp: 'now' },
      { id: 'a2', role: 'assistant', content: 'completed answer', timestamp: 'now' },
    ];
    await renderChat({ messages, activeSessionId: 'sess-feedback' });

    fireEvent.click(screen.getByRole('button', { name: 'Good response' }));

    expect(mocks.adapter.submitFeedback).toHaveBeenCalledWith({
      sessionId: 'sess-feedback',
      messageIndex: 2,
      rating: 'up',
      reason: undefined,
    });
  });

  it('auto-follow pins the viewport to the newest content while streaming', async () => {
    const { rerender } = await renderChat({ messages: [a1], isLoading: true });
    const scrollEl = screen.getByTestId('chat-scroll');
    // Real geometry: a tall thread whose bottom is 1000px down.
    const geo = mockScrollGeometry(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 0 });
    // A new streamed turn arrives while following (default) → pin to bottom.
    await act(async () => {
      rerender(<TooltipProvider><ChatAppEl {...baseProps} messages={[a1, a2]} isLoading /></TooltipProvider>);
    });
    expect(geo.getTop()).toBe(1000);
    // No jump affordance while pinned.
    expect(screen.queryByTestId('chat-jump-to-latest')).toBeNull();
  });

  it('a user scroll-up breaks auto-follow and shows "Jump to latest"; clicking re-pins', async () => {
    await renderChat({ messages: [a1, a2], isLoading: true });
    const scrollEl = screen.getByTestId('chat-scroll');
    // Scrolled up: 600px from the bottom (well past the 48px window).
    const geo = mockScrollGeometry(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 100 });
    expect(screen.queryByTestId('chat-jump-to-latest')).toBeNull();

    fireEvent.scroll(scrollEl);
    // Auto-follow broke → the affordance appears.
    expect(screen.getByTestId('chat-jump-to-latest')).toBeInTheDocument();

    // Clicking snaps to the newest content and re-pins (affordance hides).
    fireEvent.click(screen.getByTestId('chat-jump-to-latest'));
    expect(geo.getTop()).toBe(1000);
    expect(screen.queryByTestId('chat-jump-to-latest')).toBeNull();
  });

  it('re-pins automatically when the user scrolls back to the bottom', async () => {
    await renderChat({ messages: [a1, a2], isLoading: true });
    const scrollEl = screen.getByTestId('chat-scroll');
    mockScrollGeometry(scrollEl, { scrollHeight: 1000, clientHeight: 300, scrollTop: 100 });
    fireEvent.scroll(scrollEl);
    expect(screen.getByTestId('chat-jump-to-latest')).toBeInTheDocument();
    // User scrolls back near the bottom (within the 48px window; routed through
    // the mocked scrollTop setter). distance = 1000 - 700 - 300 = 0.
    scrollEl.scrollTop = 700;
    fireEvent.scroll(scrollEl);
    expect(screen.queryByTestId('chat-jump-to-latest')).toBeNull();
  });

  it('shows a Stop control while streaming that calls onStopStreaming, keeping Send available', async () => {
    const onStopStreaming = vi.fn();
    await renderChat({ messages: [a1], isLoading: true, onStopStreaming });
    const stop = screen.getByTestId('chat-stop-stream');
    expect(stop).toBeInTheDocument();
    // Lane C: Send is NOT replaced — it stays for queueing a follow-up.
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    fireEvent.click(stop);
    expect(onStopStreaming).toHaveBeenCalledTimes(1);
  });

  it('hides the Stop control when not streaming', async () => {
    const onStopStreaming = vi.fn();
    await renderChat({ messages: [a1], isLoading: false, onStopStreaming });
    expect(screen.queryByTestId('chat-stop-stream')).toBeNull();
  });
});
