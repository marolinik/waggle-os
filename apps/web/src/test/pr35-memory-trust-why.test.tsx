/**
 * PR3.5 Phase D — Memory-Trust "Why did you do that?" trace view.
 *
 * Pins: the real-trace chain (goal → tool calls → acted) from getMemoryTrace,
 * the two HONEST empty states (no memory picked / no trace linked), and the
 * footer actions (looks-right toast, correct, forget).
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { MemoryTrace } from '@/lib/types';

const mocks = vi.hoisted(() => ({
  adapter: { getMemoryTrace: vi.fn() },
}));
vi.mock('@/lib/adapter', () => ({ adapter: mocks.adapter, default: vi.fn() }));

import MemoryTrustWhy from '@/components/os/apps/memory/MemoryTrustWhy';

const TRACE: MemoryTrace = {
  id: 42, sessionId: 'sess1234abcd', workspaceId: null, model: 'claude-sonnet-4-6',
  outcome: 'success', costUsd: 0.012, durationMs: 1200,
  createdAt: new Date().toISOString(), finalizedAt: new Date().toISOString(),
  input: 'tighten the board narrative', output: 'Wrote slide 6 around the regulated angle.',
  reasoning: [{ content: 'considering the angle', timestamp: new Date().toISOString() }],
  toolCalls: [
    { tool: 'auto_recall', ok: true, durationMs: 50, timestamp: new Date().toISOString() },
    { tool: 'web_search', ok: true, durationMs: 300, timestamp: new Date().toISOString() },
  ],
  tokens: { input: 100, output: 50 },
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('MemoryTrustWhy (PR3.5 Phase D)', () => {
  it('with no memory selected, prompts the user to open one (no fetch)', () => {
    render(<MemoryTrustWhy mind="personal" memoryId={null} onToast={() => {}} onCorrect={() => {}} onForget={() => {}} />);
    expect(screen.getByText(/Open a memory.+trace to see why/i)).toBeTruthy();
    expect(mocks.adapter.getMemoryTrace).not.toHaveBeenCalled();
  });

  it('renders an honest "no trace linked" state when the frame has no backlink', async () => {
    mocks.adapter.getMemoryTrace.mockResolvedValue({ trace: null });
    render(<MemoryTrustWhy mind="personal" memoryId="204" onToast={() => {}} onCorrect={() => {}} onForget={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No trace is linked to M-204/)).toBeTruthy());
  });

  it('renders the real trace chain: goal → tool calls → acted + footer', async () => {
    mocks.adapter.getMemoryTrace.mockResolvedValue({ trace: TRACE });
    render(<MemoryTrustWhy mind="personal" memoryId="204" onToast={() => {}} onCorrect={() => {}} onForget={() => {}} />);
    await waitFor(() => expect(screen.getByText('Goal received')).toBeTruthy());
    expect(screen.getByText(/tighten the board narrative/)).toBeTruthy();
    expect(screen.getByText('Recalled memories')).toBeTruthy(); // auto_recall humanized
    expect(screen.getByText('Web Search')).toBeTruthy();
    expect(screen.getByText(/Acted —/)).toBeTruthy();
    expect(screen.getByText('trace #42')).toBeTruthy();
    expect(screen.getByText('Looks right')).toBeTruthy();
  });

  it('footer actions fire the right callbacks', async () => {
    mocks.adapter.getMemoryTrace.mockResolvedValue({ trace: TRACE });
    const onToast = vi.fn(); const onCorrect = vi.fn(); const onForget = vi.fn();
    render(<MemoryTrustWhy mind="personal" memoryId="204" onToast={onToast} onCorrect={onCorrect} onForget={onForget} />);
    await waitFor(() => expect(screen.getByText('Looks right')).toBeTruthy());

    fireEvent.click(screen.getByText('Looks right'));
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining('M-204'));

    fireEvent.click(screen.getByText(/That memory is wrong/));
    expect(onCorrect).toHaveBeenCalledWith('204');

    fireEvent.click(screen.getByText(/Forget M-204/));
    expect(onForget).toHaveBeenCalledWith('204');
  });
});
