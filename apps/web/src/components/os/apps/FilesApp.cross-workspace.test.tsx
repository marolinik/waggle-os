/** Cross-workspace Files rail behavior: file copies are real, folders are explicit. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    listFiles: vi.fn(),
    copyFileBetweenWorkspaces: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/lib/app-deeplink', () => ({ consumeDeepLink: () => null }));

import FilesApp, { resetFilesRouteCache } from './FilesApp';

const workspaces = [
  { id: 'source', name: 'Source workspace', group: 'Test' },
  { id: 'target', name: 'Target workspace', group: 'Test' },
];

const files = [
  { name: 'brief.md', path: '/brief.md', type: 'file' as const, size: 12 },
  { name: 'research', path: '/research', type: 'directory' as const },
];

function renderFiles() {
  return render(
    <TooltipProvider>
      <FilesApp
        workspaceId="source"
        workspaceName="Source workspace"
        workspaces={workspaces}
        onSelectWorkspace={vi.fn()}
      />
    </TooltipProvider>,
  );
}

function dragDataTransfer() {
  return {
    effectAllowed: 'none',
    setData: vi.fn(),
  };
}

beforeEach(() => {
  resetFilesRouteCache();
  mocks.adapter.listFiles.mockResolvedValue(files);
  mocks.adapter.copyFileBetweenWorkspaces.mockResolvedValue({
    name: 'brief.md', path: '/brief.md', type: 'file', size: 12,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('FilesApp cross-workspace copy', () => {
  it('does not show the previous workspace while the selected workspace loads', async () => {
    let resolveTarget: ((value: typeof files) => void) | undefined;
    mocks.adapter.listFiles.mockImplementation((workspaceId: string) => {
      if (workspaceId === 'source') return Promise.resolve(files);
      return new Promise(resolve => { resolveTarget = resolve; });
    });
    const view = renderFiles();

    expect(await screen.findByText('brief.md')).toBeInTheDocument();
    const targetFiles = [{ name: 'target.md', path: '/target.md', type: 'file' as const, size: 18 }];
    view.rerender(
      <TooltipProvider>
        <FilesApp
          workspaceId="target"
          workspaceName="Target workspace"
          workspaces={workspaces}
          onSelectWorkspace={vi.fn()}
        />
      </TooltipProvider>,
    );

    await waitFor(() => expect(screen.queryByText('brief.md')).not.toBeInTheDocument());
    expect(screen.getByTestId('files-loading')).toBeInTheDocument();
    resolveTarget?.(targetFiles);
    expect(await screen.findByText('target.md')).toBeInTheDocument();
  });

  it('copies a dragged file to the target workspace root and confirms success', async () => {
    renderFiles();
    const row = await screen.findByText('brief.md');
    const target = screen.getByRole('button', { name: 'Target workspace' });

    fireEvent.dragStart(row.closest('tr')!, { dataTransfer: dragDataTransfer() });
    fireEvent.drop(target, { dataTransfer: dragDataTransfer() });

    await waitFor(() => expect(mocks.adapter.copyFileBetweenWorkspaces).toHaveBeenCalledWith(
      'source', 'target', '/brief.md', '/brief.md',
    ));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: '1 file copied',
    }));
  });

  it('explains that folders must be moved within a workspace', async () => {
    renderFiles();
    const row = (await screen.findAllByText('research'))
      .map(element => element.closest('tr'))
      .find(candidate => candidate?.draggable);
    expect(row).toBeTruthy();
    const target = screen.getByRole('button', { name: 'Target workspace' });

    fireEvent.dragStart(row!, { dataTransfer: dragDataTransfer() });
    fireEvent.drop(target, { dataTransfer: dragDataTransfer() });

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Select files to copy',
      variant: 'destructive',
    })));
    expect(mocks.adapter.copyFileBetweenWorkspaces).not.toHaveBeenCalled();
  });
});
