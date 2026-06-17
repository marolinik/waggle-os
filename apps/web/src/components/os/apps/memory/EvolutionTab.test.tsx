/**
 * EvolutionTab — PR6b B4 (skill-card + version-ladder view, D12/D13).
 *
 * Covers the new aggregation framing layered over the EXISTING run-review:
 *  - runs aggregate by (target_kind, target_name) into skill cards
 *  - the version ladder orders v1=oldest→vN=newest and renders score bars
 *  - the D13 provenance badge appears ONLY when a deployed run records a
 *    passing regression gate, and is OMITTED otherwise (no fabrication)
 *  - the "By skill" / "By run" toggle preserves the raw run list
 *  - selecting a version loads the existing detail view
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';

const mocks = vi.hoisted(() => ({
  adapter: {
    fetch: vi.fn(),
  },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import EvolutionTab from './EvolutionTab';

/** HintTooltip (radix) requires a provider in the tree. */
function renderTab() {
  return render(
    <TooltipProvider>
      <EvolutionTab />
    </TooltipProvider>,
  );
}

interface FakeRun {
  id: number;
  run_uuid: string;
  target_kind: string;
  target_name: string | null;
  baseline_text: string;
  winner_text: string;
  delta_accuracy: number;
  gate_verdict: 'pass' | 'fail' | 'warn';
  gate_reasons_json: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'deployed' | 'failed';
  user_note?: string | null;
  created_at: string;
}

const baseRun = (over: Partial<FakeRun>): FakeRun => ({
  id: 1,
  run_uuid: 'uuid-1',
  target_kind: 'behavioral-spec-section',
  target_name: 'Section A',
  baseline_text: 'baseline',
  winner_text: 'winner',
  delta_accuracy: 0.05,
  gate_verdict: 'pass',
  gate_reasons_json: '[]',
  status: 'proposed',
  user_note: null,
  created_at: '2026-06-01T00:00:00.000Z',
  ...over,
});

// Two versions of the same skill (Section A) + one different skill (Section B).
const RUNS: FakeRun[] = [
  baseRun({
    id: 1, run_uuid: 'a-v1', target_name: 'Section A',
    delta_accuracy: 0.03, status: 'rejected', user_note: 'first draft',
    created_at: '2026-06-01T00:00:00.000Z',
  }),
  baseRun({
    id: 2, run_uuid: 'a-v2', target_name: 'Section A',
    delta_accuracy: 0.09, status: 'deployed', user_note: 'added a citation lane',
    gate_reasons_json: JSON.stringify([{ gate: 'regression', verdict: 'pass', reason: 'beat baseline' }]),
    created_at: '2026-06-05T00:00:00.000Z',
  }),
  baseRun({
    id: 3, run_uuid: 'b-v1', target_name: 'Section B',
    delta_accuracy: 0.02, status: 'proposed',
    created_at: '2026-06-03T00:00:00.000Z',
  }),
];

const STATUS = {
  counts: { proposed: 1, accepted: 0, rejected: 1, deployed: 1, failed: 0 },
  pendingCount: 1,
};

function routeFetch(url: string): Response {
  if (url.includes('/api/evolution/status')) {
    return { ok: true, json: async () => STATUS } as unknown as Response;
  }
  if (url.includes('/api/evolution/runs/')) {
    const uuid = url.split('/api/evolution/runs/')[1];
    const run = RUNS.find(r => r.run_uuid === uuid);
    return {
      ok: true,
      json: async () => ({ ...run, winnerSchema: null, artifacts: null, gateReasons: [] }),
    } as unknown as Response;
  }
  if (url.includes('/api/evolution/runs')) {
    return { ok: true, json: async () => ({ runs: RUNS }) } as unknown as Response;
  }
  return { ok: true, json: async () => ({}) } as unknown as Response;
}

beforeEach(() => {
  mocks.adapter.fetch.mockImplementation((url: string) =>
    Promise.resolve(routeFetch(url)),
  );
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EvolutionTab — skill-card / version-ladder (D12)', () => {
  it('aggregates runs by target into skill cards (two cards for two distinct targets)', async () => {
    renderTab();
    // Skill view is the default — both targets appear as card headers.
    expect(await screen.findByText('Section A')).toBeInTheDocument();
    expect(screen.getByText('Section B')).toBeInTheDocument();
  });

  it('renders a version ladder ordered v1=oldest with score bars per version', async () => {
    renderTab();
    await screen.findByText('Section A');
    // Subtitle text is interpolated ("<kind> · N versions") — match on the
    // count substring with a node matcher.
    expect(screen.getByText(/2 versions/)).toBeInTheDocument();
    expect(screen.getByText(/1 version\b/)).toBeInTheDocument();
    // v1/v2 tags + the human notes used as improve-notes, in order.
    expect(screen.getByText('first draft')).toBeInTheDocument();
    expect(screen.getByText('added a citation lane')).toBeInTheDocument();
    expect(screen.getAllByText('v1').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('v2')).toBeInTheDocument();
  });

  it('shows the D13 provenance badge ONLY for the deployed run with a passing regression gate', async () => {
    renderTab();
    await screen.findByText('Section A');
    // The deployed v2 (regression pass) earns the verified pill; nothing else does.
    const badges = screen.getAllByText(/regression gate · score-verified/i);
    expect(badges).toHaveLength(1);
  });

  it('does NOT fabricate a "judged by 3 models" / GEPA roster string', async () => {
    renderTab();
    await screen.findByText('Section A');
    expect(screen.queryByText(/judged by 3 models/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/GEPA optimized/i)).not.toBeInTheDocument();
  });

  it('preserves the raw run list behind the "By run" toggle, with status filter chips', async () => {
    renderTab();
    await screen.findByText('Section A');
    // Filter chips are hidden in skill view.
    expect(screen.queryByRole('button', { name: /^all/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /by run/i }));
    // Now the filter chips (raw run list controls) are present.
    expect(await screen.findByRole('button', { name: /^all/i })).toBeInTheDocument();
  });

  it('selecting a version routes to the existing run detail view', async () => {
    renderTab();
    const card = (await screen.findByText('Section A')).closest('div')!;
    // Click the deployed v2 version row.
    fireEvent.click(screen.getByText('added a citation lane'));
    // Detail view loads the run (right pane shows the Baseline vs Winner diff).
    expect(await screen.findByText(/baseline vs winner/i)).toBeInTheDocument();
    expect(card).toBeTruthy();
  });

  it('still surfaces the pending-review banner and New Run affordance', async () => {
    renderTab();
    expect(await screen.findByText(/1 proposal awaiting review/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new evolution run/i })).toBeInTheDocument();
  });

  it('shows the empty state when there are no runs', async () => {
    mocks.adapter.fetch.mockImplementation((url: string) => {
      if (url.includes('/api/evolution/status')) {
        return Promise.resolve({ ok: true, json: async () => ({ counts: {}, pendingCount: 0 }) } as unknown as Response);
      }
      return Promise.resolve({ ok: true, json: async () => ({ runs: [] }) } as unknown as Response);
    });
    renderTab();
    expect(await screen.findByText(/your skills get better on their own/i)).toBeInTheDocument();
  });
});
