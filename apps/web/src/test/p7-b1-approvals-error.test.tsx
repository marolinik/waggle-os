/**
 * P7/D15 B1 — Approvals must not render a fetch FAILURE as an empty inbox.
 * On a TEAMS trust surface, "No pending approvals" while the server is down is a
 * correctness defect: it tells the user nothing is awaiting them when the truth
 * is unknown. A failed load must show an error + Retry, not the empty state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    getPendingApprovals: vi.fn(),
    getApprovalGrants: vi.fn(),
    respondApproval: vi.fn(),
    revokeApprovalGrant: vi.fn(),
    clearApprovalGrants: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import ApprovalsApp, { resetApprovalsRouteCache } from '@/components/os/apps/ApprovalsApp';

const render = () => rtlRender(<TooltipProvider><ApprovalsApp /></TooltipProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  resetApprovalsRouteCache();
  mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [], count: 0 });
  mocks.adapter.getApprovalGrants.mockResolvedValue({ grants: [], count: 0 });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const approvalGrant = {
  id: 'grant-send-email',
  toolName: 'send_email',
  targetKey: 'client@example.com',
  sourceWorkspaceId: 'workspace-1',
  description: 'Always allow send_email to client@example.com',
  grantedAt: new Date().toISOString(),
  expiresAt: null,
};

describe('P7/B1 — Approvals error state', () => {
  it('repaints the trust inbox on return and refreshes silently', async () => {
    const first = render();
    await waitFor(() => expect(screen.getByText('No pending approvals')).toBeInTheDocument());
    const baseline = mocks.adapter.getPendingApprovals.mock.calls.length;
    first.unmount();

    render();
    expect(screen.getByText('No pending approvals')).toBeInTheDocument();
    await waitFor(() => expect(mocks.adapter.getPendingApprovals.mock.calls.length).toBeGreaterThan(baseline));
  });

  it('shows an error + Retry (not "No pending approvals") when the fetch fails', async () => {
    mocks.adapter.getPendingApprovals.mockRejectedValue(new Error('server down'));
    render();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByText('No pending approvals')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows the empty state (not an error) when the fetch succeeds with no approvals', async () => {
    mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [], count: 0 });
    render();
    await waitFor(() => expect(screen.getByText('No pending approvals')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('Retry re-fetches and clears the error on recovery', async () => {
    mocks.adapter.getPendingApprovals
      .mockRejectedValueOnce(new Error('server down'))
      .mockResolvedValueOnce({ pending: [], count: 0 });
    render();
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByText('No pending approvals')).toBeInTheDocument());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks in-app before revoking all saved approval grants', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [], count: 0 });
    mocks.adapter.getApprovalGrants.mockResolvedValue({ grants: [approvalGrant], count: 1 });
    mocks.adapter.clearApprovalGrants.mockResolvedValue({ ok: true });

    render();

    fireEvent.click(await screen.findByRole('button', { name: /grants/i }));
    await screen.findByText('1 active grant');
    fireEvent.click(screen.getByRole('button', { name: /revoke all/i }));

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(mocks.adapter.clearApprovalGrants).not.toHaveBeenCalled();

    const modal = await screen.findByTestId('approval-modal');
    expect(modal).toHaveTextContent(/revoke all saved approval grants/i);
    expect(modal).toHaveTextContent(/1 saved grant/i);

    fireEvent.click(screen.getByTestId('approval-modal-approve'));

    await waitFor(() => expect(mocks.adapter.clearApprovalGrants).toHaveBeenCalledTimes(1));
  });

  it('names icon-only refresh and grant revoke controls', async () => {
    mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [], count: 0 });
    mocks.adapter.getApprovalGrants.mockResolvedValue({ grants: [approvalGrant], count: 1 });
    render();

    expect(await screen.findByRole('button', { name: /refresh approvals/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /grants/i }));
    expect(await screen.findByRole('button', { name: /revoke grant always allow send_email to client@example.com/i })).toBeInTheDocument();
  });
});
