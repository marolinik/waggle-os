import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getChannels: vi.fn(),
  getChannelPairings: vi.fn(),
  getWorkspaces: vi.fn(),
  saveChannelConfig: vi.fn(),
  setChannelRunning: vi.fn(),
  createChannelPairingCode: vi.fn(),
  revokeChannelSender: vi.fn(),
  getServerUrl: vi.fn(() => 'http://127.0.0.1:3333'),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks }));

import ChannelsSettings from './ChannelsSettings';

const channels = [
  {
    platform: 'telegram',
    running: false,
    connected: false,
    config: { enabled: false, defaultWorkspace: 'ws-1' },
    secrets: { telegram_bot_token: null },
  },
  {
    platform: 'discord',
    running: false,
    connected: false,
    config: { enabled: false, defaultWorkspace: 'ws-1' },
    secrets: { discord_bot_token: null },
  },
  {
    platform: 'slack',
    running: false,
    connected: false,
    config: { enabled: false, defaultWorkspace: 'ws-1' },
    secrets: { slack_app_token: null, slack_bot_token: null },
  },
  {
    platform: 'whatsapp',
    running: false,
    connected: false,
    config: { enabled: false, defaultWorkspace: 'ws-1' },
    secrets: {},
  },
];

beforeEach(() => {
  mocks.getChannels.mockResolvedValue(channels);
  mocks.getChannelPairings.mockResolvedValue({});
  mocks.getWorkspaces.mockResolvedValue([
    { id: 'ws-1', name: 'Client Alpha' },
    { id: 'ws-2', name: 'Internal Ops' },
  ]);
  mocks.saveChannelConfig.mockResolvedValue({ ok: true });
  mocks.setChannelRunning.mockResolvedValue({ ok: true });
  mocks.createChannelPairingCode.mockResolvedValue({ code: 'ABCDEFGH', expiresAt: Date.now() + 600_000 });
  mocks.revokeChannelSender.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChannelsSettings protected API integration', () => {
  it('loads through the authenticated adapter and exposes labelled setup controls', async () => {
    render(<ChannelsSettings />);

    expect(await screen.findByRole('heading', { name: 'Channels' })).toBeInTheDocument();
    await waitFor(() => expect(mocks.getChannels).toHaveBeenCalledTimes(1));
    expect(mocks.getChannelPairings).toHaveBeenCalledTimes(1);
    expect(mocks.getWorkspaces).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Telegram bot token')).toBeInTheDocument();
    expect(screen.getByLabelText('Telegram default workspace')).toHaveValue('ws-1');
    expect(screen.getAllByRole('option', { name: 'Client Alpha' })).toHaveLength(4);
  });

  it('keeps a token draft when the protected save request fails', async () => {
    mocks.saveChannelConfig.mockRejectedValueOnce(new Error('Token was rejected'));
    render(<ChannelsSettings />);

    const input = await screen.findByLabelText('Telegram bot token');
    fireEvent.change(input, { target: { value: '123456:keep-this-draft' } });
    const telegram = screen.getByRole('region', { name: 'Telegram' });
    fireEvent.click(within(telegram).getByRole('button', { name: 'Save' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Token was rejected');
    expect(input).toHaveValue('123456:keep-this-draft');
  });

  it('switches workspaces, generates a pairing code, and revokes access', async () => {
    mocks.getChannels.mockResolvedValue(channels.map(channel => channel.platform === 'telegram'
      ? {
          ...channel,
          running: true,
          connected: true,
          secrets: { telegram_bot_token: '1234â€¦(32)' },
        }
      : channel));
    mocks.getChannelPairings.mockResolvedValue({
      telegram: [{ senderId: 'sender-1', senderName: 'Marko', pairedAt: Date.now() }],
    });
    render(<ChannelsSettings />);

    const telegram = await screen.findByRole('region', { name: 'Telegram' });
    fireEvent.change(within(telegram).getByLabelText('Telegram default workspace'), {
      target: { value: 'ws-2' },
    });
    await waitFor(() => expect(mocks.saveChannelConfig)
      .toHaveBeenCalledWith('telegram', { defaultWorkspace: 'ws-2' }));

    fireEvent.click(within(telegram).getByRole('button', { name: 'Generate pairing code' }));
    expect(await within(telegram).findByText(/ABCDEFGH/)).toBeInTheDocument();
    expect(mocks.createChannelPairingCode).toHaveBeenCalledWith('telegram');

    fireEvent.click(within(telegram).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(mocks.revokeChannelSender)
      .toHaveBeenCalledWith('telegram', 'sender-1'));
  });
});
