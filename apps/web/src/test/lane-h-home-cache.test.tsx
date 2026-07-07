/**
 * Lane H — home cache-first paint + silent-refresh reconciliation + one
 * briefing truth (Path-to-9 Pillar 2.1–2.4).
 *
 * These are the TESTED contracts of the pillar's heart:
 *  - item 1: a warm disk cache paints content immediately (no skeleton), then
 *    refreshes silently; a refresh failure keeps the last-good content.
 *  - item 2: fresh data over a cache-first paint does NOT remount above-the-fold
 *    elements (key stability) and the changed count carries the delta-pulse class.
 *  - item 3: the hero workspace count === the modal workspace count from ONE mock.
 *  - item 4: the recall "I remember" strip renders INSIDE the home hero.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import { resetBriefingSource } from '@/lib/briefing-source';
import { writeHomeCache, clearHomeCache } from '@/lib/home-cache';
import { workspaceCounts } from '@/lib/workspace-counts';
import type { HomeBriefing, RecentWorkspaceCard } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getHomeBriefing: vi.fn(),
    getHomeOvernight: vi.fn(),
    quickCapture: vi.fn(),
    getWorkspaces: vi.fn(),
    searchMemory: vi.fn(),
    getMemoryStats: vi.fn(),
    getWorkspaceContext: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/providers/ServiceProvider', () => ({
  useService: () => ({ connecting: false, connected: true }),
  ServiceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => false }));
vi.mock('@/providers/ShellContext', () => ({
  useShell: () => ({ patchWorkspace: vi.fn().mockResolvedValue(true), deleteWorkspace: vi.fn().mockResolvedValue(true) }),
}));

function wsCard(id: string, name: string, pendingCount = 0): RecentWorkspaceCard {
  return { id, name, group: 'Personal', lastActive: '2026-07-06T09:00:00.000Z', pendingCount };
}

function makeBriefing(over: Partial<HomeBriefing> = {}): HomeBriefing {
  return {
    greeting: 'Welcome back, Marko',
    date: '2026-07-07T08:00:00.000Z',
    recentWorkspaces: [],
    suggestedActions: [],
    upNext: [],
    isFirstRun: false,
    needsReviewCount: 0,
    ...over,
  };
}

beforeEach(() => {
  clearHomeCache();
  resetBriefingSource();
  window.localStorage.clear();
  vi.clearAllMocks();
});
afterEach(() => { cleanup(); });

async function importHome() {
  return (await import('@/components/os/apps/HomeCockpit')).default;
}

describe('HomeCockpit cache-first paint + reconciliation (Lane H items 1-2)', () => {
  it('a warm cache paints content immediately (no skeleton) and reconciles a changed count in place, with the delta-pulse marker', async () => {
    const HomeCockpit = await importHome();
    // Disk cache: 1 workspace.
    writeHomeCache({
      briefing: makeBriefing({ recentWorkspaces: [wsCard('w1', 'Alpha')] }),
      overnight: null,
      highlights: [{ content: 'Cached: we chose SQLite for the local store.', timestamp: '2026-07-06T09:00:00.000Z' }],
    });
    // Fresh server briefing: 3 workspaces (count changes 1 → 3).
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing({
      recentWorkspaces: [wsCard('w1', 'Alpha'), wsCard('w2', 'Bravo'), wsCard('w3', 'Charlie')],
    }));
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    // Recall fetch is best-effort; keep it inert.
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} />);

    // Cache-first: content is up on the first paint, no skeleton.
    expect(screen.queryByTestId('home-cockpit-loading')).toBeNull();
    const factsBefore = screen.getByTestId('home-cockpit-facts');
    expect(factsBefore.textContent).toContain('1 workspace');

    // Silent refresh lands the fresh count in the SAME node.
    await waitFor(() => expect(screen.getByTestId('home-cockpit-facts').textContent).toContain('3 workspaces'));
    const factsAfter = screen.getByTestId('home-cockpit-facts');
    expect(factsAfter).toBe(factsBefore); // no above-the-fold remount (key stability)

    // The changed count carries the delta-pulse marker class.
    await waitFor(() => {
      const pulsed = factsAfter.querySelector('.home-delta-pulse');
      expect(pulsed?.textContent).toBe('3');
    });
  });

  it('a silent-refresh FAILURE over a cache-first paint keeps the last-good content (no error flash)', async () => {
    const HomeCockpit = await importHome();
    writeHomeCache({
      briefing: makeBriefing({ recentWorkspaces: [wsCard('w1', 'Alpha')] }),
      overnight: null,
      highlights: [],
    });
    mocks.adapter.getHomeBriefing.mockRejectedValue(new Error('network down'));

    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} />);
    expect(screen.getByTestId('home-cockpit')).toBeTruthy();

    await waitFor(() => expect(mocks.adapter.getHomeBriefing).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    // Content persists; the cold error/permission surfaces never appear.
    expect(screen.queryByTestId('home-cockpit-error')).toBeNull();
    expect(screen.queryByTestId('home-cockpit-permission-denied')).toBeNull();
    expect(screen.getByTestId('home-cockpit')).toBeTruthy();
    expect(screen.getByTestId('home-cockpit-facts').textContent).toContain('1 workspace');
  });

  it('cold (no cache): shows the skeleton first, then content', async () => {
    const HomeCockpit = await importHome();
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing({ recentWorkspaces: [wsCard('w1', 'Alpha')] }));
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} />);
    // No cache → the skeleton is the first paint.
    expect(screen.getByTestId('home-cockpit-loading')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('home-cockpit')).toBeTruthy());
  });
});

describe('HomeCockpit recall strip (Lane H item 4 — double catch-up collapse)', () => {
  it('renders the "I remember" recall cards INSIDE the home hero', async () => {
    const HomeCockpit = await importHome();
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing({ recentWorkspaces: [wsCard('w1', 'Alpha')] }));
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([
      { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active', lastActive: '2026-07-06T09:00:00.000Z' },
    ]);
    mocks.adapter.searchMemory.mockResolvedValue([
      { content: 'We decided to prioritise compliance over speed for the launch.', importance: 'important', timestamp: '2026-07-06T09:00:00.000Z' },
    ]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 5, sessionCount: 2 }, summary: 'launch prep', pendingTasks: [] });

    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId('home-cockpit')).toBeTruthy());
    await waitFor(() => {
      const strip = screen.getByTestId('home-cockpit-recall');
      expect(strip.textContent).toContain('I remember');
      expect(strip.textContent).toContain('prioritise compliance');
    });
  });
});

describe('one briefing truth (Lane H item 3)', () => {
  // 6 active + 2 archived + 1 dev-noise → workspaceCounts().visible === 6 (the
  // exact Wave U fixture). total.frames:0 forces the modal brag line to state the
  // workspace count so the two surfaces can be compared.
  const WORKSPACES = [
    { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' as const },
    { id: 'w2', name: 'Bravo', group: 'Personal', status: 'active' as const },
    { id: 'w3', name: 'Charlie', group: 'Personal', status: 'active' as const },
    { id: 'w4', name: 'Delta', group: 'Personal', status: 'active' as const },
    { id: 'w5', name: 'Echo', group: 'Personal', status: 'active' as const },
    { id: 'w6', name: 'Foxtrot', group: 'Personal', status: 'active' as const },
    { id: 'a1', name: 'ArchivedOne', group: 'Personal', status: 'archived' as const },
    { id: 'a2', name: 'ArchivedTwo', group: 'Personal', status: 'archived' as const },
    { id: 'n1', name: 'test-noise', group: 'Personal', status: 'active' as const },
  ];

  it('the hero count and the modal count are the SAME number from one workspaces mock', async () => {
    const HomeCockpit = await importHome();
    const { default: LoginBriefing } = await import('@/components/os/overlays/LoginBriefing');
    const { TooltipProvider } = await import('@/components/ui/tooltip');

    mocks.adapter.getWorkspaces.mockResolvedValue(WORKSPACES);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue({ total: { frames: 0, entities: 0, relations: 0 } });
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 0, sessionCount: 0 } });
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing({ recentWorkspaces: [] }));
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);

    const visible = workspaceCounts(WORKSPACES).visible;
    expect(visible).toBe(6);

    // Hero — HomeRoute passes workspaceCounts(workspaces).visible as totalWorkspaceCount.
    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} totalWorkspaceCount={visible} />);
    const facts = await screen.findByTestId('home-cockpit-facts');
    await waitFor(() => expect(facts.textContent).toMatch(/\d+\s+workspaces?/));
    const heroCount = Number(/(\d+)\s+workspaces?/.exec(facts.textContent ?? '')?.[1]);

    // Modal — reads briefing-source getWorkspaces → the SAME visible count.
    resetBriefingSource();
    render(<TooltipProvider><LoginBriefing onDismiss={vi.fn()} onOpenWorkspace={vi.fn()} /></TooltipProvider>);
    const bragLine = await screen.findByTestId('login-briefing-brag-line');
    await waitFor(() => expect(bragLine.textContent).toContain('across'));
    const modalCount = Number(/across\s+(\d+)\s+workspaces?/.exec(bragLine.textContent ?? '')?.[1]);

    expect(heroCount).toBe(visible);
    expect(modalCount).toBe(visible);
    expect(heroCount).toBe(modalCount); // the number-drift bug class is dead
  });
});
