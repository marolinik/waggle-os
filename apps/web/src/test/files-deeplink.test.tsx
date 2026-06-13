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

import FilesApp from '@/components/os/apps/FilesApp';

const render = () =>
  rtlRender(<TooltipProvider><FilesApp workspaceId="ws1" /></TooltipProvider>);

beforeEach(() => {
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
});
