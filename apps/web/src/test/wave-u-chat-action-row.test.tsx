/**
 * Wave U Lane F — chat action-row presence + send pulse.
 *   fix 1: the message action row reads as a toolbar — rests at opacity-75 on a
 *          subtle --surface-2 pill with 16px icons (keeps the 150ms reveal +
 *          focus-within parity from Wave T).
 *   fix 2: the send button gets a one-shot, motion-safe scale pop on the
 *          empty→ready transition (fires once, never on mount / re-render).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, cleanup, within, act } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ComponentProps } from 'react';

// jsdom lacks ResizeObserver (ChatApp's agent strip observes its own width).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;

const mocks = vi.hoisted(() => ({
  adapter: {
    getPins: vi.fn().mockResolvedValue([]),
    searchMemory: vi.fn().mockResolvedValue([]),
    submitFeedback: vi.fn(),
    ingestFile: vi.fn(),
    addPin: vi.fn(),
    removePin: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: {} }));

import ChatApp from '@/components/os/apps/ChatApp';
import type { ChatMessage } from '@/lib/types';

const noop = () => {};
const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
};
const baseProps = {
  messages: [] as ChatMessage[],
  isLoading: false,
  onSendMessage: noop,
  onClearHistory: noop,
  pendingApproval: null,
  onApprove: noop,
};

const assistantMsg: ChatMessage = {
  id: 'm1',
  role: 'assistant',
  content: 'Here is your answer.',
  timestamp: new Date().toISOString(),
};

type ChatAppRenderProps = Partial<ComponentProps<typeof ChatApp>> & { messages: ChatMessage[] };

const render = (props: ChatAppRenderProps) =>
  rtlRender(
    <TooltipProvider>
      <ChatApp {...baseProps} {...props} />
    </TooltipProvider>,
  );

afterEach(() => cleanup());

describe('Wave U Lane F fix 1 — message action row presence', () => {
  it('keeps New session accessible before async session history loads', async () => {
    const onNewSession = vi.fn().mockResolvedValue(undefined);

    render({
      messages: [],
      sessions: [],
      onNewSession,
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'New session' }));
      await Promise.resolve();
    });
    expect(onNewSession).toHaveBeenCalledOnce();
  });

  it('opens chat history when sessions arrive after the first render', () => {
    const onNewSession = vi.fn();
    const view = render({ messages: [], sessions: [], onNewSession });
    expect(screen.queryByRole('button', { name: /chat history/i })).toBeNull();

    view.rerender(
      <TooltipProvider>
        <ChatApp
          {...baseProps}
          messages={[]}
          sessions={[{ id: 's1', title: 'Loaded later', messageCount: 1 }]}
          activeSessionId="s1"
          onNewSession={onNewSession}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Hide chat history' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('chat-session-sidebar').className).toContain('w-32');
    expect(screen.getByRole('button', { name: /loaded later/i })).toBeVisible();
  });

  it('keeps an explicit collapse when another session arrives later', () => {
    const onNewSession = vi.fn();
    const firstSession = { id: 's1', title: 'Existing session', messageCount: 1 };
    const view = render({
      messages: [],
      sessions: [firstSession],
      activeSessionId: 's1',
      onNewSession,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat history' }));

    view.rerender(
      <TooltipProvider>
        <ChatApp
          {...baseProps}
          messages={[]}
          sessions={[firstSession, { id: 's2', title: 'Arrived later', messageCount: 0 }]}
          activeSessionId="s1"
          onNewSession={onNewSession}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'Show chat history' })).toHaveAttribute('aria-expanded', 'false');
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar.className).toContain('w-0');
    expect(sidebar.querySelector('button')).toBeNull();
  });

  it('keeps history private after collapse, an empty refresh, and later recovery', () => {
    const onNewSession = vi.fn();
    const firstSession = { id: 's1', title: 'Private plan', messageCount: 1 };
    const view = render({
      messages: [],
      sessions: [firstSession],
      activeSessionId: 's1',
      onNewSession,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Hide chat history' }));

    view.rerender(
      <TooltipProvider>
        <ChatApp {...baseProps} messages={[]} sessions={[]} onNewSession={onNewSession} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: /chat history/i })).toBeNull();
    expect(screen.queryByTestId('chat-session-sidebar')).toBeNull();

    view.rerender(
      <TooltipProvider>
        <ChatApp
          {...baseProps}
          messages={[]}
          sessions={[{ id: 's2', title: 'Recovered private plan', messageCount: 1 }]}
          activeSessionId="s2"
          onNewSession={onNewSession}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('button', { name: 'Show chat history' })).toHaveAttribute('aria-expanded', 'false');
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar.querySelector('button')).toBeNull();
    expect(screen.queryByText('Recovered private plan')).toBeNull();
  });

  it('opens session history when New session is requested from collapsed controls', async () => {
    const onNewSession = vi.fn().mockResolvedValue(undefined);

    render({
      messages: [],
      sessions: [{ id: 's1', title: 'Existing session', messageCount: 1 }],
      activeSessionId: 's1',
      onNewSession,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide chat history' }));
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar.className).toContain('w-0');

    const newSessionButtons = screen.getAllByRole('button', { name: /new session/i });
    await act(async () => {
      fireEvent.click(newSessionButtons[newSessionButtons.length - 1]);
      await Promise.resolve();
    });

    expect(onNewSession).toHaveBeenCalledOnce();
    expect(sidebar.className).toContain('w-32');
  });

  it('removes hidden session controls from the tab order when history is collapsed', () => {
    render({
      messages: [],
      sessions: [{ id: 's1', title: 'Existing session', messageCount: 1 }],
      activeSessionId: 's1',
      onNewSession: vi.fn(),
    });

    fireEvent.click(screen.getByRole('button', { name: 'Hide chat history' }));
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');
    expect(sidebar.querySelector('button')).toBeNull();
  });

  it('shows New session as a labelled desktop action with a usable target', () => {
    render({ messages: [], sessions: [], onNewSession: vi.fn() });
    const strip = screen.getByTestId('chat-agent-strip');
    const button = within(strip).getByRole('button', { name: 'New session' });

    expect(button).toHaveTextContent('New session');
    expect(button.className).toMatch(/\bh-8\b/);
  });

  it('stops one active response before one New session and keeps session switches locked', async () => {
    const stopGate = deferred();
    const onStopStreaming = vi.fn(() => stopGate.promise);
    const onNewSession = vi.fn().mockResolvedValue(undefined);
    const onSelectSession = vi.fn();
    const onSendMessage = vi.fn();

    render({
      messages: [assistantMsg],
      isLoading: true,
      initialMessage: 'Do not send into the old session',
      onSendMessage,
      sessions: [
        { id: 's1', title: 'Active session', messageCount: 1 },
        { id: 's2', title: 'Second session', messageCount: 2 },
      ],
      activeSessionId: 's1',
      onStopStreaming,
      onNewSession,
      onSelectSession,
    });

    const newSessionButtons = screen.getAllByRole('button', { name: /new session/i });
    const activeSessionButton = screen.getByRole('button', { name: /active session/i });
    const secondSessionButton = screen.getByRole('button', { name: /second session/i });
    expect(newSessionButtons.every(button => !(button as HTMLButtonElement).disabled)).toBe(true);
    const explanationVisibleBefore = Boolean(
      screen.queryByText(/new session stops the current response/i),
    );
    fireEvent.click(newSessionButtons[0]);
    fireEvent.click(newSessionButtons[newSessionButtons.length - 1]);
    fireEvent.click(activeSessionButton);
    fireEvent.click(secondSessionButton);
    const sendButton = screen.getByRole('button', { name: 'Send' });
    fireEvent.click(sendButton);

    expect({
      stopCalls: onStopStreaming.mock.calls.length,
      newSessionCallsBeforeStop: onNewSession.mock.calls.length,
      transitionLocked: newSessionButtons.every(button => (button as HTMLButtonElement).disabled),
      composerLocked: (sendButton as HTMLButtonElement).disabled,
      sendCalls: onSendMessage.mock.calls.length,
      activeSessionDisabled: (activeSessionButton as HTMLButtonElement).disabled,
      sessionSwitchDisabled: (secondSessionButton as HTMLButtonElement).disabled,
      selectSessionCalls: onSelectSession.mock.calls.length,
      explanationVisibleBefore,
      transitionStatusVisible: Boolean(screen.queryByText(/starting a new session/i)),
    }).toEqual({
      stopCalls: 1,
      newSessionCallsBeforeStop: 0,
      transitionLocked: true,
      composerLocked: true,
      sendCalls: 0,
      activeSessionDisabled: true,
      sessionSwitchDisabled: true,
      selectSessionCalls: 0,
      explanationVisibleBefore: true,
      transitionStatusVisible: true,
    });

    await act(async () => {
      stopGate.resolve();
      await stopGate.promise;
      await Promise.resolve();
    });
    expect(onNewSession).toHaveBeenCalledTimes(1);
  });

  it('releases the New session transition after cancellation fails so an explicit retry works', async () => {
    const releaseStoppedSession = vi.fn();
    const onStopStreaming = vi.fn()
      .mockRejectedValueOnce(new Error('cancel failed'))
      .mockResolvedValueOnce(releaseStoppedSession);
    const onNewSession = vi.fn().mockResolvedValue(undefined);

    render({
      messages: [assistantMsg],
      isLoading: true,
      sessions: [{ id: 's1', title: 'Active session', messageCount: 1 }],
      activeSessionId: 's1',
      onStopStreaming,
      onNewSession,
    });

    const newSession = () => screen.getAllByRole('button', { name: /new session/i }).at(-1)!;
    fireEvent.click(newSession());
    await act(async () => { await Promise.resolve(); });
    expect(onNewSession).not.toHaveBeenCalled();

    fireEvent.click(newSession());
    await act(async () => { await Promise.resolve(); });
    expect(onStopStreaming).toHaveBeenCalledTimes(2);
    expect(onNewSession).toHaveBeenCalledTimes(1);
    expect(releaseStoppedSession).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale session error with truthful transition status while retrying', async () => {
    const createGate = deferred();
    const onNewSession = vi.fn(() => createGate.promise);

    render({
      messages: [],
      sessions: [{ id: 's1', title: 'Active session', messageCount: 1 }],
      activeSessionId: 's1',
      sessionError: 'Previous create failed',
      onNewSession,
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Previous create failed');

    fireEvent.click(screen.getAllByRole('button', { name: /new session/i }).at(-1)!);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Starting a new session');

    await act(async () => {
      createGate.resolve();
      await createGate.promise;
      await Promise.resolve();
    });
  });

  it('disables New session and shows clear status while session creation is pending', () => {
    const onNewSession = vi.fn();

    render({
      messages: [],
      sessions: [],
      sessionCreating: true,
      onNewSession,
    });

    const newSessionButton = screen.getByRole('button', { name: /new session/i });
    fireEvent.click(newSessionButton);
    const creatingStatus = screen.queryByRole('status');

    expect({
      disabled: (newSessionButton as HTMLButtonElement).disabled,
      newSessionCalls: onNewSession.mock.calls.length,
      statusVisible: /creating.*session/i.test(creatingStatus?.textContent ?? ''),
    }).toEqual({
      disabled: true,
      newSessionCalls: 0,
      statusVisible: true,
    });
  });

  it('renders session failures as a visible alert even when there are no sessions', () => {
    render({
      messages: [],
      sessions: [],
      sessionError: 'Could not load sessions',
    });

    const alert = screen.queryByRole('alert');
    expect({
      alertVisible: Boolean(alert),
      messageVisible: alert?.textContent?.includes('Could not load sessions') ?? false,
    }).toEqual({
      alertVisible: true,
      messageVisible: true,
    });
  });

  it('offers an explicit session-list retry from the visible error state', () => {
    const onRetrySessions = vi.fn().mockResolvedValue(true);
    render({
      messages: [],
      sessions: [],
      sessionError: 'Could not load sessions',
      sessionListFailed: true,
      onRetrySessions,
    });

    const retry = screen.getByRole('button', { name: 'Retry loading sessions' });
    fireEvent.click(retry);

    expect(onRetrySessions).toHaveBeenCalledOnce();
    expect(retry).toHaveClass('h-8');
  });

  it('does not offer a list retry for a session mutation failure', () => {
    render({
      messages: [],
      sessions: [{ id: 's1', title: 'Existing session', messageCount: 1 }],
      activeSessionId: 's1',
      sessionError: 'Could not rename session',
      sessionListFailed: false,
      onRetrySessions: vi.fn(),
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Could not rename session');
    expect(screen.queryByRole('button', { name: 'Retry loading sessions' })).not.toBeInTheDocument();
  });

  it('keeps list Retry inert while loading and removes it after recovery', () => {
    const onRetrySessions = vi.fn().mockResolvedValue(true);
    const view = render({
      messages: [],
      sessions: [],
      sessionError: 'Could not load sessions',
      sessionListFailed: true,
      sessionLoading: true,
      onRetrySessions,
    });

    const pendingRetry = screen.getByRole('button', { name: 'Retry loading sessions' });
    expect(pendingRetry).toBeDisabled();
    fireEvent.click(pendingRetry);
    expect(onRetrySessions).not.toHaveBeenCalled();

    view.rerender(
      <TooltipProvider>
        <ChatApp
          {...baseProps}
          messages={[]}
          sessions={[]}
          sessionError="Could not load sessions"
          sessionListFailed
          sessionLoading={false}
          onRetrySessions={onRetrySessions}
        />
      </TooltipProvider>,
    );
    const readyRetry = screen.getByRole('button', { name: 'Retry loading sessions' });
    expect(readyRetry).toBeEnabled();
    fireEvent.click(readyRetry);
    expect(onRetrySessions).toHaveBeenCalledOnce();

    view.rerender(
      <TooltipProvider>
        <ChatApp {...baseProps} messages={[]} sessions={[]} onRetrySessions={onRetrySessions} />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('button', { name: 'Retry loading sessions' })).not.toBeInTheDocument();
  });

  it('keeps historical assistant attribution when the active persona changes', () => {
    render({
      messages: [{ ...assistantMsg, persona: 'researcher' }],
      currentPersona: 'coder',
    });

    expect(screen.getByText('· Researcher')).toBeInTheDocument();
    expect(screen.queryByText('· Coder')).not.toBeInTheDocument();
  });

  it('keeps historical model attribution when the active model changes', () => {
    render({
      messages: [{ ...assistantMsg, model: 'openai/historical-model' }],
      currentModel: 'anthropic/current-model',
    });

    expect(screen.getByText('· Historical Model')).toBeInTheDocument();
    expect(screen.queryByText('· Current Model')).not.toBeInTheDocument();
  });

  it('shows a truthful unavailable model catalog with an actionable retry and no stale option', () => {
    const onRetryModels = vi.fn();
    render({
      messages: [],
      currentModel: 'openai/stale-model',
      availableModels: [],
      modelCatalogStatus: 'unavailable',
      modelHealthStatus: 'unavailable',
      onRetryModels,
    });

    const trigger = screen.getByRole('button', { name: /stale model.*unavailable/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
    expect(trigger.querySelector('span[aria-hidden="true"]')).toHaveAttribute('data-tone', 'risk');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    const picker = screen.getByRole('region', { name: 'Available models' });
    expect(within(picker).getByRole('status')).toHaveTextContent(
      "Waggle couldn't refresh available models. Your saved selection is unchanged.",
    );
    expect(within(picker).queryByRole('button', { name: /stale model/i })).not.toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: 'Retry available models' }));
    expect(onRetryModels).toHaveBeenCalledOnce();
  });

  it('keeps a rejected selected model visibly unavailable when other catalog models are ready', () => {
    const onRetryModels = vi.fn();
    render({
      messages: [],
      currentModel: 'openai/stale-model',
      availableModels: ['openai/other-model'],
      modelCatalogStatus: 'ready',
      modelHealthStatus: 'unavailable',
      onRetryModels,
    });

    const trigger = screen.getByRole('button', { name: /stale model.*unavailable/i });
    expect(trigger.querySelector('span[aria-hidden="true"]')).toHaveAttribute('data-tone', 'risk');
    fireEvent.click(trigger);
    const picker = screen.getByRole('region', { name: 'Available models' });
    expect(within(picker).getByRole('status')).toHaveTextContent(
      "Your saved model isn't responding. Choose another model or retry.",
    );
    expect(within(picker).getByRole('button', { name: 'Other Model' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(within(picker).queryByRole('button', { name: /stale model/i })).not.toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: 'Retry selected model' }));
    expect(onRetryModels).toHaveBeenCalledOnce();
  });

  it('distinguishes an empty catalog from transport failure without promoting the saved model', () => {
    const onRetryModels = vi.fn();
    render({
      messages: [],
      currentModel: 'openai/saved-model',
      availableModels: [],
      modelCatalogStatus: 'empty',
      modelHealthStatus: 'ready',
      onRetryModels,
    });

    const trigger = screen.getByRole('button', { name: /saved model.*ready.*model list no models/i });
    expect(trigger.querySelector('span[aria-hidden="true"]')).toHaveAttribute('data-tone', 'healthy');
    fireEvent.click(trigger);
    const picker = screen.getByRole('region', { name: 'Available models' });
    expect(within(picker).getByRole('status')).toHaveTextContent(
      'No other models are available to switch to. Your verified model remains selected.',
    );
    expect(within(picker).getByRole('status')).not.toHaveTextContent('No models configured');
    expect(within(picker).queryByRole('button', { name: /saved model/i })).not.toBeInTheDocument();

    fireEvent.click(within(picker).getByRole('button', { name: 'Retry available models' }));
    expect(onRetryModels).toHaveBeenCalledOnce();
  });

  it('keeps the empty-state mascot intrinsically sized before image decode', () => {
    render({ messages: [] });
    const emptyState = screen.getByText("Pick a workspace and Waggle's ready").closest('div');
    const mascot = emptyState?.querySelector('img[aria-hidden="true"]');
    expect(mascot).toHaveAttribute('width', '56');
    expect(mascot).toHaveAttribute('height', '56');
  });

  it('scopes the chat history sidebar animation to width only', () => {
    render({
      messages: [assistantMsg],
      sessions: [{ id: 's1', title: 'Earlier research', messageCount: 3 }],
      activeSessionId: 's1',
      onSelectSession: noop,
      onNewSession: noop,
    });
    const sidebar = screen.getByTestId('chat-session-sidebar');
    expect(sidebar.className).not.toContain('transition-all');
    expect(sidebar.className).toContain('transition-[width]');
  });

  it('rests at opacity-75 on a --surface-2 toolbar pill (keeps the reveal + focus-within parity)', () => {
    render({ messages: [assistantMsg] });
    const row = screen.getByTestId('chat-action-row');
    expect(row.className).toContain('opacity-75');
    expect(row.className).toContain('bg-[var(--surface-2)]');
    expect(row.className).toContain('rounded-full');
    // The Wave T reveal + keyboard parity survive unchanged.
    expect(row.className).toContain('group-hover/turn:opacity-100');
    expect(row.className).toContain('group-focus-within/turn:opacity-100');
    // R3 motion sweep: the raw 150ms reveal now resolves to the --mo-fast token
    // (still 150ms) — the reveal timing is unchanged, only the source moved.
    expect(row.className).toContain('duration-mo-fast');
    expect(row.className).toContain('motion-reduce:translate-y-0');
  });

  it('renders the action icons at 16px (w-4 h-4)', () => {
    render({ messages: [assistantMsg] });
    const copyIcon = screen.getByTestId('chat-msg-copy').querySelector('svg');
    expect(copyIcon?.getAttribute('class')).toContain('w-4');
    expect(copyIcon?.getAttribute('class')).toContain('h-4');
  });
});

describe('Wave U Lane F fix 2 — send-button micro-pulse', () => {
  it('does not pulse at rest (empty composer)', () => {
    render({ messages: [assistantMsg] });
    const sendBtn = screen.getByRole('button', { name: 'Send' });
    expect(sendBtn.className).not.toContain('scale-110');
  });

  it('fires a motion-safe scale pop on the empty→ready transition', () => {
    render({ messages: [assistantMsg] });
    const sendBtn = screen.getByRole('button', { name: 'Send' });
    const textarea = screen.getByRole('textbox');

    fireEvent.change(textarea, { target: { value: 'Ship it' } });

    const tokens = sendBtn.className.split(/\s+/);
    // The pulse is gated behind motion-safe so reduced-motion users never scale.
    expect(tokens).toContain('motion-safe:scale-110');
    expect(tokens).not.toContain('scale-110');
    expect(sendBtn.className).toContain('transition-[color,background-color,transform]');
  });
});
