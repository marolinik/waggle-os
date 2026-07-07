/**
 * Lane HM (path-to-9 Pillar 1.1) — hero shared-element morphs.
 *
 * Two morph cases, one contract: a SOURCE element and a DESTINATION element
 * carry the SAME framer `layoutId`, so the element animates between them on
 * route change (the card GROWS into the workspace surface). This suite pins:
 *
 *  1. the card→workspace pair — the shelf card's hex avatar + name and the
 *     workspace header's avatar + name resolve to identical layoutIds
 *     (`ws-hero-avatar-<id>` / `ws-hero-name-<id>`), the whole reason the morph
 *     lands rather than silently no-op'ing on a string mismatch;
 *  2. the morph target is mounted at route commit — the workspace LOADING
 *     skeleton already carries the hero layoutIds (context lands async; without
 *     this the destination wouldn't exist when framer looks for it);
 *  3. reduced motion drops every shared-element id (REDUCED.routeTransition =
 *     crossfade-only — no shared-element travel) on BOTH ends;
 *  4. interruptibility — opening a card fires navigation synchronously, never
 *     gated on an animation (Phase-0.4 input-primacy);
 *  5. the Trust↔Memories tab morph — the panel body animates on view change and
 *     degrades to an instant swap (initial=false) under reduced motion.
 *
 * framer-motion is stubbed to plain DOM: `layoutId` surfaces as `data-layout-id`
 * and `initial` as `data-initial`, so both the morph wiring and the
 * reduced-motion degradation are assertable without a real layout engine.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { workspaceHeroAvatarId, workspaceHeroNameId } from '@/lib/motion/hero-morph';

const h = vi.hoisted(() => ({ reduce: false }));

vi.mock('framer-motion', async () => {
  const React = await vi.importActual<typeof import('react')>('react');
  const DROP = new Set([
    'initial', 'animate', 'exit', 'transition', 'variants',
    'whileHover', 'whileTap', 'whileFocus', 'whileInView',
    'layout', 'layoutId', 'onAnimationComplete', 'custom',
  ]);
  const make = (tag: string) =>
    React.forwardRef(function MotionMock(props: Record<string, unknown>, ref: React.Ref<HTMLElement>) {
      const passed: Record<string, unknown> = {};
      for (const k of Object.keys(props)) if (!DROP.has(k)) passed[k] = props[k];
      // Surface the two props the morph contract depends on.
      if (props.layoutId !== undefined) passed['data-layout-id'] = props.layoutId;
      if (props.initial !== undefined) passed['data-initial'] = JSON.stringify(props.initial);
      return React.createElement(tag, { ...passed, ref });
    });
  const motion = new Proxy({}, { get: (_t, tag: string) => make(tag) });
  return {
    __esModule: true,
    motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    LayoutGroup: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useReducedMotion: () => h.reduce,
  };
});

// ── Shared mocks ───────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  shell: {
    workspaces: [{ id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' }] as Array<{ id: string; name: string }>,
    workspacesError: null as unknown,
    workspacesLoading: false,
    selectWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
    billingTier: 'FREE' as string,
    tierResolved: true,
    activeWorkspaceId: 'w1' as string | null,
    setContextRailTarget: vi.fn(),
  },
  adapter: {
    getWorkspaceContext: vi.fn(),
    getWorkspaceState: vi.fn(),
    getWorkspaceActivity: vi.fn(),
    getTeamMembers: vi.fn(),
    getWorkspaceFiles: vi.fn(),
    uploadFile: vi.fn(),
  },
}));

vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/useRoomState', () => ({ useRoomState: () => ({ workspaceMap: new Map() }) }));
vi.mock('@/hooks/useOnboarding', () => ({ useOnboarding: () => ({ state: { completed: true } }) }));

// Heavy children the morph surfaces don't need — stubbed to keep the tree light.
vi.mock('@/components/os/WorkspaceActionsMenu', () => ({ default: () => <div data-testid="stub-actions" /> }));
vi.mock('@/components/os/overlays/CreateWorkspaceDialog', () => ({ default: () => null }));
vi.mock('@/components/os/apps/workspace/TasksTab', () => ({ default: () => <div data-testid="stub-tasks" /> }));
vi.mock('@/components/os/apps/MemoryTrust', () => ({ default: () => <div data-testid="stub-trust" /> }));
vi.mock('@/components/os/apps/memory/MemoryCenterTab', () => ({ default: () => <div data-testid="stub-mc-tab" /> }));
vi.mock('@/components/os/apps/memory/TimelineTab', () => ({ default: () => <div data-testid="stub-timeline" /> }));
vi.mock('@/components/os/apps/memory/KnowledgeGraphViewer', () => ({ default: () => <div data-testid="stub-graph" /> }));
vi.mock('@/components/os/apps/memory/HarvestTab', () => ({ default: () => <div data-testid="stub-harvest" /> }));
vi.mock('@/components/os/apps/memory/WeaverPanel', () => ({ default: () => <div data-testid="stub-weaver" /> }));
vi.mock('@/components/os/apps/memory/WikiTab', () => ({ default: () => <div data-testid="stub-wiki" /> }));
vi.mock('@/components/os/apps/memory/EvolutionTab', () => ({ default: () => <div data-testid="stub-evolution" /> }));
vi.mock('@/components/os/apps/memory/ImportReminderBanner', () => ({ default: () => null }));

const timelineProps = {
  frames: [], selectedFrame: null, onSelectFrame: vi.fn(),
  searchQuery: '', onSearchChange: vi.fn(), onDeleteFrame: vi.fn(),
  loading: false, error: null, stats: { total: 0, filtered: 0 },
  typeFilters: [], onTypeFiltersChange: vi.fn(),
  minImportance: 0, onMinImportanceChange: vi.fn(),
};

beforeEach(() => {
  h.reduce = false;
  vi.clearAllMocks();
  mocks.shell.workspaces = [{ id: 'w1', name: 'Alpha' }, { id: 'w2', name: 'Beta' }];
  mocks.shell.workspacesError = null;
  mocks.shell.workspacesLoading = false;
});
afterEach(() => cleanup());

// ── 1. The id contract ──────────────────────────────────────────────────────
describe('Lane HM · layoutId contract', () => {
  it('source and destination derive the SAME id from a workspace id', () => {
    expect(workspaceHeroAvatarId('w1')).toBe('ws-hero-avatar-w1');
    expect(workspaceHeroNameId('w1')).toBe('ws-hero-name-w1');
  });
});

// ── 2. Source: the shelf card ────────────────────────────────────────────────
describe('Lane HM · workspace card (source)', () => {
  it('the card hex avatar + name carry the hero layoutIds', async () => {
    const { default: AllWorkspacesApp } = await import('@/components/os/apps/AllWorkspacesApp');
    const { container } = render(<AllWorkspacesApp onOpenWorkspace={vi.fn()} />);

    // Avatar (decorative span) carries the avatar id…
    expect(container.querySelector(`[data-layout-id="${workspaceHeroAvatarId('w1')}"]`)).toBeTruthy();
    // …and the name (the accessible heading) carries the name id.
    const name = screen.getByTestId('all-workspaces-open-w1');
    expect(name.getAttribute('data-layout-id')).toBe(workspaceHeroNameId('w1'));
    expect(name.textContent).toBe('Alpha');
  });

  it('reduced motion drops the card layoutIds (no shared-element travel)', async () => {
    h.reduce = true;
    const { default: AllWorkspacesApp } = await import('@/components/os/apps/AllWorkspacesApp');
    const { container } = render(<AllWorkspacesApp onOpenWorkspace={vi.fn()} />);

    expect(container.querySelector('[data-layout-id]')).toBeNull();
    // The card + name still render — only the morph is gone.
    expect(screen.getByTestId('all-workspaces-open-w1').textContent).toBe('Alpha');
  });

  it('opening a card navigates SYNCHRONOUSLY — never gated on an animation', async () => {
    const onOpen = vi.fn();
    const { default: AllWorkspacesApp } = await import('@/components/os/apps/AllWorkspacesApp');
    render(<AllWorkspacesApp onOpenWorkspace={onOpen} />);

    fireEvent.click(screen.getByTestId('all-workspaces-card-w1'));
    // fireEvent is synchronous: if navigation were awaiting an exit animation
    // these would not have fired by now.
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('w1');
    expect(onOpen).toHaveBeenCalledWith('w1');
  });
});

// ── 3. Destination: the workspace surface ────────────────────────────────────
describe('Lane HM · workspace surface (destination)', () => {
  const okCtx = {
    workspace: { id: 'w1', name: 'Alpha', group: 'Personal', status: 'active' },
    stats: { memoryCount: 2, sessionCount: 1, fileCount: 0 },
    recentMemories: [{ content: 'x', date: new Date().toISOString() }],
  };

  it('the loaded header avatar + name carry the MATCHING layoutIds', async () => {
    mocks.adapter.getWorkspaceContext.mockResolvedValue(okCtx);
    mocks.adapter.getWorkspaceState.mockResolvedValue({ pending: [], blocked: [] });
    mocks.adapter.getWorkspaceActivity.mockResolvedValue({ events: [] });
    mocks.adapter.getTeamMembers.mockResolvedValue([]);
    mocks.adapter.getWorkspaceFiles.mockResolvedValue([]);

    const { default: WorkspaceDesktopApp } = await import('@/components/os/apps/WorkspaceDesktopApp');
    const { container } = render(<WorkspaceDesktopApp workspaceId="w1" workspaceName="Alpha" />);

    await waitFor(() => expect(screen.getByTestId('ws-desktop-root')).toBeTruthy());
    const avatar = container.querySelector(`[data-layout-id="${workspaceHeroAvatarId('w1')}"]`);
    const name = container.querySelector(`[data-layout-id="${workspaceHeroNameId('w1')}"]`);
    expect(avatar).toBeTruthy();
    expect(name?.textContent).toBe('Alpha');
  });

  it('the LOADING skeleton already carries the hero ids (target mounted at commit)', async () => {
    // Context never resolves → the surface stays in its loading skeleton.
    mocks.adapter.getWorkspaceContext.mockReturnValue(new Promise(() => {}));

    const { default: WorkspaceDesktopApp } = await import('@/components/os/apps/WorkspaceDesktopApp');
    const { container } = render(<WorkspaceDesktopApp workspaceId="w1" workspaceName="Alpha" />);

    expect(screen.getByTestId('ws-desktop-loading')).toBeTruthy();
    // The morph target exists while data is still loading.
    expect(container.querySelector(`[data-layout-id="${workspaceHeroAvatarId('w1')}"]`)).toBeTruthy();
    const name = container.querySelector(`[data-layout-id="${workspaceHeroNameId('w1')}"]`);
    expect(name?.textContent).toBe('Alpha');
  });

  it('reduced motion drops the header layoutIds', async () => {
    h.reduce = true;
    mocks.adapter.getWorkspaceContext.mockResolvedValue(okCtx);
    mocks.adapter.getWorkspaceState.mockResolvedValue({ pending: [], blocked: [] });
    mocks.adapter.getWorkspaceActivity.mockResolvedValue({ events: [] });
    mocks.adapter.getTeamMembers.mockResolvedValue([]);
    mocks.adapter.getWorkspaceFiles.mockResolvedValue([]);

    const { default: WorkspaceDesktopApp } = await import('@/components/os/apps/WorkspaceDesktopApp');
    const { container } = render(<WorkspaceDesktopApp workspaceId="w1" workspaceName="Alpha" />);

    await waitFor(() => expect(screen.getByTestId('ws-desktop-root')).toBeTruthy());
    expect(container.querySelector('[data-layout-id]')).toBeNull();
    // The name still renders — just no morph.
    expect(screen.getByRole('heading', { level: 2, name: 'Alpha' })).toBeTruthy();
  });
});

// ── 4. Trust↔Memories tab morph ──────────────────────────────────────────────
describe('Lane HM · Trust↔Memories tab morph', () => {
  async function renderMemory(view: 'trust' | 'memories', reduce = false) {
    h.reduce = reduce;
    const { default: MemoryCenterApp } = await import('@/components/os/apps/MemoryCenterApp');
    return render(
      <TooltipProvider>
        <MemoryCenterApp
          mind="personal"
          onMindChange={vi.fn()}
          view={view}
          onViewChange={vi.fn()}
          workspaceId="w1"
          workspaceName="Alpha"
          timeline={timelineProps}
        />
      </TooltipProvider>,
    );
  }

  it('the panel body is wrapped in the morph container on both views', async () => {
    const { rerender } = await renderMemory('trust');
    const panel = screen.getByTestId('memory-view-panel');
    expect(panel).toBeTruthy();
    expect(panel.querySelector('[data-testid="stub-trust"]')).toBeTruthy();

    const { default: MemoryCenterApp } = await import('@/components/os/apps/MemoryCenterApp');
    rerender(
      <TooltipProvider>
        <MemoryCenterApp
          mind="personal" onMindChange={vi.fn()} view="memories" onViewChange={vi.fn()}
          workspaceId="w1" workspaceName="Alpha" timeline={timelineProps}
        />
      </TooltipProvider>,
    );
    const panel2 = screen.getByTestId('memory-view-panel');
    expect(panel2.querySelector('[data-testid="stub-mc-tab"]')).toBeTruthy();
    // Exactly one panel — no dual-mount hard-cut leak.
    expect(screen.getAllByTestId('memory-view-panel')).toHaveLength(1);
  });

  it('animates on view change but swaps INSTANTLY under reduced motion', async () => {
    const { unmount } = await renderMemory('trust', false);
    expect(screen.getByTestId('memory-view-panel').getAttribute('data-initial')).not.toBe('false');
    unmount();

    await renderMemory('trust', true);
    // Reduced motion → initial disabled (instant swap, no settle).
    expect(screen.getByTestId('memory-view-panel').getAttribute('data-initial')).toBe('false');
  });
});
