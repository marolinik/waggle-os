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
import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react';
import { prefetchBriefing, resetBriefingSource, takeBriefingData } from '@/lib/briefing-source';
import { writeHomeCache, clearHomeCache, readHomeCache } from '@/lib/home-cache';
import { workspaceCounts } from '@/lib/workspace-counts';
import type { HomeBriefing, OvernightSummary, RecentWorkspaceCard } from '@/lib/types';

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
  shell: {
    profileId: '11111111-1111-4111-8111-111111111111',
    selectWorkspace: vi.fn(),
    setShowCreateWorkspace: vi.fn(),
    setShowWorkspaceSwitcher: vi.fn(),
  },
  service: { connecting: false },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/providers/ServiceProvider', () => ({
  useService: () => ({ connecting: mocks.service.connecting, connected: !mocks.service.connecting }),
  ServiceProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => false }));
vi.mock('@/components/os/model-gate/NoModelBanner', () => ({ NoModelBanner: () => null }));
vi.mock('@/components/os/WorkspaceActionsMenu', () => ({
  default: ({ onChanged }: { onChanged: () => void }) => (
    <button type="button" data-testid="refresh-home" onClick={onChanged}>Refresh home</button>
  ),
}));
vi.mock('@/providers/ShellContext', () => ({
  useShell: () => ({
    patchWorkspace: vi.fn().mockResolvedValue(true),
    deleteWorkspace: vi.fn().mockResolvedValue(true),
    activeWorkspaceId: null,
    selectWorkspace: mocks.shell.selectWorkspace,
    overlays: {
      setShowCreateWorkspace: mocks.shell.setShowCreateWorkspace,
      setShowWorkspaceSwitcher: mocks.shell.setShowWorkspaceSwitcher,
    },
    workspaces: [],
    workspacesLoading: false,
    onboardingState: { completed: true, profileId: mocks.shell.profileId },
  }),
}));

const PROFILE_A = '11111111-1111-4111-8111-111111111111';
const PROFILE_B = '22222222-2222-4222-8222-222222222222';

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

function overnight(consolidated: number): OvernightSummary {
  return {
    consolidated,
    artifactsCreated: 0,
    automationsCompleted: 0,
    failures: [],
  };
}

beforeEach(() => {
  clearHomeCache();
  resetBriefingSource();
  window.localStorage.clear();
  vi.clearAllMocks();
  mocks.shell.profileId = PROFILE_A;
  mocks.service.connecting = false;
});
afterEach(() => { cleanup(); });

async function importHome() {
  return (await import('@/components/os/apps/HomeCockpit')).default;
}

describe('HomeCockpit cache-first paint + reconciliation (Lane H items 1-2)', () => {
  it('never paints a warm cache owned by another active profile', async () => {
    const HomeCockpit = await importHome();
    let resolveProfileB!: (value: HomeBriefing) => void;
    const profileBBriefing = new Promise<HomeBriefing>((resolve) => { resolveProfileB = resolve; });
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Private profile A', recentWorkspaces: [wsCard('a', 'Alpha')] }),
      overnight: null,
      highlights: [{ content: 'Profile A private memory', timestamp: '2026-07-06T09:00:00.000Z' }],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockReturnValue(profileBBriefing);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_B}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(readHomeCache(PROFILE_B)).toBeNull();
    expect(screen.getByTestId('home-cockpit-loading')).toBeInTheDocument();
    expect(screen.queryByText('Private profile A')).not.toBeInTheDocument();
    expect(screen.queryByText(/Profile A private memory/i)).not.toBeInTheDocument();

    await act(async () => {
      resolveProfileB(makeBriefing({ greeting: 'Welcome, profile B' }));
    });
    expect(await screen.findByText('Welcome, profile B')).toBeInTheDocument();
  });

  it('drops profile A immediately when HomeRoute switches to profile B', async () => {
    const { MemoryRouter } = await import('react-router-dom');
    const HomeRoute = (await import('@/routes/HomeRoute')).default;
    let resolveProfileA!: (value: HomeBriefing) => void;
    let resolveProfileB!: (value: HomeBriefing) => void;
    const profileARequest = new Promise<HomeBriefing>((resolve) => { resolveProfileA = resolve; });
    const profileBRequest = new Promise<HomeBriefing>((resolve) => { resolveProfileB = resolve; });
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Private profile A', recentWorkspaces: [wsCard('a', 'Alpha secret')] }),
      overnight: null,
      highlights: [{ content: 'Profile A private memory.', timestamp: '2026-07-06T09:00:00.000Z' }],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing
      .mockReturnValueOnce(profileARequest)
      .mockReturnValueOnce(profileBRequest);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    const view = render(
      <MemoryRouter initialEntries={['/home']}>
        <HomeRoute />
      </MemoryRouter>,
    );
    expect(screen.getByText('Private profile A')).toBeInTheDocument();
    expect(screen.getByText('Alpha secret')).toBeInTheDocument();

    mocks.shell.profileId = PROFILE_B;
    view.rerender(
      <MemoryRouter initialEntries={['/home']}>
        <HomeRoute />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('home-cockpit-loading')).toBeInTheDocument();
    expect(screen.queryByText('Private profile A')).not.toBeInTheDocument();
    expect(screen.queryByText('Alpha secret')).not.toBeInTheDocument();

    await act(async () => {
      resolveProfileB(makeBriefing({ greeting: 'Current profile B' }));
    });
    expect(await screen.findByText('Current profile B')).toBeInTheDocument();

    await act(async () => {
      resolveProfileA(makeBriefing({ greeting: 'Late profile A' }));
    });
    expect(screen.getByText('Current profile B')).toBeInTheDocument();
    expect(screen.queryByText('Late profile A')).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_B)?.briefing.greeting).toBe('Current profile B');
  });

  it('does not consume a prefetched briefing owned by another profile', async () => {
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'a', name: 'Profile A workspace', group: 'Personal', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'b', name: 'Profile B workspace', group: 'Personal', status: 'active' }]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 0, sessionCount: 0 } });

    prefetchBriefing(PROFILE_A);
    await waitFor(() => expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(1));
    const profileB = await takeBriefingData(PROFILE_B);

    expect(profileB.summaries.map((summary) => summary.name)).toEqual(['Profile B workspace']);
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);
  });

  it('consumes a same-profile prefetch once, then fetches fresh', async () => {
    mocks.adapter.getWorkspaces
      .mockResolvedValueOnce([{ id: 'a', name: 'Prefetched workspace', group: 'Personal', status: 'active' }])
      .mockResolvedValueOnce([{ id: 'b', name: 'Fresh workspace', group: 'Personal', status: 'active' }]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 0, sessionCount: 0 } });

    prefetchBriefing(PROFILE_A);
    await waitFor(() => expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(1));
    const prefetched = await takeBriefingData(PROFILE_A);
    expect(prefetched.summaries.map((summary) => summary.name)).toEqual(['Prefetched workspace']);
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(1);

    const fresh = await takeBriefingData(PROFILE_A);
    expect(fresh.summaries.map((summary) => summary.name)).toEqual(['Fresh workspace']);
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(2);
  });

  it('never reuses an identity-free prefetch across an unresolved profile boundary', async () => {
    let activeWorkspace = 'Unbound profile A workspace';
    mocks.adapter.getWorkspaces.mockImplementation(async () => ([{
      id: activeWorkspace.startsWith('Unbound') ? 'a' : 'b',
      name: activeWorkspace,
      group: 'Personal',
      status: 'active',
    }]));
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 0, sessionCount: 0 } });

    prefetchBriefing();
    await act(async () => { await Promise.resolve(); });
    expect(mocks.adapter.getWorkspaces).not.toHaveBeenCalled();
    activeWorkspace = 'Current profile B workspace';
    const current = await takeBriefingData();

    expect(current.summaries.map((summary) => summary.name)).toEqual(['Current profile B workspace']);
    expect(mocks.adapter.getWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('keeps the newest Home refresh when an older overlapping request resolves last', async () => {
    const HomeCockpit = await importHome();
    let resolveOlder!: (value: HomeBriefing) => void;
    let resolveNewer!: (value: HomeBriefing) => void;
    const older = new Promise<HomeBriefing>((resolve) => { resolveOlder = resolve; });
    const newer = new Promise<HomeBriefing>((resolve) => { resolveNewer = resolve; });
    mocks.adapter.getHomeBriefing
      .mockResolvedValueOnce(makeBriefing({ greeting: 'Initial Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }))
      .mockReturnValueOnce(older)
      .mockReturnValueOnce(newer);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );
    expect(await screen.findByText('Initial Home')).toBeInTheDocument();

    const refresh = screen.getByTestId('refresh-home');
    fireEvent.click(refresh);
    fireEvent.click(refresh);
    expect(mocks.adapter.getHomeBriefing).toHaveBeenCalledTimes(3);

    await act(async () => {
      resolveNewer(makeBriefing({ greeting: 'Newest Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }));
    });
    expect(await screen.findByText('Newest Home')).toBeInTheDocument();

    await act(async () => {
      resolveOlder(makeBriefing({ greeting: 'Stale Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText('Newest Home')).toBeInTheDocument();
    expect(screen.queryByText('Stale Home')).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_A)?.briefing.greeting).toBe('Newest Home');
  });

  it('ignores an older memory response that resolves after the newest Home payload', async () => {
    const HomeCockpit = await importHome();
    let resolveOlderMemory!: (value: Array<{ content: string; importance: number; timestamp: string }>) => void;
    const olderMemory = new Promise<Array<{ content: string; importance: number; timestamp: string }>>((resolve) => {
      resolveOlderMemory = resolve;
    });
    mocks.adapter.getHomeBriefing
      .mockResolvedValueOnce(makeBriefing({ greeting: 'Initial Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }))
      .mockResolvedValueOnce(makeBriefing({ greeting: 'Older Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }))
      .mockResolvedValueOnce(makeBriefing({ greeting: 'Newest Home', recentWorkspaces: [wsCard('w1', 'Alpha')] }));
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory
      .mockResolvedValueOnce([])
      .mockReturnValueOnce(olderMemory)
      .mockResolvedValueOnce([{
        content: 'Newest memory B remains authoritative after refresh.',
        importance: 0.9,
        timestamp: '2026-07-07T09:00:00.000Z',
      }]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );
    await waitFor(() => expect(readHomeCache(PROFILE_A)?.briefing.greeting).toBe('Initial Home'));

    const refresh = screen.getByTestId('refresh-home');
    fireEvent.click(refresh);
    await waitFor(() => expect(mocks.adapter.searchMemory).toHaveBeenCalledTimes(2));
    fireEvent.click(refresh);

    expect(await screen.findByText('Newest Home')).toBeInTheDocument();
    expect(await screen.findByText(/Newest memory B remains authoritative/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(readHomeCache(PROFILE_A)?.briefing.greeting).toBe('Newest Home');
      expect(readHomeCache(PROFILE_A)?.highlights[0]?.content).toMatch(/Newest memory B/i);
    });

    await act(async () => {
      resolveOlderMemory([{
        content: 'Older memory A must never replace the newest result.',
        importance: 1,
        timestamp: '2026-07-06T09:00:00.000Z',
      }]);
    });

    expect(screen.getByText('Newest Home')).toBeInTheDocument();
    expect(screen.queryByText(/Older memory A/i)).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_A)?.briefing.greeting).toBe('Newest Home');
    expect(readHomeCache(PROFILE_A)?.highlights[0]?.content).toMatch(/Newest memory B/i);
  });

  it('evicts the same-profile cache when live Home confirms there are no workspaces', async () => {
    const HomeCockpit = await importHome();
    let resolveFirstRun!: (value: HomeBriefing) => void;
    const firstRun = new Promise<HomeBriefing>((resolve) => { resolveFirstRun = resolve; });
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Cached Home', recentWorkspaces: [wsCard('w1', 'Ghost workspace')] }),
      overnight: overnight(5),
      highlights: [{ content: 'Ghost memory from the deleted workspace.', timestamp: '2026-07-06T09:00:00.000Z' }],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockReturnValue(firstRun);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );
    expect(screen.getByText('Ghost workspace')).toBeInTheDocument();

    await act(async () => {
      resolveFirstRun(makeBriefing({ greeting: 'Start fresh', isFirstRun: true }));
    });
    expect(await screen.findByTestId('home-cockpit-create-first')).toBeInTheDocument();
    await waitFor(() => expect(readHomeCache(PROFILE_A)).toBeNull());

    cleanup();
    let resolveRemount!: (value: HomeBriefing) => void;
    const remount = new Promise<HomeBriefing>((resolve) => { resolveRemount = resolve; });
    mocks.adapter.getHomeBriefing.mockReset().mockReturnValue(remount);
    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByTestId('home-cockpit-loading')).toBeInTheDocument();
    expect(screen.queryByText('Ghost workspace')).not.toBeInTheDocument();
    await act(async () => {
      resolveRemount(makeBriefing({ greeting: 'Start fresh', isFirstRun: true }));
    });
    expect(await screen.findByTestId('home-cockpit-create-first')).toBeInTheDocument();
  });

  it('cancels a warm-cache manual refresh when unmounted during reconnect', async () => {
    const HomeCockpit = await importHome();
    let resolveStaleProfileA!: (value: HomeBriefing) => void;
    const staleProfileA = new Promise<HomeBriefing>((resolve) => { resolveStaleProfileA = resolve; });
    mocks.service.connecting = true;
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Cached profile A', recentWorkspaces: [wsCard('a', 'Alpha')] }),
      overnight: null,
      highlights: [],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockReturnValue(staleProfileA);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    const view = render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId('refresh-home'));
    expect(mocks.adapter.getHomeBriefing).toHaveBeenCalledTimes(1);

    view.unmount();
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Current profile B' }),
      overnight: null,
      highlights: [],
    }, PROFILE_B);
    await act(async () => {
      resolveStaleProfileA(makeBriefing({ greeting: 'Stale profile A' }));
      await staleProfileA;
      await Promise.resolve();
    });

    expect(mocks.adapter.getHomeOvernight).not.toHaveBeenCalled();
    expect(readHomeCache(PROFILE_B)?.briefing.greeting).toBe('Current profile B');
    expect(readHomeCache(PROFILE_A)).toBeNull();
  });

  it('preserves the last-good overnight story when only its secondary refresh fails', async () => {
    const HomeCockpit = await importHome();
    writeHomeCache({
      briefing: makeBriefing({ greeting: 'Cached Home' }),
      overnight: overnight(5),
      highlights: [],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing({ greeting: 'Fresh Home' }));
    mocks.adapter.getHomeOvernight.mockRejectedValue(new Error('overnight unavailable'));
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(await screen.findByText('Fresh Home')).toBeInTheDocument();
    await waitFor(() => expect(mocks.adapter.getHomeOvernight).toHaveBeenCalled());
    const overnightHero = screen.getByText('While you slept').closest('section');
    expect(overnightHero).toHaveTextContent(/folded 5 new memories into the hive/i);
    await waitFor(() => {
      expect(readHomeCache(PROFILE_A)?.briefing.greeting).toBe('Fresh Home');
      expect(readHomeCache(PROFILE_A)?.overnight?.consolidated).toBe(5);
    });
  });

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

  it.each([401, 403])('an auth denial (%s) invalidates warm content instead of presenting it as live', async (status) => {
    const HomeCockpit = await importHome();
    writeHomeCache({
      briefing: makeBriefing({ recentWorkspaces: [wsCard('private-a', 'Private A')] }),
      overnight: overnight(3),
      highlights: [],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockRejectedValue(
      Object.assign(new Error(status === 401 ? 'Unauthorized' : 'Forbidden'), { status }),
    );

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByText('Private A')).toBeInTheDocument();
    expect(await screen.findByTestId('home-cockpit-permission-denied')).toBeInTheDocument();
    expect(screen.queryByText('Private A')).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_A)).toBeNull();
  });

  it('an overnight authorization denial invalidates all warm Home content', async () => {
    const HomeCockpit = await importHome();
    writeHomeCache({
      briefing: makeBriefing({ recentWorkspaces: [wsCard('private-a', 'Private A')] }),
      overnight: overnight(3),
      highlights: [{ content: 'Private remembered detail', timestamp: '2026-07-06T09:00:00.000Z' }],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockResolvedValue(
      makeBriefing({ recentWorkspaces: [wsCard('private-a', 'Private A')] }),
    );
    mocks.adapter.getHomeOvernight.mockRejectedValue(
      Object.assign(new Error('Unauthorized'), { status: 401 }),
    );

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByText('Private A')).toBeInTheDocument();
    expect(await screen.findByTestId('home-cockpit-permission-denied')).toBeInTheDocument();
    expect(screen.queryByText('Private A')).not.toBeInTheDocument();
    expect(screen.queryByText('Private remembered detail')).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_A)).toBeNull();
  });

  it('a briefing-source authorization denial invalidates all warm Home content', async () => {
    const HomeCockpit = await importHome();
    writeHomeCache({
      briefing: makeBriefing({ recentWorkspaces: [wsCard('private-a', 'Private A')] }),
      overnight: overnight(3),
      highlights: [{ content: 'Private remembered detail', timestamp: '2026-07-06T09:00:00.000Z' }],
    }, PROFILE_A);
    mocks.adapter.getHomeBriefing.mockResolvedValue(
      makeBriefing({ recentWorkspaces: [wsCard('private-a', 'Private A')] }),
    );
    mocks.adapter.getHomeOvernight.mockResolvedValue(overnight(4));
    mocks.adapter.getWorkspaces.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(
      <HomeCockpit
        profileId={PROFILE_A}
        onContinue={vi.fn()}
        onOpenWorkspaceDesktop={vi.fn()}
        onCreateWorkspace={vi.fn()}
      />,
    );

    expect(screen.getByText('Private A')).toBeInTheDocument();
    expect(await screen.findByTestId('home-cockpit-permission-denied')).toBeInTheDocument();
    expect(screen.queryByText('Private A')).not.toBeInTheDocument();
    expect(screen.queryByText('Private remembered detail')).not.toBeInTheDocument();
    expect(readHomeCache(PROFILE_A)).toBeNull();
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
