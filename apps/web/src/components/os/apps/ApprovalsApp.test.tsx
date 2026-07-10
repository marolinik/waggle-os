/**
 * ApprovalsApp (trust surface) — pins the F1 fix: a held `create_skill` awaiting
 * approval must never be a blind approve. The card surfaces the skill NAME up
 * front and lets the approver expand the EXACT content `writeSkill` will
 * persist. `summarizeInput` surfaces none of `{name, content}`, so without the
 * SkillPreview the approver saw only the tool name.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  adapter: {
    getPendingApprovals: vi.fn(),
    getApprovalGrants: vi.fn(),
    respondApproval: vi.fn(),
    revokeApprovalGrant: vi.fn(),
    clearApprovalGrants: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
// HintTooltip wraps its trigger in a Radix Tooltip that needs a TooltipProvider
// from the app shell — out of scope here, so pass the child through.
vi.mock('@/components/ui/hint-tooltip', () => ({
  HintTooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import ApprovalsApp from './ApprovalsApp';

const heldCreateSkill = (over: Record<string, unknown> = {}) => ({
  requestId: 'h1',
  toolName: 'create_skill',
  source: 'held' as const,
  timestamp: Date.now(),
  input: { name: 'retry-flaky-fetch', content: '# Retry flaky fetch\nWrap fetch in a 3x backoff.' },
  summary: 'Creating skill: retry-flaky-fetch',
  riskLevel: 'medium',
  ...over,
});

beforeEach(() => {
  mocks.adapter.getApprovalGrants.mockResolvedValue({ grants: [] });
  mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ApprovalsApp — held create_skill review', () => {
  it("surfaces a held create_skill's name and its full content behind an expander", async () => {
    mocks.adapter.getPendingApprovals.mockResolvedValue({ pending: [heldCreateSkill()] });
    render(<ApprovalsApp />);

    // The skill name is visible without expanding (exact match avoids the
    // "Automation: Creating skill: …" line, which merely contains the name).
    expect(await screen.findByText('retry-flaky-fetch')).toBeInTheDocument();

    // The content stays collapsed until the approver opts to inspect it.
    expect(screen.queryByText(/3x backoff/)).not.toBeInTheDocument();

    // Expand → the exact bytes writeSkill will persist are shown (a prefix of
    // the content plus the rest of the body).
    fireEvent.click(screen.getByRole('button', { name: /view skill content/i }));
    const body = await screen.findByText(/# Retry flaky fetch/);
    expect(body.textContent).toContain('# Retry flaky fetch');
    expect(body.textContent).toContain('3x backoff');

    // …and can be collapsed again.
    fireEvent.click(screen.getByRole('button', { name: /hide skill content/i }));
    expect(screen.queryByText(/3x backoff/)).not.toBeInTheDocument();
  });

  it('does not render a skill preview for a held action without {name, content} (e.g. send_email)', async () => {
    mocks.adapter.getPendingApprovals.mockResolvedValue({
      pending: [{
        requestId: 'h2', toolName: 'send_email', source: 'held', timestamp: Date.now(),
        input: { to: 'x@y.z', subject: 'Follow up' }, summary: 'Send follow-up', riskLevel: 'medium',
      }],
    });
    render(<ApprovalsApp />);
    // The email recipient still surfaces via summarizeInput…
    expect(await screen.findByText(/x@y\.z/)).toBeInTheDocument();
    // …but there is no skill-content expander for a non-skill proposal.
    expect(screen.queryByRole('button', { name: /skill content/i })).not.toBeInTheDocument();
  });

  it('surfaces the name+content preview generically for any held {name, content} proposal', async () => {
    mocks.adapter.getPendingApprovals.mockResolvedValue({
      pending: [heldCreateSkill({ requestId: 'h3', toolName: 'write_file', input: { name: 'notes.md', content: 'hello world body' }, summary: undefined })],
    });
    render(<ApprovalsApp />);
    expect(await screen.findByText('notes.md')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /view skill content/i }));
    expect(await screen.findByText(/hello world body/)).toBeInTheDocument();
  });
});
