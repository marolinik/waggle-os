/**
 * DreamDiaryCard — renders the latest narrative (summary fallback), hides
 * without data, expandable history, date labels (DREAM-DIARY spec).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/lib/adapter', () => ({
  adapter: { getServerUrl: () => 'http://127.0.0.1:3333' },
}));

import DreamDiaryCard, { dreamDateLabel, type DreamDayView } from './DreamDiaryCard';

function day(date: string, overrides: Partial<DreamDayView> = {}): DreamDayView {
  return {
    date,
    summary: `Overnight I cleared 2 stale memories. (${date})`,
    events: [{ action: 'memory_compact', at: `${date}T03:00:00.000Z`, stats: { temporaryPruned: 2 } }],
    ...overrides,
  };
}

function stubDreams(body: DreamDayView[]): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status: 200 }),
  ));
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DreamDiaryCard', () => {
  it('renders nothing when there are no dreams yet', async () => {
    stubDreams([]);
    const { container } = render(<DreamDiaryCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="home-dream-diary"]')).toBeNull();
  });

  it('renders nothing when the service is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { container } = render(<DreamDiaryCard />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="home-dream-diary"]')).toBeNull();
  });

  it('shows the narrative when present, summary otherwise', async () => {
    stubDreams([
      day('2026-07-09', { narrative: 'While you slept I tidied two memories and filed one insight.' }),
    ]);
    render(<DreamDiaryCard />);
    expect(await screen.findByTestId('dream-latest-text')).toHaveTextContent('tidied two memories');
  });

  it('falls back to the deterministic summary without a narrative', async () => {
    stubDreams([day('2026-07-09')]);
    render(<DreamDiaryCard />);
    expect(await screen.findByTestId('dream-latest-text')).toHaveTextContent('cleared 2 stale memories');
  });

  it('expands previous nights on toggle', async () => {
    stubDreams([
      day('2026-07-09', { narrative: 'newest' }),
      day('2026-07-08', { narrative: 'the night before' }),
      day('2026-07-07'),
    ]);
    render(<DreamDiaryCard />);
    const toggle = await screen.findByTestId('dream-history-toggle');
    expect(toggle).toHaveTextContent('Previous nights (2)');
    expect(screen.queryByTestId('dream-history')).toBeNull();

    fireEvent.click(toggle);
    const history = screen.getByTestId('dream-history');
    expect(history).toHaveTextContent('the night before');
    expect(history).toHaveTextContent('cleared 2 stale memories');
  });

  it('hides the history toggle with a single entry', async () => {
    stubDreams([day('2026-07-09')]);
    render(<DreamDiaryCard />);
    await screen.findByTestId('dream-latest-text');
    expect(screen.queryByTestId('dream-history-toggle')).toBeNull();
  });
});

describe('dreamDateLabel', () => {
  const now = new Date('2026-07-09T09:00:00');

  it('labels today and yesterday as "Last night"', () => {
    expect(dreamDateLabel('2026-07-09', now)).toBe('Last night');
    expect(dreamDateLabel('2026-07-08', now)).toBe('Last night');
  });

  it('uses the weekday inside a week, a date beyond it (locale-agnostic)', () => {
    // Within a week → a weekday word in the system locale, no digits.
    const weekday = dreamDateLabel('2026-07-06', now);
    expect(weekday).not.toBe('Last night');
    expect(weekday).not.toMatch(/\d/);
    // Beyond a week → an actual date, which carries the day number.
    expect(dreamDateLabel('2026-06-20', now)).toMatch(/20/);
  });
});
