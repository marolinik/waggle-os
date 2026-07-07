/**
 * KeyboardShortcutsHelp (Pillar 2.7, Lane K) — the discoverable cheat sheet.
 * Pins that the new power-path shortcuts and the keyboard-first reveal tip are
 * documented, and that the close control carries a ≥40px hit area.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import KeyboardShortcutsHelp from '@/components/os/overlays/KeyboardShortcutsHelp';

afterEach(() => cleanup());

describe('KeyboardShortcutsHelp', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<KeyboardShortcutsHelp open={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('documents the new-chat and open-last-workspace power paths', () => {
    render(<KeyboardShortcutsHelp open onClose={() => {}} />);
    expect(screen.getByText('New chat')).toBeTruthy();
    expect(screen.getByText('Open last workspace')).toBeTruthy();
  });

  it('lists the "?" cheat-sheet trigger', () => {
    render(<KeyboardShortcutsHelp open onClose={() => {}} />);
    // The Keyboard Shortcuts row is keyed to the discoverable bare "?".
    const kbds = screen.getAllByText('?');
    expect(kbds.length).toBeGreaterThan(0);
  });

  it('surfaces the keyboard-first reveal tip (Tab reaches card & row actions)', () => {
    render(<KeyboardShortcutsHelp open onClose={() => {}} />);
    expect(screen.getByText(/Tab reaches every card/i)).toBeTruthy();
  });

  it('gives the close control a ≥40px hit area (centered 40px ::before)', () => {
    render(<KeyboardShortcutsHelp open onClose={() => {}} />);
    const close = screen.getByLabelText('Close keyboard shortcuts');
    expect(close.className).toContain('relative');
    expect(close.className).toContain('before:h-10');
    expect(close.className).toContain('before:w-10');
  });
});
