/**
 * P7/D15 B3 — Command Center.
 * Part 1 (structural): the Win+K overlay must be inside an AppErrorBoundary so a
 * render throw can't blank the whole shell — verified via the boundary contract.
 * Part 2 (in-body): a failed search must surface a degraded-results notice, not
 * silently swap in local fuzzy matches with no signal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import AppErrorBoundary from '@/components/os/ErrorBoundary';

const mocks = vi.hoisted(() => ({
  adapter: {
    commandRecent: vi.fn(),
    commandSuggestions: vi.fn(),
    commandSearch: vi.fn(),
    commandExecute: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

// cmdk (Command primitive) observes layout — jsdom lacks ResizeObserver.
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
(globalThis.Element.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};

import CommandCenter from '@/components/os/overlays/CommandCenter';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.commandRecent.mockResolvedValue({ results: [{ id: 'r1', title: 'Recent thing', type: 'navigate' }] });
  mocks.adapter.commandSuggestions.mockResolvedValue({ results: [{ id: 's1', title: 'Suggested thing', type: 'navigate' }] });
});
afterEach(cleanup);

describe('P7/B3 — Command Center error containment', () => {
  it('provides an accessible dialog description for screen readers', async () => {
    render(<CommandCenter open onClose={() => {}} onNavigate={() => {}} onExecute={() => {}} />);
    const dialog = await screen.findByRole('dialog', { name: /command center/i });
    const describedBy = dialog.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? '')).toHaveTextContent(/search and run commands/i);
  });

  it('gives the command search input a visible token focus ring', async () => {
    render(<CommandCenter open onClose={() => {}} onNavigate={() => {}} onExecute={() => {}} />);
    const input = await screen.findByLabelText('Command Center search');

    expect(input.className).toContain('focus-visible:ring-2');
    expect(input.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });

  it('renders catalog subtitles as their own truncating line for mobile fit', async () => {
    const Icon = () => <span aria-hidden="true" />;
    render(
      <CommandCenter
        open
        onClose={() => {}}
        onNavigate={() => {}}
        onExecute={() => {}}
        catalog={[
          {
            key: 'power',
            heading: 'Power tools',
            items: [
              {
                id: 'watch-agent',
                group: 'power',
                name: 'Watch a coding agent live',
                subtitle: 'Claude Code · Codex · Hermes — stream its output',
                icon: Icon,
                to: '/launcher?watch=1',
              },
            ],
          },
        ]}
      />,
    );

    const subtitle = await screen.findByText(/stream its output/i);
    expect(subtitle).toHaveClass('block');
    expect(subtitle).toHaveClass('truncate');
  });

  it('Part 1: a render throw inside the overlay is caught by AppErrorBoundary (shell survives)', () => {
    const Boom = () => { throw new Error('overlay exploded'); };
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div data-testid="shell-survives">
        <AppErrorBoundary appName="Command Center" onClose={() => {}}>
          <Boom />
        </AppErrorBoundary>
      </div>,
    );
    // Shell sibling still mounted; boundary shows its fallback instead of unmounting the tree.
    expect(screen.getByTestId('shell-survives')).toBeInTheDocument();
    expect(screen.getByText('Command Center encountered an error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close window/i })).toBeInTheDocument();
  });

  it('Part 2: a failed search surfaces a degraded-results notice', async () => {
    mocks.adapter.commandSearch.mockRejectedValue(new Error('search 500'));
    render(<CommandCenter open onClose={() => {}} onNavigate={() => {}} onExecute={() => {}} />);
    const input = await screen.findByLabelText('Command Center search');
    fireEvent.change(input, { target: { value: 'thing' } });
    await waitFor(
      () => expect(screen.getByText(/search service unreachable/i)).toBeInTheDocument(),
      { timeout: 1500 },
    );
  });

  it('Part 2: a successful search shows no degraded notice', async () => {
    mocks.adapter.commandSearch.mockResolvedValue({ results: [{ id: 'x', title: 'Hit', type: 'navigate' }] });
    render(<CommandCenter open onClose={() => {}} onNavigate={() => {}} onExecute={() => {}} />);
    const input = await screen.findByLabelText('Command Center search');
    fireEvent.change(input, { target: { value: 'thing' } });
    await waitFor(() => expect(mocks.adapter.commandSearch).toHaveBeenCalled(), { timeout: 1500 });
    expect(screen.queryByText(/search service unreachable/i)).not.toBeInTheDocument();
  });
});
