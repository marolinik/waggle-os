/**
 * P3 (D2) — two-mind Memory Center: MemoryCenterTab per-mind parameterization.
 *
 *  - Default mount stays personal-mind (pre-P3 call sites + J08 unchanged).
 *  - mind='workspace' reads with {mind, workspaceId} and every mutation carries
 *    workspaceId — without it the server's candidateStores search misses the
 *    workspace store and 404s (the bug class this phase fixes).
 *  - mind='workspace' with no workspaceId must NOT fall back to a personal
 *    fetch mislabeled as workspace data.
 *  - consumeDeepLinks=false (WorkspaceDesktop embed) must not steal the J08
 *    stash meant for the /memory route instance.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { stashDeepLink, consumeDeepLink } from '@/lib/app-deeplink';
import { clearMemoryListCache } from '@/components/os/apps/memory/memory-list-cache';
import type { Memory } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    listMemories: vi.fn(),
    patchMemory: vi.fn(),
    archiveMemory: vi.fn(),
    deleteMemoryById: vi.fn(),
    mergeMemories: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

const mem = (over: Partial<Memory> = {}): Memory => ({
  id: '1',
  kind: 'fact',
  title: 'GTM fact',
  content: 'The Germany GTM launches in Q3.',
  scope: 'workspace',
  workspaceId: 'w1',
  source: 'user_stated',
  sourceId: null,
  sourceUrl: null,
  importance: 'normal',
  status: 'active',
  createdAt: '2026-06-11T08:00:00.000Z',
  ...over,
});

async function renderTab(props: Record<string, unknown> = {}) {
  const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
  render(<MemoryCenterTab {...props} />);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  consumeDeepLink('memory'); // drop any stash a test left behind
  clearMemoryListCache(); // Wave T Lane D: reset the module-level list cache between tests
});

describe('MemoryCenterTab two-mind parameterization (P3/D2)', () => {
  it('defaults to the personal mind with no workspace param', async () => {
    mocks.adapter.listMemories.mockResolvedValue([]);
    await renderTab();
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());
    const arg = mocks.adapter.listMemories.mock.calls[0][0];
    expect(arg.mind).toBe('personal');
    expect(arg.workspaceId).toBeUndefined();
  });

  it('lands on the full recent list (All), with the curated Active view as a filter chip (Wave W Lane D item 2)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([]);
    await renderTab();
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());
    const arg = mocks.adapter.listMemories.mock.calls[0][0];
    // No status filter → the server returns the full recent list (density); the
    // curated 'active' view is one click away as a labeled chip.
    expect(arg.status).toBeUndefined();
    expect(screen.getByRole('button', { name: 'All' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Active' }).getAttribute('aria-pressed')).toBe('false');
  });

  it("mind='workspace' reads with {mind:'workspace', workspaceId}", async () => {
    mocks.adapter.listMemories.mockResolvedValue([]);
    await renderTab({ mind: 'workspace', workspaceId: 'w1', consumeDeepLinks: false });
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());
    expect(mocks.adapter.listMemories).toHaveBeenCalledWith(
      expect.objectContaining({ mind: 'workspace', workspaceId: 'w1' }),
    );
  });

  it("mind='workspace' without a workspaceId renders the hint and never fetches", async () => {
    await renderTab({ mind: 'workspace', consumeDeepLinks: false });
    await waitFor(() => expect(screen.getByText(/No workspace selected/)).toBeTruthy());
    expect(mocks.adapter.listMemories).not.toHaveBeenCalled();
  });

  it('merge on the workspace mind carries workspaceId', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '1' }), mem({ id: '2', title: 'Second' })]);
    mocks.adapter.mergeMemories.mockResolvedValue(mem({ id: '3' }));
    await renderTab({ mind: 'workspace', workspaceId: 'w1', consumeDeepLinks: false });
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: /^Select memory/ })).toHaveLength(2));

    for (const box of screen.getAllByRole('checkbox', { name: /^Select memory/ })) fireEvent.click(box);
    fireEvent.click(screen.getByText(/Merge 2 memories/));

    await waitFor(() => {
      expect(mocks.adapter.mergeMemories).toHaveBeenCalledWith(['1', '2'], { workspaceId: 'w1', mind: 'workspace' });
    });
  });

  it('archive from the detail drawer on the workspace mind carries workspaceId', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '9' })]);
    mocks.adapter.archiveMemory.mockResolvedValue(mem({ id: '9', status: 'archived' }));
    await renderTab({ mind: 'workspace', workspaceId: 'w1', consumeDeepLinks: false });
    await waitFor(() => expect(screen.getByLabelText('GTM fact')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('GTM fact'));
    const archiveBtn = await screen.findByText('Archive');
    fireEvent.click(archiveBtn);

    await waitFor(() => {
      // mind rides along so server-side store resolution is STRICT (no
      // cross-mind fall-through on colliding ids — P3 review HIGH).
      expect(mocks.adapter.archiveMemory).toHaveBeenCalledWith('9', 'w1', 'workspace');
    });
  });

  it('personal-mind mutations keep the workspace param off (no cross-mind shadowing)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '4', workspaceId: undefined, scope: 'personal' })]);
    mocks.adapter.archiveMemory.mockResolvedValue(mem({ id: '4', status: 'archived' }));
    await renderTab();
    await waitFor(() => expect(screen.getByLabelText('GTM fact')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('GTM fact'));
    fireEvent.click(await screen.findByText('Archive'));

    await waitFor(() => {
      expect(mocks.adapter.archiveMemory).toHaveBeenCalledWith('4', undefined, 'personal');
    });
  });

  it('consumeDeepLinks=false leaves the J08 stash for the route instance', async () => {
    mocks.adapter.listMemories.mockResolvedValue([]);
    stashDeepLink({ appId: 'memory', filter: 'unreviewed' });
    await renderTab({ mind: 'workspace', workspaceId: 'w1', consumeDeepLinks: false });
    await waitFor(() => expect(mocks.adapter.listMemories).toHaveBeenCalled());

    expect(mocks.adapter.listMemories).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: 'unreviewed' }),
    );
    // The stash is still there for the /memory route's own instance.
    expect(consumeDeepLink('memory')).toBeTruthy();
  });

  it('switching minds clears the merge checklist (no cross-mind merge)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '1' }), mem({ id: '2', title: 'Second' })]);
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    const { rerender } = render(
      <MemoryCenterTab mind="workspace" workspaceId="w1" consumeDeepLinks={false} />,
    );
    await waitFor(() => expect(screen.getAllByRole('checkbox', { name: /^Select memory/ })).toHaveLength(2));
    for (const box of screen.getAllByRole('checkbox', { name: /^Select memory/ })) fireEvent.click(box);
    expect(screen.getByText(/Merge 2 memories/)).toBeTruthy();

    rerender(<MemoryCenterTab mind="personal" consumeDeepLinks={false} />);
    await waitFor(() => expect(screen.queryByText(/Merge 2 memories/)).toBeNull());
  });

  it('a mutation resolving AFTER a mind switch refetches with the new mind (no stale-closure load)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([mem({ id: '1' })]);
    let resolveArchive: ((v: unknown) => void) | undefined;
    mocks.adapter.archiveMemory.mockImplementation(() => new Promise((r) => { resolveArchive = r; }));
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    const { rerender } = render(
      <MemoryCenterTab mind="workspace" workspaceId="w1" consumeDeepLinks={false} />,
    );
    await waitFor(() => expect(screen.getByLabelText('GTM fact')).toBeTruthy());

    fireEvent.click(screen.getByLabelText('GTM fact'));
    fireEvent.click(await screen.findByText('Archive')); // archive now in flight

    rerender(<MemoryCenterTab mind="personal" consumeDeepLinks={false} />); // switch mid-flight
    resolveArchive!(mem({ id: '1', status: 'archived' }));

    // The post-mutation refetch must ride the effect (current props), not the
    // mutation-render's closured load — with the old bug the LAST call would
    // carry mind:'workspace' and out-order the personal fetch.
    await waitFor(() => {
      const last = mocks.adapter.listMemories.mock.calls.at(-1)?.[0];
      expect(last?.mind).toBe('personal');
      expect(last?.workspaceId).toBeUndefined();
    });
  });

  it('frames the list with a result-count header — count always, filter descriptor once narrowed (Wave V Lane A item 2 / Wave W Lane D item 2)', async () => {
    mocks.adapter.listMemories.mockResolvedValue([
      mem({ id: '1', title: 'First fact', content: 'Alpha content' }),
      mem({ id: '2', title: 'Second fact', content: 'Beta content' }),
    ]);
    await renderTab();
    await waitFor(() => expect(screen.getByLabelText('First fact')).toBeTruthy());
    // Trust-hero parity: the header always names the result count, so a
    // filtered-down set never reads as one card floating in a void.
    expect(screen.getByText('2 memories')).toBeTruthy();
    // Wave W Lane D (item 2): the default is now the full recent list (All), so no
    // filter descriptor rides the header at rest…
    expect(screen.queryByText(/filtered by/)).toBeNull();
    // …but selecting the curated Active view names it in the descriptor.
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    await waitFor(() => expect(screen.getByText(/filtered by Active/)).toBeTruthy());
  });

  it('keeps a "loading the rest…" status over seeded rows while a refresh is in flight (Wave V Lane A item 2)', async () => {
    // First load seeds the session list cache.
    mocks.adapter.listMemories.mockResolvedValueOnce([mem({ id: '1', title: 'Seeded fact', content: 'Cached content' })]);
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    const first = render(<MemoryCenterTab mind="personal" consumeDeepLinks={false} />);
    await waitFor(() => expect(screen.getByLabelText('Seeded fact')).toBeTruthy());
    first.unmount();

    // Tab return: rows re-seed from cache instantly; the background refresh never
    // resolves here, so the header must carry the loading affordance OVER the
    // seeded card (not a bare floating card, and not a full-surface skeleton).
    mocks.adapter.listMemories.mockImplementationOnce(() => new Promise(() => {}));
    render(<MemoryCenterTab mind="personal" consumeDeepLinks={false} />);
    expect(screen.getByLabelText('Seeded fact')).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/loading the rest/)).toBeTruthy());
  });

  it("switching minds never renders the previous mind's rows while the new fetch is in flight", async () => {
    mocks.adapter.listMemories.mockResolvedValueOnce([mem({ id: '1', title: 'Workspace-only fact' })]);
    const { default: MemoryCenterTab } = await import('@/components/os/apps/memory/MemoryCenterTab');
    const { rerender } = render(
      <MemoryCenterTab mind="workspace" workspaceId="w1" consumeDeepLinks={false} />,
    );
    await waitFor(() => expect(screen.getByText('Workspace-only fact')).toBeTruthy());

    // Second fetch (the personal mind) never resolves inside this test — the
    // workspace rows must STILL disappear immediately on the switch.
    mocks.adapter.listMemories.mockImplementationOnce(() => new Promise(() => {}));
    rerender(<MemoryCenterTab mind="personal" consumeDeepLinks={false} />);
    await waitFor(() => expect(screen.queryByText('Workspace-only fact')).toBeNull());
    expect(mocks.adapter.listMemories).toHaveBeenLastCalledWith(
      expect.objectContaining({ mind: 'personal' }),
    );
  });
});
