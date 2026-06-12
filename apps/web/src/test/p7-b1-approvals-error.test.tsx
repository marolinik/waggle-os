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

import ApprovalsApp from '@/components/os/apps/ApprovalsApp';

const render = () => rtlRender(<TooltipProvider><ApprovalsApp /></TooltipProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getApprovalGrants.mockResolvedValue({ grants: [], count: 0 });
});
afterEach(cleanup);

describe('P7/B1 — Approvals error state', () => {
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
});
