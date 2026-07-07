/**
 * PR5 Phase B — Settings reskin/reconcile pins:
 *  - Settings opens on the Models tab with the shared ModelGate leading (D: "Models leads").
 *  - Billing rail tab renamed to "Plan" (D8).
 *  - The "Show" disclosure control (D6, anchored to the foot of the tab rail)
 *    drives the rail, with Advanced surfacing only at Everything (D7).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getSettings: vi.fn().mockResolvedValue({}),
    getPermissions: vi.fn().mockResolvedValue({ defaultAutonomy: 'normal', externalGates: [] }),
    getTeamStatus: vi.fn().mockResolvedValue({ connected: false }),
    getTelemetryStatus: vi.fn().mockResolvedValue({ enabled: false, totalEvents: 0 }),
    getTier: vi.fn().mockResolvedValue({ tier: 'FREE', capabilities: {}, usage: {} }),
    getServerUrl: vi.fn().mockReturnValue('http://127.0.0.1:3333'),
    getProviders: vi.fn().mockResolvedValue({ providers: [], search: [], activeSearch: 'duckduckgo' }),
    getLocalInferenceStatus: vi.fn().mockResolvedValue({ servers: [], ollamaInstalled: false, totalLocalModels: 0 }),
    // MODEL-GATE: the mount probe calls these too — absent, the probe's async
    // closure throws (TypeError: not a function) as an UNHANDLED rejection that
    // poisons unrelated tests in the full-suite run. configured:false = the
    // probe's honest "nothing to check" idle path.
    probeModel: vi.fn().mockResolvedValue({ configured: false }),
    probeProvider: vi.fn().mockResolvedValue({ configured: false, valid: false, verified: false }),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

async function renderSettings() {
  const { default: SettingsApp } = await import('@/components/os/apps/SettingsApp');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  const { MemoryRouter } = await import('react-router-dom');
  render(
    // SettingsApp reads `?tab=` via useSearchParams (PR7a/D12) — it is a routed
    // surface (SettingsRoute mounts it inside BrowserRouter), so tests must
    // provide a Router context.
    <MemoryRouter>
      <TooltipProvider>
        <SettingsApp />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('PR5 Settings reskin', () => {
  it('opens on the Models tab with the ModelGate leading (no click needed)', async () => {
    await renderSettings();
    expect(await screen.findByRole('tablist', { name: /how to add a model/i })).toBeInTheDocument();
  });

  it('renames the Billing rail tab to "Plan" (D8)', async () => {
    await renderSettings();
    expect(await screen.findByRole('tab', { name: /^plan$/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /^billing$/i })).toBeNull();
  });

  it('the Show control gates Advanced to Everything (D6 + D7)', async () => {
    await renderSettings();
    await screen.findByRole('group', { name: /settings detail level/i });
    // Default disclosure (Essential) hides Advanced from the rail.
    expect(screen.queryByRole('tab', { name: /advanced/i })).toBeNull();
    // Switch to Everything → Advanced appears.
    fireEvent.click(screen.getByRole('button', { name: /everything/i }));
    expect(await screen.findByRole('tab', { name: /advanced/i })).toBeInTheDocument();
  });
});
