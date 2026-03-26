// @vitest-environment jsdom
/**
 * ChatMessage rendering tests — verify basic rendering without crashing
 * and that key elements are present in the DOM.
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../../../src/components/chat/ChatMessage.js';
import type { Message } from '../../../src/services/types.js';

// ── Mocks ─────────────────────────────────────────────────────────────

// Mock DOMPurify — jsdom doesn't have full DOM sanitization support
vi.mock('dompurify', () => ({
  default: { sanitize: (html: string) => html },
}));

// Mock marked — return simple HTML wrapping the input text
vi.mock('marked', () => ({
  marked: {
    parse: (text: string) => `<p>${text}</p>`,
    setOptions: () => {},
  },
  Renderer: class { code = () => ''; },
}));

// Mock clipboard API
beforeAll(() => {
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    role: 'user',
    content: 'Hello world',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('ChatMessage rendering', () => {
  it('renders user message with correct role styling', () => {
    const msg = makeMessage({ role: 'user', content: 'Test user message' });
    const { container } = render(<ChatMessage message={msg} />);

    // User messages have the chat-message--user class and right-aligned layout
    const messageEl = container.querySelector('.chat-message--user');
    expect(messageEl).not.toBeNull();
    expect(messageEl!.classList.contains('justify-end')).toBe(true);

    // Content should be rendered as plain text (not markdown)
    expect(screen.getByText('Test user message')).toBeTruthy();
  });

  it('renders agent message with markdown content', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: 'Agent response here',
    });
    const { container } = render(<ChatMessage message={msg} />);

    // Assistant messages have the chat-message--assistant class and left-aligned
    const messageEl = container.querySelector('.chat-message--assistant');
    expect(messageEl).not.toBeNull();
    expect(messageEl!.classList.contains('justify-start')).toBe(true);

    // Content is rendered via markdown processing (mocked to wrap in <p>)
    const contentEl = container.querySelector('.chat-message__content');
    expect(contentEl).not.toBeNull();
    expect(contentEl!.textContent).toContain('Agent response here');
  });

  it('shows copy button on agent messages', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: 'Copy me',
    });
    const { container } = render(<ChatMessage message={msg} />);

    const copyBtn = container.querySelector('.chat-message__copy');
    expect(copyBtn).not.toBeNull();
    expect(copyBtn!.textContent).toContain('Copy');
  });

  it('does not show copy button on user messages', () => {
    const msg = makeMessage({ role: 'user', content: 'User text' });
    const { container } = render(<ChatMessage message={msg} />);

    const copyBtn = container.querySelector('.chat-message__copy');
    expect(copyBtn).toBeNull();
  });

  it('displays tool status indicator when tools are present', () => {
    const msg = makeMessage({
      role: 'assistant',
      content: 'I used tools',
      toolUse: [
        {
          name: 'read_file',
          input: { path: '/test.ts' },
          result: 'file contents',
          requiresApproval: false,
          status: 'done',
        },
      ],
    });
    const { container } = render(<ChatMessage message={msg} />);

    // The trail toggle should show tool count
    const trailToggle = container.querySelector('.chat-message__trail-toggle');
    expect(trailToggle).not.toBeNull();
    expect(trailToggle!.textContent).toContain('1 tool');
  });
});
