/**
 * Wave W Lane B (item 1) — briefing entrance beat.
 *
 * The recall cards + workspace rows now share ONE staggered rise+fade entrance
 * grammar (was: recall cards slid on `x`, rows had no motion at all). These pins
 * guard the happy-path render survived the motion.div/motion.button conversion —
 * a broken conversion would drop the rows or highlights entirely:
 *  - a real memory highlight renders under "I remember" (recall card)
 *  - the workspace row still renders AS a button (motion.button → <button>)
 * Motion timing itself is not asserted (jsdom has no layout); the contract here
 * is "content still lands", which is what the entrance re-key must never break.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  adapter: {
    connect: vi.fn().mockResolvedValue(undefined),
    getWorkspaces: vi.fn(),
    searchMemory: vi.fn(),
    getMemoryStats: vi.fn(),
    getWorkspaceContext: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

async function renderBriefing() {
  const { default: LoginBriefing } = await import('@/components/os/overlays/LoginBriefing');
  const { ServiceProvider } = await import('@/providers/ServiceProvider');
  const { TooltipProvider } = await import('@/components/ui/tooltip');
  render(
    <TooltipProvider>
      <ServiceProvider>
        <LoginBriefing onDismiss={() => {}} onOpenWorkspace={() => {}} />
      </ServiceProvider>
    </TooltipProvider>,
  );
  return screen;
}

describe('LoginBriefing entrance (Wave W Lane B)', () => {
  it('renders a recall card and a workspace row after the content lands', async () => {
    mocks.adapter.searchMemory.mockResolvedValue([
      {
        content: 'We decided to prioritise compliance over speed for the launch.',
        importance: 'important',
        timestamp: '2026-07-01T10:00:00.000Z',
      },
    ]);
    mocks.adapter.getWorkspaces.mockResolvedValue([
      { id: 'w1', name: 'Alpha Project', group: 'Personal', status: 'active', lastActive: '2026-07-05T09:00:00.000Z' },
    ]);
    mocks.adapter.getMemoryStats.mockResolvedValue(null);
    mocks.adapter.getWorkspaceContext.mockResolvedValue({
      stats: { memoryCount: 12, sessionCount: 3 },
      summary: 'Ongoing launch prep work.',
      pendingTasks: [],
    });

    const screen = await renderBriefing();

    // Workspace row lands — and is still a real <button> after the
    // motion.button conversion (a broken conversion would strand the row).
    const row = await screen.findByText('Alpha Project');
    expect(row.closest('button')).not.toBeNull();

    // Recall card (the "I remember" highlight) lands too.
    await waitFor(() => expect(screen.getByText(/prioritise compliance/)).toBeInTheDocument());
  }, 15000);
});
