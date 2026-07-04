/**
 * AllWorkspacesApp (Warm-Hive PR6c · screen 04) — the full workspace shelf.
 * Pins the contract:
 *  - renders a grid card per workspace (name + real stats)
 *  - the search box filters by name
 *  - the storage-type pills filter (All / Virtual / Local / Team)
 *  - a zero-workspace visit shows the create-first empty state (D16)
 *  - NO-FABRICATION: a workspace with undefined memoryCount renders NO memory
 *    chip (W2B: not even a filler "—"), never an invented number (PR3/PR3.5)
 *  - opening a card selects the workspace + fires onOpenWorkspace
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { Workspace } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  shell: {
    workspaces: [] as Workspace[],
    workspacesError: null as string | null,
    selectWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
  },
}));

vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));

// Thin stubs: both reach into ShellContext/adapter/toast internally — out of
// scope for this view's grid/search/filter/empty-state logic.
vi.mock('../WorkspaceActionsMenu', () => ({
  default: ({ workspace }: { workspace: { id: string } }) => (
    <button data-testid={`actions-${workspace.id}`}>actions</button>
  ),
}));
vi.mock('../overlays/CreateWorkspaceDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-dialog" /> : null),
}));

import AllWorkspacesApp from './AllWorkspacesApp';

const ws = (over: Partial<Workspace> & { id: string; name: string }): Workspace => ({
  group: 'Personal',
  ...over,
});

beforeEach(() => {
  mocks.shell.workspaces = [
    ws({ id: 'w1', name: 'Competitive Intelligence', storageType: 'local', memoryCount: 142, health: 'healthy' }),
    ws({ id: 'w2', name: 'Pricing Model', storageType: 'virtual', memoryCount: 64, health: 'degraded' }),
    ws({ id: 'w3', name: 'Marketing Site', storageType: 'team', memoryCount: 51 }),
    // No memoryCount → must render an honest dash, never a fabricated number.
    ws({ id: 'w4', name: 'Scratch', storageType: 'virtual' }),
  ];
  mocks.shell.workspacesError = null;
  mocks.shell.createWorkspace.mockResolvedValue(undefined);
  mocks.shell.refreshWorkspaces.mockResolvedValue(undefined);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AllWorkspacesApp', () => {
  it('renders a grid card for every workspace', () => {
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-grid')).toBeInTheDocument();
    expect(screen.getByTestId('all-workspaces-card-w1')).toBeInTheDocument();
    expect(screen.getByTestId('all-workspaces-card-w2')).toBeInTheDocument();
    expect(screen.getByTestId('all-workspaces-card-w3')).toBeInTheDocument();
    expect(screen.getByTestId('all-workspaces-card-w4')).toBeInTheDocument();
    expect(screen.getByText('Competitive Intelligence')).toBeInTheDocument();
    // Real counts render as-is.
    expect(screen.getByText(/142 memories/)).toBeInTheDocument();
  });

  it('does NOT fabricate a count for a workspace with undefined memoryCount', () => {
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-w4');
    // W2B: no memory chip at all when the count is absent — no filler dash, and
    // no stray digit invented for the missing count.
    expect(card.textContent).not.toContain('—');
    expect(card.textContent).not.toMatch(/\d+\s*memor/);
  });

  it('filters by name via the search box', () => {
    render(<AllWorkspacesApp />);
    fireEvent.change(screen.getByTestId('all-workspaces-search'), { target: { value: 'pricing' } });
    expect(screen.getByTestId('all-workspaces-card-w2')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-card-w1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-card-w3')).not.toBeInTheDocument();
  });

  it('shows a "no match" message when search excludes everything', () => {
    render(<AllWorkspacesApp />);
    fireEvent.change(screen.getByTestId('all-workspaces-search'), { target: { value: 'zzzz-nope' } });
    expect(screen.getByTestId('all-workspaces-no-match')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-grid')).not.toBeInTheDocument();
  });

  it('filters by storage type via the pills (Virtual leaves only virtual workspaces)', () => {
    render(<AllWorkspacesApp />);
    fireEvent.click(screen.getByTestId('all-workspaces-filter-virtual'));
    expect(screen.getByTestId('all-workspaces-card-w2')).toBeInTheDocument(); // virtual
    expect(screen.getByTestId('all-workspaces-card-w4')).toBeInTheDocument(); // virtual
    expect(screen.queryByTestId('all-workspaces-card-w1')).not.toBeInTheDocument(); // local
    expect(screen.queryByTestId('all-workspaces-card-w3')).not.toBeInTheDocument(); // team
  });

  it('the Local pill leaves only local workspaces', () => {
    render(<AllWorkspacesApp />);
    fireEvent.click(screen.getByTestId('all-workspaces-filter-local'));
    expect(screen.getByTestId('all-workspaces-card-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-card-w2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-card-w4')).not.toBeInTheDocument();
  });

  it('opening a card selects the workspace and fires onOpenWorkspace', () => {
    const onOpenWorkspace = vi.fn();
    render(<AllWorkspacesApp onOpenWorkspace={onOpenWorkspace} />);
    fireEvent.click(screen.getByTestId('all-workspaces-open-w1'));
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('w1');
    expect(onOpenWorkspace).toHaveBeenCalledWith('w1');
  });

  it('shows the create-first empty state when there are zero workspaces (D16)', () => {
    mocks.shell.workspaces = [];
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-grid')).not.toBeInTheDocument();

    // The CTA opens the reused CreateWorkspaceDialog rather than dead-ending.
    fireEvent.click(screen.getByTestId('all-workspaces-create-first'));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });
});
