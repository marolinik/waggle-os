/**
 * BenchmarkApp — screen 17. Pure-UI static showcase. The test renders the
 * component, asserts the Capabilities view's framing + matrix, toggles to the
 * Memory SOTA view, and asserts the LoCoMo numbers + stat chips. No mocks
 * needed — the component has zero props and makes no calls.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import BenchmarkApp from './BenchmarkApp';

afterEach(() => cleanup());

describe('BenchmarkApp', () => {
  it('renders the Capabilities view by default with the positioning framing', () => {
    render(<BenchmarkApp />);
    // Tablist toggle present, Capabilities tab selected.
    expect(screen.getByRole('tab', { name: /vs competitors/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /memory sota/i })).toHaveAttribute('aria-selected', 'false');
    // Headline + the two framing cards.
    expect(screen.getByText(/waggle remembers you/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /task agents/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /a memory layer \+ workspace/i })).toBeInTheDocument();
    // Honest disclaimer label.
    expect(screen.getByText(/positioning view, not a lab benchmark/i)).toBeInTheDocument();
  });

  it('renders the full 11-row capability matrix with the deliberate competitor win on deep coding', () => {
    render(<BenchmarkApp />);
    // Waggle column header + first/last capability rows.
    expect(screen.getByRole('columnheader', { name: /^waggle$/i })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /persistent memory across sessions/i })).toBeInTheDocument();
    const lastRow = screen.getByRole('rowheader', { name: /deep coding in the terminal/i });
    expect(lastRow).toBeInTheDocument();
    // 11 capability rows = 11 row headers.
    expect(screen.getAllByRole('rowheader')).toHaveLength(11);
    // The last row is honest: Waggle is only Partial on deep terminal coding.
    const row = lastRow.closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement).getAllByRole('cell');
    expect(cells[0]).toHaveAttribute('aria-label', 'Partial'); // Waggle column
    expect(cells[1]).toHaveAttribute('aria-label', 'Yes'); // Claude Code column
  });

  it('toggles to the Memory SOTA view and shows the LoCoMo numbers + stat chips', () => {
    render(<BenchmarkApp />);
    fireEvent.click(screen.getByRole('tab', { name: /memory sota/i }));

    // View switched.
    expect(screen.getByRole('tab', { name: /memory sota/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('rowheader', { name: /persistent memory across sessions/i })).not.toBeInTheDocument();

    // SOTA headline + the four LoCoMo bar values.
    expect(screen.getByText(/best long-term memory/i)).toBeInTheDocument();
    expect(screen.getByText('87.66')).toBeInTheDocument();
    expect(screen.getByText('81.95')).toBeInTheDocument();
    expect(screen.getByText('78.05')).toBeInTheDocument();
    expect(screen.getByText('62.47')).toBeInTheDocument();

    // Stat chips.
    expect(screen.getByText('+5.71')).toBeInTheDocument();
    expect(screen.getByText('92.75%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Method/caveat line.
    expect(screen.getByText(/github\.com\/marolinik\/hive-mind/i)).toBeInTheDocument();
  });

  it('toggles back to Capabilities', () => {
    render(<BenchmarkApp />);
    fireEvent.click(screen.getByRole('tab', { name: /memory sota/i }));
    fireEvent.click(screen.getByRole('tab', { name: /vs competitors/i }));
    expect(screen.getByRole('tab', { name: /vs competitors/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('rowheader', { name: /persistent memory across sessions/i })).toBeInTheDocument();
  });
});
