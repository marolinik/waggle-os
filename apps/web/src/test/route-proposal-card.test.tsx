/**
 * Router arc P1-B (B2) — RouteProposalCard + BlockRenderer route_proposal branch.
 *  - renders the propose payload (header, selected executor, reason, verbatim
 *    cost line, egress summary)
 *  - per-frame remove (×) and "Run without memory" shape the confirm body
 *  - alternatives select overrides the executor; rejected options are greyed
 *    with a reason tooltip
 *  - dispatched state links the external run / says "running in this chat"
 *  - blocked brief (egress null + briefBlocked) renders run-without-memory only
 *  - cancel rejects and collapses; revalidation_failed shows reason + re-propose
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import type { RouteProposalPayload } from '@/lib/route-proposals';

const mocks = vi.hoisted(() => ({
  routeProposals: {
    propose: vi.fn(),
    confirm: vi.fn(),
    reject: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: { routeProposals: mocks.routeProposals } }));

import RouteProposalCard from '@/components/os/apps/chat-blocks/RouteProposalCard';
import { BlockRenderer } from '@/components/os/apps/chat-blocks';

const basePayload: RouteProposalPayload = {
  routeDecisionId: 'rd-1',
  selected: { id: 'external:codex', displayName: 'Codex CLI', reason: 'best coding fit, available now' },
  alternatives: [
    { id: 'external:claude-code', displayName: 'Claude Code' },
    { id: 'persona:coder', displayName: 'Coder' },
  ],
  rejected: [{ id: 'external:hermes', reason: 'not installed' }],
  scores: [],
  egress: {
    destination: 'OpenAI',
    items: [
      { frameId: 'f1', date: '2026-07-01', source: 'user_stated', preview: 'Prefers pnpm over npm' },
      { frameId: 'f2', date: '2026-07-02', source: 'tool_verified', preview: 'CI runs on node 20' },
      { frameId: 'f3', date: '2026-07-03', source: 'agent_inferred', preview: 'Repo tests use vitest' },
    ],
    briefChars: 4200,
  },
  costLine: 'uses your existing Codex allowance',
};

beforeEach(() => {
  mocks.routeProposals.confirm.mockResolvedValue({ status: 'dispatched', mode: 'internal' });
  mocks.routeProposals.reject.mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('RouteProposalCard (router arc B2)', () => {
  it('renders the proposal payload — header, executor, reason, verbatim cost line, egress summary', () => {
    render(<RouteProposalCard proposal={basePayload} />);
    expect(screen.getByText('Where should this run?')).toBeInTheDocument();
    expect(screen.getByTestId('route-proposal-selected')).toHaveTextContent('Codex CLI');
    expect(screen.getByTestId('route-proposal-reason')).toHaveTextContent('best coding fit, available now');
    expect(screen.getByTestId('route-proposal-cost-line')).toHaveTextContent('uses your existing Codex allowance');
    expect(screen.getByTestId('route-proposal-egress-toggle')).toHaveTextContent(
      'Will send 3 workspace memories to OpenAI',
    );
  });

  it('per-item remove (×) drops the frame from the list and the confirm body', async () => {
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-egress-toggle'));
    expect(screen.getAllByTestId('route-proposal-egress-item')).toHaveLength(3);

    fireEvent.click(screen.getByTestId('route-proposal-remove-f2'));
    expect(screen.getAllByTestId('route-proposal-egress-item')).toHaveLength(2);
    expect(screen.getByTestId('route-proposal-egress-toggle')).toHaveTextContent(
      'Will send 2 workspace memories to OpenAI',
    );

    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await waitFor(() =>
      expect(mocks.routeProposals.confirm).toHaveBeenCalledWith('rd-1', { removeFrameIds: ['f2'] }),
    );
  });

  it('"Run without memory" removes every frame from the confirm body', async () => {
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-run-without-memory'));
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await waitFor(() =>
      expect(mocks.routeProposals.confirm).toHaveBeenCalledWith('rd-1', {
        removeFrameIds: ['f1', 'f2', 'f3'],
      }),
    );
  });

  it('overriding via the alternatives select sends executorId; rejected options are greyed with a reason tooltip', async () => {
    render(<RouteProposalCard proposal={basePayload} />);
    const select = screen.getByTestId('route-proposal-executor-select');
    const rejectedOption = screen.getByRole('option', { name: /external:hermes — unavailable/ }) as HTMLOptionElement;
    expect(rejectedOption.disabled).toBe(true);
    expect(rejectedOption).toHaveAttribute('title', 'not installed');

    fireEvent.change(select, { target: { value: 'persona:coder' } });
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await waitFor(() =>
      expect(mocks.routeProposals.confirm).toHaveBeenCalledWith('rd-1', { executorId: 'persona:coder' }),
    );
  });

  it('keeping the suggested executor sends NO executorId (server default)', async () => {
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await waitFor(() => expect(mocks.routeProposals.confirm).toHaveBeenCalledWith('rd-1', {}));
  });

  it('dispatched external run renders a /room link with room + run ids', async () => {
    mocks.routeProposals.confirm.mockResolvedValue({
      status: 'dispatched', mode: 'external', roomId: 'room-9', runId: 'run-3',
    });
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    const link = await screen.findByTestId('route-proposal-run-link');
    expect(link).toHaveAttribute('href', '/room?room=room-9&run=run-3');
  });

  it('dispatched internal run says "Running in this chat" and fires onDispatched', async () => {
    const onDispatched = vi.fn();
    render(<RouteProposalCard proposal={basePayload} onDispatched={onDispatched} />);
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await screen.findByText('Running in this chat');
    expect(screen.queryByTestId('route-proposal-run-link')).not.toBeInTheDocument();
    expect(onDispatched).toHaveBeenCalledWith({ status: 'dispatched', mode: 'internal' });
  });

  it('renders an internal model result as safe chat markdown instead of raw syntax', async () => {
    mocks.routeProposals.confirm.mockResolvedValue({
      status: 'dispatched',
      mode: 'internal',
      resultText: [
        '**Recommendation:** Choose concierge.',
        '',
        '| Criterion | Choice |',
        '| --- | --- |',
        '| Safety | Concierge |',
      ].join('\n'),
    });
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));

    const result = await screen.findByTestId('route-proposal-result-text');
    expect(result.querySelector('strong')?.textContent).toBe('Recommendation:');
    expect(result.querySelector('table')).not.toBeNull();
    expect(result.textContent).not.toContain('**');
    expect(result.textContent).not.toContain('| --- |');
  });

  it('blocked brief (egress null + briefBlocked) renders run-without-memory only', async () => {
    const blocked: RouteProposalPayload = {
      ...basePayload,
      egress: null,
      briefBlocked: true,
      briefBlockedReason: 'injection patterns detected',
    };
    render(<RouteProposalCard proposal={blocked} />);
    expect(screen.getByTestId('route-proposal-blocked')).toHaveTextContent('injection patterns detected');
    // No egress list, no per-item remove, no plain Confirm — only run-without-memory.
    expect(screen.queryByTestId('route-proposal-egress')).not.toBeInTheDocument();
    expect(screen.queryByTestId('route-proposal-confirm')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('route-proposal-run-without-memory'));
    await waitFor(() => expect(mocks.routeProposals.confirm).toHaveBeenCalledWith('rd-1', {}));
  });

  it('cancel POSTs reject and collapses the card', async () => {
    render(<RouteProposalCard proposal={basePayload} />);
    fireEvent.click(screen.getByTestId('route-proposal-cancel'));
    await screen.findByText('Routing cancelled');
    expect(mocks.routeProposals.reject).toHaveBeenCalledWith('rd-1');
    expect(screen.queryByTestId('route-proposal-confirm')).not.toBeInTheDocument();
  });

  it('revalidation_failed confirm shows the reason and a re-propose button', async () => {
    const err = Object.assign(new Error('revalidation_failed'), {
      status: 409,
      body: { error: 'revalidation_failed', reason: 'Codex CLI was uninstalled' },
    });
    mocks.routeProposals.confirm.mockRejectedValue(err);
    const onRePropose = vi.fn();
    render(<RouteProposalCard proposal={basePayload} onRePropose={onRePropose} />);
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    const error = await screen.findByTestId('route-proposal-error');
    expect(error).toHaveTextContent('Codex CLI was uninstalled');
    fireEvent.click(screen.getByTestId('route-proposal-re-propose'));
    expect(onRePropose).toHaveBeenCalledTimes(1);
  });

  it('no eligible executor (selected null) disables Confirm', () => {
    render(<RouteProposalCard proposal={{ ...basePayload, selected: null, egress: null }} />);
    expect(screen.getByText('No eligible executor is available right now.')).toBeInTheDocument();
    expect(screen.getByTestId('route-proposal-confirm')).toBeDisabled();
  });
});

describe('BlockRenderer route_proposal branch', () => {
  it('renders a route_proposal content block as a RouteProposalCard', () => {
    render(
      <BlockRenderer
        blocks={[{ type: 'route_proposal', blockId: 'route-rd-1', proposal: basePayload }]}
      />,
    );
    expect(screen.getByTestId('route-proposal-card')).toBeInTheDocument();
    expect(screen.getByText('Where should this run?')).toBeInTheDocument();
  });

  it('threads onRouteProposalDispatched with the blockId', async () => {
    const onDispatched = vi.fn();
    render(
      <BlockRenderer
        blocks={[{ type: 'route_proposal', blockId: 'route-rd-1', proposal: basePayload }]}
        onRouteProposalDispatched={onDispatched}
      />,
    );
    fireEvent.click(screen.getByTestId('route-proposal-confirm'));
    await waitFor(() =>
      expect(onDispatched).toHaveBeenCalledWith('route-rd-1', { status: 'dispatched', mode: 'internal' }),
    );
  });
});
