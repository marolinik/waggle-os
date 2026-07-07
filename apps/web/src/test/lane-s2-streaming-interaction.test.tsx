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
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ChatMessage } from '@/lib/types';

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

  it('aborts the stream, keeps the partial answer, flips isLoading off, and calls the server cancel', async () => {
    const gate = deferred<void>();
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'token', data: { content: 'partial answer' } };
      await gate.promise; // hold the stream open until (never) released
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
    expect(streaming?.content).toBe('partial answer');

    // Stop.
    await act(async () => { result.current.stopStreaming(); await flush(); });

    // Composer returns to send (isLoading off) and the partial answer stays.
    expect(result.current.isLoading).toBe(false);
    const afterStop = result.current.messages.find(m => m.role === 'assistant');
    expect(afterStop?.content).toBe('partial answer');
    // Best-effort server-side cancel fired for this workspace.
    expect(mocks.adapter.abortAgent).toHaveBeenCalledWith('ws-1');

    // Send is re-enabled: a fresh send dispatches a new stream (not queued).
    mocks.adapter.sendMessage.mockImplementationOnce(async function* () {
      yield { type: 'done', data: { content: 'second' } };
    });
    await act(async () => { await result.current.sendMessage('again'); await flush(); });
    expect(mocks.adapter.sendMessage).toHaveBeenCalledTimes(2);

    gate.resolve(); // let the abandoned first generator settle
    await act(async () => { await firstPromise?.catch(() => {}); });
  });

  it('is a no-op when nothing is streaming', async () => {
    const { result } = await mountChat('sess-idle');
    await act(async () => { result.current.stopStreaming(); await flush(); });
    expect(mocks.adapter.abortAgent).not.toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
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
