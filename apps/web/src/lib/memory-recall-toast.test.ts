import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  chatThreadCacheKey,
  clearChatThreadCache,
  readChatThreadCache,
} from '@/hooks/chat-thread-cache';
import type { ChatMessage } from './types';
import {
  createMemoryRecallNotice,
  findNewestMemoryRecallNotice,
  normalizeMemoryContextReceipt,
  stripLiveMemoryReceipts,
} from './memory-recall-toast';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  adapter: {
    getHistory: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    abortAgent: vi.fn().mockResolvedValue(undefined),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    respondApproval: vi.fn().mockResolvedValue(undefined),
    getPins: vi.fn().mockResolvedValue([]),
    searchMemory: vi.fn().mockResolvedValue([]),
    submitFeedback: vi.fn(),
    ingestFile: vi.fn(),
    addPin: vi.fn(),
    removePin: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

beforeEach(() => {
  vi.clearAllMocks();
  clearChatThreadCache();
  mocks.adapter.getHistory.mockResolvedValue([]);
  mocks.adapter.abortAgent.mockResolvedValue(undefined);
  mocks.adapter.clearHistory.mockResolvedValue(undefined);
  mocks.adapter.respondApproval.mockResolvedValue(undefined);
  mocks.adapter.getPins.mockResolvedValue([]);
  mocks.adapter.searchMemory.mockResolvedValue([]);
});

afterEach(() => cleanup());

describe('normalizeMemoryContextReceipt', () => {
  it('accepts only a positive terminal receipt tied to the current assistant turn', () => {
    expect(normalizeMemoryContextReceipt(
      { included: true, count: 2 },
      'assistant-42',
    )).toEqual({ included: true, count: 2, live: true, receiptId: 'assistant-42' });
  });

  it.each([
    undefined,
    null,
    {},
    { included: false, count: 2 },
    { included: true, count: 0 },
    { included: true, count: -1 },
    { included: true, count: 1.5 },
    { included: true, count: Number.POSITIVE_INFINITY },
  ])('rejects skipped, empty, blocked, failed, or malformed receipts: %j', (receipt) => {
    expect(normalizeMemoryContextReceipt(receipt, 'assistant-42')).toBeUndefined();
  });

  it('rejects a receipt without a stable assistant id', () => {
    expect(normalizeMemoryContextReceipt({ included: true, count: 1 }, '')).toBeUndefined();
  });
});

describe('createMemoryRecallNotice', () => {
  it('creates singular and plural copy without exposing saved content', () => {
    expect(createMemoryRecallNotice(
      { included: true, count: 1, live: true, receiptId: 'one' },
      new Set(),
    )).toEqual({
      title: 'Memory brought forward',
      description: 'Used 1 relevant saved item for this reply.',
    });
    expect(createMemoryRecallNotice(
      { included: true, count: 3, live: true, receiptId: 'many' },
      new Set(),
    )).toEqual({
      title: 'Memory brought forward',
      description: 'Used 3 relevant saved items for this reply.',
    });
  });

  it('does not replay a receipt that was already announced', () => {
    expect(createMemoryRecallNotice(
      { included: true, count: 2, live: true, receiptId: 'seen' },
      new Set(['seen']),
    )).toBeNull();
  });

  it('cannot fabricate a memory moment from message count alone', () => {
    expect(createMemoryRecallNotice(
      { userMessageCount: 5 } as never,
      new Set(),
    )).toBeNull();
  });
});

describe('findNewestMemoryRecallNotice', () => {
  const accepted: ChatMessage = {
    id: 'assistant-accepted',
    role: 'assistant',
    content: 'Remembered answer',
    timestamp: '2026-08-30T20:00:00.000Z',
    memoryContext: { included: true, count: 2, live: true, receiptId: 'receipt-accepted' },
  };

  it('finds an accepted assistant receipt even when a queued user message trails it', () => {
    expect(findNewestMemoryRecallNotice([
      accepted,
      { id: 'queued-user', role: 'user', content: 'Next question', timestamp: 'now', queued: true },
    ], new Set())).toEqual({
      receipt: accepted.memoryContext,
      notice: {
        title: 'Memory brought forward',
        description: 'Used 2 relevant saved items for this reply.',
      },
    });
  });

  it('finds the latest real receipt behind a receipt-less assistant placeholder', () => {
    expect(findNewestMemoryRecallNotice([
      accepted,
      { id: 'assistant-placeholder', role: 'assistant', content: '', timestamp: 'now' },
    ], new Set())).toMatchObject({ receipt: { receiptId: 'receipt-accepted' } });
  });

  it('keeps a later accepted receipt eligible after an earlier receipt was seen', () => {
    const later: ChatMessage = {
      ...accepted,
      id: 'assistant-later',
      memoryContext: { included: true, count: 1, live: true, receiptId: 'receipt-later' },
    };
    expect(findNewestMemoryRecallNotice([accepted, later], new Set(['receipt-accepted'])))
      .toMatchObject({ receipt: { receiptId: 'receipt-later' } });
  });

  it('never replays an older receipt after the newest receipt was already seen', () => {
    const later: ChatMessage = {
      ...accepted,
      id: 'assistant-later',
      memoryContext: { included: true, count: 1, live: true, receiptId: 'receipt-later' },
    };
    expect(findNewestMemoryRecallNotice([accepted, later], new Set(['receipt-later']))).toBeNull();
    expect(findNewestMemoryRecallNotice([
      accepted,
      later,
      { id: 'queued-user', role: 'user', content: 'Next', timestamp: 'now', queued: true },
      { id: 'assistant-placeholder', role: 'assistant', content: '', timestamp: 'now' },
    ], new Set(['receipt-later']))).toBeNull();

    const malformedLater: ChatMessage = {
      ...later,
      memoryContext: { included: true, count: 0, live: true, receiptId: 'receipt-malformed' },
    };
    expect(findNewestMemoryRecallNotice([accepted, malformedLater], new Set())).toBeNull();
  });
});

describe('stripLiveMemoryReceipts', () => {
  it('keeps the settled conversation but removes the ephemeral live notice proof', () => {
    const messages = [{
      id: 'assistant-42',
      role: 'assistant' as const,
      content: 'A remembered answer',
      timestamp: '2026-08-30T20:00:00.000Z',
      memoryContext: { included: true as const, count: 2, live: true as const, receiptId: 'receipt-42' },
    }];

    expect(stripLiveMemoryReceipts(messages)).toEqual([{
      id: 'assistant-42',
      role: 'assistant',
      content: 'A remembered answer',
      timestamp: '2026-08-30T20:00:00.000Z',
    }]);
    expect(messages[0].memoryContext?.receiptId).toBe('receipt-42');
  });
});

describe('live memory receipt integration', () => {
  it('attaches an accepted done receipt but never stores it in the settled thread cache', async () => {
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield {
        type: 'done',
        data: { content: 'Canonical answer', memoryContext: { included: true, count: 2 } },
      };
    });
    const { useChat } = await import('@/hooks/useChat');
    const hook = renderHook(() => useChat({ workspaceId: 'ws-memory', sessionId: 'session-memory' }));
    await act(async () => { await flush(); });
    await act(async () => { await hook.result.current.sendMessage('What did we decide?'); });

    const assistant = hook.result.current.messages.find(message => message.role === 'assistant');
    expect(assistant?.memoryContext).toMatchObject({ included: true, count: 2, live: true });
    expect(assistant?.memoryContext?.receiptId).toContain('ws-memory\u0000session-memory\u0000');

    const cacheKey = chatThreadCacheKey('ws-memory', 'session-memory');
    await vi.waitFor(() => expect(readChatThreadCache(cacheKey)?.length).toBe(2));
    expect(readChatThreadCache(cacheKey)?.every(message => message.memoryContext === undefined)).toBe(true);
  });

  it('shows only real live receipts once, including behind a queued user, without a second memory search', async () => {
    const ChatApp = (await import('@/components/os/apps/ChatApp')).default;
    const noop = () => {};
    const fiveUsers: ChatMessage[] = Array.from({ length: 5 }, (_, index) => ({
      id: `user-${index}`,
      role: 'user',
      content: `Question ${index}`,
      timestamp: 'now',
    }));
    const baseProps = {
      messages: fiveUsers,
      isLoading: false,
      onSendMessage: noop,
      onClearHistory: noop,
      pendingApproval: null,
      onApprove: noop,
      workspaceId: 'ws-memory',
      activeSessionId: 'session-memory',
    };
    const chatTree = (messages: ChatMessage[]) => createElement(
      TooltipProvider,
      null,
      createElement(ChatApp, { ...baseProps, messages }),
    );
    const view = render(chatTree(fiveUsers));
    await act(async () => { await flush(); });

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(mocks.adapter.searchMemory).not.toHaveBeenCalled();

    const firstReceipt: ChatMessage = {
      id: 'assistant-first',
      role: 'assistant',
      content: 'First remembered answer',
      timestamp: 'now',
      memoryContext: { included: true, count: 2, live: true, receiptId: 'receipt-first' },
    };
    const queuedUser: ChatMessage = {
      id: 'queued-user',
      role: 'user',
      content: 'Already queued',
      timestamp: 'now',
      queued: true,
    };
    view.rerender(chatTree([...fiveUsers, firstReceipt, queuedUser]));
    expect(mocks.toast).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenLastCalledWith({
      title: 'Memory brought forward',
      description: 'Used 2 relevant saved items for this reply.',
    });

    view.rerender(chatTree([...fiveUsers, firstReceipt, queuedUser]));
    expect(mocks.toast).toHaveBeenCalledTimes(1);

    const laterReceipt: ChatMessage = {
      ...firstReceipt,
      id: 'assistant-later',
      memoryContext: { included: true, count: 1, live: true, receiptId: 'receipt-later' },
    };
    view.rerender(chatTree([...fiveUsers, firstReceipt, queuedUser, laterReceipt]));
    expect(mocks.toast).toHaveBeenCalledTimes(2);
    expect(mocks.adapter.searchMemory).not.toHaveBeenCalled();
  });
});
