import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TelemetryApp from './TelemetryApp';

const mocks = vi.hoisted(() => ({
  adapter: {
    fetch: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

function jsonResponse(data: unknown) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(data),
  };
}

describe('TelemetryApp', () => {
  beforeEach(() => {
    mocks.adapter.fetch.mockImplementation((url: string) => {
      if (url === '/api/cost/summary') {
        return Promise.resolve(jsonResponse({
          allTime: {
            inputTokens: 100,
            outputTokens: 50,
            estimatedCost: 1.25,
            byModel: {},
          },
          budget: {
            dailyBudget: 10,
            todayCost: 2.5,
            budgetStatus: 'ok',
            budgetPercent: 25,
          },
        }));
      }
      if (url === '/api/cost/by-workspace') {
        return Promise.resolve(jsonResponse({ workspaces: [] }));
      }
      if (url === '/api/events/stats') {
        return Promise.resolve(jsonResponse({ byType: {}, topTools: [] }));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('scopes the daily budget meter transition to width', async () => {
    const { container } = render(<TelemetryApp />);
    await screen.findByText(/\$2\.50 today/);

    const meter = Array.from(container.querySelectorAll<HTMLElement>('div.h-full.rounded-full'))
      .find(el => el.style.width === '25%');
    expect(meter).toBeTruthy();
    expect(meter?.className).not.toContain('transition-all');
    expect(meter?.className).toContain('transition-[width]');
  });

  it('a11y: daily budget input exposes stable form metadata', async () => {
    render(<TelemetryApp />);

    const budget = await screen.findByLabelText(/daily spend budget in dollars/i);
    expect(budget).toHaveAttribute('name', 'telemetryDailyBudget');
    expect(budget).toHaveAttribute('autocomplete', 'off');
  });
});
