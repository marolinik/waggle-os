/**
 * EmbeddingRoutingCard (steal #10) — provider picker + live status + reprobe.
 * Verifies: tier-scoped options, key-gating (openai disabled without a key),
 * reprobe calls the API, provider change persists + surfaces the restart hint,
 * and the env-override state disables the picker.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getEmbeddingStatus: vi.fn(),
    setEmbeddingProvider: vi.fn(),
    reprobeEmbedding: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({
  adapter: mocks.adapter,
  // Card uses `instanceof AdapterHttpError` in its catch — provide a real class.
  AdapterHttpError: class AdapterHttpError extends Error {},
  default: vi.fn(),
}));

const baseStatus = {
  activeProvider: 'mock',
  availableProviders: ['mock'],
  dimensions: 1024,
  modelName: 'deterministic-mock',
  configuredProvider: 'auto',
  envOverride: false,
};

const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', hasKey: false, badge: null, keyUrl: null, requiresKey: true, models: [] },
  { id: 'anthropic', name: 'Anthropic', hasKey: true, badge: null, keyUrl: null, requiresKey: true, models: [] },
];

async function renderCard(tier: 'FREE' | 'TEAMS' = 'FREE') {
  const { default: EmbeddingRoutingCard } = await import('@/components/os/EmbeddingRoutingCard');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  render(
    <TooltipProvider>
      <EmbeddingRoutingCard providers={PROVIDERS as never} tier={tier} />
    </TooltipProvider>,
  );
}

beforeEach(() => {
  mocks.adapter.getEmbeddingStatus.mockResolvedValue({ ...baseStatus });
  mocks.adapter.setEmbeddingProvider.mockResolvedValue({ ...baseStatus, configuredProvider: 'inprocess', restartRequired: true });
  mocks.adapter.reprobeEmbedding.mockResolvedValue({ ...baseStatus });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EmbeddingRoutingCard', () => {
  it('names the embeddings information control', async () => {
    await renderCard('FREE');
    expect(screen.getByRole('button', { name: 'About memory embeddings' })).toBeInTheDocument();
  });

  it('renders the tier-allowed provider options (FREE has no litellm)', async () => {
    await renderCard('FREE');
    const select = await screen.findByTestId('embedding-provider-select');
    const values = Array.from(select.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);
    expect(values).toEqual(expect.arrayContaining(['auto', 'inprocess', 'ollama', 'voyage', 'openai']));
    expect(values).not.toContain('litellm');
    expect(values).not.toContain('mock');
  });

  it('includes litellm on TEAMS', async () => {
    await renderCard('TEAMS');
    const select = await screen.findByTestId('embedding-provider-select');
    const values = Array.from(select.querySelectorAll('option')).map(o => (o as HTMLOptionElement).value);
    expect(values).toContain('litellm');
  });

  it('disables the openai option when its vault key is missing', async () => {
    await renderCard('FREE');
    const select = await screen.findByTestId('embedding-provider-select');
    const openai = Array.from(select.querySelectorAll('option')).find(
      o => (o as HTMLOptionElement).value === 'openai',
    ) as HTMLOptionElement;
    expect(openai.disabled).toBe(true);
  });

  it('shows the active provider from the status probe', async () => {
    await renderCard('FREE');
    expect(await screen.findByTestId('embedding-active-provider')).toHaveTextContent(/mock/i);
  });

  it('Reprobe calls the API', async () => {
    await renderCard('FREE');
    fireEvent.click(await screen.findByTestId('embedding-reprobe'));
    await waitFor(() => expect(mocks.adapter.reprobeEmbedding).toHaveBeenCalledTimes(1));
  });

  it('changing the provider persists and surfaces the restart hint', async () => {
    await renderCard('FREE');
    const select = await screen.findByTestId('embedding-provider-select');
    fireEvent.change(select, { target: { value: 'inprocess' } });
    await waitFor(() => expect(mocks.adapter.setEmbeddingProvider).toHaveBeenCalledWith('inprocess'));
    expect(await screen.findByTestId('embedding-restart-hint')).toBeInTheDocument();
  });

  it('disables the picker and hints when an env override is active', async () => {
    mocks.adapter.getEmbeddingStatus.mockResolvedValue({ ...baseStatus, envOverride: true });
    await renderCard('FREE');
    const select = await screen.findByTestId('embedding-provider-select');
    expect((select as HTMLSelectElement).disabled).toBe(true);
    expect(screen.getByTestId('embedding-env-hint')).toBeInTheDocument();
  });
});
