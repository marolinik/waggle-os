import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getStatus: vi.fn(),
  createCode: vi.fn(),
  revoke: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({
  adapter: {
    getBrowserCompanionPairing: mocks.getStatus,
    createBrowserCompanionPairingCode: mocks.createCode,
    revokeBrowserCompanionPairing: mocks.revoke,
  },
}));

import BrowserCompanionSettings from './BrowserCompanionSettings';

beforeEach(() => {
  mocks.getStatus.mockResolvedValue({ paired: false, extensionId: null, pairedAt: null });
  mocks.createCode.mockResolvedValue({ code: 'ABCDEFGH', expiresAt: Date.now() + 600_000 });
  mocks.revoke.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BrowserCompanionSettings', () => {
  it('generates a code, confirms pairing, and revokes it', async () => {
    mocks.getStatus
      .mockResolvedValueOnce({ paired: false, extensionId: null, pairedAt: null })
      .mockResolvedValueOnce({ paired: true, extensionId: 'extension-id', pairedAt: '2026-08-12T00:00:00Z' })
      .mockResolvedValueOnce({ paired: false, extensionId: null, pairedAt: null });
    render(<BrowserCompanionSettings />);
    await screen.findByText('Not paired');
    fireEvent.click(screen.getByRole('button', { name: /generate one-time code/i }));
    expect(await screen.findByTestId('browser-companion-code')).toHaveTextContent('ABCDEFGH');
    expect(mocks.createCode).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: /check pairing/i }));
    expect(await screen.findByText('Paired')).toBeInTheDocument();
    expect(screen.queryByTestId('browser-companion-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /generate one-time code/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /revoke/i }));
    await waitFor(() => expect(mocks.revoke).toHaveBeenCalledOnce());
    expect(await screen.findByText('Not paired')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate one-time code/i })).toBeInTheDocument();
  });

  it('clears an expired pairing code', async () => {
    mocks.createCode.mockResolvedValue({ code: 'ABCDEFGH', expiresAt: Date.now() - 1 });
    render(<BrowserCompanionSettings />);
    await screen.findByText('Not paired');
    fireEvent.click(screen.getByRole('button', { name: /generate one-time code/i }));
    await waitFor(() => expect(mocks.createCode).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.queryByTestId('browser-companion-code')).not.toBeInTheDocument());
  });
});
