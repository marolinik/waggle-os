// @vitest-environment jsdom
/**
 * MemoryBrowser rendering tests — verify empty state, error state,
 * and frame list rendering.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryBrowser } from '../../../src/components/memory/MemoryBrowser.js';
import type { Frame } from '../../../src/services/types.js';
import type { FrameFilters } from '../../../src/components/memory/utils.js';

// ── Helpers ───────────────────────────────────────────────────────────

const noopFn = () => {};
const defaultFilters: FrameFilters = {};

function makeFrame(overrides: Partial<Frame> = {}): Frame {
  return {
    id: 1,
    content: 'Test memory content',
    source: 'personal',
    frameType: 'I',
    importance: 'medium',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('MemoryBrowser rendering', () => {
  it('shows "No memories yet" empty state when frames is empty array', () => {
    render(
      <MemoryBrowser
        frames={[]}
        onSelectFrame={noopFn}
        onSearch={noopFn}
        filters={defaultFilters}
        onFiltersChange={noopFn}
      />
    );

    expect(screen.getByText('No memories yet')).toBeTruthy();
    expect(screen.getByText(/memories build automatically/)).toBeTruthy();
  });

  it('shows error state with retry button when error prop is set', () => {
    const retryFn = vi.fn();

    render(
      <MemoryBrowser
        frames={[]}
        onSelectFrame={noopFn}
        onSearch={noopFn}
        filters={defaultFilters}
        onFiltersChange={noopFn}
        error="Connection timeout"
        onRetry={retryFn}
      />
    );

    expect(screen.getByText('Unable to load memories')).toBeTruthy();
    expect(screen.getByText('Connection timeout')).toBeTruthy();

    const retryButton = screen.getByText('Retry');
    expect(retryButton).toBeTruthy();

    fireEvent.click(retryButton);
    expect(retryFn).toHaveBeenCalledTimes(1);
  });

  it('renders frame list when frames are provided', () => {
    const frames = [
      makeFrame({ id: 1, content: 'First memory', frameType: 'I' }),
      makeFrame({ id: 2, content: 'Second memory', frameType: 'P' }),
    ];

    const { container } = render(
      <MemoryBrowser
        frames={frames}
        onSelectFrame={noopFn}
        onSearch={noopFn}
        filters={defaultFilters}
        onFiltersChange={noopFn}
      />
    );

    // Should NOT show empty state
    expect(screen.queryByText('No memories yet')).toBeNull();

    // The timeline area should be rendered (FrameTimeline child)
    const timeline = container.querySelector('.memory-browser__timeline');
    expect(timeline).not.toBeNull();

    // Should not show error state
    expect(screen.queryByText('Unable to load memories')).toBeNull();
  });

  it('shows loading state when loading prop is true', () => {
    render(
      <MemoryBrowser
        frames={[]}
        onSelectFrame={noopFn}
        onSearch={noopFn}
        filters={defaultFilters}
        onFiltersChange={noopFn}
        loading={true}
      />
    );

    // UX-2: Loading state now shows skeleton divs instead of text
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });
});
