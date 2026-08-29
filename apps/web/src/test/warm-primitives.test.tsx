/**
 * PR3 Phase 0 — warm-Hive shared primitives render smoke.
 *
 * Locks the foundation atoms in `components/os/warm/` so a broken import,
 * token typo, or runtime error surfaces before the three screens consume them.
 * Behavioural atoms (AskBar submit, ActivityStream toggle, InlineApprovalCard
 * Always-allow gating) get a real assertion; the rest assert mount + content.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Sparkles } from 'lucide-react';
import {
  HexAvatar,
  SectionLabel,
  DotLive,
  ProvenanceLine,
  RunChip,
  IconTile,
  HexCheckTile,
  StreakChip,
  ModelPill,
  OvernightHero,
  AskBar,
  ActivityStream,
  InlineApprovalCard,
  ConfidenceRing,
  confidenceColor,
} from '@/components/os/warm';
import type { ApprovalRequest } from '@/components/ui/approval-modal';

afterEach(cleanup);

describe('warm primitives — render smoke', () => {
  it('HexAvatar shows the derived initial', () => {
    render(<HexAvatar label="Competitive Intelligence" />);
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('SectionLabel renders its text', () => {
    render(<SectionLabel rule>What Waggle knows</SectionLabel>);
    expect(screen.getByText('What Waggle knows')).toBeInTheDocument();
  });

  it('StreakChip renders an N-day streak', () => {
    render(<StreakChip days={12} />);
    expect(screen.getByText('12-day streak')).toBeInTheDocument();
  });

  it('ProvenanceLine renders the ⬡ source · when label', () => {
    render(<ProvenanceLine source="web · mem0.ai" when="2h ago" />);
    expect(screen.getByText('⬡ web · mem0.ai · 2h ago')).toBeInTheDocument();
  });

  it('RunChip renders its label', () => {
    render(<RunChip label="14 memories consolidated" tone="intel" />);
    expect(screen.getByText('14 memories consolidated')).toBeInTheDocument();
  });

  it('ConfidenceRing renders NN% + CONF caption, and a labeled "unscored" badge when unknown', () => {
    const { rerender } = render(<ConfidenceRing value={94} />);
    expect(screen.getByText('94%')).toBeInTheDocument();
    expect(screen.getByText('conf')).toBeInTheDocument();
    // Unknown confidence (harvest-only signal absent) → a quiet labeled badge,
    // never an empty dial with a dash and never a fabricated number (Wave F 3a).
    rerender(<ConfidenceRing value={undefined} />);
    expect(screen.getByText('unscored')).toBeInTheDocument();
    expect(screen.queryByText('—')).not.toBeInTheDocument();
  });

  it('confidenceColor maps bands ≥85 healthy / ≥60 attention / <60 risk', () => {
    expect(confidenceColor(94)).toBe('var(--healthy)');
    expect(confidenceColor(85)).toBe('var(--healthy)');
    expect(confidenceColor(61)).toBe('var(--attention)');
    expect(confidenceColor(60)).toBe('var(--attention)');
    expect(confidenceColor(47)).toBe('var(--risk)');
  });

  it('ModelPill renders mode · model', () => {
    render(<ModelPill mode="auto" model="Claude Sonnet" />);
    expect(screen.getByText('Claude Sonnet')).toBeInTheDocument();
    expect(screen.getByText(/auto/)).toBeInTheDocument();
  });

  it('OvernightHero always renders the statement; the chip row only when runs exist', () => {
    const { rerender } = render(
      <OvernightHero statement={<>Folded 14 memories</>} runs={[{ label: '14 consolidated' }]} />,
    );
    expect(screen.getByText('Folded 14 memories')).toBeInTheDocument();
    expect(screen.getByText('14 consolidated')).toBeInTheDocument();
    // H2: single-clause stories pass no chips (a lone chip would repeat the
    // sentence) — the statement must still render; the caller owns the
    // empty-night fallback line.
    rerender(<OvernightHero statement={<>A calm night</>} runs={[]} />);
    expect(screen.getByText('A calm night')).toBeInTheDocument();
    expect(screen.queryByText('14 consolidated')).not.toBeInTheDocument();
  });

  it('AskBar submits trimmed text and clears the input', () => {
    let sent = '';
    render(<AskBar onSubmit={(t) => (sent = t)} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    expect(input).toHaveAttribute('name', 'ask-waggle');
    expect(input).toHaveAttribute('autocomplete', 'off');
    expect(input.className).toContain('focus-visible:ring-2');
    expect(input.className).toContain('focus-visible:ring-[var(--focus-ring)]');
    fireEvent.change(input, { target: { value: '  draft the board update  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(sent).toBe('draft the board update');
    expect(input.value).toBe('');
  });

  it('AskBar waits for async success, blocks duplicate submits while pending, then clears', async () => {
    let resolveSubmit!: (accepted: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { resolveSubmit = resolve; });
    const onSubmit = vi.fn(() => pending);
    render(<AskBar onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Draft the launch memo' } });
    fireEvent.click(send);
    fireEvent.click(send);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('Draft the launch memo');
    expect(send).toBeDisabled();

    resolveSubmit(true);
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('AskBar preserves the draft and re-enables submit when async submit returns false', async () => {
    const onSubmit = vi.fn().mockResolvedValue(false);
    render(<AskBar onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Keep this draft' } });
    fireEvent.click(send);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('Keep this draft');
    expect(send).toBeEnabled();
  });

  it('AskBar preserves the draft and re-enables submit when async submit rejects', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('workspace unavailable'));
    render(<AskBar onSubmit={onSubmit} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Do not lose this' } });
    fireEvent.click(send);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(input.value).toBe('Do not lose this');
    expect(send).toBeEnabled();
  });

  it('AskBar preserves text edited while an earlier submit is pending', async () => {
    let resolveSubmit!: (accepted: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { resolveSubmit = resolve; });
    render(<AskBar onSubmit={() => pending} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Draft A' } });
    fireEvent.click(send);
    fireEvent.change(input, { target: { value: 'Draft B' } });
    resolveSubmit(true);

    await waitFor(() => expect(send).toBeEnabled());
    expect(input.value).toBe('Draft B');
  });

  it('AskBar preserves a newly retyped identical draft while the old submit is pending', async () => {
    let resolveSubmit!: (accepted: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { resolveSubmit = resolve; });
    render(<AskBar onSubmit={() => pending} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;
    const send = screen.getByRole('button', { name: 'Send' });

    fireEvent.change(input, { target: { value: 'Draft A' } });
    fireEvent.click(send);
    fireEvent.change(input, { target: { value: 'Draft B' } });
    fireEvent.change(input, { target: { value: 'Draft A' } });
    resolveSubmit(true);

    await waitFor(() => expect(send).toBeEnabled());
    expect(input.value).toBe('Draft A');
  });

  it('AskBar does not clear through onChange after it unmounts with a submit pending', async () => {
    let resolveSubmit!: (accepted: boolean) => void;
    const pending = new Promise<boolean>((resolve) => { resolveSubmit = resolve; });
    const onChange = vi.fn();
    const { unmount } = render(<AskBar onSubmit={() => pending} onChange={onChange} />);
    const input = screen.getByLabelText('Ask Waggle') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Keep after navigation' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    unmount();
    await act(async () => {
      resolveSubmit(true);
      await pending;
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalledWith('');
  });

  it('ActivityStream is collapsed by default and reveals steps on click', () => {
    render(
      <ActivityStream
        summary="Worked across memory, web & files"
        durationMs={38000}
        steps={[{ text: 'Recalled 6 frames', provenance: { source: 'mem://hive' } }]}
      />,
    );
    expect(screen.getByText(/Worked across memory/)).toBeInTheDocument();
    expect(screen.queryByText('Recalled 6 frames')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('Recalled 6 frames')).toBeInTheDocument();
  });

  it('InlineApprovalCard renders the target and gates Always-allow on critical', () => {
    const base: ApprovalRequest = {
      action: 'Export to Salesforce',
      scope: ['Q2 Pricing'],
      riskLevel: 'high',
    };
    const { rerender } = render(
      <InlineApprovalCard request={base} onApprove={() => {}} onDecline={() => {}} onAlwaysAllow={() => {}} />,
    );
    expect(screen.getByText('Export to Salesforce › Q2 Pricing')).toBeInTheDocument();
    expect(screen.getByText('Always allow')).toBeInTheDocument();
    rerender(
      <InlineApprovalCard
        request={{ ...base, approvalClass: 'critical' }}
        onApprove={() => {}}
        onDecline={() => {}}
        onAlwaysAllow={() => {}}
      />,
    );
    expect(screen.queryByText('Always allow')).not.toBeInTheDocument();
  });

  it('IconTile / DotLive / HexCheckTile mount without throwing', () => {
    expect(() =>
      render(
        <>
          <IconTile icon={Sparkles} tone="work" />
          <DotLive tone="healthy" />
          <HexCheckTile tone="healthy" />
        </>,
      ),
    ).not.toThrow();
  });
});
