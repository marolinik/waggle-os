/**
 * Phase 4B (S07) — Connector Hub behaviour over a mocked adapter:
 * shared-type rendering (§8a categories + lastSyncAt), tab filtering,
 * the C16 sync-now honest health-probe flow, the C17 revoke confirm with the
 * shared-Google-pair consequence + result rendering, and the C18 per-connector
 * audit history drawer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
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
  toast: vi.fn(),
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import ConnectorsApp, { buildRevokeRequest, resetConnectorsRouteCache, shouldResetCredentialInputs } from '@/components/os/apps/ConnectorsApp';
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

const JIRA_CONNECTOR = {
  id: 'jira', name: 'Jira', description: 'Project tracking', service: 'jira',
  authType: 'bearer', status: 'disconnected', capabilities: ['read', 'write'],
  substrate: 'waggle', tools: [], category: 'productivity',
};

const SALESFORCE_CONNECTOR = {
  id: 'salesforce', name: 'Salesforce', description: 'CRM', service: 'salesforce',
  authType: 'bearer', status: 'disconnected', capabilities: ['read', 'write'],
  substrate: 'waggle', tools: [], category: 'crm',
};

const renderApp = () => render(
  <ServiceProvider><TooltipProvider><ConnectorsApp /></TooltipProvider></ServiceProvider>,
);

beforeEach(() => {
  vi.clearAllMocks();
  resetConnectorsRouteCache();
  mocks.adapter.connect.mockResolvedValue(undefined);
  mocks.adapter.getConnectors.mockResolvedValue(CONNECTORS);
  mocks.adapter.getConnectorHealth.mockResolvedValue({
    id: 'github', name: 'GitHub', status: 'connected', lastChecked: '2026-06-01T10:00:00.000Z',
  });
  mocks.adapter.getExtendAudit.mockResolvedValue([]);
});
afterEach(cleanup);

describe('ConnectorsApp — Connector Hub (S07)', () => {
  it('repaints the last roster on return and refreshes silently', async () => {
    const first = renderApp();
    expect(await screen.findByText('GitHub')).toBeInTheDocument();
    const baseline = mocks.adapter.getConnectors.mock.calls.length;
    first.unmount();

    renderApp();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() => expect(mocks.adapter.getConnectors.mock.calls.length).toBeGreaterThan(baseline));
  });

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

  it('scopes connector row and brand tile transitions to explicit properties', async () => {
    renderApp();
    const githubLabel = await screen.findByText('GitHub');
    const rowButton = githubLabel.closest('button');
    expect(rowButton).not.toBeNull();
    const row = rowButton?.parentElement;
    expect(row?.className).not.toContain('transition-all');
    expect(row?.className).toContain('transition-colors');

    const brandTile = rowButton?.querySelector('div[aria-hidden="true"]');
    expect(brandTile?.className).not.toContain('transition-all');
    expect(brandTile?.className).toContain('transition-shadow');
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

  it('a11y: Jira setup fields expose stable credential metadata', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([...CONNECTORS, JIRA_CONNECTOR]);
    renderApp();

    fireEvent.click(await screen.findByText('Jira'));

    const email = await screen.findByRole('textbox', { name: /atlassian account email/i });
    expect(email).toHaveAttribute('type', 'email');
    expect(email).toHaveAttribute('name', 'connectorEmail');
    expect(email).toHaveAttribute('autocomplete', 'email');
    expect(email).toHaveAttribute('spellcheck', 'false');
    expect(email.className).toContain('focus-visible:ring-2');

    const siteUrl = screen.getByRole('textbox', { name: /jira site url/i });
    expect(siteUrl).toHaveAttribute('type', 'url');
    expect(siteUrl).toHaveAttribute('name', 'connectorBaseUrl');
    expect(siteUrl).toHaveAttribute('autocomplete', 'url');
    expect(siteUrl).toHaveAttribute('spellcheck', 'false');
    expect(siteUrl).toHaveAttribute('placeholder', 'https://your-team.atlassian.net');
    expect(siteUrl.className).toContain('focus-visible:ring-2');

    const token = screen.getByLabelText(/jira api token/i);
    expect(token).toHaveAttribute('type', 'password');
    expect(token).toHaveAttribute('name', 'connectorToken');
    expect(token).toHaveAttribute('autocomplete', 'off');
    expect(token).toHaveAttribute('spellcheck', 'false');
    expect(token.className).toContain('focus-visible:ring-2');

    expect(screen.getByRole('button', { name: /^connect$/i }).className).toContain('focus-visible:ring-2');
  });

  it('submits ordinary connector credentials through the connect endpoint only', async () => {
    renderApp();
    fireEvent.click(await screen.findByText('Slack'));

    const connect = screen.getByRole('button', { name: /^connect$/i });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/slack api token/i), {
      target: { value: '  xoxb-connector-token  ' },
    });
    expect(connect).toBeEnabled();
    fireEvent.click(connect);

    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('slack', {
      token: 'xoxb-connector-token',
    }));
    expect(mocks.adapter.addVaultSecret).not.toHaveBeenCalled();
  });

  it('requires Jira email and site URL, then sends a trimmed credential tuple through connectConnector', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([...CONNECTORS, JIRA_CONNECTOR]);
    renderApp();
    fireEvent.click(await screen.findByText('Jira'));

    const connect = screen.getByRole('button', { name: /^connect$/i });
    fireEvent.change(screen.getByLabelText(/jira api token/i), {
      target: { value: ' jira-token ' },
    });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /atlassian account email/i }), {
      target: { value: ' owner@example.com ' },
    });
    expect(connect).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: /jira site url/i }), {
      target: { value: ' https://team.atlassian.net ' },
    });
    expect(connect).toBeEnabled();
    fireEvent.click(connect);

    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('jira', {
      token: 'jira-token',
      email: 'owner@example.com',
      baseUrl: 'https://team.atlassian.net',
    }));
    expect(mocks.adapter.addVaultSecret).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Jira'));
    expect(screen.getByLabelText(/jira api token/i)).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /atlassian account email/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /jira site url/i })).toHaveValue('');
  });

  it('requires an accessible Salesforce instance URL and submits it with the token', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([...CONNECTORS, SALESFORCE_CONNECTOR]);
    renderApp();
    fireEvent.click(await screen.findByText('Salesforce'));

    const instanceUrl = screen.getByRole('textbox', { name: /salesforce instance url/i });
    expect(instanceUrl).toHaveAttribute('type', 'url');
    expect(instanceUrl).toHaveAttribute('name', 'connectorInstanceUrl');
    expect(instanceUrl).toHaveAttribute('autocomplete', 'url');
    expect(instanceUrl).toHaveAttribute('spellcheck', 'false');

    const connect = screen.getByRole('button', { name: /^connect$/i });
    fireEvent.change(screen.getByLabelText(/salesforce api token/i), {
      target: { value: ' salesforce-token ' },
    });
    expect(connect).toBeDisabled();
    fireEvent.change(instanceUrl, {
      target: { value: ' https://acme.my.salesforce.com ' },
    });
    expect(connect).toBeEnabled();
    fireEvent.click(connect);

    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledWith('salesforce', {
      token: 'salesforce-token',
      instanceUrl: 'https://acme.my.salesforce.com',
    }));
    expect(mocks.adapter.addVaultSecret).not.toHaveBeenCalled();
  });

  it('preserves entered credentials and exposes the server error when connect is rejected', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([...CONNECTORS, SALESFORCE_CONNECTOR]);
    mocks.adapter.connectConnector.mockRejectedValueOnce(new Error('Valid Salesforce instanceUrl required'));
    renderApp();
    fireEvent.click(await screen.findByText('Salesforce'));

    const token = screen.getByLabelText(/salesforce api token/i);
    const instanceUrl = screen.getByRole('textbox', { name: /salesforce instance url/i });
    fireEvent.change(token, { target: { value: 'salesforce-token' } });
    fireEvent.change(instanceUrl, { target: { value: 'https://acme.my.salesforce.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Connection failed',
      description: 'Valid Salesforce instanceUrl required',
      variant: 'destructive',
    }));
    expect(token).toHaveValue('salesforce-token');
    expect(instanceUrl).toHaveValue('https://acme.my.salesforce.com');
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
  });

  it('preserves the full Jira tuple and exposes an invalid-site server rejection for retry', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([...CONNECTORS, JIRA_CONNECTOR]);
    mocks.adapter.connectConnector.mockRejectedValueOnce(new Error('Valid Jira baseUrl required'));
    renderApp();
    fireEvent.click(await screen.findByText('Jira'));

    const token = screen.getByLabelText(/jira api token/i);
    const email = screen.getByRole('textbox', { name: /atlassian account email/i });
    const siteUrl = screen.getByRole('textbox', { name: /jira site url/i });
    fireEvent.change(token, { target: { value: 'jira-token' } });
    fireEvent.change(email, { target: { value: 'owner@example.com' } });
    fireEvent.change(siteUrl, { target: { value: 'https://jira.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Connection failed',
      description: 'Valid Jira baseUrl required',
      variant: 'destructive',
    }));
    expect(token).toHaveValue('jira-token');
    expect(email).toHaveValue('owner@example.com');
    expect(siteUrl).toHaveValue('https://jira.example.com');
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
  });

  it('locks connector switching while Jira connect is pending, then restores the retry tuple on rejection', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([
      ...CONNECTORS,
      JIRA_CONNECTOR,
      SALESFORCE_CONNECTOR,
    ]);
    let rejectConnection!: (reason: Error) => void;
    mocks.adapter.connectConnector.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectConnection = reject;
    }));
    renderApp();
    fireEvent.click(await screen.findByText('Jira'));

    const jiraRow = screen.getByText('Jira').closest('button')!;
    const salesforceRow = screen.getByText('Salesforce').closest('button')!;
    const token = screen.getByLabelText(/jira api token/i);
    const email = screen.getByRole('textbox', { name: /atlassian account email/i });
    const siteUrl = screen.getByRole('textbox', { name: /jira site url/i });
    fireEvent.change(token, { target: { value: 'jira-token' } });
    fireEvent.change(email, { target: { value: 'owner@example.com' } });
    fireEvent.change(siteUrl, { target: { value: 'https://team.atlassian.net' } });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    await waitFor(() => expect(mocks.adapter.connectConnector).toHaveBeenCalledTimes(1));
    expect(jiraRow).toBeDisabled();
    expect(salesforceRow).toBeDisabled();
    expect(token).toBeDisabled();
    expect(email).toBeDisabled();
    expect(siteUrl).toBeDisabled();
    fireEvent.click(salesforceRow);
    expect(screen.queryByLabelText(/salesforce api token/i)).not.toBeInTheDocument();

    await act(async () => {
      rejectConnection(new Error('Valid Jira baseUrl required'));
    });
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Connection failed',
      description: 'Valid Jira baseUrl required',
      variant: 'destructive',
    }));
    expect(token).toHaveValue('jira-token');
    expect(email).toHaveValue('owner@example.com');
    expect(siteUrl).toHaveValue('https://team.atlassian.net');
    expect(jiraRow).toBeEnabled();
    expect(salesforceRow).toBeEnabled();
    expect(screen.getByRole('button', { name: /^connect$/i })).toBeEnabled();
  });

  it('clears token, email, and instance URL whenever the target connector changes', async () => {
    mocks.adapter.getConnectors.mockResolvedValue([
      ...CONNECTORS,
      JIRA_CONNECTOR,
      SALESFORCE_CONNECTOR,
    ]);
    renderApp();

    fireEvent.click(await screen.findByText('Jira'));
    fireEvent.change(screen.getByLabelText(/jira api token/i), { target: { value: 'jira-token' } });
    fireEvent.change(screen.getByRole('textbox', { name: /atlassian account email/i }), {
      target: { value: 'owner@example.com' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: /jira site url/i }), {
      target: { value: 'https://team.atlassian.net' },
    });

    fireEvent.click(screen.getByText('Salesforce'));
    expect(screen.getByLabelText(/salesforce api token/i)).toHaveValue('');
    const instanceUrl = screen.getByRole('textbox', { name: /salesforce instance url/i });
    expect(instanceUrl).toHaveValue('');
    fireEvent.change(screen.getByLabelText(/salesforce api token/i), { target: { value: 'sf-token' } });
    fireEvent.change(instanceUrl, { target: { value: 'https://acme.my.salesforce.com' } });

    fireEvent.click(screen.getByText('Jira'));
    expect(screen.getByLabelText(/jira api token/i)).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /atlassian account email/i })).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /jira site url/i })).toHaveValue('');

    fireEvent.click(screen.getByText('Salesforce'));
    expect(screen.getByLabelText(/salesforce api token/i)).toHaveValue('');
    expect(screen.getByRole('textbox', { name: /salesforce instance url/i })).toHaveValue('');
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
