/**
 * WorkspaceActionsMenu (UX-Northstar 2026-06-13 G1) — the management surface
 * for a workspace. Pins:
 *  - the kebab opens Rename / Archive / Export summary / Delete…
 *  - Archive ↔ Restore label follows workspace.status
 *  - rename + archive go through ShellContext.patchWorkspace and fire onChanged
 *  - delete is gated on typing the exact workspace name
 *  - a failed mutation (false from the hook) does NOT fire onChanged
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import WorkspaceActionsMenu from '@/components/os/WorkspaceActionsMenu';

const mocks = vi.hoisted(() => ({
  shell: {
    patchWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
  },
  adapter: {
    getWorkspaceContext: vi.fn(),
    exportWorkspaceBriefing: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

const openMenu = () => fireEvent.click(screen.getByTestId('workspace-actions-trigger'));

describe('WorkspaceActionsMenu', () => {
  beforeEach(() => {
    mocks.shell.patchWorkspace.mockResolvedValue(true);
    mocks.shell.deleteWorkspace.mockResolvedValue(true);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({ stats: { memoryCount: 12 } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('opens a menu with all management actions', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    openMenu();
    expect(screen.getByText('Rename')).toBeTruthy();
    expect(screen.getByText('Archive')).toBeTruthy();
    expect(screen.getByText('Export summary')).toBeTruthy();
    expect(screen.getByText('Delete…')).toBeTruthy();
  });

  it('shows Restore instead of Archive for an archived workspace', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha', status: 'archived' }} />);
    openMenu();
    expect(screen.getByText('Restore')).toBeTruthy();
    expect(screen.queryByText('Archive')).toBeNull();
  });

  it('archives via patchWorkspace and fires onChanged', async () => {
    const onChanged = vi.fn();
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} onChanged={onChanged} />);
    openMenu();
    fireEvent.click(screen.getByText('Archive'));
    await waitFor(() => {
      expect(mocks.shell.patchWorkspace).toHaveBeenCalledWith('w1', { status: 'archived' });
      expect(onChanged).toHaveBeenCalledWith('archive');
    });
  });

  it('renames via patchWorkspace from the rename dialog', async () => {
    const onChanged = vi.fn();
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} onChanged={onChanged} />);
    openMenu();
    fireEvent.click(screen.getByText('Rename'));
    const input = screen.getByTestId('workspace-rename-input');
    fireEvent.change(input, { target: { value: 'Client Alpha' } });
    fireEvent.click(screen.getByTestId('workspace-rename-save'));
    await waitFor(() => {
      expect(mocks.shell.patchWorkspace).toHaveBeenCalledWith('w1', { name: 'Client Alpha' });
      expect(onChanged).toHaveBeenCalledWith('rename');
    });
  });

  it('gates delete on typing the exact workspace name', async () => {
    const onChanged = vi.fn();
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} onChanged={onChanged} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete…'));

    const confirmButton = screen.getByTestId('workspace-delete-confirm-button') as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('workspace-delete-confirm-input'), { target: { value: 'Alph' } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('workspace-delete-confirm-input'), { target: { value: 'Alpha' } });
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    await waitFor(() => {
      expect(mocks.shell.deleteWorkspace).toHaveBeenCalledWith('w1');
      expect(onChanged).toHaveBeenCalledWith('delete');
    });
  });

  it('shows what is at stake in the delete dialog (memory count, best-effort)', async () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    openMenu();
    fireEvent.click(screen.getByText('Delete…'));
    await waitFor(() => {
      expect(mocks.adapter.getWorkspaceContext).toHaveBeenCalledWith('w1');
      expect(screen.getByText(/12 memories/)).toBeTruthy();
    });
  });

  // ── Wave W Lane B (item 2) — actions-menu craft ──────────────────────────
  it('opens with the roomier "comfortable" item density (py-2, marketplace-matched)', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    openMenu();
    // The workspace actions menu opts into the roomier density rather than the
    // compact default other ContextMenu callers keep.
    expect(screen.getByText('Rename').className).toContain('py-2');
  });

  it('scales the menu in FROM the trigger corner (transform-origin top-left)', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    openMenu();
    const container = screen.getByText('Rename').parentElement as HTMLElement;
    expect(container.style.transformOrigin).toBe('top left');
  });

  it('does not steal focus into the menu (preserves Escape-returns-focus) and Escape closes it', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    openMenu();
    // The menu never auto-focuses an item — focus stays on the kebab, which is
    // what makes Escape return focus to the trigger. Escape then closes it.
    expect(screen.getByText('Rename')).not.toBe(document.activeElement);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText('Rename')).toBeNull();
  });

  // ── Pillar 2.7 (Lane K) — keyboard-power layer ───────────────────────────
  it('the kebab trigger reveals on keyboard focus and carries a ≥40px hit area', () => {
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} />);
    const kebab = screen.getByTestId('workspace-actions-trigger');
    // focus-visible reveal (the systemic :focus-visible ring paints --focus-ring).
    expect(kebab.className).toContain('focus-visible:opacity-100');
    // Centered 40px ::before expands the effective target from 24px, no visual change.
    expect(kebab.className).toContain('relative');
    expect(kebab.className).toContain('before:h-10');
    expect(kebab.className).toContain('before:w-10');
  });

  it('does NOT fire onChanged when the mutation fails', async () => {
    mocks.shell.patchWorkspace.mockResolvedValue(false);
    const onChanged = vi.fn();
    render(<WorkspaceActionsMenu workspace={{ id: 'w1', name: 'Alpha' }} onChanged={onChanged} />);
    openMenu();
    fireEvent.click(screen.getByText('Archive'));
    await waitFor(() => {
      expect(mocks.shell.patchWorkspace).toHaveBeenCalled();
    });
    expect(onChanged).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});
