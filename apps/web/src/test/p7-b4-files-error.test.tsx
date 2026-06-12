/**
 * P7/D15 B4 — Files must distinguish a real cold-load FAILURE from offline-with-cache.
 * Before: every failure set offline=true → "showing cached files" even with no cache,
 * and an in-flight load looked like "Empty directory".
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({ adapter: { listFiles: vi.fn() } }));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import FilesApp from '@/components/os/apps/FilesApp';

const render = () =>
  rtlRender(<TooltipProvider><FilesApp workspaceId="ws1" /></TooltipProvider>);

beforeEach(() => vi.clearAllMocks());
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
});
