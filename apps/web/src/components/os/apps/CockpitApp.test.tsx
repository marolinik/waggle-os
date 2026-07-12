import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getSystemHealth: vi.fn(),
    getAgentCost: vi.fn(),
    getConnectors: vi.fn(),
    getCronJobs: vi.fn(),
    getVault: vi.fn(),
    getCapabilitiesStatus: vi.fn(),
    getAuditInstalls: vi.fn(),
    getCostSummary: vi.fn(),
    getWeaverStatus: vi.fn(),
    getEventStats: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/components/os/apps/cockpit/ComplianceDashboard', () => ({
  default: () => <div data-testid="compliance-dashboard" />,
}));

import CockpitApp from './CockpitApp';

beforeEach(() => {
  mocks.adapter.getSystemHealth.mockResolvedValue({ status: 'ok', uptime: 3600, services: [] });
  mocks.adapter.getAgentCost.mockResolvedValue({ totalCost: 0, totalTokens: 0 });
  mocks.adapter.getConnectors.mockResolvedValue([]);
  mocks.adapter.getCronJobs.mockResolvedValue([]);
  mocks.adapter.getVault.mockResolvedValue({ secrets: [] });
  mocks.adapter.getCapabilitiesStatus.mockResolvedValue({});
  mocks.adapter.getAuditInstalls.mockResolvedValue([]);
  mocks.adapter.getCostSummary.mockResolvedValue({ totalTokens: 0, estimatedCost: 0 });
  mocks.adapter.getWeaverStatus.mockResolvedValue({
    personalMind: { lastConsolidation: null, lastDecay: null, timerActive: false },
    workspaces: [],
    checkedAt: new Date().toISOString(),
  });
  mocks.adapter.getEventStats.mockResolvedValue({ byType: {}, total: 0 });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CockpitApp action names', () => {
  it('names the refresh action', async () => {
    render(<CockpitApp />);

    expect(await screen.findByRole('button', { name: /refresh cockpit/i })).toBeInTheDocument();
  });
});
