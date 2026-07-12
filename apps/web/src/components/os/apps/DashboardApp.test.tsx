import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Workspace } from '@/lib/types';
import DashboardApp from './DashboardApp';

const mocks = vi.hoisted(() => ({
  adapter: {
    getServerUrl: vi.fn(),
    getMemoryStats: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

const workspace: Workspace = {
  id: 'workspace-alpha',
  name: 'Alpha Workspace',
  group: 'Personal',
  status: 'active',
  persona: 'general-purpose',
  updatedAt: '2026-07-09T08:00:00.000Z',
  hue: 42,
  health: 'healthy',
};

describe('DashboardApp', () => {
  beforeEach(() => {
    mocks.adapter.getServerUrl.mockReturnValue('http://localhost:17375');
    mocks.adapter.getMemoryStats.mockResolvedValue({ total: { frames: 0, entities: 0, relations: 0 } });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ tasks: [] }),
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('scopes workspace tile transitions to explicit properties', async () => {
    render(
      <TooltipProvider>
        <DashboardApp
          workspaces={[workspace]}
          activeWorkspaceId="workspace-alpha"
          onSelectWorkspace={vi.fn()}
          onCreateWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    );

    const label = await screen.findByText('Alpha Workspace');
    const tile = label.closest('button');
    expect(tile?.className).not.toContain('transition-all');
    expect(tile?.className).toContain('transition-[background-color,border-color,box-shadow]');
  });
});
