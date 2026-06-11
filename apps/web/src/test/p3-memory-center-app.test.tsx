/**
 * P3 (D2) — MemoryCenterApp shell + MemoryRoute URL wiring + the
 * WorkspaceDesktop Memory-tab embed (S02-FR2).
 *
 *  - The shell is CONTROLLED: URL (via the route) is the only navigation
 *    authority for mind + view. These tests mount the real route + real shell
 *    with stubbed tab children and assert the URL↔UI contract both ways.
 *  - `/memory` ≡ personal (J08 alignment); unknown :mindScope or ?tab= values
 *    degrade to defaults, never crash.
 *  - WorkspaceDesktopApp's memory tab embeds the per-mind list with
 *    mind='workspace' + consumeDeepLinks=false (the J08 stash belongs to the
 *    /memory route instance).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';
import { consumeDeepLink } from '@/lib/app-deeplink';

const mocks = vi.hoisted(() => ({
  adapter: {
    getWorkspaceContext: vi.fn(),
    getWorkspaceState: vi.fn(),
    getWorkspaceActivity: vi.fn(),
    getTeamMembers: vi.fn(),
    getWorkspaceFiles: vi.fn(),
  },
  shell: {
    activeWorkspaceId: 'w1' as string | null,
    workspaces: [{ id: 'w1', name: 'Alpha' }],
    setContextRailTarget: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));
vi.mock('@/hooks/useRoomState', () => ({ useRoomState: () => ({ workspaceMap: new Map() }) }));
vi.mock('@/hooks/useOnboarding', () => ({ useOnboarding: () => ({ state: { completed: true } }) }));
vi.mock('@/hooks/useMemory', () => ({
  useMemory: () => ({
    frames: [], selectedFrame: null, setSelectedFrame: vi.fn(),
    filters: { searchQuery: '', types: [], minImportance: 0 }, setFilters: vi.fn(),
    deleteFrame: vi.fn(), loading: false, stats: { total: 0, filtered: 0 },
  }),
}));
vi.mock('@/hooks/useKnowledgeGraph', () => ({
  useKnowledgeGraph: () => ({
    nodes: [], edges: [], refresh: vi.fn(), scope: 'current', setScope: vi.fn(),
    loading: false, error: null,
  }),
}));

// Stub the tab children — these tests pin the SHELL contract, not tab internals.
vi.mock('@/components/os/apps/memory/MemoryCenterTab', () => ({
  default: (props: { mind?: string; workspaceId?: string; consumeDeepLinks?: boolean }) => (
    <div
      data-testid="stub-mc-tab"
      data-mind={String(props.mind)}
      data-ws={String(props.workspaceId)}
      data-cdl={String(props.consumeDeepLinks)}
    />
  ),
}));
vi.mock('@/components/os/apps/memory/TimelineTab', () => ({ default: () => <div data-testid="stub-timeline" /> }));
vi.mock('@/components/os/apps/memory/KnowledgeGraphViewer', () => ({ default: () => <div data-testid="stub-graph" /> }));
vi.mock('@/components/os/apps/memory/HarvestTab', () => ({ default: () => <div data-testid="stub-harvest" /> }));
vi.mock('@/components/os/apps/memory/WeaverPanel', () => ({ default: () => <div data-testid="stub-weaver" /> }));
vi.mock('@/components/os/apps/memory/WikiTab', () => ({ default: () => <div data-testid="stub-wiki" /> }));
vi.mock('@/components/os/apps/memory/EvolutionTab', () => ({ default: () => <div data-testid="stub-evolution" /> }));
vi.mock('@/components/os/apps/memory/ImportReminderBanner', () => ({ default: () => null }));

const LocationProbe = () => {
  const loc = useLocation();
  return <div data-testid="loc">{loc.pathname + loc.search}</div>;
};

async function renderRoute(path: string) {
  const { default: MemoryRoute } = await import('@/routes/MemoryRoute');
  render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="memory/:mindScope?" element={<MemoryRoute />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </TooltipProvider>,
  );
}

afterEach(() => { cleanup(); vi.clearAllMocks(); mocks.shell.activeWorkspaceId = 'w1'; consumeDeepLink('memory'); });

describe('MemoryRoute + MemoryCenterApp URL wiring (P3/D2)', () => {
  it('/memory defaults to the personal mind on the Memories view', async () => {
    await renderRoute('/memory');
    const tab = screen.getByTestId('stub-mc-tab');
    expect(tab.getAttribute('data-mind')).toBe('personal');
    expect(screen.getByTestId('memory-mind-personal').getAttribute('aria-pressed')).toBe('true');
  });

  it('/memory/workspace selects the workspace mind with the active workspace', async () => {
    await renderRoute('/memory/workspace');
    const tab = screen.getByTestId('stub-mc-tab');
    expect(tab.getAttribute('data-mind')).toBe('workspace');
    expect(tab.getAttribute('data-ws')).toBe('w1');
    expect(screen.getByTestId('memory-mind-workspace').getAttribute('aria-pressed')).toBe('true');
  });

  it('an unknown :mindScope degrades to personal', async () => {
    await renderRoute('/memory/garbage');
    expect(screen.getByTestId('stub-mc-tab').getAttribute('data-mind')).toBe('personal');
  });

  it('?tab=graph mounts the Graph view and hides the mind pills', async () => {
    await renderRoute('/memory?tab=graph');
    expect(screen.getByTestId('stub-graph')).toBeTruthy();
    expect(screen.queryByTestId('memory-mind-personal')).toBeNull();
    expect(screen.queryByTestId('stub-mc-tab')).toBeNull();
  });

  it('an unknown ?tab= degrades to Memories', async () => {
    await renderRoute('/memory?tab=bogus');
    expect(screen.getByTestId('stub-mc-tab')).toBeTruthy();
  });

  it.each([
    ['timeline', 'stub-timeline'],
    ['harvest', 'stub-harvest'],
    ['weaver', 'stub-weaver'],
    ['wiki', 'stub-wiki'],
    ['evolution', 'stub-evolution'],
  ])('?tab=%s mounts its legacy view (capability preserved)', async (tabId, testId) => {
    await renderRoute(`/memory?tab=${tabId}`);
    expect(screen.getByTestId(testId)).toBeTruthy();
  });

  it('switching minds navigates between /memory and /memory/workspace', async () => {
    await renderRoute('/memory');
    fireEvent.click(screen.getByTestId('memory-mind-workspace'));
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/memory/workspace');
    });
    fireEvent.click(screen.getByTestId('memory-mind-personal'));
    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe('/memory');
    });
  });

  it('?filter= is stashed for the Memories view then STRIPPED from the URL (one-shot intent)', async () => {
    await renderRoute('/memory?filter=unreviewed');
    // The route stashed it for the (stubbed) tab to consume…
    expect(consumeDeepLink('memory')).toEqual(expect.objectContaining({ filter: 'unreviewed' }));
    // …and the URL stops advertising it, so refresh/share can't replay a stale filter.
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/memory'));
  });

  it('a ?filter= aimed at a legacy tab is dropped, never stranded in the stash', async () => {
    await renderRoute('/memory?tab=graph&filter=unreviewed');
    expect(consumeDeepLink('memory')).toBeNull();
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/memory?tab=graph'));
  });

  it('switching views writes/clears ?tab= (URL is the single authority)', async () => {
    await renderRoute('/memory');
    fireEvent.click(screen.getByText('Graph'));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/memory?tab=graph'));
    expect(screen.getByTestId('stub-graph')).toBeTruthy();

    fireEvent.click(screen.getByText('Memories'));
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/memory'));
    expect(screen.getByTestId('stub-mc-tab')).toBeTruthy();
  });

  it('the workspace pill is inert without an active workspace', async () => {
    mocks.shell.activeWorkspaceId = null;
    await renderRoute('/memory');
    const pill = screen.getByTestId('memory-mind-workspace');
    expect(pill.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(pill);
    expect(screen.getByTestId('loc').textContent).toBe('/memory');
  });
});

describe('WorkspaceDesktopApp memory tab embed (P3/D2, S02-FR2)', () => {
  it('renders the workspace-mind list instead of the placeholder', async () => {
    mocks.adapter.getWorkspaceContext.mockResolvedValue({
      workspace: { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' },
      stats: { memoryCount: 2, sessionCount: 1, fileCount: 0 },
    });
    mocks.adapter.getWorkspaceState.mockResolvedValue({ pending: [], blocked: [] });
    mocks.adapter.getWorkspaceActivity.mockResolvedValue([]);
    mocks.adapter.getTeamMembers.mockResolvedValue([]);
    mocks.adapter.getWorkspaceFiles.mockResolvedValue([]);

    const { default: WorkspaceDesktopApp } = await import('@/components/os/apps/WorkspaceDesktopApp');
    render(<WorkspaceDesktopApp workspaceId="w1" workspaceName="Alpha" activeTab="memory" />);

    await waitFor(() => expect(screen.getByTestId('ws-memory-tab')).toBeTruthy());
    const tab = screen.getByTestId('stub-mc-tab');
    expect(tab.getAttribute('data-mind')).toBe('workspace');
    expect(tab.getAttribute('data-ws')).toBe('w1');
    expect(tab.getAttribute('data-cdl')).toBe('false');
  });
});
