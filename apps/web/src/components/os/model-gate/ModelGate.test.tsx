/**
 * PR5 Phase A — the shared ModelGate (Onboarding step-3 hard gate AND the
 * Settings→Models lead). Two tabs: paste+live-validate a cloud key → vault, OR
 * detect/pull a local model. Honesty: "verified" only when the live probe confirmed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent, act } from '@testing-library/react';
import { StrictMode } from 'react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
    getLocalInferenceModels: vi.fn(),
    bootstrapLocalRuntime: vi.fn(),
    testApiKey: vi.fn(),
    testCompatibleProvider: vi.fn(),
    setProviderConfig: vi.fn(),
    setProviderKey: vi.fn(),
    restartModelRouter: vi.fn(),
    saveSettings: vi.fn(),
    pullLocalModel: vi.fn(),
    probeProvider: vi.fn(),
    probeModel: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { ModelGate } from './ModelGate';

const providersResp = (...defs: {
  id: string;
  hasKey: boolean;
  requiresKey?: boolean;
  baseUrl?: string;
  modelsSource?: 'provider-api' | 'stale-provider-api' | 'unavailable' | 'requires-key' | 'requires-endpoint' | 'local-runtime';
  models?: Array<{ id: string; name: string; cost?: string; speed?: string }>;
}[]) => ({
  providers: defs.map((d) => ({
    id: d.id,
    name: d.id.charAt(0).toUpperCase() + d.id.slice(1),
    hasKey: d.hasKey,
    badge: null,
    keyUrl: 'https://example.com/keys',
    requiresKey: d.requiresKey ?? d.id !== 'ollama',
    ...(d.baseUrl ? { baseUrl: d.baseUrl } : {}),
    ...(d.modelsSource ? { modelsSource: d.modelsSource } : {}),
    models: (d.models ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      cost: m.cost ?? '$',
      speed: m.speed ?? 'fast',
    })),
  })),
  search: [],
  activeSearch: 'duckduckgo',
});

const noLocal = {
  servers: [{ type: 'ollama' }],
  ollamaInstalled: true,
  ollamaRunning: true,
  totalLocalModels: 0,
  offlineReady: false,
  dockerRequired: false,
  managedRuntime: {
    source: 'waggle-managed',
    supported: true,
    installed: true,
    running: true,
    targetVersion: '0.32.0',
    version: '0.32.0',
    artifactSizeBytes: 1_503_047_573,
    downloadRequired: false,
    dockerRequired: false,
  },
  setupRequired: true,
  setupMessage: null,
};

beforeEach(() => {
  mocks.adapter.getProviders.mockResolvedValue(
    providersResp({ id: 'anthropic', hasKey: false }, { id: 'openai', hasKey: false }, { id: 'ollama', hasKey: false }),
  );
  mocks.adapter.getLocalInferenceStatus.mockResolvedValue(noLocal);
  mocks.adapter.getLocalInferenceModels.mockResolvedValue({
    source: 'native',
    models: [{ name: 'qwen3:1.7b', fitLevel: 'perfect', estimatedTps: 32, runMode: 'gpu' }],
  });
  mocks.adapter.bootstrapLocalRuntime.mockResolvedValue({
    ok: true,
    installedNow: true,
    startedNow: true,
    endpoint: 'http://127.0.0.1:11434',
    dockerRequired: false,
  });
  mocks.adapter.testApiKey.mockResolvedValue({ valid: true, verified: true });
  mocks.adapter.testCompatibleProvider.mockResolvedValue({
    valid: true,
    verified: true,
    baseUrl: 'http://10.33.0.153:4000/v1',
    model: 'openai-compatible/qwen3.8-flash-next',
    models: [{
      id: 'openai-compatible/qwen3.8-flash-next',
      name: 'Qwen 3.8 Flash Next',
      cost: '$',
      speed: 'fast',
    }],
    modelsSource: 'provider-api',
  });
  mocks.adapter.setProviderConfig.mockResolvedValue({});
  mocks.adapter.setProviderKey.mockResolvedValue({ router: { managed: true, ready: true } });
  mocks.adapter.restartModelRouter.mockResolvedValue({
    running: true,
    port: 4000,
    models: [],
    unavailableProviders: [],
  });
  mocks.adapter.saveSettings.mockResolvedValue(undefined);
  mocks.adapter.pullLocalModel.mockResolvedValue({
    ok: true,
    model: 'llama3.2:latest',
    verifiedGeneration: true,
  });
  // F3: default probe = network-degrade neutral (valid, not verified) so the
  // key-presence tests keep their "You have a working model" wording.
  mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: false });
  // MODEL-GATE: default = no default model configured, so the mount probe falls
  // back to the F3 per-provider path the existing cases assert against.
  mocks.adapter.probeModel.mockResolvedValue({ model: null, configured: false, verified: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function selectProviderAndType(providerName: RegExp, key: string) {
  fireEvent.click(await screen.findByRole('button', { name: providerName }));
  const input = await screen.findByLabelText(/api key for/i);
  fireEvent.change(input, { target: { value: key } });
}

describe('ModelGate', () => {
  it('discovers, verifies, and atomically saves a keyless compatible endpoint', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    const emptyCompatible = {
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      modelsSource: 'requires-endpoint' as const,
    };
    const readyCompatible = {
      ...emptyCompatible,
      baseUrl: endpoint,
      modelsSource: 'provider-api' as const,
      models: [{ id: model, name: 'Qwen 3.8 Flash Next' }],
    };
    mocks.adapter.getProviders
      .mockResolvedValueOnce(providersResp(emptyCompatible))
      .mockResolvedValueOnce(providersResp(readyCompatible));
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: endpoint,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      })
      .mockResolvedValueOnce({
        valid: true,
        verified: true,
        baseUrl: endpoint,
        model,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      });
    const onModelReady = vi.fn();
    render(<ModelGate onModelReady={onModelReady} />);

    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(await screen.findByLabelText(/endpoint url/i), { target: { value: endpoint } });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    await waitFor(() => expect(mocks.adapter.setProviderConfig).toHaveBeenCalledWith(
      'openai-compatible',
      {
        baseUrl: endpoint,
        models: [model],
        defaultModel: model,
      },
    ));
    expect(onModelReady).toHaveBeenCalledWith(model);
    expect(await screen.findByText(/verified and saved/i)).toBeInTheDocument();
  });

  it('prefills a persisted compatible endpoint after remount', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      baseUrl: endpoint,
      modelsSource: 'provider-api',
      models: [{ id: 'openai-compatible/qwen3.8-flash-next', name: 'Qwen 3.8 Flash Next' }],
    }));
    const first = render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    expect(await screen.findByLabelText(/endpoint url/i)).toHaveValue(endpoint);
    expect(screen.getByLabelText(/^model$/i)).toHaveValue('openai-compatible/qwen3.8-flash-next');
    expect(screen.getByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    first.unmount();

    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    expect(await screen.findByLabelText(/endpoint url/i)).toHaveValue(endpoint);
    expect(screen.getByLabelText(/^model$/i)).toHaveValue('openai-compatible/qwen3.8-flash-next');
    expect(screen.getByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
  });

  it('keeps a saved compatible endpoint in Your providers when its catalog is stale', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      baseUrl: 'http://10.33.0.153:4000/v1',
      modelsSource: 'stale-provider-api',
      models: [{ id: 'openai-compatible/qwen3.8-flash-next', name: 'Qwen 3.8 Flash Next' }],
    }));
    render(<ModelGate />);

    const owned = await screen.findByText(/your providers/i);
    expect(owned.parentElement).toHaveTextContent(/openai-compatible/i);
    expect(owned.parentElement).toHaveTextContent(/endpoint saved/i);
    expect(screen.queryByText(/no endpoint yet/i)).not.toBeInTheDocument();
  });

  it('does not save a compatible endpoint when exact-model verification fails', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      modelsSource: 'requires-endpoint',
    }));
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      })
      .mockResolvedValueOnce({
        valid: false,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        model: 'openai-compatible/qwen3.8-flash-next',
        models: [],
        modelsSource: 'unavailable',
        error: 'Selected model returned no assistant response.',
      });
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    await screen.findByRole('option', { name: /qwen 3.8 flash next/i });
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no assistant response/i);
    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();
  });

  it('refuses to reuse a stored compatible-provider key for a different endpoint', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: true,
      requiresKey: false,
      baseUrl: 'https://old.example.test/v1',
      modelsSource: 'provider-api',
      models: [{ id: 'openai-compatible/old-model', name: 'Old Model' }],
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(await screen.findByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });

    expect(await screen.findByText(/stored key is tied to the current endpoint/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));

    expect(mocks.adapter.testCompatibleProvider).toHaveBeenCalledTimes(1);
    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();
  });

  it('ignores a late compatible discovery after the endpoint changes', async () => {
    let resolveDiscovery!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      modelsSource: 'requires-endpoint',
    }));
    mocks.adapter.testCompatibleProvider.mockImplementationOnce(() => new Promise((resolve) => {
      resolveDiscovery = resolve;
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://127.0.0.1:4000/v1' },
    });
    await act(async () => {
      resolveDiscovery({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      });
    });

    expect(screen.getByLabelText(/endpoint url/i)).toHaveValue('http://127.0.0.1:4000/v1');
    expect(screen.queryByRole('option', { name: /qwen 3.8 flash next/i })).not.toBeInTheDocument();
  });

  it('does not persist a late exact verification after the endpoint changes', async () => {
    let resolveReadiness!: (value: Awaited<ReturnType<typeof mocks.adapter.probeModel>>) => void;
    let resolveVerification!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      { id: 'anthropic', hasKey: true, models: [{ id: 'anthropic/current', name: 'Current' }] },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        modelsSource: 'requires-endpoint',
      },
    ));
    mocks.adapter.probeModel
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveReadiness = resolve;
      }))
      .mockResolvedValueOnce({ model: null, configured: false, verified: false });
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveVerification = resolve;
      }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://127.0.0.1:4000/v1' },
    });
    await act(async () => {
      resolveVerification({
        valid: true,
        verified: true,
        baseUrl: 'http://10.33.0.153:4000/v1',
        model: 'openai-compatible/qwen3.8-flash-next',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      });
    });

    expect(screen.getByLabelText(/endpoint url/i)).toHaveValue('http://127.0.0.1:4000/v1');
    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/verify your key just now/i)).toBeInTheDocument();
    await act(async () => {
      resolveReadiness({
        model: 'anthropic/current',
        configured: true,
        verified: false,
        rejected: true,
      });
    });
    expect(screen.getByText(/verify your key just now/i)).toBeInTheDocument();
  });

  it('restarts readiness after an exact compatible verification fails while the mount probe is pending', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      { id: 'anthropic', hasKey: true, models: [{ id: 'anthropic/current', name: 'Current' }] },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        modelsSource: 'requires-endpoint',
      },
    ));
    mocks.adapter.probeModel
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ model: null, configured: false, verified: false });
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      })
      .mockResolvedValueOnce({
        valid: false,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        model: 'openai-compatible/qwen3.8-flash-next',
        models: [],
        modelsSource: 'unavailable',
        error: 'Selected model returned no assistant response.',
      });
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    await screen.findByRole('option', { name: /qwen 3.8 flash next/i });
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no assistant response/i);
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/verify your key just now/i)).toBeInTheDocument();
    expect(screen.queryByText(/checking your models/i)).not.toBeInTheDocument();
  });

  it('restarts readiness after failed verification under React StrictMode', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      baseUrl: endpoint,
      modelsSource: 'provider-api',
      models: [{ id: model, name: 'Qwen 3.8 Flash Next' }],
    }));
    mocks.adapter.probeModel
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce({ model: null, configured: false, verified: false });
    mocks.adapter.testCompatibleProvider.mockResolvedValueOnce({
      valid: false,
      verified: false,
      baseUrl: endpoint,
      model,
      models: [],
      modelsSource: 'unavailable',
      error: 'Selected model returned no assistant response.',
    });
    render(<StrictMode><ModelGate /></StrictMode>);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no assistant response/i);
    await waitFor(() => expect(mocks.adapter.probeModel).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/verify your key just now/i)).toBeInTheDocument();
  });

  it('cancels an in-flight compatible verification when the user selects another provider', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    let resolveVerification!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      { id: 'anthropic', hasKey: true, models: [{ id: 'anthropic/current', name: 'Current' }] },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        baseUrl: endpoint,
        modelsSource: 'provider-api',
        models: [{ id: model, name: 'Qwen 3.8 Flash Next' }],
      },
    ));
    mocks.adapter.testCompatibleProvider.mockImplementationOnce(() => new Promise((resolve) => {
      resolveVerification = resolve;
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    fireEvent.click(screen.getByRole('button', { name: /anthropic/i }));

    expect(await screen.findByLabelText(/api key for anthropic/i)).toBeInTheDocument();
    await act(async () => {
      resolveVerification({
        valid: true,
        verified: true,
        baseUrl: endpoint,
        model,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      });
    });
    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();
  });

  it('lets an explicit compatible verification own the result when a stale readiness probe rejects another provider', async () => {
    let resolveReadiness!: (value: Awaited<ReturnType<typeof mocks.adapter.probeModel>>) => void;
    let resolveVerification!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      {
        id: 'anthropic',
        hasKey: true,
        models: [{ id: 'anthropic/claude-model', name: 'Claude Model' }],
      },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        modelsSource: 'requires-endpoint',
      },
    ));
    mocks.adapter.probeModel.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReadiness = resolve;
    }));
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveVerification = resolve;
      }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    expect(mocks.adapter.probeModel).toHaveBeenCalled();
    await act(async () => {
      resolveReadiness({
        model: 'anthropic/claude-model',
        configured: true,
        verified: false,
        rejected: true,
      });
    });
    expect(screen.queryByLabelText(/api key for anthropic/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
    await act(async () => {
      resolveVerification({
        valid: true,
        verified: true,
        baseUrl: 'http://10.33.0.153:4000/v1',
        model: 'openai-compatible/qwen3.8-flash-next',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      });
    });

    await waitFor(() => expect(mocks.adapter.setProviderConfig).toHaveBeenCalledWith(
      'openai-compatible',
      {
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: ['openai-compatible/qwen3.8-flash-next'],
        defaultModel: 'openai-compatible/qwen3.8-flash-next',
      },
    ));
    expect(await screen.findByText(/verified and saved/i)).toBeInTheDocument();
  });

  it('ignores a stale rejected-model result while its compatible model verification is in flight', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    let resolveReadiness!: (value: Awaited<ReturnType<typeof mocks.adapter.probeModel>>) => void;
    let resolveVerification!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      baseUrl: endpoint,
      modelsSource: 'provider-api',
      models: [{ id: model, name: 'Qwen 3.8 Flash Next' }],
    }));
    mocks.adapter.probeModel.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReadiness = resolve;
    }));
    mocks.adapter.testCompatibleProvider.mockImplementationOnce(() => new Promise((resolve) => {
      resolveVerification = resolve;
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    expect(await screen.findByRole('button', { name: /verifying/i })).toBeInTheDocument();
    await act(async () => {
      resolveReadiness({
        model,
        configured: true,
        verified: false,
        rejected: true,
      });
    });

    expect(await screen.findByLabelText(/endpoint url/i)).toHaveValue(endpoint);
    expect(screen.getByLabelText(/^model$/i)).toHaveValue(model);
    expect(screen.getByRole('button', { name: /verifying/i })).toBeDisabled();
    await act(async () => {
      resolveVerification({
        valid: true,
        verified: true,
        baseUrl: endpoint,
        model,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      });
    });
    await waitFor(() => expect(mocks.adapter.setProviderConfig).toHaveBeenCalledWith(
      'openai-compatible',
      { baseUrl: endpoint, models: [model], defaultModel: model },
    ));
  });

  it('ignores a stale rejected-model result that arrives after the compatible save completes', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    let resolveReadiness!: (value: Awaited<ReturnType<typeof mocks.adapter.probeModel>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      { id: 'anthropic', hasKey: true, models: [{ id: 'anthropic/current', name: 'Current' }] },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        baseUrl: endpoint,
        modelsSource: 'provider-api',
        models: [{ id: model, name: 'Qwen 3.8 Flash Next' }],
      },
    ));
    mocks.adapter.probeModel.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReadiness = resolve;
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    expect(await screen.findByText(/verified and saved/i)).toBeInTheDocument();

    await act(async () => {
      resolveReadiness({
        model: 'anthropic/current',
        configured: true,
        verified: false,
        rejected: true,
      });
    });

    expect(screen.getByText(/model verified \(openai-compatible\/qwen3\.8-flash-next\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /openai-compatible/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByLabelText(/api key for anthropic/i)).not.toBeInTheDocument();
  });

  it('keeps compatible controls locked through an atomic save despite a late readiness failure', async () => {
    const endpoint = 'http://10.33.0.153:4000/v1';
    const model = 'openai-compatible/qwen3.8-flash-next';
    let resolveReadiness!: (value: Awaited<ReturnType<typeof mocks.adapter.probeModel>>) => void;
    let resolveSave!: (value: unknown) => void;
    const onModelReady = vi.fn();
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      {
        id: 'anthropic',
        hasKey: true,
        models: [{ id: 'anthropic/claude-model', name: 'Claude Model' }],
      },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        modelsSource: 'requires-endpoint',
      },
    ));
    mocks.adapter.probeModel.mockImplementationOnce(() => new Promise((resolve) => {
      resolveReadiness = resolve;
    }));
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: endpoint,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      })
      .mockResolvedValueOnce({
        valid: true,
        verified: true,
        baseUrl: endpoint,
        model,
        models: [{ id: model, name: 'Qwen 3.8 Flash Next', cost: '$', speed: 'fast' }],
        modelsSource: 'provider-api',
      });
    mocks.adapter.setProviderConfig.mockImplementationOnce(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    render(<ModelGate onModelReady={onModelReady} />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), { target: { value: endpoint } });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /anthropic/i })).toBeDisabled();
    expect(screen.getByRole('tab', { name: /local model/i })).toBeDisabled();
    await act(async () => {
      resolveReadiness({
        model: 'anthropic/claude-model',
        configured: true,
        verified: false,
        rejected: true,
      });
    });
    expect(screen.getByLabelText(/endpoint url/i)).toHaveValue(endpoint);
    expect(screen.queryByLabelText(/api key for anthropic/i)).not.toBeInTheDocument();
    await act(async () => {
      resolveSave({});
    });

    expect(onModelReady).toHaveBeenCalledWith(model);
    expect(await screen.findByText(/verified and saved/i)).toBeInTheDocument();
  });

  it('does not persist a compatible verification after the gate unmounts', async () => {
    let resolveVerification!: (value: Awaited<ReturnType<typeof mocks.adapter.testCompatibleProvider>>) => void;
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      modelsSource: 'requires-endpoint',
    }));
    mocks.adapter.testCompatibleProvider
      .mockResolvedValueOnce({
        valid: true,
        verified: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveVerification = resolve;
      }));
    const view = render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /verify & save/i }));
    view.unmount();
    await act(async () => {
      resolveVerification({
        valid: true,
        verified: true,
        baseUrl: 'http://10.33.0.153:4000/v1',
        model: 'openai-compatible/qwen3.8-flash-next',
        models: [{
          id: 'openai-compatible/qwen3.8-flash-next',
          name: 'Qwen 3.8 Flash Next',
          cost: '$',
          speed: 'fast',
        }],
        modelsSource: 'provider-api',
      });
    });

    expect(mocks.adapter.setProviderConfig).not.toHaveBeenCalled();
  });

  it('clears discovered compatible models when the endpoint or credential changes', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({
      id: 'openai-compatible',
      hasKey: false,
      requiresKey: false,
      modelsSource: 'requires-endpoint',
    }));
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('button', { name: /openai-compatible/i }));
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://10.33.0.153:4000/v1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/api key \(optional\)/i), {
      target: { value: 'replacement-key' },
    });
    expect(screen.queryByRole('option', { name: /qwen 3.8 flash next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify & save/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /discover models/i }));
    expect(await screen.findByRole('option', { name: /qwen 3.8 flash next/i })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/endpoint url/i), {
      target: { value: 'http://127.0.0.1:4000/v1' },
    });
    expect(screen.queryByRole('option', { name: /qwen 3.8 flash next/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /verify & save/i })).not.toBeInTheDocument();
  });

  it('renders a chip per key-requiring provider, excluding the keyless local runtime (ollama)', async () => {
    render(<ModelGate />);
    expect(await screen.findByRole('button', { name: /anthropic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ollama$/i })).not.toBeInTheDocument();
  });

  it('a11y: model setup fields expose stable form metadata', async () => {
    render(<ModelGate />);

    fireEvent.click(await screen.findByRole('button', { name: /anthropic/i }));
    const key = await screen.findByLabelText(/api key for anthropic/i);
    expect(key).toHaveAttribute('name', 'modelProviderKey');
    expect(key).toHaveAttribute('autocomplete', 'off');

    fireEvent.click(screen.getByRole('tab', { name: /local model/i }));
    const pull = await screen.findByLabelText(/download and verify a model/i);
    expect(pull).toHaveAttribute('name', 'modelPullName');
    expect(pull).toHaveAttribute('autocomplete', 'off');
  });

  it('focuses the key field after a provider is selected', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    render(<ModelGate />);

    fireEvent.click(await screen.findByRole('button', { name: /anthropic/i }));
    const key = await screen.findByLabelText(/api key for anthropic/i);

    await waitFor(() => expect(document.activeElement).toBe(key));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
  });

  it('shows "no working model yet" when nothing is keyed or local', async () => {
    render(<ModelGate />);
    expect(await screen.findByText(/no working model yet/i)).toBeInTheDocument();
  });

  it('shows a retry path when the provider catalog fails on first run', async () => {
    mocks.adapter.getProviders.mockRejectedValueOnce(new Error('sidecar offline'));
    render(<ModelGate />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/providers could not be loaded/i);
    expect(screen.queryByRole('button', { name: /anthropic/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^retry$/i }));

    await waitFor(() => expect(mocks.adapter.getProviders).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('button', { name: /anthropic/i })).toBeInTheDocument();
  });

  it('a keyed provider settles on ONE honest verdict — never the empty "no working model yet" state', async () => {
    // Wave V single-truth: the mount probe for the keyed provider is
    // network-degraded (valid, not verified — the beforeEach default), so the ONE
    // verdict is the honest neutral and the empty state never paints. The prior
    // "you have a working model" key-presence flash (only visible pre-probe) is gone.
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    render(<ModelGate />);
    expect(await screen.findByText(/verify your key just now/i)).toBeInTheDocument();
    expect(screen.queryByText(/no working model yet/i)).not.toBeInTheDocument();
  });

  it('validates a key live, saves it to the vault, fires onModelReady, and reports "verified"', async () => {
    const onModelReady = vi.fn();
    render(<ModelGate onModelReady={onModelReady} />);
    await selectProviderAndType(/anthropic/i, 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.setProviderKey).toHaveBeenCalledWith('anthropic', 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx'));
    expect(mocks.adapter.testApiKey).toHaveBeenCalledWith('anthropic', 'sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxxx', { live: true });
    expect(onModelReady).toHaveBeenCalled();
    // F3: the save confirmation AND the banner now both read "verified" — assert
    // the specific saved-state line to disambiguate.
    expect(await screen.findByText(/verified and saved/i)).toBeInTheDocument();
  });

  it('saving the first cloud key also selects that provider default model', async () => {
    const onModelReady = vi.fn();
    mocks.adapter.getProviders.mockResolvedValue(
      providersResp({
        id: 'openai',
        hasKey: false,
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
      }),
    );
    render(<ModelGate onModelReady={onModelReady} />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({ defaultModel: 'gpt-4o' }));
    expect(onModelReady).toHaveBeenCalledWith('gpt-4o');
  });

  it('saving the first cloud key also selects its model when a local model is available', async () => {
    mocks.adapter.getProviders.mockResolvedValue(
      providersResp({
        id: 'openai',
        hasKey: false,
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
      }),
    );
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({
      servers: [{ id: 'ollama' }],
      ollamaInstalled: true,
      totalLocalModels: 1,
    });
    render(<ModelGate />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({ defaultModel: 'gpt-4o' }));
  });

  it('keeps a known local model primary when the new cloud key is only format-validated', async () => {
    mocks.adapter.getProviders.mockResolvedValue(
      providersResp({
        id: 'openai',
        hasKey: false,
        models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
      }),
    );
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({
      servers: [{ id: 'ollama' }],
      ollamaInstalled: true,
      totalLocalModels: 1,
    });
    mocks.adapter.testApiKey.mockResolvedValue({ valid: true, verified: false });
    render(<ModelGate />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.setProviderKey).toHaveBeenCalledWith(
      'openai',
      'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
    ));
    expect(mocks.adapter.setProviderKey).not.toHaveBeenCalledWith(
      'openai',
      'sk-xxxxxxxxxxxxxxxxxxxxxxxx',
      undefined,
      'gpt-4o',
    );
    expect(await screen.findByText(/local model stays primary/i)).toBeInTheDocument();
  });

  it('saving an additional cloud key does not silently switch the workspace default model', async () => {
    mocks.adapter.getProviders.mockResolvedValue(
      providersResp(
        {
          id: 'anthropic',
          hasKey: true,
          models: [{ id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6' }],
        },
        {
          id: 'openai',
          hasKey: false,
          models: [{ id: 'gpt-4o', name: 'GPT-4o' }],
        },
      ),
    );
    render(<ModelGate />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.setProviderKey).toHaveBeenCalledWith('openai', 'sk-xxxxxxxxxxxxxxxxxxxxxxxx'));
  });

  it('a format-only valid key (not live-verified) saves but does NOT claim "verified"', async () => {
    mocks.adapter.testApiKey.mockResolvedValue({ valid: true, verified: false });
    render(<ModelGate />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    await waitFor(() => expect(mocks.adapter.setProviderKey).toHaveBeenCalled());
    expect(await screen.findByText(/looks valid/i)).toBeInTheDocument();
    expect(screen.queryByText(/✓ verified/i)).not.toBeInTheDocument();
  });

  it('a rejected key shows the error and never writes to the vault', async () => {
    const onModelReady = vi.fn();
    mocks.adapter.testApiKey.mockResolvedValue({ valid: false, verified: true, error: 'Key was rejected by the provider (401/403).' });
    render(<ModelGate onModelReady={onModelReady} />);
    await selectProviderAndType(/anthropic/i, 'sk-ant-deadbeefdeadbeefdeadbeef');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/rejected/i);
    expect(mocks.adapter.setProviderKey).not.toHaveBeenCalled();
    expect(onModelReady).not.toHaveBeenCalled();
  });

  // ── F3: probe-backed banner ──
  it('probes the stored key and names the provider that confirmed it', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: true });
    render(<ModelGate />);
    // Honest copy: names the verified PROVIDER, not "the model" (the probe
    // checks a provider key, not the workspace chat's configured model).
    expect(await screen.findByText(/anthropic key verified/i)).toBeInTheDocument();
    expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('anthropic');
  });

  it('a rejected stored key shows the honest "not responding" banner and opens the provider key input', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: false, verified: true, error: 'rejected' });
    render(<ModelGate />);
    // Banner-specific copy — the Wave P provider tile ALSO carries "not
    // responding" now, so target the unique banner phrase to stay unambiguous.
    expect(await screen.findByText(/key found but not responding/i)).toBeInTheDocument();
    // Grid auto-opened on the offending provider → its key input is visible.
    expect(await screen.findByLabelText(/api key for anthropic/i)).toBeInTheDocument();
  });

  it('does not probe the default model or provider keys when nothing is keyed', async () => {
    mocks.adapter.probeModel.mockResolvedValue({
      model: 'claude-sonnet-4-6',
      configured: true,
      verified: false,
      rejected: true,
    });
    render(<ModelGate />);
    expect(await screen.findByText(/no working model yet/i)).toBeInTheDocument();
    expect(mocks.adapter.probeModel).not.toHaveBeenCalled();
    expect(mocks.adapter.probeProvider).not.toHaveBeenCalled();
  });

  it('keeps router failure distinct from key-save success and offers an inline retry', async () => {
    const onModelReady = vi.fn();
    mocks.adapter.setProviderKey.mockResolvedValue({
      router: {
        managed: true,
        ready: false,
        port: 4000,
        models: [],
        unavailableProviders: ['openai'],
        error: 'Provider catalog is temporarily unavailable.',
      },
    });
    render(<ModelGate onModelReady={onModelReady} />);
    await selectProviderAndType(/openai/i, 'sk-xxxxxxxxxxxxxxxxxxxxxxxx');
    fireEvent.click(screen.getByRole('button', { name: /validate & save/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/key saved, but models are not ready/i);
    expect(onModelReady).not.toHaveBeenCalled();
    expect(screen.queryByText(/you.re ready to go/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /retry router/i }));
    await waitFor(() => expect(mocks.adapter.restartModelRouter).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onModelReady).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/models are not ready/i)).not.toBeInTheDocument();
    expect(await screen.findByText(/you.re ready to go/i)).toBeInTheDocument();
  });

  it('a network-degraded probe (valid, not verified) settles on the honest neutral, never an over-claim', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: false });
    render(<ModelGate />);
    // Wave V single-truth: the ONE verdict is the honest "couldn’t verify … just
    // now" — it must NOT over-claim "verified" nor "you’re ready to go" off a key
    // it could not confirm (the old wording only appeared as a pre-probe flash).
    expect(await screen.findByText(/verify your key just now/i)).toBeInTheDocument();
    expect(screen.queryByText(/key verified/i)).toBeNull();
    expect(screen.queryByText(/ready to go/i)).toBeNull();
  });

  // ── MODEL-GATE: probe the workspace's actual default model ──
  it('probes the default model on mount and names it when verified', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: 'claude-sonnet-4-6', configured: true, verified: true });
    render(<ModelGate />);
    expect(await screen.findByText(/model verified \(claude-sonnet-4-6\)/i)).toBeInTheDocument();
    expect(mocks.adapter.probeModel).toHaveBeenCalled();
    // The default-model probe short-circuits the per-provider fallback.
    expect(mocks.adapter.probeProvider).not.toHaveBeenCalled();
  });

  it('a rejected default model shows the "not responding" banner and opens the key input', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeModel.mockResolvedValue({ model: 'claude-sonnet-4-6', configured: true, verified: false, rejected: true });
    render(<ModelGate />);
    expect(await screen.findByText(/not responding/i)).toBeInTheDocument();
    // Grid auto-opened on the keyed provider → its key input is visible.
    expect(await screen.findByLabelText(/api key for anthropic/i)).toBeInTheDocument();
  });

  it('makes Fix it now actionable when a rejected stale model has no catalog owner', async () => {
    const compatibleModel = 'openai-compatible/qwen3.8-flash-next';
    mocks.adapter.getProviders.mockResolvedValue(providersResp(
      { id: 'anthropic', hasKey: true, models: [{ id: 'anthropic/current', name: 'Current' }] },
      {
        id: 'openai-compatible',
        hasKey: false,
        requiresKey: false,
        baseUrl: 'http://10.33.0.153:4000/v1',
        modelsSource: 'provider-api',
        models: [{ id: compatibleModel, name: 'Qwen 3.8 Flash Next' }],
      },
    ));
    mocks.adapter.probeModel.mockResolvedValue({
      model: 'retired-provider/deleted-model',
      configured: true,
      verified: false,
      rejected: true,
    });
    render(<ModelGate />);

    expect(await screen.findByText(/key found but not responding/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /openai-compatible/i }));
    expect(await screen.findByLabelText(/endpoint url/i)).toHaveValue('http://10.33.0.153:4000/v1');
    fireEvent.click(screen.getByRole('button', { name: /fix it now/i }));

    const keyInput = await screen.findByLabelText(/api key for anthropic/i);
    await waitFor(() => expect(document.activeElement).toBe(keyInput));
  });

  it('falls back to the per-provider key probe when no default model is configured', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    // probeModel default → configured:false. The stored anthropic key verifies.
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: true });
    render(<ModelGate />);
    expect(await screen.findByText(/anthropic key verified/i)).toBeInTheDocument();
    expect(mocks.adapter.probeModel).toHaveBeenCalled();
    expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('anthropic');
  });

  it('installs and starts Waggle’s managed runtime without Docker or a system Ollama install', async () => {
    mocks.adapter.getLocalInferenceStatus
      .mockResolvedValueOnce({
        ...noLocal,
        servers: [],
        ollamaInstalled: false,
        ollamaRunning: false,
        managedRuntime: {
          ...noLocal.managedRuntime,
          installed: false,
          running: false,
          version: null,
          downloadRequired: true,
        },
      })
      .mockResolvedValue(noLocal);
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('tab', { name: /local model/i }));

    expect(await screen.findByText(/1\.4 GB/i)).toBeInTheDocument();
    expect(screen.getByText(/no Docker, administrator access, or system Ollama install required/i)).toBeInTheDocument();
    expect(screen.queryByText(/install Ollama to run models/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^install runtime$/i }));

    await waitFor(() => expect(mocks.adapter.bootstrapLocalRuntime).toHaveBeenCalledOnce());
    expect(await screen.findByText(/private runtime ready/i)).toBeInTheDocument();
    expect(await screen.findByLabelText(/download and verify a model/i)).toBeInTheDocument();
  });

  it('does not offer a fake managed install on an unsupported platform', async () => {
    mocks.adapter.getLocalInferenceStatus.mockResolvedValue({
      ...noLocal,
      servers: [],
      ollamaInstalled: false,
      ollamaRunning: false,
      managedRuntime: {
        ...noLocal.managedRuntime,
        supported: false,
        installed: false,
        running: false,
        version: null,
        downloadRequired: true,
        reason: 'No managed Ollama artifact for linux/x64',
      },
    });
    render(<ModelGate />);
    fireEvent.click(await screen.findByRole('tab', { name: /local model/i }));

    expect(await screen.findByText(/no managed Ollama artifact for linux\/x64/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install runtime/i })).not.toBeInTheDocument();
  });

  it('downloads, generation-verifies, and selects the local model before reporting ready', async () => {
    const onModelReady = vi.fn();
    render(<ModelGate onModelReady={onModelReady} />);
    fireEvent.click(await screen.findByRole('tab', { name: /local model/i }));
    const input = await screen.findByLabelText(/download and verify a model/i);
    fireEvent.change(input, { target: { value: 'llama3.2' } });
    fireEvent.click(screen.getByRole('button', { name: /^install model$/i }));

    await waitFor(() => expect(mocks.adapter.pullLocalModel).toHaveBeenCalledWith('llama3.2'));
    expect(mocks.adapter.saveSettings).toHaveBeenCalledWith({ defaultModel: 'ollama/llama3.2:latest' });
    expect(await screen.findByText(/installed and verified "llama3\.2:latest"/i)).toBeInTheDocument();
    expect(onModelReady).toHaveBeenCalledWith('ollama/llama3.2:latest');
  });

  it('does not report ready when the verified model cannot be selected as default', async () => {
    const onModelReady = vi.fn();
    mocks.adapter.saveSettings.mockRejectedValueOnce(new Error('settings unavailable'));
    render(<ModelGate onModelReady={onModelReady} />);
    fireEvent.click(await screen.findByRole('tab', { name: /local model/i }));
    const input = await screen.findByLabelText(/download and verify a model/i);
    fireEvent.change(input, { target: { value: 'llama3.2' } });
    fireEvent.click(screen.getByRole('button', { name: /^install model$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not select it as the default/i);
    expect(onModelReady).not.toHaveBeenCalled();
  });
});
