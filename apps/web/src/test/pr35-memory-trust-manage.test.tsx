/**
 * PR3.5 Phase B+C — Memory-Trust "Manage" view (stats + filters + row actions).
 *
 * Pins the no-fabrication stat gating, the filter-chip behavior, and that the
 * row actions hit the real adapter routes (forget/confirm).
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { Memory } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    listMemories: vi.fn(),
    deleteMemoryById: vi.fn().mockResolvedValue(undefined),
    confirmMemory: vi.fn().mockResolvedValue({}),
    patchMemory: vi.fn().mockResolvedValue({}),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/lib/app-deeplink', () => ({ consumeDeepLink: () => null }));

import MemoryTrustManage, { resetMemoryHeroSession } from '@/components/os/apps/memory/MemoryTrustManage';
import { clearMemoryListCache } from '@/components/os/apps/memory/memory-list-cache';

const DAY = 86_400_000;
const iso = (ageDays: number) => new Date(Date.now() - ageDays * DAY).toISOString();

function mem(over: Partial<Memory> & Pick<Memory, 'id'>): Memory {
  return {
    kind: 'fact', title: `Fact ${over.id}`, content: `Content for ${over.id}`,
    scope: 'personal', source: 'agent_inferred', sourceId: null, sourceUrl: null,
    confidence: undefined, importance: 'normal', evidence: undefined, tags: undefined,
    status: 'active', createdAt: iso(1), updatedAt: undefined, lastAccessedAt: iso(1),
    ...over,
  } as Memory;
}

afterEach(() => { cleanup(); vi.clearAllMocks(); clearMemoryListCache(); resetMemoryHeroSession(); });
beforeEach(() => {
  mocks.adapter.deleteMemoryById.mockResolvedValue(undefined);
  mocks.adapter.confirmMemory.mockResolvedValue({});
});

describe('MemoryTrustManage stats + filters + actions (PR3.5 Phase B+C)', () => {
  it('gates "high confidence" to — when no memory carries confidence (no fabrication)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([
      mem({ id: '1', createdAt: iso(1) }),
      mem({ id: '2', createdAt: iso(60) }),
    ]);
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    // W2D: headline now names the scope ("· personal mind").
    await waitFor(() => expect(screen.getByText(/Memories in this hive/)).toBeTruthy());
    // No confidence on any frame → the "high confidence" dimension chip's VALUE
    // is a neutral dash, never a count. (W2D split the old near-always-0
    // "high confidence & fresh" conjunction into two independent chips.)
    const card = screen.getByText('high confidence').previousElementSibling;
    expect(card?.textContent).toBe('—');
  });

  it('renders the confidence ring as NN% when confidence is present', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '7', confidence: 94, createdAt: iso(1) })]);
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('⬡ M-7')).toBeTruthy());
    expect(screen.getByText('94%')).toBeTruthy();
  });

  it('the "Needs confirm" filter shows only unreviewed memories', async () => {
    mocks.adapter.listMemories.mockResolvedValue([
      mem({ id: '1', status: 'active', createdAt: iso(1) }),
      mem({ id: '2', status: 'unreviewed', createdAt: iso(1) }),
    ]);
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('⬡ M-1')).toBeTruthy());
    fireEvent.click(screen.getByText('Needs confirm'));
    await waitFor(() => expect(screen.queryByText('⬡ M-1')).toBeNull());
    expect(screen.getByText('⬡ M-2')).toBeTruthy();
  });

  it('the "Forgotten" filter chip is gated off (disabled — hard delete leaves no list)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '1' })]);
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('⬡ M-1')).toBeTruthy());
    const forgotten = screen.getByText('Forgotten').closest('button')!;
    expect(forgotten.getAttribute('aria-disabled')).toBe('true');
  });

  it('Forget hits deleteMemoryById and fires a toast', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '5', createdAt: iso(1) })]);
    const onToast = vi.fn();
    render(<MemoryTrustManage mind="personal" onToast={onToast} />);
    await waitFor(() => expect(screen.getByText('⬡ M-5')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Forget this'));
    await waitFor(() => expect(mocks.adapter.deleteMemoryById).toHaveBeenCalledWith('5', undefined, 'personal'));
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('Forgotten M-5'));
  });

  it('Confirm on an unreviewed memory hits confirmMemory and fires a toast', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '8', status: 'unreviewed', createdAt: iso(1) })]);
    const onToast = vi.fn();
    render(<MemoryTrustManage mind="personal" onToast={onToast} />);
    await waitFor(() => expect(screen.getByText('⬡ M-8')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Confirm this memory'));
    await waitFor(() => expect(mocks.adapter.confirmMemory).toHaveBeenCalledWith('8', undefined, 'personal'));
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('Confirmed M-8'));
  });

  it('hero count settles instantly on a tab-return remount — never a transient 0 (Wave V Lane A item 1)', async () => {
    resetMemoryHeroSession();
    mocks.adapter.listMemories.mockResolvedValue([
      mem({ id: '1', createdAt: iso(1) }),
      mem({ id: '2', createdAt: iso(1) }),
      mem({ id: '3', createdAt: iso(1) }),
    ]);
    const { unmount } = render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    // First visit resolves the real count (the once-per-session count-up runs here).
    await waitFor(() => expect(screen.getByTestId('memory-trust-total').textContent).toBe('3'));
    unmount();

    // Tab return: the list re-seeds from the session cache, so the hero must show
    // the cached 3 on its very FIRST paint — no skeleton, no count-up from 0.
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    expect(screen.getByTestId('memory-trust-total').textContent).toBe('3');

    // Drain the background refresh so its setState lands inside act().
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalledTimes(2));
  });

  it('the hero count-up floors at ceil(15%) — never paints 0/near-0 above rendered rows (Wave W Lane D item 1)', async () => {
    resetMemoryHeroSession();
    // 20 rows → floor = ceil(20 * 0.15) = 3, so no animation frame can show 0/1/2.
    mocks.adapter.listMemories.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => mem({ id: String(i + 1), createdAt: iso(1) })),
    );
    render(<MemoryTrustManage mind="personal" onToast={() => {}} />);
    // Once data lands the hero replaces the stat-bar skeleton.
    await waitFor(() => expect(screen.getByTestId('memory-trust-total')).toBeTruthy());
    // The count-up is monotonic from the floor, so every sampled frame is ≥ floor
    // (and thus never the "0 Memories with data present" data-bug frame).
    expect(Number(screen.getByTestId('memory-trust-total').textContent)).toBeGreaterThanOrEqual(3);
    // …and it still settles on the true total.
    await waitFor(() => expect(screen.getByTestId('memory-trust-total').textContent).toBe('20'));
  });

  it('workspace mind passes the workspace param to mutations', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '9', createdAt: iso(1) })]);
    render(<MemoryTrustManage mind="workspace" workspaceId="w1" onToast={() => {}} />);
    await waitFor(() => expect(screen.getByText('⬡ M-9')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Forget this'));
    await waitFor(() => expect(mocks.adapter.deleteMemoryById).toHaveBeenCalledWith('9', 'w1', 'workspace'));
  });
});
