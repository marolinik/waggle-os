import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    getSettings: vi.fn(),
    getPermissions: vi.fn(),
    getTeamStatus: vi.fn(),
    getTelemetryStatus: vi.fn(),
    getTier: vi.fn(),
    getServerUrl: vi.fn(),
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
    probeModel: vi.fn(),
    probeProvider: vi.fn(),
    toggleTelemetry: vi.fn(),
    clearTelemetry: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import SettingsApp from '@/components/os/apps/SettingsApp';

function renderSettings(initialEntry = '/settings') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <TooltipProvider>
        <SettingsApp />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

async function exposeEverything() {
  await screen.findByRole('group', { name: /settings detail level/i });
  fireEvent.click(screen.getByRole('button', { name: /everything/i }));
}

async function openBackupTab() {
  await exposeEverything();
  fireEvent.click(await screen.findByRole('tab', { name: /^backup$/i }));
  await screen.findByRole('heading', { name: /encrypted backup/i });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mocks.adapter.getSettings.mockResolvedValue({});
  mocks.adapter.getPermissions.mockResolvedValue({ defaultAutonomy: 'normal', externalGates: [] });
  mocks.adapter.getTeamStatus.mockResolvedValue({ connected: false });
  mocks.adapter.getTelemetryStatus.mockResolvedValue({ enabled: true, totalEvents: 3 });
  mocks.adapter.getTier.mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} });
  mocks.adapter.getServerUrl.mockReturnValue('http://127.0.0.1:3333');
  mocks.adapter.getProviders.mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' });
  mocks.adapter.getLocalInferenceStatus.mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 });
  mocks.adapter.probeModel.mockResolvedValue({ configured: false });
  mocks.adapter.probeProvider.mockResolvedValue({ configured: false, valid: false, verified: false });
  mocks.adapter.toggleTelemetry.mockResolvedValue({ enabled: false });
  mocks.adapter.clearTelemetry.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settings trust flows', () => {
  it('labels high-traffic model and privacy controls for assistive tech', async () => {
    renderSettings();

    const promptShape = await screen.findByRole('combobox', { name: /prompt shape/i });
    expect(promptShape).toHaveAttribute('name', 'promptShape');
    expect(promptShape).toHaveAttribute('autocomplete', 'off');

    const dailyBudget = screen.getByRole('spinbutton', { name: /daily budget/i });
    expect(dailyBudget).toHaveAttribute('name', 'dailyBudget');
    expect(dailyBudget).toHaveAttribute('autocomplete', 'off');

    await exposeEverything();
    fireEvent.click(screen.getByRole('tab', { name: /^general$/i }));
    expect(await screen.findByRole('button', { name: /disable anonymous telemetry/i })).toBeInTheDocument();
  });

  it('asks in-app before clearing telemetry events', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderSettings();

    await exposeEverything();
    fireEvent.click(screen.getByRole('tab', { name: /^general$/i }));
    await screen.findByText(/3 events collected/i);
    fireEvent.click(screen.getByRole('button', { name: /clear telemetry events/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.clearTelemetry).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/clear telemetry events/i);
    expect(modal).toHaveTextContent(/does not delete your memory/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.clearTelemetry).toHaveBeenCalledTimes(1));
    await screen.findByText(/0 events collected/i);
    await screen.findByText(/telemetry events cleared/i);
  });

  it('shows backup failures in-app without alerting', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Vault key missing' }),
    } as Response);
    renderSettings();

    await openBackupTab();
    fireEvent.click(screen.getByRole('button', { name: /create backup/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:3333/api/backup', { method: 'POST' }));
    expect(alertSpy).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/vault key missing/i);
  });

  it('asks in-app before restoring a backup and reports success in-app', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);
    renderSettings();

    await openBackupTab();
    const file = new File(['backup-data'], 'research.waggle-backup', { type: 'application/octet-stream' });
    const input = screen.getByLabelText(/^restore$/i);
    fireEvent.change(input, { target: { files: [file] } });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/restore backup/i);
    expect(modal).toHaveTextContent(/research\.waggle-backup/i);
    expect(modal).toHaveTextContent(/overwrite current data/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3333/api/restore',
      expect.objectContaining({ method: 'POST' }),
    ));
    await screen.findByText(/backup restored successfully/i);
    expect(screen.getByRole('status')).toHaveTextContent(/restart the server/i);
  });
});
