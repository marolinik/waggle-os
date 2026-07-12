/**
 * PlatformApp — Warm-Hive "Platform & roadmap" showcase (screen 18).
 * Pure-UI, static-data surface: assert the three showcase tabs render their
 * key headings/labels, that the segmented toggle switches views, and that the
 * macOS ↔ Windows title-bar toggle flips inside the Desktop view.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';

import PlatformApp from './PlatformApp';

afterEach(() => {
  cleanup();
});

describe('PlatformApp', () => {
  it('renders the three showcase tabs and lands on Desktop (now)', () => {
    render(<PlatformApp />);
    const tablist = screen.getByRole('tablist', { name: /platform showcase/i });
    expect(within(tablist).getByRole('tab', { name: /desktop \(now\)/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /^boot$/i })).toBeInTheDocument();
    expect(within(tablist).getByRole('tab', { name: /coming next/i })).toBeInTheDocument();

    // Default tab = Desktop, selected + content visible.
    expect(within(tablist).getByRole('tab', { name: /desktop \(now\)/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /a real desktop app\./i })).toBeInTheDocument();
    expect(screen.getByText('~12 MB')).toBeInTheDocument();
    expect(screen.getByText('Platform & roadmap')).toHaveClass('text-[var(--text-muted)]');
  });

  it('switches to the Boot showcase tab', () => {
    render(<PlatformApp />);
    fireEvent.click(screen.getByRole('tab', { name: /^boot$/i }));
    expect(screen.getByRole('tab', { name: /^boot$/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: /warming the hive/i })).toBeInTheDocument();
    expect(screen.getByText(/local model online · qwen 2\.5/i)).toBeInTheDocument();
    // Desktop content is gone.
    expect(screen.queryByText('~12 MB')).not.toBeInTheDocument();
  });

  it('switches to the Coming next roadmap tab and lists the channels', () => {
    render(<PlatformApp />);
    fireEvent.click(screen.getByRole('tab', { name: /coming next/i }));
    expect(screen.getByRole('heading', { name: /one hive, everywhere you work\./i })).toBeInTheDocument();
    expect(screen.getByText('Browser extension')).toBeInTheDocument();
    expect(screen.getByText('Messaging')).toBeInTheDocument();
    expect(screen.getByText('Mobile')).toBeInTheDocument();
    expect(screen.getByText(/available now/i)).toBeInTheDocument();
    expect(screen.getByText(/in beta/i)).toBeInTheDocument();
  });

  it('toggles the macOS ↔ Windows title-bar in the Desktop view', () => {
    render(<PlatformApp />);
    const osGroup = screen.getByRole('group', { name: /operating system/i });
    const macBtn = within(osGroup).getByRole('button', { name: /macos/i });
    const winBtn = within(osGroup).getByRole('button', { name: /windows/i });

    expect(macBtn).toHaveAttribute('aria-pressed', 'true');
    expect(winBtn).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(winBtn);
    expect(winBtn).toHaveAttribute('aria-pressed', 'true');
    expect(macBtn).toHaveAttribute('aria-pressed', 'false');
  });
});
