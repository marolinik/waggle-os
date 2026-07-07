/**
 * Lane AL — the aliveness loop (Path-to-9 Pillar 3.2/3.3/3.4).
 *
 * Locks the aliveness moments this lane owns:
 *  - Surprise-recall bloom: the memory-recall step blooms honey on the ACTIVE
 *    turn (data-recall-bloom), never on a history reload; reduced-motion → plain.
 *  - Investment celebration: the overnight accrual figure reuses the DeltaNumber
 *    pulse, bound to the exact source-of-truth count (no fabrication).
 *  - Home ambient hive glow: a home-only, below-attention breath; reduced-motion
 *    holds a static faint radial (REDUCED.ambient = off).
 *
 * framer-motion's `useReducedMotion` caches globally across renders, so it can't
 * be flipped per-test via matchMedia — it's mocked to a hoisted toggle (the real
 * `motion` components stay, so class/data-attribute assertions are unaffected).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ContentBlock, HomeBriefing, OvernightSummary, RecentWorkspaceCard } from '@/lib/types';

const h = vi.hoisted(() => ({ reduce: false }));
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion');
  return { ...actual, useReducedMotion: () => h.reduce };
});

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

import { ActivityStream } from '@/components/os/warm';
import { AmbientHiveGlow } from '@/components/os/warm/AmbientHiveGlow';
import { BlockRenderer } from '@/components/os/apps/chat-blocks';

beforeEach(() => { h.reduce = false; });
afterEach(() => { cleanup(); });

// ── Surprise-recall bloom (Pillar 3.2) ─────────────────────────────────────
describe('surprise-recall bloom', () => {
  it('blooms the recall step (data-recall-bloom) when bloom is set and motion is allowed', () => {
    const { container } = render(
      <ActivityStream
        summary="Worked across your memory"
        defaultOpen
        steps={[{ text: 'Recalled 6 memories', provenance: { source: 'you' }, bloom: true }]}
      />,
    );
    expect(container.querySelector('[data-recall-bloom]')).not.toBeNull();
    expect(screen.getByText('Recalled 6 memories')).toBeInTheDocument();
  });

  it('does NOT bloom under prefers-reduced-motion (plain row, no marker)', () => {
    h.reduce = true;
    const { container } = render(
      <ActivityStream
        summary="Worked across your memory"
        defaultOpen
        steps={[{ text: 'Recalled 6 memories', provenance: { source: 'you' }, bloom: true }]}
      />,
    );
    expect(container.querySelector('[data-recall-bloom]')).toBeNull();
    expect(screen.getByText('Recalled 6 memories')).toBeInTheDocument();
  });

  it('a non-bloom step stays a plain row', () => {
    const { container } = render(
      <ActivityStream summary="Worked" defaultOpen steps={[{ text: 'Searched 9 sites' }]} />,
    );
    expect(container.querySelector('[data-recall-bloom]')).toBeNull();
  });

  it('BlockRenderer blooms a memory-recall step on the ACTIVE (streaming) turn only', () => {
    const recall: ContentBlock[] = [
      { type: 'step', blockId: 's1', description: 'Recalled 3 memories', status: 'done', provenance: { sources: ['user_stated'] } },
    ];
    // Streaming turn → the card is open and the recall row blooms.
    const streaming = render(<BlockRenderer blocks={recall} isStreaming />);
    expect(streaming.container.querySelector('[data-recall-bloom]')).not.toBeNull();
    cleanup();

    // History reload (not streaming) → expand the card; the recall row is plain.
    const history = render(<BlockRenderer blocks={recall} />);
    fireEvent.click(history.getByRole('button', { expanded: false }));
    expect(history.getByText('Recalled 3 memories')).toBeInTheDocument();
    expect(history.container.querySelector('[data-recall-bloom]')).toBeNull();
  });
});

// ── Home ambient hive glow (Pillar 3.4) ────────────────────────────────────
describe('AmbientHiveGlow', () => {
  it('renders nothing when inactive (home-only gate)', () => {
    const { container } = render(<AmbientHiveGlow active={false} />);
    expect(container.querySelector('[data-testid="ambient-hive-glow"]')).toBeNull();
  });

  it('renders a breathing radial when active and motion is allowed', () => {
    render(<AmbientHiveGlow />);
    const glow = screen.getByTestId('ambient-hive-glow');
    expect(glow).toBeInTheDocument();
    expect(glow.getAttribute('data-reduced')).toBe('false');
    expect(glow.getAttribute('aria-hidden')).toBe('true');
    expect(glow.querySelector('.hive-ambient-breath')).not.toBeNull();
  });

  it('holds a static radial under prefers-reduced-motion (no breath loop)', () => {
    h.reduce = true;
    render(<AmbientHiveGlow />);
    const glow = screen.getByTestId('ambient-hive-glow');
    expect(glow.getAttribute('data-reduced')).toBe('true');
    expect(glow.querySelector('.hive-ambient-breath')).toBeNull();
  });
});

// ── Investment celebration (Pillar 3.3) — overnight accrual DeltaNumber ─────
describe('investment celebration — overnight accrual pulse', () => {
  function wsCard(id: string, name: string): RecentWorkspaceCard {
    return { id, name, group: 'Personal', lastActive: '2026-07-06T09:00:00.000Z', pendingCount: 0 };
  }
  function makeBriefing(over: Partial<HomeBriefing> = {}): HomeBriefing {
    return {
      greeting: 'Welcome back, Marko',
      date: '2026-07-07T08:00:00.000Z',
      recentWorkspaces: [wsCard('w1', 'Alpha')],
      suggestedActions: [],
      upNext: [],
      isFirstRun: false,
      needsReviewCount: 0,
      ...over,
    };
  }
  const overnight = (consolidated: number): OvernightSummary => ({
    consolidated,
    artifactsCreated: 0,
    automationsCompleted: 0,
    failures: [],
  });

  beforeEach(async () => {
    const { clearHomeCache } = await import('@/lib/home-cache');
    const { resetBriefingSource } = await import('@/lib/briefing-source');
    clearHomeCache();
    resetBriefingSource();
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('the accrual figure pulses (home-delta-pulse) when it grows over a cache-first paint, bound to the exact count', async () => {
    const { writeHomeCache } = await import('@/lib/home-cache');
    const HomeCockpit = (await import('@/components/os/apps/HomeCockpit')).default;

    // Cache: 5 memories folded. Fresh: 12 (the number the user should SEE grow).
    // Workspace count is held constant so the ONLY pulsing figure is the accrual.
    writeHomeCache({ briefing: makeBriefing(), overnight: overnight(5), highlights: [] });
    mocks.adapter.getHomeBriefing.mockResolvedValue(makeBriefing());
    mocks.adapter.getHomeOvernight.mockResolvedValue(overnight(12));
    mocks.adapter.getWorkspaces.mockResolvedValue([]);
    mocks.adapter.searchMemory.mockResolvedValue([]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);

    render(<HomeCockpit onContinue={vi.fn()} onOpenWorkspaceDesktop={vi.fn()} onCreateWorkspace={vi.fn()} totalWorkspaceCount={1} />);

    // Cache-first paint shows the accrual from cache.
    expect(screen.getByText(/folded/)).toBeInTheDocument();

    // Silent refresh lands the real 12 — and only that figure carries the pulse.
    await waitFor(() => {
      const pulsed = document.querySelector('.home-delta-pulse');
      expect(pulsed?.textContent).toBe('12');
    });
  });
});
