/**
 * F9 — WorkspaceBriefing first-visit variant.
 *
 * A brand-new workspace (stats.sessionCount === 0) — even one seeded with
 * imported memories — must show fresh copy instead of "here's where you left
 * off" / "…across 0 sessions", and must not render the "0 sessions" stat.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: { getWorkspaceContext: vi.fn() },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import WorkspaceBriefing from '@/components/os/WorkspaceBriefing';
import { TooltipProvider } from '@/components/ui/tooltip';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(cleanup);

function renderBriefing() {
  return render(
    <TooltipProvider>
      <WorkspaceBriefing workspaceId="ws-1" />
    </TooltipProvider>,
  );
}

describe('WorkspaceBriefing first-visit (F9)', () => {
  it('sessionCount 0 → fresh copy, no "0 sessions", server summary suppressed', async () => {
    mocks.adapter.getWorkspaceContext.mockResolvedValue({
      workspace: { name: 'Acme' },
      greeting: "Good afternoon. Here's where you left off:",
      summary: 'A few open threads across 0 sessions.',
      welcomeMessage: 'This workspace tracks your sales pipeline.',
      stats: { memoryCount: 12, sessionCount: 0 },
    });
    renderBriefing();
    await waitFor(() => expect(screen.getByText(/fresh workspace/i)).toBeInTheDocument());
    expect(screen.queryByText(/across 0 sessions/i)).toBeNull();
    expect(screen.queryByText(/sessions/i)).toBeNull(); // stat hidden at 0
    expect(screen.getByText(/12 memories/i)).toBeInTheDocument();
    expect(screen.getByText(/tracks your sales pipeline/i)).toBeInTheDocument();
  });

  it('sessionCount > 0 → server greeting + the "N sessions" stat', async () => {
    mocks.adapter.getWorkspaceContext.mockResolvedValue({
      workspace: { name: 'Acme' },
      greeting: "Good afternoon. Here's where you left off:",
      summary: '3 open threads to pick back up.',
      stats: { memoryCount: 12, sessionCount: 3 },
    });
    renderBriefing();
    await waitFor(() => expect(screen.getByText(/where you left off/i)).toBeInTheDocument());
    expect(screen.getByText(/3 sessions/i)).toBeInTheDocument();
    expect(screen.queryByText(/fresh workspace/i)).toBeNull();
  });
});
