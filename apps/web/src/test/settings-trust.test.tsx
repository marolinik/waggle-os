import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within, act } from '@testing-library/react';
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
    saveSettings: vi.fn(),
    savePermissions: vi.fn(),
    toggleTelemetry: vi.fn(),
    clearTelemetry: vi.fn(),
    fetchRaw: vi.fn(),
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

async function openPermissionsTab() {
  await exposeEverything();
  fireEvent.click(await screen.findByRole('tab', { name: /^permissions$/i }));
  await screen.findByRole('heading', { name: /^permissions$/i, level: 3 });
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
  mocks.adapter.saveSettings.mockResolvedValue(undefined);
  mocks.adapter.savePermissions.mockResolvedValue({
    defaultAutonomy: 'normal',
    externalGates: [],
    workspaceOverrides: {},
  });
  mocks.adapter.toggleTelemetry.mockResolvedValue({ enabled: false });
  mocks.adapter.clearTelemetry.mockResolvedValue({ ok: true });
  mocks.adapter.fetchRaw.mockResolvedValue(new Response(null, { status: 200 }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settings trust flows', () => {
  const primaryModel = 'openai-compatible/qwen3.8-flash-next';
  const fallbackModel = 'openai-compatible/qwen3.8-27b';
  const alternateFallbackModel = 'openai-compatible/qwen3.8-27b-uncensored';
  const archiveTimeoutMs = 30 * 60_000;
  const compatibleProvider = {
    id: 'openai-compatible',
    name: 'OpenAI-compatible',
    hasKey: true,
    badge: null,
    keyUrl: null,
    requiresKey: false,
    baseUrl: 'http://10.33.0.153:4000/v1',
    modelsSource: 'provider-api' as const,
    models: [
      { id: primaryModel, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' },
      { id: fallbackModel, name: 'Qwen 3.8 27B', cost: '$', speed: 'fast' },
      { id: alternateFallbackModel, name: 'Qwen 3.8 27B Uncensored', cost: '$', speed: 'fast' },
    ],
  };

  it('fails closed when permissions cannot load and retries the authoritative read', async () => {
    mocks.adapter.getPermissions
      .mockRejectedValueOnce(new Error('permission store unavailable'))
      .mockResolvedValueOnce({
        defaultAutonomy: 'trusted',
        externalGates: ['git push'],
        workspaceOverrides: {},
      });

    renderSettings();
    await openPermissionsTab();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/permissions could not be loaded/i);
    for (const level of ['normal', 'trusted', 'yolo']) {
      const control = screen.getByTestId(`default-autonomy-${level}`);
      expect(control).toBeDisabled();
      expect(control).toHaveAttribute('aria-checked', 'false');
      fireEvent.click(control);
    }
    expect(mocks.adapter.savePermissions).not.toHaveBeenCalled();

    fireEvent.click(within(alert).getByRole('button', { name: /retry/i }));

    await waitFor(() => expect(mocks.adapter.getPermissions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByTestId('default-autonomy-trusted')).toBeEnabled();
  });

  it('saves only the selected autonomy after success and hides unenforced mutation gates', async () => {
    let resolveSave!: (value: { defaultAutonomy: 'trusted'; externalGates: string[]; workspaceOverrides: object }) => void;
    const save = new Promise<{ defaultAutonomy: 'trusted'; externalGates: string[]; workspaceOverrides: object }>((resolve) => {
      resolveSave = resolve;
    });
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: ['git push'],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockReturnValue(save);

    renderSettings();
    await openPermissionsTab();
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByText(/always require approval/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/git push.*rm -rf/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^add$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^remove$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));

    await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'trusted' }));
    expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('default-autonomy-trusted')).toBeDisabled();

    await act(async () => {
      resolveSave({ defaultAutonomy: 'trusted', externalGates: ['git push'], workspaceOverrides: {} });
      await save;
    });
    await waitFor(() => expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true'));
    expect(screen.queryByText(/mutation gates|always require approval/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/git push.*rm -rf/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^(add|remove)$/i })).not.toBeInTheDocument();
  });

  it('saves a confirmed Never ask transition without stale gate data', async () => {
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: ['git push'],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions.mockResolvedValue({
      defaultAutonomy: 'yolo',
      externalGates: ['git push'],
      workspaceOverrides: {},
    });

    renderSettings();
    await openPermissionsTab();
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));
    fireEvent.click(screen.getByTestId('default-autonomy-yolo'));
    fireEvent.click(await screen.findByTestId('yolo-confirm-accept'));

    await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledWith({ defaultAutonomy: 'yolo' }));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-yolo')).toHaveAttribute('aria-checked', 'true'));
  });

  it('keeps the confirmed autonomy selected when a permission save fails', async () => {
    mocks.adapter.getPermissions.mockResolvedValue({
      defaultAutonomy: 'normal',
      externalGates: ['git push'],
      workspaceOverrides: {},
    });
    mocks.adapter.savePermissions
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);

    renderSettings();
    await openPermissionsTab();
    await waitFor(() => expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true'));

    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));

    expect(await screen.findByRole('alert')).toHaveTextContent(/permissions were not saved/i);
    expect(screen.getByTestId('default-autonomy-normal')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('default-autonomy-trusted')).toBeEnabled();

    fireEvent.click(screen.getByTestId('default-autonomy-trusted'));
    await waitFor(() => expect(mocks.adapter.savePermissions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('default-autonomy-trusted')).toHaveAttribute('aria-checked', 'true'));
  });

  async function chooseFallback(modelName: RegExp) {
    fireEvent.click(await screen.findByRole('button', { name: /change fallback model/i }));
    fireEvent.click(screen.getByRole('button', { name: modelName }));
  }

  it('requests an atomic exact-model save and confirms the fallback visibly', async () => {
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => { resolveSave = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings.mockReturnValue(save);
    renderSettings();
    await chooseFallback(/^qwen 3\.8 27b \$$/i);

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({
      fallbackModel,
      verifyModelSettings: true,
    }));
    await act(async () => { resolveSave(); await save; });
    expect(await screen.findByText(/fallback verified.*saved/i)).toBeInTheDocument();
  });

  it('keeps a rejected atomic save visibly unsaved and retries the same model', async () => {
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings
      .mockRejectedValueOnce(new Error('MODEL_VERIFICATION_FAILED'))
      .mockResolvedValueOnce(undefined);

    renderSettings();
    await chooseFallback(/^qwen 3\.8 27b \$$/i);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/fallback was not saved/i);
    expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1);

    fireEvent.click(within(alert).getByRole('button', { name: /retry saving fallback/i }));
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenLastCalledWith({
      fallbackModel,
      verifyModelSettings: true,
    }));
    expect(await screen.findByText(/fallback verified.*saved/i)).toBeInTheDocument();
  });

  it('dispatches the newest fallback without waiting for an obsolete request', async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const secondSave = new Promise<void>((resolve) => { resolveSecond = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings
      .mockImplementationOnce(() => firstSave)
      .mockImplementationOnce(() => secondSave);

    renderSettings();
    await chooseFallback(/^qwen 3\.8 27b \$$/i);
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1));
    await chooseFallback(/^qwen 3\.8 27b uncensored \$$/i);

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenLastCalledWith({
      fallbackModel: alternateFallbackModel,
      verifyModelSettings: true,
    }));
    expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(2);
    await act(async () => { resolveSecond(); await secondSave; });
    await act(async () => { resolveFirst(); await firstSave; });
    expect(await screen.findByText(/fallback verified.*saved/i)).toBeInTheDocument();
  });

  it('coalesces pending cross-lane values into the newest atomic request', async () => {
    let resolveFirst!: () => void;
    let resolveSecond!: () => void;
    const firstSave = new Promise<void>((resolve) => { resolveFirst = resolve; });
    const secondSave = new Promise<void>((resolve) => { resolveSecond = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel, dailyBudget: 20 });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings
      .mockImplementationOnce(() => firstSave)
      .mockImplementationOnce(() => secondSave);

    renderSettings();
    await chooseFallback(/^qwen 3\.8 27b \$$/i);
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByRole('slider', { name: /budget saver activation threshold/i }), {
      target: { value: '0.75' },
    });

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenLastCalledWith({
      fallbackModel,
      budgetThreshold: 0.75,
      verifyModelSettings: true,
    }));
    await act(async () => { resolveSecond(); await secondSave; });
    await act(async () => { resolveFirst(); await firstSave; });
  });

  it('debounces rapid threshold changes and saves only the final value', async () => {
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => { resolveSave = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel, dailyBudget: 20 });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings.mockReturnValue(save);

    renderSettings();
    const slider = await screen.findByRole('slider', { name: /budget saver activation threshold/i });
    fireEvent.change(slider, { target: { value: '0.65' } });
    fireEvent.change(slider, { target: { value: '0.70' } });
    fireEvent.change(slider, { target: { value: '0.75' } });

    expect(mocks.adapter.saveSettings).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({
      budgetThreshold: 0.75,
      verifyModelSettings: true,
    }));
    expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1);
    await act(async () => { resolveSave(); await save; });
  });

  it('lets a manual save supersede an in-flight automatic save without stale feedback', async () => {
    let resolveAutomatic!: () => void;
    let resolveManual!: () => void;
    const automatic = new Promise<void>((resolve) => { resolveAutomatic = resolve; });
    const manual = new Promise<void>((resolve) => { resolveManual = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings
      .mockImplementationOnce(() => automatic)
      .mockImplementationOnce(() => manual);

    renderSettings();
    await chooseFallback(/^qwen 3\.8 27b \$$/i);
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /save model settings/i }));

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenLastCalledWith({
      defaultModel: primaryModel,
      fallbackModel,
      budgetModel: null,
      budgetThreshold: 0.8,
      dailyBudget: null,
      verifyModelSettings: true,
    }));
    await act(async () => { resolveManual(); await manual; });
    await act(async () => { resolveAutomatic(); await automatic; });
    expect(await screen.findByText(/model chain verified.*saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/fallback was not saved/i)).not.toBeInTheDocument();
  });

  it('carries the full manual snapshot when a newer automatic change wins', async () => {
    let rejectManual!: (error: Error) => void;
    let resolveAutomatic!: () => void;
    const manual = new Promise<void>((_resolve, reject) => { rejectManual = reject; });
    const automatic = new Promise<void>((resolve) => { resolveAutomatic = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({
      defaultModel: primaryModel,
      dailyBudget: 20,
    });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings
      .mockImplementationOnce(() => manual)
      .mockImplementationOnce(() => automatic);

    renderSettings();
    fireEvent.change(await screen.findByLabelText(/daily budget/i), { target: { value: '37' } });
    fireEvent.click(screen.getByRole('button', { name: /save model settings/i }));
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledTimes(1));

    await chooseFallback(/^qwen 3\.8 27b \$$/i);
    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenLastCalledWith({
      defaultModel: primaryModel,
      fallbackModel,
      budgetModel: null,
      budgetThreshold: 0.8,
      dailyBudget: 37,
      verifyModelSettings: true,
    }));

    await act(async () => { resolveAutomatic(); await automatic; });
    await act(async () => { rejectManual(new Error('SETTINGS_CHANGED_RETRY')); await manual.catch(() => {}); });
    expect(await screen.findByText(/model chain verified.*saved/i)).toBeInTheDocument();
    expect(screen.queryByText(/verifying selected models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/model settings were not saved/i)).not.toBeInTheDocument();
  });

  it('switches to Single Model by atomically clearing fallback and budget lanes', async () => {
    let resolveSave!: () => void;
    const save = new Promise<void>((resolve) => { resolveSave = resolve; });
    mocks.adapter.getSettings.mockResolvedValue({
      defaultModel: primaryModel,
      fallbackModel,
      budgetModel: alternateFallbackModel,
    });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings.mockReturnValue(save);

    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: /fallback chain/i }));

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({
      fallbackModel: null,
      budgetModel: null,
      verifyModelSettings: true,
    }));
    expect(mocks.adapter.probeModel).not.toHaveBeenCalledWith(null);
    await act(async () => { resolveSave(); await save; });
    expect(await screen.findByText(/model chain saved/i)).toBeInTheDocument();
  });

  it('surfaces a server-side exact-model rejection on advanced save', async () => {
    mocks.adapter.getSettings.mockResolvedValue({ defaultModel: primaryModel });
    mocks.adapter.getProviders.mockResolvedValue({
      providers: [compatibleProvider], search: [], activeSearch: 'duckduckgo',
    });
    mocks.adapter.saveSettings.mockRejectedValue(new Error('MODEL_VERIFICATION_FAILED'));

    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: /save model settings/i }));

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      defaultModel: primaryModel,
      verifyModelSettings: true,
    })));
    const error = await screen.findByText(/model settings were not saved.*retry/i);
    expect(error.closest('[role="alert"]')).toBeInTheDocument();
  });

  it('fails closed before an advanced save when Primary is blank', async () => {
    renderSettings();
    fireEvent.click(await screen.findByRole('button', { name: /save model settings/i }));

    expect(mocks.adapter.saveSettings).not.toHaveBeenCalled();
    const error = await screen.findByText(/choose a primary model/i);
    expect(error.closest('[role="alert"]')).toBeInTheDocument();
  });

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
    const directFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    mocks.adapter.fetchRaw.mockResolvedValue(new Response(
      JSON.stringify({ error: 'Vault key missing' }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    ));
    try {
      renderSettings();

      await openBackupTab();
      fireEvent.click(screen.getByRole('button', { name: /create backup/i }));

      await waitFor(() => expect(mocks.adapter.fetchRaw).toHaveBeenCalledWith(
        '/api/backup',
        { method: 'POST' },
        archiveTimeoutMs,
      ));
      expect(directFetch).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/vault key missing/i);
    } finally {
      directFetch.mockRestore();
    }
  });

  it('does not download an authentication failure as an export archive', async () => {
    const unauthorized = () => new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } },
    );
    mocks.adapter.fetchRaw.mockResolvedValue(unauthorized());
    const directFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(unauthorized());
    const createObjectURL = vi.fn(() => 'blob:false-export');
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      renderSettings();
      await openBackupTab();
      fireEvent.click(screen.getByRole('button', { name: /export data/i }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/export failed.*try again/i);
      expect(mocks.adapter.fetchRaw).toHaveBeenCalledWith(
        '/api/export',
        { method: 'POST' },
        archiveTimeoutMs,
      );
      expect(directFetch).not.toHaveBeenCalled();
      expect(createObjectURL).not.toHaveBeenCalled();
      expect(click).not.toHaveBeenCalled();
      expect(revokeObjectURL).not.toHaveBeenCalled();
    } finally {
      click.mockRestore();
      directFetch.mockRestore();
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('downloads a successful authenticated export with a trustworthy filename', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(new Response('export-bytes', { status: 200 }));
    const directFetch = vi.spyOn(globalThis, 'fetch');
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:waggle-export');
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    let clickedHref = '';
    let clickedDownload = '';
    let clickedWhileConnected = false;
    let resolveDownloadClick!: () => void;
    const downloadClicked = new Promise<void>((resolve) => { resolveDownloadClick = resolve; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clickedHref = this.href;
      clickedDownload = this.download;
      clickedWhileConnected = this.isConnected;
      this.dataset.settingsExportLink = 'observed';
      expect(revokeObjectURL).not.toHaveBeenCalled();
      resolveDownloadClick();
    });

    try {
      renderSettings();
      await openBackupTab();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /export data/i }));
        await downloadClicked;
      });
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(document.querySelector('[data-settings-export-link="observed"]')).toBeNull();
      await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
      const status = await screen.findByRole('status');
      expect(status).toHaveTextContent(/export created.*download started/i);
      expect(mocks.adapter.fetchRaw).toHaveBeenCalledWith(
        '/api/export',
        { method: 'POST' },
        archiveTimeoutMs,
      );
      expect(directFetch).not.toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(await (createObjectURL.mock.calls[0]?.[0] as Blob).text()).toBe('export-bytes');
      expect(clickedWhileConnected).toBe(true);
      expect(clickedHref).toBe('blob:waggle-export');
      expect(clickedDownload).toMatch(/^waggle-export-\d{4}-\d{2}-\d{2}\.zip$/);
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:waggle-export');
      expect(screen.getByRole('button', { name: /export data/i })).toBeEnabled();
    } finally {
      click.mockRestore();
      directFetch.mockRestore();
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('revokes the export URL and reports failure when the browser rejects the download', async () => {
    mocks.adapter.fetchRaw.mockResolvedValue(new Response('export-bytes', { status: 200 }));
    const createObjectURL = vi.fn(() => 'blob:rejected-export');
    const revokeObjectURL = vi.fn();
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    let clickedWhileConnected = false;
    let resolveDownloadClick!: () => void;
    const downloadClicked = new Promise<void>((resolve) => { resolveDownloadClick = resolve; });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
      clickedWhileConnected = this.isConnected;
      this.dataset.settingsExportFailureLink = 'observed';
      resolveDownloadClick();
      throw new Error('download blocked');
    });

    try {
      renderSettings();
      await openBackupTab();
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /export data/i }));
        await downloadClicked;
      });
      expect(revokeObjectURL).not.toHaveBeenCalled();
      expect(document.querySelector('[data-settings-export-failure-link="observed"]')).toBeNull();
      await act(async () => { await new Promise<void>((resolve) => setTimeout(resolve, 0)); });
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(/export failed.*try again/i);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(click).toHaveBeenCalledTimes(1);
      expect(clickedWhileConnected).toBe(true);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:rejected-export');
      expect(screen.getByRole('button', { name: /export data/i })).toBeEnabled();
    } finally {
      click.mockRestore();
      if (originalCreateObjectURL) Object.defineProperty(URL, 'createObjectURL', originalCreateObjectURL);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevokeObjectURL) Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectURL);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('asks in-app before restoring a backup and reports success in-app', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const directFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 500 }));
    mocks.adapter.fetchRaw.mockResolvedValue(new Response(
      JSON.stringify({}),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    try {
      renderSettings();

      await openBackupTab();
      const file = new File(['backup-data'], 'research.waggle-backup', { type: 'application/octet-stream' });
      const input = screen.getByLabelText(/^restore$/i);
      fireEvent.change(input, { target: { files: [file] } });

      expect(confirmSpy).not.toHaveBeenCalled();
      expect(alertSpy).not.toHaveBeenCalled();
      expect(mocks.adapter.fetchRaw).not.toHaveBeenCalled();
      expect(directFetch).not.toHaveBeenCalled();

      const modal = await screen.findByTestId('approval-modal');
      expect(modal).toHaveTextContent(/restore backup/i);
      expect(modal).toHaveTextContent(/research\.waggle-backup/i);
      expect(modal).toHaveTextContent(/overwrite current data/i);

      fireEvent.click(screen.getByTestId('approval-modal-approve'));

      await waitFor(() => expect(mocks.adapter.fetchRaw).toHaveBeenCalledWith(
        '/api/restore',
        expect.objectContaining({ method: 'POST' }),
        archiveTimeoutMs,
      ));
      expect(directFetch).not.toHaveBeenCalled();
      await screen.findByText(/backup restored successfully/i);
      expect(screen.getByRole('status')).toHaveTextContent(/restart the server/i);
    } finally {
      directFetch.mockRestore();
    }
  });
});
