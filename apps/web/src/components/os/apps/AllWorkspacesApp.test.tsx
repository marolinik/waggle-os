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
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import type { Workspace } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  shell: {
    workspaces: [] as Workspace[],
    workspacesError: null as string | null,
    workspacesLoading: false,
    selectWorkspace: vi.fn(),
    createWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
  },
}));

vi.mock('@/providers/ShellContext', () => ({ useShell: () => mocks.shell }));

// Wave W (Lane A): drive the entrance choreography's reduced-motion branch
// deterministically. Only useReducedMotion is overridden; every other
// framer-motion export is preserved so the rest of the tree is untouched.
const motionMock = vi.hoisted(() => ({ reduce: false }));
vi.mock('framer-motion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('framer-motion')>()),
  useReducedMotion: () => motionMock.reduce,
}));

// Thin stubs: both reach into ShellContext/adapter/toast internally — out of
// scope for this view's grid/search/filter/empty-state logic.
vi.mock('../WorkspaceActionsMenu', () => ({
  // Forward buttonClassName so the rest-affordance tier (Wave U Lane A item 2)
  // is assertable on the trigger.
  default: ({ workspace, buttonClassName }: { workspace: { id: string }; buttonClassName?: string }) => (
    <button data-testid={`actions-${workspace.id}`} className={buttonClassName}>actions</button>
  ),
}));
vi.mock('../overlays/CreateWorkspaceDialog', () => ({
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="create-dialog" /> : null),
}));

import AllWorkspacesApp, { resetWorkspaceShelfCache } from './AllWorkspacesApp';

const ws = (over: Partial<Workspace> & { id: string; name: string }): Workspace => ({
  group: 'Personal',
  ...over,
});

beforeEach(() => {
  // Wave U Lane A: the shelf cache/resolution flags are module-scoped — reset
  // so each test starts cold (no leak) and non-empty renders resolve at once.
  resetWorkspaceShelfCache();
  motionMock.reduce = false;
  mocks.shell.workspaces = [
    ws({ id: 'w1', name: 'Competitive Intelligence', storageType: 'local', memoryCount: 142, sessionCount: 12, health: 'healthy' }),
    ws({ id: 'w2', name: 'Pricing Model', storageType: 'virtual', memoryCount: 64, health: 'degraded' }),
    ws({ id: 'w3', name: 'Marketing Site', storageType: 'team', memoryCount: 51 }),
    // No memoryCount → must render an honest dash, never a fabricated number.
    ws({ id: 'w4', name: 'Scratch', storageType: 'virtual' }),
  ];
  mocks.shell.workspacesError = null;
  mocks.shell.workspacesLoading = false;
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

  it('renders the newest session title as a quote-styled preview, no "Last:" prefix (Wave S)', () => {
    mocks.shell.workspaces = [
      ws({ id: 's1', name: 'Sessioned', lastSessionTitle: 'Draft the launch email', lastActive: new Date().toISOString() }),
    ];
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-s1');
    expect(card.textContent).toContain('Draft the launch email');
    expect(card.textContent).not.toContain('Last:');
  });

  it('a description still wins over the session-title preview (Wave S priority)', () => {
    mocks.shell.workspaces = [
      ws({ id: 's2', name: 'Described', description: 'A real description', lastSessionTitle: 'Some session' }),
    ];
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-s2');
    expect(card.textContent).toContain('A real description');
    expect(card.textContent).not.toContain('Some session');
  });

  it('suppresses a canned starter greeting from the preview (Wave S honesty contract)', () => {
    mocks.shell.workspaces = [
      ws({ id: 's3', name: 'Fresh', lastSessionTitle: 'Hello! What can you help me with?' }),
    ];
    render(<AllWorkspacesApp />);
    const card = screen.getByTestId('all-workspaces-card-s3');
    // Template text is not data — omitted, never paraphrased.
    expect(card.textContent).not.toContain('Hello! What can you help me with?');
  });

  it('reserves the preview slot even when a card has no description/session/activity (Wave T Lane C fix 1 — reserve, don\'t collapse)', () => {
    // No description, no session title, no created/lastActive → nothing to preview.
    mocks.shell.workspaces = [ws({ id: 'bare', name: 'Bare' })];
    render(<AllWorkspacesApp />);
    const slot = screen.getByTestId('all-workspaces-preview-bare');
    // The slot still renders (its reserved height holds the identity→tags→
    // preview→metrics grammar) but carries no fabricated copy — an empty band.
    expect(slot).toBeInTheDocument();
    expect(slot.textContent).toBe('');
  });

  it('a duplicate-named card keeps the "duplicate name" pill and rides the slug in its tooltip, never as visible text (Wave T Lane C item 2)', () => {
    mocks.shell.workspaces = [
      ws({ id: 'twin-alpha', name: 'Twin' }),
      ws({ id: 'twin-beta', name: 'Twin' }),
    ];
    render(<AllWorkspacesApp />);
    // Both same-named cards keep the collision flag (the pill is kept, not removed).
    expect(screen.getAllByText('duplicate name')).toHaveLength(2);
    const card = screen.getByTestId('all-workspaces-card-twin-alpha');
    const pill = within(card).getByText('duplicate name');
    // R12: raw slug = data debris — it rides the pill's tooltip for
    // disambiguation, never the resting card face.
    expect(pill).toHaveAttribute('title', 'Workspace ID: twin-alpha');
    expect(card.textContent).not.toContain('twin-alpha');
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

  it('shows the create-first empty state ONLY after the query resolves genuinely-empty (D16 · Wave U Lane A · R15-V3 loading flag)', () => {
    mocks.shell.workspaces = [];
    mocks.shell.workspacesLoading = true;
    const { rerender } = render(<AllWorkspacesApp />);
    // Loading is a distinct state — the empty CTA must not flash first.
    expect(screen.getByTestId('all-workspaces-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-empty')).not.toBeInTheDocument();
    // Once the real fetch settles, an empty list becomes the empty state.
    mocks.shell.workspacesLoading = false;
    rerender(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-grid')).not.toBeInTheDocument();

    // The CTA opens the reused CreateWorkspaceDialog rather than dead-ending.
    fireEvent.click(screen.getByTestId('all-workspaces-create-first'));
    expect(screen.getByTestId('create-dialog')).toBeInTheDocument();
  });

  it('renders skeleton cards while the query is unresolved, never the empty CTA prematurely (Wave U Lane A item 1)', () => {
    mocks.shell.workspaces = [];
    mocks.shell.workspacesLoading = true;
    render(<AllWorkspacesApp />);
    // Loading · empty · error are three distinct states — skeletons first.
    expect(screen.getByTestId('all-workspaces-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-empty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-create-first')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-grid')).not.toBeInTheDocument();
  });

  it('a populated query resolves straight to the grid — no skeleton flash', () => {
    // Non-empty on first render → resolved synchronously, no loading state.
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-grid')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-loading')).not.toBeInTheDocument();
  });

  it('seeds a revisit from the session cache so last-known cards paint instantly (Wave U Lane A item 1)', () => {
    // First visit resolves with real cards → populates the module cache.
    const { unmount } = render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-grid')).toBeInTheDocument();
    unmount();
    // A revisit where the live list hasn't rehydrated yet (empty) paints the
    // cached shelf instantly — not a skeleton, not the empty state.
    mocks.shell.workspaces = [];
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-grid')).toBeInTheDocument();
    expect(screen.getByTestId('all-workspaces-card-w1')).toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('all-workspaces-empty')).not.toBeInTheDocument();
  });

  it('the card actions kebab is a rest affordance (low opacity), full on hover/focus-within (Wave U Lane A item 2)', () => {
    render(<AllWorkspacesApp />);
    const kebab = screen.getByTestId('actions-w1');
    // Visible at rest (touch + keyboard), not opacity-0 hover-only reveal.
    expect(kebab.className).toContain('opacity-60');
    expect(kebab.className).not.toContain('opacity-0');
    // Full on hover or focus-within (keyboard/focus parity).
    expect(kebab.className).toContain('group-hover:opacity-100');
    expect(kebab.className).toContain('group-focus-within:opacity-100');
  });

  it('cascades the shelf in on first paint — staggered card-enter, ~40ms apart (Wave W Lane A item 1)', () => {
    render(<AllWorkspacesApp />);
    const c1 = screen.getByTestId('all-workspaces-card-w1');
    const c2 = screen.getByTestId('all-workspaces-card-w2');
    const c3 = screen.getByTestId('all-workspaces-card-w3');
    // Reuses the memory surface's card-enter keyframe (8px rise + fade).
    expect(c1.style.animation).toContain('card-enter');
    // ~40ms/card stagger in grid order; capped so the last card settles ≤500ms.
    expect(c1.style.animationDelay).toBe('0ms');
    expect(c2.style.animationDelay).toBe('40ms');
    expect(c3.style.animationDelay).toBe('80ms');
  });

  it('does NOT replay the entrance on a filter keystroke — once per surface visit (Wave W Lane A item 1)', () => {
    render(<AllWorkspacesApp />);
    expect(screen.getByTestId('all-workspaces-card-w1').style.animation).toContain('card-enter');
    // Filter down to one card, then clear — w1 re-mounts, but the cascade is
    // frozen after the first paint, so it does not rise/fade again.
    fireEvent.change(screen.getByTestId('all-workspaces-search'), { target: { value: 'pricing' } });
    fireEvent.change(screen.getByTestId('all-workspaces-search'), { target: { value: '' } });
    expect(screen.getByTestId('all-workspaces-card-w1').style.animation).toBe('');
  });

  it('reduced motion opts out of the entrance entirely — no rise/fade (Wave W Lane A item 3)', () => {
    motionMock.reduce = true;
    render(<AllWorkspacesApp />);
    const c1 = screen.getByTestId('all-workspaces-card-w1');
    expect(c1.style.animation).toBe('');
    expect(c1.style.animationDelay).toBe('');
  });
});
