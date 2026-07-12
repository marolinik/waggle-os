import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TimelineApp from '@/components/os/apps/TimelineApp';
import type { TimelineEvent } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: {
    getTimeline: vi.fn(),
  },
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

const event = (id: number, eventType: string): TimelineEvent => ({
  id,
  eventType,
  timestamp: '2026-07-09T00:00:00Z',
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adapter.getTimeline.mockResolvedValue([
    event(1, 'memory_write'),
    event(2, 'tool_call'),
  ]);
});

afterEach(cleanup);

describe('TimelineApp', () => {
  it('labels the event-type filter and gives it a visible token focus ring', async () => {
    render(<TimelineApp workspaceId="w1" workspaceName="Alpha" />);

    const filter = await screen.findByRole('combobox', { name: /filter timeline by event type/i });

    expect(filter).toHaveAttribute('name', 'timeline-event-type');
    expect(filter).toHaveAttribute('autocomplete', 'off');
    expect(filter.className).toContain('focus-visible:ring-2');
    expect(filter.className).toContain('focus-visible:ring-[var(--focus-ring)]');
  });
});
