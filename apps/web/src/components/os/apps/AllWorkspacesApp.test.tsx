/**
 * AllWorkspacesApp (Warm-Hive PR6c · screen 04) — the full workspace shelf.
 * Pins the contract:
 *  - renders a grid card per workspace (name + real stats)
 *  - the search box filters by name
 *  - the storage-type pills filter (All / Virtual / Local / Team)
 *  - a zero-workspace visit shows the create-first empty state (D16)
 *  - NO-FABRICATION: a workspace with undefined memoryCount renders NO memory
 *    chip (W2B: not even a filler "—"), never an invented number (PR3/PR3.5)
 *  - the ENTIRE card opens the workspace (Wave F fix 1b — no floating "Open >"
 *    link); the actions menu inside stops propagation so managing never opens
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
    ws({ id: 'w1', name: 'Competitive Intelligence', storageType: 'local', memoryCount: 142, sessionCount: 12, health: 'healthy' }),
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
    // Real counts render as-is in the quiet meta row.
    expect(screen.getByText(/142 memories/)).toBeInTheDocument();
    expect(screen.getByText(/12 sessions/)).toBeInTheDocument();
  });

  it('renders the newest session title as the card body ("Last: …") when present (Wave R)', () => {
    mocks.shell.workspaces = [
      ws({ id: 's1', name: 'Sessioned', lastSessionTitle: 'Draft the launch email', lastActive: new Date().toISOString() }),
    ];
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-s1');
    expect(card.textContent).toContain('Last: Draft the launch email');
  });

  it('a description still wins over the session-title body line (Wave R priority)', () => {
    mocks.shell.workspaces = [
      ws({ id: 's2', name: 'Described', description: 'A real description', lastSessionTitle: 'Some session' }),
    ];
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-s2');
    expect(card.textContent).toContain('A real description');
    expect(card.textContent).not.toContain('Last: Some session');
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

  it('hides a storage pill whose count equals the All total (adds no info)', () => {
    // Every workspace is virtual → a "Virtual" pill would filter to the same
    // set as "All", so only the All pill should render.
    mocks.shell.workspaces = [
      ws({ id: 'v1', name: 'Alpha', storageType: 'virtual' }),
      ws({ id: 'v2', name: 'Beta', storageType: 'virtual' }),
      // No storageType → runtime treats absent as virtual (same classify path).
      ws({ id: 'v3', name: 'Gamma' }),
    ];
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-filter-all')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-filter-virtual')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-filter-local')).not.toBeInTheDocument();
  });

  it('the whole card opens the workspace; the actions menu does not (Wave F fix 1b)', () => {
    const onOpenWorkspace = vi.fn();
    render(<AllWorkspacesApp onOpenWorkspace={onOpenWorkspace} />);
    // The title (primary click target) opens via the card's click handler…
    fireEvent.click(screen.getByTestId('all-workspaces-open-w1'));
    expect(mocks.shell.selectWorkspace).toHaveBeenCalledWith('w1');
    expect(onOpenWorkspace).toHaveBeenCalledWith('w1');
    // …and so does the card surface itself.
    fireEvent.click(screen.getByTestId('all-workspaces-card-w2'));
    expect(onOpenWorkspace).toHaveBeenCalledWith('w2');
    // The actions menu stops propagation — managing must never open.
    onOpenWorkspace.mockClear();
    fireEvent.click(screen.getByTestId('actions-w3'));
    expect(onOpenWorkspace).not.toHaveBeenCalled();
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
