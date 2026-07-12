import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import MissionControlApp from '@/components/os/apps/MissionControlApp';
import type { FleetSession } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getFleet: vi.fn(),
    getTeamMembers: vi.fn(),
    getTeamActivity: vi.fn(),
    detectTools: vi.fn(),
    fleetAction: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

const session = (workspaceId: string, workspaceName: string, status: FleetSession['status']): FleetSession => ({
  workspaceId,
  workspaceName,
  status,
  duration: 120,
  toolCount: 2,
  model: 'gpt-4.1',
  tokenUsage: 1234,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getFleet.mockResolvedValue([
    session('w-active', 'Alpha Workspace', 'active'),
    session('w-paused', 'Beta Workspace', 'paused'),
  ]);
  mocks.adapter.getTeamMembers.mockResolvedValue([]);
  mocks.adapter.getTeamActivity.mockResolvedValue([]);
  mocks.adapter.detectTools.mockResolvedValue({ tools: [] });
  mocks.adapter.fleetAction.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('MissionControlApp accessibility', () => {
  it('names icon-only refresh and fleet action controls with visible focus rings', async () => {
    render(<MissionControlApp onSpawnOpen={vi.fn()} />);

    await screen.findByText('Alpha Workspace');

    const refresh = screen.getByRole('button', { name: /refresh mission control/i });
    const pause = screen.getByRole('button', { name: /pause alpha workspace/i });
    const resume = screen.getByRole('button', { name: /resume beta workspace/i });
    const stopAlpha = screen.getByRole('button', { name: /stop alpha workspace/i });
    const stopBeta = screen.getByRole('button', { name: /stop beta workspace/i });

    for (const control of [refresh, pause, resume, stopAlpha, stopBeta]) {
      expect(control.className).toContain('focus-visible:ring-2');
      expect(control.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    }
  });
});
