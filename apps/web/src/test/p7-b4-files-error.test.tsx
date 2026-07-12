/**
 * P7/D15 B4 — Files must distinguish a real cold-load FAILURE from offline-with-cache.
 * Before: every failure set offline=true → "showing cached files" even with no cache,
 * and an in-flight load looked like "Empty directory".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({ adapter: { listFiles: vi.fn() } }));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import FilesApp, { resetFilesRouteCache } from '@/components/os/apps/FilesApp';

const render = () =>
  rtlRender(<TooltipProvider><FilesApp workspaceId="ws1" /></TooltipProvider>);

beforeEach(() => {
  resetFilesRouteCache();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('P7/B4 — Files cold-load error vs offline', () => {
  it('cold-load failure (no cache) shows an error, not "Empty directory" or "cached files"', async () => {
    mocks.adapter.listFiles.mockRejectedValue(new Error('500'));
    render();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load files/i)).toBeInTheDocument();
    expect(screen.queryByText('Empty directory')).not.toBeInTheDocument();
    expect(screen.queryByText(/showing cached files/i)).not.toBeInTheDocument();
  });

  it('successful empty load shows "Empty directory", not an error', async () => {
    mocks.adapter.listFiles.mockResolvedValue([]);
    render();
    await waitFor(() => expect(screen.getByText('Empty directory')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Review MEDIUM: navigating into a new directory whose load FAILS must show the
  // error — stale entries from the previous dir must not route it to "Empty directory".
  it('cross-directory nav failure shows an error, not a stale "Empty directory"', async () => {
    mocks.adapter.listFiles.mockImplementation((_ws: string, p: string) => {
      if (p === '/sub') return Promise.reject(new Error('500'));
      return Promise.resolve([{ name: 'sub', path: '/sub', type: 'directory', size: 0, modified: Date.now() }]);
    });
    render();
    // Double-click the LIST row (the tree sidebar also lists 'sub'); the list row
    // sits inside a table <tr> whose double-click handler navigates.
    await waitFor(() => expect(screen.getAllByText('sub').length).toBeGreaterThan(0));
    const listRow = screen.getAllByText('sub').map((el) => el.closest('tr')).find(Boolean);
    expect(listRow).toBeTruthy();
    fireEvent.doubleClick(listRow!);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn't load files/i)).toBeInTheDocument();
    expect(screen.queryByText('Empty directory')).not.toBeInTheDocument();
    expect(screen.queryByText(/showing cached files/i)).not.toBeInTheDocument();
  });

  // Review LOW: a failed REFRESH of an already-loaded EMPTY dir keeps showing
  // "Empty directory" (we proved it empty) — not a false cold-load error.
  it('failed refresh of a known-empty dir keeps "Empty directory", not a false error', async () => {
    mocks.adapter.listFiles
      .mockResolvedValueOnce([])
      .mockRejectedValue(new Error('transient 503'));
    render();
    await waitFor(() => expect(screen.getByText('Empty directory')).toBeInTheDocument());
    // Open the file-list context menu (right-click the pane) and hit Refresh to
    // drive the second (failing) load against the already-loaded empty dir.
    fireEvent.contextMenu(screen.getByText('Empty directory'));
    const refreshItem = await screen.findByText('Refresh');
    fireEvent.click(refreshItem);
    await waitFor(() => expect(mocks.adapter.listFiles).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Empty directory')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load files/i)).not.toBeInTheDocument();
  });
});
