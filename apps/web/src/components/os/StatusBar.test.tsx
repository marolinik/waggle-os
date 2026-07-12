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
});
