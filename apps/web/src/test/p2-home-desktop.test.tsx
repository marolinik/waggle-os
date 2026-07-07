/**
 * P2 (verify + J08) — Home Cockpit + Workspace Desktop surface contracts:
 *
 *  - J08 (D6): the "N memories need review" banner renders from
 *    briefing.needsReviewCount and its CTA deep-links to the Memory Center
 *    "Needs review" filter via waggle:open-app {appId:'memory',
 *    filter:'unreviewed'}; absent at 0.
 *  - Greeting date renders as a human date, never the raw ISO string.
 *  - Workspace Desktop branches the whole-screen error on the P1b
 *    AdapterHttpError contract: 404 → "Workspace not found" (+ go-Home CTA),
 *    network → offline with a working Retry.
 *  - MemoryCenterTab consumes the deep-link filter on both paths (stash on
 *    cold mount; live event while mounted) and refetches with
 *    status='unreviewed'.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { stashDeepLink } from '@/lib/app-deeplink';
import { DATE_LOCALE } from '@/lib/date-locale';

const mocks = vi.hoisted(() => ({
  adapter: {
    getHomeBriefing: vi.fn(),
    getHomeOvernight: vi.fn(),
    quickCapture: vi.fn(),
    getWorkspaceContext: vi.fn(),
    getWorkspaceState: vi.fn(),
    getWorkspaceActivity: vi.fn(),
    getTeamMembers: vi.fn(),
    getWorkspaceFiles: vi.fn(),
    getWorkspaceTasks: vi.fn().mockResolvedValue([]),
    listMemories: vi.fn(),
    patchMemory: vi.fn(),
    archiveMemory: vi.fn(),
    deleteMemoryById: vi.fn(),
    mergeMemories: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/providers/ServiceProvider', () => ({ useService: () => ({ connecting: false, connected: true }) }));
vi.mock('@/hooks/useOfflineStatus', () => ({ useOfflineStatus: () => false }));
vi.mock('@/hooks/useRoomState', () => ({ useRoomState: () => ({ workspaceMap: new Map() }) }));
// WorkspaceActionsMenu (G1) reads ShellContext for patch/delete — these tests
// render screens bare, so stub the shell surface the menu needs.
vi.mock('@/providers/ShellContext', () => ({
  useShell: () => ({ patchWorkspace: vi.fn().mockResolvedValue(true), deleteWorkspace: vi.fn().mockResolvedValue(true) }),
}));

/** AdapterHttpError stand-in — components duck-type on error.name + status. */
function httpError(status: number, message = `HTTP ${status}`) {
  const e = new Error(message) as Error & { status: number };
  e.name = 'AdapterHttpError';
  e.status = status;
  return e;
}

const RAW_ISO = '2026-06-11T07:42:13.512Z';
const briefing = (over: Record<string, unknown> = {}) => ({
  greeting: "Good morning, Marko. Here's your day",
  userName: 'Marko',
  date: RAW_ISO,
  recentWorkspaces: [],
  suggestedActions: [],
  upNext: [],
  isFirstRun: false,
  needsReviewCount: 0,
  ...over,
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── Home Cockpit: J08 banner + date ────────────────────────────────────────

describe('HomeCockpit (P2)', () => {
  async function renderHome(
    b: ReturnType<typeof briefing>,
    handlers: {
      onContinue?: (workspaceId: string, sessionId?: string) => void;
      onOpenWorkspaceDesktop?: (workspaceId: string) => void;
      onCreateWorkspace?: () => void;
    } = {},
  ) {
    const { default: HomeCockpit } = await import('@/components/os/apps/HomeCockpit');
    mocks.adapter.getHomeBriefing.mockResolvedValue(b);
    mocks.adapter.getHomeOvernight.mockResolvedValue(null);
    const onContinue = handlers.onContinue ?? vi.fn();
    const onOpenWorkspaceDesktop = handlers.onOpenWorkspaceDesktop ?? vi.fn();
    const onCreateWorkspace = handlers.onCreateWorkspace ?? vi.fn();
    render(
      <HomeCockpit
        onContinue={onContinue}
        onOpenWorkspaceDesktop={onOpenWorkspaceDesktop}
        onCreateWorkspace={onCreateWorkspace}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('home-cockpit')).toBeTruthy());
    return { onContinue, onOpenWorkspaceDesktop, onCreateWorkspace };
  }

  it('renders the J08 review banner and deep-links to the Memory Center filter', async () => {
    await renderHome(briefing({ needsReviewCount: 3 }));
    const banner = screen.getByTestId('home-cockpit-review-banner');
    // Scope-qualified copy ("from your imports") so the Home count can't read
    // as contradicting the Memory Center's broader "awaiting your confirm" total.
    expect(banner.textContent).toContain('3 memories from your imports need your review');

    const events: Array<Record<string, unknown>> = [];
    const spy = (e: Event) => events.push((e as CustomEvent).detail as Record<string, unknown>);
    window.addEventListener('waggle:open-app', spy);
    try {
      fireEvent.click(screen.getByTestId('home-cockpit-review-cta'));
    } finally {
      window.removeEventListener('waggle:open-app', spy);
    }
    expect(events).toEqual([{ appId: 'memory', filter: 'unreviewed' }]);
  });

  it('omits the review banner at 0 (and on pre-P2 sidecars without the field)', async () => {
    await renderHome(briefing({ needsReviewCount: undefined }));
    expect(screen.queryByTestId('home-cockpit-review-banner')).toBeNull();
  });

  it('omits the Up next section when there are no items (zero or absent field)', async () => {
    await renderHome(briefing({ upNext: [] }));
    expect(screen.queryByTestId('home-cockpit-upnext')).toBeNull();
    cleanup();
    await renderHome(briefing({ upNext: undefined }));
    expect(screen.queryByTestId('home-cockpit-upnext')).toBeNull();
  });

  it('renders the Up next section when at least one item exists', async () => {
    await renderHome(briefing({
      upNext: [{ id: 'e1', label: 'Weekly digest', kind: 'schedule', at: 'Jun 13, 9:00 AM' }],
    }));
    expect(screen.getByTestId('home-cockpit-upnext').textContent).toContain('Weekly digest');
  });

  it('renders the briefing date as a human date, not the raw ISO string', async () => {
    await renderHome(briefing());
    expect(screen.queryByText(RAW_ISO)).toBeNull();
    // Locale-agnostic: assert the exact formatting call the component makes.
    const expected = new Date(RAW_ISO).toLocaleDateString(DATE_LOCALE, {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    expect(screen.getByText(expected)).toBeTruthy();
  });

  it('renders the personal work-aware positioning in the shell', async () => {
    await renderHome(briefing());
    const positioning = screen.getByTestId('home-cockpit-positioning').textContent ?? '';

    expect(positioning).toMatch(/personal AI workspace/i);
    expect(positioning).toMatch(/remembers you/i);
    expect(positioning).toMatch(/knows your projects/i);
    expect(positioning).toMatch(/guides the next step/i);
  });

  it('promotes the best suggested action into one Start Here move', async () => {
    const onContinue = vi.fn();
    await renderHome(briefing({
      recentWorkspaces: [
        { id: 'board', name: 'Board Update', group: 'Finance', summary: 'Variance narrative is half drafted.', lastActive: RAW_ISO, pendingCount: 1, continueSessionId: 'fallback-session' },
      ],
      suggestedActions: [
        { label: 'Draft the churn explanation', workspaceId: 'board', sessionId: 'suggestion-session', kind: 'draft' },
      ],
    }), { onContinue });

    const startHere = screen.getByTestId('home-cockpit-start-here');
    expect(startHere.textContent).toContain('Start here');
    expect(startHere.textContent).toContain('Draft the churn explanation');
    expect(startHere.textContent).toContain('Board Update');
    expect(startHere.textContent).toContain('Because Waggle found this as the next useful move');

    fireEvent.click(screen.getByTestId('home-cockpit-start-primary'));
    expect(onContinue).toHaveBeenCalledWith('board', 'suggestion-session');
  });

  it('falls back to the most urgent workspace when no suggested action exists', async () => {
    const onContinue = vi.fn();
    await renderHome(briefing({
      recentWorkspaces: [
        { id: 'quiet', name: 'Quiet Research', group: 'Research', summary: 'Archived notes are settled.', lastActive: '2026-06-09T09:00:00.000Z', pendingCount: 0 },
        { id: 'launch', name: 'Launch Plan', group: 'Marketing', summary: 'Three decisions still need review.', lastActive: '2026-06-12T09:00:00.000Z', pendingCount: 3, continueSessionId: 'launch-session' },
      ],
      suggestedActions: [],
    }), { onContinue });

    const startHere = screen.getByTestId('home-cockpit-start-here');
    expect(startHere.textContent).toContain('Review 3 pending items');
    expect(startHere.textContent).toContain('Launch Plan');
    expect(startHere.textContent).toContain('Because this workspace has unresolved decisions');

    fireEvent.click(screen.getByTestId('home-cockpit-start-primary'));
    expect(onContinue).toHaveBeenCalledWith('launch', 'launch-session');
  });
});

// ── Workspace Desktop: error-state branching (P1b error contract) ──────────

describe('WorkspaceDesktopApp error states (P2)', () => {
  async function renderDesktop() {
    const { default: WorkspaceDesktopApp } = await import('@/components/os/apps/WorkspaceDesktopApp');
    render(<WorkspaceDesktopApp workspaceId="w1" workspaceName="Alpha" />);
  }

  function mockFeedsOk() {
    mocks.adapter.getWorkspaceState.mockResolvedValue(null);
    mocks.adapter.getWorkspaceActivity.mockResolvedValue({ events: [] });
    mocks.adapter.getTeamMembers.mockResolvedValue([]);
    mocks.adapter.getWorkspaceFiles.mockResolvedValue([]);
  }

  it('404 renders "Workspace not found" with a go-Home CTA — not the offline state', async () => {
    mocks.adapter.getWorkspaceContext.mockRejectedValue(httpError(404, 'Workspace not found'));
    await renderDesktop();
    await waitFor(() => expect(screen.getByTestId('ws-desktop-notfound')).toBeTruthy());
    expect(screen.queryByTestId('ws-desktop-offline')).toBeNull();

    const events: Array<Record<string, unknown>> = [];
    const spy = (e: Event) => events.push((e as CustomEvent).detail as Record<string, unknown>);
    window.addEventListener('waggle:open-app', spy);
    try {
      fireEvent.click(screen.getByTestId('ws-desktop-notfound-home'));
    } finally {
      window.removeEventListener('waggle:open-app', spy);
    }
    expect(events).toEqual([{ appId: 'home' }]);
  });

  it('403 still renders the permission state', async () => {
    mocks.adapter.getWorkspaceContext.mockRejectedValue(httpError(403, 'Forbidden'));
    await renderDesktop();
    await waitFor(() => expect(screen.getByTestId('ws-desktop-permission-denied')).toBeTruthy());
  });

  it('network failure renders offline with a Retry that refetches', async () => {
    mocks.adapter.getWorkspaceContext.mockRejectedValueOnce(new Error('fetch failed'));
    mockFeedsOk();
    await renderDesktop();
    await waitFor(() => expect(screen.getByTestId('ws-desktop-offline')).toBeTruthy());

    mocks.adapter.getWorkspaceContext.mockResolvedValueOnce({
      workspace: { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' },
      stats: { memoryCount: 0, sessionCount: 0, fileCount: 0 },
    });
    fireEvent.click(screen.getByTestId('ws-desktop-retry'));
    await waitFor(() => expect(screen.getByTestId('ws-desktop-root')).toBeTruthy());
  });

  it('offline state revalidates on window focus (D3 plus-clause wiring)', async () => {
    mocks.adapter.getWorkspaceContext.mockRejectedValueOnce(new Error('fetch failed'));
    mockFeedsOk();
    await renderDesktop();
    await waitFor(() => expect(screen.getByTestId('ws-desktop-offline')).toBeTruthy());

    mocks.adapter.getWorkspaceContext.mockResolvedValue({
      workspace: { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' },
      stats: { memoryCount: 0, sessionCount: 0, fileCount: 0 },
    });
    // Re-fire inside waitFor: revalidation is idempotent, and this absorbs the
    // listener-attach timing between the error commit and the event.
    await waitFor(() => {
      fireEvent(window, new Event('focus'));
      expect(screen.getByTestId('ws-desktop-root')).toBeTruthy();
    });
  });
});

// ── MemoryCenterTab: deep-link filter consumption ───────────────────────────

describe('MemoryCenterTab deep-link (P2/J08)', () => {
  it('cold mount consumes a stashed filter and queries status=unreviewed', async () => {
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    mocks.adapter.listMemories.mockResolvedValue([]);
    stashDeepLink({ appId: 'memory', filter: 'unreviewed' });
    render(<MemoryCenterTab />);
    await waitFor(() => {
      expect(mocks.adapter.listMemories).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unreviewed' }),
      );
    });
  });

  it('applies a live waggle:open-app event while mounted', async () => {
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    mocks.adapter.listMemories.mockResolvedValue([]);
    render(<MemoryCenterTab />);
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());

    fireEvent(window, new CustomEvent('waggle:open-app', {
      detail: { appId: 'memory', filter: 'unreviewed' },
    }));
    await waitFor(() => {
      expect(mocks.adapter.listMemories).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'unreviewed' }),
      );
    });
  });

  it('ignores an invalid filter value', async () => {
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    mocks.adapter.listMemories.mockResolvedValue([]);
    stashDeepLink({ appId: 'memory', filter: 'drop-table' });
    render(<MemoryCenterTab />);
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());
    expect(mocks.adapter.listMemories).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'drop-table' }),
    );
  });
});
