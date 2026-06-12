/**
 * P7/D15 B5 — error states that hooks already capture but components dropped.
 * Covers WaggleDanceApp + EventsApp (error≠empty) and TimelineTab (error≠empty).
 * The SettingsApp missing-.catch defect is structurally verified separately.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render as rtlRender, screen, cleanup } from '@testing-library/react';
import type { ReactElement } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';

vi.mock('@/lib/adapter', () => ({ adapter: {}, default: vi.fn() }));

const render = (ui: ReactElement) => rtlRender(<TooltipProvider>{ui}</TooltipProvider>);

afterEach(cleanup);

describe('P7/B5 — EventsApp error state', () => {
  it('renders an error (not "No events yet") when error is set', async () => {
    const { default: EventsApp } = await import('@/components/os/apps/EventsApp');
    render(<EventsApp steps={[]} autoScroll={false} onToggleAutoScroll={() => {}} filter={null} onFilterChange={() => {}} error="boom" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load events/i)).toBeInTheDocument();
    expect(screen.queryByText('No events yet')).not.toBeInTheDocument();
  });

  it('renders "No events yet" (not an error) when error is null and steps empty', async () => {
    const { default: EventsApp } = await import('@/components/os/apps/EventsApp');
    render(<EventsApp steps={[]} autoScroll={false} onToggleAutoScroll={() => {}} filter={null} onFilterChange={() => {}} error={null} />);
    expect(screen.getByText('No events yet')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('P7/B5 — TimelineTab error state', () => {
  const base = {
    frames: [], selectedFrame: null, onSelectFrame: () => {}, searchQuery: '',
    onSearchChange: () => {}, onDeleteFrame: () => {}, loading: false,
    stats: { total: 0, filtered: 0 },
  };
  it('renders an error (not "No memories found") when error is set', async () => {
    const { default: TimelineTab } = await import('@/components/os/apps/memory/TimelineTab');
    render(<TimelineTab {...base} error="down" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load memories/i)).toBeInTheDocument();
    expect(screen.queryByText('No memories found')).not.toBeInTheDocument();
  });
  it('renders "No memories found" when error is null and frames empty', async () => {
    const { default: TimelineTab } = await import('@/components/os/apps/memory/TimelineTab');
    render(<TimelineTab {...base} error={null} />);
    expect(screen.getByText('No memories found')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
