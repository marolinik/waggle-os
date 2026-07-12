import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/adapter', () => ({
  adapter: {
    getServerUrl: () => 'http://localhost:7317',
  },
}));

import TelegramDigestCard from './TelegramDigestCard';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    JSON.stringify({ configured: false, hasToken: false, hasChatId: false }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('TelegramDigestCard', () => {
  it('a11y: credential controls expose labels and stable form metadata', async () => {
    render(<TelegramDigestCard />);

    await screen.findByTestId('telegram-status-badge');

    const token = screen.getByLabelText(/bot token/i);
    expect(token).toHaveAttribute('name', 'telegramBotToken');
    expect(token).toHaveAttribute('autocomplete', 'off');

    const chatId = screen.getByLabelText(/chat id/i);
    expect(chatId).toHaveAttribute('name', 'telegramChatId');
    expect(chatId).toHaveAttribute('autocomplete', 'off');
  });
});
