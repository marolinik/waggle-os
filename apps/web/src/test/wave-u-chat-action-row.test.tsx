/**
 * Wave U Lane F — chat action-row presence + send pulse.
 *   fix 1: the message action row reads as a toolbar — rests at opacity-75 on a
 *          subtle --surface-2 pill with 16px icons (keeps the 150ms reveal +
 *          focus-within parity from Wave T).
 *   fix 2: the send button gets a one-shot, motion-safe scale pop on the
 *          empty→ready transition (fires once, never on mount / re-render).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

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

const render = (props: Partial<typeof baseProps> & { messages: ChatMessage[] }) =>
  rtlRender(
    <TooltipProvider>
      <ChatApp {...baseProps} {...props} />
    </TooltipProvider>,
  );

afterEach(() => cleanup());

describe('Wave U Lane F fix 1 — message action row presence', () => {
  it('rests at opacity-75 on a --surface-2 toolbar pill (keeps the reveal + focus-within parity)', () => {
    render({ messages: [assistantMsg] });
    const row = screen.getByTestId('chat-action-row');
    expect(row.className).toContain('opacity-75');
    expect(row.className).toContain('bg-[var(--surface-2)]');
    expect(row.className).toContain('rounded-full');
    // The Wave T reveal + keyboard parity survive unchanged.
    expect(row.className).toContain('group-hover/turn:opacity-100');
    expect(row.className).toContain('group-focus-within/turn:opacity-100');
    expect(row.className).toContain('duration-150');
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
