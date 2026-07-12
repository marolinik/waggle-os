/**
 * StorageAndFilesApp (screen 07) — A/B variation shell.
 *
 * Covers: default lands on Variation A (the storage map), the toggle swaps to
 * Variation B (the Files browser), Variation A grounds its tree on real
 * adapter.listFiles data (no fabricated sizes), and the no-fabrication
 * provenance contract — the Files table Source column reads "—" because the
 * file store carries no creator field.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FileEntry, Workspace } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    listFiles: vi.fn(),
    getDocumentVersions: vi.fn(),
    downloadFile: vi.fn(),
    uploadFile: vi.fn(),
  },
  toast: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

// Deep-link stash is read on FilesApp mount — keep it inert.
vi.mock('@/lib/app-deeplink', () => ({ consumeDeepLink: () => null }));

import StorageAndFilesApp from './StorageAndFilesApp';
import { resetFilesRouteCache } from './FilesApp';

const ROOT_FILES: FileEntry[] = [
  { name: 'research', path: '/research', type: 'directory', modifiedAt: '2026-06-10T00:00:00Z' },
  { name: 'teardown.md', path: '/teardown.md', type: 'file', size: 49152, modifiedAt: '2026-06-17T00:00:00Z' },
  { name: 'mem0-teardown.pdf', path: '/mem0-teardown.pdf', type: 'file', size: 1468006, modifiedAt: '2026-06-16T00:00:00Z' },
];

const WS: Workspace = {
  id: 'ws-1',
  name: 'Competitive Intelligence',
  group: 'research',
  storageType: 'local',
  storagePath: '~/Waggle/workspaces/competitive-intelligence/',
  memoryCount: 142,
};

beforeEach(() => {
  resetFilesRouteCache();
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
  mocks.adapter.listFiles.mockResolvedValue(ROOT_FILES);
  mocks.adapter.getDocumentVersions.mockResolvedValue([]);
  mocks.adapter.downloadFile.mockResolvedValue(new Blob(['']));
  mocks.adapter.uploadFile.mockResolvedValue({ name: 'uploaded.md', path: '/uploaded.md', type: 'file', size: 4 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const renderApp = () =>
  render(
    <TooltipProvider>
      <StorageAndFilesApp
        workspaceId="ws-1"
        workspaceName="Competitive Intelligence"
        defaultStorageType="local"
        workspace={WS}
      />
    </TooltipProvider>,
  );

describe('StorageAndFilesApp', () => {
  it('renders both variation toggles and defaults to Variation A (Where it lives)', async () => {
    renderApp();
    expect(screen.getByTestId('storage-view-a')).toBeInTheDocument();
    expect(screen.getByTestId('storage-view-b')).toBeInTheDocument();
    // A's heading is present; B is not mounted.
    expect(await screen.findByRole('heading', { name: /where this workspace lives/i })).toBeInTheDocument();
  });

  it('Variation A grounds its tree on real listFiles data — no fabricated sizes', async () => {
    renderApp();
    // Real entries from the adapter, with a real formatted size.
    expect(await screen.findByText('teardown.md')).toBeInTheDocument();
    expect(screen.getByText('research/')).toBeInTheDocument();
    expect(screen.getByText('48.0 KB')).toBeInTheDocument();
    // The real memory count from the workspace record (shown on the tree line
    // and again in the grounded summary).
    expect(screen.getAllByText('142 memories').length).toBeGreaterThan(0);
  });

  it('makes the storage overview scroll region keyboard reachable', async () => {
    renderApp();
    const overview = await screen.findByRole('region', { name: /workspace storage overview/i });
    expect(overview).toHaveAttribute('tabindex', '0');
  });

  it('the active storage-type card matches the workspace storageType (local), not a hardcoded one', async () => {
    renderApp();
    await screen.findByText('teardown.md');
    const localCard = screen.getByText('Local').closest('article');
    expect(localCard).toHaveAttribute('aria-current', 'true');
    const virtualCard = screen.getByText('Virtual').closest('article');
    expect(virtualCard).not.toHaveAttribute('aria-current');
  });

  it('toggles to Variation B (Files browser) and the Source column reads "—" (no fabricated provenance)', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));

    // The Files table renders with a Source header.
    expect(await screen.findByRole('columnheader', { name: /source/i })).toBeInTheDocument();
    // Every file row's Source cell is the honest em-dash — never an invented author.
    const sourceCells = await screen.findAllByTestId('file-source');
    expect(sourceCells.length).toBeGreaterThan(0);
    for (const cell of sourceCells) {
      expect(cell).toHaveTextContent('—');
    }
  });

  it('makes the files browser scroll region keyboard reachable', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));

    const fileBrowser = await screen.findByRole('region', { name: /files in competitive intelligence/i });
    expect(fileBrowser).toHaveAttribute('tabindex', '0');
  });

  it('names file toolbar icon controls and the temporary filter field', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    expect(screen.getByRole('button', { name: /go to parent folder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /refresh files/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create folder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload files/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show list view/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show grid view/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /show file search/i }));
    const filter = screen.getByRole('textbox', { name: /filter files/i });
    expect(filter).toHaveAttribute('name', 'fileFilter');
    expect(filter).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByRole('button', { name: /clear file search/i })).toBeInTheDocument();
  });

  it('names transient new-folder and rename fields', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    fireEvent.click(screen.getByRole('button', { name: /create folder/i }));
    const newFolderName = screen.getByRole('textbox', { name: /new folder name/i });
    expect(newFolderName).toHaveAttribute('name', 'newFolderName');
    expect(newFolderName).toHaveAttribute('autocomplete', 'off');
    expect(newFolderName).toHaveClass('focus-visible:ring-ring');

    fireEvent.click(screen.getByText('teardown.md'), { ctrlKey: true });
    fireEvent.keyDown(window, { key: 'F2' });
    const rename = await screen.findByRole('textbox', { name: /rename teardown\.md/i });
    expect(rename).toHaveAttribute('name', 'fileRename');
    expect(rename).toHaveAttribute('autocomplete', 'off');
    expect(rename).toHaveClass('focus-visible:ring-ring');
  });

  it('names the move dialog icon close control', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    fireEvent.click(screen.getByText('teardown.md'), { ctrlKey: true });
    fireEvent.click(screen.getByText('mem0-teardown.pdf'), { ctrlKey: true });
    await screen.findByText('2 selected');
    fireEvent.click(screen.getByRole('button', { name: /^move$/i }));

    const close = await screen.findByRole('button', { name: /close move dialog/i });
    expect(close.className).toContain('focus-visible:ring-2');
  });

  it('names the file properties icon close control', async () => {
    renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    const fileRow = screen.getByText('teardown.md').closest('tr');
    expect(fileRow).not.toBeNull();
    fireEvent.contextMenu(fileRow!, { clientX: 24, clientY: 24 });
    fireEvent.click(await screen.findByRole('button', { name: /^properties$/i }));

    const close = await screen.findByRole('button', { name: /close file properties/i });
    expect(close.className).toContain('focus-visible:ring-2');
  });

  it('surfaces failed uploads without adding a false-success file row', async () => {
    mocks.adapter.uploadFile.mockRejectedValueOnce(new Error('disk full'));
    const { container } = renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    const uploadInput = fileInputs.at(-1);
    expect(uploadInput).toBeDefined();

    fireEvent.change(uploadInput!, {
      target: {
        files: [new File(['draft'], 'failed-upload.md', { type: 'text/markdown' })],
      },
    });

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Upload failed',
        variant: 'destructive',
      }));
    });
    expect(screen.queryByText('failed-upload.md')).not.toBeInTheDocument();
  });

  it('adds successful uploads using the adapter-returned file entry', async () => {
    const { container } = renderApp();
    fireEvent.click(screen.getByTestId('storage-view-b'));
    await screen.findByRole('columnheader', { name: /source/i });

    const fileInputs = Array.from(container.querySelectorAll<HTMLInputElement>('input[type="file"]'));
    const uploadInput = fileInputs.at(-1);
    expect(uploadInput).toBeDefined();

    fireEvent.change(uploadInput!, {
      target: {
        files: [new File(['local'], 'local-draft.md', { type: 'text/markdown' })],
      },
    });

    expect(await screen.findByText('uploaded.md')).toBeInTheDocument();
    expect(screen.queryByText('local-draft.md')).not.toBeInTheDocument();
  });

  it('does not fabricate a memory count when the workspace lacks one', async () => {
    render(
      <TooltipProvider>
        <StorageAndFilesApp
          workspaceId="ws-2"
          workspaceName="Fresh"
          workspace={{ ...WS, id: 'ws-2', name: 'Fresh', memoryCount: undefined }}
        />
      </TooltipProvider>,
    );
    await screen.findByText('teardown.md');
    // The hive.mind line shows "—" rather than an invented count.
    const tree = screen.getByLabelText(/on-disk layout/i);
    expect(within(tree).getByText('hive.mind')).toBeInTheDocument();
    expect(screen.queryByText(/142 memories/)).not.toBeInTheDocument();
  });
});
