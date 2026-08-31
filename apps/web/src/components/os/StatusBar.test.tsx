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
    render(
      <MemoryRouter>
        <TooltipProvider>
          <StatusBar offline />
        </TooltipProvider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: 'Backend unavailable — chat requires retry' })).toBeInTheDocument();
    expect(screen.getByText(/messages aren.t sent while the local service is unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/use retry in chat/i)).toBeInTheDocument();
    expect(screen.queryByText(/queued and sent/i)).not.toBeInTheDocument();
  });
});
