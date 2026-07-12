/**
 * Phase 3B (S06) — Skills Hub component behaviour over a mocked adapter:
 * My Skills per-skill table, Custom-tab derivation (user-authored = not in
 * any catalog), the C37 preview-only Test rendering, and pack-tab behaviour.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    // ServiceProvider's mount connect() — resolves so `connecting` settles
    // and the app's connect-gated load() fires.
    connect: vi.fn().mockResolvedValue(undefined),
    getSkills: vi.fn(),
    getStarterPacks: vi.fn(),
    getMarketplacePacks: vi.fn(),
    getCapabilityPacks: vi.fn(),
    testSkill: vi.fn(),
    installSkill: vi.fn(),
    installMarketplacePack: vi.fn(),
    createSkill: vi.fn(),
    updateSkill: vi.fn(),
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import CapabilitiesApp from '@/components/os/apps/CapabilitiesApp';
import { ServiceProvider } from '@/providers/ServiceProvider';

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><CapabilitiesApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getSkills.mockResolvedValue([
    { id: 'deep-research', name: 'deep-research', preview: 'Research anything deeply', installed: true },
    { id: 'my-custom', name: 'my-custom', preview: 'A skill I authored', installed: true },
  ]);
  mocks.adapter.getStarterPacks.mockResolvedValue([
    { id: 'deep-research', name: 'deep-research', description: 'Starter research skill', category: 'research', trust: 'verified', installed: true, skills: [] },
  ]);
  mocks.adapter.getMarketplacePacks.mockResolvedValue([]);
  mocks.adapter.getCapabilityPacks.mockResolvedValue([]);
});
afterEach(cleanup);

describe('CapabilitiesApp — Skills Hub', () => {
  it('a11y: search control exposes stable form metadata', async () => {
    renderApp();
    await screen.findByText('deep-research');

    const search = screen.getByRole('textbox', { name: 'Search skills' });
    expect(search).toHaveAttribute('name', 'skillSearch');
    expect(search).toHaveAttribute('autocomplete', 'off');
  });

  it('renders the My Skills per-skill table from the adapter', async () => {
    renderApp();
    expect(await screen.findByText('deep-research')).toBeInTheDocument();
    expect(screen.getByText('my-custom')).toBeInTheDocument();
    expect(screen.getByText('Research anything deeply')).toBeInTheDocument();
    // Catalog-known skill reads as installed; user-authored one as custom.
    expect(screen.getByText('installed')).toBeInTheDocument();
    expect(screen.getByText('custom')).toBeInTheDocument();
  });

  it('P5/D4: badges an agent-authored skill "agent · review"', async () => {
    mocks.adapter.getSkills.mockResolvedValue([
      { id: 'agent-made', name: 'agent-made', preview: 'Authored by the agent', installed: true, initiator: 'agent', source: 'chat' },
      { id: 'user-made', name: 'user-made', preview: 'Authored by me', installed: true, initiator: 'user' },
    ]);
    renderApp();
    expect(await screen.findByText('agent-made')).toBeInTheDocument();
    // The agent skill carries the review badge; the user skill does not.
    expect(screen.getByText('agent · review')).toBeInTheDocument();
    expect(screen.getAllByText('agent · review')).toHaveLength(1);
    // Review #5: the agent skill must NOT also wear the name-heuristic 'custom'
    // status — provenance supersedes it (D4(iv)). The user skill keeps 'custom'.
    expect(screen.queryAllByText('custom')).toHaveLength(1);
  });

  it('the Custom tab shows only user-authored skills (not in any catalog)', async () => {
    renderApp();
    await screen.findByText('deep-research');

    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByText('my-custom')).toBeInTheDocument();
    expect(screen.queryByText('deep-research')).not.toBeInTheDocument();
  });

  it('marketplace-installed skills classify as marketplace, not Custom ("authored locally")', async () => {
    mocks.adapter.getSkills.mockResolvedValue([
      { id: 'mp-skill', name: 'mp-skill', preview: 'Installed from the marketplace', installed: true },
      { id: 'my-custom', name: 'my-custom', preview: 'A skill I authored', installed: true },
    ]);
    mocks.adapter.getMarketplacePacks.mockResolvedValue([
      { id: 'mp-pack', name: 'mp-pack', description: 'Marketplace pack', category: 'research', trust: 'community', installed: true, skills: ['mp-skill'] },
    ]);
    renderApp();
    await screen.findByText('mp-skill');
    expect(screen.getByText('marketplace')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.getByText('my-custom')).toBeInTheDocument();
    expect(screen.queryByText('mp-skill')).not.toBeInTheDocument();
  });

  it('a failed catalog fetch degrades skills to installed instead of mislabeling them custom', async () => {
    mocks.adapter.getStarterPacks.mockRejectedValueOnce(new Error('getStarterPacks failed: 500'));
    renderApp();
    await screen.findByText('my-custom');

    // No catalog → 'custom' ("not in any catalog") is unprovable; nothing may
    // claim it. The Custom tab must therefore be empty, not polluted.
    expect(screen.queryByText('custom')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    expect(screen.queryByText('my-custom')).not.toBeInTheDocument();
  });

  it('C37: Test renders the injected-prompt preview with the nothing-executed framing', async () => {
    mocks.adapter.testSkill.mockResolvedValue({
      skill: { name: 'deep-research' },
      wouldInject: 'You are a deep researcher. Steps: …',
      wouldInjectLength: 34,
    });
    renderApp();
    await screen.findByText('deep-research');

    fireEvent.click(screen.getByRole('button', { name: 'Test skill deep-research (preview only)' }));

    const preview = await screen.findByTestId('skill-test-preview');
    expect(preview).toHaveTextContent('Test: deep-research');
    expect(preview).toHaveTextContent('You are a deep researcher');
    expect(preview).toHaveTextContent('Preview only — nothing was executed');
    expect(mocks.adapter.testSkill).toHaveBeenCalledWith('deep-research');
  });

  it('the Packs tab shows the catalog grid with installed markers', async () => {
    renderApp();
    await screen.findByText('my-custom');

    fireEvent.click(screen.getByRole('tab', { name: 'Packs' }));
    const card = await screen.findByTestId('skill-pack-card');
    expect(card).toHaveTextContent('deep-research');
    expect(card).toHaveTextContent('Installed');
  });

  it('the Workspace tab states honestly that scope metadata is not exposed yet', async () => {
    renderApp();
    await screen.findByText('my-custom');

    fireEvent.click(screen.getByRole('tab', { name: 'Workspace' }));
    expect(screen.getByText(/No workspace-scoped skills/)).toBeInTheDocument();
    expect(screen.getByText(/scope metadata/)).toBeInTheDocument();
  });

  it('shows an error state with Retry when the skills load fails', async () => {
    mocks.adapter.getSkills.mockRejectedValueOnce(new Error('boom'));
    renderApp();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Failed to load skills');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('deep-research')).toBeInTheDocument();
  });
});
