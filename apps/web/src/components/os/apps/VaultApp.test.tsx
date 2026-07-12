import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    getVault: vi.fn(),
    getConnectors: vi.fn(),
    addVaultSecret: vi.fn(),
    deleteVaultSecret: vi.fn(),
    connectConnector: vi.fn(),
    disconnectConnector: vi.fn(),
    getServerUrl: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import VaultApp from './VaultApp';

beforeEach(() => {
  mocks.adapter.getVault.mockResolvedValue({ secrets: [], suggestedSecrets: [] });
  mocks.adapter.getConnectors.mockResolvedValue([]);
  mocks.adapter.getServerUrl.mockReturnValue('http://127.0.0.1:3000');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('VaultApp accessibility metadata', () => {
  it('names add-secret controls and exposes browser metadata', async () => {
    render(
      <TooltipProvider>
        <VaultApp />
      </TooltipProvider>,
    );

    await screen.findByText(/add secret/i);

    const name = screen.getByRole('textbox', { name: /secret name/i });
    expect(name).toHaveAttribute('name', 'secretName');
    expect(name).toHaveAttribute('autocomplete', 'off');

    const type = screen.getByRole('combobox', { name: /secret type/i });
    expect(type).toHaveAttribute('name', 'secretType');

    const value = screen.getByLabelText(/secret value/i);
    expect(value).toHaveAttribute('name', 'secretValue');
    expect(value).toHaveAttribute('autocomplete', 'current-password');

    fireEvent.change(type, { target: { value: 'basic' } });
    expect(screen.getByRole('textbox', { name: /basic auth username/i })).toHaveAttribute('name', 'basicAuthUsername');
    expect(screen.getByLabelText(/secret password or token/i)).toHaveAttribute('autocomplete', 'current-password');
  });
});
