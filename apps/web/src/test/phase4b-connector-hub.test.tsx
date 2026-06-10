/**
 * Phase 4B (S07) — Connector Hub behaviour over a mocked adapter:
 * shared-type rendering (§8a categories + lastSyncAt), tab filtering,
 * the C16 sync-now honest health-probe flow, the C17 revoke confirm with the
 * shared-Google-pair consequence + result rendering, and the C18 per-connector
 * audit history drawer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getConnectors: vi.fn(),
    getConnectorHealth: vi.fn(),
    addVaultSecret: vi.fn(),
    connectConnector: vi.fn(),
    disconnectConnector: vi.fn(),
    syncConnector: vi.fn(),
    revokeConnector: vi.fn(),
    getExtendAudit: vi.fn(),
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import ConnectorsApp, { buildRevokeRequest, shouldResetCredentialInputs } from '@/components/os/apps/ConnectorsApp';
import { ServiceProvider } from '@/providers/ServiceProvider';

const CONNECTORS = [
  {
    id: 'github', name: 'GitHub', description: 'Code hosting', service: 'github',
    authType: 'bearer', status: 'connected', capabilities: ['read', 'write'],
    substrate: 'waggle', tools: [], category: 'development',
    lastSyncAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: 'gmail', name: 'Gmail', description: 'Email', service: 'google',
    authType: 'oauth2', status: 'connected', capabilities: ['read'],
    substrate: 'waggle', tools: [], category: 'communication',
  },
  {
    id: 'slack', name: 'Slack', description: 'Team chat', service: 'slack',
    authType: 'bearer', status: 'disconnected', capabilities: ['read'],
    substrate: 'waggle', tools: [], category: 'communication',
  },
];

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><ConnectorsApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getConnectors.mockResolvedValue(CONNECTORS);
  mocks.adapter.getConnectorHealth.mockResolvedValue({
    id: 'github', name: 'GitHub', status: 'connected', lastChecked: '2026-06-01T10:00:00.000Z',
  });
  mocks.adapter.getExtendAudit.mockResolvedValue([]);
});
afterEach(cleanup);

describe('ConnectorsApp — Connector Hub (S07)', () => {
  it('renders connectors grouped by the shared category with status badges + lastSyncAt', async () => {
    renderApp();
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    // §8a: shared category labels, not the old hardcoded id map.
    expect(screen.getByText('Code & DevOps')).toBeInTheDocument();
    expect(screen.getByText('Communication')).toBeInTheDocument();
    // §14.7 text labels — never colour alone.
    expect(screen.getAllByText('Connected').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Not connected')).toBeInTheDocument();
    // C16 stamp surfaces on the row.
    expect(screen.getByText(/Last sync/)).toBeInTheDocument();
  });

  it('the Connected tab filters out disconnected connectors', async () => {
    renderApp();
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('tab', { name: /Connected/ }));
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByText('Slack')).not.toBeInTheDocument();
  });

  it('Sync now runs the C16 health probe and renders the honest no-data-pull copy', async () => {
    mocks.adapter.syncConnector.mockResolvedValue({
      ok: true, connectorId: 'github', lastSyncAt: '2026-06-02T12:00:00.000Z', status: 'connected',
    });
    renderApp();
    fireEvent.click(await screen.findByText('GitHub'));
    fireEvent.click(await screen.findByRole('button', { name: /Sync now/ }));

    await waitFor(() => expect(mocks.adapter.syncConnector).toHaveBeenCalledWith('github'));
    expect(await screen.findByText(/it does not re-pull data/)).toBeInTheDocument();
  });

  it('a failed sync says so and does not claim a stamp', async () => {
    mocks.adapter.syncConnector.mockResolvedValue({ ok: false, connectorId: 'github', status: 'error' });
    renderApp();
    fireEvent.click(await screen.findByText('GitHub'));
    fireEvent.click(await screen.findByRole('button', { name: /Sync now/ }));
    expect(await screen.findByText(/Sync failed — health status: error/)).toBeInTheDocument();
    expect(screen.getByText(/No last-sync stamp written/)).toBeInTheDocument();
  });

  it('Revoke on a Google-family connector confirms with the shared-pair warning and renders the purge result', async () => {
    mocks.adapter.revokeConnector.mockResolvedValue({
      ok: true, connectorId: 'gmail', revoked: true, cleanedKeys: 2, oauthPurged: 2,
    });
    renderApp();
    fireEvent.click(await screen.findByText('Gmail'));
    fireEvent.click(await screen.findByRole('button', { name: /Revoke/ }));

    // Scope-and-consequence confirm (C17) incl. the Google blast radius.
    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent('Revoke all access for Gmail?');
    expect(modal).toHaveTextContent(/SHARED Google OAuth token pair/);
    expect(modal).toHaveTextContent(/audit trail/);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));
    await waitFor(() => expect(mocks.adapter.revokeConnector).toHaveBeenCalledWith('gmail'));
    const notice = await screen.findByTestId('revoke-notice');
    expect(notice).toHaveTextContent('2 credential key(s) removed');
    expect(notice).toHaveTextContent('2 OAuth token(s) purged');
  });

  it('a failed revoke (404/503 error body as data) renders the error — never a fabricated success', async () => {
    // adapter.fetch does not throw on HTTP errors: the 503 vault-down body
    // resolves as data with no ok/cleanedKeys fields.
    mocks.adapter.revokeConnector.mockResolvedValue({ error: 'Vault not available' });
    renderApp();
    fireEvent.click(await screen.findByText('Gmail'));
    fireEvent.click(await screen.findByRole('button', { name: /Revoke/ }));
    await screen.findByTestId('approval-modal');
    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.revokeConnector).toHaveBeenCalledWith('gmail'));
    const notice = await screen.findByTestId('revoke-notice');
    expect(notice).toHaveTextContent('Vault not available');
    expect(notice).not.toHaveTextContent(/Access revoked/);
  });

  it('the History drawer reads the C18 shared audit feed scoped to the connector', async () => {
    renderApp();
    fireEvent.click(await screen.findByText('GitHub'));
    fireEvent.click(await screen.findByRole('button', { name: /History/ }));
    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({
      type: 'connector', capability: 'github', limit: 10,
    }));
  });

  it('the Activity tab renders the connector-typed shared audit feed', async () => {
    mocks.adapter.getExtendAudit.mockResolvedValue([{
      id: 1, timestamp: '2026-06-01T10:00:00.000Z', capabilityName: 'github',
      capabilityType: 'connector', source: 'native', riskLevel: 'low',
      trustSource: 'local_user', approvalClass: 'standard', action: 'installed',
      initiator: 'user', detail: 'Connector connected',
    }]);
    renderApp();
    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    await waitFor(() => expect(mocks.adapter.getExtendAudit).toHaveBeenCalledWith({ type: 'connector', limit: 25 }));
    expect(await screen.findByText('Connector connected')).toBeInTheDocument();
  });
});

describe('pure helpers', () => {
  it('shouldResetCredentialInputs is preserved (R4-007)', () => {
    expect(shouldResetCredentialInputs('github', 'slack')).toBe(true);
    expect(shouldResetCredentialInputs('github', 'github')).toBe(false);
  });

  it('buildRevokeRequest warns about the Google pair only for the Google family', () => {
    const gmail = buildRevokeRequest({ id: 'gmail', name: 'Gmail' });
    expect(gmail.scope.join(' ')).toMatch(/SHARED Google OAuth token pair/);
    const github = buildRevokeRequest({ id: 'github', name: 'GitHub' });
    expect(github.scope.join(' ')).not.toMatch(/Google/);
  });
});
