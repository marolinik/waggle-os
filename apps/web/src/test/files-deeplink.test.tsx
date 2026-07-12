/**
 * Files deep-link consumption (UX-Northstar Phase C2) — chat artifact cards
 * stash {appId:'files', path} and open the Files app; FilesApp must navigate
 * to the file's directory, select it, and open the preview.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, waitFor, cleanup } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { stashDeepLink, consumeDeepLink } from '@/lib/app-deeplink';

const mocks = vi.hoisted(() => ({
  adapter: {
    listFiles: vi.fn(),
    downloadFile: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import FilesApp, { resetFilesRouteCache } from '@/components/os/apps/FilesApp';

const render = () =>
  rtlRender(<TooltipProvider><FilesApp workspaceId="ws1" /></TooltipProvider>);

beforeEach(() => {
  resetFilesRouteCache();
  vi.clearAllMocks();
  mocks.adapter.listFiles.mockResolvedValue([
    { name: 'q3-summary.md', path: '/reports/q3-summary.md', type: 'file', size: 12, modified: Date.now() },
  ]);
  mocks.adapter.downloadFile.mockResolvedValue(new Blob(['# Q3 summary']));
});

afterEach(() => {
  cleanup();
  consumeDeepLink('files'); // drain leftovers between tests
});

describe('Files deep-link (chat artifact → Open in Files)', () => {
  it('navigates to the file directory and opens its preview', async () => {
    stashDeepLink({ appId: 'files', path: '/reports/q3-summary.md' });
    render();
    await waitFor(() => {
      expect(mocks.adapter.listFiles).toHaveBeenCalledWith('ws1', '/reports');
      expect(mocks.adapter.downloadFile).toHaveBeenCalledWith('ws1', '/reports/q3-summary.md');
    });
  });

  it('normalizes a relative path before navigating', async () => {
    stashDeepLink({ appId: 'files', path: 'reports/q3-summary.md' });
    render();
    await waitFor(() => {
      expect(mocks.adapter.listFiles).toHaveBeenCalledWith('ws1', '/reports');
    });
  });

  it('without a stashed link, loads the root as before', async () => {
    render();
    await waitFor(() => {
      expect(mocks.adapter.listFiles).toHaveBeenCalledWith('ws1', '/');
    });
    expect(mocks.adapter.downloadFile).not.toHaveBeenCalled();
  });

  // Security (push review MEDIUM): the deep-link path originates from an agent
  // tool-call input — a traversal payload must be neutralized before it can set
  // currentPath/selection or reach the adapter.
  it('strips ../ traversal from a malicious deep-link path', async () => {
    stashDeepLink({ appId: 'files', path: '/reports/../../etc/passwd' });
    render();
    await waitFor(() => {
      // '/reports/../../etc/passwd' normalizes to '/etc/passwd' → parent '/etc'.
      // No '..' ever reaches the adapter; backend resolveSafe is the hard guard.
      expect(mocks.adapter.listFiles).toHaveBeenCalledWith('ws1', '/etc');
    });
    const calledPaths = mocks.adapter.listFiles.mock.calls.map(c => c[1]);
    expect(calledPaths.some(p => String(p).includes('..'))).toBe(false);
    const dlPaths = mocks.adapter.downloadFile.mock.calls.map(c => c[1]);
    expect(dlPaths.some(p => String(p).includes('..'))).toBe(false);
  });

  it('a path that resolves to root preselects nothing', async () => {
    stashDeepLink({ appId: 'files', path: '/reports/..' });
    render();
    await waitFor(() => {
      expect(mocks.adapter.listFiles).toHaveBeenCalledWith('ws1', '/');
    });
    // Resolved to '/', so no file is selected/previewed.
    expect(mocks.adapter.downloadFile).not.toHaveBeenCalled();
  });
});
