/**
 * PR5 Phase A — the shared ModelGate (Onboarding step-3 hard gate AND the
 * Settings→Models lead). Two tabs: paste+live-validate a cloud key → vault, OR
 * detect/pull a local model. Honesty: "verified" only when the live probe confirmed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getProviders: vi.fn(),
    getLocalInferenceStatus: vi.fn(),
    testApiKey: vi.fn(),
    setProviderKey: vi.fn(),
    pullLocalModel: vi.fn(),
    probeProvider: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import { ModelGate } from './ModelGate';

const providersResp = (...defs: { id: string; hasKey: boolean }[]) => ({
  providers: defs.map((d) => ({
    id: d.id,
    name: d.id.charAt(0).toUpperCase() + d.id.slice(1),
    hasKey: d.hasKey,
    badge: null,
    keyUrl: 'https://example.com/keys',
    requiresKey: d.id !== 'ollama',
    models: [],
  })),
  search: [],
  activeSearch: 'duckduckgo',
});

const noLocal = { servers: [], ollamaInstalled: false, totalLocalModels: 0 };

beforeEach(() => {
  mocks.adapter.getProviders.mockResolvedValue(
    providersResp({ id: 'anthropic', hasKey: false }, { id: 'openai', hasKey: false }, { id: 'ollama', hasKey: false }),
  );
  mocks.adapter.getLocalInferenceStatus.mockResolvedValue(noLocal);
  mocks.adapter.testApiKey.mockResolvedValue({ valid: true, verified: true });
  mocks.adapter.setProviderKey.mockResolvedValue(undefined);
  mocks.adapter.pullLocalModel.mockResolvedValue({ ok: true });
  // F3: default probe = network-degrade neutral (valid, not verified) so the
  // key-presence tests keep their "You have a working model" wording.
  mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: false });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function selectProviderAndType(providerName: RegExp, key: string) {
  fireEvent.click(await screen.findByRole('button', { name: providerName }));
  const input = await screen.findByLabelText(/api key for/i);
  fireEvent.change(input, { target: { value: key } });
}

describe('ModelGate', () => {
  it('renders a chip per key-requiring provider, excluding the keyless local runtime (ollama)', async () => {
    render(<ModelGate />);
    expect(await screen.findByRole('button', { name: /anthropic/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /openai/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^ollama$/i })).not.toBeInTheDocument();
  });

  it('shows "no working model yet" when nothing is keyed or local', async () => {
    render(<ModelGate />);
    expect(await screen.findByText(/no working model yet/i)).toBeInTheDocument();
  });

  it('reports a working model when a provider already has a key', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    render(<ModelGate />);
    expect(await screen.findByText(/working model/i)).toBeInTheDocument();
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
  it('probes the stored key and shows "Model verified" when the provider confirms it', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: true });
    render(<ModelGate />);
    expect(await screen.findByText(/model verified/i)).toBeInTheDocument();
    expect(mocks.adapter.probeProvider).toHaveBeenCalledWith('anthropic');
  });

  it('a rejected stored key shows the honest "not responding" banner and opens the provider key input', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: false, verified: true, error: 'rejected' });
    render(<ModelGate />);
    expect(await screen.findByText(/not responding/i)).toBeInTheDocument();
    // Grid auto-opened on the offending provider → its key input is visible.
    expect(await screen.findByLabelText(/api key for anthropic/i)).toBeInTheDocument();
  });

  it('does not probe when nothing is keyed', async () => {
    render(<ModelGate />);
    expect(await screen.findByText(/no working model yet/i)).toBeInTheDocument();
    expect(mocks.adapter.probeProvider).not.toHaveBeenCalled();
  });

  it('a network-degraded probe (valid, not verified) keeps the neutral key-found wording', async () => {
    mocks.adapter.getProviders.mockResolvedValue(providersResp({ id: 'anthropic', hasKey: true }));
    mocks.adapter.probeProvider.mockResolvedValue({ configured: true, valid: true, verified: false });
    render(<ModelGate />);
    expect(await screen.findByText(/you have a working model/i)).toBeInTheDocument();
    expect(screen.queryByText(/model verified/i)).toBeNull();
  });

  it('the local tab pulls a model and fires onModelReady', async () => {
    const onModelReady = vi.fn();
    render(<ModelGate onModelReady={onModelReady} />);
    fireEvent.click(await screen.findByRole('tab', { name: /local model/i }));
    const input = await screen.findByLabelText(/pull a model/i);
    fireEvent.change(input, { target: { value: 'llama3.2' } });
    fireEvent.click(screen.getByRole('button', { name: /^pull$/i }));

    await waitFor(() => expect(mocks.adapter.pullLocalModel).toHaveBeenCalledWith('llama3.2'));
    expect(onModelReady).toHaveBeenCalled();
  });
});
