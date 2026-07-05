/**
 * Phase 4B (S08) — MCP Hub behaviour over a mocked adapter: installed
 * instance rendering (state badge + C19 scope chip + honest logs-coming-soon),
 * the C21 test-mode label, the B5 install tier gate (TIER_INSUFFICIENT →
 * upgrade event), the SecurityGate blocked → ApprovalModal → forceInsecure-
 * override flow, the C19 scope-editor exact payloads, and revoke with
 * consequences.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getMcps: vi.fn(),
    getMarketplace: vi.fn(),
    installMcp: vi.fn(),
    addCustomMcp: vi.fn(),
    testMcp: vi.fn(),
    startMcp: vi.fn(),
    stopMcp: vi.fn(),
    revokeMcp: vi.fn(),
    updateMcpPermissions: vi.fn(),
    getWorkspaces: vi.fn(),
    getExtendAudit: vi.fn(),
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

// The real MCP_CATALOG is 100+ entries — rendering the full Radix-tooltip grid
// in jsdom is slow enough to time out under parallel suite load. The hub's
// behaviour under test only needs a small honest catalog.
vi.mock('@/components/os/apps/connectors/mcp-registry', () => ({
  MCP_CATALOG: [
    {
      id: 'filesystem', name: 'Filesystem', description: 'Read/write files', author: 'MCP',
      category: 'Files', url: 'https://example.com/fs', installCmd: 'npx @modelcontextprotocol/server-filesystem /path',
      capabilities: ['read', 'write'], official: true,
    },
    {
      id: 'postgres', name: 'PostgreSQL', description: 'Query databases', author: 'MCP',
      category: 'Database', url: 'https://example.com/pg', installCmd: 'npx @modelcontextprotocol/server-postgres',
      capabilities: ['query'], official: true,
    },
  ],
}));

import MCPHubApp from '@/components/os/apps/MCPHubApp';
import { mcpStateBadge } from '@/components/os/apps/mcp/mcp-hub-types';
import { ServiceProvider } from '@/providers/ServiceProvider';

const MCPS = [
  {
    id: 'filesystem', name: 'Filesystem', description: 'Read/write files', category: 'Files',
    official: true, installCmd: 'npx @modelcontextprotocol/server-filesystem /path',
    source: 'catalog', installed: true, tools: ['read_file', 'write_file'],
    status: 'running', scope: 'workspace', connectedTo: ['ws-1'], state: 'ready',
  },
  {
    id: 'postgres', name: 'PostgreSQL', description: 'Query databases', category: 'Database',
    official: true, installCmd: 'npx @modelcontextprotocol/server-postgres',
    source: 'catalog', installed: false, tools: [],
  },
];

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><MCPHubApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getMcps.mockResolvedValue(MCPS);
  // The A4 install-affordance gate: only catalog ids whose name resolves in
  // the marketplace registry (waggle_install_type='mcp') render Install.
  mocks.adapter.getMarketplace.mockResolvedValue({
    packages: [{ name: 'filesystem' }, { name: 'postgres' }], total: 2,
  });
  mocks.adapter.getWorkspaces.mockResolvedValue([
    { id: 'ws-1', name: 'Workspace One' },
    { id: 'ws-2', name: 'Workspace Two' },
  ]);
  mocks.adapter.getExtendAudit.mockResolvedValue([]);
});
afterEach(cleanup);

describe('MCPHubApp — MCP Hub (S08)', () => {
  it('renders installed instances with the runtime state badge, scope chip and honest logs affordance', async () => {
    renderApp();
    expect(await screen.findByText('Filesystem')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('workspace: ws-1')).toBeInTheDocument();
    expect(screen.getByText('read_file')).toBeInTheDocument();
    // C2: no logs route exists — the affordance must be an honest coming-soon.
    // aria-disabled (not `disabled`) so the explanatory tooltip is reachable
    // by hover/focus (Radix never fires on a hard-disabled trigger).
    expect(screen.getByRole('button', { name: /Logs \(soon\)/ })).toHaveAttribute('aria-disabled', 'true');
    // The not-installed catalog entry must NOT appear as an instance.
    expect(screen.queryByText('PostgreSQL')).not.toBeInTheDocument();
  });

  it('C21: the test result is labelled with the mode that actually ran', async () => {
    mocks.adapter.testMcp.mockResolvedValue({
      ok: true, mode: 'static', tools: [],
      note: 'Not installed — static manifest validation only (C21 fallback)',
    });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('button', { name: /Test/ }));
    await waitFor(() => expect(mocks.adapter.testMcp).toHaveBeenCalledWith('filesystem'));
    const result = await screen.findByTestId('mcp-test-result-filesystem');
    expect(result).toHaveTextContent('Static manifest check: passed');
    expect(result).toHaveTextContent('C21 fallback');
  });

  // Headroom for parallel-suite load on the catalog-tab tests.
  const CATALOG_TIMEOUT = 20_000;

  it('B5: a TIER_INSUFFICIENT install routes through the upgrade event', { timeout: CATALOG_TIMEOUT }, async () => {
    mocks.adapter.installMcp.mockResolvedValue({ error: 'TIER_INSUFFICIENT', required: 'TEAMS', actual: 'FREE' });
    const events: CustomEvent[] = [];
    const listener = (e: Event) => events.push(e as CustomEvent);
    window.addEventListener('waggle:tier-insufficient', listener);
    try {
      renderApp();
      await screen.findByText('Filesystem');
      fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
      fireEvent.click(await screen.findByTestId('mcp-install-postgres'));
      await waitFor(() => expect(mocks.adapter.installMcp).toHaveBeenCalledWith('postgres', undefined));
      await waitFor(() => expect(events.length).toBeGreaterThan(0));
      expect(events[0].detail.required).toBe('TEAMS');
    } finally {
      window.removeEventListener('waggle:tier-insufficient', listener);
    }
  });

  it('a SecurityGate-blocked install renders the risk ApprovalModal; approve retries with forceInsecure', { timeout: CATALOG_TIMEOUT }, async () => {
    // Mirror the REAL installer-level contract: the block only clears when
    // forceInsecure is sent (installer.ts gates on `!request.forceInsecure`;
    // `force` alone means "reinstall"). A retry without it re-blocks — this
    // mock pins the approve-loop regression: the assertion below fails if
    // the FE retries with {force:true} only.
    mocks.adapter.installMcp.mockImplementation(async (_id: string, opts?: { force?: boolean; forceInsecure?: boolean }) => (
      opts?.forceInsecure
        ? { installed: true, mcpId: 'postgres', server: 'postgres', status: 'ready' }
        : {
            installed: false, requiresApproval: true,
            message: 'Installation blocked: 1 HIGH severity finding(s). Use forceInsecure=true to override.',
            scanResult: { overall_severity: 'HIGH', blocked: true },
          }
    ));
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
    fireEvent.click(await screen.findByTestId('mcp-install-postgres'));

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/despite security-scan findings/);
    expect(modal).toHaveTextContent('Security scan severity: HIGH');
    expect(modal).toHaveTextContent(/install audit trail/);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.installMcp).toHaveBeenLastCalledWith('postgres', { force: true, forceInsecure: true }));
    // The override succeeded — the modal must NOT reopen (the approve loop).
    await waitFor(() => expect(screen.queryByTestId('approval-modal')).not.toBeInTheDocument());
  });

  it('a CRITICAL block is rendered as non-overridable — no approval offered', { timeout: CATALOG_TIMEOUT }, async () => {
    mocks.adapter.installMcp.mockResolvedValue({
      installed: false, requiresApproval: true,
      message: 'Installation blocked: 2 CRITICAL security finding(s) detected.',
      scanResult: { overall_severity: 'CRITICAL', blocked: true },
    });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
    fireEvent.click(await screen.findByTestId('mcp-install-postgres'));

    const notice = await screen.findByTestId('mcp-install-notice');
    expect(notice).toHaveTextContent(/CRITICAL blocks cannot be overridden/);
    expect(screen.queryByTestId('approval-modal')).not.toBeInTheDocument();
  });

  it('a ROUTE-level CRITICAL block (top-level severity, no scanResult) is also non-overridable', { timeout: CATALOG_TIMEOUT }, async () => {
    mocks.adapter.installMcp.mockResolvedValue({
      installed: false, requiresApproval: true, blocked: true, severity: 'CRITICAL',
      message: 'Installation blocked: CRITICAL severity (score: 9.8).',
    });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
    fireEvent.click(await screen.findByTestId('mcp-install-postgres'));

    const notice = await screen.findByTestId('mcp-install-notice');
    expect(notice).toHaveTextContent(/CRITICAL blocks cannot be overridden/);
    expect(screen.queryByTestId('approval-modal')).not.toBeInTheDocument();
  });

  it('A4: catalog entries the marketplace cannot resolve render NO Install button (copy-command only)', { timeout: CATALOG_TIMEOUT }, async () => {
    // Only 'filesystem' resolves — 'postgres' must fall back to copy-command.
    mocks.adapter.getMarketplace.mockResolvedValue({ packages: [{ name: 'filesystem' }], total: 1 });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Catalog' }));
    await screen.findByText('PostgreSQL');
    expect(screen.queryByTestId('mcp-install-postgres')).not.toBeInTheDocument();
  });

  it('C19: the scope editor sends the exact single-workspace / personal payloads', async () => {
    mocks.adapter.updateMcpPermissions.mockResolvedValue({ ok: true, id: 'filesystem', scope: 'personal' });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('button', { name: /Scope/ }));

    const dialog = await screen.findByTestId('mcp-scope-dialog');
    expect(dialog).toBeInTheDocument();
    // Pinned to ws-1 today → switch to personal and save.
    fireEvent.click(screen.getByRole('radio', { name: /Personal — all workspaces/ }));
    fireEvent.click(screen.getByTestId('mcp-scope-save'));
    await waitFor(() => expect(mocks.adapter.updateMcpPermissions).toHaveBeenCalledWith('filesystem', { scope: 'personal' }));
  });

  it('C19: a rejected scope save (error body as data) keeps the dialog open instead of faking success', async () => {
    // 400/404 bodies resolve as data through adapter.fetch — no ok field.
    mocks.adapter.updateMcpPermissions.mockResolvedValue({ error: '"filesystem" is not installed' });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('button', { name: /Scope/ }));
    await screen.findByTestId('mcp-scope-dialog');

    fireEvent.click(screen.getByRole('radio', { name: /Personal — all workspaces/ }));
    fireEvent.click(screen.getByTestId('mcp-scope-save'));
    await waitFor(() => expect(mocks.adapter.updateMcpPermissions).toHaveBeenCalled());
    // The dialog must stay open — closing it would claim the save landed.
    expect(screen.getByTestId('mcp-scope-dialog')).toBeInTheDocument();
  });

  it('a failed Start surfaces the server error inline (never silently swallowed)', async () => {
    mocks.adapter.getMcps.mockResolvedValue([
      { ...MCPS[0], status: 'stopped', state: 'stopped' },
    ]);
    // POST /:id/start 502 body resolves as data through adapter.fetch.
    mocks.adapter.startMcp.mockResolvedValue({ status: 'error', error: 'spawn timed out after 10000ms' });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('button', { name: /Start/ }));
    const err = await screen.findByTestId('mcp-action-error-filesystem');
    expect(err).toHaveTextContent('Start failed — spawn timed out after 10000ms');
  });

  it('revoke confirms with consequences and renders the stopped/removed result', async () => {
    mocks.adapter.revokeMcp.mockResolvedValue({ ok: true, id: 'filesystem', stoppedInstance: true, removedConfig: true });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('button', { name: /Revoke/ }));

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Revoke MCP server "Filesystem"?');
    expect(modal).toHaveTextContent(/Stops the running process/);
    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.revokeMcp).toHaveBeenCalledWith('filesystem'));
    const notice = await screen.findByTestId('mcp-revoke-notice');
    expect(notice).toHaveTextContent('process stopped');
    expect(notice).toHaveTextContent('persisted config removed');
  });

  it('the custom-add form submits the exact addCustomMcp payload', async () => {
    mocks.adapter.addCustomMcp.mockResolvedValue({ id: 'my-server', registered: true });
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Custom' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'my-server' } });
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } });
    fireEvent.change(screen.getByLabelText('Arguments (one per line)'), { target: { value: '-y\nmy-pkg' } });
    fireEvent.click(screen.getByTestId('add-custom-mcp-submit'));

    await waitFor(() => expect(mocks.adapter.addCustomMcp).toHaveBeenCalledWith({
      name: 'my-server', command: 'npx', args: ['-y', 'my-pkg'],
    }));
  });

  it('C20: the Remote Registry tab is an honest stdio-only pointer, not a fake catalog', async () => {
    renderApp();
    await screen.findByText('Filesystem');
    fireEvent.click(screen.getByRole('tab', { name: 'Remote Registry' }));
    const panel = await screen.findByTestId('mcp-remote-registry');
    expect(panel).toHaveTextContent(/stdio-only/);
    expect(panel).toHaveTextContent(/awesome-mcp-servers/);
  });
});

describe('mcpStateBadge', () => {
  it('maps the raw runtime states and the installed fallback honestly', () => {
    expect(mcpStateBadge({ state: 'ready', installed: true })).toEqual({ tone: 'healthy', label: 'Ready' });
    expect(mcpStateBadge({ state: 'starting', installed: true })).toEqual({ tone: 'info', label: 'Starting…' });
    expect(mcpStateBadge({ state: 'error', installed: true })).toEqual({ tone: 'risk', label: 'Error' });
    expect(mcpStateBadge({ installed: true })).toEqual({ tone: 'neutral', label: 'Installed — not running' });
    expect(mcpStateBadge({ installed: false })).toEqual({ tone: 'neutral', label: 'Not installed' });
  });
});
