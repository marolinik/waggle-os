import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    getMemoryStats: vi.fn().mockResolvedValue({ total: { frames: 0 } }),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/useProviders', () => ({
  useProviders: () => ({ providers: [] }),
}));

import StatusBar from './StatusBar';

describe('StatusBar', () => {
  it('renders the status logo with stable intrinsic dimensions', () => {
    render(
      <MemoryRouter>
        <TooltipProvider>
          <StatusBar />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const logo = screen.getByAltText('Waggle');
    expect(logo).toHaveAttribute('width', '32');
    expect(logo).toHaveAttribute('height', '32');
  });

  it('does not promise automatic delivery while the local service is unavailable', () => {
    const { container } = render(
      <MemoryRouter>
        <TooltipProvider>
          <StatusBar offline />
        </TooltipProvider>
      </MemoryRouter>,
    );

    const trigger = screen.getByRole('status', { name: /backend unavailable/i });
    expect(trigger).toHaveAttribute('aria-describedby', 'backend-offline-recovery');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger.className).toContain('focus-visible:ring-2');
    expect(trigger.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const recovery = screen.getByRole('tooltip');
    expect(recovery).toHaveAttribute('id', 'backend-offline-recovery');
    expect(recovery).toHaveTextContent(
      "Messages aren't sent while the local service is unavailable. When it returns, review the failed turn and retry only if needed.",
    );
    expect(trigger).toHaveAccessibleDescription(
      "Backend Unavailable Messages aren't sent while the local service is unavailable. When it returns, review the failed turn and retry only if needed.",
    );
    expect(recovery).not.toHaveTextContent(/\bqueued\b|automatically|auto.?retry|deliver(?:ed|y)?|replay/i);
    expect(screen.queryByRole('status', { name: /queued|sent when/i })).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent(/\bqueued\b|sent when .*restored/i);
  });
});
